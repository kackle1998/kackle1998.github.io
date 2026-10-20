'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the Brimstone Tank: a 2D aquarium minigame (a rare stop, Run.tank in
   js/run.js), like the slots and the wheel. Click the water to drop food; fed guppies grow and drop
   coins; click the coins before they sink away. The Guppymuncher crab walks the sand and snaps up
   small guppies that swim too low (dropping a gold coin). Partway through, an idol creature
   (js/idol.js) comes for the fish: click it until it flees. The coins caught decide the reward.
   Drawn pixel by pixel on a W x H canvas in the palette's tones, shown at 2x.
   ============================================================ */

const Tank = (() => {
  const W = 384, H = 160, SAND = TANK_ART.sand;      // the tank in art pixels (shown at 3x); where things settle on the sand
  const DUR = 30;                                    // seconds a round lasts
  const FISH = 3;                                    // guppies at the start
  const HUNGER = 10;                                 // seconds a fed fish lasts; hungry below half; dies at 0
  const GROW = [2, 5];                               // meals to reach medium, then large
  const COIN_EVERY = 4;                              // seconds between a grown fish's coins
  const COIN_VALUE = [0, 1, 2];                      // by size: small fish drop none
  const COIN_LIFE = 3;                               // seconds a coin rests on the sand before it's gone
  const PELLETS = 3;                                 // food in the water at once
  const INVADE_AT = 12, INVADE_STAY = 11;            // when the invader comes, and how long it hunts
  const INVADER_HP = 12;                             // clicks to drive it off
  const BOUNTY = 5;                                  // gold coins it drops as it flees
  const SPEED = { alien: 34, lion: 48, robot: 24, golem: 20 }; // how fast each invader hunts (px a second)
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
  const CRAB_SPEED = 12, CRAB_REACH = 30;            // how fast it walks; how near the sand a small guppy has to swim to be caught

  /* mount(canvas, { invader, onTick(t, score), onCoin(score), onEnd(score) }) sets up the tank; it
     shows the fish swimming idly until start(). */
  function mount(canvas, opts) {
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    const P = () => Palette.cur;
    const rnd = (a, b) => a + Math.random() * (b - a);
    let fish = [], coins = [], pellets = [], bubbles = [], inv = null, score = 0, t = 0, anim = 0, live = false, over = false, came = false, last = 0;
    const crab = { x: W * 0.7, vx: -CRAB_SPEED, snap: 0 };
    for (let i = 0; i < FISH; i++) fish.push({ x: rnd(60, W - 60), y: rnd(30, SAND - 30), vx: rnd(-1, 1) < 0 ? -18 : 18, vy: 0, size: 0, meals: 0, hunger: HUNGER, coin: COIN_EVERY * rnd(0.5, 1), alive: true, wob: rnd(0, 6) });

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

    function draw() {
      const p = P(), step = Math.floor(anim * 5);               // stepped motion, 5 a second
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
      for (const f of pellets) { g.fillStyle = p.ink; g.fillRect(Math.round(f.x) - 1, Math.round(f.y) - 1, 4, 4); g.fillStyle = p.mid; g.fillRect(Math.round(f.x), Math.round(f.y), 2, 2); }
      for (const c of coins) {                                  // coins: round, silver or gold, the arcana crescent on each
        const x = Math.round(c.x), y = Math.round(c.y);
        for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
          const d = Math.hypot(dx, dy);
          if (d > 6.2) continue;
          const moon = Math.hypot(dx + 0.5, dy) <= 3.4 && Math.hypot(dx - 1.3, dy - 0.8) > 2.6;   // the crescent, as on the arcana icon
          g.fillStyle = d > 5.1 ? p.ink : moon ? p.ink : c.v > 1 ? (dx + dy < -3 ? p.white : p.accent) : (dx + dy < -3 ? p.white : p.paper);
          g.fillRect(x + dx, y + dy, 1, 1);
        }
      }
      for (const f of fish) {
        if (!f.alive) continue;
        const a = FISH_ART[f.size], flip = f.vx > 0;
        const hungry = f.hunger < HUNGER / 2;                   // a hungry fish goes dark
        const rows = hungry ? a.map((r) => r.replace(/-/g, '+')) : a;
        const x = Math.round(f.x - a[0].length / 2), y = Math.round(f.y - a.length / 2 + Math.sin(f.wob + step) * 0.6);
        art(rows, x, y, flip);
      }
      {                                                          // the Guppymuncher, walking in steps
        const rows = CRAB[crab.snap > 0 ? 0 : step % 2], x = Math.round(crab.x - rows[0].length / 2), y = SAND - rows.length + 3;
        art(rows, x, y, false);
      }
      if (inv) {
        const C = frames[inv.facing], x = Math.round(inv.x - IW / 2), y = Math.round(inv.y - IH / 2);
        for (let yy = 0; yy < IH; yy++) for (let xx = 0; xx < IW; xx++) {
          const ch = C[box.y0 + yy][box.x0 + xx];
          if (ch !== '.') { g.fillStyle = PAL[ch]; g.fillRect(x + xx, y + yy, 1, 1); }
        }
      }
      g.fillStyle = p.ink;                                      // the glass's frame
      g.fillRect(0, 0, W, 2); g.fillRect(0, H - 2, W, 2); g.fillRect(0, 0, 2, H); g.fillRect(W - 2, 0, 2, H);
    }

    // The invader turns in steps through its facings (L, QL, F, QR, R) when it changes direction.
    const ORDER = Idol.TURN;
    function update(dt) {
      anim += dt;                                               // the weeds and bubbles move from the start
      if (live) t += dt;                                        // the round's clock only once started
      const clock = live ? t : 0;
      // bubbles rise in steps from the weeds
      if (Math.random() < dt * 2) {                              // bubbles from the helmet's top and the kelp tops
        const [bx, by] = [[262, 62], [120, SAND - 72], [338, SAND - 92]][Math.floor(Math.random() * 3)];
        bubbles.push({ x: bx + rnd(-3, 3), y: by });
      }
      bubbles = bubbles.filter((b) => (b.y -= dt * 20) > 4);
      for (const f of pellets) f.y = Math.min(SAND - 2, f.y + dt * 14);
      pellets = pellets.filter((f) => !f.gone && (f.rest = f.y >= SAND - 2 ? (f.rest || 0) + dt : 0) < 2);
      for (const c of coins) {
        if (c.y < SAND - 6) c.y = Math.min(SAND - 6, c.y + dt * 10);
        else c.rest += dt;
      }
      coins = coins.filter((c) => c.rest < COIN_LIFE && !c.got);
      for (const f of fish) {
        if (!f.alive) continue;
        f.wob += dt;
        if (live) f.hunger -= dt;
        if (f.hunger <= 0) { f.alive = false; sfx('die'); continue; }
        // a hungry fish goes for the nearest food, a full one wanders; all flee the invader
        let tx = null, ty = null, sp = 18 + f.size * 2;
        const food = f.hunger < HUNGER / 2 && pellets.length ? pellets.reduce((a, b) => (Math.hypot(a.x - f.x, a.y - f.y) < Math.hypot(b.x - f.x, b.y - f.y) ? a : b)) : null;
        if (food) { tx = food.x; ty = food.y; sp = 34; }
        if (inv && inv.mode === 'hunt' && Math.hypot(inv.x - f.x, inv.y - f.y) < 70) { tx = f.x + (f.x - inv.x); ty = f.y + (f.y - inv.y); sp = 40; }
        if (tx != null) {
          const d = Math.hypot(tx - f.x, ty - f.y) || 1;
          f.vx += ((tx - f.x) / d * sp - f.vx) * Math.min(1, dt * 4); f.vy += ((ty - f.y) / d * sp - f.vy) * Math.min(1, dt * 4);
        } else {
          if (Math.random() < dt * 0.4) f.vx = -f.vx;
          f.vy += (rnd(-1, 1) * 8 - f.vy) * dt;
        }
        f.x += f.vx * dt; f.y += f.vy * dt;
        if (f.x < 16 || f.x > W - 16) { f.vx = -f.vx; f.x = Math.max(16, Math.min(W - 16, f.x)); }
        f.y = Math.max(24, Math.min(SAND - 12, f.y));
        if (food && Math.hypot(food.x - f.x, food.y - f.y) < 5 + f.size * 2) {
          food.gone = true; f.hunger = HUNGER; f.meals++;
          const grown = f.meals >= GROW[1] ? 2 : f.meals >= GROW[0] ? 1 : 0;
          if (grown > f.size) { f.size = grown; sfx('heal'); }
        }
        if (live && COIN_VALUE[f.size] && (f.coin -= dt) <= 0) { f.coin = COIN_EVERY; coins.push({ x: f.x, y: f.y, v: COIN_VALUE[f.size], rest: 0 }); }
      }
      // the Guppymuncher walks the sand, and snaps up a small guppy that swims too low: it drops a gold coin
      crab.x += crab.vx * dt; crab.snap -= dt;
      if (crab.x < 20 || crab.x > W - 20) { crab.vx = -crab.vx; crab.x = Math.max(20, Math.min(W - 20, crab.x)); }
      if (live) for (const f of fish) {
        if (f.alive && f.size === 0 && f.y > SAND - CRAB_REACH && Math.abs(f.x - crab.x) < 10) {
          f.alive = false; crab.snap = 0.6; sfx('die');
          coins.push({ x: crab.x, y: SAND - 16, v: 2, rest: 0 });
        }
      }
      // the invader: comes in from a side at INVADE_AT, hunts the nearest fish, flees when hit enough or after INVADE_STAY
      if (live && !inv && clock >= INVADE_AT && !came) {
        const left = Math.random() < 0.5;
        inv = { x: left ? -IW / 2 : W + IW / 2, y: SAND - IH / 2 - (opts.invader === 'robot' || opts.invader === 'golem' ? 2 : 40), vx: 0, facing: left ? 'R' : 'L', want: left ? 'R' : 'L', turnT: 0, hp: INVADER_HP, mode: 'hunt', since: 0 };
        came = true; sfx('warp');
      }
      if (inv) {
        inv.since += dt;
        const ground = opts.invader === 'robot' || opts.invader === 'golem';
        if (inv.mode === 'hunt') {
          const prey = fish.filter((f) => f.alive).reduce((a, b) => (!a || Math.abs(b.x - inv.x) < Math.abs(a.x - inv.x) ? b : a), null);
          const sp = SPEED[opts.invader] || 30;
          if (prey) {
            const dx = prey.x - inv.x, dy = ground ? 0 : prey.y - inv.y + IH * 0.2, d = Math.hypot(dx, dy) || 1;
            inv.x += dx / d * sp * dt; inv.y += dy / d * sp * dt;
            inv.want = dx < 0 ? 'L' : 'R';
            const reach = ground ? Math.abs(dx) < IW / 3 && prey.y > inv.y - IH / 2 : Math.hypot(dx, prey.y - inv.y) < IW / 3;
            if (reach) { prey.alive = false; sfx('die'); }
          }
          if (inv.since > INVADE_STAY || !prey) { inv.mode = 'leave'; inv.want = inv.x < W / 2 ? 'L' : 'R'; }
        } else {
          inv.x += (inv.want === 'L' ? -1 : 1) * 70 * dt;
          if (inv.x < -IW || inv.x > W + IW) inv = null;
        }
        if (inv) {
          inv.y = Math.max(IH / 2 + 4, Math.min(SAND - IH / 2 + 4, inv.y));
          // turn one facing at a time toward where it's going
          if ((inv.turnT -= dt) <= 0 && inv.facing !== inv.want) {
            const i = ORDER.indexOf(inv.facing), j = ORDER.indexOf(inv.want);
            inv.facing = ORDER[i + Math.sign(j - i)]; inv.turnT = 0.12;
          }
        }
      }
      if (live && opts.onTick) opts.onTick(Math.max(0, DUR - clock), score);
      if (live && !over && (clock >= DUR || (!fish.some((f) => f.alive) && !coins.length && !inv))) {
        over = true; live = false; opts.onEnd && opts.onEnd(score);
      }
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

    // Clicks: the invader first, then a coin, then food in the water.
    canvas.addEventListener('pointerdown', (e) => {
      if (!live) return;
      const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
      if (inv && inv.mode === 'hunt' && Math.abs(x - inv.x) < IW / 2 && Math.abs(y - inv.y) < IH / 2) {
        inv.hp--; inv.x += (inv.x < x ? -1 : 1) * 4; sfx('hit');
        if (inv.hp <= 0) {
          inv.mode = 'leave'; inv.want = inv.x < W / 2 ? 'L' : 'R'; sfx('win');
          for (let i = 0; i < BOUNTY; i++) coins.push({ x: inv.x + rnd(-14, 14), y: inv.y + rnd(-10, 10), v: 2, rest: 0 });
        }
        return;
      }
      const c = coins.find((c) => Math.hypot(c.x - x, c.y - y) < 9);
      if (c) { c.got = true; score += c.v; sfx('tally'); opts.onCoin && opts.onCoin(score); return; }
      if (y > 20 && y < SAND - 4 && pellets.length < PELLETS) { pellets.push({ x, y }); sfx('tick'); }
    });

    return {
      start() { live = true; over = false; t = 0; came = false; for (const f of fish) f.hunger = HUNGER * 0.8; },
      get score() { return score; },
      // for checking: where things are, in tank pixels
      peek: () => ({ t, score, live, over, fish: fish.filter((f) => f.alive).map((f) => ({ x: f.x, y: f.y, size: f.size, hunger: f.hunger })),
        coins: coins.map((c) => ({ x: c.x, y: c.y })), inv: inv && { x: inv.x, y: inv.y, facing: inv.facing, hp: inv.hp, mode: inv.mode } }),
    };
  }

  // Coins caught that earn a choice of two, then of three (fewer: one, at random).
  const TIERS = [12, 24];
  return { W, H, DUR, TIERS, mount, ART: { FISH_ART, CRAB } }; // ART for checking the guppies and the crab
})();
