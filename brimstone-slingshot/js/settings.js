'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — scene settings: the places an event scene can stand in. Each one is
   the ground, the props scattered to the horizon (with a wall of tall ones hiding the far
   edge), and something alive in the background, all hotter each ante.
     Scene.setting(sc, name, opts) builds one behind the action and returns the ground
     (Scene.ground's { clear, shade, patch }) for contact shadows.
   Names: ruins (the run map's spires), crypt (a stone wall with sagging arches), casino, lava, graveyard, forge (Factory.build).
   opts: { heat (0..2, RunMap.SPIRE_ANTES), area, clear, near, light, rubble, shards, shadows,
   over }: as Scene.ground and Scene.ruins. `near` props use the spire kinds ('spike' tall,
   'basalt' low, 'strata' the one that shows the heat); each setting renames them to its own.
   Also Scene.motes (drifting embers, ash, dust) and Scene.crosser (something passing behind).
   Prop art is at 2 map units a pixel, lit from the upper left, as RunMap.propArt.
   ============================================================ */

(() => {
  const { bay, cl } = Scene;
  const AREA = { x0: -1170, x1: 2610, y0: -1000, y1: 300 }, CLEAR = { x0: 330, x1: 1110, y: -60 };
  const LIGHT = (X, Y) => 1.2 - Math.hypot((X - 620) / 1300, (Y - 380) / 900);
  const pmod = (a, n) => ((a % n) + n) % n;

  /* ---------- background life ---------- */
  /* Motes drifting through a band of air at `depth`, across plane x x0..x1, h px tall: `dir` -1
     rises (embers), 1 falls (ash, dust). They step a pixel at a time, `fps` a second, swaying a
     pixel left and right; ks are their ramp colors. */
  function motes(sc, { x0 = -1200, x1 = 2400, depth = -300, h = 140, n = 30, dir = -1, ks = [8, 7], fps = 6, seed = 9 }) {
    const R = mulberry32(seed), w = Math.round((x1 - x0) / 2), cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    sc.stand(cv, x0, depth, w * 2, h * 2);
    const g = cv.getContext('2d'), m = Array.from({ length: n }, () => ({ x: R() * w | 0, y: R() * h | 0, v: 1 + (R() * 2 | 0), k: ks[R() * ks.length | 0], p: R() * 4 | 0 }));
    let last = -1;
    sc.every(40, () => {
      const st = Math.floor(performance.now() * fps / 1000);
      if (st === last) return;
      last = st;
      g.clearRect(0, 0, w, h);
      for (const q of m) {
        const y = pmod(q.y + dir * Math.floor(st * q.v / 2), h), x = q.x + [0, 1, 0, -1][(st + q.p) % 4];
        g.fillStyle = sc.C[q.k]; g.fillRect(x, y, 1, 1);
      }
    });
  }
  /* Something passing behind the action: a w x h px standee at `depth`, crossing plane x x0 to
     x1 every `period` seconds (smoothly), `lift` px off the ground, drawn frame by frame
     (draw(pen, frame), `frames` of them at `fps`). */
  function crosser(sc, { depth = -300, x0 = -400, x1 = 1900, w = 12, h = 8, lift = 0, period = 9, frames = 2, fps = 6, draw }) {
    const cv = document.createElement('canvas'), H = h + lift;
    cv.width = w; cv.height = H;
    const el = sc.stand(cv, x0, depth, w * 2, H * 2), g = cv.getContext('2d'), p = Scene.pen(g, sc.C);
    let lf = -1;
    sc.every(40, () => {
      const t = performance.now() / 1000, f = Math.floor(t * fps) % frames;
      el.style.left = Math.round(x0 + (x1 - x0) * ((t / period) % 1)) + 'px';
      if (f !== lf) { lf = f; g.clearRect(0, 0, w, H); draw(p, f); }
    });
  }

  /* ---------- prop art (propArt's signature) ---------- */
  // Rows top to bottom: half(f) the half-width (fraction of w) at height f (0 top, 1 base); tones [[end, color]] across.
  function body(fill, cx, top, w, h, half, tones, lean = () => 0) {
    const u0 = Math.round(cx - w / 2);
    for (let r = 0; r < h; r++) {
      const f = (r + 0.5) / h, hf = half(f);
      if (hf <= 0) continue;
      const a = Math.round(w * (0.5 - hf)), b = Math.round(w * (0.5 + hf));
      let from = a;
      for (const [end, c] of tones) { const to = Math.min(b, Math.round(w * end)); if (to > from) fill(u0 + from + lean(r), top + r, to - from, c); from = Math.max(from, to); }
    }
  }
  const T3 = (C, l) => [[1 / 3, C[l + 1]], [2 / 3, C[Math.max(1, l)]], [1, C[Math.max(0, l - 1)]]];
  const dk = (C, l) => C[Math.max(0, l - 1)];
  // A heat crawl up a column: glow every other row from the top down, further with heat.
  const seams = (glow, x, top, h, heat) => { if (heat) for (let v = Math.round(h * (heat === 2 ? 0 : 0.5)); v < h - 1; v += 2) glow(x, top + v); };

  const ART = {
    // The casino floor: slot cabinets, chip stacks, and card towers that catch fire.
    casino(fill, glow, C, l, k, cx, top, w, h, seed, heat) {
      if (k === 'slot') {
        body(fill, cx, top, w, h, (f) => (f < 0.06 ? 0.4 : 0.5), T3(C, l));
        const sx = Math.round(cx - w * 0.3), sw = Math.round(w * 0.6), sy = top + Math.round(h * 0.22), sh = Math.round(h * 0.2);
        for (let v = 0; v < sh; v++) { fill(sx, sy + v, sw, C[7]); for (let i = 1; i < 3; i++) fill(sx + Math.round(sw * i / 3), sy + v, 1, dk(C, l)); }
        fill(Math.round(cx - w * 0.4), top, Math.round(w * 0.8), C[8]);
        if (heat) for (let u = Math.round(cx - w * 0.4); u < cx + w * 0.4; u += 2) glow(u, top);
        return;
      }
      if (k === 'chips') {
        const u0 = Math.round(cx - w * 0.45), cw = Math.round(w * 0.9);
        for (let r = 0; r < h; r++) { const s = r % 6 < 3; fill(u0, top + r, Math.round(cw / 3), s ? C[8] : C[l + 1]); fill(u0 + Math.round(cw / 3), top + r, Math.round(cw / 3), C[Math.max(1, l)]); fill(u0 + Math.round(cw * 2 / 3), top + r, cw - Math.round(cw * 2 / 3), dk(C, l)); }
        return;
      }
      // tower: cards leaned into a pyramid, course by course
      body(fill, cx, top, w, h, (f) => f / 2, T3(C, l));
      for (let c = 1; c < 4; c++) {
        const v = Math.round(h * c / 4), hw = Math.round(w * c / 8);
        fill(Math.round(cx - hw), top + v, hw * 2, dk(C, l));
        if (heat === 2 || (heat === 1 && c > 1)) for (let u = Math.round(cx - hw) + 1; u < cx + hw; u += 2) glow(u, top + v + 1);
      }
      if (heat === 2) glow(cx, top);
    },
    // The lava shore: the map's spikes and basalt, and vents that spill more each ante.
    lava(fill, glow, C, l, k, cx, top, w, h, seed, heat) {
      if (k !== 'vent') return RunMap.propArt(fill, glow, C, l, k, cx, top, w, h, seed, heat);
      body(fill, cx, top, w, h, (f) => (f < 0.15 ? 0.22 + f : 0.37 + 0.13 * (f - 0.15) / 0.85), T3(C, l));
      const hw = Math.round(w * 0.2);
      for (let u = -hw + 1; u < hw; u++) glow(cx + u, top);
      seams(glow, cx - 1, top + 1, h, heat);
      if (heat === 2) seams(glow, cx + Math.round(w * 0.2), top + 3, h, 2);
    },
    // The graveyard: dead trees, headstones, and crosses whose eyes light up.
    graveyard(fill, glow, C, l, k, cx, top, w, h, seed, heat) {
      if (k === 'tree') {
        const bark = [[0.5, C[Math.max(1, l)]], [1, dk(C, l)]];
        body(fill, cx, top, w, h, (f) => (f < 0.3 ? 0 : f > 0.9 ? 0.12 : 0.07), bark);
        for (let i = 0; i < 4; i++) {
          const s = (i + seed) % 2 ? 1 : -1, y0 = top + Math.round(h * (0.32 + i * 0.13)), len = Math.round(w * (0.45 - i * 0.08));
          for (let j = 0; j <= len; j++) fill(Math.round(cx + s * j), y0 - Math.round(j * (0.9 - i * 0.1)), 1, dk(C, l));
        }
        return;
      }
      if (k === 'stone') {
        const lean = (r) => Math.round((1 - (r + 0.5) / h) * (seed % 3 - 1) * 2);
        body(fill, cx, top, w, h, (f) => (f < 0.2 ? 0.5 * Math.sqrt(f / 0.2) : 0.5), T3(C, l), lean);
        for (const f of [0.38, 0.52]) fill(Math.round(cx - w * 0.2) + lean(Math.round(h * f)), top + Math.round(h * f), Math.round(w * 0.4), dk(C, l));
        return;
      }
      // cross
      body(fill, cx, top, w, h, (f) => (f > 0.18 && f < 0.28 ? 0.38 : 0.09), T3(C, l));
      if (heat) { glow(cx - 1, top + Math.round(h * 0.23)); glow(cx + 1, top + Math.round(h * 0.23)); }
      if (heat === 2) seams(glow, cx, top + Math.round(h * 0.3), Math.round(h * 0.7), 2);
    },
  };

  /* ---------- the crypt: a damp stone wall with sagging arches, lit by candles ---------- */
  /* Built like the forge: a floor and a wall rather than props to the horizon. The flagstone floor
     runs up to a wall of damp stone blocks (darker and streaked toward its foot) standing at
     D_WALL, with six arches whose crowns have sagged: open ones dark inside, one bricked up, one
     half fallen in on its rubble, and cracks running up from the dropped keystones. Candles stand
     in clusters at the arch feet, on ledges between them, and in four groups on the floor; more
     are lit each ante (and taller at ante 3), and at ante 3 eyes drift in the open arches. The
     wall's art is at 2 map units a pixel, WW x WH, its left edge at plane x WX. */
  const D_WALL = -130, WX = -1100, WW = 1800, WH = 230;
  function hs(a, b) { let n = (a * 374761393 + b * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
  const ARCHES = [...Array(6)].map((_, i) => ({ cx: 150 + i * 300, r: 40, sag: 5 + Math.round(hs(i, 3) * 7), kind: i % 3 })); // kind 0 open, 1 bricked up, 2 fallen in
  // One pixel of a stone-block wall H px tall (courses 10 px, blocks 26 px, staggered), lit from the upper left, damp toward its foot.
  function stoneAt(x, y, H, s) {
    const cs = y % 10, course = Math.floor(y / 10), bx = x + (course % 2) * 13 + Math.floor(hs(course, s) * 9), bi = Math.floor(bx / 26), cx = pmod(bx, 26);
    if (cs === 9 || cx === 25) return 3;
    const dark = hs(bi, course + s) < 0.22;
    let k = dark ? 4 : 5;
    if (cs === 0 || cx === 0) k = dark ? 5 : 6; else if (cs === 8 || cx === 24) k -= 1;
    const d = (y - (H - 80)) / 80;
    if (d > 0 && bay(x, y) < d * 13) k = Math.max(3, k - 1);
    if (hs(Math.floor(x / 6), 77 + s) > 0.86 && y > H - 120 && bay(x, y) < 7) k = Math.max(3, k - 1); // damp streaks
    return k;
  }
  // A sagging arch's curve: the height of its edge dx from the middle (springing at sy, radii rx, ry, the crown dropped by sag).
  const curve = (dx, sy, rx, ry, sag) => { const q = cl(1 - (dx / rx) ** 2); return sy - ry * Math.sqrt(q) + sag * q; };
  // The arch ring of voussoirs th px deep: a ramp index, -2 inside the opening, -1 outside the ring.
  function ringTone(x, y, cx, sy, rx, ry, sag, th) {
    const dx = x - cx;
    if (Math.abs(dx) >= rx + th || y > sy) return -1;
    const yo = curve(dx, sy, rx + th, ry + th, sag);
    if (y < yo) return -1;
    if (Math.abs(dx) < rx && y >= curve(dx, sy, rx, ry, sag)) return -2;
    const a = Math.atan2(sy - y, dx * ry / rx), seg = a / (Math.PI / 13);
    if (seg - Math.floor(seg) < 0.07) return 3;
    if (Math.abs(dx) < rx && y >= curve(dx, sy, rx, ry, sag) - 1.5) return 3;
    if (y < yo + 1.5) return 4;
    return Math.abs(a - Math.PI / 2) < 0.12 ? 7 : dx < 0 ? 6 : 5; // the keystone catches the light
  }
  function wallArt(C) {
    const cv = document.createElement('canvas');
    cv.width = WW; cv.height = WH;
    const g = cv.getContext('2d'), img = g.createImageData(WW, WH), px = img.data, RGB = C.map(Scene.rgb);
    const put = (x, y, k) => { if (x < 0 || y < 0 || x >= WW || y >= WH) return; const o = (y * WW + x) * 4, c = RGB[k]; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255; };
    const R = mulberry32(5), sy = WH - 88;
    for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) {
      let k = stoneAt(x, y, WH, 0);
      for (const a of ARCHES) {
        const t = ringTone(x, y, a.cx, sy, a.r, a.r, a.sag, 9), dx = x - a.cx, ad = Math.abs(dx);
        if (t >= 0) k = t;
        if (y > sy && ad < a.r + 7 && ad >= a.r) k = ad < a.r + 1 ? 3 : dx < 0 ? (ad > a.r + 5 ? 4 : 6) : (ad > a.r + 5 ? 3 : 5); // the jambs
        if (t !== -2 && !(y > sy && ad < a.r)) continue;
        const top = curve(dx, sy, a.r, a.r, a.sag);
        if (a.kind === 1) { const st = stoneAt(x * 2, y * 2, WH * 2, 4); k = st === 3 ? 1 : st >= 6 ? 3 : 2; } // bricked up, in shadow
        else { k = dx > a.r - 5 ? 3 : y - top < 3 || bay(x, y) < 3 ? 1 : 0; if (y > WH - 4) k = 1; } // dark inside; the right reveal lit
        if (a.kind === 2) { const hh = WH - 26 + Math.round(ad * 0.45 + hs(x >> 2, 1) * 4); if (y > hh) { const st = stoneAt(x * 3, y * 3, WH * 3, 9); k = st === 3 ? 2 : st - 1; } } // fallen-in rubble
      }
      put(x, y, k);
    }
    const crack = (x, y, len) => { for (let i = 0; i < len; i++) { put(x, y, 2); put(x - 1, y, 6); y += 1; x += R() < 0.4 ? (R() < 0.5 ? -1 : 1) : 0; } };
    for (const a of ARCHES) crack(a.cx + 2, sy - a.r - a.sag - 6, 28 + Math.round(R() * 20));
    for (let i = 0; i < 34; i++) crack(Math.floor(R() * WW), Math.floor(R() * WH * 0.7), 10 + Math.floor(R() * 28));
    for (const a of ARCHES) if (a.kind === 2) for (let j = 0; j < 14; j++) { const x = a.cx + a.r + 4 + Math.floor(R() * 40), y = WH - 1 - Math.floor(R() * 10); put(x, y, 3); put(x + 1, y, 5); put(x, y - 1, 6); }
    g.putImageData(img, 0, 0);
    return cv;
  }
  // Candles on the wall (wall px): clusters at the arch feet and three on a ledge between arches.
  const CANDLES = (() => {
    const R = mulberry32(12), out = [];
    ARCHES.forEach((a) => {
      for (const side of [-1, 1]) {
        if (a.kind === 2 && side > 0) continue; // the rubble side
        const bx = a.cx + side * (a.r + 18);
        for (let j = 0; j < 3 + Math.floor(R() * 3); j++) out.push({ x: bx + Math.round((R() - 0.5) * 16), y: WH - 1 - Math.floor(R() * 3), h: 4 + Math.floor(R() * 7), id: out.length });
      }
      for (const [dx, h] of [[-8, 5], [-3, 8], [3, 6]]) out.push({ x: a.cx + 150 + dx, y: WH - 60, h, id: out.length });
    });
    return out;
  })();
  const candleArt = ({ P }, c) => { for (let v = 0; v < c.h; v++) { P(c.x, c.y - v, v === c.h - 1 ? 6 : 7); P(c.x + 1, c.y - v, 5); } P(c.x + 2, c.y - Math.floor(c.h / 2), 6); P(c.x - 1, c.y, 3); P(c.x + 2, c.y, 3); };
  // A candle flame in three stepped frames (never blinking), `tall` px taller at ante 3; the wick under it.
  const flameArt = ({ R }, c, st, tall) => { const f = (st + c.id) % 3, h = [3, 4, 3][f] + tall; R(c.x, c.y - c.h - h + 1, 2, h - 1, 8); R(c.x + [0, 0, 1][f], c.y - c.h - h, 1, 2, 7); R(c.x + (c.id % 2), c.y - c.h, 1, 1, 1); };
  const lit = (heat, c) => hs(c.id, 7) < [0.35, 0.75, 1][heat];
  function crypt(sc, heat, { shadows = [], over }) {
    const { C } = sc;
    sc.stage.firstChild.remove(); // the nebula sky: the wall stands in front of it
    const gnd = Scene.ground(sc, {
      x0: -1200, y0: D_WALL, w: 1920, h: (820 - D_WALL) / 2, tones: [3, 4, 5, 6], seed: 31, grit: 1500,
      light: (X, Y) => 1.15 - Math.hypot((X - 640) / 1300, (Y - 300) / 700),
      pattern: (X, Y) => { const r = Math.floor(Y / 28); return pmod(Y, 28) < 2 || pmod(X + (r % 2) * 24, 48) < 2 ? 3 : -1; }, // flagstones
      shadows: [[-1200, D_WALL, 2640, D_WALL + 18], ...shadows], over, // the wall's foot in shade
    });
    const wall = wallArt(C);
    sc.stand(wall, WX, D_WALL, WW * 2, WH * 2);
    const wp = Scene.pen(wall.getContext('2d'), C);
    for (const c of CANDLES) candleArt(wp, c);
    const hot = document.createElement('canvas');
    hot.width = WW; hot.height = WH;
    sc.stand(hot, WX, D_WALL + 1, WW * 2, WH * 2);
    const hg = hot.getContext('2d'), hp = Scene.pen(hg, C);
    // Candles on the floor, nearer than the wall, so the flames sit in the depth too.
    const floor = [[180, 250], [1250, 230], [330, 120], [1120, 90]].map(([x, d], i) => {
      const cv = document.createElement('canvas');
      cv.width = 26; cv.height = 22;
      sc.stand(cv, x, d, 52, 44);
      const g = cv.getContext('2d'), p = Scene.pen(g, C), cs = [0, 1, 2, 3].map((j) => ({ x: 3 + j * 5 + (j % 2), y: 21 - (j % 2), h: 5 + ((i + j) * 3) % 7, id: 100 + i * 4 + j }));
      cs.forEach((c) => candleArt(p, c));
      return { g, p, cs };
    });
    motes(sc, { n: 24, dir: 1, ks: [6], fps: 3, depth: -100, h: 200 }); // dust drifting down
    let last = -1;
    sc.every(50, () => {
      const st = Math.floor(performance.now() / 160);
      if (st === last) return;
      last = st;
      hg.clearRect(0, 0, WW, WH);
      for (const c of CANDLES) if (lit(heat, c)) flameArt(hp, c, st, heat === 2 ? 1 : 0);
      if (heat === 2) ARCHES.forEach((a, i) => { // eyes drifting in the dark of the open arches
        if (a.kind) return;
        const dx = [-12, -9, -6, -3, 0, -3, -6, -9][Math.floor(st / 3 + i) % 8];
        hp.R(a.cx + dx, WH - 58, 2, 1, 8); hp.R(a.cx + dx + 6, WH - 58, 2, 1, 8);
      });
      for (const f of floor) {
        f.g.clearRect(0, 0, 26, 22);
        for (const c of f.cs) { candleArt(f.p, c); if (heat && lit(heat, c)) flameArt(f.p, c, st, 0); }
      }
    });
    return gnd;
  }

  /* ---------- the settings ---------- */
  // Each: ground options for the heat, the props (kinds, size), and the life behind the action.
  const SET = {
    ruins: {
      ground: () => ({}),
      life(sc, heat) { motes(sc, heat ? { n: 15 + 25 * heat } : { n: 20, dir: 1, ks: [5], fps: 4 }); },
    },
    crypt: { build: crypt },
    casino: {
      ground: () => ({ seed: 17, grit: 1200, pattern: (X, Y) => (pmod(X + Y, 64) < 2 || pmod(X - Y, 64) < 2 ? 4 : -1) }),
      kinds: { spike: 'slot', basalt: 'chips', strata: 'tower' }, size: { slot: [0.45, 1.3], chips: [0.5, 0.6], tower: [0.6, 1.2] },
      life(sc, heat) {
        motes(sc, { n: 12 + 10 * heat, ks: [8, 7], fps: 3 });
        crosser(sc, { depth: 120, w: 8, h: 8, period: 6, frames: 4, fps: 8, draw: ({ R }, f) => { R(1, 0, 6, 8, 1); R(0, 1, 8, 6, 1); R(1, 1, 6, 6, 8); R(1 + [0, 2, 4, 2][f], 1, 2, 6, 7); } }); // a rolling chip
      },
    },
    lava: {
      ground: (heat) => ({ tones: [2, 3, 4, 5], seed: 7, pattern: (X, Y) => { const n = Math.abs(Math.sin(X * 0.013 + Math.sin(Y * 0.021) * 2) + Math.sin(Y * 0.017 + X * 0.004)); return n < 0.035 ? (heat ? 8 : 1) : n < 0.07 ? 2 : -1; } }),
      kinds: { strata: 'vent' }, size: { vent: [0.6, 1.4] },
      life(sc, heat) { motes(sc, { n: 30 + 20 * heat }); motes(sc, { n: 10 + 10 * heat, depth: 60, h: 80, seed: 3 }); },
    },
    graveyard: {
      ground: () => ({ seed: 29, pattern: (X, Y) => (Math.abs(X - 720 - (Y - 400) * 0.35) < 70 && bay(Math.round(X / 2), Math.round(Y / 2)) < 9 ? 6 : -1) }),
      kinds: { spike: 'tree', basalt: 'stone', strata: 'cross' }, size: { tree: [0.6, 1.6], stone: [0.45, 0.9], cross: [0.55, 0.8] },
      life(sc) {
        motes(sc, { n: 25, dir: 1, ks: [4], fps: 4 });
        crosser(sc, { depth: -380, w: 11, h: 5, lift: 90, period: 11, draw: ({ R }, f) => { R(4, 2, 4, 2, 1); R(8, 1, 2, 1, 1); if (f) { R(0, 3, 4, 1, 1); } else { R(1, 0, 3, 2, 1); R(4, 1, 1, 1, 1); } } }); // a crow
      },
    },
  };

  function setting(sc, name, { heat = 0, area = AREA, clear = CLEAR, near = [], light = LIGHT, rubble = [], shards = [], shadows = [], over, ...more } = {}) {
    if (name === 'forge') return Factory.build(sc, heat, { rubble, shards, shadows, over });
    const S = SET[name];
    if (!S) throw new Error('No scene setting called ' + name + ' - try ' + Object.keys(SET).concat('forge').join(', '));
    if (S.build) return S.build(sc, heat, { shadows, over });
    const gnd = Scene.ground(sc, { x0: -1200, y0: -1000, w: 1920, h: 900, light, rubble, shards, shadows, over, ...S.ground(heat), ...more });
    Scene.ruins(sc, { area, clear, near, heat, draw: ART[name] || RunMap.propArt, kinds: S.kinds, size: S.size });
    S.life(sc, heat);
    return gnd;
  }

  Object.assign(Scene, { setting, motes, crosser, SETTINGS: Object.keys(SET).concat('forge') });
})();
