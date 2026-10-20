# Slide the traced vessel's body onto the center line: the body (x 11 and right) moves left 6 px and is
# drawn over the inner end of the reaching arm, which stays put, so its hand and claws keep their place.
import json
P = json.load(open('xeno_trace.json'))
SPLIT, SHIFT = 11, 6
v = [list('.' * 32) for _ in range(32)]
for y, r in enumerate(P['vessel']):
  for x, c in enumerate(r):
    if x < SPLIT and c != '.': v[y][x] = c
for y, r in enumerate(P['vessel']):
  for x, c in enumerate(r):
    if x >= SPLIT and c != '.': v[y][x - SHIFT] = c
P['vessel'] = [''.join(r) for r in v]
json.dump(P, open('xeno_trace.json', 'w'), indent=1)
