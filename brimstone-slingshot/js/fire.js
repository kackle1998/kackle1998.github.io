'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the campfire (a map stop, see Run.campfire in js/run.js).
   A tight clearing in thick woods on the forest floor, the campfire (js/campfire.js) in the middle.
   Your figurine lands beside it on the tail of the map's lob. The creature you pick rises on a
   stick to hang over the flames (its pixel face, so it stays part of the scene). Each boost
   lowers it into the flame tips: it heats from its foot up, comes back and a stat chip pops. If
   the fire takes it, it chars from the foot up, drops into the fire and the fire flares.
   Built on the scene kit (js/scene.js). Scene px, 4 map units a px; positions move smoothly,
   heat, char and sparks step (7 a second).
   ============================================================ */

const Fire = (() => {
  const U = 4, GY = 103;                  // map units a scene px; the ground's scene y on the upright planes
  const mx = (x) => 720 + (x - 75) * U;   // a scene x as a plane x (map units): scene x 75 is the middle
  const D_FIRE = 300, D_CARD = 306, D_FIG = 318; // depths: the fire (the mid center spot), the held card, you
  const AX0 = -12, AW = 174;              // the card plane's left edge and width (scene px)
  const FX = 36, HAND = [FX + 5, GY - 8]; // where you stand; where you hold the stick
  const CX = 75, HOLD = 48, LOW = 37, BURN_LOW = 34; // the card's middle; its foot's height over the fire held, warmed, burning (at grow 0)
  const GROW_MAX = 6, EX = 20;            // the fire grows a level each heat, up to GROW_MAX; its plane reaches EX px higher to fit it
  const up = (g) => Campfire.rise(Math.min(g, GROW_MAX)); // how much higher the flames, and so the card, are at grow g
  const LAND = { across: 150, back: 10, high: 60, ms: 700 };
  const CAM = { rows: 700, top: 178 };    // the factory camera (Rune Circle, Crystal Forge)
  const { cl, CARD } = Scene;
  const ease = (e) => e * e * (3 - 2 * e), lerp = (a, b, e) => a + (b - a) * e, seg = (t, a, b) => cl((t - a) / (b - a));
  const step = (t, per = 7) => Math.floor(t * per);
  const LANDED = LAND.ms / 1000 + Scene.SQUASH.ms / 1000, REST = LANDED + 0.3;
  const RAISE = 1.1, WARM = 2, BURN = 2.6;
  const ENTER_CUES = [[LAND.ms / 1000, 'land']];
  const RAISE_CUES = [[0, 'place']];
  const WARM_CUES = [[0.45, 'poof'], [1.35, 'heal']];
  const BURN_CUES = [[0.45, 'poof'], [1.6, 'die'], [1.95, 'poof']];
  let EDGE_L = -Infinity;                 // the stage's left edge in scene x (Scene.span, measured by mount)

  /* ---------- the timeline ---------- */
  /* What the scene shows at time t (seconds) in a `mode`:
       'enter' (default): you land (0..LANDED) and wait (REST), holding nothing yet;
       'hold': the card hangs over the fire, any t;
       'raise': 0..RAISE, the picked card rises on its stick from your hand to over the fire;
       'warm': 0..WARM, it dips into the flame tips, heats and comes back; a chip (`chip` 0 attack, 1 health) pops;
       'burn': 0..BURN, it dips, chars from the foot up, drops into the fire and the fire flares.
     { fx, feet, depth, rot, sx, sy: you; c: { x, h: its foot over the ground, heat 0..4, char:
       rows burnt from the foot, drop: how far the remains have fallen, or -1 } or null;
       chip: its rise 0..3 or 0; flare: a spark frame, or -1 } */
  function at(t, mode = 'enter', chip = 0, g = 0) {
    const hold = HOLD + up(g), low = LOW + up(g), burnLow = BURN_LOW + up(g);
    const S = { fx: FX, feet: GY, depth: D_FIG, rot: 0, sx: 1, sy: 1, c: null, chip: 0, kind: chip, flare: -1, hold };
    if (mode === 'enter') {
      const L = Scene.land(cl(t * 1000 / LAND.ms), LAND.high * U), across = Number.isFinite(EDGE_L) ? Math.max(LAND.across, FX - EDGE_L) : 400;
      S.fx = FX - across * L.k; S.depth = D_FIG - LAND.back * U * L.k; S.feet = GY - L.z / U; S.rot = L.rot;
      if (!L.k && t < LANDED) { S.sx = Scene.SQUASH.sx; S.sy = Scene.SQUASH.sy; }
      return S;
    }
    const c = S.c = { x: CX, h: hold, heat: 0, char: 0, drop: -1 };
    if (mode === 'raise') {
      const e = ease(seg(t, 0, RAISE));
      c.x = lerp(HAND[0] + 2, CX, e); c.h = lerp(GY - HAND[1] + 4, hold, e) + Math.sin(e * Math.PI) * 6;
      if (t < 0.15) { S.sx = 0.9; S.sy = 1.08; } // a stretch as you lift it
    } else if (mode === 'warm') {
      c.h = t < 1.1 ? lerp(hold, low, ease(seg(t, 0, 0.45))) : lerp(low, hold, ease(seg(t, 1.1, 1.5)));
      c.heat = t < 0.45 ? 0 : t < 1.1 ? cl(step(t - 0.45) + 1, 0, 4) : cl(4 - step(t - 1.1), 0, 4); // up in steps, and back down
      S.chip = t >= 1.35 ? cl(step(t - 1.35) + 1, 0, 3) : 0;
    } else if (mode === 'burn') {
      c.h = lerp(hold, burnLow, ease(seg(t, 0, 0.45)));
      c.heat = t >= 0.45 ? 4 : 0;
      c.char = t >= 0.6 ? cl(step(t - 0.6, 12), 0, CARD.H - 6) : 0;         // chars up from the foot, a row a step
      if (t >= 1.6) { c.drop = Math.floor(seg(t, 1.6, 1.95) * 5) / 5 * (burnLow + CARD.H - 16); } // the rest falls in, stepped
      if (t >= 1.95) c.drop = Infinity;                                        // gone
      S.flare = t >= 1.95 ? step(t - 1.95) : -1;
    }
    return S;
  }

  /* ---------- the art (scene px) ---------- */
  // The roasting stick, 2 px thick so it holds up under the scanlines: from your hand to the card's foot.
  function stick({ R }, x0, y0, x1, y1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) { const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n); R(x - 1, y, 2, 1, 1); }
    for (let i = 2; i < n - 1; i += 2) { const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n); R(x - 1, y, 1, 1, 3); } // bark, lit on its upper left
  }
  // The fork the card is pinned in: two prongs gripping its foot.
  function prongs({ R }, x, y) { R(x - 3, y - 2, 2, 4, 1); R(x + 2, y - 2, 2, 4, 1); R(x - 2, y + 1, 5, 2, 1); }
  // Heat on the card: the accent climbing its border from the foot, dithered, `heat` steps of 0..4.
  function heatArt({ P }, x, y, heat) {
    if (!heat) return;
    const { W, H } = CARD, top = H - 2 - heat * 3;
    for (let v = top; v < H - 1; v++) for (let u = 1; u < W - 1; u++) {
      if (u > 1 && u < W - 2 && v < H - 2) continue; // the border only (a rare card's gold sits in its field)
      if (Scene.bay(x + u, y + v) < (v - top) * 3 + 3) P(x + u, y + v, 8);
    }
  }
  // Char: the bottom `rows` of the card gone, a ragged ink edge with the accent burning along it.
  function charArt(pln, x, y, rows, t) {
    if (!rows) return;
    const { W, H } = CARD, edge = y + H - rows, st = step(t);
    pln.g.clearRect((x - pln.x0) * 2, (edge + 1) * 2, W * 2, (rows + 1) * 2);
    for (let u = 0; u < W; u++) {
      const j = (u * 5 + st) % 3 - 1;          // ragged, shifting a pixel each step
      pln.p.R(x + u, edge + j, 1, 2, 1);
      if ((u + st) % 3 === 0) pln.p.P(x + u, edge + j + 1, 8);
    }
  }
  // Sparks flying up off the fire when it takes the card: frame f, spreading and rising, then thinning out.
  function flareArt({ P }, f) {
    if (f < 0 || f > 5) return;
    const y0 = GY - 30;
    for (let i = 0; i < 9; i++) {
      if (f > 3 && i % (f - 2)) continue;
      const a = (i / 8) * Math.PI, r = 5 + f * 4;
      P(CX - Math.cos(a) * r, y0 - Math.sin(a) * r * 1.3 - f * 2, f < 3 ? 7 : 8);
    }
  }
  // A stat chip, 9 x 9: a sword (attack) or a heart (health) in the accent on paper, as the Forge's.
  const SWORD = ['....#....', '....#....', '....#....', '....#....', '..#####..', '....#....', '....#....'], HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  function statChip({ R }, cx, y, kind) {
    R(cx - 4, y, 9, 9, 1); R(cx - 3, y + 1, 7, 7, 6); R(cx - 3, y + 1, 1, 7, 7);
    const g = kind ? HEART : SWORD, ox = cx - (g[0].length >> 1), oy = y + (kind ? 2 : 1);
    g.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') R(ox + i, oy + j, 1, 1, 8); }));
  }

  /* ---------- the stage ---------- */
  // The big things close to the action, as the builder places them: [x, depth, kind, h, w].
  const NEAR = [[-28, 220, 'spike', 84, 22], [6, 180, 'spike', 96, 24], [18, 250, 'basalt', 40, 22], [128, 180, 'spike', 100, 26], [146, 250, 'basalt', 42, 24], [176, 210, 'spike', 92, 24]];
  /* Build the scene in `stage` with the heat of the ante (0..2, RunMap.SPIRE_ANTES). Returns
     draw(state) for at()'s states, with draw.alive, draw.face(def) (the held creature's art and
     rarity) and draw.hold(on): the held card sways a little on its own while you choose. */
  function mount(stage, heat) {
    const sc = Scene.mount(stage, CAM);
    // Measured again once the stage is laid out (a screen just shown can measure as nothing).
    const edge = () => { const e = (Scene.span(sc, D_FIG, LAND.high * U)[0] - 720) / U + 75 - 24; if (Number.isFinite(e)) EDGE_L = e; };
    edge();
    requestAnimationFrame(edge);
    const near = NEAR.map(([sx, d, k, h, w], i) => ({ k, x: mx(sx), d, h, w, l: 3, seed: 3 + i }));
    const gnd = Scene.setting(sc, 'ruins', { heat, near, floor: 'forest', backdrop: 'sky', features: ['woods'], density: { woods: 2 }, band: 256, clearing: 'tight',
      horizon: 'wall', critters: ['spider', 'bat'], effects: [], over: { x0: 260, y0: 260, w: 460, h: 150 } });
    // The campfire on the mid center spot, on its own plane reaching EX px higher than the prop's,
    // so the fire can grow (draw.grow) without its flames being cut off.
    const { x: fx, depth: fd } = Scene.SPOTS['mid center'], { GY: FGY, CX: FCX, W: FW } = Campfire;
    const fpl = Scene.plane(sc, { left: mx(fx - FCX), x0: 0, depth: fd, w: FW, h: FGY + EX });
    const fpen = { ...fpl, p: Scene.pen(fpl.g, sc.C, 0, -EX, 2) };
    let grow = 0;
    sc.every(60, () => { fpl.clear(); Campfire.draw(fpen, performance.now() / 1000, heat, sc, Math.min(grow, GROW_MAX)); });
    const pln = Scene.plane(sc, { left: mx(AX0), x0: AX0, depth: D_CARD, w: AW, h: GY }), fig = Scene.figure(sc, { s: U });
    let art = null, rarity = 'common', last = at(REST), holding = false, shadowKey = '', hitKey = '';
    // A clear box over the held card, so hovering it shows the card's text (Run.tip), as the Shrine's face does.
    const hit = document.createElement('div');
    Object.assign(hit.style, { position: 'absolute', zIndex: '3', display: 'none' });
    stage.appendChild(hit);
    const place = (x, y) => {
      const k = x + ',' + y;
      if (k === hitKey) return;
      hitKey = k;
      if (x == null) { hit.style.display = 'none'; return; }
      const [l, t] = Scene.toStage(sc, pln, x, y), [r, b] = Scene.toStage(sc, pln, x + CARD.W, y + CARD.H);
      Object.assign(hit.style, { display: '', left: l + 'px', top: t + 'px', width: r - l + 'px', height: b - t + 'px' });
    };
    const paint = () => {
      const S = last, now = performance.now() / 1000, c = S.c, p = pln.p;
      pln.clear();
      if (c && c.drop < 0 && c.char === 0 && art) place(Math.round(c.x) - (CARD.W >> 1), Math.round(GY - c.h) - CARD.H); else place(null);
      if (c && c.drop !== Infinity) {
        const sway = holding ? [0, 1, 0, -1][step(now, 3) & 3] : 0;
        const x = Math.round(c.x + sway) - (CARD.W >> 1), foot = Math.round(GY - c.h), y = foot - CARD.H;
        if (c.drop < 0) stick(p, HAND[0], HAND[1], x + (CARD.W >> 1), foot + 1);
        const dy = c.drop > 0 ? Math.round(c.drop) : 0;
        Scene.cardFace(p, x, y + dy, CARD.W, { art, pl: pln, rarity });
        heatArt(p, x, y + dy, c.heat);
        charArt(pln, x, y + dy, c.char, now);
        if (c.drop < 0) prongs(p, x + (CARD.W >> 1), foot);
        if (c.drop > 0) pln.g.clearRect(0, (GY - 30) * 2, pln.cv.width, 60); // what has dropped below the flame tips is in the fire
      }
      if (c && S.chip) statChip(p, CX + 14, GY - S.hold - CARD.H + 4 - S.chip * 4 - (S.chip === 3 ? step(now, 3) % 2 : 0), S.kind);
      flareArt(p, S.flare);
    };
    sc.every(60, paint);
    function draw(S) {
      if (!sc.alive()) return;
      last = S;
      const z = (GY - S.feet) * U, key = [Math.round(S.fx), Math.round(S.depth), Math.round(z / 16)].join();
      if (key !== shadowKey) {
        shadowKey = key;
        gnd.clear();
        const r = Math.max(2.5, 6 - z / 80);
        gnd.shade(mx(S.fx) + 4, S.depth + 2, r * 1.3, r * 0.5);
      }
      paint();
      fig.place({ x: mx(S.fx), y: S.depth, z, rot: S.rot, sx: S.sx, sy: S.sy });
    }
    draw.alive = sc.alive;
    draw.face = (d) => { art = d ? Scene.spriteArt(d.sprite) : null; rarity = d ? rarityOf(d) : 'common'; };
    draw.hold = (on) => { holding = on; };
    draw.grow = (g) => { grow = g; }; // how much higher the fire burns: a level each heat (pass the same g to at())
    draw.hit = hit; // the held card's hover box, for Run to show its text
    return draw;
  }

  // Work the campfire's floor out ahead, while the map is idle (Scene.warmFloor), so the stop opens quickly.
  const warm = (heat) => Scene.warmFloor('ruins', { heat, floor: 'forest', backdrop: 'sky', horizon: 'wall' });

  return { mount, warm, at, LANDED, REST, RAISE, WARM, BURN, ENTER_CUES, RAISE_CUES, WARM_CUES, BURN_CUES };
})();
