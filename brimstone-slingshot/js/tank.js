'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the Brimstone Tank: a 2D aquarium minigame (a rare stop, Run.tank in
   js/run.js), like the slots and the wheel. Catch the fish: guppies stream across the tank from both
   sides, faster and thicker as the round goes on. Click the ones that glint gold for arcana (1, 2 or
   3 by size); plain ones are worth nothing. The Guppymuncher crab on the sand and the invader (an idol
   creature, js/idol.js) drifting through cost arcana if you click them. The arcana caught decide the
   reward. Drawn pixel by pixel on a W x H canvas in the palette's tones.
   ============================================================ */

const Tank = (() => {
  const W = 384, H = 160, SAND = TANK_ART.sand;      // the tank in art pixels; where the sand starts
  const DUR = 30;                                    // seconds a round lasts
  const SPAWN = [2.2, 4.6];                          // fish a second, at the start and at the end
  const SWIM = [36, 96];                             // how fast they cross (px a second), start and end
  const GLINT = 0.5;                                 // the share of fish that glint
  const VALUE = [1, 2, 3];                           // arcana for a glinting fish, by size
  const SIZES = [0.5, 0.33, 0.17];                   // how often each size comes
  const PENALTY = 3;                                 // arcana lost for clicking the crab or the invader
  const INVADE_EVERY = 9, INVADE_FIRST = 5;          // when invaders drift through
  const SPEED = { alien: 30, lion: 40, robot: 24, golem: 20 }; // how fast each invader drifts (px a second)
  const STEP = 1 / 30;

  // The art (js/tank-art.js, made by tools/tank/art.py): the guppies by size and the crab's two
  // walking poses, outlined, facing left (a guppy is flipped to face right); the background below.
  const FISH_ART = TANK_ART.guppy, CRAB = TANK_ART.crab;
  // The background, decoded once from its run-length pairs into tone indexes, then painted per palette.
  const BG = (() => {
    const a = new Uint8Array(W * H), s = TANK_ART.bg;
    for (let i = 0, o = 0; i < s.length; i += 2) { const v = +s[i], n = s.charCodeAt(i + 1) - 48; a.fill(v, o, o + n); o += n; }
    return a;
  })();
  const TONES = (p) => [p.ink, p.dark, p.mid, p.light, p.paper, p.white, p.accent];
  const bgCache = {};
  function background(p) {
    const key = TONES(p).join();
    if (bgCache[key]) return bgCache[key];
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d'), img = x.createImageData(W, H), rgb = TONES(p).map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
    for (let i = 0; i < W * H; i++) { const c = rgb[BG[i]] || rgb[4]; img.data.set([...c, 255], i * 4); }
    x.putImageData(img, 0, 0);
    return (bgCache[key] = cv);
  }
  // Kelp, swaying in steps: tall ribbons rising from the sand on both sides (x, height, phase).
  const KELP = [[120, 70, 0], [206, 54, 2], [318, 104, 1], [338, 90, 3], [358, 112, 2], [14, 62, 1]];
  const CRAB_SPEED = 16;                             // how fast the crab walks

  /* mount(canvas, { invader, onTick(left, score), onScore(score, delta, x, y), onEnd(score) }) sets up
     the tank; fish swim through idly (none glint) until start(). */
  function mount(canvas, opts) {
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    const P = () => Palette.cur;
    const rnd = (a, b) => a + Math.random() * (b - a);
    let fish = [], pops = [], bubbles = [], invs = [], score = 0, t = 0, anim = 0, live = false, over = false, last = 0, due = 0, nextInv = INVADE_FIRST, shake = 0;
    const crab = { x: W * 0.7, vx: -CRAB_SPEED, snap: 0 };
    const ramp = ([a, b]) => a + (b - a) * Math.min(1, t / DUR);
    function spawn(glint) {
      const r = Math.random(), size = r < SIZES[0] ? 0 : r < SIZES[0] + SIZES[1] ? 1 : 2, a = FISH_ART[size];
      const left = Math.random() < 0.5, sp = ramp(SWIM) * rnd(0.8, 1.25) * (1 + size * 0.15);
      fish.push({ x: left ? -a[0].length : W + a[0].length, y: rnd(26, SAND - 14), vx: left ? sp : -sp, size, glint, wob: rnd(0, 6), amp: rnd(2, 8) });
    }
    for (let i = 0; i < 4; i++) { spawn(i === 0); fish[i].x = rnd(60, W - 60); }

  // The invader's frames, one per facing, from the idol's own pieces: drawn once to small canvases.
    const parts = { mask: opts.invader, vessel: opts.invader, pedestal: opts.invader };
    const frames = {}, box = { x0: 99, x1: 0, y0: 99, y1: 0 };
    for (const f of Idol.TURN) {
      const C = Idol.compose(parts, f);
      C.forEach((r, y) => r.forEach((c, x) => { if (c !== '.') { box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x); box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y); } }));
      frames[f] = C;
    }
    const IW = box.x1 - box.x0 + 1, IH = box.y1 - box.y0 + 1;

    const px = (x, y, ch) => { if (PAL[ch]) { g.fillStyle = PAL[ch]; g.fillRect(Math.round(x), Math.round(y), 1, 1); } };
    const art = (rows, x, y, flip) => rows.forEach((r, yy) => [...r].forEach((ch, xx) => { if (ch !== '.') px(x + (flip ? r.length - 1 - xx : xx), y + yy, ch); }));
    const fishY = (f) => f.y + Math.sin(f.wob) * f.amp;
    function coin(x, y, gold, r = 6) {                          // round, gold or silver, the arcana crescent on each
      const p = P(), k = r / 6;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r + 0.2) continue;
        const moon = Math.hypot(dx / k + 0.5, dy / k) <= 3.4 && Math.hypot(dx / k - 1.3, dy / k - 0.8) > 2.6;
        g.fillStyle = d > r - 1.1 || moon ? p.ink : dx + dy < -r / 2 ? p.white : gold ? p.accent : p.paper;
        g.fillRect(Math.round(x) + dx, Math.round(y) + dy, 1, 1);
      }
    }

    function draw() {
      const p = P(), step = Math.floor(anim * 5);               // stepped motion, 5 a second
      g.save();
      if (shake > 0) g.translate(Math.round(rnd(-2, 2)), 0);
      g.drawImage(background(p), 0, 0);
      for (const [x0, h, ph] of KELP) {                         // kelp: a dark-edged ribbon with a light midrib and leaf bulges
        for (let i = 0; i < h; i++) {
          const y = Math.round(SAND - 4 - i), sway = Math.round(Math.sin(i / 14 + (step + ph * 3) * 0.35) * (i / h) * 6);
          const w = 4 + (Math.floor((i + ph * 5) / 9) % 2 ? 2 : 0), x = x0 + sway - (w >> 1);
          g.fillStyle = p.dark; g.fillRect(x - 1, y, w + 2, 1);
          g.fillStyle = p.mid; g.fillRect(x, y, w, 1);
          g.fillStyle = p.light; g.fillRect(x + (w >> 1), y, 1, 1);
        }
      }
      for (const b of bubbles) { g.fillStyle = p.ink; g.fillRect(Math.round(b.x) - 1, Math.round(b.y), 4, 2); g.fillRect(Math.round(b.x), Math.round(b.y) - 1, 2, 4); g.fillStyle = p.white; g.fillRect(Math.round(b.x), Math.round(b.y), 2, 2); }
      {                                                          // the Guppymuncher, walking in steps
        const rows = CRAB[crab.snap > 0 ? 0 : step % 2], x = Math.round(crab.x - rows[0].length / 2), y = SAND - rows.length + 3;
        art(rows, x, y, crab.vx > 0);
      }
      for (const f of fish) {
        const a = FISH_ART[f.size], flip = f.vx > 0, y0 = fishY(f);
        // a glinting fish is gold, with a stepped sparkle; a plain one is drab
        const rows = f.glint ? a.map((r) => r.replace(/[-+]/g, '*')) : a.map((r) => r.replace(/-/g, '+'));
        const x = Math.round(f.x - a[0].length / 2), y = Math.round(y0 - a.length / 2);
        rows.forEach((r, yy) => [...r].forEach((ch, xx) => {
          if (ch === '.') return;
          g.fillStyle = ch === '*' ? p.accent : PAL[ch]; g.fillRect(x + (flip ? r.length - 1 - xx : xx), y + yy, 1, 1);
        }));
        if (f.glint) {                                           // a four-point sparkle hopping round the fish
          const k = (step + Math.floor(f.wob * 3)) % 4, sx = x + [2, a[0].length - 3, a[0].length - 4, 3][k], sy = y + [-3, -2, a.length + 1, a.length][k];
          g.fillStyle = p.ink; g.fillRect(sx - 2, sy, 5, 1); g.fillRect(sx, sy - 2, 1, 5);
          g.fillStyle = p.white; g.fillRect(sx, sy, 1, 1);
        }
      }
      for (const v of invs) {
        const C = frames[v.facing], x = Math.round(v.x - IW / 2), y = Math.round(v.y - IH / 2);
        for (let yy = 0; yy < IH; yy++) for (let xx = 0; xx < IW; xx++) {
          const ch = C[box.y0 + yy][box.x0 + xx];
          if (ch !== '.') { g.fillStyle = PAL[ch]; g.fillRect(x + xx, y + yy, 1, 1); }
        }
      }
      for (const o of pops) {                                   // what a click did: coins rising, or a crossed-out coin
        const y = o.y - o.age * 30;
        if (o.v > 0) for (let i = 0; i < o.v; i++) coin(o.x + (i - (o.v - 1) / 2) * 9, y, true, 4);
        else {
          coin(o.x, y, false, 5);
          g.fillStyle = p.ink;
          for (let i = -6; i <= 6; i++) { g.fillRect(Math.round(o.x) + i, Math.round(y) + i, 2, 2); g.fillRect(Math.round(o.x) + i, Math.round(y) - i, 2, 2); }
        }
      }
      if (!live && !over) {                                      // before the start: point out a glinting fish
        const f = fish.find((f) => f.glint);
        if (f) {
          const a = FISH_ART[f.size], r = Math.max(a.length, a[0].length) / 2 + 5 + (step % 2) * 2, cx = Math.round(f.x), cy = Math.round(fishY(f));
          g.fillStyle = p.ink;
          for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            g.fillRect(cx + sx * r - (sx < 0 ? 0 : 5), cy + sy * r - (sy < 0 ? 0 : 1), 6, 2);
            g.fillRect(cx + sx * r - (sx < 0 ? 0 : 1), cy + sy * r - (sy < 0 ? 0 : 5), 2, 6);
          }
        }
      }
      g.restore();
      g.fillStyle = p.ink;                                      // the glass's frame
      g.fillRect(0, 0, W, 2); g.fillRect(0, H - 2, W, 2); g.fillRect(0, 0, 2, H); g.fillRect(W - 2, 0, 2, H);
    }

    // The invader turns in steps through its facings (L, QL, F, QR, R) when it changes direction.
    const ORDER = Idol.TURN;
    function update(dt) {
      anim += dt;                                               // the fish, weeds and bubbles move from the start
      if (live) t += dt;                                        // the round's clock only once started
      shake -= dt;
      if (Math.random() < dt * 2) {                              // bubbles from the helmet's top and the kelp tops
        const [bx, by] = [[262, 62], [120, SAND - 72], [338, SAND - 92]][Math.floor(Math.random() * 3)];
        bubbles.push({ x: bx + rnd(-3, 3), y: by });
      }
      bubbles = bubbles.filter((b) => (b.y -= dt * 20) > 4);
      // fish come in from the sides, more and faster as the round goes on (a few, none glinting, before it starts)
      due -= dt;
      if (due <= 0) {
        if (live) { spawn(Math.random() < GLINT); due = 1 / ramp(SPAWN) * rnd(0.6, 1.4); }
        else { if (fish.length < 6) spawn(!fish.some((f) => f.glint)); due = 1; }
      }
      for (const f of fish) { f.x += f.vx * dt; f.wob += dt * 2.2; }
      fish = fish.filter((f) => f.x > -30 && f.x < W + 30);
      pops = pops.filter((o) => (o.age += dt) < 0.8);
      // the Guppymuncher walks the sand
      crab.x += crab.vx * dt; crab.snap -= dt;
      if (crab.x < 24 || crab.x > W - 24) { crab.vx = -crab.vx; crab.x = Math.max(24, Math.min(W - 24, crab.x)); }
      // invaders drift through the middle of the tank, in the way of the fish
      if (live && t >= nextInv) {
        nextInv += INVADE_EVERY;
        const left = Math.random() < 0.5, ground = opts.invader === 'robot' || opts.invader === 'golem';
        invs.push({ x: left ? -IW / 2 : W + IW / 2, y: ground ? SAND - IH / 2 + 4 : rnd(IH / 2 + 6, SAND - IH / 2), vx: (left ? 1 : -1) * (SPEED[opts.invader] || 30), facing: left ? 'R' : 'L', turnT: 0, bob: rnd(0, 6) });
        sfx('warp');
      }
      for (const v of invs) {
        v.x += v.vx * dt; v.bob += dt;
        const want = v.vx < 0 ? 'L' : 'R';
        if ((v.turnT -= dt) <= 0 && v.facing !== want) { const i = ORDER.indexOf(v.facing), j = ORDER.indexOf(want); v.facing = ORDER[i + Math.sign(j - i)]; v.turnT = 0.12; }
      }
      invs = invs.filter((v) => v.x > -IW && v.x < W + IW);
      if (live && opts.onTick) opts.onTick(Math.max(0, DUR - t), score);
      if (live && !over && t >= DUR) { over = true; live = false; opts.onEnd && opts.onEnd(score); }
    }

    function frame(now) {
      if (!canvas.isConnected) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : STEP; last = now;
      let acc = dt;
      while (acc > 0) { update(Math.min(STEP, acc)); acc -= STEP; }
      draw();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    function scored(delta, x, y) {
      score = Math.max(0, score + delta);
      pops.push({ x, y, v: delta, age: 0 });
      opts.onScore && opts.onScore(score, delta);
    }
    // Clicks: the invader or the crab costs arcana; a glinting fish pays; a plain one does nothing.
    canvas.addEventListener('pointerdown', (e) => {
      if (!live) return;
      const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
      const v = invs.find((v) => Math.abs(x - v.x) < IW / 2 - 2 && Math.abs(y - v.y) < IH / 2 - 2);
      const rows = CRAB[0], onCrab = Math.abs(x - crab.x) < rows[0].length / 2 && y > SAND - rows.length + 3;
      if (v || onCrab) { crab.snap = onCrab ? 0.5 : crab.snap; shake = 0.25; sfx('hit'); return scored(-PENALTY, x, y); }
      // the nearest fish under the click, with a little slack round each
      let best = null, bd = 1e9;
      for (const f of fish) {
        const a = FISH_ART[f.size], dx = Math.abs(x - f.x), dy = Math.abs(y - fishY(f));
        if (dx < a[0].length / 2 + 4 && dy < a.length / 2 + 4 && dx + dy < bd) { best = f; bd = dx + dy; }
      }
      if (!best) return;
      fish.splice(fish.indexOf(best), 1);
      if (best.glint) { sfx('tally'); scored(VALUE[best.size], best.x, fishY(best)); }
      else sfx('tick');
    });

    return {
      start() { live = true; over = false; t = 0; due = 0; nextInv = INVADE_FIRST; },
      get score() { return score; },
      // for checking: where things are, in tank pixels
      peek: () => ({ t, score, live, over, fish: fish.map((f) => ({ x: f.x, y: fishY(f), size: f.size, glint: f.glint })),
        crab: { x: crab.x, y: SAND - CRAB[0].length / 2 + 3 }, invs: invs.map((v) => ({ x: v.x, y: v.y })) }),
    };
  }

  // Arcana caught that earn a choice of two, then of three (fewer: one, at random).
  const TIERS = [20, 40];
  return { W, H, DUR, TIERS, mount, ART: { FISH_ART, CRAB } }; // ART for checking the guppies and the crab
})();
