'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — rendering, input, animation, sound, flow
   ============================================================ */

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const stage = $('#stage');
let FAST = false;     // fast-forward: replaying an online match after a reload, so skip animations
const sleep = (ms) => (FAST ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));

let game = null;
/* Which seat this browser plays. Always 0 against the Dealer; online, the guest is seat 1. */
let ME = 0, OPP = 1;
const mine = (p) => p.idx === ME;
const online = () => typeof Net !== 'undefined' && Net.on;
/* A Dealer's Run battle may be against one of the Dealer's rivals (data.js RIVALS) instead. */
let foe = null; // { name: 'MORT SPADE', short: 'Mort Spade', sprite } or null for the Dealer
function oppName() { return online() ? Net.oppName : foe ? foe.name : 'DEALER'; }       // panel / banner text
function oppTitle() { return online() ? Net.oppName : foe ? foe.short : 'the Dealer'; }  // in sentences
function oppSprite() { return online() ? 'opp_hero' : foe ? foe.sprite : 'dealer'; }
function OppTitle() { const t = oppTitle(); return t[0].toUpperCase() + t.slice(1); }    // starting a sentence

function setSeats(me) {
  ME = me;
  OPP = 1 - me;
  $('#youPanel').dataset.player = ME;
  $('#cpuPanel').dataset.player = OPP;
  $('#board .row-label:not(.bottom)').textContent = online() ? Net.oppName.toUpperCase() : foe ? foe.name : 'THE DEALER';
}
let busy = false;     // true while animations / the Dealer are acting
let ended = false;
let runBattle = false; // this game is a battle in a Dealer's Run (js/run.js)
let sel = { hand: null, attacker: null }; // uids
let curScale = 1;
const tapState = new Map(); // uid -> was tapped at last render (to animate tap/untap)

/* Size from the layout viewport (unaffected by pinch zoom), not innerWidth,
   which mobile Safari shrinks while zoomed in. */
function fit() {
  const de = document.documentElement;
  curScale = Math.min(de.clientWidth / 1280, de.clientHeight / 720);
  stage.style.setProperty('--s', curScale);
}

/* If the phone ended up zoomed anyway (e.g. kept from before a rotation),
   re-applying the viewport tag makes the browser snap back to 1x. */
function unzoom() {
  const vv = window.visualViewport;
  if (!vv || vv.scale <= 1.01) return;
  const meta = document.querySelector('meta[name="viewport"]');
  const content = meta.content;
  meta.content = content + ', initial-scale=1';
  requestAnimationFrame(() => { meta.content = content; });
}

window.addEventListener('resize', fit);
window.addEventListener('orientationchange', () => setTimeout(() => { unzoom(); fit(); }, 250));
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => { unzoom(); fit(); });
// iOS Safari ignores user-scalable=no for pinches; these block them.
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
fit();

/* ---------- sound (tiny WebAudio synth) ---------- */
const SOUND_KEY = 'cardgrave.sound.v1';
const Sfx = {
  ctx: null, muted: Store.read(SOUND_KEY, 'on') === 'off',
  ensure() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ } }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  tone(f, d, type = 'square', v = 0.04, f2 = null, delay = 0) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + d + 0.02);
  },
  noise(d, v = 0.06) {
    if (this.muted || !this.ctx) return;
    const n = Math.floor(this.ctx.sampleRate * d);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = buf; g.gain.value = v;
    s.connect(g).connect(this.ctx.destination);
    s.start();
  },
};
function sfx(name, n = 1) {
  if (FAST) return;
  const S = Sfx;
  switch (name) {
    // Combo hits climb a semitone per link; the callout chime climbs with them.
    case 'chain': S.tone(330 * 2 ** ((n - 1) / 12), 0.12, 'square', 0.045); break;
    case 'vs': S.tone(110, 0.3, 'sawtooth', 0.05); break;
    case 'vsGo': S.tone(n === 3 ? 1046 : n === 2 ? 523 : 440, n === 3 ? 0.25 : 0.1, 'square', 0.045); break;
    case 'callout': [0, 4, 7].forEach((st, i) => S.tone(523 * 2 ** ((n - 2 + st) / 12), 0.2, 'triangle', 0.05, null, i * 0.07)); break;
    case 'warp': S.tone(70, 2.4, 'sawtooth', 0.04, 1300); S.tone(105, 2.4, 'square', 0.025, 1900); S.noise(0.6, 0.05); break;
    case 'tick': S.tone(900, 0.02, 'square', 0.015); break;
    case 'tally': S.tone(1320, 0.15, 'triangle', 0.04); break;
    case 'select': S.tone(660, 0.04, 'square', 0.025); break;
    case 'place': S.tone(220, 0.07, 'square', 0.035); S.tone(330, 0.08, 'square', 0.035, null, 0.06); break;
    // Low triangle waves barely register on small speakers, so the land thump carries a square layer for presence.
    case 'land': S.noise(0.05, 0.05); S.tone(98, 0.18, 'triangle', 0.1); S.tone(196, 0.1, 'square', 0.035, 160); S.tone(262, 0.12, 'square', 0.03, null, 0.07); break;
    case 'hit': S.noise(0.12, 0.08); S.tone(160, 0.14, 'square', 0.05, 60); break;
    case 'direct': S.noise(0.25, 0.1); S.tone(110, 0.3, 'sawtooth', 0.05, 40); break;
    case 'die': S.tone(320, 0.35, 'square', 0.035, 50); break;
    case 'heal': S.tone(520, 0.08, 'triangle', 0.05); S.tone(780, 0.1, 'triangle', 0.05, null, 0.07); break;
    case 'bell': S.tone(880, 0.7, 'triangle', 0.08); S.tone(1320, 0.5, 'sine', 0.03); break;
    case 'err': S.tone(110, 0.12, 'square', 0.04); break;
    case 'spell': [440, 554, 659].forEach((f, i) => S.tone(f, 0.12, 'triangle', 0.05, null, i * 0.05)); S.tone(880, 0.25, 'sine', 0.03, 1320, 0.15); break;
    case 'trap': S.noise(0.08, 0.08); S.tone(740, 0.08, 'square', 0.05); S.tone(196, 0.3, 'sawtooth', 0.05, 98, 0.06); break;
    case 'win': [523, 659, 784, 1046].forEach((f, i) => S.tone(f, 0.22, 'square', 0.05, null, i * 0.15)); break;
    case 'dice': S.noise(0.025, 0.05); S.tone(900 + Math.random() * 500, 0.025, 'square', 0.018); break;
    case 'diceLand': S.noise(0.07, 0.09); S.tone(140, 0.09, 'square', 0.045, 70); break;
    case 'lose': [392, 330, 262, 196].forEach((f, i) => S.tone(f, 0.32, 'square', 0.05, null, i * 0.22)); break;
  }
}
/* ---------- music (gapless WebAudio loops) ---------- */
// Moonlit Circuit plays on every non-battle screen; BATTLE takes over while a match is on.
// Each file is pre-cut so its end flows straight into its start; looping the decoded
// buffer is sample-accurate, unlike <audio loop> which leaves a gap.
const Music = {
  files: { menu: 'moonlit-circuit-loop', battle: 'battle-loop' },
  ext: new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3',
  volume: 0.04,
  want: 'menu', // the track the current screen calls for
  cur: null,    // the playing (or loading) track: { name, src, gain, level }
  unlocked: false, bytes: {}, buffers: {},
  // Browsers block audio until the first click/keypress, but downloading isn't blocked,
  // so fetch the files at page load and the music can begin the moment input arrives.
  preload() {
    for (const name in this.files) {
      this.bytes[name] = fetch(`assets/audio/music/${this.files[name]}.${this.ext}`).then((r) => r.arrayBuffer());
      this.bytes[name].catch(() => {});
    }
  },
  buffer(name) {
    return this.buffers[name] || (this.buffers[name] = this.bytes[name].then((b) => Sfx.ctx.decodeAudioData(b)));
  },
  start() {
    if (this.unlocked || !Sfx.ctx) return;
    this.unlocked = true;
    this.switchTo(this.want, 1.5);
  },
  /* Ask for a track: the current one fades out while the new one fades in from its start. */
  play(name, fade = 1.5) {
    this.want = name;
    if (this.unlocked) this.switchTo(name, fade);
  },
  async switchTo(name, fade) {
    if (this.cur && this.cur.name === name) return;
    const old = this.cur, t = { name, level: 0 };
    this.cur = t;
    if (old && old.src) { this.ramp(old, 0, fade); old.src.stop(Sfx.ctx.currentTime + fade + 0.05); }
    let buf;
    try { buf = await this.buffer(name); } catch (e) { return; /* music is optional */ }
    if (this.cur !== t) return; // switched again while this one was decoding
    const ctx = Sfx.ctx;
    t.src = ctx.createBufferSource();
    t.src.buffer = buf; t.src.loop = true;
    t.gain = ctx.createGain();
    t.gain.gain.setValueAtTime(0, ctx.currentTime);
    t.src.connect(t.gain).connect(ctx.destination);
    t.src.start();
    this.ramp(t, Sfx.muted ? 0 : this.volume, fade);
  },
  // Ramp from wherever the gain is now. gain.value isn't reliable mid-ramp (or right after
  // the node is made, when it reports 1.0), so hold the curve where the browser can and
  // otherwise start from the last level we set ourselves.
  ramp(t, to, fade) {
    const g = t.gain.gain, now = Sfx.ctx.currentTime;
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now);
    else { g.cancelScheduledValues(now); g.setValueAtTime(t.level, now); }
    t.level = to;
    g.linearRampToValueAtTime(to, now + fade);
  },
  setMuted(muted, fade = 0.4) {
    if (this.cur && this.cur.gain) this.ramp(this.cur, muted ? 0 : this.volume, fade);
  },
};
Music.preload();
function audioUnlock() { Sfx.ensure(); Music.start(); }

/* Sound effects and music together, set from OPTIONS and saved. */
function setSound(on) {
  Sfx.muted = !on;
  Music.setMuted(Sfx.muted);
  Store.write(SOUND_KEY, on ? 'on' : 'off');
}
window.addEventListener('pointerdown', audioUnlock);
window.addEventListener('keydown', audioUnlock);

/* ---------- small UI helpers ---------- */
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1400);
}

function banner(text) {
  if (FAST) return sleep(0);
  const b = $('#banner');
  b.textContent = text;
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
  CRT.glitch();
  return sleep(1200);
}

function relRect(el) {
  const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
  return { x: (r.left - s.left) / curScale, y: (r.top - s.top) / curScale, w: r.width / curScale, h: r.height / curScale };
}

function cardElByUid(uid) { return document.querySelector(`#board .card[data-uid="${uid}"]`) || document.querySelector(`.card[data-uid="${uid}"]`); }
function panelOf(idx) { return document.querySelector(`.ppanel[data-player="${idx}"]`); }

async function lunge(a, t) {
  if (FAST) return;
  const ra = relRect(a), rt = relRect(t);
  const dx = rt.x + rt.w / 2 - (ra.x + ra.w / 2), dy = rt.y + rt.h / 2 - (ra.y + ra.h / 2);
  a.style.zIndex = 30;
  a.style.position = 'relative';
  const anim = a.animate([
    { transform: 'translate(0,0)' },
    { transform: `translate(${-dx * 0.06}px, ${-dy * 0.06}px)`, offset: 0.3 },
    { transform: `translate(${dx * 0.72}px, ${dy * 0.72}px)`, offset: 0.62 },
    { transform: 'translate(0,0)' },
  ], { duration: 460, easing: 'steps(10, end)' });
  await anim.finished.catch(() => {});
}

function shake(el) {
  if (!el) return;
  el.animate([
    { transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' },
    { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' },
  ], { duration: 260, easing: 'steps(5)' });
}

/* ---------- combos (Bejeweled 2 style) ----------
   Each action in a turn that damages the other side is one link in the chain. */
const CALLOUTS = [null, null, 'GOOD!', 'EXCELLENT!', 'AWESOME!', 'SPECTACULAR!', 'EXTRAORDINARY!', 'UNBELIEVABLE!'];
const calloutFor = (n) => CALLOUTS[Math.min(n, CALLOUTS.length - 1)];
let combo = { game: null, turn: -1, n: 0 };

function matchStats() { return game.stats || (game.stats = { dmg: 0, summons: 0, bestChain: 0 }); }
function ownerOf(uid) {
  const p = game.players.find((pl) => pl.board.some((c) => c && c.uid === uid) || pl.grave.some((c) => c.uid === uid));
  return p ? p.idx : -1;
}

/* Count this action's hits on the inactive player; returns the chain length, or 0 if it dealt none. */
function countCombo(fx) {
  const foe = 1 - game.active;
  const hits = fx.filter((f) => f.kind === 'dmg' && (f.player != null ? f.player === foe : ownerOf(f.uid) === foe));
  if (!hits.length) return 0;
  if (combo.game !== game || combo.turn !== game.turnNum) combo = { game, turn: game.turnNum, n: 0 };
  combo.n++;
  if (game.active === ME) {
    const st = matchStats();
    st.dmg += hits.reduce((s, f) => s + f.n, 0);
    st.bestChain = Math.max(st.bestChain, combo.n);
  }
  return combo.n;
}

/* Open the callout out from the middle of the row seam, hold, then close it. */
function callout(text) {
  if (FAST || !text) return;
  const el = $('#callout');
  el.textContent = text;
  el.getAnimations().forEach((a) => a.cancel());
  el.animate([
    { clipPath: 'inset(0 50% 0 50%)' },
    { clipPath: 'inset(0 0 0 0)', offset: 0.15 },
    { clipPath: 'inset(0 0 0 0)', offset: 0.85 },
    { clipPath: 'inset(0 50% 0 50%)' },
  ], { duration: 1300, easing: 'steps(13)' });
}

function sparks(r) {
  if (document.body.dataset.crt === 'off') return;
  for (let i = 0; i < 8; i++) {
    const p = document.createElement('div');
    p.className = 'spark' + (i % 2 ? ' hot' : '');
    p.style.left = r.x + r.w / 2 + 'px';
    p.style.top = r.y + r.h / 2 + 'px';
    $('#fx').appendChild(p);
    const a = (i / 8) * Math.PI * 2, d = 34;
    p.animate([
      { transform: 'translate(-50%, -50%)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.round(Math.cos(a) * d)}px), calc(-50% + ${Math.round(Math.sin(a) * d)}px))`, opacity: 0 },
    ], { duration: 380, easing: 'steps(5)', fill: 'forwards' }).finished.then(() => p.remove());
  }
}

function flushFx() {
  const fx = game.fx.splice(0);
  const chain = countCombo(fx);
  if (FAST) return;
  // A boss Dealer in a run raising the stakes (engine.js bossPhase).
  const stakes = fx.find((f) => f.kind === 'boss');
  if (stakes) {
    const rule = BOSS_RULES[stakes.rule];
    sfx('trap');
    CRT.pulse(1, true);
    banner('THE STAKES RISE').then(() => { if (rule && !game.over) { callout(rule.name); toast(rule.text); } });
  }
  if (chain) {
    sfx('chain', chain);
    const word = calloutFor(chain);
    if (word && !game.over) { callout(word); sfx('callout', chain); }
  }
  let tagged = false;
  fx.forEach((f, i) => {
    let el, shakeEl;
    if (f.uid != null) { el = cardElByUid(f.uid); shakeEl = el; }
    else { shakeEl = panelOf(f.player); el = shakeEl && shakeEl.querySelector('.pp-life'); }
    if (!el) return;
    const r = relRect(el);
    const d = document.createElement('div');
    d.className = 'float ' + f.kind;
    d.textContent = (f.kind === 'dmg' ? '-' : '+') + f.n;
    d.style.left = r.x + r.w / 2 + 'px';
    d.style.top = r.y + r.h / 2 - 18 + 'px';
    $('#fx').appendChild(d);
    d.animate([
      { transform: 'translate(-50%, 0)', opacity: 1 },
      { transform: 'translate(-50%, -36px)', opacity: 1, offset: 0.7 },
      { transform: 'translate(-50%, -48px)', opacity: 0 },
    ], { duration: 1100, delay: i * 70, easing: 'steps(12)', fill: 'forwards' }).finished.then(() => d.remove());
    if (f.kind === 'dmg') {
      shake(shakeEl); CRT.pulse(Math.min(1, 0.15 + f.n / 6), f.player != null);
      sparks(r);
      // The first hit of a chained action also shows the link count.
      if (chain >= 2 && !tagged) {
        tagged = true;
        const x = document.createElement('div');
        x.className = 'float heal';
        x.textContent = 'x' + chain;
        x.style.left = r.x + r.w / 2 + 44 + 'px';
        x.style.top = r.y + r.h / 2 + 'px';
        $('#fx').appendChild(x);
        x.animate([
          { transform: 'translate(-50%, 0)', opacity: 1 },
          { transform: 'translate(-50%, -30px)', opacity: 1, offset: 0.7 },
          { transform: 'translate(-50%, -40px)', opacity: 0 },
        ], { duration: 1100, delay: i * 70 + 120, easing: 'steps(12)', fill: 'forwards' }).finished.then(() => x.remove());
      }
    } else sfx('heal');
  });
}

/* Pop a big copy of a card over the board: a spell being cast or a trap springing. */
async function popCard(c, label) {
  if (FAST) return;
  const wrap = document.createElement('div');
  wrap.className = 'popcard ' + c.type;
  wrap.innerHTML = `<div class="pc-label">${label}</div><div class="card ${c.type}">${cardInnerHTML(c)}</div>`;
  $('#fx').appendChild(wrap);
  inspect(c);
  if (c.type === 'trap') CRT.glitch();
  const anim = wrap.animate([
    { transform: 'translate(-50%, -50%) scale(.4)', opacity: 0 },
    { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.18 },
    { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.82 },
    { transform: 'translate(-50%, -60%) scale(.9)', opacity: 0 },
  ], { duration: 1100, easing: 'steps(14)', fill: 'forwards' });
  await anim.finished.catch(() => {});
  wrap.remove();
}

/* Show every trap that sprang during the last action. */
async function showReveals() {
  for (const r of game.reveals.splice(0)) {
    sfx('trap');
    await popCard(r.card, r.owner === ME ? 'YOUR TRAP!' : 'TRAP!');
  }
}

/* ---------- card elements ---------- */
function cardEl(c) {
  const el = document.createElement('div');
  // Pricey cards catch the light now and then, like a special gem.
  const rare = c.cost && Object.values(c.cost).reduce((s, n) => s + n, 0) >= 4;
  el.className = `card ${c.type}${c.token ? ' token' : ''}${rare ? ' rare' : ''}`;
  el.dataset.uid = c.uid;
  el.innerHTML = cardInnerHTML(c, game && c.type === 'creature' ? game.attackOf(c) : c.atk);
  el.addEventListener('mouseenter', () => inspect(c));
  return el;
}

/* ---------- inspector ---------- */
function inspect(c) {
  $('#inspector').innerHTML = inspectHTML(c, game && c.type === 'creature' ? game.attackOf(c) : c.atk) +
    (c.attacked && game && game.onBoard(c) ? '<div class="i-sigil muted">Tapped: it has attacked and untaps at the start of its owner\'s turn. It still fights back if attacked.</div>' : '');
}

function inspectDefault() {
  $('#inspector').innerHTML = `
    <div class="i-help">
      <b>HOW TO PLAY</b>
      <p>Click a <b>land</b> in your hand to play it (one per turn).</p>
      <p>Click a <b>creature</b> you can afford, then an empty slot.</p>
      <p>Click a ready creature (blinking white outline), then click an enemy creature, or the Dealer's panel when the way is clear.</p>
      <p>Spells: click, then a target (or click again). Traps: click twice to set face-down.</p>
      <p>Ring the bell (Space) to end your turn. Esc or right-click cancels.</p>
      <p class="muted">Hover to inspect. Drag cards to targets.</p>
    </div>`;
}

/* ---------- rendering ---------- */
function render() {
  if (!game) return;
  renderPanel($('#cpuPanel'), game.players[OPP]);
  renderPanel($('#youPanel'), game.players[ME]);
  renderRow($('#cpuRow'), game.players[OPP]);
  renderRow($('#youRow'), game.players[ME]);
  renderTraps($('#cpuTraps'), game.players[OPP]);
  renderTraps($('#youTraps'), game.players[ME]);
  renderHand();
  renderTurn();
  renderLog();
}

function selectedAttacker() { return sel.attacker != null ? game.findCreature(sel.attacker) : null; }
function selectedHand() { return sel.hand != null ? game.players[ME].hand.find((x) => x.uid === sel.hand) || null : null; }
/* True if the selected spell from hand could be aimed at creature `c`. */
function isSpellTarget(c) {
  const s = selectedHand();
  return !!s && s.type === 'spell' && !!s.target && game.spellTargets(game.players[ME], s).includes(c);
}
function isTarget(t) {
  const a = selectedAttacker();
  if (!a) return false;
  return game.targets(a).some((x) => (t.uid != null ? x.uid === t.uid : x.player === t.player));
}

function renderPanel(el, p) {
  const e = game.energy(p);
  el.classList.toggle('active', game.active === p.idx && !game.over);
  el.classList.toggle('targetable', !mine(p) && isTarget({ player: p.idx }));
  el.innerHTML = `
    <div class="pp-head">
      <img class="portrait" src="${spriteURL(mine(p) ? 'hero' : oppSprite())}" alt="">
      <div><div class="pp-name">${escapeHTML((mine(p) ? heroName() : oppName()).toUpperCase())}</div><div class="pp-deck">${escapeHTML(p.deckDef.name)}</div></div>
      <div class="pp-life">${ico('hp')}<b>${Math.max(0, p.life)}</b></div>
    </div>
    <div class="pp-stats"><span>DECK ${p.library.length}</span><span>HAND ${p.hand.length}</span><span>GRAVE ${p.grave.length}</span></div>
    ${COLOR_KEYS.some((k) => e[k].total)
      ? `<table class="pp-energy">${COLOR_KEYS.filter((k) => e[k].total).map((k) => {
          const used = e[k].total - e[k].free;
          return `<tr title="${COLORS[k].land}"><td class="n">${e[k].total}X</td><td>${ico(COLORS[k].icon)}</td><td class="muted">${used ? `${used} USED` : ''}</td></tr>`;
        }).join('')}</table>`
      : '<div class="pp-energy muted">no lands yet</div>'}
    ${!mine(p) ? `<div class="pp-hand">${'<span class="mini-back"></span>'.repeat(Math.min(p.hand.length, 12))}</div>` : ''}`;
}

function renderRow(el, p) {
  el.innerHTML = '';
  const myTurn = game.active === ME && !game.over;
  p.board.forEach((c, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.dataset.player = p.idx;
    slot.dataset.i = i;
    if (!c) {
      if (mine(p) && selectedHand()?.type === 'creature') slot.classList.add('droppable');
      slot.addEventListener('click', () => onSlot(p, i));
    } else {
      const ce = cardEl(c);
      if (c.dead) ce.classList.add('dying');
      if (c.sick && game.active === c.owner) ce.classList.add('sick');
      // MTG-style tap: a creature turns sideways once it has attacked, and
      // straightens again when its owner's next turn begins.
      const was = tapState.get(c.uid);
      if (c.attacked) ce.classList.add('tapped', 'spent');
      if (c.attacked && was === false) ce.classList.add('tap-in');
      if (!c.attacked && was === true) ce.classList.add('tap-out');
      tapState.set(c.uid, c.attacked);
      if (mine(p) && myTurn && !busy && game.canAttack(c)) {
        ce.classList.add('ready');
        // Phase the outline blink off the wall clock so re-renders don't restart
        // it and every ready creature blinks in sync, like a terminal cursor.
        ce.style.setProperty('--blink-delay', `${-(performance.now() % 1060)}ms`);
      }
      if (sel.attacker === c.uid) ce.classList.add('selected');
      if ((!mine(p) && isTarget({ uid: c.uid })) || isSpellTarget(c)) ce.classList.add('targetable');
      ce.addEventListener('click', () => onBoardCard(p, c));
      if (mine(p)) ce.addEventListener('pointerdown', (e) => dragPress(e, c, false));
      slot.appendChild(ce);
    }
    el.appendChild(slot);
  });
}

/* Face-down traps: yours show their art, the opponent's stay hidden. */
function renderTraps(el, p) {
  el.innerHTML = '';
  const settingTrap = mine(p) && selectedHand()?.type === 'trap';
  p.traps.forEach((t, i) => {
    const s = document.createElement('div');
    s.className = 'tslot';
    s.dataset.player = p.idx;
    s.dataset.i = i;
    if (t) {
      s.classList.add('set');
      if (mine(p)) { s.classList.add('mine'); s.innerHTML = `<img src="${spriteURL(t.sprite)}" alt="">`; }
      s.addEventListener('mouseenter', () => {
        if (mine(p)) inspect(t);
        else $('#inspector').innerHTML = `<div class="i-help"><b>FACE-DOWN TRAP</b><p>${escapeHTML(oppTitle().replace(/^t/, 'T'))} set this on their turn. It will spring by itself when you attack, summon or cast a spell, depending on what it is.</p></div>`;
      });
    } else {
      if (settingTrap) s.classList.add('droppable');
      s.addEventListener('click', () => { const c = selectedHand(); if (settingTrap && c && myTurnReady()) setTrapAt(c, i); });
    }
    el.appendChild(s);
  });
}

function renderHand() {
  const h = $('#hand');
  h.innerHTML = '';
  const you = game.players[ME];
  const myTurn = game.active === ME && !game.over;
  const n = you.hand.length;
  const overlap = n > 10 ? -Math.ceil((n * 118 - 1220) / (n - 1)) + 4 : 4;
  // Lands first, then everything else, with a gap between the two groups.
  const shown = [...you.hand].sort((a, b) => (a.type === 'land' ? 0 : 1) - (b.type === 'land' ? 0 : 1));
  const lastLand = shown.filter((c) => c.type === 'land').length - 1;
  shown.forEach((c, i) => {
    const ce = cardEl(c);
    const ok = c.type === 'land' ? !you.landPlayed : game.canCast(you, c);
    ce.classList.add(myTurn && ok ? 'playable' : 'unplayable');
    if (sel.hand === c.uid) ce.classList.add('selected');
    const gap = i === lastLand && i < shown.length - 1 ? 22 : 0;
    ce.style.margin = `0 ${overlap / 2 + gap}px 0 ${overlap / 2}px`;
    ce.style.setProperty('--i', i);
    ce.addEventListener('click', () => onHand(c));
    ce.addEventListener('pointerdown', (e) => dragPress(e, c, true));
    h.appendChild(ce);
  });
}

function renderTurn() {
  const myTurn = game.active === ME;
  const you = game.players[ME];
  $('#turnInfo').innerHTML = `
    <div class="ti-turn">TURN ${game.turnNum}</div>
    <div class="ti-who">${game.over ? 'GAME OVER' : myTurn ? 'YOUR TURN' : `${escapeHTML(oppName().toUpperCase())}'S TURN`}</div>
    <div class="ti-land">${myTurn ? (you.landPlayed ? 'Land played' : 'Land: ready') : 'Waiting...'}</div>
    ${online() && !game.over ? '<div class="ti-timer" id="turnTimer"></div>' : ''}`;
  $('#bell').disabled = !myTurn || busy || game.over;
}

function renderLog() {
  // Escaped: online, card and player names come from the other player.
  $('#log').innerHTML = '<div class="log-title">LOG</div><div class="log-lines">' +
    game.log.slice(-14).map((l) => `<div class="ll ${l.who}">${escapeHTML(l.text)}</div>`).join('') + '</div>';
}

/* ---------- player input ---------- */
function myTurnReady() { return game && !game.over && game.active === ME && !busy; }

function clearSel() { sel = { hand: null, attacker: null }; }

function onHand(c) {
  if (!myTurnReady()) return;
  const you = game.players[ME];
  sel.attacker = null;
  if (c.type === 'land') {
    if (you.landPlayed) { toast('Only one land per turn.'); sfx('err'); return; }
    if (online()) return Net.local({ t: 'land', uid: c.uid });
    game.playLand(you, you.hand.indexOf(c));
    sel.hand = null;
    sfx('land');
    render();
    return;
  }
  if (c.type === 'creature' && !you.board.includes(null)) { toast('Your board is full.'); sfx('err'); return; }
  if (c.type === 'trap' && !you.traps.includes(null)) { toast('Your trap zone is full.'); sfx('err'); return; }
  if (c.type === 'spell' && !game.spellUsable(you, c)) {
    toast(c.target ? 'No valid target for that.' : 'Nothing for that spell to do yet.'); sfx('err'); return;
  }
  if (!game.payPlan(you, c.cost)) { toast('Not enough energy.'); sfx('err'); return; }
  if (sel.hand === c.uid) {
    if (c.type === 'creature') castAt(c, you.board.indexOf(null));
    else if (c.type === 'trap') setTrapAt(c, -1);
    else if (!c.target) castSpellAt(c, null);
    else toast('Click a highlighted creature to aim it.');
    return;
  }
  sel.hand = c.uid;
  sfx('select');
  if (c.type === 'spell') toast(c.target ? 'Choose a target.' : 'Click again to cast.');
  if (c.type === 'trap') toast('Click again or pick a trap slot to set it.');
  render();
}

async function castAt(c, slot) {
  if (online()) return Net.local({ t: 'cast', uid: c.uid, slot });
  const g = game, you = game.players[ME];
  busy = true;
  clearSel();
  if (!game.cast(you, you.hand.indexOf(c), slot)) { busy = false; toast("Can't summon that."); render(); return; }
  matchStats().summons++;
  sfx('place');
  await showReveals();
  if (abandoned(g)) return;
  render();
  const el = cardElByUid(c.uid);
  if (el) el.classList.add('enter');
  flushFx();
  await settle();
  busy = false;
  render();
}

async function castSpellAt(c, targetUid) {
  if (online()) return Net.local({ t: 'spell', uid: c.uid, target: targetUid });
  const g = game, you = game.players[ME];
  busy = true;
  clearSel();
  if (!game.castSpell(you, you.hand.indexOf(c), targetUid)) { busy = false; toast("Can't cast that."); render(); return; }
  await playSpellFx(c);
  if (abandoned(g)) return;
  busy = false;
  render();
}

/* Shared by both players: show the spell, any trap that answered it, then its results. */
async function playSpellFx(c) {
  const g = game;
  sfx('spell');
  render();
  await popCard(c, 'SPELL');
  if (game !== g) return;
  await showReveals();
  if (game !== g) return;
  render();
  flushFx();
  await settle();
}

function setTrapAt(c, slot) {
  if (online()) return Net.local({ t: 'trap', uid: c.uid, slot });
  const you = game.players[ME];
  clearSel();
  if (!game.setTrap(you, you.hand.indexOf(c), slot)) { toast("Can't set that."); render(); return; }
  sfx('place');
  render();
}

function onSlot(p, i) {
  if (!myTurnReady() || !mine(p)) return;
  const c = selectedHand();
  if (c && c.type === 'creature') castAt(c, i);
}

function onBoardCard(p, c) {
  if (!myTurnReady()) return;
  const s = selectedHand();
  if (s && s.type === 'spell' && s.target) {
    if (isSpellTarget(c)) castSpellAt(s, c.uid);
    else { toast('Not a valid target for ' + s.name + '.'); sfx('err'); }
    return;
  }
  if (mine(p)) {
    if (game.canAttack(c)) {
      sel.attacker = sel.attacker === c.uid ? null : c.uid;
      sel.hand = null;
      sfx('select');
      render();
    } else if (c.sick) toast(`${c.name} is not ready to attack yet.`);
    else if (c.attacked) toast(`${c.name} has already attacked.`);
    else if (game.attackOf(c) <= 0) toast(`${c.name} has no attack.`);
    return;
  }
  if (sel.attacker == null) return;
  if (isTarget({ uid: c.uid })) playerAttack({ uid: c.uid });
  else { toast('A Guardian blocks the way!'); sfx('err'); }
}

function onEnemyPanel() {
  if (!myTurnReady() || sel.attacker == null) return;
  if (isTarget({ player: OPP })) playerAttack({ player: OPP });
  else {
    const a = selectedAttacker(), foes = game.livingBoard(game.players[OPP]);
    const flyers = a && has(a, 'airborne') && !foes.some((e) => has(e, 'guardian')) && foes.some((e) => has(e, 'airborne'));
    const whose = `${oppTitle()}'s`, Whose = whose[0].toUpperCase() + whose.slice(1);
    toast(flyers ? `${Whose} flyers block the way! Take them out first.` : `Clear ${whose} creatures first (Airborne ignores this unless ${oppTitle()} has flyers).`);
    sfx('err');
  }
}

/* ---------- drag to target ----------
   Press a hand card or a ready creature and drag: a trail of pixel dots follows
   the pointer, and letting go over a target does what the two clicks would.
   A press that doesn't move stays a plain click. */
const DRAG_MIN = 6;  // px of movement before a press becomes a drag
const DOT_GAP = 14;  // stage px between trail dots
let drag = null;     // { c, fromHand, x0, y0, kind, from, hover }
let swallowClick = false;
const dragArrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
dragArrow.id = 'dragArrow';
dragArrow.setAttribute('viewBox', '0 0 1280 720');
dragArrow.setAttribute('shape-rendering', 'crispEdges');
$('#screenWrap').appendChild(dragArrow);
const dragDots = []; // reused between moves so each dot's pulse keeps running

function toStage(x, y) {
  const s = stage.getBoundingClientRect();
  return { x: (x - s.left) / curScale, y: (y - s.top) / curScale };
}

function dragPress(e, c, fromHand) {
  if (e.button !== 0 || !myTurnReady()) return;
  // While aiming a spell, a press on your own creature is a target pick, not a drag.
  if (!fromHand && selectedHand()) return;
  drag = { c, fromHand, x0: e.clientX, y0: e.clientY, kind: null };
}

/* Select the card the same way a first click would; returns false if it can't go anywhere. */
function dragBegin() {
  const { c, fromHand } = drag;
  if (fromHand) {
    if (c.type !== 'land') {
      if (sel.hand !== c.uid) onHand(c);
      if (sel.hand !== c.uid) return false;
    }
    drag.kind = c.type === 'spell' && c.target ? 'aim' : 'play';
  } else {
    if (sel.attacker !== c.uid) onBoardCard(game.players[ME], c);
    if (sel.attacker !== c.uid) return false;
    drag.kind = 'attack';
  }
  const el = cardElByUid(c.uid);
  const r = relRect(el);
  drag.from = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  dragArrow.classList.add('on');
  stage.classList.add('dragging');
  return true;
}

function dropTargetAt(x, y) {
  const within = (el) => { const r = el.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
  for (const el of $$('#board .slot, #board .tslot, #cpuPanel')) if (within(el)) return el;
  return within($('#board')) ? $('#board') : null;
}

/* Is `el` somewhere this drag would do something? (Used for the hover highlight.) */
function dropMeaningful(el) {
  if (!el) return false;
  if (drag.kind === 'attack') return el.id === 'cpuPanel' ? el.classList.contains('targetable') : !!el.querySelector('.card.targetable');
  if (drag.kind === 'aim') return !!el.querySelector('.card.targetable');
  return el.classList.contains('droppable');
}

function drawArrow(x, y) {
  const a = drag.from, b = toStage(x, y);
  // Bow the arrow upward a little, like a thrown line.
  const cx = (a.x + b.x) / 2, cy = Math.min(a.y, b.y) - Math.min(120, Math.hypot(b.x - a.x, b.y - a.y) * 0.3);
  const at = (t) => { const u = 1 - t; return { x: u * u * a.x + 2 * u * t * cx + t * t * b.x, y: u * u * a.y + 2 * u * t * cy + t * t * b.y }; };
  // Walk the curve, dropping a dot every DOT_GAP px, snapped to a 2px grid.
  const pts = [];
  let last = at(0);
  for (let t = 0.01; t <= 1; t += 0.004) {
    const p = at(t);
    if (Math.hypot(p.x - last.x, p.y - last.y) >= DOT_GAP) { pts.push(p); last = p; }
  }
  pts.forEach((p, i) => {
    let dot = dragDots[i];
    if (!dot) {
      dot = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      dot.setAttribute('class', 'da-dot');
      dot.setAttribute('width', 6);
      dot.setAttribute('height', 6);
      dot.style.animationDelay = `${-i * 90}ms`; // the pulse ripples along the trail
      dragArrow.appendChild(dot);
      dragDots.push(dot);
    }
    dot.setAttribute('x', Math.round(p.x / 2) * 2 - 3);
    dot.setAttribute('y', Math.round(p.y / 2) * 2 - 3);
    dot.style.display = '';
  });
  for (let i = pts.length; i < dragDots.length; i++) dragDots[i].style.display = 'none';
}

function dragEnd() {
  dragArrow.classList.remove('on');
  stage.classList.remove('dragging');
  if (drag && drag.hover) drag.hover.classList.remove('drop-hover');
  drag = null;
}

function dropOn(d, el) {
  const { c, kind, fromHand } = d;
  const slot = el && el.classList.contains('slot') ? el : null;
  const p = slot ? game.players[+slot.dataset.player] : null;
  const occupant = slot ? p.board[+slot.dataset.i] : null;
  if (kind === 'attack') {
    if (occupant && !mine(p)) return onBoardCard(p, occupant);
    if (el && el.id === 'cpuPanel') return onEnemyPanel();
  } else if (kind === 'aim') {
    if (occupant) return onBoardCard(p, occupant);
  } else if (el) {
    if (c.type === 'creature' && slot && mine(p) && !occupant) return castAt(c, +slot.dataset.i);
    if (c.type === 'trap' && el.classList.contains('droppable')) return setTrapAt(c, +el.dataset.i);
    // Anywhere else on the board: play it as a second click would (first free slot, etc.).
    if (fromHand) return onHand(c);
  }
  // Dropped somewhere that does nothing: put the card back.
  clearSel();
  render();
}

document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.kind) {
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_MIN) return;
    if (!myTurnReady() || !dragBegin()) { dragEnd(); return; }
  }
  drawArrow(e.clientX, e.clientY);
  const t = dropTargetAt(e.clientX, e.clientY);
  const hover = dropMeaningful(t) ? t : null;
  if (hover !== drag.hover) {
    if (drag.hover) drag.hover.classList.remove('drop-hover');
    if (hover) hover.classList.add('drop-hover');
    drag.hover = hover;
  }
});
document.addEventListener('pointerup', (e) => {
  const d = drag;
  if (!d) return;
  dragEnd();
  if (!d.kind) return; // never moved: let it be a plain click
  // The browser may still fire a click on whatever is under the pointer; that click isn't meant.
  swallowClick = true;
  setTimeout(() => { swallowClick = false; }, 0);
  if (myTurnReady()) dropOn(d, dropTargetAt(e.clientX, e.clientY));
});
// Card art is an <img>, which the browser would otherwise start dragging natively (cancelling ours).
document.addEventListener('dragstart', (e) => { if (e.target.closest && e.target.closest('#game')) e.preventDefault(); });
document.addEventListener('pointercancel', () => { if (drag && drag.kind) { clearSel(); render(); } dragEnd(); });
window.addEventListener('click', (e) => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); } }, true);

async function playerAttack(t) {
  const a = selectedAttacker();
  if (!a) return;
  if (online()) return Net.local({ t: 'attack', a: a.uid, tgt: t.player != null ? { player: t.player } : { uid: t.uid } });
  busy = true;
  clearSel();
  await performAttack(a, t);
  busy = false;
  render();
}

async function performAttack(a, t) {
  const g = game;
  // The defender's traps get the first word.
  if (!game.declareAttack(a, t) || game.reveals.length) {
    await showReveals();
    if (abandoned(g)) return;
    render();
    flushFx();
    await settle();
    if (abandoned(g) || a.attacked || a.dead || !game.onBoard(a)) return;
  }
  render();
  const ae = cardElByUid(a.uid);
  const te = t.player != null ? panelOf(t.player) : cardElByUid(t.uid);
  if (ae && te) await lunge(ae, te);
  if (abandoned(g)) return;
  game.resolveAttack(a, t);
  sfx(t.player != null ? 'direct' : 'hit');
  render();
  flushFx();
  await settle();
}

/* Let dying creatures fade out, then clear them away. */
async function settle() {
  const g = game;
  if (game.hasDying()) {
    sfx('die');
    await sleep(480);
    if (abandoned(g)) return;
    game.cleanup();
    render();
    flushFx();
  }
  if (game.over) endGame();
}

async function playerEndTurn() {
  if (!myTurnReady()) return;
  clearSel();
  busy = true;
  sfx('bell');
  const b = $('#bell');
  b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring');
  if (online()) { busy = false; return Net.local({ t: 'end' }); }
  game.endTurn();
  render();
  flushFx();
  if (game.over) return endGame();
  await cpuTurn();
}

/* ---------- the Dealer's turn ---------- */
async function cpuTurn() {
  const g = game;
  busy = true;
  render();
  await banner(`${oppName().toUpperCase()}'S TURN`);
  if (abandoned(g)) return;
  const p = game.players[1];

  const li = AI.chooseLand(game, p);
  if (li >= 0) {
    game.playLand(p, li);
    sfx('land');
    render();
    await sleep(550);
    if (abandoned(g)) return;
  }

  for (let guard = 0; guard < 12; guard++) {
    const play = AI.chooseCast(game, p);
    if (!play) break;
    const c = p.hand[play.i];
    if (c.type === 'spell') {
      game.castSpell(p, play.i, play.target);
      await playSpellFx(c);
      if (abandoned(g)) return;
      continue;
    }
    game.cast(p, play.i, AI.chooseSlot(game, p));
    sfx('place');
    await showReveals();
    if (abandoned(g)) return;
    render();
    inspect(c);
    const el = cardElByUid(c.uid);
    if (el) el.classList.add('enter');
    flushFx();
    await sleep(650);
    if (abandoned(g)) return;
    await settle();
    if (abandoned(g)) return;
  }

  for (let guard = 0; guard < 12; guard++) {
    const m = AI.chooseAttack(game, p);
    if (!m) break;
    await sleep(250);
    if (abandoned(g)) return;
    await performAttack(m.a, m.t);
    if (abandoned(g)) return;
  }

  // Whatever energy is left goes into face-down traps.
  for (let guard = 0; guard < TRAP_SLOTS; guard++) {
    const ti = AI.chooseTrap(game, p);
    if (ti < 0) break;
    game.setTrap(p, ti);
    sfx('place');
    render();
    await sleep(450);
    if (abandoned(g)) return;
  }

  await sleep(400);
  if (abandoned(g)) return;
  game.endTurn();
  render();
  flushFx();
  if (game.over) return endGame();
  await banner('YOUR TURN');
  busy = false;
  render();
}

/* ---------- screens ---------- */
const RULES_HTML = `
  <h3>HOW TO PLAY</h3>
  <ul>
    <li>You and the Dealer each start with <b>20 life</b> and a <b>30-card</b> deck. Reduce the Dealer to 0.</li>
    <li>Each turn: draw a card, play up to <b>one land</b>, then summon creatures by spending energy from your lands.</li>
    <li>Costs: a number can be paid by any land; a symbol (${ico('paw')} ${ico('bone')} ${ico('gem')} ${ico('hat')}) needs that land type.</li>
    <li>New creatures must wait a turn before attacking. Each creature attacks once per turn.</li>
    <li>Attack by choosing an enemy creature: both strike each other at once. <b>Damage stays</b> on creatures.</li>
    <li><b>Spells</b> are cast on your own turn only: they take effect at once, then go to the grave.</li>
    <li><b>Traps</b> are paid for and set face-down on your turn (up to 3). They spring by themselves on the enemy's turn when they attack, summon or cast a spell.</li>
    <li>You may only hit the Dealer <b>directly</b> when they have no creatures, unless your attacker is <b>Airborne</b> and the Dealer has no Airborne creatures of their own. <b>Guardians</b> must be attacked first.</li>
    <li>Ring the <b>bell</b> to end your turn. Drawing from an empty deck hurts, more each time.</li>
  </ul>`;

function showScreen(html, dim = false) {
  const s = $('#screen');
  s.innerHTML = html;
  s.classList.toggle('dim', dim);
  s.classList.remove('hidden');
}
function hideScreen() { $('#screen').classList.add('hidden'); }

/* ---------- title: Custom Robo style hangar ----------
   Your character on a turning rune circle at left; slanted menu bars at right,
   with a ticker that describes whichever bar is picked (mouse or arrow keys). */
const RECORD_KEY = 'cardgrave.record.v1';
function getRecord() { return { wins: 0, losses: 0, ...Store.read(RECORD_KEY, {}) }; }

function titleMenu() {
  return [
    { label: 'OFFLINE PLAY', desc: "Sit at the Dealer's table: a quick match, or a run along the circuit.", go: showOfflineMenu },
    Cloud.enabled && { label: 'ONLINE ARENA', desc: 'Duel another spellslinger in real time. Needs an account.', go: () => Net.showOnline() },
    { label: 'DECK BUILDER', desc: 'Bind 30 cards into a spellbook of your own.', go: () => showDeckBuilder() },
    { label: 'CARD MAKER', desc: 'Draw and enchant a card of your own.', go: () => CardMaker.show() },
    { label: 'CHARACTER', desc: 'Change the face you bring to the table.', go: () => CharMaker.show() },
    { label: 'OPTIONS', desc: 'Sound, screen and colours. How to play lives here too.', go: () => openOptions(false) },
  ].filter(Boolean);
}

function showTitle() {
  Music.play('menu');
  const menu = titleMenu(), rec = getRecord();
  showScreen(`
    <div class="ttl">
      <div class="ttl-edge"></div><div class="ttl-side"></div>
      <div class="ttl-logo"><div class="logo">BRIMSTONE<span>SLINGSHOT</span></div>
        <div class="ttl-sub">a duel of beasts, bones, gems &amp; arcana</div></div>
      <canvas class="ttl-rune" width="128" height="40"></canvas>
      <div class="ttl-hero tilt" id="ttlHero" title="Edit your character" style="--spr: url(${spriteURL('hero')})">
        <img src="${spriteURL('hero')}" alt=""><div class="c-glare"></div></div>
      <div class="ttl-plate panel">
        <div><div class="ttl-name">${escapeHTML(heroName().toUpperCase())}</div>
          <div class="ttl-rec">${rec.wins} win${rec.wins === 1 ? '' : 's'} &middot; ${rec.losses} loss${rec.losses === 1 ? '' : 'es'}</div></div>
      </div>
      <div class="ttl-bars">${menu.map((m, i) => `<button class="ttl-bar" data-i="${i}">${m.label}</button>`).join('')}</div>
      <div class="ttl-tick"><span></span></div>
      <div class="ttl-acct" id="acctSlot"></div>
    </div>`);
  Cloud.mount($('#acctSlot'));
  $('#ttlHero').onclick = () => { sfx('select'); CharMaker.show(); };

  const bars = [...$$('.ttl-bar')];
  const pick = (i, quiet) => {
    titleSel = i;
    bars.forEach((b, j) => b.classList.toggle('on', j === i));
    $('.ttl-tick span').textContent = menu[i].desc;
    if (!quiet) sfx('select');
  };
  bars.forEach((b, i) => {
    b.onmouseenter = () => { if (titleSel !== i) pick(i); };
    b.onclick = () => { sfx('place'); menu[i].go(); };
    if (!FAST) b.animate([{ transform: 'translateX(640px)' }, { transform: 'none' }], { duration: 420, delay: i * 70, easing: 'steps(8)', fill: 'backwards' });
  });
  pick(0, true);
  titleRune($('.ttl-rune'));
}
let titleSel = 0;

/* Arrow keys move the highlighted bar, Enter picks it. */
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || !$('.ttl') || $('#screen').classList.contains('hidden')) return;
  const bars = $$('.ttl-bar');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    bars[(titleSel + (e.key === 'ArrowDown' ? 1 : bars.length - 1)) % bars.length].onmouseenter();
  } else if (e.key === 'Enter' && document.activeElement === document.body) {
    e.preventDefault();
    bars[titleSel].onclick();
  }
});

/* Rune circle: an ink ring with orbiting rune marks, ~12fps for a stepped spin. */
function titleRune(cv) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
  const t0 = performance.now();
  const ring = (rx, ry, n, col) => {
    x.fillStyle = col;
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; x.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 1, 1); }
  };
  (function draw() {
    if (!cv.isConnected) return;
    const t = (performance.now() - t0) / 1000;
    const p = Palette.cur;
    x.clearRect(0, 0, W, H);
    ring(60, 18, 180, p.ink);
    ring(46, 13, 120, p.dark);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + t * 0.6, front = Math.sin(a) > 0;
      const px = Math.round(cx + Math.cos(a) * 53), py = Math.round(cy + Math.sin(a) * 15.5);
      x.fillStyle = front ? p.accent : p.mid;
      x.fillRect(px - 1, py, 3, 1); x.fillRect(px, py - 1, 1, 3);
    }
    if (document.body.dataset.crt !== 'off') setTimeout(draw, 83);
  })();
}

/* Opened from OPTIONS; `dim` when that was opened over a match. */
function showTitleRules(dim = false) {
  showScreen(`<div class="rules panel">${RULES_HTML}<div class="rules-close"><button class="btn" id="closeRules">BACK</button></div></div>`, dim);
  $('#closeRules').onclick = () => { sfx('select'); showOptions(); };
}

/* OFFLINE PLAY: a Dealer's Run on the left, a single quick match on the right.
   Left/Right pick, Enter chooses, Esc goes back to the title. */
function showOfflineMenu() {
  const run = Run.load();
  const modes = [
    { name: "DEALER'S RUN", art: 'dealer', go: () => Run.open(),
      desc: 'Walk the brimstone circuit to the Dealer. Your deck grows and changes, and your life carries over.',
      note: run ? `RUN IN PROGRESS &middot; ${ico('hp')} ${run.life}/${run.maxLife}` : 'ONE REGION &middot; ABOUT 10 MINUTES' },
    { name: 'QUICK MATCH', art: 'ri_battle', go: () => showDeckSelect(),
      desc: 'One hand against the Dealer with any deck you like.', note: 'PREMADE OR YOUR OWN DECKS' },
  ];
  showScreen(`
    <div class="ds om">
      <div class="ds-title">OFFLINE PLAY</div>
      <div class="tablets">${modes.map((m, i) => `
        <div class="tablet om-mode" data-i="${i}">
          <div class="t-art"><img src="${spriteURL(m.art)}" alt=""></div>
          <div class="t-name">${m.name}</div>
          <div class="t-desc">${m.desc}</div>
          <div class="om-note">${m.note}</div>
        </div>`).join('')}
      </div>
      <button class="btn" id="omBack">BACK</button>
    </div>`);
  const cards = [...$$('.om-mode')];
  const pick = (i) => { offlineSel = i; cards.forEach((c, j) => c.classList.toggle('on', j === i)); };
  cards.forEach((c, i) => {
    c.onmouseenter = () => { if (offlineSel !== i) { pick(i); sfx('select'); } };
    c.onclick = () => { sfx('place'); modes[i].go(); };
  });
  pick(Math.min(offlineSel, 1));
  $('#omBack').onclick = () => { sfx('select'); showTitle(); };
}
let offlineSel = 0;
document.addEventListener('keydown', (e) => {
  if (!$('.om') || $('#screen').classList.contains('hidden')) return;
  const cards = $$('.om-mode');
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); cards[e.key === 'ArrowLeft' ? 0 : 1].onmouseenter(); }
  else if (e.key === 'Enter' && document.activeElement === document.body) { e.preventDefault(); cards[offlineSel].onclick(); }
  else if (e.key === 'Escape') $('#omBack').onclick();
});

/* Fighting-game VS splash before a fight (Dealer's Run): you slide in from the left,
   your foe from the right, then VS, READY..., GO!. Click to skip. Resolves when done.
   you / foe: { name, deck, sprite } */
function vsSplash(you, foe) {
  const side = (p, cls) => `
    <div class="vs-side ${cls}">
      <div class="vs-port"><img src="${spriteURL(p.sprite)}" alt=""></div>
      <div class="vs-who"><div class="vs-name">${escapeHTML(p.name.toUpperCase())}</div><div class="vs-deck">${escapeHTML(p.deck.toUpperCase())}</div></div>
    </div>`;
  showScreen(`<div class="vs">${side(you, 'vs-l')}${side(foe, 'vs-r')}<div class="vs-t" id="vsT">VS</div><div class="vs-t low" id="vsR"></div></div>`);
  return new Promise((resolve) => {
    if (FAST) return resolve();
    const timers = [];
    let done = false;
    const finish = () => { if (done) return; done = true; timers.forEach(clearTimeout); resolve(); };
    $('.vs').addEventListener('click', finish);
    $('.vs-l').animate([{ transform: 'translateX(-100%)' }, { transform: 'none' }], { duration: 400, easing: 'steps(8)' });
    $('.vs-r').animate([{ transform: 'translateX(100%)' }, { transform: 'none' }], { duration: 400, easing: 'steps(8)' });
    sfx('vs');
    const t = $('#vsT'), r = $('#vsR');
    timers.push(setTimeout(() => { t.classList.add('on'); sfx('vsGo', 1); CRT.glitch(); }, 450));
    timers.push(setTimeout(() => { r.textContent = 'READY...'; r.classList.add('on'); sfx('vsGo', 2); }, 1300));
    timers.push(setTimeout(() => { r.textContent = 'GO!'; sfx('vsGo', 3); CRT.pulse(0.6); }, 2200));
    timers.push(setTimeout(finish, 2900));
  });
}

/* `onPick(deckDef)` runs when a deck is chosen: a game against the Dealer, or the online lobby. */
function showDeckSelect(onPick = startGame, heading = 'CHOOSE YOUR DECK') {
  $('#game').classList.add('hidden');
  const saved = getSavedDecks().map((d) => ({ d, def: savedDeckToDef(d) }));
  showScreen(`
    <div class="ds">
      <div class="ds-title">${heading}</div>
      <div class="tablets">${DECKS.map((d, i) => `
        <div class="tablet" data-i="${i}">
          <div class="t-art"><img src="${spriteURL(d.feature)}" alt=""></div>
          <div class="t-icons">${d.colors.map((c) => ico(COLORS[c].icon)).join('')}</div>
          <div class="t-name">${d.name.toUpperCase()}</div>
          <div class="t-desc">${d.desc}</div>
        </div>`).join('')}
      </div>
      <div class="my-decks panel">
        <div class="md-title">MY DECKS</div>
        <div class="md-list">${saved.map(({ d, def }) => {
          const n = deckCount(def.list);
          return `<button class="md-deck" data-id="${escapeHTML(d.id)}" ${n === DECK_SIZE ? '' : 'disabled'} title="${n === DECK_SIZE ? 'Play this deck' : 'Needs exactly 30 cards - open the Deck Builder'}">
            <img src="${spriteURL(def.feature)}" alt=""><span class="md-name">${escapeHTML(def.name)}</span>
            <span class="md-meta">${def.colors.map((c) => ico(COLORS[c].icon)).join('')} ${n}/${DECK_SIZE}</span></button>`;
        }).join('') || '<span class="muted">No saved decks yet. Build one in the Deck Builder.</span>'}</div>
        <div class="md-btns">
          <button class="btn" id="dsBuilder">DECK BUILDER</button>
          <button class="btn" id="dsBack">BACK</button>
        </div>
      </div>
    </div>`);
  $$('.tablet').forEach((t) => {
    t.onclick = () => onPick(DECKS[+t.dataset.i]);
    t.onmouseenter = () => sfx('select');
  });
  $$('.md-deck').forEach((b) => {
    b.onclick = () => { const s = saved.find((x) => x.d.id === b.dataset.id); if (s) onPick(s.def); };
  });
  $('#dsBuilder').onclick = () => { sfx('select'); showDeckBuilder(); };
  $('#dsBack').onclick = () => { sfx('select'); if (onPick === startGame) showOfflineMenu(); else showTitle(); };
}

/* ---------- opening dice roll: high roll picks who goes first ---------- */
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const d6 = () => 1 + Math.floor(Math.random() * 6);
function setDie(el, n) {
  el.dataset.n = n;
  el.innerHTML = Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[n].includes(i) ? 'on' : ''}"></i>`).join('');
}

/* Flickers through faces, slowing down, then lands on `final`. */
async function tumble(el, final, frames) {
  el.classList.remove('land');
  el.classList.add('rolling');
  let n = +el.dataset.n || 1;
  for (let i = 0; i < frames; i++) {
    let next;
    do next = d6(); while (next === n);
    setDie(el, (n = next));
    el.style.setProperty('--tilt', `${(Math.random() < 0.5 ? -1 : 1) * (6 + Math.floor(Math.random() * 4) * 6)}deg`);
    el.style.setProperty('--hop', `${-6 - Math.floor(Math.random() * 3) * 6}px`);
    sfx('dice');
    await sleep(45 + i * i * 1.5);
  }
  setDie(el, final);
  el.classList.remove('rolling');
  void el.offsetWidth;
  el.classList.add('land');
  sfx('diceLand');
}

/* Shows the roll-off. Resolves to { first, you, cpu }: first is 0 if you go first, 1 if the Dealer does. */
function rollForFirst() {
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
          <img class="r-art" src="${spriteURL(oppSprite())}" alt="">
          <div class="roll-name">${escapeHTML(foe ? foe.name : 'THE DEALER')}</div>
          <div class="die" id="dieCpu"></div>
        </div>
      </div>
      <div class="roll-msg" id="rollMsg">High roll chooses who goes first.</div>
      <div class="roll-btns" id="rollBtns"><button class="btn big" id="rollBtn">ROLL</button></div>
    </div>`, true);
  const dieYou = $('#dieYou'), dieCpu = $('#dieCpu'), msg = $('#rollMsg'), btns = $('#rollBtns');
  setDie(dieYou, 6);
  setDie(dieCpu, 6);

  return new Promise((resolve) => {
    const roll = async () => {
      btns.innerHTML = '';
      msg.textContent = 'Rolling...';
      $$('.roller').forEach((r) => r.classList.remove('win', 'lose'));
      const you = d6(), cpu = d6();
      // The Dealer's die settles a beat later for a little suspense.
      await Promise.all([tumble(dieYou, you, 14), tumble(dieCpu, cpu, 17)]);
      await sleep(350);
      if (you === cpu) {
        msg.textContent = `Both rolled ${you}. A tie - roll again!`;
        CRT.glitch();
        btns.innerHTML = '<button class="btn big" id="rollBtn">ROLL AGAIN</button>';
        $('#rollBtn').onclick = roll;
        return;
      }
      const youWon = you > cpu;
      $('#rollerYou').classList.add(youWon ? 'win' : 'lose');
      $('#rollerCpu').classList.add(youWon ? 'lose' : 'win');
      const done = (first) => resolve({ first, you, cpu });
      if (youWon) {
        sfx('heal');
        msg.textContent = 'You rolled high! Go first or second?';
        btns.innerHTML = '<button class="btn big" id="goFirst">GO FIRST</button><button class="btn big" id="goSecond">GO SECOND</button>';
        $('#goFirst').onclick = () => { sfx('select'); done(0); };
        $('#goSecond').onclick = () => { sfx('select'); done(1); };
      } else {
        sfx('err');
        msg.textContent = `${OppTitle()} rolled high...`;
        await sleep(900);
        // Tempo usually beats the skipped draw, so the Dealer nearly always takes the first turn.
        const cpuFirst = Math.random() < 0.85;
        msg.textContent = `${OppTitle()} chooses to go ${cpuFirst ? 'first' : 'second'}.`;
        await sleep(1400);
        done(cpuFirst ? 1 : 0);
      }
    };
    $('#rollBtn').onclick = roll;
  });
}

/* opts (Dealer's Run): { cpuDeck, life: [you, dealer], boss: rule key, run: true, foe: a RIVALS entry } */
async function startGame(deckDef, opts = {}) {
  const others = DECKS.filter((d) => d !== deckDef);
  const cpuDeck = opts.cpuDeck || others[Math.floor(Math.random() * others.length)];
  const r = opts.foe;
  foe = r ? { name: r.name, short: r.name.toLowerCase().replace(/(^|[\s.])\w/g, (m) => m.toUpperCase()), sprite: r.sprite } : null;
  Music.play('battle');
  const { first, you, cpu } = await rollForFirst();
  setSeats(0);
  runBattle = !!opts.run;
  const g = game = new Game(deckDef, cpuDeck, first, { life: opts.life, boss: opts.boss, cpuName: foe ? foe.short : undefined });
  g.log.unshift({ text: `You rolled ${you}, ${oppTitle()} rolled ${cpu}.`, who: '' });
  if (r && r.quip) g.log.unshift({ text: `${foe.short}: "${r.quip}"`, who: 'cpu' });
  tapState.clear();
  ended = false;
  busy = true;
  clearSel();
  hideScreen();
  $('#game').classList.remove('hidden');
  inspectDefault();
  game.startTurn();
  render();
  await banner(game.active === 0 ? 'YOU GO FIRST' : `${foe ? foe.name : 'THE DEALER'} GOES FIRST`);
  if (abandoned(g)) return;
  if (game.active === 1) await cpuTurn();
  else { busy = false; render(); }
}

/* True once a match was conceded or replaced, so in-flight async steps stop touching it. */
function abandoned(g) { return game !== g || g.over; }

function showConcede() {
  if (!game || ended || !$('#screen').classList.contains('hidden')) return;
  sfx('select');
  showScreen(`
    <div class="result panel">
      <div class="r-title">CONCEDE?</div>
      <div class="r-sub">${inRun() ? 'This ends your run.' : `You will lose this match and return to the ${online() ? 'online lobby' : 'main menu'}.`}</div>
      <div class="concede-btns">
        <button class="btn" id="concedeYes">CONCEDE</button>
        <button class="btn" id="concedeNo">KEEP PLAYING</button>
      </div>
    </div>`, true);
  $('#concedeYes').onclick = concede;
  $('#concedeNo').onclick = () => { sfx('select'); hideScreen(); };
}

function concede() {
  if (online()) return Net.concede();
  if (game && !ended) {
    game.concede(game.players[ME]);
    ended = true;
    busy = true;
    clearSel();
    sfx('lose');
  }
  Music.play('menu');
  $('#banner').classList.remove('show');
  $('#game').classList.add('hidden');
  if (inRun()) { runBattle = false; return Run.afterBattle(false, 0, 0); }
  showTitle();
}

/* The current game is a Dealer's Run battle. */
function inRun() { return runBattle && !online(); }

function endGame() {
  if (ended) return;
  ended = true;
  busy = true;
  render();
  const won = game.winner === ME;
  const run = inRun();
  if (!FAST && !run) { const rec = getRecord(); rec[won ? 'wins' : 'losses']++; Store.write(RECORD_KEY, rec); }
  sfx(won ? 'win' : 'lose');
  CRT.pulse(1.2, true);
  const g = game, you = g.players[ME], opp = g.players[OPP];
  const net = online() ? Net.result() : null; // also reports the result to the server
  const st = matchStats();
  const show = (dim) => {
    if (game !== g) return;
    Music.play('menu');
    showScreen(`
      <div class="result panel">
        <img class="r-art" src="${spriteURL(won ? 'hero' : oppSprite())}" alt="">
        <div class="r-title">${net ? net.title : won ? 'VICTORY' : 'DEFEAT'}</div>
        <div class="r-sub">${net ? escapeHTML(net.sub) : won ? (foe ? `${escapeHTML(foe.short)}'s life hit zero. One more of the Dealer's hands down.` : "The Dealer's life hit zero. You beat the house.") : 'Your life hit zero. The house wins this one.'}</div>
        <div class="r-stats">Turn ${g.turnNum} &middot; Your life ${Math.max(0, you.life)} &middot; ${escapeHTML(net ? Net.oppName : foe ? foe.short : 'Dealer')} ${Math.max(0, opp.life)}</div>
        <div class="r-tally">
          <div><span>DAMAGE DEALT</span><b>${st.dmg}</b></div>
          <div><span>CREATURES SUMMONED</span><b>${st.summons}</b></div>
          <div><span>BEST CHAIN</span><b>${st.bestChain}</b></div>
          <div class="r-score"><span>SCORE</span><b>${st.dmg * 100 + st.summons * 50 + st.bestChain * 200}</b></div>
        </div>
        <div class="concede-btns">${run ? '<button class="btn" id="runOnBtn">CONTINUE</button>' : `
          <button class="btn" id="againBtn">PLAY AGAIN</button>
          <button class="btn" id="menuBtn">MAIN MENU</button>`}
        </div>
      </div>`, dim);
    if (run) {
      $('#runOnBtn').onclick = () => { sfx('select'); runBattle = false; Run.afterBattle(won, you.life, opp.life); };
    } else {
      $('#againBtn').onclick = () => {
        sfx('select');
        if (net) { Net.leave(); Net.showOnline(); } else showDeckSelect();
      };
      $('#menuBtn').onclick = () => {
        sfx('select');
        if (net) Net.leave();
        $('#game').classList.add('hidden');
        showTitle();
      };
    }
    if (!FAST) {
      $('.result').animate([{ transform: 'translateY(-30px) scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 360, easing: 'steps(6)' });
      tallyUp($$('.r-tally b'));
    }
  };
  if (FAST || CRT.level === 'off') { setTimeout(() => show(true), FAST ? 0 : 1000); return; }

  // Bejeweled 2 style, win or lose: the table melts away to reveal the backdrop winding
  // into a vortex, and every card on the board and in hand is pulled round into its core.
  // Only a win gets the combo callout first.
  if (won) setTimeout(() => {
    if (game !== g) return;
    callout(calloutFor(Math.max(3, combo.game === g && combo.turn === g.turnNum ? combo.n : 0)));
    sfx('callout', 3);
  }, 300);
  setTimeout(async () => {
    if (game !== g) return;
    const cards = liftCards();
    const SPIN = 380, STAGGER = 90, LEAD = 250; // ms: per-card duration base, gap between cards, wait before the first
    const total = LEAD + SPIN * 4 + cards.length * STAGGER;
    sfx('warp');
    // The vortex winds up over 1.2s; hold it until the last card is in.
    const vortex = Backdrop.vortex(Math.max(1.2, total / 1000 - 1.0));
    const gameEl = $('#game');
    gameEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'steps(4)', fill: 'forwards' }).finished.then(() => {
      gameEl.classList.add('hidden');
      gameEl.getAnimations().forEach((a) => a.cancel());
    }).catch(() => {}); // cancelled by the fallback below
    cards.forEach((c, i) => suckIn(c, LEAD + i * STAGGER, SPIN * 4));
    await sleep(total);
    if (game !== g) return;
    CRT.pulse(0.8);
    await vortex;
    cards.forEach((c) => c.el.remove());
    gameEl.classList.add('hidden'); // in case the fade never got to finish (e.g. tab in background)
    gameEl.getAnimations().forEach((a) => a.cancel());
    show(false);
  }, 1500);
}

/* The vortex sits at the centre of the screen, which is the centre of the stage. */
const VORTEX = { x: 640, y: 360 };

/* Copy every card on the table and in hand into #fx at the same spot, so they
   outlive the game screen fading out. Nearest the core goes first. */
function liftCards() {
  return [...$$('#board .card, #hand .card')].map((c) => {
    const r = relRect(c), w = c.offsetWidth, h = c.offsetHeight;
    const x = r.x + r.w / 2, y = r.y + r.h / 2;
    const el = c.cloneNode(true);
    el.classList.remove('tilting', 'selected', 'playable', 'ready', 'targetable', 'enter', 'unplayable');
    el.style.cssText = `position:absolute;left:${x - w / 2}px;top:${y - h / 2}px;margin:0;z-index:2;pointer-events:none`;
    $('#fx').appendChild(el);
    return { el, x, y, d: Math.hypot(x - VORTEX.x, y - VORTEX.y) };
  }).sort((a, b) => a.d - b.d);
}

/* Orbit a lifted card clockwise (the way the vortex turns), tightening into the core. */
function suckIn(c, delay, duration) {
  const a0 = Math.atan2(c.y - VORTEX.y, c.x - VORTEX.x), N = 36, keys = [];
  for (let s = 0; s <= N; s++) {
    const p = s / N;
    const a = a0 + Math.PI * 2.4 * p ** 1.6;
    const r = c.d * (1 - p) ** 1.3;
    const dx = VORTEX.x + Math.cos(a) * r - c.x, dy = VORTEX.y + Math.sin(a) * r - c.y;
    keys.push({
      transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${((a - a0) * 180 / Math.PI).toFixed(1)}deg) scale(${(1 - 0.88 * p).toFixed(3)})`,
      opacity: p > 0.95 ? 0 : 1,
    });
  }
  c.el.animate(keys, { duration, delay, easing: `steps(${N})`, fill: 'both' }).finished
    .then(() => { sfx('tick'); CRT.pulse(0.12); })
    .catch(() => {});
}

/* Results count up one row at a time, Mario-time-bonus style. Click to skip. */
function tallyUp(els) {
  const goals = [...els].map((e) => +e.textContent);
  els.forEach((e) => (e.textContent = '0'));
  let row = 0, timer = null, skip = false;
  const finish = () => { skip = true; clearInterval(timer); els.forEach((e, i) => (e.textContent = goals[i])); };
  $('.result').addEventListener('click', finish, { once: true });
  const next = () => {
    if (skip || row >= els.length) return;
    const el = els[row], goal = goals[row], stepBy = Math.max(1, Math.ceil(goal / 20));
    let v = 0;
    timer = setInterval(() => {
      v = Math.min(goal, v + stepBy);
      el.textContent = v;
      sfx('tick');
      if (v >= goal) { clearInterval(timer); sfx('tally'); row++; setTimeout(next, 220); }
    }, 40);
  };
  setTimeout(next, 500);
}

/* ---------- global input ---------- */
$('#bellImg').src = spriteURL('bell');
$('#bell').addEventListener('click', playerEndTurn);
$('#cpuPanel').addEventListener('click', onEnemyPanel);
$('#gearImg').src = iconURL('gear');
$('#gearBtn').addEventListener('click', () => {
  if (!game || ended || !$('#screen').classList.contains('hidden')) return;
  sfx('select');
  openOptions(true);
});
$('#concedeBtn').addEventListener('click', showConcede);
// Skips keys OPTIONS already used, e.g. the Enter that closed it must not also ring the bell.
document.addEventListener('keydown', (e) => {
  const inGame = !e.defaultPrevented && game && !$('#game').classList.contains('hidden') && $('#screen').classList.contains('hidden');
  if (!inGame) return;
  if (e.key === 'Escape') { clearSel(); render(); }
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); playerEndTurn(); }
});
stage.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (game) { clearSel(); render(); }
});
$('#board').addEventListener('mouseleave', () => { if (game && !busy) inspectDefault(); });

/* Live sync with another tab on the same address (or a cloud pull). */
onSharedChange((key) => {
  if (key === HERO_KEY) {
    if (game) render();
    if ($('.ttl')) showTitle(); // new portrait and name on the pedestal
    toast('Character updated.');
    return;
  }
  const s = $('#screen');
  if (!s.classList.contains('hidden')) {
    if (s.querySelector('.db')) refreshDeckBuilder();
    else if (s.querySelector('.ds')) showDeckSelect();
  }
  if (key !== DECKS_KEY) toast(`Synced ${customIds.length} custom card${customIds.length === 1 ? '' : 's'}.`);
});

CRT.init();
showTitle();
// The old cardmaker.html / charmaker.html addresses redirect here with a hash.
if (location.hash === '#cardmaker') CardMaker.show();
else if (location.hash === '#character') CharMaker.show();
if (location.hash) history.replaceState(null, '', location.pathname + location.search);
