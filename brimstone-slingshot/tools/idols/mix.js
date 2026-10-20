// Every mask x vessel x pedestal combination of two creatures, assembled by the anchor rules:
// the vessel stays put, the mask's neck lands on its neck and the pedestal's waist on its waist,
// drawn pedestal, vessel, mask (back to front), on a 64x96 canvas.
const { chromium } = require('playwright');
const SETS = {
  alien: { art: require('./pieces/alien.json'), anchors: { mask: { neck: [17, 22] , face: [3, 8, 16, 27] }, vessel: { neck: [15, 6], waist: [16, 24] }, pedestal: { waist: [17, 4] } } },
  robot: { art: require('./pieces/robot.json'), anchors: { mask: { neck: [16, 25] , face: [3, 5, 28, 26] }, vessel: { neck: [16, 10], waist: [15, 25], front: [[0, 9, 11, 28]] }, pedestal: { waist: [15, 3] } } },
  golem: { art: require('./pieces/golem.json'), anchors: { mask: { neck: [18, 24] , face: [4, 9, 17, 25] }, vessel: { neck: [11, 4], waist: [18, 16] }, pedestal: { waist: [15, 5] } } },
  lion:  { art: require('./pieces/lion.json'), anchors: { mask: { neck: [15, 21] , face: [2, 7, 15, 25] }, vessel: { neck: [9, 9], waist: [23, 19] }, pedestal: { waist: [4, 9] } } },
};
function compose(m, v, p) {
  const VX = 24, VY = 32, at = {
    vessel: [VX, VY],
    mask: [VX + v.anchors.vessel.neck[0] - m.anchors.mask.neck[0], VY + v.anchors.vessel.neck[1] - m.anchors.mask.neck[1]],
    pedestal: [VX + v.anchors.vessel.waist[0] - p.anchors.pedestal.waist[0], VY + v.anchors.vessel.waist[1] - p.anchors.pedestal.waist[1]],
  };
  const src = { mask: m, vessel: v, pedestal: p };
  const C = Array.from({ length: 96 }, () => Array(80).fill('.'));
  const draw = (k, keep = () => true) => src[k].art[k].forEach((r, y) => [...r].forEach((c, x) => { const X = at[k][0] + x, Y = at[k][1] + y; if (c !== '.' && keep(x, y) && C[Y] && X >= 0 && X < 80) C[Y][X] = c; }));
  // Back to front: pedestal, vessel, mask, then any part of the vessel marked front (a raised arm).
  const front = v.anchors.vessel.front || [], inFront = (x, y) => front.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
  // A head's face (eyes, mouth) stays visible: front parts go behind it, though still over the rest of the head.
  const [fx0, fy0, fx1, fy1] = m.anchors.mask.face || [0, 0, -1, -1];
  const onFace = (x, y) => { const mx = at.vessel[0] + x - at.mask[0], my = at.vessel[1] + y - at.mask[1];
    return mx >= fx0 && mx <= fx1 && my >= fy0 && my <= fy1 && m.art.mask[my] && m.art.mask[my][mx] && m.art.mask[my][mx] !== '.'; };
  draw('pedestal'); draw('vessel'); draw('mask'); draw('vessel', (x, y) => inFront(x, y) && !onFace(x, y));
  return C.map((r) => r.join(''));
}
const COL = { '#': '#1f2418', '+': '#6e7a52', '-': '#a9b47e', 'w': '#eef1d6' };
let h = '<body style="margin:0;background:#12160e;font:12px monospace;color:#d9dfb3;display:flex;flex-wrap:wrap;gap:10px;padding:10px">';
const names = Object.keys(SETS);
// Combinations to show: process.argv[2] = 'all', or a creature to show whole and swapped with every other.
const pick = process.argv[2] || 'all', combos = [];
if (pick.includes(',')) for (const c of pick.split(',')) combos.push([...c].map((l) => names.find((n) => n[0] === l.toLowerCase())));
if (pick.includes(',')) {}
else if (pick === 'all') { for (const a of names) for (const b of names) for (const c of names) combos.push([a, b, c]); }
else {
  combos.push([pick, pick, pick]);
  for (const o of names.filter((n) => n !== pick)) combos.push([pick, o, o], [o, pick, pick], [pick, pick, o], [o, o, pick]);
}
for (const [a, b, c] of combos) {
  const rows = compose(SETS[a], SETS[b], SETS[c]);
  h += `<div style="text-align:center"><svg width=160 height=192 viewBox="0 0 80 96" shape-rendering=crispEdges style="background:#cdd4a4">`;
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (COL[ch]) h += `<rect x=${x} y=${y} width=1 height=1 fill="${COL[ch]}"/>`; }));
  h += `</svg><div>${a[0].toUpperCase()}${b[0].toUpperCase()}${c[0].toUpperCase()}</div></div>`;
}
(async () => { const br = await chromium.launch(); const pg = await br.newPage({ viewport: { width: 1560, height: 1760 } }); await pg.setContent(h); await pg.screenshot({ path: require('path').join(__dirname, 'previews', 'mix.png'), fullPage: true }); await br.close(); })();
