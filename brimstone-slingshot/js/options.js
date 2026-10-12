'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — options: sound, CRT and color palettes
   A palette sets the CSS color tokens, the 4 sprite tones (PAL),
   the swirl backdrop's tones and the deck-tablet tones.
   ============================================================ */

const PALETTE_KEY = 'cardgrave.palette.v1';

/* bd: the backdrop's 4 paint tones, then the vortex core. tab: tablet face, highlight, shadow.
   Optional onDark / onDarkHi / onDarkDim / shade: text on dark surfaces (buttons, land cards) and
   the darkest shadow (logo, land stripes); style.css falls back to paper / white / light / ink. */
const PALETTES = {
  moss: {
    name: 'MOSS', ink: '#1f2418', dark: '#3b4430', mid: '#6e7a52', light: '#a9b47e', paper: '#d9dfb3', white: '#eef1d6',
    artbg: '#cdd4a4', accent: '#d97a2b', bg: '#12160e',
    bd: ['#8f9a6c', '#a3ad7f', '#b3bc8a', '#c3cb9b', '#3b4430'], tab: ['#8e9868', '#a6af7f', '#7c8659'],
  },
  pocket: {
    name: 'POCKET', ink: '#1c1c1e', dark: '#3a3a3d', mid: '#6d6d70', light: '#a8a8a6', paper: '#d6d6d0', white: '#efefe9',
    artbg: '#c9c9c2', accent: '#c8503a', bg: '#111113',
    bd: ['#8c8c88', '#a0a09b', '#b1b1ab', '#c2c2bb', '#3a3a3d'], tab: ['#8f8f8a', '#a7a7a1', '#7b7b77'],
  },
  tide: {
    name: 'TIDE', ink: '#0f2a2c', dark: '#1f4a4c', mid: '#3f7f7a', light: '#7fbfae', paper: '#c4e6d6', white: '#e6f6ec',
    artbg: '#b4dccb', accent: '#c86a28', bg: '#0a1a1c',
    bd: ['#5f9f94', '#75b3a6', '#88c2b4', '#9dd0c1', '#1f4a4c'], tab: ['#6aa597', '#86bcae', '#568d81'],
  },
  sepia: {
    name: 'SEPIA', ink: '#2b1a10', dark: '#4e3322', mid: '#8a6243', light: '#c49a6c', paper: '#e8d3ae', white: '#f7ecd6',
    artbg: '#dcc39b', accent: '#b8402a', bg: '#1a100a',
    bd: ['#a8835f', '#ba9670', '#c9a780', '#d6b791', '#4e3322'], tab: ['#a8835f', '#c09a73', '#8d6a4c'],
  },
  // Virtual Boy feel: soft red on charcoal, inverted, so ink is the brightest red and white the darkest.
  ember: {
    name: 'EMBER', ink: '#f06a64', dark: '#3a2e30', mid: '#b8403e', light: '#8a3a3c', paper: '#262022', white: '#2e2426',
    artbg: '#1e191a', accent: '#d8443c', bg: '#141012',
    onDark: '#f06a64', onDarkHi: '#f6a09a', onDarkDim: '#c86460', shade: '#0e0a0b',
    bd: ['#3a3033', '#453a3d', '#514447', '#5e4f52', '#f06a64'], tab: ['#3a2e30', '#4a3a3c', '#2e2426'],
  },
  lavender: {
    name: 'LAVENDER', ink: '#241a33', dark: '#43345c', mid: '#75659a', light: '#ab9dcb', paper: '#ddd4ee', white: '#f2edf9',
    artbg: '#cfc4e6', accent: '#c25d7c', bg: '#130e1c',
    bd: ['#9789bb', '#a99cc8', '#b8acd3', '#c7bddd', '#43345c'], tab: ['#9a8cbe', '#b0a4d0', '#8577aa'],
  },
};
const PALETTE_VARS = ['ink', 'dark', 'mid', 'light', 'paper', 'white', 'artbg', 'accent', 'bg'];

const Palette = {
  key: 'moss',
  get cur() { return PALETTES[this.key]; },
  // Bright text on land cards (CSS --on-dark-hi), for icons drawn beside it.
  get onDarkHi() { return this.cur.onDarkHi || this.cur.white; },

  apply(key) {
    this.key = PALETTES[key] ? key : 'moss';
    const p = this.cur, root = document.documentElement.style;
    for (const v of PALETTE_VARS) root.setProperty('--' + v, p[v]);
    ['--tab', '--tab-hi', '--tab-lo'].forEach((v, i) => root.setProperty(v, p.tab[i]));
    // Optional overrides; style.css has the fallbacks (paper, white, light, ink).
    for (const [v, k] of [['--on-dark', 'onDark'], ['--on-dark-hi', 'onDarkHi'], ['--on-dark-dim', 'onDarkDim'], ['--shade', 'shade']]) {
      if (p[k]) root.setProperty(v, p[k]);
      else root.removeProperty(v);
    }
    Object.assign(PAL, { '#': p.ink, '+': p.mid, '-': p.light, 'w': p.white });
    clearArtCache();
    Backdrop.setPalette(p.bd);
    const bell = document.getElementById('bellImg'), gear = document.getElementById('gearImg');
    if (bell) bell.src = spriteURL('bell');
    if (gear) gear.src = iconURL('gear');
    Store.write(PALETTE_KEY, this.key);
  },
};
Palette.apply(Store.read(PALETTE_KEY, 'moss'));

/* ---------- options screen ----------
   Rows: sound, CRT, palette, how to play, back. Esc goes back.
   Opened from the title, or over a match from the gear button, where
   BACK becomes RESUME and returns to the table. */
let optInMatch = false;

function openOptions(inMatch) {
  optInMatch = inMatch;
  showOptions();
}

function showOptions() {
  const soundOn = !Sfx.muted, crtOn = CRT.level !== 'off';
  const toggle = (id, on) => `
    <div class="opt-toggle" id="${id}">
      <button class="btn sm${on ? ' on' : ''}" data-v="on">ON</button><button class="btn sm${on ? '' : ' on'}" data-v="off">OFF</button>
    </div>`;
  showScreen(`
    <div class="opt panel">
      <div class="opt-title">OPTIONS</div>
      <div class="opt-row" data-row="0"><span class="opt-label">SOUND</span>${toggle('optSound', soundOn)}</div>
      <div class="opt-row" data-row="1"><span class="opt-label">CRT EFFECT</span>${toggle('optCrt', crtOn)}</div>
      <div class="opt-row" data-row="2"><span class="opt-label">PALETTE</span>
        <div class="opt-pal" id="optPal">
          <button class="db-step" data-d="-1" aria-label="Previous palette">&lt;</button>
          <span class="opt-pval">${Palette.cur.name}</span>
          <button class="db-step" data-d="1" aria-label="Next palette">&gt;</button>
        </div>
      </div>
      <div class="opt-row opt-btn-row" data-row="3"><button class="btn" id="optRules">HOW TO PLAY</button></div>
      <div class="opt-row opt-btn-row" data-row="4"><button class="btn" id="optBack">${optInMatch ? 'RESUME' : 'BACK'}</button></div>
    </div>`, true);

  $$('#optSound .btn').forEach((b) => (b.onclick = () => optSound(b.dataset.v === 'on')));
  $$('#optCrt .btn').forEach((b) => (b.onclick = () => optCrt(b.dataset.v === 'on')));
  $$('#optPal .db-step').forEach((b) => (b.onclick = () => stepPalette(+b.dataset.d)));
  $('#optRules').onclick = () => { sfx('select'); showTitleRules(optInMatch); };
  $('#optBack').onclick = () => {
    sfx('select');
    if (optInMatch) hideScreen();
    else showTitle();
  };
}

function optSound(on) {
  setSound(on);
  sfx('select');
  showOptions();
}

function optCrt(on) {
  CRT.setLevel(on ? 'low' : 'off');
  sfx('select');
  if (on) CRT.pulse(0.6);
  showOptions();
}

/* Step through the palettes in order, wrapping round at either end. */
function stepPalette(step) {
  const keys = Object.keys(PALETTES);
  Palette.apply(keys[(keys.indexOf(Palette.key) + step + keys.length) % keys.length]);
  sfx('select');
  CRT.pulse(0.6);
  if (optInMatch && game) { render(); inspectDefault(); } // redraw the table behind in the new colors
  showOptions();
}

/* Registered before the title screen's handler, so the key that opens or closes this screen
   is never handled twice. */
document.addEventListener('keydown', (e) => {
  if (!$('.opt') || $('#screen').classList.contains('hidden')) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    $('#optBack').onclick();
  }
});
