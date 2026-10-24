#!/usr/bin/env node
'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — Dealer's Run simulator (Node, no browser)
   Plays thousands of whole runs with the game's own data.js, engine.js,
   ai.js and run.js, and reports how often each starting deck beats the
   Dealer. The simulated player lives in tools/runsim-player.js.

   node tools/runsim.js                          5,000 runs of every deck
   node tools/runsim.js --runs 20000             tighter numbers (about ±0.7%)
   node tools/runsim.js --deck "Crypt Arcana"    one deck (repeat or comma-separate for more)
   node tools/runsim.js --set BOSS_COST_CAP=5    try a different value for any top-level const
   node tools/runsim.js --set "DEALER_LIFE=[0, 6, 6, 10, 10, 12]"

   node tools/runsim.js --matchups               quick matches instead: every starter deck against
                                                 every other, --runs games per pairing

   Other options: --seed N, --workers N, --json (raw counts),
   --path random|avoid (avoid = dodge battles when another stop is reachable),
   --lands fixed|ratio (ratio = add lands to keep the starting 9:11 mix).
   ============================================================ */
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const { fork } = require('child_process');

const GAME_DIR = path.join(__dirname, '..', 'js');
const GAME_FILES = ['data.js', 'engine.js', 'ai.js', 'run.js'];
const PLAYER = path.join(__dirname, 'runsim-player.js');

/* The browser-only helpers run.js touches, as no-ops. Any element is a stand-in that swallows everything. */
const STUBS = `
  const Store = { read: (k, d) => d, write() {} };
  const anyEl = new Proxy(function () {}, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : anyEl),
    set: () => true, apply: () => anyEl,
  });
  const $ = () => anyEl, $$ = () => [];
  const sfx = () => {}, toast = () => {}, showScreen = () => {}, showTitle = () => {}, showOfflineMenu = () => {}, tallyUp = () => {};
  const escapeHTML = (s) => String(s), ico = () => '', spriteURL = () => '', iconURL = () => '', cardInnerHTML = () => '', heroName = () => 'You';
  const CRT = { pulse() {}, glitch() {} }, RunMap = { show() {}, wipe: (then) => then(), cleared: () => Promise.resolve() }, Palette = { cur: {} };
  // options.js's dev-only switches, off: a sim starts at ante 1 and walks the map normally.
  const isDev = () => false, startAnte = () => 1, skipBeacon = () => false;
  let FAST = true;
`;

/* Game randomness is Math.random, so seeding it makes a whole batch repeatable. */
const seeded = (seed) => `Math.random = (() => { let a = ${seed >>> 0}; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();`;

/* The game plus the simulated player in one fresh context. `sets` replaces top-level consts: { NAME: 'source' }. */
function loadGame(seed, sets = {}, policy = {}) {
  let game = GAME_FILES.map((f) => fs.readFileSync(path.join(GAME_DIR, f), 'utf8')).join('\n;\n');
  for (const [name, val] of Object.entries(sets)) {
    const re = new RegExp(`const ${name} = [^;]*;`);
    if (!/^[A-Za-z_$][\w$]*$/.test(name) || !re.test(game)) throw new Error(`--set: no top-level "const ${name} = ...;" in ${GAME_FILES.join(', ')}`);
    game = game.replace(re, () => `const ${name} = ${val};`);
  }
  const ctx = vm.createContext({ console, POLICY: policy });
  const src = `'use strict';\n${seeded(seed)}\n${STUBS}\n;\n${game}\n;\n${fs.readFileSync(PLAYER, 'utf8')}`;
  vm.runInContext(src, ctx, { filename: 'runsim-bundle.js' });
  return ctx;
}

/* ---------- worker: play one batch, send back the counts ---------- */
if (process.argv[2] === '--worker') {
  process.once('message', (job) => {
    const ctx = loadGame(job.seed, job.sets, job.policy);
    const stat = job.vs != null ? ctx.SIM.match(job.deck, job.vs, job.runs) : ctx.SIM.simulate(job.deck, job.runs);
    process.send(JSON.parse(JSON.stringify(stat)), () => process.exit(0));
  });
  return;
}

/* ---------- command line ---------- */
function parseArgs(argv) {
  const o = { runs: 5000, seed: 1, workers: os.cpus().length, decks: [], sets: {}, path: 'random', lands: 'fixed', json: false, matchups: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], val = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--runs') o.runs = +val();
    else if (a === '--seed') o.seed = +val();
    else if (a === '--workers') o.workers = +val();
    else if (a === '--deck') o.decks.push(...val().split(',').map((s) => s.trim()).filter(Boolean));
    else if (a === '--set') {
      const v = val(), eq = v.indexOf('=');
      if (eq < 1) throw new Error(`--set wants NAME=value, got "${v}"`);
      o.sets[v.slice(0, eq).trim()] = v.slice(eq + 1).trim();
    } else if (a === '--path') o.path = val();
    else if (a === '--lands') o.lands = val();
    else if (a === '--json') o.json = true;
    else if (a === '--matchups') o.matchups = true;
    else if (a === '--help' || a === '-h') {
      const src = fs.readFileSync(__filename, 'utf8');
      console.log(src.slice(src.indexOf('/*'), src.indexOf('*/') + 2));
      process.exit(0);
    }
    else throw new Error(`Unknown option ${a} (try --help)`);
  }
  if (!(o.runs > 0) || !(o.workers > 0)) throw new Error('--runs and --workers must be positive numbers');
  if (!['random', 'avoid'].includes(o.path)) throw new Error('--path is random or avoid');
  if (!['fixed', 'ratio'].includes(o.lands)) throw new Error('--lands is fixed or ratio');
  return o;
}

function runJob(job) {
  return new Promise((ok, bad) => {
    const w = fork(__filename, ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    let got = null;
    w.once('message', (m) => (got = m));
    w.once('error', bad);
    w.once('exit', (code) => (got ? ok(got) : bad(new Error(`worker for deck ${job.deck} exited with code ${code}`))));
    w.send(job);
  });
}

/* Add one batch's counts into the deck's running total (numbers add, objects merge). */
function merge(into, from) {
  for (const [k, v] of Object.entries(from)) {
    if (typeof v === 'number') into[k] = (into[k] || 0) + v;
    else if (v && typeof v === 'object') merge((into[k] = into[k] || {}), v);
    else into[k] = v;
  }
  return into;
}

/* ---------- report ---------- */
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');
function wilson(k, n) {
  const z = 1.96, p = k / n, d = 1 + (z * z) / n, c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return `${(100 * (c - h)).toFixed(1)}-${(100 * (c + h)).toFixed(1)}%`;
}
const table = (rows) => {
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
  return rows.map((r) => r.map((c, i) => (i ? String(c).padStart(w[i]) : String(c).padEnd(w[i]))).join('  ')).join('\n');
};
/* 'row1', 'row3', ... in map order, then 'boss'. */
const stageKeys = (stats) => [...new Set(stats.flatMap((s) => Object.keys(s.battles)))]
  .sort((a, b) => (a === 'boss') - (b === 'boss') || parseInt(a.slice(3), 10) - parseInt(b.slice(3), 10));

function report(o, stats, secs, unmodeled) {
  const keys = stageKeys(stats);
  const label = (k) => (k === 'boss' ? 'boss' : k.replace('row', 'row '));
  console.log(`\nDEALER'S RUN SIM  ${o.runs.toLocaleString('en-US')} runs per deck, seed ${o.seed}, ${secs.toFixed(1)}s`);
  console.log(`player: the game's AI in battles, ${o.path === 'avoid' ? 'dodges battles when it can' : 'random path'}, ` +
    `${o.lands === 'ratio' ? 'adds lands as the deck grows' : 'keeps its lands'} (tools/runsim-player.js)`);
  if (Object.keys(o.sets).length) console.log(`overrides: ${Object.entries(o.sets).map(([k, v]) => `${k} = ${v}`).join(', ')}`);

  console.log('\n' + table([
    ['DECK', 'CLEARS', '95% RANGE', 'REACH BOSS', ...keys.map((k) => `WIN ${label(k).toUpperCase()}`)],
    ...stats.map((s) => [s.deck, pct(s.wins, s.runs), wilson(s.wins, s.runs), pct(s.battles.boss ? s.battles.boss.met : 0, s.runs),
      ...keys.map((k) => (s.battles[k] ? pct(s.battles[k].won, s.battles[k].met) : '-'))]),
  ]));

  console.log('\nWHERE RUNS END (% of runs)\n' + table([
    ['DECK', ...keys.map((k) => `LOST ${label(k).toUpperCase()}`), 'CLEARED'],
    ...stats.map((s) => [s.deck, ...keys.map((k) => pct(s.diedAt[k] || 0, s.runs)), pct(s.wins, s.runs)]),
  ]));

  const rules = [...new Set(stats.flatMap((s) => Object.keys(s.bossRules)))];
  console.log('\nBOSS WIN RATE BY RULE (when reached)\n' + table([
    ['DECK', ...rules.map((r) => r.toUpperCase())],
    ...stats.map((s) => [s.deck, ...rules.map((r) => (s.bossRules[r] ? `${pct(s.bossRules[r].won, s.bossRules[r].met)} (${s.bossRules[r].met})` : '-'))]),
  ]));

  const skipped = [...new Set([...unmodeled.events, ...stats.flatMap((s) => Object.keys(s.unmodeled))])];
  if (skipped.length) console.log(`\n! The sim walks past these ? events because it has no plan for them yet: ${skipped.join(', ')}.\n  Add one to EVENTS in tools/runsim-player.js.`);
  if (unmodeled.stops.length) console.log(`\n! The sim skips these stop types because it has no plan for them: ${unmodeled.stops.join(', ')}.`);
}

/* --matchups: a grid of each deck's win rate against each other one, then its average over the others. */
function reportMatchups(o, names, decks, res, secs) {
  const per = Object.values(res)[0].games;
  console.log(`\nQUICK MATCH SIM  ${per.toLocaleString('en-US')} games per pairing, each deck first in half, seed ${o.seed}, ${secs.toFixed(1)}s`);
  if (Object.keys(o.sets).length) console.log(`overrides: ${Object.entries(o.sets).map(([k, v]) => `${k} = ${v}`).join(', ')}`);
  const rate = (a, b) => {
    const r = res[`${a}v${b}`], back = res[`${b}v${a}`];
    if (r) return [r.wins, r.wins + r.losses];
    if (back) return [back.losses, back.wins + back.losses];
    return null;
  };
  console.log('\nROW DECK\'S WIN RATE AGAINST THE COLUMN DECK\n' + table([
    ['DECK', ...decks.map((d) => names[d].toUpperCase()), 'AVERAGE'],
    ...decks.map((a) => {
      const cells = decks.map((b) => (a === b ? null : rate(a, b)));
      const won = cells.reduce((n, c) => n + (c ? c[0] : 0), 0), played = cells.reduce((n, c) => n + (c ? c[1] : 0), 0);
      return [names[a], ...cells.map((c) => (c ? pct(c[0], c[1]) : '-')), pct(won, played)];
    }),
  ]));
  const all = Object.values(res), games = all.reduce((n, r) => n + r.wins + r.losses, 0);
  const stale = all.reduce((n, r) => n + r.games - r.wins - r.losses, 0);
  console.log(`\nThe deck going first won ${pct(all.reduce((n, r) => n + r.firstWins, 0), games)} of games.` +
    (stale ? ` ${stale} games hit the turn limit and count for neither deck.` : ''));
}

(async () => {
  const o = parseArgs(process.argv.slice(2));
  const probe = loadGame(o.seed, o.sets); // also checks --set before any worker starts
  const names = probe.SIM.deckNames();
  const decks = o.decks.length ? o.decks.map((q) => {
    const i = names.findIndex((n) => n.toLowerCase() === q.toLowerCase());
    if (i < 0) throw new Error(`No deck "${q}". Decks: ${names.join(', ')}`);
    return i;
  }) : names.map((_, i) => i);

  if (o.matchups) {
    const pairs = decks.flatMap((a, i) => decks.slice(i + 1).map((b) => [a, b]));
    if (!pairs.length) throw new Error('--matchups needs at least two decks');
    // Even game counts per batch, so each deck goes first in exactly half.
    const shards = Math.max(1, Math.round(o.workers / pairs.length)), per = Math.max(2, 2 * Math.round(o.runs / shards / 2));
    const jobs = pairs.flatMap(([a, b]) => Array.from({ length: shards }, (_, s) => ({
      deck: a, vs: b, runs: per, seed: (o.seed * 1000003 + a * 7919 + b * 15485863 + s * 104729) >>> 0, sets: o.sets, policy: {},
    })));
    const t0 = Date.now(), res = {};
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(o.workers, jobs.length) }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        merge((res[`${job.deck}v${job.vs}`] = res[`${job.deck}v${job.vs}`] || {}), await runJob(job));
      }
    }));
    if (o.json) return console.log(JSON.stringify(res, null, 2));
    return reportMatchups(o, names, decks, res, (Date.now() - t0) / 1000);
  }

  const shards = Math.max(1, Math.round(o.workers / decks.length));
  const jobs = decks.flatMap((deck) => Array.from({ length: shards }, (_, s) => ({
    deck, runs: Math.floor(o.runs / shards) + (s < o.runs % shards ? 1 : 0),
    seed: (o.seed * 1000003 + deck * 7919 + s * 104729) >>> 0, sets: o.sets, policy: { path: o.path, lands: o.lands },
  }))).filter((j) => j.runs > 0);

  const t0 = Date.now(), totals = {};
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(o.workers, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      merge((totals[job.deck] = totals[job.deck] || {}), await runJob(job));
    }
  }));
  const stats = decks.map((d) => ({ ...totals[d], deck: names[d] }));
  if (o.json) return console.log(JSON.stringify(stats, null, 2));
  report(o, stats, (Date.now() - t0) / 1000, probe.SIM.unmodeled());
})().catch((e) => { console.error(e.message); process.exit(1); });
