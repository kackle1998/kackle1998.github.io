'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — gamepad and keyboard play
   A bracket cursor that plays like the mouse, so every screen works without one. It sends the
   same pointer and mouse events a real mouse would, at the element under it, and mirrors CSS
   :hover with .pad-hover. The left stick moves it freely; the D-pad (or the arrow keys, when the
   screen doesn't use them itself) jumps it to the nearest clickable thing that way.

   Pad:      A click (hold to drag)   B Esc   X right click   Start Enter   Select options
             Select + Start (or Menu + Start) quits, on the handheld build
             L / R flip colors in the pixel editor, else scroll (so does the right stick)
   Keyboard: arrows move the cursor, Enter / Space / Z click (hold to drag or paint), Q / W as
             L / R, Esc backs out, E ends a battle turn
   A real mouse hides the cursor again.
   ============================================================ */

const PAD_KEY = 'cardgrave.pad.v1';
const PAD_SPEEDS = [{ name: 'SLOW', px: 380 }, { name: 'NORMAL', px: 640 }, { name: 'FAST', px: 960 }]; // stage px a second
const PAD_BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]; // runmap.js BAY
// Screens that already light up what you're on (the title menu's bars): no brackets there, the
// cursor still moves and clicks the same.
const PAD_SELF_LIT = '.ttl';

const Pad = {
  x: 640, y: 360,     // stage px
  shown: false,       // pad / keyboard mode is on (a real mouse turns it off)
  live: false,        // the screen has something to click, so the brackets show (check)
  frame: null,        // the clickable element the brackets frame, or null
  tick: 0,
  seen: false,        // a gamepad has been connected this session (OPTIONS shows its settings)
  down: null,         // { el, by } while a click is held, by 'pad' or a key code
  hover: [],          // the element under the cursor and its ancestors
  opts: { speed: 1, swap: false, ...Store.read(PAD_KEY, {}) },
  el: null, sending: false, found: null,
  ctx: '',            // the last PadScreens.context the cursor went home for

  save() { Store.write(PAD_KEY, this.opts); },
  stepSpeed(d) { this.opts.speed = Math.max(0, Math.min(PAD_SPEEDS.length - 1, this.opts.speed + d)); this.save(); },
  toggleSwap() { this.opts.swap = !this.opts.swap; this.save(); },

  /* ---------- the cursor: corner brackets in the accent color ----------
     They always frame something clickable: the thing under the cursor's point, or else the
     nearest one, which is what a press clicks. They step out and back (about 5 a second), and
     pressed they tighten and go light. Nothing to click, no brackets. 1 art px = 2 stage px,
     with an ink outline and a dithered shadow down and right. */
  draw() {
    if (!this.el) {
      this.el = document.createElement('canvas');
      this.el.id = 'padCursor';
      document.body.appendChild(this.el);
    }
    // The screen redrew and took the framed thing with it: frame its replacement under the point
    // (picking an attacker redraws the board), else the screen's home, else what's nearest.
    if (this.shown && this.frame && !this.frame.isConnected) {
      const u = this.under();
      this.frame = this.clickableAt(u) || PadScreens.home() || this.frameFor(u);
    }
    const f = this.frame && this.frame.isConnected ? this.frame : null;
    this.el.style.display = this.shown && this.live && f && !f.closest(PAD_SELF_LIT) ? 'block' : 'none';
    if (this.el.style.display === 'none') return;
    const u = 2 * curScale, M = 5, r = this.cell(f) || f.getBoundingClientRect();
    const ox = r.left - M * u, oy = r.top - M * u;
    const w = Math.round((r.right - r.left) / u) + 2 * M + 1, h = Math.round((r.bottom - r.top) / u) + 2 * M + 1;
    const k = this.down ? 1 : -[0, 1, 1, 0][this.tick % 4], off = 2;
    const x0 = M - off + k, y0 = M - off + k, x1 = w - 1 - M + off - k, y1 = h - 1 - M + off - k;
    const len = Math.max(2, Math.min(4, (x1 - x0) >> 1, (y1 - y0) >> 1));
    const on = new Set(), at = (x, y) => on.add(x + ',' + y);
    [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]].forEach(([x, y, dx, dy]) => {
      for (let i = 0; i < len; i++) { at(x + dx * i, y); at(x, y + dy * i); }
    });
    const rim = new Set();
    for (const q of on) {
      const [x, y] = q.split(',').map(Number);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!on.has(x + dx + ',' + (y + dy))) rim.add(x + dx + ',' + (y + dy));
    }
    this.el.width = w;
    this.el.height = h;
    const p = Palette.cur, g = this.el.getContext('2d');
    const dot = (q, col) => { const [x, y] = q.split(',').map(Number); g.fillStyle = col; g.fillRect(x, y, 1, 1); };
    for (const q of rim) {
      const [x, y] = q.split(',').map(Number), s = x + 1 + ',' + (y + 1);
      if (!on.has(s) && !rim.has(s) && PAD_BAY[((y + 1) & 3) * 4 + ((x + 1) & 3)] < 8) dot(s, p.mid);
    }
    rim.forEach((q) => dot(q, p.ink));
    on.forEach((q) => dot(q, this.down ? p.white : p.accent));
    Object.assign(this.el.style, { left: ox + 'px', top: oy + 'px', width: w * u + 'px' });
  },
  client() {
    const r = stage.getBoundingClientRect();
    return [r.left + (this.x * r.width) / 1280, r.top + (this.y * r.height) / 720];
  },
  place() { this.draw(); },
  // True when coming out sent the cursor home, so the press that brought it out does nothing more.
  show() {
    let home = false;
    if (!this.shown) { this.shown = true; home = this.check(); }
    this.place();
    return home;
  },
  hide() {
    if (!this.shown) return;
    this.shown = false;
    this.draw();
    if (this.down) this.release();
    this.setHover([]);
  },
  /* The brackets only show while the screen has something to click (not mid-animation, say). */
  // Also re-picks what to frame, since the screen may have changed under a cursor that hasn't moved,
  // and on a new moment (PadScreens.context: your turn starting, the run map opening) jumps home.
  check() {
    this.live = !PadScreens.sleeping() && this.targets(true).length > 0;
    const ctx = PadScreens.context();
    if (this.shown && ctx !== this.ctx) {
      const home = PadScreens.home();
      if (home || !ctx) this.ctx = ctx; // a moment with a home waits for it to be drawn
      if (home) { this.pointAt(home); return true; }
    }
    if (this.shown) this.rehover();
    else this.draw();
    return false;
  },

  /* ---------- events, as a mouse would send them ---------- */
  fire(type, el, extra = {}) {
    const [cx, cy] = this.client();
    const init = {
      bubbles: !/enter|leave/.test(type), cancelable: true, composed: true, view: window,
      clientX: cx, clientY: cy, screenX: cx, screenY: cy, button: 0, buttons: this.down ? 1 : 0, ...extra,
    };
    if (type.startsWith('pointer')) return el.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', isPrimary: true, ...init }));
    return el.dispatchEvent(type === 'wheel' ? new WheelEvent(type, init) : new MouseEvent(type, init));
  },
  under() {
    const [cx, cy] = this.client();
    return document.elementFromPoint(cx, cy);
  },
  setHover(chain) {
    const old = this.hover;
    if (old[0] === chain[0]) return;
    if (old[0]) { this.fire('pointerout', old[0]); this.fire('mouseout', old[0]); }
    old.filter((e) => !chain.includes(e)).forEach((e) => { e.classList.remove('pad-hover'); this.fire('pointerleave', e); this.fire('mouseleave', e); });
    if (chain[0]) { this.fire('pointerover', chain[0]); this.fire('mouseover', chain[0]); }
    chain.filter((e) => !old.includes(e)).reverse().forEach((e) => { e.classList.add('pad-hover'); this.fire('pointerenter', e); this.fire('mouseenter', e); });
    this.hover = chain;
  },
  /* After moving: hover whatever is under the cursor now, then send it the move. */
  moved() {
    this.show();
    const el = this.rehover();
    if (el) { this.fire('pointermove', el); this.fire('mousemove', el); }
  },
  rehover() {
    const el = this.under(), chain = [];
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) chain.push(e);
    this.setHover(chain);
    this.frame = this.frameFor(el);
    this.draw();
    return el;
  },
  /* What the brackets frame: the clickable thing under the cursor's point, or else the nearest
     one. Something that fills most of the stage (the bowling lane takes a click anywhere) only
     when there's nothing smaller to frame. */
  frameFor(el) {
    const s = stage.getBoundingClientRect();
    const huge = (e) => { const r = e.getBoundingClientRect(); return r.width * r.height > 0.4 * s.width * s.height; };
    let big = null;
    const at = this.clickableAt(el);
    if (at && !huge(at)) return at;
    if (at) big = at;
    const [px, py] = this.client();
    let best = null, bestD = Infinity;
    for (const t of this.targets()) {
      if (huge(t.el)) continue;
      const r = t.el.getBoundingClientRect();
      const d = Math.hypot(Math.max(r.left - px, 0, px - r.right), Math.max(r.top - py, 0, py - r.bottom));
      if (d < bestD) { bestD = d; best = t.el; }
    }
    return best || big;
  },
  // The clickable thing an element is part of, if any.
  clickableAt(el) {
    for (; el && el !== document.body; el = el.parentElement) if (this.clickable(el)) return el;
    return null;
  },
  /* Put the cursor's point on the middle of an element (or of its grid cell), in stage px. */
  pointAt(el) {
    const r = this.cell(el) || el.getBoundingClientRect(), s = stage.getBoundingClientRect();
    this.moveTo((((r.left + r.right) / 2 - s.left) * 1280) / s.width, (((r.top + r.bottom) / 2 - s.top) * 720) / s.height);
  },

  /* ---------- pixel grids (data-pad-grid="16": the pixel editor's canvas) ----------
     On one, the brackets frame the single cell under the point (or the nearest, from outside),
     and the D-pad steps a cell at a time, leaving the grid only past its edge. Hold A (or Z) while
     moving to paint. */
  cell(el, di = 0, dj = 0) {
    const n = el && +el.dataset.padGrid;
    if (!n) return null;
    const r = el.getBoundingClientRect(), cw = r.width / n, ch = r.height / n, [px, py] = this.client();
    const i = Math.max(0, Math.min(n - 1, Math.floor((px - r.left) / cw))) + di;
    const j = Math.max(0, Math.min(n - 1, Math.floor((py - r.top) / ch))) + dj;
    if (i < 0 || j < 0 || i >= n || j >= n) return null;
    return { left: r.left + i * cw, top: r.top + j * ch, right: r.left + (i + 1) * cw, bottom: r.top + (j + 1) * ch };
  },
  /* L1 / R1 (Q / W): the screen under the cursor may take them (the pixel editor flips colors);
     otherwise they scroll. */
  bumper(d) {
    this.show();
    const el = this.under() || document.body;
    if (el.dispatchEvent(new CustomEvent('padbumper', { detail: d, bubbles: true, cancelable: true }))) this.wheel(d * 100);
  },
  moveTo(x, y) {
    this.x = Math.max(0, Math.min(1279, x));
    this.y = Math.max(0, Math.min(719, y));
    this.moved();
  },
  press(by) {
    if (this.down) return;
    this.show();
    // The press goes to what the brackets frame, so if the point is off it, bring it over first.
    if (this.frame && this.frame.isConnected && !this.frame.contains(this.under())) this.pointAt(this.frame);
    const el = this.under();
    this.down = { el, by };
    this.place();
    if (!el) return;
    if (el.matches('input, textarea, select')) el.focus();
    this.fire('pointerdown', el);
    this.fire('mousedown', el);
  },
  release() {
    const d = this.down;
    if (!d) return;
    this.down = null;
    this.place();
    const el = this.under();
    if (!el) return;
    this.fire('pointerup', el);
    this.fire('mouseup', el);
    // A click goes to the innermost element both the press and the release were on.
    let t = d.el;
    while (t && !t.contains(el)) t = t.parentElement;
    if (t && !t.closest('button:disabled, input:disabled')) this.fire('click', t, { detail: 1 });
    // The click may have redrawn the screen under the cursor: hover what's there now.
    requestAnimationFrame(() => { if (this.shown) this.rehover(); });
  },
  rightClick() {
    this.show();
    const el = this.under();
    if (el) this.fire('contextmenu', el, { button: 2 });
  },
  /* Scroll what's under the cursor: its own wheel handler first, else the nearest scroll box. */
  wheel(dy) {
    this.show();
    const el = this.under();
    if (!el || !this.fire('wheel', el, { deltaY: dy, deltaMode: 0 })) return;
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const oy = getComputedStyle(e).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && e.scrollHeight > e.clientHeight) return e.scrollBy(0, dy);
    }
  },
  key(key, code = key) {
    const t = document.activeElement || document.body;
    this.sending = true; // so the keyboard handler below doesn't also take it as a cursor click
    for (const type of ['keydown', 'keyup']) t.dispatchEvent(new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true }));
    this.sending = false;
  },

  /* ---------- D-pad: jump to the nearest clickable thing in that direction ---------- */
  // Clickable: a pointer cursor, or a crosshair (what a duel's attack and spell targets show).
  clickable(el) {
    if (el.dataset.padGrid) return true;
    const hand = (e) => /^(pointer|crosshair)$/.test(getComputedStyle(e).cursor);
    if (!hand(el) || el.matches(':disabled')) return false;
    // Outermost only (cursor is inherited), but a button inside a clickable panel counts too.
    const up = el.parentElement;
    return !(up && hand(up) && !el.matches('button, [onclick]'));
  },
  /* Everything clickable that's on screen and not covered; `first` stops at the first one. */
  targets(first = false) {
    // The full scan is slow on a handheld, and the stick asks every frame: reuse it for 200 ms.
    const now = performance.now();
    if (!first && this.found && now - this.found.at < 200 && this.found.list.every((t) => t.el.isConnected)) return this.found.list;
    const out = [];
    for (const el of stage.querySelectorAll('*')) {
      if (!this.clickable(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      if (!hit || !(el.contains(hit) || hit.contains(el))) continue; // covered or off screen
      out.push({ el, cx, cy, r });
      if (first) break;
    }
    if (!first) this.found = { at: now, list: out };
    return out;
  },
  snap(dx, dy) {
    if (this.show()) return;
    // On a pixel grid, one cell at a time.
    const grid = this.frame && this.frame.isConnected && this.frame.dataset.padGrid ? this.frame : null;
    if (grid && grid.contains(this.under())) {
      const c = this.cell(grid, dx, dy);
      if (c) {
        const s = stage.getBoundingClientRect();
        return this.moveTo((((c.left + c.right) / 2 - s.left) * 1280) / s.width, (((c.top + c.bottom) / 2 - s.top) * 720) / s.height);
      }
    }
    const [px, py] = this.client(), here = this.under();
    let best = null, bestScore = Infinity;
    for (const t of this.targets()) {
      if ((here && t.el.contains(here)) || t.el === this.frame) continue;
      // From the nearest point of its box, so a big target (the pixel canvas) isn't judged by a
      // middle that's far away.
      const vx = Math.max(t.r.left, Math.min(px, t.r.right)) - px, vy = Math.max(t.r.top, Math.min(py, t.r.bottom)) - py;
      const along = vx * dx + vy * dy, side = Math.abs(vx * dy - vy * dx);
      if (along <= 2 || side > along * 2) continue;
      const score = along + side * 2;
      if (score < bestScore) { bestScore = score; best = t; }
    }
    if (best) this.pointAt(best.el);
  },
  /* Select: the gear on whatever screen has one, or back out of OPTIONS. */
  options() {
    const b = ['#optBack', '#gearBtn', '#rmGear'].map((s) => $(s)).find((e) => e && e.offsetParent);
    if (b) b.click();
  },
};

/* ---------- where the brackets start, screen by screen ----------
   context() names the moment; when it changes, the cursor goes to that moment's home(), and when
   the thing it framed is redrawn away, the brackets go back there. sleeping(): no brackets at all. */
const PadScreens = {
  duel() { return !!game && !$('#game').classList.contains('hidden') && $('#screen').classList.contains('hidden'); },
  map() { return !!$('#rmap'); },
  context() {
    if (this.duel()) return 'duel:' + game.turnNum + ':' + game.active;
    return this.map() ? 'map' : '';
  },
  // The opponent's turn in a duel: nothing to do, so nothing framed.
  sleeping() { return this.duel() && (game.active !== ME || game.over); },
  // Your turn: your leftmost card in hand. The run map: the leftmost stop you can sling to.
  home() {
    const leftmost = (els) => [...els].filter((e) => e.offsetParent || e.getClientRects().length)
      .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0] || null;
    if (this.duel()) return this.sleeping() ? null : leftmost($$('#hand .card'));
    if (this.map()) return leftmost($$('#rmap .rm-nd.reach, #rmap .rm-casino.reach'));
    return null;
  },
};

/* ---------- which button is which ----------
   A pad the browser knows reports the standard layout. Others, like a handheld's built-in controls,
   report raw button and axis numbers; the handheld shell passes in the device's SDL mapping
   (PortMaster sets SDL_GAMECONTROLLERCONFIG for every port), e.g. "a:b4,b:b3,dpup:h0.1,leftx:a0".
   Values: bN a button, hH.M a hat direction (M: 1 up, 2 right, 4 down, 8 left; the browser gives a
   hat as two axes, after the others), aN an axis (+aN / -aN half of one). */
const PadLayout = {
  STANDARD: 'a:b0,b:b1,x:b2,y:b3,leftshoulder:b4,rightshoulder:b5,back:b8,start:b9,guide:b16,dpup:b12,dpdown:b13,dpleft:b14,dpright:b15,leftx:a0,lefty:a1,righty:a3',
  maps: new Map(),   // gamepad id -> { name: value }
  // SDL may count a few of the device's keys before its buttons (the RG35XXSP's start at b3) where
  // the browser doesn't, so the buttons are shifted to start at 0.
  parse(s) {
    const m = {};
    for (const kv of s.split(',')) { const i = kv.indexOf(':'); if (i > 0) m[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); }
    const first = Math.min(...Object.values(m).map((v) => (/^b(\d+)$/.exec(v) || [])[1]).filter((n) => n != null).map(Number));
    if (first > 0 && first < Infinity) for (const k in m) m[k] = m[k].replace(/^b(\d+)$/, (_, n) => 'b' + (n - first));
    return m;
  },
  // The standard layout, else the shell's SDL line naming this pad, else its first line.
  map(gp) {
    if (!this.maps.has(gp.id)) {
      let s = this.STANDARD;
      if (gp.mapping !== 'standard' && window.native && window.native.padMap) {
        const lines = window.native.padMap().split(/\r?\n/).filter((l) => l.split(',').length > 2);
        const line = lines.find((l) => gp.id.includes(l.split(',')[1])) || lines[0];
        if (line) s = line.split(',').slice(2).join(',');
      }
      this.maps.set(gp.id, { ...this.parse(s), sdl: s !== this.STANDARD });
      console.log(`[pad] ${gp.id} | mapping "${gp.mapping}" | ${gp.buttons.length} buttons, ${gp.axes.length} axes | using ${s === this.STANDARD ? 'standard' : 'SDL: ' + s}`);
    }
    return this.maps.get(gp.id);
  },
  value(gp, v) {
    if (!v) return 0;
    let m;
    if ((m = /^b(\d+)$/.exec(v))) return gp.buttons[+m[1]] && gp.buttons[+m[1]].pressed ? 1 : 0;
    if ((m = /^h(\d+)\.(\d+)$/.exec(v))) {
      const n = gp.axes.length - 2 * (1 + +m[1]), x = gp.axes[n] || 0, y = gp.axes[n + 1] || 0, d = +m[2];
      return (d & 1 && y < -0.5) || (d & 2 && x > 0.5) || (d & 4 && y > 0.5) || (d & 8 && x < -0.5) ? 1 : 0;
    }
    if ((m = /^([+-]?)a(\d+)(~?)$/.exec(v))) {
      let a = (gp.axes[+m[2]] || 0) * (m[3] ? -1 : 1);
      return m[1] === '+' ? Math.max(0, a) : m[1] === '-' ? Math.max(0, -a) : a;
    }
    return 0;
  },
  // SDL names the face buttons by position (a: bottom, b: right). Handhelds mapped through SDL have
  // the Nintendo layout, with A on the right, so confirm is SDL's b and back its a.
  read(gp) {
    const m = this.map(gp), v = (k) => this.value(gp, m[k]), on = (k) => v(k) > 0.5;
    return {
      a: on(m.sdl ? 'b' : 'a'), b: on(m.sdl ? 'a' : 'b'), x: on('x'), l: on('leftshoulder'), r: on('rightshoulder'),
      select: on('back'), start: on('start'), guide: on('guide'),
      up: on('dpup'), down: on('dpdown'), left: on('dpleft'), right: on('dpright'),
      lx: v('leftx'), ly: v('lefty'), ry: v('righty'),
    };
  },
  // In the handheld shell: every raw press and axis swing into log.txt, to check the mapping.
  last: null,
  trace(gp) {
    const now = gp.buttons.map((b) => b.pressed).concat(gp.axes.map((a) => Math.round(a)));
    if (this.last) now.forEach((s, i) => {
      if (s === this.last[i]) return;
      const nb = gp.buttons.length;
      console.log(i < nb ? `[pad] button ${i} ${s ? 'down' : 'up'}` : `[pad] axis ${i - nb} = ${s}`);
    });
    this.last = now;
  },
};

/* ---------- gamepad: polled every frame while one is connected ---------- */
(() => {
  const DEAD = 0.2, REPEAT_WAIT = 320, REPEAT_EVERY = 110, WHEEL_EVERY = 90;
  const held = {}, next = {};
  let last = 0, running = false;
  const DPAD = { 12: [0, -1], 13: [0, 1], 14: [-1, 0], 15: [1, 0] };

  // Edge and auto-repeat for one button: true on the press, then again every so often while held.
  const tap = (id, on, now, repeat) => {
    if (!on) { held[id] = false; return false; }
    if (!held[id]) { held[id] = true; next[id] = now + REPEAT_WAIT; return true; }
    if (repeat && now >= next[id]) { next[id] = now + repeat; return true; }
    return false;
  };

  function poll(now) {
    const pads = [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter(Boolean);
    if (!pads.length) { running = false; return; }
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    const gp = pads[0], c = PadLayout.read(gp);
    if (window.native) PadLayout.trace(gp);
    const pressed = { a: Pad.opts.swap ? c.b : c.a, b: Pad.opts.swap ? c.a : c.b, x: c.x, l: c.l, r: c.r, select: c.select, start: c.start };
    const dpad = { 12: c.up, 13: c.down, 14: c.left, 15: c.right };
    const ax = (i) => [c.lx, c.ly, 0, c.ry][i];

    // Left stick: free movement, slow near the middle for fine aim.
    const sx = ax(0), sy = ax(1), mag = Math.hypot(sx, sy);
    if (mag > DEAD) {
      const v = PAD_SPEEDS[Pad.opts.speed].px * ((mag - DEAD) / (1 - DEAD)) ** 2 / mag;
      Pad.moveTo(Pad.x + sx * v * dt, Pad.y + sy * v * dt);
    }
    for (const [i, [dx, dy]] of Object.entries(DPAD)) if (tap('d' + i, dpad[i], now, REPEAT_EVERY)) Pad.snap(dx, dy);

    if (pressed.a && !held.a) Pad.press('pad');
    if (!pressed.a && held.a && Pad.down && Pad.down.by === 'pad') Pad.release();
    held.a = pressed.a;
    // In the handheld shell (tools/handheld), Select + Start or Menu + Start quits to the launcher.
    if (window.native && pressed.start && (pressed.select || c.guide)) return window.native.quit();
    if (tap('b', pressed.b, now)) Pad.key('Escape');
    if (tap('x', pressed.x, now)) Pad.rightClick();
    if (tap('start', pressed.start, now)) Pad.key('Enter');
    if (tap('select', pressed.select, now)) Pad.options();
    if (tap('l', pressed.l, now, WHEEL_EVERY)) Pad.bumper(-1);
    if (tap('r', pressed.r, now, WHEEL_EVERY)) Pad.bumper(1);
    const ry = ax(3);
    if (tap('ry', Math.abs(ry) > 0.5, now, WHEEL_EVERY)) Pad.wheel(Math.sign(ry) * 100);

    requestAnimationFrame(poll);
  }
  const start = () => {
    Pad.seen = true;
    if (!running) { running = true; last = 0; requestAnimationFrame(poll); }
  };
  window.addEventListener('gamepadconnected', start);
  if ([...(navigator.getGamepads ? navigator.getGamepads() : [])].some(Boolean)) start();
})();

/* ---------- keyboard: the same on every screen ----------
   Arrows move the brackets, and Enter, Space and Z click what they frame. Taken first (capture,
   on window) so no screen gives those keys a meaning of its own; every screen that used them
   has a button or click that does the same. Esc, E (end turn: ui.js) and the rest go through. */
window.addEventListener('keydown', (e) => {
  if (Pad.sending || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const dir = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
  const click = e.code === 'KeyZ' || e.key === 'Enter' || e.key === ' ';
  const bump = { KeyQ: -1, KeyW: 1 }[e.code];
  if (!dir && !click && !bump) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (dir) Pad.snap(...dir);
  else if (bump) Pad.bumper(bump);
  else if (!e.repeat) Pad.press(e.code);
}, true);
window.addEventListener('keyup', (e) => { if (Pad.down && Pad.down.by === e.code) Pad.release(); });

// A real mouse takes over again.
window.addEventListener('mousemove', (e) => { if (e.isTrusted && Pad.shown && (e.movementX || e.movementY)) Pad.hide(); }, true);
window.addEventListener('resize', () => { if (Pad.shown) Pad.place(); });
// Steps the brackets' pulse and follows a framed card as it moves, about 5 times a second, and
// every other step looks again whether the screen has anything to click.
setInterval(() => {
  if (!Pad.shown) return;
  if (++Pad.tick % 2) Pad.check();
  else Pad.draw();
}, 200);

/* Lets a capture on the cursor's pointer fail quietly when no real mouse button is down. */
{
  const capture = Element.prototype.setPointerCapture;
  Element.prototype.setPointerCapture = function (id) { try { capture.call(this, id); } catch (err) { if (!Pad.shown) throw err; } };
}

/* CSS :hover never matches for made-up events, so copy every :hover rule as .pad-hover. */
function padHoverRules() {
  const css = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch (e) { continue; } // another site's sheet (the web fonts)
    for (const r of rules) if (r.cssText.includes(':hover')) css.push(r.cssText.replace(/:hover/g, '.pad-hover'));
  }
  let st = $('#padHover');
  if (!st) { st = document.createElement('style'); st.id = 'padHover'; document.head.appendChild(st); }
  st.textContent = css.join('\n');
}
if (document.readyState === 'complete') padHoverRules();
else window.addEventListener('load', padHoverRules);
