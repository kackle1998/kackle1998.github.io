'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — custom cards & saved decks (shared by game + card maker)
   localStorage is the working copy (js/cloud.js mirrors it to the
   server when the player is logged in), so the Card Maker and the game
   stay in sync as long as both are opened from the same address
   (e.g. http://localhost:8765). Changes in one tab fire a 'storage'
   event in the other, which reloads the cards live.
   ============================================================ */

const CUSTOM_KEY = 'cardgrave.customCards.v1';
const DECKS_KEY = 'cardgrave.decks.v1';
const MAX_COPIES = 3;
const DECK_SIZE = 30;

const Store = {
  read(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  },
  write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  },
};

/* When logged in (js/cloud.js), every local save is also queued for upload. */
function cloudQueue() { if (typeof Cloud !== 'undefined') Cloud.queue(); }

function clampInt(v, lo, hi, dflt = lo) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
}

function newCustomId() { return 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/* Turn a stored record into a playable card definition (or null if broken). */
function customToCard(d) {
  if (!d || typeof d.id !== 'string' || !d.name) return null;
  const cost = { g: 0, paw: 0, bone: 0, gem: 0, hat: 0 };
  for (const k of Object.keys(cost)) cost[k] = clampInt(d.cost && d.cost[k], 0, 9);
  const sigils = [...new Set((d.sigils || []).filter((s) => SIGILS[s]))].slice(0, 4);
  const card = {
    id: d.id, name: String(d.name).slice(0, 16), type: 'creature', cost,
    atk: clampInt(d.atk, 0, 20), hp: clampInt(d.hp, 1, 30, 1), sigils,
    sprite: Array.isArray(d.pixels) && d.pixels.length ? 'spr_' + d.id : 'spr_blank',
    custom: true, flavor: d.flavor ? String(d.flavor).slice(0, 80) : '',
  };
  if (sigils.includes('snipe')) card.snipe = clampInt(d.snipe, 1, 9, 1);
  if (sigils.includes('mend')) card.mend = clampInt(d.mend, 1, 9, 2);
  return card;
}

/* Empty art for a stored card with no pixels. */
SPRITES.spr_blank = cleanArtRows([]);

let customIds = [];

function getCustomRecords() { return Store.read(CUSTOM_KEY, []).filter((d) => d && d.id); }

/* (Re)register every stored custom card into CARDS / SPRITES. */
function loadCustomCards() {
  for (const id of customIds) { delete CARDS[id]; delete SPRITES['spr_' + id]; }
  customIds = [];
  for (const d of getCustomRecords()) {
    const card = customToCard(d);
    if (!card) continue;
    CARDS[card.id] = card;
    if (card.sprite === 'spr_' + card.id) SPRITES[card.sprite] = d.pixels.map((r) => String(r).replace(/[^.#+\-w]/g, '.'));
    customIds.push(card.id);
  }
  return customIds.length;
}

/* ---------- game library ----------
   Official cards added with the Card Maker's "Add to game library" button. They live on the
   server (db/library.sql), not in js/data.js; the last copy fetched is kept here, so they load
   instantly and still work offline. js/cloud.js refreshes it on every page load. */
const LIBRARY_KEY = 'cardgrave.library.v1';
let libraryIds = [];

function loadLibraryCards() {
  for (const id of libraryIds) { delete CARDS[id]; delete SPRITES['spr_' + id]; }
  libraryIds = [];
  for (const d of Store.read(LIBRARY_KEY, [])) {
    const card = customToCard(d);
    if (!card || CARDS[card.id]) continue; // never replaces a built-in card
    delete card.custom;
    if (RARITIES[d.rarity]) card.rarity = d.rarity;
    CARDS[card.id] = card;
    if (card.sprite === 'spr_' + card.id) SPRITES[card.sprite] = d.pixels.map((r) => String(r).replace(/[^.#+\-w]/g, '.'));
    libraryIds.push(card.id);
  }
}

function saveCustomRecords(list) {
  const ok = Store.write(CUSTOM_KEY, list);
  loadCustomCards();
  cloudQueue();
  return ok;
}

/* Fires `cb(key)` when another tab changes custom cards, decks or the character. */
function onSharedChange(cb) {
  window.addEventListener('storage', (e) => {
    if (e.key === CUSTOM_KEY || e.key === DECKS_KEY || e.key === HERO_KEY || e.key === LIBRARY_KEY || e.key === null) {
      loadLibraryCards();
      loadCustomCards();
      loadHero();
      cb(e.key);
    }
  });
}

/* ---------- saved decks ---------- */
function getSavedDecks() { return Store.read(DECKS_KEY, []).filter((d) => d && d.id && d.list); }
function saveSavedDecks(decks) { const ok = Store.write(DECKS_KEY, decks); cloudQueue(); return ok; }

function deckCount(list) { return Object.values(list).reduce((a, b) => a + b, 0); }

/* Drop cards that no longer exist (e.g. a deleted custom card). */
function cleanDeckList(list) {
  const out = {};
  for (const [id, n] of Object.entries(list || {})) if (CARDS[id] && !CARDS[id].token && n > 0) out[id] = n;
  return out;
}

function deckColors(list) {
  const weight = {};
  COLOR_KEYS.forEach((k) => (weight[k] = 0));
  for (const [id, n] of Object.entries(list)) {
    const c = CARDS[id];
    if (!c) continue;
    if (c.type === 'land') weight[c.color] += n;
    else for (const k of COLOR_KEYS) weight[k] += (c.cost[k] || 0) * n;
  }
  return COLOR_KEYS.filter((k) => weight[k] > 0).sort((a, b) => weight[b] - weight[a]);
}

/* ---------- deck art ----------
   A deck's `art` is either a sprite name (built-in art or a custom card's art)
   or 16 rows of pixels drawn in the deck builder. Without one, the deck shows
   its priciest creature. */
function cleanArtRows(rows) {
  return Array.from({ length: 16 }, (_, y) => String((rows && rows[y]) || '').replace(/[^.#+\-w]/g, '.').padEnd(16, '.').slice(0, 16));
}
function hasArtPixels(rows) { return Array.isArray(rows) && rows.some((r) => /[#+\-w]/.test(r)); }

function autoDeckArt(list) {
  const best = Object.keys(list).filter((id) => CARDS[id] && CARDS[id].type === 'creature')
    .sort((a, b) => costTotal(CARDS[b].cost) - costTotal(CARDS[a].cost))[0];
  return best ? CARDS[best].sprite : 'hero';
}

/* Sprite name to draw for a deck (drawn art is registered as deck_<id>). */
function deckArtSprite(d, list = cleanDeckList(d.list)) {
  if (hasArtPixels(d.art)) {
    const key = 'deck_' + (d.id || 'draft');
    SPRITES[key] = cleanArtRows(d.art);
    return key;
  }
  if (typeof d.art === 'string' && SPRITES[d.art]) return d.art;
  return autoDeckArt(list);
}

/* Shape a saved deck like a premade one so the Game can use it. */
function savedDeckToDef(d) {
  const list = cleanDeckList(d.list);
  const colors = deckColors(list);
  return { name: d.name || 'Custom Deck', colors: colors.length ? colors : ['paw'], feature: deckArtSprite(d, list), list, custom: true, id: d.id };
}

/* Rough power estimate shared by the card maker's balance meter. */
const SIGIL_WEIGHT = {
  airborne: 2, guardian: 1, haste: 1, deathtouch: 2, leech: 1, trample: 1, quick: 1, bonespawn: 1, regen: 1, scholar: 1, snipe: 0, mend: 0, rally: 2,
  thorns: 1, bloodlust: 1, reach: 1, spite: 1, grow: 2, undying: 3, shockwave: 2, warcry: 2, prego: 2, zorf: 1,
};
function cardPower(c) {
  let p = c.atk + c.hp;
  for (const s of c.sigils) p += SIGIL_WEIGHT[s] || 0;
  if (c.snipe) p += c.snipe;
  if (c.mend) p += c.mend / 2;
  return p;
}
function cardBudget(c) { return Math.round(costTotal(c.cost) * 2.2 + 1); }

/* ---------- player character ---------- */
const HERO_KEY = 'cardgrave.character.v1';
const HERO_DEFAULT_NAME = 'YOU';
SPRITES.hero_default = SPRITES.hero;

/* { name, pixels } or null when the player hasn't made one. */
function getHeroRecord() {
  const d = Store.read(HERO_KEY, null);
  return d && Array.isArray(d.pixels) ? d : null;
}

function heroName() {
  if (typeof Cloud !== 'undefined' && Cloud.user()) return Cloud.user();
  const d = getHeroRecord();
  return (d && String(d.name || '').trim().slice(0, 12)) || HERO_DEFAULT_NAME;
}

/* Swap the saved character art in for the built-in hero sprite. */
function loadHero() {
  const d = getHeroRecord();
  const art = d && d.pixels.some((r) => /[#+\-w]/.test(r)) ? d.pixels.map((r) => String(r).replace(/[^.#+\-w]/g, '.')) : null;
  SPRITES.hero = art || SPRITES.hero_default;
}

function saveHeroRecord(d) {
  const ok = d ? Store.write(HERO_KEY, d) : (() => { try { localStorage.removeItem(HERO_KEY); return true; } catch (e) { return false; } })();
  loadHero();
  cloudQueue();
  return ok;
}

loadLibraryCards();
loadCustomCards();
loadHero();
