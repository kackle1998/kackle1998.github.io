'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — head-to-head online play
   Both browsers run the same rules engine from the same shuffle
   seed and apply the same moves in the same order, so their games
   stay identical. The server (db/multiplayer.sql) pairs players,
   hands out the seed, stores the ordered move list and runs the
   turn clock. Each move carries a checksum of the resulting state
   so a mismatch is caught at once instead of drifting silently.
   ============================================================ */

const Net = (() => {
  const POLL_MS = 1000;        // while playing
  const WAIT_POLL_MS = 2500;   // while waiting for an opponent
  const TURN_SECS = 60;
  const CLAIM_SECS = 65;       // the server allows a timeout claim 5 s after the turn ends
  const WAIT_LIMIT_MS = 10 * 60 * 1000;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms)); // real time, even while fast-forwarding

  const st = {
    on: false, match: null, oppName: '', applied: 0, queue: [], sending: false,
    processing: false, localRunning: false, resyncing: false, foreign: [],
    skew: 0, activeSeat: 0, turnStart: 0, claimAt: 0, poller: null, ticker: null,
    reason: null, reported: false, waitId: null,
  };

  const rpc = (name, args) => Cloud.rpc(name, { p_token: Cloud.token(), ...args });

  /* ---------- state checksum ---------- */
  function stateHash(g) {
    const parts = [g.active, g.turnNum, g.over ? g.winner : 'x'];
    for (const p of g.players) {
      parts.push(p.life, p.fatigue, p.landPlayed ? 1 : 0, p.library.length, p.grave.length,
        p.hand.map((c) => c.uid).join(','), p.lands.map((l) => l.color[0] + (l.tapped ? 1 : 0)).join(''));
      for (const c of p.board) parts.push(c ? `${c.uid}:${c.atk}:${c.hp}:${c.dmg}:${c.sick ? 1 : 0}${c.attacked ? 1 : 0}` : '-');
      for (const t of p.traps) parts.push(t ? t.uid : '-');
    }
    const s = parts.join('|');
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  /* ---------- decks ---------- */
  /* What gets sent to the server: the list plus the records of any custom cards it uses. */
  function deckPayload(def) {
    const recs = getCustomRecords();
    const cards = Object.keys(def.list).map((id) => recs.find((r) => r.id === id)).filter(Boolean);
    return { name: def.name, colors: def.colors, feature: def.feature, list: def.list, cards };
  }

  /* Make a deck's custom cards playable here (both players', so both browsers use the same stats). */
  function registerDeck(d) {
    for (const r of d.cards || []) {
      const c = customToCard(r);
      if (!c) continue;
      CARDS[c.id] = c;
      if (c.sprite === 'spr_' + c.id) SPRITES[c.sprite] = r.pixels.map((row) => String(row).replace(/[^.#+\-w]/g, '.'));
      st.foreign.push(c.id);
    }
  }

  function deckOk(d) {
    let n = 0;
    for (const [id, k] of Object.entries((d && d.list) || {})) {
      const c = CARDS[id];
      if (!c || c.token || !Number.isInteger(k) || k < 1 || (c.type !== 'land' && k > MAX_COPIES)) return false;
      n += k;
    }
    return n === DECK_SIZE;
  }

  const toDef = (d) => ({ name: d.name, colors: (d.colors || []).filter((k) => COLORS[k]), feature: d.feature, list: d.list });

  /* ---------- applying a move (used for your moves, theirs, and replays) ---------- */
  async function applyAction(a, seat) {
    const g = game, p = g.players[seat];
    const fromHand = (uid) => p.hand.findIndex((c) => c.uid === uid);
    const theirs = seat !== ME;
    if (a.t === 'concede') { g.concede(p); render(); endGame(); return true; }
    if (g.over || g.active !== seat) return false;

    switch (a.t) {
      case 'land': {
        const i = fromHand(a.uid);
        if (i < 0 || !g.playLand(p, i)) return false;
        sfx('land');
        render();
        if (theirs) await sleep(450);
        return true;
      }
      case 'cast': {
        const i = fromHand(a.uid), c = p.hand[i];
        if (!c || !g.cast(p, i, a.slot)) return false;
        sfx('place');
        await showReveals();
        render();
        if (theirs) inspect(c);
        const el = cardElByUid(c.uid);
        if (el) el.classList.add('enter');
        flushFx();
        if (theirs) await sleep(500);
        await settle();
        return true;
      }
      case 'spell': {
        const i = fromHand(a.uid), c = p.hand[i];
        if (!c || !g.castSpell(p, i, a.target ?? null)) return false;
        await playSpellFx(c);
        return true;
      }
      case 'trap': {
        const i = fromHand(a.uid);
        if (i < 0 || !g.setTrap(p, i, a.slot)) return false;
        sfx('place');
        render();
        if (theirs) await sleep(350);
        return true;
      }
      case 'attack': {
        const c = g.findCreature(a.a), t = a.tgt || {};
        const legal = c && c.owner === seat && g.canAttack(c) &&
          g.targets(c).some((x) => (t.uid != null ? x.uid === t.uid : x.player === t.player));
        if (!legal) return false;
        if (theirs) await sleep(250);
        await performAttack(c, t.uid != null ? { uid: t.uid } : { player: t.player });
        return true;
      }
      case 'end': {
        g.endTurn();
        render();
        flushFx();
        if (g.over) { endGame(); return true; }
        st.activeSeat = g.active;
        if (!FAST) st.turnStart = Date.now() + st.skew + 2000;
        await banner(g.active === ME ? 'YOUR TURN' : `${st.oppName.toUpperCase()}'S TURN`);
        return true;
      }
    }
    return false;
  }

  /* One of your moves, from the normal click/drag input. */
  async function local(a) {
    if (!st.on || busy || st.processing || st.resyncing || !game || game.over || game.active !== ME) return;
    busy = true;
    st.localRunning = true;
    clearSel();
    const ok = await applyAction(a, ME);
    if (ok) {
      st.applied++;
      // If this move ended the game, endGame() has already queued the result: the move must go first.
      const item = { seq: st.applied, action: { ...a, h: stateHash(game) } };
      const ri = st.queue.findIndex((q) => q.action.t === 'result');
      if (ri >= 0) st.queue.splice(ri, 0, item); else st.queue.push(item);
      flush();
    } else {
      toast("Can't do that.");
      sfx('err');
    }
    st.localRunning = false;
    busy = game.over || game.active !== ME;
    render();
  }

  /* A move from the server's list (the opponent's, a forced end of turn, or a replay). */
  async function applyRow(r) {
    const a = r.action || {};
    if (a.t === 'result') { st.applied = r.seq; return true; } // the outcome is read from the match row
    const ok = await applyAction(a, r.seat);
    st.applied = r.seq;
    if (!ok || (a.h && a.h !== stateHash(game))) { desync(); return false; }
    busy = game.over || game.active !== ME;
    return true;
  }

  /* ---------- sending ---------- */
  async function flush() {
    if (st.sending) return;
    st.sending = true;
    try {
      while (st.queue.length && st.on) {
        const item = st.queue[0];
        try {
          await rpc('mp_submit', { p_match: st.match.id, p_seq: item.seq, p_action: item.action });
          st.queue.shift();
          if (item.action.t === 'end') { st.activeSeat = OPP; st.turnStart = Date.now() + st.skew + 2000; }
        } catch (e) {
          if (e.message === 'bad_seq' || e.message === 'not_your_turn') {
            // Usually our turn was timed out while this move was in flight: rebuild from the server's list.
            st.queue = [];
            resync();
            break;
          }
          if (e.message === 'not_active' || e.message === 'not_logged_in') { st.queue = []; break; }
          await wait(1500); // network trouble: keep trying in order
        }
      }
    } finally {
      st.sending = false;
    }
  }

  /* ---------- receiving ---------- */
  async function poll() {
    if (!st.on || st.resyncing) return;
    let res;
    try { res = await Cloud.rpc('mp_poll', { p_match: st.match.id, p_after: st.applied }); } catch (e) { return; }
    if (!st.on || !res || !res.match) return;
    st.skew = Date.parse(res.now) - Date.now();
    const m = res.match;
    // Don't step on our own move while it's animating or still on its way to the server.
    if (st.localRunning || st.processing || st.queue.length || st.resyncing) return;
    st.activeSeat = m.active_seat;
    st.turnStart = Date.parse(m.turn_started_at);
    st.processing = true;
    try {
      for (const r of res.actions) {
        if (r.seq <= st.applied) continue;
        if (r.seq !== st.applied + 1) { resync(); return; }
        if (!(await applyRow(r)) || !st.on) return;
        render();
      }
      if ((m.status === 'done' || m.status === 'cancelled') && game && !game.over) {
        // Decided on the server: a timeout forfeit, or the other player conceded or reported a result.
        st.reason = m.end_reason;
        st.reported = true;
        game.over = true;
        game.winner = m.winner_seat ?? -1;
        endGame();
      }
    } finally {
      st.processing = false;
    }
  }

  /* ---------- turn clock ---------- */
  function tick() {
    if (!st.on || !game || game.over) return;
    const left = Math.ceil((st.turnStart + TURN_SECS * 1000 - (Date.now() + st.skew)) / 1000);
    const el = $('#turnTimer');
    if (el) {
      el.textContent = `${Math.max(0, Math.min(TURN_SECS, left))}s`;
      el.classList.toggle('low', left <= 10);
    }
    if (st.activeSeat === ME && game.active === ME) {
      if (left <= 0 && !busy) { toast('Out of time!'); playerEndTurn(); }
    } else if (st.activeSeat === OPP && left <= TURN_SECS - CLAIM_SECS && Date.now() > st.claimAt) {
      st.claimAt = Date.now() + 3000;
      rpc('mp_claim_timeout', { p_match: st.match.id }).catch(() => {});
    }
  }

  /* ---------- starting / rebuilding a match ---------- */
  async function begin(m, rows = [], fresh = true) {
    stopLoops();
    const seat = m.host_id === Cloud.playerId() ? 0 : 1;
    st.match = m;
    st.oppName = seat === 0 ? m.guest_name : m.host_name;
    st.applied = 0;
    st.queue = [];
    st.reason = null;
    st.reported = false;
    st.on = true;

    unregister();
    registerDeck(m.host_deck);
    registerDeck(m.guest_deck);
    if (!deckOk(m.host_deck) || !deckOk(m.guest_deck)) {
      toast("One of the decks isn't valid here.");
      leave();
      showTitle();
      return;
    }
    const oppDeck = seat === 0 ? m.guest_deck : m.host_deck;
    SPRITES.opp_hero = Array.isArray(oppDeck.portrait) && oppDeck.portrait.length === 16 ? oppDeck.portrait : SPRITES.hero_default;
    setSeats(seat);
    Music.play('battle');

    let dice = null;
    if (fresh && !rows.length) {
      const myDeck = seat === 0 ? m.host_deck : m.guest_deck;
      await vsSplash({ name: heroName(), deck: myDeck.name || '', sprite: 'hero' }, { name: st.oppName, deck: oppDeck.name || '', sprite: 'opp_hero' });
      if (!st.on || st.match !== m) return;
      dice = await rollOnline(m);
    }
    if (!st.on || st.match !== m) return;

    seedRng(m.seed);
    const g = game = new Game(toDef(m.host_deck), toDef(m.guest_deck), m.first_seat,
      { names: [m.host_name, m.guest_name], cpu: [false, false], viewer: ME });
    if (dice) g.log.unshift({ text: `You rolled ${dice[ME]}, ${st.oppName} rolled ${dice[OPP]}.`, who: '' });
    tapState.clear();
    ended = false;
    busy = true;
    clearSel();
    hideScreen();
    $('#game').classList.remove('hidden');
    inspectDefault();
    game.startTurn();
    st.activeSeat = game.active;
    st.turnStart = Date.parse(m.turn_started_at) || Date.now();

    if (rows.length) {
      FAST = true;
      try {
        for (const r of rows) if (!(await applyRow(r)) || game !== g) break;
      } finally {
        FAST = false;
      }
      if (game !== g || !st.on) return;
      render();
      if (game.over) return;
    } else {
      render();
      await banner(game.active === ME ? 'YOU GO FIRST' : `${st.oppName.toUpperCase()} GOES FIRST`);
      if (game !== g) return;
    }
    busy = game.over || game.active !== ME;
    render();
    st.poller = setInterval(poll, POLL_MS);
    st.ticker = setInterval(tick, 250);
    poll();
  }

  async function resync() {
    if (st.resyncing || !st.match) return;
    st.resyncing = true;
    try {
      const id = st.match.id;
      const [rows, actions] = await Promise.all([
        Cloud.get(`matches?id=eq.${id}&select=*`),
        Cloud.get(`match_actions?match_id=eq.${id}&select=seq,seat,action&order=seq.asc`),
      ]);
      if (rows[0]) { toast('Reconnected.'); await begin(rows[0], actions, false); }
    } catch (e) {
      setTimeout(resync, 3000);
    } finally {
      st.resyncing = false;
    }
  }

  function desync() {
    if (!game || game.over) return;
    st.reason = 'desync';
    game.over = true;
    game.winner = -1;
    endGame();
  }

  /* Called by endGame(): report the outcome once, and describe it for the result screen. */
  function result() {
    const g = game, won = g.winner === ME, opp = st.oppName;
    if (!st.reported) {
      st.reported = true;
      st.queue.push({ seq: null, action: { t: 'result', winner: g.winner, reason: st.reason === 'desync' ? 'desync' : 'life' } });
      if (!st.localRunning) flush(); // otherwise local() sends the winning move first, then this
    }
    stopLoops();
    if (g.winner === -1) return { title: 'NO CONTEST', sub: 'The two games fell out of sync, so this match does not count.' };
    const lastLog = g.log[g.log.length - 1];
    const conceded = st.reason === 'concede' || (lastLog && / conceded\.$/.test(lastLog.text));
    if (won) {
      if (st.reason === 'timeout') return { title: 'VICTORY', sub: `${opp} ran out of time twice in a row.` };
      if (conceded) return { title: 'VICTORY', sub: `${opp} conceded.` };
      return { title: 'VICTORY', sub: `${opp}'s life hit zero.` };
    }
    if (st.reason === 'timeout') return { title: 'DEFEAT', sub: 'You ran out of time twice in a row.' };
    return { title: 'DEFEAT', sub: `Your life hit zero. ${opp} wins this one.` };
  }

  function concede() {
    if (!st.on) return;
    const id = st.match.id;
    st.reported = true;
    rpc('mp_submit', { p_match: id, p_seq: 0, p_action: { t: 'concede' } }).catch(() => {});
    if (game && !game.over) game.concede(game.players[ME]);
    ended = true;
    busy = true;
    sfx('lose');
    Music.play('menu');
    $('#banner').classList.remove('show');
    $('#game').classList.add('hidden');
    leave();
    showOnline();
  }

  function stopLoops() {
    clearInterval(st.poller);
    clearInterval(st.ticker);
    st.poller = st.ticker = null;
  }

  function unregister() {
    for (const id of st.foreign) { delete CARDS[id]; delete SPRITES['spr_' + id]; }
    st.foreign = [];
    loadCustomCards(); // put back this player's own versions of any shared ids
  }

  /* Back to normal single-player state. */
  function leave() {
    stopLoops();
    if (st.queue.length) flush(); // let a final result report go out
    st.on = false;
    st.match = null;
    unregister();
    seedRng(null);
    setSeats(0);
  }

  /* ---------- opening dice (decided by the server, animated identically on both sides) ---------- */
  async function rollOnline(m) {
    const r = mulberry32(m.seed ^ 0x2545f491);
    let a, b;
    do { a = 1 + Math.floor(r() * 6); b = 1 + Math.floor(r() * 6); } while (a === b);
    const hi = Math.max(a, b), lo = Math.min(a, b);
    const dice = m.first_seat === 0 ? [hi, lo] : [lo, hi]; // by seat: the high roller goes first
    showScreen(`
      <div class="roll panel">
        <div class="roll-title">ROLL FOR THE FIRST TURN</div>
        <div class="roll-duel">
          <div class="roller" id="rollerYou">
            <img class="r-art" src="${spriteURL('hero')}" alt="">
            <div class="roll-name">${escapeHTML(heroName()).toUpperCase()}</div>
            <div class="die" id="dieYou"></div>
          </div>
          <div class="roll-vs">VS</div>
          <div class="roller" id="rollerCpu">
            <img class="r-art" src="${spriteURL('opp_hero')}" alt="">
            <div class="roll-name">${escapeHTML(st.oppName).toUpperCase()}</div>
            <div class="die" id="dieCpu"></div>
          </div>
        </div>
        <div class="roll-msg" id="rollMsg">High roll goes first.</div>
        <div class="roll-btns"></div>
      </div>`, true);
    const dieYou = $('#dieYou'), dieCpu = $('#dieCpu');
    setDie(dieYou, 6);
    setDie(dieCpu, 6);
    await sleep(500);
    await Promise.all([tumble(dieYou, dice[ME], 14), tumble(dieCpu, dice[OPP], 17)]);
    const iWon = m.first_seat === ME;
    $('#rollerYou').classList.add(iWon ? 'win' : 'lose');
    $('#rollerCpu').classList.add(iWon ? 'lose' : 'win');
    sfx(iWon ? 'heal' : 'err');
    $('#rollMsg').textContent = iWon ? 'You rolled high and go first!' : `${st.oppName} rolled high and goes first.`;
    await sleep(1400);
    return dice;
  }

  /* ---------- lobby ---------- */
  let lobbyGen = 0;

  async function showOnline() {
    if (!Cloud.user()) { toast('Log in (bottom of the title screen) to play online.'); sfx('err'); return; }
    // Already in a match (e.g. the page was reloaded)? Go straight back to it.
    try {
      const pid = Cloud.playerId();
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const live = await Cloud.get(`matches?status=eq.active&or=(host_id.eq.${pid},guest_id.eq.${pid})&turn_started_at=gt.${since}&select=id&order=created_at.desc&limit=1`);
      if (live.length) { toast('Rejoining your match...'); return enter(live[0].id); }
    } catch (e) {
      toast('Could not reach the server.');
      return;
    }
    showDeckSelect((def) => { sfx('select'); showLobby(def); }, 'CHOOSE A DECK TO PLAY ONLINE');
  }

  function showLobby(def) {
    const deck = deckPayload(def);
    showScreen(`
      <div class="ol panel">
        <div class="ol-title">PLAY ONLINE</div>
        <div class="ol-deck">Playing as <b>${escapeHTML(Cloud.user())}</b> with <b>${escapeHTML(def.name)}</b>
          <span class="ol-icons">${(def.colors || []).map((k) => ico(COLORS[k].icon)).join('')}</span>
          <button class="btn sm" id="olDeck">CHANGE DECK</button></div>
        <div class="ol-btns">
          <button class="btn big accent" id="olQuick" title="Get paired with the next player who is looking">QUICK MATCH</button>
          <button class="btn big" id="olCreate" title="Open a match others can see and join">CREATE MATCH</button>
        </div>
        <div class="ol-h">OPEN MATCHES</div>
        <div class="ol-list" id="olList"><span class="muted">Loading...</span></div>
        <div class="ol-foot"><span class="muted">Turns are ${TURN_SECS} seconds. Running out of time twice in a row loses the match.</span>
          <button class="btn" id="olBack">BACK</button></div>
      </div>`);
    $('#olDeck').onclick = () => { sfx('select'); showDeckSelect((d) => { sfx('select'); showLobby(d); }, 'CHOOSE A DECK TO PLAY ONLINE'); };
    $('#olBack').onclick = () => { sfx('select'); showTitle(); };
    const lock = () => $$('.ol button').forEach((b) => (b.disabled = true));
    const fail = (e) => {
      toast(e && e.message === 'match_gone' ? 'That match is no longer open.' : e && e.message === 'bad_deck' ? "The server didn't accept that deck." : 'Could not reach the server.');
      sfx('err');
      showLobby(def);
    };
    $('#olQuick').onclick = async () => {
      sfx('select');
      lock();
      try {
        const res = await rpc('mp_quick', { p_deck: deck, p_mine: null });
        if (res.status === 'active') enter(res.id); else waitFor(res.id, def, deck, true);
      } catch (e) { fail(e); }
    };
    $('#olCreate').onclick = async () => {
      sfx('select');
      lock();
      try { waitFor((await rpc('mp_create', { p_deck: deck, p_listed: true })).id, def, deck, false); } catch (e) { fail(e); }
    };

    const gen = ++lobbyGen; // a newer lobby screen stops this one's refresh loop
    const refresh = async () => {
      const list = $('#olList');
      if (!list || gen !== lobbyGen) return false;
      try {
        const since = new Date(Date.now() - WAIT_LIMIT_MS).toISOString();
        const rows = await Cloud.get(`matches?status=eq.waiting&listed=eq.true&created_at=gt.${since}` +
          '&select=id,host_id,host_name,deck:host_deck->>name,colors:host_deck->colors,created_at&order=created_at.desc&limit=20');
        if (!$('#olList')) return false;
        const others = rows.filter((r) => r.host_id !== Cloud.playerId());
        list.innerHTML = others.map((r) => `
          <div class="ol-row">
            <b>${escapeHTML(r.host_name)}</b>
            <span class="ol-rdeck">${escapeHTML(r.deck || '')}</span>
            <span class="ol-icons">${(Array.isArray(r.colors) ? r.colors : []).filter((k) => COLORS[k]).map((k) => ico(COLORS[k].icon)).join('')}</span>
            <span class="muted">${Math.max(1, Math.round((Date.now() - Date.parse(r.created_at)) / 60000))} min</span>
            <button class="btn sm" data-id="${escapeHTML(r.id)}">JOIN</button>
          </div>`).join('') || '<span class="muted">No open matches right now. Create one, or try Quick Match.</span>';
        list.querySelectorAll('button[data-id]').forEach((b) => (b.onclick = async () => {
          sfx('select');
          lock();
          try { enter((await rpc('mp_join', { p_match: b.dataset.id, p_deck: deck })).id); } catch (e) { fail(e); }
        }));
      } catch (e) {
        list.innerHTML = '<span class="muted">Could not load the match list.</span>';
      }
      return true;
    };
    (async () => { while (await refresh()) await wait(3000); })();
  }

  /* Waiting for someone to join our match (or, for quick match, to be paired). */
  function waitFor(id, def, deck, quick) {
    const started = Date.now();
    st.waitId = id;
    showScreen(`
      <div class="ol panel ol-wait">
        <div class="ol-title">${quick ? 'FINDING AN OPPONENT' : 'WAITING FOR AN OPPONENT'}</div>
        <div class="ol-dots"><span></span><span></span><span></span></div>
        <div class="muted" id="olElapsed">0:00</div>
        <button class="btn" id="olCancel">CANCEL</button>
      </div>`);
    let cancelled = false;
    const back = () => { cancelled = true; st.waitId = null; showLobby(def); };
    $('#olCancel').onclick = () => { sfx('select'); rpc('mp_cancel', { p_match: id }).catch(() => {}); back(); };
    (async () => {
      while (!cancelled && st.waitId === id && $('#olElapsed')) {
        const s = Math.floor((Date.now() - started) / 1000);
        $('#olElapsed').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        if (Date.now() - started > WAIT_LIMIT_MS) {
          rpc('mp_cancel', { p_match: id }).catch(() => {});
          toast('Nobody joined. Try again in a bit.');
          return back();
        }
        try {
          if (quick) {
            const res = await rpc('mp_quick', { p_deck: deck, p_mine: id });
            if (cancelled) return;
            if (res.status === 'active') { st.waitId = null; return enter(res.id); }
            id = st.waitId = res.id; // in case the server swapped us to a different waiting match
          } else {
            const res = await Cloud.rpc('mp_poll', { p_match: id, p_after: 0 });
            if (cancelled) return;
            const status = res && res.match && res.match.status;
            if (status === 'active') { st.waitId = null; return enter(id); }
            if (status !== 'waiting') return back();
          }
        } catch (e) { /* keep waiting; the network may come back */ }
        await wait(WAIT_POLL_MS);
      }
    })();
  }

  /* Load a match that has started and play it (replaying any moves already made). */
  async function enter(id) {
    try {
      const [rows, actions] = await Promise.all([
        Cloud.get(`matches?id=eq.${id}&select=*`),
        Cloud.get(`match_actions?match_id=eq.${id}&select=seq,seat,action&order=seq.asc`),
      ]);
      if (!rows[0] || rows[0].status !== 'active') { toast('That match is over.'); return showTitle(); }
      await begin(rows[0], actions, !actions.length);
    } catch (e) {
      toast('Could not reach the server.');
      showTitle();
    }
  }

  return {
    get on() { return st.on; },
    get oppName() { return st.oppName; },
    showOnline, local, concede, result, leave,
    _hash: stateHash, // for debugging desyncs from the console
  };
})();
