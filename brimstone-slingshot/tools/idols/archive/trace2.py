# Trace the blue alien into three 32x32 idol pieces that stack: each piece fills its cell top to
# bottom, and the joins line up (mask neck over vessel neck, vessel waist over the tail's root).
import json
from PIL import Image
im = Image.open('../images/1.webp').convert('RGB').crop((0, 0, 180, 268))
W, H = im.size; px = im.load()
BG = (119, 200, 250)
solid = lambda x, y: y >= 6 and x <= 172 and sum((a - b) ** 2 for a, b in zip(px[x, y], BG)) >= 55 ** 2
white = lambda p: sum(p) / 3 > 150 and max(p) - min(p) < 90
HAND = lambda x, y: x <= 118 and 186 <= y <= 244          # the hanging hand and its claws
LIFT = 44                                                   # the hand moves up this far, clear of the tail
def part(x, y):
  if y > 262: return None
  if y < 118 and x < 98 and not (y > 60 and x > 80): return 'mask'
  if y < 55: return None
  if HAND(x, y): return 'vessel'
  if y >= 200: return 'pedestal' if x > 70 else None
  return 'vessel'
# Source pixels per part, the hand lifted.
src = {'mask': {}, 'vessel': {}, 'pedestal': {}}
for y in range(H):
  for x in range(W):
    if not solid(x, y): continue
    p = part(x, y)
    if not p: continue
    yy = y - LIFT if p == 'vessel' and HAND(x, y) else y
    src[p][(x, yy)] = px[x, y]
def piece(name, align_top=None, align_bottom=None, scale=None):
  d = src[name]
  x0 = min(k[0] for k in d); x1 = max(k[0] for k in d) + 1; y0 = min(k[1] for k in d); y1 = max(k[1] for k in d) + 1
  w, h = x1 - x0, y1 - y0
  c = Image.new('RGB', (w, h)); m = Image.new('L', (w, h))
  for (x, y), p in d.items(): c.putpixel((x - x0, y - y0), p); m.putpixel((x - x0, y - y0), 255)
  s = scale or (min(26 / w, 28 / h) if name == 'mask' else min(30 / w, 32 / h)); piece.s = s; tw, th = round(w * s), min(32, round(h * s))
  if name == 'vessel': th = 32                               # fill the cell top to bottom, a touch taller than wide
  c = c.resize((tw, th), Image.BOX); m = m.resize((tw, th), Image.BOX)
  on = lambda x, y: m.getpixel((x, y)) > 110
  span = lambda rows: [x for y in rows for x in range(tw) if on(x, y)]
  oy = 32 - th if name == 'mask' else 0
  if align_bottom is not None: cols = span(range(th - 3, th)); target = align_bottom
  else: cols = span(range(0, 3)); target = align_top
  ox = max(1, min(31 - tw, round(target - (min(cols) + max(cols)) / 2)))
  if name == 'mask': ox = (32 - tw) // 2
  g = [[None] * 32 for _ in range(32)]; vals = []
  for y in range(th):
    for x in range(tw):
      if on(x, y):
        p = c.getpixel((x, y)); lum = .3 * p[0] + .59 * p[1] + .11 * p[2]
        vals.append(lum); g[oy + y][ox + x] = (lum, p)
  vals.sort(); t1, t2 = vals[int(len(vals) * .15)], vals[int(len(vals) * .55)]
  out = [['.'] * 32 for _ in range(32)]
  for y in range(32):
    for x in range(32):
      if g[y][x]:
        lum, p = g[y][x]
        out[y][x] = 'w' if white(p) or lum > 140 and max(p) - min(p) < 100 else '#' if p[0] > p[1] + 25 or lum < t1 else '+' if lum < t2 else '-'
  for y in range(32):
    for x in range(32):
      if out[y][x] == '.' and any(0 <= x + a < 32 and 0 <= y + b < 32 and g[y + b][x + a] for a, b in ((1,0),(-1,0),(0,1),(0,-1))):
        out[y][x] = '#'
  joint = lambda r: (lambda xs: (min(xs) + max(xs)) / 2 if xs else 16)([x for x in range(32) if g[r][x]])
  return [''.join(r) for r in out], joint(0), joint(31)
mask, _, neck = piece('mask', align_bottom=16)
vessel, _, waist = piece('vessel', align_top=neck)
vs = piece.s
# The vessel's waist: the middle of its body (not the white claws) in its lowest rows.
body = [x for y in range(24, 32) for x in range(32) if vessel[y][x] in '+-' and x > 20]
waist = (min(body) + max(body)) / 2 if body else waist
ped, _, _ = piece('pedestal', align_top=waist, )
json.dump({'mask': mask, 'vessel': vessel, 'pedestal': ped}, open('xeno_trace.json', 'w'), indent=1)
print('neck', neck, 'waist', waist)
# The tail, drawn rather than traced: the source's tail hooks sideways, which reads badly at 32 px.
# A thick tail from under the waist, sweeping down and curling left to a point, shaded like the trace.
import math
def tail(top):
  P0, P1, P2 = (top, -1), (top + 1, 20), (7, 28)
  bz = lambda t: tuple((1 - t) ** 2 * a + 2 * (1 - t) * t * b + t * t * c for a, b, c in zip(P0, P1, P2))
  pts = [(bz(i / 200), 5.2 * (1 - i / 200) ** 0.9 + 0.4) for i in range(201)]
  g = [[None] * 32 for _ in range(32)]
  for y in range(32):
    for x in range(32):
      best = min(((x + .5 - p[0]) ** 2 + (y + .5 - p[1]) ** 2, r, p) for p, r in pts)
      d, r, p = math.sqrt(best[0]), best[1], best[2]
      if d <= r: g[y][x] = (x + .5 - p[0]) / r                 # -1 at the left edge, 1 at the right
  out = [['.'] * 32 for _ in range(32)]
  for y in range(32):
    for x in range(32):
      u = g[y][x]
      if u is None: continue
      out[y][x] = 'w' if -0.45 < u < -0.1 and 6 < y < 24 else '-' if u < 0.35 else '+'  # a gloss streak down the left
  for y in range(32):
    for x in range(32):
      if out[y][x] == '.' and any(0 <= x + a < 32 and 0 <= y + b < 32 and g[y + b][x + a] is not None for a, b in ((1,0),(-1,0),(0,1),(0,-1))):
        out[y][x] = '#'
  return [''.join(r) for r in out]
json.dump({'mask': mask, 'vessel': vessel, 'pedestal': tail(waist - 1)}, open('xeno_trace.json', 'w'), indent=1)
