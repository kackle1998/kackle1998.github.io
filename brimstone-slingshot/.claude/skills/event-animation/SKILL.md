---
name: event-animation
description: Design and build an animated event scene for Brimstone Slingshot (a map stop that opens its own 3D scene, like the bowling lane or Bone Draft), or change one. Use whenever the user asks for a new event animation, a new ? stop scene, or changes to an existing scene's art or motion, so every scene is built from the shared kit in js/scene.js and looks and moves the same.
---

# Event animations

Every event scene is built from the scene kit in `js/scene.js` and wired up through the shared
Run helpers in `js/run.js`. The two existing scenes are the references:

| Scene | Art and timeline | Run side |
| --- | --- | --- |
| Bowling lane | `js/bowl.js` (`Bowl.mount`) | `Run.bowl`: the entrance, the star, the throw |
| Bone Draft | `js/draft.js` (`Draft.at`, `Draft.mount`) | `Run.draft`: the entrance, opening, on-screen pick |
| Pit Boss hand-over (Dealer's Offer, Lost Spellslinger, Reliquary, Bone Pile) | `js/handover.js` (`Handover.make(cfg)` gives `at`, `mount`) | `Run.handover`: one screen for four events, `ev.hands` picks the mode; the outcome is saved before the card moves |

The house rules are in `CLAUDE.md`, under "Proposing visual designs" and "Event entrances". Read
them first. This skill is the workflow around them.

## 0. Ask what to make

Before anything else, read `defaults.md` (next to this file): it holds the standard answers.
Then run the questions below, skipping any the user's message already answers. For example,
"/event-animation a cursed coffin in the crypt" already answers the event and the setting.

1. **The event:** what happens, and what the figurine plays with. If it wasn't given, ask in plain
   text and wait for the answer. It's free text, so don't use buttons for it.
2. **One `AskUserQuestion` call**, `multiSelect`, on reuse: which existing pieces to build on.
   Offer the standard from `defaults.md` first, marked (Recommended), plus the relevant ones from
   the scenes in the table above and their exports: the slingshot, card backs and their turn-over,
   the falling-star arrival (`Run.bowl`), the pack strip (`js/draft.js`), the pool and its splash
   (`js/dip.js`), the forge's imps and sigil chip (`js/factory.js`).

Don't ask about the setting, ante, camera, floor, props or background life. The user picks those
in the builder (step 1), where they cost no tokens.

**Starting from an existing event:** if the user names one to start from ("like Bone Draft",
"start from the shrine"), or `builder-picks.json` has a `startFrom`, treat it as a copy, the way
a new card copies another. Read that event's file (`startFrom.file`, such as `js/draft.js`), and
write the mockup's first design from its `at()` timeline and `mount()` art: the same entrance,
beats and timings, renamed for the new event. Then change only what the new event needs. Tell
the user they can pick the same event under START FROM in the builder, so the stage matches. If the message names a setting, use it as
the builder's starting point. If `builder-picks.json` already exists for this event, use it.

Then sum up the answers in two or three lines. Those answers drive every design you mock up.
If the user changes a standard ("always use the crypt", "default to no background life", "make
that the standard"), update `defaults.md` and say so. Only change it when they say to.

## 0b. Say the plan before you start

Before any edit, tell the user in a few short lines what you'll change, in which files, and how you'll
check it. Keep the task list current as you go. When something breaks, say what's wrong and what
you'll change *before* changing it. The user has asked for this explicitly.

## 1. Mock it up in the builder

Mockups run in the scene builder, `builder.html`. It loads the game's own scripts (`js/scene.js`,
`js/settings.js`, `js/factory.js`, the run map art), so a mockup is the game's real 2.5D scene.
The user picks the setting, ante, camera, floor, near props, background life, critters and
effects in its panel, at no token cost. You write only the event's own action.

1. Write `mockups/<name>.js` (see `mockups/README.md`, and copy from `mockups/example.js`). Call
   `Builder.add(design)` once per design (A, B, C), each `{ name, desc, len, hold, at(t),
   mount(ctx) }`. The builder builds the stage and hands `mount` a ctx: `sc`, `gnd`, `heat`,
   `plane(depth)`, `fig`, `shadow`, `land` (the house entrance) and `edge` (so the lob starts
   off screen). `mount` adds the design's own planes and art and returns `draw(state)`.
   - Don't make per-ante variants (A1, A2, A3). The builder's Ante buttons rebuild every stage.
   - Don't build the setting, critters or effects in the design; the panel adds those. A design
     adds life only when it's part of the event (a crow taking off when you land).
   - Use the game's units: 4 map units a scene px, `mx()` for plane x, depths for plane y. The
     picked design's `at` and `mount` move into `js/<name>.js` with little change.
2. Open it in the preview pane: start the `cardgrave` server (`preview_start`) and navigate to
   `builder.html?mockup=<name>`. Check `read_console_messages` and the page's error line
   (`#bdErr`). Look at a frame or two yourself, then tell the user the address. With `play.bat`
   running, that's `http://localhost:8765/builder.html?mockup=<name>`.
3. Put new art in the same style: flat ramp colors, lit from the upper left, pale overall. No
   gradients, glows or fades. Use the depth: one hero object up front, with background motion
   slow, stepped and lower in contrast.
4. Motion: positions move smoothly; poses and anything else that steps uses `Math.floor` of time,
   at 4 to 7 a second. Never blink.
5. Ask the user to tick KEEP on one design, set the place up in the panel, and press SAVE PICKS.
   Then read `builder-picks.json` in the project root: the kept design, setting, ante, camera,
   floor, props, setting life, critters and effects. Revisions mean editing the mockup file;
   the user reloads the page. Don't touch game code until a design is kept.

The chat widget template (`mockup-template.html`, kept current by `python tools/mockup-kit.py`)
is the fallback, for when the user can't open the builder. It pastes about 15,000 tokens of kit
into every widget, so don't use it otherwise.

## 2. Build it on the kit

**New file `js/<name>.js`** (see `js/draft.js` for a whole example). Start it from the picked mockup's
scene, which already has this shape:
- **Constants in scene px:** the ground line `GY`, the props' positions, and `mx(x)` to turn a scene x
  into a plane x.
- **`at(t)`:** returns the scene's whole state at t seconds. It's pure, with no DOM, so it can be
  sampled for checking. Mark the phases with named times (`LANDED`, `REST`, `END`).
- **`CUES` / `ENTER_CUES`:** `[t, sfx name, n]` lists for `Scene.play`.
- **Art functions** for what is the scene's own, drawn with a `Scene.pen`.
- **`mount(stage, ...)`**, built from the kit, returning `draw(state)` with `draw.alive`:
  - `Scene.mount(stage, { rows, top })`: the sky and the camera. Frame it so everything that rises
    stays in shot.
  - `Scene.setting(sc, name, { floor, backdrop, features, critters, effects, horizon, ... })`
    (`js/settings.js`), with the picks from `builder-picks.json`. `name` is the preset; each part
    can be swapped (`Scene.PARTS` lists them). The backdrop is what closes off the back (the
    orrery sky, the crypt wall, the factory hall). `features` is a list of natural feature sets
    scattered on the floor together (spires, slots, vents, graves, woods); before a wall they keep
    to its open floor. `density` sets how many of each, 1 as standard (`{ woods: 1.6 }`), as the
    builder's sliders save it. `clearing` sets the open ground left round the action: 'wide' (the
    standard), 'tight' or 'none' (features up to the action's edges and nearer the camera). `critters` and `effects` are lists of `Scene.CRITTERS` / `Scene.EFFECTS` names (the
    preset's own if left out). `near` are big features placed by hand close to the action. Props
    are the events' own objects (the pack, the pool, the slingshot), not part of the setting: they
    live in `Scene.PROPS` (`js/props.js`), and the builder's Props checklist uses them. List a new
    event's objects as `PROPS` in its file (see `js/draft.js`), each with its `home` (where it
    stands in that event), and add the file to `js/props.js` and `builder.html`, so later events
    can reuse them.
  - Place things on the standard spots, `Scene.SPOTS`: five columns (far left 0, left 30, center 75,
    right 120, far right 150, in scene x) across three rows (front 380, the action plane just
    behind the figurine; mid 300; back 220). `builder-picks.json` names each prop's spot ('home'
    or a standard one); use `Scene.placeProp(sc, prop, { spot })` or that spot's x and depth. All
    of it takes `heat` from `RunMap.SPIRE_ANTES`. It returns the
    ground; put contact shadows on its `over` canvas. A new setting goes in `js/settings.js`: ground
    options with a `pattern`, prop art with `RunMap.propArt`'s signature, and a `life`. Then rerun
    `python tools/mockup-kit.py`. (`Scene.ground` and `Scene.ruins` are the parts it's built from.)
  - `Scene.plane(...)`: upright canvases for the action, one behind the figurine and one in front.
  - `Scene.figure(sc, { s })` for the figurine, and `Scene.slingshot(sc)` for props.
  - Cards: every card in a scene is `Scene.CARD` (15 x 22 scene px), back or face. `Scene.cardArt`
    draws a back with the card's real rarity (`rarityOf`: a rare one has a gold diamond, a
    mythical one a gold border too), `Scene.cardFace` a pixel face that stays part of the scene
    (pass the card's sprite from `Scene.spriteArt`). Gold means rarity only; give other states
    (heat, a curse) a look of their own.
  - `Scene.toStage(...)`: places HTML (such as labels) over the scene.
- **Load it:** add it to `FILES` in the loader at the end of `index.html`, after `js/scene.js`.

**Run side, in `js/run.js`** (see `Run.draft`):
- **The screen:** `const stage = this.sceneScreen(icon, title, sub, buttons)`, then
  `const draw = X.mount(stage, ...)`.
- **The input lock:** `const lk = this.sceneLock()`. Call `lk.lock()` while anything moves and check
  `lk.busy()` in every click handler.
- **The entrance:** `this.sceneEnter(node.<flags>, { draw, at, to, cues, done })`. It plays once per
  stop, skips under `FAST`, and saves the flag first, so a reload doesn't replay it.
- **Later timelines:** `Scene.play({ draw, at, from, to, cues, done })`.
- **Reloads:** save any random roll on the node *before* animating it, and make a reload show the
  end state.
- **The test bench:** add it to `Run.SCENE_BENCHES`, which gives you `index.html?scenetest=<id>`.
  Benches never save (`this.bench`).

Use US spelling everywhere.

## 3. Check it

The preview pane is small and the CRT effect blurs it, so don't trust screenshots for fine detail.

- **Run it:** open `?scenetest=<id>` and run the whole thing. `read_console_messages` must show no
  errors.
- **Sample frames:** mount a second copy and draw any moment, for example
  `const d = Draft.mount(document.getElementById('scStage'), 0); d(Draft.at(3.4))`.
- **Pixel-dump small details** (bands, outlines, seams) from the plane canvas and read the ramp
  indexes:
  ```js
  const C = RunMap.ramp(), cv = [...document.querySelectorAll('#scStage canvas.bw-st')].find((c) => c.width === 348);
  const g = cv.getContext('2d'), name = (p) => !p[3] ? '.' : String(C.indexOf('#' + [...p].slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('')));
  // rows y0..y1, columns x0..x1 of canvas px: name(g.getImageData(x, y, 1, 1).data)
  ```
- **Time how long each stepped part shows** (for example, the number of frames a card is narrow).
  Check nothing leaves an empty frame.
- **Exercise the flows:** the entrance once, the locked buttons, a reload mid-way and after, `FAST`,
  each choice, and leaving. Test a real-run flow on an in-memory run with `Store.write = () => {}`,
  so the user's saved run is never touched.
- **Try an inverted palette:** `Palette.apply('nightshade')`, with `Store.write` stubbed. Put Moss back
  afterward.

## Lessons from the first two scenes

- **Thin lines:** a 1 px line breaks into dashes under the CRT scanlines. Draw bands, strings and other
  thin lines 2 px thick.
- **Lines beside outlines:** a line running next to an ink outline merges into it. Tie it on clearly
  (start it inside the knob or loop it hangs from) and keep a pixel of space beside the outline.
- **Swaps:** don't jump from one thing to another through an empty frame. The card turn narrows the
  backs in the scene (`CARD.TURN`), then the faces open from narrow (`Scene.FACE.OPEN`).
- **Ground edges:** the plane alone ends in a cliff. Run the ground past it and hide its far edge
  behind a wall of tall spires.
- **Spire layout:** spires in straight rows look wrong. Scatter them the way the map does
  (`Scene.ruins`).
- **Scale:** big props read as giant only next to the figurine at the same pixel scale. Check sizes
  against the cards and the figurine together.
- **Coming in from off screen:** never hardcode how far out an entrance starts. The stage's width
  changes with the window, and a pulled-back camera shows far more ground. Measure the edges in
  `mount` with `Scene.span(sc, depth, z)` and start the lob, or anything sliding in, past them
  (see `EDGE` in `js/draft.js`, `off` in `js/handover.js`). Make the upright plane it moves on
  reach past the edge too, or the plane's canvas cuts it off mid-screen.
- **Staying in shot:** things rising out of the scene (cards, prizes) need the camera framed to keep
  them in shot.
- **Real cards:** show and pick real cards on the scene itself with `Run.sceneFaces(stage, defs,
  onPick, rects, draw.toStage)`: each face opens at its back's rectangle (on the plane the back
  is drawn on), then grows in steps to `Scene.FACE.READ`, keeping their layout. Don't size or
  place faces by hand, and don't cut away to another screen.
