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
    xx = x
    if p == 'vessel' and x < 82 and not HAND(x, y): xx = round(82 - (82 - x) * 0.45)   # the reaching arm, foreshortened
    if (xx, yy) in src[p] and p == 'vessel' and xx != x: continue
    src[p][(xx, yy)] = px[x, y]
# piece: the part's source pixels at scale (sx, sy), with source column `mid` landing on x 16 (or the
# whole part centered), top-aligned or bottom-aligned, quantized to the palette and outlined.
def piece(name, sx, sy, mid=None, bottom=False):
  d = src[name]
  x0 = min(k[0] for k in d); x1 = max(k[0] for k in d) + 1; y0 = min(k[1] for k in d); y1 = max(k[1] for k in d) + 1
  w, h = x1 - x0, y1 - y0
  c = Image.new('RGB', (w, h)); m = Image.new('L', (w, h))
  for (x, y), p in d.items(): c.putpixel((x - x0, y - y0), p); m.putpixel((x - x0, y - y0), 255)
  tw, th = min(30, round(w * sx)), min(32, round(h * sy))
  c = c.resize((tw, th), Image.BOX); m = m.resize((tw, th), Image.BOX)
  ox = round(piece.at - (mid - x0) * sx) if mid is not None else (32 - tw) // 2
  ox = max(1, min(31 - tw, ox)); oy = 32 - th if bottom else 0
  g = [[None] * 32 for _ in range(32)]; vals = []
  for y in range(th):
    for x in range(tw):
      if m.getpixel((x, y)) > 110:
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
  return [''.join(r) for r in out]
piece.at = 16
def extent(name):
  d = src[name]; xs = [k[0] for k in d]; ys = [k[1] for k in d]
  return min(xs), max(xs) + 1, min(ys), max(ys) + 1
# The mask: the whole head, centered with a margin.
x0, x1, y0, y1 = extent('mask'); s = min(26 / (x1 - x0), 28 / (y1 - y0))
mask = piece('mask', s, s, bottom=True)
# The vessel: the torso's middle on the center line, filling the cell top to bottom.
BODY = 122
x0, x1, y0, y1 = extent('vessel'); piece.at = 18                 # two px right of center: room for the arm, eased back at the joins
sx = min(17.5 / (BODY - x0), 12.5 / (x1 - BODY))
vessel = piece('vessel', sx, 32 / (y1 - y0), mid=BODY)
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
json.dump({'mask': mask, 'vessel': vessel, 'pedestal': tail(16)}, open('xeno_trace.json', 'w'), indent=1)
