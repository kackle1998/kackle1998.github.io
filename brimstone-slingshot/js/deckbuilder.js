'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — in-game deck builder
   Uses both the built-in cards and the player's Card Maker cards.
   ============================================================ */

const DB_PAGE = 12;
const DB = { deck: null, tab: 'all', source: 'all', page: 0, dirty: false, delArmed: false };

function dbBlankDeck() { return { id: null, name: 'My Deck', list: {}, art: null }; }
function dbFromSaved(s) { return { id: s.id, name: s.name, list: cleanDeckList(s.list), art: s.art || null }; }

/* `resume` returns to the deck being edited (e.g. coming back from the Card Maker). */
function showDeckBuilder(id, resume = false) {
  if (resume && DB.deck) DB.deck.list = cleanDeckList(DB.deck.list);
  else {
    const saved = id ? getSavedDecks().find((d) => d.id === id) : null;
    DB.deck = saved ? dbFromSaved(saved) : dbBlankDeck();
    DB.page = 0;
    DB.dirty = false;
  }
  $('#game').classList.add('hidden');
  showScreen(`
    <div class="db">
      <div class="db-top panel">
        <div class="db-title">DECK BUILDER</div>
        <input id="dbName" class="db-input" maxlength="20" spellcheck="false" aria-label="Deck name">
        <button class="btn sm" id="dbArt" title="Choose or draw this deck's art"><img id="dbArtImg" alt="">ART</button>
        <select id="dbLoad" class="db-input" aria-label="Load a deck"></select>
        <button class="btn sm" id="dbNew">NEW</button>
        <button class="btn sm" id="dbSave">SAVE</button>
        <button class="btn sm" id="dbDelete">DELETE</button>
        <span class="db-spacer"></span>
        <button class="btn sm" id="dbCardMaker">CARD MAKER</button>
        <button class="btn sm" id="dbBack">BACK</button>
      </div>
      <div class="db-left">
        <div class="db-filters">
          <div class="db-tabs" id="dbTabs"></div>
          <div class="db-tabs" id="dbSource"></div>
          <span class="db-pageinfo" id="dbPageInfo"></span>
        </div>
        <div class="db-gridwrap">
          <button class="db-arrow" id="dbPrev" aria-label="Previous page">&#9664;</button>
          <div class="db-grid" id="dbGrid"></div>
          <button class="db-arrow" id="dbNext" aria-label="Next page">&#9654;</button>
        </div>
        <div class="db-info panel" id="dbInfo"></div>
      </div>
      <div class="db-right panel">
        <div class="db-count" id="dbCount"></div>
        <div class="db-curve" id="dbCurve"></div>
        <div class="db-list" id="dbList"></div>
        <div class="db-lands" id="dbLands"></div>
        <div class="db-actions">
          <button class="btn sm" id="dbAuto">AUTO-COMPLETE</button>
          <button class="btn sm" id="dbClear">CLEAR</button>
          <button class="btn sm accent" id="dbPlay">PLAY</button>
        </div>
      </div>
    </div>`);

  $('#dbName').addEventListener('input', (e) => { DB.deck.name = e.target.value; DB.dirty = true; });
  $('#dbArt').onclick = () => dbArtOpen();
  $('#dbLoad').addEventListener('change', (e) => dbLoad(e.target.value));
  $('#dbNew').onclick = () => { DB.deck = dbBlankDeck(); DB.dirty = false; sfx('select'); dbRender(); dbArtOpen(); };
  $('#dbSave').onclick = () => { if (dbSave()) toast('Deck saved.'); };
  $('#dbDelete').onclick = dbDelete;
  $('#dbCardMaker').onclick = () => { sfx('select'); CardMaker.show(() => showDeckBuilder(null, true)); };
  $('#dbBack').onclick = () => { sfx('select'); showTitle(); };
  $('#dbPrev').onclick = () => { DB.page--; dbRender(); };
  $('#dbNext').onclick = () => { DB.page++; dbRender(); };
  $('#dbAuto').onclick = () => { dbAutoComplete(); sfx('place'); dbRender(); };
  $('#dbClear').onclick = () => { DB.deck.list = {}; DB.dirty = true; sfx('err'); dbRender(); };
  $('#dbPlay').onclick = dbPlay;
  dbInfoDefault();
  dbRender();
}

/* Called when another tab changes cards. */
function refreshDeckBuilder() {
  if (!DB.deck) return;
  DB.deck.list = cleanDeckList(DB.deck.list);
  dbRender();
}

/* ---------- data ---------- */
function dbPool() {
  const order = (c) => COLOR_KEYS.indexOf(c.color);
  return Object.values(CARDS)
    .filter((c) => c.type !== 'land' && !c.token && !c.runCard)
    .filter((c) => DB.tab === 'all' || c.color === DB.tab)
    .filter((c) => DB.source === 'all' || (DB.source === 'custom') === !!c.custom)
    .sort((a, b) => order(a) - order(b) || costTotal(a.cost) - costTotal(b.cost) || a.name.localeCompare(b.name));
}

function dbAdd(id, n = 1) {
  const list = DB.deck.list, c = CARDS[id];
  if (deckCount(list) >= DECK_SIZE) { toast(`A deck holds exactly ${DECK_SIZE} cards.`); sfx('err'); return false; }
  if (c.type !== 'land' && (list[id] || 0) >= MAX_COPIES) { toast(`Max ${MAX_COPIES} copies of a card.`); sfx('err'); return false; }
  list[id] = (list[id] || 0) + n;
  DB.dirty = true;
  return true;
}

function dbRemove(id) {
  const list = DB.deck.list;
  if (!list[id]) return false;
  if (--list[id] <= 0) delete list[id];
  DB.dirty = true;
  return true;
}

/* Fill the deck to 30: creatures up to 18 in the deck's colors, then lands by color demand. */
function dbAutoComplete() {
  const list = DB.deck.list;
  const count = (pred) => Object.entries(list).filter(([id]) => pred(CARDS[id])).reduce((a, [, n]) => a + n, 0);
  let colors = deckColors(Object.fromEntries(Object.entries(list).filter(([id]) => CARDS[id].type === 'creature')));
  if (!colors.length) colors = deckColors(list);
  if (!colors.length) colors = shuffle(COLOR_KEYS.slice()).slice(0, 2);
  colors = colors.slice(0, 2);

  const fits = (c) => COLOR_KEYS.every((k) => !c.cost[k] || colors.includes(k));
  const pool = Object.values(CARDS).filter((c) => c.type === 'creature' && !c.token && !c.runCard && fits(c));
  let creatures = count((c) => c.type !== 'land');
  const lands = count((c) => c.type === 'land');
  let room = DECK_SIZE - deckCount(list) - Math.max(0, 12 - lands);
  for (let guard = 0; creatures < 18 && room > 0 && guard < 200; guard++) {
    const open = pool.filter((c) => (list[c.id] || 0) < MAX_COPIES);
    if (!open.length) break;
    // Favor a low curve: cheap cards are more likely.
    const weighted = open.flatMap((c) => Array(Math.max(1, 6 - costTotal(c.cost))).fill(c));
    const pick = weighted[Math.floor(Math.random() * weighted.length)];
    list[pick.id] = (list[pick.id] || 0) + 1;
    creatures++; room--;
  }

  // Lands: split what's left by colored pip demand (largest remainder).
  let left = DECK_SIZE - deckCount(list);
  if (left <= 0) { DB.dirty = true; return; }
  const demand = {};
  colors.forEach((k) => (demand[k] = 0));
  for (const [id, n] of Object.entries(list)) {
    const c = CARDS[id];
    if (c.type !== 'land') colors.forEach((k) => (demand[k] += (c.cost[k] || 0) * n));
  }
  let total = colors.reduce((a, k) => a + demand[k], 0);
  if (!total) { colors.forEach((k) => (demand[k] = 1)); total = colors.length; }
  const shares = colors.map((k) => ({ k, exact: (left * demand[k]) / total }));
  shares.forEach((s) => (s.n = Math.floor(s.exact)));
  let given = shares.reduce((a, s) => a + s.n, 0);
  shares.sort((a, b) => (b.exact - b.n) - (a.exact - a.n));
  for (let i = 0; given < left; i = (i + 1) % shares.length, given++) shares[i].n++;
  shares.forEach((s) => { if (s.n) list['land_' + s.k] = (list['land_' + s.k] || 0) + s.n; });
  DB.dirty = true;
}

function dbSave() {
  const d = DB.deck;
  d.name = (d.name || '').trim() || 'My Deck';
  const decks = getSavedDecks();
  if (!d.id) d.id = 'd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const rec = { id: d.id, name: d.name, list: { ...d.list }, updated: Date.now() };
  if (d.art) rec.art = Array.isArray(d.art) ? cleanArtRows(d.art) : d.art;
  const i = decks.findIndex((x) => x.id === d.id);
  if (i >= 0) decks[i] = rec; else decks.push(rec);
  if (!saveSavedDecks(decks)) { toast('Could not save (storage blocked).'); sfx('err'); return false; }
  DB.dirty = false;
  sfx('place');
  dbRender();
  return true;
}

function dbDelete() {
  if (!DB.deck.id) { DB.deck = dbBlankDeck(); dbRender(); return; }
  if (!DB.delArmed) {
    DB.delArmed = true;
    $('#dbDelete').textContent = 'SURE?';
    setTimeout(() => { DB.delArmed = false; const b = $('#dbDelete'); if (b) b.textContent = 'DELETE'; }, 2000);
    return;
  }
  DB.delArmed = false;
  saveSavedDecks(getSavedDecks().filter((d) => d.id !== DB.deck.id));
  DB.deck = dbBlankDeck();
  toast('Deck deleted.');
  sfx('die');
  dbRender();
}

function dbLoad(value) {
  if (!value) return;
  if (value.startsWith('pre:')) {
    const p = DECKS[+value.slice(4)];
    DB.deck = { id: null, name: p.name + ' copy', list: { ...p.list }, art: p.feature };
  } else {
    const s = getSavedDecks().find((d) => d.id === value);
    if (s) DB.deck = dbFromSaved(s);
  }
  DB.dirty = false;
  sfx('select');
  dbRender();
}

function dbPlay() {
  if (deckCount(DB.deck.list) !== DECK_SIZE) { toast(`Your deck needs exactly ${DECK_SIZE} cards.`); sfx('err'); return; }
  if (!dbSave()) return;
  startGame(savedDeckToDef(DB.deck));
}

/* ---------- deck art picker ---------- */
function dbArtOpen(mode = 'choose') {
  sfx('select');
  let wrap = $('#daWrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'da-wrap';
    wrap.id = 'daWrap';
    wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) dbArtClose(); });
    $('.db').appendChild(wrap);
  }
  if (mode === 'draw') dbArtDraw(wrap); else dbArtChoose(wrap);
}

function dbArtClose() { const w = $('#daWrap'); if (w) w.remove(); }

function dbArtSet(art) {
  DB.deck.art = art;
  DB.dirty = true;
  dbArtClose();
  sfx('place');
  dbRender();
}

function dbArtHead(cur) {
  return `<div class="da-head">
    <div class="db-title">DECK ART</div>
    <img class="da-cur" src="${spriteURL(cur)}" alt="">
    <div class="da-curname">${escapeHTML(DB.deck.name || 'My Deck')}</div>
  </div>`;
}

function dbArtChoose(wrap) {
  const d = DB.deck, list = d.list;
  const cur = deckArtSprite(d, list), auto = autoDeckArt(list);
  const pick = typeof d.art === 'string' && SPRITES[d.art] ? d.art : null;
  const drawn = hasArtPixels(d.art);

  const inDeck = [...new Set(Object.keys(list).filter((id) => CARDS[id].type !== 'land').map((id) => CARDS[id].sprite))].filter((k) => SPRITES[k]);
  const mine = customIds.map((id) => CARDS[id].sprite).filter((k) => k.startsWith('spr_') && !inDeck.includes(k));
  const builtIn = Object.keys(SPRITES).filter((k) => !k.startsWith('spr_') && !k.startsWith('deck_') && !k.endsWith('_default') && !inDeck.includes(k));
  const section = (title, keys) => keys.length
    ? `<div class="da-h">${title}</div><div class="da-grid">${keys.map((k) => PixelEditor.artTile(k, PixelEditor.artLabel(k), pick === k)).join('')}</div>` : '';

  wrap.innerHTML = `<div class="da panel">
    ${dbArtHead(cur)}
    <div class="da-body">
      <div class="da-grid">
        <button class="da-tile new" id="daDraw" title="Draw your own 16x16 art"><b>+</b>${drawn ? 'EDIT MY<br>DRAWING' : 'DRAW<br>NEW ART'}</button>
        ${drawn ? `<button class="da-tile on" id="daKeep" title="Keep the art you drew"><img src="${spriteURL(cur)}" alt=""><span>My drawing</span></button>` : ''}
        <button class="da-tile${!pick && !drawn ? ' on' : ''}" id="daAuto" title="Use the deck's most expensive creature (changes as you build)">
          <img src="${spriteURL(auto)}" alt=""><span>Auto</span></button>
      </div>
      ${section('CARDS IN THIS DECK', inDeck)}
      ${section('MY CARD MAKER ART', mine)}
      ${section('ALL ART', builtIn)}
    </div>
    <div class="da-foot"><button class="btn sm" id="daCancel">${DB.deck.id || deckCount(list) ? 'CANCEL' : 'SKIP'}</button></div>
  </div>`;

  wrap.querySelectorAll('[data-art]').forEach((b) => (b.onclick = () => dbArtSet(b.dataset.art)));
  $('#daAuto').onclick = () => dbArtSet(null);
  if (drawn) $('#daKeep').onclick = () => { sfx('select'); dbArtClose(); };
  $('#daDraw').onclick = () => dbArtOpen('draw');
  $('#daCancel').onclick = () => { sfx('select'); dbArtClose(); };
}

function dbArtDraw(wrap) {
  const d = DB.deck;
  wrap.innerHTML = `<div class="da panel">
    ${dbArtHead(deckArtSprite(d))}
    <div class="da-body da-draw">
      <section class="cm-art">
        <div class="cm-tools">
          <div class="cm-pal" id="palette"></div>
          <div class="cm-toolbtns" id="tools"></div>
        </div>
        <canvas id="pix" width="352" height="352"></canvas>
        <div class="cm-toolbtns">
          <button class="tool" id="undoBtn">UNDO</button>
          <button class="tool" id="clearBtn">CLEAR</button>
          <button class="tool" id="flipBtn" title="Flip horizontally">FLIP</button>
          <button class="tool" data-shift="0,-1" title="Shift up">&#9650;</button>
          <button class="tool" data-shift="0,1" title="Shift down">&#9660;</button>
          <button class="tool" data-shift="-1,0" title="Shift left">&#9664;</button>
          <button class="tool" data-shift="1,0" title="Shift right">&#9654;</button>
        </div>
        <button class="btn sm cm-template" id="template" title="Copy any existing art onto the canvas">START FROM ART...</button>
      </section>
      <div class="da-side">
        <div class="da-h">PREVIEW</div>
        <div class="da-sizes" id="daSizes"></div>
        <p class="muted">Draw a 16 x 16 picture for this deck. It shows on the deck list when you choose a deck to play.</p>
        <p class="muted">Left-click paints, right-click erases. Start from any existing art with the button under the canvas.</p>
      </div>
    </div>
    <div class="da-foot">
      <button class="btn sm" id="daBack">BACK</button>
      <button class="btn sm accent" id="daUse">USE THIS ART</button>
    </div>
  </div>`;

  const preview = () => {
    SPRITES.deck_preview = PixelEditor.rows();
    const src = spriteURL('deck_preview');
    $('#daSizes').innerHTML = [96, 56, 32].map((n) => `<img src="${src}" alt="" style="width:${n}px;height:${n}px">`).join('');
  };
  PixelEditor.init({ onChange: preview, onToast: toast });
  PixelEditor.load(hasArtPixels(d.art) ? cleanArtRows(d.art) : Array(16).fill(PixelEditor.BLANK_ROW));
  preview();

  $('#daBack').onclick = () => dbArtOpen('choose');
  $('#daUse').onclick = () => {
    const rows = PixelEditor.rows();
    if (!hasArtPixels(rows)) { toast('Draw something first.'); sfx('err'); return; }
    dbArtSet(rows);
  };
}

/* ---------- rendering ---------- */
function dbInfoDefault() {
  $('#dbInfo').innerHTML = `<div class="i-help">
    <b>BUILDING A DECK</b>
    <p>Click a card to add it, right-click to remove it. Up to ${MAX_COPIES} copies of each creature, spell or trap; lands are unlimited.</p>
    <p>A deck needs exactly ${DECK_SIZE} cards. Around 12 lands is a good start. AUTO-COMPLETE fills the rest for you.</p>
    <p>Cards from your Card Maker update live while you edit them.</p></div>`;
}

function dbInfo(c) {
  const p = c.type === 'creature' ? `<div class="db-power muted">Power ${cardPower(c)} &middot; budget ~${cardBudget(c)}</div>` : '';
  $('#dbInfo').innerHTML = `<div class="db-info-in">${inspectHTML(c)}${p}</div>`;
}

function dbCardEl(c) {
  const el = document.createElement('div');
  el.className = `card ${c.type}`;
  el.innerHTML = cardInnerHTML(c);
  el.addEventListener('mouseenter', () => dbInfo(c));
  return el;
}

function dbRender() {
  if (!$('.db')) return;
  const d = DB.deck, list = d.list, total = deckCount(list);

  // top bar
  const nameEl = $('#dbName');
  if (document.activeElement !== nameEl) nameEl.value = d.name;
  $('#dbArtImg').src = spriteURL(deckArtSprite(d, list));
  const saved = getSavedDecks();
  $('#dbLoad').innerHTML = `<option value="">LOAD DECK...</option>` +
    (saved.length ? `<optgroup label="My decks">${saved.map((s) => `<option value="${escapeHTML(s.id)}">${escapeHTML(s.name)} (${deckCount(cleanDeckList(s.list))})</option>`).join('')}</optgroup>` : '') +
    `<optgroup label="Copy a premade">${DECKS.map((p, i) => `<option value="pre:${i}">${escapeHTML(p.name)}</option>`).join('')}</optgroup>`;
  $('#dbDelete').disabled = !d.id;

  // filters
  $('#dbTabs').innerHTML = ['all', ...COLOR_KEYS].map((k) =>
    `<button class="db-tab${DB.tab === k ? ' on' : ''}" data-k="${k}" title="${k === 'all' ? 'All colors' : COLORS[k].name}">${k === 'all' ? 'ALL' : ico(COLORS[k].icon)}</button>`).join('');
  const nCustom = customIds.length;
  $('#dbSource').innerHTML = [['all', 'ALL CARDS'], ['base', 'BASE'], ['custom', `MINE (${nCustom})`]].map(([k, label]) =>
    `<button class="db-tab${DB.source === k ? ' on' : ''}" data-s="${k}">${label}</button>`).join('');
  $$('#dbTabs .db-tab').forEach((b) => (b.onclick = () => { DB.tab = b.dataset.k; DB.page = 0; sfx('select'); dbRender(); }));
  $$('#dbSource .db-tab').forEach((b) => (b.onclick = () => { DB.source = b.dataset.s; DB.page = 0; sfx('select'); dbRender(); }));

  // grid
  const pool = dbPool();
  const pages = Math.max(1, Math.ceil(pool.length / DB_PAGE));
  DB.page = Math.max(0, Math.min(DB.page, pages - 1));
  $('#dbPageInfo').textContent = `PAGE ${DB.page + 1}/${pages}`;
  $('#dbPrev').disabled = DB.page === 0;
  $('#dbNext').disabled = DB.page >= pages - 1;
  const grid = $('#dbGrid');
  grid.innerHTML = '';
  if (!pool.length) {
    grid.innerHTML = `<div class="db-empty">${DB.source === 'custom' ? 'No custom cards yet.<br>Open the CARD MAKER to create some. They appear here automatically.' : 'No cards match.'}</div>`;
  }
  for (const c of pool.slice(DB.page * DB_PAGE, DB.page * DB_PAGE + DB_PAGE)) {
    const el = dbCardEl(c);
    const n = list[c.id] || 0;
    if (n) { el.classList.add('in-deck'); el.insertAdjacentHTML('beforeend', `<div class="db-badge">x${n}</div>`); }
    if (n >= MAX_COPIES || total >= DECK_SIZE) el.classList.add('maxed');
    el.addEventListener('click', () => { if (dbAdd(c.id)) { sfx('place'); dbRender(); } });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); if (dbRemove(c.id)) { sfx('select'); dbRender(); } });
    grid.appendChild(el);
  }

  // count & curve
  const creatures = Object.entries(list).filter(([id]) => CARDS[id].type !== 'land');
  const nCreat = creatures.filter(([id]) => CARDS[id].type === 'creature').reduce((a, [, n]) => a + n, 0);
  const landN = total - creatures.reduce((a, [, n]) => a + n, 0);
  $('#dbCount').innerHTML = `<span class="${total === DECK_SIZE ? 'ok' : total > DECK_SIZE ? 'bad' : ''}">${total}/${DECK_SIZE}</span>
    <span class="db-sub">${nCreat} creatures &middot; ${total - landN - nCreat} spells &amp; traps &middot; ${landN} lands${DB.dirty ? ' &middot; unsaved' : ''}</span>`;
  const curve = Array(7).fill(0);
  creatures.forEach(([id, n]) => (curve[Math.min(6, costTotal(CARDS[id].cost))] += n));
  const peak = Math.max(4, ...curve);
  $('#dbCurve').innerHTML = curve.map((n, i) =>
    `<div class="cv"><div class="cv-bar" style="height:${Math.round((n / peak) * 34)}px"></div><div class="cv-n">${n || ''}</div><div class="cv-l">${i === 6 ? '6+' : i}</div></div>`).join('');

  // deck list
  const rows = creatures.sort(([a], [b]) => costTotal(CARDS[a].cost) - costTotal(CARDS[b].cost) || CARDS[a].name.localeCompare(CARDS[b].name));
  $('#dbList').innerHTML = rows.map(([id, n]) => {
    const c = CARDS[id];
    return `<div class="db-row${c.custom ? ' custom' : ''}" data-id="${id}" title="Click to remove one">
      <span class="db-rcost">${costHTML(c.cost)}</span><span class="db-rname">${escapeHTML(c.name)}</span><span class="db-rn">x${n}</span></div>`;
  }).join('') || '<div class="muted db-none">Click cards on the left to add them.</div>';
  $$('#dbList .db-row').forEach((r) => {
    r.onclick = () => { dbRemove(r.dataset.id); sfx('select'); dbRender(); };
    r.onmouseenter = () => dbInfo(CARDS[r.dataset.id]);
  });

  // lands
  $('#dbLands').innerHTML = COLOR_KEYS.map((k) => {
    const id = 'land_' + k, n = list[id] || 0;
    return `<div class="db-land" data-id="${id}">${ico(COLORS[k].icon)}<span class="db-lname">${COLORS[k].land}</span>
      <button class="db-step" data-d="-1" aria-label="Remove ${COLORS[k].land}">-</button><span class="db-ln">${n}</span>
      <button class="db-step" data-d="1" aria-label="Add ${COLORS[k].land}">+</button></div>`;
  }).join('');
  $$('#dbLands .db-land').forEach((row) => {
    row.onmouseenter = () => dbInfo(CARDS[row.dataset.id]);
    row.querySelectorAll('.db-step').forEach((b) => (b.onclick = () => {
      const ok = b.dataset.d === '1' ? dbAdd(row.dataset.id) : dbRemove(row.dataset.id);
      if (ok) { sfx('select'); dbRender(); }
    }));
  });

  $('#dbPlay').disabled = total !== DECK_SIZE;
}
