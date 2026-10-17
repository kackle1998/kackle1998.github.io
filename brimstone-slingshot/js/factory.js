'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the demonic factory (the backdrop of the Rune Circle, js/rune.js).
   An iron hall with furnace drums far back, a reservoir crowned with an orb
   in the middle, smokestacks at the sides, a grated floor and a lava river.
   It stands in for the ruins and spires of the kit's default scene (Scene.ruins). Built on
   the scene kit (js/scene.js); the heat (0..2, RunMap.SPIRE_ANTES) banks the furnaces up.
   Also holds the stand-in creatures, a card face and the sigil chip that factory scenes play with.
   The far layers are drawn at 2 map units a pixel; scene art on the upright planes at 4.
   ============================================================ */

const Factory = (() => {
  const { bay, cl } = Scene, U = 4;
  const mx = (x) => 720 + (x - 75) * U;
  const GY = 103, D_ACT = 320;
  const HX0 = -1100, HW = 1800, HH = 230, D_HALL = -130;    // far hall: left edge (plane x), canvas size, depth
  const MX0 = -280, MW = 1000, MH = 170, D_MACH = 150;     // middle layer
  const RES = 500;                                          // the reservoir's middle, in middle-layer px
  const pat = new Map();
  function dfill(g, C, x, y, w, h, a, b, L) { // Bayer dither from color a to color b, L of 16
    L = Math.round(cl(L, 0, 16));
    if (L === 0) g.fillStyle = C[a]; else if (L === 16) g.fillStyle = C[b];
    else {
      const key = C[a] + C[b] + L;
      if (!pat.has(key)) {
        const t = document.createElement('canvas'); t.width = t.height = 4;
        const tg = t.getContext('2d');
        for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { tg.fillStyle = C[bay(i, j) < L ? b : a]; tg.fillRect(i, j, 1, 1); }
        pat.set(key, g.createPattern(t, 'repeat'));
      }
      g.fillStyle = pat.get(key);
    }
    g.fillRect(x, y, w, h);
  }
  const line = (R, x0, y0, x1, y1, w, k) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) R(Math.round(x0 + (x1 - x0) * i / n) - (w >> 1), Math.round(y0 + (y1 - y0) * i / n) - (w >> 1), w, w, k);
  };
  const disc = (R, cx, cy, rx, ry, k) => {
    for (let y = -ry; y <= ry; y++) { const half = Math.round(rx * Math.sqrt(1 - (y / ry) ** 2)); R(cx - half, cy + y, half * 2 + 1, 1, k); }
  };
  const layer = (sc, left, depth, w, h) => {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    sc.stand(cv, left, depth, w * 2, h * 2);
    return cv;
  };
  const flat = (sc, x0, y0, w, h, z = 0.5) => {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h; cv.className = 'bw-lane';
    Object.assign(cv.style, { left: x0 + 'px', top: y0 + 'px', width: w * 2 + 'px', height: h * 2 + 'px', transform: `translateZ(${z}px)` });
    sc.pl.appendChild(cv);
    return cv;
  };
  const DRUMS = [[250, HH - 78, 56], [770, HH - 70, 46], [1330, HH - 80, 60], [1690, HH - 66, 42]];

  function hallStatic(cv, C) {
    const g = cv.getContext('2d'), { R } = Scene.pen(g, C), W = cv.width, H = cv.height, rnd = mulberry32(11);
    for (let i = 0; i < 16; i++) { const y0 = Math.floor(H * i / 16), y1 = Math.floor(H * (i + 1) / 16); dfill(g, C, 0, y0, W, y1 - y0, i < 8 ? 0 : 1, i < 8 ? 1 : 2, (i % 8) * 2); }
    for (let x = 20; x < W; x += 140 + Math.floor(rnd() * 80)) { // iron pillars with riveted bands
      const w = 14 + Math.floor(rnd() * 8);
      R(x - 1, 0, w + 2, H, 1); R(x, 0, w, H, 2); R(x, 0, 3, H, 3); R(x + w - 3, 0, 3, H, 1);
      for (const y of [HH - 170, HH - 100, HH - 40]) { R(x - 4, y, w + 8, 7, 1); R(x - 3, y + 1, w + 6, 4, 2); R(x - 3, y + 1, w + 6, 1, 4); }
    }
    for (let x = 0; x < W; x += 36 + Math.floor(rnd() * 70)) { // hanging chains
      const len = 40 + Math.floor(rnd() * 90);
      R(x, 0, 2, len, 1);
      for (let y = 2; y < len; y += 4) R(x, y, 2, 2, 3);
    }
    R(0, HH - 36, W, 8, 1); R(0, HH - 35, W, 6, 2); R(0, HH - 35, W, 1, 4); // the catwalk and its rail
    R(0, HH - 52, W, 2, 1);
    for (let x = 0; x < W; x += 14) R(x, HH - 50, 2, 14, 1);
    for (const [cx, cy, r] of DRUMS) { // furnace drums: ribbed spheres on legs
      R(cx - 24, cy + r - 6, 48, 60, 1); R(cx - 23, cy + r - 6, 46, 60, 2); R(cx - 23, cy + r - 6, 4, 60, 3);
      disc(R, cx, cy, r + 2, r + 2, 1); disc(R, cx, cy, r, r, 2);
      disc(R, cx - 2, cy - 2, r - 3, r - 3, 3); disc(R, cx + 3, cy + 3, r - 6, r - 6, 2);
      disc(R, cx, cy, Math.floor(r * 0.68), Math.floor(r * 0.8), 1);
      for (const a of [-0.9, 0.9]) for (let y = -r; y <= r; y += 2) { const half = Math.round(r * Math.sqrt(1 - (y / r) ** 2)); R(cx + Math.round(a * half) - 1, cy + y, 2, 2, 1); }
    }
    R(0, H - 6, W, 6, 1); R(0, H - 5, W, 1, 3);
  }
  function hallHot(cv, C, heat, st) {
    const g = cv.getContext('2d'), { R } = Scene.pen(g, C), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    const lit = [0.45, 0.72, 1.01][heat];
    for (const [cx, cy, r] of DRUMS) {
      const rx = Math.floor(r * 0.68), ry = Math.floor(r * 0.8);
      for (let y = cy - ry + 2; y < cy + ry - 3; y += 6) {
        const half = Math.round(rx * Math.sqrt(1 - ((y + 1 - cy) / ry) ** 2)) - 1, on = Math.abs(y + 1 - cy) / ry < lit;
        R(cx - half, y, half * 2, 3, on ? 8 : 3);
        if (on) for (let x = -half; x < half; x += 9) if ((Math.floor(x / 9) + y / 6 + st) % 3 === 0) R(cx + x, y + 1, 5, 1, 7);
      }
    }
  }
  function mach(cv, C) {
    const g = cv.getContext('2d'), { R } = Scene.pen(g, C), W = cv.width, H = cv.height;
    for (let x = 0; x < W; x += 110) { R(x, 22, 6, 18, 1); R(x + 1, 23, 4, 16, 3); } // pipe run with flanges
    R(0, 24, W, 12, 1); R(0, 25, W, 9, 2); R(0, 25, W, 2, 4);
    for (const x of [64, 210, 790, 930]) { R(x, 36, 14, H - 36, 1); R(x + 1, 36, 12, H - 36, 2); R(x + 1, 36, 3, H - 36, 4); for (let y = 56; y < H; y += 40) R(x - 2, y, 18, 5, 1); }
    const spire = (cx, top, h, w) => {
      for (let r = 0; r < h; r++) {
        const half = Math.round(w / 2 * (r / h)) + 1, y = top + r;
        R(cx - half - 1, y, 1, 1, 1); R(cx + half, y, 1, 1, 1); R(cx - half, y, half * 2, 1, 2); R(cx - half, y, Math.min(3, half), 1, 3);
      }
    };
    spire(30, 40, H - 40, 40); spire(W - 30, 30, H - 30, 44); spire(150, 90, H - 90, 24); spire(W - 160, 84, H - 84, 28);
    const tier = (w, y, h) => { // a tier of the reservoir: ink edge, lit upper left, shade lower right
      R(RES - w / 2, y, w, h, 1); R(RES - w / 2 + 1, y + 1, w - 2, h - 2, 2); R(RES - w / 2 + 1, y + 1, w - 2, 2, 4); R(RES - w / 2 + 1, y + 1, 3, h - 2, 4); R(RES + w / 2 - 4, y + 1, 3, h - 2, 1);
      for (let x = RES - w / 2 + 8; x < RES + w / 2 - 8; x += 16) R(x, y + 5, 2, h - 8, 1);
    };
    tier(250, MH - 14, 14); tier(190, MH - 38, 24); tier(130, MH - 56, 18);
    R(RES - 7, 56, 14, 60, 1); R(RES - 6, 56, 12, 60, 2); R(RES - 6, 56, 3, 60, 4);
    for (const s of [-1, 1]) for (const [dx, dy] of [[22, 34], [46, 22], [70, 8]]) { // the crown's spikes
      line(R, RES + s * 6, 84, RES + s * dx, 84 - dy, 4, 1); line(R, RES + s * 6, 84, RES + s * dx, 84 - dy, 2, 2);
      R(RES + s * dx - 2, 84 - dy - 3, 4, 4, 1); R(RES + s * dx - 1, 84 - dy - 2, 2, 2, 8);
    }
  }
  function machHot(cv, C, heat, st) {
    const g = cv.getContext('2d'), { R } = Scene.pen(g, C), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    for (const [x0, x1, y] of [[RES - 110, RES + 110, MH - 7], [RES - 80, RES + 80, MH - 30], [RES - 52, RES + 52, MH - 50]]) R(x0, y, x1 - x0, 2, 8);
    disc(R, RES, 44, 13, 13, 1); disc(R, RES, 44, 11, 11, 8); disc(R, RES, 44, 5 + st % 2, 5 + st % 2, 7); // the orb
  }
  function stack(cv, C, hot) { // a near smokestack with a glowing vent band
    const g = cv.getContext('2d'), { R } = Scene.pen(g, C), W = cv.width, H = cv.height;
    R(0, 0, W, H, 1); R(1, 0, W - 2, H, 2); R(1, 0, 4, H, 4); R(W - 5, 0, 4, H, 1);
    for (let y = 18; y < H; y += 44) { R(0, y, W, 5, 1); R(1, y + 1, W - 2, 2, 4); }
    for (let y = 36; y < H - 10; y += 44) { R(6, y, W - 12, 6, 1); R(7, y + 1, W - 14, 4, hot ? 8 : 3); }
    R(-0, 0, W, 6, 1); R(2, 1, W - 4, 3, 4);
  }

  /* The factory in two parts, so other settings can borrow either one (js/settings.js):
     backdrop(sc, heat) stands the hall, the machines, the smokestacks and the lava river (it takes
     the sky's place); floor(sc, heat, opts) lays the dark iron floor under its grate and returns
     the ground (Scene.ground). build() is both, as it always was. */
  function backdrop(sc, heat) {
    sc.stage.firstChild.remove(); // the nebula sky; the factory's own dark takes its place
    const { C } = sc;
    const hall = layer(sc, HX0, D_HALL, HW, HH), hot1 = layer(sc, HX0, D_HALL, HW, HH);
    hallStatic(hall, C);
    const m = layer(sc, MX0, D_MACH, MW, MH), hot2 = layer(sc, MX0, D_MACH, MW, MH);
    mach(m, C);
    const near = [[-78, 250, 40, 150], [-44, 190, 30, 110], [172, 200, 32, 120], [206, 260, 40, 160]];
    near.forEach(([sx, d, w, h], i) => { const cv = layer(sc, mx(sx), d, w, h); stack(cv, C, heat > 0 && i % 2 === 0); });
    const river = flat(sc, -1200, -90, 1920, 50, 0.75), rg = river.getContext('2d'), rp = Scene.pen(rg, C), crust = [0.5, 0.2, 0][heat]; // over any floor's grate
    const paintRiver = (st) => {
      rg.clearRect(0, 0, 1920, 50);
      rp.R(0, 0, 1920, 50, 1); rp.R(0, 3, 1920, 44, 8);
      for (let r = 6; r < 44; r += 5) for (let x = 0; x < 1920; x += 20) if ((Math.floor(x / 20) + r + st * 2) % 7 < 2) rp.R(x, r, 18, 2, 7);
      for (let x = 0; x < 1920; x += 14) for (let r = 4; r < 46; r += 7) if (noise(x + r, 3) < crust) rp.R(x, r, 10, 5, 2);
    };
    const noise = (a, b) => { let n = (a * 374761393 + b * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
    let last = -1;
    const tick = () => {
      const st = Math.floor(performance.now() / 250);
      if (st === last) return;
      last = st;
      hallHot(hot1, C, heat, st); machHot(hot2, C, heat, st); paintRiver(st);
    };
    tick();
    sc.every(60, tick);
  }
  function floor(sc, heat, { rubble = [], shards = [], shadows = [], over, y0 = -1000 }) {
    const { C } = sc, h = Math.round((800 - y0) / 2);
    const gnd = Scene.ground(sc, {
      x0: -1200, y0, w: 1920, h, tones: [2, 3, 4, 5], seed: 41, grit: 2600,
      light: (X, Y) => 1.25 - Math.hypot((X - 720) / 1300, (Y - 300) / 900),
      rubble, shards, shadows, over,
    });
    const grate = flat(sc, -1200, y0, 1920, h), gg = grate.getContext('2d'), gp = Scene.pen(gg, C);
    for (let x = 0; x < 1920; x += 48) { gp.R(x, 0, 2, h, 1); gp.R(x + 2, 0, 1, h, 5); }
    for (let y = pmod(-1000 - y0, 48); y < h; y += 48) { gp.R(0, y, 1920, 2, 1); gp.R(0, y + 2, 1920, 1, 5); } // the grid lined up wherever the floor starts
    for (let x = 0; x < 1920; x += 48) for (let y = pmod(-1000 - y0, 48); y < h; y += 48) { gp.R(x - 2, y - 2, 6, 6, 1); gp.R(x - 1, y - 1, 2, 2, 4); }
    return gnd;
  }
  const pmod = (a, n) => ((a % n) + n) % n;
  function build(sc, heat, opts) {
    backdrop(sc, heat);
    return floor(sc, heat, opts);
  }
  // A horned imp, 14 wide, standing on gy. o: { big, wing 0..3, up (wings raised), flash, tone }
  function imp({ R }, x, gy, o = {}) {
    const y = gy - 18, f = o.flash, body = f ? 7 : o.tone || 4, shade = f ? 6 : 2, mid = f ? 6 : 3;
    if (o.wing) for (const s of [-1, 1]) { // bat wings first, behind the body: a leading edge, finger bones, a scalloped hem
      const n = o.wing, L = 3 + 3 * n, H = 2 + 2 * n, ax = s < 0 ? x + 2 : x + 11, ay = y + 9;
      for (let i = 1; i <= L; i++) {
        const top = ay - Math.round(H * (i / L) * (o.up ? 1 : 0.3)), bot = ay + 3 + Math.round(H * 0.4 * (1 - i / L)) - (i % 4 >= 2 ? 1 : 0), xx = ax + s * i;
        R(xx, top - 1, 1, 1, 1);
        R(xx, top, 1, bot - top, i % 4 === 0 ? 1 : i % 4 === 1 ? 7 : 6);
        R(xx, bot, 1, 1, 1);
      }
      R(ax + s * (L + 1), ay - Math.round(H * (o.up ? 1 : 0.3)), 1, 3, 1);
    }
    R(x + 3, y + 14, 3, 4, 1); R(x + 8, y + 14, 3, 4, 1); R(x + 4, y + 14, 1, 3, mid); R(x + 9, y + 14, 1, 3, mid);
    R(x + 2, y + 7, 10, 8, 1); R(x + 3, y + 8, 8, 6, mid); R(x + 3, y + 8, 3, 6, body); R(x + 9, y + 8, 2, 6, shade);
    R(x + 5, y + 10, 4, 2, f ? 8 : 1); // a belly plate
    R(x, y + 8, 3, 4, 1); R(x + 1, y + 9, 1, 2, mid); R(x + 11, y + 8, 3, 4, 1); R(x + 12, y + 9, 1, 2, shade);
    R(x + 2, y + 1, 10, 7, 1); R(x + 3, y + 2, 8, 5, body); R(x + 3, y + 2, 3, 5, f ? 7 : 5); R(x + 9, y + 2, 2, 5, mid);
    R(x + 4, y + 4, 2, 2, 8); R(x + 8, y + 4, 2, 2, 8); R(x + 5, y + 5, 1, 1, 1); R(x + 9, y + 5, 1, 1, 1);
    const hh = o.big ? 5 : 3;
    R(x + 1, y + 2 - hh, 2, hh + 1, 1); R(x + 11, y + 2 - hh, 2, hh + 1, 1); R(x + 2, y + 3 - hh, 1, hh - 1, f ? 7 : 4);
  }
  function chip({ R }, cx, y, w) {
    const x = cx - (w >> 1);
    R(x, y, w, 9, 1);
    if (w > 2) R(x + 1, y + 1, w - 2, 7, 6);
    if (w > 4) R(cx, y + 2, 1, 5, 8);
    if (w > 7) { R(cx - 2, y + 3, 1, 1, 8); R(cx + 2, y + 3, 1, 1, 8); R(cx - 1, y + 2, 1, 1, 8); R(cx + 1, y + 2, 1, 1, 8); R(cx - 1, y + 6, 3, 1, 8); }
    if (w > 4) R(x + 1, y + 1, 1, 7, 7);
  }
  /* PROPS: this scene's objects for other scenes and the builder (js/props.js): each { id, name, x0,
     w, cx (its middle), gy (its ground line), home: { x, depth } (where it stands in this scene),
     draw(pln, t, heat, sc) } in this file's scene px. */
  const PROPS = [
    { id: 'card-b', name: 'card', x0: 60, w: 30, cx: 75, gy: GY, home: { x: 121, depth: D_ACT }, // the Rune Circle's second card (js/rune.js)
      draw: (pln) => Scene.cardFace(pln.p, 68, GY - Scene.CARD.H) },
    { id: 'card-a', name: 'card with a sigil', x0: 60, w: 30, cx: 75, gy: GY, home: { x: 33, depth: D_ACT }, // and its first
      draw: (pln) => Scene.cardFace(pln.p, 68, GY - Scene.CARD.H) },
    { id: 'sigil-chip', name: 'sigil chip', x0: 66, w: 18, cx: 75, gy: GY, home: { x: 33, depth: D_ACT }, // over the first card
      draw: (pln, t) => chip(pln.p, 75, GY - Scene.CARD.H - 11 - Math.floor(t * 3) % 2, 9) },
  ];
  return { build, backdrop, floor, PROPS, mx, GY, D_ACT, dfill, line, disc, flat, layer, imp, chip };
})();
