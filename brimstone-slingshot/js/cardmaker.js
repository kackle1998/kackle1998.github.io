'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — Card Maker (a screen inside the game page)
   Every edit auto-saves to localStorage; another game tab on the
   same address picks the change up instantly via the 'storage' event.
   ============================================================ */

const CardMaker = (() => {
  let cur = null;          // record being edited
  let saveTimer = null;
  let back = null;         // where the BACK button returns to
  let delArmed = false;

  const isOpen = () => !!$('.cm-card');

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
    el.innerHTML = state === 'saving' ? 'SAVING...' : state === 'error' ? 'NOT SAVED: STORAGE BLOCKED' : 'SAVED';
  }

  function scheduleSave() {
    setSync('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 300);
  }

  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!cur || !isOpen()) return;
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
  function stepper(label, iconHTML, key, value) {
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
      // Move the old color's pips to the new color, which is what you almost always want.
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

  /* ---------- wiring ---------- */
  function changed() { renderForm(); renderBalance(); renderPreview(); scheduleSave(); }

  function renderAll() {
    renderList();
    renderForm();
    renderBalance();
    renderPreview();
  }

  function deleteCard() {
    if (!delArmed) {
      delArmed = true;
      $('#delBtn').textContent = 'SURE?';
      setTimeout(() => { delArmed = false; if (isOpen()) $('#delBtn').textContent = 'DELETE'; }, 2000);
      return;
    }
    delArmed = false;
    clearTimeout(saveTimer);
    saveCustomRecords(records().filter((r) => r.id !== cur.id));
    toast(`Deleted ${cur.name}.`);
    const rest = records();
    cur = null;
    if (rest.length) openCard(rest[rest.length - 1].id); else createCard();
  }

  function exportCards() {
    saveNow();
    const blob = new Blob([JSON.stringify(records(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'brimstone-cards.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importCards(e) {
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
  }

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
    if (!isOpen()) return;
    createCard({ ...data, author, name: String(data.name).slice(0, 16) });
    toast(`Copied ${data.name} by ${author}.`);
  }

  /* ---------- open / close ---------- */
  function show(onBack = showTitle) {
    back = onBack;
    cur = null;
    $('#game').classList.add('hidden');
    showScreen(`
      <div class="cm cm-card">
        <div class="cm-top panel">
          <div class="cm-logo">CARD MAKER</div>
          <div class="cm-sync" id="sync"></div>
          <span class="db-spacer"></span>
          <div id="acctSlot"></div>
          <button class="btn sm hidden" id="communityBtn" title="Browse cards made by other players">COMMUNITY</button>
          <button class="btn sm" id="exportBtn" title="Download all your cards as a .json backup">EXPORT</button>
          <button class="btn sm" id="importBtn" title="Load cards from a .json file">IMPORT</button>
          <input type="file" id="importFile" accept=".json,application/json" hidden>
          <button class="btn sm" id="cmBack">BACK</button>
        </div>

        <section class="cm-col cm-list panel">
          <div class="cm-h">MY CARDS <span id="cardCount"></span></div>
          <input class="db-input cm-search" id="search" placeholder="Search..." spellcheck="false" aria-label="Search cards">
          <div class="cm-cards" id="cardList"></div>
          <button class="btn sm" id="newBtn">+ NEW CARD</button>
        </section>

        <section class="cm-col cm-form panel" id="form">
          <div class="cm-h">CARD DETAILS</div>
          <label class="cm-field"><span>NAME</span>
            <input class="db-input" id="fName" maxlength="16" spellcheck="false">
          </label>
          <div class="cm-field"><span>COLOR</span><div class="cm-colors" id="fColor"></div></div>
          <div class="cm-field"><span>COST</span><div class="cm-steppers" id="fCost"></div></div>
          <div class="cm-field"><span>STATS</span><div class="cm-steppers" id="fStats"></div></div>
          <div class="cm-field"><span>SIGILS <em class="muted">(up to 4)</em></span><div class="cm-sigils" id="fSigils"></div></div>
          <label class="cm-field"><span>FLAVOR TEXT</span>
            <input class="db-input" id="fFlavor" maxlength="80" spellcheck="true">
          </label>
          <div class="cm-balance" id="balance"></div>
          <div class="cm-actions">
            <button class="btn sm" id="dupBtn">DUPLICATE</button>
            <button class="btn sm" id="delBtn">DELETE</button>
          </div>
        </section>

        <section class="cm-col cm-art panel">
          <div class="cm-h">PIXEL ART <span class="muted">16 x 16</span></div>
          <div class="cm-tools">
            <div class="cm-pal" id="palette"></div>
            <div class="cm-toolbtns" id="tools"></div>
          </div>
          <canvas id="pix" width="352" height="352"></canvas>
          <div class="cm-toolbtns">
            <button class="tool" id="undoBtn" title="Undo (Ctrl+Z)">UNDO</button>
            <button class="tool" id="clearBtn">CLEAR</button>
            <button class="tool" id="flipBtn" title="Flip horizontally">FLIP</button>
            <button class="tool" data-shift="0,-1" title="Shift up">&#9650;</button>
            <button class="tool" data-shift="0,1" title="Shift down">&#9660;</button>
            <button class="tool" data-shift="-1,0" title="Shift left">&#9664;</button>
            <button class="tool" data-shift="1,0" title="Shift right">&#9654;</button>
          </div>
          <button class="btn sm cm-template" id="template" title="Copy any existing art onto the canvas">START FROM ART...</button>
        </section>

        <section class="cm-col cm-preview panel">
          <div class="cm-h">PREVIEW</div>
          <div class="cm-cardwrap"><div class="card creature" id="preview"></div></div>
          <div class="cm-inspect" id="inspect"></div>
        </section>
      </div>`);

    PixelEditor.init({ onChange: () => { renderPreview(); scheduleSave(); }, onToast: toast });

    $('#fName').addEventListener('input', (e) => { cur.name = e.target.value; renderPreview(); scheduleSave(); });
    $('#fFlavor').addEventListener('input', (e) => { cur.flavor = e.target.value; renderPreview(); scheduleSave(); });
    $('#search').addEventListener('input', renderList);
    $('#newBtn').onclick = () => createCard();
    $('#dupBtn').onclick = () => { saveNow(); createCard({ ...cur, name: (cur.name + ' II').slice(0, 16) }); toast('Card duplicated.'); };
    $('#delBtn').onclick = deleteCard;
    $('#exportBtn').onclick = exportCards;
    $('#importBtn').onclick = () => $('#importFile').click();
    $('#importFile').addEventListener('change', importCards);
    $('#cmBack').onclick = leave;
    if (Cloud.enabled) {
      $('#communityBtn').classList.remove('hidden');
      $('#communityBtn').onclick = () => { saveNow(); openCommunity(); };
    }
    Cloud.mount($('#acctSlot'));

    setSync('ok');
    delArmed = false;
    const list = records();
    if (list.length) openCard(list[list.length - 1].id);
    else createCard();
  }

  function leave() {
    if (saveTimer) saveNow();
    cur = null;
    sfx('select');
    back();
  }

  document.addEventListener('keydown', (e) => {
    if (!isOpen() || $('.acct-modal')) return;
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); toast('Saved.'); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); PixelEditor.undo(); }
  });

  /* Another tab (or a cloud pull) changed things: refresh the list, keep our edit. */
  onSharedChange(() => {
    if (!isOpen()) return;
    renderList();
    if (cur && !records().some((r) => r.id === cur.id)) { toast('This card was deleted in another tab.'); cur = null; const r = records(); if (r.length) openCard(r[0].id); else createCard(); }
  });

  return { show };
})();
