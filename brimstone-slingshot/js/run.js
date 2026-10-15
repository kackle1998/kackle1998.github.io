'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the Dealer's Run: one short region against
   the Dealer, Inscryption style. Your deck changes as you go and your
   life carries over between battles. js/runmap.js draws the map;
   this file keeps the run state and runs each stop.
   ============================================================ */

const RUN_KEY = 'cardgrave.run.v1';
const RUN_RECORD_KEY = 'cardgrave.runRecord.v1';
const RUN_MAX_LIFE = 20;
const RUN_MIN_DECK = 15;                                // BURN A CARD or taking out lands can't go below this
const RUN_MAX_LANDS = 20;                               // of each land type
const RUN_ROWS = 10;                                    // rows of stops between the base and the casino
const RUN_ROW_GAP = 180;                                // map units between rows
// Map y by row: the base (row 0) at the bottom, the casino (row RUN_ROWS + 1) at y 70.
const RUN_ROW_Y = Array.from({ length: RUN_ROWS + 2 }, (_, r) => 70 + (RUN_ROWS + 1 - r) * RUN_ROW_GAP);
const RUN_BATTLE_ROWS = [1, 4, 7];                      // all battles; the last row is battles plus one campfire
const RUN_MAP_W = 836, RUN_MID = RUN_MAP_W / 2;         // the board's width (map units, js/runmap.js) and middle
const RUN_COL_X = { 2: [275, 561], 3: [187, 418, 649] }; // map units: a row's stops, by count
const RUN_LAYOUT = 4;                                   // bumped when the map's shape changes
// By row (1..RUN_ROWS): a battle's Dealer life, and the Dealer's priciest card.
const DEALER_LIFE = [0, 8, 8, 8, 10, 10, 10, 12, 12, 12, 14];
const DEALER_COST_CAP = [0, 2, 2, 2, 2, 2, 2, 3, 3, 3, 4];
const RUN_WIN_HEAL = 6;                                 // life back after each battle won
const RUN_WIN_ARCANA = 2;                               // arcana for each battle won, plus 1 per point of overkill
const RUN_SKIP_ARCANA = 2;                              // arcana for skipping the spoils card
const BOSS_LIFE = 16;
const BOSS_COST_CAP = 4;                                // the boss Dealer's priciest card
/* Each circuit after the first (see Run.newCircuit) makes the Dealers a little tougher: +2 life
   per circuit for every battle and the boss, and from the third circuit on, every other circuit
   lets the Dealers deal cards one cost higher (up to the boss's cap). */
const RUN_CIRCUIT_LIFE = 2;
const runCircuitLife = (s) => RUN_CIRCUIT_LIFE * ((s.circuit || 1) - 1);
const runCircuitCap = (s, cap) => Math.min(BOSS_COST_CAP, cap + Math.floor(((s.circuit || 1) - 1) / 2));
/* Each starting deck's run: its starting (and max) life, and cards swapped into its starting 11
   (from: to). Tuned by simulation so the game's AI clears the run about 65% of the time with each. */
const RUN_DECKS = {
  'Wild Hunt':     { life: 23 },
  'Crypt Arcana':  { life: 25, swap: { counter: 'firebolt', opengrave: 'battlemage' } },
  'Crystal Wilds': { life: 24 },
  'Prism Sorcery': { life: 20, swap: { insight: 'battlemage' } },
};
const runDeck = (def) => RUN_DECKS[def.name] || { life: RUN_MAX_LIFE };
/* The Dealer's hand in a run battle is named by its two colors (shown on the VS splash). */
const DEALER_DECK_NAMES = {
  'bone+paw': 'Wild Hunt', 'bone+hat': 'Crypt Arcana', 'gem+paw': 'Crystal Wilds',
  'gem+hat': 'Prism Sorcery', 'hat+paw': 'Feral Arcana', 'bone+gem': 'Grave Geodes',
};

const STOPS = {
  start:  { name: 'START',       icon: 'ri_chip',   desc: 'Where you came in.' },
  battle: { name: 'BATTLE',      icon: 'ri_battle', desc: "Battle: duel one of the Dealer's hands." },
  fire:   { name: 'CAMPFIRE',    icon: 'ri_fire',   desc: 'Campfire: warm a creature. Push your luck.' },
  altar:  { name: 'SIGIL ALTAR', icon: 'ri_altar',  desc: 'Sigil altar: sacrifice a creature to move its sigil.' },
  trade:  { name: 'TRADER',      icon: 'ri_arcana',  desc: 'Trader: spend arcana on cards and tonic.' },
  event:  { name: '???',         icon: 'ri_event',  desc: 'Unknown: something hums under the board.' },
  boss:   { name: 'THE DEALER',  icon: 'ri_chip',   desc: 'The Dealer: the house always plays last.' },
};

const BOSS_RULES = {
  gale:    { name: 'GALE',        text: "Every creature on the Dealer's side takes flight." },
  ossuary: { name: 'OSSUARY',     text: "Skeletons fill every empty slot on the Dealer's side." },
  dice:    { name: 'LOADED DICE', text: 'All your face-down traps are swept away.' },
};

/* This ante's boss (data.js RUN_BOSSES): null for the Dealer, or the boss that replaces it. */
const runBoss = (s) => RUN_BOSSES[Math.min(s.circuit || 1, RUN_BOSSES.length) - 1];
/* A stop's name and tooltip; the boss stop's follow the ante's boss. */
const runStop = (s, t) => {
  const b = t === 'boss' && runBoss(s);
  return b ? { ...STOPS.boss, name: b.name, desc: b.stop } : STOPS[t];
};

const runRand = (R, n) => Math.floor(R() * n);
function runShuffle(R, a) {
  for (let i = a.length - 1; i > 0; i--) { const j = runRand(R, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/* Up to n distinct picks from `arr`, weighted. */
function runPickN(R, arr, n, weight = () => 1) {
  const left = arr.slice(), out = [];
  while (out.length < n && left.length) {
    const ws = left.map(weight), sum = ws.reduce((a, b) => a + b, 0);
    let r = R() * sum, i = 0;
    while (i < left.length - 1 && (r -= ws[i]) > 0) i++;
    out.push(left.splice(i, 1)[0]);
  }
  return out;
}

/* Built-in cards a run can hand out: no lands, tokens, custom or run cards, and payable from `colors`. */
function runPool(colors, maxCost = 99) {
  return Object.values(CARDS).filter((c) => c.type !== 'land' && !c.token && !c.custom && !c.runCard
    && colors.includes(c.color) && COLOR_KEYS.every((k) => !c.cost[k] || colors.includes(k))
    && costTotal(c.cost) <= maxCost);
}

/* Rarity (data.js RARITIES): every card a stop offers rolls its own, mostly common and rarer the
   further up the map. A rarity with nothing left to offer falls back to a commoner one. */
const RUN_RARE_ODDS = [0.18, 0.3];                      // chance an offer is rare: on row 1, rising to row RUN_ROWS
const RUN_MYTHICAL_ODDS = [0.02, 0.06];                 // ...or mythical
const RARITY_MARKUP = { common: 0, rare: 2, mythical: 4 }; // the trader's extra arcana
function runRarity(R, row = 1) {
  const t = Math.max(0, Math.min(1, (row - 1) / (RUN_ROWS - 1)));
  const at = ([lo, hi]) => lo + (hi - lo) * t;
  const r = R(), m = at(RUN_MYTHICAL_ODDS);
  return r < m ? 'mythical' : r < m + at(RUN_RARE_ODDS) ? 'rare' : 'common';
}
/* n different cards in `colors` for a stop to offer, each of a rolled rarity. `weight` picks among
   the cards of that rarity, one card is sure to be at least `least`, and `skip` ids are left out. */
function runOffer(R, colors, n, { row = 1, weight = () => 1, least = 'common', skip = [] } = {}) {
  const pool = runPool(colors).filter((c) => !skip.includes(c.id)), out = [];
  for (let i = 0; i < n; i++) {
    const roll = Math.max(RARITY_KEYS.indexOf(runRarity(R, row)), i ? 0 : RARITY_KEYS.indexOf(least));
    let left = [];
    for (let k = roll; k >= 0 && !left.length; k--) left = pool.filter((c) => rarityOf(c) === RARITY_KEYS[k] && !out.includes(c));
    if (!left.length) left = pool.filter((c) => !out.includes(c));
    if (!left.length) break;
    out.push(runPickN(R, left, 1, weight)[0]);
  }
  return runShuffle(R, out);
}
const runPrice = (c) => Math.min(4, Math.max(2, costTotal(c.cost))) + RARITY_MARKUP[rarityOf(c)];
function getRunRecord() { return { wins: 0, losses: 0, ...Store.read(RUN_RECORD_KEY, {}) }; }

/* Start, 5 rows of 2-3 stops, then the boss. Links run in sorted order, so the map's arcs never cross. */
function genRunMap(R) {
  const even = (v) => Math.round(v / 2) * 2;
  const nodes = [{ id: 0, row: 0, x: RUN_MID, y: RUN_ROW_Y[0], t: 'start' }];
  const rows = [[0]];
  for (let r = 1; r <= RUN_ROWS; r++) {
    const k = R() < 0.5 ? 2 : 3;
    const xs = RUN_COL_X[k];
    let types;
    if (RUN_BATTLE_ROWS.includes(r)) types = Array(k).fill('battle');
    else if (r === RUN_ROWS) { types = Array(k).fill('battle'); types[runRand(R, k)] = 'fire'; }
    // Every other row has a ? stop, plus one or two of campfire, trader and altar.
    else types = runShuffle(R, ['event', ...runShuffle(R, ['fire', 'trade', 'altar']).slice(0, k - 1)]);
    rows.push(xs.map((x, i) => {
      const n = { id: nodes.length, row: r, x: even(x + (R() - 0.5) * 40), y: even(RUN_ROW_Y[r] + (R() - 0.5) * 20), t: types[i] };
      nodes.push(n);
      return n.id;
    }));
  }
  nodes.push({ id: nodes.length, row: RUN_ROWS + 1, x: RUN_MID, y: RUN_ROW_Y[RUN_ROWS + 1], t: 'boss' });
  rows.push([nodes.length - 1]);

  const edges = [];
  const at = (row, i) => (row.length === 1 ? 0.5 : i / (row.length - 1));
  for (let r = 0; r <= RUN_ROWS; r++) {
    const A = rows[r], B = rows[r + 1];
    let i = 0, j = 0;
    edges.push([A[0], B[0]]);
    while (i < A.length - 1 || j < B.length - 1) {
      if (i === A.length - 1) j++;
      else if (j === B.length - 1) i++;
      else {
        const da = at(A, i + 1), db = at(B, j + 1);
        if (Math.abs(da - db) < 0.2 && R() < 0.5) { i++; j++; } else if (da < db) i++; else j++;
      }
      edges.push([A[i], B[j]]);
    }
  }
  return { nodes, edges, layout: RUN_LAYOUT };
}

/* Respace a map saved under an old layout to the current one, keeping each stop's jitter, so a
   run in progress gets the roomier board too. */
function respaceRunMap(map) {
  const even = (v) => Math.round(v / 2) * 2;
  // Layout 1 (rows 130 apart, stops 170 apart) to layout 2 (rows 150 apart, stops 210 apart).
  if (!(map.layout >= 2)) {
    const oldY = [840, 710, 580, 450, 320, 190, 70], newY = [960, 810, 660, 510, 360, 210, 70];
    for (const n of map.nodes) {
      n.y = even(newY[n.row] + (n.y - oldY[n.row]));
      n.x = even(380 + (n.x - 380) * (210 / 170));
    }
    map.layout = 2;
  }
  // Layouts 2 and 3 (a 760-wide board, rows 150 apart) to layout 4: the board 10% wider, the
  // rows 20% further apart. (Layout 2's five rows still play as five: the board sizes itself.)
  if (map.layout < 4) {
    for (const n of map.nodes) {
      n.x = even(RUN_MID + (n.x - 380) * 1.1);
      n.y = even(70 + (n.y - 70) * (RUN_ROW_GAP / 150));
    }
    map.layout = 4;
  }
}

/* ---------- events at ? stops ----------
   A choice may `pick` a creature first (filter), copy a sigil (`transfer`), or just `act`.
   `ok` and `pick` decide whether it can be chosen; `need` says why not. `act` returns the outcome text. */
const RUN_EVENTS = [
  {
    id: 'cracked', title: 'CRACKED CHIP', art: 'ri_chip',
    text: 'A cracked chip hums in the dirt. Press it in hard and a creature gains +2 attack, but forgets one of its sigils at random. Press it in gently and it gains just +1 attack.',
    choices: [
      { label: 'PRESS HARD (+2, LOSE A SIGIL)', pick: (d) => d.sigils.length > 0, need: 'Needs a creature with a sigil.',
        act: (run, d) => {
          const rc = run.rc(d.rid), k = rc.sigils.splice(Math.floor(Math.random() * rc.sigils.length), 1)[0];
          rc.atk += 2;
          delete rc[k];
          return `${d.name} gained +2 attack and forgot ${SIGILS[k].name}.`;
        } },
      { label: 'PRESS GENTLY (+1)', pick: () => true, need: 'Needs a creature.',
        act: (run, d) => { run.rc(d.rid).atk += 1; return `${d.name} gained +1 attack.`; } },
      { label: 'LEAVE IT', act: () => 'You leave the chip humming to itself.' },
    ],
  },
  {
    id: 'spring', title: 'SULFUR SPRING', art: 'ri_spring',
    text: 'A spring bubbles up, yellow and warm. It smells terrible. It might be good for you.',
    choices: [
      { label: 'DRINK (+6 LIFE)', act: (run) => `You drink deep and recover ${run.heal(6)} life.` },
      { label: 'BOTTLE IT (+2 ARCANA)', act: (run) => { run.gainTeeth(2); return 'A trader will pay 2 arcana for this.'; } },
    ],
  },
  {
    id: 'pool', title: 'MOLTEN POOL', art: 'ri_pool',
    text: 'A pool of slow fire. Dip a creature from your deck in: three times in four it comes out with Haste, but one time in four it melts away for good.',
    choices: [
      { label: 'DIP A CREATURE', pick: (d) => !d.sigils.includes('haste') && d.sigils.length < 4, need: 'Needs a creature without Haste.',
        act: (run, d) => {
          if (((isDev() ? run.debugRoll : null) ?? Math.random()) < 0.25) { run.remove(d.rid); return `${d.name} melted away.`; }
          run.rc(d.rid).sigils.push('haste');
          return `${d.name} came out with Haste.`;
        } },
      { label: 'LEAVE', act: () => 'You step around the pool.' },
    ],
  },
  {
    id: 'bones', title: 'BONE PILE', art: 'skeleton',
    text: 'A heap of bones. One of them is still twitching.',
    choices: [
      { label: 'TAKE A SKELETON', see: () => CARDS.skeleton, act: (run) => { const rc = run.add('skeleton'); return { text: 'A Skeleton (0-cost 1/1) joins your deck.', cards: [run.card(rc.rid)] }; } },
      { label: 'SIFT THE BONES (+1 ARCANA)', act: (run) => { run.gainTeeth(1); return 'You sift out 1 arcana.'; } },
    ],
  },
  {
    id: 'offer', title: "THE DEALER'S OFFER", art: 'dealer',
    text: 'The Dealer slides a card across the table. Its frame glints: rare, or better. "A gift. I\'ll take my due at the next hand."',
    choices: [
      { label: 'ACCEPT', ok: (run) => runPool(run.s.colors).some((c) => rarityOf(c) !== 'common'), need: 'Nothing on offer for your colors.',
        act: (run) => {
          // One gift in four is mythical.
          const c = runOffer(Math.random, run.s.colors, 1, { row: run.row(), least: Math.random() < 0.25 ? 'mythical' : 'rare' })[0];
          const rc = run.add(c.id);
          run.s.dealerBonus = 5;
          return { text: `You take ${c.name}. The Dealer's next hand starts with +5 life.`, cards: [run.card(rc.rid)] };
        } },
      { label: 'REFUSE', act: () => 'The Dealer shrugs and pockets the card.' },
    ],
  },
  {
    id: 'rune', title: 'RUNE CIRCLE', art: 'stasisrune',
    text: 'A rune circle turns slowly in the ground. Pay 3 life and it copies a sigil from one creature in your deck onto another.',
    choices: [
      { label: 'PAY 3 LIFE', transfer: true, cost: 3, ok: (run) => run.s.life > 3 && run.givers().length > 0,
        need: 'Needs more than 3 life and a sigil to copy.' },
      { label: 'LEAVE', act: () => 'The circle turns on without you.' },
    ],
  },
  {
    id: 'moth', title: 'WANDERING MOTH', art: 'moth',
    text: 'A moth made of glass circles your light. Pay 4 life and it gives one creature in your deck its wings: Airborne.',
    choices: [
      { label: 'PAY 4 LIFE', ok: (run) => run.s.life > 4, pick: (d) => !d.sigils.includes('airborne') && d.sigils.length < 4,
        need: 'Needs more than 4 life and a creature without Airborne.',
        act: (run, d) => { run.s.life -= 4; run.rc(d.rid).sigils.push('airborne'); return `${d.name} gained Airborne.`; } },
      { label: 'LEAVE', act: () => 'The moth drifts off into the dark.' },
    ],
  },
  {
    id: 'ghost', title: 'LOST SPELLSLINGER', art: 'apprentice',
    text: 'A spellslinger who never left the table offers a trade: your weakest card for one of theirs.',
    choices: [
      { label: 'TRADE', ok: (run) => run.s.deck.length > 0, need: 'You have no card to trade.',
        see: (run) => run.cards().sort((a, b) => costTotal(a.cost) - costTotal(b.cost))[0],
        act: (run, _, ch) => {
          const out = ch.see(run);
          const c = runOffer(Math.random, run.s.colors, 1, { row: run.row(), skip: [out.base] })[0];
          run.remove(out.rid);
          const rc = run.add(c.id);
          return { text: `You gave up ${out.name} and got ${c.name}.`, cards: [out, run.card(rc.rid)] };
        } },
      { label: 'WALK PAST', act: () => 'They go back to shuffling.' },
    ],
  },
  /* A choice with `see` names the card it will take or give, and the event shows a SEE CARD button for it.
     An act returns its result text, or { text, cards } to name the cards it changed for the outcome's
     SEE CARD button (a picked creature is named for it already). */
  /* A choice with `cards` deals some cards to pick one of (Run.eventCards), and `take` keeps it. */
  {
    id: 'pack', title: 'SEALED PACK', art: 'ri_pack',
    text: 'A sealed pack of cards lies in the ash, its foil still bright. Tear it open and keep one card: one of the three is sure to be rare or better.',
    choices: [
      { label: 'TEAR IT OPEN', cards: (run) => runOffer(Math.random, run.s.colors, 3, { row: run.row(), least: 'rare' }).map((c) => c.id),
        take: (run, c) => { run.add(c.id); return `${c.name} joins your deck.`; } },
      { label: 'SELL IT (+3 ARCANA)', act: (run) => { run.gainTeeth(3); return 'A trader will pay 3 arcana for it, still sealed.'; } },
    ],
  },
  {
    id: 'reliquary', title: 'RELIQUARY', art: 'ri_relic',
    text: 'Behind a rusted grate, two cards hum like struck bells. Mythical, both of them. The grate only opens for blood: 6 life buys one.',
    choices: [
      { label: 'PAY 6 LIFE', ok: (run) => run.s.life > 6 && runPool(run.s.colors).some((c) => rarityOf(c) === 'mythical'),
        need: 'Needs more than 6 life, and a mythical card in your colors.', prompt: 'Pick one. The grate takes 6 life for it.',
        cards: (run) => runPickN(Math.random, runPool(run.s.colors).filter((c) => rarityOf(c) === 'mythical'), 2).map((c) => c.id),
        take: (run, c) => { run.s.life -= 6; run.add(c.id); return `The grate drinks 6 life and swings open. ${c.name} joins your deck.`; } },
      { label: 'LEAVE', act: () => 'The cards hum on behind the grate.' },
    ],
  },
  /* Runs its own screen (Run.slots) instead of choices. */
  {
    id: 'slots', title: 'BONE SLOTS', art: 'ri_slots', screen: 'slots',
    text: 'A one-armed machine rattles in the dark. Every pull pays out.', choices: [],
  },
  {
    id: 'wheel', title: 'SIGIL WHEEL', art: 'ri_wheel', screen: 'wheel',
    text: 'A bone wheel ringed with sigils. It turns once, and only once.', choices: [],
  },
  {
    id: 'shrine', title: 'BONE SHRINE', art: 'ri_altar',
    text: 'A shrine of stacked skulls asks for an offering. It promises to make you harder to kill.',
    choices: [
      { label: 'OFFER YOUR WEAKEST', ok: (run) => run.creatures().length > 0 && run.deckSize() > RUN_MIN_DECK, need: `Needs a creature to offer, and more than ${RUN_MIN_DECK} cards.`,
        see: (run) => run.creatures().sort((a, b) => costTotal(a.cost) - costTotal(b.cost) || a.atk + a.hp - (b.atk + b.hp))[0],
        act: (run, _, ch) => {
          const d = ch.see(run);
          run.remove(d.rid);
          run.s.maxLife += 3;
          const h = run.heal(3);
          return { text: `The shrine takes your ${d.name}. Your max life rises by 3, and you recover ${h}.`, cards: [d] };
        } },
      { label: 'LEAVE', act: () => 'The skulls watch you go.' },
    ],
  },
  {
    id: 'forge', title: 'CRYSTAL FORGE', art: 'golem',
    text: 'A forge burning with gem-light. For 2 arcana, the smith will temper one of your creatures.',
    choices: [
      { label: 'PAY 2 ARCANA', ok: (run) => run.s.teeth >= 2, pick: (d) => true, need: 'Needs 2 arcana and a creature.',
        act: (run, d) => { run.s.teeth -= 2; const rc = run.rc(d.rid); rc.atk += 1; rc.hp += 1; return `${d.name} comes out tempered: +1 attack, +1 health.`; } },
      { label: 'LEAVE', act: () => 'The forge burns on without you.' },
    ],
  },
  {
    id: 'mirror', title: 'MIRROR POOL', art: 'mirrorward',
    text: 'A still black pool. Whatever looks into it looks back out. It costs a little blood to wake.',
    choices: [
      { label: 'PAY 4 LIFE', ok: (run) => run.s.life > 4, pick: (d) => true, need: 'Needs more than 4 life and a creature.',
        act: (run, d) => {
          run.s.life -= 4;
          const src = run.rc(d.rid), copy = run.add(src.base);
          for (const k of ['atk', 'hp', 'snipe', 'mend']) if (src[k] != null) copy[k] = src[k];
          copy.sigils = [...(src.sigils || [])];
          return `A second ${d.name} climbs out of the pool, just like the first.`;
        } },
      { label: 'LEAVE', act: () => 'Your reflection waves you off.' },
    ],
  },
  {
    id: 'cache', title: 'EMBER CACHE', art: 'ri_arcana',
    text: 'Arcana glints in a bed of live coals. You could reach in, if you don\'t mind the burns.',
    choices: [
      { label: 'REACH IN (-3 LIFE)', ok: (run) => run.s.life > 3, need: 'Needs more than 3 life.',
        act: (run) => { run.s.life -= 3; run.gainTeeth(3); return 'You pull out 3 arcana, and a few blisters.'; } },
      { label: 'LEAVE', act: () => 'The coals hiss as you walk away.' },
    ],
  },
];

/* The slot machine: the first pull is free, each reroll costs arcana. Nothing is at risk,
   so its buff is smaller than the campfire's (+1 attack or +2 health, on a creature you pick). */
const SLOT_REROLL = 1;
const SLOT_HEAL = 4;
const SLOT_ATK_ODDS = 1 / 3;                            // a buff is +1 attack this often, else +1 health
const SLOT_FILL = ['card', 'might', 'hp', 'arcana', 'chip', 'bone'];  // icons the reels flick through while spinning

/* The sigil wheel: one free spin, no rerolls, and the sigil it lands on goes to a creature you pick. */
const WHEEL_N = 8;                                      // segments round the wheel
const WHEEL_PX = 112;                                   // drawn at this size, shown 3x
const WHEEL_SKIP = ['snipe', 'mend', 'undying'];        // sigils with an amount, and the mythicals' Undying, stay off the wheel
const WHEEL_SPIN_MS = 4200;

const Run = {
  s: null,           // the saved run, or null
  ids: [],           // CARDS ids registered for the current run
  debugRoll: null,   // console, dev account only: force the 25% death rolls (0 = the bad outcome)
  debugEvent: null,  // console, dev account only: force the next ? stop's event id

  load() {
    const s = Store.read(RUN_KEY, null);
    this.s = s && s.map && s.deck ? s : null;
    if (this.s) respaceRunMap(this.s.map);
    this.register();
    return this.s;
  },
  save() { if (this.s) Store.write(RUN_KEY, this.s); },
  rand(salt) { return mulberry32((this.s.seed + salt * 7919) >>> 0); },

  /* ---------- run cards: CARDS['run_<rid>'] built from the base card plus the run's changes ---------- */
  def(rc) {
    const b = CARDS[rc.base];
    const d = { ...b, id: 'run_' + rc.rid, rid: rc.rid, base: rc.base, runCard: true, sigils: [...(rc.sigils || b.sigils)] };
    if (b.type === 'creature') {
      d.atk = rc.atk; d.hp = rc.hp;
      for (const k of ['snipe', 'mend']) if (d.sigils.includes(k)) d[k] = rc[k] || b[k] || 1;
    }
    return d;
  },
  register() {
    for (const id of this.ids) delete CARDS[id];
    this.ids = [];
    if (!this.s) return;
    for (const rc of this.s.deck) {
      const d = this.def(rc);
      CARDS[d.id] = d;
      this.ids.push(d.id);
    }
  },
  add(base) {
    const b = CARDS[base], rc = { rid: this.s.nextRid++, base };
    if (b.type === 'creature') {
      Object.assign(rc, { atk: b.atk, hp: b.hp, sigils: [...b.sigils] });
      if (b.snipe) rc.snipe = b.snipe;
      if (b.mend) rc.mend = b.mend;
    }
    this.s.deck.push(rc);
    this.register();
    return rc;
  },
  remove(rid) { this.s.deck = this.s.deck.filter((r) => r.rid !== rid); this.register(); },
  rc(rid) { return this.s.deck.find((r) => r.rid === rid); },
  card(rid) { return CARDS['run_' + rid]; },
  cards() { return this.s.deck.map((r) => this.card(r.rid)); },
  creatures() { return this.cards().filter((d) => d.type === 'creature'); },
  landCount() { return Object.values(this.s.lands).reduce((a, b) => a + b, 0); },
  deckSize() { return this.s.deck.length + this.landCount(); },
  /* How many of each land the current cards want: more lands for a pricier curve, split by colored pip demand. */
  recLands() {
    const s = this.s, cards = this.cards();
    if (!cards.length) return Object.fromEntries(s.colors.map((k) => [k, 0]));
    const avg = cards.reduce((a, d) => a + costTotal(d.cost), 0) / cards.length;
    const total = Math.max(6, Math.round(cards.length * Math.min(1, 0.45 + 0.1 * avg)));
    const demand = s.colors.map((k) => 1 + cards.reduce((a, d) => a + (d.cost[k] || 0), 0));
    const sum = demand.reduce((a, b) => a + b, 0);
    // Largest remainder, so the split always adds up to the total.
    const shares = demand.map((n) => ({ exact: (total * n) / sum }));
    shares.forEach((x) => (x.n = Math.floor(x.exact)));
    let left = total - shares.reduce((a, x) => a + x.n, 0);
    [...shares].sort((a, b) => (b.exact - b.n) - (a.exact - a.n)).forEach((x) => { if (left > 0) { x.n++; left--; } });
    return Object.fromEntries(s.colors.map((k, i) => [k, shares[i].n]));
  },
  /* Add (d = 1) or take out (d = -1) a land of color k, from the map. Returns false if not allowed. */
  setLands(k, d) {
    const s = this.s, n = s.lands[k] || 0;
    if (d < 0 && n <= 0) { sfx('err'); return false; }
    if (d < 0 && this.deckSize() <= RUN_MIN_DECK) { toast(`Your deck can't go below ${RUN_MIN_DECK} cards.`); sfx('err'); return false; }
    if (d > 0 && n >= RUN_MAX_LANDS) { toast(`At most ${RUN_MAX_LANDS} of each tome.`); sfx('err'); return false; }
    s.lands[k] = n + d;
    this.save();
    sfx(d > 0 ? 'land' : 'select');
    return true;
  },
  heal(n) { const h = Math.max(0, Math.min(n, this.s.maxLife - this.s.life)); this.s.life += h; return h; },
  gainTeeth(n) { this.s.teeth += n; this.s.stats.teeth += n; },
  row() { return this.s.map.nodes[this.s.cur].row; }, // the map row of the stop the run is at

  deckDef() {
    const list = {};
    for (const rc of this.s.deck) list['run_' + rc.rid] = 1;
    for (const [k, n] of Object.entries(this.s.lands)) if (n) list['land_' + k] = n;
    const top = this.creatures().sort((a, b) => costTotal(b.cost) - costTotal(a.cost))[0];
    return { name: this.s.name, colors: this.s.colors, feature: top ? top.sprite : 'hero', list };
  },

  /* ---------- starting, resuming, leaving ---------- */
  open() {
    if (!this.load()) return this.pickDeck();
    const s = this.s;
    showScreen(`
      <div class="result panel">
        <img class="r-art" src="${spriteURL('hero')}" alt="">
        <div class="r-title rn-big">RUN IN PROGRESS</div>
        <div class="r-sub">${escapeHTML(s.name)} &middot; ${ico('hp')} ${s.life}/${s.maxLife} &middot; ${ico('arcana')} ${s.teeth} &middot; ${s.stats.stops} stop${s.stats.stops === 1 ? '' : 's'} cleared</div>
        <div class="concede-btns">
          <button class="btn" id="runGo">CONTINUE RUN</button>
          <button class="btn" id="runQuit">ABANDON RUN</button>
          <button class="btn" id="runBack">BACK</button>
        </div>
      </div>`, true);
    $('#runGo').onclick = () => { sfx('place'); this.resume(); };
    // Abandoning from here means you came to start a run, so go straight to picking a deck.
    $('#runQuit').onclick = () => this.confirmAbandon(() => this.open(), () => this.pickDeck());
    $('#runBack').onclick = () => { sfx('select'); showOfflineMenu(); };
  },

  pickDeck() {
    showScreen(`
      <div class="ds">
        <div class="ds-title">CHOOSE YOUR STARTING DECK</div>
        <div class="tablets">${DECKS.map((d, i) => `
          <div class="tablet" data-i="${i}">
            <div class="t-art"><img src="${spriteURL(d.feature)}" alt=""></div>
            <div class="t-icons">${d.colors.map((c) => ico(COLORS[c].icon)).join('')}<span class="t-life">${ico('hp')}<b>${runDeck(d).life}</b></span></div>
            <div class="t-name">${d.name.toUpperCase()}</div>
            <div class="t-desc">${d.desc}</div>
          </div>`).join('')}
        </div>
        <div class="ds-foot">You start with 11 of its cards, cheap to pricey, and 9 tomes. Each deck starts with its own life, and it carries over between battles.</div>
        <button class="btn" id="rdBack">BACK</button>
      </div>`);
    $$('.tablet').forEach((t) => {
      t.onclick = () => { sfx('place'); this.start(DECKS[+t.dataset.i]); };
      t.onmouseenter = () => sfx('select');
    });
    $('#rdBack').onclick = () => { sfx('select'); showOfflineMenu(); };
  },

  start(def) {
    const colors = def.colors.slice(0, 2);
    const ids = Object.entries(def.list).filter(([id]) => CARDS[id] && CARDS[id].type !== 'land').flatMap(([id, n]) => Array(n).fill(id));
    // 11 cards spread evenly across the deck's cost curve, so the run starts with a real curve.
    const sorted = ids.sort((a, b) => costTotal(CARDS[a].cost) - costTotal(CARDS[b].cost));
    const rd = runDeck(def), swap = rd.swap || {};
    const pick = Array.from({ length: 11 }, (_, i) => sorted[Math.floor((i * sorted.length) / 11)]).map((id) => swap[id] || id);
    // Split the 9 lands by how many of each symbol the starting cards ask for.
    const demand = colors.map((k) => 1 + pick.reduce((a, id) => a + (CARDS[id].cost[k] || 0), 0));
    const first = Math.max(3, Math.min(6, Math.round((9 * demand[0]) / (demand[0] + demand[1]))));
    this.s = {
      v: 1, seed: (Math.random() * 2 ** 31) >>> 0, name: def.name, colors, deck: [], nextRid: 1,
      lands: { [colors[0]]: first, [colors[1]]: 9 - first },
      life: rd.life, maxLife: rd.life, teeth: 0,
      cur: 0, done: [], visited: [0], node: null, events: [], dealerBonus: 0,
      stats: { stops: 0, battles: 0, teeth: 0 },
    };
    if (startAnte() > 1) this.s.circuit = startAnte(); // debug: start further in (see Options)
    this.s.map = genRunMap(this.rand(1));
    this.s.bossRule = Object.keys(BOSS_RULES)[runRand(this.rand(2), 3)];
    pick.forEach((id) => this.add(id));
    this.save();
    RunMap.show();
  },

  resume() {
    this.register();
    if (this.s.encore) this.newCircuit(); // left during the encore: the casino's already won
    else if (this.s.node) this.enter(this.s.node.id);
    else RunMap.show();
  },

  reach() {
    const s = this.s, n = s.map.nodes[s.cur];
    if (n.t === 'boss') return [];
    // Debug (see Options): any stop not yet visited, linked or not.
    if (skipBeacon()) return s.map.nodes.filter((m) => !s.visited.includes(m.id)).map((m) => m.id);
    return s.map.edges.filter((e) => e[0] === s.cur).map((e) => e[1]);
  },

  /* The figurine arrived at stop `id` (js/runmap.js). */
  go(id) {
    const s = this.s, ei = s.map.edges.findIndex((e) => e[0] === s.cur && e[1] === id);
    if (ei < 0 && !this.reach().includes(id)) return;
    if (ei >= 0) s.done.push(ei); // a debug skip has no link to mark
    s.cur = id;
    s.visited.push(id);
    s.stats.stops++;
    s.node = { id };
    this.save();
    this.enter(id);
  },

  enter(id) {
    const n = this.s.map.nodes[id], node = this.s.node;
    if (node.result) return this.outcome(node.icon, node.title, node.result, node.see);
    switch (n.t) {
      case 'battle': case 'boss': return this.battle(n);
      case 'fire': return this.campfire(n);
      case 'altar': return this.transfer({ icon: 'ri_altar', title: 'SIGIL ALTAR', consume: true });
      case 'trade': return this.trader(n);
      case 'event': return this.event(n);
      default: return this.leave();
    }
  },

  leave() {
    this.s.node = null;
    this.save();
    RunMap.show();
  },

  /* Apply an outcome, remember it (so a reload can't apply it twice), and show it. */
  /* `cards` are the cards the outcome names, for its SEE CARD button: a card still in the deck is
     shown as it is now, and one that is gone as it was. They are saved with the result. */
  finishStop(icon, title, text, cards = []) {
    this.register();
    const see = [];
    for (const c of cards) {
      const d = c && ((c.rid != null && this.card(c.rid)) || c);
      if (d && !see.some((x) => x.id === d.id)) see.push({ ...d });
    }
    Object.assign(this.s.node, { icon, title, result: text, see });
    this.save();
    this.outcome(icon, title, text, see);
  },
  /* An act's result as [text, cards]: a plain string, or { text, cards }, plus any cards named here. */
  result(r, cards = []) { return typeof r === 'string' ? [r, cards] : [r.text, [...(r.cards || []), ...cards]]; },
  outcome(icon, title, text, see = []) {
    this.screen(icon, title, '', `<p class="rn-outcome">${escapeHTML(text)}</p>`,
      (see.length ? `<button class="btn" id="rnSee">SEE CARD${see.length > 1 ? 'S' : ''}</button>` : '') + '<button class="btn" id="rnOk">CONTINUE</button>');
    if (see.length) $('#rnSee').onclick = () => { sfx('select'); this.seeCard(see); };
    $('#rnOk').onclick = () => { sfx('select'); this.leave(); };
  },

  /* `back` returns to where you were; `after` is where to go once the run is gone. */
  confirmAbandon(back, after = showTitle) {
    sfx('select');
    showScreen(`
      <div class="result panel">
        <div class="r-title rn-big">ABANDON RUN?</div>
        <div class="r-sub">Your deck and progress in this run will be lost.</div>
        <div class="concede-btns">
          <button class="btn" id="abYes">ABANDON</button>
          <button class="btn" id="abNo">KEEP GOING</button>
        </div>
      </div>`, true);
    $('#abYes').onclick = () => {
      sfx('lose');
      const rec = getRunRecord(); rec.losses++; Store.write(RUN_RECORD_KEY, rec);
      this.clear();
      after();
    };
    $('#abNo').onclick = () => { sfx('select'); back(); };
  },

  clear() {
    this.s = null;
    Store.write(RUN_KEY, null);
    this.register();
  },

  /* ---------- shared screen pieces ---------- */
  screen(icon, title, sub, body = '', btns = '') {
    const s = this.s;
    showScreen(`
      <div class="rn panel">
        <div class="rn-head">
          <img class="rn-icon" src="${spriteURL(icon)}" alt="">
          <div class="rn-headtext"><div class="rn-title">${title}</div><div class="rn-sub">${sub}</div></div>
          <div class="rn-stat">${ico('hp')}<b>${s.life}/${s.maxLife}</b>${ico('arcana')}<b>${s.teeth}</b></div>
        </div>
        <div class="rn-body" id="rnBody">${body}</div>
        <div class="rn-btns">${btns}</div>
      </div>`, true);
  },

  /* Card faces you can click; `small` shrinks them to fit a whole deck. Hovering one shows what it does. */
  cardGrid(el, defs, onPick, small = false) {
    el.classList.add('rn-cards');
    el.classList.toggle('small', small);
    for (const d of defs) {
      const c = document.createElement('div');
      c.className = `card ${d.type}${d.token ? ' token' : ''}`;
      c.innerHTML = cardInnerHTML(d);
      c.onmouseenter = () => this.tip(c, d);
      c.onmouseleave = () => this.tip(null);
      if (onPick) c.onclick = () => { sfx('select'); this.tip(null); onPick(d); };
      else c.classList.add('still');
      el.appendChild(c);
    }
    if (!defs.length) el.innerHTML = '<span class="muted">Nothing here.</span>';
  },

  /* The card's full text in a panel beside it, like the battle's inspector (null hides it). */
  tip(el, d) {
    let t = $('#rnTip');
    if (!el) { if (t) t.remove(); return; }
    if (!t) {
      t = document.createElement('div');
      t.id = 'rnTip';
      t.className = 'rn-tip panel';
      $('#screen').appendChild(t);
    }
    t.innerHTML = inspectHTML(d);
    const r = relRect(el), w = t.offsetWidth, h = t.offsetHeight;
    t.style.left = `${r.x + r.w + 12 + w <= 1268 ? r.x + r.w + 12 : r.x - 12 - w}px`;
    t.style.top = `${Math.max(12, Math.min(708 - h, r.y))}px`;
  },

  /* ---------- battle ---------- */
  /* The opponent's hand: a rival plays their own deck's colors, a later ante's boss its own
     colors (RUN_BOSSES: the Cosmologist plays three), the boss Dealer a random pair. */
  dealerDeck(n, rival) {
    const boss = n.t === 'boss', R = this.rand(100 + n.id), chief = boss && runBoss(this.s);
    const home = rival && DECKS[rival.deck];
    const colors = home ? home.colors.slice(0, 2) : chief ? chief.colors.slice() : runShuffle(R, COLOR_KEYS.slice()).slice(0, 2);
    // The Dealer deals itself commons only: the rarer cards are yours to find.
    const pool = runPool(colors, runCircuitCap(this.s, boss ? BOSS_COST_CAP : DEALER_COST_CAP[n.row])).filter((c) => rarityOf(c) === 'common');
    // Tomes: 10 for a boss, 8 otherwise, shared evenly across its colors (any extra to the first).
    const list = {}, lands = boss ? 10 : 8;
    colors.forEach((k, i) => (list['land_' + k] = Math.floor(lands / colors.length) + (i < lands % colors.length ? 1 : 0)));
    for (let k = 0, guard = 0; k < (boss ? 10 : 10) && guard < 200; guard++) {
      const open = pool.filter((c) => (list[c.id] || 0) < 2);
      if (!open.length) break;
      const c = runPickN(R, open, 1, (x) => (x.type === 'creature' ? 3 : 1))[0]; // any cost up to the cap, equally
      list[c.id] = (list[c.id] || 0) + 1;
      k++;
    }
    const feature = Object.keys(list).filter((id) => CARDS[id].type === 'creature').sort((a, b) => costTotal(CARDS[b].cost) - costTotal(CARDS[a].cost))[0];
    const name = chief ? chief.deck : boss ? 'House Rules' : home ? home.name : DEALER_DECK_NAMES[colors.slice().sort().join('+')];
    return { name, colors, feature: feature || 'dealer', list };
  },

  /* Every battle on the map but the boss is against one of the Dealer's rivals, picked at random
     and not repeated within a run. Kept on the stop so a reload brings back the same one. */
  rival(n) {
    const s = this.s, node = s.node;
    if (n.t === 'boss') return null;
    if (!node.rival || !RIVALS.some((r) => r.id === node.rival)) {
      s.rivals = s.rivals || [];
      const fresh = RIVALS.filter((r) => !s.rivals.includes(r.id));
      const from = fresh.length ? fresh : RIVALS;
      node.rival = from[runRand(this.rand(500 + n.id), from.length)].id;
      s.rivals.push(node.rival);
    }
    return RIVALS.find((r) => r.id === node.rival);
  },

  battle(n) {
    const s = this.s, node = s.node;
    if (node.phase === 'reward') return this.reward(n);
    const boss = n.t === 'boss';
    const life = (boss ? BOSS_LIFE : DEALER_LIFE[n.row] + (s.dealerBonus || 0)) + runCircuitLife(s);
    const rival = this.rival(n);
    const cpuDeck = this.dealerDeck(n, rival);
    node.phase = 'battle';
    this.save();
    // startGame opens with the VS screen (the rival's, the ante's boss's, or the Dealer's).
    startGame(this.deckDef(), { cpuDeck, life: [s.life, life], boss: boss ? s.bossRule : null, run: true, foe: rival || (boss && runBoss(s)) || null });
  },

  /* Called by js/ui.js when a run battle ends (or is conceded). */
  afterBattle(won, youLife, oppLife) {
    $('#game').classList.add('hidden');
    const s = this.s;
    if (!s) return showTitle();
    const n = s.map.nodes[s.cur];
    if (!won) { s.life = 0; return this.finish(false); }
    s.stats.battles++;
    if (n.t === 'boss') return this.casinoFalls(youLife);
    s.dealerBonus = 0;
    s.life = Math.max(1, Math.min(s.maxLife, youLife + RUN_WIN_HEAL));
    const teeth = RUN_WIN_ARCANA + Math.max(0, -oppLife);
    this.gainTeeth(teeth);
    s.node = { id: n.id, phase: 'reward', teeth };
    this.save();
    this.reward(n);
  },

  /* ---------- the encore: beating the casino deals you a new circuit ---------- */
  /* (Players see each circuit as an Ante: the map's HUD reads "ANTE 2" on the second. In code and
     in saved runs it stays s.circuit.)
     The casino falls and the Pit Boss flings you back to the base (js/runmap.js), then a new
     circuit is dealt. Each casino counts as a win on the record; the run goes on until you lose.
     s.encore marks the encore as owed, so a reload partway through skips to the new circuit
     rather than winning the casino twice. */
  casinoFalls(youLife) {
    const s = this.s;
    s.life = Math.max(1, Math.min(s.maxLife, youLife + RUN_WIN_HEAL));
    s.stats.circuits = (s.stats.circuits || 0) + 1;
    s.node = null;
    s.encore = true;
    const rec = getRunRecord(); rec.wins++; Store.write(RUN_RECORD_KEY, rec);
    this.save();
    sfx('win');
    RunMap.show({ encore: { onDark: () => this.newCircuit() } });
  },

  /* A new map for the same deck, life and arcana, back at the base. Its Dealers are a little
     tougher (see runCircuitLife, runCircuitCap), and the boss plays a new house rule. */
  newCircuit() {
    const s = this.s;
    s.circuit = (s.circuit || 1) + 1;
    s.seed = (Math.random() * 2 ** 31) >>> 0;
    s.map = genRunMap(this.rand(1));
    s.bossRule = Object.keys(BOSS_RULES)[runRand(this.rand(2), 3)];
    Object.assign(s, { cur: 0, done: [], visited: [0], node: null, dealerBonus: 0, intro: false, encore: false });
    delete s.sling;
    this.save();
    RunMap.show({ fromDark: true });
  },

  reward(n) {
    const s = this.s, node = s.node, R = this.rand(200 + n.id);
    const want = 2 + Math.floor(n.row / 3); // later rows lean toward pricier cards, and rarer ones
    const offers = runOffer(R, s.colors, 3, { row: n.row, weight: (c) => (costTotal(c.cost) >= want ? 3 : 1) });
    this.screen('ri_battle', 'SPOILS',
      `The Dealer pays ${node.teeth} arcana for the win and the overkill, and you catch your breath (+${RUN_WIN_HEAL} life). Take one card for your deck.`,
      '', `<button class="btn" id="rnSkip">SKIP (+${RUN_SKIP_ARCANA} ARCANA)</button>`);
    this.cardGrid($('#rnBody'), offers, (c) => {
      this.add(c.id);
      this.finishStop('ri_battle', 'SPOILS', `${c.name} joins your deck.`, [c]);
    });
    $('#rnSkip').onclick = () => {
      sfx('select');
      this.gainTeeth(RUN_SKIP_ARCANA);
      this.finishStop('ri_battle', 'SPOILS', `You pocket ${RUN_SKIP_ARCANA} more arcana instead.`);
    };
  },

  /* ---------- campfire: push your luck ---------- */
  campfire() {
    const node = this.s.node;
    if (node.rid != null && !this.rc(node.rid)) node.rid = null;
    if (node.rid == null) {
      const mons = this.creatures();
      this.screen('ri_fire', 'CAMPFIRE', mons.length ? 'Pick a creature to warm by the fire.' : 'You have no creatures to warm.',
        '', '<button class="btn" id="rnLeave">LEAVE</button>');
      this.cardGrid($('#rnBody'), mons, (d) => { node.rid = d.rid; node.n = 0; this.save(); this.campfire(); }, mons.length > 7);
    } else {
      const d = this.card(node.rid), k = node.n || 0;
      this.screen('ri_fire', 'CAMPFIRE',
        k ? `It has taken the heat ${k} time${k > 1 ? 's' : ''}. Again? There's a 25% chance the fire takes it.` : 'The first warmth is free. After that, each boost risks the fire taking it.',
        '', `<button class="btn" id="rnAtk">+1 ATTACK</button><button class="btn" id="rnHp">+2 HEALTH</button><button class="btn" id="rnLeave">LEAVE</button>`);
      this.cardGrid($('#rnBody'), [d], null);
      const boost = (stat, by) => {
        if (k >= 1 && ((isDev() ? this.debugRoll : null) ?? Math.random()) < 0.25) {
          sfx('die');
          CRT.pulse(0.8, true);
          this.remove(d.rid);
          return this.finishStop('ri_fire', 'CAMPFIRE', `The fire took your ${d.name}. It burns a little brighter.`, [d]);
        }
        this.rc(d.rid)[stat] += by;
        node.n = k + 1;
        this.register();
        this.save();
        sfx('heal');
        this.campfire();
      };
      $('#rnAtk').onclick = () => boost('atk', 1);
      $('#rnHp').onclick = () => boost('hp', 2);
    }
    $('#rnLeave').onclick = () => { sfx('select'); this.leave(); };
  },

  /* ---------- sigils: the altar (sacrifice) and the rune circle (copy) ---------- */
  canTake(d, k, from) { return d.rid !== from && !d.sigils.includes(k) && d.sigils.length < 4; },
  givers() {
    const mons = this.creatures();
    return mons.filter((g) => g.sigils.some((k) => mons.some((r) => this.canTake(r, k, g.rid))));
  },

  /* o: { icon, title, consume (sacrifice the giver), cost (life paid on success) } */
  transfer(o) {
    const node = this.s.node, mons = this.creatures();
    if (node.from != null && !this.rc(node.from)) node.from = null;
    const leaveBtn = '<button class="btn" id="rnLeave">LEAVE</button>';
    const wire = () => { $('#rnLeave').onclick = () => { sfx('select'); this.leave(); }; };

    if (node.from == null) {
      const givers = this.givers();
      this.screen(o.icon, o.title,
        givers.length ? (o.consume ? 'Pick a creature to sacrifice. One of its sigils will pass to another.' : 'Pick a creature whose sigil you want to copy.')
          : 'None of your creatures can pass on a sigil.', '', leaveBtn);
      this.cardGrid($('#rnBody'), givers, (d) => { node.from = d.rid; node.sigil = null; this.save(); this.transfer(o); }, givers.length > 7);
      return wire();
    }
    const from = this.card(node.from);
    if (node.sigil == null) {
      const ks = from.sigils.filter((k) => mons.some((r) => this.canTake(r, k, from.rid)));
      this.screen(o.icon, o.title, `Which of ${escapeHTML(from.name)}'s sigils?`,
        `<div class="rn-sigils">${ks.map((k) => `
          <button class="rn-sig" data-k="${k}">${ico(SIGILS[k].icon)}<span><b>${escapeHTML(sigilName(k, from))}</b>${escapeHTML(SIGILS[k].text(from))}</span></button>`).join('')}
        </div>`, `<button class="btn" id="rnBack">BACK</button>${leaveBtn}`);
      $$('.rn-sig').forEach((b) => (b.onclick = () => { sfx('select'); node.sigil = b.dataset.k; this.save(); this.transfer(o); }));
      $('#rnBack').onclick = () => { sfx('select'); node.from = null; this.save(); this.transfer(o); };
      return wire();
    }
    const k = node.sigil, takers = mons.filter((r) => this.canTake(r, k, from.rid));
    this.screen(o.icon, o.title, `Which creature receives ${escapeHTML(sigilName(k, from))}?${o.consume ? ` ${escapeHTML(from.name)} will be sacrificed.` : ` It costs ${o.cost} life.`}`,
      '', `<button class="btn" id="rnBack">BACK</button>${leaveBtn}`);
    this.cardGrid($('#rnBody'), takers, (d) => {
      const rc = this.rc(d.rid);
      rc.sigils.push(k);
      if (k === 'snipe' || k === 'mend') rc[k] = from[k];
      if (o.consume) this.remove(from.rid);
      if (o.cost) this.s.life -= o.cost;
      sfx('spell');
      this.finishStop(o.icon, o.title, `${d.name} gained ${sigilName(k, from)}.${o.consume ? ` ${from.name} is gone.` : ''}`, [d, o.consume && from]);
    }, takers.length > 7);
    $('#rnBack').onclick = () => { sfx('select'); node.sigil = null; this.save(); this.transfer(o); };
    wire();
  },

  /* ---------- trader ---------- */
  /* The trader's three cards at stop n: the same ones whenever it is opened. Rarer ones cost more (runPrice). */
  traderOffers(n) { return runOffer(this.rand(400 + n.id), this.s.colors, 3, { row: n.row }); },

  trader(n) {
    const s = this.s, node = s.node;
    if (!node.offers) {
      node.offers = this.traderOffers(n).map((c) => ({ id: c.id, price: runPrice(c), sold: false }));
      node.tonic = false;
      this.save();
    }
    if (node.burn) return this.burn();
    const price = (p) => `${p} ${ico('arcana', '', Palette.onDarkHi)}`;
    this.screen('ri_arcana', 'TRADER', `Arcana for cards. You have ${s.teeth}.`,
      `<div class="rn-shop">
        ${node.offers.map((o, i) => `<div class="rn-offer" data-i="${i}"><div class="rn-slot"></div>
          <button class="btn" data-buy="${i}" ${o.sold ? 'disabled' : ''}>${o.sold ? 'SOLD' : price(o.price)}</button></div>`).join('')}
        <div class="rn-offer"><div class="rn-tonic panel"><img src="${spriteURL('ri_spring')}" alt=""><b>SULFUR TONIC</b><span>+5 life, up to ${s.maxLife}</span></div>
          <button class="btn" id="rnTonic" ${node.tonic ? 'disabled' : ''}>${node.tonic ? 'SOLD' : price(3)}</button></div>
      </div>`,
      `<button class="btn" id="rnBurn">BURN A CARD (3 ${ico('arcana', '', Palette.onDarkHi)})</button><button class="btn" id="rnLeave">LEAVE</button>`);
    node.offers.forEach((o, i) => this.cardGrid($(`.rn-offer[data-i="${i}"] .rn-slot`), [CARDS[o.id]], null));
    const pay = (p) => {
      if (s.teeth < p) { toast(`You need ${p} arcana.`); sfx('err'); return false; }
      s.teeth -= p;
      sfx('place');
      return true;
    };
    $$('[data-buy]').forEach((b) => (b.onclick = () => {
      const o = node.offers[+b.dataset.buy];
      if (o.sold || !pay(o.price)) return;
      o.sold = true;
      this.add(o.id);
      this.save();
      toast(`${CARDS[o.id].name} joins your deck.`);
      this.trader(n);
    }));
    $('#rnTonic').onclick = () => {
      if (node.tonic) return;
      if (s.life >= s.maxLife) { toast('You are already at full life.'); sfx('err'); return; }
      if (!pay(3)) return;
      node.tonic = true;
      toast(`You recover ${this.heal(5)} life.`);
      sfx('heal');
      this.save();
      this.trader(n);
    };
    $('#rnBurn').onclick = () => {
      if (this.deckSize() <= RUN_MIN_DECK) { toast(`Your deck can't go below ${RUN_MIN_DECK} cards.`); sfx('err'); return; }
      if (s.teeth < 3) { toast('You need 3 arcana.'); sfx('err'); return; }
      sfx('select');
      node.burn = true;
      this.save();
      this.burn();
    };
    $('#rnLeave').onclick = () => { sfx('select'); this.leave(); };
  },

  burn() {
    const s = this.s, node = s.node, cards = this.cards();
    this.screen('ri_arcana', 'BURN A CARD', `Pick a card to burn for 3 arcana. Your deck has ${this.deckSize()} cards.`,
      '', '<button class="btn" id="rnBack">BACK</button>');
    this.cardGrid($('#rnBody'), cards, (d) => {
      s.teeth -= 3;
      this.remove(d.rid);
      node.burn = false;
      this.save();
      sfx('die');
      toast(`${d.name} burned away.`);
      this.trader(s.map.nodes[node.id]);
    }, true);
    $('#rnBack').onclick = () => { sfx('select'); node.burn = false; this.save(); this.trader(s.map.nodes[node.id]); };
  },

  /* ---------- ? stops ---------- */
  canChoose(ch) {
    return (!ch.ok || ch.ok(this)) && (!ch.pick || this.creatures().some(ch.pick));
  },

  event(n) {
    const s = this.s, node = s.node;
    if (!node.ev) {
      const fresh = RUN_EVENTS.filter((e) => !s.events.includes(e.id));
      const from = fresh.length ? fresh : RUN_EVENTS;
      const forced = isDev() && RUN_EVENTS.find((e) => e.id === this.debugEvent);
      node.ev = forced ? forced.id : from[runRand(this.rand(300 + n.id), from.length)].id;
      this.debugEvent = null;
      s.events.push(node.ev);
      this.save();
    }
    const ev = RUN_EVENTS.find((e) => e.id === node.ev);
    if (ev.screen) return this[ev.screen](n, ev);
    if (node.choice != null) {
      const ch = ev.choices[node.choice];
      if (ch.transfer) return this.transfer({ icon: ev.art, title: ev.title, consume: false, cost: ch.cost });
      if (ch.cards) return this.eventCards(ev, ch);
      this.screen(ev.art, ev.title, 'Pick a creature.', '', '<button class="btn" id="rnBack">BACK</button>');
      const mons = this.creatures().filter(ch.pick);
      this.cardGrid($('#rnBody'), mons, (d) => this.finishStop(ev.art, ev.title, ...this.result(ch.act(this, d), [d])), mons.length > 7);
      $('#rnBack').onclick = () => { sfx('select'); node.choice = null; this.save(); this.event(n); };
      return;
    }
    this.screen(ev.art, ev.title, '',
      `<div class="rn-event"><img class="rn-art" src="${spriteURL(ev.art)}" alt=""><p>${escapeHTML(ev.text)}</p></div>`,
      ev.choices.map((ch, i) => {
        const ok = this.canChoose(ch);
        return `<button class="btn" data-ch="${i}" ${ok ? '' : `disabled`}>${escapeHTML(ch.label)}</button>` +
          (ch.see && ch.see(this) ? `<button class="btn" data-see="${i}">SEE CARD</button>` : '');
      }).join('') + (ev.choices.some((ch) => !this.canChoose(ch)) ? `<div class="rn-need">${escapeHTML(ev.choices.find((ch) => !this.canChoose(ch)).need || '')}</div>` : ''));
    $$('[data-ch]').forEach((b) => (b.onclick = () => {
      const ch = ev.choices[+b.dataset.ch];
      if (!this.canChoose(ch)) return;
      sfx('select');
      if (ch.cards) node.cards = ch.cards(this);
      if (ch.pick || ch.transfer || ch.cards) { node.choice = +b.dataset.ch; this.save(); this.event(n); }
      else this.finishStop(ev.art, ev.title, ...this.result(ch.act(this, null, ch)));
    }));
    $$('[data-see]').forEach((b) => (b.onclick = () => { sfx('select'); this.seeCard(ev.choices[+b.dataset.see].see(this)); }));
  },

  /* A card (or a list of them) shown big in a panel over the screen, with a CLOSE button. */
  seeCard(d) {
    const wrap = document.createElement('div');
    wrap.className = 'rn-deckwrap';
    wrap.innerHTML = `<div class="rn panel slot-see"><div class="rn-body" id="seeBody"></div>
      <div class="rn-btns"><button class="btn" id="seeClose">CLOSE</button></div></div>`;
    $('#screen').appendChild(wrap);
    this.cardGrid($('#seeBody'), [].concat(d), null);
    $('#seeClose').onclick = () => { sfx('select'); wrap.remove(); };
  },

  /* A ? stop's cards to pick one of (a sealed pack, the reliquary). They are dealt once and kept on
     the stop, so a reload shows the same ones, and there is no going back to choose something else. */
  eventCards(ev, ch) {
    const defs = (this.s.node.cards || []).map((id) => CARDS[id]).filter(Boolean);
    this.screen(ev.art, ev.title, ch.prompt || 'Take one card for your deck.', '', '<button class="btn" id="rnLeave">LEAVE</button>');
    this.cardGrid($('#rnBody'), defs, (c) => this.finishStop(ev.art, ev.title, ...this.result(ch.take(this, c), [c])));
    $('#rnLeave').onclick = () => { sfx('select'); this.leave(); };
  },

  /* ---------- the slot machine (a ? stop event) ----------
     node.spin holds the current payout, rolled and saved before the reels spin,
     so a reload shows the same one instead of a free reroll. */
  slotRoll(prev) {
    const s = this.s, mons = this.creatures(), pool = runPool(s.colors);
    const kinds = [];
    if (pool.length) kinds.push('card');
    if (mons.length) kinds.push('buff');
    if (s.life < s.maxLife || !kinds.length) kinds.push('heal');
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    let out;
    for (let tries = 0; tries < 6; tries++) { // a reroll tries not to land on the same payout again
      const k = pick(kinds);
      if (k === 'card') out = { k, id: runOffer(Math.random, s.colors, 1, { row: this.row() })[0].id };
      else if (k === 'buff') out = { k, rid: pick(mons).rid, stat: Math.random() < SLOT_ATK_ODDS ? 'atk' : 'hp', by: 1 };
      else out = { k, n: SLOT_HEAL };
      if (!prev || JSON.stringify(out) !== JSON.stringify(prev)) break;
    }
    return out;
  },

  /* The payout, spelled out on the cabinet's readout strip. Card and buff payouts can open the card. */
  slotReadout(t, spinning) {
    const s = this.s, el = $('#slRead');
    const say = (txt, see) => {
      el.innerHTML = `<span class="slot-text">${txt}</span>${see ? '<button class="btn sm" id="slSee">SEE CARD</button>' : ''}`;
    };
    if (spinning) return say('. . .');
    if (!t) return say('PULL THE LEVER. THE FIRST PULL IS FREE.');
    if (t.k === 'heal') return say(`+${Math.min(t.n, s.maxLife - s.life)} LIFE &gt; ${s.life} TO ${Math.min(s.maxLife, s.life + t.n)}`);
    const buff = t.k === 'buff', d = buff ? { ...this.card(t.rid) } : CARDS[t.id];
    if (buff) {
      const was = `${d.atk}/${d.hp}`;
      d[t.stat] += t.by;
      say(`+${t.by} ${t.stat === 'atk' ? 'ATTACK' : 'HEALTH'} &gt; ${escapeHTML(d.name.toUpperCase())} ${was} TO ${d.atk}/${d.hp}`, true);
    } else say(`NEW CARD &gt; ${escapeHTML(d.name.toUpperCase())}`, true);
    $('#slSee').onclick = () => { sfx('select'); this.seeCard(d); };
  },

  /* What the three reels land on, so they show the prize itself: a new card's art three times,
     a buff's creature between two stat icons, or three hearts for life. */
  slotFaces(t) {
    if (t.k === 'card') return Array(3).fill(spriteURL(CARDS[t.id].sprite));
    if (t.k === 'buff') { const stat = iconURL(t.stat); return [stat, spriteURL(this.card(t.rid).sprite), stat]; }
    return Array(3).fill(iconURL('hp'));
  },

  slots(n, ev, spinning = false) {
    const s = this.s, node = s.node;
    if (node.spin && node.spin.k === 'buff' && !this.rc(node.spin.rid)) node.spin = null;
    const t = node.spin, faces = t && !spinning ? this.slotFaces(t) : null;
    const reel = (i) => `<div class="slot-reel"><div class="slot-band"></div><div class="slot-face"><img class="slot-sym" src="${faces ? faces[i] : iconURL(SLOT_FILL[i])}" alt=""></div><div class="slot-band"></div></div>`;
    const pillar = `<div class="slot-pillar">${Array.from({ length: 8 }, (_, i) => `<img src="${iconURL(i % 2 ? 'crossbones' : 'skull', PAL['+'])}" alt="">`).join('')}</div>`;
    const skull = `<img src="${iconURL('skull', Palette.cur.accent)}" alt="">`;
    const price = `${SLOT_REROLL} ${ico('arcana', '', Palette.onDarkHi)}`;
    this.screen(ev.art, ev.title,
      spinning ? 'The reels spin...' : t ? `It pays out. Take it, or pull again for ${SLOT_REROLL} arcana.`
        : 'A one-armed machine rattles in the dark. Every pull pays out.',
      `<div class="slot-mach">
        <div class="slot-cab">${pillar}
          <div class="slot-main">
            <div class="slot-top">${skull}BONE SLOTS${skull}</div>
            <div class="slot-reels">${[0, 1, 2].map(reel).join('')}</div>
            <div class="slot-readout" id="slRead"></div>
          </div>${pillar}
        </div>
        <button class="slot-lever${spinning ? ' pulled' : ''}" id="slLever"><img class="slot-bone" src="${spriteURL('slot_bone')}" alt=""></button>
      </div>`,
      t ? `<button class="btn" id="slTake" ${spinning ? 'disabled' : ''}>TAKE IT</button><button class="btn" id="slPull" ${spinning ? 'disabled' : ''}>REROLL (${price})</button>`
        : `<button class="btn" id="slPull" ${spinning ? 'disabled' : ''}>PULL THE LEVER</button><button class="btn" id="rnLeave" ${spinning ? 'disabled' : ''}>LEAVE</button>`);
    $('.rn').classList.add('rn-slots');
    this.slotReadout(t, spinning);
    if (spinning) return;

    const pull = () => {
      const cost = node.spin ? SLOT_REROLL : 0;
      if (s.teeth < cost) { toast(`You need ${cost} arcana.`); sfx('err'); return; }
      s.teeth -= cost;
      node.spin = this.slotRoll(node.spin);
      this.save();
      sfx('lever');
      this.slots(n, ev, true);
      this.slotSpin(this.slotFaces(node.spin), () => { sfx('payout'); this.slots(n, ev); });
    };
    $('#slPull').onclick = pull;
    $('#slLever').onclick = pull;
    if (!t) { $('#rnLeave').onclick = () => { sfx('select'); this.leave(); }; return; }
    $('#slTake').onclick = () => {
      let text, cards = [];
      if (t.k === 'card') { cards = [this.add(t.id)]; text = `${CARDS[t.id].name} joins your deck.`; sfx('place'); }
      else if (t.k === 'buff') {
        cards = [{ rid: t.rid }];
        this.rc(t.rid)[t.stat] += t.by;
        text = `${this.card(t.rid).name} gained +${t.by} ${t.stat === 'atk' ? 'attack' : 'health'}.`;
        sfx('spell');
      } else { text = `You recover ${this.heal(t.n)} life.`; sfx('heal'); }
      this.finishStop(ev.art, ev.title, text, cards);
    };
  },

  /* Spin the reels on screen, stop them left to right on `faces` (image URLs), then call done. */
  slotSpin(faces, done) {
    const imgs = $$('.slot-reel .slot-sym'), stops = [800, 1150, 1500], step = 70;
    if (FAST) return done();
    let t = 0;
    imgs.forEach((img) => img.parentElement.classList.add('spinning'));
    const timer = setInterval(() => {
      if (!imgs[0].isConnected) return clearInterval(timer);
      t += step;
      imgs.forEach((img, i) => {
        if (t < stops[i]) img.src = iconURL(SLOT_FILL[Math.floor(Math.random() * SLOT_FILL.length)]);
        else if (img.parentElement.classList.contains('spinning')) {
          img.src = faces[i];
          img.parentElement.classList.remove('spinning');
          sfx('reelStop', i);
        }
      });
      if (t < stops[2]) sfx('reel', (t / step) % 3);
      else { clearInterval(timer); setTimeout(done, 350); }
    }, step);
  },

  /* ---------- the sigil wheel (a ? stop event) ----------
     node.segs holds the wheel's sigils and node.rot its angle. node.hit is rolled and saved
     before the wheel turns, so a reload lands on the same sigil instead of a second spin. */
  wheelTakers(k) { return this.creatures().filter((d) => this.canTake(d, k, null)); },
  /* Only sigils some creature can still take go on the wheel; fewer than WHEEL_N repeat round it. */
  wheelSegs() {
    const ks = Object.keys(SIGILS).filter((k) => !WHEEL_SKIP.includes(k) && this.wheelTakers(k).length);
    const pick = runPickN(Math.random, ks, WHEEL_N);
    return pick.length ? Array.from({ length: WHEEL_N }, (_, i) => pick[i % pick.length]) : [];
  },

  /* Draw the wheel pixel by pixel in palette tones, turned `rot` degrees clockwise.
     The sigils stay upright as they go round; `lit` fills the landed segment with the accent. */
  wheelDraw(cv, segs, rot, lit = null) {
    const P = Palette.cur, W = WHEEL_PX, c = W / 2, seg = 360 / segs.length, rad = Math.PI / 180;
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [ink, dark, mid, paper, white, accent] = [P.ink, P.dark, P.mid, P.paper, P.white, P.accent].map(rgb);
    const x = cv.getContext('2d'), img = x.createImageData(W, W), px = img.data;
    for (let y = 0; y < W; y++) for (let xx = 0; xx < W; xx++) {
      const dx = xx + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy);
      if (d > 55) continue;
      const a = (((Math.atan2(dx, -dy) / rad - rot) % 360) + 360) % 360; // wheel's own angle, clockwise from the top
      let col;
      if (d > 53 || (d > 45 && d <= 47) || (d > 12 && d <= 14)) col = ink;
      else if (d > 47) { // the bone rim, pegged every 22.5 degrees
        const st = a % 22.5;
        col = d > 49 && d <= 51 && Math.min(st, 22.5 - st) * rad * d < 1.2 ? mid : d > 52 ? paper : white;
      } else if (d > 14) { // the segments, split by ink spokes
        const off = (a + seg / 2) % seg, i = Math.floor(((a + seg / 2) % 360) / seg);
        col = Math.min(off, seg - off) * rad * d < 0.7 ? ink : i === lit ? accent : i % 2 ? paper : white;
      } else col = dark;
      const o = (y * W + xx) * 4;
      [px[o], px[o + 1], px[o + 2], px[o + 3]] = [...col, 255];
    }
    x.putImageData(img, 0, 0);
    const stamp = (name, cx, cy, color) => {
      x.fillStyle = color;
      ICONS[name].forEach((r, iy) => [...r].forEach((ch, ix) => { if (ch === '#') x.fillRect(cx - 7 + ix * 2, cy - 7 + iy * 2, 2, 2); }));
    };
    segs.forEach((k, i) => {
      const t = (rot + i * seg) * rad;
      stamp(SIGILS[k].icon, Math.round(c + 30 * Math.sin(t)), Math.round(c - 30 * Math.cos(t)), P.ink);
    });
    stamp('skull', c, c, Palette.onDarkHi);
  },

  wheel(n, ev, spinFrom = null) {
    const s = this.s, node = s.node, spinning = spinFrom != null;
    if (!node.segs) { node.segs = this.wheelSegs(); node.rot = Math.floor(Math.random() * 360); this.save(); }
    const segs = node.segs, k = node.hit != null ? segs[node.hit] : null;
    const leaveBtn = `<button class="btn" id="rnLeave" ${spinning ? 'disabled' : ''}>LEAVE</button>`;
    const wire = () => { if ($('#rnLeave')) $('#rnLeave').onclick = () => { sfx('select'); this.leave(); }; };

    if (!segs.length) {
      this.screen(ev.art, ev.title, 'None of your creatures can bear another sigil.',
        `<div class="rn-event"><img class="rn-art" src="${spriteURL(ev.art)}" alt=""><p>${escapeHTML(ev.text)}</p></div>`, leaveBtn);
      return wire();
    }
    if (k && node.pick) { // the sigil is won: pick who bears it
      const name = escapeHTML(SIGILS[k].name), takers = this.wheelTakers(k);
      this.screen(ev.art, ev.title, takers.length ? `Which creature receives ${name}?` : `None of your creatures can bear ${name}.`,
        '', `<button class="btn" id="rnBack">BACK</button>${leaveBtn}`);
      this.cardGrid($('#rnBody'), takers, (d) => {
        this.rc(d.rid).sigils.push(k);
        sfx('spell');
        this.finishStop(ev.art, ev.title, `${d.name} gained ${SIGILS[k].name}.`, [d]);
      }, takers.length > 7);
      $('#rnBack').onclick = () => { sfx('select'); node.pick = false; this.save(); this.wheel(n, ev); };
      return wire();
    }

    const skull = `<img src="${iconURL('skull', Palette.cur.accent)}" alt="">`;
    const pillar = `<div class="slot-pillar">${Array.from({ length: 8 }, (_, i) => `<img src="${iconURL(i % 2 ? 'crossbones' : 'skull', PAL['+'])}" alt="">`).join('')}</div>`;
    const landed = k && !spinning;
    this.screen(ev.art, ev.title,
      spinning ? 'The wheel turns...' : landed ? `It lands on ${escapeHTML(SIGILS[k].name)}: ${escapeHTML(SIGILS[k].text({}))}` : escapeHTML(ev.text),
      `<div class="slot-mach">
        <div class="slot-cab">${pillar}
          <div class="slot-main">
            <div class="slot-top">${skull}SIGIL WHEEL${skull}</div>
            <div class="wh-stage"><canvas class="wh-disk${k ? '' : ' live'}" id="whDisk" width="${WHEEL_PX}" height="${WHEEL_PX}"></canvas><div class="wh-pin"></div></div>
            <div class="slot-readout"><span class="slot-text">${spinning ? '. . .' : landed
              ? `<img class="wh-got" src="${iconURL(SIGILS[k].icon, Palette.onDarkHi)}" alt="">${escapeHTML(SIGILS[k].name.toUpperCase())}`
              : 'ONE SPIN. NO SECOND CHANCES.'}</span></div>
          </div>${pillar}
        </div>
      </div>`,
      landed ? `<button class="btn" id="whGive">GIVE ${escapeHTML(SIGILS[k].name.toUpperCase())}</button>${leaveBtn}`
        : `<button class="btn" id="whSpin" ${k ? 'disabled' : ''}>SPIN THE WHEEL</button>${leaveBtn}`);
    $('.rn').classList.add('rn-slots');
    const cv = $('#whDisk');
    this.wheelDraw(cv, segs, spinning ? spinFrom : node.rot, landed ? node.hit : null);
    wire();
    if (spinning) return;
    if (landed) {
      $('#whGive').onclick = () => { sfx('select'); node.pick = true; this.save(); this.wheel(n, ev); };
      return;
    }
    const spin = () => {
      if (node.hit != null) return;
      const seg = 360 / segs.length, from = node.rot;
      node.hit = Math.floor(Math.random() * segs.length);
      // Come to rest somewhere inside the hit segment, after at least four full turns.
      const land = ((-node.hit * seg + (Math.random() - 0.5) * seg * 0.7) % 360 + 360) % 360;
      node.rot = from - (from % 360) + 360 * 5 + land;
      this.save();
      sfx('wheel');
      this.wheel(n, ev, from);
      this.wheelSpin(segs, from, node.rot, () => { sfx('payout'); this.wheel(n, ev); });
    };
    $('#whSpin').onclick = spin;
    cv.onclick = spin;
  },

  /* Turn the wheel from `from` to `to` degrees, slowing to a stop, with a click for each spoke that passes the pin. */
  wheelSpin(segs, from, to, done) {
    if (FAST) return done();
    const cv = $('#whDisk'), seg = 360 / segs.length, t0 = performance.now();
    let last = Math.floor((from + seg / 2) / seg);
    const frame = (now) => {
      if (!cv.isConnected) return;
      const p = Math.min(1, (now - t0) / WHEEL_SPIN_MS), rot = from + (to - from) * (1 - (1 - p) ** 4);
      this.wheelDraw(cv, segs, rot);
      const at = Math.floor((rot + seg / 2) / seg);
      if (at !== last) { last = at; sfx('wheelTick'); }
      if (p < 1) requestAnimationFrame(frame);
      else setTimeout(done, 450);
    };
    requestAnimationFrame(frame);
  },

  /* ---------- the deck, as seen from the map ---------- */
  /* The deck from the map: every run card, plus the lands, which are free to add or take out here. */
  showDeck(host) {
    const s = this.s, rec = this.recLands(), wrap = document.createElement('div');
    wrap.className = 'rn-deckwrap';
    wrap.innerHTML = `
      <div class="rn panel rn-deck">
        <div class="rn-head"><img class="rn-icon" src="${spriteURL('hero')}" alt="">
          <div class="rn-headtext"><div class="rn-title">YOUR DECK</div>
          <div class="rn-sub"><span id="rnDeckN">${this.deckSize()}</span> cards. Tomes are free to add or take out.</div></div></div>
        <div class="rn-lands">${s.colors.map((k) => `
          <div class="rn-land" data-k="${k}">${ico(COLORS[k].icon)}<span>${COLORS[k].land.toUpperCase()}<i class="rn-rec">${rec[k]} REC.</i></span>
            <button class="mini-btn" data-d="-1">-</button><b>${s.lands[k] || 0}</b><button class="mini-btn" data-d="1">+</button>
          </div>`).join('')}
        </div>
        <div class="rn-body" id="rnDeckBody"></div>
        <div class="rn-btns"><button class="btn" id="rnDeckClose">CLOSE</button></div>
      </div>`;
    host.appendChild(wrap);
    this.cardGrid($('#rnDeckBody'), this.cards().sort((a, b) => COLOR_KEYS.indexOf(a.color) - COLOR_KEYS.indexOf(b.color) || costTotal(a.cost) - costTotal(b.cost)), null, true);
    wrap.querySelectorAll('.rn-land').forEach((row) => row.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => {
      if (!this.setLands(row.dataset.k, +b.dataset.d)) return;
      row.querySelector('b').textContent = s.lands[row.dataset.k];
      $('#rnDeckN').textContent = this.deckSize();
      const hud = $('#rhDeck');
      if (hud) hud.textContent = this.deckSize();
    })));
    $('#rnDeckClose').onclick = () => { sfx('select'); wrap.remove(); };
  },

  /* ---------- end of the run ---------- */
  finish(won) {
    const s = this.s, size = this.deckSize();
    const rec = getRunRecord(); rec[won ? 'wins' : 'losses']++; Store.write(RUN_RECORD_KEY, rec);
    this.clear();
    sfx(won ? 'win' : 'lose');
    showScreen(`
      <div class="result panel">
        <img class="r-art" src="${spriteURL(won ? 'hero' : 'dealer')}" alt="">
        <div class="r-title">${won ? 'RUN CLEARED' : 'RUN OVER'}</div>
        <div class="r-sub">${won ? 'You beat the Dealer at the end of the circuit.' : 'The circuit claims another spellslinger.'}</div>
        <div class="r-tally">
          <div><span>CASINOS FELLED</span><b>${s.stats.circuits || 0}</b></div>
          <div><span>STOPS CLEARED</span><b>${s.stats.stops}</b></div>
          <div><span>BATTLES WON</span><b>${s.stats.battles}</b></div>
          <div><span>ARCANA EARNED</span><b>${s.stats.teeth}</b></div>
          <div class="r-score"><span>FINAL DECK</span><b>${size}</b></div>
        </div>
        <div class="concede-btns">
          <button class="btn" id="runAgain">NEW RUN</button>
          <button class="btn" id="runMenu">MAIN MENU</button>
        </div>
      </div>`, true);
    $('.result').animate([{ transform: 'translateY(-30px) scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 360, easing: 'steps(6)' });
    tallyUp($$('.r-tally b'));
    $('#runAgain').onclick = () => { sfx('select'); this.pickDeck(); };
    $('#runMenu').onclick = () => { sfx('select'); showTitle(); };
  },
};
