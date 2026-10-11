'use strict';
/* ============================================================
   NIGHTSHADE SPELLSLINGING — in-game deck builder
   Uses both the built-in cards and the player's Card Maker cards.
   ============================================================ */

const DB_PAGE = 12;
const DB = { deck: null, tab: 'all', source: 'all', page: 0, dirty: false, delArmed: false };

function dbBlankDeck() { return { id: null, name: 'My Deck', list: {} }; }

function showDeckBuilder(id) {
  const saved = id ? getSavedDecks().find((d) => d.id === id) : null;
  DB.deck = saved ? { id: saved.id, name: saved.name, list: cleanDeckList(saved.list) } : dbBlankDeck();
  DB.page = 0;
  DB.dirty = false;
  $('#game').classList.add('hidden');
  showScreen(`
    <div class="db">
      <div class="db-top panel">
        <div class="db-title">DECK BUILDER</div>
        <input id="dbName" class="db-input" maxlength="20" spellcheck="false" aria-label="Deck name">
        <select id="dbLoad" class="db-input" aria-label="Load a deck"></select>
        <button class="btn sm" id="dbNew">NEW</button>
        <button class="btn sm" id="dbSave">SAVE</button>
        <button class="btn sm" id="dbDelete">DELETE</button>
        <span class="db-spacer"></span>
        <a class="btn sm" href="cardmaker.html" id="dbCardMaker">CARD MAKER</a>
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
  $('#dbLoad').addEventListener('change', (e) => dbLoad(e.target.value));
  $('#dbNew').onclick = () => { DB.deck = dbBlankDeck(); DB.dirty = false; sfx('select'); dbRender(); };
  $('#dbSave').onclick = () => { if (dbSave()) toast('Deck saved.'); };
  $('#dbDelete').onclick = dbDelete;
  $('#dbBack').onclick = () => { sfx('select'); showTitle(); };
  // The Card Maker replaces this page, so don't silently drop an unsaved deck.
  $('#dbCardMaker').onclick = (e) => {
    if (DB.dirty && !confirm('Leave the deck builder? Your unsaved deck changes will be lost.')) e.preventDefault();
  };
  $('#dbPrev').onclick = () => { DB.page--; dbRender(); };
  $('#dbNext').onclick = () => { DB.page++; dbRender(); };
  $('#dbAuto').onclick = () => { dbAutoComplete(); sfx('place'); dbRender(); };
  $('#dbClear').onclick = () => { DB.deck.list = {}; DB.dirty = true; sfx('err'); dbRender(); };
  $('#dbPlay').onclick = dbPlay;
  dbInfoDefault();
  dbRender();
}

/* Called when the Card Maker changes cards in another tab. */
function refreshDeckBuilder() {
  if (!DB.deck) return;
  DB.deck.list = cleanDeckList(DB.deck.list);
  dbRender();
}

/* ---------- data ---------- */
function dbPool() {
  const order = (c) => COLOR_KEYS.indexOf(c.color);
  return Object.values(CARDS)
    .filter((c) => c.type !== 'land' && !c.token)
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

/* Fill the deck to 30: creatures up to 18 in the deck's colours, then lands by colour demand. */
function dbAutoComplete() {
  const list = DB.deck.list;
  const count = (pred) => Object.entries(list).filter(([id]) => pred(CARDS[id])).reduce((a, [, n]) => a + n, 0);
  let colors = deckColors(Object.fromEntries(Object.entries(list).filter(([id]) => CARDS[id].type === 'creature')));
  if (!colors.length) colors = deckColors(list);
  if (!colors.length) colors = shuffle(COLOR_KEYS.slice()).slice(0, 2);
  colors = colors.slice(0, 2);

  const fits = (c) => COLOR_KEYS.every((k) => !c.cost[k] || colors.includes(k));
  const pool = Object.values(CARDS).filter((c) => c.type === 'creature' && !c.token && fits(c));
  let creatures = count((c) => c.type !== 'land');
  const lands = count((c) => c.type === 'land');
  let room = DECK_SIZE - deckCount(list) - Math.max(0, 12 - lands);
  for (let guard = 0; creatures < 18 && room > 0 && guard < 200; guard++) {
    const open = pool.filter((c) => (list[c.id] || 0) < MAX_COPIES);
    if (!open.length) break;
    // Favour a low curve: cheap cards are more likely.
    const weighted = open.flatMap((c) => Array(Math.max(1, 6 - costTotal(c.cost))).fill(c));
    const pick = weighted[Math.floor(Math.random() * weighted.length)];
    list[pick.id] = (list[pick.id] || 0) + 1;
    creatures++; room--;
  }

  // Lands: split what's left by coloured pip demand (largest remainder).
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
    DB.deck = { id: null, name: p.name + ' copy', list: { ...p.list } };
  } else {
    const s = getSavedDecks().find((d) => d.id === value);
    if (s) DB.deck = { id: s.id, name: s.name, list: cleanDeckList(s.list) };
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

/* ---------- rendering ---------- */
function dbInfoDefault() {
  $('#dbInfo').innerHTML = `<div class="i-help">
    <b>BUILDING A DECK</b>
    <p>Click a card to add it, right-click to remove it. Up to ${MAX_COPIES} copies of each creature, spell or trap; lands are unlimited.</p>
    <p>A deck needs exactly ${DECK_SIZE} cards. Around 12 lands is a good start. AUTO-COMPLETE fills the rest for you.</p>
    <p>Cards marked <span class="c-custom inline">NEW!</span> come from your Card Maker and update live while you edit them.</p></div>`;
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
  const saved = getSavedDecks();
  $('#dbLoad').innerHTML = `<option value="">LOAD DECK...</option>` +
    (saved.length ? `<optgroup label="My decks">${saved.map((s) => `<option value="${escapeHTML(s.id)}">${escapeHTML(s.name)} (${deckCount(cleanDeckList(s.list))})</option>`).join('')}</optgroup>` : '') +
    `<optgroup label="Copy a premade">${DECKS.map((p, i) => `<option value="pre:${i}">${escapeHTML(p.name)}</option>`).join('')}</optgroup>`;
  $('#dbDelete').disabled = !d.id;

  // filters
  $('#dbTabs').innerHTML = ['all', ...COLOR_KEYS].map((k) =>
    `<button class="db-tab${DB.tab === k ? ' on' : ''}" data-k="${k}" title="${k === 'all' ? 'All colours' : COLORS[k].name}">${k === 'all' ? 'ALL' : ico(COLORS[k].icon)}</button>`).join('');
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
