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
  const W = 760, CW = W / 2, BOARD_BASE = 1020;
  let H = BOARD_BASE, CH = H / 2;
  const BOSS_PIN_Y = 104;
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  /* Stop icons shown in the beacons (11 wide). The boss is the casino resort (see CAS). */
  const BEACON_ICONS = {
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
    const scale = H / BOARD_BASE; // more board, more props
    for (let t = 0; t < 3200 * scale && props.length < 380 * scale; t++) {
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

  /* ---------- the animated layer: lava, rune circles, orbit arcs ---------- */
  /* The arcs don't change while the map is up, so they're painted once onto the static ground;
     each animation frame only redraws the lava (one pixel buffer, one putImageData), the turning
     rune circles, the moons circling reachable stops, and a comet running each live arc.
     Nobody walks the arcs (the slingshot flings you), so one you've flown stays drawn in solid
     rather than worn. Rings are the stops: [x, y, reachable]. */
  const ORB = { rx: 26, ry: 10 }; // a reachable stop's orbit ring, canvas px: just wider than its beacon
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
    const comets = edges.filter((e) => live.has(e.i));
    return (t) => {
      buf.fill(0);
      lava(lavaL, t);
      lava(lavaR, t + 3);
      fx.putImageData(img, 0, 0);
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
  const SKY = 3; // screen px per sky pixel
  function skyDrawer(cv, C) {
    const g = cv.getContext('2d');
    const u32 = (h) => { const [r, gg, b] = rgb(h); return ((255 << 24) | (b << 16) | (gg << 8) | r) >>> 0; };
    const U = C.map(u32);
    let w = 0, h = 0, img, buf, lane, stars, rings, cx, cy;
    const fit = () => {
      const nw = Math.max(1, Math.round(cv.clientWidth / SKY)), nh = Math.max(1, Math.round(cv.clientHeight / SKY));
      if (nw === w && nh === h) return;
      w = cv.width = nw; h = cv.height = nh;
      img = g.createImageData(w, h); buf = new Uint32Array(img.data.buffer);
      const s = w / 320;
      cx = w / 2; cy = h * 0.17;
      rings = Array.from({ length: 8 }, (_, i) => (50 + i * 36) * s);
      // How much cloud each pixel may hold: none on an orbit, rising to full a little way off it
      // (0..1); 2 marks pixels well between orbits, where the clouds also bank up thicker.
      lane = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const r = Math.hypot(x - cx, (y - cy) / 0.32);
        let m = 1e9;
        for (const R of rings) m = Math.min(m, Math.abs(r - R));
        m /= s;
        lane[y * w + x] = m > 14 ? 2 : Math.min(1, m / 9);
      }
      const R = mulberry32(99);
      stars = Array.from({ length: Math.round(w * h / 510) }, () => ({ x: R() * w | 0, y: R() * h | 0, k: 1 + (R() * 3 | 0) }));
    };
    const set = (x, y, k) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < w && y >= 0 && y < h) buf[y * w + x] = U[k]; };
    const box = (x, y, bw, bh, k) => { for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) set(x + i, y + j, k); };
    return (t) => {
      fit();
      const d = t * 2;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const xs = x * 320 / w, ys = y * 320 / w;
        let n = Math.sin(xs * 0.02 + d * 0.05) + Math.sin(ys * 0.035 - xs * 0.01 + d * 0.03) + Math.sin((xs + ys) * 0.013 + 1.7) * 1.2 - 0.4;
        const l = lane[y * w + x], c = Math.floor(Math.max(0, n * Math.min(1, l) + (l > 1 ? 0.35 : 0)) * 1.4 + BAY[(x & 3) + (y & 3) * 4] / 16);
        buf[y * w + x] = U[c >= 2 ? 2 : c >= 1 ? 1 : 0];
      }
      // Stars: the dim ones, plus a few twinkling into crosses.
      stars.forEach((st, i) => {
        const tw = (i * 7 + Math.floor(t * 3)) % 29 === 0;
        if (st.k > 1 && !tw) return;
        set(st.x, st.y, tw ? 5 : st.k);
        if (tw) { set(st.x - 1, st.y, 3); set(st.x + 1, st.y, 3); set(st.x, st.y - 1, 3); set(st.x, st.y + 1, 3); }
      });
      // The orbits, each with its planet (one in the accent, one with a moon), and the sun.
      rings.forEach((rx, i) => {
        const ry = rx * 0.32;
        for (let a = 0, j = 0; a < 6.283; a += 1.5 / rx, j++) if (j % 2 === 0) set(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, i % 2 ? 2 : 3);
        const a = i * 1.7 + t * (0.6 / (1 + i * 0.6)), px = Math.round(cx + Math.cos(a) * rx), py = Math.round(cy + Math.sin(a) * ry), sz = 2 + (i * 5 % 3);
        box(px - (sz >> 1) - 1, py - (sz >> 1) - 1, sz + 2, sz + 2, 1);
        box(px - (sz >> 1), py - (sz >> 1), sz, sz, i === 3 ? 8 : 3 + (i % 2));
        if (i === 5) set(px + Math.cos(t * 2) * 6, py + Math.sin(t * 2) * 2, 4);
      });
      box(cx - 7, cy - 7, 14, 14, 1); box(cx - 6, cy - 6, 12, 12, 4); box(cx - 4, cy - 4, 8, 8, 5);
      g.putImageData(img, 0, 0);
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
    return (t) => {
      const step = Math.floor(t * 6);
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
     stands off the dark speckle of the stone. */
  const BEACON = 29, DIAMOND = 12, BEACON_X = 3; // canvas px; the diamond's radius; drawn at 3x on the board (87 map units)
  function drawBeacon(c, n, state, C) {
    const x = c.getContext('2d'), m = BEACON >> 1;
    x.clearRect(0, 0, c.width, c.height);
    // Collect the beacon's pixels with their colors, then outline the non-ink ones and draw them all.
    const px = [], rim = state === 'reach' ? C[8] : C[1], ink = state === 'reach' ? C[8] : state === 'done' ? C[2] : C[1];
    const rect = (u, v, w, h, k, icon) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px.push([u + i, v + j, k, icon]); };
    for (let d = -DIAMOND; d <= DIAMOND; d += 2) { const w = DIAMOND - Math.abs(d); rect(m - w, m + d, 1, 1, rim); rect(m + w, m + d, 1, 1, rim); }
    for (const [u, v] of [[0, -DIAMOND], [0, DIAMOND], [-DIAMOND, 0], [DIAMOND, 0]]) rect(m + u - 1, m + v - 1, 3, 3, rim);
    const ic = n.t === 'start' ? ['#####', '#####', '#####', '#####', '#####'] : BEACON_ICONS[n.t];
    const u0 = m - (ic[0].length >> 1), v0 = m - (ic.length >> 1);
    ic.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') rect(u0 + i, v0 + j, 1, 1, ink, true); }));
    // Outlines first (paper round an ink icon, ink round anything else), then the pixels over them.
    for (const [u, v, k, icon] of px) {
      if (k === C[1] && !icon) continue;
      x.fillStyle = k === C[1] ? C[6] : C[1];
      x.fillRect(u - 1, v, 3, 1); x.fillRect(u, v - 1, 1, 3);
    }
    for (const [u, v, k] of px) { x.fillStyle = k; x.fillRect(u, v, 1, 1); }
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
     much it follows you sideways. */
  const CAM = { min: -340, max: 210, side: 0.5 }; // `up` above the feet: the bottom 10% of the figure
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

  /* A 3D strip from p to q ([x, y, z] in its parent's map units): yawed in the board plane,
     then pitched up off it. */
  function strip(el, p, q) {
    const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], flat = Math.hypot(dx, dy);
    el.style.left = p[0] + 'px'; el.style.top = p[1] - 2.5 + 'px';
    el.style.width = Math.hypot(flat, dz) + 'px';
    el.style.transform = `translateZ(${p[2]}px) rotateZ(${Math.atan2(dy, dx)}rad) rotateY(${-Math.atan2(dz, flat)}rad)`;
  }

  let walking = false;

  function show() {
    const run = Run.s;
    if (!run) return showTitle();
    walking = false;
    const C = ramp(), R = mulberry32((run.seed ^ 0x5eed) >>> 0);
    const nodes = run.map.nodes;
    H = Math.max(BOARD_BASE, Math.max(...nodes.map((n) => n.y)) + 60);
    CH = H / 2;
    const edges = run.map.edges.map(([a, b], i) => { const p = route(nodes[a], nodes[b]); return { i, a, b, p, s: sample(p) }; });
    const reach = Run.reach();
    const live = new Set(edges.filter((e) => e.a === run.cur && reach.includes(e.b)).map((e) => e.i));
    const attuned = new Set(run.done);
    const visited = new Set(run.visited);

    // Things the spires keep clear of: every orbit arc, beacon, rune circle and obelisk.
    const block = [
      ...edges.flatMap((e) => e.s.map((q) => [q[0], q[1], 26])),
      ...nodes.map((n) => (n.t === 'boss' ? [n.x, 58, 100] : [n.x, n.y, 46])), // the casino is wide
      // Where a slingshot can stand, and its draw: the base, and in front of every stop.
      ...nodes.filter((n) => n.t !== 'boss').map((n) => (n.t === 'start' ? [n.x, n.y + 50, 70] : [n.x, n.y + 44, 38])),
      // ...and the spot beside it where you wait while one is built (see buildRig).
      ...nodes.filter((n) => n.t !== 'boss' && n.t !== 'start').map((n) => [n.x + (n.x <= W / 2 ? 1 : -1) * (SL.w + FIG / 2 + 8), n.y + 24, 30]),
    ];
    const clear = (x, y, r) => block.every((b) => Math.hypot(x - b[0], y - b[1]) - b[2] > r);
    // Rune circles and obelisks: the classic spots, repeated down a longer board.
    const tile = (spots) => Array.from({ length: Math.ceil(H / BOARD_BASE) }, (_, k) => spots.map(([x, y]) => [x, y + k * BOARD_BASE]).filter(([, y]) => y < H - 20)).flat();
    const runes = tile([[110, 610], [650, 640], [650, 370], [110, 260], [640, 140], [120, 430]]).filter(([x, y]) => clear(x, y, 34)).slice(0, Math.round(3 * H / BOARD_BASE));
    runes.forEach(([x, y]) => block.push([x, y, 34]));
    const obel = tile([[92, 400], [668, 180], [92, 150], [300, 34], [460, 34], [672, 520], [110, 770], [652, 800]]).filter(([x, y]) => clear(x, y, 14));
    obel.forEach(([x, y]) => block.push([x, y, 18]));

    showScreen(`
      <div class="rmap" id="rmap">
        <canvas class="rm-sky" id="rmSky"></canvas>
        <div class="rm-view"><div class="rm-pl" id="rmPl" style="height:${H}px">
          <canvas class="rm-ly" id="rmGnd" width="${CW}" height="${CH}" style="height:${H}px"></canvas>
          <canvas class="rm-ly rm-fx" id="rmFx" width="${CW}" height="${CH}" style="height:${H}px"></canvas>
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
    const idle = () => (reach.length ? 'Pick a lit beacon to sling yourself at' : 'The Dealer awaits');
    tick.textContent = idle();

    drawGround($('#rmGnd'), R, C);
    placeProps(pl, R, C, block, runes, obel);
    frame(pl, C);

    // Stop beacons, and the casino for the boss (whose lights the animation loop runs).
    let casinoTick = () => {};
    for (const n of nodes) {
      if (n.t === 'start') continue; // the slingshot stands here instead
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
        const carpet = casinoCarpet(C, lit);
        carpet.className = 'rm-c-carpet';
        carpet.style.cssText = `left:${CAS.W - 8}px;top:${D2}px`;
        el.append(carpet);
      } else {
        const c = document.createElement('canvas');
        el.className = 'rm-nd';
        c.width = BEACON; c.height = BEACON;
        el.style.cssText = `left:${n.x - BEACON * BEACON_X / 2}px;top:${n.y - BEACON * BEACON_X / 2}px;width:${BEACON * BEACON_X}px;height:${BEACON * BEACON_X}px`;
        drawBeacon(c, n, state, C);
        el.appendChild(c);
      }
      el.classList.toggle('reach', state === 'reach');
      pl.appendChild(el);
      el.onmouseenter = () => { if (state === 'reach' && !walking) aimAt(n); tick.textContent = visited.has(n.id) && n.t !== 'start' ? `${STOPS[n.t].name}: cleared` : STOPS[n.t].desc; };
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
    // sliding the board toward you, up to CAM.max so the casino doesn't run off the top, and
    // part of the way sideways so the board's edges stay in view.
    // (CAM was tuned on the classic board, whose base sits at y 960: the same framing on any
    // board is cam = CAM.min + 1000 - y, starting lower the further down the base is.)
    const camLo = CAM.min + 1000 - (nodes[0].y + 40);
    let look = 0, lastFollow = [W / 2, nodes[0].y];
    const follow = (x, y) => {
      lastFollow = [x, y];
      const cy = Math.max(camLo, Math.min(CAM.max, CAM.min + 1000 - y + look)), cx = (W / 2 - x) * CAM.side;
      pl.style.setProperty('--cam', Math.round(cy / 2) * 2 + 'px');
      pl.style.setProperty('--camX', Math.round(cx / 2) * 2 + 'px');
    };
    follow(sl.BX, sl.BY);
    // Scroll the wheel to look up the board toward the casino (or back down); a jump recentres.
    $('#rmap').addEventListener('wheel', (e) => {
      e.preventDefault();
      look = Math.max(-2000, Math.min(2000, look - Math.sign(e.deltaY) * 80));
      follow(...lastFollow);
    }, { passive: false });

    if (slingAt === prevAt) { sl.rig.append(fig); sl.load(0); } else buildRig(makeRig(prevAt));

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

    // The build, under two seconds: the old slingshot crumbles to dust, the new fork goes up from
    // its foot in six hammered courses throwing sparks, its bands are strung and the pouch hung,
    // then you hop into the pouch. Meanwhile you stand beside the fork, level with its foot and
    // on the board's inner side, clear of the going-up and of the lava.
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
      at(80, () => { sfx('poof'); burst(old.fork, 0.6, 22, 'dust'); burst(old.fork, 0.2, 16, 'dust'); });
      [0.66, 0.33].forEach((s, i) => at(80 + i * 90, () => { old.rig.style.transform = `scale3d(${s}, ${s}, ${s})`; }));
      at(260, () => old.rig.remove());
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
          setTimeout(() => { walking = false; Run.go(id); }, 320);
        });
      }
    }

    $('#rmDeck').onclick = () => { sfx('select'); Run.showDeck($('#rmap')); };
    $('#rmMenu').onclick = () => { sfx('select'); showTitle(); };
    $('#rmQuit').onclick = () => Run.confirmAbandon(() => show());

    // Animate the sky, lava, runes, sigils, casino lights and rising embers at a stepped ~12fps.
    // Every stop but the casino sits in a sigil ring; the start's is where the lines meet, behind the slingshot.
    const rings = nodes.filter((n) => n.t !== 'boss').map((n) => [n.x, n.y, reach.includes(n.id)]);
    const draw = fxDrawer($('#rmFx').getContext('2d'), $('#rmGnd').getContext('2d'), C, edges, runes, live, attuned, rings);
    const sky = skyDrawer($('#rmSky'), C);
    const em = $('#rmEm'), ex = em.getContext('2d'), embers = [];
    let last = 0;
    (function loop(now) {
      if (!em.isConnected) return;
      requestAnimationFrame(loop);
      if (now - last < 80) return;
      last = now;
      sky(now / 1000);
      draw(now / 1000);
      casinoTick(now / 1000);
      ex.clearRect(0, 0, em.width, em.height);
      if (embers.length < 50) embers.push({ x: Math.random() * em.width, y: em.height + 2, v: 0.3 + Math.random() * 0.8, a: Math.random() * 6, l: 1 });
      for (let i = embers.length - 1; i >= 0; i--) {
        const p = embers[i];
        p.y -= p.v * 3; p.a += 0.3; p.x += Math.sin(p.a) * 0.6; p.l -= 0.012;
        if (p.l <= 0) { embers.splice(i, 1); continue; }
        ex.fillStyle = p.l > 0.5 ? C[7] : C[8];
        ex.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }
      // Build sparks and crumble dust: thrown up, falling back.
      for (let i = bits.length - 1; i >= 0; i--) {
        const p = bits[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.7; p.l -= 0.08;
        if (p.l <= 0) { bits.splice(i, 1); continue; }
        ex.fillStyle = p.c;
        ex.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
      }
    })(0);
  }

  return { show };
})();
