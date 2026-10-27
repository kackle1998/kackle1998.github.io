'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the battle as a 2.5D table (test only: tabletest.html)
   The board is a tabletop floating over the game's swirl paint (Scene.swirl), your rival sits
   across it (their portrait), and the camera moves to what matters. Every creature on the board
   is summoned: its art rises out of its card and stands on it, the card left with an empty frame
   and its stats. Drawn from a Game's state (js/engine.js) by sync(); the test page drives it.
   Built from the design kept in the builder (mockups/table.js).
     Table.mount(stage, { rival }) -> {
       sync(game)        redraw from the game; resolves once new creatures have risen
       mark(marks)       highlight slots: { 'c0-2': 'target' | 'ready' | 'sel', 't0-1': ..., rival: true }
       on(handlers)      { slot(side, i), trap(side, i), rival(), bell(), hover(side, kind, i | null), press(side, i, event) }
                         Every clickable thing on the table carries data-kind ('slot' | 'trap' | 'rival' | 'bell'),
                         and slots data-side and data-slot, so a drag can find what it was dropped on.
       cam(shot, slot)   'hand' | 'board' | 'combat' (on that slot's lane) | 'dealer'
       handY()           how far the hand tray is slid down out of the way for the camera now (stage px)
       lunge(uid, t)     a creature hops at a target ({ uid } or { player }) and back
       hurt(uid), sink(uid), ring()
     }
   Side 0 is you (the near rows), side 1 your rival. Scene px are 4 map units; every object is
   drawn in whole scene px with a traced 1 px ink outline (inked), so their edges all match.
   ============================================================ */

const Table = (() => {
  const { W: CW, H: CH } = Scene.CARD;
  const TW = 150, TH = 120, TL = 720 - TW * 2, TT = 20, LIFT = 48; // the tabletop: scene px across and deep, its left and back edge on the plane (map units), its height
  const SX = (i) => 25 + i * 21, TRX = (i) => SX(i + 1);
  const ROW = [64, 32], TRAP_ROW = [92, 6], MID = 59; // creature and trap rows, yours then your rival's
  const RISE = 4, STEP = 1000 / 7; // a creature rises out of its card in RISE steps, 7 a second
  const tx = (sx) => TL + sx * 4, td = (sy) => TT + sy * 4; // a tabletop scene px as plane x and depth
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // The camera of each shot, as .bw-pl's transform: translateY(ty) translateZ(tz) rotateX(rx) translate(cx, cy).
  // hand: how far the docked hand tray slides down out of the way (stage px): 0 while it's yours to play.
  const SHOTS = {
    hand: { rx: 58, ty: 40, tz: 560, cx: 0, cy: -20, hand: 0 },
    board: { rx: 40, ty: -40, tz: 150, cx: 0, cy: -110, hand: 0 }, // framed above the docked hand tray
    combat: { rx: 50, ty: 50, tz: 640, cx: 0, cy: 20, hand: 170 },
    dealer: { rx: 56, ty: 40, tz: 520, cx: 0, cy: 90, hand: 170 },
  };
  // 3 x 5 digits for the stats on the cards.
  const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001011001111', '101101111001001', '111100111001111', '111100111101111', '111001010010010', '111101111101111', '111101111001111'];

  function mount(stage, { rival = 'rival_mort' } = {}) {
    const ROWS = 700, TOP = 90, sc = Scene.mount(stage, { rows: ROWS, top: TOP }), { C, pl } = sc;
    Scene.swirl(sc);
    // Scene.mount sizes the view once, for a stage that keeps its size (the game's cabinet). This page fills the
    // window, so size it again whenever the window changes, the way Scene.mount does, or the table drifts off center.
    const view = pl.parentElement, fitView = () => {
      if (!sc.alive()) return window.removeEventListener('resize', fitView);
      const k = stage.clientHeight / ROWS;
      Object.assign(view.style, { width: stage.clientWidth / k + 'px', top: TOP * k + 'px', transform: `scale(${k})` });
    };
    window.addEventListener('resize', fitView);
    let handlers = {}, marks = {};
    const call = (name, ...a) => handlers[name] && handlers[name](...a);

    /* ---------- drawing helpers ---------- */
    // Draw art (a pen in scene px) on a w x h canvas, then trace a 1 px ink outline round whatever it covers.
    const inked = (w, h, draw) => {
      const cv = document.createElement('canvas'), cg = cv.getContext('2d');
      cv.width = w; cv.height = h;
      draw(Scene.pen(cg, C, 0, 0, 1));
      const d = cg.getImageData(0, 0, w, h).data, on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
      cg.fillStyle = C[1];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) cg.fillRect(x, y, 1, 1);
      return cv;
    };
    const shift = (P, dx, dy) => ({ P: (x, y, k) => P.P(x + dx, y + dy, k), R: (x, y, w, h, k) => P.R(x + dx, y + dy, w, h, k) });
    const flatCv = (x, y, w, h, z) => { // a canvas lying on the plane, w x h scene px, 2 canvas px each
      const cv = document.createElement('canvas');
      cv.width = w * 2; cv.height = h * 2;
      Object.assign(cv.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: w * 4 + 'px', height: h * 4 + 'px', imageRendering: 'pixelated', transform: `translateZ(${z}px)` });
      pl.appendChild(cv);
      return cv;
    };
    // A standee on the tabletop: w x h scene px of art, feet at tabletop scene px (sx, sy). paint(draw) redraws it, outlined.
    const propCv = (sx, sy, w, h) => {
      const cv = document.createElement('canvas'), cg = cv.getContext('2d');
      cv.width = w + 2; cv.height = h + 1;
      sc.stand(cv, tx(sx - 1), td(sy), (w + 2) * 4, (h + 1) * 4);
      cv.style.transform = `translateZ(${LIFT}px) rotateX(-90deg)`;
      const paint = (draw) => { cg.clearRect(0, 0, w + 2, h + 1); cg.drawImage(inked(w + 2, h + 1, (P) => draw(shift(P, 1, 1))), 0, 0); };
      paint.cv = cv;
      return paint;
    };
    // A sprite with a 1 px ink outline, as your figurine (Scene.figure); `flip` mirrors it, `edge` recolors the outline.
    const outlined = (name, flip, edge = C[1]) => {
      const rows = expandSprite(SPRITES[name] || SPRITES.hero), h = rows.length, cv = document.createElement('canvas'), g = cv.getContext('2d');
      cv.width = 18; cv.height = h + 2;
      const at = (x, y) => y >= 0 && y < h && x >= 0 && x < 16 && PAL[rows[y][flip ? 15 - x : x]] != null;
      for (let y = -1; y <= h; y++) for (let x = -1; x <= 16; x++) {
        const c = at(x, y) ? PAL[rows[y][flip ? 15 - x : x]] : at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1) ? edge : null;
        if (c) { g.fillStyle = c; g.fillRect(x + 1, y + 1, 1, 1); }
      }
      return cv;
    };
    const arts = new Map(), artOf = (name) => { if (!arts.has(name)) arts.set(name, Scene.spriteArt(name)); return arts.get(name); };
    const blank = document.createElement('canvas'); blank.width = blank.height = 1;
    // A pixel card face onto canvas g (2 canvas px a scene px); `empty`: its creature is out, the frame bare.
    const face = (g, x, y, c, empty) => Scene.cardFace(Scene.pen(g, C, 0, 0, 2), x, y, CW,
      { art: empty ? blank : artOf(c.sprite), rarity: rarityOf(c), pl: { art: (img, ax, ay) => g.drawImage(img, Math.round(ax * 2), Math.round(ay * 2)) } });
    const digits = (P, x, y, n, k) => {
      const s = String(Math.max(0, n));
      [...s].forEach((d, j) => [...DIGITS[+d]].forEach((b, i) => { if (b === '1') P.P(x + j * 4 + (i % 3), y + Math.floor(i / 3), k); }));
      return s.length * 4 - 1;
    };

    /* ---------- the tabletop ---------- */
    const edge = document.createElement('canvas'), EP = Scene.pen(edge.getContext('2d'), C, 0, 0, 1);
    edge.width = TW * 2; edge.height = LIFT / 2;
    sc.stand(edge, TL, td(TH), TW * 4, LIFT);
    EP.R(0, 0, TW * 2, 8, 1); EP.R(1, 1, TW * 2 - 2, 6, 3); EP.R(1, 1, TW * 2 - 2, 1, 4); EP.R(1, 1, 2, 6, 4);

    const top = flatCv(TL, TT, TW, TH, LIFT), g = top.getContext('2d'), P2 = Scene.pen(g, C, 0, 0, 2), P1 = Scene.pen(g, C, 0, 0, 1);
    const wood = document.createElement('canvas');
    wood.width = TW * 2; wood.height = TH * 2;
    const wg = wood.getContext('2d'), W1 = Scene.pen(wg, C, 0, 0, 1), W2 = Scene.pen(wg, C, 0, 0, 2), WOOD = [4, 5, 6, 6];
    wg.imageSmoothingEnabled = false;
    for (let y = 0; y < TH * 2; y++) for (let x = 0; x < TW * 2; x++) W1.P(x, y, WOOD[Scene.lvl(0.95 - (x + y) / (TW * 2 + TH * 2) * 0.75, x, y)]);
    for (let y = 22; y < TH * 2; y += 24) { W1.R(4, y, TW * 2 - 8, 1, 3); W1.R(4, y + 1, TW * 2 - 8, 1, 6); } // plank seams
    for (let n = 0; n < 200; n++) { const s = Math.sin(n * 91.7) * 43758.5, x = Math.floor((s - Math.floor(s)) * (TW * 2 - 12)) + 6, y = (n * 37) % (TH * 2 - 8) + 4; W1.R(x, y, 3, 1, 4); } // grain
    W1.R(0, 0, TW * 2, 2, 1); W1.R(0, TH * 2 - 2, TW * 2, 2, 1); W1.R(0, 0, 2, TH * 2, 1); W1.R(TW * 2 - 2, 0, 2, TH * 2, 1);
    W1.R(2, 2, TW * 2 - 4, 4, 3); W1.R(2, TH * 2 - 6, TW * 2 - 4, 4, 2); W1.R(2, 2, 4, TH * 2 - 4, 3); W1.R(TW * 2 - 6, 2, 4, TH * 2 - 4, 2); W1.R(2, 2, TW * 2 - 4, 1, 6); W1.R(2, 2, 1, TH * 2 - 4, 6);
    for (let x = 16; x < TW * 2 - 16; x += 8) W1.R(x, MID * 2, 4, 2, 3);
    const slot = (P, x, y, w, h, k, dash) => {
      for (let i = 0; i < w; i++) if (!dash || i % 3 < 2) { P.P(x + i, y, k); P.P(x + i, y + h - 1, k); }
      for (let j = 0; j < h; j++) if (!dash || j % 3 < 2) { P.P(x, y + j, k); P.P(x + w - 1, y + j, k); }
    };
    const fork = (x, y) => { for (const [fx, fy] of [[0, 0], [4, 0], [0, 1], [4, 1], [1, 2], [2, 2], [3, 2], [2, 3], [2, 4]]) W2.P(x + fx, y + fy, 4); };
    for (let i = 0; i < 5; i++) for (const y of ROW) { slot(W2, SX(i), y, CW, CH, 3); fork(SX(i) + 5, y + 9); }
    for (let i = 0; i < 3; i++) for (const y of TRAP_ROW) slot(W2, TRX(i), y, CW, CH, 3, true);
    const onWood = (x, y, w, h, draw) => wg.drawImage(inked(w + 2, h + 2, (P) => draw(shift(P, 1, 1))), (x - 1) * 2, (y - 1) * 2, (w + 2) * 2, (h + 2) * 2);
    onWood(128, 113, 17, 3, (P) => { P.P(0, 1, 8); P.R(1, 1, 3, 1, 3); P.R(4, 0, 1, 3, 3); P.R(5, 1, 11, 1, 7); P.P(16, 1, 7); }); // a dagger
    const bone = (x, y) => onWood(x, y, 7, 3, (P) => { P.R(1, 1, 5, 1, 7); for (const bx of [0, 6]) { P.P(bx, 0, 7); P.P(bx, 2, 7); } });
    bone(130, 59); bone(135, 63); bone(7, 86);
    onWood(127, 84, 4, 3, (P) => { P.R(0, 0, 4, 3, 8); P.P(0, 0, 7); P.P(2, 1, 6); }); // a spilled chip

    /* ---------- the props ---------- */
    const candleArt = (P, f, h, skull) => {
      const fl = f ? [[5, 0], [5, 1], [6, 1], [4, 2], [5, 2], [6, 2], [5, 3], [5, 4]] : [[4, 0], [4, 1], [5, 1], [4, 2], [5, 2], [6, 2], [5, 3], [5, 4]];
      for (const [x, y] of fl) P.P(x, y, 8);
      P.P(5, 3, 7);
      const w1 = skull ? h - 9 : h - 3;
      P.R(3, 6, 4, w1 - 6, 6); P.R(3, 6, 1, w1 - 6, 7); P.R(6, 6, 1, w1 - 6, 5); P.P(5, 5, 1);
      P.R(2, 8, 1, 3, 6); P.R(7, 10, 1, 2, 5);
      if (skull) {
        P.R(2, h - 9, 6, 1, 7); P.R(1, h - 8, 8, 5, 7); P.R(2, h - 3, 6, 2, 7); P.R(6, h - 8, 2, 5, 6);
        P.R(2, h - 7, 2, 2, 1); P.R(6, h - 7, 2, 2, 1); P.P(4, h - 4, 2); P.P(3, h - 2, 1); P.P(5, h - 2, 1); P.R(2, h - 1, 6, 1, 1);
      } else { P.R(1, h - 3, 8, 2, 3); P.R(1, h - 3, 8, 1, 4); P.R(1, h - 1, 8, 1, 1); }
    };
    const candles = [[propCv(2, 18, 10, 31), 31, false], [propCv(136, 22, 10, 23), 23, true]];

    // The bell at the left end of the middle line: ring it to end your turn.
    const bellPaint = propCv(6, MID + 4, 12, 9), bellArt = (s) => bellPaint((P) => {
      P.R(5 + s, 0, 2, 1, 2); P.R(3 + s, 1, 6, 1, 8); P.R(2 + s, 2, 8, 2, 8); P.R(1 + s, 4, 10, 2, 8); P.R(3 + s, 2, 2, 1, 7); P.P(2 + s, 3, 7);
      P.R(0, 6, 12, 2, 3); P.R(0, 6, 12, 1, 4); P.R(0, 8, 12, 1, 1);
    });
    bellArt(0);
    Object.assign(bellPaint.cv.style, { pointerEvents: 'auto', cursor: 'pointer' });
    bellPaint.cv.dataset.kind = 'bell';
    bellPaint.cv.addEventListener('click', () => call('bell'));

    // Life: a chip for every 4 life. Mana: a book for every tome, closed and dark once it's spent this turn.
    const chips = [propCv(126, 102, 10, 17), propCv(14, 26, 10, 17)];
    const chipArt = (paint, n) => paint((P) => {
      for (let i = 0; i < n; i++) { const y = 15 - i * 2; P.R(0, y, 10, 1, i % 2 ? 6 : 8); P.P(0, y, 7); P.P(5, y, i % 2 ? 8 : 6); P.R(0, y + 1, 10, 1, 1); }
    });
    const tomes = [propCv(3, 112, 16, 25), propCv(127, 29, 16, 25)];
    const TOME_TONE = { paw: 4, bone: 6, gem: 5, hat: 3 };
    const tomeArt = (paint, lands) => paint((P) => {
      const n = Math.min(8, lands.length), base = 24;
      lands.slice(0, n).forEach((l, i) => {
        const y = base - 3 - i * 3, x = i % 2, w = 15 - (i % 3 === 1 ? 1 : 0), k = l.tapped ? 2 : TOME_TONE[l.color] || 4;
        P.R(x, y, w, 2, k); P.R(x, y, w - 2, 1, Math.min(7, k + 1)); P.R(x + w - 2, y, 1, 2, 7); P.R(x, y + 2, w, 1, 1);
        if (!l.tapped) P.R(x + 6, y, 2, 2, 8);
      });
    });

    // The piles: a stack's front edge and both sides standing, its top card lying on it. Rebuilt when they change.
    const pileAt = { deck0: [130, ROW[0] + 4], grave0: [5, ROW[0] + 4], deck1: [5, ROW[1] - 2], grave1: [130, ROW[1] - 2] };
    const piles = {};
    const pile = (key, n, topCard) => {
      const layers = n ? Math.max(1, Math.min(10, Math.ceil(n / 3))) : 0, sig = layers + '|' + (topCard ? topCard.uid : '');
      const old = piles[key];
      if (old && old.sig === sig) return;
      if (old) old.els.forEach((e) => e.remove());
      const els = [], [sx, sy] = pileAt[key];
      piles[key] = { sig, els };
      if (!layers) return;
      const front = document.createElement('canvas'), FP = Scene.pen(front.getContext('2d'), C, 0, 0, 1);
      front.width = CW; front.height = layers;
      sc.stand(front, tx(sx), td(sy + CH), CW * 4, layers * 4);
      front.style.transform = `translateZ(${LIFT}px) rotateX(-90deg)`;
      for (let y = 0; y < layers; y++) { FP.R(0, y, CW, 1, y % 2 ? 4 : 6); FP.P(1, y, 7); FP.P(0, y, 1); FP.P(CW - 1, y, 1); }
      FP.R(0, layers - 1, CW, 1, 1);
      els.push(front);
      for (const [ex, lit] of [[0, true], [CW, false]]) {
        const side = document.createElement('canvas'), SP = Scene.pen(side.getContext('2d'), C, 0, 0, 1);
        side.width = CH; side.height = layers;
        for (let y = 0; y < layers; y++) { SP.R(0, y, CH, 1, lit ? (y % 2 ? 5 : 7) : (y % 2 ? 3 : 4)); SP.P(0, y, 1); SP.P(CH - 1, y, 1); }
        SP.R(0, layers - 1, CH, 1, 1);
        Object.assign(side.style, { position: 'absolute', left: tx(sx + ex) + 'px', top: td(sy) - layers * 4 + 'px', width: CH * 4 + 'px', height: layers * 4 + 'px',
          imageRendering: 'pixelated', transformOrigin: '0 100%', transform: `translateZ(${LIFT}px) rotateZ(90deg) rotateX(-90deg)` });
        pl.appendChild(side);
        els.push(side);
      }
      const lid = flatCv(tx(sx), td(sy), CW, CH, LIFT + layers * 4), lg = lid.getContext('2d');
      if (topCard) face(lg, 0, 0, topCard); else Scene.cardArt(Scene.pen(lg, C, 0, 0, 2), 0, 0);
      els.push(lid);
    };

    // Your rival, sitting across the table, sunk so the tabletop hides them below the chest. Click them to strike them
    // directly; their outline turns gold while you can.
    const RS = 12, rivalCv = outlined(rival), rivalLooks = [outlined(rival), outlined(rival, false, C[8])], rivalEl = sc.stand(rivalCv, 720 - 9 * RS, TT - 6, 18 * RS, rivalCv.height * RS);
    Object.assign(rivalEl.style, { pointerEvents: 'auto', cursor: 'pointer' });
    rivalEl.dataset.kind = 'rival';
    rivalEl.addEventListener('click', () => call('rival'));
    let lean = 0;

    /* ---------- the creatures ---------- */
    const creatures = new Map(); // uid -> { el, cv, src, side, slot, k, tap, tapGoal }
    // Tapping, as the battle screen turns a card sideways once it has attacked: its card turns a quarter turn in
    // its slot in steps (TAP, degrees), and the creature on it swings round with it (YAW) so it still shows.
    const TAP = [0, 45, 90], YAW = [0, 25, 50];
    const crPos = (cr) => ({ left: tx(SX(cr.slot) - 1), depth: td(ROW[cr.side] + 12) });
    const crPlace = (cr, dx = 0, dy = 0, z = 0) => { cr.el.style.transform = `translate(${dx}px, ${dy}px) translateZ(${LIFT + 1 + z}px) rotateZ(${YAW[cr.tap || 0]}deg) rotateX(-90deg)`; };
    const tapTo = async (cr, on) => {
      const goal = on ? TAP.length - 1 : 0;
      if (cr.tapGoal === goal) return;
      cr.tapGoal = goal;
      while (cr.tap !== cr.tapGoal && creatures.get(cr.uid) === cr) {
        cr.tap += Math.sign(cr.tapGoal - cr.tap);
        crPlace(cr);
        drawTable();
        await wait(70);
      }
    };
    const crShow = (cr, k) => {
      cr.k = k;
      const cg = cr.cv.getContext('2d'), rows = Math.round(cr.src.height * k / RISE);
      cg.clearRect(0, 0, cr.cv.width, cr.cv.height);
      if (rows) cg.drawImage(cr.src, 0, 0, cr.src.width, rows, 0, cr.src.height - rows, cr.src.width, rows);
      cr.el.style.visibility = k ? '' : 'hidden';
    };
    const crMake = (c, side, slot) => {
      const src = outlined(c.sprite, side === 1), cv = document.createElement('canvas');
      cv.width = src.width; cv.height = src.height;
      const cr = { uid: c.uid, src, cv, side, slot, k: 0, tap: 0, tapGoal: 0 }, { left, depth } = crPos(cr);
      cr.el = sc.stand(document.createElement('div'), left, depth, src.width * 4, src.height * 4);
      cr.el.appendChild(cv);
      cr.el.classList.add('bob');
      Object.assign(cr.el.style, { pointerEvents: 'auto', cursor: 'pointer', touchAction: 'none' });
      Object.assign(cr.el.dataset, { kind: 'slot', side, slot });
      cr.el.addEventListener('click', () => call('slot', cr.side, cr.slot));
      cr.el.addEventListener('pointerdown', (e) => call('press', cr.side, cr.slot, e));
      cr.el.addEventListener('mouseenter', () => call('hover', cr.side, 'creature', cr.slot));
      cr.el.addEventListener('mouseleave', () => call('hover', null));
      crPlace(cr);
      crShow(cr, 0);
      return cr;
    };

    /* ---------- the hit areas: every slot and trap slot, lying on the table ---------- */
    const hit = (sx, sy, fn, hov, data) => {
      const el = document.createElement('div');
      Object.assign(el.style, { position: 'absolute', left: tx(sx) + 'px', top: td(sy) + 'px', width: CW * 4 + 'px', height: CH * 4 + 'px', transform: `translateZ(${LIFT + 2}px)`, cursor: 'pointer', touchAction: 'none' });
      Object.assign(el.dataset, data);
      el.addEventListener('click', fn);
      if (data.kind === 'slot') el.addEventListener('pointerdown', (e) => call('press', data.side, data.slot, e));
      el.addEventListener('mouseenter', hov);
      el.addEventListener('mouseleave', () => call('hover', null));
      pl.appendChild(el);
    };
    for (const side of [0, 1]) {
      for (let i = 0; i < 5; i++) hit(SX(i), ROW[side], () => call('slot', side, i), () => call('hover', side, 'creature', i), { kind: 'slot', side, slot: i });
      for (let i = 0; i < 3; i++) hit(TRX(i), TRAP_ROW[side], () => call('trap', side, i), () => call('hover', side, 'trap', i), { kind: 'trap', side, slot: i });
    }

    /* ---------- the camera ---------- */
    const cam = { ...SHOTS.board }, aim = { ...SHOTS.board };
    let flame = 0, ease = 0.1; // how much of the way the camera goes each frame: quicker into a fight
    const tick = (now) => {
      if (!sc.alive()) return;
      for (const k in cam) cam[k] += (aim[k] - cam[k]) * ease;
      pl.style.transform = `translateY(${cam.ty}px) translateZ(${cam.tz}px) rotateX(${cam.rx}deg) translate(${cam.cx}px, ${cam.cy}px)`;
      const f = Math.floor(now / 1000 * 4); // the candles' flames and your rival's breath, stepped
      if (f !== flame) { flame = f; candles.forEach(([paint, h, skull], i) => paint((P) => candleArt(P, (f + i) % 2, h, skull))); }
      rivalEl.style.transform = `translateZ(${LIFT - 70 + (Math.floor(f / 3) % 2) * 4}px) rotateX(${-90 + lean}deg)`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    /* ---------- drawing the game ---------- */
    let last = null;
    const turned = document.createElement('canvas'), tg = turned.getContext('2d'); // a card drawn alone, to turn it onto the table
    turned.width = CW * 2; turned.height = CH * 2;
    function drawTable() {
      const game = last;
      if (!game) return;
      g.drawImage(wood, 0, 0);
      game.players.forEach((p, side) => {
        p.board.forEach((c, i) => {
          const x = SX(i), y = ROW[side], m = marks[`c${side}-${i}`];
          if (!c) { if (m) slot(P2, x, y, CW, CH, m === 'ready' ? 7 : 8); return; }
          const cr = creatures.get(c.uid), out = cr && cr.k >= RISE, turn = cr ? TAP[cr.tap] : 0;
          if (!turn) face(g, x, y, c, out);
          else { // tapped: the card turned about its middle, pixel for pixel
            tg.clearRect(0, 0, turned.width, turned.height);
            face(tg, 0, 0, c, out);
            g.save();
            g.imageSmoothingEnabled = false;
            g.translate(x * 2 + CW, y * 2 + CH);
            g.rotate(turn * Math.PI / 180);
            g.drawImage(turned, -CW, -CH);
            g.restore();
          }
          if (out) for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 18; xx++) { const X = x * 2 + 6 + xx, Y = y * 2 + 21 + yy, e = ((xx - 8.5) / 9) ** 2 + ((yy - 1.5) / 2) ** 2; if (e < 1 && Scene.bay(X, Y) < 8) P1.P(X, Y, 4); }
          // Its stats, upright even on a turned card: attack at the left, health at the right (in the accent once it's hurt).
          const sy = turn ? y + 12 : y + 15;
          P2.R(x + 1, sy, CW - 2, 6, 6);
          digits(P2, x + 2, sy + 1, game.attackOf(c), 1);
          const hp = c.hp - c.dmg, hw = String(Math.max(0, hp)).length * 4 - 1;
          digits(P2, x + CW - 2 - hw, sy + 1, hp, hp < c.hp ? 8 : 1);
          if (m) slot(P2, x, y, CW, CH, m === 'ready' ? 7 : 8);
        });
        p.traps.forEach((t, i) => {
          const m = marks[`t${side}-${i}`];
          if (t) Scene.cardArt(P2, TRX(i), TRAP_ROW[side], rarityOf(t));
          if (m) slot(P2, TRX(i), TRAP_ROW[side], CW, CH, 8, !t);
        });
      });
    }

    function sync(game) {
      last = game;
      const seen = new Set(), fresh = [];
      game.players.forEach((p, side) => p.board.forEach((c, i) => {
        if (!c) return;
        seen.add(c.uid);
        let cr = creatures.get(c.uid);
        if (!cr) { cr = crMake(c, side, i); creatures.set(c.uid, cr); fresh.push(cr); }
      }));
      for (const [uid, cr] of creatures) if (!seen.has(uid)) { cr.el.remove(); creatures.delete(uid); }
      game.players.forEach((p, side) => {
        chipArt(chips[side], Math.max(0, Math.min(8, Math.ceil(p.life / 4))));
        tomeArt(tomes[side], p.lands);
        pile('deck' + side, p.library.length, null);
        pile('grave' + side, p.grave.length, p.grave[p.grave.length - 1]);
      });
      drawTable();
      // A creature that has attacked taps; it untaps at the start of its owner's turn (the engine clears `attacked`).
      for (const p of game.players) for (const c of p.board) if (c && !c.dead) tapTo(creatures.get(c.uid), !!c.attacked);
      return Promise.all(fresh.map(async (cr) => { for (let k = 1; k <= RISE; k++) { await wait(STEP); crShow(cr, k); } drawTable(); }));
    }

    return {
      sync,
      mark(m) {
        marks = m || {};
        drawTable();
        const rg = rivalCv.getContext('2d');
        rg.clearRect(0, 0, rivalCv.width, rivalCv.height);
        rg.drawImage(rivalLooks[marks.rival ? 1 : 0], 0, 0);
      },
      on(h) { handlers = h; },
      cam(shot, slotI) {
        Object.assign(aim, SHOTS[shot]);
        ease = shot === 'combat' ? 0.18 : 0.1;
        if (shot === 'combat' && slotI >= 0) aim.cx = 720 - (tx(SX(slotI)) + CW * 2);
      },
      handY: () => cam.hand,
      /* An attack: a short wind-up back, a quick arcing dash at the target, onHit() on contact (so the hit
         lands there), a beat, and a snap home while the target flinches. Its position moves smoothly, as
         every position does; only poses step. Resolves once it's home. */
      lunge(uid, t, onHit = () => {}) {
        const cr = creatures.get(uid);
        if (!cr) { onHit(); return Promise.resolve(); }
        let dx = 0, dy;
        const me = crPos(cr);
        if (t.uid != null && creatures.get(t.uid)) { const o = creatures.get(t.uid), op = crPos(o); dx = op.left - me.left; dy = op.depth - me.depth; dy -= Math.sign(dy) * 40; }
        else dy = cr.side === 0 ? td(TRAP_ROW[1] + CH) - me.depth : td(TH - 4) - me.depth;
        const WIND = 110, DASH = 170, HOLD = 70, BACK = 230, back = -0.08;
        const path = (e) => { // e: elapsed ms -> [share of the way there, height]
          if (e < WIND) { const k = e / WIND; return [back * Math.sin(k * Math.PI / 2), 0]; }
          if (e < WIND + DASH) { const k = (e - WIND) / DASH, s = k * k; return [back + (1 - back) * s, 28 * Math.sin(Math.PI * k)]; } // speeding up into the hit
          if (e < WIND + DASH + HOLD) return [1, 0];
          const k = Math.min(1, (e - WIND - DASH - HOLD) / BACK), s = 1 - (1 - k) * (1 - k); // easing home
          return [1 - s, 14 * Math.sin(Math.PI * k)];
        };
        return new Promise((done) => {
          const t0 = performance.now();
          let hit = false;
          const step = (now) => {
            const e = now - t0, [k, z] = path(e);
            crPlace(cr, dx * k, dy * k, Math.round(z / 4) * 4);
            if (!hit && e >= WIND + DASH) {
              hit = true;
              if (t.player != null && cr.side === 0) { lean = 8; setTimeout(() => (lean = 0), 220); } // your rival rocks back
              onHit();
            }
            if (e < WIND + DASH + HOLD + BACK) requestAnimationFrame(step);
            else { crPlace(cr); done(); }
          };
          requestAnimationFrame(step);
        });
      },
      async hurt(uid) {
        const cr = creatures.get(uid);
        if (!cr) return;
        for (const dx of [-8, 8, -4, 0]) { crPlace(cr, dx); await wait(55); }
      },
      async sink(uid) {
        const cr = creatures.get(uid);
        if (!cr) return;
        for (let k = cr.k - 1; k >= 0; k--) { crShow(cr, k); drawTable(); await wait(STEP * 0.75); }
      },
      async ring() { for (const s of [1, -1, 1, 0]) { bellArt(s); await wait(STEP * 0.7); } },
    };
  }

  return { mount };
})();
