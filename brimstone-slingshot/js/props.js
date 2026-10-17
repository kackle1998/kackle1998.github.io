'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the props catalog: every event's objects in one list, for the scene
   builder (builder.html) and any scene that wants to borrow one.
     Scene.PROPS     [{ id, name, from, x0, w, cx, gy, home: { x, depth }, draw(pln, t, heat, sc) }]
     Scene.SPOTS     the standard places to stand things, by name (see below)
     Scene.placeProp(sc, prop, { spot, heat }) stands one in a scene; returns paint(t)
   Each event file keeps its own art and lists its pieces as PROPS (js/draft.js, js/dip.js,
   js/shrine.js, js/handover.js, js/factory.js, js/casino.js); the kit's own pieces (the slingshot, card backs)
   are here. A prop is drawn in its own file's scene px: x0..x0 + w across,
   standing on its ground line gy (4 map units a px), with cx its middle. Load this after them.
   ============================================================ */

(() => {
  const U = 4;
  const sling = new WeakMap(); // one Scene.slingshot per scene (it bakes the fork and pouch art)
  const KIT = [
    { id: 'slingshot', name: 'Brimstone Slingshot', from: 'the kit', x0: 0, w: 36, cx: 18, gy: 103, home: { x: 18, depth: 380 }, // as Bone Draft stands it
      draw(pln, t, heat, sc) { if (!sling.has(sc)) sling.set(sc, Scene.slingshot(sc)); const s = sling.get(sc); s.fork(pln, 18, 103); s.front(pln, 18, 103); } },
    { id: 'card-backs', name: 'three card backs, fanned', from: 'the kit', x0: 0, w: 50, cx: 25, gy: 103, home: { x: 80, depth: 380 }, // over Bone Draft's pack
      draw: (pln) => { Scene.cardArt(pln.p, 1, 78); Scene.cardArt(pln.p, 34, 78); Scene.cardArt(pln.p, 17, 74, 'rare'); } },
  ];
  // Each event file's PROPS, labeled with where they come from (a file that isn't loaded adds none).
  const FROM = [
    ['Bone Draft', typeof Draft !== 'undefined' && Draft], ['Molten Pool', typeof Dip !== 'undefined' && Dip],
    ['Bone Shrine', typeof Shrine !== 'undefined' && Shrine], ['the hand scenes', typeof Handover !== 'undefined' && Handover],
    ['the factory', typeof Factory !== 'undefined' && Factory], ['the casino', typeof Casino !== 'undefined' && Casino], ['the kit', typeof Campfire !== 'undefined' && Campfire],
  ];
  const PROPS = KIT.concat(...FROM.map(([from, M]) => (M && M.PROPS ? M.PROPS.map((p) => ({ ...p, from })) : [])));

  /* The standard spots, so things stand in the same places in every scene and in the builder: five
     columns (scene x, 75 the middle, as the scene files' mx()) across three rows (depths). The
     front row is the action plane every event stands its main objects on, just behind your
     figurine (396). 'home' is a prop's own place in the event it comes from. */
  const COLS = { 'far left': 0, left: 30, center: 75, right: 120, 'far right': 150 };
  const ROWS = { front: 380, mid: 300, back: 220 };
  const SPOTS = {};
  for (const [r, depth] of Object.entries(ROWS)) for (const [c, x] of Object.entries(COLS)) SPOTS[c === 'center' ? r + ' center' : r + ' ' + c] = { x, depth };
  const spotOf = (prop, spot) => (spot === 'home' || !spot ? prop.home : SPOTS[spot]) || SPOTS['front center'];

  /* Stand a prop in a scene on its own upright plane at a spot: 'home' (the default), a name from
     SPOTS, or { x, depth } by hand. Returns paint(t), to call for animated props (t in seconds);
     it paints once at t = 0. */
  function placeProp(sc, prop, { spot = 'home', heat = 0 } = {}) {
    const { x, depth } = typeof spot === 'object' ? spot : spotOf(prop, spot);
    const left = 720 + (x - (prop.cx - prop.x0) - 75) * U;
    const pln = Scene.plane(sc, { left, x0: prop.x0, depth, w: prop.w, h: prop.gy });
    const paint = (t) => { pln.clear(); prop.draw(pln, t, heat, sc); };
    paint(0);
    return paint;
  }

  Object.assign(Scene, { PROPS, SPOTS, placeProp, spotOf });
})();
