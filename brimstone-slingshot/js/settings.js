'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — scene settings: the places an event scene can stand in. Each one is
   the ground, the props scattered to the horizon (with a wall of tall ones hiding the far
   edge), and something alive in the background, all hotter each ante.
     Scene.setting(sc, name, opts) builds one behind the action and returns the ground
     (Scene.ground's { clear, shade, patch }) for contact shadows.
   Names: ruins (the run map's spires), crypt, casino, lava, graveyard, forge (Factory.build).
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
    // The crypt: pillars, tombs, and braziers that burn higher each ante.
    crypt(fill, glow, C, l, k, cx, top, w, h, seed, heat) {
      if (k === 'pillar') return body(fill, cx, top, w, h, (f) => (f < 0.05 || f > 0.95 ? 0.5 : f < 0.09 || f > 0.91 ? 0.42 : 0.32), T3(C, l));
      if (k === 'tomb') {
        body(fill, cx, top, w, h, (f) => (f < 0.3 ? 0.18 + 0.32 * f / 0.3 : 0.5), T3(C, l));
        const c = Math.round(cx - w / 6);
        for (let v = Math.round(h * 0.4); v < h * 0.8; v++) fill(c, top + v, 1, dk(C, l));
        fill(c - 2, top + Math.round(h * 0.5), 5, dk(C, l));
        return;
      }
      // brazier: a bowl on a stand, flames above it
      const bowl = top + Math.round(h * 0.45);
      body(fill, cx, top, w, h, (f) => (f < 0.45 ? 0 : f < 0.6 ? 0.5 - (f - 0.45) * 2 : f > 0.94 ? 0.3 : 0.1), T3(C, l));
      if (!heat) { fill(Math.round(cx - w * 0.3), bowl, Math.round(w * 0.6), dk(C, l)); return; }
      const fh = Math.round(h * (0.12 + 0.14 * heat));
      for (let v = 1; v <= fh; v++) { const hw = Math.round(w * 0.4 * (1 - v / (fh + 1))); for (let u = -hw; u <= hw; u++) if ((u + v) % 2 === 0) glow(cx + u, bowl - v); }
    },
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

  /* ---------- the settings ---------- */
  // Each: ground options for the heat, the props (kinds, size), and the life behind the action.
  const SET = {
    ruins: {
      ground: () => ({}),
      life(sc, heat) { motes(sc, heat ? { n: 15 + 25 * heat } : { n: 20, dir: 1, ks: [5], fps: 4 }); },
    },
    crypt: {
      ground: () => ({ seed: 31, grit: 1500, pattern: (X, Y) => { const r = Math.floor(Y / 28); return pmod(Y, 28) < 2 || pmod(X + (r % 2) * 24, 48) < 2 ? 3 : -1; } }),
      kinds: { spike: 'pillar', basalt: 'tomb', strata: 'brazier' }, size: { pillar: [0.9, 0.7], tomb: [0.8, 1.3], brazier: [0.5, 1] },
      life(sc, heat) {
        motes(sc, { n: 25, dir: 1, ks: [6], fps: 3 });
        if (heat) motes(sc, { n: 10 * heat, depth: -150, h: 90, seed: 4 });
        crosser(sc, { depth: -260, w: 13, h: 6, lift: 70, period: 7, draw: ({ R }, f) => { R(5, 2, 3, 3, 1); if (f) { R(0, 3, 5, 1, 1); R(8, 3, 5, 1, 1); } else { R(1, 0, 4, 2, 1); R(8, 0, 4, 2, 1); R(4, 1, 1, 1, 1); R(8, 1, 1, 1, 1); } } }); // a bat
      },
    },
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
    const gnd = Scene.ground(sc, { x0: -1200, y0: -1000, w: 1920, h: 900, light, rubble, shards, shadows, over, ...S.ground(heat), ...more });
    Scene.ruins(sc, { area, clear, near, heat, draw: ART[name] || RunMap.propArt, kinds: S.kinds, size: S.size });
    S.life(sc, heat);
    return gnd;
  }

  Object.assign(Scene, { setting, motes, crosser, SETTINGS: Object.keys(SET).concat('forge') });
})();
