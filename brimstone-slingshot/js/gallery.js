'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the Shooting Gallery (a rare stop of its own, see Run.gallery in js/run.js).
   A carnival booth out on the midway, the rides under the open sky behind it. Your figurine lands in
   a slingshot at the very front of the screen on the tail of the map's lob. Far back, framed in the
   middle of the screen, two tiers of big target cards (Zorf, Prego, Carnivore) glide past like gallery
   ducks, the second tier well behind the first. A marker sweeps the front tier, then the back one;
   FIRE flings you at whatever is under it. You knock the card back on its hinge (or miss, through
   a gap), tumble down, scurry back up the boardwalk and hop on again. Five shots; knock down three
   of one card and it's yours. People wander the dirt either side (Casino.patrons).
   Built on the scene kit (js/scene.js) and the carnival setting (js/settings.js): only the booth,
   its cards and the timelines are its own. Mocked up in mockups/gallery.js (builder.html).
   Scene px: 4 map units each; the booth's planes are H tall, so their ground is scene y H.
   ============================================================ */

const Gallery = (() => {
  const U = 4, GY = 103, H = 150;
  const mx = (x) => 720 + (x - 75) * U;   // a scene x as a plane x (map units): scene x 75 is the middle
  const FX = 75, REST_UP = 28;             // the slingshot's foot, and your feet over it in the pouch
  const LAND = { across: 80, back: 10, high: 40, ms: 700 }; // the entrance, as Bone Draft's
  const { cl, CARD } = Scene;
  // The gallery's cards are twice CARD's size (they stand far off), drawn from CARD-sized faces doubled.
  const K = 2, CW = CARD.W * K, CH = CARD.H * K;
  // Fitted to the camera by mount (fit): the slingshot stands right at the front of the screen, so every
  // shot carries a long way back, and the booth, framed by its pillars, takes the middle of the screen.
  let D_ME = 560, D_SLING = D_ME - 16, D_FRONT = D_ME + 8;
  let WX0 = -46, WX1 = 196, N = 9, LOOP = 0;       // the booth's window (scene x); cards on a tier, and its loop
  let EDGE = Infinity;
  const D_POST = 180, D_WALL = 22, D_LAND = 206;  // the pillars, the back wall, where you fall to after a shot
  const ROWS = [ // depth, rail height, glide (px a second), riser tone, which card comes first
    { d: 170, base: 8, v: 9, tone: 6, first: 0 },
    { d: 40, base: 16, v: -7, tone: 4, first: 2 }, // well back behind the first, low enough that the front cards hide its foot
  ];
  const WALL = ROWS[1].base + 4 + CH + 6;          // the back wall's top (scene px up), just over the back cards
  const KINDS = ['zorf', 'prego', 'carnivore'];     // the cards (TANK_CARDS in js/run.js; `tank` keeps them out of other pools)
  const SP = CW + 22;                              // a tier's card spacing: plenty of air between cards
  const SHOTS = 5, NEED = 3;                       // shots a visit; cards of one kind to win it
  const AIM = { hz: 0.48, edge: 8, hop: 0.187 };    // the marker's sweeps a second, how far in from the window's ends it turns, and its glide between tiers (seconds)
  const SIGN = { w: 200, h: 28, up: 16 };          // the score sign (scene px), and how far it stands up out of the awning
  const DROP = [22, 14, 7, 3];                   // a card's height (in CARD px) as it tips back, 7 a second; 3 is down
  // The people wandering the midway (Casino.patrons): over the dirt either side and behind the booth,
  // never onto the booth, the boardwalk you run back along, or the slingshot.
  const WALKERS = { n: 6, d0: -200 };
  const mod = (a, m) => ((a % m) + m) % m;
  const lerp = (a, b, u) => a + (b - a) * u;

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
    EDGE = (Scene.span(sc, D_ME, LAND.high * U)[0] - 720) / U + 75 - 24;
  }

  /* ---------- the cards and the marker ---------- */
  // Card i of tier r's left edge at glide time g (seconds the booth has been running).
  const cardX = (r, i, g) => WX0 - SP + mod(i * SP + ROWS[r].v * g, LOOP);
  // The card of tier r standing under scene x at glide time g (not one already down), or -1: a gap.
  function cardAt(r, x, g, down) {
    if (x < WX0 || x > WX1) return -1;
    for (let i = 0; i < N; i++) { const c = cardX(r, i, g); if (x >= c - 1 && x <= c + CW + 1 && !down.has(r + ':' + i)) return i; }
    return -1;
  }
  const kindOf = (r, i) => KINDS[ROWS[r].kinds[i]];
  // Where the marker is at glide time g: across the front tier left to right, a quick smooth glide up and
  // back to the back tier, across it right to left, and down again. { r: the tier a shot goes to (the
  // nearer one mid-glide), x, k: how far it is from the front tier (0) to the back (1) }.
  function aimAt(g) {
    const S = 1 / AIM.hz, T = AIM.hop, q = mod(g, 2 * (S + T)), a = WX0 + CW / 2 + AIM.edge, b = WX1 - CW / 2 - AIM.edge;
    const ease = (u) => u * u * (3 - 2 * u);
    let x, k;
    if (q < S) { x = lerp(a, b, q / S); k = 0; }
    else if (q < S + T) { x = b; k = ease((q - S) / T); }
    else if (q < 2 * S + T) { x = lerp(b, a, (q - S - T) / S); k = 1; }
    else { x = a; k = 1 - ease((q - 2 * S - T) / T); }
    return { r: k < 0.5 ? 0 : 1, x, k };
  }

  /* ---------- the timelines ---------- */
  /* The entrance and the wait: { fx, depth, z (map units), rot, sx, sy, sl: the pouch's pull { dx, dy } }. */
  const LANDED = LAND.ms / 1000 + Scene.SQUASH.ms / 1000, REST = LANDED + 0.1;
  const rest = () => ({ fx: FX, depth: D_ME, z: REST_UP * U, rot: 0, sx: 1, sy: 1, sl: { dx: 0, dy: 0 } });
  function at(t) {
    const S = rest();
    if (t < LANDED) {
      const L = Scene.land(cl(t * 1000 / LAND.ms), LAND.high * U);
      S.fx = FX - Math.max(LAND.across, FX - EDGE) * L.k;
      S.depth = D_ME - LAND.back * U * L.k;
      S.z = REST_UP * U + L.z;
      S.rot = L.rot;
      if (!L.k) { S.sx = Scene.SQUASH.sx; S.sy = Scene.SQUASH.sy; S.sl.dy = 1; }
    }
    return S;
  }
  const ENTER_CUES = [[LAND.ms / 1000, 'land']];

  /* A shot at scene x tx on tier r: { at(t), HIT (when you get there), END, cues(hit) }. The pouch draws
     back toward you in steps, aimed a little the other way; you fly a high lob at the card, tumbling in
     quarter turns, getting back over the front tier early while still high (so a back-tier shot never
     passes through the front cards). Off a front card you bounce down to the ground in front of the
     booth. Off a back card you drop onto the front tier's shelf, between the two rows (the front cards
     hide your feet), scurry along it to its nearer end, and hop high over the front tier down onto the
     boardwalk. Either way you land with a squash, scurry back up the boardwalk in quick stepped hops,
     facing the way you run, and hop on (a squash). */
  const PULL = 0.5, FLY = 0.95, BOUNCE = 0.45, SCURRY = 0.9, HOP = 0.3;
  const D_SHELF = ROWS[0].d - 60, SHELF_Z = ROWS[0].base * U; // where you drop to off a back card: well behind the front cards, on their shelf
  const ALONG = 140, OVER = 0.55, OVER_H = 280;  // along the shelf (scene px a second); the hop over the front tier (seconds, map units high)
  function shot(tx, r) {
    const R = ROWS[r], back = r > 0, td = R.d + 3, tz = (R.base + 4 + CH / 2) * U, aim = cl(Math.round((tx - FX) / 14), -5, 5);
    const side = tx < FX ? -1 : 1, bx = back ? tx : tx + side * 6, ex = back ? (side < 0 ? WX0 + 12 : WX1 - 12) : bx, hx = FX + 18;
    const HIT = PULL + FLY, DOWN = HIT + BOUNCE;
    const OFF = back ? DOWN + 0.12 + Math.max(0.2, Math.abs(ex - bx) / ALONG) : DOWN, DOWN2 = back ? OFF + OVER : DOWN;
    const BACK = DOWN2 + 0.12 + SCURRY, ON = BACK + HOP, END = ON + 0.12;
    const squash = (S) => { S.sx = Scene.SQUASH.sx; S.sy = Scene.SQUASH.sy; };
    function atS(t) {
      const S = rest();
      if (t < PULL) {
        const st = Math.min(3, Math.floor(t * 6)), d = [0, 2, 4, 5][st];
        S.sl = { dx: -Math.round(aim * st / 3), dy: d };
        S.fx = FX + S.sl.dx; S.z = (REST_UP - d) * U; S.depth = D_ME + d * 2;
      } else if (t < HIT) {
        const u = (t - PULL) / FLY, x0 = FX - aim, z0 = (REST_UP - 5) * U, d0 = D_ME + 10;
        S.fx = lerp(x0, tx, u); S.depth = lerp(d0, td, 1 - (1 - u) ** 2); S.z = lerp(z0, tz, u) + 4 * 190 * u * (1 - u);
        S.rot = Math.floor(u * 4) % 4;
        if (t < PULL + 0.07) S.sl.dy = -2; // the pouch snaps past rest for a frame
      } else if (t < DOWN) {
        const u = (t - HIT) / BOUNCE;
        if (back) { S.fx = tx; S.depth = lerp(td, D_SHELF, u); S.z = lerp(tz, SHELF_Z, u * u) + 4 * 16 * u * (1 - u); }
        else { S.fx = lerp(tx, bx, u); S.depth = td + (D_LAND - td) * Math.sqrt(u); S.z = (1 - u) * tz + 4 * 24 * u * (1 - u); }
        S.rot = (4 - Math.floor(u * 4)) % 4;
      } else if (t < DOWN + 0.12) {
        Object.assign(S, back ? { fx: bx, depth: D_SHELF, z: SHELF_Z } : { fx: bx, depth: D_LAND, z: 0 });
        squash(S);
      } else if (t < OFF) { // along the shelf
        const u = (t - DOWN - 0.12) / (OFF - DOWN - 0.12);
        S.fx = lerp(bx, ex, u); S.depth = D_SHELF; S.z = SHELF_Z + (Math.floor((t - DOWN) * 12) % 2) * U;
        S.sx = ex < bx ? -1 : 1;
      } else if (t < DOWN2) { // and over the front tier
        const u = (t - OFF) / OVER;
        S.fx = ex; S.depth = lerp(D_SHELF, D_LAND, u); S.z = lerp(SHELF_Z, 0, u) + 4 * OVER_H * u * (1 - u);
      } else if (t < DOWN2 + 0.12) {
        Object.assign(S, { fx: ex, depth: D_LAND, z: 0 });
        squash(S);
      } else if (t < BACK) {
        const u = (t - DOWN2 - 0.12) / SCURRY;
        S.fx = lerp(ex, hx, u); S.depth = lerp(D_LAND, D_ME + 6, u); S.z = (Math.floor((t - DOWN2) * 12) % 2) * U; // quick little steps
        S.sx = hx < ex ? -1 : 1;
      } else if (t < ON) {
        const u = (t - BACK) / HOP;
        S.fx = lerp(hx, FX, u); S.depth = lerp(D_ME + 6, D_ME, u); S.z = (REST_UP * u + 4 * 10 * u * (1 - u)) * U;
      } else { squash(S); S.sl.dy = 1; }
      return S;
    }
    const cues = (hit) => [[0, 'vsPull'], [PULL, 'twang'], [HIT, hit ? 'hit' : 'place'], ...(hit ? [[HIT + 0.15, 'pins']] : []), [DOWN, 'land'], ...(back ? [[DOWN2, 'land']] : []), [ON, 'land']];
    return { at: atS, HIT, END, cues };
  }

  /* ---------- the stage ---------- */
  /* Build the gallery in `stage` with the ante's heat (0..2). onFire() runs when the scene is clicked.
     Returns draw(state) for at()'s and shot()'s states, with:
       draw.alive(), draw.glide(): the booth's clock (seconds), draw.aim(): the marker now ({ r, x }),
       draw.down: the cards down ('r:i' -> the glide time each was hit, so it tips back from then),
       draw.st: { aiming (the marker shows), shots (used), won (a kind's index, or -1) },
       draw.rise(now, done): the won card rising over the booth in steps, then done(),
       draw.toPrize(x, y): a point on the prize card (CARD px from its top left) in stage px, for its face. */
  function mount(stage, heat, onFire = () => {}) {
    const sc = Scene.mount(stage, { rows: 860, top: 300 }); // the hand scenes' camera, pulled back to take in the booth and the sky
    fit(sc);
    const C = sc.C, P2 = (cv, x0) => Scene.pen(cv.getContext('2d'), C, x0, 0, 2);
    // The midway: boards in front of the booth, dirt either side, the rides under the open sky.
    const view = Casino.viewOf(sc, WALKERS.d0, D_ME), far = view.xs(WALKERS.d0);
    const gnd = Scene.setting(sc, 'carnival', {
      heat, horizon: 'low', critters: [], effects: [],
      over: { x0: mx(far[0]), y0: WALKERS.d0 - 10, w: Math.ceil((far[1] - far[0]) * U), h: D_FRONT + 10 - WALKERS.d0 },
    });
    const plane = (depth) => Scene.plane(sc, { left: mx(WX0 - 40), x0: WX0 - 40, depth, w: WX1 - WX0 + 80, h: H });
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
    const wall = plane(D_WALL);
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
      // The score sign, standing up out of the awning: big enough to read on a phone. A divider after the shots.
      const sy = ay - SIGN.up;
      R(FX - SIGN.w / 2, sy, SIGN.w, SIGN.h, 1); R(FX - SIGN.w / 2 + 1, sy + 1, SIGN.w - 2, SIGN.h - 2, 7); R(FX - SIGN.w / 2 + 1, sy + 1, SIGN.w - 2, 1, 6);
      R(FX - 46, sy + 4, 2, SIGN.h - 8, 1);
      R(FX - 1, sy - 4, 3, 4, 1); R(FX - 3, sy - 7, 7, 3, 1); R(FX - 2, sy - 6, 5, 1, 8); // a little brimstone finial
    });
    const signY = H - WALL - 16 - SIGN.up; // the sign's top

    // A tier: the riser under its rail (static), its gliding cards and the flame skirt, and the
    // booth's side walls at that depth (static, over the cards' ends), so the sides step back with the tiers.
    const rows = ROWS.map((R, r) => {
      const pl = plane(R.d);
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
    const mk = plane(ROWS[0].d + 1); // the marker's (it moves in depth with the marker)
    mk.key = '-';
    // Curtains closing off the booth's open sides, from the pillars back to the back wall: a slice every
    // few map units, each a narrow upright strip, so together they read as one drape running back (as the
    // spires' bands do). Alternate slices are lit folds, so the folds run back along it; the left drape is
    // in shade, the right lit. A dark hem along the floor, a gold-and-ink valance along the top.
    for (let d = D_POST - 4, i = 0; d > D_WALL + 1; d -= 6, i++) {
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? WX0 - 12 : WX1, sl = Scene.plane(sc, { left: mx(x0), x0, depth: d, w: 12, h: H }), { R } = sl.p, top = H - WALL - 12;
        const fold = i % 3 === 0 ? (side < 0 ? 5 : 7) : 8;
        R(x0, top, 12, H - top, fold);
        R(x0, top, 12, 4, 1); R(x0, top + 1, 12, 2, 8); // the valance
        R(x0, H - 3, 12, 3, side < 0 ? 3 : 4); R(x0, H - 1, 12, 1, 1); // the hem
      }
    }
    // The tiers' tops, lying flat at each rail's height from its front back to the next riser (the back
    // wall for the last): boards lit at the front, dithering into shade toward the back, an ink front edge.
    ROWS.forEach((R, r) => {
      const back = r + 1 < ROWS.length ? ROWS[r + 1].d : D_WALL, w = WX1 - WX0, deep = Math.round((R.d - back) / 2);
      const cv = document.createElement('canvas'), { R: F, P } = Scene.pen(cv.getContext('2d'), C);
      cv.width = w * 2; cv.height = deep;
      for (let y = 0; y < deep; y++) for (let x = 0; x < cv.width; x++) P(x, y, y % 8 === 3 ? 5 : Scene.bay(x, y) / 16 < y / deep * 1.4 - 0.2 ? 7 : 5);
      F(0, deep - 1, cv.width, 1, 1);
      Object.assign(cv.style, { position: 'absolute', left: mx(WX0) + 'px', top: back + 'px', width: w * U + 'px', height: R.d - back + 'px', transform: `translateZ(${R.base * U}px)`, imageRendering: 'pixelated', pointerEvents: 'none' });
      sc.pl.appendChild(cv);
    });
    // Your contact shadow on the front tier's shelf, while you're over it (a back-tier shot): a clear canvas
    // lying just above the shelf, as the ground's own shadows lie just above it.
    const shelf = document.createElement('canvas'), SD0 = ROWS[1].d, sw = (WX1 - WX0) * 2, sdh = Math.round((ROWS[0].d - SD0) / 2);
    shelf.width = sw; shelf.height = sdh;
    Object.assign(shelf.style, { position: 'absolute', left: mx(WX0) + 'px', top: SD0 + 'px', width: sw * 2 + 'px', height: sdh * 2 + 'px', transform: `translateZ(${SHELF_Z + 1}px)`, imageRendering: 'pixelated', pointerEvents: 'none' });
    sc.pl.appendChild(shelf);
    const sg = shelf.getContext('2d');
    let shelfKey = '';
    const shelfShadow = (S) => {
      const on = S.depth > SD0 && S.depth < ROWS[0].d && S.z >= SHELF_Z - 1 && S.fx > WX0 && S.fx < WX1;
      const cx = (mx(S.fx) - mx(WX0)) / 2 + 2, cy = (S.depth - SD0) / 2 + 1, r = Math.max(2.5, 6 - (S.z - SHELF_Z) / 80);
      const key = on ? [Math.round(cx), Math.round(cy), Math.round(r * 2)].join() : '';
      if (key === shelfKey) return;
      shelfKey = key;
      sg.clearRect(0, 0, sw, sdh);
      if (!on) return;
      const rx = r * 1.3, ry = r * 0.5;
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const a = (x - cx) / rx, b = (y - cy) / ry;
        if (a * a + b * b < 1) { sg.fillStyle = C[Scene.bay(x, y) < 8 ? 3 : 4]; sg.fillRect(x, y, 1, 1); }
      }
    };

    // The pillars and their curtains, in front of the counter; the prize rises here too.
    const post = plane(D_POST), PT = WALL + 22;
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
    // The prize: the won card, rising from over the counter to over the awning in PRIZE_STEPS steps.
    const PRIZE_STEPS = 6, PX = FX - CW / 2, prizeY = (s) => Math.round(lerp(H - 40, H - WALL - 56, s / PRIZE_STEPS));

    // The people on the midway.
    const keep = [
      [FX, (D_WALL + D_POST) / 2, (WX1 - WX0) / 2 + 24, (D_POST - D_WALL) / 2 + 20], // the booth
      [FX, (D_POST + D_ME) / 2, (WX1 - WX0) / 2 + 12, (D_ME - D_POST) / 2 + 24],   // the boardwalk you run back along, and the slingshot
    ];
    const walkers = Casino.patrons(sc, view, { keep, walk: { d0: WALKERS.d0, d1: D_ME, edge: 12 }, n: WALKERS.n });

    const sling = Scene.slingshot(sc), fork = plane(D_SLING), fr = plane(D_FRONT), fig = Scene.figure(sc, { s: U });
    sling.fork(fork, FX, H);
    // Clicking the scene fires too.
    stage.addEventListener('click', (e) => { if (!e.target.closest('.sc-faces')) onFire(); });

    const t0 = performance.now(), glide = () => (performance.now() - t0) / 1000;
    const down = new Map(), st = { aiming: false, shots: 0, won: -1 };
    let prize = -1, wallKey = '', postKey = '', you = null;
    const downNow = (g) => KINDS.map((_, kd) => [...down].filter(([k, gk]) => gk <= g && ROWS[+k[0]].kinds[+k.slice(2)] === kd).length);

    // Every contact shadow on the floor: the walkers' and yours (smaller the higher you are).
    const shadows = () => {
      gnd.clear();
      for (const w of walkers) gnd.shade(mx(w.x) + 4 * w.k, w.d + 2, 6 * 1.3 * w.k, 6 * 0.5 * w.k);
      if (you) { const r = Math.max(2.5, 6 - you.z / 80); gnd.shade(mx(you.x) + 4, you.d + 2, r * 1.3, r * 0.5); }
    };

    // The booth's own motion, on its own clock: the cards gliding and tipping back, the marker, the bulbs, the sign.
    function tick() {
      const g = glide(), step4 = Math.floor(g * 4), aim = st.aiming ? aimAt(g) : null, tally = downNow(g);
      const wk = [st.shots, ...tally, step4].join();
      if (wk !== wallKey) {
        wallKey = wk; wall.clear(); wall.g.drawImage(wallBg, 0, 0);
        const { R } = wall.p;
        // A pip, 7 scene px: ink-edged, gold (lit on its upper left) when full, pale when empty.
        const pip = (x, y, full) => { R(x, y, 7, 7, 1); R(x + 1, y + 1, 5, 5, full ? 8 : 6); if (full) R(x + 1, y + 1, 2, 2, 7); };
        for (let i = 0; i < SHOTS; i++) pip(FX - 94 + i * 9, signY + 10, i >= st.shots); // shots left
        KINDS.forEach((_, kd) => { // each card's icon at full size, and its three pips
          const x = FX - 40 + kd * 46;
          wall.art(icon[kd], x, signY + 6, 2);
          for (let j = 0; j < NEED; j++) pip(x + 18 + j * 8, signY + 10, j < tally[kd]);
        });
        // A bulb chase along the awning's hem, crawling 4 steps a second.
        for (let i = 0; i * 6 < WX1 - WX0 + 28; i++) { const x = WX0 - 14 + i * 6, y = H - WALL - 2; R(x, y, 3, 3, 1); R(x + 1, y + 1, 1, 1, (i + step4) % 3 ? 5 : 7); }
      }
      for (const row of rows) {
        const { r, R: RR, pl } = row, skirt = Math.floor(g * 3) * (r % 2 ? -1 : 1);
        const cards = RR.kinds.map((kd, i) => {
          const gk = down.get(r + ':' + i);
          return [Math.round(cardX(r, i, g)), gk != null && g >= gk ? DROP[Math.min(3, Math.floor((g - gk) * 7))] : 22];
        });
        const key = cards.join('|') + skirt;
        if (key === row.key) continue;
        row.key = key;
        pl.clear(); pl.g.drawImage(row.bg, 0, 0);
        const gc = pl.g, base = H - RR.base, foot = H - RR.base - 4;
        gc.save(); gc.beginPath(); gc.rect((WX0 - pl.x0) * 2, 0, (WX1 - WX0) * 2, pl.cv.height); gc.clip();
        const { R } = pl.p;
        cards.forEach(([x, h], i) => {
          R(x + CW / 2 - 2, foot, 4, base - foot, 1); R(x + CW / 2 - 1, foot, 2, base - foot, 6); // its post
          if (h > 3) gc.drawImage(faceCv[RR.kinds[i]], (x - pl.x0) * 2, (foot - h * K) * 2, CW * 2, h * K * 2);
          else { R(x, foot - 4, CW, 4, 1); R(x + 1, foot - 3, CW - 2, 2, 6); } // down: its edge
        });
        // The flame skirt hiding the rails, flickering along in steps.
        for (let x = WX0; x < WX1; x++) {
          const fh = 4 + [0, 1, 3, 5, 3, 1, 0, 2][mod(x + skirt, 8)];
          R(x, base - fh, 1, fh, 8); R(x, base - fh, 1, 1, 1); if (fh > 5) R(x, base - fh + 1, 1, 1, 7);
        }
        gc.restore();
        gc.drawImage(row.fg, 0, 0);
      }
      // The marker: gold corner brackets round where you'd land, ink-edged so they read on any card. Its
      // plane stands just in front of the tier it's on, and glides back and up between them with it.
      const mkKey = aim ? Math.round(aim.x) + ':' + Math.round(aim.k * 24) : '';
      if (mkKey !== mk.key) {
        mk.key = mkKey; mk.clear();
        if (aim) {
          mk.cv.style.top = lerp(ROWS[0].d, ROWS[1].d, aim.k) + 1 - H * U + 'px';
          const { R } = mk.p, x = Math.round(aim.x), foot = Math.round(lerp(H - ROWS[0].base - 4, H - ROWS[1].base - 4, aim.k));
          const x0 = x - CW / 2 - 3, y0 = foot - CH - 3, x1 = x + CW / 2 + 3, y1 = foot + 2;
          for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
            const hx = sx > 0 ? cx : cx - 7, vx = sx > 0 ? cx : cx - 2, hy = sy > 0 ? cy : cy - 2, vy = sy > 0 ? cy : cy - 7;
            R(hx - 1, hy - 1, 9, 4, 1); R(vx - 1, vy - 1, 4, 9, 1); R(hx, hy, 7, 2, 8); R(vx, vy, 2, 7, 8);
          }
          R(x - 1, foot - CH / 2 - 1, 3, 3, 1); R(x, foot - CH / 2, 1, 1, 8); // its middle
        }
      }
      const pk = prize + ':' + st.won;
      if (pk !== postKey) {
        postKey = pk; post.clear(); post.g.drawImage(postBg, 0, 0);
        if (prize >= 0 && st.won >= 0) post.g.drawImage(faceCv[st.won], (PX - post.x0) * 2, prizeY(prize) * 2, CW * 2, CH * 2);
      }
    }
    let last = performance.now();
    sc.every(33, () => {
      const now = performance.now();
      walkers.step(Math.min(0.2, (now - last) / 1000), now / 1000);
      last = now;
      tick();
      shadows();
    });

    function draw(S) {
      if (!sc.alive()) return;
      you = { x: S.fx, d: S.depth, z: S.z };
      shelfShadow(S);
      fr.clear(); sling.front(fr, FX, H, S.sl.dx, S.sl.dy);
      fig.place({ x: mx(S.fx), y: S.depth, z: S.z, rot: S.rot, sx: S.sx, sy: S.sy });
    }
    Object.assign(draw, {
      alive: sc.alive, glide, down, st,
      aim: () => aimAt(glide()),
      rise(now, done) {
        if (now) { prize = PRIZE_STEPS; tick(); return done(); }
        prize = 0;
        const next = () => { if (!sc.alive()) return; tick(); if (prize >= PRIZE_STEPS) return done(); prize++; setTimeout(next, 1000 / 7); };
        next();
      },
      toPrize: (x, y) => Scene.toStage(sc, post, PX + x * K, prizeY(PRIZE_STEPS) + y * K),
    });
    tick();
    return draw;
  }

  /* PROPS: this scene's objects for other scenes and the builder (js/props.js): none of its own yet
     (the booth is drawn into the scene's planes; the slingshot is Scene.slingshot's). */
  return { mount, at, shot, cardAt, kindOf, LANDED, REST, ENTER_CUES, KINDS, SHOTS, NEED };
})();
