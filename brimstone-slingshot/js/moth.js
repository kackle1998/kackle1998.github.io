'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the Wandering Moth (a ? stop event, see Run.moth in js/run.js).
   A graveyard in the crypt, ossuary floor. Your figurine lands on the tail of the map's lob, and a
   glass moth flutters in from the upper right and circles it (idling until you choose). PAY 4 LIFE:
   the moth hovers over the figurine's head and dusts it with glints, then drifts off up and to the
   left. LEAVE: it drifts off at once.
   Built on the scene kit (js/scene.js). The moth is drawn in scene px (4 map units) on two upright
   planes, one behind the figurine and one in front, so it can pass either side. Positions move
   smoothly; its wings (4 frames, 7 a second) and the glints (6 a second) step.
   ============================================================ */

const Moth = (() => {
  const U = 4, GY = 103;                  // map units a scene px; the ground's scene y
  const mx = (x) => 720 + (x - 75) * U;   // a scene x as a plane x (map units): scene x 75 is the middle
  const D_FIG = 396, D_FRONT = 424;       // depths (plane y): you, the plane the moth and glints are drawn on
  const AX0 = -12, AW = 174;              // the upright planes' left edge and width (scene px)
  const FX = 75, HEAD = 88;               // where you stand, and your head's height
  const LAND = { across: 80, back: 10, high: 40, ms: 700 };
  const CAM = { rows: 480, top: -110 };   // the camera (Scene.mount): pulled in close
  const FLAP = 7, GLINT = 6;              // wing and glint steps a second
  const { cl } = Scene;
  const LANDED = LAND.ms / 1000 + Scene.SQUASH.ms / 1000, REST = LANDED + 1; // you land; the moth has flown in
  const GIFT_END = 3.5, LEAVE_END = 1.6;  // the gift and the early leave, from their own t = 0
  const ENTER_CUES = [[LAND.ms / 1000, 'land']];
  const GIFT_CUES = [[0.7, 'spell']];
  let EDGE = Infinity, EDGE_L = -Infinity; // the stage's right and left edges in scene x (Scene.span, measured by mount)
  let last = { x: FX + 20, y: HEAD - 8 }; // where the idling moth was, for the gift or leave to start from

  const step = (t, per) => Math.floor(t * per);
  const ease = (u) => u * u * (3 - 2 * u);
  const lerp = (a, b, u) => a + (b - a) * u;
  const seg = (t, a, b) => cl((t - a) / (b - a));

  /* ---------- the art ---------- */
  // One wing frame per step: [w, h, dy] of a pane above the body's middle. 0 open, 1 raised, 2 nearly closed,
  // 3 raised again, so a flap goes open, up, closed, up and the moth's outline never jumps more than a pixel or two.
  const WING = [[6, 5, -3], [5, 6, -4], [3, 6, -5], [5, 6, -4]];
  // The moth at (cx, cy), wing frame f: ink-outlined glass panes (the lightest tone), an accent body.
  function mothArt({ P, R }, cx, cy, f) {
    const [w, h, dy] = WING[f & 3];
    for (const dir of [-1, 1]) {
      const x = dir > 0 ? cx + 2 : cx - 1 - w, y = cy + dy;
      R(x, y, w, h, 1); R(x + 1, y + 1, w - 2, h - 2, 7);
      for (let i = 0; i < w - 2; i++) if ((i + f) & 1) P(x + 1 + i, y + h - 2, 6); // a dithered lower edge
    }
    R(cx - 1, cy - 3, 3, 7, 1); R(cx, cy - 2, 1, 5, 8);
  }
  // A glint in 4 stepped sizes: a dot, a plus, a bigger plus, a dot.
  function glintArt({ P, R }, x, y, s) {
    const k = [8, 8, 7, 8][s & 3];
    if (s & 1) { R(x - 1, y, 3, 1, k); R(x, y - 1, 1, 3, k); if (s === 3) P(x, y, 1); } else P(x, y, k);
  }

  /* ---------- the timeline ---------- */
  /* What the scene shows at time t (seconds) in a `mode`:
       'enter' (default): you land (0..LANDED), the moth flies in and settles into its orbit (..REST);
       'idle': waiting for your choice, the moth circling you (t from REST on, forever);
       'gift': PAY, from t = 0 to GIFT_END: it hovers over your head, glints, and leaves;
       'leave': LEAVE, from t = 0 to LEAVE_END: it drifts off.
     { fx, feet, depth, rot, sx, sy, moth: { x, y, f, front } or null, glints: [{ x, y, s }] } */
  function at(t, mode = 'enter') {
    const S = { fx: FX, feet: GY, depth: D_FIG, rot: 0, sx: 1, sy: 1, moth: null, glints: [] }, f = step(t, FLAP) & 3;
    // A tilted ring round your head: lower and in front on the near side, higher and behind on the far side.
    const orbit = (a) => ({ x: FX + Math.cos(a) * 20, y: HEAD - 8 + Math.sin(a) * 3, front: Math.sin(a) > 0 });
    if (mode === 'enter') {
      const L = Scene.land(cl(t * 1000 / LAND.ms), LAND.high * U), across = Math.max(LAND.across, FX - EDGE_L);
      S.fx = FX - across * L.k; S.depth = D_FIG - LAND.back * U * L.k; S.feet = GY - L.z / U; S.rot = L.rot;
      if (!L.k && t < LANDED) { S.sx = Scene.SQUASH.sx; S.sy = Scene.SQUASH.sy; }
      const u = t - LANDED;
      if (u < 0) return S;
      const k = ease(seg(u, 0, 1)); // in from the upper right, to where its orbit starts
      S.moth = { x: lerp(EDGE + 20, FX + 20, k), y: lerp(30, HEAD - 8, k), f, front: true };
    } else if (mode === 'idle') {
      S.moth = { ...orbit((t - REST) * 1.4), f };
      last = { x: S.moth.x, y: S.moth.y };
    } else if (mode === 'gift') {
      const k = ease(seg(t, 0, 0.5)), out = ease(seg(t, 2.1, GIFT_END));
      // from where it was, to above your head (drifting a little), then up and off to the left
      const hx = FX + Math.sin(t * 2) * 2, hy = HEAD - 18 + Math.sin(t * 4);
      const x = t < 2.1 ? lerp(last.x, hx, k) : lerp(hx, EDGE_L - 20, out), y = t < 2.1 ? lerp(last.y, hy, k) : lerp(hy, 12, out);
      S.moth = { x, y, f, front: true };
      if (t > 0.5 && t < 2.3) for (let i = 0; i < 6; i++) {
        const s = step(t - 0.5 - i * 0.12, GLINT);
        if (s >= 0 && s < 4) S.glints.push({ x: FX - 9 + i * 4 + (i & 1) * 2, y: HEAD - 4 + (i % 3) * 5, s });
      }
    } else { // 'leave'
      const k = ease(seg(t, 0, LEAVE_END));
      S.moth = { x: lerp(last.x, EDGE_L - 20, k), y: lerp(last.y, 12, k), f, front: true };
    }
    return S;
  }

  /* ---------- the stage ---------- */
  // The big things close to the action, as the builder places them: [x, depth, kind, h, w].
  const NEAR = [[-30, 210, 'spike', 80, 22], [3, 170, 'spike', 92, 24], [14, 250, 'basalt', 44, 24], [112, 170, 'spike', 104, 26],
    [138, 240, 'basalt', 40, 24], [180, 200, 'spike', 96, 24], [27, 190, 'strata', 116, 32], [124, 200, 'strata', 124, 36]];
  /* Build the scene in `stage` with the heat of the ante (0..2, RunMap.SPIRE_ANTES). Returns
     draw(state), with draw.alive and draw.idle(on): the moth circles you on its own while waiting. */
  function mount(stage, heat) {
    const sc = Scene.mount(stage, CAM);
    const span = Scene.span(sc, D_FIG, LAND.high * U);
    EDGE_L = (span[0] - 720) / U + 75 - 24; EDGE = (span[1] - 720) / U + 75 + 24;
    const near = NEAR.map(([sx, d, k, h, w], i) => ({ k, x: mx(sx), d, h, w, l: 3, seed: 3 + i }));
    const gnd = Scene.setting(sc, 'graveyard', { heat, near, floor: 'ossuary', backdrop: 'crypt', features: ['graves'], horizon: 'wall',
      critters: ['bat', 'crow'], effects: ['ash'], over: { x0: 260, y0: 280, w: 460, h: 130 } });
    // The planes reach past both edges, so the moth never gets cut off mid-screen coming or going.
    const x0 = Math.floor(Math.min(AX0, EDGE_L - 30)), x1 = Math.ceil(Math.max(AX0 + AW, EDGE + 40));
    const plane = (depth) => Scene.plane(sc, { left: mx(x0), x0, depth, w: x1 - x0, h: GY });
    // One plane, in front of you: the moth circles above your head, so it never needs to pass behind
    // you, and hopping between a back and a front plane shifted it on screen (the jitter).
    const front = plane(D_FRONT), fig = Scene.figure(sc, { s: U });
    let shadowKey = '', idleFrom = null;
    function draw(S) {
      if (!sc.alive()) return;
      const z = (GY - S.feet) * U, key = [Math.round(S.fx), Math.round(S.depth), Math.round(z / 16)].join();
      if (key !== shadowKey) {
        shadowKey = key;
        gnd.clear();
        const r = Math.max(2.5, 6 - z / 80);
        gnd.shade(mx(S.fx) + 4, S.depth + 2, r * 1.3, r * 0.5);
      }
      front.clear();
      fig.place({ x: mx(S.fx), y: S.depth, z, rot: S.rot, sx: S.sx, sy: S.sy });
      if (S.moth) mothArt(front.p, S.moth.x, S.moth.y, S.moth.f);
      for (const g of S.glints) glintArt(front.p, g.x, g.y, g.s);
    }
    // Idling runs on animation frames, so the circling is smooth (a timer's 60 ms jumps read as jitter).
    const loop = () => {
      if (!sc.alive()) return;
      if (idleFrom !== null) draw(at(REST + (performance.now() - idleFrom) / 1000, 'idle'));
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    draw.idle = (on) => { idleFrom = on ? performance.now() : null; };
    draw.alive = sc.alive;
    return draw;
  }

  return { at, mount, REST, LANDED, GIFT_END, LEAVE_END, ENTER_CUES, GIFT_CUES };
})();
