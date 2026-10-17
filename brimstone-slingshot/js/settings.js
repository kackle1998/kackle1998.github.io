'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — scene settings: the places an event scene can stand in. Each one is
   the ground, the props scattered to the horizon (with a wall of tall ones hiding the far
   edge), and something alive in the background, all hotter each ante.
     Scene.setting(sc, name, opts) builds one behind the action and returns the ground
     (Scene.ground's { clear, shade, patch }) for contact shadows.
   Names: ruins (the run map's spires), crypt (a stone wall with sagging arches), casino, lava, graveyard, forge (Factory).
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

  /* ---------- critters and effects ---------- */
  /* Named background life any scene (or the builder, builder.html) can add: CRITTERS pass behind
     the action (Scene.crosser), EFFECTS drift through the air (Scene.motes); each takes the heat
     and option overrides. */
  const BAT = ({ R }, f) => { R(5, 2, 3, 3, 1); if (f) { R(0, 3, 5, 1, 1); R(8, 3, 5, 1, 1); } else { R(1, 0, 4, 2, 1); R(8, 0, 4, 2, 1); R(4, 1, 1, 1, 1); R(8, 1, 1, 1, 1); } };
  const CROW = ({ R }, f) => { R(4, 2, 4, 2, 1); R(8, 1, 2, 1, 1); if (f) R(0, 3, 4, 1, 1); else { R(1, 0, 3, 2, 1); R(4, 1, 1, 1, 1); } };
  const CHIP = ({ R }, f) => { R(1, 0, 6, 8, 1); R(0, 1, 8, 6, 1); R(1, 1, 6, 6, 8); R(1 + [0, 2, 4, 2][f], 1, 2, 6, 7); };
  const CRITTERS = {
    bat: (sc, heat, o = {}) => crosser(sc, { depth: -260, w: 13, h: 6, lift: 70, period: 7, draw: BAT, ...o }),
    crow: (sc, heat, o = {}) => crosser(sc, { depth: -380, w: 11, h: 5, lift: 90, period: 11, draw: CROW, ...o }),
    chip: (sc, heat, o = {}) => crosser(sc, { depth: 120, w: 8, h: 8, period: 6, frames: 4, fps: 8, draw: CHIP, ...o }),
  };
  const EFFECTS = {
    embers: (sc, heat, o = {}) => motes(sc, { n: 15 + 20 * heat, ...o }),
    ash: (sc, heat, o = {}) => motes(sc, { n: 25, dir: 1, ks: [4], fps: 4, ...o }),
    dust: (sc, heat, o = {}) => motes(sc, { n: 24, dir: 1, ks: [6], fps: 3, depth: -100, h: 200, ...o }),
    glints: (sc, heat, o = {}) => motes(sc, { n: 12 + 10 * heat, ks: [8, 7], fps: 3, ...o }),
    cinders: (sc, heat, o = {}) => (heat ? motes(sc, { n: 15 + 25 * heat, ...o }) : motes(sc, { n: 20, dir: 1, ks: [5], fps: 4, ...o })), // pale ash, embers once the spires heat up
    sparks: (sc, heat, o = {}) => motes(sc, { n: 10 + 10 * heat, depth: 60, h: 80, seed: 3, ...o }), // embers low and near
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
    dunes: (heat) => ({ seed: 47, grit: 2000, pattern: dunes(heat) }),
    columns: (heat) => ({ seed: 53, grit: 1000, pattern: columns(heat) }),
    ossuary: (heat) => ({ seed: 59, grit: 1200, pattern: ossuary(heat) }),
  };
  // Backdrops: the sky stays open (the horizon is wherever the floor ends); a wall builds itself in
  // its place at depth `front`, where the floor stops. `open` is where open floor begins in front
  // of it: features scatter only nearer than that, never into the wall's own works.
  const BACKDROPS = {
    sky: {},
    crypt: { front: D_WALL, open: D_WALL + 30, wall: cryptWall }, // past the shade at the wall's foot
    forge: { front: -130, open: 170, wall: (sc, heat) => Factory.backdrop(sc, heat) }, // the hall (D_HALL, js/factory.js); open floor starts in front of its lava river (-90..-40) and machine row (D_MACH 150)
  };
  // Features: props scattered over the floor (Scene.ruins), drawn with propArt's signature; their
  // kinds rename the spire kinds ('spike' tall, 'basalt' low, 'strata' the one that shows the heat).
  const FEATURES = {
    spires: {},
    slots: { draw: ART.casino, kinds: { spike: 'slot', basalt: 'chips', strata: 'tower' }, size: { slot: [0.45, 1.3], chips: [0.5, 0.6], tower: [0.6, 1.2] } },
    vents: { draw: ART.lava, kinds: { strata: 'vent' }, size: { vent: [0.6, 1.4] } },
    graves: { draw: ART.graveyard, kinds: { spike: 'tree', basalt: 'stone', strata: 'cross' }, size: { tree: [0.6, 1.6], stone: [0.45, 0.9], cross: [0.55, 0.8] } },
  };
  // The presets: each place's floor, backdrop, features (any number), and the critters and effects
  // moving in its background. The forge's motion is its machines, part of its backdrop.
  const SETTINGS = {
    ruins: { floor: 'ash', backdrop: 'sky', features: ['spires'], critters: [], effects: ['cinders'] },
    crypt: { floor: 'flagstones', backdrop: 'crypt', features: [], critters: [], effects: ['dust'] },
    casino: { floor: 'felt', backdrop: 'sky', features: ['slots'], critters: ['chip'], effects: ['glints'] },
    lava: { floor: 'cracks', backdrop: 'sky', features: ['vents'], critters: [], effects: ['embers', 'sparks'] },
    graveyard: { floor: 'path', backdrop: 'sky', features: ['graves'], critters: ['crow'], effects: ['ash'] },
    forge: { floor: 'grate', backdrop: 'forge', features: [], critters: [], effects: [] },
  };
  /* `horizon` (under the sky) sets how much sky shows over the features' far row: 'wall' (the
     standard: the floor runs far off and a tall row hides the horizon), 'low' (as the hand scenes:
     the floor ends nearer, at `far`, with a low row there) or 'open' (the same, the middle kept
     clear at every depth). The sky shows where the floor ends, so pulling `far` in lowers it. */
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
  function setting(sc, name, { heat = 0, floor, backdrop, features, critters, effects, life = true, horizon = 'wall', area = AREA, clear = CLEAR, near = [], light = LIGHT, rubble = [], shards = [], shadows = [], over, ...more } = {}) {
    const P = SETTINGS[name];
    if (!P) throw new Error('No scene setting called ' + name + ' - try ' + Object.keys(SETTINGS).join(', '));
    const fs = [].concat(features || P.features).filter((k) => k !== 'none'), F = FLOORS[floor || P.floor], B = BACKDROPS[backdrop || P.backdrop];
    const cs = critters || (life ? P.critters : []), es = effects || (life ? P.effects : []);
    const bad = [!F && 'floor ' + floor, !B && 'backdrop ' + backdrop, ...fs.filter((k) => !FEATURES[k]).map((k) => 'features ' + k),
      ...cs.filter((k) => !CRITTERS[k]).map((k) => 'critter ' + k), ...es.filter((k) => !EFFECTS[k]).map((k) => 'effect ' + k)].filter(Boolean);
    if (bad.length) throw new Error('Unknown part: ' + bad.join(', '));
    const H = B.wall ? { far: B.front, from: B.open, ruins: { wall: 0, count: 140 } } : HORIZONS[horizon] || HORIZONS.wall, far = H.far, from = H.from || far;
    if (B.wall) B.wall(sc, heat);
    // Each feature set takes a share of the props, from its own random stream; the near props go with the first.
    // Before a wall they start where its open floor begins (Scene.ruins starts 40 past area.y0).
    const count = Math.round((H.ruins && H.ruins.count || 380) / Math.max(1, fs.length)), y0 = H.from ? from - 40 : far;
    fs.forEach((k, i) => Scene.ruins(sc, { area: { ...area, y0 }, clear: H.clearMiddle ? { ...clear, y: far } : clear, near: i ? [] : near, heat, ...FEATURES[k], ...H.ruins, count, seed: 5 + i * 7 }));
    const gnd = F.build ? F.build(sc, heat, { rubble, shards, shadows, over, y0: far })
      : Scene.ground(sc, { x0: -1200, y0: far, w: 1920, h: Math.round((820 - far) / 2), light, rubble, shards, shadows: B.wall ? [[-1200, far, 2640, far + 18], ...shadows] : shadows, over, ...F(heat), ...more }); // a wall's foot in shade
    for (const k of cs) CRITTERS[k](sc, heat);
    for (const k of es) EFFECTS[k](sc, heat);
    return gnd;
  }

  Object.assign(Scene, {
    setting, motes, crosser, CRITTERS, EFFECTS,
    SETTINGS: Object.keys(SETTINGS), PRESETS: SETTINGS,
    HORIZONS: Object.keys(HORIZONS),
    PARTS: { floors: Object.keys(FLOORS), backdrops: Object.keys(BACKDROPS), features: Object.keys(FEATURES), walls: Object.keys(BACKDROPS).filter((k) => BACKDROPS[k].wall) },
  });
})();
