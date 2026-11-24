#!/usr/bin/env python3
"""Builds the open world of Sideways GP: an 8 x 8 km island with a port city, forest hills, a cherry-blossom valley with
a castle, snowy peaks, a red-rock desert, farmland, the festival grounds and a racing circuit, joined by roads.

Outputs (in world/):
  height.bin   Uint16 heights, N x N, row = z (north to south), metres = value / HSCALE + HMIN
  map.png      RGBA N x N: R road distance (metres x 4, capped), G forest, B desert, A cherry blossom
  world.json   roads (dense polylines with heights), buildings, places, races
Run:  python3 tools/world/build_world.py   (needs numpy and Pillow)
Everything is seeded, so a run always gives the same world."""
import json, math, os, sys
import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'world')
N, SIZE = 1024, 8000.0
CELL = SIZE / (N - 1)
HMIN, HSCALE = -60.0, 64.0                     # stored = (h - HMIN) * HSCALE  ->  -60 .. 964 m in 1/64 m steps
xs = np.linspace(-SIZE / 2, SIZE / 2, N)
X, Z = np.meshgrid(xs, xs)                     # X east, Z south; array[row=z][col=x]

def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)

class Perlin:
    def __init__(self, seed):
        r = np.random.default_rng(seed)
        p = r.permutation(256)
        self.p = np.concatenate([p, p])
        a = r.random(256) * 2 * np.pi
        self.g = np.stack([np.cos(a), np.sin(a)], 1)
    def __call__(self, x, y):
        xi, yi = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64)
        xf, yf = x - xi, y - yi
        xi &= 255; yi &= 255
        p, g = self.p, self.g
        def dot(ix, iy, dx, dy):
            h = p[p[ix] + iy] & 255
            return g[h, 0] * dx + g[h, 1] * dy
        u = xf * xf * xf * (xf * (xf * 6 - 15) + 10)
        v = yf * yf * yf * (yf * (yf * 6 - 15) + 10)
        n00 = dot(xi, yi, xf, yf); n10 = dot(xi + 1, yi, xf - 1, yf)
        n01 = dot(xi, yi + 1, xf, yf - 1); n11 = dot(xi + 1, yi + 1, xf - 1, yf - 1)
        a = n00 + (n10 - n00) * u; b = n01 + (n11 - n01) * u
        return (a + (b - a) * v) * 1.4        # about -1..1

def fbm(noise, x, y, octaves=5, lac=2.0, gain=0.5):
    s, amp, f, tot = 0.0, 1.0, 1.0, 0.0
    for _ in range(octaves):
        s = s + amp * noise(x * f, y * f); tot += amp; amp *= gain; f *= lac
    return s / tot

def ridged(noise, x, y, octaves=5):
    s, amp, f, tot, w = 0.0, 1.0, 1.0, 0.0, 1.0
    for _ in range(octaves):
        r = 1 - np.abs(noise(x * f, y * f)); r = r * r * w; w = np.clip(r * 2, 0, 1)
        s = s + amp * r; tot += amp; amp *= 0.5; f *= 2.1
    return s / tot

def dist(cx, cz):
    return np.hypot(X - cx, Z - cz)

# ---------------------------------------------------------------- terrain
P = [Perlin(s) for s in range(1, 14)]
base = 34 + 22 * fbm(P[0], X / 1700, Z / 1700, 5)                      # rolling farmland
# coastline: the sea along the south, with a bay for the port city
coast_z = 2950 + 260 * fbm(P[1], X / 1100, 0 * X + .37, 4) - 230 * np.exp(-((X + 2650) / 700) ** 2) + 160 * np.exp(-((X - 1900) / 500) ** 2)
land = smoothstep(coast_z + 40, coast_z - 260, Z)                      # 1 on land, 0 at sea
# snowy peaks across the north
north = smoothstep(-2100, -3300, Z) * smoothstep(1400, 300, X)
peaks = 140 + 560 * ridged(P[2], X / 1300, Z / 1300, 6)
# forest hills in the west
west = smoothstep(-1300, -2500, X) * (1 - north)
hills = 70 + 260 * (0.55 * fbm(P[3], X / 900, Z / 900, 5) + 0.45) ** 1.6
# red-rock desert in the east: terraced mesas
east = smoothstep(2100, 2900, X) * smoothstep(-1400, -700, Z) * smoothstep(2900, 2300, Z)
t = 0.5 + 0.5 * fbm(P[4], X / 700, Z / 700, 4)
steps = 4.0
q = np.floor(t * steps); fr = t * steps - q
terr = (q + smoothstep(0.78, 0.95, fr)) / steps
mesas = 38 + 210 * terr ** 1.3
# cherry-blossom valley in the north-east: a bowl of hills around a flat floor
vc = (2250, -2050)
ang = np.arctan2(Z - vc[1], X - vc[0])
rv = dist(*vc) * (1 + 0.16 * np.sin(ang * 3 + 1.2) + 0.09 * np.sin(ang * 5 + 0.4) + 0.12 * fbm(P[12], X / 900, Z / 900, 3))
valley = smoothstep(2200, 1600, rv) * (1 - north * 0.6)
ring = 70 + 190 * np.exp(-((rv - 1350) / 330) ** 2) * (0.75 + 0.5 * fbm(P[5], X / 500, Z / 500, 3)) + 18 * fbm(P[6], X / 300, Z / 300, 3)
floor_ = 72 + 6 * fbm(P[7], X / 400, Z / 400, 3)
valley_h = np.where(rv < 1050, floor_, floor_ + (ring - floor_) * smoothstep(1050, 1300, rv))
castle = (2420, -2180)
castle_hill = 112 * smoothstep(230, 70, dist(*castle))                 # a hill with a flat top for the castle

h = base.copy()
h = h + (hills - h) * west
h = h + (mesas - h) * east
h = h + (valley_h + castle_hill - h) * valley
h = h + (np.maximum(peaks, h) - h) * north
detail = 7 * fbm(P[8], X / 160, Z / 160, 4)
h = h + detail * (0.4 + 0.6 * (west + north + valley))
# the sea floor, beaches
sea = -28 + 10 * fbm(P[9], X / 600, Z / 600, 3)
beach = 1.5 + 2.5 * smoothstep(coast_z - 20, coast_z - 220, Z)
h = np.where(Z > coast_z - 220, np.minimum(h, beach + (h - beach) * smoothstep(coast_z - 120, coast_z - 420, Z)), h)
h = h * land + sea * (1 - land)

# flat ground for the city, the festival and the circuit
def flatten(mask, level):
    global h
    h = h + (level - h) * mask
city = smoothstep(300, 60, np.maximum(np.maximum(-3550 - X, X + 1750), np.maximum(1850 - Z, Z - 2560))) * land
flatten(city, 6.0)
fest = smoothstep(700, 320, dist(150, 1300))
flatten(fest, 24.0)
circuit_box = smoothstep(420, 20, np.maximum(np.maximum(560 - X, X - 2200), np.maximum(380 - Z, Z - 1720)))
flatten(circuit_box, 26.0)

# thermal erosion: soften slopes steeper than the talus angle (not on the flattened ground)
def erode(h, iters=30, talus=1.05, k=0.22, keep=None):
    for _ in range(iters):
        dh = np.zeros_like(h)
        for dz, dx in ((0, 1), (1, 0), (0, -1), (-1, 0)):
            nb = np.roll(np.roll(h, dz, 0), dx, 1)
            d = (h - nb) / CELL
            move = np.where(d > talus, (d - talus) * CELL * k * 0.25, 0)
            dh -= move
            dh += np.roll(np.roll(move, -dz, 0), -dx, 1)
        if keep is not None: dh *= 1 - keep
        h = h + dh
    return h
h = erode(h, keep=np.clip(city + fest + circuit_box, 0, 1))

# ---------------------------------------------------------------- roads
def catmull(pts, closed, step=4.0):
    p = [np.array(q, float) for q in pts]
    if closed: p = [p[-1]] + p + [p[0], p[1]]
    else: p = [p[0] * 2 - p[1]] + p + [p[-1] * 2 - p[-2]]
    out = []
    for i in range(1, len(p) - 2):
        a, b, c, d = p[i - 1], p[i], p[i + 1], p[i + 2]
        seg = max(2, int(np.linalg.norm(c - b) / step))
        for k in range(seg):
            t = k / seg; t2 = t * t; t3 = t2 * t
            out.append(0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3))
    if not closed: out.append(p[-2])
    return np.array(out)

def sample_h(px, pz):
    fx = (px + SIZE / 2) / CELL; fz = (pz + SIZE / 2) / CELL
    ix = np.clip(np.floor(fx).astype(int), 0, N - 2); iz = np.clip(np.floor(fz).astype(int), 0, N - 2)
    tx = np.clip(fx - ix, 0, 1); tz = np.clip(fz - iz, 0, 1)
    a = h[iz, ix] * (1 - tx) + h[iz, ix + 1] * tx
    b = h[iz + 1, ix] * (1 - tx) + h[iz + 1, ix + 1] * tx
    return a * (1 - tz) + b * tz

TYPES = {'hwy': (9.0, 0.065), 'road': (5.5, 0.085), 'street': (6.0, 0.04), 'dirt': (4.5, 0.12), 'track': (7.0, 0.05)}   # half width, max grade
ROADS = [
  # id, type, closed, control points (x east, z south), name
  ('coast_hwy', 'hwy', False, [(-3950, 1700), (-3500, 1700), (-3000, 1730), (-2400, 1760), (-1700, 1880), (-1450, 2250), (-1200, 2420), (-500, 2330), (150, 2250), (800, 2420), (1500, 2520), (2200, 2420), (2850, 2150), (3350, 1700), (3650, 1100), (3700, 400)], 'Coastal Highway'),
  ('east_hwy', 'hwy', False, [(3700, 400), (3640, -300), (3500, -900), (3300, -1350), (3050, -1650)], 'Desert Highway'),
  ('central', 'road', False, [(150, 2250), (150, 1750), (180, 1520), (260, 900), (420, 300), (700, -300), (1100, -800), (1450, -1150), (1800, -1450)], 'Festival Road'),
  ('sakura_loop', 'road', True, [(1800, -1450), (1450, -1900), (1500, -2500), (1950, -3000), (2650, -3150), (3150, -2750), (3250, -2100), (3050, -1650), (2600, -1300), (2150, -1250)], 'Sakura Ring'),
  ('castle', 'road', False, [(2600, -1300), (2560, -1700), (2470, -2050), (2425, -2170)], 'Castle Road'),
  ('pass', 'road', False, [(420, 300), (-150, -150), (-500, -700), (-350, -1300), (-650, -1800), (-350, -2300), (-800, -2750), (-1400, -3050), (-2050, -2900), (-2450, -2400), (-2750, -1750), (-2900, -1100)], 'Summit Pass'),
  ('forest_loop', 'road', True, [(-2900, -1100), (-3350, -600), (-3150, 150), (-2600, 450), (-2050, 150), (-1850, -450), (-2250, -950)], 'Forest Loop'),
  ('forest_south', 'road', False, [(-3150, 150), (-3450, 800), (-3200, 1350), (-3000, 1680)], 'Pine Road'),
  ('farm', 'road', False, [(-1850, -450), (-1100, -250), (-450, 150), (180, 1520)], 'Farm Road'),
  ('farm2', 'road', False, [(-1200, 2420), (-1350, 1500), (-1600, 800), (-2050, 150)], 'Orchard Lane'),
  ('desert_trail', 'dirt', True, [(2600, 700), (2950, 150), (3350, -250), (3250, 900), (3000, 1600), (2650, 1350)], 'Red Rock Trail'),
  ('desert_link', 'dirt', False, [(3350, -250), (3640, -300)], 'Mesa Cut'),
  ('circuit', 'track', True, [(700, 600), (1300, 520), (1900, 560), (2080, 760), (1950, 980), (1500, 1020), (1350, 1200), (1600, 1420), (2000, 1480), (2100, 1620), (1500, 1660), (900, 1600), (680, 1350), (820, 1080), (650, 820)], 'Sideways Ring'),
  ('circuit_link', 'road', False, [(260, 900), (500, 760), (650, 820)], 'Ring Access'),
]
# the port city: a grid of streets
CITY = dict(x0=-3450, x1=-1850, z0=1950, z1=2460, step=200)
for i, x in enumerate(range(CITY['x0'], CITY['x1'] + 1, CITY['step'])):
    ROADS.append((f'st_ns{i}', 'street', False, [(x, CITY['z0']), (x, (CITY['z0'] + CITY['z1']) / 2), (x, CITY['z1'])], ''))
for i, z in enumerate(range(CITY['z0'], CITY['z1'] + 1, 170)):
    ROADS.append((f'st_ew{i}', 'street', False, [(CITY['x0'], z), ((CITY['x0'] + CITY['x1']) / 2, z), (CITY['x1'], z)], ''))

road_out = []
pin_pts, pin_h = np.zeros((0, 2)), np.zeros(0)                     # heights already fixed by earlier roads (crossings meet level)
for rid, typ, closed, ctrl, name in ROADS:
    hw, grade = TYPES[typ]
    pts = catmull(ctrl, closed, 4.0)
    hs = sample_h(pts[:, 0], pts[:, 1])
    hs = np.maximum(hs, 2.2)                                       # never below the beach
    pinned = np.full(len(pts), np.nan)
    if len(pin_pts):
        for i, p in enumerate(pts):
            d = np.hypot(pin_pts[:, 0] - p[0], pin_pts[:, 1] - p[1])
            j = np.argmin(d)
            if d[j] < 14: pinned[i] = pin_h[j]
    for it in range(60):                                           # smooth the profile, keep crossings pinned
        k = 9
        pad = np.concatenate([hs[-k:], hs, hs[:k]]) if closed else np.concatenate([np.full(k, hs[0]), hs, np.full(k, hs[-1])])
        hs = np.convolve(pad, np.ones(2 * k + 1) / (2 * k + 1), 'same')[k:-k]
        ok = ~np.isnan(pinned); hs[ok] = pinned[ok]
    seg = np.hypot(*np.diff(pts, axis=0).T)
    for _ in range(4):                                             # limit the grade both ways
        for i in range(1, len(hs)):
            hs[i] = np.clip(hs[i], hs[i - 1] - grade * seg[i - 1], hs[i - 1] + grade * seg[i - 1])
        for i in range(len(hs) - 2, -1, -1):
            hs[i] = np.clip(hs[i], hs[i + 1] - grade * seg[i], hs[i + 1] + grade * seg[i])
        ok = ~np.isnan(pinned); hs[ok] = pinned[ok]
    pin_pts = np.concatenate([pin_pts, pts]); pin_h = np.concatenate([pin_h, hs])
    road_out.append(dict(id=rid, type=typ, name=name, closed=closed, hw=hw, pts=np.round(np.column_stack([pts[:, 0], hs, pts[:, 1]]), 2).tolist()))

# carve the terrain to the roads: flat under the road, a gentle embankment beside it
best_d = np.full(h.shape, 1e9); best_h = np.zeros_like(h); best_w = np.zeros_like(h)
for r in road_out:
    hw = r['hw']; R = hw + 26
    for x, y, z in r['pts'][::2]:
        i0, i1 = int((z - R + SIZE / 2) / CELL), int((z + R + SIZE / 2) / CELL) + 1
        j0, j1 = int((x - R + SIZE / 2) / CELL), int((x + R + SIZE / 2) / CELL) + 1
        i0, j0 = max(i0, 0), max(j0, 0); i1, j1 = min(i1, N - 1), min(j1, N - 1)
        if i0 > i1 or j0 > j1: continue
        sub = (slice(i0, i1 + 1), slice(j0, j1 + 1))
        d = np.hypot(X[sub] - x, Z[sub] - z) - hw
        better = d < best_d[sub]
        best_d[sub] = np.where(better, d, best_d[sub]); best_h[sub] = np.where(better, y, best_h[sub])
w = 1 - smoothstep(1.5, 24, best_d)
h = h + (best_h - 0.25 - h) * w
road_dist = np.clip(best_d, 0, 63)

# ---------------------------------------------------------------- vegetation and ground cover
forest = np.clip((0.55 + 0.6 * fbm(P[10], X / 500, Z / 500, 4)) * (west * 1.0 + north * 0.7 * smoothstep(420, 320, h) + valley * 0.35 + 0.18), 0, 1)
forest *= land * (1 - city) * (1 - fest) * (1 - circuit_box) * smoothstep(4, 9, h) * (1 - east)
desert = np.clip(east * 1.15, 0, 1)
sakura = np.clip(valley * smoothstep(1500, 900, rv) * (0.6 + 0.5 * fbm(P[11], X / 350, Z / 350, 3)), 0, 1) * (1 - north)

# ---------------------------------------------------------------- city blocks and other buildings
rng = np.random.default_rng(77)
buildings = []
for x in range(CITY['x0'], CITY['x1'], CITY['step']):
    for z in range(CITY['z0'], CITY['z1'], 170):
        cx, cz = x + CITY['step'] / 2, z + 85
        inner_w, inner_d = CITY['step'] - 2 * 14, 170 - 2 * 14
        # downtown (east side of the city) is taller
        tall = 1 - (cx - CITY['x0']) / (CITY['x1'] - CITY['x0'])
        nx, nz = (2 if rng.random() < 0.7 else 1), 2
        for a in range(nx):
            for b in range(nz):
                w_ = inner_w / nx - 8 - rng.random() * 10; d_ = inner_d / nz - 8 - rng.random() * 10
                bx = cx - inner_w / 2 + (a + 0.5) * inner_w / nx; bz = cz - inner_d / 2 + (b + 0.5) * inner_d / nz
                hgt = 10 + rng.random() * 18 + (tall ** 2) * rng.random() * 95
                buildings.append(dict(x=round(bx, 1), z=round(bz, 1), w=round(w_, 1), d=round(d_, 1), h=round(hgt, 1), y=6.0, s=int(rng.integers(0, 6))))
# farm houses and barns along the farm roads, houses in the valley
def scatter(n, cx, cz, r, style, hmin, hmax, seed):
    g = np.random.default_rng(seed)
    for _ in range(n):
        for _try in range(30):
            a = g.random() * 6.283; rr = r * math.sqrt(g.random())
            x, z = cx + math.cos(a) * rr, cz + math.sin(a) * rr
            fi, fj = int((z + SIZE / 2) / CELL), int((x + SIZE / 2) / CELL)
            if 0 <= fi < N and 0 <= fj < N and 14 < best_d[fi, fj] < 40 and land[fi, fj] > .9:
                buildings.append(dict(x=round(x, 1), z=round(z, 1), w=round(10 + g.random() * 8, 1), d=round(8 + g.random() * 8, 1), h=round(hmin + g.random() * (hmax - hmin), 1), y=round(float(h[fi, fj]), 2), s=style, r=round(g.random() * 3.14, 2)))
                break
scatter(26, -700, 400, 1200, 6, 6, 9, 5)            # farm houses
scatter(34, 2250, -2050, 1050, 7, 5, 8, 6)          # valley houses with tiled roofs
scatter(10, -500, -2500, 700, 8, 6, 10, 7)          # mountain lodges

places = dict(
  spawn=dict(x=150, z=1640, h=3.14159),
  festival=dict(x=150, z=1300, r=230, name='Sideways Fest'),
  garage=dict(x=-60, z=1420, h=1.57, name='Your Garage'),
  castle=dict(x=castle[0], z=castle[1], y=float(sample_h(np.array([castle[0]]), np.array([castle[1]]))[0])),
  regions=[
    dict(id='city', name='Puerto Dorado', x=-2650, z=2280),
    dict(id='forest', name='Bosque Alto', x=-2700, z=-500),
    dict(id='peaks', name='Pico Nevado', x=-1000, z=-3000),
    dict(id='sakura', name='Valle Sakura', x=2250, z=-2050),
    dict(id='desert', name='Cañón Rojo', x=3100, z=600),
    dict(id='farm', name='Llanura Verde', x=-600, z=200),
    dict(id='fest', name='Sideways Fest', x=150, z=1300),
    dict(id='ring', name='Sideways Ring', x=1400, z=1100)],
)
races = [
  dict(id='ring', name='Sideways Ring GP', road='circuit', laps=3, kind='circuit'),
  dict(id='sakura', name='Sakura Ring', road='sakura_loop', laps=2, kind='circuit'),
  dict(id='forest', name='Forest Loop', road='forest_loop', laps=2, kind='circuit'),
  dict(id='desert', name='Red Rock Rally', road='desert_trail', laps=2, kind='dirt'),
  dict(id='coast', name='Coastal Sprint', road='coast_hwy', laps=0, kind='sprint'),
  dict(id='pass', name='Summit Pass Sprint', road='pass', laps=0, kind='sprint'),
]

# ---------------------------------------------------------------- write
os.makedirs(OUT, exist_ok=True)
q = np.clip(np.round((h - HMIN) * HSCALE), 0, 65535).astype('<u2')
q.tofile(os.path.join(OUT, 'height.bin'))
rgba = np.stack([np.round(road_dist * 4).clip(0, 255), forest * 255, desert * 255, sakura * 255], -1).astype(np.uint8)
Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, 'map.png'), optimize=True)
with open(os.path.join(OUT, 'world.json'), 'w') as f:
    json.dump(dict(v=1, N=N, size=SIZE, hmin=HMIN, hscale=HSCALE, sea=0.0, roads=road_out, buildings=buildings, places=places, races=races), f, separators=(',', ':'))
# a shaded relief to look at while designing
light = np.array([-0.6, 0.7, -0.4]); light /= np.linalg.norm(light)
gz_, gx_ = np.gradient(h, CELL)
nrm = np.stack([-gx_, np.ones_like(h), -gz_], -1); nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
shade = np.clip(nrm @ light, 0, 1)
col = np.zeros(h.shape + (3,))
col[:] = [0.42, 0.58, 0.30]
col = col * (1 - desert[..., None]) + np.array([0.78, 0.45, 0.28]) * desert[..., None]
col = col * (1 - forest[..., None] * 0.55) + np.array([0.16, 0.32, 0.16]) * forest[..., None] * 0.55
col = col * (1 - sakura[..., None] * 0.6) + np.array([0.93, 0.62, 0.74]) * sakura[..., None] * 0.6
snow = smoothstep(330, 430, h)[..., None]
col = col * (1 - snow) + np.array([0.95, 0.96, 0.98]) * snow
col = np.where((h < 0.5)[..., None], np.array([0.12, 0.35, 0.55]), col)
col = col * (0.35 + 0.75 * shade[..., None])
col = np.where((road_dist < 1)[..., None], np.array([0.15, 0.15, 0.17]), col)
Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, '..', 'tools', 'world', 'preview.png'))
print('world built:', N, 'x', N, 'heights', round(float(h.min()), 1), '..', round(float(h.max()), 1), 'm;', len(road_out), 'roads,', len(buildings), 'buildings')
