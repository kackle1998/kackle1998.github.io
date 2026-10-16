'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the Rune Circle (a ? stop event, see Run.rune in js/run.js).
   A rune circle turns in the floor of a demonic factory (js/factory.js). Your figurine lands in
   the middle of it on the tail of the map's lob, between two creatures: one wears a sigil chip
   above its head. PAY 3 LIFE spins the circle up: three life pips drop into it, a copy of the
   chip turns up out of the circle, flies across and stamps onto the other creature.
   The creatures are stand-ins for the two you pick; the circle's mark is the arcana symbol.
   Built on the scene kit (js/scene.js): only the circle, the chip's flight and the timeline are its own.
   Scene px: everything is laid out on upright planes in scene pixels of 4 map units, x across and
   y down from the sky to the ground at GY.
   ============================================================ */

const Rune = (() => {
  const { mx, GY, D_ACT } = Factory, U = 4;
  const D_FIG = 290, D_FRONT = 340;      // depths (plane y): you in the circle, the plane in front of you (pips, the chip's flight)
  const AX0 = -12, AW = 174;             // the upright planes' left edge and width (scene px), from the sky (y 0) to GY
  const FX = 75, CA = 26, CB = 114;      // where you stand, and the two creatures' left edges (scene x)
  // The entrance, in scene px (x 4 for map units): the tail of the map's lob, in from the left.
  const LAND = { across: 150, back: 10, high: 60, ms: 700 };
  const CAM = { rows: 700, top: 178 };   // the camera (Scene.mount): the circle, the creatures and the reservoir behind
  const RR = 56, RC = 66, RX = mx(FX) - RC * 2, RY = D_FIG - RC * 2; // the circle's radius, its canvas middle and its plane corner
  const { cl } = Scene;
  const lerp = (a, b, e) => a + (b - a) * e, ease = (e) => e * e * (3 - 2 * e);

  /* ---------- the timeline ---------- */
  /* What the scene shows at time t (seconds): the entrance runs 0..LANDED, you wait at REST, and
     PAY 3 LIFE plays REST..END. Poses step (the turning chip at 8 a second); flights move smoothly.
     { fx, feet: scene x and y of your feet, depth: plane y you stand at, rot: quarter turns,
       sx, sy: squash, pips: [{ x, y }] life pips in flight, pulse: the circle flares, fast: it
       spins up, flashA, flashB: a creature lit, badgeB: the copy has landed,
       chip: { x, y, w } the turning chip in flight or null, trail: [{ x, y, k }] } */
  const LANDED = LAND.ms / 1000 + Scene.SQUASH.ms / 1000, REST = 1;
  const T_PAY = 1.7, T_COPY = 3, T_FLY = 3.9, T_ABS = 4.9, END = 6.6;
  const CHIP_B = { x: CB + 7, y: GY - 18 - 14 }; // where the copy comes to rest, over the second creature's head
  function at(t) {
    const S = { fx: FX, feet: GY, depth: D_FIG, rot: 0, sx: 1, sy: 1, pips: [], pulse: 0, fast: t >= T_COPY && t < T_ABS, chip: null, trail: [] };
    if (t < LANDED) {
      const L = Scene.land(cl(t * 1000 / LAND.ms), LAND.high * U);
      S.fx = FX - LAND.across * L.k;
      S.depth = D_FIG - LAND.back * U * L.k;
      S.feet = GY - L.z / U;
      S.rot = L.rot;
      if (!L.k) { S.sx = Scene.SQUASH.sx; S.sy = Scene.SQUASH.sy; }
    }
    for (let i = 0; i < 3; i++) { // three life pips fall from your chest into the circle
      const age = t - (T_PAY + i * 0.2);
      if (age >= 0 && age < 0.3) { const e = age / 0.3; S.pips.push({ x: FX + (i - 1) * 8 * e, y: lerp(GY - 9, GY + 1, e * e) - Math.sin(e * Math.PI) * 5 }); }
      if (age >= 0 && age < 0.1) { S.sx = 0.9; S.sy = 1.08; }
      if (age >= 0.3 && age < 0.5) S.pulse = 1;
    }
    if (t >= T_COPY - 0.3 && t < T_COPY) S.pulse = 1;
    S.flashA = t >= T_COPY - 0.3 && t < T_COPY - 0.1;
    const turn = [9, 5, 3, 5][Math.floor(t * 8) % 4], y0 = GY - 6 - 12 - 9;
    const flight = (e) => ({ x: lerp(FX, CB + 7, e), y: lerp(y0, CHIP_B.y, e) - Math.sin(e * Math.PI) * 8 });
    if (t >= T_COPY && t < T_FLY) S.chip = { x: FX, y: GY - 6 - Math.floor((t - T_COPY) / (T_FLY - T_COPY) * 4) * 4 - 9, w: turn }; // up out of the circle in steps
    else if (t >= T_FLY && t < T_ABS) {
      S.chip = { ...flight(ease((t - T_FLY) / (T_ABS - T_FLY))), w: turn };
      for (let i = 1; i <= 3; i++) { const p = flight(ease(cl((t - 0.09 * i - T_FLY) / (T_ABS - T_FLY)))); S.trail.push({ x: p.x, y: p.y + 4, k: i === 1 ? 7 : i === 2 ? 8 : 6 }); }
    }
    S.flashB = t >= T_ABS && t < T_ABS + 0.2;
    S.badgeB = t >= T_ABS;
    return S;
  }
  // Sounds on the way: [time, name, n]. ENTER_CUES for the entrance, CUES for the copy.
  const ENTER_CUES = [[LAND.ms / 1000, 'land']];
  const CUES = [[T_PAY, 'place'], [T_PAY + 0.2, 'place'], [T_PAY + 0.4, 'place'], [T_COPY, 'spell'], [T_FLY, 'twang'], [T_ABS, 'poof']];

  /* ---------- the stage ---------- */
  /* Build the scene in `stage` with the factory's heat (0..2, RunMap.SPIRE_ANTES). Returns
     draw(state) for at(t)'s states, with draw.alive(). The circle keeps turning between draws,
     on its own timer. */
  function mount(stage, heat) {
    const sc = Scene.mount(stage, CAM);
    const gnd = Factory.build(sc, heat, {
      rubble: [[250, 450, 3], [1010, 400, 2]], shards: [[330, 454], [1000, 470]],
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
    let spin = 0, st = -1, last = at(REST), shadowKey = '';
    const paint = () => {
      const S = last, bob = Math.floor(performance.now() / 333) % 2; // the badges bob 3 a second
      paintRing(spin, S.pulse);
      act.clear(); front.clear();
      Factory.imp(act.p, CA, GY, { big: true, flash: S.flashA });
      Factory.imp(act.p, CB, GY, { tone: 5, flash: S.flashB });
      Factory.chip(act.p, CA + 7, GY - 18 - 13 - bob, 9);
      if (S.badgeB) Factory.chip(act.p, CB + 7, GY - 18 - 12 - bob, 9);
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
    return draw;
  }

  return { mount, at, LANDED, REST, END, ENTER_CUES, CUES, CAM };
})();
