'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — scene settings: the places an event scene can stand in. Each one is
   the ground, the props scattered to the horizon (with a wall of tall ones hiding the far
   edge), and something alive in the background, all hotter each ante.
     Scene.setting(sc, name, opts) builds one behind the action and returns the ground
     (Scene.ground's { clear, shade, patch }) for contact shadows.
   Names: ruins (the run map's spires), crypt (a stone wall with sagging arches), casino, tropicana (a casino court: an arcade under stained-glass sunbursts), lava,
   graveyard, forge (Factory).
   Each is a preset of four parts that mix and match (see SETTINGS below): a floor, a backdrop
   (the sky or a wall), features (spires, slot cabinets..., any number) and the critters and
   effects in its background, so opts { floor, backdrop, features, critters, effects } can swap
   any of them, e.g. slot cabinets and graves on flagstones before the crypt wall.
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
     pixel left and right; ks are their ramp colors, `size` their px square (2, so they survive the
     CRT's scanlines and read at a distance). Give each layer its own `seed`, or they overlap. */
  function motes(sc, { x0 = -1200, x1 = 2400, depth = 150, h = 170, n = 60, dir = -1, ks = [8, 7], fps = 6, seed = 9, size = 2 }) {
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
        g.fillStyle = sc.C[q.k]; g.fillRect(x, y, size, size);
      }
    });
  }
  /* Something passing behind the action: a w x h px standee at `depth`, crossing plane x x0 to
     x1 every `period` seconds (smoothly), `lift` px off the ground, drawn frame by frame
     (draw(pen, frame), `frames` of them at `fps`). */
  /* A group of critters passing behind the action. `life` (the builder's sliders) varies them:
     count (how many, times n), size (scale), variety (how much each one's size, depth and shape
     differ: draw(pen, frame, variant) gets variant 0, 1 or 2), and motion (how lively: some walk
     the other way, speeds differ, walkers stop and start, fliers rise and dip in stepped px). */
  const LIFE = { count: 1, size: 1, variety: 0.5, motion: 0.5 };
  function crosser(sc, { depth = -300, x0 = -400, x1 = 1900, w = 12, h = 8, lift = 0, period = 9, frames = 2, fps = 6, n = 1, seed = 1, px = 2, draw, life = {} }) {
    const L = { ...LIFE, ...life }, fly = lift > 0, pad = fly ? 8 : 0, span = x1 - x0;
    const many = Math.max(0, Math.round(n * L.count));
    const bugs = Array.from({ length: many }, (_, i) => {
      const R = mulberry32(seed * 101 + i * 7 + 3);
      const s = Math.max(0.5, Math.round(L.size * (1 + L.variety * (R() - 0.5) * 1.2) * 4) / 4); // in quarter steps
      const variant = R() < L.variety ? 1 + Math.floor(R() * 2) : 0;
      const dir = R() < 0.4 * Math.min(1, L.motion) ? -1 : 1;
      // lift is in sprite px at the standard 2 plane px each, so the height flown stays put whatever the critter's size.
      const H = h + pad * 2 + 2 + Math.round(lift * 2 / (px * s)), W = w + 2, cv = document.createElement('canvas'); // a px each side for the rim
      cv.width = W; cv.height = H;
      const el = sc.stand(cv, x0, Math.round(depth + (R() - 0.5) * 160 * L.variety), W * px * s, H * px * s); // px: plane px per sprite px
      return { cv, el, g: cv.getContext('2d'), H, W, variant, dir, x: x0 + R() * span, spd: span / period * Math.max(0.3, 1 + L.motion * (R() - 0.5) * 1.2),
        w1: 0.4 + R() * 0.8, ph: R() * 7, ft: R() * frames, key: '' };
    });
    bugs.forEach((b) => (b.p = Scene.pen(b.g, sc.C)));
    const rimRGB = Scene.rgb(sc.C[6]);
    let last = performance.now();
    sc.every(40, () => {
      const now = performance.now(), dt = Math.min(0.2, (now - last) / 1000), t = now / 1000;
      last = now;
      for (const b of bugs) {
        const wave = Math.sin(t * b.w1 + b.ph);
        // Walkers stop and go (more stops with more motion); fliers speed up and slow down.
        const go = fly ? 1 + L.motion * 0.4 * wave : wave < -1 + L.motion * 0.7 ? 0 : 1 + L.motion * 0.4;
        b.x += b.dir * b.spd * go * dt;
        if (b.x > x1) b.x = x0; else if (b.x < x0) b.x = x1;
        b.el.style.left = Math.round(b.x) + 'px';
        if (go) b.ft += dt * fps * go; // a stopped walker holds its pose
        const f = Math.floor(b.ft) % frames, bob = fly ? Math.round(Math.sin(Math.floor(t * 4) / 4 * b.w1 * 3 + b.ph) * L.motion * pad) : 0, key = f + ',' + bob;
        if (key === b.key) continue;
        b.key = key;
        b.g.setTransform(1, 0, 0, 1, 0, 0);
        b.g.clearRect(0, 0, b.W, b.H);
        b.g.setTransform(b.dir, 0, 0, 1, b.dir < 0 ? w + 1 : 1, pad + 1 + bob); // facing its way, risen or dipped
        draw(b.p, f, b.variant);
        if (fly) rim(b.g, b.W, b.H, rimRGB); // so a dark flier reads over the dark sky too
      }
    });
  }
  // A 1 px rim of one tone around everything drawn on a canvas (as the figurine's ink outline, in a pale tone).
  function rim(g, W, H, [r, gg, bb]) {
    const img = g.getImageData(0, 0, W, H), d = img.data, solid = [];
    for (let i = 0; i < W * H; i++) solid.push(d[i * 4 + 3] > 0);
    const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && solid[y * W + x];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (solid[y * W + x] || !(on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) continue;
      const o = (y * W + x) * 4; d[o] = r; d[o + 1] = gg; d[o + 2] = bb; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
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

  /* ---------- the woods: tiered pines, big firs and leafy bushes ---------- */
  /* Leaves are three tones across (lit from the left), broken up with Bayer dither, so the edges
     between them read as clumps of needles and leaves rather than bands. */
  const leafTone = (C, l, x, y, p) => {
    const t = p + (bay(x, y) / 16 - 0.5) * 0.45;
    return t < 0.36 ? C[l + 1] : t < 0.7 ? C[Math.max(1, l)] : dk(C, l);
  };
  // A trunk w px wide from y0 down to the base at y1, bark lit from the left.
  function bark(fill, C, l, cx, w, y0, y1) {
    const x = Math.round(cx - w / 2);
    for (let y = y0; y < y1; y++) { fill(x, y, Math.ceil(w / 2), C[Math.max(1, l - 1)]); fill(x + Math.ceil(w / 2), y, Math.floor(w / 2), C[Math.max(0, l - 2)]); }
  }
  // Round clumps [dx, dy, r] as fractions of the width, filled with leafTone and a darker underside.
  function clumps(fill, C, l, cx, cy, w, list) {
    const R = list.map(([dx, dy, r]) => [cx + dx * w, cy + dy * w, r * w]), x0 = Math.floor(cx - w), y0 = Math.floor(cy - w);
    for (let y = y0; y < cy + w; y++) for (let x = x0; x < cx + w; x++) {
      const c = R.find(([a, b, r]) => (x + 0.5 - a) ** 2 + (y + 0.5 - b) ** 2 <= r * r);
      if (!c) continue;
      const [a, b, r] = c, under = (y + 0.5 - b) / r > 0.6;
      fill(x, y, 1, under ? dk(C, l) : leafTone(C, l, x, y, 0.5 + ((x - a) + (y - b) * 0.8) / (r * 2.4)));
    }
  }
  ART.woods = function (fill, glow, C, l, k, cx, top, w, h, seed, heat) {
    if (k === 'pine' || k === 'fir') {
      // Tiers of boughs, each wider than the one above, over a short trunk: four on a pine, six on a big fir.
      const crown = Math.round(h * 0.86), tiers = k === 'fir' ? 6 : 4;
      const half = (i, g) => w * (0.14 + 0.36 * i / (tiers - 1)) * (0.35 + 0.65 * g) + 0.5; // tier i's half-width, g down the tier
      bark(fill, C, l, cx, Math.max(2, Math.round(w * 0.14)), top + crown - 2, top + h);
      for (let r = 0; r < crown; r++) {
        const f = r / crown, i = Math.min(tiers - 1, Math.floor(f * tiers)), g = f * tiers - i;
        const hw = half(i, g), a = Math.round(cx - hw), b = Math.round(cx + hw);
        for (let x = a; x < b; x++) fill(x, top + r, 1, g > 0.86 ? dk(C, l) : leafTone(C, l, x, top + r, (x - a) / Math.max(1, b - a) - (1 - g) * 0.12));
      }
      if (k === 'fir' && heat) for (let i = 1; i < tiers; i += 3 - heat) { // embers on the bough tips, more each ante
        const y = top + Math.round(crown * (i + 0.8) / tiers), hw = Math.round(half(i, 0.8));
        glow(cx - hw + 1, y); glow(cx + hw - 2, y);
      }
      if (heat === 2) glow(cx, top);
      return;
    }
    // bush: two or three low clumps sitting on the ground
    clumps(fill, C, l, cx, top + h - w * 0.28, w, [[-0.18, 0.02, 0.26], [0.16, 0.04, 0.24], [0, -0.1, 0.24]]);
  };

  /* ---------- the crypt: a damp stone wall with sagging arches, lit by candles ---------- */
  /* A wall backdrop, like the forge's: it closes the room rather than scattering props to the
     horizon (its preset floor is the flagstones, FLOORS below). A wall of damp stone blocks (darker and streaked toward its foot) standing at
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
  function cryptWall(sc, heat) {
    const { C } = sc;
    sc.stage.firstChild.remove(); // the nebula sky: the wall stands in front of it
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
  }

  /* ---------- the Tropicana: a casino court's arcade under stained-glass sunbursts ---------- */
  /* A wall backdrop after the Atlantic City Tropicana's fountain court: pale stucco in two tiers.
     Below, an arcade of round arches between fluted pilasters, dark inside, with slot cabinets
     glowing in the dark beyond; two arches carry an oval sign plaque. Above each arch, a half-round
     lunette of stained glass: a sunburst of rays in leading round a gold sun, in a lit molding.
     Between the tiers runs a band of recessed relief panels with a row of marquee bulbs; a run of
     lit bulbs chases along it, longer each ante, and the cabinets' toppers light from ante 2. The
     wall's art is at 2 map units a pixel, TW x TH, its left edge at plane x TX, standing at D_TROP. */
  const D_TROP = -130, TX = -1100, TW = 1800, TH = 230;
  // The arches spring low, so their fanlights show under every camera; the big lunettes sit above the band.
  const T_SPRING = 196, T_AR = 44, T_LUN = 118, T_LR = 60, T_B0 = 120, T_B1 = 140;
  const TARCH = [...Array(6)].map((_, i) => ({ cx: 150 + i * 300, sign: i === 2 || i === 4 }));
  // One pixel of a stained-glass sunburst, a half disc of radius r on the line cy (dx from its
  // middle), with n rays: a ramp index, or -1 outside it. `mold` adds a lit molding round it.
  function lunette(x, y, dx, cy, r, n, mold) {
    const d = Math.hypot(dx, y - cy);
    if (mold && y === cy + 1 && Math.abs(dx) < r + 7) return 4; // the sill's shadow
    if (y > cy || d >= r + (mold ? 7 : 0)) return -1;
    if (d >= r) return d < r + 2 ? (dx < 0 ? 7 : 5) : d < r + 5 ? (dx < 0 ? 6 : 5) : 4; // the molding, lit upper left
    if (d >= r - 2) return 2; // the outer leading
    const sun = Math.round(r * 0.22), ring = Math.round(r * 0.6);
    if (d < sun) return d >= sun - 2 ? 2 : 8; // the sun
    const seg = Math.atan2(cy - y, dx) / Math.PI * n, ray = Math.floor(seg);
    if (seg - ray < 0.1 || Math.abs(d - ring) < 1) return 2; // leading between the panes, and a ring
    const k = d < ring ? (ray % 2 ? 8 : 7) : (ray % 2 ? 5 : 7);
    return k !== 8 && bay(x, y) < 3 ? k - 1 : k; // the glass's grain
  }
  function tropArt(C) {
    const cv = document.createElement('canvas');
    cv.width = TW; cv.height = TH;
    const g = cv.getContext('2d'), img = g.createImageData(TW, TH), px = img.data, RGB = C.map(Scene.rgb);
    const put = (x, y, k) => { if (x < 0 || y < 0 || x >= TW || y >= TH) return; const o = (y * TW + x) * 4, c = RGB[k]; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255; };
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      let k = 6; // pale stucco, a step darker under the cornice and toward the foot
      if (y < 8) k = y < 6 ? 4 : 7; // the cornice: a dark soffit, its lit lip
      else if (y < 14 && bay(x, y) < (14 - y) * 2) k = 5;
      if (y > TH - 60 && bay(x, y) < (y - (TH - 60)) / 4) k = 5;
      if (y >= T_B0 && y <= T_B1) { // the band: moldings top and bottom, recessed panels between the lunettes
        if (y === T_B0 || y === T_B1 - 1) k = 7; else if (y === T_B0 + 1 || y === T_B1) k = 4;
        else {
          const ix = pmod(x, 300) - 86, iy = y - T_B0 - 5, iw = 128, ih = T_B1 - T_B0 - 9;
          if (ix >= 0 && ix < iw && iy >= 0 && iy < ih) {
            k = ix < 1 || iy < 1 ? 4 : ix >= iw - 1 || iy >= ih - 1 ? 7 : 5; // recessed: shadowed top left, lit bottom right
            if (k === 5 && Math.abs(Math.abs(ix - iw / 2) - 22 - Math.abs(iy - ih / 2) * 1.8) < 1.2) k = 6; // a carved scroll
          }
        }
      }
      for (const a of TARCH) {
        const dx = x - a.cx, ad = Math.abs(dx), l = lunette(x, y, dx, T_LUN, T_LR, 14, true);
        if (l >= 0) k = l;
        if (y <= T_B1 || ad >= T_AR + 7) continue;
        const r = y > T_SPRING ? ad : Math.hypot(dx, y - T_SPRING);
        if (r < T_AR && y <= T_SPRING) k = lunette(x, y, dx, T_SPRING, T_AR, 10, false); // the fanlight
        else if (r < T_AR && y < T_SPRING + 3) k = y === T_SPRING + 1 ? 7 : 4; // the transom bar
        else if (r < T_AR) k = y < T_SPRING + 5 || dx < -T_AR + 4 || y > TH - 4 || bay(x, y) < 2 ? 1 : 0; // the dark doorway; its head and left reveal a step lighter
        else if (r < T_AR + 7) k = r < T_AR + 2 ? (dx < 0 ? 4 : 7) : r < T_AR + 5 ? (dx < 0 ? 7 : 5) : 4; // the jambs and archivolt
      }
      const pdx = pmod(x + 150, 300) - 150, pa = Math.abs(pdx); // pilasters halfway between the arches
      if (y > T_B1 && pa < 16) {
        if (y < T_B1 + 8) k = y < T_B1 + 3 ? 7 : pa > 13 ? 4 : 6; // the capital
        else if (y > TH - 12) k = y < TH - 10 ? 7 : pdx > 10 ? 4 : 5; // the base
        else k = pa > 12 ? (pdx < 0 ? 7 : 4) : pmod(pdx, 6) < 1 || pdx > 6 ? 5 : 6; // the fluted shaft
      }
      if (y >= TH - 3) k = y === TH - 3 ? 4 : 3; // the baseboard
      put(x, y, k);
    }
    for (const a of TARCH) if (a.sign) { // an oval sign plaque on the band over the arch, gold rimmed, lettered in blocks
      const cy = (T_B0 + T_B1) >> 1;
      for (let y = cy - 9; y <= cy + 9; y++) for (let x = a.cx - 24; x <= a.cx + 24; x++) {
        const e = ((x - a.cx) / 24) ** 2 + ((y - cy) / 9) ** 2;
        if (e <= 1) put(x, y, e > 0.75 ? (x < a.cx ? 8 : 4) : e > 0.6 ? 2 : 3);
      }
      for (let i = -15; i <= 13; i += 4) { put(a.cx + i, cy - 1, 7); put(a.cx + i + 1, cy - 1, 7); put(a.cx + i, cy, 7); put(a.cx + i + 1, cy, 6); }
    }
    g.putImageData(img, 0, 0);
    return cv;
  }
  // Slot cabinets in the dark of each arch (wall px), and the marquee bulbs along the band every 10 px.
  const TSLOTS = TARCH.flatMap((a, i) => [-28, -9, 10, 29].map((dx, j) => ({ x: a.cx + dx - 6, y: TH - 24, id: i * 4 + j })));
  const TBULBS = [...Array(TW / 10)].map((_, i) => ({ x: 4 + i * 10, y: T_B0 + 3 })).filter((b) => !TARCH.some((a) => a.sign && Math.abs(b.x - a.cx) < 28)); // not over the plaques
  function tropWall(sc, heat) {
    const { C } = sc;
    sc.stage.firstChild.remove(); // the nebula sky: the wall stands in front of it
    sc.stand(tropArt(C), TX, D_TROP, TW * 2, TH * 2);
    const hot = document.createElement('canvas');
    hot.width = TW; hot.height = TH;
    sc.stand(hot, TX, D_TROP + 1, TW * 2, TH * 2);
    const hg = hot.getContext('2d'), { R } = Scene.pen(hg, C), run = [3, 5, 8][heat];
    let last = -1;
    sc.every(50, () => {
      const st = Math.floor(performance.now() / 200); // 5 steps a second
      if (st === last) return;
      last = st;
      hg.clearRect(0, 0, TW, TH);
      for (const s of TSLOTS) { // a dark cabinet, its screen's reels stepping, a topper lit from ante 2
        const f = (st + s.id * 3) % 6;
        R(s.x, s.y, 12, 21, 1); R(s.x + 1, s.y - 2, 10, 2, heat ? 8 : 3); R(s.x + 2, s.y + 2, 8, 8, 5);
        for (let r = 0; r < 3; r++) R(s.x + 2 + r * 3, s.y + 3 + ((f + r) % 3) * 2, 2, 2, [7, 8, 6][(f + r + s.id) % 3]);
      }
      TBULBS.forEach((b, i) => R(b.x, b.y, 2, 2, pmod(i - st, 20) < run ? 8 : 4)); // a run of lit bulbs chasing right
    });
  }

  /* ---------- the carnival: rides under the open sky ----------
     Far back, where the floor ends at D_CARN, the carnival's skyline stands under the orrery sky (it
     stays open): a wooden roller coaster on its lattice at the left, a striped big top and two small
     tents, a Ferris wheel at the right, and pennant strings with bulbs between tall poles along the
     front. Pale on the dark sky, lit from the upper left. What moves (the wheel turning, the coaster's
     car, the pennants, a run of bulbs chasing along the strings, longer each ante) is on a second
     canvas just in front, redrawn 4 steps a second. Canvas px are 2 map units, KX the canvas's left
     edge in plane x. */
  const D_CARN = -260, KX = -1100, KW = 1800, KH = 320, KG = KH - 1; // KG: the ground row
  // The coaster's track height (canvas px) over x, through key points, eased between them.
  const TRACK = [[300, 24], [330, 40], [440, 236], [470, 244], [500, 228], [560, 40], [600, 30], [650, 150], [690, 160], [740, 60], [770, 54], [810, 112], [840, 116], [880, 30]];
  const trackH = (x) => {
    for (let i = 1; i < TRACK.length; i++) {
      const [x0, h0] = TRACK[i - 1], [x1, h1] = TRACK[i];
      if (x <= x1) { const u = Scene.cl((x - x0) / (x1 - x0)); return h0 + (h1 - h0) * (1 - Math.cos(u * Math.PI)) / 2; }
    }
    return TRACK[TRACK.length - 1][1];
  };
  const POLES = Array.from({ length: 10 }, (_, i) => 200 + i * 170);
  const WHEEL = { x: 1380, y: KG - 158, r: 132, spokes: 16 };
  function carnivalArt(C) {
    const cv = document.createElement('canvas');
    cv.width = KW; cv.height = KH;
    const { R, P } = Scene.pen(cv.getContext('2d'), C);
    // A 2 px line, sampled finely so a steep one has no gaps.
    const line = (x0, y0, x1, y1, k) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2); for (let i = 0; i <= n; i++) R(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, 2, 2, k); };
    // The coaster: posts every 16 px down to the ground, a brace across each bay, then the track on top.
    for (let x = 304; x < 878; x += 16) {
      const top = KG - trackH(x) + 4;
      R(x, top, 3, KG - top + 1, 4); R(x, top, 1, KG - top + 1, 5);
      const nx = x + 16, nt = KG - trackH(nx) + 4;
      if (nx < 878) { line(x + 2, KG, nx, nt + (KG - nt) * 0.35, 4); for (let y = KG - 40; y > Math.max(top, nt) + 8; y -= 40) R(x + 2, y, 14, 2, 4); }
    }
    for (let x = 300; x < 880; x += 0.25) { const y = KG - trackH(x); R(x, y - 2, 1, 2, 7); R(x, y, 1, 2, 6); R(x, y + 2, 1, 1, 4); } // lit rail, its body, its shadowed side
    // A tent: a striped cone of a roof (lit stripes on the left, shaded on the right), scalloped
    // valance, striped walls with a dark doorway, a pole at the peak.
    const tent = (cx, w, wallH, roofH) => {
      const top = KG - wallH - roofH;
      for (let y = top; y < KG - wallH; y++) {
        const hw = Math.max(1, (y - top) / roofH * w / 2);
        for (let x = Math.floor(cx - hw); x <= cx + hw; x++) {
          const s = Math.floor((x - cx) / hw * 4 + 4), lit = x < cx;
          P(x, y, s % 2 ? 8 : lit ? 7 : 5);
        }
      }
      for (let x = cx - w / 2; x < cx + w / 2; x++) { const d = [2, 3, 3, 2, 1, 0][pmod(Math.round(x - cx), 6)]; R(x, KG - wallH, 1, d + 2, Math.floor((x - cx) / 6) % 2 ? 8 : 7); }
      for (let x = cx - w / 2 + 2; x < cx + w / 2 - 2; x++) R(x, KG - wallH + 5, 1, wallH - 5, pmod(Math.floor((x - cx) / 10), 2) ? 6 : x < cx ? 7 : 5);
      const dw = Math.round(w * 0.12);
      for (let y = 0; y < wallH - 6; y++) { const hw = dw * y / (wallH - 6); R(cx - hw, KG - wallH + 6 + y, hw * 2 + 1, 1, 2); }
      R(cx, top - 16, 2, 16, 5);
    };
    tent(870, 230, 56, 110); tent(1110, 120, 34, 64); tent(1660, 136, 38, 70);
    // The Ferris wheel's legs (the wheel itself turns, on the moving canvas) and its boarding deck.
    for (const s of [-1, 1]) { line(WHEEL.x, WHEEL.y, WHEEL.x + s * 76, KG, 5); line(WHEEL.x + 2, WHEEL.y, WHEEL.x + s * 76 + 2, KG, s < 0 ? 6 : 4); }
    R(WHEEL.x - 92, KG - 8, 184, 9, 4); R(WHEEL.x - 92, KG - 8, 184, 2, 6);
    // Tall poles carrying the pennant strings.
    for (const x of POLES) { R(x, KG - 96, 3, 97, 4); R(x, KG - 96, 1, 97, 6); R(x - 1, KG - 100, 5, 4, 7); }
    return cv;
  }
  function carnivalWall(sc, heat) {
    const { C } = sc;
    sc.stand(carnivalArt(C), KX, D_CARN, KW * 2, KH * 2);
    const mv = document.createElement('canvas');
    mv.width = KW; mv.height = KH;
    sc.stand(mv, KX, D_CARN + 1, KW * 2, KH * 2);
    const g = mv.getContext('2d'), { R } = Scene.pen(g, C), run = [3, 5, 8][heat];
    let last = -1;
    sc.every(50, () => {
      const st = Math.floor(performance.now() / 250); // 4 steps a second
      if (st === last) return;
      last = st;
      g.clearRect(0, 0, KW, KH);
      // The wheel: two rims (lit on the upper left), spokes, the hub, and a gondola hanging from each spoke's end.
      const { x: cx, y: cy, r, spokes } = WHEEL, a0 = st * Math.PI / 128;
      for (let i = 0; i < spokes; i++) {
        const a = a0 + i * 2 * Math.PI / spokes;
        for (let k = 10; k < r; k += 1) R(cx + Math.cos(a) * k, cy + Math.sin(a) * k, 2, 2, 5);
      }
      for (let k = 0; k < 900; k++) {
        const a = k / 900 * 2 * Math.PI, lit = Math.cos(a) + Math.sin(a) < 0;
        R(cx + Math.cos(a) * r - 1, cy + Math.sin(a) * r - 1, 3, 3, lit ? 7 : 6);
        R(cx + Math.cos(a) * (r - 18), cy + Math.sin(a) * (r - 18), 2, 2, lit ? 6 : 5);
      }
      R(cx - 8, cy - 8, 17, 17, 6); R(cx - 6, cy - 6, 13, 13, 7); R(cx - 2, cy - 2, 5, 5, 4);
      for (let i = 0; i < spokes; i++) {
        const a = a0 + i * 2 * Math.PI / spokes, gx = Math.round(cx + Math.cos(a) * r), gy = Math.round(cy + Math.sin(a) * r);
        R(gx, gy, 2, 5, 5); R(gx - 7, gy + 4, 16, 3, 6); R(gx - 6, gy + 7, 14, 9, i % 2 ? 8 : 7); R(gx - 6, gy + 14, 14, 2, 4); R(gx - 4, gy + 9, 4, 3, 2);
      }
      // The coaster's car: three cars climbing and plunging round the track, a step at a time.
      const span = 560, head = 300 + pmod(st * 7, span);
      for (let c = 0; c < 3; c++) {
        const x = head - c * 13;
        if (x < 300) continue;
        const y = KG - trackH(x);
        R(x - 5, y - 9, 12, 7, 8); R(x - 5, y - 9, 12, 2, 7); R(x - 4, y - 11, 3, 2, 2);
      }
      // Pennant strings sagging between the poles, flags fluttering, bulbs chasing along them.
      let b = 0;
      for (let p = 0; p + 1 < POLES.length; p++) {
        const x0 = POLES[p] + 2, x1 = POLES[p + 1], y0 = KG - 92;
        for (let x = x0; x < x1; x += 0.5) { const u = (x - x0) / (x1 - x0); R(x, y0 + Math.sin(u * Math.PI) * 22, 1, 2, 5); }
        for (let i = 1; i < 8; i++) {
          const u = i / 8, x = x0 + (x1 - x0) * u, y = Math.round(y0 + Math.sin(u * Math.PI) * 22) + 2;
          if (i % 2) { const tip = (st + i + p) % 2; for (let j = 0; j < 9; j++) R(x - 4 + Math.floor(j / 2) + tip * (j >> 2), y + j, Math.max(1, 8 - j), 1, (i + p) % 3 ? 8 : 7); } // a flag
          else { R(x - 1, y, 4, 4, pmod(b - st, 12) < run ? 8 : 4); b++; } // a bulb
        }
      }
    });
  }

  /* ---------- critters and effects ---------- */
  /* Named background life any scene (or the builder, builder.html) can add: CRITTERS pass behind
     the action (Scene.crosser), EFFECTS drift through the air (Scene.motes); each takes the heat
     and option overrides. */
  // Each draw(pen, frame, variant): variant 0 is the standard shape, 1 and 2 its variations.
  const BAT = ({ R }, f, v = 0) => {
    R(5, 2, 3, 3, 1);
    if (v === 1) { R(5, 1, 1, 1, 1); R(7, 1, 1, 1, 1); } // big ears
    if (f) { R(0, 3, 5, 1, 1); R(8, 3, 5, 1, 1); if (v === 2) { R(0, 4, 1, 1, 1); R(12, 4, 1, 1, 1); } } // ragged, drooping tips
    else { R(1, 0, 4, 2, 1); R(8, 0, 4, 2, 1); R(4, 1, 1, 1, 1); R(8, 1, 1, 1, 1); }
  };
  const CROW = ({ R }, f, v = 0) => {
    R(4, 2, 4, 2, 1); R(8, 1, 2, 1, 1);
    if (v === 1) R(2, 3, 2, 1, 1); // a long tail
    if (v === 2) R(8, 0, 1, 1, 1); // a crest
    if (f) R(0, 3, 4, 1, 1); else { R(1, 0, 3, 2, 1); R(4, 1, 1, 1, 1); }
  };
  const CHIP = ({ R }, f, v = 0) => { const face = [8, 7, 3][v], edge = [7, 8, 6][v]; R(1, 0, 6, 8, 1); R(0, 1, 8, 6, 1); R(1, 1, 6, 6, face); R(1 + [0, 2, 4, 2][f], 1, 2, 6, edge); };
  // A spider crawling right, side on, about half the figurine's height: a round abdomen behind, the
  // head in front, four legs a side bent high at the knee. Frames step the gait, alternate legs lifted.
  // Variants: 1 a fat abdomen with a pale band, 2 a small one with an accent spot.
  const SPIDER = ({ R, P }, f, v = 0) => {
    const line = (x0, y0, x1, y1, k) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i++) P(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), k); };
    const by = f % 2; // the body dips a pixel on each step
    [[8, 3, 2], [11, 7, 8], [14, 12, 15], [16, 17, 22]].forEach(([hx, kx, fx], i) => {
      const up = (i + f) % 2, sw = [0, 1, 0, -1][(f + i) % 4];
      line(hx, 9 + by, kx + sw, 3 + up, 1); line(kx + sw, 3 + up, fx + sw, 15 - up, 1);
      line(hx + 1, 9 + by, kx + sw + 1, 3 + up, 1); // legs 2 px thick, so the scanlines don't break them
    });
    if (v === 2) { R(5, 5 + by, 6, 5, 1); R(4, 6 + by, 8, 3, 1); P(7, 6 + by, 8); } // small, an accent spot on its back
    else {
      R(3, 4 + by, 8, 7, 1); R(2, 5 + by, 10, 5, 1); R(4, 3 + by, 6, 1, 1); // the abdomen
      if (v === 1) { R(1, 5 + by, 1, 4, 1); R(3, 2 + by, 6, 1, 1); R(4, 7 + by, 6, 2, 4); } // fatter, a pale band
      R(4, 4 + by, 3, 2, 3); R(4, 6 + by, 1, 1, 3); // lit from the upper left
    }
    R(12, 7 + by, 5, 4, 1); R(13, 6 + by, 3, 1, 1); R(13, 7 + by, 2, 1, 3); // the head
    P(16, 8 + by, 8); P(15, 8 + by, 8); // eyes
  };
  const CRITTERS = {
    spider: (sc, heat, o = {}) => crosser(sc, { depth: 300, w: 24, h: 17, period: 16, frames: 4, fps: 6, n: 2, seed: 4, draw: SPIDER, ...o }),
    // Fliers keep in front of the walls and low enough to cross the pale ground, where dark ink reads (not the dark sky).
    bat: (sc, heat, o = {}) => crosser(sc, { depth: 300, w: 13, h: 6, lift: 30, period: 7, n: 3, seed: 1, px: 4, draw: BAT, ...o }),
    crow: (sc, heat, o = {}) => crosser(sc, { depth: 240, w: 11, h: 5, lift: 40, period: 11, n: 2, seed: 2, px: 4, draw: CROW, ...o }),
    chip: (sc, heat, o = {}) => crosser(sc, { depth: 120, w: 8, h: 8, period: 6, frames: 4, fps: 8, n: 2, seed: 3, draw: CHIP, ...o }),
  };
  const EFFECTS = {
    // In front of the spires (depth 150 and nearer), behind the action plane (380); tones that show on pale ground.
    embers: (sc, heat, o = {}) => motes(sc, { n: 120 + 60 * heat, ks: [8, 8, 7], seed: 11, ...o }),
    ash: (sc, heat, o = {}) => motes(sc, { n: 140, dir: 1, ks: [3, 4], fps: 4, seed: 23, ...o }),
    dust: (sc, heat, o = {}) => motes(sc, { n: 120, dir: 1, ks: [4, 5], fps: 3, depth: 250, h: 150, seed: 37, ...o }),
    glints: (sc, heat, o = {}) => motes(sc, { n: 60 + 30 * heat, ks: [8, 7], fps: 3, depth: 200, seed: 41, ...o }),
    cinders: (sc, heat, o = {}) => (heat ? motes(sc, { n: 100 + 60 * heat, ks: [8, 8, 7], seed: 53, ...o }) : motes(sc, { n: 120, dir: 1, ks: [3, 4], fps: 4, seed: 53, ...o })), // ash, embers once the spires heat up
    sparks: (sc, heat, o = {}) => motes(sc, { n: 50 + 30 * heat, depth: 330, h: 70, ks: [8, 8, 7], seed: 67, ...o }), // embers low and near
  };

  /* ---------- the parts: floors, backdrops, features ---------- */
  /* A place is parts that mix and match: a FLOOR (the ground under everything), a BACKDROP (what
     closes off the back: the orrery sky, or a wall), FEATURES (natural features standing on the
     floor, scattered to the horizon: spires, slot cabinets... any number of sets at once), and
     the CRITTERS and EFFECTS moving in the background (above). Each preset in SETTINGS names its own. */
  const flagstones = (X, Y) => { const r = Math.floor(Y / 28); return pmod(Y, 28) < 2 || pmod(X + (r % 2) * 24, 48) < 2 ? 3 : -1; };
  /* Patterned floors, each pattern(heat) => (X, Y) => ramp index or -1, in plane units. Seams are
     ink-dark, rims lit on the upper left and shaded on the lower right; heat brings brimstone (8)
     into the joints at ante 3. */
  const fh = (i, j, s) => { const a = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453; return a - Math.floor(a); };
  const S3 = Math.sqrt(3);
  // A cell's thing (a stone, a bone), worked out once: the floors ask about every pixel.
  const cells = (make) => { const m = new Map(); return (i, j) => { const k = i * 65536 + j; let v = m.get(k); if (v === undefined) m.set(k, v = make(i, j)); return v; }; };
  const cobbles = (heat) => {
    const S = 22, stone = cells((i, j) => ({ sx: (i + 0.2 + 0.6 * fh(i, j, 1)) * S, sy: (j + 0.2 + 0.6 * fh(i, j, 2)) * S, id: fh(i, j, 3) }));
    return (X, Y) => {
    const ci = Math.floor(X / S), cj = Math.floor(Y / S);
    let d1 = 1e9, d2 = 1e9, px = 0, py = 0, id = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const c = stone(ci + a, cj + b), d = Math.hypot(X - c.sx, Y - c.sy);
      if (d < d1) { d2 = d1; d1 = d; px = c.sx; py = c.sy; id = c.id; } else if (d < d2) d2 = d;
    }
    const e = d2 - d1;
    if (e < 3) return heat === 2 && id > 0.55 ? 8 : 2;
    if (e < 6) return X - px + (Y - py) < 0 ? 7 : 3;
    if (heat >= 1 && id < 0.3 && Math.abs((X - px) * 0.7 - (Y - py)) < 1.2 && d1 < S * 0.4) return heat === 2 ? 8 : 3; // cracked stones
    return -1;
    };
  };
  const planks = (heat) => (X, Y) => {
    const B = 24, L = 88, row = Math.floor(Y / B), y = pmod(Y, B), off = fh(row, 0, 5) * L, u = X + off, col = Math.floor(u / L), x = pmod(u, L), id = fh(row, col, 6);
    if (y < 2 || x < 2) return 2;
    if (heat === 2 && id < 0.25) { const d = Math.hypot((x - L / 2) / 16, (y - B / 2) / 6); if (d < 1) return d > 0.75 ? 8 : 1; } // burned through
    if (y < 4) return 7;
    if (x < 4) return 6;
    if (y >= B - 2) return 3;
    if ((x >= 7 && x < 9 || x >= L - 9 && x < L - 7) && (y >= 6 && y < 8 || y >= B - 8 && y < B - 6)) return 2; // nails
    if (heat >= 1 && id < 0.45 && bay(X >> 1, Y >> 1) < 8) return 3; // scorched boards
    const g = Y + Math.sin(u * 0.05 + row) * 3, gf = g / 6 - Math.floor(g / 6);
    return gf < 0.17 && fh(Math.floor(u / 12), row, 7) > 0.4 ? 4 : -1; // grain
  };
  const checker = (heat) => (X, Y) => {
    const T = 40, x = pmod(X, T), y = pmod(Y, T), dk = (Math.floor(X / T) + Math.floor(Y / T)) & 1;
    if (heat >= 1 && Math.abs(Math.sin(X * 0.03 + Math.sin(Y * 0.05) * 2) + Math.sin(Y * 0.04 + X * 0.011)) < 0.045) return heat === 2 ? 8 : 2;
    if (x < 2 || y < 2) return 3;
    if (x < 4 || y < 4) return 7;
    if (x >= T - 2 || y >= T - 2) return dk ? 3 : 4;
    return dk ? (bay(X >> 1, Y >> 1) < 5 ? 3 : 4) : -1;
  };
  const dunes = (heat) => (X, Y) => {
    const S = 30, i = Math.floor(X / S), j = Math.floor(Y / S), q = fh(i, j, 8), cx = (i + 0.3 + 0.4 * fh(i, j, 9)) * S, cy = (j + 0.3 + 0.4 * fh(i, j, 10)) * S, d = Math.hypot((X - cx) / 1.4, Y - cy);
    if (q < [0.18, 0.3, 0.5][heat] && d < 4.5) { // pebbles, more of them brimstone each ante
      const br = q < [0, 0.2, 0.4][heat];
      if (d > 3.2) return X - cx + (Y - cy) > 0 ? 2 : br ? 7 : 6;
      return br ? 8 : 4;
    }
    const w = (Y + Math.sin(X * 0.035) * 7 + Math.sin(X * 0.011 + Y * 0.006) * 16) / 20, f = w - Math.floor(w);
    return f < 0.1 ? 3 : f < 0.18 ? 7 : -1; // ripple troughs and their lit crests
  };
  const columns = (heat) => (X, Y) => {
    const s = 15, x = (S3 / 3 * X - Y / 3) / s, z = (2 / 3 * Y) / s, y = -x - z;
    let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const ex = Math.abs(rx - x), ey = Math.abs(ry - y), ez = Math.abs(rz - z);
    if (ex > ey && ex > ez) rx = -ry - rz; else if (ey > ez) ry = -rx - rz; else rz = -rx - ry;
    const dx = X - s * S3 * (rx + rz / 2), dy = Y - s * 1.5 * rz, id = fh(rx, rz, 11);
    const e = s * S3 / 2 - Math.max(Math.abs(dx), Math.abs(dx) * 0.5 + Math.abs(dy) * S3 / 2);
    if (e < 1.8) return heat === 2 && id > 0.5 ? 8 : 2;
    if (e < 4) return dx + dy < 0 ? 7 : 3;
    return id < [0.15, 0.3, 0.3][heat] ? (bay(X >> 1, Y >> 1) < 9 ? 3 : 4) : -1; // sunk columns
  };
  const ossuary = (heat) => {
    const S = 34, at = cells((i, j) => {
      if (fh(i, j, 12) < 0.55) return null;
      const an = fh(i, j, 15) * Math.PI;
      return { bx: (i + 0.5) * S + (fh(i, j, 13) - 0.5) * 8, by: (j + 0.5) * S + (fh(i, j, 14) - 0.5) * 8, ux: Math.cos(an), uy: Math.sin(an), L: 7 + fh(i, j, 16) * 5 };
    });
    const bone = (X, Y) => {
      const ci = Math.floor(X / S), cj = Math.floor(Y / S);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const c = at(ci + a, cj + b);
        if (!c) continue;
        const { ux, uy, L } = c, rx = X - c.bx, ry = Y - c.by;
        if (Math.abs(rx) > L + 5 || Math.abs(ry) > L + 5) continue;
        if (Math.abs(rx * ux + ry * uy) <= L && Math.abs(-rx * uy + ry * ux) < 2.2) return true;
        for (const e of [-L, L]) for (const k of [-2, 2]) if (Math.hypot(rx - (e * ux - k * uy), ry - (e * uy + k * ux)) < 2.8) return true;
      }
      return false;
    };
    return (X, Y) => {
      if (bone(X, Y)) return bone(X + 2, Y + 2) ? (heat ? 6 : 7) : heat ? 3 : 4; // sooted from ante 2
      if (bone(X - 2, Y - 2)) return 3;
      return heat === 2 && fh(Math.floor(X / 10), Math.floor(Y / 10), 17) < 0.08 && pmod(X, 10) < 4 && pmod(Y, 10) < 2 ? 8 : -1; // embers
    };
  };
  // The forest floor, after a campfire clearing: big roots arching across the ground (a curved band
  // that tapers at both ends, lit along its upper-left edge and casting a shadow to the lower right),
  // cracked dry dirt with dark patches of mud, and dithered moss. Low contrast, so the action
  // reads over it. From ante 2 the roots are charred along their tops; at ante 3 embers glow in the cracks.
  const forest = (heat) => {
    const S = 280, at = cells((i, j) => {
      if (fh(i, j, 18) < 0.45) return null;
      const a0 = fh(i, j, 19) * Math.PI * 2;
      const c = { cx: (i + 0.5) * S + (fh(i, j, 20) - 0.5) * 120, cy: (j + 0.5) * S + (fh(i, j, 21) - 0.5) * 120, R: 90 + fh(i, j, 22) * 60, a0, span: 1.1 + fh(i, j, 23) * 0.9, th: 12 + fh(i, j, 24) * 6 };
      c.lo2 = Math.max(0, c.R - c.th - 1) ** 2; c.hi2 = (c.R + c.th + 1) ** 2; // the ring a point must be in to touch it, squared (a quick test)
      return c;
    });
    // How far inside a root (X, Y) is: > 0 inside, or 0.
    // The roots that can reach into a cell: those of it and its 8 neighbors, listed once per cell.
    const near = cells((ci, cj) => { const l = []; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const c = at(ci + a, cj + b); if (c) l.push(c); } return l; });
    const root = (X, Y) => {
      for (const c of near(Math.floor(X / S), Math.floor(Y / S))) {
        const dx = X - c.cx, dy = (Y - c.cy) * 1.6, d2 = dx * dx + dy * dy; // flattened, lying on the ground
        if (d2 < c.lo2 || d2 > c.hi2) continue;
        const d = Math.sqrt(d2);
        const s = ((Math.atan2(dy, dx) - c.a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        if (s > c.span) continue;
        const k = s / c.span, w = c.th * Math.sqrt(Math.sin(k * Math.PI)); // tapers to a point at each end
        if (Math.abs(d - c.R) < w) return w - Math.abs(d - c.R);
      }
      return 0;
    };
    const crack = (X0, Y0) => { // how close (X, Y) is to a crack in the dried dirt: the wobbly edges between irregular cells (about 40 across)
      const C = 40, X = X0 + Math.sin(Y0 * 0.11) * 3, Y = Y0 + Math.sin(X0 * 0.13) * 3, ci = Math.floor(X / C), cj = Math.floor(Y / C);
      let d1 = 1e18, d2 = 1e18; // squared, so only the nearest two take a square root
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const p = pt(ci + a, cj + b), u = X - p[0], v = Y - p[1], d = u * u + v * v;
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      return Math.sqrt(d2) - Math.sqrt(d1);
    };
    const pt = cells((i, j) => [(i + 0.15 + 0.7 * fh(i, j, 26)) * C_CRACK, (j + 0.15 + 0.7 * fh(i, j, 27)) * C_CRACK]), C_CRACK = 40; // each crack cell's point, worked out once
    return (X, Y) => {
      const r = root(X, Y);
      if (r) {
        if (!root(X - 3, Y - 3)) return heat ? 3 : 6; // lit upper-left edge, charred from ante 2
        if (!root(X + 3, Y + 3)) return 2;
        if (heat === 2 && r > 2 && fh(Math.floor(X / 6), Math.floor(Y / 6), 25) < 0.1) return 8; // embers in the bark
        return pmod(Math.floor((X + Y) / 5), 3) === 0 && r > 1.5 ? 3 : 4; // bark grain
      }
      if (root(X - 5, Y - 5)) return 3; // the root's shadow, to the lower right
      const m = Math.sin(X * 0.009 + Math.sin(Y * 0.013) * 1.7) + Math.sin(Y * 0.011 - X * 0.004); // moss
      if (m > 0.7 && bay(X >> 1, Y >> 1) < (m - 0.7) * 20) return 4;
      const mud = Math.sin(X * 0.017 - Math.sin(Y * 0.02) * 2) + Math.sin(Y * 0.023 + X * 0.007); // dark wet mud between the moss
      if (mud > 1.25 && m < 0.3) return bay(X >> 1, Y >> 1) < (mud - 1.25) * 40 ? 3 : 4;
      // cracks in the dried dirt, gone under the moss and mud (the cheap tests first: the crack's is the costly one)
      return m < 0.4 && mud < 1 && bay(X >> 1, Y >> 1) < 11 && crack(X, Y) < 2 ? 3 : -1;
    };
  };
  /* The carnival midway, out in the open: a boardwalk deck in the middle (where the booth stands and
     in front of it, out to the camera), trodden dirt either side with pebbles and tufts of dry grass,
     the two blended where they meet by Bayer dithering. Its boards run back toward the booth, so the
     eye follows them there. Ticket stubs and popcorn are dropped on both. From ante 2 boards are
     scorched; at ante 3 brimstone glows in the joints. DECK: the boardwalk's middle and half width
     (plane x), where it starts (depth) and how wide the dithered blend is. */
  const DECK = { x: 720, half: 470, y0: -20, blend: 110 };
  const midway = (heat) => {
    const B = 34, L = 190, G = 72; // board width, length; the litter's cell
    const litter = cells((i, j) => {
      const q = fh(i, j, 30);
      return q < 0.4 ? { x: (i + 0.2 + 0.6 * fh(i, j, 31)) * G, y: (j + 0.2 + 0.6 * fh(i, j, 32)) * G, ticket: q < 0.13 } : null;
    });
    const tufts = cells((i, j) => (fh(i, j, 36) < 0.5 ? { x: (i + 0.25 + 0.5 * fh(i, j, 37)) * 46, y: (j + 0.25 + 0.5 * fh(i, j, 38)) * 46, big: fh(i, j, 39) < 0.3 } : null));
    // Dirt: pebbles lit on the upper left, tufts of dry grass (a few blades fanning up), else bare ground (-1).
    const dirt = (X, Y) => {
      const tf = tufts(Math.floor(X / 46), Math.floor(Y / 46));
      if (tf) {
        const dx = X - tf.x, dy = Y - tf.y;
        if (tf.big) { // a pebble
          const d = Math.hypot(dx / 1.4, dy);
          if (d < 4) return d > 3 ? 3 : dx + dy < 0 ? 6 : 4;
          if (Math.hypot((dx - 3) / 1.4, dy - 2) < 4) return 3;
        } else if (dy > -10 && dy <= 0) { // blades: three strokes 2 px wide, leaning out from the root
          for (const s of [-1, 0, 1]) if (Math.abs(dx - s * (-dy) * 0.5) < 1.5) return dy > -3 ? 3 : 4;
        }
      }
      return heat >= 1 && bay(X >> 1, Y >> 1) < 2 && fh(Math.floor(X / 30), Math.floor(Y / 30), 40) < 0.2 ? 3 : -1; // scuffed, hotter each ante
    };
    // How much of the deck a point is: 1 well inside, 0 outside, the blend between.
    const deck = (X, Y) => Math.min(1, (DECK.half - Math.abs(X - DECK.x)) / DECK.blend + 0.5, (Y - DECK.y0) / DECK.blend + 0.5);
    return (X, Y) => {
      const it = litter(Math.floor(X / G), Math.floor(Y / G));
      if (it) {
        const dx = X - it.x, dy = Y - it.y;
        if (it.ticket) { // a torn stub: pale, an ink rim, a gold band across it
          if (Math.abs(dx) < 8 && Math.abs(dy) < 5) return Math.abs(dx) > 6 || Math.abs(dy) > 3 ? 2 : Math.abs(dx - 2) < 1.5 ? 8 : 7;
          if (dx > -6 && dx < 10 && dy >= 5 && dy < 7) return 3; // its shadow, to the lower right
        } else { // a kernel of popcorn, lit on the upper left
          if (Math.hypot(dx, dy) < 3) return dx + dy < 0 ? 7 : 6;
          if (Math.hypot(dx - 2, dy - 2) < 3) return 3;
        }
      }
      if ((bay(X >> 1, Y >> 1) + 0.5) / 16 >= deck(X, Y)) return dirt(X, Y);
      const col = Math.floor(X / B), x = pmod(X, B), v = Y + fh(col, 0, 33) * L, row = Math.floor(v / L), y = pmod(v, L), id = fh(col, row, 34);
      if (x < 2 || y < 2) return heat === 2 && fh(col, row, 35) < 0.3 && bay(X >> 1, Y >> 1) < 10 ? 8 : 2; // the joints
      if (x < 4 || y < 4) return 7; // lit on the upper left, shaded on the lower right
      if (x >= B - 2 || y >= L - 2) return 4;
      if (heat >= 1 && id < 0.35 && bay(X >> 1, Y >> 1) < 7) return 4; // scorched boards
      return pmod(x + Math.sin(Y * 0.03 + id * 9) * 2, 12) < 1 && id > 0.6 ? 5 : 6; // pale boards (the dirt is the ground's own darker tones), a little grain
    };
  };
  // Floors: Scene.ground options for the heat, or build(sc, heat, opts) for a floor with more to it.
  const FLOORS = {
    ash: () => ({}),
    flagstones: () => ({ seed: 31, grit: 1500, pattern: flagstones, light: (X, Y) => 1.15 - Math.hypot((X - 640) / 1300, (Y - 300) / 700) }),
    felt: () => ({ seed: 17, grit: 1200, pattern: (X, Y) => (pmod(X + Y, 64) < 2 || pmod(X - Y, 64) < 2 ? 4 : -1) }),
    cracks: (heat) => ({ tones: [2, 3, 4, 5], seed: 7, pattern: (X, Y) => { const n = Math.abs(Math.sin(X * 0.013 + Math.sin(Y * 0.021) * 2) + Math.sin(Y * 0.017 + X * 0.004)); return n < 0.035 ? (heat ? 8 : 1) : n < 0.07 ? 2 : -1; } }),
    path: () => ({ seed: 29, pattern: (X, Y) => (Math.abs(X - 720 - (Y - 400) * 0.35) < 70 && bay(Math.round(X / 2), Math.round(Y / 2)) < 9 ? 6 : -1) }),
    grate: { build: (sc, heat, o) => Factory.floor(sc, heat, o) },
    cobbles: (heat) => ({ seed: 37, grit: 1200, pattern: cobbles(heat) }),
    planks: (heat) => ({ seed: 41, grit: 800, pattern: planks(heat) }),
    checker: (heat) => ({ seed: 43, grit: 800, pattern: checker(heat) }),
    tiles: () => ({ seed: 43, grit: 800, pattern: checker(0) }), // the checker kept clean at every ante (the casino court's)
    dunes: (heat) => ({ seed: 47, grit: 2000, pattern: dunes(heat) }),
    columns: (heat) => ({ seed: 53, grit: 1000, pattern: columns(heat) }),
    ossuary: (heat) => ({ seed: 59, grit: 1200, pattern: ossuary(heat) }),
    forest: (heat) => ({ seed: 61, grit: 1000, pattern: forest(heat) }),
    midway: (heat) => ({ tones: [3, 4, 4, 5], seed: 67, grit: 900, pattern: midway(heat) }), // the dirt a shade darker than ash, so the pale deck stands out
  };
  // Backdrops: the sky stays open (the horizon is wherever the floor ends); a wall builds itself in
  // its place at depth `front`, where the floor stops. `open` is where open floor begins in front
  // of it: features scatter only nearer than that, never into the wall's own works.
  const BACKDROPS = {
    sky: {},
    swirl: { swirl: true }, // the game's swirl paint (Scene.swirl) where the sky would be

    crypt: { front: D_WALL, open: D_WALL + 30, wall: cryptWall }, // past the shade at the wall's foot
    tropicana: { front: D_TROP, open: D_TROP + 30, wall: tropWall },
    forge: { front: -130, open: 170, wall: (sc, heat) => Factory.backdrop(sc, heat) }, // the hall (D_HALL, js/factory.js); open floor starts in front of its lava river (-90..-40) and machine row (D_MACH 150)
    carnival: { front: D_CARN, open: D_CARN + 40, wall: carnivalWall }, // the rides under the open sky, where the midway ends
  };
  // Features: props scattered over the floor (Scene.ruins), drawn with propArt's signature; their
  // kinds rename the spire kinds ('spike' tall, 'basalt' low, 'strata' the one that shows the heat).
  const FEATURES = {
    spires: {},
    slots: { draw: ART.casino, kinds: { spike: 'slot', basalt: 'chips', strata: 'tower' }, size: { slot: [0.45, 1.3], chips: [0.5, 0.6], tower: [0.6, 1.2] } },
    vents: { draw: ART.lava, kinds: { strata: 'vent' }, size: { vent: [0.6, 1.4] } },
    graves: { draw: ART.graveyard, kinds: { spike: 'tree', basalt: 'stone', strata: 'cross' }, size: { tree: [0.6, 1.6], stone: [0.45, 0.9], cross: [0.55, 0.8] } },
    woods: { draw: ART.woods, kinds: { spike: 'pine', basalt: 'bush', strata: 'fir' }, size: { pine: [0.7, 1.6], bush: [0.6, 0.5], fir: [0.8, 1.9] } },
  };
  // The presets: each place's floor, backdrop, features (any number), and the critters and effects
  // moving in its background. The forge's motion is its machines, part of its backdrop.
  const SETTINGS = {
    ruins: { floor: 'ash', backdrop: 'sky', features: ['spires'], critters: [], effects: ['cinders'] },
    crypt: { floor: 'flagstones', backdrop: 'crypt', features: [], critters: [], effects: ['dust'] },
    casino: { floor: 'felt', backdrop: 'sky', features: ['slots'], critters: ['chip'], effects: ['glints'] },
    lava: { floor: 'cracks', backdrop: 'sky', features: ['vents'], critters: [], effects: ['embers', 'sparks'] },
    graveyard: { floor: 'path', backdrop: 'sky', features: ['graves'], critters: ['crow'], effects: ['ash'] },
    tropicana: { floor: 'tiles', backdrop: 'tropicana', features: [], critters: [], effects: [] },
    forge: { floor: 'grate', backdrop: 'forge', features: [], critters: [], effects: [] },
    carnival: { floor: 'midway', backdrop: 'carnival', features: [], critters: [], effects: [] },
  };
  /* `horizon` (under the sky) sets how much sky shows over the features' far row: 'wall' (the
     standard: the floor runs far off and a tall row hides the horizon), 'low' (as the hand scenes:
     the floor ends nearer, at `far`, with a low row there) or 'open' (the same, the middle kept
     clear at every depth). The sky shows where the floor ends, so pulling `far` in lowers it. */
  /* `clearing` sets how much open ground the features leave round the action: 'wide' (the standard:
     nothing in the middle nearer than the far ground, and nothing nearer the camera than depth 300),
     'tight' (a smaller clearing, features reaching nearer the camera at the sides) or 'none'
     (features up to the action's edges, only your own spot kept clear). The count grows with the
     ground they cover, so the density stays the same. */
  const CLEARINGS = {
    wide: { clear: CLEAR, y1: 300 },
    tight: { clear: { x0: 500, x1: 940, y: 150 }, y1: 520 },
    none: { clear: { x0: 620, x1: 820, y: 300 }, y1: 560 },
  };
  const HORIZONS = {
    wall: { far: -1000 },
    low: { far: -380, ruins: { wall: 0.3, count: 150 } },
    open: { far: -380, ruins: { wall: 0, count: 110 }, clearMiddle: true },
  };

  /* Build a place behind the action and return its floor (Scene.ground's { clear, shade, patch })
     for contact shadows. `name` is a preset from SETTINGS; floor and backdrop swap in another's,
     `features` is a list of feature sets scattered together (or one name), and `critters` /
     `effects` are lists of Scene.CRITTERS / Scene.EFFECTS names for the background motion (each
     defaults to the preset's; `life: false` leaves the preset's motion out). `near` props are big
     features placed by hand near the action, in the spire kinds, drawn as the first feature set's
     own. Features in front of a wall stop short of it, with no tall far row. */
  // A floor's Scene.ground options, from its far edge back to the camera; and the key it's kept by
  // (Scene.warmGround), or none when the light or ground options are a scene's own.
  const floorOpts = (F, heat, far, light, more = {}) => ({ x0: -1200, y0: far, w: 1920, h: Math.round((820 - far) / 2), light, ...F(heat), ...more });
  const floorKey = (floor, heat, far, light, more = {}) => (light === LIGHT && !Object.keys(more).length ? `${floor}|${heat}|${far}` : null);
  /* Work out a setting's floor in the background while the map is idle (Scene.warmGround), so the
     scene opens quickly: the same name and floor, backdrop, horizon and heat its setting() will get. */
  function warmFloor(name, { heat = 0, floor, backdrop, horizon = 'wall' } = {}) {
    const P = SETTINGS[name], fl = floor || (P && P.floor), F = FLOORS[fl], B = BACKDROPS[backdrop || (P && P.backdrop)];
    if (!F || F.build || !B) return;
    const far = (B.wall ? { far: B.front } : HORIZONS[horizon] || HORIZONS.wall).far;
    Scene.warmGround(floorKey(fl, heat, far, LIGHT), floorOpts(F, heat, far, LIGHT));
  }
  // density: { feature set: how many, 1 as standard }, e.g. { woods: 1.6 } for thicker woods.
  // band: how deep a slice of features shares one canvas (Scene.ruins): deeper for thick features, so the browser draws fewer.
  function setting(sc, name, { heat = 0, floor, backdrop, features, critters, effects, life = true, band = 32, horizon = 'wall', density = {}, clearing = 'wide', critterLife = {}, area = AREA, clear, near = [], light = LIGHT, rubble = [], shards = [], shadows = [], over, ...more } = {}) {
    const P = SETTINGS[name];
    if (!P) throw new Error('No scene setting called ' + name + ' - try ' + Object.keys(SETTINGS).join(', '));
    const fs = [].concat(features || P.features).filter((k) => k !== 'none'), F = FLOORS[floor || P.floor], B = BACKDROPS[backdrop || P.backdrop];
    const cs = critters || (life ? P.critters : []), es = effects || (life ? P.effects : []);
    const bad = [!F && 'floor ' + floor, !B && 'backdrop ' + backdrop, ...fs.filter((k) => !FEATURES[k]).map((k) => 'features ' + k),
      ...cs.filter((k) => !CRITTERS[k]).map((k) => 'critter ' + k), ...es.filter((k) => !EFFECTS[k]).map((k) => 'effect ' + k)].filter(Boolean);
    if (bad.length) throw new Error('Unknown part: ' + bad.join(', '));
    const H = B.wall ? { far: B.front, from: B.open, ruins: { wall: 0, count: 140 } } : HORIZONS[horizon] || HORIZONS.wall, far = H.far, from = H.from || far;
    if (B.wall) B.wall(sc, heat);
    if (B.swirl) Scene.swirl(sc);
    // Each feature set takes a share of the props, from its own random stream; the near props go with the first.
    // Before a wall they start where its open floor begins (Scene.ruins starts 40 past area.y0).
    const count = Math.round((H.ruins && H.ruins.count || 380) / Math.max(1, fs.length)), y0 = H.from ? from - 40 : far;
    // A denser set packs closer too (the gap shrinks with the square root), or the spacing would cap it.
    const CL = CLEARINGS[clearing] || CLEARINGS.wide, cl0 = clear || CL.clear, y1 = Math.max(area.y1, CL.y1), more2 = (y1 - y0) / (area.y1 - y0); // more ground, more props
    fs.forEach((k, i) => { const d = Math.max(0.05, density[k] || 1) * more2; Scene.ruins(sc, { area: { ...area, y0, y1 }, clear: H.clearMiddle ? { ...cl0, y: Math.min(far, cl0.y) } : cl0, near: i ? [] : near, heat, ...FEATURES[k], ...H.ruins, count: Math.round(count * d), gap: Math.min(1, 1 / Math.sqrt(d)), seed: 5 + i * 7, band }); });
    const gnd = F.build ? F.build(sc, heat, { rubble, shards, shadows, over, y0: far })
      : Scene.ground(sc, { ...floorOpts(F, heat, far, light, more), key: floorKey(floor || P.floor, heat, far, light, more), rubble, shards, shadows: B.wall ? [[-1200, far, 2640, far + 18], ...shadows] : shadows, over }); // a wall's foot in shade
    for (const k of cs) CRITTERS[k](sc, heat, { life: critterLife });
    for (const k of es) EFFECTS[k](sc, heat);
    return gnd;
  }

  Object.assign(Scene, {
    setting, warmFloor, motes, crosser, CRITTERS, EFFECTS,
    SETTINGS: Object.keys(SETTINGS), PRESETS: SETTINGS,
    HORIZONS: Object.keys(HORIZONS), CLEARINGS: Object.keys(CLEARINGS),
    PARTS: { floors: Object.keys(FLOORS), backdrops: Object.keys(BACKDROPS), features: Object.keys(FEATURES), walls: Object.keys(BACKDROPS).filter((k) => BACKDROPS[k].wall) },
  });
})();
