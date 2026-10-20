// The blue alien as one 32x96 figure, sliced into a 32x32 mask, vessel and pedestal. Painted whole, so
// the outline and shading run straight across the cuts. Joins: neck x 12-20 at y 32, waist x 11-21 at y 64.
const W = 32, H = 96;
const seg = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
const ell = (x, y, cx, cy, rx, ry, a = 0) => { const c = Math.cos(a), s = Math.sin(a), u = (x - cx) * c + (y - cy) * s, v = -(x - cx) * s + (y - cy) * c; return (u / rx) ** 2 + (v / ry) ** 2 <= 1; };
const inside = (x, y) =>
  // the head: a long dome leaning back to the upper right, over a wide snout
  ell(x, y, 18, 12, 10, 6.5, -0.5) || ell(x, y, 16, 22, 8.5, 8) ||
  (y > 27 && y < 33 && x > 12 && x < 20) ||                                // the neck
  ell(x, y, 8, 39, 6.5, 4.5) || ell(x, y, 24, 38, 6.5, 5) ||              // shoulder plates
  (y > 34 && y < 65 && Math.abs(x - 16) < 9.5 - (y - 35) * 0.15) ||       // the chest, tapering to the waist
  seg(x, y, 5, 41, 2.5, 51) < 2.1 || seg(x, y, 2.5, 51, 4, 56) < 1.8 ||   // left arm, down to the hand
  seg(x, y, 27, 41, 29.5, 51) < 2.1 || seg(x, y, 29.5, 51, 28, 56) < 1.8 ||
  ell(x, y, 4, 57, 2.4, 1.8) || ell(x, y, 28, 57, 2.4, 1.8) ||            // hands
  (y >= 64 && seg(x, y, 16, 63, 14, 76) < 5.5 - (y - 64) * 0.12) ||       // the tail, tapering
  (y >= 64 && seg(x, y, 14, 76, 11, 91) < 4 - (y - 76) * 0.24);           // down to a point, bending left
const g = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => inside(x + .5, y + .5)));
const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && g[y][x];
const o = g.map((r, y) => r.map((on, x) => {
  if (!on) return [[1,0],[-1,0],[0,1],[0,-1]].some(([a, b]) => at(x + a, y + b)) ? '#' : '.';
  if (!at(x + 1, y) || !at(x, y + 1) || !at(x + 2, y) || !at(x + 1, y + 1)) return '+';   // shadow on the lower right
  if (!at(x - 1, y) || !at(x, y - 1)) return '-';
  return (x + y) % 9 < 5 ? '-' : '+';                                                       // body tone, broken up
}));
const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) o[y][x] = c; };
const fill = (f, c) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] && f(x + .5, y + .5)) o[y][x] = c; };
// Body tone: mostly mid, lit on the upper left of each form.
fill((x, y) => true, '+');
fill((x, y) => ell(x, y, 15, 9, 7, 3.5, -0.5) || ell(x, y, 7, 38, 4, 2.5) || ell(x, y, 22, 37, 4, 2.5) || (y > 36 && y < 62 && x < 15 && x > 9) || (y >= 64 && seg(x, y, 14, 64, 12, 84) < 2), '-');
fill((x, y) => ell(x, y, 13, 9, 2, 1.2, -0.5) || ell(x, y, 21, 36, 1.6, 1) || ell(x, y, 6, 37, 1.4, 0.9) || (y > 66 && y < 78 && seg(x, y, 13, 66, 12.5, 78) < 0.7), 'w'); // gloss
// Re-ink the outline and the far-side shadow over the tone.
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] && (!at(x + 1, y) || !at(x, y + 1)) && o[y][x] !== 'w') o[y][x] = '+';
// The open mouth: a dark maw with fangs above and teeth below.
fill((x, y) => ell(x, y, 16, 23.5, 6, 4.2), '#');
for (const x of [11, 13, 15, 17, 19, 21]) { set(x, 20, 'w'); set(x, 21, 'w'); if (x % 4 === 1) set(x, 22, 'w'); }
for (const x of [12, 14, 16, 18, 20]) { set(x, 27, 'w'); set(x, 26, 'w'); }
// Brow ridge over the snout, ribs and abs on the chest.
for (let x = 10; x <= 22; x++) set(x, 17, x > 11 && x < 21 ? '+' : '#');
for (const y of [44, 49, 54, 59]) for (let x = 12; x <= 20; x++) if (x !== 16) set(x, y, '#');
for (let y = 42; y <= 62; y++) set(16, y, '#');
for (let x = 3; x <= 13; x++) if (g[42][x]) set(x, 42, '#');                // shoulder plate rims
for (let x = 19; x <= 29; x++) if (g[42][x]) set(x, 42, '#');
// Claws: three hooked white claws on each hand, inked.
const CLAWS = [[[2, 58], [1, 59], [1, 60], [2, 61]], [[4, 59], [4, 60], [4, 61], [5, 62]], [[6, 58], [7, 59], [7, 60], [7, 61]]];
for (const m of [false, true]) for (const c of CLAWS) {
  const pts = c.map(([x, y]) => [m ? 31 - x : x, y]);
  for (const [x, y] of pts) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (o[y + dy] && o[y + dy][x + dx] === '.') set(x + dx, y + dy, '#');
  for (const [x, y] of pts) set(x, y, 'w');
}
const rows = o.map((r) => r.join(''));
module.exports = { mask: rows.slice(0, 32), vessel: rows.slice(32, 64), pedestal: rows.slice(64, 96) };
