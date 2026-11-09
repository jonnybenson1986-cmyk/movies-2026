import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const { createHandler } = await import(new URL('../netlify/functions/me.mjs', import.meta.url));
const { cleanItem, cleanData, mergeData, LIMITS } = await import(new URL('../netlify/lib/account-data.mjs', import.meta.url));
// Made-up accounts (the real passwords are never stored in the repository)
globalThis.Netlify = { env: { get: key => (key === 'USERS' ? JSON.stringify({ eve: 'shared-pass', fay: 'shared-pass', cat: 'cat-pass-2' }) : undefined) } };
const accountCode = readFileSync(new URL('../public/js/account.js', import.meta.url), 'utf8');

const memoryStore = () => {
  const data = new Map();
  return { data, get: async key => (data.has(key) ? JSON.parse(data.get(key)) : null), setJSON: async (key, value) => { data.set(key, JSON.stringify(value)); } };
};
const cookie = (user, password) => `sb_gate=${encodeURIComponent(user + ':' + password)}; sb_gate_on=1`;
const BB = cookie('eve', 'shared-pass'), JB = cookie('fay', 'shared-pass'), SB = cookie('cat', 'cat-pass-2');
const call = (handler, method, headers, body) => handler(new Request('https://streambox.example/api/me', { method, headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }));
const live = (n, extra = {}) => ({ key: `l:${n}`, type: 'live', name: `Channel ${n}`, url: `https://example.com/${n}.m3u8`, ...extra });
const movie = (n, extra = {}) => ({ key: `m:${n}`, type: 'movie', name: `Movie ${n}`, id: String(n), year: '2025', ...extra });

// ------------------------------------------------------------------ the account API
test('nothing is readable or writable without signing in', async () => {
  const h = createHandler({ getStore: memoryStore });
  for (const method of ['GET', 'PUT']) {
    for (const headers of [{}, { cookie: 'sb_gate=eve%3Ashared-pass' }, { cookie: cookie('eve', 'wrong') }, { cookie: cookie('nobody', '1234') }]) {
      const res = await call(h, method, headers, method === 'PUT' ? {} : undefined);
      assert.equal(res.status, 401, `${method} ${headers.cookie}`);
    }
  }
});

test('a new person starts with empty lists', async () => {
  const body = await (await call(createHandler({ getStore: memoryStore }), 'GET', { cookie: BB })).json();
  assert.equal(body.user, 'eve');
  assert.deepEqual(body.data.mylist, { at: 0, items: [] });
  assert.deepEqual(body.data.progress, {});
});

test('what one person saves can be read back, on any device', async () => {
  const h = createHandler({ getStore: memoryStore.bind(null) });
  const store = memoryStore(); const handler = createHandler({ getStore: () => store });
  const put = await call(handler, 'PUT', { cookie: BB }, { mylist: { at: 1000, items: [live(1), movie(2)] }, progress: { 'pl:7': { t: 754, d: 6000, at: 2000 } } });
  assert.equal(put.status, 200);
  const got = await (await call(handler, 'GET', { cookie: BB })).json();
  assert.deepEqual(got.data.mylist.items.map(i => i.key), ['l:1', 'm:2']);
  assert.deepEqual(got.data.progress['pl:7'], { t: 754, d: 6000, at: 2000 });
  void h;
});

test('people never see each other’s data, even with the same password', async () => {
  const store = memoryStore(); const handler = createHandler({ getStore: () => store });
  await call(handler, 'PUT', { cookie: BB }, { mylist: { at: 5, items: [live(1)] } });
  await call(handler, 'PUT', { cookie: JB }, { mylist: { at: 5, items: [live(2)] } });
  const bb = await (await call(handler, 'GET', { cookie: BB })).json();
  const jb = await (await call(handler, 'GET', { cookie: JB })).json();
  const sb = await (await call(handler, 'GET', { cookie: SB })).json();
  assert.deepEqual(bb.data.mylist.items.map(i => i.key), ['l:1']);
  assert.deepEqual(jb.data.mylist.items.map(i => i.key), ['l:2']);
  assert.deepEqual(sb.data.mylist.items, []);
  assert.deepEqual([...store.data.keys()].sort(), ['user/eve', 'user/fay']);
});

test('the newer list wins; an older device can’t overwrite it', async () => {
  const handler = createHandler({ getStore: (s => () => s)(memoryStore()) });
  await call(handler, 'PUT', { cookie: BB }, { mylist: { at: 2000, items: [live(1)] } });
  await call(handler, 'PUT', { cookie: BB }, { mylist: { at: 1000, items: [live(9)] } });
  assert.deepEqual((await (await call(handler, 'GET', { cookie: BB })).json()).data.mylist.items.map(i => i.key), ['l:1']);
  await call(handler, 'PUT', { cookie: BB }, { mylist: { at: 3000, items: [] } });
  assert.deepEqual((await (await call(handler, 'GET', { cookie: BB })).json()).data.mylist.items, [], 'removing everything is a valid newer list');
});

test('for each video the most recent place wins, and "finished" is remembered', async () => {
  const handler = createHandler({ getStore: (s => () => s)(memoryStore()) });
  await call(handler, 'PUT', { cookie: BB }, { progress: { a: { t: 100, d: 5000, at: 1000 }, b: { t: 50, d: 900, at: 1000 } } });
  await call(handler, 'PUT', { cookie: BB }, { progress: { a: { t: 40, d: 5000, at: 500 }, b: { t: 0, d: 900, at: 2000 }, c: { t: 12, d: 600, at: 100 } } });
  const { progress } = (await (await call(handler, 'GET', { cookie: BB })).json()).data;
  assert.equal(progress.a.t, 100, 'an older position does not replace a newer one');
  assert.equal(progress.b.t, 0, 'finishing a video replaces the old place');
  assert.equal(progress.c.t, 12, 'new videos are added');
});

test('a partial update leaves the other saved data alone', async () => {
  const handler = createHandler({ getStore: (s => () => s)(memoryStore()) });
  await call(handler, 'PUT', { cookie: BB }, { mylist: { at: 1, items: [live(1)] }, history: { at: 1, items: [live(2)] } });
  await call(handler, 'PUT', { cookie: BB }, { history: { at: 2, items: [] } });
  const { data } = await (await call(handler, 'GET', { cookie: BB })).json();
  assert.equal(data.mylist.items.length, 1);
  assert.equal(data.history.items.length, 0);
});

test('bad requests are refused', async () => {
  const handler = createHandler({ getStore: memoryStore });
  assert.equal((await call(handler, 'PUT', { cookie: BB }, '{not json')).status, 400);
  assert.equal((await call(handler, 'PUT', { cookie: BB }, 'x'.repeat(LIMITS.bytes + 1))).status, 413);
  for (const method of ['DELETE', 'POST', 'PATCH']) assert.equal((await call(handler, method, { cookie: BB }, {})).status, 405, method);
});

// ------------------------------------------------------------------ cleaning what a browser sends
test('only known item types are kept, rebuilt from safe fields', () => {
  assert.equal(cleanItem({ key: 'x', type: 'link', icon: '<img src=x onerror=alert(1)>' }), null);
  assert.equal(cleanItem({ key: 'x', type: 'tmdb' }), null);
  assert.equal(cleanItem({ key: 'x', type: 'live', url: 'javascript:alert(1)' }), null);
  assert.equal(cleanItem({ type: 'movie' }), null);
  assert.equal(cleanItem(null), null);
  const item = cleanItem({ ...live(1), onclick: 'bad()', __proto__: { polluted: true }, name: 'N'.repeat(1000), needsHeaders: 'yes', season: -3, episode: 4.5 });
  assert.deepEqual(Object.keys(item).sort(), ['key', 'name', 'type', 'url']);
  assert.equal(item.name.length, 300);
  assert.deepEqual(cleanItem(movie(3, { season: 2, episode: 5, needsHeaders: true, overview: 'hi' })), { key: 'm:3', type: 'movie', name: 'Movie 3', id: '3', year: '2025', overview: 'hi', needsHeaders: true, season: 2, episode: 5 });
});

test('lists are de-duplicated and size-limited, and timestamps can’t come from the future', () => {
  const many = Array.from({ length: 500 }, (_, i) => live(i));
  const data = cleanData({ mylist: { at: Number.MAX_SAFE_INTEGER, items: [...many, live(1)] }, history: { at: -5, items: many }, progress: 'x' });
  assert.equal(data.mylist.items.length, LIMITS.mylist);
  assert.equal(new Set(data.mylist.items.map(i => i.key)).size, LIMITS.mylist);
  assert.ok(data.mylist.at <= Date.now() + 3600e3 + 5, 'a far-future time is capped');
  assert.equal(data.history.at, 0);
  assert.equal(data.history.items.length, LIMITS.history);
  assert.equal(data.progress, undefined, 'a field that isn’t an object is ignored');
  assert.deepEqual(cleanData('nope'), {});
  const progress = Object.fromEntries(Array.from({ length: 600 }, (_, i) => [`k${i}`, { t: 20, d: 100, at: i }]));
  assert.equal(Object.keys(cleanData({ progress }).progress).length, LIMITS.progress);
  assert.deepEqual(cleanData({ progress: { a: { t: -1, d: 1, at: 1 }, b: { t: 'x' }, c: null, [`${'k'.repeat(200)}`]: { t: 5, d: 9, at: 1 } } }).progress, {});
});

test('merging never loses stored data when the update is empty', () => {
  const stored = { mylist: { at: 5, items: [live(1)] }, history: { at: 5, items: [] }, progress: { a: { t: 30, d: 90, at: 5 } } };
  const merged = mergeData(stored, {});
  assert.equal(merged.mylist.items.length, 1);
  assert.equal(merged.progress.a.t, 30);
});

// ------------------------------------------------------------------ the browser side (account.js)
function device({ handler, cookieHeader, local = {}, serverReachable = true, timers = [] }) {
  const storage = new Map(Object.entries(local).map(([k, v]) => [k, JSON.stringify(v)]));
  class Storage { setItem(k, v) { storage.set(k, String(v)); } getItem(k) { return storage.has(k) ? storage.get(k) : null; } removeItem(k) { storage.delete(k); } }
  const localStorage = new Storage();
  const events = [], requests = [], listeners = {};
  const ctx = {
    Storage, localStorage, console, Date, JSON, Object, Promise, Array, Set, Number,
    document: { visibilityState: 'visible', addEventListener: (n, f) => (listeners[n] = f) },
    addEventListener: (n, f) => (listeners['window:' + n] = f),
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout: () => {},
    fetch: async (url, opts = {}) => {
      requests.push({ method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null });
      if (!serverReachable) return new Response('<html>not found</html>', { status: 404, headers: { 'content-type': 'text/html' } });
      return handler(new Request('https://streambox.example' + url, { method: opts.method || 'GET', headers: { ...(opts.headers || {}), cookie: cookieHeader }, body: opts.body }));
    },
  };
  ctx.window = ctx; ctx.dispatchEvent = e => events.push(e);
  vm.createContext(ctx);
  vm.runInContext(accountCode, ctx);
  const saved = k => JSON.parse(storage.get(k) ?? 'null');
  return { account: ctx.StreamBoxAccount, ctx, localStorage, storage, saved, events, requests, timers, listeners };
}
const settle = () => new Promise(r => setTimeout(r, 15));
const keys = list => (list || []).map(i => i.key);

test('signing in on a new device brings the account’s lists with it', async () => {
  const store = memoryStore(); const handler = createHandler({ getStore: () => store });
  await call(handler, 'PUT', { cookie: BB }, { mylist: { at: 500, items: [live(1), movie(2)] }, history: { at: 500, items: [movie(2)] }, progress: { 'pl:1': { t: 300, d: 3000, at: 500 } } });
  const d = device({ handler, cookieHeader: BB });
  await d.account.ready;
  assert.equal(d.account.user, 'eve'); assert.equal(d.account.enabled, true);
  assert.deepEqual(keys(d.saved('sb:mylist')), ['l:1', 'm:2']);
  assert.deepEqual(keys(d.saved('sb:history')), ['m:2']);
  assert.equal(d.saved('sb:progress')['pl:1'].t, 300);
  assert.ok(d.events.some(e => e.type === 'streambox-account-synced'), 'the app is told to refresh');
});

test('changes made in the app are saved to the account a moment later', async () => {
  const store = memoryStore(); const handler = createHandler({ getStore: () => store });
  const d = device({ handler, cookieHeader: BB });
  await d.account.ready;
  d.localStorage.setItem('sb:mylist', JSON.stringify([live(7)]));
  d.localStorage.setItem('sb:progress', JSON.stringify({ 'pl:9': { t: 99, d: 999, at: Date.now() } }));
  assert.ok(d.timers.some(t => t.ms >= 1000), 'the save is delayed so quick changes are sent together');
  await d.account.flush(); await settle();
  const server = await store.get('user/eve');
  assert.deepEqual(keys(server.mylist.items), ['l:7']);
  assert.equal(server.progress['pl:9'].t, 99);
  assert.equal(d.requests.filter(r => r.method === 'PUT').length, 1, 'one request carries both changes');
});

test('lists follow the person between two devices', async () => {
  const store = memoryStore(); const handler = createHandler({ getStore: () => store });
  const phone = device({ handler, cookieHeader: BB }); await phone.account.ready;
  phone.localStorage.setItem('sb:mylist', JSON.stringify([live(1), live(2)])); await phone.account.flush();
  const tablet = device({ handler, cookieHeader: BB }); await tablet.account.ready;
  assert.deepEqual(keys(tablet.saved('sb:mylist')), ['l:1', 'l:2']);
  await new Promise(r => setTimeout(r, 5));
  tablet.localStorage.setItem('sb:mylist', JSON.stringify([live(2)])); await tablet.account.flush();   // removes one
  await new Promise(r => setTimeout(r, 5));
  await phone.account.sync(); await phone.account.ready;
  assert.deepEqual(keys(phone.saved('sb:mylist')), ['l:2'], 'the removal reaches the phone');
});

test('a different person signing in on the same device does not inherit the previous person’s lists', async () => {
  const store = memoryStore(); const handler = createHandler({ getStore: () => store });
  const first = device({ handler, cookieHeader: BB }); await first.account.ready;
  first.localStorage.setItem('sb:mylist', JSON.stringify([live(1)])); await first.account.flush();
  const second = device({ handler, cookieHeader: SB, local: { 'sb:mylist': [live(1)], 'sb:acct-meta': { user: 'eve', mylistAt: Date.now(), historyAt: 0 } } });
  await second.account.ready;
  assert.equal(second.account.user, 'cat');
  assert.deepEqual(second.saved('sb:mylist') ?? [], [], 'sb sees their own (empty) list, not bb’s');
  assert.deepEqual(keys((await store.get('user/eve')).mylist.items), ['l:1'], 'and bb’s account is untouched');
  assert.equal(await store.get('user/cat') === null || (await store.get('user/cat')).mylist.items.length === 0, true, 'bb’s list is not copied into sb’s account');
});

test('lists already on a device are kept and joined with the account’s on first sign-in', async () => {
  const store = memoryStore(); const handler = createHandler({ getStore: () => store });
  await call(handler, 'PUT', { cookie: BB }, { mylist: { at: 100, items: [live(1)] } });
  const d = device({ handler, cookieHeader: BB, local: { 'sb:mylist': [live(2)] } });
  await d.account.ready; await settle();
  assert.deepEqual(keys(d.saved('sb:mylist')).sort(), ['l:1', 'l:2']);
  assert.deepEqual(keys((await store.get('user/eve')).mylist.items).sort(), ['l:1', 'l:2'], 'and saved back to the account');
});

test('a video’s place is the most recent one from any device', async () => {
  const store = memoryStore(); const handler = createHandler({ getStore: () => store });
  await call(handler, 'PUT', { cookie: BB }, { progress: { v: { t: 600, d: 6000, at: 5000 } } });
  const d = device({ handler, cookieHeader: BB, local: { 'sb:progress': { v: { t: 100, d: 6000, at: 1000 }, w: { t: 40, d: 900, at: 9000 } }, 'sb:acct-meta': { user: 'eve', mylistAt: 0, historyAt: 0 } } });
  await d.account.ready; await settle();
  assert.equal(d.saved('sb:progress').v.t, 600, 'the newer place from the account wins');
  assert.equal(d.saved('sb:progress').w.t, 40, 'a video only this device knows about is kept');
  assert.equal((await store.get('user/eve')).progress.w.t, 40, 'and shared with the account');
});

test('with no account system (running locally) it does nothing and never breaks the app', async () => {
  const d = device({ handler: null, cookieHeader: '', serverReachable: false });
  await d.account.ready;
  assert.equal(d.account.enabled, false);
  d.localStorage.setItem('sb:mylist', JSON.stringify([live(1)]));
  await d.account.flush();
  assert.deepEqual(keys(d.saved('sb:mylist')), ['l:1'], 'local lists still work');
  assert.equal(d.requests.filter(r => r.method === 'PUT').length, 0, 'nothing is sent anywhere');
});

test('being signed out stops the syncing instead of looping', async () => {
  const handler = createHandler({ getStore: memoryStore });
  const d = device({ handler, cookieHeader: 'sb_gate=eve%3Awrong; sb_gate_on=1' });
  await d.account.ready;
  assert.equal(d.account.enabled, false);
  d.localStorage.setItem('sb:history', JSON.stringify([movie(1)])); await d.account.flush();
  assert.equal(d.requests.filter(r => r.method === 'PUT').length, 0);
});
