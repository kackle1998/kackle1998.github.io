'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the dipping pools (? stop events, see Run.dip in js/run.js): the Molten
   Pool, the Mirror Pool and the Sulfur Spring share one scene.
   A pool ringed with boulders, out in the ruins. Your figurine lands to the right of it on the
   tail of the map's lob, lifts what it dips over its head, tosses it into the pool and it goes
   under. The Molten Pool: three times in four the card rises, turns face-out and the Haste sigil
   stamps onto it, then it comes back to you; one time in four its shape shrinks away under the
   water in steps, with bubbles and a last ring. The Mirror Pool (black water): the card comes
   back face-out and its twin climbs out beside it. The Sulfur Spring (yellow water): a flask
   comes back full, and you drink it dry or cork it.
   Built on the scene kit (js/scene.js): only the pool, what's dipped and the timeline are its own.
   Scene px: everything is laid out on upright planes in scene pixels of 4 map units, x across and
   y down from the sky to the ground at GY.
   ============================================================ */

const Dip = (() => {
  const U = 4, GY = 106;                  // map units a scene px; the ground's scene y
  const mx = (x) => 720 + (x - 75) * U;  // a scene x as a plane x (map units): scene x 75 is the middle
  const D_ACT = 380, D_FIG = 396;         // depths (plane y): the spring and pool, you
  const AX0 = -12, AW = 174;              // the upright plane's left edge and width (scene px), from the sky (y 0) to GY
  const SURF = 82, DIP = 60, STAND = 128, HY = 62, PY = 54, UNDER = SURF + 3; // the water line, the pool's middle, where you stand, the card over your head, over the pool, under the water
  const POOL = [60, 77, 37, 28];        // the water: an ellipse cx, cy, rx, ry
  // The entrance, in scene px (x 4 for map units): the tail of the map's lob, in from the right.
  const LAND = { across: 44, back: 10, high: 40, ms: 700 };
  // Where the stage's edge falls in scene x (Scene.span, measured by mount), so the lob starts off screen at any stage size.
  let EDGE = -Infinity;
  // The camera (Scene.mount): pulled in close on the spring, the pool and you.
  const CAM = { rows: 480, top: -110 };
  const { bay, cl, CARD } = Scene;
  const nz = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const inE = (x, y, [cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

  /* ---------- the timeline ---------- */
  /* What the scene shows at time t (seconds) for an outcome `mode`: 'haste' (the Molten Pool: it
     comes back with Haste), 'melt' (the Molten Pool: it's lost) or 'copy' (the Mirror Pool: its
     twin climbs out beside it). The entrance runs 0..LANDED, you wait at REST, and the dip plays
     REST..END[mode]. Card widths step at 7 a second (opening, turning); flights move smoothly.
     { fx, feet: scene x and y of your feet, depth: plane y you stand at, rot: quarter turns,
       sx, sy: squash, card, twin: { x: its middle, top, w: width (CARD.TURN), face, sig: 1 the
       small Haste sigil on it, 2 the big one stamping down, 3 the dust round it } or null } */
  const LANDED = LAND.ms / 1000 + Scene.SQUASH.ms / 1000, REST = 1;
  const MELT = 3.6, GONE = 4.4;           // the lost card's shape starts to shrink; it's gone
  const END = { haste: 7.1, melt: 5.7, copy: 7.75, drink: 6.6, bottle: 6.3 }; // back over your head and put away / the last ring gone
  const SHUT = { haste: 6.6, copy: 7.2, drink: 6, bottle: 5.7 }; // when it closes up over your head (3 frames)
  const TWIN = 10;                        // how far either side of the pool's middle the card and its twin stand
  const FL = { W: 9, H: 12 };             // the flask (flaskArt), scene px
  const narrow = (w) => Math.max(1, Math.round(w * FL.W / CARD.W)); // a card's turn widths, for the flask
  const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) ** 2);
  const open = (t, t0) => CARD.TURN[2 - Math.min(2, Math.floor((t - t0) * 7))]; // 3, 9, 15
  const shut = (t, t0) => CARD.TURN[Math.min(2, Math.floor((t - t0) * 7))];     // 15, 9, 3
  const home = (u) => Math.round(Math.sin(u * Math.PI) * 8); // the lift of the arc back to you
  function at(t, mode = 'haste') {
    const S = { t, mode, fx: STAND, feet: GY, depth: D_FIG, rot: 0, sx: 1, sy: 1, card: null, twin: null }, seg = (a, b) => cl((t - a) / (b - a));
    const melt = mode === 'melt', copy = mode === 'copy', flask = mode === 'drink' || mode === 'bottle';
    if (t < LANDED) {
      const L = Scene.land(cl(t * 1000 / LAND.ms), LAND.high * U);
      S.fx = STAND + Math.max(LAND.across, EDGE - STAND) * L.k;
      S.depth = D_FIG - LAND.back * U * L.k;
      S.feet = GY - L.z / U;
      S.rot = L.rot;
      if (!L.k) { S.sx = Scene.SQUASH.sx; S.sy = Scene.SQUASH.sy; }
    }
    if (t <= REST || t >= (melt ? MELT : SHUT[mode] + 3 / 7)) return S;
    if (flask) {
      // The Sulfur Spring: a flask, held the same way as a card (its foot where a card's would be),
      // dipped and filled, back over your head, then drunk dry or corked.
      const k = S.card = { kind: 'flask', x: STAND, top: HY + 10, w: FL.W, h: FL.H, fill: 0, cork: false };
      if (t < REST + 0.28) k.w = narrow(open(t, REST));
      if (t >= 1.45) { const u = ease(seg(1.45, 2.25)); k.x = STAND + (DIP - STAND) * u; k.top = HY + 10 + (PY - HY) * u - home(u); }
      if (t >= 2.45) { const u = seg(2.45, 3); k.top = PY + 10 + (UNDER + 4 - PY - 10) * u * u; }
      if (t >= 3.8) { const u = seg(3.8, 4.3); k.top = UNDER + 4 + (PY + 6 - UNDER) * (1 - (1 - u) ** 2); k.fill = 3; }
      if (t >= 4.6) { const u = ease(seg(4.6, 5.2)); k.x = DIP + (STAND - DIP) * u; k.top = PY + 10 + (HY - PY) * u - home(u); }
      if (mode === 'drink' && t >= 5.4) k.fill = Math.max(0, 2 - Math.floor((t - 5.4) * 7));
      if (mode === 'bottle' && t >= 5.4) k.cork = true;
      if (t >= SHUT[mode]) k.w = narrow(Math.max(3, shut(t, SHUT[mode])));
      return S;
    }
    // The card opens over your head, flies over to the pool in an arc and drops in.
    let x = STAND, top = HY, w = CARD.W, face = false, sig = 0;
    if (t < REST + 0.28) w = open(t, REST);
    if (t >= 1.45) { const u = ease(seg(1.45, 2.25)); x = STAND + (DIP - STAND) * u; top = HY + (PY - HY) * u - Math.round(Math.sin(u * Math.PI) * 8); }
    if (t >= 2.45) { const u = seg(2.45, 3); top = PY + (UNDER - PY) * u * u; }
    if (!melt) {
      // Up out of the water and turned over (narrowing as a back, opening as a face).
      if (t >= 3.8) { const u = seg(3.8, 4.3); top = UNDER + (PY - UNDER) * (1 - (1 - u) ** 2); }
      if (t >= 4.4) { if (t < 4.82) w = Math.max(3, shut(t, 4.4)); else { face = true; w = open(t, 4.82); } }
      if (!copy) {
        // Stamped with Haste, and back to you.
        if (t >= 5.3) { const f = Math.floor((t - 5.3) * 7); sig = f < 2 ? 2 + f : 1; }
        if (t >= 6) { const u = ease(seg(6, 6.6)); x = DIP + (STAND - DIP) * u; top = PY + (HY - PY) * u - home(u); }
        if (t >= 6.6) w = Math.max(3, shut(t, 6.6));
      } else {
        // It steps aside, and its twin rises beside it, turns over, and both come back to you.
        if (t >= 5) x = DIP - TWIN * ease(seg(5, 5.3));
        if (t >= 5.1) {
          const tw = S.twin = { kind: 'card', x: DIP + TWIN, top: UNDER, w: CARD.W, h: CARD.H, face: false, sig: 0 };
          if (t >= 5.3) { const u = seg(5.3, 5.8); tw.top = UNDER + (PY - UNDER) * (1 - (1 - u) ** 2); }
          if (t >= 5.9) { if (t < 6.32) tw.w = Math.max(3, shut(t, 5.9)); else { tw.face = true; tw.w = open(t, 6.32); } }
          if (t >= 6.6) {
            const u = ease(seg(6.6, 7.2));
            x = DIP - TWIN + (STAND - 4 - (DIP - TWIN)) * u; top = PY + (HY - PY) * u - home(u);
            tw.x = DIP + TWIN + (STAND + 4 - (DIP + TWIN)) * u; tw.top = top;
          }
          if (t >= 7.2) w = tw.w = Math.max(3, shut(t, 7.2));
        }
      }
    }
    S.card = { kind: 'card', x, top, w, h: CARD.H, face, sig };
    return S;
  }
  const end = (mode) => END[mode];
  // When the card goes into the water (TE) and comes back out of it (TX), and when its twin is
  // out (TW), found from at().
  const TIMES = Object.fromEntries(Object.keys(END).map((mode) => {
    let TE = 0, TX = 99, TW = 99;
    for (let t = 2; t < 6; t += 0.005) {
      const { card: c, twin: w } = at(t, mode);
      if (c) {
        const wet = c.top + c.h > SURF;
        if (wet && !TE) TE = t;
        if (!wet && TE && TX === 99 && t > 3.2) TX = t;
      }
      if (w && TW === 99 && w.top + CARD.H <= SURF) TW = t;
    }
    return [mode, { TE, TX, TW }];
  }));
  // Sounds on the way: [time, name, n]. ENTER_CUES for the entrance, cues(mode) for the dip.
  const ENTER_CUES = [[LAND.ms / 1000, 'land']];
  const cues = (mode) => {
    const { TE, TX, TW } = TIMES[mode], dip = [[REST, 'place'], [1.45, 'twang'], [TE, 'poof']];
    if (mode === 'melt') return [...dip, [MELT, 'die'], [4.5, 'poof']];
    if (mode === 'copy') return [...dip, [TX, 'poof'], [4.82, 'place'], [5.3, 'spell'], [TW, 'poof'], [6.32, 'place'], [7.2, 'place']];
    if (mode === 'drink') return [...dip, [TX, 'poof'], [5.4, 'heal'], [6, 'place']];
    if (mode === 'bottle') return [...dip, [TX, 'poof'], [5.4, 'place'], [5.7, 'tally']];
    return [...dip, [TX, 'poof'], [4.82, 'place'], [5.3, 'spell'], [6.6, 'place']];
  };

  /* ---------- the art (scene px) ---------- */
  // The Haste sigil: a bolt, `s` px a pixel, in the accent.
  const BOLT = ['..#', '.#.', '###', '.#.', '#..'];
  const bolt = ({ R }, x, y, s) => BOLT.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') R(x + i * s, y + j * s, s, s, 8); }));
  // A card's sprite (SPRITES[name]) as a 16 x 16 canvas, in the palette's colors like spriteURL.
  function spriteArt(name) {
    const src = SPRITES[name];
    if (!src) return null;
    const rows = expandSprite(src), cv = document.createElement('canvas'), g = cv.getContext('2d');
    cv.width = 16; cv.height = rows.length;
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (PAL[ch]) { g.fillStyle = PAL[ch]; g.fillRect(x, y, 1, 1); } }));
    return cv;
  }
  /* A card face, CARD.W x CARD.H (its art in a frame, a text band, its stats), narrowed about its
     middle to width w while it opens; sig 1: the small Haste sigil on it. `art`: the card's own
     sprite (spriteArt), drawn in the frame at half a scene px a pixel on plane `pl`; without it, a
     stand-in beast. */
  function faceArt(p, x, y, w, sig, art, pl) {
    const { P, R } = p;
    x += (CARD.W - w) >> 1;
    R(x, y, w, CARD.H, 1);
    if (w > 2) R(x + 1, y + 1, w - 2, 20, 6);
    if (w < CARD.W) { if (w > 4) R(x + 2, y + 2, w - 4, 9, 5); return; }
    R(x + 1, y + 1, 1, 20, 7);
    R(x + 2, y + 2, 11, 9, 5); R(x + 2, y + 2, 11, 1, 4);
    if (art) pl.art(art, x + 3.5, y + 2.5);
    else { R(x + 4, y + 6, 6, 3, 3); R(x + 8, y + 4, 3, 3, 3); R(x + 3, y + 5, 1, 2, 3); R(x + 5, y + 9, 1, 2, 2); R(x + 9, y + 9, 1, 2, 2); P(x + 9, y + 5, 7); }
    R(x + 2, y + 12, 11, 2, 4);
    R(x + 2, y + 18, 3, 2, 1); R(x + 10, y + 18, 3, 2, 1); P(x + 3, y + 18, 7); P(x + 11, y + 18, 7);
    if (sig === 1) bolt(p, x + 6, y + 14, 1);
  }

  /* The water's tones, per pool: its far lip, its body, the light toward the near right, glints
     and rings, what's under it. */
  const WATERS = {
    molten: { lip: 3, body: 4, lite: 5, glint: 6, under: 3 },
    black: { lip: 1, body: 2, lite: 3, glint: 5, under: 1 },  // the Mirror Pool: still and black
    sulfur: { lip: 3, body: 8, lite: 7, glint: 7, under: 4 }, // the Sulfur Spring: yellow
  };
  /* The still parts, baked once onto a canvas the size of the plane: the pool and its boulders,
     and lilies unless it's the black pool. Returns { cv, K: its tones, wet(x, y): open water at
     scene px x, y, gl: glint spots }. */
  function bake(C, water) {
    const K = WATERS[water], dark = water === 'black';
    const cv = document.createElement('canvas');
    cv.width = AW * 2; cv.height = GY * 2;
    const { P } = Scene.pen(cv.getContext('2d'), C, AX0, 0, 2);
    const M = new Uint8Array(AW * GY), at = (x, y) => (y >= 0 && y < GY && x >= AX0 && x < AX0 + AW ? y * AW + x - AX0 : -1);
    const wet = (x, y) => { const o = at(Math.round(x), Math.round(y)); return o >= 0 && M[o] === 1; };
    const setM = (x, y, v) => { const o = at(x, y); if (o >= 0) M[o] = v; };
    // The water: a dark lip along its far edge, lighter toward the near right.
    for (let y = POOL[1] - POOL[3]; y < GY; y++) for (let x = 20; x <= 100; x++) {
      if (!inE(x, y, POOL)) continue;
      let k = K.body;
      if (!inE(x, y - 1, POOL)) k = K.lip;
      else if (!inE(x, y - 2, POOL) && bay(x, y) < 8) k = K.lip;
      else if (bay(x, y) < cl(((x - POOL[0]) / POOL[2] + (y - POOL[1]) / POOL[3]) * 6 + 2, 0, 16)) k = K.lite;
      P(x, y, k); setM(x, y, 1);
    }
    // Boulders round it, far ones first, lit from the upper left.
    const rocks = [];
    for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2; rocks.push([POOL[0] + (POOL[2] + 4) * Math.cos(a), POOL[1] + (POOL[3] + 1.5) * Math.sin(a), 6 + Math.floor(nz(i, 1) * 4), 3 + Math.floor(nz(i, 2) * 2)]); }
    rocks.sort((a, b) => a[1] - b[1]);
    for (const [bx, by, w, rh] of rocks) {
      const rx = w / 2, ry = rh / 2;
      for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) {
        if ((dx / rx) ** 2 + (dy / ry) ** 2 > 1) continue;
        const x = Math.round(bx + dx), y = Math.round(by + dy);
        let k = dx < 0 && dy < 0 ? 6 : 5;
        if (dy >= ry - 1) k = 4;
        if ((dx / rx) ** 2 + ((dy + 1) / ry) ** 2 > 1) k = 3;
        P(x, y, k); setM(x, y, 0);
      }
    }
    // Two lily pads, one in flower.
    for (const [cx, cy, fl] of dark ? [] : [[80, 99, 1], [46, 100, 0]]) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -5; dx <= 5; dx++) {
        if ((dx / 5.5) ** 2 + (dy / 2.4) ** 2 > 1 || (dy === 0 && dx >= 3)) continue;
        P(cx + dx, cy + dy, dy === 2 ? 2 : dx + dy < -3 ? 4 : 3); setM(cx + dx, cy + dy, 0);
      }
      if (fl) { P(cx - 2, cy - 2, 8); P(cx, cy - 2, 8); P(cx - 1, cy - 3, 8); P(cx - 1, cy - 2, 7); }
    }
    const gl = [];
    for (let i = 0; gl.length < 7 && i < 400; i++) { const x = AX0 + Math.floor(nz(i, 11) * AW), y = Math.floor(nz(i, 12) * GY); if (wet(x, y) && wet(x + 3, y) && Math.abs(x - DIP) > 9) gl.push([x, y]); }
    return { cv, K, wet, gl };
  }
  /* The flask the Sulfur Spring fills: glass with an ink edge, the yellow water in it `fill` (0..3)
     steps deep, a cork once it's bottled; narrowed about its middle to width w while it opens. */
  const FLASK = ['...###...', '...#g#...', '..#ggg#..', '.#ggggg#.', '#ggggggg#', '#ggggggg#', '#ggggggg#', '#ggggggg#', '#ggggggg#', '#ggggggg#', '.#ggggg#.', '..#####..'];
  function flaskArt({ P, R }, x, y, w, fill, cork) {
    if (w < FL.W) { const x0 = x + ((FL.W - w) >> 1); R(x0, y + 2, w, FL.H - 2, 1); if (w > 2) R(x0 + 1, y + 3, w - 2, FL.H - 5, 7); return; }
    const deep = [0, 3, 5, 7][fill]; // rows of water up from the bottom
    FLASK.forEach((r, j) => [...r].forEach((ch, i) => {
      if (ch === '#') P(x + i, y + j, 1);
      else if (ch === 'g') P(x + i, y + j, i === 2 && j > 3 ? 7 : j >= FL.H - 1 - deep ? 8 : 6); // a glint down the left
    }));
    if (cork) { R(x + 3, y - 1, 3, 2, 3); P(x + 3, y - 1, 4); }
  }

  // A ring spreading on the water round x (the pool's middle unless said), dt seconds old (a step every 1/6 s).
  function ring({ P }, b, dt, r0 = 5, cx = DIP) {
    if (dt < 0 || dt >= 0.84) return;
    const r = r0 + Math.floor(dt * 6) * 3, ry = r * POOL[3] / POOL[2];
    for (let a = 0; a < Math.PI * 2; a += 0.5 / r) { const x = Math.round(cx + r * Math.cos(a)), y = Math.round(SURF + 1 + ry * Math.sin(a)); if (b.wet(x, y)) P(x, y, b.K.glint); }
  }
  // A splash thrown up where something goes in or comes out, three frames.
  function splash({ P }, dt, cx = DIP) {
    if (dt < 0 || dt >= 3 / 7) return;
    const D = [[[-4, -2], [4, -2], [-2, -4], [2, -4]], [[-7, -4], [7, -4], [-3, -7], [3, -7]], [[-9, -1], [9, -1], [-4, -5], [4, -5]]][Math.floor(dt * 7)];
    for (const [dx, dy] of D) { P(cx + dx, SURF + dy, 7); P(cx + dx, SURF + dy + 1, 4); }
  }
  /* A card or the flask over the water: its shadow on the water, its dark shape under it, the part
     above the water (a card's back or face, the flask), the waterline across it, and drips for
     `drip` seconds after it came out. */
  function itemArt(p, b, c, drip) {
    const { P, R } = p, { wet, K } = b, flask = c.kind === 'flask', iw = flask ? FL.W : CARD.W;
    const L = Math.round(c.x - (iw >> 1)), T = Math.round(c.top), bot = T + c.h;
    if (bot < SURF && wet(c.x, SURF)) {
      const hw = Math.max(3, Math.round(7 - (SURF - bot) / 12)), cx = Math.round(c.x);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -hw; dx <= hw; dx++) if ((dx / hw) ** 2 + (dy / 1.6) ** 2 <= 1 && bay(cx + dx, SURF + dy) < 8) P(cx + dx, SURF + dy, K.under);
    }
    for (let v = Math.max(SURF, T); v < bot; v++) for (let u = L; u < L + iw; u++) if (wet(u, v) && bay(u, v) < (v - SURF < 4 ? 10 : 6)) P(u, v, K.under);
    // Only the part above the water is drawn as the thing itself.
    const dry = { P: (u, v, k) => { if (v < SURF) P(u, v, k); }, R: (u, v, w, h, k) => { const h2 = Math.min(h, SURF - v); if (h2 > 0) R(u, v, w, h2, k); } };
    if (flask) flaskArt(dry, L, T, c.w, c.fill, c.cork);
    else if (c.face) faceArt(dry, L, T, c.w, c.sig, b.art, b.pl);
    else Scene.cardArt(dry, L, T, false, c.w);
    if (c.sig === 2) bolt(p, L + 4, T + 10, 2);
    if (c.sig === 3) for (const [dx, dy] of [[4, 13], [10, 13], [4, 21], [10, 21], [3, 17], [11, 17]]) P(L + dx, T + dy, 7);
    if (T < SURF && bot > SURF) { R(L - 1, SURF, iw + 2, 1, 7); R(L - 1, SURF + 1, iw + 2, 1, K.lite); }
    if (drip > 0 && drip < 1.2) {
      for (let d = 0; d < 2; d++) { const ph = (Math.floor(drip * 7) + d * 2) % 4, x = L + (d ? iw - 4 : 3), y = bot + 1 + ph * 3; if (y < SURF - 1) { P(x, y, 7); P(x, y + 1, 4); } }
    }
  }
  // The water's moving parts and what's dipped in it: glints, rings and splashes, the card (and
  // its twin) or the flask, a lost card's shape shrinking away.
  function waterArt(p, b, S) {
    const { P, R } = p, { wet, K } = b, { t, mode } = S, { TE, TX, TW } = TIMES[mode], st = Math.floor(t * 4), melt = mode === 'melt';
    b.gl.forEach(([x, y], i) => { const o = [0, 1, 2, 1][(st + i) % 4]; if (wet(x + o, y) && wet(x + o + 1, y)) R(x + o, y, 2, 1, K.glint); });
    if (t < REST) return;
    ring(p, b, t - TE); ring(p, b, t - TE - 0.3);
    if (t > TE + 0.6 && t < (melt ? GONE : TX - 0.1)) ring(p, b, (t - TE - 0.6) % 0.5, 3);
    if (melt) { ring(p, b, t - 4.5, 4); ring(p, b, t - 4.8, 4); }
    else { ring(p, b, t - TX); ring(p, b, t - TX - 0.3); }
    if (mode === 'copy') { ring(p, b, t - 5.3, 3, DIP + TWIN); ring(p, b, t - TW, 5, DIP + TWIN); }
    if (S.card) itemArt(p, b, S.card, t - TX);
    if (S.twin) itemArt(p, b, S.twin, t - TW);
    if (melt && t >= MELT && t < GONE) {
      const f = Math.floor((t - MELT) * 7), [w, h] = [[11, 6], [7, 4], [5, 3], [3, 2], [1, 1]][Math.min(4, f)];
      if (f < 5) for (let v = UNDER; v < UNDER + h; v++) for (let u = DIP - (w >> 1); u <= DIP + (w >> 1); u++) if (wet(u, v) && bay(u, v) < 10) P(u, v, K.under);
      const [bx, by] = [[-3, 0], [2, -1], [0, 0], [4, -1], [-2, -1], [1, 0]][f % 6];
      P(DIP + bx, SURF + by, 7); P(DIP + bx + 1, SURF + by, 7);
    }
    splash(p, t - TE);
    if (!melt) splash(p, t - TX);
    if (mode === 'copy') splash(p, t - TW, DIP + TWIN);
  }

  /* ---------- the stage ---------- */
  /* Build the scene in `stage` with the spires' heat (0..2, RunMap.SPIRE_ANTES) and the pool's
     water (WATERS: 'molten', 'black', 'sulfur'). Returns draw(state) for at(t, mode)'s states,
     with draw.alive(). The water keeps moving between draws (its glints) on its own timer. */
  function mount(stage, heat, water = 'molten') {
    const sc = Scene.mount(stage, CAM);
    EDGE = (Scene.span(sc, D_FIG, LAND.high * U)[1] - 720) / U + 75 + 24;
    const gnd = Scene.ground(sc, {
      x0: -1200, y0: -1000, w: 1920, h: 900,
      light: (X, Y) => 1.2 - Math.hypot((X - 620) / 1300, (Y - 380) / 900),
      rubble: [[250, 450, 3], [470, 476, 2], [1010, 400, 2], [300, 380, 2], [1150, 440, 3], [-80, 300, 3], [1560, 330, 3], [640, 120, 2]],
      shards: [[1000, 470], [1120, 410], [210, 416], [1380, 380], [80, 360]],
      shadows: [[mx(24) + 8, D_ACT - 2, mx(100) + 12, D_ACT + 4]], // the pool's rim, down and right of it
      over: { x0: 260, y0: 280, w: 460, h: 130 },
    });
    // Spires stand well back and off to the sides, so none of them rises behind the pool.
    const near = [[-70, 20, 'spike', 96, 24], [-40, 80, 'spike', 80, 22], [-20, -10, 'spike', 92, 24], [150, 60, 'basalt', 40, 24],
      [170, 10, 'spike', 104, 26], [200, 70, 'spike', 88, 22], [225, -20, 'spike', 96, 24]].map(([sx, d, k, h, w]) => ({ k, x: mx(sx), d, h, w, l: 3 }));
    [[160, -30, 124, 36], [-50, -50, 116, 32], [120, -120, 96, 28]].slice(0, heat + 1)
      .forEach(([sx, d, h, w], i) => near.push({ k: 'strata', x: mx(sx), d, h: Math.round(h * (1 + heat * 0.12)), w, l: 3, seed: 3 + i }));
    Scene.ruins(sc, { area: { x0: -1170, x1: 2610, y0: -1000, y1: 300 }, clear: { x0: 380, x1: 1060, y: -220 }, near, heat });

    const act = Scene.plane(sc, { left: mx(AX0), x0: AX0, depth: D_ACT, w: AW, h: GY });
    const b = bake(sc.C, water), fig = Scene.figure(sc, { s: U });
    b.pl = act;
    let shadowKey = '', last = at(REST);
    const paint = () => {
      act.clear();
      act.g.drawImage(b.cv, 0, 0);
      waterArt(act.p, b, last);
    };
    sc.every(60, paint); // the glints keep moving while you wait

    function draw(S) {
      if (!sc.alive()) return;
      last = S;
      const z = (GY - S.feet) * U, key = [Math.round(S.fx), Math.round(S.depth), Math.round(z / 16)].join();
      if (key !== shadowKey) {
        shadowKey = key;
        gnd.clear();
        const r = Math.max(2.5, 6 - z / 80);
        gnd.shade(mx(S.fx) + 4, S.depth + 2, r * 1.3, r * 0.5);
      }
      paint();
      fig.place({ x: mx(S.fx), y: S.depth, z, rot: S.rot, sx: S.sx, sy: S.sy });
    }
    draw.alive = sc.alive;
    // The card being dipped (its face shows its own art), or null for a stand-in.
    draw.face = (d) => { b.art = d ? spriteArt(d.sprite) : null; };
    return draw;
  }

  /* PROPS: this scene's objects for other scenes and the builder (js/props.js): each { id, name, x0,
     w, cx (its middle), gy (its ground line), home: { x, depth } (where it stands in this scene),
     draw(pln, t, heat, sc) } in this file's scene px. */
  const baked = new Map();
  const pool = (water, name) => ({
    id: water + '-pool', name, x0: AX0, w: AW, cx: POOL[0], gy: GY, home: { x: POOL[0], depth: D_ACT },
    draw(pln, t, heat, sc) {
      const key = water + sc.C.join();
      if (!baked.has(key)) baked.set(key, bake(sc.C, water));
      const b = baked.get(key), st = Math.floor(t * 4);
      pln.g.drawImage(b.cv, 0, 0);
      b.gl.forEach(([x, y], i) => { const o = [0, 1, 2, 1][(st + i) % 4]; if (b.wet(x + o, y) && b.wet(x + o + 1, y)) pln.p.R(x + o, y, 2, 1, b.K.glint); }); // the glints, as waterArt
    },
  });
  const PROPS = [pool('molten', 'molten pool'), pool('black', 'black mirror pool'), pool('sulfur', 'sulfur spring')];
  return { mount, at, end, cues, LANDED, REST, ENTER_CUES, CAM, PROPS };
})();
