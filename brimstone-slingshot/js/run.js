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
  bowl:   { name: 'BRIMSTONE LANES', icon: 'ri_rack', desc: 'Bowling: one ball, ten pins, an arcana for every pin that falls.' },
  casino: { name: 'CASINO',      icon: 'ri_casino', desc: 'Casino: fling yourself at the roulette wheel or the slots.' },
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
    && COLOR_KEYS.every((k) => !c.cost[k] || colors.includes(k))
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

// The rare stops share one chance, so they stay equally rare: each map rolls it once for each.
const RUN_SPECIAL_ODDS = 0.33;                             // chance a map has each rare stop
const RUN_SPECIAL_STOPS = ['bowl', 'casino'];              // the bowling lane (js/bowl.js), the casino (js/casino.js)
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
  // Now and then a campfire, trader or altar is a bowling lane or a casino instead, each rolled on
  // its own at the same odds (rolled last, so the rest of the map comes out as it would without
  // them). The last row's campfire always stays.
  for (const t of RUN_SPECIAL_STOPS) {
    if (R() >= RUN_SPECIAL_ODDS) continue;
    const can = nodes.filter((n) => n.row < RUN_ROWS && ['fire', 'trade', 'altar'].includes(n.t));
    if (can.length) can[runRand(R, can.length)].t = t;
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
    id: 'cracked', title: 'CRACKED CHIP', art: 'ri_chip', screen: 'cracked', // on the Rune Circle's scene (Run.cracked, js/rune.js)
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
    id: 'spring', title: 'SULFUR SPRING', art: 'ri_spring', screen: 'dip',
    text: 'A spring bubbles up, yellow and warm. It smells terrible. It might be good for you.',
    choices: [
      { label: 'DRINK (+6 LIFE)', dip: 'drink', act: (run) => `You drink deep and recover ${run.heal(6)} life.` },
      { label: 'BOTTLE IT (+2 ARCANA)', dip: 'bottle', act: (run) => { run.gainTeeth(2); return 'A trader will pay 2 arcana for this.'; } },
    ],
  },
  {
    id: 'pool', title: 'MOLTEN POOL', art: 'ri_pool', screen: 'dip',
    text: 'A pool of slow fire. Dip a creature from your deck in: three times in four it comes out with Haste, but one time in four it melts away for good.',
    choices: [
      // Run.dip rolls `melt` (dip) and saves it before the card goes in, so the scene can show it.
      { label: 'DIP A CREATURE', pick: (d) => !d.sigils.includes('haste') && d.sigils.length < 4, need: 'Needs a creature without Haste.',
        melts: (run) => ((isDev() ? run.debugRoll : null) ?? Math.random()) < 0.25, dip: (run, ch) => (ch.melts(run) ? 'melt' : 'haste'),
        act: (run, d, ch, melt = ch.melts(run)) => {
          if (melt) { run.remove(d.rid); return `${d.name} melted away.`; }
          run.rc(d.rid).sigils.push('haste');
          return `${d.name} came out with Haste.`;
        } },
      { label: 'LEAVE', act: () => 'You step around the pool.' },
    ],
  },
  {
    id: 'bones', title: 'BONE PILE', art: 'skeleton', screen: 'handover', hands: { mode: 'give', pile: true }, // the Pit Boss's hands (Run.handover, js/handover.js)
    text: 'A heap of bones. One of them is still twitching.',
    choices: [
      { label: 'TAKE A SKELETON (0-COST 1/1)', act: (run) => { const rc = run.add('skeleton'); return { text: 'A Skeleton (0-cost 1/1) joins your deck.', cards: [run.card(rc.rid)] }; } },
      { label: 'SIFT THE BONES (+1 ARCANA)', act: (run) => { run.gainTeeth(1); return 'You sift out 1 arcana.'; } },
    ],
  },
  {
    id: 'offer', title: "THE DEALER'S OFFER", art: 'dealer', screen: 'handover', hands: { mode: 'give', rarity: 'rare' },
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
    id: 'rune', title: 'RUNE CIRCLE', art: 'stasisrune', screen: 'rune',
    text: 'A rune circle turns slowly in the ground. Pay 3 life and it copies a sigil from one creature in your deck onto another.',
    choices: [
      { label: 'PAY 3 LIFE', transfer: true, cost: 3, ok: (run) => run.s.life > 3 && run.givers().length > 0,
        need: 'Needs more than 3 life and a sigil to copy.' },
      { label: 'LEAVE', act: () => 'The circle turns on without you.' },
    ],
  },
  {
    id: 'moth', title: 'WANDERING MOTH', art: 'moth', screen: 'moth', // the glass moth in the graveyard (Run.moth, js/moth.js)
    text: 'A moth made of glass circles your light. Pay 4 life and it gives one creature in your deck its wings: Airborne.',
    choices: [
      { label: 'PAY 4 LIFE', ok: (run) => run.s.life > 4, pick: (d) => !d.sigils.includes('airborne') && d.sigils.length < 4,
        need: 'Needs more than 4 life and a creature without Airborne.',
        act: (run, d) => { run.s.life -= 4; run.rc(d.rid).sigils.push('airborne'); return `${d.name} gained Airborne.`; } },
      { label: 'LEAVE', act: () => 'The moth drifts off into the dark.' },
    ],
  },
  {
    id: 'ghost', title: 'LOST SPELLSLINGER', art: 'apprentice', screen: 'handover', hands: { mode: 'swap' },
    text: 'A spellslinger who never left the table offers a trade: your weakest card for one of theirs.',
    choices: [
      { label: 'TRADE', ok: (run) => run.s.deck.length > 0, need: 'You have no card to trade.',
        see: (run) => run.cards().sort((a, b) => costTotal(a.cost) - costTotal(b.cost))[0],
        // The card you'd get: rolled once and kept on the stop (node.gain), so their hand holds it
        // while you choose and a reload shows the same one.
        gain: (run, out) => {
          const node = run.s.node;
          if (!CARDS[node.gain]) { node.gain = runOffer(Math.random, run.s.colors, 1, { row: run.row(), skip: out ? [out.base] : [] })[0].id; run.save(); }
          return CARDS[node.gain];
        },
        act: (run, _, ch) => {
          const out = ch.see(run);
          const c = ch.gain(run, out);
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
    id: 'pack', title: 'BONE DRAFT', art: 'ri_pack', screen: 'draft', // the giant pack in the ruins (Run.draft, js/draft.js)
    text: 'A giant pack stands sealed among the brimstone spires, its foil still bright. Tear it open and keep one card: one of the three is sure to be rare or better.',
    choices: [
      { label: 'TEAR IT OPEN', cards: (run) => runOffer(Math.random, run.s.colors, 3, { row: run.row(), least: 'rare' }).map((c) => c.id),
        take: (run, c) => { run.add(c.id); return `${c.name} joins your deck.`; } },
      { label: 'SELL IT (+3 ARCANA)', act: (run) => { run.gainTeeth(3); return 'A trader will pay 3 arcana for it, still sealed.'; } },
    ],
  },
  {
    id: 'reliquary', title: 'RELIQUARY', art: 'ri_relic', screen: 'handover', hands: { mode: 'relic', rarity: 'mythical' },
    text: 'Behind a rusted grate, two cards hum like struck bells. Mythical, both of them. The grate only opens for blood: 6 life buys one.',
    choices: [
      { label: 'PAY 6 LIFE', ok: (run) => run.s.life > 6 && runPool(run.s.colors).some((c) => rarityOf(c) === 'mythical'),
        need: 'Needs more than 6 life, and a mythical card in your colors.', prompt: 'Pick one. The grate takes 6 life for it.',
        cards: (run) => runPickN(Math.random, runPool(run.s.colors).filter((c) => rarityOf(c) === 'mythical'), 2).map((c) => c.id),
        take: (run, c) => { run.s.life -= 6; run.add(c.id); return `The grate drinks 6 life and swings open. ${c.name} joins your deck.`; } },
      { label: 'LEAVE', act: () => 'The cards hum on behind the grate.' },
    ],
  },
  /* The casino's two games (casino: true): only its tables open them (Run.casino), never a ? stop.
     Each runs its own screen (Run.slots, Run.wheel) instead of choices. */
  {
    id: 'slots', title: 'BONE SLOTS', art: 'ri_slots', screen: 'slots', casino: true,
    text: 'A one-armed machine rattles in the dark. Every pull pays out.', choices: [],
  },
  {
    id: 'wheel', title: 'SIGIL WHEEL', art: 'ri_wheel', screen: 'wheel', casino: true,
    text: 'A bone wheel ringed with sigils. It turns once, and only once.', choices: [],
  },
  {
    id: 'shrine', title: 'BONE SHRINE', art: 'ri_altar', screen: 'shrine', // the grand altar in the crypt (Run.shrine, js/shrine.js)
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
    id: 'forge', title: 'CRYSTAL FORGE', art: 'golem', screen: 'forge',
    text: 'A forge burning with gem-light. For 2 arcana, the smith will temper one of your creatures.',
    choices: [
      { label: 'PAY 2 ARCANA', ok: (run) => run.s.teeth >= 2, pick: (d) => true, need: 'Needs 2 arcana and a creature.',
        act: (run, d) => { run.s.teeth -= 2; const rc = run.rc(d.rid); rc.atk += 1; rc.hp += 1; return `${d.name} comes out tempered: +1 attack, +1 health.`; } },
      { label: 'LEAVE', act: () => 'The forge burns on without you.' },
    ],
  },
  {
    id: 'mirror', title: 'MIRROR POOL', art: 'mirrorward', screen: 'dip',
    text: 'A still black pool. Whatever looks into it looks back out. It costs a little blood to wake.',
    choices: [
      { label: 'PAY 4 LIFE', dip: 'copy', ok: (run) => run.s.life > 4, pick: (d) => true, need: 'Needs more than 4 life and a creature.',
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

/* The bowling lane (js/bowl.js), a rare stop of its own (RUN_SPECIAL_ODDS): one throw, an arcana per pin,
   and a bonus for a strike. BOWL_STOP is what Run.bowl shows in the header. */
const BOWL_STOP = { title: 'BRIMSTONE LANES', art: 'ri_rack',
  text: 'Ten pins stand at the end of a long lane. One ball, one throw. Every pin that falls pays an arcana.' };
/* The casino (js/casino.js), a rare stop of its own (RUN_SPECIAL_ODDS, as the bowling lane): fling
   yourself at the roulette wheel (the Sigil Wheel) or the slot machine (Bone Slots). */
const CASINO_STOP = { title: 'CASINO', art: 'ri_casino',
  text: 'Try your luck at the casino!' };
/* The Sigil Altar, a stop of its own on the map: the Rune Circle's scene in a graveyard, paid
   for with the creature the sigil comes from (Run.rune, Altar in js/rune.js). */
const ALTAR_STOP = { title: 'SIGIL ALTAR', art: 'ri_altar', consume: true,
  text: 'A bone altar among the graves. Lay a creature on it and one of its sigils passes to another. The creature is gone.',
  choices: [
    { label: 'SACRIFICE', ok: (run) => run.givers().length > 0, need: 'None of your creatures can pass on a sigil.' },
    { label: 'LEAVE', act: () => 'The altar waits for another.' },
  ] };
/* The Idol's test event: an idol turning in the plain event screen. It isn't in RUN_EVENTS, so no ?
   stop rolls it; only its test bench opens it (Run.idolTest, ?scenetest=idol). */
const IDOL_TEST = { title: 'THE IDOL', art: 'ri_idol', parts: { mask: 'alien', vessel: 'alien', pedestal: 'alien' },
  text: 'An idol of three pieces turns slowly on the spot.' };
const BOWL_PER_PIN = 1;
const BOWL_STRIKE_BONUS = 3;
const BOWL_SLIDE_HZ = 0.35;                              // the ball sliding along the foul line, sweeps a second
const BOWL_AIM_HZ = 0.4;                                 // the aim swinging
const BOWL_BAR_HZ = 0.8;                                 // the power bar's marker
const BOWL_STEP_MS = 100;                                // one frame of the throw
// The entrance flight's tail (lane px across and back, map units high, ms): it starts at the top of the arc.
const BOWL_LAND = { across: 280, back: 40, high: 200, ms: 700 };
// Then the ball falls out of the sky to you: how high it starts (map units) and each stepped frame (ms).
const BOWL_STAR = { high: 240, ms: 140 };

const Run = {
  s: null,           // the saved run, or null
  ids: [],           // CARDS ids registered for the current run
  debugRoll: null,   // console, dev account only: force the death rolls (the dip's 25%, the campfire's burnOdds) (0 = the bad outcome)
  debugEvent: null,  // console, dev account only: force the next ? stop's event id
  bench: null,       // a scene test bench's state while one is open (Run.sceneTest), or null

  load() {
    const s = Store.read(RUN_KEY, null);
    this.s = s && s.map && s.deck ? s : null;
    if (this.s) respaceRunMap(this.s.map);
    // A game library card taken back out of the library (js/custom.js) leaves the run's deck.
    if (this.s) this.s.deck = this.s.deck.filter((rc) => CARDS[rc.base]);
    this.register();
    return this.s;
  },
  save() { if (this.s && !this.bench) Store.write(RUN_KEY, this.s); }, // the scene test benches never save
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
      case 'altar': return this.rune(n, ALTAR_STOP);
      case 'trade': return this.trader(n);
      case 'event': return this.event(n);
      case 'bowl': return this.bowl(n, BOWL_STOP);
      case 'casino': return this.casino(n);
      default: return this.leave();
    }
  },

  leave() {
    this.s.node = null;
    this.save();
    RunMap.wipe(() => RunMap.show());
  },

  /* Apply an outcome, remember it (so a reload can't apply it twice), and show it. */
  /* `cards` are the cards the outcome names, for its SEE CARD button: a card still in the deck is
     shown as it is now, and one that is gone as it was. They are saved with the result. */
  finishStop(icon, title, text, cards = [], show = true) {
    this.register();
    const see = [];
    for (const c of cards) {
      const d = c && ((c.rid != null && this.card(c.rid)) || c);
      if (d && !see.some((x) => x.id === d.id)) see.push({ ...d });
    }
    Object.assign(this.s.node, { icon, title, result: text, see });
    this.save();
    if (show) this.outcome(icon, title, text, see);
    return see;
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
  /* The real faces of `defs` over an event scene, where their backs stood (Scene.faces): each opens
     at its back's size and grows to the reading size. `rects`: each back's top left in scene px on
     the plane `to` measures (a draw.toStage). Replaces any faces already up. Returns the faces'
     holders; done(boxes) once they're full size and take clicks. */
  sceneFaces(stage, defs, onPick, rects, to, opts = {}) {
    stage.querySelector('.sc-faces')?.remove();
    const el = document.createElement('div');
    el.className = 'sc-faces';
    stage.appendChild(el);
    this.cardGrid(el, defs, onPick);
    this.tip(null);
    return Scene.faces(el, [...el.querySelectorAll('.card')], rects, to, { now: FAST, ...opts });
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

  /* ---------- campfire: push your luck (js/fire.js) ----------
     You land beside the fire in the woods (the entrance, once per stop: node.cf.landed). HOLD A
     CREATURE asks, over the scene, which one (as the Forge and the Moth do), saves node.rid and
     raises it on a stick over the flames. Each boost decides first: the stats are given and saved
     before the card dips and heats, or the card is removed and node.cf.burnt saved before it chars
     and drops into the fire, so a reload shows where things ended. The first boost is free; after
     that each one risks the fire taking it, a little more each time (burnOdds). Input does nothing while anything moves. */
  /* The chance the fire takes a creature that has already taken the heat k times (k >= 1): 25%, then 5% more each time. */
  burnOdds(k) { return Math.min(0.9, 0.25 + (k - 1) * 0.05); },
  campfire(n) {
    const node = this.s.node, cf = node.cf || (node.cf = {}), test = this.bench;
    const burnt = (d) => this.finishStop('ri_fire', 'CAMPFIRE', `The fire took your ${d.name}. It burns a little brighter.`, [d]);
    if (cf.burnt && !test) return burnt(cf.burnt);
    if (node.rid != null && !test && !this.rc(node.rid)) node.rid = null;
    const ante = test ? test.ante : Math.min(this.s.circuit || 1, RunMap.SPIRE_ANTES.length);
    // The bench holds a stand-in creature, as often as you like.
    const stand = test && (test.fire || (test.fire = { def: Object.values(CARDS).find((c) => c.type === 'creature' && SPRITES[c.sprite]), held: false, n: 0 }));
    const held = () => (test ? (stand.held ? stand.def : null) : node.rid != null ? this.card(node.rid) : null);
    const mons = test ? [stand.def] : this.creatures();
    const subFor = (d) => {
      if (!d) return mons.length ? 'Pick a creature to warm by the fire.' : 'You have no creatures to warm.';
      const k = test ? stand.n : node.n || 0;
      return k ? `It has taken the heat ${k} time${k > 1 ? 's' : ''}. Again? There's a ${Math.round(this.burnOdds(k) * 100)}% chance the fire takes it.` : 'The first warmth is free. After that, each boost risks the fire taking it.';
    };
    const stage = this.sceneScreen('ri_fire', 'CAMPFIRE', subFor(held()),
      '<button class="btn" id="cfHold">HOLD A CREATURE</button><button class="btn" id="cfAtk">+1 ATTACK</button><button class="btn" id="cfHp">+2 HEALTH</button>' +
      (test ? `<button class="btn" id="cfBurn">BURN</button><button class="btn" id="cfAnte">ANTE ${ante}</button><button class="btn" id="rnLeave">DONE</button>` : '<button class="btn" id="rnLeave">LEAVE</button>'));
    const draw = Fire.mount(stage, RunMap.SPIRE_ANTES[ante - 1].heat), lk = this.sceneLock();
    let lvl = 0;
    draw.hit.onmouseenter = () => { const d = held(); if (d) this.tip(draw.hit, d); };
    draw.hit.onmouseleave = () => this.tip(null);
    // Where things stand: HOLD until a creature is over the fire, then the boosts.
    const rest = () => {
      const d = held();
      draw.face(d);
      lvl = test ? stand.n : node.n || 0; // the fire burns a level higher for each heat taken
      draw.grow(lvl);
      draw(d ? Fire.at(0, 'hold', 0, lvl) : Fire.at(Fire.REST));
      draw.hold(!!d);
      lk.unlock();
      $('.rn-sub').textContent = subFor(d);
      $('#cfHold').style.display = d ? 'none' : '';
      $('#cfHold').disabled = !mons.length;
      for (const id of ['#cfAtk', '#cfHp', '#cfBurn']) if ($(id)) $(id).style.display = d ? '' : 'none';
    };
    const play = (mode, to, cues, done, chip = 0) => {
      draw.hold(false);
      this.tip(null);
      if (FAST) return done();
      lk.lock();
      Scene.play({ draw, at: (t) => Fire.at(t, mode, chip, lvl), from: 0, to, cues, done });
    };
    rest();
    lk.lock();
    this.sceneEnter(test ? { landed: !!test.fireLanded } : cf, { draw, at: Fire.at, to: Fire.REST, cues: Fire.ENTER_CUES, done: rest });
    if (test) test.fireLanded = true;
    const take = (d) => {
      if (test) stand.held = true; else { node.rid = d.rid; node.n = 0; this.save(); }
      draw.face(d);
      play('raise', Fire.RAISE, Fire.RAISE_CUES, rest);
    };
    // Which creature: picked over the scene; BACK puts the question away.
    $('#cfHold').onclick = () => {
      if (lk.busy() || !mons.length) return;
      sfx('select');
      if (test) return take(stand.def);
      const wrap = document.createElement('div');
      wrap.className = 'rn-deckwrap';
      wrap.innerHTML = `<div class="rn panel slot-see"><div class="rn-sub">Pick a creature to hold over the fire.</div><div class="rn-body" id="cfBody"></div>
        <div class="rn-btns"><button class="btn" id="cfBack">BACK</button></div></div>`;
      $('#screen').appendChild(wrap);
      this.cardGrid($('#cfBody'), mons, (d) => { wrap.remove(); take(d); }, mons.length > 7);
      $('#cfBack').onclick = () => { sfx('select'); wrap.remove(); };
    };
    const boost = (stat, by, force = false) => {
      const d = held();
      if (lk.busy() || !d) return;
      sfx('select');
      if (test) {
        if (force) return play('burn', Fire.BURN, Fire.BURN_CUES, () => { test.fire = null; this.campfire(n); });
        stand.n++;
        return play('warm', Fire.WARM, Fire.WARM_CUES, rest, stat === 'hp' ? 1 : 0);
      }
      const k = node.n || 0;
      if (k >= 1 && ((isDev() ? this.debugRoll : null) ?? Math.random()) < this.burnOdds(k)) {
        cf.burnt = { ...d };
        this.remove(d.rid);
        this.save();
        return play('burn', Fire.BURN, Fire.BURN_CUES, () => { CRT.pulse(0.8, true); burnt(cf.burnt); });
      }
      this.rc(d.rid)[stat] += by;
      node.n = k + 1;
      this.register();
      this.save();
      play('warm', Fire.WARM, Fire.WARM_CUES, rest, stat === 'hp' ? 1 : 0);
    };
    $('#cfAtk').onclick = () => boost('atk', 1);
    $('#cfHp').onclick = () => boost('hp', 2);
    if (test) {
      $('#cfBurn').onclick = () => boost(null, 0, true);
      $('#cfAnte').onclick = () => { if (lk.busy()) return; sfx('select'); test.ante = test.ante % RunMap.SPIRE_ANTES.length + 1; this.campfire(n); };
      $('#rnLeave').onclick = () => { if (lk.busy()) return; sfx('select'); this.sceneTestEnd(); };
      return;
    }
    $('#rnLeave').onclick = () => { if (lk.busy()) return; sfx('select'); this.leave(); };
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
      const pool = RUN_EVENTS.filter((e) => !e.casino); // the casino's games only open at the casino
      const fresh = pool.filter((e) => !s.events.includes(e.id));
      const from = fresh.length ? fresh : pool;
      const forced = isDev() && RUN_EVENTS.find((e) => e.id === this.debugEvent);
      node.ev = forced ? forced.id : from[runRand(this.rand(300 + n.id), from.length)].id;
      this.debugEvent = null;
      s.events.push(node.ev);
      this.save();
    }
    // Bowling was a ? event before it became a stop of its own; a saved run that rolled it still bowls.
    if (node.ev === 'bowl') return this.bowl(n, BOWL_STOP);
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
    Music.play('event'); // only the casino opens it
    const s = this.s, node = s.node;
    if (node.spin && node.spin.k === 'buff' && !this.rc(node.spin.rid)) node.spin = null;
    const t = node.spin, faces = t && !spinning ? this.slotFaces(t) : null;
    const reel = (i) => `<div class="slot-reel"><div class="slot-band"></div><div class="slot-face"><img class="slot-sym" src="${faces ? faces[i] : iconURL(SLOT_FILL[i])}" alt=""></div><div class="slot-band"></div></div>`;
    const pillar = `<div class="slot-pillar">${Array.from({ length: 8 }, (_, i) => `<img src="${iconURL(i % 2 ? 'crossbones' : 'skull', PAL['+'])}" alt="">`).join('')}</div>`;
    const skull = `<img src="${iconURL('skull', Palette.cur.accent)}" alt="">`;
    const price = `${SLOT_REROLL} ${ico('arcana', '', Palette.onDarkHi)}`;
    this.screen(ev.art, ev.title,
      spinning ? 'The reels spin...' : t ? `It pays out. Take it, leave it, or pull again for ${SLOT_REROLL} arcana.`
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
      t ? `<button class="btn" id="slTake" ${spinning ? 'disabled' : ''}>TAKE IT</button><button class="btn" id="slPull" ${spinning ? 'disabled' : ''}>REROLL (${price})</button><button class="btn" id="rnLeave" ${spinning ? 'disabled' : ''}>LEAVE</button>`
        :`<button class="btn" id="slPull" ${spinning ? 'disabled' : ''}>PULL THE LEVER</button><button class="btn" id="rnLeave" ${spinning ? 'disabled' : ''}>LEAVE</button>`);
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
    $('#rnLeave').onclick = () => { sfx('select'); this.leave(); };
    if (!t) return;
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
    Music.play('event'); // only the casino opens it
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

  /* ---------- the bowling lane (a ? stop event) ----------
     node.bw.step: 0 slide the ball along the foul line, 1 aim, 2 stop the power bar. Each choice is
     saved as it is set, and the throw (node.bw.res) is rolled and saved before the ball rolls,
     so a reload picks up where you were and shows the same pins falling. */
  bowl(n, ev, animate = false) {
    Music.play('event');
    const node = this.s.node, bw = node.bw || (node.bw = { step: 0 }), test = this.bench;
    const res = bw.res, down = res ? res.at.filter((a) => a >= 0).length : 0, strike = down === Bowl.PINS.length;
    const pay = down * BOWL_PER_PIN + (strike ? BOWL_STRIKE_BONUS : 0);
    let said = strike ? `STRIKE! +${pay} ARCANA` : down ? `${down} PIN${down > 1 ? 'S' : ''}: +${pay} ARCANA` : 'GUTTER BALL';
    if (test && res) said += ` · ${this.bowlTally()}`;
    const SUBS = ['Slide along the foul line. Click or press Space to set your spot.',
      'Pick your line. Click or press Space to set the angle.',
      'Stop the bar to throw. A soft throw hooks more; a hard one carries more pins.'];
    const SETS = ['SET SPOT', 'SET ANGLE', 'THROW'];
    const stage = this.sceneScreen(ev.art, ev.title, res ? (animate ? 'The ball rolls...' : said) : SUBS[bw.step],
      res ? (test ? `<button class="btn" id="bwTake" ${animate ? 'disabled' : ''}>THROW AGAIN</button><button class="btn" id="rnLeave">DONE</button>`
        : `<button class="btn" id="bwTake" ${animate ? 'disabled' : ''}>${pay ? 'TAKE IT' : 'CONTINUE'}</button>`)
        : `<button class="btn" id="bwGo">${SETS[bw.step]}</button>${test ? '<button class="btn" id="rnLeave">DONE</button>' : ''}`); // no walking out before you throw
    const draw = Bowl.mount(stage), P = Bowl.PINS;
    const side = P.map((p) => (p.x < Bowl.CX ? -1 : 1)), still = P.map(() => 0);
    const tri = (p) => { p -= Math.floor(p); return p < 0.5 ? p * 2 : 2 - p * 2; };
    if (this.bwKey) document.removeEventListener('keydown', this.bwKey);
    this.bwKey = null;

    if (res) {
      // The throw: the figurine leans in, the ball rolls and hooks, pins fall, the sweep clears them,
      // then the arcana count up one at a time.
      // A soft throw takes more steps to reach the pins (Bowl.rollSteps).
      const roll = Bowl.path(bw.bx, bw.aim, bw.pow), at = res.at, last = Math.max(...at), steps = Bowl.rollSteps(bw.pow);
      const sweep = Math.max(Bowl.LEAN + steps, last + 3) + 3, done = sweep + pay + 2;
      const frame = (k) => {
        const t = Math.max(0, Math.min(1, (k - Bowl.LEAN) / steps)), b = roll(t);
        draw({
          fx: bw.bx - 9, bx: b.x, by: b.y, ball: k <= Bowl.LEAN + steps - 1, spin: Math.max(0, k - Bowl.LEAN) * 13 / steps,
          lean: k < 2 ? 14 * (k + 1) : k < 5 ? 20 - (k - 1) * 5 : 0, bob: k >= 5,
          pins: at.map((a) => (a < 0 ? 0 : k >= sweep ? -1 : k >= a ? Math.min(3, 1 + k - a) : 0)), side: res.side,
          meter: null, arcana: k > sweep ? Math.min(pay, k - sweep) : 0,
        });
      };
      const finish = () => {
        if (test) {
          // The test bench: throw again (button, click or Space), or DONE to go back.
          const again = () => { sfx('select'); this.s.node = { bw: { step: 0, landed: true } }; this.bowl(n, ev); }; // you're already on the lane
          $('#bwTake').onclick = again;
          stage.onclick = again;
          this.bwKey = (e) => {
            if (!stage.isConnected) { document.removeEventListener('keydown', this.bwKey); this.bwKey = null; return; }
            if (e.code === 'Space' && !e.repeat) { e.preventDefault(); again(); }
          };
          document.addEventListener('keydown', this.bwKey);
          $('#rnLeave').onclick = () => { sfx('select'); this.sceneTestEnd(); };
          return;
        }
        $('#bwTake').onclick = () => {
          sfx('select');
          if (pay) this.gainTeeth(pay);
          this.finishStop(ev.art, ev.title, strike ? `Strike! All ten pins go down. You take ${pay} arcana.`
            : down ? `${down} pin${down > 1 ? 's' : ''} go down. You take ${pay} arcana.`
              : 'The ball drops into the gutter. Not a single pin falls.');
        };
      };
      if (!animate || FAST) { frame(done); return finish(); }
      // Draw the first frame now: the screen was just rebuilt, and waiting for the timer leaves it blank for a step.
      frame(0);
      let k = 1;
      const timer = setInterval(() => {
        if (!stage.isConnected) return clearInterval(timer);
        frame(k);
        if (k === Bowl.LEAN) sfx('bowlRoll');
        const fell = at.filter((a) => a === k).length;
        if (fell) sfx('pins', fell);
        if (k > sweep && k - sweep <= pay) sfx('tally');
        if (k++ >= done) {
          clearInterval(timer);
          $('.rn-sub').textContent = said;
          $('#bwTake').disabled = false;
          if (pay) sfx('payout');
          finish();
        }
      }, BOWL_STEP_MS);
      return;
    }

    // Setting up the throw: what the sweeping part shows at time `now`, stepped so it moves in frames.
    let t0 = performance.now();
    const HZ = [BOWL_SLIDE_HZ, BOWL_AIM_HZ, BOWL_BAR_HZ], STEP = [100, 100, 50];
    const value = (now) => tri(Math.floor((now - t0) / STEP[bw.step]) * STEP[bw.step] / 1000 * HZ[bw.step] + 0.25);
    const show = (now) => {
      const v = value(now), bx = bw.step ? bw.bx : Bowl.slideX(v);
      draw({ fx: bx - 9, bx, by: Bowl.BALL_Y, ball: true, spin: 0, lean: 0, aim: bw.step === 1 ? (v * 2 - 1) * Bowl.AIM : bw.step === 2 ? bw.aim : null,
        pins: still, side, meter: bw.step === 2 ? v : null, arcana: 0 });
    };
    let timer = null;
    const start = () => {
      t0 = performance.now();
      timer = setInterval(() => { if (!stage.isConnected) return clearInterval(timer); show(performance.now()); }, 50);
      show(t0);
    };
    // The entrance: the map's slingshot flung you here, so you come in on the tail of that lob, from
    // off the left of the screen at the top of the arc, tumbling, and land on the foul line where the
    // slide starts (Scene.land). Then the ball arrives as a falling star: it drops out of the sky with
    // a trail (its shadow already on the stone where it will land), hits beside you with a ring of
    // dust and one bounce, you jump at the impact, then stoop and take it. Stepped frames,
    // BOWL_STAR.ms each. Once per stop (bw.landed); see "Event entrances" in CLAUDE.md.
    const tx = Bowl.slideX(0.5) - 9, hx = tx + 9, hy = Bowl.BALL_Y, wx = hx + 6, wy = hy - 6, H = BOWL_STAR.high;
    const STAR = [
      { bx: wx, by: wy, bz: H, trail: true }, { bx: wx, by: wy, bz: H * 0.75, trail: true },
      { bx: wx, by: wy, bz: H * 0.5, trail: true }, { bx: wx, by: wy, bz: H * 0.25, trail: true },
      { bx: wx, by: wy, bz: 0, dust: 8, fz: 8 }, // impact: you jump
      { bx: wx, by: wy, bz: 14, dust: 11 },       // one bounce
      { bx: wx, by: wy, bz: 0 },
      { bx: wx, by: wy, bz: 0, lean: 15 },        // stoop
      { bx: hx + 2, by: hy - 2, bz: 6, lean: 8 }, // take it
      { bx: hx, by: hy, bz: 0 },
    ];
    const FLY = BOWL_LAND.ms / 1000, LANDED = FLY + Scene.SQUASH.ms / 1000, STEP_S = BOWL_STAR.ms / 1000, ENTERED = LANDED + STAR.length * STEP_S;
    const enter = (t) => {
      const L = Scene.land(Math.min(1, t / FLY), BOWL_LAND.high);
      const st = { fx: tx - BOWL_LAND.across * L.k, figY: Bowl.FIG_Y - BOWL_LAND.back * L.k, fz: L.z, tumble: L.rot * 90,
        bx: hx, by: hy, ball: false, spin: 0, lean: 0, aim: null, pins: still, side, meter: null, arcana: 0, bob: false };
      if (t < FLY) return st;
      if (t < LANDED) return { ...st, squash: true }; // land with a squash, as on the map
      return { ...st, ball: true, ...STAR[Math.min(STAR.length - 1, Math.floor((t - LANDED) / STEP_S))] };
    };
    let flying = true;
    this.sceneEnter(bw, { draw, at: enter, to: ENTERED, cues: [[FLY, 'land'], [LANDED + 4 * STEP_S, 'diceLand'], [LANDED + 8 * STEP_S, 'place']],
      done: () => { flying = false; start(); } });
    const set = () => {
      if (flying) return;
      if (document.activeElement) document.activeElement.blur(); // so Space doesn't also press the button
      const now = performance.now(), v = value(now);
      if (bw.step === 0) bw.bx = Bowl.slideX(v);
      else if (bw.step === 1) bw.aim = (v * 2 - 1) * Bowl.AIM;
      else {
        bw.pow = v;
        bw.res = Bowl.roll(bw.bx, bw.aim, bw.pow);
        if (test) test.throws.push({ bx: bw.bx, aim: bw.aim, pow: bw.pow, down: bw.res.at.filter((a) => a >= 0).length });
        this.save();
        clearInterval(timer);
        sfx('lever');
        return this.bowl(n, ev, true);
      }
      bw.step++;
      this.save();
      sfx('select');
      t0 = now;
      $('#bwGo').textContent = SETS[bw.step];
      $('.rn-sub').textContent = SUBS[bw.step];
    };
    $('#bwGo').onclick = set;
    stage.onclick = set;
    this.bwKey = (e) => {
      if (!stage.isConnected) { document.removeEventListener('keydown', this.bwKey); this.bwKey = null; return; }
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); set(); }
    };
    document.addEventListener('keydown', this.bwKey);
    if (test) $('#rnLeave').onclick = () => { sfx('select'); this.sceneTestEnd(); };
  },

  /* ---------- the casino (a stop of its own, js/casino.js) ----------
     You land in a slingshot (the entrance, once per stop: node.cs.landed), then fling yourself at
     a table: click it, or its button. The pick is saved (node.cs.game) before you fly, so a reload
     goes straight to that game: the roulette wheel opens the Sigil Wheel (Run.wheel), the slot
     machine Bone Slots (Run.slots), each on this stop's node, and leaving either ends the stop.
     Input does nothing while the figurine is moving. The bench lands you back in the slingshot. */
  casino(n) {
    Music.play('event');
    const node = this.s.node, cs = node.cs || (node.cs = {}), test = this.bench, ev = CASINO_STOP;
    const game = (id) => RUN_EVENTS.find((e) => e.id === Casino.GAMES[id].ev);
    if (cs.game && !test) { const g = game(cs.game); return this[g.screen](n, g); }
    const ante = test ? test.ante : Math.min(this.s.circuit || 1, RunMap.SPIRE_ANTES.length);
    const stage = this.sceneScreen(ev.art, ev.title, escapeHTML(ev.text),
      '<button class="btn" id="csWheel">ROULETTE</button><button class="btn" id="csSlots">SLOTS</button>'
        + (test ? `<button class="btn" id="csAnte">ANTE ${ante}</button><button class="btn" id="rnLeave">DONE</button>` : '<button class="btn" id="rnLeave">LEAVE</button>'));
    const lk = this.sceneLock();
    const pick = (id) => {
      if (lk.busy()) return;
      sfx('select');
      lk.lock();
      if (!test) { cs.game = id; this.save(); }
      const open = () => (test ? (this.s.node = { cs: { landed: true } }, this.casino(n)) : this.casino(n));
      if (FAST) return open();
      const f = Casino.fling(id);
      // As the map: a short beat after the squash, then the wipe into the game.
      Scene.play({ draw, at: f.at, to: f.END, cues: f.CUES, done: () => RunMap.wipe(open) });
    };
    const draw = Casino.mount(stage, RunMap.SPIRE_ANTES[ante - 1].heat, pick);
    lk.lock();
    this.sceneEnter(cs, { draw, at: Casino.at, to: Casino.REST, cues: Casino.ENTER_CUES, done: () => { draw(Casino.at(Casino.REST)); lk.unlock(); } });
    $('#csWheel').onclick = () => pick('wheel');
    $('#csSlots').onclick = () => pick('slots');
    if (test) {
      $('#csAnte').onclick = () => { if (lk.busy()) return; sfx('select'); test.ante = test.ante % RunMap.SPIRE_ANTES.length + 1; this.s.node = { cs: { landed: true } }; this.casino(n); };
      $('#rnLeave').onclick = () => { if (lk.busy()) return; sfx('select'); this.sceneTestEnd(); };
      return;
    }
    $('#rnLeave').onclick = () => { if (lk.busy()) return; sfx('select'); this.leave(); };
  },

  bowlTally() {
    const t = this.bench.throws, n = t.length, sum = t.reduce((a, x) => a + x.down, 0);
    const strikes = t.filter((x) => x.down === Bowl.PINS.length).length, gutters = t.filter((x) => !x.down).length;
    return `THROW ${n} · AVG ${(sum / n).toFixed(1)} · ${strikes} STRIKE${strikes === 1 ? '' : 'S'} · ${gutters} GUTTER${gutters === 1 ? '' : 'S'}`;
  },

  /* ---------- event scenes (js/scene.js): what every one of them shares ---------- */
  /* The cabinet an event scene plays in: the slot machine's skull pillars either side of a stage
     (sized by CSS). Returns the stage, for the scene's own mount (Bowl.mount, Draft.mount). */
  sceneScreen(icon, title, sub, btns) {
    const pillar = `<div class="slot-pillar">${Array.from({ length: 8 }, (_, i) => `<img src="${iconURL(i % 2 ? 'crossbones' : 'skull', PAL['+'])}" alt="">`).join('')}</div>`;
    this.screen(icon, title, sub,
      `<div class="slot-mach"><div class="slot-cab">${pillar}<div class="slot-main"><div class="bw-stage" id="scStage"></div></div>${pillar}</div></div>`, btns);
    $('.rn').classList.add('rn-slots');
    return $('#scStage');
  },
  /* While a scene moves, clicks and keys do nothing: lock() disables the screen's buttons (and
     busy() is true) until unlock(). */
  sceneLock() {
    let busy = false;
    const set = (on) => { busy = on; $$('.rn-btns .btn').forEach((b) => (b.disabled = on)); };
    return { busy: () => busy, lock: () => set(true), unlock: () => set(false) };
  },
  /* The entrance, once per stop: unless flags.landed (saved on the stop's node) or FAST, hold at
     the top of the arc until the map's wipe has cleared, then play at() from 0 to `to` with its
     cues (Scene.play). flags.landed is saved first, so a reload doesn't replay it. done() runs
     either way, once the scene is ready for you. */
  sceneEnter(flags, { draw, at, to, cues = [], done }) {
    if (flags.landed || FAST) return done();
    draw(at(0));
    flags.landed = true;
    this.save();
    RunMap.cleared().then(() => Scene.play({ draw, at, from: 0, to, cues, done }));
  },
  /* The test benches: Run.sceneTest(id) in the console, or index.html?scenetest=<id> (bowl, draft, dip, mirror, spring, moth, rune, altar, forge, shrine, offer, ghost, relic, bones, idol;
     ?bowltest and ?drafttest too). The scene plays as often as you like on a stand-in run: nothing
     is saved (save() checks this.bench) or paid, and DONE puts your run back. this.bench holds the
     bench's own state: the bowling lane's throws, Bone Draft's ante and the colors it deals from. */
  SCENE_BENCHES: {
    bowl: (run) => run.bowl(null, BOWL_STOP),
    casino: (run) => run.casino(null),
    fire: (run) => run.campfire(null),
    draft: (run) => run.draft(null, RUN_EVENTS.find((e) => e.id === 'pack')),
    dip: (run) => run.dip(null, RUN_EVENTS.find((e) => e.id === 'pool')),
    mirror: (run) => run.dip(null, RUN_EVENTS.find((e) => e.id === 'mirror')),
    spring: (run) => run.dip(null, RUN_EVENTS.find((e) => e.id === 'spring')),
    moth: (run) => run.moth(null, RUN_EVENTS.find((e) => e.id === 'moth')),
    rune: (run) => run.rune(null, RUN_EVENTS.find((e) => e.id === 'rune')),
    cracked: (run) => run.cracked(null, RUN_EVENTS.find((e) => e.id === 'cracked')),
    altar: (run) => run.rune(null, ALTAR_STOP),
    forge: (run) => run.forge(null, RUN_EVENTS.find((e) => e.id === 'forge')),
    shrine: (run) => run.shrine(null, RUN_EVENTS.find((e) => e.id === 'shrine')),
    offer: (run) => run.handover(null, RUN_EVENTS.find((e) => e.id === 'offer')),
    ghost: (run) => run.handover(null, RUN_EVENTS.find((e) => e.id === 'ghost')),
    relic: (run) => run.handover(null, RUN_EVENTS.find((e) => e.id === 'reliquary')),
    bones: (run) => run.handover(null, RUN_EVENTS.find((e) => e.id === 'bones')),
    idol: (run) => run.idolTest(IDOL_TEST, new URLSearchParams(location.search).get('idol')),
  },
  sceneTest(id) {
    if (!this.SCENE_BENCHES[id]) return console.warn('No scene bench called', id, '- try', Object.keys(this.SCENE_BENCHES).join(', '));
    if (!this.bench) {
      if (!this.s) this.load(); // so the header shows your run's life and arcana
      const r = this.s;
      this.bench = { id, real: r, throws: [], ante: 1, colors: r && r.colors ? r.colors : Object.keys(COLORS).slice(0, 2) };
    }
    const r = this.bench.real;
    this.s = { life: r ? r.life : 20, maxLife: r ? r.maxLife : 20, teeth: r ? r.teeth : 0, node: {} };
    this.SCENE_BENCHES[id](this);
  },
  sceneTestEnd() {
    if (this.bwKey) document.removeEventListener('keydown', this.bwKey);
    this.bwKey = null;
    this.tip(null);
    this.s = this.bench.real;
    this.bench = null;
    showTitle();
  },
  /* The Idol's test event (IDOL_TEST): the plain event screen, the idol turning left to right and
     back over most of it (Idol.play, js/idol.js). LEAVE puts your run back. */
  idolTest(ev, pick) {
    // `pick` names the pieces by initial, mask then vessel then pedestal (?idol=LRG); unknown letters keep the default
    const names = Object.keys(IDOL_PARTS), parts = { ...ev.parts };
    [...(pick || '')].slice(0, 3).forEach((l, i) => {
      const n = names.find((k) => k[0] === l.toLowerCase());
      if (n) parts[['mask', 'vessel', 'pedestal'][i]] = n;
    });
    this.screen(ev.art, ev.title, escapeHTML(ev.text), '<canvas class="idol-turn" id="idolTurn"></canvas>', '<button class="btn" id="rnLeave">LEAVE</button>');
    const body = $('#rnBody');
    $('.rn').classList.add('rn-idol');
    Idol.play($('#idolTurn'), parts, { w: body.clientWidth, h: body.clientHeight });
    $('#rnLeave').onclick = () => { sfx('select'); this.sceneTestEnd(); };
  },
  bowlTest() { this.sceneTest('bowl'); },
  draftTest() { this.sceneTest('draft'); },

  /* ---------- Bone Draft (the giant pack, a ? event, js/draft.js) ----------
     You land in a slingshot beside the pack (the entrance, once per stop: node.dr.landed), then
     choose. TEAR IT OPEN deals the cards and saves node.dr.opened before the pack opens; the cards
     rise out of it and turn face up over the scene, and you take one there. A reload after that
     shows the open pack with the same cards to pick from. SELL IT takes the arcana instead.
     Input does nothing while the figurine is moving. The spires heat up with the ante. */
  draft(n, ev) {
    const node = this.s.node, dr = node.dr || (node.dr = {}), test = this.bench;
    const [tear, sell] = ev.choices, prompt = 'Take one card for your deck.';
    const opened = dr.opened || node.choice != null; // a saved run from before the pack had a scene deals its cards the old way
    const ante = test ? test.ante : Math.min(this.s.circuit || 1, RunMap.SPIRE_ANTES.length);
    const leave = '<button class="btn" id="rnLeave">LEAVE</button>';
    const stage = this.sceneScreen(ev.art, ev.title, escapeHTML(opened ? prompt : ev.text),
      test ? `<button class="btn" id="drTear">${escapeHTML(tear.label)}</button><button class="btn" id="drAnte">ANTE ${ante}</button><button class="btn" id="rnLeave">DONE</button>`
        : opened ? leave : `<button class="btn" id="drTear">${escapeHTML(tear.label)}</button><button class="btn" id="drSell">${escapeHTML(sell.label)}</button>`);
    const draw = Draft.mount(stage, RunMap.SPIRE_ANTES[ante - 1].heat), lk = this.sceneLock();
    // The risen cards turn face up where they stand over the pack, still fanned, and grow to be
    // read; the one you click joins your deck.
    const pick = (defs, now = false) => {
      draw({ ...Draft.at(Draft.END), cards: -1 });
      this.sceneFaces(stage, defs, (c) => {
        if (test) { stage.querySelector('.sc-faces')?.remove(); return draw(Draft.at(Draft.REST)); } // the bench keeps nothing
        this.finishStop(ev.art, ev.title, ...this.result(tear.take(this, c), [c]));
      }, Draft.CARDS, draw.toStage, { now: now || FAST });
      $('.rn-sub').textContent = prompt;
    };
    if (opened) {
      pick((node.cards || []).map((id) => CARDS[id]).filter(Boolean), true);
      $('#rnLeave').onclick = () => { sfx('select'); this.leave(); };
      return;
    }
    // The entrance: the map's slingshot flung you here, so you land in this one on the tail of that lob.
    lk.lock();
    this.sceneEnter(dr, { draw, at: Draft.at, to: Draft.REST, cues: Draft.ENTER_CUES, done: () => { draw(Draft.at(Draft.REST)); lk.unlock(); } });
    $('#drTear').onclick = () => {
      if (lk.busy()) return;
      sfx('select');
      if (test) {
        // The bench deals three cards that go nowhere, and tears it open as often as you like.
        lk.lock();
        stage.querySelector('.sc-faces')?.remove();
        this.tip(null);
        draw(Draft.at(Draft.REST));
        const defs = runOffer(Math.random, test.colors, 3, { least: 'rare' });
        draw.deal(defs);
        return Scene.play({ draw, at: Draft.at, from: Draft.PULL, to: Draft.END, cues: Draft.CUES, done: () => { lk.unlock(); pick(defs); } });
      }
      node.cards = tear.cards(this);
      node.choice = 0;
      dr.opened = true;
      this.save();
      draw.deal(node.cards.map((id) => CARDS[id]));
      const done = () => {
        $('.rn-btns').innerHTML = leave;
        $('#rnLeave').onclick = () => { sfx('select'); this.leave(); };
        pick(node.cards.map((id) => CARDS[id]));
      };
      if (FAST) return done();
      lk.lock();
      Scene.play({ draw, at: Draft.at, from: Draft.PULL, to: Draft.END, cues: Draft.CUES, done });
    };
    if (test) {
      $('#drAnte').onclick = () => { if (lk.busy()) return; sfx('select'); this.tip(null); test.ante = test.ante % RunMap.SPIRE_ANTES.length + 1; this.s.node = { dr: { landed: true } }; this.draft(n, ev); };
      $('#rnLeave').onclick = () => { if (lk.busy()) return; sfx('select'); this.sceneTestEnd(); };
      return;
    }
    $('#drSell').onclick = () => { if (lk.busy()) return; sfx('select'); this.finishStop(ev.art, ev.title, ...this.result(sell.act(this, null, sell))); };
  },

  /* ---------- the dipping pools (? events, js/dip.js) ----------
     The Molten Pool, the Mirror Pool and the Sulfur Spring share one scene. You land beside the
     pool (the entrance, once per stop: node.sp.landed), then choose. A choice with `dip` (its
     outcome, or a function that rolls one) dips something: a creature, asked for over the scene if
     the choice has `pick`, or the spring's flask. The outcome is saved on node.sp.dip before it
     goes in, and applied (ch.act) once the scene has shown it; a reload mid-dip applies it and
     shows the outcome. Input does nothing while anything moves. The spires heat up with the ante. */
  DIP_POOLS: {
    pool: { water: 'molten', bench: ['haste', 'melt'] },
    mirror: { water: 'black', bench: ['copy'] },
    spring: { water: 'sulfur', bench: ['drink', 'bottle'] },
  },
  dip(n, ev) {
    const node = this.s.node, sp = node.sp || (node.sp = {}), test = this.bench, pool = this.DIP_POOLS[ev.id];
    const finish = (ch, d, mode) => this.finishStop(ev.art, ev.title, ...this.result(ch.act(this, d, ch, mode === 'melt'), d ? [d] : []));
    if (sp.dip && !test) {
      const ch = ev.choices[sp.dip.ch], d = sp.dip.rid != null ? this.card(sp.dip.rid) : null;
      if (d || sp.dip.rid == null) return finish(ch, d, sp.dip.mode);
    }
    const ante = test ? test.ante : Math.min(this.s.circuit || 1, RunMap.SPIRE_ANTES.length);
    const blocked = test ? null : ev.choices.find((ch) => !this.canChoose(ch));
    const stage = this.sceneScreen(ev.art, ev.title, escapeHTML(ev.text),
      test ? pool.bench.map((m) => `<button class="btn" data-mode="${m}">${m.toUpperCase()}</button>`).join('') + `<button class="btn" id="spAnte">ANTE ${ante}</button><button class="btn" id="rnLeave">DONE</button>`
        : ev.choices.map((ch, i) => `<button class="btn" data-ch="${i}">${escapeHTML(ch.label)}</button>`).join('') +
          (blocked ? `<div class="rn-need">${escapeHTML(blocked.need || '')}</div>` : ''));
    const draw = Dip.mount(stage, RunMap.SPIRE_ANTES[ante - 1].heat, pool.water), lk = this.sceneLock();
    const rest = () => {
      draw(Dip.at(Dip.REST));
      lk.unlock();
      if (!test) $$('[data-ch]').forEach((b) => (b.disabled = !this.canChoose(ev.choices[+b.dataset.ch])));
    };
    // The dip itself, with its outcome already decided.
    const play = (mode, done) => {
      if (FAST) return done();
      lk.lock();
      Scene.play({ draw, at: (t) => Dip.at(t, mode), from: Dip.REST, to: Dip.end(mode), cues: Dip.cues(mode), done });
    };
    lk.lock();
    this.sceneEnter(sp, { draw, at: Dip.at, to: Dip.REST, cues: Dip.ENTER_CUES, done: rest });
    if (test) {
      // The bench dips a random creature as often as you like, every way.
      const mons = Object.values(CARDS).filter((c) => c.type === 'creature' && SPRITES[c.sprite]);
      $$('[data-mode]').forEach((b) => (b.onclick = () => { if (lk.busy()) return; sfx('select'); draw.face(mons[Math.floor(Math.random() * mons.length)]); play(b.dataset.mode, rest); }));
      $('#spAnte').onclick = () => { if (lk.busy()) return; sfx('select'); test.ante = test.ante % RunMap.SPIRE_ANTES.length + 1; this.s.node = { sp: { landed: true } }; this.dip(n, ev); };
      $('#rnLeave').onclick = () => { if (lk.busy()) return; sfx('select'); this.sceneTestEnd(); };
      return;
    }
    $$('[data-ch]').forEach((b) => (b.onclick = () => {
      const i = +b.dataset.ch, ch = ev.choices[i];
      if (lk.busy() || !this.canChoose(ch)) return;
      sfx('select');
      if (!ch.dip) return this.finishStop(ev.art, ev.title, ...this.result(ch.act(this, null, ch)));
      const go = (d) => {
        const mode = typeof ch.dip === 'function' ? ch.dip(this, ch) : ch.dip;
        sp.dip = { ch: i, rid: d ? d.rid : null, mode };
        this.save();
        draw.face(d);
        play(mode, () => finish(ch, d, mode));
      };
      if (!ch.pick) return go(null);
      // Which creature: picked over the scene; BACK puts the question away.
      const wrap = document.createElement('div');
      wrap.className = 'rn-deckwrap';
      wrap.innerHTML = `<div class="rn panel slot-see"><div class="rn-sub">Pick a creature to dip.</div><div class="rn-body" id="spBody"></div>
        <div class="rn-btns"><button class="btn" id="spBack">BACK</button></div></div>`;
      $('#screen').appendChild(wrap);
      const mons = this.creatures().filter(ch.pick);
      this.cardGrid($('#spBody'), mons, (d) => { wrap.remove(); go(d); }, mons.length > 7);
      $('#spBack').onclick = () => { sfx('select'); wrap.remove(); };
    }));
  },

  /* ---------- the Wandering Moth (a ? event, js/moth.js) ----------
     You land in a graveyard (the entrance, once per stop: node.mt.landed) and a glass moth circles
     you while you choose. PAY 4 LIFE asks, over the scene, which creature gets its wings; the pick
     is saved on node.mt.to before the moth hovers over you and dusts you with glints, and the
     life is paid and Airborne given once the scene has shown it (a reload after the pick applies
     it straight away). LEAVE sends it off. Input does nothing while anything moves. */
  moth(n, ev) {
    const node = this.s.node, mt = node.mt || (node.mt = {}), test = this.bench;
    const [payCh, leaveCh] = ev.choices;
    const finish = (d) => this.finishStop(ev.art, ev.title, ...this.result(payCh.act(this, d), [d]));
    if (mt.to != null && !test) { const d = this.card(mt.to); if (d) return finish(d); }
    const ante = test ? test.ante : Math.min(this.s.circuit || 1, RunMap.SPIRE_ANTES.length);
    const stage = this.sceneScreen(ev.art, ev.title, escapeHTML(ev.text),
      test ? `<button class="btn" id="mtGive">GIVE WINGS</button><button class="btn" id="mtLeave">LEAVE</button><button class="btn" id="mtAnte">ANTE ${ante}</button><button class="btn" id="rnLeave">DONE</button>`
        : `<button class="btn" id="mtPay">${escapeHTML(payCh.label)}</button><button class="btn" id="mtLeave">${escapeHTML(leaveCh.label)}</button>` +
          (this.canChoose(payCh) ? '' : `<div class="rn-need">${escapeHTML(payCh.need || '')}</div>`));
    const draw = Moth.mount(stage, RunMap.SPIRE_ANTES[ante - 1].heat), lk = this.sceneLock();
    const rest = () => { draw(Moth.at(Moth.REST, 'idle')); draw.idle(true); lk.unlock(); if (!test) $('#mtPay').disabled = !this.canChoose(payCh); };
    const play = (mode, to, cues, done) => {
      draw.idle(false);
      if (FAST) return done();
      lk.lock();
      Scene.play({ draw, at: (t) => Moth.at(t, mode), from: 0, to, cues, done });
    };
    lk.lock();
    this.sceneEnter(mt, { draw, at: Moth.at, to: Moth.REST, cues: Moth.ENTER_CUES, done: rest });
    // After the moth goes, the bench rebuilds the scene (it keeps nothing) and a real run leaves.
    const gone = () => { if (test) { this.s.node = { mt: { landed: true } }; this.moth(n, ev); } };
    $('#mtLeave').onclick = () => {
      if (lk.busy()) return;
      sfx('select');
      play('leave', Moth.LEAVE_END, [], test ? gone : () => this.finishStop(ev.art, ev.title, ...this.result(leaveCh.act(this))));
    };
    if (test) {
      $('#mtGive').onclick = () => { if (lk.busy()) return; sfx('select'); play('gift', Moth.GIFT_END, Moth.GIFT_CUES, gone); };
      $('#mtAnte').onclick = () => { if (lk.busy()) return; sfx('select'); test.ante = test.ante % RunMap.SPIRE_ANTES.length + 1; this.s.node = { mt: { landed: true } }; this.moth(n, ev); };
      $('#rnLeave').onclick = () => { if (lk.busy()) return; sfx('select'); this.sceneTestEnd(); };
      return;
    }
    $('#mtPay').onclick = () => {
      if (lk.busy() || !this.canChoose(payCh)) return;
      sfx('select');
      // Which creature: picked over the scene; BACK puts the question away.
      const wrap = document.createElement('div');
      wrap.className = 'rn-deckwrap';
      wrap.innerHTML = `<div class="rn panel slot-see"><div class="rn-sub">Pick a creature to give wings.</div><div class="rn-body" id="mtBody"></div>
        <div class="rn-btns"><button class="btn" id="mtBack">BACK</button></div></div>`;
      $('#screen').appendChild(wrap);
      const mons = this.creatures().filter(payCh.pick);
      this.cardGrid($('#mtBody'), mons, (d) => {
        wrap.remove();
        mt.to = d.rid;
        this.save();
        play('gift', Moth.GIFT_END, Moth.GIFT_CUES, () => finish(d));
      }, mons.length > 7);
      $('#mtBack').onclick = () => { sfx('select'); wrap.remove(); };
    };
  },

  /* ---------- the Rune Circle (a ? event, js/rune.js on the factory of js/factory.js) ----------
     You land in the circle between two empty plinths (the entrance, once per stop: node.rn.landed),
     then choose. PAY 3 LIFE asks, over the scene, whose sigil to copy, which one and who gets it;
     the last pick saves node.rn.to, your two real cards open on the plinths, and the circle spins
     up and copies the sigil across. The
     life is paid and the sigil given once the scene has shown it; a reload after the last pick
     applies it straight away. Input does nothing while anything moves. The place heats up with the ante.
     The Sigil Altar (ALTAR_STOP, ev.consume) plays the same in a graveyard (Altar in js/rune.js):
     no life is paid, the giver is sacrificed and falls away once the copy has landed. */
  rune(n, ev) {
    const node = this.s.node, rn = node.rn || (node.rn = {}), test = this.bench, Sc = ev.consume ? Altar : Rune;
    const [payCh, leaveCh] = ev.choices, ok = test || this.canChoose(payCh);
    const finish = () => {
      const from = this.card(rn.from), d = this.card(rn.to), k = rn.sigil;
      if (!from || !d) return this.leave();
      const rc = this.rc(d.rid);
      rc.sigils.push(k);
      if (k === 'snipe' || k === 'mend') rc[k] = from[k];
      if (ev.consume) this.remove(from.rid);
      else this.s.life -= payCh.cost;
      sfx('spell');
      this.finishStop(ev.art, ev.title, `${d.name} gained ${sigilName(k, from)}.${ev.consume ? ` ${from.name} is gone.` : ''}`, ev.consume ? [d, from] : [d]);
    };
    if (rn.to != null && !test) return finish();
    const ante = test ? test.ante : Math.min(this.s.circuit || 1, RunMap.SPIRE_ANTES.length);
    const stage = this.sceneScreen(ev.art, ev.title, escapeHTML(ev.text),
      test ? `<button class="btn" id="rcPay">${escapeHTML(payCh.label)}</button><button class="btn" id="rcAnte">ANTE ${ante}</button><button class="btn" id="rnLeave">DONE</button>`
        : `<button class="btn" id="rcPay" ${ok ? '' : 'disabled'}>${escapeHTML(payCh.label)}</button><button class="btn" id="rnLeave">${escapeHTML(leaveCh.label)}</button>` +
          (ok ? '' : `<div class="rn-need">${escapeHTML(payCh.need)}</div>`));
    const draw = Sc.mount(stage, RunMap.SPIRE_ANTES[ante - 1].heat), lk = this.sceneLock();
    const rest = () => { draw(Sc.at(Sc.REST)); lk.unlock(); if (!ok) $('#rcPay').disabled = true; };
    // Your two real cards, standing on the plinths over the scene, the giver's first: each opens at
    // a scene card's size and grows to be read, standing on its plinth (Scene.faces). Then
    // then({ els, top }): their holders, and their top in scene px for the sigil chips.
    const cards = (defs, then) => {
      const rects = [Sc.MID_A, Sc.MID_B].map((x) => [x - Scene.CARD.W / 2, Sc.GY - Sc.PH - Scene.CARD.H]);
      const els = this.sceneFaces(stage, defs, null, rects, draw.toStage, { grow: 'foot', done: (boxes) => {
        // The scene height the camera puts level with the cards' top, found by halving.
        let lo = 0, hi = Sc.GY;
        for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (draw.toStage(Sc.MID_A, m)[1] < boxes[0][1]) lo = m; else hi = m; }
        const top = (lo + hi) / 2;
        draw.cards(top);
        then({ els, top });
      } });
      els.forEach((el) => el.classList.add('rc-real'));
    };
    // The copy, played over the real cards: each lights as its part happens.
    const play = (defs, done) => {
      lk.lock();
      cards(defs, ({ els, top }) => {
        if (FAST) return done(els);
        const at = (t) => { const S = Sc.at(t, top); els[0].classList.toggle('rc-lit', S.flashA); els[0].classList.toggle('rc-gone', !!S.gone); els[1].classList.toggle('rc-lit', S.flashB); return S; };
        Scene.play({ draw, at, from: Sc.REST, to: Sc.END, cues: Sc.CUES, done: () => done(els) });
      });
    };
    lk.lock();
    this.sceneEnter(rn, { draw, at: Sc.at, to: Sc.REST, cues: Sc.ENTER_CUES, done: rest });
    if (test) {
      // The bench copies between two dealt cards as often as you like.
      $('#rcPay').onclick = () => {
        if (lk.busy()) return;
        sfx('select');
        const mons = runOffer(Math.random, test.colors, 12).filter((c) => c.type === 'creature');
        play([mons[0] || CARDS.golem, mons[1] || CARDS.moth], (els) => { els.forEach((el) => el.remove()); draw.cards(null); rest(); });
      };
      $('#rcAnte').onclick = () => { if (lk.busy()) return; sfx('select'); test.ante = test.ante % RunMap.SPIRE_ANTES.length + 1; this.s.node = { rn: { landed: true } }; this.rune(n, ev); };
      $('#rnLeave').onclick = () => { if (lk.busy()) return; sfx('select'); this.sceneTestEnd(); };
      return;
    }
    // The three questions, each over the scene; BACK goes up one.
    const ask = (sub, back) => {
      const wrap = document.createElement('div');
      wrap.className = 'rn-deckwrap';
      wrap.innerHTML = `<div class="rn panel slot-see"><div class="rn-sub">${sub}</div><div class="rn-body" id="rcBody"></div>
        <div class="rn-btns"><button class="btn" id="rcBack">BACK</button></div></div>`;
      $('#screen').appendChild(wrap);
      $('#rcBack').onclick = () => { sfx('select'); wrap.remove(); back(); };
      return wrap;
    };
    const pickFrom = () => {
      const givers = this.givers(), wrap = ask(ev.consume ? 'Pick a creature to sacrifice. One of its sigils will pass to another.' : 'Pick a creature whose sigil you want to copy.', () => {});
      this.cardGrid($('#rcBody'), givers, (d) => { wrap.remove(); rn.from = d.rid; pickSigil(); }, givers.length > 7);
    };
    const pickSigil = () => {
      const from = this.card(rn.from), mons = this.creatures(), ks = from.sigils.filter((k) => mons.some((r) => this.canTake(r, k, from.rid)));
      const wrap = ask(`Which of ${escapeHTML(from.name)}'s sigils?`, pickFrom);
      $('#rcBody').innerHTML = `<div class="rn-sigils">${ks.map((k) => `
        <button class="rn-sig" data-k="${k}">${ico(SIGILS[k].icon)}<span><b>${escapeHTML(sigilName(k, from))}</b>${escapeHTML(SIGILS[k].text(from))}</span></button>`).join('')}</div>`;
      $$('.rn-sig').forEach((b) => (b.onclick = () => { sfx('select'); wrap.remove(); rn.sigil = b.dataset.k; pickTo(); }));
    };
    const pickTo = () => {
      const from = this.card(rn.from), k = rn.sigil, takers = this.creatures().filter((r) => this.canTake(r, k, from.rid));
      const wrap = ask(`Which creature receives ${escapeHTML(sigilName(k, from))}?${ev.consume ? ` ${escapeHTML(from.name)} will be sacrificed.` : ` It costs ${payCh.cost} life.`}`, pickSigil);
      this.cardGrid($('#rcBody'), takers, (d) => { wrap.remove(); rn.to = d.rid; this.save(); play([from, d], finish); }, takers.length > 7);
    };
    $('#rcPay').onclick = () => { if (lk.busy() || !ok) return; sfx('select'); pickFrom(); };
    $('#rnLeave').onclick = () => { if (lk.busy()) return; sfx('select'); this.finishStop(ev.art, ev.title, ...this.result(leaveCh.act(this, null, leaveCh))); };
  },

  /* ---------- the Bone Shrine (a ? event, js/shrine.js in the crypt of js/settings.js) ----------
     You land beside the altar (the entrance, once per stop: node.sh.landed), then choose.
     OFFER YOUR WEAKEST applies the offering straight away and saves it (node.sh.res) before the
     card moves: the card goes up on the slab, the skulls wake and the hearts come back, and then the
     outcome shows. A reload after the offering shows the outcome without replaying it. Input does
     nothing while anything moves. The candles burn more each ante. */
  shrine(n, ev) {
    const node = this.s.node, sh = node.sh || (node.sh = {}), test = this.bench;
    const [offerCh, leaveCh] = ev.choices, ok = test || this.canChoose(offerCh);
    if (sh.res && !test) return this.finishStop(ev.art, ev.title, sh.res.text, sh.res.cards);
    const ante = test ? test.ante : Math.min(this.s.circuit || 1, RunMap.SPIRE_ANTES.length);
    const stage = this.sceneScreen(ev.art, ev.title, escapeHTML(ev.text),
      test ? `<button class="btn" id="shOffer">${escapeHTML(offerCh.label)}</button><button class="btn" id="shAnte">ANTE ${ante}</button><button class="btn" id="rnLeave">DONE</button>`
        : `<button class="btn" id="shOffer" ${ok ? '' : 'disabled'}>${escapeHTML(offerCh.label)}</button>` +
          `<button class="btn" id="rnLeave">${escapeHTML(leaveCh.label)}</button>` +
          (ok ? '' : `<div class="rn-need">${escapeHTML(offerCh.need)}</div>`));
    // The card on offer is the real one (the bench uses a stand-in creature), held over your head:
    // hover it for its text.
    const def = test ? Object.values(CARDS).find((c) => c.type === 'creature') : offerCh.see && offerCh.see(this);
    const draw = Shrine.mount(stage, RunMap.SPIRE_ANTES[ante - 1].heat, def), lk = this.sceneLock();
    if (draw.face) { draw.face.onmouseenter = () => this.tip(draw.face, def); draw.face.onmouseleave = () => this.tip(null); }
    const rest = () => { draw(Shrine.at(Shrine.REST)); lk.unlock(); if (!ok) $('#shOffer').disabled = true; };
    const play = (done) => {
      if (FAST) return done();
      lk.lock();
      Scene.play({ draw, at: Shrine.at, from: Shrine.START, to: Shrine.END, cues: Shrine.CUES, done });
    };
    lk.lock();
    this.sceneEnter(sh, { draw, at: Shrine.at, to: Shrine.REST, cues: Shrine.ENTER_CUES, done: rest });
    if (test) {
      // The bench offers a stand-in card as often as you like.
      $('#shOffer').onclick = () => { if (lk.busy()) return; sfx('select'); this.tip(null); play(rest); };
      $('#shAnte').onclick = () => { if (lk.busy()) return; sfx('select'); test.ante = test.ante % RunMap.SPIRE_ANTES.length + 1; this.s.node = { sh: { landed: true } }; this.shrine(n, ev); };
      $('#rnLeave').onclick = () => { if (lk.busy()) return; sfx('select'); this.sceneTestEnd(); };
      return;
    }
    $('#shOffer').onclick = () => {
      if (lk.busy() || !ok) return;
      sfx('select');
      this.tip(null);
      const [text, cards] = this.result(offerCh.act(this, null, offerCh)); // the offering, taken now and saved before it is shown
      sh.res = { text, cards: cards.map((c) => ({ ...c })) };
      this.save();
      play(() => this.finishStop(ev.art, ev.title, sh.res.text, sh.res.cards));
    };
    $('#rnLeave').onclick = () => { if (lk.busy()) return; sfx('select'); this.finishStop(ev.art, ev.title, ...this.result(leaveCh.act(this, null, leaveCh))); };
  },

  /* ---------- the Cracked Chip (a ? event, the Rune Circle's scene: Cracked in js/rune.js) ----------
     You land in the circle with the cracked chip hanging over your head (the entrance, once per
     stop: node.cc.landed), then choose. Pressing it asks, over the scene, which creature; the
     outcome follows straight away. Input does nothing while you land. */
  cracked(n, ev) {
    const node = this.s.node, cc = node.cc || (node.cc = {}), test = this.bench;
    const ante = test ? test.ante : Math.min(this.s.circuit || 1, RunMap.SPIRE_ANTES.length);
    const can = (ch) => test || this.canChoose(ch), need = ev.choices.find((ch) => !can(ch));
    const stage = this.sceneScreen(ev.art, ev.title, escapeHTML(ev.text),
      ev.choices.filter((ch) => !test || ch.pick).map((ch) => `<button class="btn" data-ch="${ev.choices.indexOf(ch)}">${escapeHTML(ch.label)}</button>`).join('') +
        (test ? `<button class="btn" id="ccAnte">ANTE ${ante}</button><button class="btn" id="rnLeave">DONE</button>` : need ? `<div class="rn-need">${escapeHTML(need.need || '')}</div>` : ''));
    const draw = Cracked.mount(stage, RunMap.SPIRE_ANTES[ante - 1].heat), lk = this.sceneLock();
    const rest = () => { draw(Cracked.at(Cracked.REST)); lk.unlock(); $$('[data-ch]').forEach((b) => (b.disabled = !can(ev.choices[+b.dataset.ch]))); };
    lk.lock();
    this.sceneEnter(cc, { draw, at: Cracked.at, to: Cracked.REST, cues: Cracked.ENTER_CUES, done: rest });
    $$('[data-ch]').forEach((b) => (b.onclick = () => {
      const ch = ev.choices[+b.dataset.ch];
      if (lk.busy() || !can(ch)) return;
      sfx('select');
      if (test) return; // the bench only shows the scene
      if (!ch.pick) return this.finishStop(ev.art, ev.title, ...this.result(ch.act(this, null, ch)));
      // Which creature: picked over the scene; BACK puts the question away.
      const wrap = document.createElement('div');
      wrap.className = 'rn-deckwrap';
      wrap.innerHTML = `<div class="rn panel slot-see"><div class="rn-sub">Pick a creature.</div><div class="rn-body" id="ccBody"></div>
        <div class="rn-btns"><button class="btn" id="ccBack">BACK</button></div></div>`;
      $('#screen').appendChild(wrap);
      const mons = this.creatures().filter(ch.pick);
      this.cardGrid($('#ccBody'), mons, (d) => { wrap.remove(); this.finishStop(ev.art, ev.title, ...this.result(ch.act(this, d), [d])); }, mons.length > 7);
      $('#ccBack').onclick = () => { sfx('select'); wrap.remove(); };
    }));
    if (test) {
      $('#ccAnte').onclick = () => { if (lk.busy()) return; sfx('select'); test.ante = test.ante % RunMap.SPIRE_ANTES.length + 1; this.s.node = { cc: { landed: true } }; this.cracked(n, ev); };
      $('#rnLeave').onclick = () => { if (lk.busy()) return; sfx('select'); this.sceneTestEnd(); };
    }
  },

  /* ---------- the Crystal Forge (a ? event, js/forge.js on the factory of js/factory.js) ----------
     You land beside a creature on a cradle (the entrance, once per stop: node.fg.landed), then
     choose. PAY 2 ARCANA asks, over the scene, which creature, and saves node.fg.rid before the
     chain drags it back into the lava river and out again. The arcana is paid and the stats given once the
     scene has shown it; a reload after the pick applies it straight away. Input does nothing
     while anything moves. The furnaces heat up with the ante. */
  forge(n, ev) {
    const node = this.s.node, fg = node.fg || (node.fg = {}), test = this.bench;
    const [payCh, leaveCh] = ev.choices, ok = test || this.canChoose(payCh);
    const finish = (d) => this.finishStop(ev.art, ev.title, ...this.result(payCh.act(this, d), [d]));
    if (fg.rid != null && !test) { const d = this.card(fg.rid); if (d) return finish(d); }
    const ante = test ? test.ante : Math.min(this.s.circuit || 1, RunMap.SPIRE_ANTES.length);
    const stage = this.sceneScreen(ev.art, ev.title, escapeHTML(ev.text),
      test ? `<button class="btn" id="fgPay">${escapeHTML(payCh.label)}</button><button class="btn" id="fgAnte">ANTE ${ante}</button><button class="btn" id="rnLeave">DONE</button>`
        : `<button class="btn" id="fgPay" ${ok ? '' : 'disabled'}>${escapeHTML(payCh.label)}</button><button class="btn" id="rnLeave">${escapeHTML(leaveCh.label)}</button>` +
          (ok ? '' : `<div class="rn-need">${escapeHTML(payCh.need)}</div>`));
    const draw = Forge.mount(stage, RunMap.SPIRE_ANTES[ante - 1].heat), lk = this.sceneLock();
    const rest = () => { draw(Forge.at(Forge.REST)); lk.unlock(); if (!ok) $('#fgPay').disabled = true; };
    const play = (done) => {
      if (FAST) return done();
      lk.lock();
      Scene.play({ draw, at: Forge.at, from: Forge.REST, to: Forge.END, cues: Forge.CUES, done });
    };
    lk.lock();
    this.sceneEnter(fg, { draw, at: Forge.at, to: Forge.REST, cues: Forge.ENTER_CUES, done: rest });
    if (test) {
      // The bench tempers a stand-in card as often as you like.
      $('#fgPay').onclick = () => { if (lk.busy()) return; sfx('select'); play(rest); };
      $('#fgAnte').onclick = () => { if (lk.busy()) return; sfx('select'); test.ante = test.ante % RunMap.SPIRE_ANTES.length + 1; this.s.node = { fg: { landed: true } }; this.forge(n, ev); };
      $('#rnLeave').onclick = () => { if (lk.busy()) return; sfx('select'); this.sceneTestEnd(); };
      return;
    }
    // Which creature: picked over the scene; BACK puts the question away.
    $('#fgPay').onclick = () => {
      if (lk.busy() || !ok) return;
      sfx('select');
      const wrap = document.createElement('div');
      wrap.className = 'rn-deckwrap';
      wrap.innerHTML = `<div class="rn panel slot-see"><div class="rn-sub">Pick a creature to temper.</div><div class="rn-body" id="fgBody"></div>
        <div class="rn-btns"><button class="btn" id="fgBack">BACK</button></div></div>`;
      $('#screen').appendChild(wrap);
      const mons = this.creatures().filter(payCh.pick);
      this.cardGrid($('#fgBody'), mons, (d) => {
        wrap.remove();
        fg.rid = d.rid;
        this.save();
        draw.face(d);
        play(() => finish(d));
      }, mons.length > 7);
      $('#fgBack').onclick = () => { sfx('select'); wrap.remove(); };
    };
    $('#rnLeave').onclick = () => { if (lk.busy()) return; sfx('select'); this.finishStop(ev.art, ev.title, ...this.result(leaveCh.act(this, null, leaveCh))); };
  },

  /* ---------- the Pit Boss's hands (four ? events, js/handover.js) ----------
     The Dealer's Offer, the Lost Spellslinger, the Reliquary and the Bone Pile share one scene (ev.hands
     picks its mode). You land in the middle and the Pit Boss's hands slide in from either side (the
     entrance, once per stop: node.ho.landed). Choosing deals the outcome and saves it on the stop
     (node.result) before the card floats to you, turns over and the real face opens over the scene,
     so a reload shows the outcome instead of dealing again. The Reliquary instead deals its two
     cards (node.cards, node.choice) and opens both faces for you to pick one over the scene; the
     life is only paid when you pick. Input does nothing while anything moves. */
  handover(n, ev) {
    const node = this.s.node, ho = node.ho || (node.ho = {}), test = this.bench;
    const [go, other] = ev.choices, relic = ev.hands.mode === 'relic', H = Handover.make(ev.hands);
    const ok = test || this.canChoose(go);
    const ante = test ? test.ante : Math.min(this.s.circuit || 1, RunMap.SPIRE_ANTES.length);
    const paid = !test && relic && node.choice != null && (node.cards || []).length > 0; // a reload after paying: straight to the pick
    const leave = '<button class="btn" id="rnLeave">LEAVE</button>';
    const stage = this.sceneScreen(ev.art, ev.title, escapeHTML(paid ? go.prompt : ev.text),
      test ? `<button class="btn" id="hoGo">${escapeHTML(go.label)}</button><button class="btn" id="hoAnte">ANTE ${ante}</button><button class="btn" id="rnLeave">DONE</button>`
        : paid ? leave
          : `<button class="btn" id="hoGo" ${ok ? '' : 'disabled'}>${escapeHTML(go.label)}</button>` +
            `<button class="btn" id="hoOther">${escapeHTML(other.label)}</button>` + (ok ? '' : `<div class="rn-need">${escapeHTML(go.need || '')}</div>`));
    const draw = H.mount(stage, RunMap.SPIRE_ANTES[ante - 1].heat), lk = this.sceneLock();
    const idle = () => { draw(H.at(H.REST)); lk.unlock(); if (!ok) $('#hoGo').disabled = true; };
    // A swap's two cards are face up in the scene, the real ones (hover either for its text): your
    // weakest over your head, and the one you'd get (rolled and kept on the stop) in the right hand.
    // A bench uses stand-ins.
    let gain = null;
    if (ev.hands.mode === 'swap') {
      const mine = test ? runPool(test.colors)[0] : go.see(this);
      gain = test ? runOffer(Math.random, test.colors, 1)[0] : mine && go.gain(this, mine);
      const el = (d) => { if (!d) return null; const box = document.createElement('div'); this.cardGrid(box, [d], null); return box.firstElementChild; };
      draw.hold({ mine: el(mine), gain: el(gain) });
      if (gain) draw.deal([gain]);
    }
    // The outcome is dealt and saved before anything moves (the stop is finished; its screen is not shown yet).
    const settle = (r, cards) => {
      const [text, list] = this.result(r, cards);
      return { text, see: this.finishStop(ev.art, ev.title, text, list, false) };
    };
    // The real card faces open over the scene where the backs turned over your head, as Bone Draft's do
    // (a swap's card was face up already: it only grows). Hover one for its text.
    const faces = (defs, onPick, now = false) => this.sceneFaces(stage, defs, onPick, H.HEADS, draw.toFront, { now: now || FAST, open: ev.hands.mode !== 'swap' });
    // The stop is done: its outcome shows in the header, and CONTINUE leaves.
    const finish = (text) => {
      $('.rn-sub').textContent = text || ev.text;
      if (test) return lk.unlock(); // the bench keeps the last frame; the next press resets the scene
      $('.rn-btns').innerHTML = '<button class="btn" id="rnLeave">CONTINUE</button>';
      $('#rnLeave').onclick = () => { sfx('select'); this.leave(); };
      lk.unlock();
    };
    // Play the timeline from `from` to `to`; `turned` runs once when the faces take over.
    const play = (from, to, turned, done) => {
      let shown = false;
      const watch = (S) => { draw(S); if (S.t >= H.TURNED && !shown) { shown = true; turned(); } };
      watch.alive = draw.alive;
      lk.lock();
      Scene.play({ draw: watch, at: H.at, from, to, cues: H.CUES, done });
    };
    // The Reliquary's pick: two real faces over the scene; the one you click is yours and the hands leave.
    const pick = (defs, now = false) => {
      let taken = false;
      $('.rn-sub').textContent = go.prompt || 'Pick one.';
      const ws = faces(defs, (c) => {
        if (taken || lk.busy()) return;
        taken = true;
        const text = test ? '' : settle(go.take(this, c), [c]).text;
        ws.forEach((w, i) => { if (defs[i] !== c) w.remove(); }); // the one you took stays where it opened
        if (FAST) return test ? lk.unlock() : this.outcome(ev.art, ev.title, text, node.see);
        play(H.TURNED, H.END, () => {}, () => finish(text));
      });
    };

    if (paid) { // reloaded after paying: the faces are open already
      const defs = node.cards.map((id) => CARDS[id]).filter(Boolean);
      draw.deal(defs);
      draw(H.at(H.TURNED));
      pick(defs, true);
      $('#rnLeave').onclick = () => { sfx('select'); this.leave(); };
      return;
    }
    // The entrance: the map's slingshot flung you here, so you land in the middle on the tail of that lob.
    lk.lock();
    this.sceneEnter(ho, { draw, at: H.at, to: H.REST, cues: H.ENTER_CUES, done: idle });
    $('#hoGo').onclick = () => {
      if (lk.busy() || !ok) return;
      sfx('select');
      this.tip(null);
      stage.querySelector('.sc-faces')?.remove();
      draw.deal([]);
      if (test) draw(H.at(H.REST));
      if (relic) {
        const defs = test ? runPickN(Math.random, (m => (m.length >= 2 ? m : runPool(test.colors)))(runPool(test.colors).filter((c) => rarityOf(c) === 'mythical')), 2)
          : (node.cards = go.cards(this), node.choice = 0, this.save(), node.cards.map((id) => CARDS[id]).filter(Boolean));
        draw.deal(defs);
        if (!test) { // dealt: there is no paying twice, only picking or leaving
          $('.rn-btns').innerHTML = leave;
          $('#rnLeave').onclick = () => { if (lk.busy()) return; sfx('select'); this.leave(); };
        }
        if (FAST) { draw(H.at(H.TURNED)); return pick(defs); }
        return play(H.REST, H.TURNED, () => {}, () => { lk.unlock(); pick(defs); });
      }
      // Dealt and saved first; a bench deals a stand-in card that goes nowhere.
      const got = test ? { text: '', see: [gain || (ev.id === 'bones' ? CARDS.skeleton : runOffer(Math.random, test.colors, 1, { least: ev.id === 'offer' ? 'rare' : 'common' })[0])] }
        : settle(go.act(this, null, go));
      if (FAST) return this.outcome(ev.art, ev.title, got.text, got.see);
      const card = got.see[got.see.length - 1];
      draw.deal([card]);
      play(H.REST, H.END, () => faces([card], null), () => finish(got.text));
    };
    if (test) {
      $('#hoAnte').onclick = () => { if (lk.busy()) return; sfx('select'); this.tip(null); test.ante = test.ante % RunMap.SPIRE_ANTES.length + 1; this.s.node = { ho: { landed: true } }; this.handover(n, ev); };
      $('#rnLeave').onclick = () => { if (lk.busy()) return; sfx('select'); this.sceneTestEnd(); };
      return;
    }
    $('#hoOther').onclick = () => { if (lk.busy()) return; sfx('select'); this.finishStop(ev.art, ev.title, ...this.result(other.act(this, null, other))); };
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
    this.cardGrid($('#rnDeckBody'), this.cards().sort((a, b) => colorOrder(a) - colorOrder(b) || costTotal(a.cost) - costTotal(b.cost)), null, true);
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
