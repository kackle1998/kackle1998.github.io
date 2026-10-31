'use strict';
/* Bowling lane by ante (builder.html?mockup=bowl), after the Shooting Gallery's redesigns (js/gallery.js):
   the same lane, redressed part by part for each ante's world, with a piece framing the pins as the
   gallery's booth is framed. Every ante keeps today's camera and floats in the orrery, so the lane's far
   end is the horizon in all three. The builder's Ante buttons pick it:
     Ante 1, the casino: lacquered maple, gold rails, quilted felt decks, a chip-edged foul line, suit pips
       for targets, chip towers and a giant card where the columns stand; past the pins a marquee on
       chip-stack pillars, bulbs chasing along it, a velvet valance.
     Ante 2: today's lane (js/bowl.js), unchanged.
     Ante 3, the witchy wood: bleached planks, root rails, mossy decks, little toadstools for targets,
       the map's toadstools where the columns stand; past the pins an arch of two giant toadstools under a
       mossy root, their spots glowing in turn.
   The panel's setting is covered: the lane is its own place. Lane px are 2 map units; the arch is drawn
   in scene px (4 map units), as the gallery's booth. */
(() => {
  const LW = 720, LH = 260, CX = 360, FOUL = 226, FIG_Y = 234, BALL_Y = 238, PIT = 10, EDGE = 46;
  const BAY = RunMap.BAY, cl = (v) => Math.max(0, Math.min(1, v)), mod = (a, m) => ((a % m) + m) % m;
  const lvl = (f, x, y) => Math.max(0, Math.min(3, Math.round(f * 3 + BAY[(x & 3) + (y & 3) * 4] / 16 - 0.5)));
  const mx = (x) => 720 + (x - 75) * 4; // a scene x as a plane x (map units)

  /* ---------- the lane's own sprites (as js/bowl.js) ---------- */
  const PINS = [];
  for (let r = 0; r < 4; r++) for (let i = 0; i <= r; i++) PINS.push({ r, i, x: CX + (i - r / 2) * 16, y: 72 - r * 14 });
  const PIN = ['...lms...', '..llmms..', '..llmms..', '..llmms..', '...lms...', '...rrr...', '...lms...', '...rrr...', '...lms...',
    '..llmms..', '.lllmmss.', 'llllmmmss', 'llllmmmss', 'llllmmmss', 'llllmmmss', 'llllmmmss', 'llllmmmss', '.lllmmss.',
    '.lllmmss.', '..llmms..', '..llmms..', '..llmms..', '...lms...'];
  const COLUMN = ['llllmmss', 'llllmmss', '.llmmms.', ...Array(27).fill('.lmmmms.'), '.llmmms.', 'llllmmss', 'llllmmss'];
  const BROKEN = ['..l.....', '.llm..s.', '.llmmms.', ...Array(17).fill('.lmmmms.'), '.llmmms.', 'llllmmss', 'llllmmss'];
  const SUITS = [['..#..', '.###.', '#####', '..#..', '.###.'], ['##.##', '#####', '#####', '.###.', '..#..'],
    ['..#..', '.###.', '#####', '.###.', '..#..'], ['.###.', '.###.', '#####', '#.#.#', '..#..']]; // spade, heart, diamond, club
  const SHROOM = ['.###.', '#o#o#', '#####', '..#..', '..#..']; // a little toadstool: cap with two spots, stem
  function sprite(C, rows, map, outline) {
    const h = rows.length + 2, w = rows[0].length + 2, cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d'), at = (x, y) => y >= 0 && y < rows.length && x >= 0 && x < rows[0].length && map[rows[y][x]] != null;
    for (let y = -1; y <= rows.length; y++) for (let x = -1; x <= rows[0].length; x++) {
      const i = at(x, y) ? map[rows[y][x]] : outline != null && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) ? outline : null;
      if (i != null) { g.fillStyle = C[i]; g.fillRect(x + 1, y + 1, 1, 1); }
    }
    return cv;
  }
  function ballRows(ph) {
    const R = 5.3, out = [], hx = 5 + Math.round(2.6 * Math.sin(ph)), front = Math.cos(ph) > -0.2;
    for (let y = 0; y < 11; y++) {
      let s = '';
      for (let x = 0; x < 11; x++) {
        const dx = x - 5, dy = y - 5;
        if (dx * dx + dy * dy > R * R) { s += '.'; continue; }
        const hole = front && ((x === hx && y === 3) || (x === hx - 1 && y === 5) || (x === hx + 1 && y === 5));
        s += hole ? 'o' : dx + dy < -5.2 ? 'h' : dx + dy > 4.6 ? 's' : 'a';
      }
      out.push(s);
    }
    return out;
  }
  // One of the map's ante props (RunMap.propArt: 'chips', 'card', 'toadstool'), w x h px, with an ink outline.
  const toadstool = (C, w, h, seed, heat) => prop(C, 'toadstool', w, h, seed, heat);
  function prop(C, k, w, h, seed, heat) {
    const raw = document.createElement('canvas');
    raw.width = w; raw.height = h;
    const g = raw.getContext('2d'), fill = (u, v, n, c) => { if (n > 0) { g.fillStyle = c; g.fillRect(u, v, n, 1); } };
    RunMap.propArt(fill, (u, v) => fill(Math.round(u), Math.round(v), 1, C[8]), C, 3, k, w / 2, 0, w, h, seed, heat);
    const cv = document.createElement('canvas'), o = cv.getContext('2d'), src = g.getImageData(0, 0, w, h).data;
    cv.width = w + 2; cv.height = h + 1;
    const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 0;
    o.fillStyle = C[1];
    for (let y = -1; y < h; y++) for (let x = -1; x <= w; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) o.fillRect(x + 1, y + 1, 1, 1);
    o.drawImage(raw, 1, 1);
    return cv;
  }

  /* ---------- the timeline (as Run.bowl: the landing, the falling star, one throw) ---------- */
  const TX = CX - 2, HX = TX + 9, HY = BALL_Y, LAND = 0.7, SQ = 0.12, STAR = 0.14, HELD = LAND + SQ + STAR * 10, T0 = HELD + 0.6, STEP = 0.1;
  const W = HX + 6, WY = HY - 6;
  const STARS = [
    { x: W, y: WY, z: 240, trail: true }, { x: W, y: WY, z: 180, trail: true }, { x: W, y: WY, z: 120, trail: true }, { x: W, y: WY, z: 60, trail: true },
    { x: W, y: WY, z: 0, dust: 8, fz: 8 }, { x: W, y: WY, z: 14, dust: 11 }, { x: W, y: WY, z: 0 }, { x: W, y: WY, z: 0, lean: 15 },
    { x: HX + 2, y: HY - 2, z: 6, lean: 8 }, { x: HX, y: HY, z: 0 },
  ];
  const KEEP = [6, 9], ROLL = 10, hit = PINS.map((p, j) => (KEEP.includes(j) ? -1 : 2 + Math.ceil((BALL_Y - p.y) / (BALL_Y - PIT) * ROLL) + Math.round(p.r * 0.4)));
  const SWEEP = Math.max(...hit) + 4, LEN = T0 + (SWEEP + 3) * STEP;
  function at(t) {
    const S = { t, fx: TX, figY: FIG_Y, fz: 0, rot: 0, sx: 1, sy: 1, lean: 0, bob: false, ball: null, pins: PINS.map(() => 0) };
    if (t < LAND) {
      const u = t / LAND;
      return { ...S, fx: TX - 360 * (1 - u), figY: FIG_Y - 40 * (1 - u), fz: Math.round(200 * (1 - u * u) / 4) * 4, rot: Math.floor(u * 4) % 4 };
    }
    if (t < LAND + SQ) return { ...S, sx: Scene.SQUASH.sx, sy: Scene.SQUASH.sy };
    if (t < HELD) { const f = STARS[Math.min(9, Math.floor((t - LAND - SQ) / STAR))]; return { ...S, fz: f.fz || 0, lean: f.lean || 0, ball: f }; }
    if (t < T0) return { ...S, bob: true, ball: { x: HX, y: HY, z: 0 } };
    const k = Math.floor((t - T0) / STEP), p = cl((k - 2) / ROLL);
    const lean = k < 2 ? 14 * (k + 1) : k < 5 ? 20 - (k - 1) * 5 : 0;
    const ball = p < 1 ? { x: HX - 0.03 * 228 * p - 10 * p * p * p, y: BALL_Y - p * (BALL_Y - PIT), z: 0, spin: k * 1.3 } : null;
    return { ...S, lean, bob: k >= 5, ball, pins: hit.map((a) => (a < 0 ? 0 : k >= SWEEP ? -1 : k >= a ? Math.min(3, 1 + k - a) : 0)) };
  }

  /* ---------- the lane's parts ---------- */
  /* d: lane px across from the middle; y: along (0 the far end). The boards run d -30..29, a rim and a
     gutter either side to ±36, the decks to ±45, a dark edge at ±46 and along the far end; past the
     foul line the approach. */
  const part = (d, y) => (d < -EDGE || d >= EDGE ? 'off' : y < PIT ? 'pit' : y === PIT || d === -EDGE || d === EDGE - 1 ? 'edge'
    : d >= -30 && d < 30 ? (y >= FOUL - 1 && y <= FOUL ? 'foul' : y > FOUL ? 'approach' : 'boards')
    : d >= -36 && d < 36 ? (d === -36 || d === -31 || d === 30 || d === 35 ? 'rim' : 'gutter') : 'deck');
  const markAt = (bx, y, rows) => { // the five target spots in a chevron (as the runes): the mark's character there, or null
    for (const [dx, dy] of [[-24, 0], [-12, -5], [0, -10], [12, -5], [24, 0]]) {
      const r = typeof rows === 'function' ? rows(dx) : rows, gx = bx - 27 - dx, gy = y - 146 - dy;
      if (gx >= 0 && gx < 5 && gy >= 0 && gy < r.length && r[gy][gx] !== '.') return { dx, ch: r[gy][gx] };
    }
    return null;
  };
  const ramp = (T, L, dim, x, y) => T[lvl(cl(L - dim), x, y)];
  const marks = (seed, n, len, y0, y1, w = 26) => { // a few short wandering marks on your lane (cracks, knots, roots), the same every time
    const R = mulberry32(seed), out = new Set();
    for (let k = 0; k < n; k++) {
      let x = CX - w + R() * w * 2, y = y0 + R() * (y1 - y0), a = R() * 6.3;
      for (let i = 0; i < len; i++) { out.add((x | 0) + ',' + (y | 0)); a += (R() - 0.5) * 1.1; x += Math.cos(a); y += Math.sin(a) * 0.5; }
    }
    return out;
  };
  const CRACKS = (() => { const s = new Set(), R = mulberry32(11); for (let n = 0; n < 4; n++) { let x = CX - 26 + R() * 52, y = 90 + R() * 120, a = R() * 6.3; for (let i = 0; i < 6; i++) { a += (R() - 0.5) * 1.1; x += Math.cos(a); y += Math.sin(a); s.add((x | 0) + ',' + (y | 0)); } } return s; })();
  const KNOTS = marks(5, 6, 2, 20, 220);

  /* ---------- the antes' looks ----------
     Every ante is on the same camera. Each: floor (the floor suggested for it, used when the panel has
     none; the panel picks the place, see mount; none for today's lane, which floats),
     px(part, d, y, bx, L, dim, x) a lane pixel's tone, near(stand, C,
     heat) its props, standing where today's columns stand and no bigger, and arch(p, st, t) the piece
     past the pins, drawn in scene px on a plane at the slab's far edge (ground at y AH), standing on the
     side decks (scene x 52..57 and 93..98; the boards are 60..90), st its 4-a-second step. */
  const AH = 34, AX0 = 46, AW = 58, D_ARCH = 22;
  const LOOKS = {
    celestial: { // today's lane, unchanged
      place: null,
      px(r, d, y, bx, L, dim, x) {
        if (r === 'off' || r === 'pit') return -1;
        if (r === 'edge') return ramp([1, 2, 2, 3], L, dim, x, y);
        if (r === 'rim') return ramp([2, 3, 3, 4], L, dim, x, y);
        if (r === 'gutter') return ramp([1, 2, 2, 3], L, dim, x, y);
        if (r === 'deck') return ramp(x % 14 === 13 || y % 12 === 11 ? [2, 3, 3, 3] : [3, 4, 4, 5], L, dim, x, y);
        if (y === FOUL) return ramp([2, 3, 3, 3], L, dim, x, y);
        if (!dim && markAt(bx, y, RunMap.RUNE)) return 2;
        if (!dim && CRACKS.has(x + ',' + y)) return 3;
        const row = Math.floor(y / 18);
        return ramp((bx + (row % 2) * 10) % 20 === 19 || y % 18 === 17 ? [3, 4, 4, 5] : [5, 6, 6, 7], L, dim, x, y);
      },
      near(stand, C) { [[-40, 60, 1], [40, 125, 0], [-40, 195, 1]].forEach(([dx, y, b]) => stand(sprite(C, b ? BROKEN : COLUMN, { l: 6, m: 5, s: 3 }, 2), CX + dx, y, 3)); },
    },
    casino: {
      floor: 'tiles', // the casino court's checker
      px(r, d, y, bx, L, dim, x) {
        if (r === 'off' || r === 'pit') return -1;
        if (r === 'edge') return 1;
        if (r === 'rim') return d === -31 || d === 30 ? 7 : 8;              // gold rails, lit along the lane side
        if (r === 'gutter') return ramp([1, 1, 2, 2], L, dim, x, y);           // dark felt
        if (r === 'deck') { // quilted felt, a pale stud in each diamond
          const a = mod(x + y, 10), b = mod(x - y, 10);
          return a === 0 || b === 0 ? ramp([2, 3, 3, 3], L, dim, x, y) : a === 5 && b === 5 ? 6 : ramp([3, 4, 4, 5], L, dim, x, y);
        }
        if (r === 'foul') return mod(bx, 8) < 5 ? (mod(Math.floor(bx / 8), 2) ? 7 : 8) : 1; // edged like a chip
        if (r === 'approach') return ramp(((x >> 2) + (y >> 2)) % 2 ? [4, 5, 5, 6] : [5, 6, 6, 7], L, dim, x, y); // the court's checker
        const m = !dim && markAt(bx, y, (dx) => SUITS[(dx / 12 + 6) % 4]);
        if (m) return 2; // card suits, in the targets' one tone (as the runes)
        if (bx === 1 || bx === 58) return dim ? 7 : 8;                                          // a gold inlay down each edge
        return ramp(bx % 6 === 5 ? [4, 5, 6, 6] : [5, 6, 7, 7], L, dim, x, y);                  // lacquered maple
      },
      // Two chip towers and a giant card, where today's columns stand and as wide.
      near(stand, C, heat) {
        stand(prop(C, 'chips', 8, 26, 3, heat), CX - 40, 60, 3);
        stand(prop(C, 'card', 9, 13, 1, heat), CX + 40, 125, 3);
        stand(prop(C, 'chips', 8, 32, 8, heat), CX - 40, 195, 3);
      },
      // A marquee on chip-stack pillars standing on the side decks: a dark band railed in gold with bulbs
      // chasing along it, a velvet valance scalloped under it with a gold hem.
      arch({ R, P }, st) {
        const PT = 22, L = 52, Rx = 93, top = AH - PT; // pillars 6 px wide: on the decks, x 52..57 and 93..98
        for (const [x, lit] of [[L, 0], [Rx, 1]]) { // chips 2 px thick (a face and a seam), gold and pale by turns, a lit top chip
          R(x, top - 2, 6, PT + 2, 1);
          for (let c = 0, y = AH - 1; y > top; c++, y -= 2) { R(x + 1, y - 1, 4, 1, c % 3 === 0 ? 8 : c % 3 === 1 ? (lit ? 7 : 6) : 5); R(x + 1, y, 4, 1, 1); }
          R(x + 1, top - 1, 4, 1, 7);
        }
        // Everything over the pillars mirrors about scene x 75, the lane's middle: the pillars are 52..57
        // and 93..98, so the band runs 51..99 (a pixel past each), its inside 52..98.
        const my = top - 10, MID = 75, x0 = L, w = Rx + 6 - L; // the inside: 52..98, 47 wide
        R(x0 - 1, my, w + 2, 10, 1); R(x0, my + 1, w, 8, 2);
        R(x0, my + 1, w, 2, 8); R(x0, my + 1, w, 1, 7); R(x0, my + 7, w, 2, 8);
        for (let i = 0; i < 9; i++) R(MID - 21 + i * 5, my + 4, 3, 2, (i + st) % 3 ? 4 : 7); // nine bulbs, 3 px each, centered: 54..96
        for (let x = L + 6; x < Rx; x++) { // the valance between the pillars (58..92), scalloped from the middle out, a gold hem
          const u = Math.abs(x - MID), dc = Math.min(u % 6, 6 - (u % 6)), dip = [3, 3, 2, 1][dc];
          R(x, top, 1, dip, Math.round(u / 6) % 2 ? 4 : 5); R(x, top + dip, 1, 1, 8); P(x, top + dip + 1, 1);
        }
      },
    },
    witchy: {
      floor: 'dirt', // the carnival midway's dirt, without its boardwalk
      px(r, d, y, bx, L, dim, x) {
        if (r === 'off' || r === 'pit') return -1;
        if (r === 'edge') return ramp([1, 1, 2, 2], L, dim, x, y);
        if (r === 'rim') return ramp(mod(y + (d < 0 ? 0 : 5), 9) < 2 ? [1, 2, 2, 2] : [2, 3, 3, 4], L, dim, x, y); // a root, twisting
        if (r === 'gutter') return ramp([1, 1, 2, 2], L, dim, x, y);
        if (r === 'deck') { // moss, a few little mushrooms in it
          if (!dim && mod(x * 7 + y * 13, 97) === 0) return 7;
          if (!dim && mod(x * 7 + y * 13, 97) === 1) return 4;
          return ramp([2, 3, 3, 4], L, dim, x, y);
        }
        if (r === 'foul') return ramp([1, 2, 2, 2], L, dim, x, y);           // a root laid across
        if (r === 'approach') return ramp([3, 4, 4, 5], L, dim, x, y);       // packed earth
        const m = !dim && markAt(bx, y, SHROOM);
        if (m && m.ch !== 'o') return 2; // little toadstools, in the targets' one tone; their spots left as the plank
        if (!dim && KNOTS.has(x + ',' + y)) return 4;
        return ramp(bx % 6 === 5 ? [4, 5, 5, 6] : [5, 6, 6, 7], L, dim, x, y); // bleached planks
      },
      // Three of the map's toadstools, where today's columns stand: stems no wider than a column, caps over the gutter in the air.
      near(stand, C, heat) {
        stand(toadstool(C, 10, 18, 4, heat), CX - 40, 60, 3);
        stand(toadstool(C, 9, 14, 9, heat), CX + 40, 125, 3);
        stand(toadstool(C, 10, 22, 2, heat), CX - 40, 195, 3);
      },
      // An arch of two giant toadstools standing on the side decks under a mossy root: stems, domed caps lit
      // from the upper left with a dark gill line, spots glowing in turn; moss hanging from the root. Each part
      // is laid out as cells, then outlined all round with 1 px of ink, as the game's sprites are: the root
      // first, the toadstools over it, both toadstools the same art.
      arch(p, st) {
        const L = 55, Rx = 95, capY = AH - 30;
        const root = new Map(); // the root slung between the caps, 2 px thick, lit along its top; moss hanging, 2 px wide
        for (let x = L + 6; x < Rx - 6; x++) {
          const y = Math.round(capY + 4 + 3 * Math.sin(Math.PI * (x - L) / (Rx - L)));
          root.set(x + ',' + y, 3); root.set(x + ',' + (y + 1), 2);
          if (mod(x * 5, 7) === 0) { const len = 2 + mod(x * 3, 5); for (let j = 0; j < len; j++) for (const dx of [0, 1]) root.set(x + dx + ',' + (y + 2 + j), j === len - 1 ? 4 : 3); }
        }
        cells(p, root);
        for (const cx of [L, Rx]) cells(p, toadCells(cx, capY, st));
      },
    },
  };
  const OF_ANTE = ['casino', 'celestial', 'witchy'];
  // Cells ('x,y' -> tone, scene px) drawn with a 1 px ink outline round the whole shape, as a sprite's.
  function cells({ R }, m) {
    for (const key of m.keys()) {
      const [x, y] = key.split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!m.has(x + dx + ',' + (y + dy))) R(x + dx, y + dy, 1, 1, 1);
    }
    for (const [key, k] of m) { const [x, y] = key.split(',').map(Number); R(x, y, 1, 1, k); }
  }
  // One giant toadstool centered on cx, its cap's top row at capY, standing on the ground (y AH): a stem lit
  // on its left, a domed cap lit from the upper left with a dark gill line under it, five spots glowing in turn.
  function toadCells(cx, capY, st) {
    const m = new Map();
    for (let y = capY + 7; y < AH; y++) [7, 6, 5].forEach((k, i) => m.set(cx - 1 + i + ',' + y, k));
    for (let r = 0; r < 7; r++) {
      const f = (7 - r - 0.5) / 7, half = Math.round(8 * Math.sqrt(1 - f * f)) + 1;
      for (let u = -half; u < half; u++) { const q = (u + half) / (half * 2) + r / 7; m.set(cx + u + ',' + (capY + r), r === 6 ? 2 : q < 0.55 ? 6 : q < 1.1 ? 5 : 4); }
    }
    [[-5, 2], [-1, 1], [3, 2], [5, 4], [-6, 4]].forEach(([u, v], i) => {
      for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) m.set(cx + u + a + ',' + (capY + v + b), (i + st) % 4 === 0 ? 8 : 7);
    });
    return m;
  }

  /* ---------- the stage ---------- */
  function mount(ctx) {
    const heat = ctx.heat, look = LOOKS[OF_ANTE[heat]];
    // Over the builder's setting: the lane's own camera when it floats in the orrery; pulled back, as the
    // gallery's, when it lies in a place, so the place and the arch past the pins are in shot.
    const sc = Scene.mount(ctx.sc.stage, { rows: 600, top: -30 });
    // The place under the lane is the panel's (floor, backdrop, features, horizon, critters, effects): the
    // builder keeps its picks in localStorage, saved before each rebuild. Features keep off the lane and
    // the ground between it and the camera. Today's lane (Ante 2) floats, as in the game.
    if (look.floor) {
      let P = {};
      try { P = JSON.parse(localStorage.getItem('builder.v1.bowl') || '{}'); } catch (e) { /* the defaults below */ }
      const ok = (list, k) => (list.includes(k) ? k : undefined), PARTS = Scene.PARTS;
      Scene.setting(sc, ok(Scene.SETTINGS, P.setting) || 'ruins', {
        heat, floor: ok(PARTS.floors, P.floor) || look.floor, backdrop: ok(PARTS.backdrops, P.backdrop) || 'sky',
        features: (P.features || []).filter((k) => PARTS.features.includes(k)), density: P.density || {},
        horizon: 'edge', // always: the floor (and any wall) stops where the lane ends, in every ante
        critters: (P.critters || []).filter((k) => Scene.CRITTERS[k]), critterLife: P.life || {},
        effects: (P.effects || []).filter((k) => Scene.EFFECTS[k]),
        clear: { x0: mx(46), x1: mx(104), y: -200 }, over: { x0: 0, y0: 0, w: 720, h: 300 },
      });
    }
    const { C, RGB, pl } = sc;
    // The look's place, its features kept off the lane and the ground round it.
    // The lane: every pixel's tone worked out once, lit and in shadow, so a step only copies. Laid just
    // over the place's floor.
    const lane = document.createElement('canvas');
    lane.width = LW; lane.height = LH; lane.className = 'bw-lane';
    lane.style.transform = 'translateZ(1px)';
    pl.appendChild(lane);
    const g = lane.getContext('2d'), img = g.createImageData(LW, LH), px = img.data;
    const lit = new Int16Array(LW * LH), dark = new Int16Array(LW * LH);
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      const d = x - CX, L = cl(1.1 - (d + 60) / 120 * 0.5 - y / LH * 0.35), bx = d >= -30 && d < 30 ? d + 30 : -1, o = y * LW + x, r = part(d, y);
      lit[o] = look.px(r, d, y, bx, L, 0, x);
      dark[o] = lit[o] < 0 ? -1 : Math.max(0, look.px(r, d, y, bx, L, 0.55, x));
    }
    const put = (o, i) => { const c = RGB[i], p = o * 4; px[p] = c[0]; px[p + 1] = c[1]; px[p + 2] = c[2]; px[p + 3] = 255; };
    for (let o = 0; o < LW * LH; o++) if (lit[o] >= 0) put(o, lit[o]);
    const base = new Uint8ClampedArray(px);
    g.putImageData(img, 0, 0);
    // The arch past the pins (in scene px, on an upright plane at the pit's front edge), and the look's props.
    const arch = look.arch ? Scene.plane(sc, { left: mx(AX0), x0: AX0, depth: D_ARCH, w: AW, h: AH }) : null;
    look.near((cv, x, y, s) => sc.stand(cv, x * 2 - cv.width * s / 2, y * 2, cv.width * s, cv.height * s), C, heat);
    const pins = PINS.map(() => { const cv = sprite(C, PIN, { l: 7, m: 6, s: 4, r: 8 }, 2); return sc.stand(cv, 0, 0, cv.width * 2, cv.height * 2); });
    const fig = Scene.figure(sc, { s: 2.5, hang: 1 });
    const ball = sc.stand(document.createElement('canvas'), 0, 0, 26, 80);
    ball.width = 13; ball.height = 40;
    const bg = ball.getContext('2d');
    let spun = null, archKey = '';
    return (S) => {
      px.set(base);
      const shade = (cx, cy, rx, ry) => {
        for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
          const a = (x - cx) / rx, b = (y - cy) / ry, o = y * LW + x;
          if (a * a + b * b < 1 && x >= 0 && x < LW && y >= 0 && y < LH && dark[o] >= 0) put(o, dark[o]);
        }
      };
      PINS.forEach((p, j) => { if (S.pins[j] === 0) shade(p.x + 2, p.y + 1, 5.5, 2.2); });
      shade(S.fx + 2, S.figY + 1, 5, 2);
      const B = S.ball;
      if (B) shade(B.x + 2, B.y + 1, 6, 2.5);
      if (B && B.dust) for (let k = 0; k < 12; k++) {
        const a = k / 12 * 6.283, x = Math.round(B.x + Math.cos(a) * B.dust), y = Math.round(B.y + Math.sin(a) * B.dust * 0.5);
        if (lit[y * LW + x] >= 0) put(y * LW + x, 3);
      }
      g.putImageData(img, 0, 0);
      if (arch) {
        const now = performance.now() / 1000, key = Math.floor(now * 5);
        if (key !== archKey) { archKey = key; arch.clear(); look.arch(arch.p, Math.floor(now * 4), now); }
      }
      PINS.forEach((p, j) => {
        const el = pins[j], s = S.pins[j];
        el.style.display = s < 0 ? 'none' : '';
        if (s < 0) return;
        const sd = p.x < CX ? -1 : 1;
        el.style.left = p.x * 2 - el.width + [0, 2, 5, 8][s] * sd * 2 + 'px';
        el.style.top = p.y * 2 - el.height * 2 - [0, 2, 5, 8][s] * 2 + 'px';
        el.style.transform = `rotateX(${[-90, -62, -32, -4][s]}deg) rotateZ(${[0, 14, 24, 30][s] * sd}deg)`;
      });
      fig.place({ x: S.fx * 2, y: S.figY * 2, z: S.fz, rot: S.rot, sx: S.sx, sy: S.sy, lean: S.lean, bob: S.bob });
      ball.style.display = B ? '' : 'none';
      if (B) {
        const key = (B.spin || 0) + (B.trail ? 't' : '');
        if (spun !== key) {
          spun = key;
          bg.clearRect(0, 0, 13, 40);
          bg.drawImage(sprite(C, ballRows(B.spin || 0), { h: 7, a: 8, s: 3, o: 1 }, 1), 0, 27);
          if (B.trail) [7, 7, 8, 8, 4].forEach((k, i) => { bg.fillStyle = C[k]; bg.fillRect(5 + (i % 2), 23 - i * 5, 2, 3); });
        }
        ball.style.left = B.x * 2 - 13 + 'px';
        ball.style.top = B.y * 2 - 80 + 'px';
        ball.style.transform = `translateZ(${B.z || 0}px) rotateX(-90deg)`;
      }
    };
  }

  Builder.add({ name: 'A · Dressed for each ante', desc: 'Use the Ante buttons; every ante is on today\'s camera. For Ante 1 and 3 the panel picks the place under the lane (floor, backdrop, features, horizon, life); Ante 2 floats as today. 1: lacquered maple, gold rails, quilted felt decks, suit pips, chip towers and a giant card, a marquee on chip-stack pillars with chasing bulbs. 2: today\'s lane. 3: bleached planks, root rails, mossy decks, little toadstools for targets and beside the lane, a toadstool arch under a mossy root with glowing spots.', len: LEN, hold: 1.2, at, mount });
})();
