# Turn frames for every creature's pieces: L (left), QL (three-quarter left) and F (front), each
# with its anchors. QR and R are mirrors, made by the game (js/idol.js). A frame is either a
# creature's own art, its art narrowed (turning), half of it mirrored (front), or drawn new.
import json, math
from PIL import Image
OUT = '.'
def outline(g):
  for y in range(32):
    for x in range(32):
      if g[y][x] == '.' and any(0 <= x + a < 32 and 0 <= y + b < 32 and g[y + b][x + a] not in '.#' for a, b in ((1,0),(-1,0),(0,1),(0,-1))):
        g[y][x] = '#'
  return g
rows = lambda g: [''.join(r) for r in g]
def squash(art, cx, s):
  g = [['.'] * 32 for _ in range(32)]
  for y in range(32):
    for x in range(32):
      sx = round(cx + (x - cx) / s)
      if 0 <= sx < 32: g[y][x] = art[y][sx]
  return rows(outline(g))
def sq_pt(v, cx, s): return [round(cx + (v[0] - cx) * s), v[1]]
def sq_anchors(a, cx, s):
  out = {}
  for k, v in a.items():
    if k == 'front': out[k] = [[round(cx + (r[0] - cx) * s), r[1], round(cx + (r[2] - cx) * s), r[3]] for r in v]
    elif len(v) == 4: out[k] = [round(cx + (v[0] - cx) * s), v[1], round(cx + (v[2] - cx) * s), v[3]]
    else: out[k] = sq_pt(v, cx, s)
  return out
def sym(art, keep='right', c=16):  # a front from one half (split at column c), mirrored, centered on the 32 grid
  out = []
  for r in art:
    half = (r[c:][::-1] if keep == 'right' else r[:c])[-16:]
    out.append(('.' * (16 - len(half)) + half + half[::-1] + '.' * 16)[:32])
  return out
def paint(f):
  g = [[f(x + .5, y + .5) or '.' for x in range(32)] for y in range(32)]
  return rows(outline(g))
ell = lambda x, y, cx, cy, rx, ry: ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1
def seg(px, py, ax, ay, bx, by):
  dx, dy = bx - ax, by - ay; t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return math.hypot(px - ax - t * dx, py - ay - t * dy)
lit = lambda x, y, cx, cy, k=4: '+' if (x - cx) * 0.8 + (y - cy) * 0.6 > k else '-'   # lit from the upper left

# ---------- drawn frames ----------
def alien_front_head(x, y):
  dome = ell(x, y, 16, 11, 8.5 + max(0, y - 6) * 0.12, 9.5); jaw = ell(x, y, 16, 20, 6.5, 6)
  if not (dome or jaw): return None
  if ell(x, y, 16, 18.5, 5, 4) and y > 14.5:                       # the jaws, level with the side view's teeth
    if 14.5 < y < 16.5 and int(x) % 2 == 0 and 11.5 < x < 20.5: return 'w'
    if 20 < y < 22.5 and int(x) % 2 == 1 and 12 < x < 20: return 'w'
    return '#'
  if dome and not ell(x, y, 16, 10.4, 8, 8.6) and y > 12 and not ell(x, y, 16, 18.5, 5.8, 4.8): return '+'
  if (int(x) * 7 + int(y) * 3) % 11 == 0 and (x - 16) * 0.8 + (y - 10) * 0.55 > -2: return '+'
  return lit(x, y, 16, 10)
def alien_front_tail(x, y):
  if y < 2 or y > 30: return None
  t = (y - 2) / 28; hw = 4.2 * (1 - t) ** 0.8 + 0.3; cx = 16 - 1.5 * t * t
  if abs(x - cx) > hw: return None
  return 'w' if abs(x - (cx - hw * 0.35)) < 0.5 and 5 < y < 20 else '-' if x < cx + hw * 0.3 else '+'

def lion_front_head(x, y):
  a = math.atan2(y - 15, x - 16); r = math.hypot(x - 16, y - 15)
  mane_r = 11.5 + 2.6 * math.sin(9 * a + 0.6)                    # the mane's spiky edge
  face = ell(x, y, 16, 15, 6.5, 8)
  if not face and r > mane_r: return None
  if not face:                                                    # mane: streaks along the spikes
    return '#' if math.sin(9 * a + 0.6) > 0.82 and r > 8 else '+'
  # the face: angry eyes, nose, a roaring mouth with two fangs
  px, py = int(x), int(y)
  if (px, py) in ((11, 10), (12, 10), (13, 11), (20, 10), (19, 10), (18, 11)): return '#'   # brows slanting to the nose, level with the side view's eye
  if (px, py) in ((12, 11), (19, 11)): return 'w'                                         # the glint of each eye
  if (px, py) in ((15, 17), (16, 17)): return '#'                                         # nose
  if ell(x, y, 16, 20.5, 3.2, 2.2):
    return 'w' if (px, py) in ((14, 19), (17, 19)) else '#'
  return '-' if x < 18 or y < 14 else '+'
def lion_front_body(x, y):
  # a deep rounded chest between two forelegs set apart, as the lion stands facing you
  chest = ell(x, y, 16, 9.5, 8, 7.5)
  left, right = seg(x, y, 11, 10, 9.5, 25) < 2.9, seg(x, y, 21, 10, 22.5, 25) < 2.9
  paws = ell(x, y, 9.5, 26.5, 3.4, 1.9) or ell(x, y, 22.5, 26.5, 3.4, 1.9)
  if not (chest or left or right or paws): return None
  px, py = int(x), int(y)
  if chest and not (left or right):
    if py >= 12 and px == 16: return '+'                           # the line down the chest
    return '+' if (x - 16) * 0.7 + (y - 8) * 0.7 > 3.5 else '-'
  if left or (paws and x < 16): return '+' if x > 11.2 and y > 12 else '-'   # each leg lit on its left
  return '+' if x > 22.5 else '-'
def lion_front_body_claws(art):  # claws hang a row below the paws
  g = [list(r) for r in art]
  for x in (7, 9, 11, 21, 23, 25):
    g[28][x] = 'w'; g[29][x] = '#'
  return rows(g)
def lion_front_tail(x, y):
  # seen from the front, the tail swings out from behind the body and up, its flame of a tuft on top
  t = None
  for i in range(41):
    u = i / 40; cx, cy = 16 + 11 * u, 15 - 9 * u * u                # a curve rising to the right
    if math.hypot(x - cx, y - cy) < 2.2 - 0.9 * u: t = u; break
  tuft = ell(x, y, 27, 4.5, 3.3, 4.3) and not (y < 3 and abs(x - 27) > 1.2)
  if t is None and not tuft: return None
  if t is None: return '#' if (int(x) * 2 + int(y)) % 5 == 0 else '+'     # the red tuft, in flame streaks
  return '-' if t < 0.5 else '+'

def golem_front_head(x, y):
  if not ell(x, y, 16, 15.5, 11, 10.5): return None
  if ell(x, y, 16, 14, 3.6, 3.1):                                  # the one big eye, level with the side view's
    return '#' if int(x) in (16, 17) and int(y) in (14, 15) else 'w'   # a square pupil
  px, py = int(x), int(y)
  if 9 <= px <= 22 and 19 <= py <= 23:                              # the zigzag mouth, two pixels thick
    z = 19 + abs((px - 9) % 4 - 2)
    if z <= py <= z + 1: return '#'
  if (px * 5 + py * 3) % 13 == 0: return '+'
  return lit(x, y, 16, 14, 5)

def golem_front_legs(x, y):
  # the side view's crouching stride seen head on: both legs drop from the hips with bent knees; the
  # forward leg's foot is lower and bigger (nearer you), the back leg's higher and smaller
  hips = ell(x, y, 16, 7.5, 8, 3.6)
  nk, fk = ell(x, y, 10.5, 16.5, 3.4, 2.8), ell(x, y, 21.5, 14.5, 3.1, 2.5)          # knees, lit from the front
  near = seg(x, y, 12, 8.5, 10.5, 16.5) < 3.1 or seg(x, y, 10.5, 16.5, 11, 24) < 2.4 or nk
  far = seg(x, y, 20, 8.5, 21.5, 14.5) < 2.9 or seg(x, y, 21.5, 14.5, 21, 21) < 2.2 or fk
  nfoot, ffoot = ell(x, y, 11, 25.5, 4.4, 2.3), ell(x, y, 21, 22.3, 3.6, 1.9)
  if not (hips or near or far or nfoot or ffoot): return None
  px, py = int(x), int(y)
  if (px * 5 + py * 3) % 13 == 0 and not (nk or fk): return '+'    # the golem's stipple
  if nk or fk: return '-'
  if nfoot or near: return '+' if x > 12.4 or (nfoot and y > 26.6) else '-'
  if ffoot or far: return '+' if x > 22.2 or ffoot else '-'          # the back leg, further from the light
  return '+' if (x - 16) * 0.8 + (y - 7) * 0.6 > 3 else '-'
def robot_side_head(x, y):  # the box from the side, about as deep as the face is wide: one eye and the teeth on its front edge
  if not (5 <= x < 27 and 5 <= y < 27): return None
  px, py = int(x), int(y)
  if ell(x, y, 5.5, 12.5, 2.6, 3.2): return 'w'
  if 5 <= px <= 7 and 20 <= py <= 23: return 'w' if (px + py) % 2 == 0 else '#'
  if px == 5 or py in (5, 26) or px == 26: return '+'
  if px in (12, 19) and 8 <= py <= 23: return '+'                  # panel seams down the side
  return '-' if px < 22 else '+'
def robot_qhead(front):  # three-quarter: the face narrowed, the box's side showing on the right
  g = [list(r) for r in squash(front, 3, 0.8)]
  for y in range(5, 27):
    for x in range(24, 29):
      g[y][x] = '+' if 6 <= y <= 25 and 24 <= x <= 27 else '#'
  return rows(outline([[c if c != '#' or True else c for c in r] for r in g]))
def robot_front_base(spine):
  # head on: the left and right treads, each a solid ink outline with rounded corners round
  # alternating tread rows, the axle between them, and the coiled post on top
  g = [['.'] * 32 for _ in range(32)]
  for x0 in (3, 22):                                               # tread x0..x0+6 inside, outline one wider
    for y in range(13, 26):
      for x in range(x0 - 1, x0 + 8):
        edge = x in (x0 - 1, x0 + 7) or y in (13, 25)
        corner = x in (x0 - 1, x0 + 7) and y in (13, 25)
        if not corner: g[y][x] = '#' if edge else ('+' if y % 2 else '#')
  for y in (17, 18, 19, 20):                                       # the axle and its housing
    for x in range(11, 21): g[y][x] = '#' if y in (17, 20) else ('-' if y == 18 else '+')
  for i, y in enumerate(range(2, 17)):                             # the same coiled post as the side view
    for j, c in enumerate(spine[i % 4]):
      if c != '.': g[y][11 + j] = c
  return rows(g)
def robot_turn_body(v, k, near):
  """The robot's body turned: k is how far the arms have swung in (1 facing you, about 0.3 side on),
  `near` the arm toward you ('gun', the raised hand on screen-left in the front view, or 'hook').
  Columns 0-10 are the raised arm, 11-19 the spine, 20-31 the hooked arm."""
  d = round(10 * (1 - k))
  layer = lambda x0, x1, dx: [(x + dx, y, v[y][x]) for y in range(32) for x in range(x0, x1 + 1) if v[y][x] != '.']
  gun, spine, hook = layer(0, 10, d), layer(11, 19, 0), layer(20, 31, -d)
  g = [['.'] * 32 for _ in range(32)]
  for part in ((hook, spine, gun) if near == 'gun' else (gun, spine, hook)):
    for x, y, c in part:
      if 0 <= x < 32: g[y][x] = c
  return rows(g)

def layered_turn(v, cx, left_arm, right_arm, k, near):
  """A lopsided body turned without mirroring, so each arm keeps its pose and its side: the torso
  (everything that isn't an arm) narrows around column cx, each arm slides toward the middle, and the
  arm toward you is drawn in front. k is 1 facing you and about 0.3 side on; near is 'left' or 'right'
  (screen side: facing left, the screen-right arm comes toward you)."""
  ts = 0.6 + 0.4 * k
  arm = lambda f: [(x, y, v[y][x]) for y in range(32) for x in range(32) if v[y][x] != '.' and f(x, y)]
  la, ra = arm(left_arm), arm(right_arm)
  def slide(px):
    if not px: return px
    c = (min(p[0] for p in px) + max(p[0] for p in px)) / 2; d = round((cx - c) * (1 - k))
    return [(x + d, y, ch) for x, y, ch in px]
  torso = [['.'] * 32 for _ in range(32)]
  for y in range(32):
    for x in range(32):
      sx = round(cx + (x - cx) / ts)
      if 0 <= sx < 32 and not left_arm(sx, y) and not right_arm(sx, y): torso[y][x] = v[y][sx]
  g = [['.'] * 32 for _ in range(32)]
  far, close = (slide(la), slide(ra)) if near == 'right' else (slide(ra), slide(la))
  for x, y, ch in far:
    if 0 <= x < 32: g[y][x] = ch
  for y in range(32):
    for x in range(32):
      if torso[y][x] != '.': g[y][x] = torso[y][x]
  for x, y, ch in close:
    if 0 <= x < 32: g[y][x] = ch
  return rows(outline(g))
def layered_frames(v, cx, left_arm, right_arm, anchors):
  """All five facings of a lopsided body from its front art, anchors narrowed with the torso."""
  out = {'F': (v, anchors)}
  for f, k, near in (('QL', 0.7, 'right'), ('L', 0.3, 'right'), ('QR', 0.7, 'left'), ('R', 0.3, 'left')):
    ts = 0.6 + 0.4 * k
    out[f] = (layered_turn(v, cx, left_arm, right_arm, k, near), sq_anchors(anchors, cx, ts))
  return out

# ---------- the creatures ----------
L = lambda p: json.load(open(p))
alien, lion, robot, golem = L('xeno_mock.json'), L('lion_mock.json'), L('robot_mock.json'), L('golem_mock.json')
SPINE = [robot['vessel'][y][11:20] for y in (20, 21, 22, 23)]
SETS = {
  'alien': {
    'mask': {'L': (alien['mask'], {'neck': [17, 22], 'face': [3, 8, 16, 27]}),
             'QL': (squash(alien['mask'], 17, 0.92), sq_anchors({'neck': [17, 22], 'face': [3, 8, 16, 27]}, 17, 0.92)),
             'F': (paint(alien_front_head), {'neck': [16, 23], 'face': [9, 15, 23, 26]})},
    # lopsided (one arm reaches, one hangs): turned in layers, not mirrored, so the arms keep their sides
    'vessel': layered_frames(alien['vessel'], 16, lambda x, y: x <= 9 and y >= 14, lambda x, y: x >= 21 and y >= 14,
                             {'neck': [15, 6], 'waist': [16, 24]}),
    'pedestal': {'L': (alien['pedestal'], {'waist': [17, 4]}),
                 'QL': (squash(alien['pedestal'], 17, 0.6), {'waist': [17, 4]}),
                 'F': (paint(alien_front_tail), {'waist': [16, 3]})},
  },
  'lion': {
    'mask': {'L': (lion['mask'], {'neck': [15, 21], 'face': [2, 7, 15, 25]}),
             'QL': (squash(lion['mask'], 15, 0.96), sq_anchors({'neck': [15, 21], 'face': [2, 7, 15, 25]}, 15, 0.96)),
             'F': (paint(lion_front_head), {'neck': [16, 25], 'face': [9, 10, 23, 25]})},
    'vessel': {'L': (lion['vessel'], {'neck': [9, 9], 'waist': [23, 19]}),
               'QL': (squash(lion['vessel'], 14, 0.94), sq_anchors({'neck': [9, 9], 'waist': [23, 19]}, 14, 0.94)),
               'F': (sym(lion['vessel'], 'left', 14), {'neck': [16, 6], 'waist': [16, 13]})},
    'pedestal': {'L': (lion['pedestal'], {'waist': [4, 9]}),
                 'QL': (squash(lion['pedestal'], 4, 0.7), {'waist': [4, 9]}),
                 'F': (squash(lion['pedestal'], 4, 0.35), {'waist': [4, 9]})},
  },
  'robot': {
    'mask': {'F': (robot['mask'], {'neck': [16, 25], 'face': [3, 5, 28, 26]}),
             'QL': (robot_qhead(robot['mask']), {'neck': [15, 25], 'face': [3, 5, 23, 26]}),
             'L': (paint(robot_side_head), {'neck': [16, 25], 'face': [3, 8, 9, 24]})},
    # Not mirrored: the arms differ, so turning right brings the raised gun-hand in front, turning left the hook.
    'vessel': {'F': (robot['vessel'], {'neck': [16, 10], 'waist': [15, 25], 'front': [[0, 9, 11, 28]]}),
               'QL': (robot_turn_body(robot['vessel'], 0.7, 'hook'), {'neck': [16, 10], 'waist': [15, 25]}),
               'L': (robot_turn_body(robot['vessel'], 0.3, 'hook'), {'neck': [16, 10], 'waist': [15, 25]}),
               'QR': (robot_turn_body(robot['vessel'], 0.7, 'gun'), {'neck': [16, 10], 'waist': [15, 25], 'front': [[3, 9, 14, 28]]}),
               'R': (robot_turn_body(robot['vessel'], 0.3, 'gun'), {'neck': [16, 10], 'waist': [15, 25], 'front': [[7, 9, 18, 28]]})},
    'pedestal': {'L': (robot['pedestal'], {'waist': [15, 3]}),
                 'QL': (squash(robot['pedestal'], 15, 0.87), {'waist': [15, 3]}),
                 'F': (robot_front_base(SPINE), {'waist': [15, 3]})},
  },
  'golem': {
    'mask': {'L': (golem['mask'], {'neck': [18, 24], 'face': [4, 9, 17, 25]}),
             'QL': (squash(golem['mask'], 18, 0.97), sq_anchors({'neck': [18, 24], 'face': [4, 9, 17, 25]}, 18, 0.97)),
             'F': (paint(golem_front_head), {'neck': [16, 25], 'face': [7, 7, 25, 24]})},
    'vessel': layered_frames(golem['vessel'], 17, lambda x, y: x <= 10 and y >= 13, lambda x, y: x >= 21 and y >= 13,
                             {'neck': [14, 3], 'waist': [18, 16]}),
    'pedestal': {'QL': (golem['pedestal'], {'waist': [15, 5]}),
                 'L': (squash(golem['pedestal'], 15, 0.75), {'waist': [15, 5]}),
                 'F': (paint(golem_front_legs), {'waist': [16, 5]})},
  },
}
NATIVE = {'alien': ('L', 'F', 'L'), 'lion': ('L', 'L', 'L'), 'robot': ('F', 'F', 'L'), 'golem': ('L', 'F', 'QL')}
def span(art):
  ys = [y for y, r in enumerate(art) if set(r) != {'.'}]; return ys[0], ys[-1]
def fit_rows(art, an, y0, y1):  # stretch a frame vertically onto rows y0..y1, moving its anchors too
  s0, s1 = span(art)
  if (s0, s1) == (y0, y1): return art, an
  k = (s1 - s0) / max(1, y1 - y0)
  out = ['.' * 32] * 32
  for y in range(y0, y1 + 1): out[y] = art[round(s0 + (y - y0) * k)]
  my = lambda v: round(y0 + (v - s0) * (y1 - y0) / max(1, s1 - s0))
  na = {}
  for n, v in an.items():
    if n == 'front': na[n] = [[r[0], my(r[1]), r[2], my(r[3])] for r in v]
    elif len(v) == 4: na[n] = [v[0], my(v[1]), v[2], my(v[3])]
    else: na[n] = [v[0], my(v[1])]
  return out, na
for c, sset in SETS.items():
  for i, k in enumerate(('mask', 'vessel', 'pedestal')):
    y0, y1 = span(sset[k][NATIVE[c][i]][0])
    for f in list(sset[k]): sset[k][f] = fit_rows(*sset[k][f], y0, y1)
    # An anchor sits at the same height in every facing (only its x moves as the piece turns), so the
    # pieces it joins never bob up or down mid-turn.
    nat = sset[k][NATIVE[c][i]][1]
    for f in sset[k]:
      for n in ('neck', 'waist'):
        if n in sset[k][f][1]: sset[k][f][1][n] = [sset[k][f][1][n][0], nat[n][1]]
# Last, clear stray ink: an ink pixel hanging off other ink (at most one neighbor above, below or beside
# it, and no colored pixel around it), repeated so a two-pixel stub goes too. An outline capping a tip
# stays, and so does the robot's coil (spine and post, columns 11-19), whose ridged edge alternates on purpose.
def despur(art, keep=lambda x, y: False):
  g = [list(r) for r in art]
  at = lambda x, y: g[y][x] if 0 <= x < 32 and 0 <= y < 32 else '.'
  for _ in range(4):
    # a stray hangs off ink alone: at most one neighbor above, below or beside it, and no colored pixel
    # anywhere around it. Ink that caps a tip (a tail's end, a claw) touches the color it closes, so it stays.
    gone = [(x, y) for y in range(32) for x in range(32) if g[y][x] == '#' and not keep(x, y)
            and sum(at(x + a, y + b) != '.' for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))) <= 1
            and not any(at(x + a, y + b) not in '.#' for a in (-1, 0, 1) for b in (-1, 0, 1))]
    if not gone: break
    for x, y in gone: g[y][x] = '.'
  return rows(g)
COIL = lambda x, y: 11 <= x <= 19
for c, sset in SETS.items():
  for k in sset:
    keep = COIL if c == 'robot' and k in ('vessel', 'pedestal') else (lambda x, y: False)
    # then close any gap in the outline (narrowing a frame can drop outline pixels): every colored pixel
    # touching empty space gets its ink
    for f in sset[k]: sset[k][f] = (rows(outline([list(r) for r in despur(sset[k][f][0], keep)])), sset[k][f][1])
data = {c: {k: {f: {'art': a, 'anchors': an} for f, (a, an) in fr.items()} for k, fr in s.items()} for c, s in SETS.items()}
json.dump(data, open('turn_all.json', 'w'), indent=1)

# ---------- previews ----------
TURN = ['L', 'QL', 'F', 'QR', 'R']
def frame(c, k, f):
  if f in data[c][k]: return data[c][k][f]
  src = data[c][k]['L' if f == 'R' else 'QL']; an = {}
  for n, v in src['anchors'].items():
    if n == 'front': an[n] = [[31 - r[2], r[1], 31 - r[0], r[3]] for r in v]
    elif len(v) == 4: an[n] = [31 - v[2], v[1], 31 - v[0], v[3]]
    else: an[n] = [31 - v[0], v[1]]
  return {'art': [r[::-1] for r in src['art']], 'anchors': an}
def compose(parts, f):
  m, v, p = frame(parts[0], 'mask', f), frame(parts[1], 'vessel', f), frame(parts[2], 'pedestal', f)
  VX, VY = 24, 32; C = [['.'] * 80 for _ in range(96)]
  at = {'v': (VX, VY), 'm': (VX + v['anchors']['neck'][0] - m['anchors']['neck'][0], VY + v['anchors']['neck'][1] - m['anchors']['neck'][1]),
        'p': (VX + v['anchors']['waist'][0] - p['anchors']['waist'][0], VY + v['anchors']['waist'][1] - p['anchors']['waist'][1])}
  def draw(piece, o, keep=lambda x, y: True):
    for y, r in enumerate(piece['art']):
      for x, ch in enumerate(r):
        if ch != '.' and keep(x, y) and 0 <= o[1] + y < 96 and 0 <= o[0] + x < 80: C[o[1] + y][o[0] + x] = ch
  fr = v['anchors'].get('front', []); fx0, fy0, fx1, fy1 = m['anchors'].get('face', [0, 0, -1, -1])
  def keep(x, y):
    if not any(r[0] <= x <= r[2] and r[1] <= y <= r[3] for r in fr): return False
    mx, my = VX + x - at['m'][0], VY + y - at['m'][1]
    return not (fx0 <= mx <= fx1 and fy0 <= my <= fy1 and 0 <= my < 32 and 0 <= mx < 32 and m['art'][my][mx] != '.')
  draw(p, at['p']); draw(v, at['v']); draw(m, at['m']); draw(v, at['v'], keep)
  return C
COL = {'#': (31, 36, 24), '+': (110, 122, 82), '-': (169, 180, 126), 'w': (238, 241, 214), '.': (205, 212, 164)}
def img(g, s):
  im = Image.new('RGB', (len(g[0]) * s, len(g) * s)); px = im.load()
  for y, r in enumerate(g):
    for x, ch in enumerate(r):
      for a in range(s):
        for b in range(s): px[x * s + a, y * s + b] = COL[ch]
  return im
if __name__ == '__main__':
  import sys
  for c in sys.argv[1:] or SETS:
    S = 4; sheet = Image.new('RGB', (5 * (32 * S + 6) + 6, 3 * (32 * S + 6) + 88 * 2 + 12), (18, 22, 14))
    for i, k in enumerate(('mask', 'vessel', 'pedestal')):
      for j, f in enumerate(TURN): sheet.paste(img(frame(c, k, f)['art'], S), (6 + j * (32 * S + 6), 6 + i * (32 * S + 6)))
    for j, f in enumerate(TURN): sheet.paste(img(compose((c, c, c), f), 2).crop((16, 8 * 2, 144, 96 * 2)), (6 + j * (32 * S + 6), 3 * (32 * S + 6) + 6))
    sheet.save(f'turn_{c}.png')
    seq = TURN + TURN[-2:0:-1]
    fr = [img(compose((c, c, c), f), 4).crop((8 * 4, 8 * 4, 72 * 4, 96 * 4)) for f in seq]
    fr[0].save(f'turn_{c}.gif', save_all=True, append_images=fr[1:], duration=200, loop=0)
