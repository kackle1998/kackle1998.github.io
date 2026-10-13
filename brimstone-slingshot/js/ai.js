'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the Dealer's brain
   ============================================================ */

const AI = {
  value(g, c) {
    return g.attackOf(c) * 1.5 + hpLeft(c) + costTotal(c.cost) + c.sigils.length;
  },

  /* Play the land color our hand needs most. */
  chooseLand(g, p) {
    if (p.landPlayed) return -1;
    const lands = p.hand.map((c, i) => ({ c, i })).filter((x) => x.c.type === 'land');
    if (!lands.length) return -1;
    const owned = {}, demand = {};
    COLOR_KEYS.forEach((k) => { owned[k] = 0; demand[k] = 0; });
    p.lands.forEach((l) => owned[l.color]++);
    p.hand.forEach((c) => {
      if (c.type === 'land') return;
      for (const k of COLOR_KEYS) if (c.cost[k]) demand[k] += c.cost[k] + 1;
    });
    const score = (x) => demand[x.c.color] - owned[x.c.color] * 2;
    lands.sort((a, b) => score(b) - score(a));
    return lands[0].i;
  },

  /* Summon the most expensive thing we can afford, or cast a spell that is worth it.
     Returns { i, target } or null. */
  chooseCast(g, p) {
    let best = null, bestScore = -1;
    p.hand.forEach((c, i) => {
      if (c.type === 'trap' || !g.canCast(p, c)) return;
      let s, target;
      if (c.type === 'creature') s = costTotal(c.cost) * 10 + this.value(g, c);
      else {
        const play = this.spellPlay(g, p, c);
        if (!play) return;
        s = costTotal(c.cost) * 10 + play.score;
        target = play.target;
      }
      if (s > bestScore) { bestScore = s; best = { i, target }; }
    });
    return best;
  },

  /* How good a spell is right now (null = hold it), and its best target. */
  spellPlay(g, p, c) {
    const o = g.opp(p);
    const pick = (score) => {
      let best = null;
      for (const t of g.spellTargets(p, c)) {
        const s = score(t);
        if (s > 0 && (!best || s > best.score)) best = { score: s, target: t.uid };
      }
      return best;
    };
    switch (c.fx) {
      case 'bolt': return pick((t) => (hpLeft(t) <= c.n ? this.value(g, t) + 2 : 0));
      case 'shatter': return pick((t) => this.value(g, t) - 3);
      case 'buff': return pick((t) => (g.canAttack(t) || !t.sick ? this.value(g, t) : 0));
      case 'restore': return pick((t) => (t.dmg >= 2 ? t.dmg * 2 : p.life <= 10 ? 1 : 0));
      case 'quake': {
        const kills = g.livingBoard(o).filter((e) => hpLeft(e) <= c.n);
        return kills.length >= 2 ? { score: kills.reduce((a, e) => a + this.value(g, e), 0) } : null;
      }
      case 'massacre': {
        const kills = g.livingBoard(o).filter((e) => hpLeft(e) <= c.n);
        if (!kills.length) return null;
        return { score: o.life <= c.n ? 99 : kills.reduce((a, e) => a + this.value(g, e), 0) + 3 };
      }
      case 'howl': return g.livingBoard(p).length >= 2 ? { score: g.livingBoard(p).length * 3 } : null;
      case 'draw': return p.hand.length <= 3 ? { score: 4 } : null;
      case 'drain': return { score: o.life <= c.n ? 99 : 3 };
      case 'raise': return { score: 3 };
      case 'coil': return pick((t) => (hpLeft(t) <= c.n ? this.value(g, t) + 2 : p.life <= 10 ? 1 : 0));
      case 'spark': return pick((t) => (hpLeft(t) <= c.n ? this.value(g, t) + 2 : p.hand.length <= 3 ? 1 : 0));
      case 'chain': return pick((t) => (o.life <= c.n ? 99 : hpLeft(t) <= c.n ? this.value(g, t) + 4 : 2));
      case 'petrify': return pick((t) => this.value(g, t) - 4);
      case 'theft': return pick((t) => this.value(g, t) * 2);
      case 'swarm': return { score: 2 * Math.min(c.n, p.board.filter((x) => !x).length) };
      case 'stampede': return g.livingBoard(p).length >= 2 ? { score: g.livingBoard(p).length * 4 } : null;
      case 'exhume': return { score: Math.max(...g.graveCreatures(p).map((x) => this.value(g, x))) };
    }
    return null;
  },

  /* Set a trap with whatever energy is left. */
  chooseTrap(g, p) {
    return p.hand.findIndex((c) => c.type === 'trap' && g.canCast(p, c));
  },

  chooseSlot(g, p) {
    const empty = p.board.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0);
    return empty[Math.floor(Math.random() * empty.length)];
  },

  /* Pick the single best attack available, or null to stop attacking. */
  chooseAttack(g, p) {
    const o = g.opp(p);
    const enemies = g.livingBoard(o);
    let best = null, bestScore = 0.5;
    for (const a of p.board) {
      if (!g.canAttack(a)) continue;
      for (const t of g.targets(a)) {
        let s;
        if (t.player != null) {
          s = 100 + g.attackOf(a);
        } else {
          const d = g.findCreature(t.uid);
          const r = g.fightPreview(a, d);
          s = (r.dDies ? this.value(g, d) + 3 : r.toD * 0.4)
            - (r.aDies ? this.value(g, a) : r.toA * 0.3)
            + r.pierce * 1.5;
          if (r.dDies && enemies.length === 1) s += 4; // opens the way for direct hits
          if (has(a, 'leech')) s += r.toD * 0.3;
        }
        if (s > bestScore) { bestScore = s; best = { a, t }; }
      }
    }
    return best;
  },
};
