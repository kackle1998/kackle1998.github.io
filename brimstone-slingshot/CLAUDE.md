# Brimstone Slingshot

## Proposing visual designs

When asked to suggest or propose designs for game art (map props, buildings, landmarks, icons),
show them as **inline pixel mockups in the chat** using the visual widget tool (`show_widget`),
not as files. Draw them the way the game's art engine in `js/runmap.js` does:

- **Palette:** only the game's colors, from `PALETTES` in `js/options.js`, built into a ramp
  sorted by brightness with the accent last (the same as `ramp()` in `js/runmap.js`). Index 0 is
  the darkest tone, 7 the lightest, 8 the accent. Hardcode the Moss values in the widget, since it
  can't fetch project files.
- **Pixels:** a small canvas scaled up with `image-rendering: pixelated`, at 1 px = 2 map units.
- **Style:** lit from the upper left, with flat palette colors only: no gradients, glows, blur or
  fades. Shade with Bayer dithering (`BAY` in `js/runmap.js`). Keep the overall look pale, like a
  Game Boy, not dark.
- **Layout:** a grid with one row per design and one column per variant (for example Ante 1,
  Ante 2 and Ante 3), with a short name and a one-line description beside each row.
- **Motion:** if the thing animates in the game, animate the mockup in stepped frames (about 4 to 6
  a second) so the motion can be judged too. Avoid blinking.

After showing the mockups, ask which designs to keep before changing any game code.

## Event scenes: use the event-animation skill

Every scene a stop opens (the bowling lane, Bone Draft, and any new one) is built on the scene kit in
`js/scene.js` and the shared Run helpers: `sceneScreen`, `sceneLock`, `sceneEnter`, `SCENE_BENCHES`
and `?scenetest=<id>`. Follow `.claude/skills/event-animation/SKILL.md` to mock up, build and check
one. It includes the mockup template for the chat widgets.

## Event entrances: landing from the slingshot

On the Dealer's Run map, the slingshot flings your figurine to the stop you pick. Any stop that opens
its own 3D scene (the bowling lane is the first) should start by finishing that flight: the figurine
comes in on the **tail end of the same lob** and lands in place. Treat that as the house style for event
entrances, and reuse it rather than inventing a new one.

**Reference code:**
- `Run.bowl` in `js/run.js`: the entrance block and `BOWL_LAND`.
- `Bowl.mount`'s `draw()` in `js/bowl.js`: the `figY`, `fz`, `tumble` and `squash` fields.
- The map's own flight it continues: `walkTo` in `js/runmap.js`.
- A second example: `Run.draft` in `js/run.js` and `at()` in `js/draft.js` (Bone Draft). There the figurine
  lands in a slingshot beside a giant pack. The thing it plays with is the pack itself, already standing in the
  scene, so there is no separate arrival like the falling star.

**The rules:**
- **Scene:** the scene uses the run map's camera and standees. It's a flat pixel ground tilted like
  `.rm-pl`, with the figurine as a standee (`rotateX(-90deg)`, origin at its feet), lifted with
  `translateZ` for height. The figurine is the hero sprite (`SPRITES.hero`, so a custom portrait works)
  with a 1 px ink outline, so it reads on pale ground.
- **Start:** start at the **top of the arc** (u = 0), off one edge of the screen at about mid-height.
  Don't show the launch or play a launch sound: the map already did both. The map changes to the
  stop behind a dither wipe (`RunMap.wipe`), so hold at u = 0 until `RunMap.cleared()` resolves.
- **Path:** for u from 0 to 1:
  - across: `x = tx - across * (1 - u)`
  - along the ground: `y = ty - back * (1 - u)`
  - height: `z = high * (1 - u²)`, the falling half of the map's `4H·k(1 - k)` lob, rounded to 4 map
    units like the map.

  Drive the position smoothly with `requestAnimationFrame`. The bowling values are
  `{ across: 280 lane px, back: 40, high: 200 map units, ms: 700 }`.
- **Tumble:** turn the sprite in **stepped quarter turns**, `rotate(floor(u * 4) % 4 * 90deg)`, as the
  map does. It must end at 0.
- **Shadow:** draw a dithered contact shadow under the figurine wherever it's over ground. Draw none
  over open sky.
- **Landing:**
  - play `sfx('land')`;
  - squash the sprite for one step, `scale(1.15, .8)` from its feet, for 120 ms;
  - then the held item arrives (below), and the interaction starts.
  - No bob while flying or squashed.
- **The held item arrives:** the thing the figurine plays with (the ball) doesn't just appear. It
  arrives from the scene's world in stepped frames (about 7 a second, `BOWL_STAR.ms`). On the bowling
  lane it is a **falling star**, played by the `STAR` frames in `Run.bowl` (`js/run.js`):
  - it drops out of the sky beside the figurine with a short stepped trail (white, then gold, then
    light, stepping a pixel left and right, never blinking);
  - its shadow sits on the ground where it will land the whole way down;
  - it hits with a ring of dust and one bounce, and the figurine jumps at the impact;
  - the figurine stoops and takes it into its held spot.

  It is part of the entrance: input stays locked until the item is held, and it plays once, with the
  landing.
- **Input:** clicks and keys do nothing until it lands.
- **Once only:** play it once per stop. Save a flag on the stop's node (`bw.landed`) so a reload doesn't
  replay it. Skip it when `FAST` is on and on test-bench reruns.

## Writing

Use US spelling (color, armor, gray) in code, comments and text.
