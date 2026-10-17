'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the Rune Circle (a ? stop event) and the Sigil Altar (a stop), see
   Run.rune in js/run.js. One scene in two looks (LOOKS below): the Rune Circle stands in a
   demonic factory (js/factory.js) and costs 3 life; the Altar stands in a graveyard (Scene.setting)
   and costs the card the sigil comes from, which falls away once the copy has landed.
   A rune circle turns in the floor. Your figurine lands in
   the middle of it on the tail of the map's lob, between two empty plinths. Once you've picked
   whose sigil to copy and who gets it, Run stands your two real cards on them (HTML over the
   stage) and the first wears a sigil chip. The circle spins up: three life pips drop into it, a
   copy of the chip lifts off the first card, flies across and stamps onto the other card.
   The circle's mark is the arcana symbol.
   Built on the scene kit (js/scene.js): only the circle, the chip's flight and the timeline are its own.
   Scene px: everything is laid out on upright planes in scene pixels of 4 map units, x across and
   y down from the sky to the ground at GY.
   ============================================================ */

/* look: { CAM (Scene.mount), D_ACT, D_FIG, D_FRONT: depths (plane y) of the plinths, you in the
   circle and the plane in front of you (pips, the chip's flight), pay: life pips drop into the
   circle, consume: the giver falls away, build(sc, heat, opts): the place, returning its ground } */
const sigilScene = (look) => {
  const { mx, GY } = Factory, U = 4;
  const { CAM, D_ACT, D_FIG, D_FRONT } = look;
  const AX0 = -12, AW = 174;             // the upright planes' left edge and width (scene px), from the sky (y 0) to GY
  const FX = 75, CA = 26, CB = 114;      // where you stand, and the two plinths' left edges (scene x): your cards stand on them
  const PH = 4, MID_A = CA + 7, MID_B = CB + 7; // the plinths' height; their middles
  // The entrance, in scene px (x 4 for map units): the tail of the map's lob, in from the left.
  const LAND = { across: 150, back: 10, high: 60, ms: 700 };
  // Where the stage's edge falls in scene x (Scene.span, measured by mount), so the lob starts off screen at any stage size.
  let EDGE = Infinity;
  const RR = 56, RC = 66, RX = mx(FX) - RC * 2, RY = D_FIG - RC * 2; // the circle's radius, its canvas middle and its plane corner
  const { cl } = Scene;
  const lerp = (a, b, e) => a + (b - a) * e, ease = (e) => e * e * (3 - 2 * e);

  /* ---------- the timeline ---------- */
  /* What the scene shows at time t (seconds): the entrance runs 0..LANDED, you wait at REST, and
     PAY 3 LIFE plays REST..END. Poses step (the turning chip at 8 a second); flights move smoothly.
     { fx, feet: scene x and y of your feet, depth: plane y you stand at, rot: quarter turns,
       sx, sy: squash, pips: [{ x, y }] life pips in flight, pulse: the circle flares, fast: it
       spins up, flashA, flashB: a card lit (Run lights the real one), badgeB: the copy has landed,
       gone: the giver has fallen away (Run narrows the real one out),
       chip: { x, y, w } the turning chip in flight or null, trail: [{ x, y, k }] } */
  const LANDED = LAND.ms / 1000 + Scene.SQUASH.ms / 1000, REST = 1;
  const T_PAY = 1.7, T_COPY = 3, T_FLY = 3.9, T_ABS = 4.9, T_GONE = 5.5, END = 6.6;
  /* top: the cards' top in scene px (draw.cards reports it), so the copy comes to rest over the second one. */
  function at(t, top = GY - PH - Scene.CARD.H) {
    const CHIP_B = { x: MID_B, y: top - 12 };
    const S = { fx: FX, feet: GY, depth: D_FIG, rot: 0, sx: 1, sy: 1, pips: [], pulse: 0, fast: t >= T_COPY && t < T_ABS, chip: null, trail: [] };
    if (t < LANDED) {
      const L = Scene.land(cl(t * 1000 / LAND.ms), LAND.high * U);
      S.fx = FX - Math.max(LAND.across, FX - EDGE) * L.k;
      S.depth = D_FIG - LAND.back * U * L.k;
      S.feet = GY - L.z / U;
      S.rot = L.rot;
      if (!L.k) { S.sx = Scene.SQUASH.sx; S.sy = Scene.SQUASH.sy; }
    }
    if (look.pay) for (let i = 0; i < 3; i++) { // three life pips fall from your chest into the circle
      const age = t - (T_PAY + i * 0.2);
      if (age >= 0 && age < 0.3) { const e = age / 0.3; S.pips.push({ x: FX + (i - 1) * 8 * e, y: lerp(GY - 9, GY + 1, e * e) - Math.sin(e * Math.PI) * 5 }); }
      if (age >= 0 && age < 0.1) { S.sx = 0.9; S.sy = 1.08; }
      if (age >= 0.3 && age < 0.5) S.pulse = 1;
    }
    if (t >= T_COPY - 0.3 && t < T_COPY) S.pulse = 1;
    S.flashA = t >= T_COPY - 0.3 && t < T_COPY - 0.1;
    const turn = [9, 5, 3, 5][Math.floor(t * 8) % 4], y0 = top - 11 - 9; // where the lift ends and the flight starts
    const flight = (e) => ({ x: lerp(MID_A, MID_B, e), y: lerp(y0, CHIP_B.y, e) - Math.sin(e * Math.PI) * 8 });
    if (t >= T_COPY && t < T_FLY) S.chip = { x: MID_A, y: top - 11 - Math.floor((t - T_COPY) / (T_FLY - T_COPY) * 4) * 3, w: turn }; // the copy lifts off the giver's chip in steps
    else if (t >= T_FLY && t < T_ABS) {
      S.chip = { ...flight(ease((t - T_FLY) / (T_ABS - T_FLY))), w: turn };
      for (let i = 1; i <= 3; i++) { const p = flight(ease(cl((t - 0.09 * i - T_FLY) / (T_ABS - T_FLY)))); S.trail.push({ x: p.x, y: p.y + 4, k: i === 1 ? 7 : i === 2 ? 8 : 6 }); }
    }
    S.flashB = t >= T_ABS && t < T_ABS + 0.2;
    S.badgeB = t >= T_ABS;
    S.gone = look.consume && t >= T_GONE;
    return S;
  }
  // Sounds on the way: [time, name, n]. ENTER_CUES for the entrance, CUES for the copy.
  const ENTER_CUES = [[LAND.ms / 1000, 'land']];
  const CUES = [...(look.pay ? [[T_PAY, 'place'], [T_PAY + 0.2, 'place'], [T_PAY + 0.4, 'place']] : []), [T_COPY, 'spell'], [T_FLY, 'twang'], [T_ABS, 'poof'], ...(look.consume ? [[T_GONE, 'die']] : [])];

  /* ---------- the stage ---------- */
  /* Build the scene in `stage` with the place's heat (0..2, RunMap.SPIRE_ANTES). Returns
     draw(state) for at(t)'s states, with draw.alive(), draw.toStage(x, y) (a scene point on the
     plinths' plane, in stage px) and draw.cards(top): your real cards (placed over the stage by
     Run) now stand on the plinths with their top at scene y `top` (null: they're gone), so the
     sigil chips sit over them. The circle keeps turning between draws, on its own timer. */
  function mount(stage, heat) {
    const sc = Scene.mount(stage, CAM);
    EDGE = (Scene.span(sc, D_FIG, LAND.high * U)[0] - 720) / U + 75 - 24;
    const gnd = look.build(sc, heat, {
      shadows: [[mx(CA) - 8, D_ACT - 6, mx(CA + 14) + 8, D_ACT + 12], [mx(CB) - 8, D_ACT - 6, mx(CB + 14) + 8, D_ACT + 12]],
      over: { x0: 260, y0: 280, w: 460, h: 130 },
    });
    // The circle: a flat canvas on the floor, redrawn when a mark steps round or it flares.
    const ring = Factory.flat(sc, RX, RY, RC * 2, RC * 2, 0.6), rg = ring.getContext('2d'), rp = Scene.pen(rg, sc.C);
    const SYM = ICONS.arcana, CELL = 7, SX = Math.round(RC - SYM[0].length * CELL / 2), SY = Math.round(RC - SYM.length * CELL / 2);
    let key = '';
    const paintRing = (spin, pulse) => {
      if (key === spin + ':' + pulse) return;
      key = spin + ':' + pulse;
      rg.clearRect(0, 0, RC * 2, RC * 2);
      const { R } = rp, k1 = pulse ? 7 : 8;
      for (let y = -RR; y <= RR; y++) { const half = Math.round(RR * Math.sqrt(1 - (y / RR) ** 2)); Factory.dfill(rg, sc.C, RC - half, RC + y, half * 2, 1, 3, 2, 6); }
      const circ = (r, w, k) => { for (let a = 0; a < Math.PI * 2; a += 1 / r) R(RC + Math.cos(a) * r - (w >> 1), RC + Math.sin(a) * r - (w >> 1), w, w, k); };
      circ(RR + 1, 4, 1); circ(RR, 2, k1); circ(RR - 14, 4, 1); circ(RR - 14, 2, k1);
      for (let i = 0; i < 10; i++) { // the rune marks between the rings
        const a = (i * 36 + spin * 9) * Math.PI / 180, x = RC + Math.cos(a) * (RR - 7), y = RC + Math.sin(a) * (RR - 7);
        R(x - 3, y - 3, 7, 7, 1); R(x - 2, y - 2, 5, 5, 6); R(x - 1, y - 2 + (i % 3), 1, 4, k1); R(x + 1, y - 1, 1, 3 - (i % 2), 8);
      }
      // The arcana symbol in the middle: an ink edge, then its cells.
      for (const pass of [0, 1]) SYM.forEach((row, j) => [...row].forEach((ch, i) => {
        if (ch !== '#') return;
        if (!pass) R(SX + i * CELL - 1, SY + j * CELL - 1, CELL + 2, CELL + 2, 1);
        else { R(SX + i * CELL, SY + j * CELL, CELL, CELL, k1); R(SX + i * CELL, SY + j * CELL, CELL, 1, 7); }
      }));
    };
    const act = Scene.plane(sc, { left: mx(AX0), x0: AX0, depth: D_ACT, w: AW, h: GY });
    const fig = Scene.figure(sc, { s: U });
    const front = Scene.plane(sc, { left: mx(AX0), x0: AX0, depth: D_FRONT, w: AW, h: GY });
    let spin = 0, st = -1, last = at(REST), shadowKey = '', top = null;
    const paint = () => {
      const S = last, bob = Math.floor(performance.now() / 333) % 2; // the badges bob 3 a second
      paintRing(spin, S.pulse);
      act.clear(); front.clear();
      for (const x of [MID_A, MID_B]) { // the plinths: an ink edge, lit from the upper left
        act.p.R(x - 10, GY - PH, 20, PH, 1); act.p.R(x - 9, GY - PH + 1, 18, PH - 1, 3); act.p.R(x - 9, GY - PH + 1, 18, 1, 5); act.p.R(x + 6, GY - PH + 1, 3, PH - 1, 2);
      }
      if (top != null) {
        if (!S.gone) Factory.chip(act.p, MID_A, Math.round(top) - 11 - bob, 9);
        if (S.badgeB) Factory.chip(act.p, MID_B, Math.round(top) - 12 - bob, 9);
      }
      for (const p of S.pips) { front.p.R(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3, 1); front.p.R(Math.round(p.x), Math.round(p.y), 1, 1, 8); }
      for (const q of S.trail) front.p.R(Math.round(q.x), Math.round(q.y), 2, 2, q.k);
      if (S.chip) Factory.chip(front.p, Math.round(S.chip.x), Math.round(S.chip.y), S.chip.w);
    };
    sc.every(60, () => { // the marks step round 4 a second (8 while it spins up), whether or not anything is playing
      const n = Math.floor(performance.now() / 250);
      if (n === st) return;
      spin += last.fast ? 2 : 1;
      st = n;
      paint();
    });

    function draw(S) {
      if (!sc.alive()) return;
      last = S;
      const z = (GY - S.feet) * U, k = [Math.round(S.fx), Math.round(S.depth), Math.round(z / 16)].join();
      if (k !== shadowKey) {
        shadowKey = k;
        gnd.clear();
        const r = Math.max(2.5, 6 - z / 80);
        gnd.shade(mx(S.fx) + 4, S.depth + 2, r * 1.3, r * 0.5);
        gnd.shade(mx(CA + 7) + 4, D_ACT + 2, 8, 2.4);
        gnd.shade(mx(CB + 7) + 4, D_ACT + 2, 8, 2.4);
      }
      paint();
      fig.place({ x: mx(S.fx), y: S.depth, z, rot: S.rot, sx: S.sx, sy: S.sy });
    }
    draw.alive = sc.alive;
    // The plane is tilted, so a straight read across its box drifts: stand a 1 px marker at the
    // point instead and read where the camera puts it.
    draw.toStage = (x, y) => {
      const m = sc.stand(document.createElement('div'), mx(x), D_ACT, 1, 1);
      m.style.transform = `translateZ(${(GY - y) * U}px) rotateX(-90deg)`;
      const s = stage.getBoundingClientRect(), r = m.getBoundingClientRect(), z = s.width / stage.offsetWidth;
      m.remove();
      return [(r.left + r.width / 2 - s.left) / z - stage.clientLeft, (r.top + r.height / 2 - s.top) / z - stage.clientTop];
    };
    draw.cards = (t) => { top = t; paint(); };
    return draw;
  }

  return { mount, at, LANDED, REST, END, ENTER_CUES, CUES, CAM, GY, PH, MID_A, MID_B };
};

const LOOKS = {
  // The Rune Circle: the factory, framed wide enough for the reservoir behind.
  factory: { CAM: { rows: 700, top: 178 }, D_ACT: Factory.D_ACT, D_FIG: 290, D_FRONT: 340, pay: true, consume: false,
    build: (sc, heat, o) => Factory.build(sc, heat, { rubble: [[250, 450, 3], [1010, 400, 2]], shards: [[330, 454], [1000, 470]], ...o }) },
  // The Sigil Altar: a graveyard on an ossuary floor before a crypt wall, close in (the Molten Pool's
  // camera), with graves close to the action, bats, crows and a spider, and falling ash. As picked in builder.html.
  graveyard: { CAM: { rows: 480, top: -110 }, D_ACT: 340, D_FIG: 316, D_FRONT: 360, pay: false, consume: true,
    build: (sc, heat, o) => Scene.setting(sc, 'graveyard', {
      heat, floor: 'ossuary', backdrop: 'crypt', features: ['graves'], horizon: 'wall', critters: ['bat', 'crow', 'spider'], effects: ['ash'],
      near: [[-30, 210, 'spike', 80, 22], [3, 170, 'spike', 92, 24], [14, 250, 'basalt', 44, 24], [112, 170, 'spike', 104, 26], [138, 240, 'basalt', 40, 24],
        [180, 200, 'spike', 96, 24], [27, 190, 'strata', 116, 32], [124, 200, 'strata', 124, 36]].map(([sx, d, k, h, w], i) => ({ k, x: Factory.mx(sx), d, h, w, l: 3, seed: 3 + i })),
      ...o }) },
};
const Rune = sigilScene(LOOKS.factory), Altar = sigilScene(LOOKS.graveyard);
