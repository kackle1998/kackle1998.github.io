'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the Dealer's Run map: a 2.5D board tilted in
   CSS 3D, Inscryption style. Paths are circuit traces between stop pads;
   spires, lava and rune circles stand around them, and your character
   walks the traces as a figurine. Every color comes from the current
   palette (Palette.cur), so the map recolors with OPTIONS.
   Map units: the board is W x H; its canvases are drawn at half size.
   ============================================================ */

const RunMap = (() => {
  const W = 760, H = 900, CW = W / 2, CH = H / 2;
  const BOSS_PIN_Y = 104;
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const D8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

  /* Stop icons silkscreened on the pads (11 wide). The boss is the casino resort (see CAS). */
  const PAD_ICONS = {
    start: [],
    battle: ['...#####...', '..#######..', '.#########.', '.##..#..##.', '.##..#..##.', '.#########.', '..###.###..', '...#####...', '...#.#.#...', '...#####...'],
    fire: ['.....#.....', '....##.....', '....###.#..', '...####.#..', '..#######..', '..###.###..', '..##...##..', '...#...#...', '#.........#', '.###...###.', '....###....'],
    altar: ['.....#.....', '....###....', '.....#.....', '....###....', '....###....', '....###....', '..#######..', '..#.....#..', '..#.#.#.#..', '..#.....#..', '.#########.'],
    trade: ['...........', '..#######..', '.#########.', '.#########.', '.#########.', '..#######..', '..###.###..', '..##...##..', '..##...##..', '..#.....#..', '...........'],
    event: ['...#####...', '..##...##..', '..##...##..', '.......##..', '......##...', '.....##....', '.....##....', '...........', '.....##....', '.....##....'],
  };
  const RUNE = ['.#...', '.##..', '.#.#.', '.##..', '.#.#.', '.#..#', '.#...'];

  const lavaL = (y) => ({ c: 36 + 12 * Math.sin(y / 46) + 6 * Math.sin(y / 14), w: 10 + 4 * Math.sin(y / 26 + 1) });
  const lavaR = (y) => ({ c: W - 36 - 12 * Math.sin(y / 40) - 6 * Math.sin(y / 17), w: 10 + 4 * Math.sin(y / 22) });
  const lightAt = (x, y) => Math.max(0, Math.min(1, 1 - Math.hypot(x - W / 2, (y - 480) * 0.85) / 560));
  const lvl = (f, x, y) => Math.max(0, Math.min(3, Math.round(f * 3 + BAY[(x & 3) + (y & 3) * 4] / 16 - 0.5)));

  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const luma = (h) => { const [r, g, b] = rgb(h); return r * 0.299 + g * 0.587 + b * 0.114; };

  /* The palette as a ramp, darkest to lightest, with the accent last. Sorted by brightness
     rather than by token name, so inverted palettes (light ink on dark paper) work too. */
  function ramp() {
    const p = Palette.cur;
    return [p.bg, p.ink, p.dark, p.mid, p.light, p.artbg, p.paper, p.white].sort((a, b) => luma(a) - luma(b)).concat(p.accent);
  }

  /* A PCB-style trace from stop a up to stop b: straight up, then 45 degrees (or a flat run first), then up. */
  function route(a, b) {
    let bx = b.x, by = b.y + 20;
    if (b.t === 'boss') { bx = W / 2 + (a.x < W / 2 - 50 ? -28 : a.x > W / 2 + 50 ? 28 : 0); by = BOSS_PIN_Y; }
    const s = Math.sign(bx - a.x), dg = Math.abs(bx - a.x), y1 = a.y - 18, av = y1 - by;
    const p = [[a.x, a.y], [a.x, y1]];
    if (dg <= av) p.push([bx, y1 - dg]);
    else { p.push([a.x + s * (dg - av), y1]); p.push([bx, y1 - av]); }
    p.push([bx, by]);
    if (b.t !== 'boss') p.push([bx, b.y]);
    return p.filter((q, i) => !i || q[0] !== p[i - 1][0] || q[1] !== p[i - 1][1]);
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

  /* ---------- static ground: lit speckle, cracks, and old circuitry ---------- */
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
    for (let k = 0; k < 100; k++) {
      let x = 24 + R() * (CW - 48) | 0, y = R() * CH | 0, d = R() * 8 | 0;
      for (let s = 0; s < 3; s++) {
        const L = 5 + R() * 14 | 0;
        for (let i = 0; i < L; i++) {
          x += D8[d][0]; y += D8[d][1];
          for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(x + a, y + b, (v) => (v === 8 ? 8 : Math.max(2, v - 1)));
        }
        d = (d + (R() < 0.5 ? 1 : 7)) % 8;
      }
      for (let a = -1; a < 3; a++) for (let b = -1; b < 3; b++) put(x + a, y + b, () => (a >= 0 && a < 2 && b >= 0 && b < 2 ? 1 : 2));
    }
    const g = cv.getContext('2d'), im = g.createImageData(CW, CH), dd = im.data, RGB = C.map(rgb);
    for (let i = 0; i < B.length; i++) { const c = RGB[B[i]]; dd[i * 4] = c[0]; dd[i * 4 + 1] = c[1]; dd[i * 4 + 2] = c[2]; dd[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
  }

  /* ---------- standing props: spires, basalt columns, crystals, rune obelisks ---------- */
  function placeProps(pl, R, C, block, runes, obel) {
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
    for (let t = 0; t < 3200 && props.length < 380; t++) {
      const x = 20 + R() * (W - 40), y = 8 + R() * (H - 16);
      if (onLava(x, y, 8)) continue;
      const d = near(x, y);
      if (d < 0 || props.some((p) => Math.abs(p.x - x) < 9 && Math.abs(p.y - y) < 7)) continue;
      const big = R();
      let h = 16 + Math.min(d, 160) * 0.5 + big * big * big * 170 + R() * 14;
      if (y < 50) h += 60 + R() * 120; // a wall of tall spires along the far edge
      let w = 8 + h * 0.2 * (0.7 + R() * 0.6);
      h = Math.max(16, Math.min(h, capBehind(x, y, w)));
      w = Math.min(w, 8 + h * 0.3);
      props.push({ x, y, k: R() < 0.8 ? 'spike' : 'basalt', h, w });
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
    const frag = document.createDocumentFragment();
    for (const list of bands.values()) {
      // Each prop's drawn box in canvas pixels, and the canvas that holds them all.
      const shapes = list.map((p) => {
        let { w, h } = p;
        if (p.k === 'basalt') { h *= 0.6; w *= 1.3; }
        return { p, w: Math.max(2, Math.round(w / 2)), h: Math.max(2, Math.round(h / 2)), cx: p.x / 2 };
      });
      const left = Math.floor(Math.min(...shapes.map((s) => s.cx - s.w / 2))) - 1;
      const right = Math.ceil(Math.max(...shapes.map((s) => s.cx + s.w / 2))) + 1;
      const tall = Math.max(...shapes.map((s) => s.h));
      const cv = document.createElement('canvas');
      cv.width = right - left; cv.height = tall;
      const x = cv.getContext('2d');
      const fill = (u, v, n, k) => { if (n > 0) { x.fillStyle = k; x.fillRect(u, v, n, 1); } };
      for (const s of shapes) {
        const { p } = s, u0 = Math.round(s.cx - s.w / 2) - left, top = tall - s.h;
        const l = lvl(lightAt(p.x, p.y), p.x | 0, p.y | 0), hi = C[l + 1], li = C[Math.max(1, l)], dk = C[Math.max(0, l - 1)];
        // Columns across the prop's width: [end fraction, color], as the old gradients were.
        const tones = p.k === 'spike' ? [[0.14, hi], [0.5, li], [1, dk]]
          : p.k === 'basalt' ? [[1 / 3, hi], [2 / 3, li], [1, dk]]
          : p.k === 'crystal' ? [[0.5, C[7]], [1, C[8]]]
          : [[0.5, C[2]], [1, C[1]]];
        for (let r = 0; r < s.h; r++) {
          const f = (r + 0.5) / s.h; // 0 at the top, 1 at the base
          // The silhouette's half-width at this row, as a fraction of the prop's width.
          const half = p.k === 'spike' || p.k === 'crystal' ? f / 2
            : p.k === 'basalt' ? (f < 0.08 ? 0.5 * (f / 0.08) : 0.5)
            : (f < 0.12 ? 0.5 * (f / 0.12) : 0.5);
          const a = Math.round(s.w * (0.5 - half)), b = Math.round(s.w * (0.5 + half));
          let from = a;
          for (const [end, k] of tones) { const to = Math.min(b, Math.round(s.w * end)); fill(u0 + from, top + r, to - from, k); from = Math.max(from, to); }
        }
        if (p.k === 'obelisk') pix(cv, RUNE, { '#': C[4] }, u0 + 3, top + 14);
      }
      const back = Math.max(...list.map((p) => p.y));
      const el = document.createElement('div');
      el.className = 'rm-st rm-band';
      el.style.cssText = `left:${left * 2}px;top:${back - tall * 2}px;width:${cv.width * 2}px;height:${tall * 2}px`;
      el.appendChild(cv);
      frag.appendChild(el);
    }
    pl.appendChild(frag);
  }

  /* ---------- the animated layer: lava, rune circles, traces ---------- */
  /* The traces don't change while the map is up, so they're painted once onto the static ground;
     each animation frame only redraws the lava (one pixel buffer, one putImageData), the turning
     rune circles, and the pulses running along the live traces. */
  function fxDrawer(fx, ground, C, edges, runes, live, walked) {
    const lineOn = (ctx) => (p0, p1, w, c) => {
      ctx.fillStyle = c;
      const x0 = p0[0] / 2, y0 = p0[1] / 2, dx = p1[0] / 2 - x0, dy = p1[1] / 2 - y0, n = Math.max(Math.abs(dx), Math.abs(dy), 1), o = w >> 1;
      for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(x0 + dx * i / n) - o, Math.round(y0 + dy * i / n) - o, w, w);
    };
    // Static traces and vias, once.
    const gl = lineOn(ground);
    for (const e of edges) {
      const on = live.has(e.i), was = walked.has(e.i), col = was ? C[7] : on ? C[8] : C[3];
      for (let i = 1; i < e.p.length; i++) gl(e.p[i - 1], e.p[i], 4, C[1]);
      for (let i = 1; i < e.p.length; i++) gl(e.p[i - 1], e.p[i], 2, col);
      for (let i = 1; i < e.p.length - 1; i++) {
        const [x, y] = e.p[i];
        ground.fillStyle = C[1]; ground.fillRect(x / 2 - 3, y / 2 - 3, 6, 6);
        ground.fillStyle = was ? C[7] : on ? C[8] : C[4]; ground.fillRect(x / 2 - 2, y / 2 - 2, 4, 4);
        ground.fillStyle = C[1]; ground.fillRect(x / 2 - 1, y / 2 - 1, 2, 2);
      }
    }
    // Lava goes through a reused pixel buffer.
    const img = fx.createImageData(CW, CH), buf = new Uint32Array(img.data.buffer);
    const u32 = (h) => { const [r, g, b] = rgb(h); return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; };
    const crust = u32(C[1]), hot = u32(C[7]), glow = u32(C[8]);
    const lava = (f, t) => {
      for (let y = 0; y < CH; y++) {
        const { c, w } = f(y * 2), cc = c / 2, ww = w / 2;
        for (let x = Math.max(0, Math.floor(cc - ww - 2)); x <= Math.min(CW - 1, cc + ww + 2); x++) {
          const d = Math.abs(x - cc) / ww;
          buf[y * CW + x] = d > 1 ? crust
            : d > 0.4 ? (Math.sin(y * 0.21 - t * 2.2 + x) > 0.8 ? hot : glow)
            : (Math.sin(y * 0.35 - t * 3 + x * 0.6) > 0.5 ? hot : glow);
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
    const pulses = edges.filter((e) => live.has(e.i));
    return (t) => {
      buf.fill(0);
      lava(lavaL, t);
      lava(lavaR, t + 3);
      fx.putImageData(img, 0, 0);
      runes.forEach(([x, y]) => rune(x, y, t));
      fx.fillStyle = C[7];
      for (const e of pulses) {
        let s = 0;
        for (const q of e.s) if (((++s - Math.floor(t * 10)) % 6 + 6) % 6 === 0) fx.fillRect(Math.round(q[0] / 2) - 1, Math.round(q[1] / 2) - 1, 2, 2);
      }
    };
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


  /* A stop's pad: reachable = solid accent (no blinking), visited = mid, the rest = paper. */
  function drawPad(c, n, state, C) {
    const x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    x.fillStyle = C[1]; x.fillRect(2, 0, 13, 17); x.fillRect(0, 2, 17, 13);
    x.fillStyle = state === 'done' ? C[3] : state === 'reach' ? C[8] : C[6];
    x.fillRect(3, 1, 11, 15); x.fillRect(1, 3, 15, 11);
    if (n.t === 'start') { x.fillStyle = C[1]; x.fillRect(6, 6, 5, 5); }
    const ic = PAD_ICONS[n.t];
    pix(c, ic, { '#': C[1] }, 3, Math.floor((17 - ic.length) / 2));
  }

  const FIG = 78; // figurine size in map units (1.3x the original 60)

  let walking = false;

  function show() {
    const run = Run.s;
    if (!run) return showTitle();
    walking = false;
    const C = ramp(), R = mulberry32((run.seed ^ 0x5eed) >>> 0);
    const nodes = run.map.nodes;
    const edges = run.map.edges.map(([a, b], i) => { const p = route(nodes[a], nodes[b]); return { i, a, b, p, s: sample(p) }; });
    const reach = Run.reach();
    const live = new Set(edges.filter((e) => e.a === run.cur && reach.includes(e.b)).map((e) => e.i));
    const walked = new Set(run.done);
    const visited = new Set(run.visited);

    // Things the spires keep clear of: every trace, pad, rune circle and obelisk.
    const block = [
      ...edges.flatMap((e) => e.s.map((q) => [q[0], q[1], 26])),
      ...nodes.map((n) => (n.t === 'boss' ? [n.x, 58, 100] : [n.x, n.y, 34])), // the casino is wide
    ];
    const clear = (x, y, r) => block.every((b) => Math.hypot(x - b[0], y - b[1]) - b[2] > r);
    const runes = [[110, 610], [650, 640], [650, 370], [110, 260], [640, 140], [120, 430]].filter(([x, y]) => clear(x, y, 34)).slice(0, 3);
    runes.forEach(([x, y]) => block.push([x, y, 34]));
    const obel = [[92, 400], [668, 180], [92, 150], [300, 34], [460, 34], [672, 520], [110, 770], [652, 800]].filter(([x, y]) => clear(x, y, 14));
    obel.forEach(([x, y]) => block.push([x, y, 18]));

    showScreen(`
      <div class="rmap" id="rmap">
        <div class="rm-view"><div class="rm-pl" id="rmPl">
          <canvas class="rm-ly" id="rmGnd" width="${CW}" height="${CH}"></canvas>
          <canvas class="rm-ly rm-fx" id="rmFx" width="${CW}" height="${CH}"></canvas>
        </div></div>
        <canvas class="rm-em" id="rmEm" width="640" height="360"></canvas>
        <div class="rhud panel">
          <div class="rh-who"><img src="${spriteURL('hero')}" alt=""><div><div class="rh-name">${escapeHTML(heroName().toUpperCase())}</div><div class="rh-deck">${escapeHTML(run.name)}</div></div></div>
          <div class="rh-row">${ico('hp')}<span>LIFE</span><b>${run.life}/${run.maxLife}</b></div>
          <div class="rh-row">${ico('tooth')}<span>TEETH</span><b>${run.teeth}</b></div>
          <div class="rh-row">${ico('spell')}<span>DECK</span><b id="rhDeck">${Run.deckSize()}</b></div>
          <button class="btn" id="rmDeck">VIEW DECK</button>
        </div>
        <div class="rm-btns"><button class="btn" id="rmMenu">MENU</button><button class="btn" id="rmQuit">ABANDON</button></div>
        <div class="rm-tick" id="rmTick"></div>
      </div>`);
    const pl = $('#rmPl'), tick = $('#rmTick');
    const idle = () => (reach.length ? 'Choose a lit trace' : 'The Dealer awaits');
    tick.textContent = idle();

    drawGround($('#rmGnd'), R, C);
    placeProps(pl, R, C, block, runes, obel);
    frame(pl, C);

    // Stop pads, and the casino for the boss.
    for (const n of nodes) {
      const el = document.createElement('div');
      const state = reach.includes(n.id) ? 'reach' : visited.has(n.id) ? 'done' : 'idle';
      if (n.t === 'boss') {
        // The resort: footprint on the board, roofs lifted to their height, upright parts as standees.
        const lit = state === 'reach', W2 = CAS.W * 2, D2 = CAS.D * 2;
        el.className = 'rm-casino';
        el.style.cssText = `left:${n.x - CAS.W}px;top:${BOSS_PIN_Y - 8 - D2}px;width:${W2}px;height:${D2}px`;
        const flat = (cv, x, y, z) => { cv.className = 'rm-c-flat'; cv.style.cssText = `left:${x}px;top:${y}px;width:${cv.width * 2}px;height:${cv.height * 2}px;transform:translateZ(${z}px)`; return cv; };
        const stand = (cv, cx, by, z) => {
          const s = document.createElement('div'), w = cv.width * 2, h = cv.height * 2;
          s.className = 'rm-st';
          s.style.cssText = `left:${cx - w / 2}px;top:${by - h}px;width:${w}px;height:${h}px;transform:translateZ(${z}px) rotateX(-90deg)`;
          s.appendChild(cv);
          return s;
        };
        const tx = CAS.towerX * 2, tw = CAS.towerW * 2, td = CAS.towerD * 2, th = CAS.towerH * 2;
        const podY = D2 - CAS.podD * 2, ph = CAS.podH * 2;
        el.append(
          flat(towerRoof(C), tx, 0, th),
          stand(towerFace(C), tx + tw / 2, td, 0),
          stand(crown(C), tx + tw / 2, td + 2, th - 4),
          flat(podiumRoof(C), 0, podY, ph),
          stand(podiumFace(C, lit), W2 / 2, D2, 0),
          stand(dome(C, 19, 24), W2 / 2 - 50, podY + 22, ph),
          stand(dome(C, 19, 24), W2 / 2 + 50, podY + 22, ph),
          stand(dome(C, 31, 38), W2 / 2, podY + 26, ph),
          stand(minaret(C), 10, D2 - 4, ph),
          stand(minaret(C), W2 - 10, D2 - 4, ph),
        );
        const carpet = casinoCarpet(C, lit);
        carpet.className = 'rm-c-carpet';
        carpet.style.cssText = `left:${CAS.W - 8}px;top:${D2}px`;
        el.append(carpet);
      } else {
        const c = document.createElement('canvas');
        el.className = 'rm-nd';
        c.width = 17; c.height = 17;
        el.style.cssText = `left:${n.x - 19}px;top:${n.y - 19}px`;
        drawPad(c, n, state, C);
        el.appendChild(c);
      }
      el.classList.toggle('reach', state === 'reach');
      pl.appendChild(el);
      el.onmouseenter = () => { tick.textContent = visited.has(n.id) && n.t !== 'start' ? `${STOPS[n.t].name}: cleared` : STOPS[n.t].desc; };
      el.onmouseleave = () => { tick.textContent = idle(); };
      el.onclick = () => walkTo(n.id);
    }

    // Your figurine: the character sprite standing up off the board.
    const fig = document.createElement('div');
    fig.className = 'rm-st rm-fig';
    fig.innerHTML = `<img src="${spriteURL('hero')}" alt="">`;
    pl.append(fig);
    const place = (x, y) => { fig.style.left = x - FIG / 2 + 'px'; fig.style.top = y - FIG - 2 + 'px'; };
    const here = nodes[run.cur];
    place(here.x, here.t === 'boss' ? BOSS_PIN_Y + 34 : here.y);

    function walkTo(id) {
      if (walking || !reach.includes(id)) return;
      const e = edges.find((x) => x.a === run.cur && x.b === id), pts = e.s.slice();
      if (nodes[id].t === 'boss') pts.push([pts[pts.length - 1][0], BOSS_PIN_Y + 34]);
      walking = true;
      // Hop along the trace: a whole number of jumps (about one per 40 map units), each arcing up
      // HOP_H and landing with a tick, in stepped heights to match the pixel art.
      const HOP_H = 36, hops = Math.max(2, Math.round((pts.length * 4) / 40));
      const img = fig.querySelector('img');
      fig.classList.add('hopping');
      let landed = 0;
      const t0 = performance.now(), dur = hops * 260;
      sfx('place');
      (function step() {
        if (!fig.isConnected) return;
        const k = Math.min(1, (performance.now() - t0) / dur), i = Math.min(pts.length - 1, Math.floor(k * (pts.length - 1)));
        const phase = k * hops, h = HOP_H * Math.sin(Math.PI * (phase % 1));
        place(pts[i][0], pts[i][1]);
        img.style.transform = `translateY(${-Math.round(h / 6) * 6}px)`;
        if (Math.floor(phase) > landed && k < 1) { landed = Math.floor(phase); sfx('tick'); }
        if (k < 1) return setTimeout(step, 33); // ~30fps, stepped like the rest of the pixel art
        img.style.transform = '';
        fig.classList.remove('hopping');
        sfx('place');
        setTimeout(() => { walking = false; Run.go(id); }, 250);
      })();
    }

    $('#rmDeck').onclick = () => { sfx('select'); Run.showDeck($('#rmap')); };
    $('#rmMenu').onclick = () => { sfx('select'); showTitle(); };
    $('#rmQuit').onclick = () => Run.confirmAbandon(() => show());

    // Animate the lava, runes, pulses and rising embers at a stepped ~12fps.
    const draw = fxDrawer($('#rmFx').getContext('2d'), $('#rmGnd').getContext('2d'), C, edges, runes, live, walked);
    const em = $('#rmEm'), ex = em.getContext('2d'), embers = [];
    let last = 0;
    (function loop(now) {
      if (!em.isConnected) return;
      requestAnimationFrame(loop);
      if (now - last < 80) return;
      last = now;
      draw(now / 1000);
      ex.clearRect(0, 0, em.width, em.height);
      if (embers.length < 50) embers.push({ x: Math.random() * em.width, y: em.height + 2, v: 0.3 + Math.random() * 0.8, a: Math.random() * 6, l: 1 });
      for (let i = embers.length - 1; i >= 0; i--) {
        const p = embers[i];
        p.y -= p.v * 3; p.a += 0.3; p.x += Math.sin(p.a) * 0.6; p.l -= 0.012;
        if (p.l <= 0) { embers.splice(i, 1); continue; }
        ex.fillStyle = p.l > 0.5 ? C[7] : C[8];
        ex.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }
    })(0);
  }

  return { show };
})();
