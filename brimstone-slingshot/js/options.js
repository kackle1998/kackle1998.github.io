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
    artbg: '#cdd4a4', accent: '#b0953a', bg: '#12160e',
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
  // Ember's cool twin: soft teal on blue-green charcoal, inverted the same way.
  nightshade: {
    name: 'NIGHTSHADE', ink: '#58c8b8', dark: '#2c3836', mid: '#2f9488', light: '#2f6e67', paper: '#1e2524', white: '#232c2b',
    artbg: '#181e1d', accent: '#33a898', bg: '#0f1414',
    onDark: '#58c8b8', onDarkHi: '#9ae4d8', onDarkDim: '#4aa89c', shade: '#0a0e0e',
    bd: ['#2e3836', '#384442', '#43504e', '#4f5d5b', '#58c8b8'], tab: ['#2c3836', '#3a4846', '#232c2b'],
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
   Rows: sound effects, music, CRT, palette, starting ante and skip to beacon (debug), how to play, back. Esc goes back.
   Opened from the title; over a match from the gear button, where BACK becomes
   RESUME and returns to the table; or from the run map's gear, where `backTo`
   redraws the map (in the new colors, if the palette changed). */
let optInMatch = false, optBackTo = null;

function openOptions(inMatch, backTo = null) {
  optInMatch = inMatch;
  optBackTo = backTo;
  showOptions();
}

function showOptions() {
  const soundOn = !Sfx.muted, musicOn = !Music.muted, crtOn = CRT.level !== 'off';
  const toggle = (id, on) => `
    <div class="opt-toggle" id="${id}">
      <button class="btn sm${on ? ' on' : ''}" data-v="on">ON</button><button class="btn sm${on ? '' : ' on'}" data-v="off">OFF</button>
    </div>`;
  showScreen(`
    <div class="opt panel">
      <div class="opt-title">OPTIONS</div>
      <div class="opt-row"><span class="opt-label">SOUND FX</span>${toggle('optSound', soundOn)}</div>
      <div class="opt-row"><span class="opt-label">MUSIC</span>${toggle('optMusic', musicOn)}</div>
      <div class="opt-row"><span class="opt-label">CRT EFFECT</span>${toggle('optCrt', crtOn)}</div>
      <div class="opt-row"><span class="opt-label">PALETTE</span>
        <div class="opt-pal" id="optPal">
          <button class="db-step" data-d="-1" aria-label="Previous palette">&lt;</button>
          <span class="opt-pval">${Palette.cur.name}</span>
          <button class="db-step" data-d="1" aria-label="Next palette">&gt;</button>
        </div>
      </div>
      ${isDev() ? `<div class="opt-row"><span class="opt-label">START ANTE (DEBUG)</span>
        <div class="opt-pal" id="optAnte">
          <button class="db-step" data-d="-1" aria-label="Earlier starting ante">&lt;</button>
          <span class="opt-pval">${startAnte()}</span>
          <button class="db-step" data-d="1" aria-label="Later starting ante">&gt;</button>
        </div>
      </div>
      <div class="opt-row"><span class="opt-label">SKIP TO BEACON (DEBUG)</span>
        <button class="opt-check${skipBeacon() ? ' on' : ''}" id="optSkip" role="checkbox" aria-checked="${skipBeacon()}" aria-label="Skip to beacon"></button>
      </div>` : ''}
      <div class="opt-row opt-btn-row"><button class="btn" id="optRules">HOW TO PLAY</button></div>
      <div class="opt-row opt-btn-row"><button class="btn" id="optBack">${optInMatch ? 'RESUME' : 'BACK'}</button></div>
    </div>`, true);

  $$('#optSound .btn').forEach((b) => (b.onclick = () => optSound(b.dataset.v === 'on')));
  $$('#optMusic .btn').forEach((b) => (b.onclick = () => optMusic(b.dataset.v === 'on')));
  $$('#optCrt .btn').forEach((b) => (b.onclick = () => optCrt(b.dataset.v === 'on')));
  $$('#optPal .db-step').forEach((b) => (b.onclick = () => stepPalette(+b.dataset.d)));
  $$('#optAnte .db-step').forEach((b) => (b.onclick = () => stepStartAnte(+b.dataset.d)));
  if ($('#optSkip')) $('#optSkip').onclick = toggleSkipBeacon;
  $('#optRules').onclick = () => { sfx('select'); showTitleRules(optInMatch); };
  $('#optBack').onclick = () => {
    sfx('select');
    if (optBackTo) optBackTo();
    else if (optInMatch) hideScreen();
    else showTitle();
  };
}

function optSound(on) {
  setSound(on);
  sfx('select');
  showOptions();
}

function optMusic(on) {
  setMusic(on);
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

/* Debug tools are only for the developer's account (usernames are unique ignoring case).
   Everyone else, guests included, never sees them and they have no effect. */
const DEV_USER = 'kyle';
const isDev = () => typeof Cloud !== 'undefined' && (Cloud.user() || '').toLowerCase() === DEV_USER;

/* Debug: the ante a new run starts on (Run.start reads it), 1 to START_ANTE_MAX, kept between
   sessions. Runs already under way keep their own ante. Always 1 off the dev account. */
const START_ANTE_KEY = 'cardgrave.debugStartAnte.v1', START_ANTE_MAX = 3;
const startAnte = () => isDev() ? Math.max(1, Math.min(START_ANTE_MAX, Store.read(START_ANTE_KEY, 1) | 0)) : 1;
function stepStartAnte(step) {
  Store.write(START_ANTE_KEY, Math.max(1, Math.min(START_ANTE_MAX, startAnte() + step)));
  sfx('select');
  showOptions();
}

/* Debug: when on, every beacon not yet visited is lit on the run map, so you can sling straight
   to any stop instead of following the links (Run.reach reads it). Kept between sessions. */
const SKIP_BEACON_KEY = 'cardgrave.debugSkipBeacon.v1';
const skipBeacon = () => isDev() && !!Store.read(SKIP_BEACON_KEY, false);
function toggleSkipBeacon() {
  Store.write(SKIP_BEACON_KEY, !skipBeacon());
  sfx('select');
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
