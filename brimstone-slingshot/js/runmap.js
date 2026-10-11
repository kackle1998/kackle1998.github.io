'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the Dealer's Run map: a 2.5D board tilted in
   CSS 3D, Inscryption style. Paths are circuit traces between stop pads;
   spires, lava and rune circles stand around them, and your character
   walks the traces as a figurine. Every colour comes from the current
   palette (Palette.cur), so the map recolours with OPTIONS.
   Map units: the board is W x H; its canvases are drawn at half size.
   ============================================================ */

const RunMap = (() => {
  const W = 760, H = 900, CW = W / 2, CH = H / 2;
  const BOSS_PIN_Y = 104;
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const D8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

  /* Stop icons silkscreened on the pads (11 wide); the boss is a horned skull on a chip. */
  const PAD_ICONS = {
    start: [],
    battle: ['...#####...', '..#######..', '.#########.', '.##..#..##.', '.##..#..##.', '.#########.', '..###.###..', '...#####...', '...#.#.#...', '...#####...'],
    fire: ['.....#.....', '....##.....', '....###.#..', '...####.#..', '..#######..', '..###.###..', '..##...##..', '...#...#...', '#.........#', '.###...###.', '....###....'],
    altar: ['.....#.....', '....###....', '.....#.....', '....###....', '....###....', '....###....', '..#######..', '..#.....#..', '..#.#.#.#..', '..#.....#..', '.#########.'],
    trade: ['...........', '..#######..', '.#########.', '.#########.', '.#########.', '..#######..', '..###.###..', '..##...##..', '..##...##..', '..#.....#..', '...........'],
    event: ['...#####...', '..##...##..', '..##...##..', '.......##..', '......##...', '.....##....', '.....##....', '...........', '.....##....', '.....##....'],
    boss: ['#.............#', '##...........##', '.##..#####..##.', '..###########..', '...#########...', '..###..#..###..', '..###..#..###..', '..###########..', '...####.####...', '....#######....', '....#.#.#.#....', '....#######....'],
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

    const frag = document.createDocumentFragment();
    for (const p of props) {
      const el = document.createElement('div');
      el.className = 'rm-st';
      let { w, h } = p;
      const l = lvl(lightAt(p.x, p.y), p.x | 0, p.y | 0), hi = C[l + 1], li = C[Math.max(1, l)], dk = C[Math.max(0, l - 1)];
      if (p.k === 'spike') {
        el.style.clipPath = 'polygon(50% 0, 100% 100%, 0 100%)';
        el.style.background = `linear-gradient(90deg, ${hi} 0 14%, ${li} 14% 50%, ${dk} 50%)`;
      } else if (p.k === 'basalt') {
        h *= 0.6; w *= 1.3;
        el.style.clipPath = 'polygon(0 8%, 50% 0, 100% 8%, 100% 100%, 0 100%)';
        el.style.background = `linear-gradient(90deg, ${hi} 0 33%, ${li} 33% 66%, ${dk} 66%)`;
      } else if (p.k === 'crystal') {
        el.style.clipPath = 'polygon(50% 0, 100% 100%, 0 100%)';
        el.style.background = `linear-gradient(90deg, ${C[7]} 0 50%, ${C[8]} 50%)`;
      } else {
        el.style.clipPath = 'polygon(50% 0, 100% 12%, 100% 100%, 0 100%, 0 12%)';
        el.style.background = `linear-gradient(90deg, ${C[2]} 0 50%, ${C[1]} 50%)`;
        const c = document.createElement('canvas');
        c.width = 5; c.height = 7;
        c.className = 'rm-rune';
        pix(c, RUNE, { '#': C[4] });
        el.appendChild(c);
      }
      el.style.left = p.x - w / 2 + 'px';
      el.style.top = p.y - h + 'px';
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      frag.appendChild(el);
    }
    pl.appendChild(frag);
  }

  /* ---------- the animated layer: lava, rune circles, traces ---------- */
  function fxDrawer(fx, C, edges, runes, live, walked) {
    const line = (p0, p1, w, c) => {
      fx.fillStyle = c;
      const x0 = p0[0] / 2, y0 = p0[1] / 2, dx = p1[0] / 2 - x0, dy = p1[1] / 2 - y0, n = Math.max(Math.abs(dx), Math.abs(dy), 1), o = w >> 1;
      for (let i = 0; i <= n; i++) fx.fillRect(Math.round(x0 + dx * i / n) - o, Math.round(y0 + dy * i / n) - o, w, w);
    };
    const lava = (f, t) => {
      for (let y = 0; y < CH; y++) {
        const { c, w } = f(y * 2), cc = c / 2, ww = w / 2;
        for (let x = Math.floor(cc - ww - 2); x <= cc + ww + 2; x++) {
          const d = Math.abs(x - cc) / ww;
          fx.fillStyle = d > 1 ? C[1]
            : d > 0.4 ? (Math.sin(y * 0.21 - t * 2.2 + x) > 0.8 ? C[7] : C[8])
            : (Math.sin(y * 0.35 - t * 3 + x * 0.6) > 0.5 ? C[7] : C[8]);
          fx.fillRect(x, y, 1, 1);
        }
      }
    };
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
    return (t) => {
      fx.clearRect(0, 0, CW, CH);
      lava(lavaL, t);
      lava(lavaR, t + 3);
      runes.forEach(([x, y]) => rune(x, y, t));
      for (const e of edges) {
        const on = live.has(e.i), was = walked.has(e.i), col = was ? C[7] : on ? C[8] : C[3];
        for (let i = 1; i < e.p.length; i++) line(e.p[i - 1], e.p[i], 4, C[1]);
        for (let i = 1; i < e.p.length; i++) line(e.p[i - 1], e.p[i], 2, col);
        for (let i = 1; i < e.p.length - 1; i++) {
          const [x, y] = e.p[i];
          fx.fillStyle = C[1]; fx.fillRect(x / 2 - 3, y / 2 - 3, 6, 6);
          fx.fillStyle = was ? C[7] : on ? C[8] : C[4]; fx.fillRect(x / 2 - 2, y / 2 - 2, 4, 4);
          fx.fillStyle = C[1]; fx.fillRect(x / 2 - 1, y / 2 - 1, 2, 2);
        }
        if (on) {
          let s = 0;
          for (const q of e.s) {
            s++;
            if (((s - Math.floor(t * 10)) % 6 + 6) % 6 === 0) { fx.fillStyle = C[7]; fx.fillRect(Math.round(q[0] / 2) - 1, Math.round(q[1] / 2) - 1, 2, 2); }
          }
        }
      }
    };
  }

  /* A stop's pad: reachable = solid accent (no blinking), visited = mid, the rest = paper. */
  function drawPad(c, n, state, C) {
    const x = c.getContext('2d');
    x.clearRect(0, 0, c.width, c.height);
    if (n.t === 'boss') {
      x.fillStyle = C[4];
      for (let i = 4; i < 48; i += 6) { x.fillRect(i, 0, 2, 4); x.fillRect(i, 30, 2, 4); }
      x.fillStyle = C[1]; x.fillRect(0, 3, 48, 28);
      x.fillStyle = C[2]; x.fillRect(0, 3, 48, 2);
      x.fillStyle = C[3]; x.fillRect(3, 7, 2, 2);
      pix(c, PAD_ICONS.boss, { '#': state === 'reach' ? C[8] : C[6] }, 16, 10);
      return;
    }
    x.fillStyle = C[1]; x.fillRect(2, 0, 13, 17); x.fillRect(0, 2, 17, 13);
    x.fillStyle = state === 'done' ? C[3] : state === 'reach' ? C[8] : C[6];
    x.fillRect(3, 1, 11, 15); x.fillRect(1, 3, 15, 11);
    if (n.t === 'start') { x.fillStyle = C[1]; x.fillRect(6, 6, 5, 5); }
    const ic = PAD_ICONS[n.t];
    pix(c, ic, { '#': C[1] }, 3, Math.floor((17 - ic.length) / 2));
  }

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
      ...nodes.map((n) => [n.x, n.y, n.t === 'boss' ? 66 : 34]),
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
          <div class="rh-row">${ico('spell')}<span>DECK</span><b>${Run.deckSize()}</b></div>
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

    // Stop pads.
    for (const n of nodes) {
      const el = document.createElement('div'), c = document.createElement('canvas');
      el.className = 'rm-nd' + (n.t === 'boss' ? ' boss' : '');
      if (n.t === 'boss') { c.width = 48; c.height = 34; el.style.cssText = `left:${n.x - 48}px;top:${n.y - 34}px`; }
      else { c.width = 17; c.height = 17; el.style.cssText = `left:${n.x - 19}px;top:${n.y - 19}px`; }
      const state = reach.includes(n.id) ? 'reach' : visited.has(n.id) ? 'done' : 'idle';
      el.classList.toggle('reach', state === 'reach');
      drawPad(c, n, state, C);
      el.appendChild(c);
      pl.appendChild(el);
      el.onmouseenter = () => { tick.textContent = visited.has(n.id) && n.t !== 'start' ? `${STOPS[n.t].name}: cleared` : STOPS[n.t].desc; };
      el.onmouseleave = () => { tick.textContent = idle(); };
      el.onclick = () => walkTo(n.id);
    }

    // Your figurine: the character sprite as a standee on a round base.
    const base = document.createElement('div');
    base.className = 'rm-base';
    base.style.borderColor = C[8];
    base.style.background = C[1];
    const fig = document.createElement('div');
    fig.className = 'rm-st rm-fig';
    fig.innerHTML = `<img src="${spriteURL('hero')}" alt="">`;
    pl.append(base, fig);
    const place = (x, y) => {
      fig.style.left = x - 30 + 'px'; fig.style.top = y - 62 + 'px';
      base.style.left = x - 22 + 'px'; base.style.top = y - 9 + 'px';
    };
    const here = nodes[run.cur];
    place(here.x, here.t === 'boss' ? BOSS_PIN_Y + 34 : here.y);

    function walkTo(id) {
      if (walking || !reach.includes(id)) return;
      const e = edges.find((x) => x.a === run.cur && x.b === id), pts = e.s.slice();
      if (nodes[id].t === 'boss') pts.push([pts[pts.length - 1][0], BOSS_PIN_Y + 34]);
      walking = true;
      sfx('place');
      const t0 = performance.now(), dur = pts.length * 14;
      (function step() {
        if (!fig.isConnected) return;
        const k = Math.min(1, (performance.now() - t0) / dur), i = Math.min(pts.length - 1, Math.floor(k * (pts.length - 1)));
        place(pts[i][0], pts[i][1]);
        if (k < 1) return requestAnimationFrame(step);
        setTimeout(() => { walking = false; Run.go(id); }, 250);
      })();
    }

    $('#rmDeck').onclick = () => { sfx('select'); Run.showDeck($('#rmap')); };
    $('#rmMenu').onclick = () => { sfx('select'); showTitle(); };
    $('#rmQuit').onclick = () => Run.confirmAbandon(() => show());

    // Animate the lava, runes, pulses and rising embers at a stepped ~12fps.
    const draw = fxDrawer($('#rmFx').getContext('2d'), C, edges, runes, live, walked);
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
