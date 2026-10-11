'use strict';
/* ============================================================
   NIGHTSHADE SPELLSLINGING — shared rendering helpers (game + card maker)
   ============================================================ */

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

/* Built-in sprites are 8-wide halves that get mirrored; custom sprites are full 16x16. */
function expandSprite(rows) {
  const full = rows.some((r) => r.length > 8);
  return rows.map((r) => {
    if (full) return r.padEnd(16, '.').slice(0, 16);
    const h = r.padEnd(8, '.').slice(0, 8);
    return h + [...h].reverse().join('');
  });
}

const _spr = {};
function spriteURL(name) {
  const src = SPRITES[name];
  if (!src) return '';
  const key = name + '|' + src.join('');
  if (_spr[key]) return _spr[key];
  const rows = expandSprite(src);
  const cv = document.createElement('canvas');
  cv.width = 16; cv.height = rows.length;
  const x = cv.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, xx) => {
    if (PAL[ch]) { x.fillStyle = PAL[ch]; x.fillRect(xx, y, 1, 1); }
  }));
  return (_spr[key] = cv.toDataURL());
}

const _ico = {};
function iconURL(name, color = PAL['#']) {
  const key = name + color;
  if (_ico[key]) return _ico[key];
  const rows = ICONS[name];
  const cv = document.createElement('canvas');
  cv.width = 7; cv.height = 7;
  const x = cv.getContext('2d');
  x.fillStyle = color;
  rows.forEach((r, y) => [...r].forEach((ch, xx) => { if (ch === '#') x.fillRect(xx, y, 1, 1); }));
  return (_ico[key] = cv.toDataURL());
}
function ico(name, cls = '', color) { return `<img class="ico ${cls}" src="${iconURL(name, color)}" alt="">`; }

function costHTML(cost) {
  let h = cost.g ? `<span class="gen">${cost.g}</span>` : '';
  for (const k of COLOR_KEYS) for (let i = 0; i < (cost[k] || 0); i++) h += ico(COLORS[k].icon);
  return h;
}

/* Inner markup of a card face. `atk`/`hpNow` let the game show buffs and damage. */
function cardInnerHTML(c, atk = c.atk, hpNow = c.hp - (c.dmg || 0)) {
  const name = escapeHTML(c.name);
  if (c.type === 'land') {
    return `
      <div class="c-band">${ico(COLORS[c.color].icon, '', PAL.w)} LAND</div>
      <div class="c-name">${name}</div>
      <img class="c-art" src="${spriteURL(c.sprite)}" alt="">
      <div class="c-land">+1 ${ico(COLORS[c.color].icon, '', PAL.w)} <span>${COLORS[c.color].name.toUpperCase()}</span></div>
      <div class="c-glare"></div>`;
  }
  if (c.type === 'spell' || c.type === 'trap') {
    return `
      <div class="c-band">${ico(COLORS[c.color].icon, '', PAL.w)} ${c.type.toUpperCase()}</div>
      <div class="c-name">${name}</div>
      <img class="c-art" src="${spriteURL(c.sprite)}" alt="">
      <div class="c-cost">${costHTML(c.cost)}</div>
      <div class="c-text">${escapeHTML(c.short)}</div>
      <div class="c-glare"></div>`;
  }
  return `
    <div class="c-band">${ico(COLORS[c.color].icon, '', PAL.w)} ${c.token ? 'TOKEN' : 'CREATURE'}</div>
    <div class="c-name">${name}</div>
    <img class="c-art" src="${spriteURL(c.sprite)}" alt="">
    <div class="c-cost">${costHTML(c.cost)}</div>
    <div class="c-sigils">${c.sigils.map((s) => ico(SIGILS[s].icon)).join('')}</div>
    ${c.custom ? '<div class="c-custom">NEW!</div>' : ''}
    <div class="c-stats">
      <span class="c-atk${c.wither ? ' hurt' : atk > c.atk ? ' buff' : ''}">${ico('atk')}${atk}</span>
      <span class="c-hp${hpNow < c.hp || c.wither ? ' hurt' : ''}">${hpNow}${ico('hp')}</span>
    </div>
    <div class="c-glare"></div>`;
}

/* ---------- Balatro-style hover tilt ----------
   The hovered card leans toward the pointer in 3D, pops slightly,
   and a glare follows the cursor. Works for any .card on the page. */
(function initCardTilt() {
  const MAX = 26; // degrees
  let cur = null, rect = null, lastUid = null;

  function release(el) {
    el.classList.remove('tilting');
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  }

  document.addEventListener('pointermove', (e) => {
    const hit = e.target && e.target.closest ? e.target.closest('.card') : null;
    const card = hit && !hit.classList.contains('tapped') && !hit.classList.contains('dying') ? hit : null;
    if (card !== cur) {
      if (cur) release(cur);
      cur = card;
      if (!cur) { lastUid = null; return; }
      rect = cur.getBoundingClientRect();
      cur.classList.add('tilting');
      // Pop on a genuinely new card, not when the same card is re-rendered under the cursor.
      const uid = cur.dataset.uid || cur.textContent;
      if (uid !== lastUid) cur.animate([{ scale: '1' }, { scale: '1.12' }, { scale: '1.06' }], { duration: 260, easing: 'ease-out' });
      lastUid = uid;
    }
    if (!cur) return;
    const nx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1));
    cur.style.setProperty('--ry', (nx * MAX).toFixed(2) + 'deg');
    cur.style.setProperty('--rx', (-ny * MAX).toFixed(2) + 'deg');
    cur.style.setProperty('--gx', ((nx + 1) * 50).toFixed(1) + '%');
    cur.style.setProperty('--gy', ((ny + 1) * 50).toFixed(1) + '%');
  }, { passive: true });

  document.addEventListener('pointerleave', () => { if (cur) release(cur); cur = null; lastUid = null; });
})();

/* Full description used by the inspector panels. */
function inspectHTML(c, atk = c.atk, hpNow = c.hp - (c.dmg || 0)) {
  const name = escapeHTML(c.name);
  if (c.type === 'land') {
    return `
      <div class="i-head"><span class="i-name">${name}</span></div>
      <div class="i-type">${COLORS[c.color].name} land</div>
      <div class="i-body"><img class="i-art" src="${spriteURL(c.sprite)}" alt=""></div>
      <div class="i-sigil">${ico(COLORS[c.color].icon)}<div>Play one land per turn. Each turn it gives 1 ${COLORS[c.color].name} energy, which also pays generic costs.</div></div>`;
  }
  if (c.type === 'spell' || c.type === 'trap') {
    const how = c.type === 'spell'
      ? 'Cast only on your own turn. It takes effect at once, then goes to your grave.'
      : 'Pay its cost on your turn to set it face-down. It springs by itself during the enemy\'s turn, then goes to your grave.';
    return `
      <div class="i-head"><span class="i-name">${name}</span><span class="i-cost">${costHTML(c.cost)}</span></div>
      <div class="i-type">${COLORS[c.color].name} ${c.type}</div>
      <div class="i-body"><img class="i-art" src="${spriteURL(c.sprite)}" alt=""></div>
      <div class="i-sigil">${ico(c.type)}<div>${escapeHTML(c.text)}</div></div>
      <div class="i-sigil muted">${how}</div>`;
  }
  return `
    <div class="i-head"><span class="i-name">${name}</span><span class="i-cost">${costHTML(c.cost)}</span></div>
    <div class="i-type">${COLORS[c.color].name} ${c.token ? 'token' : 'creature'}${c.custom ? ' &middot; custom' : ''}</div>
    <div class="i-body">
      <img class="i-art" src="${spriteURL(c.sprite)}" alt="">
      <div class="i-stats">${ico('atk')} ${atk}${atk > c.atk ? ` <span class="muted">(${c.atk}+${atk - c.atk})</span>` : ''}<br>${ico('hp')} ${hpNow}/${c.hp}</div>
    </div>
    ${c.sigils.map((s) => `<div class="i-sigil">${ico(SIGILS[s].icon)}<div><b>${sigilName(s, c)}.</b> ${SIGILS[s].text(c)}</div></div>`).join('') || '<div class="i-sigil muted">No sigils.</div>'}
    ${c.flavor ? `<div class="i-flavor">"${escapeHTML(c.flavor)}"</div>` : ''}`;
}
