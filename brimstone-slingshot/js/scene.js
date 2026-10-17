'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the scene kit: what every event scene is built from (a stop that opens
   its own 3D scene: the bowling lane in js/bowl.js, Bone Draft in js/draft.js), so they all
   look and move alike. How to make a new one: .claude/skills/event-animation/SKILL.md.
     Scene.mount    the stage: the run map's sky and camera, a tilted plane to stand things on
     Scene.figure   your figurine standee (the hero sprite, ink-outlined)
     Scene.land     the entrance: the tail of the map's lob
     Scene.play     a timeline player: smooth flights, stepped frames, sound cues
     Scene.ground   pale ash ground past the plane's edges, with contact shadows
     Scene.ruins    the run map's spires scattered to the horizon, hotter each ante
     Scene.plane    an upright pixel canvas to draw the action on, in scene px
     Scene.slingshot, Scene.card, Scene.pen, Scene.toStage
   Units: plane x and y (depth) and heights are map units. Every canvas pixel is 2 map units;
   a scene px on an upright plane is `u` map units (4 unless said). Colors are palette ramp
   indexes (RunMap.ramp: 0 darkest .. 7 lightest, 8 the accent).
   ============================================================ */

const Scene = (() => {
  const BAY = RunMap.BAY;
  const bay = (x, y) => BAY[(x & 3) + ((y & 3) << 2)];
  const cl = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  // A light level 0..3 for brightness f (0..1), dithered in Bayer order.
  const lvl = (f, x, y) => Math.max(0, Math.min(3, Math.round(f * 3 + bay(x, y) / 16 - 0.5)));
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

  // A painter onto canvas g: scene px (x, y) as an s x s block, the canvas's corner at scene (x0, y0).
  const pen = (g, C, x0 = 0, y0 = 0, s = 1) => ({
    P: (x, y, k) => { g.fillStyle = C[k]; g.fillRect((Math.round(x) - x0) * s, (Math.round(y) - y0) * s, s, s); },
    R: (x, y, w, h, k) => { g.fillStyle = C[k]; g.fillRect((Math.round(x) - x0) * s, (Math.round(y) - y0) * s, w * s, h * s); },
  });

  /* ---------- the stage ---------- */
  /* Build an empty scene in `stage` (sized by CSS, class bw-stage): the run map's sky (its orrery,
     turning about 10 fps) behind a view tilted by the map's camera (.bw-view / .bw-pl). The view is
     700 tall like a map screen, scaled so `rows` of it fill the stage, `top` down from its top (the
     bowling lane: 600, -30; Bone Draft pulls back and down: 700, 90). `extra` is HTML put after
     the view (a HUD). Returns sc: { stage, C, RGB, pl, alive(), every(ms, fn), stand(...) }. */
  function mount(stage, { rows = 600, top = -30, extra = '' } = {}) {
    const C = RunMap.ramp(), RGB = C.map(rgb);
    stage.innerHTML = '<canvas class="bw-sky"></canvas><div class="bw-view"><div class="bw-pl"></div></div>' + extra;
    const skyCv = stage.firstChild, view = skyCv.nextSibling, pl = view.firstChild;
    const k = stage.clientHeight / rows;
    Object.assign(view.style, { width: stage.clientWidth / k + 'px', top: top * k + 'px', transform: `scale(${k})` });
    const alive = () => stage.isConnected;
    // A timer that stops by itself once the stage is gone.
    const every = (ms, fn) => { const id = setInterval(() => (alive() ? fn() : clearInterval(id)), ms); };
    const sky = RunMap.skyDrawer(skyCv, C);
    sky(performance.now() / 1000);
    every(100, () => sky(performance.now() / 1000));
    // A standee: stood up off the plane at plane x (its left edge) and depth (its feet), w x h map units.
    const stand = (el, x, depth, w, h) => {
      el.className = 'bw-st';
      Object.assign(el.style, { left: x + 'px', top: depth - h + 'px', width: w + 'px', height: h + 'px' });
      pl.appendChild(el);
      return el;
    };
    return { stage, C, RGB, pl, alive, every, stand };
  }

  /* ---------- your figurine ---------- */
  /* The hero sprite (so a custom portrait works) with a 1 px ink outline so it reads on pale
     ground, standing up off the plane, `s` map units a pixel. `hang`: pixels of it below the feet
     (the bowling lane's figurine stands on its outline's last row). place({ x, y, z, rot, sx, sy,
     lean, bob }): x the middle of its feet, y the depth they stand at, z lifted (rounded to 4 map
     units, as the map's lob), rot quarter turns (about its middle), sx/sy a squash from the feet,
     lean tips it back (degrees), bob the idle bob. A squash wins over a turn. */
  function figure(sc, { s, hang = 0 }) {
    const hero = expandSprite(SPRITES.hero), cv = document.createElement('canvas'), w = 18 * s;
    cv.width = 18; cv.height = 18;
    const g = cv.getContext('2d'), at = (x, y) => y >= 0 && y < hero.length && x >= 0 && x < 16 && PAL[hero[y][x]] != null;
    for (let y = -1; y <= hero.length; y++) for (let x = -1; x <= 16; x++) {
      const c = at(x, y) ? PAL[hero[y][x]] : at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1) ? sc.C[1] : null;
      if (c) { g.fillStyle = c; g.fillRect(x + 1, y + 1, 1, 1); }
    }
    const el = sc.stand(document.createElement('div'), 0, 0, w, w);
    el.appendChild(cv);
    const place = ({ x, y, z = 0, rot = 0, sx = 1, sy = 1, lean = 0, bob = false }) => {
      el.style.left = x - w / 2 + 'px';
      el.style.top = y + hang * s - w + 'px';
      el.style.transform = `translateZ(${Math.round(z / 4) * 4}px) rotateX(${-90 + lean}deg)`;
      const squash = sx !== 1 || sy !== 1;
      cv.style.transformOrigin = squash ? '50% 100%' : '50% 50%';
      cv.style.transform = squash ? `scale(${sx}, ${sy})` : rot ? `rotate(${rot * 90}deg)` : '';
      el.classList.toggle('bob', bob);
    };
    return { el, cv, place };
  }

  /* ---------- the entrance ---------- */
  /* The tail of the map's lob (walkTo in js/runmap.js): u from 0 (the top of the arc, off one edge
     of the screen) to 1 (landed). Returns { k: how much of the way is left (1 - u), to scale the
     scene's own across and back by; z: height, the falling half of the map's 4H k(1 - k) lob, in
     map units rounded to 4; rot: stepped quarter turns, ending at 0 }. Land with sfx('land') and
     a squash of 1.15 x .8 from the feet for 120 ms; no bob while flying or squashed. */
  const land = (u, high) => ({ k: 1 - u, z: Math.round(high * (1 - u * u) / 4) * 4, rot: u < 1 ? Math.floor(u * 4) % 4 : 0 });
  const SQUASH = { sx: 1.15, sy: 0.8, ms: 120 };

  /* ---------- the timeline player ---------- */
  /* at(t) gives the scene's state at t seconds; draw(state) shows it. Plays from `from` to `to` on
     animation frames, so flights move smoothly (stepped parts step themselves inside at(), with
     Math.floor of time), sounding each cue [t, sfx name, n] as it's passed, then done(). Stops if
     the stage is gone (draw.alive()). */
  function play({ draw, at, from = 0, to, cues = [], done = () => {} }) {
    const t0 = performance.now();
    let last = from - 1e-6;
    (function step(now) {
      if (!draw.alive()) return;
      const t = Math.min(to, from + (now - t0) / 1000);
      for (const [c, name, n] of cues) if (c > last && c <= t) sfx(name, n);
      last = t;
      draw(at(t));
      if (t < to) requestAnimationFrame(step);
      else done();
    })(t0);
  }

  /* ---------- the ground ---------- */
  /* Pale ash, `w` x `h` px from plane (x0, y0), painted once: light(X, Y) 0..1 per plane point
     (lit from the upper left), dithered through `tones`, with grit, rubble [[X, Y, r]] and
     brimstone shards [[X, Y]]; `shadows` are plane rects [X0, Y0, X1, Y1] left in shade (props
     that never move). Run it well past the plane's own edges so the scene doesn't end in a cliff.
     What moves on the ground (contact shadows, things lying there) goes on a small clear canvas
     `over` { x0, y0, w, h } just above it, so the big ground is never repainted. Returns
     { clear(), shade(X, Y, rx, ry): a dithered contact shadow round plane point X, Y (radii in
     px; put it down and right of the thing, away from the light), patch(X, Y, w, h, f(i, j) =>
     color): paint over px }. */
  // pattern(X, Y): an optional floor pattern (flagstones, felt, cracks), a ramp index per plane point, or -1 for plain ground.
  function ground(sc, { x0, y0, w, h, light, tones = [3, 4, 5, 6], seed = 23, grit = 3000, rubble = [], shards = [], shadows = [], over, pattern }) {
    const { C, RGB, pl } = sc, R0 = mulberry32(seed), lit = new Float32Array(w * h), mark = new Int8Array(w * h).fill(-1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) lit[y * w + x] = cl(light(x0 + x * 2, y0 + y * 2));
    if (pattern) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mark[y * w + x] = pattern(x0 + x * 2, y0 + y * 2);
    for (let i = 0; i < grit; i++) mark[Math.floor(R0() * h) * w + Math.floor(R0() * w)] = R0() < 0.7 ? 3 : 4;
    const gx = (X) => Math.round((X - x0) / 2), gy = (Y) => Math.round((Y - y0) / 2);
    const blob = (X, Y, r, ks) => {
      const cx = gx(X), cy = gy(Y);
      for (let v = -r; v <= r; v++) for (let u = -r * 2; u <= r * 2; u++) { const d = Math.hypot(u / 2, v) / r; if (d <= 1) mark[(cy + v) * w + cx + u] = d > 0.75 ? ks[0] : v < 0 && u < 0 ? ks[2] : ks[1]; }
    };
    for (const [X, Y, r] of rubble) blob(X, Y, r, [2, 4, 6]);
    for (const [X, Y] of shards) blob(X, Y, 2, [3, 8, 7]);
    const tone = (x, y, dim) => { const o = y * w + x; return mark[o] >= 0 && !dim ? mark[o] : tones[lvl(cl(lit[o] - dim), x, y)]; };
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h; cv.className = 'bw-lane';
    Object.assign(cv.style, { left: x0 + 'px', top: y0 + 'px', width: w * 2 + 'px', height: h * 2 + 'px' });
    pl.appendChild(cv);
    const g = cv.getContext('2d'), img = g.createImageData(w, h), px = img.data;
    const put = (x, y, k) => { const o = (y * w + x) * 4, c = RGB[k]; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, tone(x, y, 0));
    for (const [X0, Y0, X1, Y1] of shadows) for (let y = gy(Y0); y < gy(Y1); y++) for (let x = gx(X0); x < gx(X1); x++) put(x, y, tone(x, y, 0.55));
    g.putImageData(img, 0, 0);

    const ov = document.createElement('canvas');
    ov.width = over.w; ov.height = over.h;
    Object.assign(ov.style, { position: 'absolute', left: over.x0 + 'px', top: over.y0 + 'px', width: over.w * 2 + 'px', height: over.h * 2 + 'px', transform: 'translateZ(1px)', imageRendering: 'pixelated', pointerEvents: 'none' });
    pl.appendChild(ov);
    const og = ov.getContext('2d'), ou = (over.x0 - x0) / 2, ovv = (over.y0 - y0) / 2;
    const dot = (x, y, k) => { if (x >= 0 && x < over.w && y >= 0 && y < over.h) { og.fillStyle = C[k]; og.fillRect(x, y, 1, 1); } };
    return {
      clear: () => og.clearRect(0, 0, over.w, over.h),
      shade(X, Y, rx, ry) {
        const cx = (X - over.x0) / 2, cy = (Y - over.y0) / 2;
        if (!Number.isFinite(cx + cy + rx + ry)) return; // a bad position would never end the loop
        for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
          const a = (x - cx) / rx, b = (y - cy) / ry;
          if (a * a + b * b < 1) dot(x, y, tone(Math.round(x + ou), Math.round(y + ovv), 0.55));
        }
      },
      patch(X, Y, pw, ph, f) {
        const x1 = Math.round((X - over.x0) / 2), y1 = Math.round((Y - over.y0) / 2);
        for (let i = 0; i < pw; i++) for (let j = 0; j < ph; j++) dot(x1 + i, y1 + j, f(i, j));
      },
    };
  }

  /* ---------- the ruins ---------- */
  /* The run map's spires (RunMap.propArt), scattered over area { x0, x1, y0, y1 } (plane units)
     the way the map places its props (placeProps): mostly short with now and then a tall one, a
     wall of tall ones along the far edge (hiding it), darker the further off, none inside `clear`
     { x0, x1, y } (in front of y, between x0 and x1: the action's own ground). Each thin depth band
     is baked into one canvas, as on the map. `near` props are placed by hand, one standee each:
     { k: 'spike' | 'basalt' | 'strata', x, d (depth), h, w (px), l (light 0..3), seed }. `heat`
     (RunMap.SPIRE_ANTES): 0 still stone, 1 the strata's lower seams glow, 2 all of them and the
     tips, with a lighter stripe crawling up through them 4 steps a second, as on the map. */
  /* Other settings (js/settings.js) scatter their own props the same way: `draw` has propArt's
     signature, `kinds` renames 'spike' / 'basalt' / 'strata' to the setting's own kinds, and
     `size` { kind: [h, w] } scales each kind's height and width. */
  function ruins(sc, { area, clear, near = [], heat = 0, count = 380, seed = 5, wall = 1, draw = RunMap.propArt, kinds = {}, size = {} }) { // wall: how tall the far row is, 1 as the other scenes
    const { C, stand, every } = sc, RS = mulberry32(seed), hot = [];
    const art = (x, p, cx, top) => {
      const fill = (u, v, n, c) => { if (n > 0) { x.fillStyle = c; x.fillRect(u, v, n, 1); } }, mine = [];
      const glow = (u, v) => { u = Math.round(u); v = Math.round(v); fill(u, v, 1, C[8]); mine.push([u, v]); };
      draw(fill, glow, C, p.l, p.k, cx, top, Math.round(p.w), Math.round(p.h), p.seed || 0, heat);
      if (mine.length) hot.push({ x, px: mine });
    };
    const field = [];
    for (let t = 0; t < count * 10 + 200 && field.length < count; t++) {
      const x = area.x0 + RS() * (area.x1 - area.x0), d = area.y0 + 40 + RS() * (area.y1 - area.y0);
      if (d > clear.y && x > clear.x0 && x < clear.x1) continue;
      if (field.some((p) => Math.abs(p.x - x) < 22 && Math.abs(p.d - d) < 16)) continue;
      const big = RS(), far = cl(-d / 600);
      let h = 30 + big * big * big * 220 + RS() * 30 + far * RS() * 140; // map units
      if (d < area.y0 + 160) h += (160 + RS() * 160) * wall;
      let w = Math.min(8 + h * 0.2 * (0.7 + RS() * 0.6), 8 + h * 0.3), k = 'spike';
      if (RS() < 0.2) { k = 'basalt'; h *= 0.6; w *= 1.3; }
      k = kinds[k] || k;
      const [sh, sw] = size[k] || [1, 1];
      field.push({ k, x, d, h: Math.max(8, Math.round(h * sh / 2)), w: Math.max(4, Math.round(w * sw / 2)), l: d < -650 ? 1 : d < -200 ? 2 : 3 });
    }
    const bands = new Map();
    for (const p of field) { const b = Math.floor(p.d / 32); if (!bands.has(b)) bands.set(b, []); bands.get(b).push(p); }
    for (const list of bands.values()) {
      const left = Math.floor(Math.min(...list.map((p) => p.x / 2 - p.w))) - 2, right = Math.ceil(Math.max(...list.map((p) => p.x / 2 + p.w))) + 2;
      const tall = Math.max(...list.map((p) => p.h)), back = Math.max(...list.map((p) => p.d)), cv = document.createElement('canvas');
      cv.width = right - left; cv.height = tall;
      const x = cv.getContext('2d');
      for (const p of list.sort((a, b) => a.d - b.d)) art(x, p, p.x / 2 - left, tall - p.h);
      stand(cv, left * 2, back, cv.width * 2, tall * 2);
    }
    for (const q of near) {
      const p = { ...q, k: kinds[q.k] || q.k }, cw = p.w + 6, cv = document.createElement('canvas');
      cv.width = cw; cv.height = p.h;
      art(cv.getContext('2d'), p, cw / 2, 0);
      stand(cv, p.x - cw, p.d, cw * 2, p.h * 2);
    }
    if (hot.length) {
      let last = -1;
      every(50, () => {
        const st = Math.floor(performance.now() / 250);
        if (st === last) return;
        last = st;
        for (const { x, px } of hot) for (const [u, v] of px) { x.fillStyle = C[((v + st) % 6 + 6) % 6 < 2 ? 7 : 8]; x.fillRect(u, v, 1, 1); }
      });
    }
  }

  /* Where the stage's left and right edges fall, as plane x (map units), on an upright plane at
     `depth`, `z` map units up. Entrances start past these so they come in from off screen on any
     stage size or camera, and planes that things slide in on must reach past them too. */
  function span(sc, depth, z = 0) {
    const el = document.createElement('div');
    sc.stand(el, -4000, depth, 9000, 2);
    el.style.transform = `translateZ(${z}px) rotateX(-90deg)`;
    const r = el.getBoundingClientRect(), s = sc.stage.getBoundingClientRect(), k = 9000 / r.width;
    el.remove();
    return [-4000 + (s.left - r.left) * k, -4000 + (s.right - r.left) * k];
  }

  /* ---------- upright planes ---------- */
  /* An upright canvas standing at `depth`, w x h scene px of `u` map units each, its left edge at
     scene x x0 and plane x `left`, from the sky (scene y 0) down to the ground (scene y h). Draw
     the action on it in scene px: { cv, g, p: pen, clear(), art(img, x, y, k = 1): img drawn at
     scene (x, y), each of its pixels k canvas px (1 for art made at 2 map units a pixel, such as
     the slingshot's; u / 2 for art made in scene px) }. */
  function plane(sc, { left, x0 = 0, depth, w, h, u = 4 }) {
    const cv = document.createElement('canvas'), s = u / 2;
    cv.width = w * s; cv.height = h * s;
    sc.stand(cv, left, depth, w * u, h * u);
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    return {
      cv, g, x0, w, h, p: pen(g, sc.C, x0, 0, s),
      clear: () => g.clearRect(0, 0, cv.width, cv.height),
      art: (img, x, y, k = 1) => g.drawImage(img, (x - x0) * s, y * s, img.width * k, img.height * k),
    };
  }
  /* A scene point on an upright plane, in the stage's own px (the screen may be scaled), for
     putting HTML (card faces, labels) over the scene where something stands. */
  function toStage(sc, pln, x, y) {
    const { stage } = sc, s = stage.getBoundingClientRect(), r = pln.cv.getBoundingClientRect(), z = s.width / stage.offsetWidth;
    return [(r.left - s.left + (x - pln.x0) / pln.w * r.width) / z - stage.clientLeft, (r.top - s.top + y / pln.h * r.height) / z - stage.clientTop];
  }

  /* ---------- props ---------- */
  /* The Brimstone Slingshot, as on the map (RunMap.forkArt / pouchArt), on 4-unit planes:
     fork(pln, fx, gy) stands the fork with its foot at scene (fx, gy), behind you; front(pln, fx,
     gy, dx, dy) draws the pouch (drawn back dx, dy from rest) and both bands in front of you, tied
     on at each tip knob and running to the pouch's tie loops, 2 px thick so they stay solid through
     the CRT's scanlines. rest(gy): the scene y your feet stand at in the pouch at rest. */
  function slingshot(sc) {
    const forkCv = RunMap.forkArt(sc.C), pouchCv = RunMap.pouchArt(sc.C);
    const TIP = 13, TIP_UP = 41, TIE = 9, REST_UP = 28; // scene px: the tips either side of the foot and their height; the tie loops; your feet over the foot at rest
    const band = ({ R }, x0, y0, x1, y1) => {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let i = 0; i <= n; i++) R(Math.round(x0 + (x1 - x0) * i / n) - 1, y0 + (y1 - y0) * i / n, 2, 1, 1);
    };
    return {
      rest: (gy) => gy - REST_UP,
      fork: (pln, fx, gy) => pln.art(forkCv, fx - 15, gy - 42),
      front(pln, fx, gy, dx = 0, dy = 0) {
        const ux = fx + dx, uy = gy - REST_UP + 1 + dy;
        pln.art(pouchCv, ux - 9.5, uy - 1);
        for (const s of [-1, 1]) band(pln.p, fx + s * TIP, gy - TIP_UP, ux + s * TIE, uy);
      },
    };
  }

  /* A card back, 15 x 22 scene px (the shape of a card face): an ink edge, a pale border (gold for
     the rare), a mid field with a diamond. It turns over by narrowing about its middle through
     TURN's widths, a frame each; then the card's face opens from narrow (.dr-pick in style.css). */
  const CARD = { W: 15, H: 22, TURN: [15, 9, 3] };
  function cardArt({ R }, x, y, rare, w = CARD.W) {
    const { W, H } = CARD;
    x += (W - w) >> 1;
    R(x, y, w, H, 1);
    if (w > 2) R(x + 1, y + 1, w - 2, H - 2, rare ? 8 : 6);
    if (w > 4) R(x + 2, y + 2, w - 4, H - 4, 3);
    if (w < W) return;
    R(x + 1, y + 1, 1, H - 2, 7);
    const k = rare ? 8 : 7;
    R(x + 6, y + 8, 3, 6, k); R(x + 5, y + 9, 5, 4, k); R(x + 7, y + 7, 1, 8, k);
  }

  return { mount, figure, land, SQUASH, play, ground, ruins, span, plane, toStage, slingshot, CARD, cardArt, pen, bay, lvl, cl, rgb };
})();
