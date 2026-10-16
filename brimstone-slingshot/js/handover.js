'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the hand-over (four ? stop events, see Run.handover in js/run.js):
   the Dealer's Offer, the Lost Spellslinger, the Reliquary and the Bone Pile.
   Your figurine lands in the middle on the tail of the map's lob. A pair of gold eyes opens in the
   orrery sky and the Pit Boss's two floating hands (the run map's encore art, RunMap.handArt) slide
   in from either side, fingers pointing at you, one with a card pinched in its fingertips.
     give    the right hand's card floats over to your head and turns over     (Offer, Bone Pile)
     swap    you raise your weakest card, the left hand takes it, the right hand hands over a new one
     relic   a card in each hand behind a portcullis; you pay 6 life (hearts), both gates rise and
             both cards float to you to choose from
     pile    (Bone Pile) heaps of bones lie on the ground under the hovering hands
   The card backs turn in the scene, then the real faces open over it (.dr-pick, as Bone Draft).
   Built on the scene kit (js/scene.js): only the hands' timeline, the eyes, the heaps and the
   portcullis are its own.
   Scene px: the action is laid out on upright planes in scene pixels of 4 map units, x across
   and y down from the sky to the ground at GY. A hand pixel is a scene px.
   ============================================================ */

const Handover = (() => {
  const U = 4, GY = 106, CX = 75;         // map units a scene px; the ground's scene y; your scene x
  const mx = (x) => 720 + (x - 75) * U;  // a scene x as a plane x (map units)
  const D_ACT = 380, D_FIG = 396, D_FRONT = 404; // depths (plane y): the hands, you, what's in front of you
  const AX0 = -55, AW = 260;              // the upright planes' left edge and width (scene px), from the sky (y 0) to GY
  const LAND = { across: 90, back: 10, high: 40, ms: 700 }; // the entrance, in scene px: the tail of the map's lob, from the left
  const CAM = { rows: 860, top: 300 };    // the camera (Scene.mount): pulled back and down so the orrery sky shows above the ruins
  const FAR = -380;                      // where the ash ends (plane y): near enough that the orrery sky shows over a wall of spires
  const { bay, cl, CARD } = Scene;
  const { HAND, handArt } = RunMap;
  const ease = (k) => k * k * (3 - 2 * k), mix = (a, b, k) => a + (b - a) * k;
  const nz = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

  const Y = GY - 50, LX = 15, RX = 135;   // a hand's anchor height (floating well off the ground); where the hands rest (scene x)
  const HEAD = { x: CX - 7, y: GY - 42 }; // the card over your head (its top left)
  const CARDS_AT = [CX, 56];              // where the real faces open, over your head (Run.handover places them)
  const LANDED = LAND.ms / 1000 + Scene.SQUASH.ms / 1000, ARRIVE = 1.4, REST = 2.5; // the hands slide in over 1 s from ARRIVE; you wait at REST
  const EYES = { w: 100, h: 90, u: 14, y: 79 }; // the eyes' far-off plane (scene px of 8 map units) and where their middle is on it
  const GATE = { l: 47, r: 91, h: 70 };   // the portcullises' left edges and height
  const TURN_S = 3 / 7;                   // the backs turn in three frames at 7 a second

  /* ---------- the timelines ---------- */
  /* Times in seconds, from the entrance (0) through REST (waiting for your choice) to END. `take` is
     when the card sets off for your head, `turn` when it starts to turn over; at `turned` its face
     takes over (the real card opens in its place) and the hands leave. */
  const TL = {
    give: { take: 2.8, fly: 0.6, turn: 3.4 },
    swap: { a: 2.65, aTake: 3.3, take: 3.9, fly: 0.6, turn: 4.5 },
    relic: { hearts: 2.6, gate: 3.2, take: 3.8, fly: 0.6, turn: 4.4 },
  };
  for (const T of Object.values(TL)) { T.turned = T.turn + TURN_S; T.end = T.turned + 1.2; }

  /* make({ mode: 'give' | 'swap' | 'relic', pile, gold }) builds one event's scene: `pile` lays
     heaps of bones under the hands, `gold` frames the card backs in gold (rare or better). Returns
     { at, mount, REST, TURNED, END, ENTER_CUES, CUES, CARDS_AT }.
     at(t) is the scene's whole state at t seconds, with no DOM:
       { t, hero: { fx, feet, depth, rot, sx, sy }, eyes: { open, lx, ly }, bob (the hands hover),
         hands: [{ side (-1 left, 1 right), x, y: the anchor, a: 0 gone .. 1 arrived }],
         cards: [{ on: 'L' | 'R' } held in that hand, or { x, y, f: turn frame 0..2, gold, head } free],
         hearts: [[x, y]], gates: [left, right] raised 0..1 or null } */
  function make({ mode, pile = false, gold = false }) {
    const T = TL[mode], { turned: TURNED, end: END } = T;
    // The stage's edges in scene x, measured by mount (Scene.span): l, r for the hands, fig for your lob. Until then, the old fixed offsets.
    const off = { l: Infinity, r: -Infinity, fig: Infinity };
    const fly = (u, arc, a, b) => ({ x: mix(a.x, b.x, u), y: mix(a.y, b.y, u) - Math.sin(Math.PI * u) * arc });
    function at(t) {
      const L = Scene.land(cl(t * 1000 / LAND.ms), LAND.high * U);
      const S = {
        t, hero: { fx: CX - Math.max(LAND.across, CX - off.fig) * L.k, feet: GY - L.z / U, depth: D_FIG - LAND.back * U * L.k, rot: L.rot, sx: 1, sy: 1 },
        eyes: { open: t < 0.9 ? 0 : t < 1.3 ? [0.35, 0.7, 1][Math.floor((t - 0.9) * 7)] : 1, lx: t < 1.5 ? 0 : t < 1.9 ? -1 : t < 2.3 ? 1 : 0, ly: 0.4 },
        hands: [], cards: [], hearts: [], gates: null, bob: t >= ARRIVE + 1 && t < TURNED,
      };
      if (t < LANDED && !L.k) { S.hero.sx = Scene.SQUASH.sx; S.hero.sy = Scene.SQUASH.sy; }
      if (t >= END - 0.65) S.eyes.open = [0.7, 0.35, 0][Math.min(2, Math.floor((t - END + 0.65) * 7))]; // the eyes close as the hands leave
      // The hands slide in from either side (or rise out of the heaps) and leave the way they came.
      const ax = mode === 'relic' ? [0, 150] : [LX, RX];
      const hand = (side, tx, ex) => {
        const a = ease(cl(t - ARRIVE)) * (1 - ease(cl(t - ex))), o = [side < 0 ? Math.min(-130, off.l - HAND.w - tx) : Math.max(130, off.r + HAND.w - tx), 0]; // from past the stage's edge
        return { side, x: tx + o[0] * (1 - a), y: Y + o[1] * (1 - a), a };
      };
      S.hands.push(hand(-1, ax[0], TURNED + 0.1), hand(1, ax[1], TURNED));
      const FROM = { L: { x: ax[0] + 30, y: Y - 10 }, R: { x: ax[1] - 45, y: Y - 10 } };
      const stoop = (t0, t1) => { if (t >= t0 && t < t1) { S.hero.sx = 1.05; S.hero.sy = 0.88; } };
      const hop = (t0) => { const i = Math.floor((t - t0) * 7); if (i >= 0 && i < 4) S.hero.feet = GY - [0, 3, 4, 2][i]; };
      const turn = (t0) => (t < t0 ? 0 : Math.min(2, Math.floor((t - t0) * 7)));
      const head = (c, f) => S.cards.push({ x: c.x, y: c.y, f, gold, head: true });
      if (mode === 'give') {
        stoop(T.take - 0.15, T.take); hop(T.turn);
        if (t < T.take) S.cards.push({ on: 'R', gold });
        else head(fly(ease(cl((t - T.take) / T.fly)), 10, FROM.R, HEAD), turn(T.turn));
      } else if (mode === 'swap') {
        // Your weakest card (a plain back) rises over your head, goes to the left hand; the right hand's card comes to you.
        stoop(T.a - 0.15, T.a); hop(T.turn);
        const uA = ease(cl((t - T.aTake) / T.fly));
        if (t >= T.a && t < T.aTake) S.cards.push({ x: HEAD.x, y: HEAD.y + (1 - Math.floor(cl((t - T.a) / 0.5) * 3) / 3) * 14, f: 0, gold: false });
        else if (t >= T.aTake && uA < 1) S.cards.push({ ...fly(uA, -9, HEAD, FROM.L), f: 0, gold: false });
        else if (t >= T.aTake) S.cards.push({ on: 'L', gold: false });
        if (t < T.take) S.cards.push({ on: 'R', gold: false });
        else S.cards.push({ ...fly(ease(cl((t - T.take) / T.fly)), 10, FROM.R, HEAD), f: turn(T.turn), gold: false, head: true });
      } else {
        // Pay (hearts leave you), both gates rise, both cards float to you.
        stoop(T.hearts, T.hearts + 0.15); hop(T.turn);
        if (t >= T.hearts && t < T.hearts + 0.6) { const st = Math.floor((t - T.hearts) * 7); for (let i = 0; i < 3; i++) S.hearts.push([CX - 5 + [-7, 0, 7][i], GY - 24 - st * 5 - (i % 2) * 3]); }
        const g = Math.floor(cl((t - T.gate) / 0.5) * 3) / 3;
        S.gates = [g, g];
        if (t < T.take) S.cards.push({ on: 'L', gold }, { on: 'R', gold });
        else {
          const u = ease(cl((t - T.take) / T.fly)), f = turn(T.turn);
          head(fly(u, 10, FROM.L, { x: HEAD.x - 10, y: HEAD.y }), f);
          head(fly(u, 10, FROM.R, { x: HEAD.x + 10, y: HEAD.y }), f);
        }
      }
      if (t >= TURNED) S.cards = S.cards.filter((c) => !c.head); // the real faces are open over the scene now
      return S;
    }
    // Sounds on the way: [time, name, n]. ENTER_CUES for the entrance, CUES for the rest.
    const ENTER_CUES = [[LAND.ms / 1000, 'land'], [0.9, 'bell'], [ARRIVE + 1, 'land']];
    const CUES = (mode === 'give' ? [[T.take, 'twang'], [T.take + T.fly, 'place']]
      : mode === 'swap' ? [[T.aTake, 'place'], [T.take, 'place']]
        : [[T.hearts, 'hit'], [T.gate, 'lever'], [T.take, 'twang']]).concat([[T.turn, 'place'], [TURNED, 'tally']]);
    return { at, mount: (stage, heat) => mount(stage, heat, { mode, pile, off }), REST, TURNED, END, ENTER_CUES, CUES, CARDS_AT };
  }

  /* ---------- the art (scene px) ---------- */
  /* The Pit Boss's eyes (RunMap.eyesArt, at 0.7 and in scene px so they sit in the sky over the
     scene): a gold iris in a dark patch that thins out into the sky round it. open 0..1 is how far
     the lids are apart (under 0.15: shut); lx, ly (-1..1) is where they look. */
  function eyes(p, cx, cy, open, lx, ly) {
    const k = 0.7, RX = 25, RY = 13, FADE = 1.1, CORE = 0.45;
    const top0 = (u) => (-2.5 - 0.08 * u + 2.5 * (u / 16) ** 4) * 1.6, bot0 = (u) => (2.5 - 3 * (u / 16) ** 2) * 1.6;
    const md = (u) => (top0(u / k) + bot0(u / k)) / 2 * k;
    const tp = (u) => Math.round(md(u) + (top0(u / k) * k - md(u)) * open), bt = (u) => Math.round(md(u) + (bot0(u / k) * k - md(u)) * open);
    for (const s of [-1, 1]) {
      const ex = cx + s * 24, Q = (u, v, c) => p.P(ex + s * u, cy + v, c);
      for (let u = -23; u <= 23; u++) for (let v = -12; v <= 12; v++) {
        const d = Math.hypot(u / (RX * k), v / (RY * k));
        if (d < CORE || (d < FADE && bay(ex + s * u, cy + v) < 16 * (FADE - d) / (FADE - CORE))) Q(u, v, 0);
      }
      if (open < 0.15) { for (let u = -13; u <= 13; u++) { Q(u, Math.round(md(u)), 0); Q(u, Math.round(md(u)) - 1, 0); } continue; }
      const iu = s * lx * 6 * k, iv = ly * 2 * k;
      for (let u = -11; u <= 11; u++) for (let v = tp(u); v <= bt(u); v++) {
        const d = Math.hypot(u - iu, v - iv) / k;
        Q(u, v, d < 1.8 ? 0 : d < 3.2 ? 8 : d < 4 ? 1 : v <= tp(u) ? 0 : v > md(u) ? 2 : 1);
      }
      if (open > 0.6) Q(Math.round(iu) - 1, Math.max(tp(Math.round(iu)), Math.round(iv) - 1), 7);
      for (let u = -13; u <= 13; u++) { Q(u, tp(u) - 1, 0); Q(u, tp(u) - 2, 0); }
      for (let u = -10; u <= 10; u++) Q(u, bt(u) + 1, 0);
    }
  }

  /* A heap of bones centered on scene x cx, drawn over the hand so it rises out from behind it: the
     mound (darker than the ash so the pale bones stand out on it, lit on the left, shaded on the
     right and at its foot), bones scattered over it, and a skull on top. */
  function heap({ P, R }, cx) {
    const HW = 24, hh = (x) => Math.round(18 * Math.max(0, 1 - ((x - cx) / HW) ** 2) ** 0.8);
    for (let x = cx - HW; x <= cx + HW; x++) for (let y = GY - hh(x); y <= GY; y++) P(x, y, y === GY - hh(x) ? 1 : y >= GY - 1 ? 2 : x > cx + 3 ? (bay(x, y) < 10 ? 2 : 3) : bay(x, y) < 8 ? 3 : 4);
    for (let i = 0; i < 16; i++) {
      const bx = cx - HW + 3 + Math.floor(nz(i, cx) * (HW * 2 - 10)), by = GY - 2 - Math.floor(nz(i, cx + 1) * Math.max(1, hh(bx + 2) - 4));
      R(bx, by, 5, 2, 1); R(bx + 1, by, 3, 1, 7); P(bx - 1, by - 1, 1); P(bx + 5, by + 1, 1);
    }
    R(cx - 3, GY - 22, 6, 5, 1); R(cx - 2, GY - 21, 4, 3, 7); P(cx - 2, GY - 20, 1); P(cx + 1, GY - 20, 1);
  }

  // A portcullis: iron bars hanging from a lintel, drawn up into it as `open` goes 0..1. Bars are 2 px so they stay solid under the CRT.
  function gate({ R }, x0, open) {
    const len = Math.round(GATE.h * (1 - open));
    for (let i = 0; i < 4; i++) { R(x0 + i * 4, GY - GATE.h, 2, len, 1); R(x0 + i * 4, GY - GATE.h, 1, len, 3); }
    R(x0 - 2, GY - GATE.h - 3, 16, 3, 1); R(x0 - 2, GY - GATE.h - 3, 16, 1, 4);
  }

  // A heart (5 x 5), gold with an ink shade to its lower right.
  const heart = ({ P, R }, x, y) => { for (const [o, k] of [[1, 1], [0, 8]]) { R(x + o, y + o, 2, 1, k); R(x + 3 + o, y + o, 2, 1, k); R(x + o, y + 1 + o, 5, 2, k); R(x + 1 + o, y + 3 + o, 3, 1, k); P(x + 2 + o, y + 4 + o, k); } };

  /* ---------- the stage ---------- */
  /* Build the scene in `stage` with the spires' heat (0..2, RunMap.SPIRE_ANTES). Returns draw(state)
     for at(t)'s states, with draw.alive() and draw.toStage(x, y) (a scene point on the hands' plane,
     in stage px). The hands hover (a stepped bob) while you wait, on the scene's own timer. */
  function mount(stage, heat, { mode, pile, off }) {
    const sc = Scene.mount(stage, CAM);
    // Where the screen's edges are, so the hands and your lob come in from off screen at any stage size.
    const sx = (X) => (X - 720) / U + 75, [hl, hr] = Scene.span(sc, D_ACT, (GY - Y) * U), [fl] = Scene.span(sc, D_FIG, LAND.high * U);
    Object.assign(off, { l: sx(hl), r: sx(hr), fig: sx(fl) - 24 });
    const x0 = Math.min(AX0, Math.floor(off.l) - HAND.w - 10), w = Math.max(AX0 + AW, Math.ceil(off.r) + HAND.w + 10) - x0;
    const gnd = Scene.ground(sc, {
      x0: -1200, y0: FAR, w: 1920, h: (800 - FAR) / 2,
      light: (X, Y) => 1.2 - Math.hypot((X - 620) / 1300, (Y - 380) / 900),
      rubble: [[250, 450, 3], [470, 476, 2], [1010, 400, 2], [300, 380, 2], [1150, 440, 3], [-80, 300, 3], [1560, 330, 3], [640, 120, 2]],
      shards: [[1000, 470], [1120, 410], [210, 416], [1380, 380], [80, 360]],
      shadows: [],
      over: { x0: 260, y0: 280, w: 460, h: 130 },
    });
    // The ruins: spires scattered to the horizon, and these framing the scene, with the ante's strata spires.
    // The big spires stand to either side; the middle, where the eyes watch from, has only short ones.
    const near = [[-60, 150, 'spike', 96, 24], [-30, 210, 'spike', 80, 22], [-10, 170, 'spike', 92, 24], [14, 250, 'basalt', 44, 24], [-42, 160, 'spike', 80, 22],
      [138, 240, 'basalt', 40, 24], [160, 150, 'spike', 88, 22], [180, 200, 'spike', 96, 24], [205, 140, 'spike', 84, 22]].map(([sx, d, k, h, w]) => ({ k, x: mx(sx), d, h, w, l: 3 }));
    // A field of medium spires through the middle, behind the hands: low far back and taller toward you,
    // so their tips stay under the eyes.
    const RS = mulberry32(17);
    for (let i = 0; i < 30; i++) {
      const sx = 5 + RS() * 140, d = -150 + RS() * 480, t = (d + 150) / 480, h = Math.round(40 + RS() * (30 + t * 70));
      if (Math.abs(sx - CX) < 16 && d > 150) continue; // keep your own ground clear
      near.push({ k: RS() < 0.15 ? 'basalt' : 'spike', x: mx(sx), d, h, w: Math.round(h * 0.27), l: d < -100 ? 2 : 3 });
    }
    [[-25, 190, 116, 32], [175, 200, 124, 36], [192, 130, 96, 28]].slice(0, heat + 1)
      .forEach(([sx, d, h, w], i) => near.push({ k: 'strata', x: mx(sx), d, h: Math.round(h * (1 + heat * 0.12)), w, l: 3, seed: 3 + i }));
    Scene.ruins(sc, { area: { x0: -1170, x1: 2610, y0: FAR, y1: 300 }, clear: { x0: 340, x1: 1100, y: FAR }, near, heat, count: 150, wall: 0.3 }); // a low far row, and nothing scattered in the middle at any depth, so the eyes show

    // The upright planes: the eyes, hands and gates behind you; the cards and hearts in front of you.
    const plane = (depth) => Scene.plane(sc, { left: mx(x0), x0, depth, w, h: GY }); // wide enough for the hands to start off screen
    const act = plane(D_ACT), front = plane(D_FRONT), fig = Scene.figure(sc, { s: U });
    // The Pit Boss hides far back, behind every spire, his eyes glinting between them: a big plane at the far edge of the ash.
    const watch = Scene.plane(sc, { left: mx(CX) - EYES.w * EYES.u / 2, x0: CX - EYES.w / 2, depth: FAR - 20, w: EYES.w, h: EYES.h, u: EYES.u });
    const hands = { 1: document.createElement('canvas'), '-1': document.createElement('canvas') };
    for (const [side, cv] of Object.entries(hands)) { cv.width = HAND.w; cv.height = HAND.h; handArt(cv, sc.C, 'open', side < 0); }
    let shadowKey = '', last = null;

    function draw(S) {
      if (!sc.alive()) return;
      last = S;
      // The hands hover: a step down every 0.4 s, the two out of step.
      const b = Math.floor(performance.now() / 400);
      const hs = S.hands.map((h) => ({ ...h, y: h.y + (S.bob ? (b + (h.side > 0 ? 0 : 1)) % 2 : 0) }));
      // Contact shadows on the ash: yours (smaller and thinner the higher you are) and each hand's.
      const z = (GY - S.hero.feet) * U, shown = hs.filter((h) => h.a > 0.02);
      const key = [Math.round(S.hero.fx), Math.round(S.hero.depth), Math.round(z / 16), ...shown.map((h) => Math.round(h.x))].join();
      if (key !== shadowKey) {
        shadowKey = key;
        gnd.clear();
        const r = Math.max(2.5, 6 - z / 80);
        gnd.shade(mx(S.hero.fx) + 4, S.hero.depth + 2, r * 1.3, r * 0.5);
        for (const h of shown) gnd.shade(mx(h.x - 8 * h.side) + 4, D_ACT + 2, 12, 4);
      }
      // Behind you: the eyes in the sky, the heaps, the hands with the cards in their fingers, the gates.
      act.clear(); front.clear(); watch.clear();
      const p = act.p, g = act.g, held = (c) => { const h = hs[c.on === 'L' ? 0 : 1]; return { x: c.on === 'L' ? h.x + 30 : h.x - 45, y: h.y - 10 }; };
      eyes(watch.p, CX, EYES.y, S.eyes.open, S.eyes.lx, S.eyes.ly);
      if (pile) { heap(p, LX + 10); heap(p, RX - 10); } // the bones lie on the ground; the hands float over them
      for (const c of S.cards) if (c.on) { const at = held(c); Scene.cardArt(p, Math.round(at.x), Math.round(at.y), c.gold); }
      for (const h of hs) act.art(hands[h.side], Math.round(h.x - HAND.ax), Math.round(h.y - HAND.ay), U / 2);
      if (S.gates) { gate(p, GATE.l, S.gates[0]); gate(p, GATE.r, S.gates[1]); }
      // In front of you: the cards over your head, the hearts leaving you.
      for (const c of S.cards) if (!c.on) Scene.cardArt(front.p, Math.round(c.x), Math.round(c.y), c.gold, CARD.TURN[c.f]);
      for (const [x, y] of S.hearts) heart(front.p, x, y);
      fig.place({ x: mx(S.hero.fx), y: S.hero.depth, z, rot: S.hero.rot, sx: S.hero.sx, sy: S.hero.sy });
    }
    sc.every(400, () => { if (last) draw(last); });
    draw.alive = sc.alive;
    draw.toStage = (x, y) => Scene.toStage(sc, act, x, y);
    return draw;
  }

  return { make, CARDS_AT, LAND };
})();
