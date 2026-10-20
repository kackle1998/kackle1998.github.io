# Turntable frames for the alien's pieces: left, 3/4 left, front, 3/4 right, right. The right-facing
# frames mirror the left-facing ones (anchors and face too), so only left, 3/4 and front are drawn.
# Each piece carries per-frame anchors, and frames are assembled with the same rules as the stills.
import json, math
from PIL import Image
A = json.load(open('xeno_mock.json'))
TURN = ['L', 'QL', 'F', 'QR', 'R']
def outline(g):  # ink edge around the shape, as on the traced art
  for y in range(32):
    for x in range(32):
      if g[y][x] == '.' and any(0 <= x + a < 32 and 0 <= y + b < 32 and g[y + b][x + a] not in '.#' for a, b in ((1,0),(-1,0),(0,1),(0,-1))):
        g[y][x] = '#'
  return g
def squash(rows, cx, s):  # narrow a piece around column cx: turning it a little toward or away from us
  g = [['.'] * 32 for _ in range(32)]
  for y in range(32):
    for x in range(32):
      sx = round(cx + (x - cx) / s)
      if 0 <= sx < 32: g[y][x] = rows[y][sx]
  return [''.join(r) for r in outline(g)]
mirror = lambda rows: [r[::-1] for r in rows]
def paint(f):  # a piece from a function (x, y) -> tone or None, then outlined
  g = [[f(x + .5, y + .5) or '.' for x in range(32)] for y in range(32)]
  return [''.join(r) for r in outline(g)]
ell = lambda x, y, cx, cy, rx, ry: ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
def front_head(x, y):
  # an egg-shaped dome, widest low down, over narrower jaws held open
  dome = ell(x, y, 16, 11, 8.5 + max(0, y - 6) * 0.12, 9.5)
  jaw = ell(x, y, 16, 20, 6.5, 6)
  if not (dome or jaw): return None
  if ell(x, y, 16, 20.5, 5, 4) and y > 16.5:                 # the open maw
    if 16.5 < y < 18.5 and int(x) % 2 == 0 and 11.5 < x < 20.5: return 'w'   # fangs
    if 22 < y < 24.5 and int(x) % 2 == 1 and 12 < x < 20: return 'w'       # lower teeth
    return '#'
  if dome and not ell(x, y, 16, 10.4, 8, 8.6) and y > 13: return '+'   # the dome's underside, in shadow over the jaws
  lit = (x - 16) * 0.8 + (y - 10) * 0.55
  if lit > 4: return '+'
  if (int(x) * 7 + int(y) * 3) % 11 == 0 and lit > -2: return '+'      # the head's stipple
  return '-'
def front_tail(x, y):
  if y < 2 or y > 30: return None
  t = (y - 2) / 28; hw = 4.2 * (1 - t) ** 0.8 + 0.3; cx = 16 - 1.5 * t * t
  if abs(x - cx) > hw: return None
  return 'w' if abs(x - (cx - hw * 0.35)) < 0.5 and 5 < y < 20 else '-' if x < cx + hw * 0.3 else '+'
def front_body(rows):  # symmetric: the far shoulder and arm mirrored onto the near side
  return [r[16:][::-1] + r[16:] for r in rows]
F = {'mask': {}, 'vessel': {}, 'pedestal': {}}
F['mask']['L'] = A['mask'];      F['mask']['QL'] = squash(A['mask'], 17, 0.82); F['mask']['F'] = paint(front_head)
F['vessel']['QL'] = A['vessel']; F['vessel']['L'] = squash(A['vessel'], 16, 0.72); F['vessel']['F'] = front_body(A['vessel'])
F['pedestal']['L'] = A['pedestal']; F['pedestal']['QL'] = squash(A['pedestal'], 17, 0.6); F['pedestal']['F'] = paint(front_tail)
ANC = {  # per facing; the right-facing ones are mirrored below
  'mask':     {'L': {'neck': (17, 22), 'face': (3, 8, 16, 27)}, 'QL': {'neck': (17, 22), 'face': (5, 8, 17, 27)}, 'F': {'neck': (16, 23), 'face': (9, 15, 23, 26)}},
  'vessel':   {'L': {'neck': (15, 6), 'waist': (16, 24)}, 'QL': {'neck': (15, 6), 'waist': (16, 24)}, 'F': {'neck': (16, 6), 'waist': (16, 24)}},
  'pedestal': {'L': {'waist': (17, 4)}, 'QL': {'waist': (17, 4)}, 'F': {'waist': (16, 3)}},
}
for k in F:
  for src, dst in (('L', 'R'), ('QL', 'QR')):
    F[k][dst] = mirror(F[k][src])
    a = {}
    for n, v in ANC[k][src].items():
      a[n] = (31 - v[0], v[1]) if len(v) == 2 else (31 - v[2], v[1], 31 - v[0], v[3])
    ANC[k][dst] = a
json.dump({'art': F, 'anchors': {k: {f: {n: list(v) for n, v in d.items()} for f, d in ANC[k].items()} for k in ANC}}, open('xeno_turn.json', 'w'), indent=1)
# Assemble one facing (all pieces turned together), by the anchor rules.
def compose(f):
  C = [['.'] * 80 for _ in range(96)]; VX, VY = 24, 32
  at = {'vessel': (VX, VY),
        'mask': (VX + ANC['vessel'][f]['neck'][0] - ANC['mask'][f]['neck'][0], VY + ANC['vessel'][f]['neck'][1] - ANC['mask'][f]['neck'][1]),
        'pedestal': (VX + ANC['vessel'][f]['waist'][0] - ANC['pedestal'][f]['waist'][0], VY + ANC['vessel'][f]['waist'][1] - ANC['pedestal'][f]['waist'][1])}
  for k in ('pedestal', 'vessel', 'mask'):
    for y, r in enumerate(F[k][f]):
      for x, c in enumerate(r):
        if c != '.': C[at[k][1] + y][at[k][0] + x] = c
  return C
COL = {'#': (31, 36, 24), '+': (110, 122, 82), '-': (169, 180, 126), 'w': (238, 241, 214), '.': (205, 212, 164)}
def img(g, s):
  im = Image.new('RGB', (len(g[0]) * s, len(g) * s)); px = im.load()
  for y, r in enumerate(g):
    for x, c in enumerate(r):
      for a in range(s):
        for b in range(s): px[x * s + a, y * s + b] = COL[c]
  return im
# A sheet: each piece's five facings, then the assembled alien in each.
S = 5; sheet = Image.new('RGB', (5 * 32 * S + 6 * 8, 3 * 32 * S + 96 * 3 + 5 * 8), (18, 22, 14))
for i, k in enumerate(('mask', 'vessel', 'pedestal')):
  for j, f in enumerate(TURN): sheet.paste(img(F[k][f], S), (8 + j * (32 * S + 8), 8 + i * (32 * S + 8)))
for j, f in enumerate(TURN): sheet.paste(img(compose(f), 2).crop((16 * 2, 8 * 2, 64 * 2, 96 * 2)), (8 + j * (32 * S + 8) + 16, 3 * (32 * S + 8) + 8))
sheet.save('xeno_turn_sheet.png')
# The animation: left to right and back, about 5 frames a second.
seq = TURN + TURN[-2:0:-1]
frames = [img(compose(f), 4).crop((16 * 4, 8 * 4, 64 * 4, 96 * 4)) for f in seq]
frames[0].save('xeno_turn.gif', save_all=True, append_images=frames[1:], duration=200, loop=0)
