'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the Casino (a stop of its own, see Run.casino in js/run.js).
   A casino court under stained glass. Your figurine lands in a slingshot on the tail of the map's
   lob; then you fling yourself at one of two table games, the roulette wheel or the slot machine,
   exactly as the map flings you at a stop (walkTo in js/runmap.js): six creaking notches back,
   the lever, a lob scaled to the distance with a stepped tumble, a squash, and a wipe into that
   game (Run.wheel, Run.slots).
   Built on the scene kit (js/scene.js): only the two machines and the timelines are its own.
   Scene px: 4 map units each, x across (75 the middle), y down from the sky to the ground at GY.
   The machines' art is drawn at the figurine's pixel scale, one art pixel a scene px.
   ============================================================ */

const Casino = (() => {
  const U = 4, GY = 103;
  const mx = (x) => 720 + (x - 75) * U;   // a scene x as a plane x (map units)
  const D_ACT = 380, D_FIG = 396, D_FRONT = 404; // the slingshot, you in its pouch, the pouch in front of you
  const FX = 75, PF = GY - 28;             // the slingshot's foot (front center), and your feet in its pouch at rest
  const AX0 = 40, AW = 70;                 // the slingshot's upright planes (scene px)
  const LAND = { across: 80, back: 10, high: 40, ms: 700 }; // the entrance, as Bone Draft's
  // The games: near the back of the court, a tile and a half off its wall (the tropicana's front is depth -130), `f` of the way
  // across the stage (mount works out their scene x from it, so they sit there at any stage size).
  // You land in front of the one you pick.
  const GAMES = {
    wheel: { f: 0.24, x: 10, depth: -30, ev: 'wheel' },
    slots: { f: 0.72, x: 140, depth: -30, ev: 'slots' },
  };
  // The patrons: rivals (RIVALS in js/data.js) picked at random, wandering the whole floor. Each walks
  // to a random spot (WALK: depths from the wall to the front, x across what the stage shows at that
  // depth, `edge` scene px in), pauses, and picks another, keeping clear of the tables and the
  // slingshot (KEEP: [x, depth, half width, half depth], set by mount). Each is scaled for its depth
  // so it shows the size of your figurine anywhere on the floor.
  const PATRONS = { n: 5, speed: [10, 18], pause: [0.6, 2.6], fps: 5 }; // speed in scene px a second (at your depth); pause in seconds
  const WALK = { d0: -105, d1: 380, edge: 12 };
  let KEEP = [];
  const FLING = { pull: 520, hold: 140 };  // ms, as walkTo: the draw back in six notches, then the hold before letting go
  let EDGE = Infinity;
  const { cl } = Scene, BAY = RunMap.BAY;
  const dith = (x, y, k) => BAY[(x & 3) + (y & 3) * 4] < k * 16;

  /* ---------- the timelines ---------- */
  /* The entrance and the wait: { fx, feet, depth, rot, sx, sy, sl: the pouch's pull { dx, dy } }. */
  const LANDED = LAND.ms / 1000 + Scene.SQUASH.ms / 1000, REST = LANDED + 0.1;
  const rest = () => ({ fx: FX, feet: PF, depth: D_FIG, rot: 0, sx: 1, sy: 1, sl: { dx: 0, dy: 0 } });
  function at(t) {
    const S = rest();
    if (t < LANDED) {
      const L = Scene.land(cl(t * 1000 / LAND.ms), LAND.high * U);
      S.fx = FX - Math.max(LAND.across, FX - EDGE) * L.k;
      S.depth = D_FIG - LAND.back * U * L.k;
      S.feet = PF - L.z / U;
      S.rot = L.rot;
      if (!L.k) { S.sx = Scene.SQUASH.sx; S.sy = Scene.SQUASH.sy; S.sl.dy = 1; }
    }
    return S;
  }
  const ENTER_CUES = [[LAND.ms / 1000, 'land']];

  /* The fling at game `id`: { at(t), END, CUES }. The pouch draws back away from the game (toward
     you and off its side) in six notches, holds, lets go, and you fly a lob to the ground in front
     of it, its height scaled to the distance as the map's: H = 60 + dist * 0.3 map units. */
  function fling(id) {
    const G = GAMES[id], side = G.x < FX ? 1 : -1;
    const P = FLING.pull / 1000, GO = P + FLING.hold / 1000;
    const tx = G.x, td = G.depth + 12, sx0 = FX + side * 8, sz = (GY - (PF + 5)) * U;
    const dist = Math.hypot((tx - sx0) * U, td - D_FIG), H = 60 + dist * 0.3, FLY = (380 + dist * 0.7) / 1000;
    const LAND_T = GO + FLY, END = LAND_T + Scene.SQUASH.ms / 1000 + 0.2;
    function atF(t) {
      const S = rest();
      if (t < GO) {
        const s = Math.round(cl(t / P) * 6) / 6;
        S.sl = { dx: Math.round(side * 8 * s), dy: Math.round(5 * s) };
        S.fx = FX + S.sl.dx; S.feet = PF + S.sl.dy;
      } else if (t < LAND_T) {
        const k = (t - GO) / FLY, z = sz * (1 - k) + 4 * H * k * (1 - k);
        S.fx = sx0 + (tx - sx0) * k; S.depth = D_FIG + (td - D_FIG) * k;
        S.feet = GY - Math.round(z / 4) * 4 / U;
        S.rot = Math.round(k * 4) % 4;
        if (t - GO < 0.08) S.sl.dx = -side * 3; // the pouch snaps past rest for a frame
      } else {
        S.fx = tx; S.depth = td; S.feet = GY;
        if (t < LAND_T + Scene.SQUASH.ms / 1000) { S.sx = Scene.SQUASH.sx; S.sy = Scene.SQUASH.sy; }
      }
      return S;
    }
    const CUES = [1, 2, 3, 4, 5, 6].map((i) => [P * (i - 0.5) / 6, 'tick']).concat([[GO, 'lever'], [LAND_T, 'land']]);
    return { at: atF, END, CUES };
  }

  /* ---------- the art (scene px, lit from the upper left) ---------- */
  // ante: 1..3. Higher antes trade paper trim for gold. t: seconds, stepped inside (6 a second).
  /* The roulette wheel: a tilted bone wheel on a pedestal; its rim of pockets steps round, and the ball rides it. 48 x 44. */
  function wheelArt({ P, R }, t, ante) {
    const cx = 24, cy = 20, rx = 20, ry = 8, step = Math.floor(t * 6) % 12;
    R(14, 30, 20, 10, 1); R(15, 30, 18, 9, ante > 1 ? 3 : 4);
    for (let y = 30; y < 39; y++) for (let x = 28; x < 33; x++) P(x, y, dith(x, y, 0.5) ? 2 : ante > 1 ? 3 : 4);
    R(10, 39, 28, 4, 1); R(11, 39, 26, 2, 3);
    for (let y = cy - ry - 2; y <= cy + ry + 3; y++) for (let x = cx - rx - 2; x <= cx + rx + 2; x++)
      if (((x - cx) / (rx + 2)) ** 2 + ((y - cy - 1) / (ry + 2)) ** 2 <= 1) P(x, y, 1);
    for (let y = cy - ry; y <= cy + ry + 2; y++) for (let x = cx - rx; x <= cx + rx; x++)
      if (((x - cx) / rx) ** 2 + ((y - cy - 1) / ry) ** 2 <= 1) P(x, y, dith(x, y, y > cy + ry - 1 ? 1 : (x - cx) / rx > 0.5 ? 0.5 : 0) ? 3 : ante === 3 ? 8 : 5);
    for (let y = cy - ry + 1; y <= cy + ry - 1; y++) for (let x = cx - rx + 2; x <= cx + rx - 2; x++) {
      const dx = (x - cx) / (rx - 2), dy = (y - cy) / (ry - 1), e = dx * dx + dy * dy;
      if (e > 1) continue;
      if (e > 0.45) { const s = ((Math.floor(Math.atan2(dy, dx) / (Math.PI * 2) * 12 + step) % 12) + 12) % 12; P(x, y, s === 0 ? 8 : s % 2 ? 1 : 6); }
      else if (e > 0.3) P(x, y, ante > 1 ? 8 : 3);
      else P(x, y, dith(x, y, dx + dy > 0 ? 0.6 : 0) ? 4 : 7);
    }
    R(cx - 1, cy - 3, 2, 3, 1); P(cx - 1, cy - 3, 7);
    const a = -step * Math.PI / 6, bx = Math.round(cx + Math.cos(a) * (rx - 3)), by = Math.round(cy + Math.sin(a) * (ry - 2));
    R(bx, by - 1, 2, 2, 7); P(bx + 1, by, 4);
    if (ante === 3) { R(cx - 3, cy + ry + 3, 6, 2, 8); P(cx - 1, cy + ry + 3, 1); P(cx + 1, cy + ry + 3, 1); }
  }
  /* The slot machine: a one-armed cabinet; its reels roll, its lights chase, and the bone lever drops now and then. 48 x 50. */
  function slotsArt({ P, R }, t, ante) {
    const X = 9, W = 28;
    R(X - 1, 4, W + 2, 44, 1);
    for (let y = 5; y < 47; y++) for (let x = X; x < X + W; x++) P(x, y, dith(x, y, x > X + W - 6 ? 0.5 : x < X + 2 ? 0 : 0.12) ? 4 : ante > 1 ? 5 : 6);
    R(X + 3, 1, W - 6, 4, 1); R(X + 4, 2, W - 8, 3, ante > 1 ? 8 : 5);
    if (ante === 3) { R(X + 12, 0, 4, 1, 1); P(X + 12, 2, 1); P(X + 13, 2, 1); P(X + 12, 3, 1); }
    R(X + 2, 7, W - 4, 3, ante > 1 ? 8 : 3);
    for (let i = 0; i < W - 4; i += 3) P(X + 2 + i, 8, Math.floor(t * 5 + i / 3) % 3 === 0 ? 7 : 1);
    for (let k = 0; k < 3; k++) {
      const rx = X + 3 + k * 8, off = Math.floor(t * 6 * (1 + k * 0.3)) % 12;
      R(rx - 1, 12, 8, 15, 1); R(rx, 13, 6, 13, 7);
      for (let s = 0; s < 3; s++) {
        const yy = 13 + ((s * 6 + off) % 18) - 2;
        if (yy < 13 || yy > 21) continue;
        const kind = (s + k + Math.floor(t * 0.5 * (1 + k))) % 3;
        if (kind === 0) { R(rx + 1, yy, 4, 4, 8); R(rx + 2, yy + 1, 2, 2, 7); }
        else if (kind === 1) { R(rx + 1, yy, 4, 3, 3); P(rx + 2, yy + 1, 7); P(rx + 3, yy + 1, 7); R(rx + 2, yy + 3, 2, 1, 3); }
        else { R(rx + 2, yy, 2, 4, 2); R(rx + 1, yy + 1, 4, 1, 2); }
      }
      R(rx, 13, 6, 1, 4); R(rx, 25, 6, 1, 4);
    }
    R(X + 2, 29, W - 4, 2, 1); R(X + 3, 33, W - 6, 6, 2); R(X + 4, 34, W - 8, 4, 1);
    for (let i = 0; i < 4; i++) R(X + 5 + i * 5, 35, 3, 2, ante > 1 && i === Math.floor(t * 4) % 4 ? 8 : 3);
    R(X + 2, 42, W - 4, 3, 1); R(X + 3, 43, W - 6, 1, 3);
    R(X - 2, 47, W + 4, 2, 1);
    const ly = Math.floor(t * 4) % 8 < 2 ? 24 : 10;
    R(X + W + 1, 26, 3, 5, 1); R(X + W + 2, 27, 2, 3, 3);
    const bx = X + W + 1; // the bone lever: a shaft with a two-lobed knuckle on top, like slot_bone
    R(bx + 1, ly + 1, 4, 28 - ly, 1); R(bx + 2, ly + 1, 1, 27 - ly, 7); R(bx + 3, ly + 1, 1, 27 - ly, 4);
    P(bx + 1, ly - 2, 1); P(bx + 4, ly - 2, 1);
    R(bx, ly - 1, 6, 2, 1); P(bx + 1, ly - 1, 7); P(bx + 4, ly - 1, 7); R(bx + 1, ly, 4, 1, 7); P(bx + 4, ly, 4);
    if (ante > 1) P(bx + 1, ly - 1, 8);
  }

  /* PROPS: this scene's objects for other scenes and the builder (js/props.js). */
  const PROPS = [
    { id: 'roulette', name: 'roulette wheel', x0: 0, w: 48, cx: 24, gy: 43, home: { x: GAMES.wheel.x, depth: GAMES.wheel.depth }, draw: (pln, t, heat) => wheelArt(pln.p, t, heat + 1) },
    { id: 'slot-machine', name: 'slot machine', x0: 0, w: 48, cx: 24, gy: 49, home: { x: GAMES.slots.x, depth: GAMES.slots.depth }, draw: (pln, t, heat) => slotsArt(pln.p, t, heat + 1) },
  ];

  /* ---------- the patrons ---------- */
  /* A rival's portrait as a standee, with a 1 px ink outline like your figurine (Scene.figure),
     facing either way. place(x, depth, hop, left): its feet at scene x and depth, hop px up. */
  function patron(sc, sprite) {
    const art = expandSprite(SPRITES[sprite]), cv = document.createElement('canvas');
    cv.width = 18; cv.height = 18;
    const g = cv.getContext('2d'), on = (x, y) => y >= 0 && y < art.length && x >= 0 && x < 16 && PAL[art[y][x]] != null;
    for (let y = -1; y <= art.length; y++) for (let x = -1; x <= 16; x++) {
      const c = on(x, y) ? PAL[art[y][x]] : on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1) ? sc.C[1] : null;
      if (c) { g.fillStyle = c; g.fillRect(x + 1, y + 1, 1, 1); }
    }
    const el = sc.stand(document.createElement('div'), 0, 0, 18 * U, 18 * U);
    el.appendChild(cv);
    // k: its scale, so it shows your figurine's size at this depth.
    return (x, depth, hop, left, k) => {
      const w = 18 * U * k;
      Object.assign(el.style, { left: mx(x) - w / 2 + 'px', top: depth - w + 'px', width: w + 'px', height: w + 'px' });
      el.style.transform = `translateZ(${hop * U * k}px) rotateX(-90deg)`;
      cv.style.transform = left ? 'scaleX(-1)' : '';
    };
  }
  // A walk from a to b stays clear of KEEP if no point along it comes inside one.
  const clear = (ax, ad, bx, bd) => {
    for (let i = 0; i <= 12; i++) {
      const x = ax + (bx - ax) * i / 12, d = ad + (bd - ad) * i / 12;
      if (KEEP.some(([kx, kd, hw, hd]) => Math.abs(x - kx) < hw && Math.abs(d - kd) < hd)) return false;
    }
    return true;
  };
  /* PATRONS.n rivals, each picked at random, wandering at random over the whole floor: to a spot, a
     pause, another spot, in any direction. Positions move smoothly; the walk's hop steps at
     PATRONS.fps. view: { xs(d): the scene x range shown at depth d, k(d): the scale there }.
     Returns the list ({ x, d, k } each, for shadows), with step(dt, t) to move them on. */
  function patrons(sc, view) {
    const R = Math.random, pick = (lo, hi) => lo + R() * (hi - lo);
    const spot = () => { const d = pick(WALK.d0, WALK.d1), [a, b] = view.xs(d); return [pick(a + WALK.edge, b - WALK.edge), d]; };
    const free = () => { for (;;) { const [x, d] = spot(); if (clear(x, d, x, d)) return [x, d]; } };
    const names = RIVALS.map((r) => r.sprite).filter((s) => SPRITES[s]);
    const list = Array.from({ length: PATRONS.n }, () => {
      const [x, d] = free();
      return { x, d, k: view.k(d), tx: x, td: d, wait: pick(0, PATRONS.pause[1]), v: pick(...PATRONS.speed), left: R() < 0.5, phase: R(), put: patron(sc, names[Math.floor(R() * names.length)]) };
    });
    list.step = (dt, t) => {
      for (const p of list) {
        if (p.wait > 0) {
          p.wait -= dt;
          if (p.wait <= 0) {
            // A new spot it can walk to without crossing a table; it keeps waiting if none turns up this time.
            for (let i = 0; i < 8; i++) { const [x, d] = spot(); if (clear(p.x, p.d, x, d)) { p.tx = x; p.td = d; p.v = pick(...PATRONS.speed); break; } }
          }
        } else {
          // Depth is in map units (4 a scene px), so it's scaled to walk at the same pace both ways.
          const dx = p.tx - p.x, dd = (p.td - p.d) / U, len = Math.hypot(dx, dd), s = p.v * p.k * dt; // as fast on screen far off as near
          if (Math.abs(dx) > 0.5) p.left = dx < 0;
          if (len <= s) { p.x = p.tx; p.d = p.td; p.wait = pick(...PATRONS.pause); }
          else { p.x += dx / len * s; p.d += dd / len * s * U; }
        }
        const walking = p.wait <= 0, hop = walking && Math.floor(t * PATRONS.fps + p.phase * 2) % 2 ? 1 : 0;
        p.k = view.k(p.d);
        p.put(p.x, p.d, hop, p.left, p.k);
      }
    };
    list.step(0, 0);
    return list;
  }

  /* ---------- the stage ---------- */
  /* Build the casino in `stage` with the ante's heat (0..2). onPick(id) runs when a game is
     clicked ('wheel' or 'slots'). Returns draw(state), with draw.alive. */
  function mount(stage, heat, onPick = () => {}) {
    const sc = Scene.mount(stage, { rows: 860, top: 300 }); // the hand scenes' camera, pulled back to take in both tables
    EDGE = (Scene.span(sc, D_FIG, LAND.high * U)[0] - 720) / U + 75 - 24;
    // What the stage shows across each depth (sampled, then read between): scene x ranges, and the
    // scale that makes a patron there your figurine's size on screen.
    const SAMPLES = Array.from({ length: 13 }, (_, i) => { const d = WALK.d0 + (D_FIG - WALK.d0) * i / 12, [a, b] = Scene.span(sc, d); return [d, (a - 720) / U + 75, (b - 720) / U + 75]; });
    const read = (d) => {
      const i = Math.max(0, Math.min(11, Math.floor((d - WALK.d0) / (D_FIG - WALK.d0) * 12))), [d0, a0, b0] = SAMPLES[i], [d1, a1, b1] = SAMPLES[i + 1], q = (d - d0) / (d1 - d0);
      return [a0 + (a1 - a0) * q, b0 + (b1 - b0) * q];
    };
    const near = read(D_FIG), view = { xs: read, k: (d) => { const [a, b] = read(d); return (b - a) / (near[1] - near[0]); } };
    // The games against the wall, and the ground everyone keeps clear of.
    for (const G of Object.values(GAMES)) { const [a, b] = read(G.depth); G.x = Math.round(a + (b - a) * G.f); }
    KEEP = [[GAMES.wheel.x, GAMES.wheel.depth, 30, 30], [GAMES.slots.x, GAMES.slots.depth, 30, 30], [FX, D_FIG, 26, 60]];
    const far = read(WALK.d0);
    // As picked in builder.html: the crypt's checker floor in the tropicana court, a wall closing off the back.
    const gnd = Scene.setting(sc, 'crypt', {
      heat, floor: 'checker', backdrop: 'tropicana', features: [], horizon: 'wall', clearing: 'wide', critters: [], effects: [],
      over: { x0: mx(far[0]), y0: WALK.d0 - 10, w: Math.ceil((far[1] - far[0]) * U), h: D_FRONT + 10 - WALK.d0 },
      shadows: Object.values(GAMES).map((G, i) => [mx(G.x - PROPS[i].w / 2) + 8, G.depth - 4, mx(G.x + PROPS[i].w / 2) + 16, G.depth + 10]),
    });
    // The two games, each on its own plane, clickable, ticking over at 6 a second.
    const games = Object.entries(GAMES).map(([id, G], i) => {
      const prop = PROPS[i], pln = Scene.plane(sc, { left: mx(G.x - (prop.cx - prop.x0)), x0: prop.x0, depth: G.depth, w: prop.w, h: prop.gy });
      pln.cv.classList.add('sc-held');
      pln.cv.style.cursor = 'pointer';
      pln.cv.onclick = () => onPick(id);
      return () => { pln.clear(); prop.draw(pln, performance.now() / 1000, heat); };
    });
    const paint = () => games.forEach((f) => f());
    paint();
    sc.every(1000 / 6, paint);

    const plane = (depth) => Scene.plane(sc, { left: mx(AX0), x0: AX0, depth, w: AW, h: GY });
    const act = plane(D_ACT), front = plane(D_FRONT), sling = Scene.slingshot(sc);
    const fig = Scene.figure(sc, { s: U });
    const walkers = patrons(sc, view);
    // Every contact shadow on the floor: yours (smaller the higher you are) and the patrons'.
    let you = null;
    const shadows = () => {
      gnd.clear();
      for (const w of walkers) gnd.shade(mx(w.x) + 4 * w.k, w.d + 2, 6 * 1.3 * w.k, 6 * 0.5 * w.k);
      if (!you) return;
      const r = Math.max(2.5, 6 - you.z / 80);
      gnd.shade(mx(you.x) + 4, you.d + 2, r * 1.3, r * 0.5);
    };
    let last = performance.now();
    sc.every(50, () => { const now = performance.now(); walkers.step(Math.min(0.2, (now - last) / 1000), now / 1000); last = now; shadows(); });
    function draw(S) {
      if (!sc.alive()) return;
      const z = (GY - S.feet) * U;
      you = { x: S.fx, d: S.depth, z };
      shadows();
      act.clear();
      sling.fork(act, FX, GY);
      front.clear();
      sling.front(front, FX, GY, S.sl.dx, S.sl.dy);
      fig.place({ x: mx(S.fx), y: S.depth, z, rot: S.rot, sx: S.sx, sy: S.sy });
    }
    draw.alive = sc.alive;
    return draw;
  }

  return { mount, at, fling, LANDED, REST, ENTER_CUES, GAMES, PROPS };
})();
