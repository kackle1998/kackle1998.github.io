# Turn a picture of a creature into a 16x16 card sprite in the palette (# ink, + mid, - light,
# w white, . clear), printed as the 16-wide rows SPRITES takes (js/data.js).
# Usage: sprite_from_image.py <image> [--flip] [--size 15]
# The background is whatever fills the corners (or transparency). The creature is cropped, fitted
# into the sprite with its aspect kept, its colors split across the three tones by brightness
# (bright, unsaturated pixels such as eye whites become w), and outlined in ink.
import sys
from PIL import Image
args = sys.argv[1:]
flip = '--flip' in args
size = int(args[args.index('--size') + 1]) if '--size' in args else 15
im = Image.open(args[0]).convert('RGBA')
if flip: im = im.transpose(Image.FLIP_LEFT_RIGHT)
px = im.load(); W, H = im.size
bgc = px[0, 0]
def is_bg(p):
  if p[3] < 128: return True
  return sum((a - b) ** 2 for a, b in zip(p[:3], bgc[:3])) < 40 ** 2
pts = [(x, y) for y in range(H) for x in range(W) if not is_bg(px[x, y])]
x0, x1 = min(p[0] for p in pts), max(p[0] for p in pts) + 1; y0, y1 = min(p[1] for p in pts), max(p[1] for p in pts) + 1
k = max(x1 - x0, y1 - y0) / size
tw, th = round((x1 - x0) / k), round((y1 - y0) / k)
ox, oy = (16 - tw) // 2, 16 - th - (16 - size) // 2
lum = lambda p: .3 * p[0] + .59 * p[1] + .11 * p[2]
cells = {}
for ty in range(th):
  for tx in range(tw):
    # majority of the source block decides empty or not; the mean of its non-background pixels its color
    sx0, sy0 = x0 + int(tx * k), y0 + int(ty * k); sx1, sy1 = max(sx0 + 1, x0 + int((tx + 1) * k)), max(sy0 + 1, y0 + int((ty + 1) * k))
    blk = [px[x, y] for y in range(sy0, sy1) for x in range(sx0, sx1)]
    fg = [p for p in blk if not is_bg(p)]
    if len(fg) * 2 < len(blk): continue
    cells[(ox + tx, oy + ty)] = tuple(sum(p[i] for p in fg) / len(fg) for i in range(3))
vals = sorted(lum(c) for c in cells.values())
t1, t2 = vals[int(len(vals) * .3)], vals[int(len(vals) * .72)]
g = [['.'] * 16 for _ in range(16)]
for (x, y), c in cells.items():
  sat = max(c) - min(c)
  g[y][x] = 'w' if lum(c) > 200 and sat < 60 else '#' if lum(c) < t1 * 0.6 else '+' if lum(c) < t2 else '-'
for y in range(16):
  for x in range(16):
    if g[y][x] == '.' and any(0 <= x + a < 16 and 0 <= y + b < 16 and g[y + b][x + a] not in '.#' for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1))):
      g[y][x] = '#'
for r in g: print("    '" + ''.join(r) + "',")
