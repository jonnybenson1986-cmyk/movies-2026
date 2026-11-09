/* Saves each signed-in person's My List, Continue Watching and video progress to their account, so they
   follow the person from phone to tablet. It watches the app's saved lists, then:
     - on start, and whenever the app comes back to the screen, it pulls the account's data and merges it
     - a couple of seconds after a change, and when the page is hidden, it pushes the change
   Without an account system (running locally, or another host) /api/me isn't there and this does nothing. */
(() => {
  'use strict';
  const FIELDS = { 'sb:mylist': 'mylist', 'sb:history': 'history', 'sb:progress': 'progress' };
  const META = 'sb:acct-meta';   // who this device's lists belong to, and when each list last changed
  const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
  const rawSet = Storage.prototype.setItem;

  let applying = false, enabled = null, user = '', timer = 0, ready = Promise.resolve();
  const dirty = new Set();

  const meta = () => Object.assign({ user: '', mylistAt: 0, historyAt: 0 }, read(META) || {});
  const writeRaw = (key, value) => { applying = true; try { rawSet.call(localStorage, key, JSON.stringify(value)); } catch { /* storage full */ } finally { applying = false; } };
  const saveMeta = m => writeRaw(META, m);

  // Notice every write the app makes to the saved lists
  Storage.prototype.setItem = function (key, value) {
    rawSet.call(this, key, value);
    if (this !== localStorage || applying || !FIELDS[key]) return;
    const field = FIELDS[key];
    if (field !== 'progress') { const m = meta(); m[field + 'At'] = Date.now(); saveMeta(m); }
    dirty.add(field);
    schedule();
  };

  async function put(body, keepalive = false) {
    try {
      const payload = JSON.stringify(body);
      const res = await fetch('/api/me', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: payload, keepalive: keepalive && payload.length < 60000 });
      if (res.status === 401) enabled = false;   // signed out: the app will ask for the sign-in again
      return res.ok;
    } catch { return false; }
  }

  function pending() {
    const m = meta(), body = {};
    for (const field of dirty) {
      body[field] = field === 'progress' ? (read('sb:progress') || {}) : { at: m[field + 'At'] || Date.now(), items: read('sb:' + field) || [] };
    }
    return body;
  }
  async function flush(keepalive = false) {
    clearTimeout(timer);
    if (enabled !== true || !dirty.size) return;
    const body = pending();
    dirty.clear();
    if (!(await put(body, keepalive))) for (const field of Object.keys(body)) dirty.add(field);   // try again next time
  }
  function schedule() { clearTimeout(timer); if (enabled !== false) timer = setTimeout(() => flush(), 2500); }

  const union = (first, second) => { const seen = new Set(first.map(i => i.key)); return [...first, ...second.filter(i => i && !seen.has(i.key))]; };

  async function sync() {
    let res;
    try { res = await fetch('/api/me', { cache: 'no-store' }); } catch { return; }
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) { if (enabled === null) enabled = false; return; }
    const { user: name, data } = await res.json();
    user = name; enabled = true;

    let m = meta();
    // A different person on this device: their lists replace the previous person's
    if (m.user && m.user !== name) {
      for (const key of Object.keys(FIELDS)) localStorage.removeItem(key);
      m = { user: '', mylistAt: 0, historyAt: 0 };
    }
    const firstUse = !m.user;
    m.user = name;

    const out = {};
    let changed = false;
    for (const field of ['mylist', 'history']) {
      const server = data?.[field] || { at: 0, items: [] };
      const local = Array.isArray(read('sb:' + field)) ? read('sb:' + field) : [];
      if (firstUse && local.length && server.items.length) {
        // First sign-in on a device that already has lists: keep both
        const merged = union(server.items, local);
        writeRaw('sb:' + field, merged); m[field + 'At'] = Date.now();
        out[field] = { at: m[field + 'At'], items: merged }; changed = true;
        continue;
      }
      const localAt = m[field + 'At'] || (firstUse && local.length ? Date.now() : 0);
      if (server.at > localAt) { writeRaw('sb:' + field, server.items || []); m[field + 'At'] = server.at; changed = true; }
      else if (localAt > server.at) { m[field + 'At'] = localAt; out[field] = { at: localAt, items: local }; }
    }

    // Progress: for each video, the most recent position wins
    const local = read('sb:progress') || {}, remote = data?.progress || {};
    const merged = { ...remote };
    let adopt = false, push = false;
    for (const [key, v] of Object.entries(local)) if (!remote[key] || v.at > remote[key].at) { merged[key] = v; push = true; }
    for (const [key, v] of Object.entries(remote)) if (!local[key] || v.at > local[key].at) adopt = true;
    if (adopt) { writeRaw('sb:progress', merged); changed = true; }
    if (push) out.progress = merged;

    saveMeta(m);
    if (Object.keys(out).length) await put(out);
    if (changed) window.dispatchEvent(new CustomEvent('streambox-account-synced'));
  }

  const run = () => { ready = sync().catch(() => {}); return ready; };
  run();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); else flush(true); });
  addEventListener('pagehide', () => flush(true));

  window.StreamBoxAccount = {
    get user() { return user; },
    get enabled() { return enabled === true; },
    get ready() { return ready; },
    sync: run,
    flush: () => flush(),
  };
})();
