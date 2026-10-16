'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — Bone Draft (a ? stop event, see Run.draft in js/run.js).
   A giant booster pack stands sealed in the brimstone ruins. Your figurine lands in a slingshot
   beside it on the tail of the map's lob; TEAR IT OPEN draws the slingshot back and lobs you over
   the pack to catch its far corner. The strip sticks halfway, you dangle and kick until it snaps,
   it lands on your head, and the three cards rise out of the torn top and turn face up.
   Built on the scene kit (js/scene.js): only the pack, its strip, the rising cards and the
   timeline are its own.
   Scene px: the action is laid out on upright planes in scene pixels of 4 map units, x across
   (the pack spans PX0..PX0 + PW) and y down from the sky to the ground at GY.
   ============================================================ */

const Draft = (() => {
  const U = 4, GY = 103;                  // map units a scene px; the ground's scene y
  const mx = (x) => 720 + (x - 75) * U;  // a scene x as a plane x (map units): scene x 75 is the middle
  const D_ACT = 380, D_FIG = 396, D_FRONT = 404; // depths (plane y): the pack and slingshot, you, what's in front of you
  const PX0 = 54, PW = 52, PT = 26, SY = PT + 4; // the pack: left edge, width, top row; its top strip's middle row
  const FX = 18, PF = GY - 28;            // the slingshot's foot (scene x), and your feet in its pouch (Scene.slingshot's rest)
  const AX0 = -12, AW = 174;              // the upright planes' left edge and width (scene px); they run from the sky (y 0) to GY
  // The entrance, in scene px (x 4 for map units): the tail of the map's lob, as Run.bowl's BOWL_LAND.
  const LAND = { across: 80, back: 10, high: 40, ms: 700 };
  // Where the stage's edge falls in scene x (Scene.span, measured by mount), so the lob starts off screen at any stage size.
  let EDGE = Infinity;
  const { bay, cl, CARD } = Scene;

  /* ---------- the timeline ---------- */
  /* What the scene shows at time t (seconds): the entrance runs 0..LANDED, you wait in the pouch
     at REST, and TEAR IT OPEN plays PULL..END. Stepped parts move in whole frames (pull 6 a second,
     kicks 6, cards 7); flights move smoothly and tumble in quarter turns, ending upright.
     { fx, feet: scene x and y of your feet, depth: plane y you stand at, rot: quarter turns,
       sx, sy: squash, sl: the pouch's pull { dx, dy }, ox: the pack's wobble, tear: strip columns
       torn off (from the right), rib: the strip in your hand { sag, hand, len }, fall: the strip
       dropping, drape: on your head, lie: on the ground (scene x), cards: seconds since they rose,
       turn: how far they have turned over (0..2) } */
  // The cards are up by SNAP + 2.44; at TURNS they start to turn over (two frames at 7 a second),
  // and at END their faces take over (Run.draft), opening from where the backs left off.
  const LANDED = LAND.ms / 1000 + Scene.SQUASH.ms / 1000, REST = 1, PULL = 1.4, SNAP = 3.95, TURNS = SNAP + 2.6, END = TURNS + 2 / 7;
  const KICK = [0, 4, 1, 5, 0];
  const wob = (t, t0) => [1, -1, 1, 0][Math.min(3, Math.floor((t - t0) * 10))];
  function at(t) {
    const S = { fx: FX, feet: PF, depth: D_FIG, rot: 0, sx: 1, sy: 1, sl: { dx: 0, dy: 0 }, ox: 0, tear: 0, rib: null, fall: null, drape: null, lie: null, cards: -1, turn: 0 };
    const sag = () => { S.rib = { sag: [PX0 + PW - S.tear, SY], hand: [S.fx, S.feet - 16], len: S.tear }; };
    const squash = () => { S.sx = Scene.SQUASH.sx; S.sy = Scene.SQUASH.sy; };
    if (t < LANDED) {
      // In on the tail of the map's lob, from off the left at the top of the arc, into the pouch.
      const L = Scene.land(cl(t * 1000 / LAND.ms), LAND.high * U);
      S.fx = FX - Math.max(LAND.across, FX - EDGE) * L.k;
      S.depth = D_FIG - LAND.back * U * L.k;
      S.feet = PF - L.z / U;
      S.rot = L.rot;
      if (!L.k) { squash(); S.sl.dy = 1; } // land with a squash; the pouch dips
    } else if (t < PULL) {
      // Waiting in the pouch.
    } else if (t < 2) {
      const st = Math.min(3, Math.floor((t - PULL) * 6)), d = [0, 3, 6, 8][st], e = [0, 2, 4, 5][st];
      S.sl = { dx: -d, dy: e }; S.fx = FX - d; S.feet = PF + e;
    } else if (t < 2.6) {
      // The lob: high over the pack, coming down on its far corner.
      const k = (t - 2) / 0.6, a = (1 - k) ** 2, b = 2 * k * (1 - k), c = k * k;
      S.fx = a * (FX - 8) + b * 60 + c * 108; S.feet = a * (PF + 5) + b * -50 + c * 46;
      S.rot = Math.floor(k * 4) % 4;
      S.sl.dx = t < 2.08 ? 3 : 0; // the pouch snaps past rest for a frame
    } else if (t < 2.85) {
      S.fx = 108; S.feet = 46; S.ox = wob(t, 2.6); // caught: hanging off the corner
    } else if (t < 3.15) {
      // Drop: the strip tears from the right, then sticks.
      const k = (t - 2.85) / 0.3;
      S.fx = 108 - 4 * k; S.feet = 46 + 15 * k; S.tear = Math.round(22 * k); S.ox = wob(t, 2.85);
      sag();
    } else if (t < SNAP) {
      // Dangle and kick: each kick tears a little more.
      const st = Math.min(4, Math.floor((t - 3.15) * 6));
      S.fx = 104 + (st % 2 ? -1 : 1); S.feet = 61 - KICK[st]; S.sy = st % 2 ? 0.9 : 1; S.tear = 22 + st * 2; S.ox = -(st % 2);
      sag();
    } else {
      // It snaps: you fall, it flutters down onto your head, you shake it off, the cards rise.
      const cx = 103, k = cl((t - SNAP) / 0.35);
      S.fx = cx; S.tear = PW;
      if (t < SNAP + 0.35) S.feet = 61 + (GY - 61) * k * k;
      else { S.feet = GY; if (t < SNAP + 0.47) squash(); }
      if (t < SNAP + 0.5) S.fall = [cx - 14, SY + 2 + (GY - 20 - SY) * cl((t - SNAP) / 0.5)];
      else if (t < SNAP + 1) S.drape = [cx, GY - 16];
      else {
        S.lie = 112;
        if (t < SNAP + 1.25) { const q = (t - SNAP - 1) / 0.25; S.feet = GY - Math.round(6 * Math.sin(Math.PI * q)); S.sx = Math.floor(q * 6) % 2 ? 0.9 : 1.1; }
        else { S.cards = t - SNAP - 1.3; S.turn = t < TURNS ? 0 : Math.min(2, 1 + Math.floor((t - TURNS) * 7)); }
      }
    }
    return S;
  }
  // Sounds on the way: [time, name, n]. ENTER_CUES for the entrance, CUES for the opening.
  const ENTER_CUES = [[LAND.ms / 1000, 'land']];
  const CUES = [[PULL, 'vsPull'], [2, 'twang'], [2.6, 'place'], [2.85, 'rip', 1], [3.32, 'rip', 1], [3.65, 'rip', 1], [SNAP, 'rip', 3],
    [SNAP + 0.35, 'land'], [SNAP + 1, 'select'], [SNAP + 1.3, 'tally'], [SNAP + 1.44, 'tally'], [SNAP + 1.58, 'tally'], [TURNS, 'place']];

  /* ---------- the art (scene px) ---------- */
  const FONT = { B: ['11.', '1.1', '11.', '1.1', '11.'], O: ['111', '1.1', '1.1', '1.1', '111'], N: ['11.', '1.1', '1.1', '1.1', '1.1'], E: ['111', '1..', '11.', '1..', '111'],
    D: ['11.', '1.1', '1.1', '1.1', '11.'], R: ['11.', '1.1', '11.', '1.1', '1.1'], A: ['.1.', '1.1', '111', '1.1', '1.1'], F: ['111', '1..', '11.', '1..', '1..'], T: ['111', '.1.', '.1.', '.1.', '.1.'] };
  const SKULL = ['....#####....', '..##wwwww##..', '.#wwwwwwwww#.', '#wwwwwwwwwww#', '#ww###w###ww#', '#ww###w###ww#', '#wwwwwwwwwww#', '.#wwww#wwww#.', '..#wwwwwww#..', '..#w#w#w#w#..', '...#######...'];

  /* The pack: foil lit from the left with a dithered shaded side and a sheen, gold crimped seams
     top and bottom, crossed bones and a skull, and the BONE DRAFT banner. `tear` columns of the
     top strip are torn off from the right, leaving a jagged edge over a dark slit. ox: wobble. */
  function packArt({ P, R }, ox, tear) {
    const X0 = PX0 + ox, torn = (u) => u >= PW - tear, T = PT;
    for (let u = 0; u < PW; u++) {
      const x = X0 + u, ed = u === 0 || u === PW - 1, tn = torn(u);
      if (!tn) { if (u % 2 === 0) P(x, T, 1); P(x, T + 1, 1); for (let y = T + 2; y < T + 8; y++) P(x, y, ed ? 1 : u % 3 === 0 ? 3 : u < 3 ? 7 : 8); P(x, T + 8, 1); }
      else { const j = (u * 7) % 3 === 0; P(x, j ? T + 7 : T + 8, 1); if (j) P(x, T + 8, 7); P(x, T + 9, ed ? 1 : 2); P(x, T + 10, ed ? 1 : 2); }
      for (let y = tn ? T + 11 : T + 9; y < 96; y++) {
        let k;
        if (ed) k = 1;
        else if (y === T + 9) k = 3; // the crimp's shadow
        else if (u <= 2) k = 7;
        else if (u >= PW - 4) k = 3;
        else if (u >= PW - 8) k = bay(x, y) < (u - (PW - 9)) * 4 ? 3 : 4;
        else k = (u - y + 400) % 24 < 2 ? 5 : 4; // the foil's sheen
        P(x, y, k);
      }
      P(x, 96, 1); for (let y = 97; y < GY - 1; y++) P(x, y, ed ? 1 : u % 3 === 0 ? 3 : u < 3 ? 7 : 8); P(x, GY - 1, 1); // its foot on the ground
    }
    // Crossed bones (outlined as one, then filled), the skull over them, the banner.
    const cx = X0 + PW / 2, cy = T + 25, bones = [[cx - 11, cy - 9, cx + 11, cy + 11], [cx + 11, cy - 9, cx - 11, cy + 11]];
    for (const pass of [0, 1]) for (const [x0, y0, x1, y1] of bones) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; if (!pass) R(x - 2, y - 2, 4, 4, 1); else R(x - 1, y - 1, 2, 2, 7); }
      for (const [ex, ey] of [[x0, y0], [x1, y1]]) {
        if (!pass) { R(ex - 3, ey - 2, 6, 4, 1); R(ex - 2, ey - 3, 4, 6, 1); } else { R(ex - 2, ey - 1, 4, 2, 7); R(ex - 1, ey - 2, 2, 4, 7); }
      }
    }
    SKULL.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') P(cx - 6 + i, cy - 7 + j, 1); else if (ch === 'w') P(cx - 6 + i, cy - 7 + j, i >= 9 ? 6 : 7); }));
    R(X0 + 5, T + 41, PW - 10, 9, 1);
    let tx = X0 + 7;
    for (const ch of 'BONE DRAFT') { const g = FONT[ch]; if (g) g.forEach((r, j) => [...r].forEach((c, i) => { if (c === '1') P(tx + i, T + 43 + j, 7); })); tx += 4; }
  }

  // The strip: a crimped gold band 7 px tall, stamped column by column along a path.
  const stamp = ({ P }, x, y, i) => { P(x, y - 3, 1); P(x, y - 2, 7); for (let d = -1; d <= 2; d++) P(x, y + d, i % 3 ? 8 : 3); P(x, y + 3, 1); };
  // Hanging between the tear (a) and your hand (h), sagging if there's slack.
  function sagArt(p, a, h, len) {
    if (len < 1) return;
    const d = Math.hypot(h[0] - a[0], h[1] - a[1]), s = d < len ? Math.sqrt(len * len - d * d) / 2 : 0;
    const m = [(a[0] + h[0]) / 2, (a[1] + h[1]) / 2 + s], n = Math.ceil(Math.max(len, d));
    for (let i = 0; i <= n; i++) { const t = i / n, A = (1 - t) ** 2, B = 2 * t * (1 - t), Cq = t * t; stamp(p, A * a[0] + B * m[0] + Cq * h[0], A * a[1] + B * m[1] + Cq * h[1], i); }
  }
  // Fluttering flat as it falls, in stepped waves.
  function fallArt(p, [x0, y], step) {
    for (let i = 0; i <= 28; i++) stamp(p, x0 + i, y + Math.round(Math.sin(i / 4 - step * 1.3) * 1.6 * Math.min(1, i / 6)), i);
  }
  // Over your head, the ends hanging down either side.
  function drapeArt({ P }, [cx, y]) {
    for (let i = 0; i <= 28; i++) {
      const x = cx - 14 + i, d = Math.abs(i - 14), v = y + (d > 8 ? d - 8 : 0);
      P(x, v - 2, 1); P(x, v - 1, 7); P(x, v, i % 3 ? 8 : 3); P(x, v + 1, 1);
    }
  }
  // Three card backs (Scene.cardArt) rising out of the torn top a frame at a time, fanning out, the
  // rare one in the middle; then they start to turn over (turn 1, 2: narrower), and their faces
  // open from there. CARDS: where each comes to rest (scene px); CARDS_AT, the middle of them.
  const CARDS = [[-17, 6], [0, 2], [17, 6]].map(([dx, y]) => [PX0 + PW / 2 + dx - (CARD.W >> 1), y]);
  const CARDS_AT = [PX0 + PW / 2, (CARDS[1][1] + CARDS[0][1]) / 2 + CARD.H / 2];
  function cardsArt(p, c, turn = 0) {
    if (c < 0) return;
    const f = Math.floor(c * 7), x0 = PX0 + PW / 2 - (CARD.W >> 1), y0 = PT + 10;
    for (const [i, late] of [[0, 1], [2, 2], [1, 0]]) {
      const s = Math.min(f - late, 6), [x, y] = CARDS[i];
      if (s >= 0) Scene.cardArt(p, Math.round(x0 + (x - x0) * s / 6), Math.round(y0 + (y - y0) * s / 6), i === 1, CARD.TURN[turn]);
    }
  }

  /* ---------- the stage ---------- */
  /* Build the scene in `stage` with the spires' heat (0..2, RunMap.SPIRE_ANTES). Returns
     draw(state) for at(t)'s states, with draw.alive() and draw.toStage(x, y) (a scene point on
     the pack's plane, in stage px). */
  function mount(stage, heat) {
    // Framed like the bowling lane, but pulled back and down a little so the cards rising over the pack stay in shot.
    const sc = Scene.mount(stage, { rows: 700, top: 90 });
    EDGE = (Scene.span(sc, D_FIG, LAND.high * U)[0] - 720) / U + 75 - 24;
    // Pale ash out to the horizon, lit from the upper left round the pack and dimming into the distance.
    const gnd = Scene.ground(sc, {
      x0: -1200, y0: -1000, w: 1920, h: 900,
      light: (X, Y) => 1.2 - Math.hypot((X - 620) / 1300, (Y - 380) / 900),
      rubble: [[250, 450, 3], [470, 476, 2], [930, 462, 3], [1010, 400, 2], [300, 380, 2], [1150, 440, 3], [-80, 300, 3], [1560, 330, 3], [640, 120, 2]],
      shards: [[330, 454], [1000, 470], [1120, 410], [210, 416], [600, 490], [1380, 380], [80, 360]],
      shadows: [[mx(PX0) + 8, D_ACT - 6, mx(PX0 + PW) + 24, D_ACT + 12]], // the pack's, down and right of it
      over: { x0: 260, y0: 280, w: 460, h: 130 },
    });
    // The ruins: spires scattered to the horizon, and these framing the pack, with the ante's strata spires.
    const near = [[-60, 150, 'spike', 96, 24], [-30, 210, 'spike', 80, 22], [3, 170, 'spike', 92, 24], [14, 250, 'basalt', 44, 24], [40, 160, 'spike', 80, 22],
      [112, 170, 'spike', 104, 26], [138, 240, 'basalt', 40, 24], [147, 150, 'spike', 88, 22], [180, 200, 'spike', 96, 24], [205, 140, 'spike', 84, 22]].map(([sx, d, k, h, w]) => ({ k, x: mx(sx), d, h, w, l: 3 }));
    [[27, 190, 116, 32], [124, 200, 124, 36], [44, 130, 96, 28]].slice(0, heat + 1)
      .forEach(([sx, d, h, w], i) => near.push({ k: 'strata', x: mx(sx), d, h: Math.round(h * (1 + heat * 0.12)), w, l: 3, seed: 3 + i }));
    Scene.ruins(sc, { area: { x0: -1170, x1: 2610, y0: -1000, y1: 300 }, clear: { x0: 330, x1: 1110, y: -60 }, near, heat });

    // The upright planes: the pack and slingshot behind you, and what's in front of you (the
    // pouch, its bands, the strip coming down on your head).
    const plane = (depth) => Scene.plane(sc, { left: mx(AX0), x0: AX0, depth, w: AW, h: GY });
    const act = plane(D_ACT), front = plane(D_FRONT), sling = Scene.slingshot(sc);
    const packs = new Map();
    const packImg = (ox, tear) => {
      const key = ox + '|' + tear;
      if (!packs.has(key)) {
        const cv = document.createElement('canvas');
        cv.width = PW + 4; cv.height = GY - PT;
        packArt(Scene.pen(cv.getContext('2d'), sc.C, PX0 - 2, PT), ox, tear);
        packs.set(key, cv);
      }
      return packs.get(key);
    };
    const fig = Scene.figure(sc, { s: U });
    let shadowKey = '';

    function draw(S) {
      if (!sc.alive()) return;
      // Your contact shadow on the ash (smaller and thinner the higher you are), and the strip once it lies there.
      const z = (GY - S.feet) * U, key = [Math.round(S.fx), Math.round(S.depth), Math.round(z / 16), S.lie].join();
      if (key !== shadowKey) {
        shadowKey = key;
        gnd.clear();
        const r = Math.max(2.5, 6 - z / 80);
        gnd.shade(mx(S.fx) + 4, S.depth + 2, r * 1.3, r * 0.5);
        if (S.lie != null) gnd.patch(mx(S.lie), D_FIG + 6, 56, 12, (i, j) => (j < 1 || j > 10 ? 1 : j === 1 ? 7 : i % 6 < 2 ? 3 : 8));
      }
      // Behind you: the slingshot's fork, the cards, the pack, the strip in your hand.
      const step = Math.floor(performance.now() / 125);
      act.clear();
      sling.fork(act, FX, GY);
      cardsArt(act.p, S.cards, S.turn);
      act.art(packImg(S.ox, S.tear), PX0 - 2, PT, U / 2);
      if (S.rib) sagArt(act.p, S.rib.sag, S.rib.hand, S.rib.len);
      // In front of you: the pouch and its bands, the strip falling or draped over you.
      front.clear();
      sling.front(front, FX, GY, S.sl.dx, S.sl.dy);
      if (S.fall) fallArt(front.p, S.fall, step);
      if (S.drape) drapeArt(front.p, S.drape);
      fig.place({ x: mx(S.fx), y: S.depth, z, rot: S.rot, sx: S.sx, sy: S.sy });
    }
    draw.alive = sc.alive;
    draw.toStage = (x, y) => Scene.toStage(sc, act, x, y);
    return draw;
  }

  return { mount, at, LANDED, REST, PULL, END, CARDS_AT, ENTER_CUES, CUES };
})();
