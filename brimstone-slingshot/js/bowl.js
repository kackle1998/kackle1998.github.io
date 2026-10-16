'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the bowling lane (a ? stop event, see Run.bowl in js/run.js).
   Drawn like the Dealer's Run map: the lane is a flat pixel canvas tilted by the map's own
   camera, and the pins, the ball and your figurine stand up off it as standees. Every color
   comes from the palette ramp (RunMap.ramp), so the lane recolors with OPTIONS.
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
  function mount(stage) {
    const C = RunMap.ramp(), RGB = C.map(rgb);
    stage.innerHTML = '<canvas class="bw-sky"></canvas><div class="bw-view"><div class="bw-pl"></div></div><canvas class="bw-hud bw-top" width="120" height="14"></canvas><canvas class="bw-hud" width="120" height="14"></canvas>';
    const skyCv = stage.firstChild, view = skyCv.nextSibling, pl = view.firstChild, top = view.nextSibling, hud = stage.lastChild; // top: the payout; hud: the power bar
    // The view is 700 tall like a map screen; it is scaled so view y 30 to 630 fills the stage: the
    // orrery sky above the lintel, down to just past the figurine.
    const k = stage.clientHeight / 600;
    Object.assign(view.style, { width: stage.clientWidth / k + 'px', top: -30 * k + 'px', transform: `scale(${k})` });

    // Behind it all, the run map's sky: its orrery in a nebula, turning on its own (about 10 fps).
    const sky = RunMap.skyDrawer(skyCv, C);
    sky(performance.now() / 1000);
    const skyTimer = setInterval(() => { if (!stage.isConnected) return clearInterval(skyTimer); sky(performance.now() / 1000); }, 100);

    // The lane: tone sets and light per pixel are worked out once; shadows and aim dots are laid over each step.
    // One flagstone lane floating in the sky like the Dealer's table: a strip of floor either side where
    // the columns stand, runes for targets, and past the pins only space.
    const lane = document.createElement('canvas');
    lane.width = LW; lane.height = LH; lane.className = 'bw-lane';
    pl.appendChild(lane);
    // slab edge, slab, slab seam, foul line, gutter, gutter rim, floor slab, floor seam
    const TONES = [[1, 2, 2, 3], [5, 6, 6, 7], [3, 4, 4, 5], [2, 3, 3, 3], [1, 2, 2, 3], [2, 3, 3, 4], [3, 4, 4, 5], [2, 3, 3, 3]];
    const VOID = 255, EDGE = 46; // set[] for open sky; the slab's half-width
    const set = new Uint8Array(LW * LH), light = new Float32Array(LW * LH), mark = new Uint8Array(LW * LH); // mark: a tone + 1
    const RUNE = RunMap.RUNE, CHEVRON = [[-24, 0], [-12, -5], [0, -10], [12, -5], [24, 0]];
    // A few short cracks across your lane only, the same every time.
    const cracks = new Set(), CR = mulberry32(11);
    for (let n = 0; n < 4; n++) {
      let x = CX - 26 + CR() * 52, y = 90 + CR() * 120, a = CR() * 6.3;
      for (let i = 0; i < 6; i++) { a += (CR() - 0.5) * 1.1; x += Math.cos(a); y += Math.sin(a); cracks.add((x | 0) + ',' + (y | 0)); }
    }
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      const o = y * LW + x, d = x - CX; // boards at d -30..29, gutters to -36 / 35, floor to the slab's edge
      light[o] = cl(1.1 - (d + 60) / 120 * 0.5 - y / LH * 0.35); // lit from the upper left
      if (y < PIT || d < -EDGE || d >= EDGE) set[o] = VOID;
      else if (y === PIT || d === -EDGE || d === EDGE - 1) set[o] = 0;
      else if (d >= -30 && d < 30) {
        const bx = d + 30, row = Math.floor(y / 18);
        set[o] = y === FOUL ? 3 : (bx + (row % 2) * 10) % 20 === 19 || y % 18 === 17 ? 2 : 1;
        if (y === FOUL) continue;
        // Runes in a chevron where the target arrows would be.
        for (const [dx, dy] of CHEVRON) {
          const gx = bx - 27 - dx, gy = y - 146 - dy;
          if (gx >= 0 && gx < 5 && gy >= 0 && gy < 7 && RUNE[gy][gx] === '#') mark[o] = 2 + 1;
        }
        if (!mark[o] && cracks.has(x + ',' + y)) mark[o] = 3 + 1;
      } else if (d >= -36 && d < 36) set[o] = d === -36 || d === -31 || d === 30 || d === 35 ? 5 : 4;
      else set[o] = x % 14 === 13 || y % 12 === 11 ? 7 : 6; // the flagstone strips where the columns stand
    }
    const g = lane.getContext('2d'), img = g.createImageData(LW, LH), px = img.data;
    const paint = (x, y, i) => { const o = (y * LW + x) * 4, c = RGB[i]; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255; };
    const tone = (x, y, dim) => {
      const o = y * LW + x;
      return mark[o] && !dim ? mark[o] - 1 : TONES[set[o]][lvl(cl(light[o] - dim), x, y)];
    };
    // Open sky stays clear (alpha 0), so the orrery shows round the slab and past the pins.
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) if (set[y * LW + x] !== VOID) paint(x, y, tone(x, y, 0));
    const base = new Uint8ClampedArray(px);
    g.putImageData(img, 0, 0); // painted now, so the lane is never blank before the first draw

    const stand = (el, w, h) => { el.className = 'bw-st'; el.style.width = w + 'px'; el.style.height = h + 'px'; pl.appendChild(el); return el; };
    // Three columns on the flagstone strips beside your lane: one whole, two broken off, by turns left and right.
    [[-40, 60, 1], [40, 125, 0], [-40, 195, 1]].forEach(([dx, y, broken]) => {
      const cv = sprite(C, broken ? BROKEN : COLUMN, { l: 6, m: 5, s: 3 }, 2), el = stand(cv, cv.width * 3, cv.height * 3); // 3x, so they read as columns
      Object.assign(el.style, { left: (CX + dx) * 2 - cv.width * 1.5 + 'px', top: y * 2 - cv.height * 3 + 'px' });
    });
    const pins = PINS.map(() => { const cv = sprite(C, PIN, { l: 7, m: 6, s: 4, r: 8 }, 2); return stand(cv, cv.width * 2, cv.height * 2); });
    // Your figurine, with an ink outline so its pale face doesn't melt into the pale boards.
    // 16 px drawn at 2.5x (40 units), plus the outline's pixel on every side.
    const hero = expandSprite(SPRITES.hero), heroMap = {};
    for (const ch in PAL) heroMap[ch] = ch;
    const fig = stand(document.createElement('div'), 45, 45), figCv = sprite({ ...PAL, 1: C[1] }, hero, heroMap, 1);
    fig.appendChild(figCv);
    const ball = stand(document.createElement('canvas'), 26, 26);
    ball.width = 13; ball.height = 13;
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

    return function draw(st) {
      if (!stage.isConnected) return;
      // Contact shadows (down and right of each standee, away from the light) and the aim dots.
      px.set(base);
      const shade = (cx, cy, rx, ry) => {
        for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
          const a = (x - cx) / rx, b = (y - cy) / ry;
          if (a * a + b * b < 1 && x >= 0 && x < LW && y >= 0 && y < LH && set[y * LW + x] !== VOID) paint(x, y, tone(x, y, 0.55));
        }
      };
      PINS.forEach((p, j) => { if (st.pins[j] === 0) shade(p.x + 2, p.y + 1, 5.5, 2.2); });
      shade(st.fx + 2, FIG_Y + 1, 5, 2);
      if (st.ball) shade(st.bx + 2, st.by + 1, 6, 2.5);
      if (st.aim != null) for (let s = 12; s < 170; s += 7) {
        const x = Math.round(st.bx + Math.sin(st.aim) * s), y = Math.round(st.by - Math.cos(st.aim) * s);
        if (y < 80) break;
        // A wide aim can run off the slab; the dots stop at its edge rather than hang in the sky.
        for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (set[(y + v) * LW + x + u] !== VOID) paint(x + u, y + v, 1);
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
      fig.style.left = st.fx * 2 - 22.5 + 'px';
      fig.style.top = FIG_Y * 2 - 42.5 + 'px'; // the outline's bottom row hangs below the feet
      fig.style.transform = `rotateX(${-90 + st.lean}deg)`;
      fig.classList.toggle('bob', !st.lean && st.bob !== false);
      ball.style.display = st.ball ? '' : 'none';
      if (st.ball) {
        if (spun !== st.spin) { spun = st.spin; bg.clearRect(0, 0, 13, 13); bg.drawImage(sprite(C, ballRows(st.spin), { h: 7, a: 8, s: 3, o: 1 }, 1), 0, 0); }
        ball.style.left = st.bx * 2 - 13 + 'px';
        ball.style.top = st.by * 2 - 26 + 'px';
      }
      drawHud(st.meter, st.arcana || 0);
    };
  }

  return { mount, roll, path, stepAt, rollSteps, slideX, PINS, CX, AIM, BALL_Y, PIT, LEAN };
})();
