import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

globalThis.Netlify = { env: { get: key => (key === 'USERS' ? JSON.stringify({ eve: 'shared-pass', fay: 'shared-pass' }) : undefined) } };
const { createHandler, cleanAlert } = await import(new URL('../netlify/functions/watch-alerts.mjs', import.meta.url));
const script = readFileSync(new URL('../public/js/watch-providers.js', import.meta.url), 'utf8');

function harness({ languages = ['en-AU'], saved } = {}) {
  const win = new EventTarget();
  const doc = new EventTarget();
  const storage = new Map(saved ? [['sb:watch-region', JSON.stringify(saved)]] : []);
  vm.runInNewContext(script, {
    window: win, document: doc, navigator: { languages, language: languages[0] }, Intl, URLSearchParams, CustomEvent: class extends Event { constructor(t, o) { super(t); this.detail = o?.detail; } },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    fetch: async () => ({ ok: false, status: 404 }), AbortSignal, console,
  });
  return win.StreamBoxWatch;
}

test('the region defaults to the locale, and a saved choice wins', () => {
  assert.equal(harness({ languages: ['en-AU'] }).region, 'AU');
  assert.equal(harness({ languages: ['fr', 'pt-BR'] }).region, 'BR');
  assert.equal(harness({ languages: ['en-GB'], saved: 'DE' }).region, 'DE');
  assert.equal(harness({ languages: ['xx'], saved: 'bad' }).region.length, 2);
});

test('a hub service turns into TMDB discover filters for the current region', () => {
  const w = harness({ languages: ['en-US'] });
  const f = w.discoverOptions(new URLSearchParams('provider=prime&access=rent'));
  assert.equal(f.service.name, 'Prime Video');
  assert.deepEqual({ ...f.options }, { with_watch_providers: '9|119', watch_region: 'US', with_watch_monetization_types: 'rent' });
  assert.equal(w.discoverOptions(new URLSearchParams('provider=netflix')).options.with_watch_monetization_types, 'flatrate|free|ads');
  assert.equal(w.discoverOptions(new URLSearchParams('provider=nope')), null);
  for (const name of ['Netflix', 'Prime Video', 'Disney+', 'Apple TV+', 'Max', 'Hulu']) assert.ok(w.FEATURED.some(s => s.name === name), name);
});

test('availability is grouped Stream, Free, With ads, Rent, Buy without duplicates', () => {
  const w = harness();
  const groups = w.groups({ buy: [{ provider_id: 2, provider_name: 'Apple TV Store' }], flatrate: [{ provider_id: 8, provider_name: 'Netflix', display_priority: 2 }, { provider_id: 8, provider_name: 'Netflix' }, { provider_id: 337, provider_name: 'Disney Plus', display_priority: 1 }] });
  assert.deepEqual([...groups.map(g => g.label)], ['Stream', 'Buy']);
  assert.deepEqual([...groups[0].list.map(p => p.provider_id)], [337, 8]);
  assert.equal(w.groups(undefined).length, 0);
});

test('Watch Now links go to the service, or to the region page for services without a search link', () => {
  const w = harness();
  assert.equal(w.watchUrl({ provider_id: 8 }, 'Fight Club', 'https://tmdb/x'), 'https://www.netflix.com/search?q=Fight%20Club');
  assert.equal(w.watchUrl({ provider_id: 1899 }, 'Fight Club', 'https://tmdb/x'), 'https://tmdb/x');
});

// ------------------------------------------------------------------ the alerts API
const memoryStore = () => {
  const data = new Map();
  return { get: async key => (data.has(key) ? JSON.parse(data.get(key)) : null), setJSON: async (key, value) => { data.set(key, JSON.stringify(value)); } };
};
const cookie = user => `sb_gate=${encodeURIComponent(user + ':shared-pass')}; sb_gate_on=1`;
const call = (h, method, user, body) => h(new Request('https://streambox.example/api/watch-alerts', { method, headers: user ? { cookie: cookie(user), 'content-type': 'application/json' } : {}, body: body === undefined ? undefined : JSON.stringify(body) }));

test('alerts need a sign-in and are kept per person', async () => {
  const store = memoryStore(), h = createHandler({ getStore: () => store });
  assert.equal((await call(h, 'GET')).status, 401);
  const alert = { kind: 'movie', id: '550', name: 'Fight Club', region: 'AU' };
  assert.equal((await call(h, 'PUT', 'eve', { on: true, alert })).status, 200);
  assert.deepEqual((await (await call(h, 'GET', 'eve')).json()).alerts.map(a => a.key), ['movie:550:AU']);
  assert.deepEqual((await (await call(h, 'GET', 'fay')).json()).alerts, []);
  await call(h, 'PUT', 'eve', { on: false, alert });
  assert.deepEqual((await (await call(h, 'GET', 'eve')).json()).alerts, []);
});

test('alerts reject anything that is not a plain movie or show id', async () => {
  const h = createHandler({ getStore: memoryStore });
  assert.equal((await call(h, 'PUT', 'eve', { on: true, alert: { kind: 'anime', id: '1', region: 'US' } })).status, 400);
  assert.equal((await call(h, 'PUT', 'eve', { on: 'yes', alert: { kind: 'tv', id: '1', region: 'US' } })).status, 400);
  assert.equal(cleanAlert({ kind: 'tv', id: '01', region: 'US' }), null);
  assert.equal(cleanAlert({ kind: 'tv', id: '1', region: 'usa' }), null);
  assert.equal(cleanAlert({ kind: 'tv', id: 7, region: 'US', name: 'x'.repeat(400) }).name.length, 300);
});
