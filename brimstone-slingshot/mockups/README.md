# Event mockups

Each file here holds one event's designs (A, B, C) for the scene builder. Open it with
`builder.html?mockup=<name>` while `serve.py` is running (`play.bat` starts it).

The builder makes the stage: the camera, the setting, its life, and the critters and effects
picked in its panel. A mockup file adds only the event's own action:

```js
Builder.add({
  name: 'A · Short name',
  desc: 'One line on what happens.',
  len: 3,  // seconds of timeline
  hold: 1, // seconds to rest on the last frame before it loops
  at(t) { /* the whole state at t seconds, no DOM (as Draft.at) */ },
  mount(ctx) { /* add the design's own planes and art; return draw(state) */ },
});
```

`ctx` holds `{ sc, gnd, heat, U, GY, mx, D_ACT, D_FIG, plane(depth), fig, shadow(fx, depth, z),
edge, land(t, { tx, depth, edge }) }`:
- `plane(depth)` is an upright canvas in scene px (see `Scene.plane`);
- `fig` is the figurine (`fig.place`), and `shadow` its contact shadow;
- `land` is the house entrance (the tail of the map's lob), and `edge` the stage's left edge in
  scene x, so the lob starts off screen.

Everything in `js/scene.js`, `js/settings.js` and `js/props.js` is there too (`Scene.cardArt`,
`Scene.slingshot`, `Scene.CRITTERS`...). The props ticked in the builder's panel are placed for
you; to stand one yourself, use `Scene.placeProp(sc, prop, { spot, heat })` with a prop from
`Scene.PROPS` (each event's objects: the pack, the pools, the altar, the imps...). `spot` is
'home' (where its own event stands it), a standard spot from `Scene.SPOTS` ('front left',
'mid center', 'back far right'...: five columns across three rows), or `{ x, depth }`. Stand your
own objects on the standard spots too (their `x` and `depth`), so every scene lines up. A new event's
own objects should be listed as `PROPS` in its file too, so later events can reuse them. Units are the game's: 4 map units a scene px, `mx()` for plane x, depths
for plane y. The picked design's `at` and `mount` move into `js/<name>.js`.

`SAVE PICKS` in the builder writes `builder-picks.json` in the project root: the kept design and
the setting, ante, camera, floor, props and life chosen.

`example.js` is a whole design to copy from.
