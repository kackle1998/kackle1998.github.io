'use strict';
/* An example mockup (builder.html?mockup=example): the figurine lands beside a chest, then the lid
   lifts in steps. B is the same with the chest further back. Copy it to start a new event. */
(() => {
  const chest = (CX, depthBack) => {
    const { U, GY, D_FIG } = Builder;
    const LANDED = Builder.LAND.ms / 1000 + Scene.SQUASH.ms / 1000, END = LANDED + 1.2;
    let edge = Infinity; // the stage's left edge, from mount, so the lob starts off screen (until then, its own length)
    // A chest, 22 scene px wide, standing on gy: ink edge, lit from the upper left, a gold lock.
    function chestArt({ R }, x, gy, lid) {
      const w = 22, y = gy - 12, ly = y - 6 - lid * 2;
      R(x, y, w, 12, 1); R(x + 1, y + 1, w - 2, 10, 4); R(x + 1, y + 1, 2, 10, 6); R(x + w - 4, y + 1, 3, 10, 3);
      if (lid) { R(x, ly + 5, w, y - ly - 4, 1); R(x + 2, ly + 6, w - 4, y - ly - 6, 8); R(x + 3, ly + 6, 2, 1, 7); }
      R(x, ly, w, 6, 1); R(x + 1, ly + 1, w - 2, 4, 5); R(x + 1, ly + 1, 2, 4, 7); R(x + w - 4, ly + 1, 3, 4, 3);
      R(x + 9, y + 2, 4, 4, 1); R(x + 10, y + 3, 2, 2, 8);
    }
    return {
      len: END, hold: 1,
      at(t) {
        const S = Builder.land(t, { tx: 58, edge });
        S.lid = t < LANDED ? 0 : Scene.cl(Math.floor((t - LANDED - 0.4) * 6), 0, 3); // 6 steps a second
        return S;
      },
      mount({ plane, fig, shadow, mx, edge: e }) {
        edge = e;
        const act = plane(depthBack);
        return (S) => {
          const z = (GY - S.feet) * U;
          shadow(S.fx, S.depth, z);
          act.clear(); chestArt(act.p, CX, GY, S.lid);
          fig.place({ x: mx(S.fx), y: S.depth, z, rot: S.rot, sx: S.sx, sy: S.sy });
        };
      },
    };
  };
  Builder.add({ name: 'A · Chest beside you', desc: 'Lands beside a chest; the lid lifts in steps.', ...chest(82, 380) });
  Builder.add({ name: 'B · Chest further back', desc: 'The same, with the chest set deeper in the scene.', ...chest(90, 250) });
})();
