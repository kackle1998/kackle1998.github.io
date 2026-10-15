'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — rules engine (no DOM)
   ============================================================ */

const BOARD_SLOTS = 5;
const TRAP_SLOTS = 3;
const START_LIFE = 20;
const START_HAND = 5;
const BOSS_PHASE_AT = 8;    // a boss Dealer at or below this much life raises the stakes, once
const BOSS_PHASE_LIFE = 12; // ...healing back up to this
const GROW_MAX = 2;         // a Grow creature stops growing after this many turns (3 let cheap ones snowball)

let _uid = 1;

/* Game randomness. Online matches seed it so both browsers shuffle and resolve identically. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rng = Math.random;
function seedRng(seed) { rng = seed == null ? Math.random : mulberry32(seed); }

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function has(c, sigil) { return c.sigils.includes(sigil); }
function hpLeft(c) { return c.hp - c.dmg; }

function instantiate(id, owner) {
  const def = CARDS[id];
  return { ...def, sigils: [...def.sigils], uid: _uid++, owner, dmg: 0, sick: true, attacked: false, dead: false };
}

/* Shuffle, re-shuffling a few times so the opening hand has 2-3 lands. */
function buildLibrary(deck, owner) {
  const ids = [];
  for (const [id, n] of Object.entries(deck.list)) for (let i = 0; i < n; i++) ids.push(id);
  let lib = ids;
  for (let t = 0; t < 40; t++) {
    lib = shuffle(ids.slice());
    const lands = lib.slice(0, START_HAND).filter((id) => CARDS[id].type === 'land').length;
    if (lands >= 2 && lands <= 3) break;
  }
  return lib.map((id) => instantiate(id, owner));
}

class Game {
  /* opts.viewer is the seat whose point of view the log is written from ("You"). */
  constructor(deck0, deck1, first = Math.random() < 0.5 ? 0 : 1, opts = {}) {
    const { names = ['You', 'Dealer'], cpu = [false, true], viewer = 0, life = [START_LIFE, START_LIFE], boss = null, cpuName = 'the Dealer' } = opts;
    _uid = 1; // both browsers in an online match must hand out the same uids
    this.viewer = viewer;
    this.boss = boss; // Dealer's Run boss rule: 'gale' | 'ossuary' | 'dice'
    this.cpuName = cpuName; // who the computer player is in sentences: the Dealer, or a run rival
    this.phase2 = false;
    this.players = [this.mkPlayer(0, names[0], deck0, cpu[0], life[0]), this.mkPlayer(1, names[1], deck1, cpu[1], life[1])];
    this.active = first;
    this.turnNum = 0;
    this.over = false;
    this.winner = -1;
    this.log = [];
    this.fx = []; // visual events drained by the UI
    this.reveals = []; // traps that just sprang, drained by the UI
    for (const p of this.players) for (let i = 0; i < START_HAND; i++) this.drawCard(p);
    this.say(`${this.subj(this.cur)} ${this.isViewer(this.cur) ? 'go' : 'goes'} first.`);
  }

  mkPlayer(idx, name, deck, cpu, life = START_LIFE) {
    return {
      idx, name, cpu, deckDef: deck, life,
      library: buildLibrary(deck, idx), hand: [], board: Array(BOARD_SLOTS).fill(null), traps: Array(TRAP_SLOTS).fill(null),
      lands: [], grave: [], landPlayed: false, fatigue: 0,
    };
  }

  get cur() { return this.players[this.active]; }
  opp(p) { return this.players[1 - p.idx]; }
  isViewer(p) { return p.idx === this.viewer; }
  say(text, p) { this.log.push({ text, who: p ? (this.isViewer(p) ? 'you' : 'cpu') : '' }); if (this.log.length > 80) this.log.shift(); }
  subj(p) { return this.isViewer(p) ? 'You' : p.cpu ? this.cpuName[0].toUpperCase() + this.cpuName.slice(1) : p.name; }
  obj(p) { return this.isViewer(p) ? 'you' : p.cpu ? this.cpuName : p.name; }
  possessive(p) { return this.isViewer(p) ? 'your' : p.cpu ? `${this.cpuName}'s` : `${p.name}'s`; }

  concede(p) {
    if (this.over) return;
    this.over = true;
    this.winner = 1 - p.idx;
    this.say(`${this.subj(p)} conceded.`, p);
  }

  /* ---------- turn flow ---------- */
  startTurn() {
    this.turnNum++;
    const p = this.cur;
    p.landPlayed = false;
    p.lands.forEach((l) => (l.tapped = false));
    for (const c of p.board) {
      if (!c) continue;
      c.sick = false;
      c.attacked = false;
      c.held = false;
      if (has(c, 'regen') && c.dmg > 0) {
        this.fx.push({ kind: 'heal', uid: c.uid, n: c.dmg });
        c.dmg = 0;
      }
      if (has(c, 'grow') && (c.grown || 0) < GROW_MAX) {
        c.grown = (c.grown || 0) + 1;
        this.buffCreature(c, 1);
      }
    }
    if (this.turnNum > 1) this.drawCard(p); // the starting player skips their first draw
    this.checkOver();
  }

  endTurn() {
    if (this.over) return;
    // Undo 'until end of turn' stat cuts (Massacre), on the board and in the grave.
    for (const p of this.players) for (const c of [...p.board, ...p.grave]) {
      if (!c || !c.wither) continue;
      c.atk += c.wither;
      c.hp += c.wither;
      delete c.wither;
    }
    this.active = 1 - this.active;
    this.startTurn();
  }

  drawCard(p) {
    if (!p.library.length) {
      p.fatigue++;
      this.say(`${this.subj(p)} drew from an empty deck and took ${p.fatigue} damage.`, p);
      this.damagePlayer(p, p.fatigue);
      return null;
    }
    const c = p.library.shift();
    p.hand.push(c);
    return c;
  }

  /* ---------- lands & energy ---------- */
  playLand(p, handIdx) {
    const c = p.hand[handIdx];
    if (!c || c.type !== 'land' || p.landPlayed) return false;
    p.hand.splice(handIdx, 1);
    p.landPlayed = true;
    p.lands.push({ color: c.color, tapped: false, uid: c.uid });
    this.say(`${this.subj(p)} played ${c.name}.`, p);
    return true;
  }

  /* Returns indices of lands to tap for `cost`, or null if unaffordable. */
  payPlan(p, cost) {
    const free = p.lands.map((l, i) => ({ l, i })).filter((x) => !x.l.tapped);
    const used = new Set();
    for (const col of COLOR_KEYS) {
      let need = cost[col] || 0;
      for (const x of free) {
        if (need <= 0) break;
        if (x.l.color === col && !used.has(x.i)) { used.add(x.i); need--; }
      }
      if (need > 0) return null;
    }
    // Pay generic with whichever color we have the most of left over.
    let g = cost.g || 0;
    while (g > 0) {
      const rem = free.filter((x) => !used.has(x.i));
      if (!rem.length) return null;
      const counts = {};
      rem.forEach((x) => (counts[x.l.color] = (counts[x.l.color] || 0) + 1));
      rem.sort((a, b) => counts[b.l.color] - counts[a.l.color]);
      used.add(rem[0].i);
      g--;
    }
    return [...used];
  }

  energy(p) {
    const e = {};
    for (const k of COLOR_KEYS) e[k] = { free: 0, total: 0 };
    p.lands.forEach((l) => { e[l.color].total++; if (!l.tapped) e[l.color].free++; });
    return e;
  }

  canCast(p, c) {
    if (c.type === 'creature') return p.board.includes(null) && !!this.payPlan(p, c.cost);
    if (c.type === 'spell') return this.spellUsable(p, c) && !!this.payPlan(p, c.cost);
    if (c.type === 'trap') return p.traps.includes(null) && !!this.payPlan(p, c.cost);
    return false;
  }

  cast(p, handIdx, slot) {
    const c = p.hand[handIdx];
    if (!c || c.type !== 'creature') return false;
    if (slot == null || slot < 0) slot = p.board.indexOf(null);
    if (slot < 0 || p.board[slot]) return false;
    const plan = this.payPlan(p, c.cost);
    if (!plan) return false;
    plan.forEach((li) => (p.lands[li].tapped = true));
    p.hand.splice(handIdx, 1);
    c.sick = !has(c, 'haste');
    c.attacked = false;
    c.dmg = 0;
    p.board[slot] = c;
    this.say(`${this.subj(p)} summoned ${c.name}.`, p);
    if (!this.springTrap(this.opp(p), 'summon', { creature: c })) this.onSummon(p, c);
    return true;
  }

  /* ---------- spells (sorcery speed) ---------- */
  spellTargets(p, c) {
    if (c.target === 'ally') return this.livingBoard(p);
    if (c.target !== 'enemy') return [];
    const es = this.livingBoard(this.opp(p));
    return c.fx === 'shatter' ? es.filter((e) => this.attackOf(e) <= c.n) : es;
  }

  graveCreatures(p) { return p.grave.filter((c) => c.type === 'creature' && !c.token); }

  /* Spells that put a creature on the caster's board need an empty slot for it. */
  spellNeedsSlot(c) { return ['swarm', 'exhume', 'theft'].includes(c.fx); }

  spellUsable(p, c) {
    if (this.spellNeedsSlot(c) && !p.board.includes(null)) return false;
    if (c.target) return this.spellTargets(p, c).length > 0;
    if (c.fx === 'raise' || c.fx === 'exhume') return this.graveCreatures(p).length > 0;
    return true;
  }

  /* A creature a spell brings onto `p`'s board, into the first empty slot. Like a summon, it waits a turn to attack. */
  putOnBoard(p, id) {
    const slot = p.board.indexOf(null);
    if (slot < 0) return null;
    return (p.board[slot] = instantiate(id, p.idx));
  }

  castSpell(p, handIdx, targetUid) {
    const c = p.hand[handIdx];
    if (!c || c.type !== 'spell' || !this.spellUsable(p, c)) return false;
    let t = null;
    if (c.target) {
      t = this.spellTargets(p, c).find((x) => x.uid === targetUid);
      if (!t) return false;
    }
    const plan = this.payPlan(p, c.cost);
    if (!plan) return false;
    plan.forEach((li) => (p.lands[li].tapped = true));
    p.hand.splice(handIdx, 1);
    p.grave.push(c);
    this.say(`${this.subj(p)} cast ${c.name}${t ? ` on ${t.name}` : ''}.`, p);
    if (!this.springTrap(this.opp(p), 'spell', { spell: c })) this.resolveSpell(p, c, t);
    this.checkOver();
    return true;
  }

  resolveSpell(p, c, t) {
    const o = this.opp(p), n = c.n;
    switch (c.fx) {
      case 'bolt': this.damageCreature(t, n, false); break;
      case 'shatter': this.damageCreature(t, Math.max(1, hpLeft(t)), true); break;
      case 'quake': this.livingBoard(o).forEach((e) => this.damageCreature(e, n, false)); break;
      case 'draw': for (let i = 0; i < n; i++) this.drawCard(p); break;
      case 'drain': this.damagePlayer(o, n); this.healPlayer(p, n); break;
      case 'massacre': {
        const foes = this.livingBoard(o);
        foes.forEach((e) => this.witherCreature(e, n));
        if (foes.some((e) => e.dead)) { // a flat drain, not per creature
          this.say(`The massacre drained ${n} life from ${this.obj(o)}.`, p);
          this.damagePlayer(o, n);
          this.healPlayer(p, n);
        }
        break;
      }
      case 'buff': this.buffCreature(t, n); break;
      case 'howl': this.livingBoard(p).forEach((a) => this.buffCreature(a, n)); break;
      case 'restore':
        if (t.dmg > 0) { this.fx.push({ kind: 'heal', uid: t.uid, n: t.dmg }); t.dmg = 0; }
        this.healPlayer(p, n);
        break;
      case 'raise': {
        const pool = this.graveCreatures(p);
        const back = pool[Math.floor(rng() * pool.length)];
        p.grave.splice(p.grave.indexOf(back), 1);
        p.hand.push(instantiate(back.id, p.idx));
        this.say(`${back.name} returned to ${this.possessive(p)} hand.`, p);
        break;
      }
      case 'swarm': for (let i = 0; i < n; i++) this.putOnBoard(p, c.makes); break;
      case 'stampede':
        for (const a of this.livingBoard(p)) {
          a.atk += n;
          if (!has(a, 'trample')) a.sigils.push('trample');
          this.fx.push({ kind: 'heal', uid: a.uid, n });
        }
        break;
      case 'coil': this.damageCreature(t, n, false); this.healPlayer(p, n); break;
      case 'spark': this.damageCreature(t, n, false); this.drawCard(p); break;
      case 'chain': this.damageCreature(t, n, false); this.damagePlayer(o, n); break;
      case 'exhume': {
        // The priciest creature in the grave; of equals, the last to fall.
        const back = this.graveCreatures(p).reduce((b, x) => (costTotal(x.cost) >= costTotal(b.cost) ? x : b));
        p.grave.splice(p.grave.indexOf(back), 1);
        const risen = this.putOnBoard(p, back.id);
        this.say(`${back.name} rose from ${this.possessive(p)} grave.`, p);
        if (risen) this.onSummon(p, risen);
        break;
      }
      case 'petrify': // no death: Bone Spawn, Spite and Undying don't stir
        o.board[o.board.indexOf(t)] = instantiate(c.makes, o.idx);
        o.grave.push(t);
        this.say(`${t.name} turned to stone.`, p);
        break;
      case 'theft':
        o.board[o.board.indexOf(t)] = null;
        p.board[p.board.indexOf(null)] = t;
        Object.assign(t, { owner: p.idx, sick: !has(t, 'haste'), attacked: false });
        this.say(`${this.subj(p)} took control of ${t.name}.`, p);
        break;
    }
  }

  /* -n/-n until end of turn; undone in endTurn(). */
  witherCreature(c, n) {
    c.atk -= n;
    c.hp -= n;
    c.wither = (c.wither || 0) + n;
    this.fx.push({ kind: 'dmg', uid: c.uid, n });
    if (hpLeft(c) <= 0) c.dead = true;
  }

  buffCreature(c, n) {
    c.atk += n;
    c.hp += n;
    this.fx.push({ kind: 'heal', uid: c.uid, n });
  }

  /* ---------- traps ---------- */
  setTrap(p, handIdx, slot) {
    const c = p.hand[handIdx];
    if (!c || c.type !== 'trap') return false;
    if (slot == null || slot < 0) slot = p.traps.indexOf(null);
    if (slot < 0 || p.traps[slot]) return false;
    const plan = this.payPlan(p, c.cost);
    if (!plan) return false;
    plan.forEach((li) => (p.lands[li].tapped = true));
    p.hand.splice(handIdx, 1);
    p.traps[slot] = c;
    this.say(`${this.subj(p)} set a trap face-down.`, p);
    return true;
  }

  trapReady(t, ctx) {
    switch (t.fx) {
      case 'reflect': return ctx.target && ctx.target.player != null;
      case 'pit': return this.attackOf(ctx.creature) >= t.n;
      default: return true;
    }
  }

  /* `owner`'s first ready trap for `event` springs. Returns true if the triggering action is stopped. */
  springTrap(owner, event, ctx) {
    const i = owner.traps.findIndex((t) => t && t.trigger === event && this.trapReady(t, ctx));
    if (i < 0) return false;
    const t = owner.traps[i];
    owner.traps[i] = null;
    owner.grave.push(t);
    this.reveals.push({ card: t, owner: owner.idx });
    this.say(`${this.subj(owner)} sprang ${t.name}!`, owner);
    const a = ctx.attacker;
    switch (t.fx) {
      case 'snare': this.damageCreature(a, t.n, false); return a.dead;
      case 'reflect': case 'prism': this.damageCreature(a, this.attackOf(a), false); return true;
      case 'stasis': this.livingBoard(this.opp(owner)).forEach((c) => (c.held = true)); return true; // held, not tapped: they still guard
      case 'pit': this.damageCreature(ctx.creature, Math.max(1, hpLeft(ctx.creature)), true); return true;
      case 'counter': this.say(`${ctx.spell.name} was countered.`, owner); return true;
      case 'cage': this.say(`${a.name} was caught in the cage.`, owner); return true;
      case 'glyph': this.damageCreature(ctx.creature, t.n, false); return ctx.creature.dead; // a summon it kills does nothing
    }
    return false;
  }

  /* Gives the defender's traps a chance to answer. Returns false if the attack was stopped. */
  declareAttack(a, target) {
    const o = this.opp(this.players[a.owner]);
    if (this.springTrap(o, 'attack', { attacker: a, target })) { a.attacked = true; return false; }
    return true;
  }

  onSummon(p, c) {
    if (has(c, 'scholar') && this.drawCard(p)) this.say(`${c.name} drew a card.`, p);
    if (c.mend) { this.healPlayer(p, c.mend); this.say(`${c.name} mended ${c.mend} life.`, p); }
    if (c.snipe) {
      const t = this.strongestEnemy(p);
      if (t) {
        this.say(`${c.name} blasted ${t.name} for ${c.snipe}.`, p);
        this.damageCreature(t, c.snipe, false);
      }
    }
    if (has(c, 'shockwave')) {
      const foes = this.livingBoard(this.opp(p));
      if (foes.length) {
        this.say(`${c.name} sent out a shockwave.`, p);
        foes.forEach((e) => this.damageCreature(e, 1, false));
      }
    }
    if (has(c, 'warcry')) {
      const allies = this.livingBoard(p).filter((a) => a !== c);
      if (allies.length) {
        this.say(`${c.name} let out a war cry.`, p);
        allies.forEach((a) => this.buffCreature(a, 1));
      }
    }
  }

  /* ---------- creatures ---------- */
  boardOf(c) { return this.players[c.owner].board; }
  onBoard(c) { return this.boardOf(c).includes(c); }

  attackOf(c) {
    if (!this.onBoard(c)) return Math.max(0, c.atk);
    const rally = this.boardOf(c).filter((o) => o && o !== c && !o.dead && has(o, 'rally')).length;
    return Math.max(0, c.atk + rally);
  }

  findCreature(uid) {
    for (const p of this.players) for (const c of p.board) if (c && c.uid === uid) return c;
    return null;
  }

  livingBoard(p) { return p.board.filter((c) => c && !c.dead); }
  /* Untapped creatures guard their owner; a creature that has attacked can't until it untaps. */
  guardsOf(p) { return this.livingBoard(p).filter((c) => !c.attacked); }

  strongestEnemy(p) {
    const es = this.livingBoard(this.opp(p));
    es.sort((a, b) => this.attackOf(b) - this.attackOf(a) || hpLeft(b) - hpLeft(a));
    return es[0] || null;
  }

  canAttack(c) {
    return !!c && !this.over && !c.dead && c.owner === this.active && !c.sick && !c.attacked && !c.held && this.attackOf(c) > 0;
  }

  /* Legal targets: [{uid}] creatures and/or {player} for a direct hit. */
  targets(c) {
    const o = this.opp(this.players[c.owner]);
    const enemies = this.livingBoard(o), up = this.guardsOf(o);
    const guards = up.filter((e) => has(e, 'guardian'));
    if (guards.length) return guards.map((e) => ({ uid: e.uid }));
    const t = enemies.map((e) => ({ uid: e.uid })); // tapped creatures can still be attacked
    const sky = up.some((e) => has(e, 'airborne') || has(e, 'reach')); // untapped flyers and Reach guard the sky
    if (!up.length || (has(c, 'airborne') && !sky)) t.push({ player: o.idx });
    return t;
  }

  /* Pure prediction of a fight; used both by combat and by the AI. */
  fightPreview(a, d) {
    const aAtk = this.attackOf(a), dAtk = this.attackOf(d);
    const aHp = hpLeft(a), dHp = hpLeft(d);
    const aKills = aAtk > 0 && (aAtk >= dHp || has(a, 'deathtouch'));
    const dKills = dAtk > 0 && (dAtk >= aHp || has(d, 'deathtouch'));
    let toD = aAtk, toA = dAtk, aDies = dKills, dDies = aKills;
    const aQ = has(a, 'quick'), dQ = has(d, 'quick');
    const firstKill = aQ && !dQ && aKills;
    if (firstKill) { toA = 0; aDies = false; }
    else if (dQ && !aQ && dKills) { toD = 0; dDies = false; }
    // Thorns prick the attacker, unless its Quick strike killed the thorny one first.
    const thorns = has(d, 'thorns') && !firstKill ? 1 : 0;
    if (thorns && (toA + thorns >= aHp || has(d, 'deathtouch'))) aDies = true;
    const pierce = has(a, 'trample') && dDies && toD > 0 ? Math.max(0, aAtk - dHp) : 0;
    return { aAtk, dAtk, toA, toD, aDies, dDies, pierce, thorns };
  }

  resolveAttack(a, target) {
    const p = this.players[a.owner], o = this.opp(p);
    a.attacked = true;
    if (target.player != null) {
      const n = this.attackOf(a);
      this.say(`${a.name} struck ${this.obj(o)} directly for ${n}.`, p);
      this.damagePlayer(o, n);
      this.leech(a, p, n);
    } else {
      const d = this.findCreature(target.uid);
      if (!d) return;
      const r = this.fightPreview(a, d);
      this.say(`${a.name} attacked ${d.name}.`, p);
      if (r.toD > 0) {
        this.damageCreature(d, r.toD, has(a, 'deathtouch'));
        this.leech(a, p, r.toD);
      }
      if (r.toA > 0) {
        this.damageCreature(a, r.toA, has(d, 'deathtouch'));
        this.leech(d, o, r.toA);
      }
      if (r.thorns) {
        this.say(`${d.name}'s thorns pricked ${a.name}.`, o);
        this.damageCreature(a, r.thorns, has(d, 'deathtouch'));
      }
      if (r.pierce > 0) {
        this.say(`${a.name} pierced through for ${r.pierce}.`, p);
        this.damagePlayer(o, r.pierce);
      }
      this.bloodlust(a, d);
      this.bloodlust(d, a);
    }
    this.checkOver();
  }

  /* Bloodlust: a creature that kills in combat, and lives, gains +1 attack for good. */
  bloodlust(c, victim) {
    if (!has(c, 'bloodlust') || c.dead || !victim.dead) return;
    c.atk += 1;
    this.fx.push({ kind: 'heal', uid: c.uid, n: 1 });
    this.say(`${c.name}'s bloodlust grew.`, this.players[c.owner]);
  }

  /* Leech heals its owner, at most once per turn per creature. */
  leech(c, p, n) {
    if (!has(c, 'leech') || n <= 0 || c.leechTurn === this.turnNum) return;
    c.leechTurn = this.turnNum;
    this.healPlayer(p, n);
  }

  damageCreature(c, n, deathtouch) {
    if (n <= 0) return;
    c.dmg += n;
    this.fx.push({ kind: 'dmg', uid: c.uid, n });
    if (hpLeft(c) <= 0 || deathtouch) c.dead = true;
  }

  damagePlayer(p, n) {
    if (n <= 0) return;
    p.life -= n;
    this.fx.push({ kind: 'dmg', player: p.idx, n });
    // The boss's second phase is off for now; restore this line to bring it back:
    // if (this.boss && p.cpu && !this.phase2 && p.life > 0 && p.life <= BOSS_PHASE_AT) this.bossPhase(p);
    this.checkOver();
  }

  /* The boss Dealer raises the stakes, once: heals, draws 2, and its rule kicks in. */
  bossPhase(p) {
    this.phase2 = true;
    this.healPlayer(p, BOSS_PHASE_LIFE - p.life);
    const foe = this.opp(p);
    if (this.boss === 'gale') {
      for (const c of this.livingBoard(p)) if (!has(c, 'airborne')) c.sigils.push('airborne');
    } else if (this.boss === 'ossuary') {
      p.board.forEach((c, i) => { if (!c) p.board[i] = instantiate('skeleton', p.idx); });
    } else if (this.boss === 'dice') {
      foe.traps.forEach((t, i) => { if (t) { foe.grave.push(t); foe.traps[i] = null; } });
    }
    this.say('The Dealer raised the stakes!', p);
    for (let i = 0; i < 2; i++) this.drawCard(p);
    this.fx.push({ kind: 'boss', rule: this.boss });
  }

  healPlayer(p, n) {
    if (n <= 0) return;
    p.life += n;
    this.fx.push({ kind: 'heal', player: p.idx, n });
  }

  hasDying() { return this.players.some((p) => p.board.some((c) => c && c.dead)); }

  /* Remove dead creatures. Bone Spawn leaves a Skeleton behind, Spite hits the enemy,
     and an Undying creature goes back to its owner's hand instead of the grave. */
  cleanup() {
    const died = [];
    for (const p of this.players) {
      p.board.forEach((c, i) => {
        if (!c || !c.dead) return;
        p.board[i] = null;
        died.push(c);
        this.say(`${c.name} perished.`, p);
        if (has(c, 'undying')) {
          p.hand.push(instantiate(c.id, p.idx));
          this.say(`${c.name} returned to ${this.possessive(p)} hand.`, p);
        } else p.grave.push(c);
        if (has(c, 'bonespawn')) {
          p.board[i] = instantiate('skeleton', p.idx);
          this.say('A Skeleton rose from the bones.', p);
        }
        if (has(c, 'spite')) {
          const o = this.opp(p);
          this.say(`${c.name}'s spite struck ${this.obj(o)} for 2.`, p);
          this.damagePlayer(o, 2);
        }
      });
    }
    return died;
  }

  checkOver() {
    if (this.over) return;
    const [a, b] = this.players;
    if (a.life <= 0 || b.life <= 0) {
      this.over = true;
      if (a.life <= 0 && b.life <= 0) this.winner = this.active;
      else this.winner = a.life <= 0 ? 1 : 0;
    }
  }
}
