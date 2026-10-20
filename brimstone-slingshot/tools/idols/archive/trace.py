# Trace the blue alien from the reference into three 32x32 idol pieces in the 4-tone palette.
import sys, json
from PIL import Image
im = Image.open('../images/1.webp').convert('RGB').crop((0, 0, 180, 268))
W, H = im.size
BG = (119, 200, 250)
def is_bg(p): return sum((a - b) ** 2 for a, b in zip(p, BG)) < 55 ** 2 or p[1] < 30 and p[2] < 30 and p[0] < 30 and False
mask = Image.new('L', im.size)
mp = mask.load(); px = im.load()
for y in range(H):
  for x in range(W):
    mp[x, y] = 0 if is_bg(px[x, y]) or y < 6 or x > 172 else 255

def part(x, y):
  p = px[x, y]; white = sum(p) / 3 > 150 and max(p) - min(p) < 90
  if y < 118 and x < 98 and not (y > 60 and x > 80): return 'mask'    # the head, without the shoulder plate
  if y >= 205 and not (white and x < 132) and x > 70: return 'pedestal' # the curled tail; the claws stay with the arms
  if y > 244 or y < 55: return None                                            # the next creature's edge
  return 'vessel'
def piece(name, join, cap=9):
  pts = [(x, y) for y in range(H) for x in range(W) if mp[x, y] and part(x, y) == name]
  x0 = min(p[0] for p in pts); x1 = max(p[0] for p in pts) + 1; y0 = min(p[1] for p in pts); y1 = max(p[1] for p in pts) + 1
  pm = Image.new('L', (x1 - x0, y1 - y0)); pl = pm.load()
  for x, y in pts: pl[x - x0, y - y0] = 255
  w, h = x1 - x0, y1 - y0; s = min(cap, 30 / max(w, h))
  tw, th = max(1, round(w * s)), max(1, round(h * s))
  c = im.crop((x0, y0, x1, y1)).resize((tw, th), Image.BOX); m = pm.resize((tw, th), Image.BOX)
  on = lambda x, y: m.getpixel((x, y)) > 110
  rows = range(th - 3, th) if join == 'bottom' else range(0, 3)
  cols = [x for y in rows for x in range(tw) if on(x, y)]
  mid = (min(cols) + max(cols)) / 2 if cols else tw / 2
  ox = max(1, min(31 - tw, round(16 - mid))); oy = 31 - th if join == 'bottom' else 1
  if name == 'vessel': oy = 1
  g = [['.'] * 32 for _ in range(32)]; vals = []
  for y in range(th):
    for x in range(tw):
      if on(x, y):
        r, gg, b = c.getpixel((x, y)); lum = .3 * r + .59 * gg + .11 * b
        vals.append(lum); g[oy + y][ox + x] = (lum, max(r, gg, b) - min(r, gg, b), r, gg, b)
  vals.sort(); q = lambda f: vals[int(len(vals) * f)]
  t1, t2 = q(.15), q(.55)
  out = [['.'] * 32 for _ in range(32)]
  for y in range(32):
    for x in range(32):
      v = g[y][x]
      if v == '.': continue
      lum, sat, r, gg, b = v
      out[y][x] = 'w' if lum > 140 and sat < 100 else '#' if r > gg + 25 or lum < t1 else '+' if lum < t2 else '-'
  for y in range(32):
    for x in range(32):
      if out[y][x] == '.' and any(0 <= x + a < 32 and 0 <= y + b < 32 and g[y + b][x + a] != '.' for a, b in ((1,0),(-1,0),(0,1),(0,-1))):
        out[y][x] = '#'
  return [''.join(r) for r in out]
json.dump({'mask': piece('mask', 'bottom'), 'vessel': piece('vessel', 'top'), 'pedestal': piece('pedestal', 'top', 0.22)}, open('xeno_trace.json', 'w'), indent=1)
