/* ============================================================
   BRIMSTONE SLINGSHOT — the Dealer's Run simulator's player.
   Not a module: tools/runsim.js runs this inside the game's own context,
   so CARDS, DECKS, Game, AI, Run and the rest are globals here.

   Battles: both seats are played by the game's AI (js/ai.js), turn by turn
   the way cpuTurn() in ui.js plays the Dealer. Starting a run, battles,
   spoils and the end of a run go through Run's own code. The stops you
   click through (campfire, altar, trader, ? events) are re-enacted below,
   so if you change how one of those works in run.js, change it here too.
   ============================================================ */

/* ---------- battles: cpuTurn(), performAttack() and settle() from ui.js, for both seats ---------- */
function settle(g) { if (g.hasDying()) g.cleanup(); }

function performAttack(g, a, t) {
  // The defender's traps get the first word.
  if (!g.declareAttack(a, t) || g.reveals.length) {
    g.reveals.length = 0;
    settle(g);
    if (g.over || a.attacked || a.dead || !g.onBoard(a)) return;
  }
  g.resolveAttack(a, t);
  settle(g);
}

function aiTurn(g, p) {
  const li = AI.chooseLand(g, p);
  if (li >= 0) g.playLand(p, li);
  for (let guard = 0; guard < 12 && !g.over; guard++) {
    const play = AI.chooseCast(g, p);
    if (!play) break;
    if (p.hand[play.i].type === 'spell') g.castSpell(p, play.i, play.target);
    else g.cast(p, play.i, AI.chooseSlot(g, p));
    g.reveals.length = 0;
    settle(g);
  }
  for (let guard = 0; guard < 12 && !g.over; guard++) {
    const m = AI.chooseAttack(g, p);
    if (!m) break;
    performAttack(g, m.a, m.t);
  }
  for (let guard = 0; guard < TRAP_SLOTS && !g.over; guard++) {
    const ti = AI.chooseTrap(g, p);
    if (ti < 0) break;
    g.setTrap(p, ti);
  }
  g.fx.length = 0;
}

/* rollForFirst() in ui.js: ties reroll; you go first when you win, the Dealer goes first 85% of the time when it wins. */
function rollFirst() {
  const d6 = () => 1 + Math.floor(Math.random() * 6);
  let you, cpu;
  do { you = d6(); cpu = d6(); } while (you === cpu);
  return you > cpu ? 0 : Math.random() < 0.85 ? 1 : 0;
}

function playBattle(deckDef, opts) {
  const g = new Game(deckDef, opts.cpuDeck, rollFirst(), { life: opts.life, boss: opts.boss });
  g.startTurn();
  while (!g.over && g.turnNum < 400) {
    aiTurn(g, g.cur);
    if (!g.over) g.endTurn();
  }
  if (!g.over) g.winner = 1; // never seen in practice: a stalemate counts as a loss
  return g;
}

/* Run.battle() calls these: the VS splash is instant and the game plays out on the spot. */
let lastBattle = null;
function vsSplash() { return { then: (go) => go() }; }
function startGame(deckDef, opts) { lastBattle = { g: playBattle(deckDef, opts), opts }; }

/* Run.reward() lays its offers out with cardGrid(); keep them so the player can pick one. */
let lastGrid = null;
Run.cardGrid = (el, defs, onPick) => { lastGrid = { defs, onPick }; };

/* Run.go() enters each stop: battles go through Run's own code, every other stop is played below. */
const runEnter = Run.enter;
Run.enter = function (id) {
  const t = this.s.map.nodes[id].t;
  if (t === 'battle' || t === 'boss') runEnter.call(this, id);
};

/* ---------- the player's run choices ---------- */
const SIGIL_RANK = ['undying', 'airborne', 'deathtouch', 'trample', 'quick', 'leech', 'regen', 'grow', 'haste', 'thorns', 'bloodlust',
  'guardian', 'reach', 'rally', 'warcry', 'shockwave', 'bonespawn', 'spite', 'scholar', 'snipe', 'mend'];
const price = (c) => costTotal(c.cost);
const best = (arr, score) => arr.reduce((b, x) => (b == null || score(x) > score(b) ? x : b), null);
/* Offered a card: the rarest, then the priciest, creatures before spells before traps, a coin flip on a tie. */
const cardPref = (c) => RARITY_KEYS.indexOf(rarityOf(c)) * 100 + price(c) * 10 + (c.type === 'creature' ? 3 : c.type === 'spell' ? 2 : 0) + Math.random();
const strongest = (mons) => best(mons, (c) => price(c) * 10 + c.atk);

function choosePath(reach) {
  const nodes = Run.s.map.nodes;
  if (POLICY.path === 'avoid') {
    const safe = reach.filter((id) => nodes[id].t !== 'battle');
    if (safe.length) reach = safe;
  }
  return reach[Math.floor(Math.random() * reach.length)];
}

/* --lands ratio: keep the starting 9:11 land-to-card mix as cards come and go, split like Run.start(). */
function fixLands() {
  const s = Run.s, cards = Run.cards();
  const L = Math.min(RUN_MAX_LANDS * 2, Math.max(RUN_MIN_DECK - cards.length, Math.round((cards.length * 9) / 11)));
  const demand = s.colors.map((k) => 1 + cards.reduce((a, c) => a + (c.cost[k] || 0), 0));
  const first = Math.max(3, Math.min(L - 3, Math.round((L * demand[0]) / (demand[0] + demand[1]))));
  s.lands = { [s.colors[0]]: Math.min(RUN_MAX_LANDS, first), [s.colors[1]]: Math.min(RUN_MAX_LANDS, L - first) };
}

/* The best sigil to move or copy: a good sigil, onto a pricey creature, preferably from a cheap one. */
function bestTransfer(givers, fromWeight) {
  const mons = Run.creatures();
  let pick = null;
  for (const g of givers) for (const k of g.sigils) {
    const takers = mons.filter((r) => Run.canTake(r, k, g.rid));
    if (!takers.length) continue;
    const r = strongest(takers);
    const score = SIGIL_RANK.length - SIGIL_RANK.indexOf(k) + price(r) * 2 - price(g) * fromWeight;
    if (!pick || score > pick.score) pick = { g, k, r, score };
  }
  return pick;
}
/* The receiving end of Run.transfer(). */
function giveSigil({ g, k, r }) {
  const rc = Run.rc(r.rid);
  rc.sigils.push(k);
  if (k === 'snipe' || k === 'mend') rc[k] = g[k];
}

/* Run.campfire(): take the first, free warmth, then leave. */
function campfire() {
  const d = strongest(Run.creatures());
  if (!d) return;
  const rc = Run.rc(d.rid);
  if (d.sigils.includes('guardian') || d.atk === 0) rc.hp += 2; else rc.atk += 1;
}

/* Run.transfer({ consume: true }): only ever sacrifice a creature costing 2 or less. */
function altar() {
  const pick = bestTransfer(Run.givers().filter((g) => price(g) <= 2), 3);
  if (!pick) return;
  giveSigil(pick);
  Run.remove(pick.g.rid);
}

/* Run.trader(): the same three offers, the tonic (+5 life for 3 teeth) when 5+ down, then the cards it likes best that it can afford. */
function trader(n) {
  const s = Run.s;
  const offers = Run.traderOffers(n).map((c) => ({ c, cost: runPrice(c) }));
  if (s.maxLife - s.life >= 5 && s.teeth >= 3) { s.teeth -= 3; Run.heal(5); }
  offers.sort((a, b) => cardPref(b.c) - cardPref(a.c));
  for (const o of offers) if (s.teeth >= o.cost) { s.teeth -= o.cost; Run.add(o.c.id); }
}

/* ? events, by id. A plan that does nothing walks past. */
function choice(ev, label) {
  const ch = ev.choices.find((c) => c.label.startsWith(label));
  if (!ch) throw new Error(`Event "${ev.id}" has no "${label}" choice any more: update EVENTS in tools/runsim-player.js`);
  return ch;
}
const EVENTS = {
  cracked(ev) { // press gently (+1 attack, no sigil lost) on the hardest hitter
    const ch = choice(ev, 'PRESS GENTLY'), mons = Run.creatures().filter(ch.pick);
    if (mons.length) ch.act(Run, best(mons, (d) => d.atk * 10 + price(d)));
  },
  spring(ev) { choice(ev, Run.s.maxLife - Run.s.life >= 4 ? 'DRINK' : 'BOTTLE').act(Run); },
  pool() {}, // a 50% chance to lose the card: walk past
  bones(ev) { choice(ev, 'PRY').act(Run); },
  offer(ev) { const ch = choice(ev, 'ACCEPT'); if (Run.canChoose(ch)) ch.act(Run); },
  rune(ev) { // pay 3 life to copy a sigil, only while above 12 life
    const ch = choice(ev, 'PAY');
    if (Run.s.life <= 12 || !Run.canChoose(ch)) return;
    const pick = bestTransfer(Run.givers(), 0);
    if (!pick) return;
    giveSigil(pick);
    Run.s.life -= ch.cost;
  },
  moth(ev) { // pay 4 life for Airborne on the hardest hitter, only while above 12 life
    const ch = choice(ev, 'PAY');
    if (Run.s.life <= 12 || !Run.canChoose(ch)) return;
    ch.act(Run, best(Run.creatures().filter(ch.pick), (d) => d.atk * 10 + price(d)));
  },
  ghost(ev) { const ch = choice(ev, 'TRADE'); if (Run.canChoose(ch)) ch.act(Run); },
  slots() { // Run.slots(): the first pull is free; take whatever it pays, no rerolls
    const t = Run.slotRoll(null);
    if (t.k === 'card') Run.add(t.id);
    else if (t.k === 'buff') Run.rc(t.rid)[t.stat] += t.by;
    else Run.heal(t.n);
  },
  wheel() { // Run.wheel(): one spin, and the sigil goes to the hardest hitter that can take it
    const segs = Run.wheelSegs();
    if (!segs.length) return;
    const k = segs[Math.floor(Math.random() * segs.length)];
    Run.rc(best(Run.wheelTakers(k), (d) => d.atk * 10 + price(d)).rid).sigils.push(k);
  },
  pack(ev) { // Run.eventCards(): always tear it open and keep the card it likes best
    const ch = choice(ev, 'TEAR');
    ch.take(Run, best(ch.cards(Run).map((id) => CARDS[id]), cardPref));
  },
  reliquary(ev) { // pay 6 life for a mythical card, only while above 12 life
    const ch = choice(ev, 'PAY');
    if (Run.s.life <= 12 || !Run.canChoose(ch)) return;
    ch.take(Run, best(ch.cards(Run).map((id) => CARDS[id]), cardPref));
  },
};

/* Run.event(): a fresh event for this stop, picked by the stop's seed. */
function event(n, stat) {
  const s = Run.s;
  const fresh = RUN_EVENTS.filter((e) => !s.events.includes(e.id));
  const from = fresh.length ? fresh : RUN_EVENTS;
  const ev = from[runRand(Run.rand(300 + n.id), from.length)];
  s.node.ev = ev.id;
  s.events.push(ev.id);
  if (EVENTS[ev.id]) EVENTS[ev.id](ev);
  else stat.unmodeled[ev.id] = (stat.unmodeled[ev.id] || 0) + 1;
}
const PLAYS = { fire: campfire, altar, trade: trader, event }; // by stop type (STOPS in run.js)

/* ---------- one whole run ---------- */
const bump = (o, k, by = 1) => (o[k] = (o[k] || 0) + by);

function playRun(deckIdx, stat) {
  Run.start(DECKS[deckIdx]);
  const s = Run.s;
  for (;;) {
    const id = choosePath(Run.reach()), n = s.map.nodes[id];
    if (n.t !== 'battle' && n.t !== 'boss') {
      Run.go(id);
      if (PLAYS[n.t]) PLAYS[n.t](n, stat);
      else bump(stat.unmodeledStops, n.t);
      Run.register();
      Run.leave();
      continue;
    }

    if (POLICY.lands === 'ratio') fixLands();
    const key = n.t === 'boss' ? 'boss' : 'row' + n.row, rule = s.bossRule;
    const b = (stat.battles[key] = stat.battles[key] || { met: 0, won: 0 });
    b.met++;
    Run.go(id); // Run.battle() -> startGame() above
    const { g } = lastBattle, won = g.winner === 0;
    if (n.t === 'boss') {
      const r = (stat.bossRules[rule] = stat.bossRules[rule] || { met: 0, won: 0 });
      r.met++;
      if (won) r.won++;
    }
    if (won) b.won++; else bump(stat.diedAt, key);
    lastGrid = null;
    Run.afterBattle(won, g.players[0].life, g.players[1].life); // a loss or the boss ends the run here
    if (!won || n.t === 'boss') return won;
    if (!lastGrid) throw new Error('Run.reward() offered no cards: update tools/runsim-player.js');
    lastGrid.onPick(best(lastGrid.defs, cardPref));
    Run.leave();
  }
}

var SIM = {
  deckNames() { return DECKS.map((d) => d.name); },
  simulate(deckIdx, runs) {
    const stat = { runs: 0, wins: 0, battles: {}, diedAt: {}, bossRules: {}, unmodeled: {}, unmodeledStops: {} };
    for (let i = 0; i < runs; i++) {
      stat.runs++;
      if (playRun(deckIdx, stat)) stat.wins++;
    }
    Run.clear();
    return stat;
  },
  /* Events and stop types this player has no plan for (the report flags them). */
  unmodeled() {
    return {
      events: RUN_EVENTS.map((e) => e.id).filter((id) => !EVENTS[id]),
      stops: Object.keys(STOPS).filter((t) => !PLAYS[t] && !['start', 'battle', 'boss'].includes(t)),
    };
  },
};
