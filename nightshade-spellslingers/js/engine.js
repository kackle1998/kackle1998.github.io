'use strict';
/* ============================================================
   NIGHTSHADE SPELLSLINGING — rules engine (no DOM)
   ============================================================ */

const BOARD_SLOTS = 5;
const TRAP_SLOTS = 3;
const START_LIFE = 20;
const START_HAND = 5;

let _uid = 1;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
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
  constructor(deckYou, deckCpu) {
    this.players = [this.mkPlayer(0, 'You', deckYou, false), this.mkPlayer(1, 'Dealer', deckCpu, true)];
    this.active = Math.random() < 0.5 ? 0 : 1;
    this.turnNum = 0;
    this.over = false;
    this.winner = -1;
    this.log = [];
    this.fx = []; // visual events drained by the UI
    this.reveals = []; // traps that just sprang, drained by the UI
    for (const p of this.players) for (let i = 0; i < START_HAND; i++) this.drawCard(p);
    this.say(this.active === 0 ? 'You go first.' : 'The Dealer goes first.');
  }

  mkPlayer(idx, name, deck, cpu) {
    return {
      idx, name, cpu, deckDef: deck, life: START_LIFE,
      library: buildLibrary(deck, idx), hand: [], board: Array(BOARD_SLOTS).fill(null), traps: Array(TRAP_SLOTS).fill(null),
      lands: [], grave: [], landPlayed: false, fatigue: 0,
    };
  }

  get cur() { return this.players[this.active]; }
  opp(p) { return this.players[1 - p.idx]; }
  say(text, p) { this.log.push({ text, who: p ? (p.cpu ? 'cpu' : 'you') : '' }); if (this.log.length > 80) this.log.shift(); }
  subj(p) { return p.cpu ? 'The Dealer' : 'You'; }
  obj(p) { return p.cpu ? 'the Dealer' : 'you'; }

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
      if (has(c, 'regen') && c.dmg > 0) {
        this.fx.push({ kind: 'heal', uid: c.uid, n: c.dmg });
        c.dmg = 0;
      }
    }
    if (this.turnNum > 1) this.drawCard(p); // the starting player skips their first draw
    this.checkOver();
  }

  endTurn() {
    if (this.over) return;
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
    // Pay generic with whichever colour we have the most of left over.
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

  spellUsable(p, c) {
    if (c.target) return this.spellTargets(p, c).length > 0;
    if (c.fx === 'raise') return this.graveCreatures(p).length > 0;
    return true;
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
      case 'buff': this.buffCreature(t, n); break;
      case 'howl': this.livingBoard(p).forEach((a) => this.buffCreature(a, n)); break;
      case 'restore':
        if (t.dmg > 0) { this.fx.push({ kind: 'heal', uid: t.uid, n: t.dmg }); t.dmg = 0; }
        this.healPlayer(p, n);
        break;
      case 'raise': {
        const pool = this.graveCreatures(p);
        const back = pool[Math.floor(Math.random() * pool.length)];
        p.grave.splice(p.grave.indexOf(back), 1);
        p.hand.push(instantiate(back.id, p.idx));
        this.say(`${back.name} returned to ${p.cpu ? "the Dealer's" : 'your'} hand.`, p);
        break;
      }
    }
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
      case 'reflect': this.damageCreature(a, this.attackOf(a), false); return true;
      case 'stasis': this.livingBoard(this.opp(owner)).forEach((c) => (c.attacked = true)); return true;
      case 'pit': this.damageCreature(ctx.creature, Math.max(1, hpLeft(ctx.creature)), true); return true;
      case 'counter': this.say(`${ctx.spell.name} was countered.`, owner); return true;
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
  }

  /* ---------- creatures ---------- */
  boardOf(c) { return this.players[c.owner].board; }
  onBoard(c) { return this.boardOf(c).includes(c); }

  attackOf(c) {
    if (!this.onBoard(c)) return c.atk;
    const rally = this.boardOf(c).filter((o) => o && o !== c && !o.dead && has(o, 'rally')).length;
    return c.atk + rally;
  }

  findCreature(uid) {
    for (const p of this.players) for (const c of p.board) if (c && c.uid === uid) return c;
    return null;
  }

  livingBoard(p) { return p.board.filter((c) => c && !c.dead); }

  strongestEnemy(p) {
    const es = this.livingBoard(this.opp(p));
    es.sort((a, b) => this.attackOf(b) - this.attackOf(a) || hpLeft(b) - hpLeft(a));
    return es[0] || null;
  }

  canAttack(c) {
    return !!c && !this.over && !c.dead && c.owner === this.active && !c.sick && !c.attacked && this.attackOf(c) > 0;
  }

  /* Legal targets: [{uid}] creatures and/or {player} for a direct hit. */
  targets(c) {
    const o = this.opp(this.players[c.owner]);
    const enemies = this.livingBoard(o);
    const guards = enemies.filter((e) => has(e, 'guardian'));
    if (guards.length) return guards.map((e) => ({ uid: e.uid }));
    const t = enemies.map((e) => ({ uid: e.uid }));
    if (!enemies.length || has(c, 'airborne')) t.push({ player: o.idx });
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
    if (aQ && !dQ && aKills) { toA = 0; aDies = false; }
    else if (dQ && !aQ && dKills) { toD = 0; dDies = false; }
    const pierce = has(a, 'trample') && dDies && toD > 0 ? Math.max(0, aAtk - dHp) : 0;
    return { aAtk, dAtk, toA, toD, aDies, dDies, pierce };
  }

  resolveAttack(a, target) {
    const p = this.players[a.owner], o = this.opp(p);
    a.attacked = true;
    if (target.player != null) {
      const n = this.attackOf(a);
      this.say(`${a.name} struck ${this.obj(o)} directly for ${n}.`, p);
      this.damagePlayer(o, n);
      if (has(a, 'leech')) this.healPlayer(p, n);
    } else {
      const d = this.findCreature(target.uid);
      if (!d) return;
      const r = this.fightPreview(a, d);
      this.say(`${a.name} attacked ${d.name}.`, p);
      if (r.toD > 0) {
        this.damageCreature(d, r.toD, has(a, 'deathtouch'));
        if (has(a, 'leech')) this.healPlayer(p, r.toD);
      }
      if (r.toA > 0) {
        this.damageCreature(a, r.toA, has(d, 'deathtouch'));
        if (has(d, 'leech')) this.healPlayer(o, r.toA);
      }
      if (r.pierce > 0) {
        this.say(`${a.name} pierced through for ${r.pierce}.`, p);
        this.damagePlayer(o, r.pierce);
      }
    }
    this.checkOver();
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
    this.checkOver();
  }

  healPlayer(p, n) {
    if (n <= 0) return;
    p.life += n;
    this.fx.push({ kind: 'heal', player: p.idx, n });
  }

  hasDying() { return this.players.some((p) => p.board.some((c) => c && c.dead)); }

  /* Remove dead creatures; Bone Spawn leaves a Skeleton behind. */
  cleanup() {
    const died = [];
    for (const p of this.players) {
      p.board.forEach((c, i) => {
        if (!c || !c.dead) return;
        p.board[i] = null;
        p.grave.push(c);
        died.push(c);
        this.say(`${c.name} perished.`, p);
        if (has(c, 'bonespawn')) {
          p.board[i] = instantiate('skeleton', p.idx);
          this.say('A Skeleton rose from the bones.', p);
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
