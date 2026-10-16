'use strict';
/* ============================================================
   BRIMSTONE SLINGSHOT — online accounts & sync (Supabase)
   localStorage stays the working copy (instant, works offline);
   when logged in, every save is pushed to the server and the
   server copy is pulled on page load. Talks to Supabase's REST
   API with plain fetch, so there is no client library to load.
   Schema and server-side checks: db/schema.sql
   ============================================================ */

const Cloud = (() => {
  const SESSION_KEY = 'cardgrave.session.v1';
  const SNAP_KEY = 'cardgrave.cloudSnap.v1'; // what the server has: { playerId, cards:{id:stamp}, decks:{id:stamp}, hero }
  const PAGE = 24;
  const cfg = typeof CLOUD_CONFIG !== 'undefined' ? CLOUD_CONFIG : {};
  const enabled = !!(cfg.url && cfg.anonKey);
  const base = enabled ? cfg.url.replace(/\/+$/, '') + '/rest/v1' : '';

  const ERRORS = {
    bad_username: 'Usernames are 3-12 letters, numbers or _.',
    bad_pin: 'The PIN must be exactly 4 digits.',
    username_taken: 'That username is taken.',
    bad_login: 'Wrong username or PIN.',
    locked: 'Too many wrong PINs. Try again in 15 minutes.',
    too_many_cards: 'Card limit reached (200).',
    too_many_decks: 'Deck limit reached (50).',
    not_logged_in: 'Your session expired. Please log in again.',
  };
  const errText = (e) => ERRORS[e && e.message] || 'Could not reach the server.';

  let status = enabled ? 'guest' : 'off';
  let lastError = '';
  const listeners = [];
  function setStatus(s, err = '') { status = s; lastError = err; listeners.forEach((cb) => cb(s)); }

  /* ---------- HTTP ---------- */
  function headers() { return { apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey, 'Content-Type': 'application/json' }; }

  async function rpc(name, args) {
    const r = await fetch(`${base}/rpc/${name}`, { method: 'POST', headers: headers(), body: JSON.stringify(args) });
    const body = await r.json().catch(() => null);
    if (!r.ok) throw new Error((body && body.message) || 'http_' + r.status);
    if (body && body.error) throw new Error(body.error);
    return body;
  }

  async function get(path) {
    const r = await fetch(`${base}/${path}`, { headers: headers() });
    if (!r.ok) throw new Error('http_' + r.status);
    return r.json();
  }

  /* ---------- session & snapshot ---------- */
  function session() { const s = Store.read(SESSION_KEY, null); return s && s.token && s.player ? s : null; }
  function readSnap() { return { playerId: null, cards: {}, decks: {}, hero: 'null', ...Store.read(SNAP_KEY, {}) }; }
  function writeSnap(s) { Store.write(SNAP_KEY, s); }
  function forget(key) { try { localStorage.removeItem(key); } catch (e) { /* storage blocked */ } }

  const stamp = (r) => String(r.updated || 0);
  const hasArt = (pixels) => Array.isArray(pixels) && pixels.some((r) => /[#+\-w]/.test(r));
  function portraitOf(hero) {
    if (!hero || !hasArt(hero.pixels)) return null;
    return Array.from({ length: 16 }, (_, y) => String(hero.pixels[y] || '').replace(/[^.#+\-w]/g, '.').padEnd(16, '.').slice(0, 16));
  }

  /* Tell this page that the local data changed (same path as a change from another tab). */
  function announce() {
    try { window.dispatchEvent(new StorageEvent('storage', { key: null })); } catch (e) { /* old browser */ }
  }

  /* ---------- server -> local ---------- */
  async function fetchMine(pid) {
    const deckPath = (cols) => `decks?owner_id=eq.${pid}&select=${cols}&order=id.asc`;
    const [cards, decks, me] = await Promise.all([
      get(`cards?owner_id=eq.${pid}&select=id,data&order=id.asc`),
      // Servers set up before deck art have no `art` column yet.
      get(deckPath('id,name,list,art,updated_at')).catch(() => get(deckPath('id,name,list,updated_at'))),
      get(`players?id=eq.${pid}&select=username,portrait`),
    ]);
    if (!me.length) throw new Error('not_logged_in');
    return {
      username: me[0].username,
      portrait: me[0].portrait,
      cards: cards.map((r) => ({ ...r.data, id: r.id })),
      decks: decks.map((r) => ({ id: r.id, name: r.name, list: r.list, ...(r.art ? { art: r.art } : {}), updated: Date.parse(r.updated_at) })),
    };
  }

  function snapOf(pid, server) {
    return {
      playerId: pid,
      cards: Object.fromEntries(server.cards.map((c) => [c.id, stamp(c)])),
      decks: Object.fromEntries(server.decks.map((d) => [d.id, stamp(d)])),
      hero: JSON.stringify(server.portrait || null),
    };
  }

  /* Overwrite local storage with the server copy (written directly, so it isn't re-queued for upload). */
  function writeLocal(server, username) {
    Store.write(CUSTOM_KEY, server.cards);
    Store.write(DECKS_KEY, server.decks);
    Store.write(HERO_KEY, { name: username, pixels: server.portrait || Array(16).fill('.'.repeat(16)), updated: Date.now() });
    loadCustomCards();
    loadHero();
  }

  /* Page load: push anything unsent, then pull edits made on other devices. */
  async function pull() {
    const s = session();
    if (!s) return;
    await syncNow();
    if (status === 'error') return;
    try {
      const server = await fetchMine(s.player.id);
      const fresh = snapOf(s.player.id, server);
      if (JSON.stringify(fresh) === JSON.stringify(readSnap()) && heroName() === server.username) return;
      writeLocal(server, server.username);
      writeSnap(fresh);
      announce();
    } catch (e) { failed(e); }
  }

  /* ---------- local -> server ---------- */
  let timer = null, running = false, again = false;

  function queue() {
    if (!enabled || !session()) return;
    setStatus('syncing');
    clearTimeout(timer);
    timer = setTimeout(syncNow, 800);
  }

  /* A card id already belongs to another player: give ours a fresh id and fix our decks. */
  function renameCard(oldId) {
    const id = newCustomId();
    Store.write(CUSTOM_KEY, getCustomRecords().map((c) => (c.id === oldId ? { ...c, id } : c)));
    Store.write(DECKS_KEY, getSavedDecks().map((d) => {
      const art = d.art === 'spr_' + oldId ? 'spr_' + id : d.art;
      if (!d.list[oldId] && art === d.art) return d;
      const list = { ...d.list };
      if (list[oldId]) { list[id] = list[oldId]; delete list[oldId]; }
      return { ...d, list, ...(art ? { art } : {}), updated: Date.now() };
    }));
    loadCustomCards();
    announce();
  }

  async function syncNow() {
    clearTimeout(timer);
    const s = session();
    if (!enabled || !s) return;
    if (running) { again = true; return; }
    running = true;
    setStatus('syncing');
    const tok = s.token;
    try {
      const snap = readSnap();
      snap.playerId = s.player.id;

      const cards = getCustomRecords();
      for (const c of cards) {
        if (snap.cards[c.id] === stamp(c)) continue;
        try {
          await rpc('upsert_card', { p_token: tok, p_id: c.id, p_data: c });
        } catch (e) {
          if (e.message !== 'id_taken') throw e;
          renameCard(c.id);
          again = true;
          continue;
        }
        snap.cards[c.id] = stamp(c);
        writeSnap(snap);
      }
      for (const id of Object.keys(snap.cards)) {
        if (cards.some((c) => c.id === id)) continue;
        await rpc('delete_card', { p_token: tok, p_id: id });
        delete snap.cards[id];
        writeSnap(snap);
      }

      const decks = getSavedDecks();
      for (const d of decks) {
        if (snap.decks[d.id] === stamp(d)) continue;
        const name = String(d.name || '').trim().slice(0, 24) || 'My Deck';
        try {
          const args = { p_token: tok, p_id: d.id, p_name: name, p_list: d.list };
          if (d.art) args.p_art = d.art; // left out when unset, so older servers still accept art-less decks
          await rpc('upsert_deck', args);
        } catch (e) {
          if (e.message !== 'id_taken') throw e;
          // Practically impossible (ids are time-based), but don't get stuck on it.
          const id = 'd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          Store.write(DECKS_KEY, getSavedDecks().map((x) => (x.id === d.id ? { ...x, id } : x)));
          announce();
          again = true;
          continue;
        }
        snap.decks[d.id] = stamp(d);
        writeSnap(snap);
      }
      for (const id of Object.keys(snap.decks)) {
        if (decks.some((d) => d.id === id)) continue;
        await rpc('delete_deck', { p_token: tok, p_id: id });
        delete snap.decks[id];
        writeSnap(snap);
      }

      const portrait = portraitOf(getHeroRecord());
      if (JSON.stringify(portrait) !== snap.hero) {
        await rpc('save_profile', { p_token: tok, p_portrait: portrait });
        snap.hero = JSON.stringify(portrait);
        writeSnap(snap);
      }
      setStatus('synced');
    } catch (e) {
      failed(e);
    } finally {
      running = false;
      if (again) { again = false; queue(); }
    }
  }

  function failed(e) {
    // Expired session: keep the local data as guest data, so logging back in offers to upload it.
    if (e && e.message === 'not_logged_in') { forget(SESSION_KEY); forget(SNAP_KEY); setStatus('guest', errText(e)); return; }
    setStatus('error', errText(e));
  }

  /* ---------- accounts ---------- */
  async function signIn(mode, username, pin) {
    const res = await rpc(mode === 'register' ? 'register' : 'login', { p_username: username, p_pin: pin });
    const pid = res.player.id;
    const server = await fetchMine(pid);

    // Anything made here as a guest can be carried into the account.
    const local = { cards: getCustomRecords(), decks: getSavedDecks(), hero: getHeroRecord() };
    const hasLocal = local.cards.length || local.decks.length || (local.hero && hasArt(local.hero.pixels));
    const upload = hasLocal && readSnap().playerId !== pid &&
      confirm(`Add the cards, decks and character saved in this browser to ${res.player.username}'s account?`);

    Store.write(SESSION_KEY, { token: res.token, player: { id: pid, username: res.player.username } });
    writeSnap(snapOf(pid, server));
    if (upload) {
      const merge = (mine, theirs) => [...theirs.filter((x) => !mine.some((m) => m.id === x.id)), ...mine];
      const portrait = portraitOf(local.hero) || server.portrait;
      writeLocal({ cards: merge(local.cards, server.cards), decks: merge(local.decks, server.decks), portrait }, res.player.username);
      await syncNow();
    } else {
      writeLocal(server, res.player.username);
      setStatus('synced');
    }
    return res.player;
  }

  function clearAccount() {
    forget(SESSION_KEY);
    forget(SNAP_KEY);
    Store.write(CUSTOM_KEY, []);
    Store.write(DECKS_KEY, []);
    forget(HERO_KEY);
    loadCustomCards();
    loadHero();
  }

  async function signOut() {
    const s = session();
    if (!s) return;
    await syncNow();
    if (status === 'error' && !confirm('Some changes have not reached the server yet and will be lost. Log out anyway?')) return;
    try { await rpc('logout', { p_token: s.token }); } catch (e) { /* session is dropped locally either way */ }
    clearAccount();
    location.reload();
  }

  /* ---------- community ---------- */
  async function browseCards({ page = 0, search = '' } = {}) {
    let q = `cards?select=id,data,updated_at,players(username)&order=updated_at.desc&limit=${PAGE + 1}&offset=${page * PAGE}`;
    const term = String(search).replace(/[*,()"\\]/g, '').trim();
    if (term) q += `&data->>name=ilike.*${encodeURIComponent(term)}*`;
    const rows = await get(q);
    return {
      more: rows.length > PAGE,
      cards: rows.slice(0, PAGE).map((r) => ({ ...r.data, id: r.id, author: r.players ? r.players.username : '?' })),
    };
  }

  /* ---------- account widget + login dialog ---------- */
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
  const mounts = [];

  function renderMount(el) {
    const s = session();
    if (!s) {
      el.innerHTML = `<div class="acct"><span>${lastError ? esc(lastError) : 'PLAYING AS GUEST'}</span>
        <button class="btn sm" data-a="login">LOG IN / SIGN UP</button></div>`;
    } else {
      const label = { syncing: 'SAVING...', synced: 'SAVED ONLINE', error: esc(lastError || 'OFFLINE') }[status] || '';
      el.innerHTML = `<div class="acct ${status}"><b>${esc(s.player.username)}</b><span class="acct-state">${label}</span>
        ${status === 'error' ? '<button class="btn sm" data-a="retry">RETRY</button>' : ''}
        <button class="btn sm" data-a="logout">LOG OUT</button></div>`;
    }
    el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => {
      if (b.dataset.a === 'login') openDialog();
      else if (b.dataset.a === 'retry') syncNow();
      else signOut();
    }));
  }

  function mount(el) {
    if (!enabled || !el) return;
    mounts.push(el);
    renderMount(el);
  }
  listeners.push(() => mounts.filter((el) => el.isConnected).forEach(renderMount));

  function openDialog() {
    const wrap = document.createElement('div');
    wrap.className = 'acct-modal';
    wrap.innerHTML = `<form class="acct-box panel" autocomplete="off">
      <h2>ACCOUNT</h2>
      <label>USERNAME<input class="db-input" name="u" maxlength="12" spellcheck="false" autocapitalize="off" required></label>
      <label>4-DIGIT PIN<input class="db-input" name="p" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required></label>
      <div class="muted acct-note">Your cards, decks and character are saved to this account and are visible to other players. Don't reuse a PIN you use anywhere else.</div>
      <div class="acct-err" role="alert"></div>
      <div class="acct-btns">
        <button type="button" class="btn sm" data-a="cancel">CANCEL</button>
        <button type="button" class="btn sm" data-a="register">SIGN UP</button>
        <button type="submit" class="btn sm accent">LOG IN</button>
      </div></form>`;
    document.body.appendChild(wrap);
    const form = wrap.querySelector('form');
    const err = wrap.querySelector('.acct-err');
    const close = () => wrap.remove();
    wrap.querySelector('[data-a="cancel"]').onclick = close;
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
    wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    form.u.focus();
    form.addEventListener('submit', (e) => { e.preventDefault(); go('login'); });
    wrap.querySelector('[data-a="register"]').onclick = () => go('register');
    async function go(mode) {
      const u = form.u.value.trim(), p = form.p.value.trim();
      if (!/^[A-Za-z0-9_]{3,12}$/.test(u)) { err.textContent = ERRORS.bad_username; return; }
      if (!/^\d{4}$/.test(p)) { err.textContent = ERRORS.bad_pin; return; }
      form.querySelectorAll('button').forEach((b) => (b.disabled = true));
      err.textContent = mode === 'register' ? 'Creating account...' : 'Logging in...';
      try {
        await signIn(mode, u, p);
        location.reload();
      } catch (ex) {
        err.textContent = errText(ex);
        form.querySelectorAll('button').forEach((b) => (b.disabled = false));
      }
    }
  }

  /* Another tab logged in or out: follow it. */
  if (enabled) window.addEventListener('storage', (e) => { if (e.key === SESSION_KEY) location.reload(); });

  if (enabled && session()) { setStatus('synced'); pull(); }

  /* ---------- game library (official cards from the server, for everyone) ---------- */
  async function pullLibrary() {
    let list;
    try {
      list = (await get('library_cards?select=data&order=created_at.asc')).map((r) => r.data);
    } catch (e) { return; } // offline, or db/library.sql not run yet: keep the cached copy
    if (JSON.stringify(list) === JSON.stringify(Store.read(LIBRARY_KEY, []))) return;
    Store.write(LIBRARY_KEY, list);
    announce();
  }

  async function addToLibrary(id, data) {
    const s = session();
    if (!s) throw new Error('not_logged_in');
    await rpc('add_to_library', { p_token: s.token, p_id: id, p_data: data });
    await pullLibrary();
  }

  if (enabled) pullLibrary();

  return {
    enabled,
    queue, syncNow, browseCards, mount, addToLibrary,
    rpc, get, // used by js/netplay.js
    user() { const s = session(); return s ? s.player.username : null; },
    playerId() { const s = session(); return s ? s.player.id : null; },
    token() { const s = session(); return s ? s.token : null; },
  };
})();
