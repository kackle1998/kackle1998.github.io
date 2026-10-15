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

## Writing

Use US spelling (color, armor, gray) in code, comments and text.
