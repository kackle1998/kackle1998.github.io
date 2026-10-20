import os
HERE = os.path.dirname(os.path.abspath(__file__))
P = lambda *p: os.path.join(HERE, *p)
# Find gaps in outlines: a colored pixel touching empty space above, below or beside it.
import json, sys
d = json.load(open(P('pieces', 'turn_all.json')))
def open_edges(art):
  at = lambda x, y: art[y][x] if 0 <= x < 32 and 0 <= y < 32 else '.'
  return [(x, y) for y in range(32) for x in range(32) if at(x, y) not in '.#'
          and any(at(x + a, y + b) == '.' for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
total = 0
for c in d:
  for k in d[c]:
    for f in d[c][k]:
      e = open_edges(d[c][k][f]['art'])
      if e: total += len(e); print(c, k, f, e)
print('total', total)
