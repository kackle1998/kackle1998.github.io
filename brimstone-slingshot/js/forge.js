'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the Crystal Forge (a ? stop event, see Run.forge in js/run.js).
   The demonic factory (js/factory.js), as in the Rune Circle. Your figurine lands beside a card
   on a cradle at the front (a card back standing in for the one you pick). PAY 2 ARCANA lowers a chain from
   the gantry; it hooks the card, lifts it and drags it backward across the floor to the factory's
   lava river, and dips it in. It comes up lit and steaming, is dragged back to its cradle and set down,
   it turns face up, and +1 attack and +1 health chips pop over it.
   Built on the scene kit (js/scene.js): only the card's standee, the chain, the quench and the
   timeline are its own. The card is a standee like your figurine, so it can move in depth.
   Scene px: everything is laid out in scene pixels of 4 map units, x across, y down from the top
   of a standee to the ground it stands on.
   ============================================================ */

const Forge = (() => {
  const { mx, GY, D_ACT } = Factory, U = 4;
  const D_FIG = 336, D_FRONT = 352;       // depths (plane y): you, the plane in front of you (pips, chips)
  const AX0 = -12, AW = 174;              // the upright planes' left edge and width (scene px), from the sky (y 0) to GY
  const FX = 44, CXC = 140;               // where you stand; the card's middle (scene x), on its cradle and all the way back
  const D_CR = D_ACT + 2, D_RIV = -40;    // depths: the cradle, the middle of the lava river (the river is Factory's: plane y -90..10)
  const CW = 36, CH = 96, LIP = CH - 3;   // the card's standee: scene px wide and tall; the lava's surface line on it
  // The entrance, in scene px (x 4 for map units): the tail of the map's lob, in from the left.
  const LAND = { across: 150, back: 10, high: 60, ms: 700 };
  const CAM = { rows: 700, top: 178 };    // the camera (Scene.mount), as the Rune Circle's
  const { cl } = Scene;
  const lerp = (a, b, e) => a + (b - a) * e, ease = (e) => e * e * (3 - 2 * e);
  const REST = 5, LIFT = 13, HOVER = 15, SUNK = -24, TOP = Scene.CARD.H; // heights (scene px): the card's foot on the cradle, lifted, over the river, under it; its height

  /* ---------- the timeline ---------- */
  /* What the scene shows at time t (seconds): the entrance runs 0..LANDED, you wait at REST, and
     PAY 2 ARCANA plays START..END. Poses step (7 a second); flights move smoothly.
     { fx, feet, depth, rot, sx, sy: you, as the other scenes; pips: [{ x, y }] arcana in flight;
       c: { depth: where the card stands (plane y), h: its foot above the ground (below 0 it is
       in the lava), hot: lit from the lava, w: its width (CARD.TURN), face: face up }, hook: the chain's bottom, 0 the top of the standee,
       or null, splash: seconds since it went in or came out, bubbles: a pop frame while it is
       under, atk, hp: the chips' rise (0..3) } */
  const LANDED = LAND.ms / 1000 + Scene.SQUASH.ms / 1000, START = 1;
  const T_PAY = 1.6, T_HOOK = 2.3, T_LIFT = 2.9, T_PULL = 3.3, T_LOWER = 4.5, T_UNDER = 5.1, T_RISE = 5.6, T_BACK = 6.2, T_SET = 7.4, T_DOWN = 7.8, T_FLIP = 7.8, T_ATK = 8.7, T_HP = 9, T_UNHOOK = 9.2, END = 10;
  const T_IN = T_LOWER + HOVER / (HOVER - SUNK) * (T_UNDER - T_LOWER);          // the feet touch the lava going down
  const T_OUT = T_RISE + (T_BACK - T_RISE) * -SUNK / (HOVER - SUNK);             // ...and leave it coming up
  const HEAD = (h) => CH + Math.max(0, -h) - TOP - 2;                           // the hook's bottom on the standee, for feet at height h
  function at(t) {
    const S = { fx: FX, feet: GY, depth: D_FIG, rot: 0, sx: 1, sy: 1, pips: [], c: { depth: D_CR, h: REST, hot: false, w: Scene.CARD.W, face: false }, hook: null, splash: -1, bubbles: -1, atk: 0, hp: 0 };
    if (t < LANDED) {
      const L = Scene.land(cl(t * 1000 / LAND.ms), LAND.high * U);
      S.fx = FX - LAND.across * L.k;
      S.depth = D_FIG - LAND.back * U * L.k;
      S.feet = GY - L.z / U;
      S.rot = L.rot;
      if (!L.k) { S.sx = Scene.SQUASH.sx; S.sy = Scene.SQUASH.sy; }
    }
    for (let i = 0; i < 2; i++) { // two arcana run from your chest to the card
      const age = t - (T_PAY + i * 0.2);
      if (age >= 0 && age < 0.4) { const e = age / 0.4; S.pips.push({ x: lerp(FX, CXC, e), y: lerp(GY - 9, GY - 16, e) - Math.sin(e * Math.PI) * 8 }); }
      if (age >= 0 && age < 0.1) { S.sx = 0.9; S.sy = 1.08; }
    }
    const c = S.c, seg = (a, b) => cl((t - a) / (b - a));
    if (t >= T_LIFT) c.h = REST + Math.floor(seg(T_LIFT, T_PULL) * 7) / 7 * (LIFT - REST);              // up in steps
    if (t >= T_PULL) { const e = ease(seg(T_PULL, T_LOWER)); c.depth = lerp(D_CR, D_RIV, e); c.h = LIFT + (HOVER - LIFT) * e + Math.sin(e * Math.PI) * 4; } // dragged back, a little swing
    if (t >= T_LOWER) { c.depth = D_RIV; c.h = lerp(HOVER, SUNK, seg(T_LOWER, T_UNDER)); }               // down into the lava
    if (t >= T_UNDER) c.h = SUNK;
    if (t >= T_RISE) c.h = lerp(SUNK, HOVER, seg(T_RISE, T_BACK));                                       // back up
    if (t >= T_BACK) { const e = ease(seg(T_BACK, T_SET)); c.depth = lerp(D_RIV, D_CR, e); c.h = lerp(HOVER, LIFT, e) + Math.sin(e * Math.PI) * 4; }
    if (t >= T_SET) c.h = lerp(LIFT, REST, seg(T_SET, T_DOWN));
    c.hot = t >= T_RISE && t < T_DOWN;
    const k = t >= T_FLIP ? Math.floor((t - T_FLIP) * 7) : -1; // the turn: narrowing as a back, opening as a face, in steps
    if (k >= 0) { c.w = k < 3 ? Scene.CARD.TURN[k] : k < 6 ? Scene.CARD.TURN[5 - k] : Scene.CARD.W; c.face = k >= 3; }
    if (t >= T_HOOK) {
      const drop = Math.floor(seg(T_HOOK, T_HOOK + 0.6) * 6) / 6;
      S.hook = t < T_HOOK + 0.6 ? lerp(-8, HEAD(REST), drop) : HEAD(c.h);
      if (t >= T_UNHOOK) S.hook = lerp(HEAD(REST), -8, Math.floor(seg(T_UNHOOK, END) * 6) / 6);
    }
    S.splash = t >= T_IN && t - T_IN < 3 / 7 ? t - T_IN : t >= T_OUT && t - T_OUT < 3 / 7 ? t - T_OUT : -1;
    S.bubbles = t >= T_UNDER && t < T_RISE ? Math.floor((t - T_UNDER) * 7) % 3 : -1;
    S.atk = t >= T_ATK ? cl(Math.floor((t - T_ATK) * 7), 0, 3) : 0;
    S.hp = t >= T_HP ? cl(Math.floor((t - T_HP) * 7), 0, 3) : 0;
    return S;
  }
  // Sounds on the way: [time, name, n]. ENTER_CUES for the entrance, CUES for the quench.
  const ENTER_CUES = [[LAND.ms / 1000, 'land']];
  const CUES = [[T_PAY, 'place'], [T_PAY + 0.2, 'place'], [T_HOOK, 'twang'], [T_LIFT, 'place'], [T_PULL, 'twang'], [T_IN, 'poof'], [T_OUT, 'poof'], [T_RISE, 'spell'], [T_SET, 'place'], [T_ATK, 'heal'], [T_HP, 'heal']];

  /* ---------- the art (scene px) ---------- */
  // A stat chip, 9 x 9: a sword (attack) or a heart (health) in the accent on paper.
  const SWORD = ['....#....', '....#....', '....#....', '....#....', '..#####..', '....#....', '....#....'], HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  function statChip({ R }, cx, y, kind) {
    R(cx - 4, y, 9, 9, 1); R(cx - 3, y + 1, 7, 7, 6); R(cx - 3, y + 1, 1, 7, 7);
    const g = kind ? HEART : SWORD, ox = cx - (g[0].length >> 1), oy = y + (kind ? 2 : 1);
    g.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') R(ox + i, oy + j, 1, 1, 8); }));
  }
  // The chain from the top of the standee down to y (the clasp's bottom).
  function chain({ R }, x, y) {
    if (y <= 0) return;
    R(x - 1, 0, 2, y - 3, 1);
    for (let v = 1; v < y - 3; v += 3) R(x - 1, v, 2, 1, 4);
    R(x - 4, y - 3, 8, 3, 1); R(x - 3, y - 2, 6, 1, 3); R(x - 4, y - 3, 8, 1, 4);
  }
  // The lava's surface across the front of what is sunk in the river, and the pops on it.
  function lip({ R, P }, t, bubbles) {
    const st = Math.floor(t * 7), x0 = CW / 2 - 14, x1 = CW / 2 + 14;
    R(x0, LIP, x1 - x0, 3, 8);
    for (let x = x0 + 2; x < x1 - 2; x += 6) if ((Math.floor((x - x0) / 6) + st) % 3 === 0) R(x, LIP + 1, 3, 1, 7);
    R(x0, LIP - 1, x1 - x0, 1, 1);
    if (bubbles >= 0) for (const [dx, dy] of [[[-9, 0], [4, 1], [10, 0]], [[-3, 1], [7, 0], [-10, 1]], [[1, 0], [-6, 1], [11, 1]]][bubbles]) { P(CW / 2 + dx, LIP - 2 - dy, 7); P(CW / 2 + dx + 1, LIP - 2 - dy, 7); P(CW / 2 + dx, LIP - 1 - dy, 8); }
  }
  function splash({ P }, dt) {
    if (dt < 0) return;
    const D = [[[-4, -2], [4, -2], [-2, -4], [2, -4]], [[-7, -4], [7, -4], [-3, -7], [3, -7]], [[-9, -1], [9, -1], [-4, -5], [4, -5]]][Math.floor(dt * 7)];
    for (const [dx, dy] of D) { P(CW / 2 + dx, LIP + dy, 7); P(CW / 2 + dx, LIP + dy + 1, 8); }
  }
  // Steam rising off a lit card, and lava dripping from it, in steps.
  function steam({ P }, x, feet, t) {
    const st = Math.floor(t * 7);
    for (let i = 0; i < 4; i++) { const ph = (st + i * 2) % 8; P(x - 6 + i * 4 + (ph % 3 === 1 ? 1 : 0), feet - TOP - 2 - ph, 7); }
    for (let d = 0; d < 2; d++) { const ph = (st + d * 2) % 4; P(x - 3 + d * 6, feet + 1 + ph * 2, 8); P(x - 3 + d * 6, feet + 2 + ph * 2, 4); }
  }

  /* ---------- the stage ---------- */
  /* Build the scene in `stage` with the factory's heat (0..2, RunMap.SPIRE_ANTES). Returns
     draw(state) for at(t)'s states, with draw.alive(). The card and the chips keep stepping between draws, on a timer. */
  function mount(stage, heat) {
    const sc = Scene.mount(stage, CAM);
    const gnd = Factory.build(sc, heat, {
      rubble: [[250, 450, 3], [1010, 400, 2]], shards: [[330, 454], [1000, 470]],
      shadows: [[mx(CXC - 11), D_ACT - 6, mx(CXC + 11), D_ACT + 12]], over: { x0: 260, y0: 280, w: 460, h: 130 },
    });
    const act = Scene.plane(sc, { left: mx(AX0), x0: AX0, depth: D_ACT, w: AW, h: GY });
    // The card: a standee that moves in depth like you do.
    const cv = document.createElement('canvas'), el = sc.stand(cv, 0, 0, CW * U, CH * U);
    cv.width = CW; cv.height = CH;
    const cp = Scene.pen(cv.getContext('2d'), sc.C), cg = cv.getContext('2d');
    const fig = Scene.figure(sc, { s: U });
    const front = Scene.plane(sc, { left: mx(AX0), x0: AX0, depth: D_FRONT, w: AW, h: GY });
    let last = at(START), shadowKey = '';
    const paint = () => {
      const S = last, now = performance.now() / 1000, c = S.c, sink = Math.max(0, -c.h), feet = CH + sink, { R } = cp;
      act.clear(); front.clear(); cg.clearRect(0, 0, CW, CH);
      const A = act.p;
      A.R(CXC - 11, GY - REST, 22, REST, 1); A.R(CXC - 10, GY - REST + 1, 20, REST - 2, 3); A.R(CXC - 10, GY - REST + 1, 20, 1, 5); A.R(CXC - 3, GY - 3, 6, 1, 8); // the cradle
      if (S.hook != null) chain(cp, CW / 2, Math.round(S.hook));
      if (c.face) Factory.cardFace(cp, CW / 2 - 7, feet - TOP, c.w); else Scene.cardArt(cp, CW / 2 - 7, feet - TOP, c.hot, c.w);
      if (c.hot) steam(cp, CW / 2, feet, now);
      if (c.depth < 20 && (c.h < 6 || S.splash >= 0)) lip(cp, now, S.bubbles);
      splash(cp, S.splash);
      el.style.left = mx(CXC) - CW * U / 2 + 'px';
      el.style.top = c.depth - CH * U + 'px';
      el.style.transform = `translateZ(${Math.round(Math.max(0, c.h) * U / 4) * 4}px) rotateX(-90deg)`;
      for (const p of S.pips) { front.p.R(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3, 1); front.p.R(Math.round(p.x), Math.round(p.y), 1, 1, 8); }
      const bob = Math.floor(now * 3) % 2, y0 = GY - REST - TOP - 4;
      if (S.atk) statChip(front.p, CXC - 6, y0 - S.atk * 4 - (S.atk === 3 ? bob : 0), 0);
      if (S.hp) statChip(front.p, CXC + 6, y0 - S.hp * 4 - (S.hp === 3 ? bob : 0), 1);
    };
    sc.every(60, paint);

    function draw(S) {
      if (!sc.alive()) return;
      last = S;
      const z = (GY - S.feet) * U, near = S.c.depth > 290, k = [Math.round(S.fx), Math.round(S.depth), Math.round(z / 16), near ? Math.round(S.c.depth / 8) : 'x', Math.round(S.c.h / 4)].join();
      if (k !== shadowKey) {
        shadowKey = k;
        gnd.clear();
        const r = Math.max(2.5, 6 - z / 80);
        gnd.shade(mx(S.fx) + 4, S.depth + 2, r * 1.3, r * 0.5);
        if (near) gnd.shade(mx(CXC) + 4, S.c.depth + 2, Math.max(3, 8 - Math.max(0, S.c.h - REST) * 0.3), 2.4);
      }
      paint();
      fig.place({ x: mx(S.fx), y: S.depth, z, rot: S.rot, sx: S.sx, sy: S.sy });
    }
    draw.alive = sc.alive;
    return draw;
  }

  return { mount, at, LANDED, REST: START, END, ENTER_CUES, CUES, CAM };
})();
