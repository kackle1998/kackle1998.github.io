# Read a creature mockup (three 32x32 grids on black) cell by cell into the game's 4 tones.
# Usage: fromgrid2.py <image> <out.json> <x0,y0,x1,y1 per piece: mask vessel pedestal>
import json, os, sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); px = im.load()
FIT = '--fit' in sys.argv
if FIT: sys.argv.remove('--fit')
FRAMES = dict(zip(['mask', 'vessel', 'pedestal'], [tuple(map(int, f.split(','))) for f in sys.argv[3:6]]))
lum = lambda p: .3 * p[0] + .59 * p[1] + .11 * p[2]
bg = lambda p: max(p) < 40                                         # the black ground (dark grays like tires stay)
wh = lambda p: lum(p) > 200 and min(p) > 140 or p[1] > p[0] + 60 and p[1] > p[2] + 60 and lum(p) > 120   # white, and glowing green (robot eyes)                                        # claws, fangs
lum = lambda p: .3 * p[0] + .59 * p[1] + .11 * p[2]
def cell(x0, y0, x1, y1, cx, cy):
  cw, ch = (x1 - x0) / 32, (y1 - y0) / 32
  ps = [px[int(x0 + (cx + fx) * cw), int(y0 + (cy + fy) * ch)] for fx in (.3, .4, .5, .6, .7) for fy in (.3, .4, .5, .6, .7)]
  pts = [(int(x0 + (cx + fx) * cw), int(y0 + (cy + fy) * ch)) for fx in (.3, .4, .5, .6, .7) for fy in (.3, .4, .5, .6, .7)]
  clear = [px[p] for p in pts if not any(abs(p[0] - l) < 3 for l in LINES[0]) and not any(abs(p[1] - l) < 3 for l in LINES[1])]
  ps = sorted(clear or ps, key=sum); return ps[len(ps) // 2]   # samples on the mockup's overlay grid lines are skipped
def lines(f):   # the overlay grid's line positions, found along an empty strip just inside the frame
  x0, y0, x1, y1 = f
  xs = [x for x in range(x0, x1 + 1) if px[x, y0 + 3][0] > 70]; ys = [y for y in range(y0, y1 + 1) if px[x0 + 3, y][0] > 70]
  dedup = lambda v: [a for i, a in enumerate(v) if i == 0 or a - v[i - 1] > 1]
  return dedup(xs), dedup(ys)
out = {}
for k, f in FRAMES.items():
  LINES = lines(f)
  if FIT:
    x0, y0, x1, y1 = f
    # art: points with solid color all around them (grid lines are too thin to pass)
    art = [(x, y) for y in range(y0 + 6, y1 - 5, 2) for x in range(x0 + 6, x1 - 5, 2)
           if all(max(px[x + a, y + b]) >= 60 for a in (-4, 0, 4) for b in (-4, 0, 4))]
    ax0, ax1 = min(p[0] for p in art), max(p[0] for p in art); ay0, ay1 = min(p[1] for p in art), max(p[1] for p in art)
    span = {'mask': 22, 'vessel': 28, 'pedestal': 28, **{a: int(b) for a, b in (kv.split('=') for kv in os.environ.get('SPAN', '').split(',') if kv)}}[k]  # heads a size smaller; SPAN=mask=24 overrides
    side = max(ax1 - ax0, ay1 - ay0) * 32 / span
    cx, cy = (ax0 + ax1) / 2, (ay0 + ay1) / 2
    f = (cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2)
  grid = [[cell(*f, x, y) for x in range(32)] for y in range(32)]
  if FIT:                                                       # nothing outside the art's own box
    fx0, fy0, fx1, fy1 = f; cw = (fx1 - fx0) / 32
    for y in range(32):
      for x in range(32):
        X, Y = fx0 + (x + .5) * cw, fy0 + (y + .5) * cw
        if not (ax0 - 3 <= X <= ax1 + 3 and ay0 - 3 <= Y <= ay1 + 3): grid[y][x] = (0, 0, 0)
  vals = sorted(lum(p) for r in grid for p in r if not (bg(p) or wh(p)))
  t1, t2 = vals[int(len(vals) * .2)], vals[int(len(vals) * .6)]
  rows = [['.' if bg(p) else 'w' if wh(p) else '#' if lum(p) < t1 else '+' if lum(p) < t2 else '-' for p in r] for r in grid]
  for y in range(32):
    for x in range(32):
      if rows[y][x] == '.' and any(0 <= x + a < 32 and 0 <= y + b < 32 and rows[y + b][x + a] not in '.#' for a, b in ((1,0),(-1,0),(0,1),(0,-1))):
        rows[y][x] = '#'
  # drop specks (grid crossings) under 8 pixels
  seen = set()
  for y in range(32):
    for x in range(32):
      if rows[y][x] == '.' or (x, y) in seen: continue
      comp = [(x, y)]; seen.add((x, y)); i = 0
      while i < len(comp):
        cx, cy = comp[i]; i += 1
        for a in (-1, 0, 1):
          for b in (-1, 0, 1):
            n = (cx + a, cy + b)
            if 0 <= n[0] < 32 and 0 <= n[1] < 32 and rows[n[1]][n[0]] != '.' and n not in seen: seen.add(n); comp.append(n)
      if len(comp) < 8:
        for cx, cy in comp: rows[cy][cx] = '.'
  out[k] = [''.join(r) for r in rows]
json.dump(out, open(sys.argv[2], 'w'), indent=1)
for k in out: print(k); [print('%2d %s' % (i, r)) for i, r in enumerate(out[k])]
