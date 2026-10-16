'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the bowling lane (a ? stop event, see Run.bowl in js/run.js).
   Drawn like the Dealer's Run map: the lane is a flat pixel canvas tilted by the map's own
   camera, and the pins, the ball and your figurine stand up off it as standees. Every color
   comes from the palette ramp (RunMap.ramp), so the lane recolors with OPTIONS.
   Lane units: the canvas is LW x LH pixels at 1 px = 2 map units.
   ============================================================ */

const Bowl = (() => {
  const LW = 720, LH = 260;           // the lane canvas: the middle lane plus its neighbors
  const CX = 360;                      // the middle of your lane
  const LANE = 30;                     // half its width (the boards)
  const FOUL = 226, FIG_Y = 234, BALL_Y = 238, PIT = 10;
  const SLIDE = 22;                    // how far the ball slides either way along the foul line
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

  /* The masking wall behind the pits: dithered dark panels with an accent band. */
  function wallRows() {
    const out = [], w = LW - 2;
    for (let y = 0; y < 30; y++) {
      let s = '';
      for (let x = 0; x < w; x++) s += y === 4 || y === 5 ? 'r' : '0123'[lvl(cl(0.75 - Math.abs(x - w / 2) / w * 0.5 - y / 30 * 0.25), x, y)];
      out.push(s);
    }
    return out;
  }

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

  /* The steps of the throw animation: the figurine leans for LEAN steps, then the ball takes ROLL steps to the pit. */
  const LEAN = 2, ROLL = 10;
  const stepAt = (y) => LEAN + Math.ceil((BALL_Y - y) / (BALL_Y - PIT) * ROLL);

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
        if (d < 9) { at[j] = stepAt(q.y); const n = Math.hypot(dx, dy - 0.6 * d) || 1; dir[j] = [dx / n, (dy - 0.6 * d) / n]; side[j] = dx < 0 ? -1 : 1; }
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
    stage.innerHTML = '<div class="bw-view"><div class="bw-pl"></div></div><canvas class="bw-hud" width="120" height="14"></canvas>';
    const view = stage.firstChild, pl = view.firstChild, hud = stage.lastChild;
    // The view is 700 tall like a map screen; it is scaled so the stretch from the back wall to just past
    // the figurine (view y 110 to 650) fills the stage.
    const k = stage.clientHeight / 540;
    Object.assign(view.style, { width: stage.clientWidth / k + 'px', top: -110 * k + 'px', transform: `scale(${k})` });

    // The lane: tone sets and light per pixel are worked out once; shadows and aim dots are laid over each step.
    const lane = document.createElement('canvas');
    lane.width = LW; lane.height = LH; lane.className = 'bw-lane';
    pl.appendChild(lane);
    const TONES = [[0, 1, 1, 2], [5, 6, 7, 7], [4, 5, 6, 6], [2, 3, 3, 3], [1, 2, 2, 3], [2, 3, 3, 4], [3, 4, 4, 5]];
    const set = new Uint8Array(LW * LH), light = new Float32Array(LW * LH), mark = new Uint8Array(LW * LH);
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      const o = y * LW + x, lx = ((x - CX + 40) % 80 + 80) % 80; // place across a lane and its gutters: 10..69 boards
      light[o] = cl(1.1 - (x - CX + 60) / 120 * 0.5 - y / LH * 0.35); // lit from the upper left
      if (y < PIT) set[o] = 0;
      else if (lx >= 10 && lx < 70) {
        const bx = lx - 10;
        set[o] = y === FOUL ? 3 : y > FOUL || bx % 6 === 5 ? 2 : 1;
        // Target arrows in a chevron, and a row of dots nearer the foul line (on every lane).
        if ((bx % 10 === 4 && y === 150 - Math.round(Math.abs(bx - 29.5) / 3)) || (y === 196 && bx % 10 === 7)) mark[o] = 1;
      } else if (lx >= 4 && lx < 76) set[o] = lx === 4 || lx === 9 || lx === 70 || lx === 75 ? 5 : 4;
      else set[o] = 6; // the capping between lanes
    }
    const g = lane.getContext('2d'), img = g.createImageData(LW, LH), px = img.data;
    const paint = (x, y, i) => { const o = (y * LW + x) * 4, c = RGB[i]; px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255; };
    const tone = (x, y, dim) => {
      const o = y * LW + x;
      return mark[o] && !dim ? 3 : TONES[set[o]][lvl(cl(light[o] - dim), x, y)];
    };
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) paint(x, y, tone(x, y, 0));
    const base = new Uint8ClampedArray(px);
    g.putImageData(img, 0, 0); // painted now, so the lane is never blank before the first draw

    const stand = (el, w, h) => { el.className = 'bw-st'; el.style.width = w + 'px'; el.style.height = h + 'px'; pl.appendChild(el); return el; };
    const wall = stand(sprite(C, wallRows(), { 0: 1, 1: 2, 2: 2, 3: 3, r: 8 }, null), LW * 2, 64);
    Object.assign(wall.style, { left: '0px', top: '-64px' });
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

    const hg = hud.getContext('2d');
    const dot = (x, y, i) => { hg.fillStyle = C[i]; hg.fillRect(x, y, 1, 1); };
    function drawHud(meter, n) {
      hg.clearRect(0, 0, 120, 14);
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
      // The payout, one arcana symbol per arcana won, with a drop shadow.
      const x0 = Math.round((120 - n * 8) / 2);
      for (let i = 0; i < n; i++) ARCANA.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') { dot(x0 + i * 8 + x + 1, y + 4, 2); dot(x0 + i * 8 + x, y + 3, 8); } }));
    }

    return function draw(st) {
      if (!stage.isConnected) return;
      // Contact shadows (down and right of each standee, away from the light) and the aim dots.
      px.set(base);
      const shade = (cx, cy, rx, ry) => {
        for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
          const a = (x - cx) / rx, b = (y - cy) / ry;
          if (a * a + b * b < 1 && x >= 0 && x < LW && y >= 0 && y < LH) paint(x, y, tone(x, y, 0.55));
        }
      };
      PINS.forEach((p, j) => { if (st.pins[j] === 0) shade(p.x + 2, p.y + 1, 5.5, 2.2); });
      shade(st.fx + 2, FIG_Y + 1, 5, 2);
      if (st.ball) shade(st.bx + 2, st.by + 1, 6, 2.5);
      if (st.aim != null) for (let s = 12; s < 170; s += 7) {
        const x = Math.round(st.bx + Math.sin(st.aim) * s), y = Math.round(st.by - Math.cos(st.aim) * s);
        if (y < 80) break;
        for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) paint(x + u, y + v, 1);
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

  return { mount, roll, path, stepAt, PINS, CX, SLIDE, BALL_Y, PIT, LEAN, ROLL };
})();
