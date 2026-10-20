# Snap each idol piece's edges to the standard joins, so any mask sits on any vessel and any vessel on
# any pedestal without a seam. Near an edge, each row's body (its run of pixels nearest the middle line)
# is resampled, shading and all, onto a span that eases from the piece's own shape into the join's.
# Separate runs (an arm, claws) stay where they are.
import json
NECK = (12, 20)    # mask bottom row = vessel top row: x of the outline pixels
WAIST = (11, 21)   # vessel bottom row = pedestal top row
EASE = 9           # rows over which a piece bends into its join
def runs(row):
  out, x = [], 0
  while x < 32:
    if row[x] != '.':
      a = x
      while x < 32 and row[x] != '.': x += 1
      out.append((a, x - 1))
    else: x += 1
  return out
def body(row, near):
  rs = runs(row)
  return min(rs, key=lambda r: 0 if r[0] <= near <= r[1] else min(abs(near - r[0]), abs(near - r[1]))) if rs else None
def snap(rows, edge, join):
  rows = [list(r) for r in rows]
  order = list(range(31, -1, -1)) if edge == 'bottom' else list(range(32))
  near = (join[0] + join[1]) / 2
  inner = body(rows[order[EASE]], near)
  for i in range(EASE):
    y = order[i]; t = (i / EASE) ** 1.5                       # stays on the join a while, then eases out
    a = round(join[0] + (inner[0] - join[0]) * t); b = round(join[1] + (inner[1] - join[1]) * t)
    own = body(rows[y], near) or inner
    src = rows[y][own[0]:own[1] + 1]
    for x in range(own[0], own[1] + 1): rows[y][x] = '.'
    for x in range(a, b + 1):                                  # resample the body run onto [a, b]
      k = round((x - a) / max(1, b - a) * (len(src) - 1))
      rows[y][x] = src[k]
    rows[y][a] = rows[y][b] = '#'
    for x in range(a + 1, b):
      if rows[y][x] == '#' and i == 0: rows[y][x] = '+'        # no ink across the seam itself
  return [''.join(r) for r in rows]
P = json.load(open('xeno_trace.json'))
P['mask'] = snap(P['mask'], 'bottom', NECK)
P['vessel'] = snap(snap(P['vessel'], 'top', NECK), 'bottom', WAIST)
P['pedestal'] = snap(P['pedestal'], 'top', WAIST)
json.dump(P, open('xeno_joined.json', 'w'), indent=1)
