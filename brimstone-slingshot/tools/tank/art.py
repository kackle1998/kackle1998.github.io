# The Brimstone Tank's art (js/tank.js): the background and the guppy and crab sprites, drawn from
# shapes in the palette's tones with the game's 4x4 Bayer dithering, lit from the upper left.
# Writes art.json (the background as run-length tone codes, the sprites as rows) and a preview PNG.
# Tones: 0 ink, 1 dark, 2 mid, 3 light, 4 paper, 5 white, 6 accent (brass); 9 clear (the kelp is
# drawn by the game, so it can sway).
import json, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 384, 216
BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
dith = lambda x, y: (BAY[(x & 3) + (y & 3) * 4] + 0.5) / 16
def tone(b, x, y, lo, hi):
  """Brightness b (0..1) to a tone between lo and hi, dithered between neighbors."""
  v = lo + max(0, min(1, b)) * (hi - lo)
  base = math.floor(v)
  return min(hi, base + (1 if v - base > dith(x, y) else 0))
ell = lambda x, y, cx, cy, rx, ry: ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
def seg(px, py, ax, ay, bx, by):
  dx, dy = bx - ax, by - ay; t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy or 1)))
  return math.hypot(px - ax - t * dx, py - ay - t * dy)

SAND = 178                                           # where things settle (coins, food, the crab's feet)
sand_top = lambda x: 166 + 3 * math.sin(x / 41) + 2 * math.sin(x / 13 + 1)

# ---------- the background ----------
g = [[9] * W for _ in range(H)]
for y in range(H):
  for x in range(W):
    # water: a column of light from above, brighter in the middle, a soft vignette, shimmer bands up top
    cx = (x - W * 0.55) / W
    rays = sum(math.exp(-((cx + k * 0.12 - (y / H) * k * 0.18) ** 2) / 0.004) for k in (-2, -1, 0, 1, 2)) * 0.12
    shimmer = 0.1 if y < 70 and math.sin(x / 9 + math.sin(y / 5) * 2 + y / 3) > 0.75 else 0
    b = 0.74 - 1.7 * cx * cx - 0.3 * (y / H) + rays * 1.6 + shimmer
    g[y][x] = tone(b, x, y, 1, 5)
# the sand: a wavy back edge, lighter dunes, darker toward the front, pebbles
pebbles = [(30, 200, 4, 2), (120, 205, 5, 2), (200, 196, 3, 2), (330, 207, 6, 3), (360, 190, 4, 2), (170, 211, 4, 2), (95, 186, 3, 1.5)]
for y in range(H):
  for x in range(W):
    st = sand_top(x)
    if y < st: continue
    d = (y - st) / (H - st)
    dune = 0.12 * math.sin(x / 23 + d * 4) * (1 - d)
    b = 0.85 - 0.45 * d + dune
    g[y][x] = 0 if abs(y - st) < 1 else tone(b, x, y, 2, 5)
    for px, py, rx, ry in pebbles:
      e = ell(x, y, px, py, rx, ry)
      if e <= 1: g[y][x] = 1 if e > 0.55 or (x - px) + (y - py) > 0 else 2
# the rock arch on the left, cobbled and lit from the upper left, a dark cave in it
def rock(x, y):
  return ell(x, y, 66, 166, 58, 52) <= 1 and y < sand_top(x) + 3
for y in range(H):
  for x in range(W):
    if not rock(x, y): continue
    cave = ell(x, y, 70, 158, 22, 21)
    if cave <= 1:
      g[y][x] = 0 if cave < 0.75 else tone(0.35, x, y, 0, 2); continue
    cob = abs(math.sin(x / 7 + math.sin(y / 6)) * math.sin(y / 6 + math.cos(x / 9))) # cobbles
    lit = 0.62 - ((x - 66) * 0.6 + (y - 140) * 0.8) / 120
    b = lit - (0.35 if cob < 0.12 else 0) + (0.12 if cob > 0.85 else 0)
    g[y][x] = tone(b, x, y, 0, 4)
# corals on the rock: branching coral (mid, outlined), fans (dithered), little tufts (light)
def branch(x0, y0, ang, ln, depth, t, out):
  x1, y1 = x0 + math.cos(ang) * ln, y0 - math.sin(ang) * ln
  out.append((x0, y0, x1, y1, t))
  if depth:
    for da in (-0.45, 0.4):
      branch(x1, y1, ang + da, ln * 0.72, depth - 1, max(1, t - 0.4), out)
cor = []
for (bx, by, a, ln) in ((30, 132, 1.75, 16), (52, 118, 1.5, 14), (96, 124, 1.35, 15), (112, 140, 1.2, 12), (18, 150, 1.95, 12)):
  branch(bx, by, a, ln, 3, 2.2, cor)
for y in range(H):
  for x in range(W):
    d = min((seg(x + .5, y + .5, *c[:4]) - c[4] / 2 for c in cor), default=9)
    if d <= 0: g[y][x] = 2 if (x + y) % 5 else 3
    elif d <= 1 and g[y][x] >= 2 and not rock(x, y): g[y][x] = 0
for (fx, fy, r) in ((74, 116, 11), (40, 120, 9)):                               # fan corals
  for y in range(H):
    for x in range(W):
      if fy - r <= y <= fy and ell(x, y, fx, fy, r, r) <= 1:
        ring = math.hypot(x - fx, y - fy)
        g[y][x] = 0 if ring > r - 1 else (1 if (round(math.atan2(y - fy, x - fx) * 5) % 2 and ring > 3) else 2)
for (tx, ty) in ((60, 112), (88, 118), (24, 136), (104, 132)):                   # tufts
  for i, (dx, dy) in enumerate(((0, 0), (-2, -3), (2, -3), (0, -5), (-3, -6), (3, -6))):
    for a in (0, 1):
      g[ty + dy][tx + dx + a] = 5 if i > 2 else 3
# the diving helmet on the right: a brass-rimmed sphere half sunk in the sand, a curved neck ring round
# its base, sand drifted over it, its shadow falling to the lower right
HX, HY, HR = 262, 150, 34
for y in range(H):                                            # its shadow on the sand, dithered
  for x in range(W):
    if y >= sand_top(x) + 1 and ell(x, y, HX + 44, 184, 40, 8) <= 1 and g[y][x] >= 3:
      g[y][x] = tone(0.3 + 0.55 * ell(x, y, HX + 44, 184, 40, 8), x, y, 2, 4)
for y in range(H):
  for x in range(W):
    e = ell(x, y, HX, HY, HR, HR)
    if e > 1 or y > sand_top(x) + 10: continue
    lit = 0.8 - ((x - HX) * 0.55 + (y - HY) * 0.75) / (HR * 1.5)
    edge = e > 0.94
    g[y][x] = (0 if y < HY else 1) if edge else tone(lit - 0.1 * ((x * 3 + y * 5) % 7 == 0), x, y, 1, 4)
    for (px, py, pr) in ((250, 152, 13), (229, 140, 7), (285, 146, 7), (262, 126, 8)):
      d = math.hypot(x - px, y - py)
      if d <= pr - 3: g[y][x] = 5 if (x - px) - (y - py) < -pr * 0.7 and d > pr - 6 else (0 if (x + y) % 3 else 1)   # dark glass, a streak of light
      elif d <= pr:                                                                                            # the rim: light, gold where lit
        g[y][x] = 0 if d > pr - 0.9 else 6 if (x - px) + (y - py) < -pr * 0.3 and d < pr - 1.8 else 3
    if ell(x, y, 283, 129, 5, 5) <= 1: g[y][x] = 0 if ell(x, y, 283, 129, 5, 5) > 0.7 else 3                    # a plate
# the neck ring: a curved brass band round the base, gold where the light catches it
for y in range(H):
  for x in range(W):
    o, i = ell(x, y, HX, 170, 33, 7), ell(x, y, HX, 167, 33, 7)
    if o <= 1 and i > 1 and y >= 164 and abs(x - HX) <= 30:
      g[y][x] = 0 if o > 0.86 or i < 1.12 else 6 if x < HX - 8 and (x + y) % 2 else 3
# sand drifted over the base: a low mound in the sand's own tones, its top edge dithered into the ring
for y in range(H):
  for x in range(W):
    m = ell(x, y, HX - 2, 182, 46, 12)
    if m <= 1 and y >= 166:
      d = (y - 170) / 40
      if m > 0.82 and (x * 7 + y * 3) % 3: continue                  # a ragged, dithered rim
      g[y][x] = tone(0.86 - 0.4 * d + 0.08 * math.sin(x / 9), x, y, 2, 5)
# little sand plants in front
for (px, h) in ((150, 9), (210, 7), (330, 10), (12, 8)):
  for i in range(h):
    for xx in (px - i // 3, px + i // 3):
      if 0 <= xx < W: g[int(sand_top(px)) + 6 - i][xx] = 1 if i % 3 else 2

def rle(grid):
  """Pairs of characters: a tone digit, then its run length as a character from '0' (1 to 61)."""
  out, run, cur = [], 0, None
  for r in grid:
    for v in r:
      if v == cur and run < 61: run += 1
      else:
        if cur is not None: out.append(f'{cur}{chr(48 + run)}')
        cur, run = v, 1
  out.append(f'{cur}{chr(48 + run)}')
  return ''.join(out)

# ---------- sprites (rows of # + - w and .), facing left ----------
def sprite(w, h, f):
  s = [[f(x + .5, y + .5) or '.' for x in range(w)] for y in range(h)]
  for y in range(h):                                          # ink outline outside the shape
    for x in range(w):
      if s[y][x] == '.' and any(0 <= x + a < w and 0 <= y + b < h and s[y + b][x + a] not in '.#' for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))):
        s[y][x] = '#'
  return [''.join(r) for r in s]
def guppy(L):
  """A guppy L long: a round orange body (light) with a darker back and a pale belly, a big eye with a
  pupil and a glint, red lips, pink fins (mid) with ink rays on the dorsal fin and the tail."""
  h = round(L * 0.72); cx, cy, rx, ry = L * 0.42, h * 0.56, L * 0.36, h * 0.38
  er = max(1.6, L * 0.11); ex, ey = cx - rx * 0.45, cy - ry * 0.25
  def f(x, y):
    body = ell(x, y, cx, cy, rx, ry) <= 1
    tail = x > cx + rx * 0.75 and abs(y - cy) <= (x - (cx + rx * 0.75)) * 0.9 + 1 and x < L - 1
    dors = y < cy - ry * 0.6 and cx - rx * 0.2 < x < cx + rx * 0.7 and y > cy - ry - (cx + rx * 0.7 - x) * 0.55
    pec = ell(x, y, cx + rx * 0.05, cy + ry * 0.25, rx * 0.28, ry * 0.18) <= 1
    lips = ell(x, y, cx - rx - 0.6, cy + ry * 0.2, 1.4, 1.1) <= 1
    eye = ell(x, y, ex, ey, er, er) <= 1
    if eye:
      if ell(x, y, ex - er * 0.25, ey + er * 0.1, er * 0.5, er * 0.55) <= 1: return '#'
      return 'w'
    if lips: return '+'
    if body:
      if pec: return '+'
      if y > cy + ry * 0.5: return 'w'                                        # the pale belly
      return '+' if (x - cx) * 0.5 + (y - cy) * 0.9 > ry * 0.55 or y < cy - ry * 0.8 else '-'
    if tail: return '#' if L >= 16 and int(y - cy) % 3 == 0 and x > cx + rx * 0.95 else '+'
    if dors: return '#' if L >= 16 and int(x) % 3 == 0 else '+'
    return None
  return sprite(L, h, f)
def crab(step):
  """The Guppymuncher: a domed shell (light, darker below), eyes on stalks, two-pronged pincers raised
  (mid), jointed legs in two walking poses."""
  w, h = 24, 17
  def f(x, y):
    ax, side = abs(x - 12), 1 if x > 12 else -1
    shell = ell(x, y, 12, 12, 8, 4.5) <= 1 and y > 7.4
    if shell: return 'w' if ell(x, y, 10, 9.5, 3, 1.2) <= 1 else '-' if y < 12 else '+'
    for s in (-1, 1):
      cxp = 12 + s * 8.5
      if ell(x, y, cxp, 4.5, 2.6, 3) <= 1 and not (abs(x - cxp) < 0.8 and y < 4): return '+'   # the pincer, its two prongs
      if seg(x, y, 12 + s * 6.5, 9, cxp, 6.5) < 1.1: return '+'                               # the arm
      if seg(x, y, 12 + s * 3, 8, 12 + s * 3, 4.5) < 0.6: return '+'                          # an eye stalk
      if ell(x, y, 12 + s * 3, 3.6, 1.3, 1.2) <= 1: return '#' if int(x) == 12 + s * 3 - (1 if s < 0 else 0) and int(y) == 3 else 'w'
      for i, lx in enumerate((4.2, 6.4, 8.6)):                                               # three legs a side, jointed
        k = (1 if (i + step) % 2 else -1) * 0.8
        if seg(x, y, 12 + s * lx, 14, 12 + s * (lx + 1.6), 15.2 + k * 0.3) < 0.7 or seg(x, y, 12 + s * (lx + 1.6), 15.2 + k * 0.3, 12 + s * (lx + 1.2 + k), 16.6) < 0.6: return '+'
    return None
  return sprite(w, h, f)

art = {'sand': SAND, 'bg': rle(g), 'guppy': [guppy(L) for L in (16, 20, 26)], 'crab': [crab(0), crab(1)]}
# (the game reads js/tank-art.js; nothing else is written but the preview)
with open(os.path.join(HERE, '..', '..', 'js', 'tank-art.js'), 'w') as f:   # what the game loads
  f.write("'use strict';\n/* The Brimstone Tank's art, made by tools/tank/art.py (edit that, not this): the background as\n"
          "   run-length pairs (a tone digit, then its run as a character from '0'), the guppies by size and\n"
          "   the crab's two walking poses as palette rows. */\n")
  f.write('const TANK_ART = ' + json.dumps(art, separators=(',', ':')).replace('],', '],\n') + ';\n')

# ---------- preview in Moss ----------
from PIL import Image
M = [(31, 36, 24), (59, 68, 48), (110, 122, 82), (169, 180, 126), (217, 223, 179), (238, 241, 214), (176, 149, 58)]
CH = {'#': M[0], '+': M[2], '-': M[3], 'w': M[5]}
im = Image.new('RGB', (W, H)); px = im.load()
for y in range(H):
  for x in range(W): px[x, y] = M[g[y][x]] if g[y][x] < 9 else (255, 0, 255)
def stamp(rows, X, Y):
  for yy, r in enumerate(rows):
    for xx, c in enumerate(r):
      if c != '.': px[X + xx, Y + yy] = CH[c]
for i, (sx, sy) in enumerate(((150, 60), (190, 80), (130, 100))): stamp(art['guppy'][i], sx, sy)
stamp(art['crab'][0], 170, SAND - 16)
im = im.resize((W * 2, H * 2), Image.NEAREST)
sheet = Image.new('RGB', (W * 2 + 20 + 4 * 30 * 6, H * 2), (18, 22, 14)); sheet.paste(im, (0, 0))
for i, rows in enumerate(art['guppy'] + art['crab']):
  sp = Image.new('RGB', (len(rows[0]), len(rows)), (217, 223, 179)); q = sp.load()
  for yy, r in enumerate(rows):
    for xx, c in enumerate(r):
      if c != '.': q[xx, yy] = CH[c]
  sheet.paste(sp.resize((len(rows[0]) * 6, len(rows) * 6), Image.NEAREST), (W * 2 + 20 + (i % 3) * 170, (i // 3) * 140 + 10))
sheet.save(os.path.join(HERE, 'preview.png'))
print(len(art['bg']), 'chars of background')
