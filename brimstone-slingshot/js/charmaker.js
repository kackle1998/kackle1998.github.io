'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — Character Maker (a screen inside the game page)
   Draws the player's portrait. Saved to localStorage like custom
   cards, so another game tab swaps the art in live.
   ============================================================ */

const CharMaker = (() => {
  let name = '';
  let saveTimer = null;
  let back = null;         // where the BACK button returns to

  const isOpen = () => !!$('.cm-char');

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
    if (!isOpen()) return;
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

  function loadFromStore() {
    const d = getHeroRecord();
    name = Cloud.user() || (d && d.name) || '';
    $('#fName').value = name;
    PixelEditor.load(expandSprite(SPRITES.hero));
    renderPreview();
  }

  /* ---------- open / close ---------- */
  function show(onBack = showTitle) {
    back = onBack;
    $('#game').classList.add('hidden');
    showScreen(`
      <div class="cm cm-char">
        <div class="cm-top panel">
          <div class="cm-logo">CHARACTER MAKER</div>
          <div class="cm-sync" id="sync"></div>
          <span class="db-spacer"></span>
          <div id="acctSlot"></div>
          <button class="btn sm" id="chBack">BACK</button>
        </div>

        <section class="cm-col cm-form panel">
          <div class="cm-h">CHARACTER DETAILS</div>
          <label class="cm-field"><span>NAME</span>
            <input class="db-input" id="fName" maxlength="12" spellcheck="false" placeholder="YOU">
          </label>
          <div class="cm-field"><span>IN THE GAME</span>
            <div class="ppanel panel ch-panel" id="panelPreview"></div>
          </div>
          <div class="cm-field"><span>PORTRAIT SIZES</span>
            <div class="ch-sizes" id="sizePreview"></div>
          </div>
          <div class="muted ch-note">Your character replaces the default portrait in your player panel and on the victory screen. Changes save automatically.</div>
          <div class="cm-actions">
            <button class="btn sm" id="resetBtn" title="Go back to the built-in character">RESET TO DEFAULT</button>
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
          <select class="db-input cm-template" id="template" aria-label="Start from built-in art"></select>
        </section>
      </div>`);

    PixelEditor.init({ onChange: () => { renderPreview(); scheduleSave(); }, onToast: toast });

    $('#fName').addEventListener('input', (e) => { name = e.target.value; renderPreview(); scheduleSave(); });
    $('#resetBtn').onclick = () => {
      name = Cloud.user() || '';
      $('#fName').value = name;
      PixelEditor.apply(expandSprite(SPRITES.hero_default));
      toast('Back to the default character. UNDO restores your art.');
    };
    $('#chBack').onclick = leave;

    setSync('ok');
    loadFromStore();
    Cloud.mount($('#acctSlot'));
    // Logged in: the character's name is the account's username.
    if (Cloud.user()) {
      $('#fName').readOnly = true;
      $('#fName').title = 'Your name is your account username.';
    }
  }

  function leave() {
    if (saveTimer) saveNow();
    sfx('select');
    back();
  }

  document.addEventListener('keydown', (e) => {
    if (!isOpen() || $('.acct-modal')) return;
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); toast('Saved.'); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); PixelEditor.undo(); }
  });

  /* Another tab (or a cloud pull) saved the character: pick up its version. */
  onSharedChange((key) => { if (isOpen() && (key === HERO_KEY || key === null)) loadFromStore(); });

  return { show };
})();
