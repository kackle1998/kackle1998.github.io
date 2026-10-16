'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the Molten Pool (a ? stop event, see Run.dip in js/run.js).
   A still pool ringed with boulders, out in the ruins. Your figurine lands to the
   right of it on the tail of the map's lob; DIP A CREATURE lifts the card over your head, tosses
   it into the pool and it goes under. Three times in four it rises, turns face-out and the Haste
   sigil stamps onto it, then it comes back to you. One time in four it never comes back: its
   shape shrinks away under the water in steps, with bubbles and a last ring.
   Built on the scene kit (js/scene.js): only the spring, the pool, the dipping card and the
   timeline are its own.
   Scene px: everything is laid out on upright planes in scene pixels of 4 map units, x across and
   y down from the sky to the ground at GY.
   ============================================================ */

const Dip = (() => {
  const U = 4, GY = 106;                  // map units a scene px; the ground's scene y
  const mx = (x) => 720 + (x - 75) * U;  // a scene x as a plane x (map units): scene x 75 is the middle
  const D_ACT = 380, D_FIG = 396;         // depths (plane y): the spring and pool, you
  const AX0 = -12, AW = 174;              // the upright plane's left edge and width (scene px), from the sky (y 0) to GY
  const SURF = 82, DIP = 60, STAND = 128, HY = 62, PY = 54, UNDER = SURF + 3; // the water line, the pool's middle, where you stand, the card over your head, over the pool, under the water
  const POOL = [60, 77, 37, 28];        // the water: an ellipse cx, cy, rx, ry
  // The entrance, in scene px (x 4 for map units): the tail of the map's lob, in from the right.
  const LAND = { across: 44, back: 10, high: 40, ms: 700 };
  // The camera (Scene.mount): pulled in close on the spring, the pool and you.
  const CAM = { rows: 480, top: -110 };
  const { bay, cl, CARD } = Scene;
  const nz = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const inE = (x, y, [cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

  /* ---------- the timeline ---------- */
  /* What the scene shows at time t (seconds) for an outcome (melt: the card is lost): the entrance
     runs 0..LANDED, you wait at REST, and DIP A CREATURE plays REST..end(melt). Card widths step at
     7 a second (opening, turning); flights move smoothly.
     { fx, feet: scene x and y of your feet, depth: plane y you stand at, rot: quarter turns,
       sx, sy: squash, card: { x: its middle, top, w: width (CARD.TURN), face, sig: 1 the small
       Haste sigil on it, 2 the big one stamping down, 3 the dust round it } or null } */
  const LANDED = LAND.ms / 1000 + Scene.SQUASH.ms / 1000, REST = 1;
  const MELT = 3.6, GONE = 4.4;           // the lost card's shape starts to shrink; it's gone
  const END_H = 7.1, END_M = 5.7;          // the end of a dip: back over your head and closed / the last ring gone
  const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) ** 2);
  const open = (t, t0) => CARD.TURN[2 - Math.min(2, Math.floor((t - t0) * 7))]; // 3, 9, 15
  const shut = (t, t0) => CARD.TURN[Math.min(2, Math.floor((t - t0) * 7))];     // 15, 9, 3
  function at(t, melt = false) {
    const S = { t, melt, fx: STAND, feet: GY, depth: D_FIG, rot: 0, sx: 1, sy: 1, card: null }, seg = (a, b) => cl((t - a) / (b - a));
    if (t < LANDED) {
      const L = Scene.land(cl(t * 1000 / LAND.ms), LAND.high * U);
      S.fx = STAND + LAND.across * L.k;
      S.depth = D_FIG - LAND.back * U * L.k;
      S.feet = GY - L.z / U;
      S.rot = L.rot;
      if (!L.k) { S.sx = Scene.SQUASH.sx; S.sy = Scene.SQUASH.sy; }
    }
    if (t <= REST || t >= (melt ? MELT : 6.6 + 3 / 7)) return S;
    // The card opens over your head, flies over to the pool in an arc and drops in.
    let x = STAND, top = HY, w = CARD.W, face = false, sig = 0;
    if (t < REST + 0.28) w = open(t, REST);
    if (t >= 1.45) { const u = ease(seg(1.45, 2.25)); x = STAND + (DIP - STAND) * u; top = HY + (PY - HY) * u - Math.round(Math.sin(u * Math.PI) * 8); }
    if (t >= 2.45) { const u = seg(2.45, 3); top = PY + (UNDER - PY) * u * u; }
    if (!melt) {
      // Up out of the water, turned over (narrowing as a back, opening as a face), stamped, and back to you.
      if (t >= 3.8) { const u = seg(3.8, 4.3); top = UNDER + (PY - UNDER) * (1 - (1 - u) ** 2); }
      if (t >= 4.4) { if (t < 4.82) w = Math.max(3, shut(t, 4.4)); else { face = true; w = open(t, 4.82); } }
      if (t >= 5.3) { const f = Math.floor((t - 5.3) * 7); sig = f < 2 ? 2 + f : 1; }
      if (t >= 6) { const u = ease(seg(6, 6.6)); x = DIP + (STAND - DIP) * u; top = PY + (HY - PY) * u - Math.round(Math.sin(u * Math.PI) * 8); }
      if (t >= 6.6) w = Math.max(3, shut(t, 6.6));
    }
    S.card = { x, top, w, face, sig };
    return S;
  }
  const end = (melt) => (melt ? END_M : END_H);
  // When the card goes into the water (TE) and comes back out of it (TX), found from at().
  const TIMES = [false, true].map((melt) => {
    let TE = 0, TX = 99;
    for (let t = 2; t < 5; t += 0.005) {
      const c = at(t, melt).card;
      if (!c) continue;
      const wet = c.top + CARD.H > SURF;
      if (wet && !TE) TE = t;
      if (!wet && TE && TX === 99 && t > 3.2) TX = t;
    }
    return { TE, TX };
  });
  // Sounds on the way: [time, name, n]. ENTER_CUES for the entrance, cues(melt) for the dip.
  const ENTER_CUES = [[LAND.ms / 1000, 'land']];
  const cues = (melt) => {
    const { TE, TX } = TIMES[+melt];
    return [[REST, 'place'], [1.45, 'twang'], [TE, 'poof'], ...(melt ? [[MELT, 'die'], [4.5, 'poof']] : [[TX, 'poof'], [4.82, 'place'], [5.3, 'spell'], [6.6, 'place']])];
  };

  /* ---------- the art (scene px) ---------- */
  // The Haste sigil: a bolt, `s` px a pixel, in the accent.
  const BOLT = ['..#', '.#.', '###', '.#.', '#..'];
  const bolt = ({ R }, x, y, s) => BOLT.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') R(x + i * s, y + j * s, s, s, 8); }));
  /* A card face, CARD.W x CARD.H (a beast in its frame, a text band, its stats), narrowed about
     its middle to width w while it opens; sig 1: the small Haste sigil on it. */
  function faceArt(p, x, y, w, sig) {
    const { P, R } = p;
    x += (CARD.W - w) >> 1;
    R(x, y, w, CARD.H, 1);
    if (w > 2) R(x + 1, y + 1, w - 2, 20, 6);
    if (w < CARD.W) { if (w > 4) R(x + 2, y + 2, w - 4, 9, 5); return; }
    R(x + 1, y + 1, 1, 20, 7);
    R(x + 2, y + 2, 11, 9, 5); R(x + 2, y + 2, 11, 1, 4);
    R(x + 4, y + 6, 6, 3, 3); R(x + 8, y + 4, 3, 3, 3); R(x + 3, y + 5, 1, 2, 3); R(x + 5, y + 9, 1, 2, 2); R(x + 9, y + 9, 1, 2, 2); P(x + 9, y + 5, 7);
    R(x + 2, y + 12, 11, 2, 4);
    R(x + 2, y + 18, 3, 2, 1); R(x + 10, y + 18, 3, 2, 1); P(x + 3, y + 18, 7); P(x + 11, y + 18, 7);
    if (sig === 1) bolt(p, x + 6, y + 14, 1);
  }

  /* The still parts, baked once onto a canvas the size of the plane: the pool and its boulders
     and lilies. Returns { cv, wet(x, y): open water at scene px x, y, gl: glint spots }. */
  function bake(C) {
    const cv = document.createElement('canvas');
    cv.width = AW * 2; cv.height = GY * 2;
    const { P } = Scene.pen(cv.getContext('2d'), C, AX0, 0, 2);
    const M = new Uint8Array(AW * GY), at = (x, y) => (y >= 0 && y < GY && x >= AX0 && x < AX0 + AW ? y * AW + x - AX0 : -1);
    const wet = (x, y) => { const o = at(Math.round(x), Math.round(y)); return o >= 0 && M[o] === 1; };
    const setM = (x, y, v) => { const o = at(x, y); if (o >= 0) M[o] = v; };
    // The water: a dark lip along its far edge, lighter toward the near right.
    for (let y = POOL[1] - POOL[3]; y < GY; y++) for (let x = 20; x <= 100; x++) {
      if (!inE(x, y, POOL)) continue;
      let k = 4;
      if (!inE(x, y - 1, POOL)) k = 3;
      else if (!inE(x, y - 2, POOL) && bay(x, y) < 8) k = 3;
      else if (bay(x, y) < cl(((x - POOL[0]) / POOL[2] + (y - POOL[1]) / POOL[3]) * 6 + 2, 0, 16)) k = 5;
      P(x, y, k); setM(x, y, 1);
    }
    // Boulders round it, far ones first, lit from the upper left.
    const rocks = [];
    for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2; rocks.push([POOL[0] + (POOL[2] + 4) * Math.cos(a), POOL[1] + (POOL[3] + 1.5) * Math.sin(a), 6 + Math.floor(nz(i, 1) * 4), 3 + Math.floor(nz(i, 2) * 2)]); }
    rocks.sort((a, b) => a[1] - b[1]);
    for (const [bx, by, w, rh] of rocks) {
      const rx = w / 2, ry = rh / 2;
      for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) {
        if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) continue;
        const x = Math.round(bx + dx), y = Math.round(by + dy);
        let k = dx < 0 && dy < 0 ? 6 : 5;
        if (dy >= ry - 1) k = 4;
        if ((dx / rx) ** 2 + ((dy + 1) / ry) ** 2 > 1) k = 3;
        P(x, y, k); setM(x, y, 0);
      }
    }
    // Two lily pads, one in flower.
    for (const [cx, cy, fl] of [[80, 99, 1], [46, 100, 0]]) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -5; dx <= 5; dx++) {
        if ((dx / 5.5) ** 2 + (dy / 2.4) ** 2 > 1 || (dy === 0 && dx >= 3)) continue;
        P(cx + dx, cy + dy, dy === 2 ? 2 : dx + dy < -3 ? 4 : 3); setM(cx + dx, cy + dy, 0);
      }
      if (fl) { P(cx - 2, cy - 2, 8); P(cx, cy - 2, 8); P(cx - 1, cy - 3, 8); P(cx - 1, cy - 2, 7); }
    }
    const gl = [];
    for (let i = 0; gl.length < 7 && i < 400; i++) { const x = AX0 + Math.floor(nz(i, 11) * AW), y = Math.floor(nz(i, 12) * GY); if (wet(x, y) && wet(x + 3, y) && Math.abs(x - DIP) > 9) gl.push([x, y]); }
    return { cv, wet, gl };
  }
  // A ring spreading on the water round the pool's middle, dt seconds old (a step every 1/6 s).
  function ring({ P }, wet, dt, r0 = 5) {
    if (dt < 0 || dt >= 0.84) return;
    const r = r0 + Math.floor(dt * 6) * 3, ry = r * POOL[3] / POOL[2];
    for (let a = 0; a < Math.PI * 2; a += 0.5 / r) { const x = Math.round(DIP + r * Math.cos(a)), y = Math.round(SURF + 1 + ry * Math.sin(a)); if (wet(x, y)) P(x, y, 6); }
  }
  // A splash thrown up where the card goes in or comes out, three frames.
  function splash({ P }, dt) {
    if (dt < 0 || dt >= 3 / 7) return;
    const D = [[[-4, -2], [4, -2], [-2, -4], [2, -4]], [[-7, -4], [7, -4], [-3, -7], [3, -7]], [[-9, -1], [9, -1], [-4, -5], [4, -5]]][Math.floor(dt * 7)];
    for (const [dx, dy] of D) { P(DIP + dx, SURF + dy, 7); P(DIP + dx, SURF + dy + 1, 4); }
  }
  // The water's moving parts and the card: glints, rings, its shadow, the part above the water
  // (back or face), its dark shape under it, the waterline across it, drips as it rises.
  function waterArt(p, b, t, card, melt) {
    const { P, R } = p, { wet } = b, { TE, TX } = TIMES[+melt], st = Math.floor(t * 4);
    b.gl.forEach(([x, y], i) => { const o = [0, 1, 2, 1][(st + i) % 4]; if (wet(x + o, y) && wet(x + o + 1, y)) R(x + o, y, 2, 1, 6); });
    if (t < REST) return;
    ring(p, wet, t - TE); ring(p, wet, t - TE - 0.3);
    if (t > TE + 0.6 && t < (melt ? GONE : TX - 0.1)) ring(p, wet, (t - TE - 0.6) % 0.5, 3);
    if (melt) { ring(p, wet, t - 4.5, 4); ring(p, wet, t - 4.8, 4); }
    else { ring(p, wet, t - TX); ring(p, wet, t - TX - 0.3); }
    if (card) {
      const c = card, L = Math.round(c.x - 7), T = Math.round(c.top), bot = T + CARD.H;
      if (bot < SURF && wet(c.x, SURF)) {
        const hw = Math.max(3, Math.round(7 - (SURF - bot) / 12));
        for (let dy = -1; dy <= 1; dy++) for (let dx = -hw; dx <= hw; dx++) if ((dx / hw) ** 2 + (dy / 1.6) ** 2 <= 1 && bay(L + 7 + dx, SURF + dy) < 8) P(L + 7 + dx, SURF + dy, 3);
      }
      for (let v = Math.max(SURF, T); v < bot; v++) for (let u = L; u < L + CARD.W; u++) if (wet(u, v) && bay(u, v) < (v - SURF < 4 ? 10 : 6)) P(u, v, 3);
      // Only the part above the water is drawn as the card.
      const dry = { P: (u, v, k) => { if (v < SURF) P(u, v, k); }, R: (u, v, w, h, k) => { const h2 = Math.min(h, SURF - v); if (h2 > 0) R(u, v, w, h2, k); } };
      if (c.face) faceArt(dry, L, T, c.w, c.sig); else Scene.cardArt(dry, L, T, false, c.w);
      if (c.sig === 2) bolt(p, L + 4, T + 10, 2);
      if (c.sig === 3) for (const [dx, dy] of [[4, 13], [10, 13], [4, 21], [10, 21], [3, 17], [11, 17]]) P(L + dx, T + dy, 7);
      if (T < SURF && bot > SURF) { R(L - 1, SURF, 17, 1, 7); R(L - 1, SURF + 1, 17, 1, 5); }
      if (t > TX && t < 5) {
        const dt = t - TX;
        for (let d = 0; d < 2; d++) { const ph = (Math.floor(dt * 7) + d * 2) % 4, x = L + (d ? 11 : 3), y = bot + 1 + ph * 3; if (y < SURF - 1) { P(x, y, 7); P(x, y + 1, 4); } }
      }
    }
    if (melt && t >= MELT && t < GONE) {
      const f = Math.floor((t - MELT) * 7), [w, h] = [[11, 6], [7, 4], [5, 3], [3, 2], [1, 1]][Math.min(4, f)];
      if (f < 5) for (let v = UNDER; v < UNDER + h; v++) for (let u = DIP - (w >> 1); u <= DIP + (w >> 1); u++) if (wet(u, v) && bay(u, v) < 10) P(u, v, 3);
      const [bx, by] = [[-3, 0], [2, -1], [0, 0], [4, -1], [-2, -1], [1, 0]][f % 6];
      P(DIP + bx, SURF + by, 7); P(DIP + bx + 1, SURF + by, 7);
    }
    splash(p, t - TE);
    if (!melt) splash(p, t - TX);
  }

  /* ---------- the stage ---------- */
  /* Build the scene in `stage` with the spires' heat (0..2, RunMap.SPIRE_ANTES). Returns
     draw(state) for at(t, melt)'s states, with draw.alive(). The water keeps moving
     between draws (its glints) on its own timer. */
  function mount(stage, heat) {
    const sc = Scene.mount(stage, CAM);
    const gnd = Scene.ground(sc, {
      x0: -1200, y0: -1000, w: 1920, h: 900,
      light: (X, Y) => 1.2 - Math.hypot((X - 620) / 1300, (Y - 380) / 900),
      rubble: [[250, 450, 3], [470, 476, 2], [1010, 400, 2], [300, 380, 2], [1150, 440, 3], [-80, 300, 3], [1560, 330, 3], [640, 120, 2]],
      shards: [[1000, 470], [1120, 410], [210, 416], [1380, 380], [80, 360]],
      shadows: [[mx(24) + 8, D_ACT - 2, mx(100) + 12, D_ACT + 4]], // the pool's rim, down and right of it
      over: { x0: 260, y0: 280, w: 460, h: 130 },
    });
    // Spires stand well back and off to the sides, so none of them rises behind the pool.
    const near = [[-70, 20, 'spike', 96, 24], [-40, 80, 'spike', 80, 22], [-20, -10, 'spike', 92, 24], [150, 60, 'basalt', 40, 24],
      [170, 10, 'spike', 104, 26], [200, 70, 'spike', 88, 22], [225, -20, 'spike', 96, 24]].map(([sx, d, k, h, w]) => ({ k, x: mx(sx), d, h, w, l: 3 }));
    [[160, -30, 124, 36], [-50, -50, 116, 32], [120, -120, 96, 28]].slice(0, heat + 1)
      .forEach(([sx, d, h, w], i) => near.push({ k: 'strata', x: mx(sx), d, h: Math.round(h * (1 + heat * 0.12)), w, l: 3, seed: 3 + i }));
    Scene.ruins(sc, { area: { x0: -1170, x1: 2610, y0: -1000, y1: 300 }, clear: { x0: 380, x1: 1060, y: -220 }, near, heat });

    const act = Scene.plane(sc, { left: mx(AX0), x0: AX0, depth: D_ACT, w: AW, h: GY });
    const b = bake(sc.C), fig = Scene.figure(sc, { s: U });
    let shadowKey = '', last = at(REST);
    const paint = () => {
      const S = last;
      act.clear();
      act.g.drawImage(b.cv, 0, 0);
      waterArt(act.p, b, S.t, S.card, S.melt);
    };
    sc.every(60, paint); // the glints keep moving while you wait

    function draw(S) {
      if (!sc.alive()) return;
      last = S;
      const z = (GY - S.feet) * U, key = [Math.round(S.fx), Math.round(S.depth), Math.round(z / 16)].join();
      if (key !== shadowKey) {
        shadowKey = key;
        gnd.clear();
        const r = Math.max(2.5, 6 - z / 80);
        gnd.shade(mx(S.fx) + 4, S.depth + 2, r * 1.3, r * 0.5);
      }
      paint();
      fig.place({ x: mx(S.fx), y: S.depth, z, rot: S.rot, sx: S.sx, sy: S.sy });
    }
    draw.alive = sc.alive;
    return draw;
  }

  return { mount, at, end, cues, LANDED, REST, ENTER_CUES, CAM };
})();
