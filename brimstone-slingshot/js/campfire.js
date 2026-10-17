'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the campfire prop: a burning fire in a ring of stones, with logs lying
   beside it. Flat ramp colors, lit from the upper left; the flame steps 6 a second, never blinks.
   Listed as PROPS for the scene builder (js/props.js). Scene px, 4 map units a px.
   ============================================================ */

const Campfire = (() => {
  const GY = 46, CX = 40, W = 80;  // ground line, the fire's middle, width
  const FX = CX, FY = GY - 17;    // where the flame sits (its base)

  // A log lying along x with a cut face on the left, lit from above left.
  function log(p, x, y, len, h, tilt = 0) {
    for (let i = 0; i < len; i++) {
      const ins = i === len - 1 ? 2 : i === len - 2 ? 1 : 0; // the right end rounds off
      const yy = y + Math.round(i * tilt) + ins, hh = h - ins * 2;
      p.R(x + i, yy, 1, hh, 0);                     // ink
      p.R(x + i, yy + 1, 1, hh - 2, 3);             // bark
      if (!ins) p.R(x + i, yy + 1, 1, 2, 4);        // lit top
      if (!ins) p.P(x + i, yy + hh - 2, 2);         // shaded underside
      if (i % 6 === 3) p.R(x + i, yy + 3, 1, hh - 5, 2); // bark grooves
    }
    p.R(x - 2, y + 1, 4, h - 2, 0);
    p.R(x - 1, y + 2, 2, h - 4, 5);                 // cut face
    p.P(x - 1, y + Math.floor(h / 2), 3);           // growth ring
  }

  // The ring of stones: back ones are drawn behind the fire, front ones over its base.
  const STONES = [[-22, 1, 1], [-19, 6, 0], [-12, 9, 1], [-4, 10, 0], [4, 10, 1], [12, 9, 0], [19, 6, 1], [22, 1, 0],
    [-20, -3, 0], [-13, -6, 1], [-5, -8, 0], [3, -8, 1], [11, -6, 0], [18, -3, 1]];
  function stone(p, x, y, big) {
    const w = big ? 7 : 6, h = big ? 5 : 4;
    p.R(x, y + 1, w, h - 1, 0); p.R(x + 1, y, w - 2, 1, 0);
    p.R(x + 1, y + 1, w - 2, h - 2, 3);
    p.R(x + 1, y + 1, w - 3, 1, 5);                 // lit top
    p.P(x + 1, y + 2, 4);
    p.R(x + 2, y + h - 1, w - 3, 1, 2);             // shaded base
  }
  const ring = (p, back) => STONES.forEach(([dx, dy, b]) => { if ((dy < 0) === back) stone(p, CX + dx - 3, FY + dy + 1, b); });

  /* The flame: three tongues of different heights that sway in stepped frames fl (0..3). Each is a
     stack of rows narrowing to the tip: ink outline, then gold, light and pale core. */
  const TONGUES = [ // dx, base half-width, heights over the 4 frames
    { dx: -6, hw: 4, h: [11, 13, 10, 12], sw: [-1, 0, 1, 0] },
    { dx: 6, hw: 4, h: [12, 10, 13, 11], sw: [1, 0, -1, 0] },
    { dx: 0, hw: 6, h: [22, 25, 21, 24], sw: [0, 1, 0, -1] },
  ];
  function flame(p, fl, grow = 0) {
    const up = 1 + grow * 0.1; // each level of `grow` makes the tongues a tenth taller (and a little wider)
    const rows = (t, shrink, frac) => {
      const h = Math.round(t.h[fl] * up), hw = Math.round(t.hw * (1 + grow * 0.04)), n = Math.floor(h * frac);
      for (let r = 0; r < n; r++) {
        const k = 1 - r / h, w = Math.round(hw * Math.pow(k, 0.7)) - shrink;
        if (w < 0) break;
        const sway = r > h * 0.4 ? Math.round(t.sw[fl] * (r - h * 0.4) / (h * 0.3)) : 0;
        t.span.push([FY - r, t.dx + sway - w, t.dx + sway + w]);
      }
    };
    for (const t of TONGUES) {
      for (const [shrink, frac, key] of [[-1, 1.1, 0], [0, 1, 8], [2, 0.7, 6], [3, 0.4, 7]]) {
        t.span = []; rows(t, shrink, frac);
        for (const [y, a, b] of t.span) p.R(FX + a, y, b - a + 1, 1, key);
        if (key === 0 && t.span.length) { const [y, a, b] = t.span[t.span.length - 1]; p.R(FX + a + 1, y - 1, Math.max(1, b - a - 1), 1, 0); }
      }
      // redraw the tongue's body on top of the next tongue's outline, in order
      for (const [shrink, frac, key] of [[0, 1, 8], [2, 0.7, 6], [3, 0.4, 7]]) {
        t.span = []; rows(t, shrink, frac);
        for (const [y, a, b] of t.span) p.R(FX + a, y, b - a + 1, 1, key);
      }
    }
  }

  // Sparks rising and drifting, stepped, each on its own cycle.
  function sparks(p, t, grow = 0) {
    const s = Math.floor(t * 6);
    for (let i = 0; i < 7; i++) {
      const step = (s + i * 5) % 16;
      const x = FX - 9 + ((i * 7) % 19) + (step % 4 < 2 ? 0 : (i % 2 ? 1 : -1));
      p.P(x, FY - 12 - Math.round(grow * 2.5) - step, step < 7 ? 7 : 8);
    }
  }

  // grow: how much higher the fire burns (0 as standard; the campfire stop raises it each heat, js/fire.js).
  function draw(pln, t, heat, sc, grow = 0) {
    const p = pln.p, fl = Math.floor(t * 6) % 4;
    log(p, 14, GY - 24, 26, 7, 0.14);              // a log behind, left of the fire
    ring(p, true);
    for (let i = 0; i < 16; i++) {                 // logs leaning into the flames
      const x = FX - 12 + i, y = FY - 4 - Math.round(i * 0.35);
      p.R(x, y, 1, 6, 0); p.R(x, y + 1, 1, 4, 3); p.R(x, y + 1, 1, 1, 4); p.P(x, y + 4, 2);
    }
    flame(p, fl, grow);
    for (let i = -9; i <= 9; i++) p.R(FX + i, FY + 1, 1, 2, (i + fl) % 4 === 0 ? 7 : 8); // coals
    ring(p, false);
    log(p, 4, GY - 8, 20, 7);                      // the logs alongside, in front
    log(p, 58, GY - 7, 20, 7, -0.06);
    log(p, 62, GY - 16, 14, 6, 0.1);
    sparks(p, t, grow);
  }

  const PROPS = [{ id: 'campfire', name: 'campfire with logs', x0: 0, w: W, cx: CX, gy: GY, home: { x: 75, depth: 380 }, draw }];
  // How many scene px higher the flame tips reach at `grow` (the tallest tongue is 25).
  const rise = (grow) => Math.round(25 * grow * 0.1);
  return { PROPS, draw, rise, W, GY, CX };
})();
