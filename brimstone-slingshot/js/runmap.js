'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the Dealer's Run map: a 2.5D board tilted in
   CSS 3D, Inscryption style. Stops are joined by orbit arcs;
   spires, lava and rune circles stand around them, and a slingshot at
   the base of the board flings your character's figurine to each stop. Every color comes from the current
   palette (Palette.cur), so the map recolors with OPTIONS.
   Map units: the board is W x H; its canvases are drawn at half size.
   ============================================================ */

const RunMap = (() => {
  // H grows with the run: a run's board is as long as its map (show() sets it; 1020 is the classic size).
  const W = RUN_MAP_W, CW = W / 2, BOARD_BASE = 1020; // W: see js/run.js
  let H = BOARD_BASE, CH = H / 2;
  const BOSS_PIN_Y = 104;
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  /* Stop icons shown in the beacons (11 wide). The boss is the casino resort (see CAS). */
  const BEACON_ICONS = {
    start: [],
    battle: ['...#####...', '..#######..', '.#########.', '.##..#..##.', '.##..#..##.', '.#########.', '..###.###..', '...#####...', '...#.#.#...', '...#####...'],
    fire: ['.....#.....', '....##.....', '....###.#..', '...####.#..', '..#######..', '..###.###..', '..##...##..', '...#...#...', '#.........#', '.###...###.', '....###....'],
    altar: ['.....#.....', '....###....', '.....#.....', '....###....', '....###....', '....###....', '..#######..', '..#.....#..', '..#.#.#.#..', '..#.....#..', '.#########.'],
    trade: ['.....####..', '...####..#.', '..###......', '..##.......', '.###.......', '.###.......', '.###.......', '..##.......', '..###......', '...####..#.', '.....####..'],
    // The bowling lane: the rack from above, each pin two tall (11 wide has no room for a staggered 2x2 rack).
    bowl: ['#.#.#.#', '#.#.#.#', '.......', '.#.#.#.', '.#.#.#.', '.......', '..#.#..', '..#.#..', '.......', '...#...', '...#...'],
    // The casino: a poker chip, notches round its edge and a ring inside.
    casino: ['...#####...', '..##...##..', '.#.#####.#.', '##.#...#.##', '#.#.....#.#', '#.#.....#.#', '#.#.....#.#', '##.#...#.##', '.#.#####.#.', '..##...##..', '...#####...'],
    event: ['...#####...', '..##...##..', '..##...##..', '.......##..', '......##...', '.....##....', '.....##....', '...........', '.....##....', '.....##....'],
  };
  const RUNE = ['.#...', '.##..', '.#.#.', '.##..', '.#.#.', '.#..#', '.#...'];

  const lavaL = (y) => ({ c: 36 + 12 * Math.sin(y / 46) + 6 * Math.sin(y / 14), w: 10 + 4 * Math.sin(y / 26 + 1) });
  const lavaR = (y) => ({ c: W - 36 - 12 * Math.sin(y / 40) - 6 * Math.sin(y / 17), w: 10 + 4 * Math.sin(y / 22) });
  /* Whether a standee at (x, y), half-width hw and height h, keeps clear of the rivers: its base
     off the lava and its crust, and its top too, since the camera's perspective leans a standee
     outward as it rises, by up to LEAN map units per unit of height at the board's edge (measured
     in the 3D view; less toward the middle). riverRoom is the space left over (< 0: too close). */
  const LEAN = 0.5;
  const riverRoom = (x, y, hw, h) => {
    const l = lavaL(y), r = lavaR(y);
    return Math.min(x - (l.c + l.w + 4), r.c - r.w - 4 - x) - hw - 4 - h * LEAN * Math.abs(x - W / 2) / (W / 2);
  };
  // Lit from above the middle of the board; on a longer board the lit middle stretches with it.
  const lightAt = (x, y) => {
    const d = y - H * 0.53, dy = Math.sign(d) * Math.max(0, Math.abs(d) - (H - BOARD_BASE) / 2);
    return Math.max(0, Math.min(1, 1 - Math.hypot(x - W / 2, dy * 0.85) / 560));
  };
  const lvl = (f, x, y) => Math.max(0, Math.min(3, Math.round(f * 3 + BAY[(x & 3) + (y & 3) * 4] / 16 - 0.5)));

  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const luma = (h) => { const [r, g, b] = rgb(h); return r * 0.299 + g * 0.587 + b * 0.114; };

  /* The palette as a ramp, darkest to lightest, with the accent last. Sorted by brightness
     rather than by token name, so inverted palettes (light ink on dark paper) work too. */
  function ramp() {
    const p = Palette.cur;
    return [p.bg, p.ink, p.dark, p.mid, p.light, p.artbg, p.paper, p.white].sort((a, b) => luma(a) - luma(b)).concat(p.accent);
  }

  /* An orbit arc from stop a up to stop b: x eases across between the stops as y climbs, and the
     arc bows outward, away from the board's middle, as if swung round the casino. The bow grows
     smoothly with the link's distance from the middle, so links in sorted order still don't cross. */
  const BOW = 34;
  function route(a, b) {
    let bx = b.x, by = b.y;
    if (b.t === 'boss') { bx = W / 2 + (a.x < W / 2 - 50 ? -28 : a.x > W / 2 + 50 ? 28 : 0); by = BOSS_PIN_Y; }
    const bow = BOW * Math.max(-1, Math.min(1, ((a.x + bx) / 2 - W / 2) / 120));
    const n = Math.max(2, Math.round((a.y - by) / 4)), p = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, s = t * t * (3 - 2 * t);
      p.push([a.x + (bx - a.x) * s + bow * Math.sin(Math.PI * t), a.y + (by - a.y) * t]);
    }
    return p;
  }
  function sample(p, step = 4) {
    const out = [];
    for (let i = 1; i < p.length; i++) {
      const [x0, y0] = p[i - 1], [x1, y1] = p[i], n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
      for (let k = 0; k < n; k++) out.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);
    }
    out.push(p[p.length - 1]);
    return out;
  }
  function pix(cv, rows, map, ox = 0, oy = 0) {
    const x = cv.getContext('2d');
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (map[ch]) { x.fillStyle = map[ch]; x.fillRect(ox + i, oy + j, 1, 1); } }));
  }

  /* ---------- static ground: lit speckle, cracks, and an orrery's rings ---------- */
  function drawGround(cv, R, C) {
    const GR = [2, 3, 4, 5]; // ground tones by light level: dark .. artbg
    const B = new Uint8Array(CW * CH);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      let l = lvl(lightAt(x * 2, y * 2), x, y);
      const r = R();
      if (r < 0.08) l = Math.min(3, l + 1); else if (r < 0.15) l = Math.max(0, l - 1);
      B[y * CW + x] = GR[l];
    }
    const put = (x, y, f) => { x |= 0; y |= 0; if (x >= 0 && x < CW && y >= 0 && y < CH) B[y * CW + x] = f(B[y * CW + x]); };
    const walk = (n, f) => {
      for (let k = 0; k < n; k++) {
        let x = R() * CW, y = R() * CH, a = R() * 6.3;
        const L = 15 + R() * 45;
        for (let i = 0; i < L; i++) { a += (R() - 0.5) * 0.9; x += Math.cos(a); y += Math.sin(a); put(x, y, f); }
      }
    };
    walk(80, (v) => Math.max(1, v - 2));
    walk(14, () => (R() < 0.45 ? 8 : 1));
    // Dotted orbits cut round the casino, each with a small planet somewhere along it, and a few
    // four-point stars between them.
    const OX = CW / 2, OY = 35;
    for (let rr = 55; rr < 580; rr += 55) {
      for (let a = 0, i = 0; a < 6.283; a += 1 / rr, i++) if (i % 2 === 0) put(OX + Math.cos(a) * rr, OY + Math.sin(a) * rr * 0.72, (v) => Math.max(1, v - 1));
      const a = 0.25 + R() * 2.64, px = OX + Math.cos(a) * rr | 0, py = OY + Math.sin(a) * rr * 0.72 | 0;
      for (let u = -1; u < 3; u++) for (let v = -1; v < 3; v++) put(px + u, py + v, () => (u >= 0 && u < 2 && v >= 0 && v < 2 ? 7 : 1));
    }
    for (let k = 0; k < 24; k++) {
      const x = R() * CW | 0, y = R() * CH | 0;
      for (const [u, v] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) put(x + u, y + v, () => 7);
    }
    const g = cv.getContext('2d'), im = g.createImageData(CW, CH), dd = im.data, RGB = C.map(rgb);
    for (let i = 0; i < B.length; i++) { const c = RGB[B[i]]; dd[i * 4] = c[0]; dd[i * 4 + 1] = c[1]; dd[i * 4 + 2] = c[2]; dd[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
  }

  /* ---------- landmarks: dice towers, tossed chips, talon orbs, arcana obelisks ---------- */
  /* Rare, animated standees: two per map, one of each of the ante's pair (see show()). The first
     ante has dice towers (five dice stacked askew, the top one re-rolling now and then) and tossed
     poker chips (a big chip lying flat, flicked up every few seconds); later antes have talon orbs
     (a crystal orb in gold claws on a column, mist spiraling inside) and arcana obelisks (a
     rune-cut obelisk with the arcana symbol spinning over its capstone). The armillary sphere (a
     globe in turning rings) is drawn here too but unused: see MARK_PAIRS. Each is one small pixel
     canvas, repainted only when its look changes. Sizes in canvas px; 1 px = 2 map units. */
  const PIPS = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]],
    5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
  const MARK = { dice: { w: 26, h: 86 }, chips: { w: 30, h: 58 }, armillary: { w: 40, h: 82 }, orb: { w: 40, h: 64 }, arcana: { w: 40, h: 110 } };
  // By ante: the first, then every later one.
  // NOTE: the armillary is unused for now. It was the first ante's second landmark until the poker
  // chip replaced it; its art (armillary() in landmarks) is kept for a later ante or set piece.
  const MARK_PAIRS = [['dice', 'chips'], ['orb', 'arcana']];
  const CHIP_TOSS_EVERY = 3; // seconds between a tossed chip's tosses (see chips() in landmarks)
  const MARK_ROWS_APART = 1.5; // ideally, how many rows apart (up or down the board) landmarks stand
  const MARK_COLS_APART = 0.75; // ...and how many beacon gaps apart across it (see show())
  // Runes cut down an arcana obelisk (3 x 5).
  const RUNES = [['#..', '##.', '#.#', '##.', '#..'], ['.#.', '###', '.#.', '#.#', '.#.'], ['#.#', '.#.', '#.#', '.#.', '#.#'],
    ['###', '#..', '.#.', '..#', '###'], ['.#.', '#.#', '.#.', '#.#', '.#.'], ['#.#', '###', '#.#', '..#', '..#']];
  const noise = (a, b) => { let n = (a * 374761393 + b * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  function landmarks(pl, C, marks) {
    const live = marks.map(({ x, y, k, seed }) => {
      const { w, h } = MARK[k], cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const el = document.createElement('div');
      el.className = 'rm-st rm-mark';
      el.style.cssText = `left:${x - w}px;top:${y - h * 2}px;width:${w * 2}px;height:${h * 2}px`;
      el.appendChild(cv);
      pl.appendChild(el);
      const g = cv.getContext('2d');
      return { k, seed, w, h, R: (u, v, rw, rh, c) => { g.fillStyle = C[c]; g.fillRect(Math.round(u), Math.round(v), rw, rh); }, g };
    });
    const die = (R, u, v, n, s = 12) => {
      R(u - 1, v - 1, s + 5, s + 5, 1); R(u, v + 3, s, s, 6); R(u + s, v + 3, 3, s, 4); R(u + 1, v, s + 1, 3, 7); R(u + s, v, 2, 3, 6);
      const q = s / 4;
      for (const [a, b] of PIPS[n]) R(u + q + a * q - 1, v + 3 + q + b * q - 1, 2, 2, 1);
    };
    const dice = ({ R, w, h, seed }, t) => {
      // Every 5 s (each tower on its own beat) the top die tumbles for half a second, then settles.
      const beat = t / 5 + seed * 0.37, n = Math.floor(beat), tumbling = beat - n < 0.1;
      const top = tumbling ? 1 + Math.floor(t * 12) % 6 : 1 + (n * 7 + seed * 13 >>> 0) % 6, cx = w >> 1;
      R(cx - 12, h - 4, 24, 4, 1);
      [[0, 3], [-2, 5], [2, 1], [-1, 6], [1, top]].forEach(([o, f], i) => die(R, cx - 7 + o, h - 16 - i * 15 - (tumbling && i === 4 ? 2 : 0), f));
    };
    // A tossed chip: one big poker chip (1.5x a die across) lying flat on the ground, face up. Every
    // CHIP_TOSS_EVERY seconds (each chip on its own beat) it is flicked up like a coin off a thumb:
    // a second in the air on a low arc, a quarter turn end over end each frame, landing flat in
    // the same spot, its shadow shrinking while it is up.
    const CHIP_R = 11, CHIP_FLAT = 0.32, CHIP_H = 24; // radius; how squashed it looks lying flat; toss height (px)
    const CHIP_TURN = [0.7, 1, 0.7, CHIP_FLAT, 0];      // the face's squash, a quarter turn a frame
    const CHIP_FRAMES = 6;                               // frames in the air, at 6 a second
    // The toss frame now (0..CHIP_FRAMES-1), or -1 while the chip lies still.
    const chipToss = (t, seed) => { const beat = t / CHIP_TOSS_EVERY + seed * 0.37; return Math.floor((beat - Math.floor(beat)) * CHIP_TOSS_EVERY * 6); };
    const chipFrame = (t, seed) => { const i = chipToss(t, seed); return i < CHIP_FRAMES ? i : -1; };
    // The chip's face, an ellipse squashed vertically by sy (1 = facing you, CHIP_FLAT = lying
    // flat, 0 = edge-on, drawn as a bar): ink rim, accent body with eight light edge inserts, a
    // dotted inner ring, a paper center with an accent diamond, Bayer shade to the lower right and
    // a light upper-left rim. Lying flat, its 3 px edge shows below the face.
    const chipFace = (R, cx, cy, sy, flat) => {
      const r = CHIP_R, ry = Math.round(r * sy), dither = (x, y) => BAY[(x & 3) + (y & 3) * 4] < 8;
      if (ry < 2) {
        R(cx - r - 1, cy - 2, r * 2 + 3, 5, 1);
        for (let x = -r; x <= r; x++) R(cx + x, cy - 1, 1, 3, (x + r) % 8 < 3 ? 7 : 8);
        R(cx - r, cy - 1, 1, 1, 7);
        return;
      }
      if (flat) {
        for (let x = -r; x <= r; x++) {
          const yb = cy + Math.round(ry * Math.sqrt(Math.max(0, 1 - (x / (r + 0.5)) ** 2)));
          for (let j = 1; j <= 3; j++) R(cx + x, yb + j, 1, 1, (x + r) % 8 < 3 ? 7 : x > r * 0.4 && dither(cx + x, yb + j) ? 3 : 8);
          R(cx + x, yb + 4, 1, 1, 1);
        }
        R(cx - r - 1, cy, 1, 4, 1); R(cx + r + 1, cy, 1, 4, 1);
      }
      for (let y = -ry - 1; y <= ry + 1; y++) for (let x = -r - 1; x <= r + 1; x++) {
        const d = Math.hypot(x / (r + 0.5), y / (ry + 0.5));
        if (d > 1.06) continue;
        if (d > 0.94) { R(cx + x, cy + y, 1, 1, 1); continue; }
        const a = Math.atan2(y * r / ry, x);
        let c = 8;
        if (d > 0.72 && Math.abs((((a / (Math.PI / 4)) % 1) + 1) % 1 - 0.5) < 0.2) c = 7;
        if (d > 0.58 && d < 0.68 && Math.round(a * 12) % 2) c = 7;
        if (d < 0.58) c = 6;
        if (x / r + y / ry > 0.6 && dither(cx + x, cy + y)) c = c === 8 ? 3 : c === 6 ? 5 : 6;
        if (x / r + y / ry < -1 && d > 0.72 && c === 8) c = 7;
        R(cx + x, cy + y, 1, 1, c);
      }
      const dr = Math.round(r * 0.23), s = Math.max(1, Math.round(dr * sy)); // the center diamond: dr across each way, squashed by sy
      for (let i = 0; i <= s; i++) { const hw = Math.round(dr * i / s); R(cx - hw, cy - s + i, hw * 2 + 1, 1, 8); }
      for (let i = 1; i <= s; i++) { const hw = Math.round(dr * (s - i) / s); R(cx - hw, cy + i, hw * 2 + 1, 1, 8); }
      R(cx - 1, cy - s + 1, 1, 1, 7);
    };
    const chips = ({ R, w, h, seed }, t) => {
      const cx = w >> 1, b = h - 2, i = chipFrame(t, seed);
      const q = (i + 0.5) / CHIP_FRAMES, lift = i < 0 ? 0 : Math.round(4 * CHIP_H * q * (1 - q)), up = lift / CHIP_H;
      // The shadow: a dithered oval on the ground, smaller and fainter the higher the chip.
      const rx = Math.round(CHIP_R * (1 - 0.27 * up)), ry = Math.round(CHIP_R * CHIP_FLAT * (1 - 0.4 * up)), dense = (0.55 - 0.25 * up) * 16;
      for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx + 3; x++) {
        if (((x - 1) / (rx + 1)) ** 2 + (y / (ry + 0.6)) ** 2 < 1 && BAY[((cx + x) & 3) + ((b - 3 + y) & 3) * 4] < dense) R(cx + x, b - 3 + y, 1, 1, 3);
      }
      if (i < 0) { chipFace(R, cx, b - 4 - Math.round(CHIP_R * CHIP_FLAT), CHIP_FLAT, true); return; }
      const sy = i === CHIP_FRAMES - 1 ? CHIP_FLAT + 0.2 : CHIP_TURN[i % CHIP_TURN.length];
      chipFace(R, cx, b - 6 - Math.round(CHIP_R * Math.max(sy, 0.06)) - lift, sy, false);
    };
    const armillary = ({ R, w, h }, t) => {
      const cx = w >> 1, cy = h - 50;
      R(cx - 8, h - 4, 16, 4, 1); R(cx - 6, h - 5, 12, 2, 3); R(cx - 1, h - 30, 3, 26, 2); R(cx - 1, h - 30, 1, 26, 4);
      const ring = (rx, ry, c) => { for (let a = 0; a < 6.283; a += 0.08) R(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 1, 1, c); };
      ring(18, 18, 4);
      const ph = Math.floor(t * 4) / 12; // stepped turning
      ring(Math.abs(Math.cos(ph * 2.5)) * 18 + 1, 18, 6);
      ring(18, Math.abs(Math.sin(ph * 1.6)) * 7 + 1, 8);
      R(cx - 4, cy - 4, 8, 8, 1); R(cx - 3, cy - 3, 6, 6, 5); R(cx - 3, cy - 3, 3, 3, 7); R(cx - 1, cy - 26, 2, 6, 8);
    };
    // Stone, lit from the left like the spires: a row of a tapering shaft or a plinth's course,
    // outlined in ink, with a bright edge, a lit face, a shadowed face and a little grit.
    const stone = (R, x0, y, w, top) => {
      R(x0, y, 1, 1, 1); R(x0 + w - 1, y, 1, 1, 1);
      for (let i = 1; i < w - 1; i++) {
        const f = i / w;
        let k = i === 1 ? 5 : f > 0.8 ? 2 : f < 0.5 ? (top ? 5 : 4) : 3;
        if (noise(x0 + i, y) < 0.07) k = Math.max(2, k - 1);
        R(x0 + i, y, 1, 1, k);
      }
    };
    const tiers = (R, cx, b, ws) => { let y = b; for (const [w, h] of ws) { for (let j = 0; j < h; j++) stone(R, cx - (w >> 1), y - j - 1, w, j === h - 1); y -= h; } return y; };
    const glyph = (R, g, x, y, c) => g.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') R(x + i, y + j, 1, 1, c); }));
    // A crystal orb: ink rim, dithered dark glass lit from the upper left, mist spiraling (step),
    // a highlight crescent and glint, and a few specks twinkling inside like stars.
    const crystal = (R, cx, cy, r, step) => {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y) / r;
        if (d > 1) continue;
        let k = 1;
        if (d <= 0.9) {
          const lit = 1 - Math.hypot(x + r * 0.35, y + r * 0.4) / (r * 1.7), a = Math.atan2(y, x), m = Math.sin(a * 2 - d * 7 + step * 0.55);
          k = lit + BAY[(x & 3) + (y & 3) * 4] / 32 > 0.55 ? 3 : 2;
          if (d < 0.82 && m > 0.72) k = d < 0.45 ? 6 : 5; else if (d < 0.82 && m > 0.5) k = 4;
          if (d > 0.55 && d < 0.78 && a > -2.7 && a < -1.7) k = 7;
          if (d > 0.72 && d < 0.88 && a > 0.3 && a < 1.3) k = 4;
        }
        R(cx + x, cy + y, 1, 1, k);
      }
      R(cx - Math.round(r * 0.45), cy - Math.round(r * 0.55), 2, 2, 7);
      for (let i = 0; i < 5; i++) { const a = noise(i, 7) * 6.28, d = noise(i, 9) * r * 0.6; if ((i + step) % 7 < 2) R(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1, 1, 7); }
    };
    // Talon orb: a stepped plinth, a column with two gold bands, a gold cup, the orb, and gold
    // claws curling up round it from either side, with a short one in front.
    const orb = ({ R, w, h }, t) => {
      const cx = w >> 1, top = tiers(R, cx, h, [[38, 3], [30, 3], [14, 2]]), step = Math.floor(t * 6);
      for (let y = top - 1; y > top - 22; y--) stone(R, cx - 5, y, 10, false);
      for (const y of [top - 6, top - 15]) { R(cx - 6, y, 12, 2, 1); R(cx - 5, y, 10, 1, 8); R(cx - 5, y, 1, 1, 7); }
      const cup = top - 22, r = 14, cy = cup - r + 2;
      R(cx - 9, cup - 1, 18, 3, 1); R(cx - 8, cup, 16, 1, 8); R(cx - 8, cup - 1, 6, 1, 7);
      crystal(R, cx, cy, r, step);
      for (const s of [-1, 1]) {
        const pts = [];
        for (let i = 0; i <= 16; i++) { const a = Math.PI / 2 - s * (i / 16) * 2.2; pts.push([cx + Math.cos(a) * (r + 1), cy + Math.sin(a) * (r + 1)]); }
        pts.forEach(([x, y], i) => R(x - 1, y - 1, i < 14 ? 3 : 2, i < 14 ? 3 : 2, 1));
        pts.forEach(([x, y], i) => { R(x, y, i < 14 ? 2 : 1, 1, 8); if (s < 0) R(x, y - 1, 1, 1, 7); });
        const [tx, ty] = pts[16];
        R(tx + s, ty - 1, 1, 1, 1); R(tx, ty - 1, 1, 1, 7);
      }
      R(cx - 2, cy + r - 4, 5, 6, 1); R(cx - 1, cy + r - 3, 3, 4, 8); R(cx - 1, cy + r - 3, 1, 1, 7);
    };
    // Arcana obelisk: a stepped plinth, a tapering rune-cut shaft, a flat gold capstone, and the
    // arcana symbol (2x, ink-outlined) bobbing over it and turning like a coin (squeezed edge-on,
    // a plain gold back on the far side), with sparks circling it; a carved arcana plaque low on
    // the shaft blinks, and now and then a rune flares.
    const arcana = ({ R, w, h }, t) => {
      const cx = w >> 1, top = tiers(R, cx, h, [[38, 4], [30, 4], [24, 3]]), yt = top - 64, step = Math.floor(t * 6);
      for (let y = top - 1; y >= yt; y--) { const sw = Math.round(22 - 8 * (top - y) / 64) | 1; stone(R, cx - (sw >> 1), y, sw, false); }
      for (let j = 0; j < 5; j++) { const cw = 14 - j * 2, x0 = cx - (cw >> 1), y = yt - 1 - j; R(x0, y, 1, 1, 1); for (let i = 1; i < cw - 1; i++) R(x0 + i, y, 1, 1, i < cw / 2 ? 7 : 8); R(x0 + cw - 1, y, 1, 1, 1); }
      R(cx - 3, yt - 6, 7, 1, 1);
      for (let i = 0; i < 5; i++) glyph(R, RUNES[(i + 1) % 6], cx - 1, top - 12 - i * 10, (step + i) % 10 === 0 ? 8 : 2);
      const py = top - 8;
      R(cx - 4, py - 4, 9, 9, 1); R(cx - 3, py - 3, 7, 7, 2);
      glyph(R, ICONS.arcana, cx - 3, py - 3, Math.floor(t * 2) % 2 ? 8 : 4);
      const bob = [0, -1, -2, -2, -1, 0][step % 6], turn = Math.floor(t * 3) % 8, squeeze = [1, 0.7, 0.3, 0.7][turn % 4], back = turn >= 4, cy = yt - 17 + bob;
      const at = (i) => Math.round(cx + (i - 3.5) * 2 * squeeze), cells = [];
      ICONS.arcana.forEach((r, j) => [...r].forEach((_, i) => { if ((back ? r[6 - i] : r[i]) === '#') cells.push([at(i), Math.max(1, at(i + 1) - at(i)), cy - 7 + j * 2, i]); }));
      for (const [x, cw, y] of cells) R(x - 1, y - 1, cw + 2, 4, 1);
      for (const [x, cw, y, i] of cells) R(x, y, cw, 2, back || i >= 3 ? 8 : 7);
      for (let q = 0; q < 4; q++) { const a = q / 4 * 6.283 + step * 0.4; if (Math.sin(a) > -0.2) { R(cx + Math.cos(a) * 12, cy + Math.sin(a) * 3, 1, 1, 7); if (q % 2) R(cx + Math.cos(a) * 12 + 1, cy + Math.sin(a) * 3, 1, 1, 6); } }
    };
    // A landmark's look only changes now and then (an armillary 4 times a second, an orb or
    // obelisk 6, a dice tower when its top die tumbles or lands), so it is repainted only then: a
    // canvas on the 3D board goes back to the GPU each time it is drawn.
    const DRAW = { dice, chips, armillary, orb, arcana };
    const look = ({ k, seed }, t) => {
      if (k === 'armillary') return Math.floor(t * 4);
      if (k === 'orb' || k === 'arcana') return Math.floor(t * 6);
      if (k === 'chips') { const i = chipFrame(t, seed); return i < 0 ? 'rest' : 'F' + i; }
      const beat = t / 5 + seed * 0.37, n = Math.floor(beat);
      return beat - n < 0.1 ? 'T' + Math.floor(t * 12) : n;
    };
    return (t) => {
      for (const m of live) {
        const key = look(m, t);
        if (key === m.key) continue;
        m.key = key;
        m.g.clearRect(0, 0, m.w, m.h);
        DRAW[m.k](m, t);
      }
    };
  }

  /* ---------- standing props: spires, basalt columns, crystals, rune obelisks ---------- */
  /* Spires by ante: of the plain spikes' share, how many become strata spires (stepped ledges),
     and how hot those run. Heat 0 is still stone; at 1 the lower seams glow; at 2 every seam and
     the tip do, and they stand taller. The plain spike never changes. */
  const SPIRE_ANTES = [{ strata: 0.03, heat: 0 }, { strata: 0.07, heat: 1 }, { strata: 0.3, heat: 2 }];
  // Spires and basalt columns per classic board (more on a longer one), and the shortest kept
  // (map units): any shorter only reads as clutter.
  const PROP_MAX = 140, PROP_MIN_H = 36;
  function placeProps(pl, R, C, block, runes, obel, mix, SR) {
    const near = (x, y) => { let m = 1e9; for (const b of block) { const d = Math.hypot(x - b[0], y - b[1]) - b[2]; if (d < m) m = d; } return m; };
    // A prop in front of a path or stop is kept short enough not to hide it.
    const capBehind = (x, y, w) => {
      let cap = 1e9;
      for (const b of block) {
        if (b[1] >= y || Math.abs(b[0] - x) > w / 2 + b[2] + 12) continue;
        cap = Math.min(cap, 16 + 0.65 * Math.max(0, y - b[1] - b[2]));
      }
      return cap;
    };
    const onLava = (x, y, pad) => {
      const l = lavaL(y), r = lavaR(y);
      return Math.abs(x - l.c) < l.w + pad || Math.abs(x - r.c) < r.w + pad || x < l.c || x > r.c;
    };
    const props = [];
    const scale = H / BOARD_BASE; // more board, more props (at most PROP_MAX per classic board: any more and the terrain gets too busy)
    for (let t = 0; t < 3200 * scale && props.length < PROP_MAX * scale; t++) {
      const x = 20 + R() * (W - 40), y = 8 + R() * (H - 16);
      if (onLava(x, y, 8)) continue;
      const d = near(x, y);
      if (d < 0 || props.some((p) => Math.abs(p.x - x) < 9 && Math.abs(p.y - y) < 7)) continue;
      const big = R();
      let h = 16 + Math.min(d, 160) * 0.5 + big * big * big * 170 + R() * 14;
      if (y < 50) h += 60 + R() * 120; // a wall of tall spires along the far edge
      let w = 8 + h * 0.2 * (0.7 + R() * 0.6);
      // One kept too short to stand out (near a path or stop in front of it) is left out instead.
      h = Math.min(h, capBehind(x, y, w));
      if (h < PROP_MIN_H) continue;
      w = Math.min(w, 8 + h * 0.3);
      // Keep it off the rivers (see riverRoom; a basalt column is 1.3x as wide): one near a river
      // is kept short enough that its lean doesn't reach it, or left out.
      const room = riverRoom(x, y, w * 0.65, 0);
      if (room < 0) continue;
      const maxH = room / (LEAN * Math.abs(x - W / 2) / (W / 2));
      h = Math.min(h, maxH);
      if (h < PROP_MIN_H) continue;
      w = Math.min(w, 8 + h * 0.3);
      let k = R() < 0.8 ? 'spike' : 'basalt';
      // Some spikes become the ante's strata spires (their own random stream, so the board lays
      // out the same whatever the ante); heat makes them taller, within the same caps.
      if (k === 'spike' && SR() < mix.strata) {
        k = 'strata';
        h = Math.min(h * (1 + mix.heat * 0.12), capBehind(x, y, w), maxH);
      }
      props.push({ x, y, k, h, w, heat: mix.heat });
    }
    for (let t = 0; t < 40; t++) {
      const y = 40 + R() * (H - 80), left = R() < 0.5, l = left ? lavaL(y) : lavaR(y);
      const x = left ? l.c + l.w + 10 + R() * 8 : l.c - l.w - 10 - R() * 8;
      if (near(x, y) > 0) props.push({ x, y, k: 'crystal', h: 8 + R() * 14, w: 7 + R() * 6 });
    }
    obel.forEach(([x, y]) => props.push({ x, y, k: 'obelisk', h: 86, w: 22 }));
    props.sort((a, b) => a.y - b.y);

    // Props are baked into one pixel canvas per thin depth band (BAND map units), stood up at the
    // band's front edge, instead of one 3D element each: a few dozen layers to composite, not
    // hundreds. Each prop is filled row by row in flat palette colors (1 px = 2 map units).
    const BAND = 16, bands = new Map();
    for (const p of props) {
      const b = Math.floor(p.y / BAND);
      if (!bands.has(b)) bands.set(b, []);
      bands.get(b).push(p);
    }
    const frag = document.createDocumentFragment(), glows = [];
    for (const list of bands.values()) {
      // Each prop's drawn box in canvas pixels (lo..hi across: a strata spire leans up to 2 px),
      // and the canvas that holds them all.
      const shapes = list.map((p) => {
        let { w, h } = p;
        if (p.k === 'basalt') { h *= 0.6; w *= 1.3; }
        const s = { p, w: Math.max(2, Math.round(w / 2)), h: Math.max(2, Math.round(h / 2)), cx: p.x / 2, seed: Math.floor(noise(p.x | 0, p.y | 0) * 1000) };
        const lean = p.k === 'strata' ? 2 : 0;
        s.lo = s.cx - s.w / 2 - lean; s.hi = s.cx + s.w / 2 + lean;
        return s;
      });
      const left = Math.floor(Math.min(...shapes.map((s) => s.lo))) - 1;
      const right = Math.ceil(Math.max(...shapes.map((s) => s.hi))) + 1;
      const tall = Math.max(...shapes.map((s) => s.h));
      const cv = document.createElement('canvas');
      cv.width = right - left; cv.height = tall;
      const x = cv.getContext('2d'), hot = [];
      const fill = (u, v, n, k) => { if (n > 0) { x.fillStyle = k; x.fillRect(u, v, n, 1); } };
      // A glowing pixel: drawn in the accent here, and repainted by the heat crawl (see heatTick).
      const glow = (u, v) => { u = Math.round(u); v = Math.round(v); fill(u, v, 1, C[8]); hot.push([u, v]); };
      for (const s of shapes) {
        const { p } = s, u0 = Math.round(s.cx - s.w / 2) - left, top = tall - s.h;
        propArt(fill, glow, C, lvl(lightAt(p.x, p.y), p.x | 0, p.y | 0), p.k, s.cx - left, top, s.w, s.h, s.seed, p.heat);
        if (p.k === 'obelisk') pix(cv, RUNE, { '#': C[4] }, u0 + 3, top + 14);
      }
      const back = Math.max(...list.map((p) => p.y));
      const el = document.createElement('div');
      el.className = 'rm-st rm-band';
      el.style.cssText = `left:${left * 2}px;top:${back - tall * 2}px;width:${cv.width * 2}px;height:${tall * 2}px`;
      el.appendChild(cv);
      // A band holding hot spires gets a clear canvas over it for the heat crawl.
      if (hot.length) {
        const gv = document.createElement('canvas');
        gv.width = cv.width; gv.height = cv.height;
        el.appendChild(gv);
        glows.push({ g: gv.getContext('2d'), w: gv.width, h: gv.height, hot });
      }
      frag.appendChild(el);
    }
    pl.appendChild(frag);
    // The heat crawl: every glowing pixel is the accent, with a lighter stripe climbing through it
    // 4 steps a second, like the lava's churn; flat colors, only redrawn when the step changes.
    let last = -1;
    return (t) => {
      const step = Math.floor(t * 4);
      if (step === last || !glows.length) return;
      last = step;
      for (const { g, w, h, hot } of glows) {
        g.clearRect(0, 0, w, h);
        for (const [u, v] of hot) { g.fillStyle = C[((v + step) % 6 + 6) % 6 < 2 ? 7 : 8]; g.fillRect(u, v, 1, 1); }
      }
    };
  }

  /* One standing prop, painted row by row in flat palette colors: kind k ('spike', 'basalt',
     'strata', 'crystal' or 'obelisk'), centered on cx with its top row at `top` (canvas px), w by h.
     l is the light level at its foot (0..3, see lvl); fill(u, v, n, color) paints a run of pixels
     and glow(u, v) a hot one (strata seams). Bone Draft's ruins (js/draft.js) stand their spires
     up with this too. */
  function propArt(fill, glow, C, l, k, cx, top, w, h, seed, heat) {
    const hi = C[l + 1], li = C[Math.max(1, l)], dk = C[Math.max(0, l - 1)], u0 = Math.round(cx - w / 2);
    if (k === 'strata') return strata(fill, glow, cx, top, w, h, seed, heat, [hi, li, dk, C[Math.min(7, l + 2)]]);
    // Columns across the prop's width: [end fraction, color], as the old gradients were.
    const tones = k === 'spike' ? [[0.14, hi], [0.5, li], [1, dk]]
      : k === 'basalt' ? [[1 / 3, hi], [2 / 3, li], [1, dk]]
      : k === 'crystal' ? [[0.5, C[7]], [1, C[8]]]
      : [[0.5, C[2]], [1, C[1]]];
    for (let r = 0; r < h; r++) {
      const f = (r + 0.5) / h; // 0 at the top, 1 at the base
      // The silhouette's half-width at this row, as a fraction of the prop's width.
      const half = k === 'spike' || k === 'crystal' ? f / 2
        : k === 'basalt' ? (f < 0.08 ? 0.5 * (f / 0.08) : 0.5)
        : (f < 0.12 ? 0.5 * (f / 0.12) : 0.5);
      const a = Math.round(w * (0.5 - half)), b = Math.round(w * (0.5 + half));
      let from = a;
      for (const [end, c] of tones) { const to = Math.min(b, Math.round(w * end)); fill(u0 + from, top + r, to - from, c); from = Math.max(from, to); }
    }
  }

  /* A strata spire, stepped in five courses that widen down to its base, leaning a little; its
     top row at `top`, centred on cx (canvas px). Each course's exposed ledge catches the light;
     with heat, the seam under the ledges glows (the lower courses at heat 1, all and the tip at 2).
     T: [lit, mid, shadow, ledge] tones. */
  function strata(fill, glow, cx, top, w, h, seed, heat, T) {
    const n = 5, lean = (r) => Math.round((1 - (r + 0.5) / h) * (seed % 2 ? 2 : -2));
    for (let r = 0; r < h; r++) {
      const f = (r + 0.5) / h, band = Math.ceil(f * n), half = Math.max(0.5, w / 2 * band / n - (noise(seed, band) < 0.5 ? 1 : 0));
      const a = Math.round(cx - half), b = Math.round(cx + half), y = top + r, ledge = Math.ceil(((r + 1.5) / h) * n) > band;
      for (let u = a; u <= b; u++) {
        const q = (u - a) / (b - a + 1);
        fill(u + lean(r), y, 1, ledge ? (q < 0.6 ? T[3] : T[1]) : q < 0.18 ? T[0] : q < 0.55 ? T[1] : T[2]);
      }
      if (ledge && r < h - 1 && (heat === 2 || (heat === 1 && f > 0.5))) {
        for (let u = a + 1; u <= b - 1; u += 2) glow(u + lean(r + 1), y + 1);
      }
    }
    if (heat === 2) glow(cx + lean(0), top);
  }

  /* ---------- the animated layer: lava, rune circles, orbit arcs ---------- */
  /* The arcs don't change while the map is up, so they're painted once onto the static ground;
     each animation frame only redraws the lava (one pixel buffer, one putImageData), the turning
     rune circles, the moons circling reachable stops, and a comet running each live arc.
     Nobody walks the arcs (the slingshot flings you), so one you've flown stays drawn in solid
     rather than worn. Rings are the stops: [x, y, reachable]. */
  const ORB = { rx: 26, ry: 10 }; // a reachable stop's orbit ring, canvas px: just wider than its beacon
  /* One lava pixel: d is how far across the river it lies (0 mid, 1 the bank; crust past that),
     u along the flow and v across it, in canvas px. Also the VS screen's river (vsBackdrop). */
  const lavaPx = (d, u, v, t, crust, hot, glow) => (d > 1 ? crust
    : d > 0.4 ? (Math.sin(u * 0.21 - t * 2.2 + v) > 0.8 ? hot : glow)
    : (Math.sin(u * 0.35 - t * 3 + v * 0.6) > 0.5 ? hot : glow));
  /* Rising embers on a 640x360 overlay canvas: call once per ~80ms tick; it clears the canvas. */
  function emberDrawer(em, C) {
    const ex = em.getContext('2d'), embers = [];
    return () => {
      ex.clearRect(0, 0, em.width, em.height);
      if (embers.length < 50) embers.push({ x: Math.random() * em.width, y: em.height + 2, v: 0.3 + Math.random() * 0.8, a: Math.random() * 6, l: 1 });
      for (let i = embers.length - 1; i >= 0; i--) {
        const p = embers[i];
        p.y -= p.v * 3; p.a += 0.3; p.x += Math.sin(p.a) * 0.6; p.l -= 0.012;
        if (p.l <= 0) { embers.splice(i, 1); continue; }
        ex.fillStyle = p.l > 0.5 ? C[7] : C[8];
        ex.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }
      return ex;
    };
  }
  function fxDrawer(fx, ground, C, edges, runes, live, attuned, rings) {
    const lineOn = (ctx) => (p0, p1, w, c) => {
      ctx.fillStyle = c;
      const x0 = p0[0] / 2, y0 = p0[1] / 2, dx = p1[0] / 2 - x0, dy = p1[1] / 2 - y0, n = Math.max(Math.abs(dx), Math.abs(dy), 1), o = w >> 1;
      for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(x0 + dx * i / n) - o, Math.round(y0 + dy * i / n) - o, w, w);
    };
    const dot = (ctx, q, c, w = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(q[0] / 2) - (w >> 1), Math.round(q[1] / 2) - (w >> 1), w, w); };
    // Painted once: flown arcs solid (bright on a dark edge), live arcs finely dotted, the rest
    // sparsely dotted, and a dotted orbit round each reachable stop.
    const gl = lineOn(ground);
    for (const e of edges) {
      e.d = sample(e.p, 2); // one point per canvas pixel
      if (attuned.has(e.i)) {
        for (const w of [3, 1]) for (let i = 1; i < e.p.length; i++) gl(e.p[i - 1], e.p[i], w, C[w === 3 ? 1 : 7]);
      } else e.d.forEach((q, i) => { if (i % (live.has(e.i) ? 3 : 5) === 0) dot(ground, q, C[1], 2); });
    }
    for (const [x, y, on] of rings) if (on) {
      ground.fillStyle = C[8];
      for (let k = 0; k < 48; k += 2) { const a = k / 48 * 6.283; ground.fillRect(Math.round(x / 2 + Math.cos(a) * ORB.rx), Math.round(y / 2 + Math.sin(a) * ORB.ry), 2, 1); }
    }
    // Lava goes through a reused pixel buffer. The rivers never move, only their colors churn, so
    // each row's span is worked out once, the rest of the buffer stays clear for good, and each
    // frame copies just the two narrow strips the rivers run in onto the layer.
    const img = fx.createImageData(CW, CH), buf = new Uint32Array(img.data.buffer);
    const u32 = (h) => { const [r, g, b] = rgb(h); return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; };
    const crust = u32(C[1]), hot = u32(C[7]), glow = u32(C[8]);
    const river = (f) => {
      const rows = [];
      let x0 = CW, x1 = 0;
      for (let y = 0; y < CH; y++) {
        const { c, w } = f(y * 2), cc = c / 2, ww = w / 2, a = Math.max(0, Math.floor(cc - ww - 2)), b = Math.min(CW - 1, Math.floor(cc + ww + 2));
        rows.push([cc, ww, a, b]);
        x0 = Math.min(x0, a); x1 = Math.max(x1, b);
      }
      return { rows, x0, x1 };
    };
    const rivers = [river(lavaL), river(lavaR)];
    const lava = ({ rows }, t) => {
      for (let y = 0; y < CH; y++) {
        const [cc, ww, a, b] = rows[y];
        for (let x = a; x <= b; x++) {
          buf[y * CW + x] = lavaPx(Math.abs(x - cc) / ww, y, x, t, crust, hot, glow);
        }
      }
    };
    const line = lineOn(fx);
    const rune = (cx, cy, t) => {
      const X = cx / 2, Y = cy / 2;
      fx.fillStyle = C[2];
      for (let k = 0; k < 48; k++) { const a = k / 48 * 6.283; fx.fillRect(Math.round(X + Math.cos(a) * 13), Math.round(Y + Math.sin(a) * 13), 1, 1); }
      for (let k = 0; k < 3; k++) {
        const a = k / 3 * 6.283 - t * 0.4;
        line([cx + Math.cos(a) * 14, cy + Math.sin(a) * 14], [cx + Math.cos(a + 2.09) * 14, cy + Math.sin(a + 2.09) * 14], 1, C[2]);
      }
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * 6.283 + t * 0.7, px = Math.round(X + Math.cos(a) * 10), py = Math.round(Y + Math.sin(a) * 10);
        fx.fillStyle = Math.sin(a) > 0 ? C[8] : C[1];
        fx.fillRect(px - 1, py, 3, 1); fx.fillRect(px, py - 1, 1, 3);
      }
    };
    const comets = edges.filter((e) => live.has(e.i));
    return (t) => {
      fx.clearRect(0, 0, CW, CH);
      lava(rivers[0], t);
      lava(rivers[1], t + 3);
      for (const { x0, x1 } of rivers) fx.putImageData(img, 0, 0, x0, 0, x1 - x0 + 1, CH);
      runes.forEach(([x, y]) => rune(x, y, t));
      // A comet runs each live arc toward its stop, its tail stepping down in flat palette tones.
      for (const e of comets) {
        const h = Math.floor(t * 30) % (e.d.length + 20);
        for (let k = 0; k < 16; k++) {
          const q = e.d[h - k];
          if (!q) continue;
          if (k === 0) { dot(fx, q, C[1], 4); dot(fx, q, C[8], 2); }
          else if (k < 6) dot(fx, q, C[8], 2);
          else if (k < 10 || k % 2 === 0) dot(fx, q, C[7], k < 10 ? 2 : 1);
        }
      }
      // A small moon goes round each reachable stop; its beacon hides it as it passes behind.
      for (const [x, y, on] of rings) if (on) {
        const a = t * 1.6 + x;
        dot(fx, [x + Math.cos(a) * ORB.rx * 2, y + Math.sin(a) * ORB.ry * 2], C[1], 4);
        dot(fx, [x + Math.cos(a) * ORB.rx * 2, y + Math.sin(a) * ORB.ry * 2], C[7], 2);
      }
    };
  }

  /* ---------- the sky behind the table: an orrery in a nebula ---------- */
  /* Huge tilted orbits centered behind the casino, planets crawling along them, and a nebula
     dithered in the two darkest tones that drifts between them: each orbit has swept a clear lane
     through the clouds. Drawn at a third of screen resolution into one pixel buffer; the canvas
     follows the screen's size, so its pixels stay square. */
  /* Parallax: as the camera travels the board, the sky follows it more slowly, in two depths:
     the nebula and orrery far off (SKY_FAR), the stars a little nearer (SKY_NEAR). Factors are
     sky px per map unit of camera travel; the sky eases to where the camera has gone, each
     layer stepped to whole sky pixels. The cloud mask is worked out over a margin (SKY_PAD) round
     the screen so the far layer has room to move; the stars wrap round. */
  const SKY = 3, SKY_FAR = 0.04, SKY_NEAR = 0.07, SKY_PAD = 96; // screen px per sky pixel; see above
  function skyDrawer(cv, C) {
    const g = cv.getContext('2d');
    const u32 = (h) => { const [r, gg, b] = rgb(h); return ((255 << 24) | (b << 16) | (gg << 8) | r) >>> 0; };
    const U = C.map(u32), P = SKY_PAD;
    let w = 0, h = 0, LW = 0, img, buf, lane, stars, rings, cx, cy, cam0 = null, ex = 0, ey = 0;
    let cA, sQ, cQ, sR, cR, sP, cP, sS, cS; // the nebula's per-column and per-row sines
    const fit = () => {
      const nw = Math.max(1, Math.round(cv.clientWidth / SKY)), nh = Math.max(1, Math.round(cv.clientHeight / SKY));
      if (nw === w && nh === h) return;
      w = cv.width = nw; h = cv.height = nh; LW = w + P * 2;
      img = g.createImageData(w, h); buf = new Uint32Array(img.data.buffer);
      [cA, sQ, cQ, sR, cR] = Array.from({ length: 5 }, () => new Float64Array(w));
      [sP, cP, sS, cS] = Array.from({ length: 4 }, () => new Float64Array(h));
      const s = w / 320;
      cx = w / 2; cy = h * 0.17;
      rings = Array.from({ length: 8 }, (_, i) => (50 + i * 36) * s);
      // How much cloud each pixel may hold: none on an orbit, rising to full a little way off it
      // (0..1); 2 marks pixels well between orbits, where the clouds also bank up thicker.
      lane = new Float32Array(LW * (h + P * 2));
      for (let y = -P; y < h + P; y++) for (let x = -P; x < w + P; x++) {
        const r = Math.hypot(x - cx, (y - cy) / 0.32);
        let m = 1e9;
        for (const R of rings) m = Math.min(m, Math.abs(r - R));
        m /= s;
        lane[(y + P) * LW + x + P] = m > 14 ? 2 : Math.min(1, m / 9);
      }
      const R = mulberry32(99);
      stars = Array.from({ length: Math.round(w * h / 510) }, () => ({ x: R() * w | 0, y: R() * h | 0, k: 1 + (R() * 3 | 0) }));
    };
    const set = (x, y, k) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < w && y >= 0 && y < h) buf[y * w + x] = U[k]; };
    const box = (x, y, bw, bh, k) => { for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) set(x + i, y + j, k); };
    // t in seconds; camX, camY: the camera's slide across and along the board (map units).
    return (t, camX = 0, camY = 0) => {
      fit();
      if (!cam0) cam0 = [camX, camY];
      ex += (camX - cam0[0] - ex) * 0.3; ey += (camY - cam0[1] - ey) * 0.3;
      const fx = Math.max(-P, Math.min(P, Math.round(ex * SKY_FAR))), fy = Math.max(-P, Math.min(P, Math.round(ey * SKY_FAR)));
      const nx = Math.round(ex * SKY_NEAR), ny = Math.round(ey * SKY_NEAR);
      // The nebula is three sine waves: sin(a(x)) + sin(p(y) - q(x)) + 1.2 sin(r(x) + s(y)) - 0.4.
      // Split by angle-sum identities, every sine is worked out once per column or row, not per
      // pixel (a whole-screen nebula at three sines a pixel was most of the map's frame time).
      const d = t * 2, k = 320 / w;
      for (let x = 0; x < w; x++) {
        const xs = (x - fx) * k;
        cA[x] = Math.sin(xs * 0.02 + d * 0.05);
        sQ[x] = Math.sin(xs * 0.01); cQ[x] = Math.cos(xs * 0.01);
        sR[x] = Math.sin(xs * 0.013 + 1.7); cR[x] = Math.cos(xs * 0.013 + 1.7);
      }
      for (let y = 0; y < h; y++) {
        const ys = (y - fy) * k;
        sP[y] = Math.sin(ys * 0.035 + d * 0.03); cP[y] = Math.cos(ys * 0.035 + d * 0.03);
        sS[y] = Math.sin(ys * 0.013); cS[y] = Math.cos(ys * 0.013);
      }
      for (let y = 0; y < h; y++) {
        const sp = sP[y], cp = cP[y], ss = sS[y], cs = cS[y], row = (y - fy + P) * LW - fx + P, by = (y & 3) * 4;
        for (let x = 0; x < w; x++) {
          const n = cA[x] + sp * cQ[x] - cp * sQ[x] + 1.2 * (sR[x] * cs + cR[x] * ss) - 0.4;
          const l = lane[row + x], c = Math.floor(Math.max(0, n * Math.min(1, l) + (l > 1 ? 0.35 : 0)) * 1.4 + BAY[(x & 3) + by] / 16);
          buf[y * w + x] = U[c >= 2 ? 2 : c >= 1 ? 1 : 0];
        }
      }
      // Stars (the near layer, wrapping round): the dim ones, plus a few twinkling into crosses.
      stars.forEach((st, i) => {
        const tw = (i * 7 + Math.floor(t * 3)) % 29 === 0;
        if (st.k > 1 && !tw) return;
        const sx = ((st.x + nx) % w + w) % w, sy = ((st.y + ny) % h + h) % h;
        set(sx, sy, tw ? 5 : st.k);
        if (tw) { set(sx - 1, sy, 3); set(sx + 1, sy, 3); set(sx, sy - 1, 3); set(sx, sy + 1, 3); }
      });
      // The orbits (far layer), each with its planet (one in the accent, one with a moon), and the sun.
      const ox = cx + fx, oy = cy + fy;
      rings.forEach((rx, i) => {
        const ry = rx * 0.32;
        for (let a = 0, j = 0; a < 6.283; a += 1.5 / rx, j++) if (j % 2 === 0) set(ox + Math.cos(a) * rx, oy + Math.sin(a) * ry, i % 2 ? 2 : 3);
        const a = i * 1.7 + t * (0.6 / (1 + i * 0.6)), px = Math.round(ox + Math.cos(a) * rx), py = Math.round(oy + Math.sin(a) * ry), sz = 2 + (i * 5 % 3);
        box(px - (sz >> 1) - 1, py - (sz >> 1) - 1, sz + 2, sz + 2, 1);
        box(px - (sz >> 1), py - (sz >> 1), sz, sz, i === 3 ? 8 : 3 + (i % 2));
        if (i === 5) set(px + Math.cos(t * 2) * 6, py + Math.sin(t * 2) * 2, 4);
      });
      box(ox - 7, oy - 7, 14, 14, 1); box(ox - 6, oy - 6, 12, 12, 4); box(ox - 4, oy - 4, 8, 8, 5);
      g.putImageData(img, 0, 0);
    };
  }

  /* The VS screen's backdrop (ui.js vsSplash): the sky behind the table, above a slow lava river
     with a rock bank at each side (the slingshots stand on them), a floating rock for each
     fighter, embers rising, and the table's obsidian rim along the bottom. The river and rocks
     are one 640x360 pixel buffer (the run map's lava scale); `rock(i, t)` is where rock i's
     top-center is right now, as fractions of the screen, since the rocks bob and the fighters
     and dice ride them. */
  const VSB = { w: 640, h: 360, bank: 236, river: 256, rockTop: 262, rockW: 120, rockH: 22, rim: 10, slow: 0.3 };
  const VS_ROCKS = [{ x: 0.34, ph: 0 }, { x: 0.66, ph: 2.1 }];
  function vsBackdrop(skyCv, lavaCv, emCv, C) {
    const sky = skyDrawer(skyCv, C), embers = emberDrawer(emCv, C);
    const { w, h } = VSB, g = lavaCv.getContext('2d'), img = g.createImageData(w, h), buf = new Uint32Array(img.data.buffer);
    const U = C.map((hx) => { const [r, gg, b] = rgb(hx); return ((255 << 24) | (b << 16) | (gg << 8) | r) >>> 0; });
    const set = (x, y, k) => { if (x >= 0 && x < w && y >= 0 && y < h) buf[y * w + x] = U[k]; };
    const top = (x) => Math.round(VSB.river + Math.sin(x * 0.035) * 3 + Math.sin(x * 0.095 + 1) * 2);
    const bankEdge = (y) => Math.round(92 + (y - VSB.bank) * 0.4 + Math.sin(y * 0.3) * 3);
    const bob = (i, t) => Math.round(Math.sin(t * 1.2 + VS_ROCKS[i].ph) * 2);
    const rock = (i, t) => ({ x: VS_ROCKS[i].x, y: (VSB.rockTop + bob(i, t)) / h });
    const draw = (t) => {
      sky(t);
      buf.fill(0);
      const lt = t * VSB.slow, bottom = h - VSB.rim;
      // The river: the run map's lava churn, flowing sideways (a crust line along its top).
      for (let x = 0; x < w; x++) {
        const y0 = top(x), mid = (y0 + bottom) / 2, half = (bottom - y0) / 2 - 1;
        for (let y = y0; y < bottom; y++) buf[y * w + x] = lavaPx(Math.abs(y - mid) / half, x, y, lt, U[1], U[7], U[8]);
      }
      // The banks, mirrored: a lit lip, then rock down to the rim.
      for (let y = VSB.bank; y < bottom; y++) {
        const e = bankEdge(y);
        for (let x = 0; x < e; x++) { const k = y === VSB.bank ? 2 : x === e - 1 ? 2 : 1; set(x, y, k); set(w - 1 - x, y, k); }
      }
      // The fighters' rocks: flat tops, lit, tapering under, bobbing out of step.
      VS_ROCKS.forEach((r, i) => {
        const y0 = VSB.rockTop + bob(i, t), x0 = Math.round(r.x * w - VSB.rockW / 2);
        for (let j = 0; j < VSB.rockH; j++) {
          const inset = Math.max(0, j - 10) * 3;
          for (let k = inset; k < VSB.rockW - inset; k++) set(x0 + k, y0 + j, j < 2 ? 3 : j < 6 ? 2 : k < inset + 2 || k > VSB.rockW - inset - 3 ? 0 : 1);
        }
        for (let k = 6; k < VSB.rockW - 6; k += 14) { set(x0 + k, y0 + 2, 4); set(x0 + k + 1, y0 + 2, 4); }
      });
      // The table's rim, a hint of it: obsidian with a lit edge and gold corner fittings.
      for (let x = 0; x < w; x++) { set(x, bottom, 2); set(x, bottom + 1, 2); set(x, bottom + 2, 0); for (let y = bottom + 3; y < h; y++) set(x, y, 1); }
      for (const x0 of [0, w - 14]) for (let j = 0; j < VSB.rim + 2; j++) for (let k = 0; k < 14; k++) set(x0 + k, bottom - 2 + j, j > 2 && j < 5 && k > 3 && k < 10 ? 6 : 8);
      for (let x = 48; x < w - 40; x += 64) for (let j = 0; j < 2; j++) { set(x, bottom + 5 + j, 8); set(x + 1, bottom + 5 + j, 8); }
      g.putImageData(img, 0, 0);
      embers();
    };
    return { draw, rock };
  }

  /* The boss stop: the Dealer's casino, a palace-and-tower resort standing up on the 3D board.
     At the back, a glass hotel tower crowned with a curved CASINO sign. In front, a white palace
     podium with arches and gold trim, onion domes on its roof and a minaret at each front corner.
     Flat parts (roofs) are top-down art lifted to their height; upright parts are standees like
     the spires. Gold is the palette accent. When reachable, the entrance arch and carpet light up.
     Canvas sizes are in pixels; 1 px = 2 map units. */
  const SIGN = {
    C: ['###', '#..', '#..', '#..', '###'], A: ['###', '#.#', '###', '#.#', '#.#'], S: ['###', '#..', '###', '..#', '###'],
    I: ['###', '.#.', '.#.', '.#.', '###'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'], O: ['###', '#.#', '#.#', '#.#', '###'],
    B: ['##.', '#.#', '##.', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
    V: ['#.#', '#.#', '#.#', '#.#', '.#.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  };
  const CAS = { W: 100, D: 36, towerX: 20, towerW: 60, towerD: 15, towerH: 72, podD: 21, podH: 22 };
  /* A palette-indexed pixel canvas: draw(rect, px, ctx) paints it. */
  function paint(w, h, C, draw) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const x = cv.getContext('2d');
    const rect = (u, v, rw, rh, k) => { x.fillStyle = C[k]; x.fillRect(u, v, rw, rh); };
    draw(rect, (u, v, k) => rect(u, v, 1, 1, k), x);
    return cv;
  }
  const signText = (rect, word, u0, v0, k) => {
    for (const ch of word) {
      const g = SIGN[ch];
      g.forEach((row, j) => [...row].forEach((c, i) => { if (c === '#') rect(u0 + i * 2, v0 + j * 2, 2, 2, k); }));
      u0 += g[0].length * 2 + 2;
    }
  };
  const signWidth = (word) => [...word].reduce((a, ch) => a + SIGN[ch][0].length * 2 + 2, -2);

  /* Glass curtain wall: mullions, floor lines, a scatter of lit rooms. */
  const towerFace = (C) => paint(CAS.towerW, CAS.towerH, C, (rect, px) => {
    rect(0, 0, CAS.towerW, CAS.towerH, 3);
    for (let v = 4; v < CAS.towerH; v += 4) rect(0, v, CAS.towerW, 1, 4);
    for (let u = 3; u < CAS.towerW; u += 4) rect(u, 0, 1, CAS.towerH, 2);
    for (let v = 5; v < CAS.towerH - 4; v += 4) for (let u = 4; u < CAS.towerW - 3; u += 4) if ((u * 31 + v * 17) % 7 === 0) rect(u, v, 3, 3, 7);
    rect(0, 0, 2, CAS.towerH, 5); rect(CAS.towerW - 2, 0, 2, CAS.towerH, 2); rect(0, 0, CAS.towerW, 2, 5);
  });
  const towerRoof = (C) => paint(CAS.towerW, CAS.towerD, C, (rect) => {
    rect(0, 0, CAS.towerW, CAS.towerD, 3); rect(1, 1, CAS.towerW - 2, CAS.towerD - 2, 2);
    rect(8, 4, 6, 5, 4); rect(46, 5, 6, 4, 4);
  });
  /* The crown: a sign plate whose top curves up in the middle, CASINO across it. */
  const crown = (C) => paint(70, 20, C, (rect, px) => {
    for (let u = 0; u < 70; u++) {
      const t = (u - 34.5) / 34.5, top = Math.round(6 * t * t);
      rect(u, top, 1, 20 - top, 6);
      px(u, top, 1); px(u, 19, 1);
      if (top + 1 < 19) px(u, top + 1, 8);
    }
    rect(0, 6, 1, 14, 1); rect(69, 6, 1, 14, 1);
    rect(1, 17, 68, 2, 5);
    signText(rect, 'CASINO', 35 - Math.ceil(signWidth('CASINO') / 2), 6, 8);
  });
  /* The palace front: gold cornice, arcade of arches, a big entrance arch in the middle. */
  const podiumFace = (C, lit) => paint(CAS.W, CAS.podH, C, (rect, px) => {
    rect(0, 0, CAS.W, CAS.podH, 6);
    rect(0, 0, CAS.W, 2, 8); rect(0, 2, CAS.W, 1, 1);
    for (let u = 0; u < CAS.W; u += 4) rect(u, 0, 2, 1, 7);               // crenels
    const arch = (u, w, h, k) => {                                        // round-topped opening
      for (let i = 0; i < w; i++) {
        const d = Math.abs(i - (w - 1) / 2) / (w / 2), cut = Math.round((1 - Math.sqrt(1 - Math.min(1, d * d))) * (w / 2));
        rect(u + i, CAS.podH - 2 - h + cut, 1, h - cut, k);
      }
    };
    for (let u = 4; u < CAS.W - 4; u += 10) if (Math.abs(u + 3 - CAS.W / 2) > 12) { arch(u - 1, 8, 13, 8); arch(u, 6, 12, 2); }
    arch(CAS.W / 2 - 9, 18, 18, 8);
    arch(CAS.W / 2 - 8, 16, 17, lit ? 8 : 0);
    rect(0, CAS.podH - 2, CAS.W, 2, 4);
  });
  const podiumRoof = (C) => paint(CAS.W, CAS.podD, C, (rect) => {
    rect(0, 0, CAS.W, CAS.podD, 4); rect(1, 1, CAS.W - 2, CAS.podD - 2, 6);
    for (let u = 4; u < CAS.W; u += 6) rect(u, 1, 1, CAS.podD - 2, 5);
  });
  /* An onion dome on a drum: gold finial, shaded bulb with gold scallops, gold neck ring. */
  const dome = (C, w, h) => paint(w, h, C, (rect, px) => {
    const c = (w - 1) / 2, r = (w - 1) / 2, f = Math.round(h * 0.14), b = Math.round(h * 0.68);
    for (let v = 0; v < f; v++) px(c, v, 8);
    rect(c - 1, f - 2, 3, 2, 8);
    const row = (v, hw, fill) => {
      for (let u = Math.round(c - hw); u <= Math.round(c + hw); u++) {
        const edge = u === Math.round(c - hw) || u === Math.round(c + hw);
        px(u, v, edge ? 1 : fill(u, v));
      }
    };
    for (let v = f; v < b; v++) {
      const t = (v - f) / (b - f);
      const hw = Math.max(0.5, r * (t < 0.65 ? Math.sin((t / 0.65) * Math.PI / 2) ** 1.8 : Math.cos(((t - 0.65) / 0.35) * Math.PI / 2) ** 0.6));
      row(v, hw, (u) => (t > 0.8 && (u + v) % 3 === 0 ? 8 : u < c - hw / 3 ? 7 : u < c + hw / 3 ? 6 : 5));
    }
    row(b, r * 0.45, () => 8); row(b + 1, r * 0.5, () => 8);
    for (let v = b + 2; v < h; v++) row(v, r * 0.62, (u) => (v > b + 3 && v < h - 2 && Math.round(u - c) % 3 === 0 ? 2 : u < c ? 6 : 5));
  });
  /* A minaret: small onion top, a slim shaft with two gold balconies. */
  const minaret = (C) => paint(9, 60, C, (rect, px, x) => {
    x.drawImage(dome(C, 9, 16), 0, 0);
    rect(2, 16, 5, 44, 6); rect(2, 16, 1, 44, 7); rect(6, 16, 1, 44, 5);
    for (const v of [26, 42]) { rect(0, v, 9, 2, 8); rect(0, v + 2, 9, 1, 1); }
    for (const v of [20, 32, 48]) rect(4, v, 1, 3, 2);
    rect(0, 58, 9, 2, 4);
  });
  const casinoCarpet = (C, lit) => paint(8, 4, C, (rect) => { rect(0, 0, 8, 4, 1); rect(1, 0, 6, 4, lit ? 8 : 5); });

  /* The casino's lights, repainted over its standees each frame: marquee bulbs chasing round the
     crown and along the palace cornice, CASINO lighting letter by letter and then flashing, the
     tower's rooms switching on and off, and the minarets' balcony lamps blinking in turn.
     Every light is a flat palette color, on or off; nothing fades. */
  function casinoLights(C, { face, sign, pod, mins }) {
    const pen = (cv) => { const x = cv.getContext('2d'); return (u, v, w, h, k) => { x.fillStyle = C[k]; x.fillRect(u, v, w, h); }; };
    const F = pen(face), S = pen(sign), P = pen(pod), M = mins.map(pen);
    const rooms = [];
    for (let v = 5; v < CAS.towerH - 4; v += 4) for (let u = 4; u < CAS.towerW - 3; u += 4) if ((u * 31 + v * 17) % 3 === 0) rooms.push([u, v]);
    const bulbs = [];
    for (let u = 2; u < 68; u += 3) bulbs.push([u, Math.round(6 * ((u - 34.5) / 34.5) ** 2) + 1]);
    const letters = [];
    let lu = 35 - Math.ceil(signWidth('CASINO') / 2);
    for (const ch of 'CASINO') { letters.push([ch, lu]); lu += SIGN[ch][0].length * 2 + 2; }
    // Everything below keys off a 6-a-second step, so the lights are only repainted when it ticks
    // over (a canvas on the 3D board goes back to the GPU each time it is drawn).
    let last = -1;
    return (time) => {
      const step = Math.floor(time * 6), t = step / 6;
      if (step === last) return;
      last = step;
      // Crown: bulbs chase along its top edge and across its foot, in opposite directions.
      bulbs.forEach(([u, v], i) => S(u, v, 1, 1, ((i - step) % 3 + 3) % 3 === 0 ? 7 : 8));
      for (let u = 2, i = 0; u < 68; u += 3, i++) S(u, 17, 1, 1, ((i + step) % 3 + 3) % 3 === 0 ? 7 : 4);
      // CASINO: letters light one by one, hold, flash, hold.
      const p = step % 22;
      letters.forEach(([ch, u], i) => signText(S, ch, u, 6, p < 6 ? (i <= p ? 8 : 5) : p >= 10 && p < 16 ? (p % 2 ? 7 : 8) : 8));
      // Cornice: every third crenel lamp lit, chasing.
      for (let u = 0, i = 0; u < CAS.W; u += 4, i++) P(u, 0, 2, 1, ((i + step) % 3 + 3) % 3 === 0 ? 7 : 8);
      // Tower rooms: each switches on or off now and then, on its own beat.
      for (const [u, v] of rooms) {
        const beat = Math.floor(t * 0.7 + ((u * 13 + v * 7) % 10) / 10);
        F(u, v, 3, 3, (u * 7 + v * 13 + beat * 29) % 11 < 4 ? 7 : 3);
      }
      // Minarets: the upper and lower balconies take turns.
      const up = Math.floor(t * 2) % 2 === 0;
      M.forEach((m) => { for (const [v, on] of [[26, up], [42, !up]]) for (const u of [1, 4, 7]) m(u, v, 1, 1, on ? 7 : 8); });
    };
  }

  /* The boss stop by ante: the casino on the first, the Great Dome observatory from the second on. */
  const BOSS_HOUSES = ['casino', 'observatory'];

  /* The Great Dome: the Dealer's observatory, on the casino's footprint. A pale stone drum on a
     stepped plinth, its name across a frieze under a gold cornice, arched windows and the casino's
     entrance arch; on its roof, a dome whose shutter slit swings from side to side, a telescope
     poking out of it. An armillary on a pillar stands just outside each front corner.
     Canvas sizes in pixels; 1 px = 2 map units. */
  const OBS = { W: 84, H: 42, drumW: 76, roofD: 30, domeW: 96, domeH: 50, domeR: 33, armW: 26, armH: 44 };
  // A row of pale stone lit from the left: ink ends, a bright edge, lit, mid and shadow faces, grit.
  const paleStone = (px, x0, y, w, top) => {
    px(x0, y, 1); px(x0 + w - 1, y, 1);
    for (let i = 1; i < w - 1; i++) {
      const f = i / w;
      let k = i === 1 ? 7 : f < 0.5 ? (top ? 7 : 6) : f < 0.82 ? 5 : 4;
      if (noise(x0 + i, y) < 0.06) k = Math.max(3, k - 1);
      px(x0 + i, y, k);
    }
  };
  // A round-topped opening, centred on cx, standing on by.
  const archAt = (rect, cx, by, w, h, k) => {
    for (let i = 0; i < w; i++) {
      const d = Math.abs(i - (w - 1) / 2) / (w / 2), cut = Math.round((1 - Math.sqrt(1 - Math.min(1, d * d))) * (w / 2));
      rect(cx - w / 2 + i, by - h + cut, 1, h - cut, k);
    }
  };
  const STAR5 = ['..#..', '.###.', '#####', '.###.', '..#..'];
  /* The drum's front: plinth, coursed stone, frieze and cornice, windows, the entrance arch. */
  const obsFace = (C, lit) => paint(OBS.W, OBS.H, C, (rect, px) => {
    const cx = OBS.W / 2, gy = OBS.H, hw = OBS.drumW / 2;
    [[84, 2], [80, 2]].reduce((y, [w, h]) => { for (let j = 0; j < h; j++) paleStone(px, cx - w / 2, y - j - 1, w, j === h - 1); return y - h; }, gy);
    const top = gy - 40;
    for (let y = gy - 5; y >= top; y--) paleStone(px, cx - hw, y, OBS.drumW, false);
    for (let y = gy - 9; y > top + 10; y -= 5) { rect(cx - hw + 1, y, OBS.drumW - 2, 1, 4); for (let u = cx - hw + 4 + ((y / 5) & 1) * 4; u < cx + hw - 2; u += 8) px(u, y + 1, 4); }
    rect(cx - hw + 1, top + 3, OBS.drumW - 2, 7, 6); rect(cx - hw + 1, top + 10, OBS.drumW - 2, 1, 1);
    let u0 = cx - Math.floor(('OBSERVATORY'.length * 4 - 1) / 2);
    for (const ch of 'OBSERVATORY') { SIGN[ch].forEach((row, j) => [...row].forEach((c, i) => { if (c === '#') px(u0 + i, top + 4 + j, 2); })); u0 += 4; }
    rect(cx - hw - 1, top, OBS.drumW + 2, 3, 8); rect(cx - hw - 1, top - 1, OBS.drumW + 2, 1, 1); rect(cx - hw - 1, top + 2, OBS.drumW + 2, 1, 1);
    for (let u = cx - hw; u < cx + hw; u += 4) px(u, top, 7);
    for (const [o, on] of [[-28, 0], [-17, 1], [17, 0], [28, 1]]) { archAt(rect, cx + o, gy - 9, 6, 13, 1); archAt(rect, cx + o, gy - 10, 4, 11, on ? 7 : 2); }
    archAt(rect, cx, gy - 4, 14, 17, 1); archAt(rect, cx, gy - 4, 12, 16, 8); archAt(rect, cx, gy - 4, 10, 15, lit ? 8 : 0);
    if (lit) archAt(rect, cx, gy - 4, 6, 10, 7);
    STAR5.forEach((row, j) => [...row].forEach((c, i) => { if (c === '#') px(cx - 2 + i, top + 12 + j, 8); }));
  });
  /* The drum's roof, seen from above (mostly under the dome): lead with a gold rim. */
  const obsRoof = (C) => paint(OBS.drumW, OBS.roofD, C, (rect) => {
    rect(0, 0, OBS.drumW, OBS.roofD, 1); rect(1, 1, OBS.drumW - 2, OBS.roofD - 2, 8); rect(2, 2, OBS.drumW - 4, OBS.roofD - 4, 4);
    for (let u = 6; u < OBS.drumW - 4; u += 8) rect(u, 2, 1, OBS.roofD - 4, 3);
  });
  /* The dome, slit at longitude lon (0 faces you), with the telescope out of the slit. Lit from the
     upper left in dithered flat tones; copper ribs turn with it; `beat` picks which slit stars show. */
  function obsDome(rect, px, C, lon, beat) {
    const r = OBS.domeR, cx = OBS.domeW / 2, by = OBS.domeH - 3;
    for (let dy = -r; dy <= 0; dy++) {
      const hw = Math.floor(Math.sqrt(r * r - dy * dy) + 0.3), slitU = hw * Math.sin(lon), slitHalf = Math.max(1, 3 * Math.cos(lon));
      const ribs = [-2, -1, 1, 2].map((i) => lon + i * 0.62).filter((L) => Math.abs(L) < 1.45).map((L) => Math.round(hw * Math.sin(L)));
      for (let u = -hw; u <= hw; u++) {
        const nx = u / r, ny = dy / r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)), l = -0.45 * nx - 0.4 * ny + 0.8 * nz;
        let k = Math.max(4, Math.min(7, 4 + Math.floor(l * 3.4 + BAY[((cx + u) & 3) + ((by + dy) & 3) * 4] / 16 - 0.6)));
        if (ribs.includes(u)) k = Math.max(3, k - 2);
        if (Math.abs(u - slitU) <= slitHalf && dy < -r * 0.18) {
          const edge = Math.abs(u - slitU) > slitHalf - 1;
          k = edge ? 2 : !edge && noise(u - Math.round(slitU), dy) < 0.09 && (beat + dy) % 3 !== 0 ? 7 : 1;
        }
        if (u === -hw || u === hw || dy === -r) k = 1;
        px(cx + u, by + dy, k);
      }
    }
    rect(cx - r - 1, by + 1, r * 2 + 3, 1, 1); rect(cx - r, by, r * 2 + 1, 1, 8);
    // The telescope: a tube widening to its objective, ink-outlined, lit on its upper-left side,
    // three gold bands, dark glass with one glint.
    const x0 = cx + Math.sqrt(r * r - (r / 2) ** 2) * Math.sin(lon), y0 = by - r / 2, a = -Math.PI / 2 + lon * 1.1 - 0.3, len = 24, back = 2;
    const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx, side0 = nx * -0.7 + ny * -0.7 > 0 ? 1 : -1;
    for (const pass of [0, 1]) for (let s = -back; s <= len; s += 0.5) {
      const f = (s + back) / (len + back), rr = 2.5 + f, e = pass ? 0 : 1;
      for (let o = -rr - e; o <= rr + e; o += 0.5) {
        const x = Math.round(x0 + dx * s + nx * o), y = Math.round(y0 + dy * s + ny * o);
        if (!pass) { px(x, y, 1); continue; }
        const side = (o * side0) / rr, gold = [[0.12, 0.2], [0.55, 0.62], [0.9, 1]].some(([p, q]) => f >= p && f <= q);
        px(x, y, gold ? (side < -0.3 ? 7 : 8) : side < -0.45 ? 5 : side < 0.35 ? 4 : 2);
      }
    }
    const ex = x0 + dx * (len + 0.5), ey = y0 + dy * (len + 0.5);
    for (let o = -2.5; o <= 2.5; o += 0.5) px(Math.round(ex + nx * o), Math.round(ey + ny * o), 2);
    px(Math.round(ex - nx * side0), Math.round(ey - ny * side0), 7);
  }
  /* A small armillary on a pillar (the unused landmark's look, scaled to stand at a corner). */
  function obsArmillary(rect, px, step) {
    const cx = OBS.armW >> 1, base = OBS.armH, cy = base - 31;
    rect(cx - 7, base - 3, 14, 3, 1); rect(cx - 6, base - 3, 12, 1, 6);
    rect(cx - 2, base - 19, 4, 16, 1); rect(cx - 1, base - 19, 2, 16, 5); px(cx - 1, base - 19, 7);
    const ring = (rx, ry, k) => { for (let a = 0; a < 6.283; a += 0.07) px(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, k); };
    ring(11, 11, 4);
    const ph = step / 18;
    ring(Math.abs(Math.cos(ph * 2.5)) * 11 + 1, 11, 6);
    ring(11, Math.abs(Math.sin(ph * 1.6)) * 4 + 1, 8);
    rect(cx - 3, cy - 3, 6, 6, 1); rect(cx - 2, cy - 2, 4, 4, 8); px(cx - 2, cy - 2, 7);
    rect(cx, cy - 13, 1, 2, 8);
  }
  /* The observatory's moving parts, repainted only when their look changes: the dome swings its
     slit a notch every 1.5 s (the telescope with it, a fresh scatter of stars in the slit), and the
     armillaries' rings turn 3 steps a second, each on its own phase. Nothing blinks or fades. */
  function observatoryLights(C, { dome, arms }) {
    const pen = (cv) => { const g = cv.getContext('2d'); return { g, rect: (u, v, w, h, k) => { g.fillStyle = C[k]; g.fillRect(Math.round(u), Math.round(v), w, h); } }; };
    const D = pen(dome), A = arms.map(pen);
    const PATH = [0, 0.25, 0.5, 0.7, 0.5, 0.25, 0, -0.25, -0.5, -0.7, -0.5, -0.25];
    let lastNotch = -1, lastRing = -1;
    return (time) => {
      const notch = Math.floor(time / 1.5), ring = Math.floor(time * 3);
      if (notch !== lastNotch) {
        lastNotch = notch;
        D.g.clearRect(0, 0, dome.width, dome.height);
        obsDome(D.rect, (u, v, k) => D.rect(u, v, 1, 1, k), C, PATH[notch % PATH.length], notch);
      }
      if (ring !== lastRing) {
        lastRing = ring;
        A.forEach((a, i) => { a.g.clearRect(0, 0, OBS.armW, OBS.armH); obsArmillary(a.rect, (u, v, k) => a.rect(u, v, 1, 1, k), ring * 3 + i * 7); });
      }
    };
  }

  /* The table: a raised obsidian rim around the board with gold corner fittings, the inner lip
     faces the camera can see, and the table's front apron dropping below the board, so the map
     reads as a game board on the Dealer's table rather than ending in nothing.
     Map units; canvases are 1 px = 2 units. */
  const RIM = 28, RIM_H = 14, DROP = 60;
  function frame(pl, C) {
    const put = (cv, css, cls = 'rm-frame') => { cv.className = cls; cv.style.cssText = css; pl.appendChild(cv); return cv; };
    const stood = (cv, css) => { const s = document.createElement('div'); s.className = 'rm-st rm-frame-up'; s.style.cssText = css; s.appendChild(cv); pl.appendChild(s); };
    const R2 = RIM / 2, OW = (W + RIM * 2) / 2, OH = (H + RIM * 2) / 2;
    // Rim tops: an obsidian band, lit on its outer edge, shadowed on its inner edge, with studs.
    const band = (w, h, outer, inner) => paint(w, h, C, (rect) => {
      rect(0, 0, w, h, 1);
      if (outer === 'top') rect(0, 0, w, 1, 3); else if (outer === 'bottom') rect(0, h - 1, w, 1, 3); else if (outer === 'left') rect(0, 0, 1, h, 3); else rect(w - 1, 0, 1, h, 3);
      if (inner === 'top') rect(0, 0, w, 1, 0); else if (inner === 'bottom') rect(0, h - 1, w, 1, 0); else if (inner === 'left') rect(0, 0, 1, h, 0); else rect(w - 1, 0, 1, h, 0);
      const across = w > h;
      for (let i = 12; i < (across ? w : h) - 6; i += 12) rect(across ? i : (w >> 1), across ? (h >> 1) : i, 1, 1, 2);
    });
    const z = `transform:translateZ(${RIM_H}px)`;
    put(band(OW, R2, 'top', 'bottom'), `left:${-RIM}px;top:${-RIM}px;width:${OW * 2}px;height:${RIM}px;${z}`);
    put(band(OW, R2, 'bottom', 'top'), `left:${-RIM}px;top:${H}px;width:${OW * 2}px;height:${RIM}px;${z}`);
    put(band(R2, H / 2, 'left', 'right'), `left:${-RIM}px;top:0;width:${RIM}px;height:${H}px;${z}`);
    put(band(R2, H / 2, 'right', 'left'), `left:${W}px;top:0;width:${RIM}px;height:${H}px;${z}`);
    // Gold corner fittings.
    for (const [x, y] of [[-RIM, -RIM], [W, -RIM], [-RIM, H], [W, H]]) {
      put(paint(R2, R2, C, (rect) => { rect(0, 0, R2, R2, 1); rect(1, 1, R2 - 2, R2 - 2, 8); rect(2, 2, 2, 1, 7); rect((R2 >> 1) - 1, (R2 >> 1) - 1, 2, 2, 1); }),
        `left:${x}px;top:${y}px;width:${RIM}px;height:${RIM}px;transform:translateZ(${RIM_H + 1}px)`);
    }
    // Inner lip faces the camera can see: the back wall and the two side walls.
    const lip = (w) => paint(w, RIM_H / 2, C, (rect) => { rect(0, 0, w, RIM_H / 2, 2); rect(0, RIM_H / 2 - 2, w, 2, 1); });
    stood(lip(W / 2), `left:0;top:${-RIM_H}px;width:${W}px;height:${RIM_H}px`);
    for (const x of [0, W]) {
      const side = paint(RIM_H / 2, H / 2, C, (rect) => { rect(0, 0, RIM_H / 2, H / 2, 2); rect(0, 0, 2, H / 2, 1); });
      put(side, `left:${x}px;top:0;width:${RIM_H}px;height:${H}px;transform:rotateY(-90deg)`, 'rm-frame rm-frame-side');
    }
    // The table's front apron, from below the board up to the rim.
    const AH = (DROP + RIM_H) / 2;
    const apron = paint(OW, AH, C, (rect) => {
      rect(0, 0, OW, AH, 1);
      rect(0, 0, OW, 1, 3); rect(0, 2, OW, 1, 2);
      for (const [x0, x1] of [[8, OW / 2 - 4], [OW / 2 + 4, OW - 8]]) {
        rect(x0, 7, x1 - x0, 1, 2); rect(x0, AH - 5, x1 - x0, 1, 2); rect(x0, 7, 1, AH - 11, 2); rect(x1 - 1, 7, 1, AH - 11, 2);
      }
      for (let x = 4; x < OW - 2; x += 10) rect(x, 4, 1, 1, 8);
    });
    stood(apron, `left:${-RIM}px;top:${H + RIM - (DROP + RIM_H)}px;width:${OW * 2}px;height:${DROP + RIM_H}px;transform:translateZ(${-DROP}px) rotateX(-90deg)`);
  }


  /* A stop's beacon: a dotted diamond with solid tips, and the stop's icon standing straight on
     the ground inside it. Reachable = diamond and icon in accent (no blinking), visited = a dimmed
     icon, the rest = ink. Anything not drawn in ink gets a 1px ink outline, so it reads on any
     ground whatever the palette's accent is; an ink icon gets a paper outline instead, so it
     stands off the dark speckle of the stone. The icon is its own small canvas, drawn 15% larger
     than the diamond's pixels (ICON_X) and centred in it. */
  const BEACON = 29, DIAMOND = 12, BEACON_X = 3; // canvas px; the diamond's radius; drawn at 3x on the board (87 map units)
  const ICON = 13, ICON_X = 1.15; // the icon canvas (11 px icons plus their outline); its scale against the diamond's
  function drawBeacon(c, icv, n, state, C) {
    const rim = state === 'reach' ? C[8] : C[1], ink = state === 'reach' ? C[8] : state === 'done' ? C[2] : C[1];
    // Collect a canvas's pixels with their colors, then draw the outlines (paper round an ink icon,
    // ink round anything not ink; an ink diamond needs none) and the pixels over them.
    const paint = (cv, px) => {
      const x = cv.getContext('2d');
      x.clearRect(0, 0, cv.width, cv.height);
      for (const [u, v, k, icon] of px) {
        if (k === C[1] && !icon) continue;
        x.fillStyle = k === C[1] ? C[6] : C[1];
        x.fillRect(u - 1, v, 3, 1); x.fillRect(u, v - 1, 1, 3);
      }
      for (const [u, v, k] of px) { x.fillStyle = k; x.fillRect(u, v, 1, 1); }
    };
    const m = BEACON >> 1, dia = [];
    for (let d = -DIAMOND; d <= DIAMOND; d += 2) { const w = DIAMOND - Math.abs(d); dia.push([m - w, m + d, rim], [m + w, m + d, rim]); }
    for (const [u, v] of [[0, -DIAMOND], [0, DIAMOND], [-DIAMOND, 0], [DIAMOND, 0]]) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) dia.push([m + u + i, m + v + j, rim]);
    paint(c, dia);
    const ic = n.t === 'start' ? ['#####', '#####', '#####', '#####', '#####'] : BEACON_ICONS[n.t], mi = ICON >> 1, icon = [];
    const u0 = mi - (ic[0].length >> 1), v0 = mi - (ic.length >> 1);
    ic.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') icon.push([u0 + i, v0 + j, ink, true]); }));
    paint(icv, icon);
  }

  const FIG = 78; // figurine size in map units (1.3x the original 60)

  /* The Brimstone Slingshot: a forked obsidian Y, gold-banded at the crotch, with rubber bands to
     a leather pouch your figurine stands in. It's built at the base of the board, and rebuilt on
     each stop you clear. It draws back away from the beacon you point at and flings you there.
     Map units, 1 px = 2 units. SL.tip is where each band is tied on, relative to the fork's foot;
     rest/pull are the pouch's y (toward you) and z (the figure's feet). The figure stands just in
     front of the fork and the pouch just in front of the figure, so the bands only cross the
     figure's plane at its edges, where the pouch covers them. */
  const SL = { w: 60, h: 84, tip: { x: 52, z: 160 }, rest: { y: 1, z: 112 }, pull: { y: 41, z: 94 }, maxAim: 55 };
  const POUCH = { w: 76, h: 12, up: 8 };
  /* The follow camera's travel up the board (style.css --cam, map units): `min` frames the base's
     slingshot at the bottom of the screen, `max` stops with the casino at the top. `side` is how
     much it follows you sideways: 0, so the table always stays centered whichever stop you're at. */
  const CAM = { min: -340, max: 210, side: 0 }; // `up` above the feet: the bottom 10% of the figure
  const forkArt = (C) => paint(SL.w, SL.h, C, (rect, px) => {
    const c = SL.w / 2;
    // Thick strokes, outlined, lit from the left: [x, y] centers from base to tips.
    const limb = (x0, y0, x1, y1, r) => {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (const pass of [0, 1]) for (let i = 0; i <= n; i++) {
        const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n);
        if (!pass) rect(x - r - 1, y - 1, r * 2 + 2, 3, 1);
        else { rect(x - r, y, r, 1, 5); rect(x, y, r, 1, 3); px(x - r, y, 6); }
      }
    };
    limb(c, SL.h - 1, c, 46, 4);                          // stem
    limb(c, 50, c - 26, 5, 3); limb(c, 50, c + 26, 5, 3);  // arms
    for (const s of [-1, 1]) { rect(c + s * 26 - 4, 1, 8, 5, 1); rect(c + s * 26 - 3, 2, 6, 3, 7); } // tip knobs
    for (const v of [50, 56, 62]) { rect(c - 6, v, 12, 3, 1); rect(c - 5, v, 10, 1, 8); }              // gold bands
    rect(c - 8, SL.h - 4, 16, 4, 1); rect(c - 7, SL.h - 4, 14, 1, 3);                                  // foot
  });
  /* The pouch: a leather cradle with a lit lip, sagging in the middle, and a tie loop each end. */
  const pouchArt = (C) => paint(POUCH.w / 2, POUCH.h / 2, C, (rect) => {
    const w = POUCH.w / 2;
    rect(3, 1, w - 6, 5, 1); rect(4, 2, w - 8, 2, 2); rect(5, 2, w - 10, 1, 3); rect(8, 4, w - 16, 1, 2);
    for (const u of [0, w - 4]) { rect(u, 0, 4, 5, 1); rect(u + 1, 1, 2, 3, 4); }
  });
  const shadowArt = (C) => paint(16, 6, C, (rect) => { rect(3, 0, 10, 6, 1); rect(0, 1, 16, 4, 1); });

  /* ---------- the encore: the house comes down and the Pit Boss deals you back in ---------- */
  /* The Pit Boss's hands: white gloves floating with no arms, like a stage magician's. Each pose
     is a list of capsules [x0, y0, x1, y1, r] around the hand's anchor (the palm's middle, or the
     middle of a fist's grip), outlined as one silhouette and then filled, so fingers that nearly
     touch keep an ink line between them. Lit from the upper left; `left` mirrors the hand (the
     light stays put). Every hand canvas is the same size with the anchor at the same pixel.
     Both poses lie on their side: fingers pointing in toward the middle, thumb on top, the cuff
     on the outside. */
  const HAND = { w: 78, h: 58, ax: 39, ay: 37 }, HAND_S = 2.25, GRIP = -12; // HAND_S: map units a hand pixel. GRIP: where a fist grips your figurine, map units above its feet (just under them: it closes round your legs)
  const HAND_POSES = {
    // An open hand, drawn fingers-up and then turned on its side (x and y swapped).
    open: [[-8, 15, 8, 15, 4.5], [0, -4, 0, 5, 11.5], [-11, 3, -19, -10, 4], [-8, -11, -11, -29, 3], [-2, -13, -2, -34, 3], [4, -12, 6, -32, 3], [9, -8, 14, -24, 2.6]]
      .map(([x0, y0, x1, y1, r]) => [y0, x0, y1, x1, r]),
    // Gripping something upright: the four fingers wrap round it as stacked bars, the thumb over
    // the top, the back of the hand and the cuff off to the side.
    fist: [[21, -8, 21, 10, 4], [11, -4, 13, 6, 9], [-9, -9, 7, -9, 3], [-9, -3, 7, -3, 3], [-9, 3, 7, 3, 3], [-9, 9, 7, 9, 3], [-10, -14, 6, -13, 3.2]],
  };
  // How far below its anchor a pose reaches, in hand pixels (its lowest capsule edge plus the outline).
  const handLow = (pose) => Math.max(...HAND_POSES[pose].map(([, y0, , y1, r]) => Math.max(y0, y1) + r + 1));

  function handArt(cv, C, pose, left) {
    const { w, h, ax, ay } = HAND, caps = HAND_POSES[pose].map(([x0, y0, x1, y1, r]) => left ? [-x0, y0, -x1, y1, r] : [x0, y0, x1, y1, r]);
    const B = new Int8Array(w * h).fill(-1);
    const near = (u, v, [x0, y0, x1, y1]) => {
      const dx = x1 - x0, dy = y1 - y0, t = Math.max(0, Math.min(1, ((u - x0) * dx + (v - y0) * dy) / (dx * dx + dy * dy || 1)));
      return [u - (x0 + dx * t), v - (y0 + dy * t)];
    };
    for (let pass = 0; pass < 2; pass++) for (const cap of caps) {
      const r = cap[4] + (pass ? 0 : 1);
      for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) {
        const [ox, oy] = near(u - ax, v - ay, cap), d = Math.hypot(ox, oy);
        if (d > r) continue;
        const l = (ox * 0.8 + oy * 0.6) / cap[4];
        B[v * w + u] = pass ? (l < -0.5 ? 3 : l > 0.5 ? 1 : 2) : 0;
      }
    }
    const x = cv.getContext('2d');
    x.clearRect(0, 0, w, h);
    for (let i = 0; i < B.length; i++) if (B[i] >= 0) { x.fillStyle = C[B[i]]; x.fillRect(i % w, i / w | 0, 1, 1); }
    // A gold cufflink, and a crease or two.
    const s = left ? -1 : 1, dot = (u, v, k) => { x.fillStyle = C[k]; x.fillRect(ax + u * s, ay + v, 1, 1); };
    if (pose === 'open') { dot(15, 0, 8); dot(15, 1, 8); for (let i = -4; i <= 3; i++) dot(2 + Math.round(i * i / 8), i, 1); }
    else { dot(21, 0, 8); dot(21, 1, 8); for (const v of [-6, 0, 6]) dot(8, v, 1); }
  }

  /* The Pit Boss's eyes: a floating pair of gold irises glinting out of the dark. Each sits in a
     patch of the darkest tone that thins out, in Bayer order, into the sky around it, so there's
     no hard edge, just eyes. The whites are dark too, so the gold is what you see. Each eye is drawn in
     its own frame, u from the inner corner (-) to the outer (+), v down, and mirrored for the eye
     on the left. `open` 0..1 is how far the lids are apart (under 0.15: shut); lx, ly (-1..1) is
     where they look. */
  const EYES = { w: 132, h: 40 };
  function eyesArt(cv, C, open, lx = 0, ly = 0) {
    const x = cv.getContext('2d'), RX = 25, RY = 13, FADE = 1.25; // FADE: how far out the dark thins away, in socket radii
    const bay = (u, v) => BAY[((u + 40) & 3) + ((v + 40) & 3) * 4];
    // The opening's edges at u, wide open: pressed down toward the nose, pinched at the corners.
    const top0 = (u) => (-2.5 - 0.08 * u + 2.5 * (u / 16) ** 4) * 1.6, bot0 = (u) => (2.5 - 3 * (u / 16) ** 2) * 1.6;
    x.clearRect(0, 0, EYES.w, EYES.h);
    for (const [ex, s] of [[33, -1], [99, 1]]) {
      const P = (u, v, k) => { x.fillStyle = C[k]; x.fillRect(ex + s * Math.round(u), 22 + Math.round(v), 1, 1); };
      const mid = (u) => (top0(u) + bot0(u)) / 2, shut = open < 0.15;
      const top = (u) => Math.round(mid(u) + (top0(u) - mid(u)) * open), bot = (u) => Math.round(mid(u) + (bot0(u) - mid(u)) * open);
      // The dark round the eye: solid in the middle, fewer and fewer pixels out to FADE.
      const fu = Math.floor(RX * FADE), fv = Math.floor(RY * FADE);
      for (let u = -fu; u <= fu; u++) for (let v = -fv; v <= fv; v++) {
        const d = Math.hypot(u / RX, v / RY);
        if (d < 0.6 || (d < FADE && bay(u, v) < 16 * (FADE - d) / (FADE - 0.6))) P(u, v, 0);
      }
      if (shut) { for (let u = -18; u <= 18; u++) { P(u, Math.round(mid(u)), 0); P(u, Math.round(mid(u)) - 1, 0); } continue; }
      // The eye: a gold iris (ink rim, black pupil) in dark whites, shadowed under the lid.
      const iu = s * lx * 6, iv = ly * 2;
      for (let u = -16; u <= 16; u++) for (let v = top(u); v <= bot(u); v++) {
        const d = Math.hypot(u - iu, v - iv);
        P(u, v, d < 1.8 ? 0 : d < 3.2 ? 8 : d < 4 ? 1 : v <= top(u) ? 0 : v > mid(u) ? 2 : 1);
      }
      if (open > 0.6) P(iu - 1, Math.max(top(Math.round(iu)), Math.round(iv) - 1), 7);
      for (let u = -18; u <= 18; u++) { P(u, top(u) - 1, 0); P(u, top(u) - 2, 0); }
      for (let u = -15; u <= 15; u++) P(u, bot(u) + 1, 0);
    }
  }

  /* What's left of the casino: a long heap of broken stone, white palace and gold trim. */
  /* Chunks are piled back to front, big ones low, each sitting somewhere inside the heap's
     outline (taller in the middle, with a lump either side), so the top edge stays ragged. */
  const rubbleArt = (C, seed) => paint(CAS.W, 22, C, (rect) => {
    const R = mulberry32(seed), H = 22;
    const heap = (u) => 3 + 13 * Math.sin(Math.PI * u / CAS.W) ** 0.7 + 4 * Math.sin(u / 7) ** 2;
    for (let i = 0; i < 70; i++) {
      const u = 2 + R() * (CAS.W - 8) | 0, room = heap(u), s = Math.max(2, Math.min(room - 1, 2 + R() * 6)) | 0;
      const v = H - s - Math.round(R() * (room - s)), k = [2, 3, 4, 4, 5, 5, 6, 8][R() * 8 | 0];
      rect(u - 1, v - 1, s + 2, s + 2, 1); rect(u, v, s, s, k);
      if (s > 2) { rect(u, v, s, 1, Math.min(7, k + 1)); rect(u + s - 1, v + 1, 1, s - 1, Math.max(1, k - 1)); }
    }
  });

  /* Dither the screen to darkness (or back) in Bayer-ordered blocks of the darkest tone: no fade,
     just more and more squares. from/to are 0 (clear) .. 1 (dark). */
  function curtain(host, C, from, to, dur, done = () => {}) {
    const cv = document.createElement('canvas');
    cv.className = 'rm-curtain';
    cv.width = 64; cv.height = 36;
    host.append(cv);
    const g = cv.getContext('2d'), steps = 8;
    g.fillStyle = C[0];
    const draw = (k) => {
      g.clearRect(0, 0, cv.width, cv.height);
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (BAY[(x & 3) + (y & 3) * 4] < k * 16) g.fillRect(x, y, 1, 1);
    };
    draw(from);
    for (let i = 1; i <= steps; i++) setTimeout(() => {
      if (!cv.isConnected) return;
      draw(from + (to - from) * i / steps);
      if (i === steps) { if (to === 0) cv.remove(); done(); }
    }, dur * i / steps);
    return cv;
  }

  /* Change screens behind a curtain: dither to dark, swap() in the next screen, dither back. The
     curtain lives in #screenWrap, outside #screen, so showScreen() doesn't sweep it away, and it
     takes clicks while it's up. cleared() resolves once no wipe is running. */
  let wiping = null;
  function wipe(swap) {
    if (wiping) return;
    if (FAST) return swap();
    document.activeElement?.blur();
    const host = document.createElement('div');
    host.className = 'wipe';
    $('#screenWrap').append(host);
    wiping = new Promise((res) => curtain(host, ramp(), 0, 1, 280, () => setTimeout(() => {
      host.replaceChildren();
      swap();
      curtain(host, ramp(), 1, 0, 280, () => { host.remove(); wiping = null; res(); });
    }, 80)));
  }
  const cleared = () => wiping || Promise.resolve();

  /* A 3D strip from p to q ([x, y, z] in its parent's map units): yawed in the board plane,
     then pitched up off it. */
  function strip(el, p, q) {
    const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], flat = Math.hypot(dx, dy);
    el.style.left = p[0] + 'px'; el.style.top = p[1] - 2.5 + 'px';
    el.style.width = Math.hypot(flat, dz) + 'px';
    el.style.transform = `translateZ(${p[2]}px) rotateZ(${Math.atan2(dy, dx)}rad) rotateY(${-Math.atan2(dz, flat)}rad)`;
  }

  let walking = false;

  /* opts.encore: play the encore over this map (the casino just beaten; see encore() below), then
     call opts.encore.onDark once the screen has gone dark. opts.fromDark: the map comes up out of
     that darkness. */
  function show(opts = {}) {
    const run = Run.s;
    if (!run) return showTitle();
    Music.play('menu'); // back from a stop (the casino and bowling lane play their own)
    walking = false;
    const C = ramp(), R = mulberry32((run.seed ^ 0x5eed) >>> 0);
    const nodes = run.map.nodes;
    H = Math.max(BOARD_BASE, Math.max(...nodes.map((n) => n.y)) + 60);
    CH = H / 2;
    const edges = run.map.edges.map(([a, b], i) => { const p = route(nodes[a], nodes[b]); return { i, a, b, p, s: sample(p) }; });
    const reach = Run.reach();
    // A campfire you can go to next: work its floor out while you choose, so it opens quickly.
    if (typeof Fire !== 'undefined' && reach.some((id) => nodes[id].t === 'fire'))
      Fire.warm(SPIRE_ANTES[Math.min(run.circuit || 1, SPIRE_ANTES.length) - 1].heat);
    const live = new Set(edges.filter((e) => e.a === run.cur && reach.includes(e.b)).map((e) => e.i));
    const attuned = new Set(run.done);
    const visited = new Set(run.visited);

    // Things the spires keep clear of: every orbit arc, beacon, rune circle and obelisk.
    const block = [
      ...edges.flatMap((e) => e.s.map((q) => [q[0], q[1], 26])),
      ...nodes.map((n) => (n.t === 'boss' ? [n.x, 58, 100] : [n.x, n.y, 46])), // the casino is wide
      // Where a slingshot can stand, and its draw: the base, and in front of every stop.
      ...nodes.filter((n) => n.t !== 'boss').map((n) => (n.t === 'start' ? [n.x, n.y + 50, 70] : [n.x, n.y + 44, 38])),
      // ...and the spot beside it where you wait while one is built (see buildRig; the base's
      // is built as a run begins).
      ...nodes.filter((n) => n.t !== 'boss').map((n) => [n.x + (n.x <= W / 2 ? 1 : -1) * (SL.w + FIG / 2 + 8), n.y + (n.t === 'start' ? 40 : 24), 30]),
    ];
    const clear = (x, y, r) => block.every((b) => Math.hypot(x - b[0], y - b[1]) - b[2] > r);
    // Rune circles and obelisks: the classic spots, repeated down a longer board.
    // (Spots were placed on the 760-wide board: x scales with the board's width.)
    const tile = (spots) => Array.from({ length: Math.ceil(H / BOARD_BASE) }, (_, k) => spots.map(([x, y]) => [Math.round(x * W / 760), y + k * BOARD_BASE]).filter(([, y]) => y < H - 20)).flat();
    const runes = tile([[110, 610], [650, 640], [650, 370], [110, 260], [640, 140], [120, 430]]).filter(([x, y]) => clear(x, y, 34)).slice(0, Math.round(3 * H / BOARD_BASE));
    runes.forEach(([x, y]) => block.push([x, y, 34]));
    // An obelisk too close to a river for its height (see riverRoom) is moved in toward the middle.
    const inward = ([x, y]) => { for (let i = 0; i < 12 && riverRoom(x, y, 15, 86) < 0; i++) x += x < W / 2 ? 8 : -8; return [x, y]; };
    const obel = tile([[92, 400], [668, 180], [92, 150], [300, 34], [460, 34], [672, 520], [110, 770], [652, 800]]).map(inward).filter(([x, y]) => riverRoom(x, y, 15, 86) >= 0 && clear(x, y, 14));
    obel.forEach(([x, y]) => block.push([x, y, 18]));
    // Landmarks: one of each of the ante's pair (dice towers and tossed chips on the first ante, talon
    // orbs and arcana obelisks after the Pit Boss deals you back in), each on clear ground, off the
    // lava and well apart. Their own random stream, so the rest of the board is laid out as before.
    const LR = mulberry32((run.seed ^ 0xd1ce) >>> 0), marks = [];
    const [ka, kb] = MARK_PAIRS[(run.circuit || 1) > 1 ? 1 : 0];
    const kinds = LR() < 0.5 ? [ka, kb] : [kb, ka]; // one of each per map
    // Off the rivers, top included (see riverRoom): MARK sizes are canvas px, 2 map units each.
    const offLava = (x, y, k) => riverRoom(x, y, MARK[k].w, MARK[k].h * 2) >= 0;
    // Spacing: ideally at least MARK_ROWS_APART rows apart up or down the board, so two never stand
    // side by side in the same stretch, and MARK_COLS_APART beacon gaps apart across it (the gap
    // between neighboring beacons in a 3-stop row), so one doesn't stand right above another. If
    // no spot allows both, the rows rule alone; failing that, just 220 map units apart any way.
    const rowsApart = (y) => marks.every((m) => Math.abs(m.y - y) >= MARK_ROWS_APART * RUN_ROW_GAP);
    const colsApart = (x) => marks.every((m) => Math.abs(m.x - x) >= MARK_COLS_APART * (RUN_COL_X[3][1] - RUN_COL_X[3][0]));
    const apart = [
      (x, y) => rowsApart(y) && colsApart(x),
      (x, y) => rowsApart(y),
      (x, y) => marks.every((m) => Math.hypot(m.x - x, m.y - y) >= 220),
    ];
    for (const ok of apart) {
      for (let t = 0; t < 800 && marks.length < kinds.length; t++) {
        const x = 60 + LR() * (W - 120), y = 180 + LR() * (H - 300);
        if (!offLava(x, y, kinds[marks.length]) || !clear(x, y, 34) || !ok(x, y)) continue;
        marks.push({ x, y, k: kinds[marks.length], seed: marks.length });
        block.push([x, y, 30]);
      }
    }

    showScreen(`
      <div class="rmap" id="rmap">
        <canvas class="rm-sky" id="rmSky"></canvas>
        <div class="rm-view"><div class="rm-pl" id="rmPl" style="height:${H}px">
          <canvas class="rm-ly" id="rmGnd" width="${CW}" height="${CH}" style="height:${H}px"></canvas>
          <canvas class="rm-ly rm-fx" id="rmFx" width="${CW}" height="${CH}" style="height:${H}px"></canvas>
        </div></div>
        <canvas class="rm-em" id="rmEm" width="640" height="360"></canvas>
        <div class="rhud panel">
          <div class="rh-who"><img src="${spriteURL('hero')}" alt=""><div><div class="rh-name">${escapeHTML(heroName().toUpperCase())}</div><div class="rh-deck">${escapeHTML(run.name)}${run.circuit > 1 ? ` &middot; ANTE ${run.circuit}` : ''}</div></div></div>
          <div class="rh-row">${ico('hp')}<span>LIFE</span><b>${run.life}/${run.maxLife}</b></div>
          <div class="rh-row">${ico('arcana')}<span>ARCANA</span><b>${run.teeth}</b></div>
          <div class="rh-row">${ico('spell')}<span>DECK</span><b id="rhDeck">${Run.deckSize()}</b></div>
          <button class="btn" id="rmDeck">VIEW DECK</button>
        </div>
        <div class="rm-btns"><button class="mini-btn rm-gear" id="rmGear"><img src="${iconURL('gear')}" alt=""></button><button class="btn" id="rmMenu">MENU</button><button class="btn" id="rmQuit">ABANDON</button></div>
        <div class="rm-tick" id="rmTick"></div>
      </div>`);
    const pl = $('#rmPl'), tick = $('#rmTick');
    const idle = () => (reach.length ? 'Pick a lit beacon to sling yourself at' : 'The Dealer awaits');
    tick.textContent = idle();

    drawGround($('#rmGnd'), R, C);
    // The ante sets the spires' mix and heat (see SPIRE_ANTES), from their own random stream.
    const heatTick = placeProps(pl, R, C, block, runes, obel, SPIRE_ANTES[Math.min(run.circuit || 1, SPIRE_ANTES.length) - 1], mulberry32((run.seed ^ 0x5b1e) >>> 0));
    const markTick = landmarks(pl, C, marks);
    frame(pl, C);

    // Stop beacons, and the casino for the boss (whose lights the animation loop runs).
    let casinoTick = () => {}, casino = null;
    for (const n of nodes) {
      if (n.t === 'start') continue; // the slingshot stands here instead
      const el = document.createElement('div');
      const state = reach.includes(n.id) ? 'reach' : visited.has(n.id) ? 'done' : 'idle';
      if (n.t === 'boss') {
        // The boss's house (the casino resort, or the Great Dome from the second ante on; see
        // BOSS_HOUSES): footprint on the board, roofs lifted to their height, upright parts as standees.
        const lit = state === 'reach', W2 = CAS.W * 2, D2 = CAS.D * 2;
        el.className = 'rm-casino';
        el.style.cssText = `left:${n.x - CAS.W}px;top:${BOSS_PIN_Y - 8 - D2}px;width:${W2}px;height:${D2}px`;
        // Every part with the heights it spans, for the encore's demolition.
        casino = { el, n, parts: [] };
        const flat = (cv, x, y, z) => { cv.className = 'rm-c-flat'; cv.style.cssText = `left:${x}px;top:${y}px;width:${cv.width * 2}px;height:${cv.height * 2}px;transform:translateZ(${z}px)`; casino.parts.push({ el: cv, z0: z, z1: z }); return cv; };
        const stand = (cv, cx, by, z) => {
          const s = document.createElement('div'), w = cv.width * 2, h = cv.height * 2;
          s.className = 'rm-st';
          s.style.cssText = `left:${cx - w / 2}px;top:${by - h}px;width:${w}px;height:${h}px;transform:translateZ(${z}px) rotateX(-90deg)`;
          s.appendChild(cv);
          casino.parts.push({ el: s, z0: z, z1: z + h });
          return s;
        };
        const house = BOSS_HOUSES[Math.min(run.circuit || 1, BOSS_HOUSES.length) - 1];
        if (house === 'observatory') {
          // The Great Dome: the drum's face at the front, its roof lifted to the cornice, the dome
          // standing in the roof's middle, an armillary just outside each front corner.
          const drumZ = (OBS.H - 2) * 2, roofY = D2 - OBS.roofD * 2;
          const dome = document.createElement('canvas'), arms = [0, 1].map(() => document.createElement('canvas'));
          dome.width = OBS.domeW; dome.height = OBS.domeH;
          arms.forEach((a) => { a.width = OBS.armW; a.height = OBS.armH; });
          casinoTick = observatoryLights(C, { dome, arms });
          el.append(
            flat(obsRoof(C), W2 / 2 - OBS.drumW, roofY, drumZ),
            stand(dome, W2 / 2, roofY + OBS.roofD, drumZ),
            stand(obsFace(C, lit), W2 / 2, D2, 0),
            // Just outside the plinth (it spans W2/2 ± OBS.W), so they never cut into the drum.
            stand(arms[0], W2 / 2 - OBS.W - OBS.armW - 2, D2, 0),
            stand(arms[1], W2 / 2 + OBS.W + OBS.armW + 2, D2, 0),
          );
        } else {
          const tx = CAS.towerX * 2, tw = CAS.towerW * 2, td = CAS.towerD * 2, th = CAS.towerH * 2;
          const podY = D2 - CAS.podD * 2, ph = CAS.podH * 2;
          const face = towerFace(C), sign = crown(C), pod = podiumFace(C, lit), mins = [minaret(C), minaret(C)];
          casinoTick = casinoLights(C, { face, sign, pod, mins });
          el.append(
            flat(towerRoof(C), tx, 0, th),
            stand(face, tx + tw / 2, td, 0),
            stand(sign, tx + tw / 2, td + 2, th - 4),
            flat(podiumRoof(C), 0, podY, ph),
            stand(pod, W2 / 2, D2, 0),
            stand(dome(C, 19, 24), W2 / 2 - 50, podY + 22, ph),
            stand(dome(C, 19, 24), W2 / 2 + 50, podY + 22, ph),
            stand(dome(C, 31, 38), W2 / 2, podY + 26, ph),
            stand(mins[0], 10, D2 - 4, ph),
            stand(mins[1], W2 - 10, D2 - 4, ph),
          );
        }
        const carpet = casinoCarpet(C, lit);
        carpet.className = 'rm-c-carpet';
        carpet.style.cssText = `left:${CAS.W - 8}px;top:${D2}px`;
        el.append(carpet);
      } else {
        const c = document.createElement('canvas');
        el.className = 'rm-nd';
        c.width = BEACON; c.height = BEACON;
        el.style.cssText = `left:${n.x - BEACON * BEACON_X / 2}px;top:${n.y - BEACON * BEACON_X / 2}px;width:${BEACON * BEACON_X}px;height:${BEACON * BEACON_X}px`;
        const icv = document.createElement('canvas'), isz = ICON * BEACON_X * ICON_X;
        icv.width = icv.height = ICON;
        icv.className = 'rm-nd-ic';
        icv.style.cssText = `left:${(BEACON * BEACON_X - isz) / 2}px;top:${(BEACON * BEACON_X - isz) / 2}px;width:${isz}px;height:${isz}px`;
        drawBeacon(c, icv, n, state, C);
        el.append(c, icv);
      }
      el.classList.toggle('reach', state === 'reach');
      pl.appendChild(el);
      el.onmouseenter = () => { if (state === 'reach' && !walking) aimAt(n); tick.textContent = visited.has(n.id) && n.t !== 'start' ? `${runStop(run, n.t).name}: cleared` : runStop(run, n.t).desc; };
      el.onmouseleave = () => { if (!walking) sl.load(0); tick.textContent = idle(); };
      el.onclick = () => walkTo(n.id);
    }

    // Your figurine: the character sprite standing up off the board.
    const fig = document.createElement('div');
    fig.className = 'rm-st rm-fig';
    // Inner .tilt gets the same hover lean, pop and glare as cards and the title portrait;
    // the outer standee keeps its own transform for standing up.
    fig.innerHTML = `<div class="rm-fig-t tilt" style="--spr: url(${spriteURL('hero')})"><img src="${spriteURL('hero')}" alt=""><div class="c-glare"></div></div>`;
    const img = fig.querySelector('img');
    const place = (x, y, z) => { fig.style.left = x - FIG / 2 + 'px'; fig.style.top = y - FIG + 'px'; fig.style.transform = `translateZ(${z}px) rotateX(-90deg)`; };
    // Run each(k) for k = 0..1 over dur ms at ~30fps, stepped like the rest of the pixel art.
    const frames = (dur, each, done) => {
      const t0 = performance.now();
      (function step() {
        if (!fig.isConnected) return;
        const k = Math.min(1, (performance.now() - t0) / dur);
        each(k);
        if (k < 1) setTimeout(step, 33);
        else done();
      })();
    };

    // A slingshot standing in front of stop n (the base's sits further forward, clear of its lines).
    // The fork always faces you (a turned standee would go edge-on); the pouch is drawn back
    // directly away from the aimed beacon. All in the rig's frame, origin at the fork's foot.
    function makeRig(n) {
      const r = { n, BX: n.x, BY: n.y + (n.t === 'start' ? 40 : 24), aim: 0 }; // aim: radians, 0 = up the board
      r.rig = document.createElement('div');
      r.rig.className = 'rm-sling';
      r.rig.style.cssText = `left:${r.BX}px;top:${r.BY}px`;
      r.fork = document.createElement('div');
      r.fork.className = 'rm-st rm-sl-fork';
      r.fork.style.cssText = `left:${-SL.w}px;top:${-SL.h * 2}px;width:${SL.w * 2}px;height:${SL.h * 2}px`;
      r.fork.appendChild(forkArt(C));
      r.bands = [0, 1].map(() => { const b = document.createElement('div'); b.className = 'rm-sl-rub'; b.style.background = C[1]; return b; });
      r.pouch = document.createElement('div');
      r.pouch.className = 'rm-st rm-sl-pouch';
      r.pouch.appendChild(pouchArt(C));
      r.rig.append(r.fork, ...r.bands, r.pouch);
      pl.append(r.rig);
      // Draw the pouch back by k (0 = at rest, 1 = full draw): the bands run from each fork tip to
      // the pouch's tie loops, and a loaded figure stands in it. Returns the feet's local [x, y, z].
      r.load = (k) => {
        const d = k * (SL.pull.y - SL.rest.y), x = -d * Math.sin(r.aim), y = SL.rest.y + d * Math.cos(r.aim), z = SL.rest.z + k * (SL.pull.z - SL.rest.z);
        const py = y + 3, pw = POUCH.w / 2;
        r.pouch.style.left = x - pw + 'px'; r.pouch.style.top = py - POUCH.h + 'px';
        r.pouch.style.transform = `translateZ(${z + POUCH.up - POUCH.h}px) rotateX(-90deg)`;
        strip(r.bands[0], [-SL.tip.x, 0, SL.tip.z], [x - pw + 2, py, z + 2]);
        strip(r.bands[1], [SL.tip.x, 0, SL.tip.z], [x + pw - 2, py, z + 2]);
        if (fig.parentNode === r.rig) place(x, y, z);
        return [x, y, z];
      };
      r.load(0);
      return r;
    }

    // The slingshot stands at the last stop you cleared (the base, to begin with). Arriving back
    // from a new stop, the old one crumbles and a new one is built where you stand.
    const prevAt = nodes[run.sling ?? 0], slingAt = nodes[run.cur].t === 'boss' ? prevAt : nodes[run.cur];
    const sl = makeRig(slingAt);

    // The camera follows you up the board: it frames map point (x, y) (where your slingshot
    // stands, or your figurine in flight) as the base's slingshot is framed at the start, by
    // sliding the board toward you, up to CAM.max so the casino doesn't run off the top. It keeps
    // the table centered side to side (CAM.side).
    // (CAM was tuned on the classic board, whose base sits at y 960: the same framing on any
    // board is cam = CAM.min + 1000 - y, starting lower the further down the base is.)
    const camLo = CAM.min + 1000 - (nodes[0].y + 40);
    let look = 0, lastFollow = [W / 2, nodes[0].y], cam = [0, 0]; // cam: [across, along], for the sky's parallax
    const setCam = (cx, cy) => {
      pl.style.setProperty('--cam', Math.round(cy / 2) * 2 + 'px');
      pl.style.setProperty('--camX', Math.round(cx / 2) * 2 + 'px');
      cam = [cx, cy];
    };
    const follow = (x, y) => {
      lastFollow = [x, y];
      setCam((W / 2 - x) * CAM.side, Math.max(camLo, Math.min(CAM.max, CAM.min + 1000 - y + look)));
    };
    follow(sl.BX, sl.BY);
    // Scroll the wheel (or drag, below) to look up the board toward the casino (or back down); a jump recentres.
    // During the opening pan, the wheel (or a click) skips it instead.
    let skipIntro = null;
    $('#rmap').addEventListener('wheel', (e) => {
      e.preventDefault();
      if (skipIntro) return skipIntro();
      look = Math.max(-2000, Math.min(2000, look - Math.sign(e.deltaY) * 80));
      follow(...lastFollow);
    }, { passive: false });
    $('#rmap').addEventListener('pointerdown', () => { if (skipIntro) skipIntro(); });
    // Or drag the board with the left button (or a finger): it follows the pointer up and down.
    // A press only becomes a drag once it has moved DRAG_START px, and the click that ends a drag
    // is swallowed, so clicking a beacon still flings you there. Only from the board itself (or the
    // sky round it), not the HUD, its buttons, or an overlay like the deck view.
    const DRAG_START = 6, DRAG_SPEED = 1.5; // px; map units of look per screen px
    let drag = null, dragged = false;
    $('#rmap').addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || skipIntro || !(e.target === e.currentTarget || e.target.closest('.rm-view') || e.target.id === 'rmSky')) return;
      drag = { id: e.pointerId, y: e.clientY, look, on: false };
      dragged = false;
    });
    $('#rmap').addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = e.clientY - drag.y;
      if (!drag.on) {
        if (Math.abs(dy) < DRAG_START) return;
        drag.on = dragged = true;
        $('#rmap').setPointerCapture(e.pointerId);
        $('#rmap').classList.add('dragging');
      }
      look = Math.max(-2000, Math.min(2000, drag.look + dy * DRAG_SPEED));
      follow(...lastFollow);
    });
    const endDrag = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      $('#rmap').classList.remove('dragging');
    };
    $('#rmap').addEventListener('pointerup', endDrag);
    $('#rmap').addEventListener('pointercancel', endDrag);
    $('#rmap').addEventListener('click', (e) => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } }, true);

    // (Only a run that hasn't left the base yet: one saved mid-way before openings existed has no flag.)
    if (opts.encore) encore(opts.encore);
    else if (!run.intro && run.cur === nodes[0].id && !run.done.length) intro();
    else if (slingAt === prevAt) { sl.rig.append(fig); sl.load(0); } else buildRig(makeRig(prevAt));

    // A run's opening: the camera starts on the casino, holds a moment, and pans down the board
    // to the base, where you stand beside an empty plot while your first slingshot is built.
    // Played once per run (run.intro); the wheel or a click skips the pan.
    function intro() {
      walking = true;
      run.intro = true;
      Run.save();
      pl.append(fig);
      place(sl.BX + (sl.BX <= W / 2 ? 1 : -1) * (SL.w + FIG / 2 + 8), sl.BY, 0);
      sl.fork.style.clipPath = 'inset(100% 0 0 0)';
      sl.bands.forEach((b) => { b.hidden = true; });
      sl.pouch.hidden = true;
      const top = CAM.max, end = cam[1], endX = cam[0];
      setCam(0, top);
      let done = false;
      const finish = () => { if (done) return; done = true; skipIntro = null; follow(sl.BX, sl.BY); buildRig(null); };
      skipIntro = finish;
      setTimeout(() => {
        if (done) return;
        frames(2400, (k) => {
          if (done) return;
          const s = k * k * (3 - 2 * k); // ease in and out
          setCam(endX * s, top + (end - top) * s);
        }, finish);
      }, 700);
    }

    // Pointing at a beacon aims and takes up a little slack, in 5-degree steps like the pixel art.
    const aimAt = (n, k = 0.2) => {
      const ty = n.t === 'boss' ? BOSS_PIN_Y + 34 : n.y, m = SL.maxAim * Math.PI / 180, st = Math.PI / 36;
      sl.aim = Math.round(Math.max(-m, Math.min(m, Math.atan2(n.x - sl.BX, sl.BY - ty))) / st) * st;
      sl.load(k);
    };

    // Pixel bits thrown up off a standee, at height f (0 = foot, 1 = top) of its on-screen box;
    // the ember loop below moves and draws them.
    const bits = [];
    function burst(el, f, count, kind) {
      const b = el.getBoundingClientRect(), e = em.getBoundingClientRect(), sx = em.width / e.width, sy = em.height / e.height;
      const y = (b.bottom - b.height * f - e.top) * sy, cx = (b.left + b.width / 2 - e.left) * sx, hw = b.width * 0.3 * sx;
      for (let i = 0; i < count; i++) {
        bits.push({
          x: cx + (Math.random() * 2 - 1) * hw, y, vx: (Math.random() * 2 - 1) * 2.2, vy: -1 - Math.random() * 3.2, l: 1,
          s: Math.random() < 0.3 ? 3 : 2,
          c: kind === 'spark' ? C[Math.random() < 0.5 ? 8 : 7] : C[3 + (Math.random() * 3 | 0)],
        });
      }
    }

    // The build, under two seconds: the old slingshot (if any; none at a run's start) crumbles to
    // dust, the new fork goes up from its foot in six hammered courses throwing sparks, its bands
    // are strung and the pouch hung, then you hop into the pouch. Meanwhile you stand beside the
    // fork, level with its foot and on the board's inner side, clear of the going-up and of the lava.
    function buildRig(old) {
      walking = true;
      run.sling = slingAt.id;
      Run.save();
      pl.append(fig);
      const wx = sl.BX + (sl.BX <= W / 2 ? 1 : -1) * (SL.w + FIG / 2 + 8), wy = sl.BY;
      place(wx, wy, 0);
      sl.fork.style.clipPath = 'inset(100% 0 0 0)';
      sl.bands.forEach((b) => { b.hidden = true; });
      sl.pouch.hidden = true;
      const at = (ms, f) => setTimeout(() => { if (fig.isConnected) f(); }, ms);
      if (old) {
        at(80, () => { sfx('poof'); burst(old.fork, 0.6, 22, 'dust'); burst(old.fork, 0.2, 16, 'dust'); });
        [0.66, 0.33].forEach((s, i) => at(80 + i * 90, () => { old.rig.style.transform = `scale3d(${s}, ${s}, ${s})`; }));
        at(260, () => old.rig.remove());
      }
      for (let i = 1; i <= 6; i++) {
        at(240 + i * 140, () => {
          sl.fork.style.clipPath = i < 6 ? `inset(${(1 - i / 6) * 100}% 0 0 0)` : '';
          sfx('build', i);
          burst(sl.fork, i / 6, 14, 'spark');
        });
      }
      at(1180, () => {
        sl.bands.forEach((b) => { b.hidden = false; });
        sl.pouch.hidden = false;
        sfx('twang');
        burst(sl.pouch, 0.5, 12, 'spark');
      });
      at(1300, () => {
        const [lx, ly, lz] = sl.load(0), tx = sl.BX + lx, ty = sl.BY + ly;
        fig.classList.add('hopping');
        sfx('select');
        frames(320, (k) => {
          const z = lz * k + 70 * 4 * k * (1 - k);
          place(wx + (tx - wx) * k, wy + (ty - wy) * k, Math.round(z / 4) * 4);
        }, () => {
          sl.rig.append(fig);
          sl.load(0);
          fig.classList.remove('hopping');
          sfx('place');
          walking = false;
        });
      });
    }

    function walkTo(id) {
      if (walking || !reach.includes(id)) return;
      look = 0;
      walking = true;
      const n = nodes[id], tx = n.x, ty = n.t === 'boss' ? BOSS_PIN_Y + 34 : n.y;
      aimAt(n, 0);
      fig.classList.add('hopping');
      // 1. Draw back, creaking, in six notches.
      let notch = 0;
      frames(520, (k) => {
        const s = Math.round(k * 6) / 6;
        if (Math.round(k * 6) > notch) { notch = Math.round(k * 6); sfx('tick'); }
        sl.load(s);
      }, () => setTimeout(release, 140));
      // 2. Let go: the band snaps home and the figurine leaves the rig for the board.
      function release() {
        sfx('lever');
        const [lx, ly, sz] = sl.load(1), sx = sl.BX + lx, sy = sl.BY + ly;
        pl.append(fig);
        sl.load(0);
        const sh = document.createElement('div');
        sh.className = 'rm-sl-shadow';
        sh.appendChild(shadowArt(C));
        pl.append(sh);
        // 3. Fly a lob to the beacon, its height scaled to the distance, with a shadow on the board.
        const dist = Math.hypot(tx - sx, ty - sy), H = 60 + dist * 0.3;
        frames(380 + dist * 0.7, (k) => {
          const x = sx + (tx - sx) * k, y = sy + (ty - sy) * k, z = sz * (1 - k) + 4 * H * k * (1 - k);
          place(x, y, Math.round(z / 4) * 4);
          follow(sl.BX + (tx - sl.BX) * k, sl.BY + (ty + 24 - sl.BY) * k); // ends where the next slingshot will stand
          sh.style.left = x - 16 + 'px'; sh.style.top = y - 6 + 'px';
          img.style.transform = k < 1 ? `rotate(${Math.round(k * 4) % 4 * 90}deg)` : ''; // a stepped tumble
        }, () => {
          // 4. Land with a squash.
          sh.remove();
          sfx('land');
          img.style.transform = 'scale(1.15, .8)';
          img.style.transformOrigin = '50% 100%';
          setTimeout(() => { img.style.transform = ''; fig.classList.remove('hopping'); }, 120);
          // A battle's versus screen is its own transition; every other stop comes in behind a wipe.
          const go = () => { walking = false; Run.go(id); };
          if (['battle', 'boss'].includes(nodes[id].t)) setTimeout(go, 320);
          else setTimeout(() => wipe(go), 200);
        });
      }
    }

    // A pixel standee floating free over (or behind) the board: w x h canvas px drawn at `scale`
    // map units a pixel. put(x, y, z) stands its foot at board point (x, y), lifted z.
    function floater(w, h, scale = 2) {
      const cv = document.createElement('canvas'), el = document.createElement('div');
      cv.width = w; cv.height = h;
      el.className = 'rm-st rm-encore';
      el.style.width = w * scale + 'px'; el.style.height = h * scale + 'px';
      el.appendChild(cv);
      pl.append(el);
      return { el, cv, put(x, y, z) { el.style.left = x - w * scale / 2 + 'px'; el.style.top = y - h * scale + 'px'; el.style.transform = `translateZ(${Math.round(z / 2) * 2}px) rotateX(-90deg)`; sink(el, z, h * scale); } };
    }
    // Cut a standee off at the board's level: whatever is below it is under the table.
    // base: the standee's foot (map units, may be negative); hpx: its height.
    const sink = (el, base, hpx) => { el.style.clipPath = base < 0 ? `inset(0 0 ${Math.min(100, -base / hpx * 100)}% 0)` : ''; };
    // Copy art from src onto cv, only the pixels whose Bayer threshold is under k (0..1): the way
    // the encore's visitors dither into view.
    function reveal(cv, src, k) {
      const g = cv.getContext('2d'), im = src.getContext('2d').getImageData(0, 0, src.width, src.height), d = im.data;
      for (let i = 0; i < d.length; i += 4) { const p = i / 4, x = p % src.width, y = p / src.width | 0; if (BAY[(x & 3) + (y & 3) * 4] >= k * 16) d[i + 3] = 0; }
      g.clearRect(0, 0, cv.width, cv.height);
      g.putImageData(im, 0, 0);
    }

    /* The encore, after the casino falls: the resort comes down in courses, the reverse of a
       slingshot going up. The Pit Boss crawls out from under the table, two floating hands and a
       pair of eyes. One hand holds a slingshot just like yours, built in its fist; the other
       plucks your figurine off the rubble, drops you in the pouch, draws it back and lets go,
       flinging you all the way back down the board to the base. Then the screen goes dark. */
    function encore({ onDark = () => {} }) {
      walking = true;
      sl.rig.remove(); // the house deals you a slingshot of its own
      const gx = casino.n.x, gy = BOSS_PIN_Y + 34, cx0 = (W / 2 - gx) * CAM.side;
      pl.append(fig);
      place(gx, gy, 0);
      setCam(cx0, CAM.max);
      const wait = (ms) => new Promise((ok) => setTimeout(() => { if (fig.isConnected) ok(); }, ms));
      const tween = (dur, each) => new Promise((ok) => frames(dur, each, ok));
      const ease = (k) => k * k * (3 - 2 * k), mix = (a, b, k) => a + (b - a) * k;

      // A hand: its canvas redrawn on a change of pose, and placed by its anchor (see HAND), with a
      // stepped bob while it hovers. `held` is anything it carries along (your figurine).
      const hands = [];
      const hand = (left) => {
        const f = floater(HAND.w, HAND.h, HAND_S), src = document.createElement('canvas');
        src.width = HAND.w; src.height = HAND.h;
        const o = {
          ...f, left, x: 0, y: 0, z: 0, bob: 0, held: null,
          set(pose, k = 1) { handArt(src, C, pose, left); reveal(f.cv, src, k); },
          at(x, y, z) {
            Object.assign(o, { x, y, z });
            f.el.style.left = x - HAND.ax * HAND_S + 'px'; f.el.style.top = y - HAND.h * HAND_S + 'px';
            const base = Math.round((z + o.bob - (HAND.h - HAND.ay) * HAND_S) / 2) * 2;
            f.el.style.transform = `translateZ(${base}px) rotateX(-90deg)`;
            sink(f.el, base, HAND.h * HAND_S);
            if (o.held) place(x, y - 3, z + o.bob - GRIP); // gripped round the legs, so you show above the fist
          },
          to(x, y, z, dur) { const a = [o.x, o.y, o.z]; return tween(dur, (k) => { const s = ease(k); o.at(mix(a[0], x, s), mix(a[1], y, s), mix(a[2], z, s)); }); },
        };
        hands.push(o);
        return o;
      };
      const bob = setInterval(() => {
        if (!fig.isConnected) return clearInterval(bob);
        hands.forEach((h, i) => { h.bob = (Math.floor(performance.now() / 400) + i) % 2 ? 4 : 0; h.at(h.x, h.y, h.z); });
      }, 100);

      (async () => {
        // 1. The house comes down: the lights go out, then it drops course by course from the top,
        //    each throwing dust, the camera jolting on each, until there's only rubble.
        tick.textContent = 'The house comes down';
        await wait(700);
        casinoTick = () => {};
        sfx('lever');
        await wait(300);
        // The spires and landmarks at the back of the board come down with it, clearing the
        // ground the Pit Boss works over (its hands and slingshot would pass through them).
        // Spires are baked in full-width depth bands, so a whole band goes at once.
        const STAGE_Y = 220; // map units: anything standing behind this line falls
        const nearby = [...pl.querySelectorAll('.rm-band, .rm-mark')].map((el) => ({ el, z0: 0, z1: parseFloat(el.style.height), y: parseFloat(el.style.top) + parseFloat(el.style.height) })).filter((p) => p.y < STAGE_Y);
        const parts = [...casino.parts, ...nearby], top = Math.max(...parts.map((p) => p.z1)), N = 7;
        for (let i = N - 1; i >= 0; i--) {
          const line = top * i / N;
          sfx('build', i + 1);
          for (const p of parts) {
            if (p.gone) continue;
            if (p.z1 === p.z0) { if (line < p.z0) { p.gone = true; p.el.style.display = 'none'; } continue; }
            const f = Math.max(0, Math.min(1, (line - p.z0) / (p.z1 - p.z0)));
            if (f >= 1) continue;
            if (p.el.getBoundingClientRect().width > 4) burst(p.el, f, f > 0 ? 8 : 5, 'dust');
            if (f <= 0) { p.gone = true; p.el.style.display = 'none'; } else p.el.style.clipPath = `inset(${(1 - f) * 100}% 0 0 0)`;
          }
          setCam(cx0 + (i % 2 ? 6 : -6), CAM.max);
          await wait(150);
        }
        setCam(cx0, CAM.max);
        const rubble = floater(CAS.W, 22);
        rubble.cv.getContext('2d').drawImage(rubbleArt(C, run.seed), 0, 0);
        rubble.put(gx, BOSS_PIN_Y - 14, 0);
        sfx('poof');
        burst(rubble.el, 0.4, 30, 'dust');
        await wait(1000);

        // 2. The Pit Boss crawls out from under the table: a hand comes up over the far rim and
        //    slaps down on it, then the other, and the eyes rise up between them, shut, and open.
        //    Anything still below the board's edge is cut off at it (see sink).
        tick.textContent = 'Something stirs under the table';
        await wait(400);
        // ON_RIM: the open hand's anchor height with its lowest pixel resting on the rim's top.
        const H1 = hand(true), H2 = hand(false), HX = 300, ON_RIM = RIM_H + handLow('open') * HAND_S;
        H1.set('open'); H2.set('open');
        H1.at(W / 2 - HX, -40, -140); H2.at(W / 2 + HX, -40, -140);
        for (const [h, d] of [[H1, 1], [H2, -1]]) {
          await h.to(h.x, -40, ON_RIM + 30, 380);
          await h.to(h.x + d * 20, -14, ON_RIM + 6, 160);
          sfx('land');
          await wait(260);
        }
        tick.textContent = 'The Pit Boss';
        const eyes = floater(EYES.w, EYES.h, 5), EY = -70, EZ = 130;
        eyesArt(eyes.cv, C, 0);
        sfx('warp');
        await tween(900, (k) => eyes.put(W / 2, EY, mix(-EYES.h * 5, EZ, ease(k))));
        for (const h of [H1, H2]) h.to(h.x, h.y, h.z - 6, 200); // bearing down on the rim as it hauls itself up, palm flat on it
        await wait(400);
        for (const o of [0.35, 0.7, 1]) { eyesArt(eyes.cv, C, o, 0, 1); await wait(90); }
        await wait(300);
        for (const lx of [-1, -1, 1, 1]) { eyesArt(eyes.cv, C, 1, lx, 0.4); await wait(260); }
        eyesArt(eyes.cv, C, 1, 0, 1);
        await wait(300);
        eyesArt(eyes.cv, C, 0.1, 0, 1); await wait(110); eyesArt(eyes.cv, C, 1, 0, 1); // a blink

        // 3. The hands let go of the rim and rise: the left one closes into a fist.
        const HY = -90, HZ = 230;
        await Promise.all([H1.to(W / 2 - 330, HY, HZ, 500), H2.to(W / 2 + 330, HY, HZ, 500)]);
        H1.set('fist');
        sfx('place');
        await wait(300);

        // 4. A slingshot just like yours goes up in the left hand's fist, the way yours are built,
        //    and that hand brings it in over the rubble.
        tick.textContent = 'The Pit Boss deals you back in';
        const RX = W / 2 - 150, RY = 70, RZ = 150; // where the slingshot's foot hangs in the air
        const R = makeRig({ x: H1.x, y: H1.y - 4 - 24, t: 'x' }); // makeRig stands it 24 in front of the point it's given
        const lift = (z) => { R.rig.style.transform = `translateZ(${Math.round(z / 2) * 2}px)`; };
        const follow1 = () => { R.rig.style.left = H1.x + 'px'; R.rig.style.top = H1.y - 4 + 'px'; R.BX = H1.x; R.BY = H1.y - 4; lift(H1.z + H1.bob - 36); };
        R.fork.style.clipPath = 'inset(100% 0 0 0)';
        R.bands.forEach((b) => { b.hidden = true; });
        R.pouch.hidden = true;
        follow1();
        for (let i = 1; i <= 6; i++) {
          R.fork.style.clipPath = i < 6 ? `inset(${(1 - i / 6) * 100}% 0 0 0)` : '';
          sfx('build', i);
          burst(R.fork, i / 6, 10, 'spark');
          await wait(140);
        }
        R.bands.forEach((b) => { b.hidden = false; });
        R.pouch.hidden = false;
        sfx('twang');
        burst(R.pouch, 0.5, 10, 'spark');
        const hold = setInterval(() => { if (!fig.isConnected) return clearInterval(hold); follow1(); }, 33);
        await Promise.all([H1.to(RX, RY + 4, RZ + 36, 900), H2.to(gx + 120, gy - 60, 200, 900)]);

        // 5. The right hand swoops down, closes round you, and carries you to the pouch.
        await H2.to(gx, gy + 3, 70, 500);
        await H2.to(gx, gy + 3, 38, 160); // just off the board: closing round you lifts you a little
        H2.set('fist');
        H2.held = true;
        pl.append(fig);
        fig.classList.add('hopping');
        sfx('place');
        await wait(200);
        const [, , pz] = R.load(0);
        await H2.to(gx, gy + 3, 200, 450);
        await H2.to(RX, RY + 6, RZ + pz + GRIP + 40, 800);
        await H2.to(RX, RY + 6, RZ + pz + GRIP, 220);
        H2.held = null;
        H2.set('open');
        R.rig.append(fig);
        R.load(0);
        sfx('place');
        fig.classList.remove('hopping');
        await H2.to(RX + 90, RY + 20, RZ + 170, 400);

        // 6. It pinches the pouch and draws it back, away from the base, in six creaking notches...
        R.aim = Math.PI;
        const [px0, py0, pz0] = R.load(0);
        await H2.to(RX + px0, RY + py0 + 8, RZ + pz0 + 10, 380);
        H2.set('fist');
        for (let i = 1; i <= 6; i++) {
          const [x, y, z] = R.load(i / 6);
          H2.at(RX + x, RY + y + 8, RZ + z + 10);
          sfx('tick');
          await wait(90);
        }
        await wait(260);

        // 7. ...and lets go. You fly the whole board back to the base.
        clearInterval(hold);
        const [lx, ly, lz] = R.load(1), sx = RX + lx, sy = RY + ly, sz = RZ + lz;
        H2.set('open');
        sfx('lever');
        sfx('twang');
        pl.append(fig);
        R.load(0);
        H2.to(H2.x + 60, H2.y - 30, H2.z + 60, 300);
        tick.textContent = 'Back to the start';
        const home = nodes[0], tx = home.x + (home.x <= W / 2 ? 1 : -1) * (SL.w + FIG / 2 + 8), ty = home.y + 40;
        const sh = document.createElement('div');
        sh.className = 'rm-sl-shadow';
        sh.appendChild(shadowArt(C));
        pl.append(sh);
        fig.classList.add('hopping');
        const dist = Math.hypot(tx - sx, ty - sy), top2 = 40 + dist * 0.06; // a flat, fast shot: you start high already
        await tween(900 + dist * 0.9, (k) => {
          const x = mix(sx, tx, k), y = mix(sy, ty, k), z = sz * (1 - k) + 4 * top2 * k * (1 - k);
          place(x, y, Math.round(z / 4) * 4);
          follow(x, y);
          sh.style.left = x - 16 + 'px'; sh.style.top = y - 6 + 'px';
          img.style.transform = k < 1 ? `rotate(${Math.round(k * 10) % 4 * 90}deg)` : '';
        });
        sh.remove();
        sfx('land');
        img.style.transform = 'scale(1.15, .8)';
        img.style.transformOrigin = '50% 100%';
        await wait(120);
        img.style.transform = '';
        fig.classList.remove('hopping');
        await wait(700);

        // 8. The screen goes dark, and the caller deals a new board.
        tick.textContent = '';
        curtain($('#rmap'), C, 0, 1, 800, () => setTimeout(() => { if (fig.isConnected) onDark(); }, 500));
      })();
    }

    $('#rmDeck').onclick = () => { sfx('select'); Run.showDeck($('#rmap')); };
    $('#rmGear').onclick = () => { sfx('select'); openOptions(false, () => show()); };
    $('#rmMenu').onclick = () => { sfx('select'); showTitle(); };
    $('#rmQuit').onclick = () => Run.confirmAbandon(() => show());

    // Animate the sky, lava, runes, sigils, casino lights, landmarks, hot spires and rising embers at a stepped ~12fps.
    // Every stop but the casino sits in a sigil ring; the start's is where the lines meet, behind the slingshot.
    const rings = nodes.filter((n) => n.t !== 'boss').map((n) => [n.x, n.y, reach.includes(n.id)]);
    const draw = fxDrawer($('#rmFx').getContext('2d'), $('#rmGnd').getContext('2d'), C, edges, runes, live, attuned, rings);
    const sky = skyDrawer($('#rmSky'), C);
    const embers = emberDrawer($('#rmEm'), C), em = $('#rmEm');
    let last = 0;
    (function loop(now) {
      if (!em.isConnected) return;
      requestAnimationFrame(loop);
      if (now - last < 80) return;
      last = now;
      sky(now / 1000, ...cam);
      draw(now / 1000);
      casinoTick(now / 1000);
      markTick(now / 1000);
      heatTick(now / 1000);
      const ex = embers();
      // Build sparks and crumble dust: thrown up, falling back.
      for (let i = bits.length - 1; i >= 0; i--) {
        const p = bits[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.7; p.l -= 0.08;
        if (p.l <= 0) { bits.splice(i, 1); continue; }
        ex.fillStyle = p.c;
        ex.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
      }
    })(0);
    if (opts.fromDark) curtain($('#rmap'), C, 1, 0, 700);
  }

  return { show, wipe, cleared, forkArt, pouchArt, ramp, SL, POUCH, VSB, vsBackdrop, skyDrawer, RUNE, propArt, SPIRE_ANTES, BAY, HAND, handArt }; // the bowling lane (js/bowl.js) reuses the sky and the rune // the VS splash (ui.js) reuses the slingshot art and the sky
})();
