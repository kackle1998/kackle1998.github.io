'use strict';
/* Wandering Moth mockups (builder.html?mockup=moth). The figurine lands, then a glass moth comes
   to it. A circles it, B perches on it, C darts in and trails glints. The moth is drawn in scene
   px with flat ramp colors (ink outline, glass 7, accent body), wings flapping in 4 stepped
   frames at 7 a second. Positions move smoothly; poses and glints step. */
(() => {
  const FLAP = 7, GLINT = 6; // steps a second
  const LANDED = Builder.LAND.ms / 1000 + Scene.SQUASH.ms / 1000;
  const FX = 75, HEAD = 88; // the figurine's middle, and its head height in scene px (feet at GY)

  // One wing: an ink-outlined glass pane, anchored at the body (cx, cy), dir -1 left / 1 right.
  // Frames: 0 open, 1 raised, 2 nearly closed, 3 low.
  const WING = [[6, 5, -3], [5, 6, -5], [3, 6, -6], [5, 5, -1]];
  function moth({ P, R }, cx, cy, f) {
    const [w, h, dy] = WING[f & 3];
    for (const dir of [-1, 1]) {
      const x = dir > 0 ? cx + 2 : cx - 1 - w, y = cy + dy;
      R(x, y, w, h, 1); R(x + 1, y + 1, w - 2, h - 2, 7);
      for (let i = 0; i < w - 2; i++) if ((i + f) & 1) P(x + 1 + i, y + h - 2, 6); // a dithered edge
    }
    R(cx - 1, cy - 3, 3, 7, 1); R(cx, cy - 2, 1, 5, 8); // the body, accent down its middle
  }
  // A glint, 4 stepped sizes: a dot, a plus, a bigger plus, a dot again.
  function glint({ P, R }, x, y, s) {
    const k = [8, 8, 7, 8][s & 3];
    if (s & 1) { R(x - 1, y, 3, 1, k); R(x, y - 1, 1, 3, k); if (s === 2) P(x, y, 1); }
    else P(x, y, k);
  }

  const step = (t, per) => Math.floor(t * per);
  const ease = (u) => u * u * (3 - 2 * u);
  const lerp = (a, b, u) => a + (b - a) * u;
  const seg = (t, a, b) => Scene.cl((t - a) / (b - a)); // 0..1 across a stretch of the timeline

  // The shared mount: a plane behind the figurine and one in front, so the moth can pass either way.
  function mountMoth({ plane, fig, shadow, mx, edge: e }) {
    const back = plane(372), front = plane(424);
    return (S) => {
      const z = (Builder.GY - S.feet) * Builder.U;
      shadow(S.fx, S.depth, z);
      back.clear(); front.clear();
      const m = S.moth;
      fig.place({ x: mx(S.fx), y: S.depth, z, rot: S.rot, sx: S.sx, sy: S.sy, lean: S.lean || 0 });
      if (m) moth((m.front ? front : back).p, m.x, m.y, m.f);
      for (const g of S.glints || []) glint(front.p, g.x, g.y, g.s);
    };
  }
  let edge = Infinity;
  const base = (t) => Builder.land(t, { tx: FX, edge });
  const withEdge = (mount) => (ctx) => { edge = ctx.edge; return mount(ctx); };

  /* A · Circles your light: orbits the figurine, hovers over its head, glints, drifts off. */
  const A = {
    name: 'A · Circles your light',
    desc: 'The moth orbits the figurine, hovers over its head, dusts it with glints, then drifts off.',
    len: 8, hold: 1,
    at(t) {
      const S = base(t), u = t - LANDED;
      if (u < 0) return S;
      const f = step(t, FLAP) & 3;
      let x, y, front = true;
      if (u < 1) { // in from the upper right
        const k = ease(seg(u, 0, 1));
        x = lerp(edge + 190, FX + 22, k); y = lerp(30, HEAD - 8, k);
      } else if (u < 4) { // 1.5 turns, spiraling in
        const a = (u - 1) / 3 * Math.PI * 3, r = lerp(22, 13, (u - 1) / 3);
        x = FX + Math.cos(a) * r; y = HEAD - 8 + Math.sin(a * 2) * 2; front = Math.sin(a) > 0;
      } else if (u < 5.6) { // hovers over the head, dusting glints
        x = FX + Math.sin(u * 2) * 2; y = HEAD - 18 + Math.sin(u * 4);
      } else { // leaves up and to the left
        const k = ease(seg(u, 5.6, 7)); x = lerp(FX, FX - 130, k); y = lerp(HEAD - 18, 12, k);
      }
      S.moth = { x, y, f, front };
      S.glints = [];
      if (u > 4.2 && u < 5.8) for (let i = 0; i < 6; i++) {
        const s = step(u - 4.2 - i * 0.12, GLINT);
        if (s >= 0 && s < 4) S.glints.push({ x: FX - 9 + i * 4 + (i & 1) * 2, y: HEAD - 4 + (i % 3) * 5, s });
      }
      return S;
    },
    mount: withEdge(mountMoth),
  };

  /* B · Perches on you: circles once, lands on the head, wings fold then open slowly, a glint ring. */
  const B = {
    name: 'B · Perches on you',
    desc: 'The moth circles once, settles on the figurine\'s head and folds its wings, then opens them and gives the gift.',
    len: 8, hold: 1,
    at(t) {
      const S = base(t), u = t - LANDED;
      if (u < 0) return S;
      let x, y, f, front = true;
      if (u < 2.4) { // one loop in, then down onto the head
        const k = seg(u, 0, 2.4), a = k * Math.PI * 2 + 0.6, r = lerp(30, 6, ease(k));
        x = FX + Math.cos(a) * r + lerp(40, 0, k); y = lerp(34, HEAD - 12, ease(k)) + Math.sin(a * 2) * 2;
        front = Math.sin(a) > 0; f = step(t, FLAP) & 3;
      } else if (u < 4) { // perched: wings fold, then open and close slowly (2 a second)
        x = FX; y = HEAD - 12; f = [2, 2, 3, 0][step(u - 2.4, 2) & 3];
      } else if (u < 5.2) { // the gift: wings spread, the figurine hops, glints ring the head
        x = FX; y = HEAD - 12; f = step(t, FLAP) & 3;
      } else { // flutters off to the right
        const k = ease(seg(u, 5.2, 6.6)); x = lerp(FX, FX + 150, k); y = lerp(HEAD - 12, 14, k); f = step(t, FLAP) & 3;
      }
      S.moth = { x, y, f, front };
      S.glints = [];
      if (u > 4 && u < 5.5) {
        const s = Scene.cl(step(u - 4, GLINT), 0, 3), n = 6;
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2;
          S.glints.push({ x: Math.round(FX + Math.cos(a) * 14), y: Math.round(HEAD - 4 + Math.sin(a) * 9), s: (s + i) & 3 });
        }
        S.feet -= Math.floor(seg(u, 4, 4.3) * 3) * (u < 4.5 ? 1 : 0); // a small stepped hop
      }
      return S;
    },
    mount: withEdge(mountMoth),
  };

  /* C · Darts in: zigzags to face height, hovers while the figurine leans back, trails falling glints. */
  const C = {
    name: 'C · Darts in',
    desc: 'The moth zigzags in and hovers at face height; the figurine leans back, curious. It leaves a trail of falling glints.',
    len: 8, hold: 1,
    at(t) {
      const S = base(t), u = t - LANDED;
      if (u < 0) return S;
      const f = step(t, FLAP) & 3, pos = (v) => {
        if (v < 1.6) { // darts: a zigzag, one jump every 1/6 s
          const k = step(v, 6) / 9, zig = ((step(v, 6) & 1) ? 1 : -1) * 7 * (1 - k);
          return { x: lerp(edge + 190, FX + 18, ease(k)), y: lerp(24, HEAD - 6, ease(k)) + zig };
        }
        if (v < 4.2) return { x: FX + 18 + Math.sin(v * 3) * 3, y: HEAD - 6 + Math.sin(v * 5) * 2 };
        const k = ease(seg(v, 4.2, 6.4)); return { x: lerp(FX + 18, FX + 150, k), y: lerp(HEAD - 6, 10, k) };
      };
      const m = pos(u);
      S.moth = { x: m.x, y: m.y, f, front: true };
      S.lean = u > 1.6 && u < 4.2 ? 8 : 0;
      S.glints = [];
      for (let i = 0; i < 16; i++) { // a glint is shed every 0.2 s while it hovers or leaves; it falls and shrinks
        const born = 1.6 + i * 0.2, age = u - born;
        if (age < 0 || age > 0.7) continue;
        const p = pos(born);
        S.glints.push({ x: Math.round(p.x + (i % 3 - 1) * 3), y: Math.round(p.y + 4 + age * 26), s: Math.min(3, step(age, GLINT)) });
      }
      return S;
    },
    mount: withEdge(mountMoth),
  };

  for (const d of [A, B, C]) Builder.add(d);
})();
