'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the Bone Shrine (a ? stop event, see Run.shrine in js/run.js).
   A grand altar in the crypt (js/settings.js): a three-step dais, a pyramid of ten skulls under a
   gold-rimmed slab, and two pillars of skulls with a flame on top, candles on the steps. Your
   figurine lands beside it on the tail of the map's lob. OFFER YOUR WEAKEST lifts a card back over
   your head and hops it up onto the slab; every skull's eyes wake in turn, the card narrows away,
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
  const CW = 17, CH = 25;                // the offered card, in scene px (the real card face, scaled to fit)
  const SLAB_TOP = 43, SLAB_MID = 100.5;  // the slab's top edge (its horns) and middle: where the card rests
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
  const T_HOP = 0.5, T_SLAB = 1.3, T_NARROW = 2.6, T_GONE = 3.1, T_HEARTS = 3.2;
  const END = START + T_HEARTS + 0.8 + 0.5 + 0.7;
  const HEART_CUES = [0, 1, 2].map((i) => [START + T_HEARTS + 0.4 * i + 0.5, 'heal']);
  const ENTER_CUES = [[LAND.ms / 1000, 'land']];
  const CUES = [[START, 'select'], [START + T_SLAB, 'place'], ...[0, 1, 2, 3, 4].map((i) => [START + T_SLAB + 0.25 * i, 'tally']),
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
    if (a <= 0) return S; // waiting (REST is START): no card until you offer it
    // The card is held above your head, clear of you, and rises in three steps; five hops take it up
    // onto the slab; there it narrows away in steps. The mount works out where each of those is on screen.
    if (a < T_HOP) S.card = { held: 2 * a / T_HOP, w: 1 };                              // rises smoothly
    else if (a < T_SLAB) { const u = (a - T_HOP) / (T_SLAB - T_HOP); S.card = { hop: u * u * (3 - 2 * u), w: 1 }; } // one eased flight
    else if (a < T_NARROW) S.card = { slab: true, w: 1 };
    else if (a < T_GONE) { const w = [1, 0.6, 0.2, 0][Math.floor((a - T_NARROW) * 7)]; if (w) S.card = { slab: true, w }; }
    S.lit = a < T_SLAB ? 0 : Math.min(20, Math.floor((a - T_SLAB) * 16));
    S.ox = wob(a, 2.9);
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
      Object.assign(face.style, { position: 'absolute', left: '0', top: '0', margin: '0', transformOrigin: '0 0', pointerEvents: 'none', zIndex: '3' });
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
    const ruler = sc.stand(document.createElement('div'), mx(SLAB_MID - CW / 2), D_ACT - CH * U, CW * U, CH * U);
    ruler.style.transform = `translateZ(${(GY - SLAB_TOP) * U}px) rotateX(-90deg)`;
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
      if (c.hop != null) a = [a[0], a[1] - 24 * uy * Math.sin(Math.PI * c.hop), a[2]];
      const [cx, bottom, s] = a, w = fw * s * c.w;
      face.style.transform = `translate(${cx - w / 2}px, ${bottom - fh * s}px) scale(${s * c.w}, ${s})`;
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
      // The card, in your hands, in flight and on the slab: the real face over the scene.
      placeFace(S.card);
      // In front of you: the hearts coming back.
      for (const h of S.hearts) heartArt(front.p, h.x, h.y);
      fig.place({ x: mx(S.fx), y: S.depth, z, rot: S.rot, sx: S.sx, sy: S.sy });
    }
    draw.alive = sc.alive;
    return draw;
  }

  return { mount, at, LANDED, REST, START, END, ENTER_CUES, CUES };
})();
