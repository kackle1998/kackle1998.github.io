'use strict';
/* ============================================================
   NIGHTSHADE SPELLSLINGING — Card Maker
   Every edit auto-saves to localStorage; an open game tab on the
   same address picks the change up instantly via the 'storage' event.
   ============================================================ */

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let cur = null;          // record being edited
let saveTimer = null;

/* ---------- helpers ---------- */
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}

function newRecord() {
  return {
    id: newCustomId(), name: 'New Card', color: 'paw',
    cost: { g: 1, paw: 1, bone: 0, gem: 0, hat: 0 }, atk: 2, hp: 2,
    sigils: [], snipe: 1, mend: 2, flavor: '', pixels: Array(PixelEditor.SIZE).fill(PixelEditor.BLANK_ROW),
  };
}

function records() { return getCustomRecords(); }

/* ---------- saving ---------- */
function setSync(state) {
  const el = $('#sync');
  el.className = 'cm-sync ' + state;
  el.innerHTML = state === 'saving' ? 'SAVING...' : state === 'error' ? 'COULD NOT SAVE (storage blocked)' : 'SAVED &middot; SYNCED TO GAME';
}

function scheduleSave() {
  setSync('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
}

function saveNow() {
  clearTimeout(saveTimer);
  if (!cur) return;
  cur.pixels = PixelEditor.rows();
  cur.name = (cur.name || '').trim() || 'Unnamed';
  cur.updated = Date.now();
  const list = records();
  const i = list.findIndex((r) => r.id === cur.id);
  if (i >= 0) list[i] = cur; else list.push(cur);
  setSync(saveCustomRecords(list) ? 'ok' : 'error');
  renderList();
}

/* ---------- card list ---------- */
function renderList() {
  const q = $('#search').value.trim().toLowerCase();
  const list = records();
  $('#cardCount').textContent = `(${list.length})`;
  const shown = list.filter((r) => !q || String(r.name).toLowerCase().includes(q));
  $('#cardList').innerHTML = shown.map((r) => {
    const c = customToCard(r);
    if (!c) return '';
    return `<button class="cm-item${cur && r.id === cur.id ? ' on' : ''}" data-id="${escapeHTML(r.id)}">
      <img src="${spriteURL(c.sprite)}" alt=""><span class="cm-iname">${escapeHTML(c.name)}</span>
      <span class="cm-icost">${costHTML(c.cost)}</span><span class="cm-istats">${c.atk}/${c.hp}</span></button>`;
  }).join('') || `<div class="muted cm-empty">${list.length ? 'No matches.' : 'No cards yet.'}</div>`;
  $$('.cm-item').forEach((b) => (b.onclick = () => openCard(b.dataset.id)));
}

function openCard(id) {
  if (cur) saveNow();
  const r = records().find((x) => x.id === id);
  if (!r) return;
  cur = JSON.parse(JSON.stringify(r));
  cur.cost = { g: 0, paw: 0, bone: 0, gem: 0, hat: 0, ...cur.cost };
  cur.sigils = cur.sigils || [];
  cur.snipe = cur.snipe || 1;
  cur.mend = cur.mend || 2;
  PixelEditor.load(cur.pixels || []);
  renderAll();
}

function createCard(base) {
  if (cur) saveNow();
  cur = base ? { ...JSON.parse(JSON.stringify(base)), id: newCustomId() } : newRecord();
  PixelEditor.load(cur.pixels);
  saveNow();
  renderAll();
  $('#fName').focus();
  $('#fName').select();
}

/* ---------- form ---------- */
function stepper(label, iconHTML, key, value, min, max) {
  return `<div class="cm-step" data-key="${key}">
    <span class="cm-slabel">${iconHTML}${label}</span>
    <button class="db-step" data-d="-1" aria-label="Decrease ${label || key}">-</button>
    <span class="cm-sval">${value}</span>
    <button class="db-step" data-d="1" aria-label="Increase ${label || key}">+</button></div>`;
}

const LIMITS = { g: [0, 9], paw: [0, 5], bone: [0, 5], gem: [0, 5], hat: [0, 5], atk: [0, 20], hp: [1, 30], snipe: [1, 9], mend: [1, 9] };

function getVal(key) { return key in cur.cost ? cur.cost[key] : cur[key]; }
function setVal(key, v) {
  const [lo, hi] = LIMITS[key];
  v = Math.max(lo, Math.min(hi, v));
  if (key in cur.cost) cur.cost[key] = v; else cur[key] = v;
}

function renderForm() {
  const f = $('#fName');
  if (document.activeElement !== f) f.value = cur.name;
  const fl = $('#fFlavor');
  if (document.activeElement !== fl) fl.value = cur.flavor || '';

  $('#fColor').innerHTML = COLOR_KEYS.map((k) =>
    `<button class="cm-color${cur.color === k ? ' on' : ''}" data-k="${k}">${ico(COLORS[k].icon)}<span>${COLORS[k].name}</span></button>`).join('');
  $$('.cm-color').forEach((b) => (b.onclick = () => {
    const old = cur.color;
    cur.color = b.dataset.k;
    // Move the old colour's pips to the new colour, which is what you almost always want.
    if (old !== cur.color && cur.cost[old]) { cur.cost[cur.color] += cur.cost[old]; cur.cost[old] = 0; setVal(cur.color, cur.cost[cur.color]); }
    changed();
  }));

  $('#fCost').innerHTML = stepper('ANY', '', 'g', cur.cost.g) +
    COLOR_KEYS.map((k) => stepper('', ico(COLORS[k].icon), k, cur.cost[k])).join('');
  $('#fStats').innerHTML = stepper('ATK', ico('atk'), 'atk', cur.atk) + stepper('HP', ico('hp'), 'hp', cur.hp);

  $('#fSigils').innerHTML = Object.entries(SIGILS).map(([k, s]) => {
    const on = cur.sigils.includes(k);
    const extra = on && (k === 'snipe' || k === 'mend') ? stepper('', '', k, cur[k]) : '';
    return `<div class="cm-sigil${on ? ' on' : ''}" data-k="${k}" title="${escapeHTML(s.text({ snipe: 'N', mend: 'N' }))}">
      ${ico(s.icon)}<span>${s.name}</span>${extra}</div>`;
  }).join('');
  $$('.cm-sigil').forEach((el) => (el.onclick = (e) => {
    if (e.target.closest('.cm-step')) return;
    const k = el.dataset.k, i = cur.sigils.indexOf(k);
    if (i >= 0) cur.sigils.splice(i, 1);
    else if (cur.sigils.length >= 4) { toast('A card can have at most 4 sigils.'); return; }
    else cur.sigils.push(k);
    changed();
  }));

  $$('#form .cm-step').forEach((st) => st.querySelectorAll('.db-step').forEach((b) => (b.onclick = () => {
    const key = st.dataset.key;
    setVal(key, getVal(key) + +b.dataset.d);
    changed();
  })));

  $('#delBtn').textContent = 'DELETE';
}

function renderBalance() {
  const c = customToCard({ ...cur, pixels: null });
  const p = cardPower(c), b = cardBudget(c);
  const r = p / b;
  const [label, cls] = r > 1.4 ? ['OVERPOWERED', 'bad'] : r > 1.15 ? ['STRONG', 'warn'] : r < 0.6 ? ['VERY WEAK', 'bad'] : r < 0.85 ? ['WEAK', 'warn'] : ['BALANCED', 'ok'];
  const pct = Math.max(4, Math.min(100, (r / 2) * 100));
  $('#balance').innerHTML = `
    <div class="cm-bal-top"><span>BALANCE</span><b class="${cls}">${label}</b></div>
    <div class="cm-meter"><div class="cm-meter-fill ${cls}" style="width:${pct}%"></div><div class="cm-meter-mid"></div></div>
    <div class="muted cm-bal-note">Power ${p} vs ~${b} expected for ${costTotal(c.cost)} energy. A rough guide based on the built-in cards.</div>`;
}

/* ---------- preview ---------- */
function renderPreview() {
  SPRITES['spr_' + cur.id] = PixelEditor.rows();
  const c = customToCard({ ...cur, pixels: PixelEditor.rows() });
  if (!c) return;
  $('#preview').innerHTML = cardInnerHTML(c);
  $('#inspect').innerHTML = inspectHTML(c);
}

/* ---------- pixel editor ---------- */
PixelEditor.init({ onChange: () => { renderPreview(); scheduleSave(); }, onToast: toast });

/* ---------- wiring ---------- */
function changed() { renderForm(); renderBalance(); renderPreview(); scheduleSave(); }

function renderAll() {
  renderList();
  renderForm();
  renderBalance();
  renderPreview();
}

$('#fName').addEventListener('input', (e) => { cur.name = e.target.value; renderPreview(); scheduleSave(); });
$('#fFlavor').addEventListener('input', (e) => { cur.flavor = e.target.value; renderPreview(); scheduleSave(); });
$('#search').addEventListener('input', renderList);
$('#newBtn').onclick = () => createCard();
$('#dupBtn').onclick = () => { saveNow(); createCard({ ...cur, name: (cur.name + ' II').slice(0, 16) }); toast('Card duplicated.'); };

let delArmed = false;
$('#delBtn').onclick = () => {
  if (!delArmed) {
    delArmed = true;
    $('#delBtn').textContent = 'SURE?';
    setTimeout(() => { delArmed = false; $('#delBtn').textContent = 'DELETE'; }, 2000);
    return;
  }
  delArmed = false;
  clearTimeout(saveTimer);
  saveCustomRecords(records().filter((r) => r.id !== cur.id));
  toast(`Deleted ${cur.name}.`);
  const rest = records();
  cur = null;
  if (rest.length) openCard(rest[rest.length - 1].id); else createCard();
};

$('#exportBtn').onclick = () => {
  saveNow();
  const blob = new Blob([JSON.stringify(records(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'nightshade-cards.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = (Array.isArray(data) ? data : []).filter((r) => customToCard(r));
    if (!incoming.length) { toast('No valid cards in that file.'); return; }
    saveNow();
    const list = records();
    for (const r of incoming) {
      const i = list.findIndex((x) => x.id === r.id);
      if (i >= 0) list[i] = r; else list.push(r);
    }
    saveCustomRecords(list);
    toast(`Imported ${incoming.length} card${incoming.length === 1 ? '' : 's'}.`);
    openCard(incoming[0].id);
  } catch (err) {
    toast('Could not read that file.');
  }
});

/* ---------- community: browse everyone's cards, copy one into yours ---------- */
const COM = { page: 0, search: '', cards: [] };

function openCommunity() {
  const wrap = document.createElement('div');
  wrap.className = 'acct-modal';
  wrap.innerHTML = `<div class="com-box panel">
    <div class="com-top"><div class="cm-h">COMMUNITY CARDS</div>
      <input class="db-input" id="comSearch" placeholder="Search names..." spellcheck="false" aria-label="Search community cards">
      <button class="btn sm" id="comPrev">&#9664;</button><span id="comPage"></span><button class="btn sm" id="comNext">&#9654;</button>
      <button class="btn sm" id="comClose">CLOSE</button></div>
    <div class="com-grid" id="comGrid"></div></div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  $('#comClose').onclick = close;
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  let t = null;
  $('#comSearch').value = COM.search;
  $('#comSearch').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { COM.search = e.target.value; COM.page = 0; loadCommunity(); }, 300); });
  $('#comPrev').onclick = () => { COM.page--; loadCommunity(); };
  $('#comNext').onclick = () => { COM.page++; loadCommunity(); };
  $('#comSearch').focus();
  loadCommunity();
}

async function loadCommunity() {
  const grid = $('#comGrid');
  grid.innerHTML = '<div class="muted">Loading...</div>';
  try {
    const res = await Cloud.browseCards({ page: COM.page, search: COM.search });
    if (!$('#comGrid')) return;
    COM.cards = res.cards;
    $('#comPage').textContent = `PAGE ${COM.page + 1}`;
    $('#comPrev').disabled = COM.page === 0;
    $('#comNext').disabled = !res.more;
    const me = Cloud.user();
    grid.innerHTML = res.cards.map((r, i) => {
      const c = customToCard(r);
      if (!c) return '';
      if (c.sprite === 'spr_' + c.id) SPRITES[c.sprite] = r.pixels.map((row) => String(row).replace(/[^.#+\-w]/g, '.'));
      const mine = me && r.author === me;
      return `<div class="com-item"><div class="card creature">${cardInnerHTML(c)}</div>
        <div class="com-by muted">by ${escapeHTML(r.author)}</div>
        <button class="btn sm" data-i="${i}" ${mine ? 'disabled title="This is your card"' : ''}>COPY</button></div>`;
    }).join('') || `<div class="muted">${COM.search ? 'No matches.' : 'No cards shared yet.'}</div>`;
    grid.querySelectorAll('button[data-i]').forEach((b) => (b.onclick = () => copyCommunityCard(COM.cards[+b.dataset.i])));
  } catch (e) {
    grid.innerHTML = '<div class="muted">Could not reach the server.</div>';
  }
}

function copyCommunityCard(r) {
  const { author, ...data } = r;
  createCard({ ...data, author, name: String(data.name).slice(0, 16) });
  toast(`Copied ${data.name} by ${author}.`);
}

if (Cloud.enabled) {
  $('#communityBtn').classList.remove('hidden');
  $('#communityBtn').onclick = () => { saveNow(); openCommunity(); };
}
Cloud.mount($('#acctSlot'));

document.addEventListener('keydown', (e) => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); toast('Saved.'); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); PixelEditor.undo(); }
});

/* Another Card Maker tab changed things: refresh the list, keep our edit. */
onSharedChange(() => {
  renderList();
  if (cur && !records().some((r) => r.id === cur.id)) { toast('This card was deleted in another tab.'); cur = null; const r = records(); if (r.length) openCard(r[0].id); else createCard(); }
});

/* ---------- boot ---------- */
setSync('ok');
{
  const list = records();
  if (list.length) openCard(list[list.length - 1].id);
  else createCard();
}
