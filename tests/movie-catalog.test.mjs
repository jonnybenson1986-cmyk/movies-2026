import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('../public/js/movie-catalog.js', import.meta.url), 'utf8');
const movieUI = readFileSync(new URL('../public/js/movies-ui.js', import.meta.url), 'utf8');
const DAY = 86400000, OLD = 'a'.repeat(40), NEW = 'b'.repeat(40), KEY = 'sb:movie-catalog-v1';
const bundle = { revision: OLD, collections: [{ id: 'hp', title: 'Harry Potter', movies: [{ id: 1, name: 'Existing film', year: '2020', vote: 8 }] }] };
function harness({ storage = new Map(), mode = {}, ui = false } = {}) {
  let time = Date.parse('2026-10-13T12:00:00Z'), sequence = 0;
  const jobs = new Map(), requests = [], updates = [], statuses = [];
  const win = new EventTarget(), doc = new EventTarget();
  doc.hidden = false;
  const localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => {
    if (mode.noStorage) throw new Error('QuotaExceededError'); storage.set(key, value);
  } };
  win.localStorage = localStorage;
  const timers = {
    setTimeout(fn, ms) { const id = ++sequence; jobs.set(id, { at: time + ms, fn }); return id; },
    clearTimeout(id) { jobs.delete(id); },
  };
  async function fetcher(url) {
    requests.push(url);
    if (mode.wait) await mode.wait;
    if (mode.offline || (mode.noBundle && url === '/data/movies.json')) throw new Error('Offline');
    let data;
    if (url === '/data/movies.json') data = bundle;
    else if (url.includes('api.github.com')) {
      if (mode.noUpstream) return { ok: false, status: 503 };
      data = [{ sha: mode.revision || NEW }];
    } else if (url.includes('raw.githubusercontent.com')) {
      if (mode.malformedList && url.endsWith('/harry_potter_collection.json')) data = { error: 'Not a list' };
      else data = [
        { id: 2, title: '<script>Updated film</script>', releaseDate: '2020-01-01', voteAverage: 12, url: 'javascript:alert(1)' },
        { id: 3, title: 'Tomorrow’s release', releaseDate: '2026-10-14' },
        { id: 4, title: 'TV entry', mediaType: 'tv', releaseDate: '2020-01-01' },
        { id: 9, title: 'Invalid date', releaseDate: '2026-02-30' },
      ];
    } else if (url.includes('db.wecollege.net')) {
      if (mode.noRecent) return { ok: false, status: 503 };
      const page = Number(new URL(url).searchParams.get('page'));
      data = { total_pages: mode.pages || 1, results: [
        { id: 5, title: 'New release', release_date: '2026-10-12', vote_average: 7.5 },
        ...(page > 1 ? [{ id: 10 + page, title: 'Another release ' + page, release_date: '2026-10-11' }] : []),
        { id: '../evil', title: 'Invalid lookup', release_date: '2020-01-01' },
        { id: 6, title: 'Future release', release_date: '2099-01-01' },
        { id: 7, title: 'Not released', release_date: '' },
      ] };
    } else throw new Error('Unexpected endpoint: ' + url);
    return { ok: true, json: async () => structuredClone(data) };
  }
  const FakeDate = class extends Date { static now() { return time; } };
  const context = { window: win, document: doc, fetch: fetcher, Date: FakeDate, AbortController, URLSearchParams,
    CustomEvent, console, ...timers };
  vm.runInNewContext(code, context);
  let updater;
  if (ui) { vm.runInNewContext(movieUI, context); updater = win.StreamBoxMovies.updates; }
  else updater = win.StreamBoxMovieCatalog.create({ onUpdate: (data, detail) => updates.push({ data, detail }), onStatus: s => statuses.push(s), now: () => time });
  return { updater, requests, updates, statuses, storage, mode, win, doc, movies: win.StreamBoxMovies,
    advance(ms) {
      const end = time + ms;
      for (;;) {
        const job = [...jobs].sort((a, b) => a[1].at - b[1].at)[0];
        if (!job || job[1].at > end) break;
        time = job[1].at; jobs.delete(job[0]); job[1].fn();
      }
      time = end;
    },
  };
}
const snapshot = h => JSON.parse(h.storage.get(KEY));
const all = h => h.updates.at(-1).data.collections.flatMap(c => c.movies);

test('refresh pins lists to the latest revision, adds released films and retains existing titles', async () => {
  const h = harness({ mode: { pages: 3 } });
  await h.updater.ready;
  const result = await h.updater.refresh({ force: true });
  assert.equal(result.added, 4);
  assert.equal(snapshot(h).revision, NEW);
  assert.equal(h.requests.filter(url => url.includes('/' + NEW + '/lists/')).length, 13);
  assert.equal(h.requests.filter(url => url.includes('db.wecollege.net')).length, 3);
  assert.deepEqual([...new Set(all(h).map(m => m.id))].sort((a, b) => a - b), [1, 2, 5, 12, 13]);
  assert.equal(all(h).find(m => m.id === 2).vote, 10);
  assert(!all(h).some(m => 'url' in m));
  assert.equal(h.updates.at(-1).data.collections[0].id, 'new');
});

test('launch refresh rechecks releases but avoids unchanged list downloads on the same day', async () => {
  const h = harness(); await h.updater.refresh({ force: true });
  const before = h.requests.length;
  await h.updater.refresh(); assert.equal(h.requests.length, before);
  await h.updater.refresh({ force: true });
  assert.equal(h.requests.filter(url => url.includes('raw.githubusercontent.com')).length, 13);
  assert.equal(h.requests.filter(url => url.includes('api.github.com')).length, 2);
});

test('daily refresh includes newly released titles even when the upstream revision is unchanged', async () => {
  const h = harness(); await h.updater.refresh({ force: true });
  assert(!all(h).some(m => m.id === 3));
  h.advance(DAY); await h.updater.refresh();
  assert(all(h).some(m => m.id === 3));
  assert.equal(h.requests.filter(url => url.includes('raw.githubusercontent.com')).length, 26);
});

test('invalid upstream lists commit no partial collection changes; the other source can update', async () => {
  const h = harness({ mode: { malformedList: true } }); await h.updater.refresh({ force: true });
  assert.equal(h.updater.status.phase, 'partial');
  assert(all(h).some(m => m.id === 5)); assert(!all(h).some(m => m.id === 2));
  assert.equal(snapshot(h).revision, OLD);
});

test('failed refreshes and offline restarts preserve the last successful catalog', async () => {
  const h = harness(); await h.updater.refresh({ force: true });
  const ids = [...new Set(all(h).map(m => m.id))];
  h.mode.offline = true;
  await h.updater.refresh({ force: true }); assert.equal(h.updater.status.phase, 'failed');
  assert.deepEqual([...new Set(all(h).map(m => m.id))], ids);
  const reopened = harness({ storage: h.storage, mode: { offline: true } }); await reopened.updater.ready;
  assert.deepEqual([...new Set(all(reopened).map(m => m.id))], ids);
});

test('storage refusal keeps updates usable in memory and reports their persistence limit', async () => {
  const h = harness({ mode: { noStorage: true } }); await h.updater.refresh({ force: true });
  assert(all(h).some(m => m.id === 5)); assert(!h.storage.has(KEY));
  assert.match(h.updater.status.message, /this session only/);
});

test('a corrupt local cache falls back to the bundled catalog', async () => {
  const storage = new Map([[KEY, JSON.stringify({ version: 1, collections: [{ id: '../bad', movies: [] }] })]]);
  const h = harness({ storage }); await h.updater.ready;
  assert.equal(all(h)[0].id, 1);
});

test('simultaneous checks share one network refresh', async () => {
  const h = harness(); await h.updater.ready;
  let release; h.mode.wait = new Promise(r => { release = r; });
  const first = h.updater.refresh({ force: true }), second = h.updater.refresh({ force: true });
  assert.equal(first, second); release(); await first;
  assert.equal(h.requests.filter(url => url.includes('api.github.com')).length, 1);
});

test('daily timer and foreground/online events refresh only when needed', async () => {
  const h = harness(); h.updater.start(); await h.updater.refresh();
  const count = () => h.requests.filter(url => url.includes('api.github.com')).length;
  assert.equal(count(), 1);
  h.doc.dispatchEvent(new Event('visibilitychange')); await h.updater.refresh(); assert.equal(count(), 1);
  h.advance(DAY); await h.updater.refresh(); assert.equal(count(), 2);
  h.win.dispatchEvent(new Event('online')); await h.updater.refresh(); assert.equal(count(), 3);
});

test('movie UI integrates unique new titles, search data, safe snapshots and escaped cards', async () => {
  const h = harness({ ui: true }); await h.movies.ready; await h.updater.refresh({ force: true });
  assert.equal(h.movies.all.length, 3);
  assert.equal(h.movies.newMovies.length, 1);
  const view = {}; h.movies.render(view, 'new'); assert(view.innerHTML.includes('New release'));
  assert(!h.movies.card(h.movies.all.find(m => m.id === 2)).includes('<script>'));
  const saved = h.movies.restore({ id: 999, key: 'm:999', type: 'movie', name: 'Saved title', year: '2020', url: 'javascript:bad()' });
  assert.equal(saved.url, 'https://vidlink.pro/movie/999');
  assert.equal(h.movies.restore({ ...saved, id: '../bad', key: 'm:../bad' }), null);
  assert.equal(h.movies.restore({ ...saved, mediaType: 'tv' }), null);
  assert.equal(h.movies.restore({ ...saved, catalog: 'movy' }), null);
});
