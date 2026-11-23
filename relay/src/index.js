// Sideways GP relay: a tiny WebSocket relay that keeps online races working on networks that block
// direct browser-to-browser connections (schools, offices, some mobile data). It uses ordinary
// secure WebSockets on port 443, the same as any https page.
//
// One Durable Object per room code. The host's browser still runs the race; this only passes messages.
//   host  -> relay : "<guestId>\n<json>" (one guest) or "*\n<json>" (every guest), "!k <id>" (remove), "!bye"
//   relay -> host  : "#ok" | "#taken" | "j <id>" (joined) | "l <id>" (left) | "m <id>\n<json>" (message)
//   guest -> relay : "<json>"
//   relay -> guest : "#hello" | "#nohost" | "#full" | "#badid" | "#hostgone" | "<json>"
//
// It also keeps the global leaderboard (GET /lb, POST /lb/submit) in a second Durable Object with SQLite storage.
// Scores come from each player's own game, so the board is for fun: the server only checks that numbers are plausible.

const MAX_GUESTS = 15;          // the game itself allows 8 drivers; this is only an abuse limit
const MAX_MESSAGE = 32 * 1024;  // a full race update is about 1 KB
const HOST_GRACE_MS = 10000;    // how long guests wait if the host's connection drops for a moment

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'text/plain; charset=utf-8' };
    if (url.pathname === '/' || url.pathname === '/health') return new Response('Sideways GP relay is running.\n', { headers: cors });
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const origin = request.headers.get('Origin') || '';
    // leaderboard: plain HTTP, one shared board
    if (url.pathname === '/lb' || url.pathname === '/lb/submit') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400' } });
      if (allowed.length && origin && !allowed.includes(origin)) return new Response('Origin not allowed\n', { status: 403, headers: cors });
      return env.BOARD.get(env.BOARD.idFromName('global')).fetch(request);
    }
    const m = /^\/room\/([A-Za-z0-9]{4})$/.exec(url.pathname);
    if (!m) return new Response('Not found\n', { status: 404, headers: cors });
    if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return new Response('Expected a WebSocket\n', { status: 426, headers: cors });
    if (allowed.length && !allowed.includes(origin)) return new Response('Origin not allowed\n', { status: 403, headers: cors });
    const room = env.ROOMS.get(env.ROOMS.idFromName(m[1].toUpperCase()));
    return room.fetch(request);
  }
};

export class Room {
  constructor(ctx) { this.ctx = ctx; }
  list(tag) { return this.ctx.getWebSockets(tag); }
  guestId(ws) { const t = this.ctx.getTags(ws).find(x => x.startsWith('g:')); return t ? t.slice(2) : ''; }
  say(ws, text) { try { ws.send(text); } catch (_) {} }
  shut(ws, code, why) { try { ws.close(code, why); } catch (_) {} }

  async fetch(request) {
    const url = new URL(request.url), role = url.searchParams.get('role');
    const pair = new WebSocketPair(), client = pair[0], ws = pair[1];
    const accept = tags => { this.ctx.acceptWebSocket(ws, tags); return new Response(null, { status: 101, webSocket: client }); };
    const refuse = msg => { const r = accept(['refused']); this.say(ws, msg); this.shut(ws, 4000, msg.slice(1)); return r; };

    if (role === 'host') {
      const key = String(url.searchParams.get('key') || '');
      if (!/^[a-z0-9]{16,64}$/.test(key)) return new Response('Bad key\n', { status: 400 });
      const saved = await this.ctx.storage.get('key');
      const busy = this.list('host').length > 0 || this.list('guest').length > 0;
      if (saved && saved !== key && busy) return refuse('#taken');
      for (const old of this.list('host')) this.shut(old, 4002, 'replaced');   // same host reconnecting
      await this.ctx.storage.put('key', key);
      await this.ctx.storage.deleteAlarm();
      const r = accept(['host']);
      this.say(ws, '#ok');
      for (const g of this.list('guest')) this.say(ws, 'j ' + this.guestId(g));
      return r;
    }
    if (role === 'guest') {
      const id = String(url.searchParams.get('id') || '');
      if (!/^[a-z0-9]{6,16}$/.test(id)) return new Response('Bad id\n', { status: 400 });
      const host = this.list('host')[0];
      if (!host) return refuse('#nohost');
      if (this.list('g:' + id).length) return refuse('#badid');
      if (this.list('guest').length >= MAX_GUESTS) return refuse('#full');
      const r = accept(['guest', 'g:' + id]);
      this.say(ws, '#hello');
      this.say(host, 'j ' + id);
      return r;
    }
    return new Response('Bad role\n', { status: 400 });
  }

  async webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > MAX_MESSAGE) return;
    const tags = this.ctx.getTags(ws);
    if (tags.includes('host')) {
      if (msg === '!bye') { await this.closeRoom(); this.shut(ws, 1000, 'bye'); return; }
      if (msg.startsWith('!k ')) { for (const g of this.list('g:' + msg.slice(3))) this.shut(g, 4004, 'removed'); return; }
      const nl = msg.indexOf('\n'); if (nl < 1) return;
      const to = msg.slice(0, nl), body = msg.slice(nl + 1);
      for (const g of to === '*' ? this.list('guest') : this.list('g:' + to)) this.say(g, body);
    } else if (tags.includes('guest')) {
      const host = this.list('host')[0];
      if (host) this.say(host, 'm ' + this.guestId(ws) + '\n' + msg);
    }
  }
  async webSocketClose(ws, code) { this.shut(ws, code === 1005 || code === 1006 ? 1000 : code, 'closed'); await this.gone(ws); }
  async webSocketError(ws) { await this.gone(ws); }
  async gone(ws) {
    const tags = this.ctx.getTags(ws);
    if (tags.includes('guest')) { const host = this.list('host').find(h => h !== ws); if (host) this.say(host, 'l ' + this.guestId(ws)); }
    if (tags.includes('host') && !this.list('host').some(h => h !== ws)) await this.ctx.storage.setAlarm(Date.now() + HOST_GRACE_MS);
    if (!this.ctx.getWebSockets().some(x => x !== ws)) await this.ctx.storage.deleteAll();
  }
  async alarm() { if (!this.list('host').length) await this.closeRoom(); }
  async closeRoom() {
    for (const g of this.list('guest')) { this.say(g, '#hostgone'); this.shut(g, 4003, 'host left'); }
    await this.ctx.storage.deleteAlarm(); await this.ctx.storage.deleteAll();
  }
}

// ---------------------------------------------------------------- leaderboard
const J = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' } });
const cleanText = (v, max) => String(v == null ? '' : v).replace(/[^\p{L}\p{N} _.'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max);
const whole = (v, max) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0; };

export class Leaderboard {
  constructor(ctx) {
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS drivers (id TEXT PRIMARY KEY, token TEXT NOT NULL, name TEXT NOT NULL, wins INTEGER NOT NULL, podiums INTEGER NOT NULL, races INTEGER NOT NULL, earned INTEGER NOT NULL, fav TEXT NOT NULL, updated INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS laps (track TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, ms INTEGER NOT NULL, car TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (track, id))');
    this.sql.exec('CREATE INDEX IF NOT EXISTS laps_by_time ON laps (track, ms)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS drivers_by_rank ON drivers (wins DESC, podiums DESC, races)');
  }
  rows(query, ...args) { return this.sql.exec(query, ...args).toArray(); }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (request.method === 'POST' && url.pathname === '/lb/submit') return await this.submit(request);
      if (request.method === 'GET' && url.pathname === '/lb') return this.board(url);
    } catch (e) { return J({ error: 'server error' }, 500); }
    return J({ error: 'not found' }, 404);
  }

  async submit(request) {
    const text = await request.text();
    if (text.length > 8000) return J({ error: 'too large' }, 413);
    let d; try { d = JSON.parse(text); } catch (_) { return J({ error: 'bad json' }, 400); }
    if (!d || typeof d !== 'object') return J({ error: 'bad json' }, 400);
    const id = String(d.id || ''), token = String(d.token || '');
    if (!/^[a-z0-9]{16}$/.test(id) || !/^[a-z0-9]{24}$/.test(token)) return J({ error: 'bad id' }, 400);
    const now = Date.now(), old = this.rows('SELECT token, updated FROM drivers WHERE id = ?', id)[0];
    if (old && old.token !== token) return J({ error: 'not your entry' }, 403);
    if (old && now - old.updated < 2000) return J({ ok: true, skipped: true });
    const name = cleanText(d.name, 14) || 'Driver', fav = cleanText(d.fav, 32);
    const races = whole(d.races, 1e6), podiums = Math.min(races, whole(d.podiums, 1e6)), wins = Math.min(podiums, whole(d.wins, 1e6)), earned = whole(d.earned, 2e9);
    this.sql.exec('INSERT INTO drivers (id, token, name, wins, podiums, races, earned, fav, updated) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, wins=excluded.wins, podiums=excluded.podiums, races=excluded.races, earned=excluded.earned, fav=excluded.fav, updated=excluded.updated',
      id, token, name, wins, podiums, races, earned, fav, now);
    // lap records: keep whatever the player's game says is their best, within plausible bounds. A reset career clears them.
    const laps = d.laps && typeof d.laps === 'object' ? d.laps : {}, sent = new Set();
    for (const track of Object.keys(laps).slice(0, 24)) {
      if (!/^[a-z]{2,12}$/.test(track)) continue;
      const ms = whole(laps[track] && laps[track].ms, 900000); if (ms < 15000) continue;
      sent.add(track);
      this.sql.exec('INSERT INTO laps (track, id, name, ms, car, updated) VALUES (?,?,?,?,?,?) ON CONFLICT(track, id) DO UPDATE SET name=excluded.name, ms=excluded.ms, car=excluded.car, updated=excluded.updated',
        track, id, name, ms, cleanText(laps[track].car, 32), now);
    }
    for (const r of this.rows('SELECT track FROM laps WHERE id = ?', id)) if (!sent.has(r.track)) this.sql.exec('DELETE FROM laps WHERE track = ? AND id = ?', r.track, id);
    return J({ ok: true });
  }

  board(url) {
    const me = String(url.searchParams.get('me') || ''), limit = Math.min(100, Math.max(1, whole(url.searchParams.get('limit') || 50, 100)));
    if (url.searchParams.get('board') === 'laps') {
      const track = String(url.searchParams.get('track') || '');
      if (!/^[a-z]{2,12}$/.test(track)) return J({ error: 'bad track' }, 400);
      const rows = this.rows('SELECT id, name, ms, car FROM laps WHERE track = ? ORDER BY ms ASC, updated ASC LIMIT ?', track, limit)
        .map((r, i) => ({ rank: i + 1, name: r.name, ms: r.ms, car: r.car, you: r.id === me ? 1 : 0 }));
      const total = this.rows('SELECT COUNT(*) AS n FROM laps WHERE track = ?', track)[0].n;
      let mine = null;
      if (me && !rows.some(r => r.you)) { const m = this.rows('SELECT name, ms, car FROM laps WHERE track = ? AND id = ?', track, me)[0];
        if (m) mine = { rank: this.rows('SELECT COUNT(*) AS n FROM laps WHERE track = ? AND ms < ?', track, m.ms)[0].n + 1, name: m.name, ms: m.ms, car: m.car }; }
      return J({ board: 'laps', track, total, rows, me: mine });
    }
    const rows = this.rows('SELECT id, name, wins, podiums, races, earned, fav FROM drivers WHERE races > 0 ORDER BY wins DESC, podiums DESC, races ASC, updated ASC LIMIT ?', limit)
      .map((r, i) => ({ rank: i + 1, name: r.name, wins: r.wins, podiums: r.podiums, races: r.races, earned: r.earned, fav: r.fav, you: r.id === me ? 1 : 0 }));
    const total = this.rows('SELECT COUNT(*) AS n FROM drivers WHERE races > 0')[0].n;
    let mine = null;
    if (me && !rows.some(r => r.you)) { const m = this.rows('SELECT name, wins, podiums, races, earned, fav FROM drivers WHERE id = ? AND races > 0', me)[0];
      if (m) mine = Object.assign({ rank: this.rows('SELECT COUNT(*) AS n FROM drivers WHERE races > 0 AND (wins > ? OR (wins = ? AND podiums > ?) OR (wins = ? AND podiums = ? AND races < ?))', m.wins, m.wins, m.podiums, m.wins, m.podiums, m.races)[0].n + 1 }, m); }
    return J({ board: 'drivers', total, rows, me: mine });
  }
}
