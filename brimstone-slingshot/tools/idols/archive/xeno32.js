// 32x32 idol pieces for the blue alien, drawn from shapes: fill, ink outline, light upper-left / shadow lower-right.
const N = 32;
const seg = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
const ell = (x, y, cx, cy, rx, ry, a = 0) => { const c = Math.cos(a), s = Math.sin(a), u = (x - cx) * c + (y - cy) * s, v = -(x - cx) * s + (y - cy) * c; return (u / rx) ** 2 + (v / ry) ** 2 <= 1; };
function paint(inside, details) {
  const g = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => inside(x + .5, y + .5)));
  const at = (x, y) => x >= 0 && y >= 0 && x < N && y < N && g[y][x];
  const out = g.map((r, y) => r.map((on, x) => {
    if (!on) return [[1,0],[-1,0],[0,1],[0,-1]].some(([a, b]) => at(x + a, y + b)) ? '#' : '.';
    const sh = !at(x + 1, y) || !at(x, y + 1) || !at(x + 2, y + 1) || !at(x + 1, y + 2);
    const hi = !at(x - 1, y) || !at(x, y - 1) || !at(x - 1, y - 1);
    return sh ? '+' : hi ? 'w' : '-';
  }));
  details && details(out);
  return out.map((r) => r.join(''));
}
const set = (o, x, y, c) => { if (x >= 0 && y >= 0 && x < N && y < N) o[y][x] = c; };
const P = {
  mask: paint((x, y) =>
    ell(x, y, 19, 10, 12.5, 6.5, -0.45) ||                 // the long skull, swept back up and right
    (x > 4 && x < 19 && y > 13 && y < 25) ||               // the jaw
    (x > 11 && x < 21 && y > 22),                          // the neck
  (o) => {
    for (let y = 16; y <= 22; y++) for (let x = 5; x <= 16; x++) set(o, x, y, '#'); // open mouth
    for (let x = 5; x <= 16; x += 2) { set(o, x, 16, 'w'); set(o, x, 17, 'w'); set(o, x + 1, 22, 'w'); set(o, x + 1, 21, 'w'); } // teeth
    for (let i = 0; i < 9; i++) set(o, 13 + i, 12 - Math.round(i * 0.5), '+');      // a brow ridge down the skull
    for (let i = 0; i < 7; i++) set(o, 17 + i, 14 - Math.round(i * 0.5), '+');
    for (let y = 25; y < 32; y += 2) for (let x = 13; x <= 18; x++) set(o, x, y, '+'); // neck ribs
  }),
  vessel: paint((x, y) =>
    ell(x, y, 8, 6, 6, 4.5) || ell(x, y, 24, 6, 6, 4.5) ||   // shoulder plates
    (y > 3 && Math.abs(x - 16) < 7 - (y - 4) * 0.04) ||       // chest narrowing to the waist
    (y < 5 && x > 11 && x < 21) ||                           // the neck
    seg(x, y, 5, 8, 2.5, 16) < 2 || seg(x, y, 2.5, 16, 4, 22) < 1.7 ||       // left arm, the elbow out
    seg(x, y, 27, 8, 29.5, 16) < 2 || seg(x, y, 29.5, 16, 28, 22) < 1.7 ||   // right arm
    ell(x, y, 4.5, 23.5, 2.6, 2) || ell(x, y, 27.5, 23.5, 2.6, 2),               // the hands
  (o) => {
    for (let y = 11; y <= 27; y += 4) for (let x = 11; x <= 20; x++) { set(o, x, y, '#'); set(o, x, y + 1, '+'); } // ribs
    for (let y = 9; y <= 30; y++) set(o, 15, y, '#'), set(o, 16, y, '+');            // the spine
    for (const [cx] of [[8], [24]]) for (let i = -3; i <= 3; i++) set(o, cx + i, 9, '+'); // plate rims
    const CLAWS = [[[2, 25], [1, 26], [1, 27], [1, 28], [2, 29], [3, 30]],   // three hooked claws on the left hand, fanned out
                   [[4, 26], [4, 27], [4, 28], [5, 29], [6, 30]],
                   [[6, 25], [7, 26], [7, 27], [8, 28]]];
    for (const m of [false, true]) for (const c of CLAWS) {                      // the right hand mirrors the left
      const pts = c.map(([x, y]) => [m ? 31 - x : x, y]);
      for (const [x, y] of pts) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (o[y + dy] && o[y + dy][x + dx] === '.') set(o, x + dx, y + dy, '#');
      for (const [x, y] of pts) set(o, x, y, 'w');
    }
  }),
  pedestal: paint((x, y) =>
    (y < 16 && seg(x, y, 16, 0, 18, 8) < 6 - y * 0.3) ||     // the fish tail, from the waist
    seg(x, y, 18, 8, 15, 15) < 3.2 - y * 0.12 ||               // curling under
    ell(x, y, 11, 17, 4.5, 2, 0.55) || ell(x, y, 18, 18, 4.5, 2, -0.45) || // the tail fin
    (y > 24 && x > 0 && x < 31),                               // the plinth, the tail floating over it
  (o) => {
    for (let x = 9; x <= 21; x++) if (x % 2) set(o, x, 25, '#');   // its shadow on the plinth, dithered
    for (const [x0, y0, d] of [[9, 15, 1], [17, 17, 1]]) for (let i = 0; i < 4; i++) set(o, x0 + i * d, y0 + (i % 2), '+'); // fin rays
    for (let x = 2; x < 30; x++) set(o, x, 27, '#');                // the plinth's step
    for (let x = 3; x < 29; x += 4) set(o, x, 29, '+');
    for (let y = 2; y < 12; y += 3) for (let x = 13; x <= 20; x++) if (o[y][x] === '-') set(o, x, y, '+'); // scales
  }),
};
module.exports = P;
