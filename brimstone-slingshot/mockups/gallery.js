'use strict';
/* Brimstone Carnival Shooting Gallery mockup (builder.html?mockup=gallery). Your figurine lands in the
   slingshot at the very front; far behind it, framed in the middle of the screen, a carnival booth
   holds two tiers of big target cards (Zorf, Prego, Carnivore) gliding past like gallery ducks: the
   second tier well back behind the first, up a deep shelf, under a striped awning with a bulb chase.
   Five shots: you are flung at a card, knock it back on its hinge, tumble down, scurry back and hop on
   again. Knock down three of one card and it's yours. People wander the dirt either side (Casino.patrons).
   Built into the game as js/gallery.js (Run.gallery, ?scenetest=gallery).
   The place is the builder's: the carnival preset (the midway floor, the rides under the open sky).
   Scene px, 4 map units each; the booth's planes are 150 tall, so their ground is scene y 150. */
(() => {
  const { U, GY, mx } = Builder;
  const { cl, CARD } = Scene;
  const H = 150;                                   // the booth planes' height (scene px): ground at y H
  const FX = 75, REST_UP = 28;                     // the slingshot's foot, and your feet over it in the pouch
  // The gallery's cards are twice CARD's size (they stand far off), drawn from CARD-sized faces doubled.
  const K = 2, CW = CARD.W * K, CH = CARD.H * K;
  // Fitted to the camera by mount (fit): the slingshot stands right at the front of the screen, so every
  // shot carries a long way back, and the booth, framed by its pillars, takes the middle of the screen,
  // leaving room either side for the props framing it. Until then, the bowling camera's values.
  let D_ME = 462, D_SLING = D_ME - 16, D_FRONT = D_ME + 8;
  let WX0 = -50, WX1 = 200, N = 9, LOOP = 0;       // the booth's window (scene x); cards on a gliding tier, and its loop
  const D_POST = 180, D_WALL = 22, D_LAND = 206;  // the booth stands far back, for a long throw
  const ROWS = [ // depth, rail height, glide (px a second), riser tone, which card comes first
    { d: 170, base: 8, v: 9, tone: 6, first: 0 },
    { d: 40, base: 16, v: -7, tone: 4, first: 2 }, // well back behind the first, low enough that the front cards hide its foot
  ];
  const WALL = ROWS[1].base + 4 + CH + 6;          // the back wall's top (scene px up), just over the back cards
  const KINDS = ['zorf', 'prego', 'carnivore'];
  const SP = CW + 22;                              // a tier's card spacing: plenty of air between cards
  function fit(sc) {
    // Where the ground meets the stage's bottom edge, by halving: the slingshot stands just in from it.
    const at = (depth) => { const el = sc.stand(document.createElement('div'), mx(FX), depth, 2, 2), r = el.getBoundingClientRect(), s = sc.stage.getBoundingClientRect(); el.remove(); return (r.bottom - s.top) / s.height; };
    let lo = 300, hi = 1200;
    for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (at(m) < 1) lo = m; else hi = m; }
    D_ME = Math.round(lo - 34); D_SLING = D_ME - 16; D_FRONT = D_ME + 8;
    const [l, r] = Scene.span(sc, D_POST).map((x) => (x - 720) / U + 75);
    const half = Math.round((r - l) * 0.27); WX0 = FX - half; WX1 = FX + half;
    N = Math.ceil((WX1 - WX0) / SP) + 3; N += (3 - N % 3) % 3; // a whole number of each kind, so the loop has no seam
    LOOP = SP * N;
    for (const R of ROWS) R.kinds = Array.from({ length: N }, (_, i) => (i + R.first) % 3);
  }
  const DROP = [22, 14, 7, 3];                     // a card's height (in CARD px) as it tips back, 7 a second; 3 is down
  const LANDED = Builder.LAND.ms / 1000 + Scene.SQUASH.ms / 1000, START = LANDED + 0.5;
  const SHOT = 4.6, PULL = 0.5, FLY = 0.95, BOUNCE = 0.45, SCURRY = 0.9, HOP = 0.3;
  // Each shot aims for a card of its kind near x (scene x) when it lands; the fourth falls short.
  const SHOTS = [{ row: 0, kind: 0, x: 30 }, { row: 1, kind: 1, x: 115 }, { row: 1, kind: 0, x: 60 }, { miss: true, x: 110 }, { row: 0, kind: 0, x: 95 }];
  const END = START + SHOTS.length * SHOT + 1.4;
  const mod = (a, m) => ((a % m) + m) % m;
  const lerp = (a, b, u) => a + (b - a) * u;

  /* ---------- the timeline ---------- */
  let edge = Infinity;
  const cardX = (r, i, t) => WX0 - SP + mod(i * SP + ROWS[r].v * t, LOOP);
  const cardFoot = (r) => H - ROWS[r].base - 4;    // the scene y a tier's cards stand on (over their posts)
  // Where each shot lands: the card of its kind nearest the shot's x that's in the window when you hit.
  const plan = [];
  function replan() {
    plan.length = 0;
    const down = new Set();
    SHOTS.forEach((s, k) => {
      const t0 = START + k * SHOT, th = t0 + PULL + FLY;
      if (s.miss) { plan.push({ t0, th, miss: true, tx: s.x, td: ROWS[0].d + 3, tz: 6 * U }); return; }
      const R = ROWS[s.row];
      let best = null;
      R.kinds.forEach((kd, i) => {
        if (kd !== s.kind || down.has(s.row + ':' + i)) return;
        const x = cardX(s.row, i, th) + CW / 2;
        if (x < WX0 + CW / 2 + 4 || x > WX1 - CW / 2 - 4) return;
        if (!best || Math.abs(x - s.x) < Math.abs(best.tx - s.x)) best = { i, tx: x };
      });
      if (!best) best = { i: R.kinds.indexOf(s.kind), tx: cardX(s.row, R.kinds.indexOf(s.kind), th) + CW / 2 };
      down.add(s.row + ':' + best.i);
      plan.push({ t0, th, row: s.row, i: best.i, kind: s.kind, tx: best.tx, td: R.d - 2, tz: (R.base + 4 + CH / 2) * U });
    });
  }

  function at(t) {
    const S = { fx: FX, depth: D_ME, z: REST_UP * U, rot: 0, sx: 1, sy: 1, sl: { dx: 0, dy: 0 }, t, hits: [], shots: 0, prize: -1 };
    if (t < LANDED) {
      const L = Builder.land(t, { tx: FX, depth: D_ME, edge });
      Object.assign(S, { fx: L.fx, depth: L.depth, z: (GY - L.feet + REST_UP) * U, rot: L.rot, sx: L.sx, sy: L.sy });
      if (L.sx !== 1) S.sl.dy = 1;
    }
    for (const p of plan) {
      if (t >= p.t0 + PULL) S.shots++;
      if (t >= p.th && !p.miss) S.hits.push(p);
    }
    const k = Math.floor((t - START) / SHOT), p = plan[k];
    if (p && t >= START) {
      const s = t - p.t0, aim = cl(Math.round((p.tx - FX) / 14), -5, 5);
      if (s < PULL) { // drawn back toward you in steps, aimed a little the other way
        const st = Math.min(3, Math.floor(s * 6)), d = [0, 2, 4, 5][st];
        S.sl = { dx: -Math.round(aim * st / 3), dy: d };
        S.fx = FX + S.sl.dx; S.z = (REST_UP - d) * U; S.depth = D_ME + d * 2;
      } else if (s < PULL + FLY) { // flung at the card, tumbling in quarter turns
        const u = (s - PULL) / FLY, x0 = FX - aim, z0 = (REST_UP - 5) * U, d0 = D_ME + 10;
        S.fx = lerp(x0, p.tx, u); S.depth = lerp(d0, p.td, u); S.z = lerp(z0, p.tz, u) + 4 * 190 * u * (1 - u);
        S.rot = Math.floor(u * 4) % 4;
        S.sl.dy = s < PULL + 0.07 ? -2 : 0; // the pouch snaps past rest for a frame
      } else if (s < PULL + FLY + BOUNCE) { // knocked back off it, down to the ground in front of the booth
        const u = (s - PULL - FLY) / BOUNCE, bx = p.tx + (p.tx < FX ? -6 : 6);
        S.fx = lerp(p.tx, bx, u); S.depth = p.td + (D_LAND - p.td) * Math.sqrt(u); S.z = (1 - u) * p.tz + 4 * 24 * u * (1 - u);
        S.rot = (4 - Math.floor(u * 4)) % 4;
      } else {
        const bx = p.tx + (p.tx < FX ? -6 : 6), s2 = s - PULL - FLY - BOUNCE, hx = FX + 18;
        if (s2 < 0.12) { S.fx = bx; S.depth = D_LAND; S.z = 0; S.sx = Scene.SQUASH.sx; S.sy = Scene.SQUASH.sy; }
        else if (s2 < 0.12 + SCURRY) { // scurry back to the slingshot, little stepped hops, facing the way it runs
          const u = (s2 - 0.12) / SCURRY;
          S.fx = lerp(bx, hx, u); S.depth = lerp(D_LAND, D_ME + 6, u); S.z = (Math.floor(s2 * 9) % 2) * U;
          S.sx = hx < bx ? -1 : 1;
        } else if (s2 < 0.12 + SCURRY + HOP) { // and hop on
          const u = (s2 - 0.12 - SCURRY) / HOP;
          S.fx = lerp(hx, FX, u); S.depth = lerp(D_ME + 6, D_ME, u); S.z = (REST_UP * u + 4 * 10 * u * (1 - u)) * U;
        } else if (s2 < 0.12 + SCURRY + HOP + 0.12) { S.sx = Scene.SQUASH.sx; S.sy = Scene.SQUASH.sy; S.sl.dy = 1; }
      }
    }
    // Three of a kind: the prize card rises over the booth in steps.
    const won = KINDS.findIndex((_, kd) => S.hits.filter((h) => h.kind === kd).length >= 3);
    const tp = START + SHOTS.length * SHOT;
    if (won >= 0 && t >= tp - 0.3) { S.prize = Math.min(6, Math.floor((t - tp + 0.3) * 7)); S.won = won; }
    return S;
  }

  /* ---------- the art ---------- */
  function mount({ sc, plane, fig, shadow, edge: e }) {
    edge = e;
    fit(sc); replan();
    const C = sc.C, P2 = (cv, x0) => Scene.pen(cv.getContext('2d'), C, x0, 0, 2);
    const tall = (depth, o = {}) => plane(depth, { h: H, left: mx(WX0 - 40), x0: WX0 - 40, w: WX1 - WX0 + 80, ...o });
    const offscreen = (pl, fn) => { const cv = document.createElement('canvas'); cv.width = pl.cv.width; cv.height = pl.cv.height; fn(P2(cv, pl.x0)); return cv; };
    // The three cards' faces (Scene.cardFace with their own sprites), CARD sized at 2 canvas px a scene px; drawn doubled.
    const faceCv = KINDS.map((name) => {
      const cv = document.createElement('canvas'), g = cv.getContext('2d');
      cv.width = CARD.W * 2; cv.height = CARD.H * 2;
      Scene.cardFace(Scene.pen(g, C, 0, 0, 2), 0, 0, CARD.W, { art: Scene.spriteArt(name), pl: { art: (img, x, y) => g.drawImage(img, Math.round(x * 2), Math.round(y * 2)) }, rarity: rarityOf(CARDS[name]) });
      return cv;
    });
    const icon = KINDS.map((n) => Scene.spriteArt(n));

    // The back wall, in the awning's shade: pale stripes, the striped awning, the sign with the score.
    const wall = tall(D_WALL);
    const wallBg = offscreen(wall, ({ R, P }) => {
      const y0 = H - WALL;
      R(WX0 - 12, y0, WX1 - WX0 + 24, WALL, 1);
      for (let x = WX0 - 11; x < WX1 + 11; x++) R(x, y0 + 1, 1, WALL - 1, mod(x - WX0, 16) < 8 ? 6 : 5);
      for (let x = WX0 - 11; x < WX1 + 11; x++) for (let y = y0 + 1; y < y0 + 9; y++) if (Scene.bay(x, y) < (y0 + 9 - y) * 2) P(x, y, 4); // the awning's shadow along its top
      const ay = y0 - 16;
      R(WX0 - 16, ay, WX1 - WX0 + 32, 14, 1);
      for (let x = WX0 - 15; x < WX1 + 15; x++) R(x, ay + 1, 1, 12, mod(x - WX0, 12) < 6 ? 8 : 7);
      for (let x = WX0 - 15; x < WX1 + 15; x++) {
        const dip = [1, 2, 3, 3, 2, 1][mod(x - WX0, 6)];
        R(x, ay + 13, 1, dip, mod(x - WX0, 12) < 6 ? 8 : 7); P(x, ay + 13 + dip, 1);
      }
      R(WX0 - 15, ay + 1, WX1 - WX0 + 30, 1, 7); // lit along its top
      const sy = ay - 4;
      R(FX - 50, sy, 100, 15, 1); R(FX - 49, sy + 1, 98, 13, 7); R(FX - 49, sy + 1, 98, 1, 6);
      R(FX - 1, sy - 4, 3, 4, 1); R(FX - 3, sy - 7, 7, 3, 1); R(FX - 2, sy - 6, 5, 1, 8); // a little brimstone finial
    });
    const signY = H - WALL - 16 - 5; // the sign set into the awning

    // A tier: the riser under its rail (static), its gliding cards and flame skirt, and the booth's side
    // walls at that depth (static, over the cards' ends). Side walls at both tiers and the wall make the
    // booth's sides step back with them.
    const rows = ROWS.map((R, r) => {
      const pl = tall(R.d);
      const bg = offscreen(pl, ({ R: F, P }) => {
        const y = H - R.base;
        F(WX0, y, WX1 - WX0, R.base, R.tone); F(WX0, y, WX1 - WX0, 1, 1); F(WX0, y + 1, WX1 - WX0, 1, 7);
        if (r === 0) { // the counter: a gold band of stars
          F(WX0, y + 2, WX1 - WX0, 5, 8); F(WX0, y + 2, WX1 - WX0, 1, 1); F(WX0, y + 6, WX1 - WX0, 1, 1);
          for (let x = WX0 + 6; x < WX1 - 3; x += 12) F(x, y + 4, 1, 1, 7);
        } else { // the back riser, in the front tier's shadow: darker toward its foot
          for (let x = WX0; x < WX1; x++) for (let yy = y + 2; yy < H; yy++) if (Scene.bay(x, yy) < (yy - y) * 0.8) P(x, yy, 3);
        }
      });
      const fg = offscreen(pl, ({ R: F }) => {
        const y0 = H - WALL;
        F(WX0 - 10, y0, 10, WALL, 1); F(WX0 - 9, y0 + 1, 8, WALL - 1, 4); // the left wall's face, in shade
        F(WX1, y0, 10, WALL, 1); F(WX1 + 1, y0 + 1, 8, WALL - 1, 6); F(WX1 + 1, y0 + 1, 1, WALL - 1, 7); // the right, lit
      });
      return { r, R, pl, bg, fg, key: '' };
    });
    // The tiers' tops, lying flat at each rail's height from its front back to the next riser (the
    // back wall for the last): boards lit at the front, dithering into shade toward the back, an ink
    // front edge. The deep first shelf is what puts the back tier behind the front one.
    ROWS.forEach((R, r) => {
      const back = r + 1 < ROWS.length ? ROWS[r + 1].d : D_WALL, w = WX1 - WX0, deep = Math.round((R.d - back) / 2);
      const cv = document.createElement('canvas'), { R: F, P } = Scene.pen(cv.getContext('2d'), C);
      cv.width = w * 2; cv.height = deep;
      for (let y = 0; y < deep; y++) for (let x = 0; x < cv.width; x++) {
        const f = y / deep; // 0 at the back, 1 at the front
        P(x, y, y % 8 === 3 ? 5 : Scene.bay(x, y) / 16 < f * 1.4 - 0.2 ? 7 : 5);
      }
      F(0, deep - 1, cv.width, 1, 1);
      Object.assign(cv.style, { position: 'absolute', left: mx(WX0) + 'px', top: back + 'px', width: w * U + 'px', height: R.d - back + 'px', transform: `translateZ(${R.base * U}px)`, imageRendering: 'pixelated', pointerEvents: 'none' });
      sc.pl.appendChild(cv);
    });

    // The pillars and their curtains, in front of the counter; the prize rises here too.
    const post = tall(D_POST), PT = WALL + 22;
    const postBg = offscreen(post, ({ R, P }) => {
      for (const [x, lit] of [[WX0 - 14, 0], [WX1 + 6, 1]]) {
        R(x, H - PT, 8, PT, 1); R(x + 1, H - PT + 1, 6, PT - 1, lit ? 6 : 5); R(x + 1, H - PT + 1, 2, PT - 1, 7);
        R(x - 1, H - PT - 4, 10, 5, 1); R(x, H - PT - 3, 8, 3, 8); // the cap
      }
      // Curtains: gathered at the top, tied back at the middle, flared at the floor; folds in steps.
      const tie = Math.round(PT * 0.45);
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? WX0 - 6 : WX1 + 6;
        for (let z = 2; z < PT - 2; z++) {
          const w = z > tie + 8 ? Math.round(4 + (z - tie - 8) / 5) : z > tie ? 3 : Math.round(3 + (tie - z) / 9);
          const y = H - z, xa = side < 0 ? x0 : x0 - w;
          R(xa, y, w, 1, 8);
          for (let i = 1; i < w; i += 3) P(xa + i, y, 7);
          P(side < 0 ? xa + w : xa - 1, y, 1);
        }
        R(side < 0 ? x0 : x0 - 5, H - tie - 5, 5, 2, 1); // the tie
      }
    });

    // People wandering the midway (Casino.patrons, as in the game's js/gallery.js): on the dirt either
    // side and behind the booth, never onto the booth, the boardwalk you run back along, or the slingshot.
    const view = Casino.viewOf(sc, -200, D_ME);
    const walkers = Casino.patrons(sc, view, {
      keep: [[FX, (D_WALL + D_POST) / 2, (WX1 - WX0) / 2 + 24, (D_POST - D_WALL) / 2 + 20], [FX, (D_POST + D_ME) / 2, (WX1 - WX0) / 2 + 12, (D_ME - D_POST) / 2 + 24]],
      walk: { d0: -200, d1: D_ME, edge: 12 }, n: 6,
    });
    let lastStep = performance.now();

    const sling = Scene.slingshot(sc), fork = tall(D_SLING), fr = tall(D_FRONT);
    fork.clear(); sling.fork(fork, FX, H);
    let wallKey = '', postKey = '';

    const draw = (S) => {
      const t = S.t, now = performance.now() / 1000, step4 = Math.floor(t * 4);
      shadow(S.fx, S.depth, S.z);

      // The sign: shots left (pellets) on the left; each card's icon and its three pips on the right.
      // Along the awning's hem, a bulb chase crawling 4 steps a second.
      const hitsOf = (kd) => S.hits.filter((h) => h.kind === kd).length;
      const wk = [S.shots, ...KINDS.map((_, kd) => hitsOf(kd)), step4].join();
      if (wk !== wallKey) {
        wallKey = wk; wall.clear(); wall.g.drawImage(wallBg, 0, 0);
        const { R } = wall.p;
        for (let i = 0; i < SHOTS.length; i++) { const x = FX - 45 + i * 5, y = signY + 6; R(x, y, 4, 4, 1); if (i >= S.shots) R(x + 1, y + 1, 2, 2, 8); }
        KINDS.forEach((_, kd) => {
          const x = FX - 13 + kd * 20;
          wall.art(icon[kd], x, signY + 3.5, 1);
          for (let j = 0; j < 3; j++) { R(x + 8 + j * 3, signY + 7, 3, 3, 1); R(x + 9 + j * 3, signY + 8, 1, 1, j < hitsOf(kd) ? 8 : 6); }
        });
        for (let i = 0; i * 6 < WX1 - WX0 + 28; i++) { const x = WX0 - 14 + i * 6, y = H - WALL - 2; R(x, y, 3, 3, 1); R(x + 1, y + 1, 1, 1, (i + step4) % 3 ? 5 : 7); }
      }

      // The tiers.
      for (const row of rows) {
        const { r, R: RR, pl } = row, skirt = Math.floor(t * 3) * (r % 2 ? -1 : 1);
        const cards = RR.kinds.map((kd, i) => {
          const hit = S.hits.find((h) => h.row === r && h.i === i);
          return [Math.round(cardX(r, i, t)), hit ? DROP[Math.min(3, Math.floor((t - hit.th) * 7))] : 22];
        });
        const key = cards.join('|') + skirt;
        if (key === row.key) continue;
        row.key = key;
        pl.clear(); pl.g.drawImage(row.bg, 0, 0);
        const g = pl.g, base = H - RR.base, foot = cardFoot(r);
        g.save(); g.beginPath(); g.rect((WX0 - pl.x0) * 2, 0, (WX1 - WX0) * 2, pl.cv.height); g.clip();
        const { R } = pl.p;
        cards.forEach(([x, h], i) => {
          R(x + CW / 2 - 2, foot, 4, base - foot, 1); R(x + CW / 2 - 1, foot, 2, base - foot, 6); // its post
          if (h > 3) g.drawImage(faceCv[RR.kinds[i]], (x - pl.x0) * 2, (foot - h * K) * 2, CW * 2, h * K * 2);
          else { R(x, foot - 4, CW, 4, 1); R(x + 1, foot - 3, CW - 2, 2, 6); } // down: its edge
        });
        // The flame skirt hiding the rails, flickering along in steps.
        for (let x = WX0; x < WX1; x++) {
          const fh = 4 + [0, 1, 3, 5, 3, 1, 0, 2][mod(x + skirt, 8)];
          R(x, base - fh, 1, fh, 8); R(x, base - fh, 1, 1, 1); if (fh > 5) R(x, base - fh + 1, 1, 1, 7);
        }
        g.restore();
        g.drawImage(row.fg, 0, 0);
      }

      // The people on the midway (their shadows go on the builder's shadow layer under yours).
      const nowMs = performance.now();
      walkers.step(Math.min(0.2, (nowMs - lastStep) / 1000), now);
      lastStep = nowMs;

      // The pillars, and the prize rising over the booth.
      const pk = S.prize + ':' + S.won;
      if (pk !== postKey) {
        postKey = pk; post.clear(); post.g.drawImage(postBg, 0, 0);
        if (S.prize >= 0) post.g.drawImage(faceCv[S.won], (FX - CW / 2 - post.x0) * 2, Math.round(lerp(H - 40, H - WALL - 50, S.prize / 6)) * 2, CW * 2, CH * 2);
      }

      // The pouch and its bands in front of you, and you.
      fr.clear(); sling.front(fr, FX, H, S.sl.dx, S.sl.dy);
      fig.place({ x: mx(S.fx), y: S.depth, z: S.z, rot: S.rot, sx: S.sx, sy: S.sy });
    };
    return draw;
  }

  Builder.add({ name: 'B · Midway lights', desc: 'Two tiers of big cards glide past, the back one well behind the front up a deep shelf; people wander the dirt either side. Pick the carnival preset. Built: js/gallery.js, ?scenetest=gallery.', len: END, hold: 1.2, at, mount });
})();
