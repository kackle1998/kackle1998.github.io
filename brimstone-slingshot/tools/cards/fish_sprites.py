import os
HERE = os.path.dirname(os.path.abspath(__file__))
# The Brimstone Tank's three cards (Prego, Carnivore, Zorf) drawn as 16x16 sprites from simple shapes,
# then outlined in ink. Carnivore's tail was then closed by hand at the sprite's edge (see js/data.js).
import math, json
ell = lambda x, y, cx, cy, rx, ry: ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
def seg(px, py, ax, ay, bx, by):
  dx, dy = bx - ax, by - ay; t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return math.hypot(px - ax - t * dx, py - ay - t * dy)
def paint(f):
  g = [[f(x + .5, y + .5) or '.' for x in range(16)] for y in range(16)]
  for y in range(16):
    for x in range(16):
      if g[y][x] == '.' and any(0 <= x + a < 16 and 0 <= y + b < 16 and g[y + b][x + a] not in '.#' for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))):
        g[y][x] = '#'
  return [''.join(r) for r in g]
def prego(x, y):  # a round yellow body, a spotted cap, one wide eye looking left, red lips, pink tail fins
  px, py = int(x), int(y)
  eye_r = ell(x, y, 5.5, 5, 2.7, 2.7)
  if eye_r: return '#' if (px, py) in ((4, 5), (4, 4)) else 'w'
  if ell(x, y, 5.5, 5, 3.4, 3.4) and y < 8: return '#'               # the eye's rim
  if ell(x, y, 1.6, 7.6, 1.5, 1.1): return '+'                        # lips
  if ell(x, y, 13.4, 12, 2, 2.6) or ell(x, y, 11.6, 14.6, 2.6, 1.2): return '+' if (px + py) % 3 else '#'   # tail fins
  head, body = ell(x, y, 9, 5, 4.6, 4.2), ell(x, y, 8, 10.6, 6, 4.8)
  if not (head or body): return None
  if head and x > 8.5 and y < 6.2: return 'w' if (px, py) in ((10, 2), (12, 4), (9, 4), (11, 6)) else '+'   # the spotted cap
  return '+' if (x - 8) * 0.6 + (y - 10) * 0.6 > 2.6 else '-'
def carnivore(x, y):  # a heavy piranha facing left: dark back, light belly, yellow eye, an underbite of teeth
  px, py = int(x), int(y)
  if (px, py) == (4, 6): return '#'                                    # pupil
  if ell(x, y, 4.6, 6.4, 1.4, 1.3): return 'w'                         # the yellow eye
  if py == 9 and 1 <= px <= 5: return '#'                              # the mouth
  if py == 10 and px in (2, 4): return 'w'                             # teeth
  body = ell(x, y, 7.6, 8, 6.6, 4.4)
  fin = seg(x, y, 8, 4, 11, 2.2) < 1.2                                 # the dorsal fin
  tail = seg(x, y, 13.4, 8, 15.2, 4.8) < 1.3 or seg(x, y, 13.4, 8, 15.2, 11.2) < 1.3
  belly_fin = seg(x, y, 8, 12, 7, 14) < 1
  if not (body or fin or tail or belly_fin): return None
  if fin or tail or belly_fin: return '+'
  return '+' if y < 7.8 else '-'                                       # dark back over a red (light) belly
def zorf(x, y):  # a green seahorse facing left: one big eye, a snout, a spiky pink crest, a curled tail
  px, py = int(x), int(y)
  if (px, py) in ((7, 4), (7, 5)): return '#'                          # pupil
  if ell(x, y, 7.8, 4.6, 1.7, 1.8): return 'w'
  snout = seg(x, y, 5.5, 5.2, 2, 5.8) < 1.1
  head = ell(x, y, 8.6, 4.6, 3.4, 3)
  body = seg(x, y, 9.2, 6.5, 9.8, 11) < 2.3
  tail = seg(x, y, 9.8, 11, 8.2, 14) < 1.5 or seg(x, y, 8.2, 14, 10.4, 15) < 1.1
  crest = any(seg(x, y, 11, cy, 13.4, cy - 1) < 0.9 for cy in (2.5, 5.5, 8.5)) or seg(x, y, 11.6, 2, 11.8, 10) < 1
  if not (snout or head or body or tail or crest): return None
  if crest and not (head or body): return '+'
  return '+' if x > 10.4 else '-'
out = {'prego': paint(prego), 'carnivore': paint(carnivore), 'zorf': paint(zorf)}
json.dump(out, open(os.path.join(HERE, 'fish_sprites.json'), 'w'), indent=1)
from PIL import Image
COL = {'#': (31, 36, 24), '+': (110, 122, 82), '-': (169, 180, 126), 'w': (238, 241, 214), '.': (205, 212, 164)}
S = 12; o = Image.new('RGB', (3 * (16 * S + 145) + 10, 16 * S + 10), (18, 22, 14)); X = 0
for i, k in ((28, 'prego'), (29, 'carnivore'), (30, 'zorf')):
  X += 0
  sp = Image.new('RGB', (16 * S, 16 * S)); px = sp.load()
  for yy, r in enumerate(out[k]):
    for xx, c in enumerate(r):
      for a in range(S):
        for b in range(S): px[xx * S + a, yy * S + b] = COL[c]
  o.paste(sp, (X, 5)); X += 16 * S + 10
o.save(os.path.join(HERE, 'fish_sprites.png'))
for k in out: print(k); [print('  ', r) for r in out[k]]
