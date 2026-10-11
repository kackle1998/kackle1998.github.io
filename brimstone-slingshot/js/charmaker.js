'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — Character Maker
   Draws the player's portrait. Saved to localStorage like custom
   cards, so an open game tab swaps the art in live.
   ============================================================ */

const $ = (s) => document.querySelector(s);

let name = '';
let saveTimer = null;

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}

/* ---------- saving ---------- */
function setSync(state) {
  const el = $('#sync');
  el.className = 'cm-sync ' + state;
  el.innerHTML = state === 'saving' ? 'SAVING...' : state === 'error' ? 'NOT SAVED: STORAGE BLOCKED' : 'SAVED &middot; SYNCED TO GAME';
}

function scheduleSave() {
  setSync('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
}

function saveNow() {
  clearTimeout(saveTimer);
  setSync(saveHeroRecord({ name: name.trim(), pixels: PixelEditor.rows(), updated: Date.now() }) ? 'ok' : 'error');
}

/* ---------- preview ---------- */
function renderPreview() {
  SPRITES.hero = PixelEditor.rows();
  const src = spriteURL('hero');
  $('#panelPreview').innerHTML = `
    <div class="pp-head">
      <img class="portrait" src="${src}" alt="">
      <div><div class="pp-name">${escapeHTML(name.trim() || HERO_DEFAULT_NAME)}</div><div class="pp-deck">${escapeHTML(DECKS[0].name)}</div></div>
      <div class="pp-life">${ico('hp')}<b>20</b></div>
    </div>
    <div class="pp-stats"><span>DECK 24</span><span>HAND 5</span><span>GRAVE 0</span></div>`;
  $('#sizePreview').innerHTML = [96, 48, 32].map((n) => `<img src="${src}" alt="" style="width:${n}px;height:${n}px">`).join('');
}

/* ---------- wiring ---------- */
PixelEditor.init({ onChange: () => { renderPreview(); scheduleSave(); }, onToast: toast });

$('#fName').addEventListener('input', (e) => { name = e.target.value; renderPreview(); scheduleSave(); });

$('#resetBtn').onclick = () => {
  name = Cloud.user() || '';
  $('#fName').value = name;
  PixelEditor.apply(expandSprite(SPRITES.hero_default));
  toast('Back to the default character. UNDO restores your art.');
};

document.addEventListener('keydown', (e) => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); toast('Saved.'); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); PixelEditor.undo(); }
});

/* Another Character Maker tab saved: pick up its version. */
function loadFromStore() {
  const d = getHeroRecord();
  name = Cloud.user() || (d && d.name) || '';
  $('#fName').value = name;
  PixelEditor.load(expandSprite(SPRITES.hero));
  renderPreview();
}
onSharedChange((key) => { if (key === HERO_KEY || key === null) loadFromStore(); });

/* ---------- boot ---------- */
setSync('ok');
loadFromStore();
Cloud.mount($('#acctSlot'));
// Logged in: the character's name is the account's username.
if (Cloud.user()) {
  $('#fName').readOnly = true;
  $('#fName').title = 'Your name is your account username.';
}
