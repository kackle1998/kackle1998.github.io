# Idol — design plan (Brimstone Slingshot)

## Context
A run-level, out-of-match deck buff, modeled on Inscryption's totem but made more distinctive. Three
stacked pieces: **Mask** (power + when it wakes), **Vessel** (who it touches), **Pedestal** (what it does).
("Relic" avoided: already used by the Reliquary event.)
It slots into the existing run: map events (`js/run.js` RUN_EVENTS / stops), sigils (`SIGILS` in
`js/data.js`), the four lands (paw/bone/gem/hat), and the scene kit (`js/scene.js`, as in `js/rune.js`).

## Core grammar
Sentence = Mask + Vessel + Pedestal, e.g. *"[Lv2, wakes turn 3] Your creatures… gain Thorns."*

| Mask | Power | Wakes on turn |
|---|---|---|
| Ember | 1 | 1 |
| Coal | 2 | 3 |
| Brimstone | 3 | 5 |

Power scales the Pedestals: Gain/Lose a sigil tier (Lv1 common sigils like Haste/Thorns; Lv3 Airborne,
Touch of Death), and Cost ±X where X = power. Later masks = stronger but you must survive to them —
a real tempo vs. greed choice Inscryption doesn't have.

Vessels: Your creatures / Enemy creatures / Your spells / Enemy spells.
Pedestals: Gain [sigil] / Lose [sigil] / Cost X more / Cost X less.

"Enemy… Lose Airborne" and "Enemy spells cost X more" make hostile idols first-class, not just buffs.

## What makes it ours (beyond Inscryption)
1. **Land-carved vessels.** Vessels can be found tribe-locked: "Your **Bone** creatures…", "Enemy **Gem**
   spells…". Narrower = cheaper to carve / stronger pedestals (+1 power). Ties into the 4 lands.
2. **The pole wakes visibly.** Idol stands beside the board; at its turn it ignites (fits the
   brimstone/factory look). Before it wakes the enemy can see what's coming — readable planning.
3. **Burden pieces (two-faced pedestals).** Some pedestals carry a cost on the *other* vessel: "Your creatures gain
   Quick / Your spells cost 1 more." Bigger effect, built-in drawback. Gambling-event flavor.
4. **Cracking.** Each match the idol wakes, it risks a crack (or cracks when its bearer side loses
   a life threshold). Broken pieces go back to the pool — keeps stacking from snowballing and gives
   repair stops something to do (Forge/Shrine already exist).
5. **Enemy idols.** Bosses/elites carry their own pole; you see it on the map node. Some events let
   you *steal* a piece from a defeated boss's pole.
6. **Overlay rule with sigils:** a creature that already has the granted sigil gets a small bonus
   (+1/+0) instead of nothing — rewards building around your idol.

## Getting the pieces: three events on the first ante
The idol is built **from the ground up**: one piece from each of three events, each on the row
just after a battle row (`RUN_BATTLE_ROWS = [1, 4, 7]` in `js/run.js`):

| Row | Event (tarot, like the Arcana stops) | Gives | Idol after it |
|---|---|---|---|
| 2 | **The Hierophant**, guaranteed | Pedestal: choose 1 of 3 | "Your creatures… [pedestal]", Ember power (lv 1, turn 1) by default |
| 5 | **The Hermit** (suggested) | Vessel: choose 1 of 3 | retargeted; still Ember |
| 8 | **The Tower** (suggested) | Mask: choose 1 of 3 | complete |

- Fight 1 (row 1) is played without an idol, as specified.
- A partial idol still works, filling the missing pieces with defaults (vessel = Your creatures,
  mask = Ember). Each event therefore matters as soon as it is done.
- How the guarantee works: in `genRunMap`, while `!run.s.idol` on ante 1, every stop on row 2 becomes
  `t: 'hierophant'`, so no path misses it. Rows 5 and 8 each get one `hermit` or `tower` stop, placed
  on every path in the same way, or as an ordinary chance stop if you'd rather the later pieces be optional.
- Later antes keep the idol. Their Hierophant/Hermit/Tower stops, when they appear, offer to **swap** a piece.

## Icons (7×7 `ICONS` grids in `js/data.js`, made into `ri_*` sprites by `iconSprite`)
```
hierophant   idol (stop)  mask         vessel       pedestal     hermit       tower
...#...      .#.#.#.      .#####.      .#####.      .......      ...#...      #.#.#.#
..###..      .#####.      #######      ..###..      .#####.      ..###..      #######
.#.#.#.      .#.#.#.      #..#..#      .#####.      ..###..      .#...#.      .#...#.
.#####.      ..###..      #######      #######      ..###..      .#.#.#.      .#.#.#.
.#.#.#.      .#####.      ##.#.##      #.#.#.#      ..###..      .#...#.      .#...#.
.#####.      ..###..      .#...#.      .#####.      .#####.      ..###..      .#...#.
#######      #######      ..###..      ..###..      #######      ...#...      #######
(3-tier      (whole pole) (eye holes,  (urn)        (plinth)     (lantern)    (battlements)
 tiara)                    teeth)
```
Before coding, render these as a pixel mockup (Moss palette, per CLAUDE.md) and get a pick.

## Piece art and assembly rules (mix and match)
Each piece is a 32×32 sprite made in the character art creator (4 tones, `.` clear). Pieces
don't meet edge to edge. They overlap, placed by anchor points:
- **Anchors (per piece, stored with its art):**
  - Mask: `neck`, the point where the skull sits on a body.
  - Vessel: `neck` (where a mask sits) and `waist` (where a pedestal hangs).
  - Pedestal: `waist`, the top of whatever it is (legs, tail, plinth).
- **Placement:** the Vessel is fixed. The Mask moves so its `neck` lands on the Vessel's `neck`; the
  Pedestal moves so its `waist` lands on the Vessel's `waist`.
- **Draw order:** Pedestal, then Vessel, then Mask, then any Vessel areas marked `front` (back to
  front). `front` is an optional list of rectangles on a Vessel, for parts held in front of the face,
  like the robot's raised hand. Each Mask declares a `face` rectangle (eyes, mouth), and front
  parts are never drawn over the face's pixels. Heads overlap the shoulders and
  bodies cover the tops of legs and tails, so any seams are hidden.
- **Composite canvas:** 80×96 with the Vessel's corner at (24,32), cropped to the drawn pixels. A
  diagonal creature like the lion puts its sockets far from the middle (neck at the front-top,
  waist at the hindquarters), so the canvas leaves 24 px of room on each side (enough for the lion's tail at full size).
- **Authoring guidelines** (so pieces mix well):
  - Draw each piece's attaching area fully, with no outline across the join: the skull's underside, the
    torso's bottom, the tail's root. The piece in front covers it.
  - Sockets can sit anywhere in the cell. Draw a Pedestal so it reads from its anchor in any
    direction (the alien's tail hangs down; the lion's tail sweeps back).
  - Arms and hands belong to the Vessel. Keep them inside its 32×32 cell.
- **Example, the blue alien** (`compose.js`): mask neck (17,22); vessel neck (15,6) and waist (16,24);
  pedestal waist (17,4). **The lion:** mask neck (15,21); vessel neck (9,9) and waist (23,19);
  pedestal waist (4,9). **The robot:** mask neck (16,25); vessel neck (16,10), waist (15,25) and front
  [0,9 to 11,28] (the raised hand, lowered to rise beside the chin); pedestal waist (15,3), at the top of a
  coiled post that keeps the wheels below other bodies' arms. **The golem:** mask neck (18,24); vessel neck (11,4) and waist (18,16); pedestal waist (15,5).
  The golem was read with `--fit`, which scales each piece's art to a standard size: heads span 22 cells, bodies and legs 28 (override per piece with `SPAN=mask=24`). The robot head (24) and the lion tail (26) were refit the same way.
  `mix.js all` renders every combination; `mix.js golem` shows one creature whole and swapped with each of the others.
- **Reading mockups:** `fromgrid2.py` reads three 32×32 grids drawn on black. Pure black is clear, white
  becomes `w`, glowing green (eyes) becomes `w`, and the other colors are split across the three tones
  by brightness.
- **In code:** `IDOL_MASKS/VESSELS/PEDESTALS` entries carry `{ art: [32 rows], anchors: {...} }`, and one
  `composeIdol(mask, vessel, pedestal)` builds the pole sprite for the board, map and events.

## Animated pieces (turning)
- Every piece has five facings: `L`, `QL` (three-quarter left), `F` (front), `QR` and `R`.
- Only `L`, `QL` and `F` are drawn. `QR` and `R` mirror `QL` and `L`, with anchors and face rectangles
  mirrored too (x becomes 31 − x).
- Anchors and the face are stored per facing. Every frame is assembled with the same anchor and
  draw-order rules as the stills, so any head turns on any body.
- All pieces show the same facing at the same moment. The turn plays L, QL, F, QR, R and back, at
  about 5 frames a second.
- First pass, the alien (`anim.py`, saved in `xeno_turn.json`):
  - Head: QL is your art narrowed; F is drawn new.
  - Body: QL is your art; L is narrowed; F mirrors the far side.
  - Tail: QL is narrowed; F is drawn new.

## Rules to pin down
- One idol per run (swap pieces only at an Idol stop), or multiple poles? → recommend one.
- Cost floor: cost-less can't go below 1 for creatures / 0 for spells; lands unaffected.
- "Lose" on a creature without the sigil: no effect (keep it simple).
- Wake timing counts the *idol owner's* turns.

## Implementation sketch (when we build it)
- `js/data.js`: `IDOL_MASKS`, `IDOL_VESSELS`, `IDOL_PEDESTALS` tables beside `SIGILS`.
- Run state: `Run.s.idol = { mask, vessel, pedestal }` + piece inventory, saved like other run state.
- `js/engine.js`: at start of owner's turn N ≥ wake, apply: grant/strip sigil via the existing sigil
  check paths; cost changes in the play-cost function.
- New stop/event `idol` in `js/run.js` (pattern of `rune`/`altar`), scene file `js/idol.js` on `js/scene.js`.
- `js/ai.js`: AI accounts for cost changes; render the pole in `js/render.js`.

## Verification
`Run.sceneTest('idol')` bench (like rune/altar); run `tools/runsim-player.js` sims with each mask to
check win-rate swing; play a match confirming wake turn, cost floor, and enemy idol display.
