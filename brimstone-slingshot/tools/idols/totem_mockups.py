import os
HERE = os.path.dirname(os.path.abspath(__file__))
P = lambda *p: os.path.join(HERE, *p)
# Three looks for the same idol, side by side: A as it is, B carved (one material, collars, plinth),
# C totem blocks (equal stacked blocks: face relief, carved torso, sigil cut into the base).
import json
exec(open(P('turn.py')).read().split("if __name__ == '__main__':")[0])
from PIL import Image
SIG = {'thorns': ['...#...', '.#.#.#.', '..###..', '#######', '..###..', '.#.#.#.', '...#...'],
       'haste': ['#..#...', '.#..#..', '..#..#.', '...#..#', '..#..#.', '.#..#..', '#..#...'],
       'leech': ['...#...', '..###..', '.#####.', '####.##', '###.###', '.#####.', '..###..']}
grain = lambda x, y: '+' if (y + x // 7) % 4 == 0 else '-'
def joins(parts, f):
  m, v, p = frame(parts[0], 'mask', f), frame(parts[1], 'vessel', f), frame(parts[2], 'pedestal', f)
  return 32 + v['anchors']['neck'][1], 32 + v['anchors']['waist'][1]
def carved(parts, f='F'):
  C = compose(parts, f); H, W = len(C), len(C[0])
  mf = frame(parts[0], 'mask', f); fx0, fy0, fx1, fy1 = mf['anchors']['face']
  mo = (24 + frame(parts[1], 'vessel', f)['anchors']['neck'][0] - mf['anchors']['neck'][0], 32 + frame(parts[1], 'vessel', f)['anchors']['neck'][1] - mf['anchors']['neck'][1])
  out = [['.'] * W for _ in range(H)]
  for y in range(H):
    for x in range(W):
      c = C[y][x]
      if c == '.': continue
      inface = fx0 <= x - mo[0] <= fx1 and fy0 <= y - mo[1] <= fy1
      if c == '#': out[y][x] = '#'
      elif c == 'w': out[y][x] = 'w' if inface else '-'
      else: out[y][x] = '+' if x + 1 < W and C[y][x + 1] == '#' or c == '+' and (x + y) % 2 == 0 else grain(x, y)
  ys = [y for y in range(H) if any(ch != '.' for ch in out[y])]; xs = [x for r in out for x, ch in enumerate(r) if ch != '.']
  cx = (min(xs) + max(xs)) // 2
  for jy in joins(parts, f):                                    # a carved collar at each seam
    row = [x for x in range(W) if out[jy][x] != '.'] or [cx]
    a, b = max(min(row) - 1, cx - 9), min(max(row) + 1, cx + 9)
    for x in range(a, b + 1):
      out[jy - 1][x] = '#'; out[jy][x] = '-' if x < b - 2 else '+'; out[jy + 1][x] = '#'
    out[jy][a] = out[jy][b] = '#'
  by = ys[-1] + 1                                               # the plinth it stands on
  for y in range(by, by + 4):
    for x in range(cx - 13, cx + 14): out[y][x] = '#' if y in (by, by + 3) or x in (cx - 13, cx + 13) else ('-' if y == by + 1 else '+')
  return out
def blocks(parts, sigil='thorns', f='F'):
  BW, BH = 24, 24; W, H = 32, 3 * BH + 10; out = [['.'] * W for _ in range(H)]
  x0 = (W - BW) // 2
  def block(y0, cap=False):
    for y in range(y0, y0 + BH):
      for x in range(x0, x0 + BW):
        edge = x in (x0, x0 + BW - 1) or y in (y0, y0 + BH - 1)
        out[y][x] = '#' if edge else ('+' if x >= x0 + BW - 3 else grain(x, y))
  def relief(art, y0, size=20):                                  # a piece shrunk into a carved relief
    ys = [y for y, r in enumerate(art) if set(r) != {'.'}]; xs = [x for r in art for x, ch in enumerate(r) if ch != '.']
    ax0, ay0, aw, ah = min(xs), min(ys), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
    k = max(aw, ah) / size; ox = x0 + (BW - round(aw / k)) // 2; oy = y0 + (BH - round(ah / k)) // 2
    for y in range(round(ah / k)):
      for x in range(round(aw / k)):
        c = art[ay0 + int(y * k)][ax0 + int(x * k)]
        if c == '.': continue
        out[oy + y][ox + x] = '#' if c == '#' else 'w' if c == 'w' else '+'
  m, v = frame(parts[0], 'mask', f)['art'], frame(parts[1], 'vessel', f)['art']
  block(0); relief(m, 0)
  block(BH - 1); relief(v, BH - 1)
  block(2 * BH - 2)
  icon = SIG[sigil]                                              # the sigil it grants, cut into the base
  for y, r in enumerate(icon):
    for x, ch in enumerate(r):
      if ch == '#':
        for a in (0, 1):
          for b in (0, 1): out[2 * BH - 2 + 5 + y * 2 + b][x0 + 5 + x * 2 + a] = '#'
  for y in range(3 * BH - 3, 3 * BH + 1):                        # plinth
    for x in range(1, W - 1): out[y][x] = '#' if y in (3 * BH - 3, 3 * BH) or x in (1, W - 2) else '+'
  return out
def plain(parts, f='F'):
  return compose(parts, f)
def trim(g):
  ys = [y for y, r in enumerate(g) if any(c != '.' for c in r)]; xs = [x for r in g for x, c in enumerate(r) if c != '.']
  return [list(r[max(0, min(xs) - 2):max(xs) + 3]) for r in g[max(0, min(ys) - 2):max(ys) + 3]]
S = 4; cols = []
for parts, sig in ((('alien',) * 3, 'thorns'), (('lion', 'robot', 'golem'), 'haste')):
  for g in (plain(parts), carved(parts), blocks(parts, sig)): cols.append(img(trim(g), S))
Hh = max(c.height for c in cols); o = Image.new('RGB', (sum(c.width for c in cols) + 16 * len(cols), Hh + 10), (18, 22, 14)); x = 0
for c in cols: o.paste(c, (x, Hh - c.height + 5)); x += c.width + 16
o.save(P('previews', 'totem-mockups.png')); print(o.size)
