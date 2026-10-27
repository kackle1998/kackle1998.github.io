'use strict';
/* The battle as a 2.5D table (builder.html?mockup=table): the board is a tabletop floating over the
   game's swirl paint (Scene.swirl), your rival sits across it (their portrait, SPRITES.rival_*),
   and the camera moves to what matters. A creature on the board is summoned: its art rises out of
   its card a step at a time and stands on it, the card left with an empty frame. One loop through
   the four shots, SHOT_S seconds each:
     hand    low behind your hand, the table and your rival looming past it; a card lifts
     board   tipped up over the table so every slot reads, the hand down to a peek; a card goes
             down and its creature rises out of it
     combat  leaning in on the middle lane: your creature lunges at theirs; they reel and lose a chip
     dealer  swung round to your rival's side, the hand hidden; you ring the bell, they lean in
             and slide a card out, and its creature rises */
(() => {
  const SHOT_S = 4, EASE_S = 0.9, FPS = 6;
  const { W: CW, H: CH } = Scene.CARD;
  const RIVAL = 'rival_mort';
  // The camera of each shot, written as .bw-pl's transform: translateY(ty) translateZ(tz) rotateX(rx) translate(cx, cy).
  // hand: how far the hand overlay sits below its full height (stage px): up, a peek, gone.
  const SHOTS = [
    { name: 'hand', rx: 58, ty: 40, tz: 560, cx: 0, cy: -20, hand: 0 },
    { name: 'board', rx: 40, ty: -10, tz: 170, cx: 0, cy: -90, hand: 80 },
    { name: 'combat', rx: 50, ty: 50, tz: 680, cx: 0, cy: 20, hand: 170 },
    { name: 'dealer', rx: 56, ty: 40, tz: 520, cx: 0, cy: 90, hand: 170 },
  ];
  const ease = (k) => k * k * (3 - 2 * k);

  // The table, in scene px (4 map units each): 2 rows of 5 slots, 3 trap slots a side (js/engine.js's BOARD_SLOTS, TRAP_SLOTS).
  // The side margins (25 scene px) hold the piles and the clutter: decks, graves, life chips, tomes, the bell.
  const TW = 150, TH = 120, TL = 720 - TW * 2, TT = 20, LIFT = 48; // its left and back edge on the plane (map units), and how high its top stands
  const SX = (i) => 25 + i * 21, TRX = (i) => SX(i + 1);
  const DT = 6, DR = 32, MID = 59, YR = 64, YT = 92; // rows top to bottom: your rival's traps and creatures, the middle line, yours
  const RISE = 4; // the steps a creature takes to rise out of its card

  // What lies where (sprite indexes into the card art): your rival's row, yours.
  const THEIRS = { 0: 1, 2: 4 }, YOURS = { 1: 2, 2: 3 }, PLAYED = 3, DEALT = 5;

  function at(t) {
    const i = Math.floor(t / SHOT_S) % SHOTS.length, lt = t - i * SHOT_S;
    const from = SHOTS[(i + SHOTS.length - 1) % SHOTS.length], to = SHOTS[i], k = ease(Scene.cl(lt / EASE_S));
    const cam = {};
    for (const key of ['rx', 'ty', 'tz', 'cx', 'cy', 'hand']) cam[key] = from[key] + (to[key] - from[key]) * k;
    return { shot: to.name, f: Math.floor(lt * FPS), cam, t };
  }

  Builder.add({
    name: 'B · Floating table',
    desc: 'The tabletop over the swirl, your rival across it, creatures standing up out of their cards. Hand, board, combat, their turn.',
    len: SHOT_S * SHOTS.length, hold: 0.01, at,
    mount({ sc }) {
      const { C, pl, stage } = sc;
      for (const el of [...pl.children]) el.style.display = 'none'; // no floor, no features, no figurine: the tabletop alone over the swirl
      Scene.swirl(sc);
      const names = Object.keys(SPRITES).filter((n) => n !== 'hero' && !n.startsWith('rival_')), sprite = (n) => names[(n * 7 + 3) % names.length];
      const blank = document.createElement('canvas'); blank.width = blank.height = 1;
      const flatCv = (x, y, w, h, z) => { // a canvas lying on the plane, w x h scene px, 2 canvas px each
        const cv = document.createElement('canvas');
        cv.width = w * 2; cv.height = h * 2;
        Object.assign(cv.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: w * 4 + 'px', height: h * 4 + 'px', imageRendering: 'pixelated', transform: `translateZ(${z}px)` });
        pl.appendChild(cv);
        return cv;
      };
      const standCv = (x, depth, w, h) => { const cv = document.createElement('canvas'); cv.width = w * 2; cv.height = h * 2; sc.stand(cv, x, depth, w * 4, h * 4); return cv; };
      // A pixel card face onto canvas g (2 canvas px a scene px), its sprite 1 canvas px a pixel; `empty`: its creature is out, the frame bare.
      const face = (g, x, y, n, empty) => Scene.cardFace(Scene.pen(g, C, 0, 0, 2), x, y, CW, { art: empty ? blank : Scene.spriteArt(sprite(n)), pl: { art: (img, ax, ay) => g.drawImage(img, Math.round(ax * 2), Math.round(ay * 2)) } });
      // A sprite with a 1 px ink outline, as your figurine (Scene.figure), so it reads on the pale table; `flip` mirrors it.
      const outlined = (name, flip) => {
        const rows = expandSprite(SPRITES[name]), h = rows.length, cv = document.createElement('canvas'), g = cv.getContext('2d');
        cv.width = 18; cv.height = h + 2;
        const at = (x, y) => y >= 0 && y < h && x >= 0 && x < 16 && PAL[rows[y][flip ? 15 - x : x]] != null;
        for (let y = -1; y <= h; y++) for (let x = -1; x <= 16; x++) {
          const c = at(x, y) ? PAL[rows[y][flip ? 15 - x : x]] : at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1) ? C[1] : null;
          if (c) { g.fillStyle = c; g.fillRect(x + 1, y + 1, 1, 1); }
        }
        return cv;
      };

      // The slab's edge, standing at the table's front edge just under its top.
      const front = standCv(TL, TT + TH * 4, TW, LIFT / 4), F1 = Scene.pen(front.getContext('2d'), C, 0, 0, 1);
      F1.R(0, 0, TW * 2, 8, 1); F1.R(1, 1, TW * 2 - 2, 6, 3); F1.R(1, 1, TW * 2 - 2, 1, 4); F1.R(1, 1, 2, 6, 4);

      // The tabletop: pale planks lit from the upper left, an ink-edged rim, the slots.
      const top = flatCv(TL, TT, TW, TH, LIFT), g = top.getContext('2d');
      const P1 = Scene.pen(g, C, 0, 0, 1), WOOD = [4, 5, 6, 6];
      const wood = document.createElement('canvas');
      wood.width = TW * 2; wood.height = TH * 2;
      const wg = wood.getContext('2d'), W1 = Scene.pen(wg, C, 0, 0, 1), W2 = Scene.pen(wg, C, 0, 0, 2);
      for (let y = 0; y < TH * 2; y++) for (let x = 0; x < TW * 2; x++) W1.P(x, y, WOOD[Scene.lvl(0.95 - (x + y) / (TW * 2 + TH * 2) * 0.75, x, y)]);
      for (let y = 22; y < TH * 2; y += 24) { W1.R(4, y, TW * 2 - 8, 1, 3); W1.R(4, y + 1, TW * 2 - 8, 1, 6); } // plank seams, 2 px so they hold under the CRT
      for (let n = 0; n < 200; n++) { const s = Math.sin(n * 91.7) * 43758.5, x = Math.floor((s - Math.floor(s)) * (TW * 2 - 12)) + 6, y = (n * 37) % (TH * 2 - 8) + 4; W1.R(x, y, 3, 1, 4); } // grain
      W1.R(0, 0, TW * 2, 2, 1); W1.R(0, TH * 2 - 2, TW * 2, 2, 1); W1.R(0, 0, 2, TH * 2, 1); W1.R(TW * 2 - 2, 0, 2, TH * 2, 1);
      W1.R(2, 2, TW * 2 - 4, 4, 3); W1.R(2, TH * 2 - 6, TW * 2 - 4, 4, 2); W1.R(2, 2, 4, TH * 2 - 4, 3); W1.R(TW * 2 - 6, 2, 4, TH * 2 - 4, 2); W1.R(2, 2, TW * 2 - 4, 1, 6); W1.R(2, 2, 1, TH * 2 - 4, 6);
      for (let x = 16; x < TW * 2 - 16; x += 8) W1.R(x, MID * 2, 4, 2, 3);

      /* Every object on the table is drawn the same way: in whole scene px (4 map units, one canvas px
         each, scaled up crisp), with a 1 px ink outline traced round whatever it covers, as the
         creatures, the cards and your rival have. `inked` draws art (a pen in scene px) on a w x h canvas
         and adds that outline; leave a pixel free round the art for it. */
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
      // Lying on the wood (1 scene px = 2 canvas px of it): w x h of art with its top left at scene (x, y).
      wg.imageSmoothingEnabled = false;
      const onWood = (x, y, w, h, draw) => wg.drawImage(inked(w + 2, h + 2, (P) => draw(shift(P, 1, 1))), (x - 1) * 2, (y - 1) * 2, (w + 2) * 2, (h + 2) * 2);

      // The slots: a scene px line (dashed for traps), the slingshot fork marked in each creature slot.
      const slot = (P, x, y, w, h, k, dash) => {
        for (let i = 0; i < w; i++) if (!dash || i % 3 < 2) { P.P(x + i, y, k); P.P(x + i, y + h - 1, k); }
        for (let j = 0; j < h; j++) if (!dash || j % 3 < 2) { P.P(x, y + j, k); P.P(x + w - 1, y + j, k); }
      };
      const fork = (x, y) => { for (const [fx, fy] of [[0, 0], [4, 0], [0, 1], [4, 1], [1, 2], [2, 2], [3, 2], [2, 3], [2, 4]]) W2.P(x + fx, y + fy, 4); };
      for (let i = 0; i < 5; i++) for (const y of [DR, YR]) { slot(W2, SX(i), y, CW, CH, 3); fork(SX(i) + 5, y + 9); }
      for (let i = 0; i < 3; i++) for (const y of [DT, YT]) slot(W2, TRX(i), y, CW, CH, 3, true);
      // Things lying on the wood: a dagger at your right corner, a few loose bones, a spilled chip.
      onWood(128, 113, 17, 3, (P) => { P.P(0, 1, 8); P.R(1, 1, 3, 1, 3); P.R(4, 0, 1, 3, 3); P.R(5, 1, 11, 1, 7); P.P(16, 1, 7); });
      const bone = (x, y) => onWood(x, y, 7, 3, (P) => { P.R(1, 1, 5, 1, 7); for (const bx of [0, 6]) { P.P(bx, 0, 7); P.P(bx, 2, 7); } });
      bone(130, 59); bone(135, 63); bone(7, 86);
      onWood(127, 84, 4, 3, (P) => { P.R(0, 0, 4, 3, 8); P.P(0, 0, 7); P.P(2, 1, 6); });

      // Standees on the tabletop: w x h scene px of art standing with its feet at tabletop scene px (sx, sy),
      // lifted to the table's top. Returns paint(draw): redraws it, outlined. Its bottom row is its foot (draw it dark).
      const tx = (sx) => TL + sx * 4, td = (sy) => TT + sy * 4; // a tabletop scene px as plane x and depth
      const propCv = (sx, sy, w, h) => {
        const cv = document.createElement('canvas'), cg = cv.getContext('2d');
        cv.width = w + 2; cv.height = h + 1;
        sc.stand(cv, tx(sx - 1), td(sy), (w + 2) * 4, (h + 1) * 4);
        cv.style.transform = `translateZ(${LIFT}px) rotateX(-90deg)`;
        return (draw) => { cg.clearRect(0, 0, w + 2, h + 1); cg.drawImage(inked(w + 2, h + 1, (P) => draw(shift(P, 1, 1))), 0, 0); };
      };

      // Candles, the flame stepping between two shapes: a tall one at the back left, a short one on a skull at the back right.
      const candleArt = (P, f, h, skull) => {
        const fl = f ? [[5, 0], [5, 1], [6, 1], [4, 2], [5, 2], [6, 2], [5, 3], [5, 4]] : [[4, 0], [4, 1], [5, 1], [4, 2], [5, 2], [6, 2], [5, 3], [5, 4]];
        for (const [x, y] of fl) P.P(x, y, 8);
        P.P(5, 3, 7);
        const w1 = skull ? h - 9 : h - 3; // where the wax ends: on the skull, or in its holder
        P.R(3, 6, 4, w1 - 6, 6); P.R(3, 6, 1, w1 - 6, 7); P.R(6, 6, 1, w1 - 6, 5); P.P(5, 5, 1);
        P.R(2, 8, 1, 3, 6); P.R(7, 10, 1, 2, 5); // drips down its sides
        if (skull) { // lit from the upper left, dark sockets, a row of teeth
          P.R(2, h - 9, 6, 1, 7); P.R(1, h - 8, 8, 5, 7); P.R(2, h - 3, 6, 2, 7); P.R(6, h - 8, 2, 5, 6);
          P.R(2, h - 7, 2, 2, 1); P.R(6, h - 7, 2, 2, 1); P.P(4, h - 4, 2); P.P(3, h - 2, 1); P.P(5, h - 2, 1); P.R(2, h - 1, 6, 1, 1);
        } else { P.R(1, h - 3, 8, 2, 3); P.R(1, h - 3, 8, 1, 4); P.R(1, h - 1, 8, 1, 1); }
      };
      const candles = [[propCv(2, 18, 10, 31), 31, false], [propCv(136, 22, 10, 23), 23, true]];
      const candle = ([paint, h, skull], f) => paint((P) => candleArt(P, f, h, skull));

      // The piles: each a stack's edge standing at its front, its top card lying on the stack. Decks face down, graves face up.
      const penOf = (cv) => { const cg = cv.getContext('2d'); return { cg, P: Scene.pen(cg, C, 0, 0, 2) }; };
      const onTable = (x, depth, w, h) => { const cv = standCv(x, depth, w, h); cv.style.transform = `translateZ(${LIFT}px) rotateX(-90deg)`; return cv; };
      const pile = (sx, sy, layers, top) => {
        // The edge and both sides inked at their ends and foot; their top meets the top card's own ink edge.
        const edge = onTable(tx(sx), td(sy + CH), CW, layers), { P } = penOf(edge);
        for (let y = 0; y < layers; y++) { P.R(0, y, CW, 1, y % 2 ? 4 : 6); P.P(1, y, 7); P.P(0, y, 1); P.P(CW - 1, y, 1); }
        P.R(0, layers - 1, CW, 1, 1);
        // Its two sides, running back along the card's length: each stood up from its foot on the table and turned to face across.
        // The left one catches the light, the right one is in shade.
        for (const [ex, lit] of [[0, true], [CW, false]]) {
          const side = document.createElement('canvas'), { P: SP } = penOf(Object.assign(side, { width: CH * 2, height: layers * 2 }));
          for (let y = 0; y < layers; y++) { SP.R(0, y, CH, 1, lit ? (y % 2 ? 5 : 7) : (y % 2 ? 3 : 4)); SP.P(0, y, 1); SP.P(CH - 1, y, 1); }
          SP.R(0, layers - 1, CH, 1, 1);
          Object.assign(side.style, { position: 'absolute', left: tx(sx + ex) + 'px', top: td(sy) - layers * 4 + 'px', width: CH * 4 + 'px', height: layers * 4 + 'px',
            imageRendering: 'pixelated', transformOrigin: '0 100%', transform: `translateZ(${LIFT}px) rotateZ(90deg) rotateX(-90deg)` });
          pl.appendChild(side);
        }
        const lid = flatCv(tx(sx), td(sy), CW, CH, LIFT + layers * 4), lg = lid.getContext('2d');
        if (top == null) Scene.cardArt(Scene.pen(lg, C, 0, 0, 2), 0, 0); else face(lg, 0, 0, top);
      };
      pile(130, YR + 4, 5, null); pile(5, YR + 4, 2, 6); // yours: the deck right, the grave left
      pile(5, DR - 2, 4, null); pile(130, DR - 2, 3, 8);  // your rival's, mirrored

      // Your mana: a stack of tomes, a gem on top, each book's spine lit along its top, pages showing at its end.
      propCv(3, 110, 16, 10)((P) => {
        P.R(7, 0, 2, 1, 8); P.P(7, 0, 7);
        [[0, 1, 16, 4], [2, 4, 14, 3], [1, 7, 15, 2]].forEach(([x, y, w, k]) => { P.R(x, y, w, 2, k); P.R(x, y, w - 2, 1, k + 1); P.R(x + w - 2, y, 1, 2, 7); P.R(x, y + 2, w, 1, 1); });
        P.R(6, 1, 2, 2, 8);
      });
      // Your end-turn bell, at the left end of the middle line: gold, lit at its upper left, on a dark base.
      const bellPaint = propCv(6, MID + 4, 12, 9), bell = (s) => bellPaint((P) => {
        P.R(5 + s, 0, 2, 1, 2); P.R(3 + s, 1, 6, 1, 8); P.R(2 + s, 2, 8, 2, 8); P.R(1 + s, 4, 10, 2, 8); P.R(3 + s, 2, 2, 1, 7); P.P(2 + s, 3, 7);
        P.R(0, 6, 12, 2, 3); P.R(0, 6, 12, 1, 4); P.R(0, 8, 12, 1, 1);
      });

      // Life: a stack of chips each, a chip for every 4 life, at your right hand and your rival's left. A hit knocks one off.
      const chipStack = (paint) => (n) => paint((P) => {
        for (let i = 0; i < n; i++) { const y = 9 - i * 2; P.R(0, y, 10, 1, i % 2 ? 6 : 8); P.P(0, y, 7); P.P(5, y, i % 2 ? 8 : 6); P.R(0, y + 1, 10, 1, 1); }
      });
      const yourLife = chipStack(propCv(126, 102, 10, 11)), theirLife = chipStack(propCv(14, 26, 10, 11));
      yourLife(5);

      // Your rival, sitting across the table: their portrait, big, sunk so the tabletop hides them below the chest.
      // 12 map units a pixel (3 scene px), a whole number of the table's pixels, so theirs stay even.
      const RS = 12, rival = outlined(RIVAL), rivalEl = sc.stand(rival, 720 - 9 * RS, TT - 6, 18 * RS, rival.height * RS);
      const seat = (lean, bob) => { rivalEl.style.transform = `translateZ(${LIFT - 70 + bob}px) rotateX(${-90 + lean}deg)`; };

      // The creatures: each card's art stood up on it, rising out of the card RISE steps, bobbing a step while it waits.
      const CS = 4; // map units a creature pixel: one scene px, as everything else on the table
      const creature = (sx, sy, n, flip) => {
        const src = outlined(sprite(n), flip), cv = document.createElement('canvas'), W = src.width, H = src.height;
        cv.width = W; cv.height = H;
        const el = sc.stand(document.createElement('div'), tx(sx - 1), td(sy + 12), W * CS, H * CS); // 18 px over a 15 px card: centered, on the table's pixel grid
        el.appendChild(cv);
        el.classList.add('bob'); // .bw-st.bob: the run map's stepped idle bob
        let shown = -1;
        const rise = (k) => { // k of RISE steps out: its top k/RISE showing, stood on the card's art frame
          if (k === shown) return;
          shown = k;
          const cg = cv.getContext('2d'), rows = Math.round(H * k / RISE);
          cg.clearRect(0, 0, W, H);
          if (rows) cg.drawImage(src, 0, 0, W, rows, 0, H - rows, W, rows);
          el.style.display = k ? '' : 'none';
        };
        const place = (dy = 0, dx = 0, z = 0) => { el.style.transform = `translate(${dx}px, ${dy}px) translateZ(${LIFT + 1 + z}px) rotateX(-90deg)`; };
        place();
        return { rise, place, sx, sy, n };
      };
      const mine = Object.entries(YOURS).map(([i, n]) => creature(SX(+i), YR, n, false));
      const theirs = Object.entries(THEIRS).map(([i, n]) => creature(SX(+i), DR, n, true));
      const played = creature(SX(3), YR, PLAYED, false), dealt = creature(SX(4), DR, DEALT, true);
      const [, attacker] = mine, [, struck] = theirs;
      // A dithered contact shadow on a card, under its creature's feet.
      const shadow = (sx, sy) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 18; x++) { const X = sx * 2 + 6 + x, Y = sy * 2 + 21 + y, e = ((x - 8.5) / 9) ** 2 + ((y - 1.5) / 2) ** 2; if (e < 1 && Scene.bay(X, Y) < 8) P1.P(X, Y, 4); } };

      // Your hand: HTML over the stage in the game (cardEl); here pixel faces in an overlay along its foot.
      const hand = document.createElement('div');
      Object.assign(hand.style, { position: 'absolute', left: '50%', bottom: '0', width: '0', height: '0', pointerEvents: 'none' });
      stage.appendChild(hand);
      const HK = 5, hs = 5, held = [];
      for (let i = 0; i < HK; i++) {
        const cv = document.createElement('canvas');
        cv.width = CW * 2; cv.height = CH * 2; face(cv.getContext('2d'), 0, 0, 10 + i);
        Object.assign(cv.style, { position: 'absolute', left: (i - 2) * 64 - CW * hs / 2 + 'px', top: '0', width: CW * hs + 'px', height: CH * hs + 'px', imageRendering: 'pixelated', transformOrigin: '50% 100%' });
        hand.appendChild(cv); held.push(cv);
      }

      let lastKey = '';
      return (S) => {
        const { cam, shot, f } = S;
        pl.style.transform = `translateY(${cam.ty}px) translateZ(${cam.tz}px) rotateX(${cam.rx}deg) translate(${cam.cx}px, ${cam.cy}px)`;
        held.forEach((cv, i) => {
          const lift = shot === 'hand' && i === 2 ? Scene.cl(f - 3, 0, 2) * 10 : 0;
          cv.style.transform = `translateY(${Math.abs(i - 2) * 8 - CH * hs + 14 + cam.hand - lift}px) rotate(${(i - 2) * 5}deg)`;
        });

        const key = shot + f;
        if (key === lastKey) return;
        lastKey = key;
        const fighting = shot === 'combat', theirTurn = shot === 'dealer';
        candles.forEach((c, i) => candle(c, (Math.floor(f / 2) + i) % 2));
        bell(theirTurn && f < 4 ? [1, -1, 1, 0][f] : 0); // you rang it: their turn
        // They lean in to deal (a step at a time), and sit back; otherwise they breathe, a step up and down.
        seat(theirTurn ? [0, 4, 8, 8, 8, 8, 8, 8, 8, 8, 4][f] ?? 0 : 0, Math.floor(S.t * 1.5) % 2 * 4);
        theirLife(fighting && f >= 10 || theirTurn ? 4 : 5);

        // The table and the cards on it; a card whose creature is out shows an empty frame.
        g.drawImage(wood, 0, 0);
        const card = (c, k, dx = 0) => { face(g, c.sx + dx, c.sy, c.n, k >= RISE); if (k >= RISE) shadow(c.sx + dx, c.sy); c.rise(k); };
        const hit = fighting && f >= 10, shake = fighting && (f === 10 || f === 11) ? (f === 10 ? -1 : 1) : 0;
        theirs.forEach((c) => card(c, RISE, c === struck ? shake : 0));
        mine.forEach((c) => card(c, RISE));
        Scene.cardArt(Scene.pen(g, C, 0, 0, 2), TRX(1), DT); Scene.cardArt(Scene.pen(g, C, 0, 0, 2), TRX(0), YT);
        // A card you play: its slot marked in the accent, the card goes down, then its creature rises out (and stays for the later shots).
        if (shot === 'hand') played.rise(0);
        else if (shot === 'board' && f < 9) { slot(Scene.pen(g, C, 0, 0, 2), SX(3), YR, CW, CH, 8); played.rise(0); }
        else card(played, shot === 'board' ? Scene.cl(f - 9, 0, RISE) : RISE);
        // Their card slides out from their side into the far right slot, a step at a time, then its creature rises.
        if (theirTurn && f >= 4) { const y = Math.min(DR, 2 + (f - 4) * 6); if (y < DR) { face(g, SX(4), y, DEALT); dealt.rise(0); } else card(dealt, Scene.cl(f - 9, 0, RISE)); } else dealt.rise(0);
        // The fight: yours hops at theirs in steps and back; theirs reels as it's hit.
        const D = [0, 0, 0, 0, 0, 0, -40, -80, -104, -104, -104, -104, -70, -35, 0], Z = [0, 0, 0, 0, 0, 0, 12, 20, 8, 0, 0, 0, 12, 8, 0];
        attacker.place(fighting ? D[f] ?? 0 : 0, 0, fighting ? Z[f] ?? 0 : 0);
        struck.place(0, shake * 6, 0);
        if (hit) Scene.pen(g, C, 0, 0, 2).R(SX(2) + 10, DR + 18, 3, 2, 8); // the struck card's health in the accent
      };
    },
  });
})();
