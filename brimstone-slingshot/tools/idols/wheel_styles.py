import os
HERE = os.path.dirname(os.path.abspath(__file__))
P = lambda *p: os.path.join(HERE, *p)
# Three ways to draw the robot base's wheels, over the traced chassis.
import json, math
R = json.load(open(P('pieces', 'robot.json'))); base = [list(r) for r in R['pedestal']]
WHEELS = [(6, 19), (24, 19)]; R = 5.6
def wheel(g, cx, cy, style):
  for y in range(32):
    for x in range(32):
      dx, dy = x + .5 - cx - .5, y + .5 - cy - .5; d = math.hypot(dx, dy)
      if d > R + 1: continue
      a = math.atan2(dy, dx)
      if d > R: c = '#'                                               # ink rim
      elif style == 'A':                                              # dark tire, bright hub
        c = '+' if d > 3 else '#' if d > 2 else 'w' if d < 1.2 else '-'
      elif style == 'B':                                              # chunky tread, light hub, lit top-left
        c = ('#' if int((a + math.pi) / (math.pi / 5)) % 2 else '+') if d > 3.6 else '#' if d > 2.6 else '-' if dx + dy < 0 else '+'
        if d < 1: c = '#'
      else:                                                           # pale tire, dark spoked hub
        c = '-' if d > 3.4 else '#' if d > 2.6 or abs(dx) < .6 or abs(dy) < .6 else '+'
        if d > 3.4 and dx + dy > 2: c = '+'
      g[y][x] = c
out = {}
for s in 'ABC':
  g = [r[:] for r in base]
  for x in range(32):                                                 # clear the old tires
    for y in range(12, 26):
      if any(math.hypot(x - cx, y - cy) < R + 1.5 for cx, cy in WHEELS): g[y][x] = '.'
  for cx, cy in WHEELS: wheel(g, cx, cy, s)
  out[s] = [''.join(r) for r in g]
json.dump(out, open(P('previews', 'wheel_styles.json'), 'w'), indent=1)
