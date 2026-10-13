import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const script = readFileSync(new URL('../public/js/movy-ui.js', import.meta.url), 'utf8');
function harness(fetch = async () => { throw new Error('Unexpected fetch'); }) {
  const win = new EventTarget(), doc = new EventTarget();
  win.StreamBoxMovies = { card: m => `<button>${m.name}</button>` };
  doc.querySelectorAll = () => [];
  doc.getElementById = () => null;
  const location = { origin: 'https://example.netlify.app' };
  vm.runInNewContext(script, { window: win, document: doc, location, fetch, crypto: webcrypto, Event, CustomEvent,
    AbortController, AbortSignal, URLSearchParams, console: { warn() {} }, setTimeout, clearTimeout });
  return { movy: win.StreamBoxMovy, win, doc, location };
}

test('restored titles cannot supply arbitrary embed URLs or collide with local movies', () => {
  const { movy } = harness();
  const restored = movy.restore({ catalog: 'movy', mediaType: 'movie', id: 278, key: 'mv:movie:278', name: 'Movie', url: 'javascript:alert(1)' });
  assert.equal(restored.url, 'https://www.movy.sx/movie/278');
  assert.equal(movy.playerUrl(restored), 'https://www.vidy.st/movie/278?color=E50914&autoplay=true');
  assert.equal(movy.restore({ ...restored, key: 'm:278' }), null);
  assert.equal(movy.restore({ ...restored, id: '../movie/1', key: 'mv:movie:../movie/1' }), null);
  assert.equal(movy.restore({ ...restored, mediaType: 'https://evil.example' }), null);
  assert.equal(movy.validId('anime', 'naruto-eybxz'), true);
  assert.equal(movy.validId('anime', 'evil/../path'), false);
});

test('series specials use season zero; anime requires a mapped ID; invalid episodes are rejected', () => {
  const { movy } = harness();
  assert.match(movy.playerUrl({ mediaType: 'tv', id: 1396 }, 0, 2), /\/tv\/1396\/0\/2\?/);
  assert.match(movy.playerUrl({ mediaType: 'anime', id: 'test-slug', embedId: 100878 }, 1, 3), /\/anime\/100878\/3\?/);
  assert.throws(() => movy.playerUrl({ mediaType: 'anime', id: 'test-slug' }));
  assert.throws(() => movy.playerUrl({ mediaType: 'tv', id: 1396 }, 1, -1));
  assert.throws(() => movy.playerUrl({ mediaType: 'movie', id: 'https://evil.example' }));
});

test('extension readiness requires the current probe, same window and same origin', async () => {
  const { movy, win, doc, location } = harness();
  let nonce;
  doc.addEventListener('streambox-protection-check', event => { nonce = event.detail; });
  const pending = movy.checkProtection();
  const message = (source, origin, value) => {
    const event = new Event('message');
    Object.assign(event, { source, origin, data: { type: 'streambox-protection-ready', nonce: value, capabilities: ['movie-fallback'] } });
    win.dispatchEvent(event);
  };
  message({}, location.origin, nonce);
  message(win, 'https://www.vidy.st', nonce);
  message(win, location.origin, 'stale-nonce');
  assert.equal(movy.protectedPlayback, false);
  message(win, location.origin, nonce);
  assert.equal(await pending, true);
  assert.equal(movy.protectedPlayback, true);
  assert.equal(await movy.checkProtection(), false);
  assert.equal(movy.protectedPlayback, false);
});

test('failed catalogs show a retry state without injecting upstream markup', async () => {
  const { movy } = harness(async () => ({ ok: false, status: 503 }));
  const view = {};
  await movy.render(view, 'movie/1', { register() {}, isSaved() { return false; } });
  assert(view.innerHTML.includes('movyRetry'));
  assert(!view.innerHTML.includes('<script'));
});

test('cancelled requests cannot replace the current route', async () => {
  let resolve;
  const wait = new Promise(r => { resolve = r; });
  const { movy } = harness(async () => { await wait; return { ok: true, json: async () => ({ results: [], genres: [], total_pages: 1 }) }; });
  const view = {};
  const pending = movy.render(view, 'movie/1', { register() {}, isSaved() { return false; } });
  movy.cancel();
  view.innerHTML = 'Current route';
  resolve();
  await pending;
  assert.equal(view.innerHTML, 'Current route');
});

test('anime genre links normalize ampersands and omit unavailable upstream genres', async () => {
  const requested = [];
  const { movy, doc } = harness(async url => {
    requested.push(url);
    return { ok: true, json: async () => ({ results: url.endsWith('/api')
      ? { genres: ['Action & Adventure', 'Sci-Fi & Fantasy', 'Award Winning', 'Mahou Shoujo'] }
      : { data: [], totalPages: 1 } }) };
  });
  const genre = { options: '', insertAdjacentHTML(_where, html) { this.options += html; }, closest() { return {}; } };
  const nodes = { movyGenre: genre, movyStatus: { classList: { add() {} } }, movyResults: {}, movyPages: {} };
  doc.getElementById = id => nodes[id];
  const view = { querySelector() { return null; } };
  await movy.render(view, 'anime/1?genre=action-adventure', { register() {}, isSaved() { return false; } });
  assert(requested.includes('https://anime.vidy.st/api/genre/action-adventure?page=1'));
  assert(genre.options.includes('value="action-adventure"'));
  assert(genre.options.includes('value="sci-fi-fantasy"'));
  assert(!genre.options.includes('Award Winning'));
  assert(!genre.options.includes('Mahou Shoujo'));
});

test('an older season response cannot overwrite the selected season; detail markup is escaped', async () => {
  let resolveOld;
  const old = new Promise(resolve => { resolveOld = resolve; });
  const { movy, doc } = harness(async url => {
    if (url.includes('/season/0?')) await old;
    return { ok: true, json: async () => url.includes('/season/')
      ? { episodes: [{ episode_number: 1, name: url.includes('/season/0?') ? 'Old season' : 'New season' }] }
      : { id: 1396, name: '<script>bad()</script>', overview: '<img src=x onerror=bad()>', seasons: [{ season_number: 0, episode_count: 1, name: 'Specials' }] } };
  });
  const selected = { value: '0' }, episodes = {};
  doc.getElementById = id => id === 'movySeason' ? selected : id === 'movyEpisodes' ? episodes : null;
  const view = {};
  const pending = movy.render(view, 'detail/tv/1396', { register() {}, isSaved() { return false; } });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert(view.innerHTML.includes('&lt;script&gt;'));
  assert(!view.innerHTML.includes('<img src=x'));
  selected.value = '1';
  const event = new Event('change');
  Object.defineProperty(event, 'target', { value: { id: 'movySeason', value: '1' } });
  doc.dispatchEvent(event);
  await new Promise(resolve => setTimeout(resolve, 0));
  resolveOld();
  await pending;
  assert(episodes.innerHTML.includes('New season'));
  assert(!episodes.innerHTML.includes('Old season'));
});

test('extension blocks popups and outside links while preserving internal player navigation', () => {
  const listeners = {};
  const window = { addEventListener: (type, fn) => { listeners[type] = fn; } };
  vm.runInNewContext(readFileSync(new URL('../browser-extension/guard.js', import.meta.url), 'utf8'),
    { window, location: { href: 'https://www.vidy.st/movie/278' }, URL });
  assert.equal(window.open('https://ads.example'), null);
  function click(href, target = '') {
    const result = { prevented: false, stopped: false };
    listeners.click({ target: { closest: () => ({ href, target }) }, preventDefault() { result.prevented = true; }, stopImmediatePropagation() { result.stopped = true; } });
    return result;
  }
  assert.equal(click('https://www.vidy.st/tv/1396/1/2').prevented, false);
  assert.equal(click('https://vidy.st.evil.example').prevented, true);
  assert.equal(click('https://ads.example').prevented, true);
  assert.equal(click('javascript:alert(1)').prevented, true);
  assert.equal(click('https://www.vidy.st/movie/278', '_blank').prevented, true);
  assert.equal(click('https://www.vidy.st/movie/278', '_top').stopped, true);
});

test('network rules are scoped to Movy/Vidy and allow third-party media traffic', () => {
  const rules = JSON.parse(readFileSync(new URL('../browser-extension/rules.json', import.meta.url)));
  assert.equal(new Set(rules.map(r => r.id)).size, rules.length);
  for (const rule of rules) {
    assert(rule.condition.initiatorDomains.includes('movy.sx'));
    assert(rule.condition.initiatorDomains.includes('vidy.st'));
    assert.equal(rule.action.type, 'block');
  }
  const navigation = rules.find(r => r.condition.excludedRequestDomains);
  assert.deepEqual(navigation.condition.resourceTypes, ['sub_frame']);
  const topNavigation = rules.find(r => r.condition.resourceTypes?.includes('main_frame'));
  assert(topNavigation);
  assert(!topNavigation.condition.excludedRequestDomains);
  assert.deepEqual(topNavigation.condition.resourceTypes, ['main_frame']);
  assert(!navigation.condition.resourceTypes.includes('media'));
  const ads = rules.find(r => r.condition.requestDomains);
  assert(ads.condition.requestDomains.includes('amselvex.com'));
  assert(!ads.condition.requestDomains.includes('api.wecollege.net'));
  assert(ads.condition.initiatorDomains.includes('moviesapi.to'));
  assert(topNavigation.condition.initiatorDomains.includes('vidlink.pro'));
  assert.deepEqual(navigation.condition.initiatorDomains, ['movy.sx', 'vidy.st']);
});
