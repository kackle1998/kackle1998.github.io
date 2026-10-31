'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the bowling lane (a ? stop event, see Run.bowl in js/run.js).
   Drawn like the Dealer's Run map: the lane is a flat pixel canvas tilted by the map's own
   camera, and the pins, the ball and your figurine stand up off it as standees. Every color
   comes from the palette ramp (RunMap.ramp), so the lane recolors with OPTIONS. The stage and
   your figurine come from the scene kit (js/scene.js), as every event scene's do. The lane is
   dressed for each ante's world (LOOKS, below): the casino, the celestial and the witchy wood.
   Lane units: the canvas is LW x LH pixels at 1 px = 2 map units.
   ============================================================ */

const Bowl = (() => {
  const LW = 720, LH = 260;           // the lane canvas: the slab in the middle, open sky either side
  const CX = 360;                      // the middle of your lane
  const LANE = 30;                     // half its width (the boards)
  const FOUL = 226, FIG_Y = 234, BALL_Y = 238, PIT = 10;
  // Where the ball can be set along the foul line (lane px from CX). The figurine stands left of the
  // ball and is 22 px wide, so the left end stops it at the boards' edge rather than over the gutter;
  // the right end stops the ball itself at the edge.
  const SLIDE_L = -9, SLIDE_R = 23;
  const slideX = (v) => CX + SLIDE_L + v * (SLIDE_R - SLIDE_L);
  const AIM = 0.2 + 10 * Math.PI / 180; // the aim swings this far either way (radians): about 21 degrees
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const cl = (v) => Math.max(0, Math.min(1, v));
  const lvl = (f, x, y) => Math.max(0, Math.min(3, Math.round(f * 3 + BAY[(x & 3) + (y & 3) * 4] / 16 - 0.5)));
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

  /* The rack, head pin first, then each row back; i counts from the left. */
  const PINS = [];
  for (let r = 0; r < 4; r++) for (let i = 0; i <= r; i++) PINS.push({ r, i, x: CX + (i - r / 2) * 16, y: 72 - r * 14 });

  /* A pin seen from the side, lit from the left (l lit, m mid, s shade), with accent neck stripes. */
  const PIN = ['...lms...', '..llmms..', '..llmms..', '..llmms..', '...lms...', '...rrr...', '...lms...', '...rrr...', '...lms...',
    '..llmms..', '.lllmmss.', 'llllmmmss', 'llllmmmss', 'llllmmmss', 'llllmmmss', 'llllmmmss', 'llllmmmss', '.lllmmss.',
    '.lllmmss.', '..llmms..', '..llmms..', '..llmms..', '...lms...'];
  const ARCANA = ICONS.arcana;

  /* Rows of palette keys to a canvas, with a 1 px outline in tone `outline` (or none). */
  function sprite(C, rows, map, outline) {
    const h = rows.length + 2, w = rows[0].length + 2, cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    const at = (x, y) => y >= 0 && y < rows.length && x >= 0 && x < rows[0].length && map[rows[y][x]] != null;
    for (let y = -1; y <= rows.length; y++) for (let x = -1; x <= rows[0].length; x++) {
      let i = null;
      if (at(x, y)) i = map[rows[y][x]];
      else if (outline != null && (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1))) i = outline;
      if (i != null) { g.fillStyle = C[i]; g.fillRect(x + 1, y + 1, 1, 1); }
    }
    return cv;
  }

  /* The ball, 11 wide: three finger holes that turn round with `ph` as it rolls. */
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

  /* Stone columns standing beside the lane: whole, and broken off at the top (l lit, m mid, s shade). */
  const COLUMN = ['llllmmss', 'llllmmss', '.llmmms.', ...Array(27).fill('.lmmmms.'), '.llmmms.', 'llllmmss', 'llllmmss'];
  const BROKEN = ['..l.....', '.llm..s.', '.llmmms.', ...Array(17).fill('.lmmmms.'), '.llmmms.', 'llllmmss', 'llllmmss'];

  /* ---------- the lane by ante (mocked up in mockups/bowl.js) ----------
     The same lane redressed for each ante's world, as the Shooting Gallery's booth is (js/gallery.js),
     on the same camera, its far end the horizon in every ante:
       Ante 1, the casino: on the casino court's checker, the court's wall standing at the lane's end;
         lacquered maple, gold rails, quilted felt decks, a chip-edged foul line, card suits for targets,
         chip towers and a giant card where the columns stand; past the pins a marquee on chip-stack
         pillars, bulbs chasing along it, a velvet valance.
       Ante 2, the celestial: the flagstone lane floating in the orrery, its runes, cracks and columns.
       Ante 3, the witchy wood: on the carnival midway's dirt (no boardwalk) under the orrery; bleached
         planks, root rails, mossy decks, little toadstools for targets and beside the lane; past the pins
         an arch of two giant toadstools under a mossy root, their spots glowing in turn.
     Lane px are 2 map units: d across from the middle (the boards -30..29, a rim and a gutter either side
     to ±36, the decks to ±45, a dark edge at ±46 and along the far end), y along (0 the far end). */
  const mod = (a, m) => ((a % m) + m) % m;
  const mx = (x) => 720 + (x - 75) * 4; // a scene x as a plane x (map units): scene x 75 is the lane's middle
  const part = (d, y) => (d < -46 || d >= 46 || y < PIT ? 'off' : y === PIT || d === -46 || d === 45 ? 'edge'
    : d >= -30 && d < 30 ? (y >= FOUL - 1 && y <= FOUL ? 'foul' : y > FOUL ? 'approach' : 'boards')
    : d >= -36 && d < 36 ? (d === -36 || d === -31 || d === 30 || d === 35 ? 'rim' : 'gutter') : 'deck');
  const ramp = (T, L, dim, x, y) => T[lvl(cl(L - dim), x, y)];
  const markAt = (bx, y, rows) => { // the five target spots in a chevron: the mark's character there, or null
    for (const [dx, dy] of [[-24, 0], [-12, -5], [0, -10], [12, -5], [24, 0]]) {
      const r = typeof rows === 'function' ? rows(dx) : rows, gx = bx - 27 - dx, gy = y - 146 - dy;
      if (gx >= 0 && gx < 5 && gy >= 0 && gy < r.length && r[gy][gx] !== '.') return { dx, ch: r[gy][gx] };
    }
    return null;
  };
  const scuffs = (seed, n, len, wander) => { // a few short marks across your lane only, the same every time
    const R = mulberry32(seed), out = new Set();
    for (let k = 0; k < n; k++) {
      let x = CX - 26 + R() * 52, y = 90 + R() * 120, a = R() * 6.3;
      for (let i = 0; i < len; i++) { a += (R() - 0.5) * 1.1; x += Math.cos(a); y += Math.sin(a) * wander; out.add((x | 0) + ',' + (y | 0)); }
    }
    return out;
  };
  const CRACKS = scuffs(11, 4, 6, 1), KNOTS = scuffs(5, 6, 2, 0.5);
  const MARK = 2; // the target marks' one tone, the same at every ante (runes, card suits, little toadstools)
  const SUITS = [['..#..', '.###.', '#####', '..#..', '.###.'], ['##.##', '#####', '#####', '.###.', '..#..'],
    ['..#..', '.###.', '#####', '.###.', '..#..'], ['.###.', '.###.', '#####', '#.#.#', '..#..']]; // spade, heart, diamond, club
  const SHROOM = ['.###.', '#o#o#', '#####', '..#..', '..#..']; // a little toadstool from above: a cap with two spots, its stem
  // One of the map's ante props (RunMap.propArt: 'chips', 'card', 'toadstool'), w x h px, with an ink outline.
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
  /* The piece past the pins stands on an upright plane at the slab's far edge, drawn in scene px (4 map
     units each) with the ground at y AH, on the side decks (scene x 52..57 and 93..98; the boards are
     60..90); st is its 4-a-second step. */
  const AH = 34, AX0 = 46, AW = 58, D_ARCH = 22, MID = 75;
  // Cells ('x,y' -> tone, scene px) drawn with a 1 px ink outline round the whole shape, as a sprite's.
  function cells({ R }, m) {
    for (const key of m.keys()) {
      const [x, y] = key.split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!m.has(x + dx + ',' + (y + dy))) R(x + dx, y + dy, 1, 1, 1);
    }
    for (const [key, k] of m) { const [x, y] = key.split(',').map(Number); R(x, y, 1, 1, k); }
  }
  // A giant toadstool centered on cx, its cap's top row at capY: a stem lit on its left, a domed cap lit from
  // the upper left with a dark gill line under it, five spots glowing in turn.
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
  /* Each look: place (null: floating in the orrery; else the floor and backdrop under the lane, which
     Scene.setting stops at the lane's end with the 'edge' horizon), px(part, d, y, bx, L, dim, x) a lane
     pixel's tone (-1 for none; dim is the contact shadows'), near(stand, C, heat) its props, standing where
     the columns stand and no bigger, and arch(pen, st) the piece past the pins, if any. */
  const LOOKS = {
    celestial: {
      place: null,
      px(r, d, y, bx, L, dim, x) {
        if (r === 'off') return -1;
        if (r === 'edge') return ramp([1, 2, 2, 3], L, dim, x, y);
        if (r === 'rim') return ramp([2, 3, 3, 4], L, dim, x, y);
        if (r === 'gutter') return ramp([1, 2, 2, 3], L, dim, x, y);
        if (r === 'deck') return ramp(x % 14 === 13 || y % 12 === 11 ? [2, 3, 3, 3] : [3, 4, 4, 5], L, dim, x, y);
        if (y === FOUL) return ramp([2, 3, 3, 3], L, dim, x, y);
        if (!dim && markAt(bx, y, RunMap.RUNE)) return MARK; // runes where the target arrows would be
        if (!dim && CRACKS.has(x + ',' + y)) return 3;
        const row = Math.floor(y / 18); // flagstones, staggered
        return ramp((bx + (row % 2) * 10) % 20 === 19 || y % 18 === 17 ? [3, 4, 4, 5] : [5, 6, 6, 7], L, dim, x, y);
      },
      near(stand, C) { [[-40, 60, 1], [40, 125, 0], [-40, 195, 1]].forEach(([dx, y, b]) => stand(sprite(C, b ? BROKEN : COLUMN, { l: 6, m: 5, s: 3 }, 2), CX + dx, y)); },
    },
    casino: {
      place: { floor: 'tiles', backdrop: 'tropicana' }, // the casino court's checker and its wall
      px(r, d, y, bx, L, dim, x) {
        if (r === 'off') return -1;
        if (r === 'edge') return 1;
        if (r === 'rim') return d === -31 || d === 30 ? 7 : 8; // gold rails, lit along the lane side
        if (r === 'gutter') return ramp([1, 1, 2, 2], L, dim, x, y); // dark felt
        if (r === 'deck') { // quilted felt, a pale stud in each diamond
          const a = mod(x + y, 10), b = mod(x - y, 10);
          return a === 0 || b === 0 ? ramp([2, 3, 3, 3], L, dim, x, y) : a === 5 && b === 5 ? 6 : ramp([3, 4, 4, 5], L, dim, x, y);
        }
        if (r === 'foul') return mod(bx, 8) < 5 ? (mod(Math.floor(bx / 8), 2) ? 7 : 8) : 1; // edged like a chip
        if (r === 'approach') return ramp(((x >> 2) + (y >> 2)) % 2 ? [4, 5, 5, 6] : [5, 6, 6, 7], L, dim, x, y); // the court's checker
        const m = !dim && markAt(bx, y, (dx) => SUITS[(dx / 12 + 6) % 4]);
        if (m) return MARK; // card suits for targets, all in the targets' one tone
        if (bx === 1 || bx === 58) return dim ? 7 : 8; // a gold inlay down each edge
        return ramp(bx % 6 === 5 ? [4, 5, 6, 6] : [5, 6, 7, 7], L, dim, x, y); // lacquered maple
      },
      near(stand, C, heat) { // two chip towers and a giant card
        stand(prop(C, 'chips', 8, 26, 3, heat), CX - 40, 60);
        stand(prop(C, 'card', 9, 13, 1, heat), CX + 40, 125);
        stand(prop(C, 'chips', 8, 32, 8, heat), CX - 40, 195);
      },
      // A marquee on chip-stack pillars standing on the side decks, everything over them mirrored about the
      // lane's middle: a dark band railed in gold, nine bulbs chasing along it, a velvet valance scalloped
      // from the middle out with a gold hem.
      arch({ R, P }, st) {
        const PT = 22, L = 52, Rx = 93, top = AH - PT; // pillars 6 px wide: 52..57 and 93..98
        for (const [x, lit] of [[L, 0], [Rx, 1]]) { // chips 2 px thick (a face and a seam), gold and pale by turns, a lit top chip
          R(x, top - 2, 6, PT + 2, 1);
          for (let c = 0, y = AH - 1; y > top; c++, y -= 2) { R(x + 1, y - 1, 4, 1, c % 3 === 0 ? 8 : c % 3 === 1 ? (lit ? 7 : 6) : 5); R(x + 1, y, 4, 1, 1); }
          R(x + 1, top - 1, 4, 1, 7);
        }
        const my = top - 10, w = Rx + 6 - L; // the band's inside: 52..98
        R(L - 1, my, w + 2, 10, 1); R(L, my + 1, w, 8, 2);
        R(L, my + 1, w, 2, 8); R(L, my + 1, w, 1, 7); R(L, my + 7, w, 2, 8);
        for (let i = 0; i < 9; i++) R(MID - 21 + i * 5, my + 4, 3, 2, (i + st) % 3 ? 4 : 7);
        for (let x = L + 6; x < Rx; x++) {
          const u = Math.abs(x - MID), dc = Math.min(u % 6, 6 - (u % 6)), dip = [3, 3, 2, 1][dc];
          R(x, top, 1, dip, Math.round(u / 6) % 2 ? 4 : 5); R(x, top + dip, 1, 1, 8); P(x, top + dip + 1, 1);
        }
      },
    },
    witchy: {
      place: { floor: 'dirt', backdrop: 'sky' }, // the carnival midway's dirt, without its boardwalk, under the orrery
      px(r, d, y, bx, L, dim, x) {
        if (r === 'off') return -1;
        if (r === 'edge') return ramp([1, 1, 2, 2], L, dim, x, y);
        if (r === 'rim') return ramp(mod(y + (d < 0 ? 0 : 5), 9) < 2 ? [1, 2, 2, 2] : [2, 3, 3, 4], L, dim, x, y); // a root, twisting
        if (r === 'gutter') return ramp([1, 1, 2, 2], L, dim, x, y);
        if (r === 'deck') { // moss, a few little mushrooms in it
          if (!dim && mod(x * 7 + y * 13, 97) === 0) return 7;
          if (!dim && mod(x * 7 + y * 13, 97) === 1) return 4;
          return ramp([2, 3, 3, 4], L, dim, x, y);
        }
        if (r === 'foul') return ramp([1, 2, 2, 2], L, dim, x, y); // a root laid across
        if (r === 'approach') return ramp([3, 4, 4, 5], L, dim, x, y); // packed earth
        const m = !dim && markAt(bx, y, SHROOM);
        if (m && m.ch !== 'o') return MARK; // little toadstools for targets, their spots left as the plank
        if (!dim && KNOTS.has(x + ',' + y)) return 4;
        return ramp(bx % 6 === 5 ? [4, 5, 5, 6] : [5, 6, 6, 7], L, dim, x, y); // bleached planks
      },
      near(stand, C, heat) { // three of the map's toadstools, their spots glowing at this ante
        stand(prop(C, 'toadstool', 10, 18, 4, heat), CX - 40, 60);
        stand(prop(C, 'toadstool', 9, 14, 9, heat), CX + 40, 125);
        stand(prop(C, 'toadstool', 10, 22, 2, heat), CX - 40, 195);
      },
      // An arch of two giant toadstools on the side decks under a mossy root: the root first, the toadstools
      // over it, both the same art, each outlined all round.
      arch(p, st) {
        const L = 55, Rx = 95, capY = AH - 30, root = new Map();
        for (let x = L + 6; x < Rx - 6; x++) { // 2 px thick, sagging a little, lit along its top; moss hanging, 2 px wide
          const y = Math.round(capY + 4 + 3 * Math.sin(Math.PI * (x - L) / (Rx - L)));
          root.set(x + ',' + y, 3); root.set(x + ',' + (y + 1), 2);
          if (mod(x * 5, 7) === 0) { const len = 2 + mod(x * 3, 5); for (let j = 0; j < len; j++) for (const dx of [0, 1]) root.set(x + dx + ',' + (y + 2 + j), j === len - 1 ? 4 : 3); }
        }
        cells(p, root);
        for (const cx of [L, Rx]) cells(p, toadCells(cx, capY, st));
      },
    },
  };
  const LOOK_OF_ANTE = ['casino', 'celestial', 'witchy']; // by ante (1, 2, 3), as RunMap's looks

  /* ---------- the ball's path and the roll ---------- */
  /* Where the ball is at t (0 at release, 1 at the pit): it heads off along `aim` (radians, minus is
     left) and hooks left late, more on a soft throw. Off the boards it drops into a gutter and stays. */
  function path(bx, aim, pow) {
    const hook = -(6 + 8 * (1 - pow)), tan = Math.tan(aim);
    const at = (t) => bx + tan * t * (BALL_Y - PIT) + hook * t * t * t;
    let out = null; // where it leaves the boards, if it does
    for (let k = 0; k <= 228 && !out; k++) {
      const x = at(k / 228);
      if (Math.abs(x - CX) > LANE - 2) out = { x: CX + Math.sign(x - CX) * (LANE + 3), t: k / 228 };
    }
    return (t) => {
      const y = BALL_Y - t * (BALL_Y - PIT);
      return out && t >= out.t ? { x: out.x, y, gutter: true } : { x: at(t), y, gutter: false };
    };
  }

  /* The steps of the throw animation: the figurine leans for LEAN steps, then the ball takes
     rollSteps(pow) steps to the pit: 8 on the hardest throw, up to 22 on the softest. */
  const LEAN = 2;
  const rollSteps = (pow) => Math.round(8 + (1 - pow) * 14);
  const stepAt = (y, pow) => LEAN + Math.ceil((BALL_Y - y) / (BALL_Y - PIT) * rollSteps(pow));

  /* Roll the throw once: which pins fall, the step each one starts to fall at, and which way.
     The ball knocks over what it touches; each falling pin can take down the pins behind it,
     more likely on a hard throw and in the pocket (just right of the head pin, where the hook comes in). */
  function roll(bx, aim, pow, rand = Math.random) {
    const at = PINS.map(() => -1), side = PINS.map((p) => (p.x < CX ? -1 : 1)), dir = [];
    const P = path(bx, aim, pow);
    const pts = [];
    for (let k = 0; k <= 228; k++) pts.push(P(k / 228));
    const head = pts.find((q) => q.y <= PINS[0].y) || pts[pts.length - 1];
    const pocket = head.gutter ? 0 : cl(1 - Math.abs(head.x - CX - 6) / 5);
    const pk = Math.min(0.95, 0.3 + 0.45 * pow + 0.3 * pocket);
    for (const q of pts) {
      if (q.gutter) break;
      PINS.forEach((p, j) => {
        if (at[j] >= 0) return;
        const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy);
        if (d < 9) { at[j] = stepAt(q.y, pow); const n = Math.hypot(dx, dy - 0.6 * d) || 1; dir[j] = [dx / n, (dy - 0.6 * d) / n]; side[j] = dx < 0 ? -1 : 1; }
      });
    }
    // Falling pins knock the pins behind and beside them, in order.
    const queue = PINS.map((_, j) => j).filter((j) => at[j] >= 0).sort((a, b) => at[a] - at[b]);
    while (queue.length) {
      const j = queue.shift(), p = PINS[j], [ux, uy] = dir[j];
      PINS.forEach((o, k) => {
        if (at[k] >= 0) return;
        const vx = o.x - p.x, vy = o.y - p.y, d = Math.hypot(vx, vy);
        if (d > 22 || (vx * ux + vy * uy) / d < 0.57 || rand() > pk) return;
        at[k] = at[j] + 1; dir[k] = [vx / d, vy / d]; side[k] = vx < 0 ? -1 : vx > 0 ? 1 : side[j];
        queue.push(k);
      });
    }
    return { at, side };
  }

  /* ---------- the stage ---------- */
  /* Build the lane in `stage` (sized by CSS). Returns draw(state), called once per animation step:
     { fx, bx, by, ball: bool, spin, lean, aim, pins: per pin 0 standing / 1..3 falling / -1 gone,
       side, meter: 0..1 or null, arcana: count or 0 }. */
  function mount(stage, heat = 1) {
    // The stage, from the scene kit (js/scene.js): the run map's sky and camera, the same at every ante.
    // The view is 700 tall like a map screen, scaled so view y 30 to 630 fills the stage: the sky past the
    // lane's end, down to just past the figurine. Over it, the payout (top) and the power bar (hud).
    const look = LOOKS[LOOK_OF_ANTE[heat]] || LOOKS.celestial;
    const sc = Scene.mount(stage, { rows: 600, top: -30, extra: '<canvas class="bw-hud bw-top" width="120" height="14"></canvas><canvas class="bw-hud" width="120" height="14"></canvas>' });
    const { C, RGB, pl } = sc, top = stage.querySelector('.bw-top'), hud = stage.lastChild;
    // The ante's place under the lane, stopping where the lane ends (the 'edge' horizon), any wall standing there.
    // (over: the floor's own shadow layer, which the lane doesn't use; kept small.)
    if (look.place) Scene.setting(sc, 'ruins', { heat, ...look.place, features: [], critters: [], effects: [], horizon: 'edge', over: { x0: 0, y0: 0, w: 720, h: 300 } });

    // The lane: every pixel's tone worked out once, lit and in shadow, so a step only copies. Off the slab
    // and past the pins it stays clear (alpha 0), for the sky or the place's floor. Laid just over the floor.
    const lane = document.createElement('canvas');
    lane.width = LW; lane.height = LH; lane.className = 'bw-lane';
    if (look.place) lane.style.transform = 'translateZ(1px)';
    pl.appendChild(lane);
    const lit = new Int16Array(LW * LH), dark = new Int16Array(LW * LH);
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      const d = x - CX, L = cl(1.1 - (d + 60) / 120 * 0.5 - y / LH * 0.35), bx = d >= -30 && d < 30 ? d + 30 : -1, o = y * LW + x, r = part(d, y); // lit from the upper left
      lit[o] = look.px(r, d, y, bx, L, 0, x);
      dark[o] = lit[o] < 0 ? -1 : Math.max(0, look.px(r, d, y, bx, L, 0.55, x));
    }
    const g = lane.getContext('2d'), img = g.createImageData(LW, LH), px = img.data;
    const put = (o, i) => { const c = RGB[i], p = o * 4; px[p] = c[0]; px[p + 1] = c[1]; px[p + 2] = c[2]; px[p + 3] = 255; };
    const paint = (x, y, i) => put(y * LW + x, i);
    for (let o = 0; o < LW * LH; o++) if (lit[o] >= 0) put(o, lit[o]);
    const base = new Uint8ClampedArray(px);
    g.putImageData(img, 0, 0); // painted now, so the lane is never blank before the first draw

    const stand = (el, w, h) => sc.stand(el, 0, 0, w, h); // placed as they move, below
    // The look's props where the columns stand, at 3 map units a pixel (lane px x, y: their feet).
    look.near((cv, x, y) => sc.stand(cv, x * 2 - cv.width * 1.5, y * 2, cv.width * 3, cv.height * 3), C, heat);
    // The piece past the pins, if the look has one, stepping on its own (4 a second) so it runs between throws too.
    if (look.arch) {
      const arch = Scene.plane(sc, { left: mx(AX0), x0: AX0, depth: D_ARCH, w: AW, h: AH });
      let last = -1;
      const step = () => { const st = Math.floor(performance.now() / 250); if (st !== last) { last = st; arch.clear(); look.arch(arch.p, st); } };
      step(); sc.every(100, step);
    }
    const pins = PINS.map(() => { const cv = sprite(C, PIN, { l: 7, m: 6, s: 4, r: 8 }, 2); return stand(cv, cv.width * 2, cv.height * 2); });
    // Your figurine, with an ink outline so its pale face doesn't melt into the pale boards.
    // 16 px drawn at 2.5x (40 units), plus the outline's pixel on every side (Scene.figure).
    const fig = Scene.figure(sc, { s: 2.5, hang: 1 }); // standing on its outline's last row
    // The ball's canvas has room above the ball for the falling star's trail (the entrance, see Run.bowl).
    const ball = stand(document.createElement('canvas'), 26, 80);
    ball.width = 13; ball.height = 40;
    const bg = ball.getContext('2d');
    let spun = null;

    const hg = hud.getContext('2d'), tg = top.getContext('2d');
    const dot = (x, y, i, ctx = hg) => { ctx.fillStyle = C[i]; ctx.fillRect(x, y, 1, 1); };
    function drawHud(meter, n) {
      hg.clearRect(0, 0, 120, 14);
      tg.clearRect(0, 0, 120, 14);
      if (meter != null) {
        // The power bar: a wedge that rises to the right, the last stretch in the accent, and a marker with ticks.
        for (let x = 2; x <= 117; x++) for (let y = 3; y <= 10; y++) {
          if (x === 2 || x === 117 || y === 3 || y === 10) { dot(x, y, 1); continue; }
          const hot = x >= 94, h = 1 + Math.floor((x - 3) / 28) + (hot ? 1 : 0);
          dot(x, y, 10 - y <= h ? (hot ? 8 : 4) : 7);
        }
        const X = 3 + Math.round(meter * 113);
        for (let y = 2; y <= 11; y++) dot(X, y, 1);
        for (const y of [1, 12]) for (const u of [-1, 0, 1]) dot(X + u, y, 1);
      }
      // The payout, along the top in the open sky past the pins: one arcana symbol per arcana won, with a drop shadow.
      const x0 = Math.round((120 - n * 8) / 2);
      for (let i = 0; i < n; i++) ARCANA.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') { dot(x0 + i * 8 + x + 1, y + 4, 2, tg); dot(x0 + i * 8 + x, y + 3, 8, tg); } }));
    }

    function draw(st) {
      if (!stage.isConnected) return;
      // Contact shadows (down and right of each standee, away from the light) and the aim dots.
      px.set(base);
      const shade = (cx, cy, rx, ry) => {
        for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
          const a = (x - cx) / rx, b = (y - cy) / ry;
          if (a * a + b * b < 1 && x >= 0 && x < LW && y >= 0 && y < LH && dark[y * LW + x] >= 0) paint(x, y, dark[y * LW + x]);
        }
      };
      PINS.forEach((p, j) => { if (st.pins[j] === 0) shade(p.x + 2, p.y + 1, 5.5, 2.2); });
      shade(st.fx + 2, (st.figY ?? FIG_Y) + 1, 5, 2); // over open sky (mid-flight) the shadow just isn't drawn
      if (st.ball) shade(st.bx + 2, st.by + 1, 6, 2.5); // stays on the ground while it falls, showing where it will land
      // A ring of dust kicked up round the ball where it hits the stone.
      if (st.dust) for (let k = 0; k < 12; k++) {
        const a = k / 12 * 6.283, x = Math.round(st.bx + Math.cos(a) * st.dust), y = Math.round(st.by + Math.sin(a) * st.dust * 0.5);
        if (x >= 0 && x < LW && y >= 0 && y < LH && lit[y * LW + x] >= 0) paint(x, y, 3); // mid tone, to show on the pale stone
      }
      if (st.aim != null) for (let s = 12; s < 170; s += 7) {
        const x = Math.round(st.bx + Math.sin(st.aim) * s), y = Math.round(st.by - Math.cos(st.aim) * s);
        if (y < 80) break;
        // A wide aim can run off the slab; the dots stop at its edge rather than hang in the sky.
        for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (lit[(y + v) * LW + x + u] >= 0) paint(x + u, y + v, 1);
      }
      g.putImageData(img, 0, 0);

      // Pins tip over backward and to the side in three steps, then are swept away.
      PINS.forEach((p, j) => {
        const el = pins[j], s = st.pins[j];
        el.style.display = s < 0 ? 'none' : '';
        if (s < 0) return;
        const sd = st.side[j], ax = [-90, -62, -32, -4][s], az = [0, 14, 24, 30][s] * sd;
        el.style.left = p.x * 2 - el.width + [0, 2, 5, 8][s] * sd * 2 + 'px';
        el.style.top = p.y * 2 - el.height * 2 - [0, 2, 5, 8][s] * 2 + 'px';
        el.style.transform = `rotateX(${ax}deg) rotateZ(${az}deg)`;
      });
      // In flight (the entrance, see Run.bowl) figY/fz move it about and lift it, tumble turns it in
      // quarter steps, and squash flattens it for a step as it lands ("Event entrances" in CLAUDE.md).
      fig.place({ x: st.fx * 2, y: (st.figY ?? FIG_Y) * 2, z: st.fz || 0, rot: (st.tumble || 0) / 90, lean: st.lean,
        ...(st.squash ? Scene.SQUASH : {}), bob: !st.lean && !st.fz && !st.squash && st.bob !== false });
      ball.style.display = st.ball ? '' : 'none';
      if (st.ball) {
        const key = st.spin + (st.trail ? 't' : '');
        if (spun !== key) {
          spun = key;
          bg.clearRect(0, 0, 13, 40);
          bg.drawImage(sprite(C, ballRows(st.spin), { h: 7, a: 8, s: 3, o: 1 }, 1), 0, 27);
          // The falling star's trail: five stepped blocks up from the ball, white then gold then light,
          // stepping left and right a pixel so it reads as sparkle without blinking.
          if (st.trail) [7, 7, 8, 8, 4].forEach((k, i) => { bg.fillStyle = C[k]; bg.fillRect(5 + (i % 2), 23 - i * 5, 2, 3); });
        }
        ball.style.left = st.bx * 2 - 13 + 'px';
        ball.style.top = st.by * 2 - 80 + 'px';
        ball.style.transform = `translateZ(${st.bz || 0}px) rotateX(-90deg)`;
      }
      drawHud(st.meter, st.arcana || 0);
    }
    draw.alive = sc.alive; // for Scene.play
    return draw;
  }

  return { mount, roll, path, stepAt, rollSteps, slideX, PINS, CX, AIM, BALL_Y, FIG_Y, PIT, LEAN, LOOK_OF_ANTE };
})();
