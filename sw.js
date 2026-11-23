// Offline support. Bump VERSION when the game files change so players get the new build.
const VERSION = 'sgp-v11';
const CORE = ['/', '/index.html', '/vendor/three-r128.min.js', '/vendor/peerjs-1.5.5.min.js', '/config.js', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Pages: network first so a new deploy shows up right away, cache as fallback when offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put('/', c)); return r; }).catch(() => caches.match('/')));
    return;
  }
  // Same-origin assets and Google Fonts: cache first, refresh in the background.
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  // The online servers must never be cached, and the settings file is always fetched fresh.
  if (url.hostname.endsWith('peerjs.com') || url.hostname.endsWith('workers.dev')) return;
  if (url.origin === location.origin && url.pathname === '/config.js') {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); return r; }).catch(() => caches.match(req)));
    return;
  }
  if (url.origin === location.origin || font) {
    e.respondWith(caches.match(req).then(hit => {
      const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});
