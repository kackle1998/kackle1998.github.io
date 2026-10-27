'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — the table test (tabletest.html): one battle on the 2.5D table (js/table.js),
   you against a rival, on the real rules (Game, js/engine.js) and the Dealer's brain (AI, js/ai.js).
   Not part of the game: no run, no saves, no battle screen (js/ui.js). The panels, inspector, log,
   hand tray and drag-to-target are the battle screen's own markup and styles, drawn the way js/ui.js
   draws them. ?deck=0..5 picks your deck (DECKS), ?rival=<id> your rival (RIVALS, Mort by default).
   ============================================================ */

(() => {
  const q = new URLSearchParams(location.search);
  const R = RIVALS.find((r) => r.id === q.get('rival')) || RIVALS[0];
  const SHORT = R.name.split(' ')[0][0] + R.name.split(' ')[0].slice(1).toLowerCase(); // MORT SPADE: Mort
  const myDeck = DECKS[q.has('deck') ? +q.get('deck') : 2] || DECKS[2], theirDeck = DECKS[R.deck];
  const el = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /* A few square-wave cues, so the hits land (the game's own sounds live in js/ui.js). */
  let ac = null;
  const tone = (f, d = 0.08, type = 'square', v = 0.04, f2 = null, at = 0) => {
    try {
      ac = ac || new AudioContext();
      const o = ac.createOscillator(), gn = ac.createGain(), t = ac.currentTime + at;
      o.type = type; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
      gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(gn).connect(ac.destination); o.start(t); o.stop(t + d);
    } catch (e) { /* no audio */ }
  };
  const SFX = {
    select: () => tone(660, 0.04, 'square', 0.02), err: () => tone(110, 0.12, 'square', 0.03),
    land: () => tone(160, 0.14, 'triangle', 0.06), place: () => tone(220, 0.1, 'square', 0.04, 330),
    rise: () => [0, 1, 2, 3].forEach((i) => tone(330 * 2 ** (i / 4), 0.08, 'square', 0.025, null, i * 0.14)),
    hit: () => tone(140, 0.14, 'sawtooth', 0.05, 60), direct: () => tone(110, 0.3, 'sawtooth', 0.06, 45),
    die: () => tone(300, 0.35, 'square', 0.03, 60), spell: () => tone(520, 0.25, 'triangle', 0.04, 1040),
    trap: () => { tone(880, 0.08); tone(440, 0.2, 'square', 0.04, null, 0.08); },
    bell: () => { tone(1320, 0.6, 'triangle', 0.05); tone(1980, 0.45, 'sine', 0.02); },
  };
  const sfx = (n) => SFX[n] && SFX[n]();

  /* ---------- the table ---------- */
  const T = Table.mount(el('tbStage'), { rival: R.sprite });
  const hand = el('hand');
  // The hand tray stays docked; it only slides away (with the camera) on your rival's turn and in a fight.
  (function follow() { hand.style.transform = `translateY(${Math.round(T.handY())}px)`; requestAnimationFrame(follow); })();

  /* ---------- the battle ---------- */
  const game = new Game(myDeck, theirDeck, Math.random() < 0.5 ? 0 : 1, { names: ['You', SHORT], cpuName: SHORT });
  const you = game.players[0], them = game.players[1];
  game.log.unshift({ text: `${SHORT}: "${R.quip}"`, who: 'cpu' });
  let busy = true, sel = { hand: null, attacker: null };
  const ready = () => !busy && !game.over && game.active === 0;
  const clear = () => { sel = { hand: null, attacker: null }; };
  const keyOf = (c) => `c${c.owner}-${game.players[c.owner].board.indexOf(c)}`;
  const held = () => you.hand.find((c) => c.uid === sel.hand) || null;
  const attacker = () => (sel.attacker != null ? game.findCreature(sel.attacker) : null);
  const canStrike = () => { const a = attacker(); return !!a && game.targets(a).some((t) => t.player != null); };

  // What the table outlines: gold for where the selected card or attacker can go, white for creatures ready to attack.
  function marks() {
    const m = {};
    if (!ready()) return m;
    const h = held(), a = attacker();
    if (h && h.type === 'creature') you.board.forEach((c, i) => { if (!c) m[`c0-${i}`] = 'target'; });
    else if (h && h.type === 'trap') you.traps.forEach((t, i) => { if (!t) m[`t0-${i}`] = 'target'; });
    else if (h && h.type === 'spell' && h.target) for (const t of game.spellTargets(you, h)) m[keyOf(t)] = 'target';
    else if (a) { m[keyOf(a)] = 'sel'; for (const t of game.targets(a)) { if (t.player != null) m.rival = true; else m[keyOf(game.findCreature(t.uid))] = 'target'; } }
    else you.board.forEach((c, i) => { if (game.canAttack(c)) m[`c0-${i}`] = 'ready'; });
    return m;
  }

  /* ---------- the battle screen's panels (js/ui.js's renderPanel, renderTurn, renderLog) ---------- */
  const NAMES = [heroName(), R.name], SPRITE = ['hero', R.sprite];
  const ppLong = (name) => Math.max(...name.split(/\s+/).map((w) => w.length)) > 9;
  function renderPanel(box, p) {
    const e = game.energy(p), mine = p.idx === 0, name = NAMES[p.idx];
    box.classList.toggle('active', game.active === p.idx && !game.over);
    box.classList.toggle('targetable', !mine && ready() && canStrike());
    box.innerHTML = `
      <div class="pp-head">
        <img class="portrait" src="${spriteURL(SPRITE[p.idx])}" alt="">
        <div><div class="pp-name${ppLong(name) ? ' long' : ''}">${escapeHTML(name.toUpperCase())}</div><div class="pp-deck">${escapeHTML(p.deckDef.name)}</div></div>
        <div class="pp-life">${ico('hp')}<b>${Math.max(0, p.life)}</b></div>
      </div>
      <div class="pp-stats"><span>DECK ${p.library.length}</span><span>HAND ${p.hand.length}</span><span>GRAVE ${p.grave.length}</span></div>
      ${COLOR_KEYS.some((k) => e[k].total)
        ? `<table class="pp-energy">${COLOR_KEYS.filter((k) => e[k].total).map((k) => {
            const used = e[k].total - e[k].free;
            return `<tr><td class="n">${e[k].total}X</td><td>${ico(COLORS[k].icon)}</td><td class="muted">${used ? `${used} USED` : ''}</td></tr>`;
          }).join('')}</table>`
        : '<div class="pp-energy muted">no tomes yet</div>'}
      ${!mine ? `<div class="pp-hand">${'<span class="mini-back"></span>'.repeat(Math.min(p.hand.length, 12))}</div>` : ''}`;
  }
  function renderTurn() {
    const mine = game.active === 0;
    el('turnInfo').innerHTML = `
      <div class="ti-turn">TURN ${game.turnNum}</div>
      <div class="ti-who">${game.over ? 'GAME OVER' : mine ? 'YOUR TURN' : `${escapeHTML(SHORT.toUpperCase())}'S TURN`}</div>
      <div class="ti-land">${mine ? (you.landPlayed ? 'Tome played' : 'Tome: ready') : 'Waiting...'}</div>`;
    el('bell').disabled = !ready();
  }
  function renderLog() {
    el('log').innerHTML = '<div class="log-title">LOG</div><div class="log-lines">' +
      game.log.slice(-14).map((l) => `<div class="ll ${l.who}">${escapeHTML(l.text)}</div>`).join('') + '</div>';
  }
  function inspect(c) {
    if (!c) return inspectHelp();
    inspectInto(el('inspector'), inspectHTML(c, c.type === 'creature' && game.onBoard(c) ? game.attackOf(c) : c.atk) +
      (game.onBoard(c) && c.sick ? '<div class="i-sigil muted">Just arrived: it can attack next turn.</div>' : '') +
      (game.onBoard(c) && c.attacked ? '<div class="i-sigil muted">Spent: it has attacked, and untaps at the start of its owner\'s turn.</div>' : ''));
  }
  function inspectHelp(html) {
    el('inspector').innerHTML = html || `
      <div class="i-help">
        <b>THE TABLE</b>
        <p>Drag a card from your hand onto a gold slot, or click it, then a slot.</p>
        <p>Drag a ready creature (white outline) onto a gold target, or click it, then the target. When the way is clear, ${escapeHTML(SHORT)} glows gold: drop on them or their panel to strike directly.</p>
        <p>Ring the bell (E) to end your turn. Esc or right-click cancels.</p>
        <p class="muted">Hover anything to inspect it.</p>
      </div>`;
  }
  function renderHand() {
    hand.innerHTML = '';
    const mine = ready(), n = you.hand.length;
    const overlap = n > 10 ? -Math.ceil((n * 118 - (hand.clientWidth - 40)) / (n - 1)) + 4 : 4;
    // Lands first, then everything else, with a gap between the two groups (as the battle screen's hand).
    const shown = [...you.hand].sort((a, b) => (a.type === 'land' ? 0 : 1) - (b.type === 'land' ? 0 : 1));
    const lastLand = shown.filter((c) => c.type === 'land').length - 1;
    shown.forEach((c, i) => {
      const card = document.createElement('div');
      card.className = `card ${c.type}`;
      card.dataset.uid = c.uid;
      card.innerHTML = cardInnerHTML(c);
      const ok = c.type === 'land' ? !you.landPlayed : game.canCast(you, c);
      card.classList.add(mine && ok ? 'playable' : 'unplayable');
      if (sel.hand === c.uid) card.classList.add('selected');
      const gap = i === lastLand && i < shown.length - 1 ? 22 : 0;
      card.style.margin = `0 ${overlap / 2 + gap}px 0 ${overlap / 2}px`;
      card.style.setProperty('--i', i);
      card.addEventListener('click', () => onHand(c));
      card.addEventListener('mouseenter', () => inspect(c));
      card.addEventListener('pointerdown', (e) => press(e, c, true));
      hand.appendChild(card);
    });
  }

  // Redraw everything; resolves once any new creature has risen out of its card.
  function render() {
    const rising = T.sync(game);
    T.mark(marks());
    renderPanel(el('cpuPanel'), them);
    renderPanel(el('youPanel'), you);
    renderTurn();
    renderLog();
    renderHand();
    return rising;
  }

  let toastTimer = null;
  function toast(msg) {
    const t = el('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1400);
  }
  function banner(text) {
    const b = el('banner');
    b.textContent = text;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    return wait(1200);
  }

  const reveals = async () => {
    for (const r of game.reveals.splice(0)) {
      sfx('trap');
      toast(`TRAP! ${r.owner === 0 ? 'Your' : `${SHORT}'s`} ${r.card.name}`);
      inspect(r.card);
      await wait(700);
    }
  };
  // The creatures hit by the last action flinch.
  const flush = () => Promise.all(game.fx.splice(0).filter((f) => f.kind === 'dmg' && f.uid != null).map((f) => T.hurt(f.uid)));

  // The dying sink back into their cards, then go to the grave.
  async function settle() {
    while (game.hasDying()) {
      sfx('die');
      const dying = game.players.flatMap((p) => p.board.filter((c) => c && c.dead));
      await Promise.all(dying.map((c) => T.sink(c.uid)));
      game.cleanup();
      await render();
      await flush();
    }
    if (game.over) end();
  }

  /* ---------- your moves ---------- */
  function onHand(c) {
    if (!ready()) return;
    sel.attacker = null;
    if (c.type === 'land') {
      if (you.landPlayed) { sfx('err'); return toast('Only one tome per turn.'); }
      game.playLand(you, you.hand.indexOf(c));
      clear();
      sfx('land');
      render();
      return;
    }
    if (!game.canCast(you, c)) {
      sfx('err');
      return toast(!game.payPlan(you, c.cost) ? 'Not enough energy.' : c.type === 'creature' ? 'Your board is full.' : c.type === 'trap' ? 'Your trap zone is full.' : c.target ? 'No valid target for that.' : 'Nothing for that spell to do yet.');
    }
    if (sel.hand === c.uid) { // a second click plays it in the first free place
      if (c.type === 'creature') return summon(c, you.board.indexOf(null));
      if (c.type === 'trap') return setTrap(c, you.traps.indexOf(null));
      if (!c.target) return castSpell(c, null);
      return toast('Click a gold creature to aim it.');
    }
    sel.hand = c.uid;
    sfx('select');
    if (c.type === 'spell') toast(c.target ? 'Choose a target.' : 'Click again to cast.');
    if (c.type === 'trap') toast('Click again or pick a trap slot to set it.');
    render();
  }

  function onSlot(side, i) {
    if (!ready()) return;
    const h = held(), c = game.players[side].board[i], a = attacker();
    if (h && h.type === 'creature' && side === 0 && !c) return summon(h, i);
    if (h && h.type === 'spell' && h.target) {
      if (c && game.spellTargets(you, h).includes(c)) return castSpell(h, c.uid);
      if (c) { sfx('err'); toast(`Not a valid target for ${h.name}.`); }
      return;
    }
    if (a && c && side === 1) {
      if (game.targets(a).some((t) => t.uid === c.uid)) return yourAttack(a, { uid: c.uid });
      sfx('err');
      return toast('A Guardian blocks the way!');
    }
    if (side === 0 && c) {
      if (game.canAttack(c)) { sel = { hand: null, attacker: sel.attacker === c.uid ? null : c.uid }; sfx('select'); render(); }
      else toast(c.sick ? `${c.name} is not ready to attack yet.` : c.attacked ? `${c.name} has already attacked.` : c.held ? `${c.name} is held by a Stasis Rune this turn.` : `${c.name} has no attack.`);
    }
  }

  function onTrap(side, i) {
    if (!ready()) return;
    const h = held();
    if (h && h.type === 'trap' && side === 0 && !you.traps[i]) setTrap(h, i);
  }

  function onRival() {
    if (!ready() || !attacker()) return;
    if (canStrike()) return yourAttack(attacker(), { player: 1 });
    sfx('err');
    toast(`Clear ${SHORT}'s untapped creatures first (Airborne ignores this unless ${SHORT} has flyers or Reach).`);
  }

  async function summon(c, slot) {
    busy = true;
    clear();
    if (!game.cast(you, you.hand.indexOf(c), slot)) { busy = false; toast("Can't summon that."); render(); return; }
    sfx('place');
    await reveals();
    sfx('rise');
    await render();
    await flush();
    await settle();
    busy = false;
    render();
  }

  async function castSpell(c, target) {
    busy = true;
    clear();
    if (!game.castSpell(you, you.hand.indexOf(c), target)) { busy = false; toast("Can't cast that."); render(); return; }
    sfx('spell');
    inspect(c);
    await reveals();
    await render();
    await flush();
    await settle();
    busy = false;
    render();
  }

  function setTrap(c, slot) {
    clear();
    if (game.setTrap(you, you.hand.indexOf(c), slot)) sfx('place');
    else toast("Can't set that.");
    render();
  }

  async function yourAttack(a, t) {
    busy = true;
    clear();
    await fight(a, t);
    if (game.over) return;
    T.cam('board');
    busy = false;
    render();
  }

  // Either side's attack: the camera leans in on the lane, the attacker dashes at its target, and the hit lands
  // on contact (the target flinching while the attacker snaps home), then the dead sink away.
  async function fight(a, t) {
    const lane = t.uid != null ? game.players[1 - a.owner].board.indexOf(game.findCreature(t.uid)) : game.players[a.owner].board.indexOf(a);
    T.cam('combat', lane);
    render();
    await wait(220);
    if (!game.declareAttack(a, t) || game.reveals.length) { // a trap answered it
      await reveals();
      await render();
      await flush();
      await settle();
      await wait(200);
      if (a.attacked || a.dead || !game.onBoard(a)) return;
    }
    let flinch = Promise.resolve();
    await T.lunge(a.uid, t, () => {
      game.resolveAttack(a, t);
      sfx(t.player != null ? 'direct' : 'hit');
      render();
      flinch = flush();
    });
    await flinch;
    await settle();
    await wait(120);
  }

  async function endTurn() {
    if (!ready()) return;
    busy = true;
    clear();
    sfx('bell');
    const b = el('bell');
    b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring');
    render();
    await T.ring();
    game.endTurn();
    render();
    if (game.over) return end();
    await rivalTurn();
  }

  /* ---------- your rival's turn: the Dealer's brain, as js/ui.js plays it ---------- */
  async function rivalTurn() {
    busy = true;
    T.cam('dealer');
    render();
    await banner(`${SHORT.toUpperCase()}'S TURN`);
    const p = them, li = AI.chooseLand(game, p);
    if (li >= 0) { game.playLand(p, li); sfx('land'); render(); await wait(650); }
    for (let guard = 0; guard < 12; guard++) {
      const play = AI.chooseCast(game, p);
      if (!play) break;
      const c = p.hand[play.i];
      if (c.type === 'spell') { game.castSpell(p, play.i, play.target); sfx('spell'); toast(`${SHORT} cast ${c.name}.`); }
      else { game.cast(p, play.i, AI.chooseSlot(game, p)); sfx('place'); sfx('rise'); }
      inspect(c);
      await reveals();
      await render();
      await flush();
      await settle();
      if (game.over) return;
      await wait(600);
    }
    for (let guard = 0; guard < 12; guard++) {
      const m = AI.chooseAttack(game, p);
      if (!m) break;
      await fight(m.a, m.t);
      if (game.over) return;
      T.cam('dealer');
      await wait(250);
    }
    for (let guard = 0; guard < TRAP_SLOTS; guard++) {
      const ti = AI.chooseTrap(game, p);
      if (ti < 0) break;
      game.setTrap(p, ti);
      sfx('place');
      render();
      await wait(450);
    }
    await wait(400);
    game.endTurn();
    render();
    if (game.over) return end();
    await yourTurn();
  }

  // Your turn opens on your hand (with the card you just drew), then the camera tips up over the table.
  async function yourTurn() {
    T.cam('hand');
    render();
    await banner('YOUR TURN');
    T.cam('board');
    await wait(700); // let the camera settle and the hand drop clear of your rows before you can play
    busy = false;
    render();
  }

  function end() {
    busy = true;
    T.cam('dealer');
    render();
    const won = game.winner === 0;
    el('tbEnd').innerHTML = `<div class="panel"><h2>${won ? 'YOU WIN' : `${SHORT.toUpperCase()} WINS`}</h2><p>${won ? `${SHORT} is out of life.` : 'You are out of life.'}</p><button class="btn" id="tbAgain">PLAY AGAIN</button></div>`;
    el('tbEnd').style.display = 'flex';
    el('tbAgain').onclick = () => location.reload();
  }

  /* ---------- drag to target (as js/ui.js) ----------
     Press a hand card or a ready creature on the table and drag: a trail of pixel dots follows the
     pointer, and letting go over a target does what the two clicks would. A press that doesn't move
     stays a plain click. */
  const DRAG_MIN = 6, DOT_GAP = 14;
  let drag = null, swallowClick = false;
  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrow.id = 'dragArrow';
  arrow.setAttribute('shape-rendering', 'crispEdges');
  document.body.appendChild(arrow);
  const dots = [];

  function press(e, c, fromHand) {
    if (e.button !== 0 || !ready()) return;
    if (!fromHand && held()) return; // aiming a spell: a press on your creature is a target pick
    drag = { c, fromHand, x0: e.clientX, y0: e.clientY, kind: null, from: { x: e.clientX, y: e.clientY } };
  }
  function begin() {
    const { c, fromHand } = drag;
    if (fromHand) {
      if (c.type !== 'land') {
        if (sel.hand !== c.uid) onHand(c);
        if (sel.hand !== c.uid) return false;
      }
      drag.kind = c.type === 'spell' && c.target ? 'aim' : 'play';
      const r = hand.querySelector(`.card[data-uid="${c.uid}"]`)?.getBoundingClientRect();
      if (r) drag.from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    } else {
      if (sel.attacker !== c.uid) onSlot(0, you.board.indexOf(c));
      if (sel.attacker !== c.uid) return false;
      drag.kind = 'attack';
    }
    arrow.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
    arrow.classList.add('on');
    document.body.classList.add('dragging');
    return true;
  }
  function drawArrow(x, y) {
    const a = drag.from, b = { x, y };
    const cx = (a.x + b.x) / 2, cy = Math.min(a.y, b.y) - Math.min(120, Math.hypot(b.x - a.x, b.y - a.y) * 0.3); // bowed up a little, like a thrown line
    const at = (t) => { const u = 1 - t; return { x: u * u * a.x + 2 * u * t * cx + t * t * b.x, y: u * u * a.y + 2 * u * t * cy + t * t * b.y }; };
    const pts = [];
    let last = at(0);
    for (let t = 0.01; t <= 1; t += 0.004) { const p = at(t); if (Math.hypot(p.x - last.x, p.y - last.y) >= DOT_GAP) { pts.push(p); last = p; } }
    pts.forEach((p, i) => {
      let dot = dots[i];
      if (!dot) {
        dot = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        dot.setAttribute('class', 'da-dot');
        dot.setAttribute('width', 6);
        dot.setAttribute('height', 6);
        dot.style.animationDelay = `${-i * 90}ms`;
        arrow.appendChild(dot);
        dots.push(dot);
      }
      dot.setAttribute('x', Math.round(p.x / 2) * 2 - 3);
      dot.setAttribute('y', Math.round(p.y / 2) * 2 - 3);
      dot.style.display = '';
    });
    for (let i = pts.length; i < dots.length; i++) dots[i].style.display = 'none';
  }
  // What's under the pointer: a table slot, trap slot, your rival or their panel.
  function dropAt(x, y) {
    for (const t of document.elementsFromPoint(x, y)) {
      if (t.id === 'cpuPanel' || t.closest('#cpuPanel')) return { kind: 'rival' };
      if (t.dataset && t.dataset.kind) return { kind: t.dataset.kind, side: +t.dataset.side, slot: +t.dataset.slot };
      if (t.closest && t.closest('#hand, #left, #right')) return null;
    }
    return null;
  }
  function drop(d, t) {
    const { c, kind, fromHand } = d;
    const occupant = t && t.kind === 'slot' ? game.players[t.side].board[t.slot] : null;
    if (kind === 'attack') {
      if (t && t.kind === 'slot' && t.side === 1 && occupant) return onSlot(1, t.slot);
      if (t && t.kind === 'rival') return onRival();
    } else if (kind === 'aim') {
      if (occupant) return onSlot(t.side, t.slot);
    } else if (t) {
      if (c.type === 'creature' && t.kind === 'slot' && t.side === 0 && !occupant) return onSlot(0, t.slot);
      if (c.type === 'trap' && t.kind === 'trap' && t.side === 0) return onTrap(0, t.slot);
      if (fromHand) return onHand(c); // anywhere else on the table: play it as a second click would
    }
    clear();
    render();
  }
  function dragEnd() {
    arrow.classList.remove('on');
    document.body.classList.remove('dragging');
    drag = null;
  }
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.kind) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_MIN) return;
      if (!ready() || !begin()) { dragEnd(); return; }
    }
    drawArrow(e.clientX, e.clientY);
  });
  document.addEventListener('pointerup', (e) => {
    const d = drag;
    if (!d) return;
    dragEnd();
    if (!d.kind) return; // never moved: a plain click
    swallowClick = true; // the browser may still fire a click on whatever is under the pointer
    setTimeout(() => { swallowClick = false; }, 0);
    if (ready()) drop(d, dropAt(e.clientX, e.clientY));
  });
  document.addEventListener('dragstart', (e) => e.preventDefault()); // card art is an <img> the browser would drag
  document.addEventListener('pointercancel', () => { if (drag && drag.kind) { clear(); render(); } dragEnd(); });
  window.addEventListener('click', (e) => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); } }, true);

  /* ---------- input ---------- */
  T.on({
    slot: onSlot, trap: onTrap, rival: onRival, bell: endTurn,
    press(side, i, e) { const c = game.players[side].board[i]; if (side === 0 && c) press(e, c, false); },
    hover(side, kind, i) {
      if (side == null) return;
      if (kind === 'creature') { const c = game.players[side].board[i]; if (c) inspect(c); return; }
      const t = game.players[side].traps[i];
      if (!t) return;
      if (side === 0) inspect(t);
      else inspectHelp(`<div class="i-help"><b>FACE-DOWN TRAP</b><p>${escapeHTML(SHORT)} set this on their turn. It will spring by itself when you attack, summon or cast a spell, depending on what it is.</p></div>`);
    },
  });
  el('bellImg').src = spriteURL('bell');
  el('bell').addEventListener('click', endTurn);
  el('cpuPanel').addEventListener('click', onRival);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'e' || e.key === 'E' || e.key === ' ') { e.preventDefault(); endTurn(); }
    if (e.key === 'Escape' && ready()) { clear(); render(); }
  });
  document.addEventListener('contextmenu', (e) => { e.preventDefault(); if (ready()) { clear(); render(); } });

  /* ---------- start ---------- */
  window.tableTest = { game, ready, T }; // for poking at it from the console
  inspectHelp();
  game.startTurn();
  render();
  (async () => {
    await banner(game.active === 0 ? 'YOU GO FIRST' : `${SHORT.toUpperCase()} GOES FIRST`);
    if (game.active === 1) await rivalTurn();
    else await yourTurn();
  })();
})();
