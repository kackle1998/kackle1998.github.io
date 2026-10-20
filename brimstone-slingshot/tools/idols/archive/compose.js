// Compose an idol from its pieces by anchors: each piece names where it attaches, the vessel holds the
// sockets, and the pieces are drawn back to front (pedestal, vessel, mask), so overlaps tuck in.
const P = require('./xeno_mock.json');
const ANCHORS = {
  mask:     { neck: [17, 22] },                  // the base of the skull, behind the jaw
  vessel:   { neck: [15, 6], waist: [16, 24] },   // between the shoulders; the bottom of the torso
  pedestal: { waist: [17, 4] },                  // the root of the tail
};
const ORDER = ['pedestal', 'vessel', 'mask'];    // back to front
function compose(parts, A) {
  const VX = 8, VY = 24;                          // the vessel's corner on a roomy canvas
  const at = {
    vessel: [VX, VY],
    mask: [VX + A.vessel.neck[0] - A.mask.neck[0], VY + A.vessel.neck[1] - A.mask.neck[1]],
    pedestal: [VX + A.vessel.waist[0] - A.pedestal.waist[0], VY + A.vessel.waist[1] - A.pedestal.waist[1]],
  };
  const C = Array.from({ length: 96 }, () => Array(48).fill('.'));
  for (const k of ORDER) parts[k].forEach((r, y) => [...r].forEach((c, x) => { if (c !== '.') C[at[k][1] + y][at[k][0] + x] = c; }));
  const rows = C.map((r) => r.join(''));
  const used = rows.map((r, y) => [r, y]).filter(([r]) => /[^.]/.test(r)).map(([, y]) => y);
  return rows.slice(used[0], used.at(-1) + 1);
}
module.exports = { compose, ANCHORS, ORDER };
if (require.main === module) {
  const { chromium } = require('playwright');
  const rows = compose(P, ANCHORS);
  const C = { '#': '#1f2418', '+': '#6e7a52', '-': '#a9b47e', 'w': '#eef1d6' };
  let h = `<body style="margin:0;background:#12160e;padding:16px"><svg width=${48 * 5} height=${rows.length * 5} viewBox="0 0 48 ${rows.length}" shape-rendering=crispEdges style="background:#cdd4a4">`;
  rows.forEach((r, y) => [...r].forEach((c, x) => { if (C[c]) h += `<rect x=${x} y=${y} width=1 height=1 fill="${C[c]}"/>`; }));
  h += '</svg>';
  (async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 272, height: rows.length * 5 + 32 } }); await p.setContent(h); await p.screenshot({ path: 'xeno_composed.png' }); await b.close(); })();
}
