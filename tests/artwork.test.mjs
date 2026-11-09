import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('../public/js/artwork.js', import.meta.url), 'utf8');
const BUILT_IN = /BUILT_IN_KEY = '([a-f0-9]{32})'/.exec(code)[1];
const OWN = 'b'.repeat(32);

function harness({ settings, response = { ok: true, status: 200, json: async () => ({ poster_path: '/p.jpg', backdrop_path: '/b.jpg' }) } } = {}) {
  const store = new Map();
  if (settings !== undefined) store.set('sb:settings', typeof settings === 'string' ? settings : JSON.stringify(settings));
  const fetched = [], elements = [];
  const card = (id, type = 'movie') => {
    const holder = { prepended: 0, classes: new Set(), prepend() { this.prepended++; }, classList: { add: c => holder.classes.add(c) }, querySelector: () => null };
    const el = { dataset: { artId: String(id), artType: type }, isConnected: true, classList: { contains: () => false }, querySelector: s => (s === '.art' ? holder : null), holder };
    elements.push(el); return el;
  };
  const ctx = {
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    document: { documentElement: {}, querySelectorAll: () => elements },
    IntersectionObserver: class { constructor(cb) { this.cb = cb; } observe(el) { this.cb([{ isIntersecting: true, target: el }]); } unobserve() {} },
    MutationObserver: class { observe() {} },
    requestAnimationFrame: f => f(), setInterval() {}, addEventListener() {},
    Image: class { set src(v) { this.url = v; this.onload?.(); } },
    fetch: async url => { fetched.push(String(url)); return response; },
    encodeURIComponent, WeakSet, Object, JSON, Promise, Date, setTimeout,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { art: ctx.StreamBoxArt, fetched, card, store };
}
const settle = () => new Promise(r => setTimeout(r, 20));

test('artwork works with no setup, using the built-in key', async () => {
  const h = harness();
  assert.equal(h.art.enabled(), true);
  const el = h.card(603); h.art.reload(); await settle();
  assert.equal(h.fetched.length, 1);
  assert.match(h.fetched[0], new RegExp(`^https://api\\.themoviedb\\.org/3/movie/603\\?api_key=${BUILT_IN}$`));
  assert.equal(el.holder.prepended, 1, 'the poster is added to the card');
  assert.ok(el.holder.classes.has('has-art'));
});

test('a key saved in Settings takes priority over the built-in key', async () => {
  const h = harness({ settings: { tmdbKey: OWN } });
  h.card(1); h.art.reload(); await settle();
  assert.ok(h.fetched[0].endsWith(`api_key=${OWN}`));
});

test('a malformed saved key falls back to the built-in key', async () => {
  for (const settings of [{ tmdbKey: 'not-a-key' }, { tmdbKey: 'eyJhbGciOi.v4.token' }, { tmdbKey: '' }, {}, '{bad json']) {
    const h = harness({ settings });
    h.card(1); h.art.reload(); await settle();
    assert.ok(h.fetched[0].endsWith(`api_key=${BUILT_IN}`), JSON.stringify(settings));
  }
});

test('series and anime use the TV endpoint', async () => {
  const h = harness();
  h.card(7, 'tv'); h.art.reload(); await settle();
  assert.match(h.fetched[0], /\/3\/tv\/7\?/);
});

test('answers are remembered, so a title is only looked up once', async () => {
  const h = harness();
  h.card(5); h.card(5); h.art.reload(); await settle();
  assert.equal(h.fetched.length, 1, 'two cards for the same title share one request');
  h.art.reload(); await settle();
  assert.equal(h.fetched.length, 1, 'and it is not asked again later');
});

test('a title TMDB does not know (404) is remembered; a temporary failure is not', async () => {
  const missing = harness({ response: { ok: false, status: 404, json: async () => ({}) } });
  missing.card(9); missing.art.reload(); await settle(); missing.art.reload(); await settle();
  assert.equal(missing.fetched.length, 1);
  const rateLimited = harness({ response: { ok: false, status: 429, json: async () => ({}) } });
  rateLimited.card(9); rateLimited.art.reload(); await settle(); rateLimited.art.reload(); await settle();
  assert.equal(rateLimited.fetched.length, 2, 'tried again on the next pass');
});

test('the key is only ever sent to TMDB', async () => {
  const h = harness();
  h.card(1); h.card(2, 'tv'); h.art.reload(); await settle();
  for (const url of h.fetched) assert.ok(url.startsWith('https://api.themoviedb.org/3/'), url);
});
