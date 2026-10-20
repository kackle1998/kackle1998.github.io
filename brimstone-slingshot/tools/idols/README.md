# Idols: the four creatures and their toolkit

The alien, lion, robot and golem, drawn as three stacked pieces each (mask, vessel, pedestal) that
turn from facing left, through front, to facing right. They're kept here to come back to, whether as
mix-and-match idols or in some other form.

What's in the game today: `js/idol.js` holds every piece's frames and anchors, assembles an idol and
turns it. The test event shows it, and no run can roll it:
`index.html?scenetest=idol` (add `&idol=LRG` to pick the mask, vessel and pedestal by initial).

## Folders

| | |
|---|---|
| `mockups/` | Your 32x32 grid mockups, one image per creature, the source of all the art. |
| `pieces/` | Each creature's three pieces in the sprite palette (`#` ink, `+` mid, `-` light, `w` white, `.` clear), read from the mockups and cleaned by hand (`alien.json` etc.), plus every turn frame with its anchors (`turn_all.json`). |
| `previews/` | Turn sheets, the all-combinations grid, the totem mockups and the map icon designs. |
| `archive/` | Earlier experiments: the first traced and hand-drawn alien, the first turn, the layered-arm bodies (dropped), the lion before its eye edit. They don't run as they are; they're kept for reference. |
| `DESIGN.md` | The Idol design notes: the mask/vessel/pedestal rules, the Hierophant event plan and the assembly rules. |

## The pipeline

Needs Python 3 with Pillow; `mix.js` also needs Node and Playwright. Every script works from any folder.

1. **Read a mockup:** `fromgrid.py <image> <out.json> <mask box> <vessel box> <pedestal box> [--fit]`
   reads three 32x32 grids on black into the palette. Each box is `x0,y0,x1,y1` in image pixels.
   `--fit` scales each piece's art to a standard size (heads 22 cells, bodies and legs 28; override
   per piece with `SPAN=mask=24`). It skips the mockup's overlay grid lines, maps bright white and
   glowing green to `w`, and splits the other colors across the three tones by brightness.
   The boxes used so far:
   - alien: `43,80,212,261 231,80,421,261 439,80,610,284` (read without `--fit`)
   - lion: `14,59,190,232 217,59,391,232 418,59,592,232` (tail refit with `SPAN=pedestal=26 --fit`)
   - robot: `86,65,315,286 399,65,635,286 719,65,948,286` (head refit with `SPAN=mask=24 --fit`)
   - golem: `102,140,568,609 767,140,1232,609 1430,140,1897,609 --fit`

   The pieces in `pieces/` were then cleaned by hand (stray grid dots, the robot's missiles, the
   lion's eye), so re-reading a mockup would undo that.
2. **Build the turn frames:** `turn.py` makes every piece's left, three-quarter and front frames from
   `pieces/*.json` into `pieces/turn_all.json`, plus a sheet and GIF per creature in `previews/`.
   - **How each frame is made:** from your own art, narrowed (turning), half of it mirrored (front),
     or drawn new where neither works.
   - **What it then enforces:** every frame spans your art's rows, anchors keep their height,
     three-quarter widths sit between side and front, stray ink is swept, and outlines are closed.
   - **Right-facing frames:** mirrored by the game, unless a piece has its own (the robot's body does,
     so its arms keep their sides).
3. **Put them in the game:** `export.py` writes `pieces/turn_all.json` into `IDOL_PARTS` in `js/idol.js`.

Checks and previews:
- `check_strays.py` marks loose pixels and spurs on a review sheet.
- `check_outlines.py` lists colored pixels touching empty space with no outline.
- `mix.js all` renders every combination (or `mix.js golem` for one creature swapped with each of the
  others).
- `totem_mockups.py` draws the carved and totem-block alternatives.
- `wheel_styles.py` draws the robot wheel styles.

## Assembly rules (kept in `js/idol.js` too)

- Each piece names its anchors: the mask's `neck`, the vessel's `neck` and `waist`, the pedestal's
  `waist`. The vessel stays put; the mask's neck lands on the vessel's neck and the pedestal's waist on
  its waist.
- Drawn back to front: pedestal, vessel, mask, then any vessel `front` area (the robot's raised hand),
  which never covers the mask's `face`.
- An anchor keeps the same height in every facing; only its x moves as the piece turns.
