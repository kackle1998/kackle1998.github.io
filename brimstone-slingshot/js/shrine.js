'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the Bone Shrine (a ? stop event, see Run.shrine in js/run.js).
   A grand altar in the crypt (js/settings.js): a three-step dais, a pyramid of ten skulls under a
   gold-rimmed slab, and two pillars of skulls with a flame on top, candles on the steps. Your
   figurine lands beside it on the tail of the map's lob and holds up your weakest card (the real
   card's face) while you choose. OFFER YOUR WEAKEST lobs it up onto the slab; every skull's eyes wake in turn, the card narrows away,
   the pile shudders, and three hearts (max life +3) fly back to you.
   Built on the scene kit (js/scene.js): only the altar, the hearts and the timeline are its own.
   Scene px: the action is laid out on upright planes in scene pixels of 4 map units, x across and
   y down from the sky to the ground at GY.
   ============================================================ */

const Shrine = (() => {
  const U = 4, GY = 103;                  // map units a scene px; the ground's scene y
  const mx = (x) => 720 + (x - 75) * U;  // a scene x as a plane x (map units): scene x 75 is the middle
  const D_ACT = 380, D_FIG = 396, D_FRONT = 404; // depths (plane y): the altar, you, what's in front of you
  const AX0 = -12, AW = 174;              // the upright planes' left edge and width (scene px); they run from the sky (y 0) to GY
  const FX = 36;                          // where you stand (scene x)
  const CW = Scene.CARD.W;               // the offered card, in scene px (the real card face, scaled to a scene card)
  const LOB = 30;                         // the card's lob apex above its straight line to the slab (scene px)
  const SLAB_TOP = 43, SLAB_MID = 100.5; // the slab's top edge (its horns) and middle: where the card rests
  // The entrance, in scene px (x 4 for map units): the tail of the map's lob, as Run.bowl's BOWL_LAND.
  const LAND = { across: 80, back: 10, high: 40, ms: 700 };
  const { cl } = Scene;
  const lerp = (a, b, k) => a + (b - a) * k;
  const wob = (t, t0) => (t < t0 ? 0 : [1, -1, 1, 0][Math.min(3, Math.floor((t - t0) * 10))]);

  /* ---------- the timeline ---------- */
  /* What the scene shows at time t (seconds): the entrance runs 0..LANDED, you wait at REST, and
     OFFER YOUR WEAKEST plays START..END. Poses step in whole frames (eyes 16 a second, narrowing 7);
     the card's lift and flight move smoothly, and your own flight tumbles in quarter turns, ending upright.
     { fx, feet: scene x and y of your feet, depth: plane y you stand at, rot: quarter turns,
       sx, sy: squash, card: { held: rise step 0..2 | hop: progress 0..1 | slab: true, w: how open it is (1..0) } or null, lit: skulls whose eyes
       are awake (0..20), ox: the pile's shudder, hearts: [{ x, y }] } */
  const LANDED = LAND.ms / 1000 + Scene.SQUASH.ms / 1000, REST = LANDED + 0.4, START = REST;
  const T_SLAB = 0.8, T_NARROW = 2.1, T_GONE = 2.6, T_HEARTS = 2.7, T_SHIVER = 2.4; // seconds after OFFER
  const END = START + T_HEARTS + 0.8 + 0.5 + 0.7;
  const HEART_CUES = [0, 1, 2].map((i) => [START + T_HEARTS + 0.4 * i + 0.5, 'heal']);
  const ENTER_CUES = [[LAND.ms / 1000, 'land']];
  const CUES = [[START, 'select'], [START + T_SLAB, 'land'], ...[0, 1, 2, 3, 4].map((i) => [START + T_SLAB + 0.25 * i, 'tally']),
    [START + T_NARROW, 'spell'], ...HEART_CUES];
  function hearts(S, a, t0, src) {
    for (let i = 0; i < 3; i++) {
      const s = t0 + 0.4 * i, u = (a - s) / 0.5;
      if (u < 0) continue;
      const k = Math.min(1, Math.floor(Math.min(1, u) * 5) / 4);
      S.hearts.push({ x: Math.round(lerp(src[0], S.fx - 12 + 8 * i, k)), y: Math.round(lerp(src[1], S.feet - 34, k) - 14 * Math.sin(Math.PI * k)) });
      if (a >= s + 0.5 && a < s + 0.62) { S.feet = GY - 3; S.sy = 1.1; } // you hop as each heart lands
    }
  }
  function at(t) {
    const S = { fx: FX, feet: GY, depth: D_FIG, rot: 0, sx: 1, sy: 1, card: null, lit: 0, ox: 0, hearts: [] };
    if (t < LANDED) {
      // In on the tail of the map's lob, from off the left at the top of the arc.
      const L = Scene.land(cl(t * 1000 / LAND.ms), LAND.high * U);
      S.fx = FX - LAND.across * L.k;
      S.depth = D_FIG - LAND.back * U * L.k;
      S.feet = GY - L.z / U;
      S.rot = L.rot;
      if (!L.k) { S.sx = Scene.SQUASH.sx; S.sy = Scene.SQUASH.sy; }
      return S;
    }
    const a = t - START;
    // The weakest card is already held over your head while you choose: it rises there as you finish
    // landing. OFFER lobs it up onto the slab, where it narrows away in steps. The mount works out
    // where each of those is on screen.
    if (a <= 0) { S.card = { held: 2 * cl((t - LANDED) / (REST - LANDED)), w: 1 }; return S; }
    if (a < T_SLAB) { const u = a / T_SLAB; S.card = { hop: u, rot: 4 * u, w: 1 }; } // a lob like yours: steady across, a parabolic arc, one full spin at a steady rate (upright again at the slab; the landing stops it)
    else if (a < T_NARROW) S.card = { slab: true, w: 1, sq: a < T_SLAB + Scene.SQUASH.ms / 1000 }; // lands with the same squash you do
    else if (a < T_GONE) { const w = [1, 0.6, 0.2, 0][Math.floor((a - T_NARROW) * 7)]; if (w) S.card = { slab: true, w }; }
    S.lit = a < T_SLAB ? 0 : Math.min(20, Math.floor((a - T_SLAB) * 16));
    S.ox = a < T_NARROW ? wob(a, T_SLAB) : wob(a, T_SHIVER); // the pile shivers as the card lands, and again as it goes
    hearts(S, a, T_HEARTS, [100, 40]);
    return S;
  }

  /* ---------- the art (scene px) ---------- */
  const SKULL = ['....#####....', '..##wwwww##..', '.#wwwwwwwww#.', '#wwwwwwwwwww#', '#ww###w###ww#', '#ww###w###ww#', '#wwwwwwwwwww#', '.#wwww#wwww#.', '..#wwwwwww#..', '..#w#w#w#w#..', '...#######...'];
  const HEART = ['.11.11.', '1887881', '1888881', '.18881.', '..181..', '...1...'];
  const PYR = [[76, 80], [88, 80], [100, 80], [112, 80], [82, 70], [94, 70], [106, 70], [88, 60], [100, 60], [94, 50]]; // ten skulls, 4-3-2-1
  const COLS = [47, 142];                                                                                              // the two pillars' x
  const SK = PYR.concat([0, 1, 2, 3, 4].flatMap((i) => COLS.map((x) => [x, 92 - 8 * i])));                              // pyramid first, then the pillars bottom up
  const STEPS = [[73, 91, 55], [67, 95, 67], [61, 99, 79]];                                                            // the dais: x, y, width

  // A skull, 13 x 11, lit from the left; its eyes glow gold once awake.
  function skullArt({ P }, x, y, lit, ox) {
    x += ox;
    SKULL.forEach((r, j) => [...r].forEach((ch, i) => {
      if (ch === '#') P(x + i, y + j, lit && (j === 4 || j === 5) && (i === 4 || i === 5 || i === 7 || i === 8) ? 8 : 1);
      else if (ch === 'w') P(x + i, y + j, i >= 9 ? 6 : 7);
    }));
  }
  function heartArt({ P }, x, y) {
    HEART.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.') P(x + i, y + j, ch === '1' ? 1 : ch === '7' ? 7 : 8); }));
  }
  // Three stone steps with a lit lip, a shaded edge and gold runes down the front.
  function daisArt({ R }) {
    for (const [x, y, w] of STEPS) {
      R(x, y, w, 4, 1); R(x + 1, y + 1, w - 2, 1, 7); R(x + 1, y + 2, w - 2, 1, 6);
      for (let u = x + 4; u < x + w - 4; u += 4) R(u, y + 2, 2, 1, 8);
      R(x + w - 4, y + 1, 3, 2, 3);
    }
  }
  // The slab: ink edge, a gold rim along its top, a shaded foot, a horn at each end.
  function slabArt({ R }, ox) {
    R(85 + ox, 45, 31, 5, 1); R(86 + ox, 46, 29, 3, 6); R(86 + ox, 46, 29, 1, 8);
    R(86 + ox, 48, 29, 1, 3); R(100 + ox, 46, 1, 1, 1);
    R(85 + ox, 44, 3, 1, 1); R(113 + ox, 44, 3, 1, 1); R(86 + ox, 43, 1, 1, 8); R(114 + ox, 43, 1, 1, 8);
  }
  // A brazier on a pillar's top with a two-frame flame (stepped, never blinking).
  function flameArt({ R }, cx, y, f) {
    R(cx - 4, y + 4, 9, 3, 1); R(cx - 3, y + 4, 7, 2, 3); R(cx - 3, y + 4, 3, 1, 7);
    R(cx - 2, y + 1, 5, 3, 8);
    if (f) { R(cx - 1, y - 1, 3, 3, 8); R(cx, y - 3, 1, 3, 8); R(cx, y + 1, 1, 2, 7); }
    else { R(cx - 1, y - 2, 3, 3, 8); R(cx, y - 4, 1, 2, 8); R(cx - 1, y + 1, 1, 2, 7); }
  }
  function candleArt({ R }, x, y, f) {
    R(x, y, 3, 5, 1); R(x, y + 1, 2, 4, 7); R(x + 1, y - 1 - f, 1, 2, 8);
  }

  /* ---------- the stage ---------- */
  /* Build the scene in `stage` with the candles' heat (0..2, RunMap.SPIRE_ANTES). Returns
     draw(state) for at(t)'s states, with draw.alive(). */
  function mount(stage, heat, def) {
    const sc = Scene.mount(stage, { rows: 700, top: 90 });
    // The crypt: its own flagstone floor and arched wall. The altar's contact shadows go on its ground.
    const gnd = Scene.setting(sc, 'crypt', {
      heat,
      shadows: [[mx(61) + 8, D_ACT - 6, mx(140) + 24, D_ACT + 12], [mx(47) + 8, D_ACT - 6, mx(60) + 24, D_ACT + 12], [mx(142) + 8, D_ACT - 6, mx(155) + 24, D_ACT + 12]],
      over: { x0: 260, y0: 280, w: 460, h: 130 },
    });
    // The extra life: a bat crossing between the wall and the altar, slow, high and small.
    Scene.crosser(sc, { depth: -60, w: 13, h: 6, lift: 110, period: 12, draw: ({ R }, f) => { R(5, 2, 3, 3, 1); if (f) { R(0, 3, 5, 1, 1); R(8, 3, 5, 1, 1); } else { R(1, 0, 4, 2, 1); R(8, 0, 4, 2, 1); R(4, 1, 1, 1, 1); R(8, 1, 1, 1, 1); } } });
    // A crow beating across between the wall and the altar, lower and slower than the bat (two wing frames, 4 a second).
    Scene.crosser(sc, { depth: -90, w: 15, h: 8, lift: 55, period: 9, fps: 4, draw: ({ R }, f) => {
      R(4, 3, 6, 3, 1); R(10, 2, 3, 3, 1); R(13, 3, 2, 1, 8); R(1, 4, 3, 1, 1); R(11, 3, 1, 1, 7); // body, head, gold beak, tail, eye
      if (f) { R(4, 6, 2, 2, 1); R(6, 5, 3, 2, 1); } else { R(4, 0, 2, 3, 1); R(6, 1, 3, 2, 1); } // wings down, wings up
    } });
    const plane = (depth) => Scene.plane(sc, { left: mx(AX0), x0: AX0, depth, w: AW, h: GY });
    const act = plane(D_ACT), front = plane(D_FRONT), fig = Scene.figure(sc, { s: U });
    let shadowKey = '';
    // The offered card itself: the game's own card face over the scene, moved and narrowed to the
    // card's rectangle on its plane each frame (as the card turns, only its width changes).
    let face = null, fw = 1, fh = 1;
    if (def) {
      face = document.createElement('div');
      face.className = `card ${def.type}${def.token ? ' token' : ''} still`;
      face.innerHTML = cardInnerHTML(def);
      Object.assign(face.style, { position: 'absolute', left: '0', top: '0', margin: '0', transformOrigin: '0 0', pointerEvents: 'none', zIndex: '3', boxShadow: 'none' });
      face.style.transformOrigin = '50% 50%';
      stage.appendChild(face);
      fw = face.offsetWidth || 1; fh = face.offsetHeight || 1; // its natural size, measured while it shows
      face.style.display = 'none';
    }
    // Where the face goes is read off the screen, so perspective is already in it. Held over your head
    // it is anchored to your own rectangle (so it is over you wherever you stand); on the slab, to an
    // invisible standee in the scene standing there (a ruler); hopping, it blends between the two.
    // The ground is tilted, so rectangles are foreshortened in height: the face keeps its own
    // proportions, scaled from its width and standing on the foot of its anchor. Only its width
    // narrows as it turns.
    // The ruler is an empty copy of the altar's plane with a marker standing on the slab's top edge
    // (a thin bar CW wide), so it is projected exactly as the slab is drawn.
    const rulerPlane = sc.stand(document.createElement('div'), mx(AX0), D_ACT, AW * U, GY * U); // as Scene.plane stands the altar's
    const ruler = document.createElement('div');
    Object.assign(ruler.style, { position: 'absolute', left: (SLAB_MID - CW / 2 - AX0) * U + 'px', top: SLAB_TOP * U + 'px', width: CW * U + 'px', height: '1px' });
    rulerPlane.appendChild(ruler);
    const lerpA = (p, q, k) => p.map((v, i) => lerp(v, q[i], k));
    function placeFace(c) {
      if (!face) return;
      face.style.display = c ? '' : 'none';
      if (!c) return;
      const b = stage.getBoundingClientRect(), z = b.width / stage.offsetWidth, F = fig.el.getBoundingClientRect(), R = ruler.getBoundingClientRect();
      const lx = (x) => (x - b.left) / z - stage.clientLeft, ly = (y) => (y - b.top) / z - stage.clientTop;
      const ux = F.width / z / 18, uy = F.height / z / 18;                       // stage px per scene px: across, down
      const held = (n) => [lx((F.left + F.right) / 2), ly(F.top) - (2 + 3 * n) * uy, CW * ux / fw];
      const slab = [lx((R.left + R.right) / 2), ly(R.bottom), R.width / z / fw];
      let a = c.slab ? slab : c.hop != null ? lerpA(held(2), slab, c.hop) : held(c.held);
      if (c.hop != null) a = [a[0], a[1] - LOB * 4 * c.hop * (1 - c.hop) * uy, a[2]]; // the map's lob: 4H k (1 - k)
      const [cx, bottom, s] = a, sq = c.sq ? Scene.SQUASH : { sx: 1, sy: 1 }, sy = s * sq.sy;
      // About its middle, so the tumble turns it in place; a squash keeps its foot down.
      face.style.transform = `translate(${cx - fw / 2}px, ${bottom - fh * sy / 2 - fh / 2}px) rotate(${(c.rot || 0) * 90}deg) scale(${s * c.w * sq.sx}, ${sy})`;
    }

    function draw(S) {
      if (!sc.alive()) return;
      // Your contact shadow on the flagstones (smaller and thinner the higher you are).
      const z = (GY - S.feet) * U, key = [Math.round(S.fx), Math.round(S.depth), Math.round(z / 16)].join();
      if (key !== shadowKey) {
        shadowKey = key;
        gnd.clear();
        const r = Math.max(2.5, 6 - z / 80);
        gnd.shade(mx(S.fx) + 4, S.depth + 2, r * 1.3, r * 0.5);
      }
      // Behind you: the dais, candles, skulls, flames and the slab.
      const fl = Math.floor(performance.now() / 200) % 2;
      act.clear(); front.clear();
      daisArt(act.p);
      for (const x of [68, 131]) candleArt(act.p, x, 90, fl);
      for (const x of [63, 135]) candleArt(act.p, x, 94, 1 - fl);
      SK.forEach(([x, y], i) => skullArt(act.p, x, y, i < S.lit, i < PYR.length ? S.ox : 0));
      for (const x of COLS) flameArt(act.p, x + 6, 50, fl);
      slabArt(act.p, S.ox);
      // In front of you: the hearts coming back.
      for (const h of S.hearts) heartArt(front.p, h.x, h.y);
      fig.place({ x: mx(S.fx), y: S.depth, z, rot: S.rot, sx: S.sx, sy: S.sy });
      // The card, in your hands, in flight and on the slab: the real face over the scene. After
      // you are placed, since held it is anchored to where you are this frame.
      placeFace(S.card);
    }
    draw.alive = sc.alive;
    return draw;
  }

  /* PROPS: this scene's objects for other scenes and the builder (js/props.js): each { id, name, x0,
     w, cx (its middle), gy (its ground line), home: { x, depth } (where it stands in this scene),
     draw(pln, t, heat, sc) } in this file's scene px. */
  const PROPS = [{
    id: 'altar', name: 'skull altar', x0: 40, w: 125, cx: 100, gy: GY, home: { x: 100, depth: D_ACT },
    draw(pln, t) { // as draw(): the dais, candles, skulls, the pillars' braziers and the slab, at rest
      const p = pln.p, fl = Math.floor(t * 5) % 2;
      daisArt(p);
      for (const x of [68, 131]) candleArt(p, x, 90, fl);
      for (const x of [63, 135]) candleArt(p, x, 94, 1 - fl);
      SK.forEach(([x, y]) => skullArt(p, x, y, false, 0));
      for (const x of COLS) flameArt(p, x + 6, 50, fl);
      slabArt(p, 0);
    },
  }];
  return { mount, at, LANDED, REST, START, END, ENTER_CUES, CUES, PROPS };
})();
