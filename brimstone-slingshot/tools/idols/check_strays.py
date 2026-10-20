import os
HERE = os.path.dirname(os.path.abspath(__file__))
P = lambda *p: os.path.join(HERE, *p)
# Flag possible stray pixels in every idol frame and draw a review sheet with them marked:
#  spur: a pixel with at most one neighbor above, below, left or right (a dangling end)
#  orphan ink: an outline pixel with no colored (non-ink) pixel among its 8 neighbors
import json
from PIL import Image, ImageDraw
d = json.load(open(P('pieces', 'turn_all.json')))
COL = {'#': (31, 36, 24), '+': (110, 122, 82), '-': (169, 180, 126), 'w': (238, 241, 214), '.': (205, 212, 164)}
def flags(art):
  at = lambda x, y: art[y][x] if 0 <= x < 32 and 0 <= y < 32 else '.'
  out = {}
  for y in range(32):
    for x in range(32):
      c = at(x, y)
      if c == '.': continue
      n4 = sum(at(x + a, y + b) != '.' for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)))
      if n4 <= 1: out[(x, y)] = 'spur'
      elif c == '#' and not any(at(x + a, y + b) not in '.#' for a in (-1, 0, 1) for b in (-1, 0, 1)): out[(x, y)] = 'orphan'
  return out
S = 6; rows = []
for c in d:
  for k in d[c]:
    for f in d[c][k]:
      fl = flags(d[c][k][f]['art'])
      if fl: rows.append((c, k, f, fl))
print(len(rows), 'frames with flags')
for c, k, f, fl in rows: print(c, k, f, sorted(fl.items()))
# sheet: each flagged frame with its flags outlined in red
W = 6; H = (len(rows) + W - 1) // W
sheet = Image.new('RGB', (W * (32 * S + 8), H * (32 * S + 22)), (18, 22, 14)); dr = ImageDraw.Draw(sheet)
for i, (c, k, f, fl) in enumerate(rows):
  ox, oy = (i % W) * (32 * S + 8), (i // W) * (32 * S + 22)
  art = d[c][k][f]['art']
  for y in range(32):
    for x in range(32): dr.rectangle([ox + x * S, oy + y * S, ox + x * S + S - 1, oy + y * S + S - 1], fill=COL[art[y][x]])
  for (x, y) in fl: dr.rectangle([ox + x * S - 1, oy + y * S - 1, ox + x * S + S, oy + y * S + S], outline=(230, 30, 30), width=2)
  dr.text((ox + 2, oy + 32 * S + 4), f'{c} {k} {f}', fill=(220, 220, 200))
sheet.save(P('previews', 'strays_review.png'))
