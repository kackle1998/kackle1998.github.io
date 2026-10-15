'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — 16x16 pixel editor (card maker + character maker)
   Expects the standard markup: #pix canvas, #palette, #tools, #undoBtn,
   #clearBtn, #flipBtn, [data-shift] buttons and the #template button.
   ============================================================ */

const PixelEditor = (() => {
  const SIZE = 16, CELL = 22;
  const BLANK_ROW = '.'.repeat(SIZE);
  const PAINTS = [['#', 'Ink'], ['+', 'Shade'], ['-', 'Light'], ['w', 'White'], ['.', 'Eraser']];
  const q = (s) => document.querySelector(s);
  const qa = (s) => document.querySelectorAll(s);

  let grid = [];           // 16 arrays of 16 chars
  let history = [];
  let paint = '#', tool = 'pen', mirror = false;
  let onChange = () => {}, onToast = () => {};
  let cv, ctx;

  function blankGrid() { return Array.from({ length: SIZE }, () => BLANK_ROW.split('')); }
  function rows() { return grid.map((r) => r.join('')); }
  function setRows(src) {
    grid = blankGrid();
    (src || []).slice(0, SIZE).forEach((r, y) => { [...String(r).padEnd(SIZE, '.').slice(0, SIZE)].forEach((ch, x) => (grid[y][x] = PAL[ch] ? ch : '.')); });
  }

  /* Replace the art (e.g. when opening another card). Clears undo history. */
  function load(src) { setRows(src); history = []; draw(); }

  function draw() {
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const ch = grid[y][x];
      ctx.fillStyle = PAL[ch] || ((x + y) % 2 ? Palette.cur.artbg : Palette.cur.bd[3]);
      ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    }
    ctx.strokeStyle = Palette.cur.ink;
    ctx.globalAlpha = 0.12;
    ctx.lineWidth = 1;
    for (let i = 1; i < SIZE; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL + 0.5, 0); ctx.lineTo(i * CELL + 0.5, SIZE * CELL); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * CELL + 0.5); ctx.lineTo(SIZE * CELL, i * CELL + 0.5); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (mirror) {
      ctx.strokeStyle = Palette.cur.accent;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(8 * CELL, 0); ctx.lineTo(8 * CELL, SIZE * CELL); ctx.stroke();
    }
  }

  function pushHistory() {
    history.push(rows());
    if (history.length > 60) history.shift();
  }

  function setPixel(x, y, ch) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    grid[y][x] = ch;
    if (mirror) grid[y][SIZE - 1 - x] = ch;
  }

  function flood(x, y, ch) {
    const target = grid[y][x];
    if (target === ch) return;
    const stack = [[x, y]];
    while (stack.length) {
      const [px, py] = stack.pop();
      if (px < 0 || py < 0 || px >= SIZE || py >= SIZE || grid[py][px] !== target) continue;
      grid[py][px] = ch;
      stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }
  }

  function cellAt(e) {
    const r = cv.getBoundingClientRect();
    return [Math.floor(((e.clientX - r.left) / r.width) * SIZE), Math.floor(((e.clientY - r.top) / r.height) * SIZE)];
  }

  function changed() { draw(); onChange(); }

  function renderTools() {
    q('#palette').innerHTML = PAINTS.map(([ch, name]) =>
      `<button class="sw${paint === ch ? ' on' : ''}${ch === '.' ? ' erase' : ''}" data-ch="${ch}" style="${PAL[ch] ? `background:${PAL[ch]}` : ''}"></button>`).join('');
    qa('#palette .sw').forEach((b) => (b.onclick = () => { paint = b.dataset.ch; if (tool === 'pick') tool = 'pen'; renderTools(); }));
    q('#tools').innerHTML = [['pen', 'PEN'], ['fill', 'FILL'], ['pick', 'PICK']].map(([k, l]) =>
      `<button class="tool${tool === k ? ' on' : ''}" data-tool="${k}">${l}</button>`).join('') +
      `<button class="tool${mirror ? ' on' : ''}" id="mirrorBtn">MIRROR</button>`;
    qa('#tools [data-tool]').forEach((b) => (b.onclick = () => { tool = b.dataset.tool; renderTools(); }));
    q('#mirrorBtn').onclick = () => { mirror = !mirror; renderTools(); draw(); };
  }

  function undo() {
    const prev = history.pop();
    if (!prev) { onToast('Nothing to undo.'); return; }
    setRows(prev);
    changed();
  }

  /* Apply art from outside (e.g. "reset to default") as an undoable edit. */
  function apply(src) { pushHistory(); setRows(src); changed(); }

  /* ---------- "start from art" picker (same tile grid as the deck art picker) ---------- */
  function artLabel(key) {
    if (key === 'hero') return 'Hero';
    if (key.startsWith('land_')) return COLORS[key.slice(5)] ? COLORS[key.slice(5)].land : key;
    const c = Object.values(CARDS).find((x) => x.sprite === key);
    return c ? c.name : key;
  }

  function artTile(key, label = artLabel(key), on = false) {
    return `<button class="da-tile${on ? ' on' : ''}" data-art="${escapeHTML(key)}">
      <img src="${spriteURL(key)}" alt=""><span>${escapeHTML(label)}</span></button>`;
  }

  function artSection(title, keys) {
    return keys.length ? `<div class="da-h">${title}</div><div class="da-grid">${keys.map((k) => artTile(k)).join('')}</div>` : '';
  }

  function closePicker() {
    const w = q('#tplWrap');
    if (w) w.remove();
    document.removeEventListener('keydown', pickerKey, true);
  }

  function pickerKey(e) {
    if (e.key !== 'Escape' || !q('#tplWrap')) return;
    e.stopPropagation();
    closePicker();
  }

  function openPicker() {
    sfx('select');
    closePicker();
    const mine = customIds.map((id) => CARDS[id].sprite).filter((k) => k.startsWith('spr_') && SPRITES[k]);
    const builtIn = Object.keys(SPRITES).filter((k) => !k.startsWith('spr_') && !k.startsWith('deck_') && !k.endsWith('_default'));
    const wrap = document.createElement('div');
    wrap.className = 'da-wrap tpl-wrap';
    wrap.id = 'tplWrap';
    wrap.innerHTML = `<div class="da panel">
      <div class="da-head">
        <div class="db-title">START FROM ART</div>
        <div class="da-curname">Replaces the canvas. UNDO brings your drawing back.</div>
      </div>
      <div class="da-body">
        ${artSection('MY CARD MAKER ART', mine)}
        ${artSection('ALL ART', builtIn)}
      </div>
      <div class="da-foot"><button class="btn sm" id="tplCancel">CANCEL</button></div>
    </div>`;
    wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) closePicker(); });
    wrap.querySelectorAll('[data-art]').forEach((b) => (b.onclick = () => {
      closePicker();
      sfx('place');
      apply(expandSprite(SPRITES[b.dataset.art]));
    }));
    wrap.querySelector('#tplCancel').onclick = () => { sfx('select'); closePicker(); };
    q('#screen').appendChild(wrap);
    document.addEventListener('keydown', pickerKey, true);
  }

  function init(opts = {}) {
    onChange = opts.onChange || onChange;
    onToast = opts.onToast || onToast;
    cv = q('#pix');
    ctx = cv.getContext('2d');
    grid = blankGrid();

    let drawing = false, drawPaint = '#';
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      const [x, y] = cellAt(e);
      drawPaint = e.button === 2 ? '.' : paint;
      if (tool === 'pick') { paint = grid[y][x]; tool = 'pen'; renderTools(); return; }
      pushHistory();
      if (tool === 'fill') { flood(x, y, drawPaint); changed(); return; }
      drawing = true;
      cv.setPointerCapture(e.pointerId);
      setPixel(x, y, drawPaint);
      draw();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const [x, y] = cellAt(e);
      setPixel(x, y, drawPaint);
      draw();
    });
    const endDraw = () => { if (drawing) { drawing = false; changed(); } };
    cv.addEventListener('pointerup', endDraw);
    cv.addEventListener('pointercancel', endDraw);

    q('#undoBtn').onclick = undo;
    q('#clearBtn').onclick = () => { pushHistory(); grid = blankGrid(); changed(); };
    q('#flipBtn').onclick = () => { pushHistory(); grid = grid.map((r) => r.slice().reverse()); changed(); };
    qa('[data-shift]').forEach((b) => (b.onclick = () => {
      const [dx, dy] = b.dataset.shift.split(',').map(Number);
      pushHistory();
      const old = grid;
      grid = blankGrid();
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        const sx = x - dx, sy = y - dy;
        if (sx >= 0 && sy >= 0 && sx < SIZE && sy < SIZE) grid[y][x] = old[sy][sx];
      }
      changed();
    }));

    closePicker();
    q('#template').onclick = openPicker;

    renderTools();
    draw();
  }

  return { SIZE, BLANK_ROW, init, load, apply, rows, undo, draw, artLabel, artTile };
})();
