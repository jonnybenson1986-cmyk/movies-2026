/* Refresh movie metadata locally. Playback still uses the existing movie sources. */
(() => {
  'use strict';
  const DAY = 86400000, RETRY = 3600000, KEY = 'sb:movie-catalog-v1';
  const REPO = 'kiduyu-klaus/KiduyuTv_final';
  const lists = [
    ['oscar', 'Oscar Contenders 2026', 'oscar_winners_2026'],
    ['hp', 'Harry Potter', 'harry_potter_collection'],
    ['mcu', 'Marvel Cinematic Universe', 'marvel_cinematic_universe'],
    ['bond', 'James Bond', 'james_bond_collection'],
    ['pirates', 'Pirates of the Caribbean', 'pirates_of_the_caribbean'],
    ['statham', 'Jason Statham', 'jason_statham_movies'],
    ['time_travel', 'Time Travel', 'time_travel_movies'],
    ['horror', 'Popular Horror', 'popular_horror'],
    ['classics', 'Classic Cinema', 'best_classics'],
    ['hallmark', 'Hallmark', 'hallmark_movies'],
    ['christian', 'Christian Movies', 'christian_movies'],
    ['bible', 'Movies from the Bible', 'movies_from_the_bible'],
    ['true_story', 'True Story Movies', 'true_story_movies'],
  ];
  const text = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : '';
  const date = time => new Date(time).toISOString().slice(0, 10);
  function movie(raw, today, requireRelease = false, origin = 'KiduyuTv') {
    if (!raw || !Number.isSafeInteger(raw.id) || raw.id <= 0 || raw.id > 9999999999 ||
      raw.mediaType === 'tv' || raw.type === 'tv' || raw.firstAirDate || raw.first_air_date || raw.adult === true ||
      (Array.isArray(raw.genreIds) && raw.genreIds.some(g => g >= 10759 && g <= 10768))) return null;
    const name = text(raw.title || raw.name, 300).trim();
    if (!name) return null;
    const releaseDate = text(raw.releaseDate || raw.release_date, 10);
    if (requireRelease && !releaseDate) return null;
    if (releaseDate && (!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate) || !Number.isFinite(Date.parse(releaseDate + 'T00:00:00Z')) ||
      date(Date.parse(releaseDate + 'T00:00:00Z')) !== releaseDate || releaseDate > today)) return null;
    const year = releaseDate ? releaseDate.slice(0, 4) : text(raw.year, 4);
    if (year && (!/^\d{4}$/.test(year) || year > today.slice(0, 4))) return null;
    const vote = Number(raw.voteAverage ?? raw.vote_average ?? raw.vote) || 0;
    return { id: raw.id, name, overview: text(raw.overview, 4000), year, releaseDate,
      vote: Math.round(Math.max(0, Math.min(10, vote)) * 10) / 10, source: origin };
  }
  function normalize(data, today) {
    if (!data || !Array.isArray(data.collections) || data.collections.length > 30) throw new Error('Invalid catalog');
    const seen = new Set();
    return data.collections.map(c => {
      if (!c || !/^[a-z0-9_]{1,40}$/.test(c.id) || seen.has(c.id) || !Array.isArray(c.movies) || c.movies.length > 10000) throw new Error('Invalid collection');
      seen.add(c.id);
      const unique = new Map();
      for (const raw of c.movies) {
        const m = movie(raw, today, false, c.id === 'new' ? 'Movy' : 'KiduyuTv');
        if (m) unique.set(m.id, m);
      }
      return { id: c.id, title: text(c.title, 120) || c.id, movies: [...unique.values()] };
    });
  }
  function merge(current, updates) {
    const byCollection = new Map(current.map(c => [c.id, c]));
    for (const c of updates) {
      const films = new Map((byCollection.get(c.id)?.movies || []).map(m => [m.id, m]));
      for (const m of c.movies) films.set(m.id, m);
      let movies = [...films.values()];
      if (c.id === 'new') movies = movies.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate)).slice(0, 1000);
      byCollection.set(c.id, { ...c, movies });
    }
    const recent = byCollection.get('new');
    return [...(recent ? [recent] : []), ...[...byCollection.values()].filter(c => c.id !== 'new')];
  }
  function create({ onUpdate, onStatus = () => {}, fetcher = fetch, storage, now = Date.now }) {
    if (!storage) {
      try { storage = window.localStorage; } catch { /* Disabled browser storage. */ }
      storage ||= { getItem() { return null; }, setItem() { throw new Error('Storage unavailable'); } };
    }
    let state = { collections: [], revision: '', checkedAt: 0, upstreamCheckedAt: 0, retryAt: 0 };
    let flight = null, timer = null, started = false;
    let status = { phase: 'idle', checkedAt: 0, message: 'Movie updates have not been checked yet.' };
    function report(phase, message, added = 0) {
      status = { phase, message, added, checkedAt: state.checkedAt };
      onStatus(status);
    }
    function persist() {
      try { storage.setItem(KEY, JSON.stringify({ version: 1, ...state })); return true; }
      catch { return false; }
    }
    async function json(url) {
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetcher(url, { cache: 'no-store', credentials: 'omit', signal: controller.signal });
        if (!response.ok) throw new Error('Catalog HTTP ' + response.status);
        return await response.json();
      } finally { clearTimeout(timeout); }
    }
    const ready = (async () => {
      let cached = null;
      try {
        const raw = JSON.parse(storage.getItem(KEY));
        if (raw?.version === 1 && raw.collections?.length) cached = { ...raw, collections: normalize(raw, date(now())) };
      } catch { /* A corrupt or unavailable cache does not replace bundled movies. */ }
      let bundled = null;
      try {
        const data = await json('/data/movies.json');
        bundled = { ...data, collections: normalize(data, date(now())) };
      } catch { /* Persisted movies can still be used offline. */ }
      if (cached) state = { ...state, collections: cached.collections, revision: /^[a-f0-9]{40}$/.test(cached.revision) ? cached.revision : '',
        ...Object.fromEntries(['checkedAt', 'upstreamCheckedAt', 'retryAt'].map(k => [k, Number.isFinite(cached[k]) && cached[k] <= now() ? cached[k] : 0])) };
      if (bundled) {
        // Cached metadata takes precedence; old known titles are retained when lists change.
        state.collections = merge(bundled.collections, state.collections);
        if (!state.revision && /^[a-f0-9]{40}$/.test(bundled.revision)) state.revision = bundled.revision;
      }
      if (state.collections.length) onUpdate({ collections: state.collections }, { reason: 'loaded', added: 0 });
      else report('failed', 'Couldn’t load movies. Connect to the internet and check for updates.');
      if (state.checkedAt) report('cached', 'Using saved movies.');
    })();
    async function upstream(today) {
      const commits = await json('https://api.github.com/repos/' + REPO + '/commits?per_page=1');
      const revision = commits?.[0]?.sha;
      if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Invalid upstream revision');
      if (revision === state.revision && state.upstreamCheckedAt && date(state.upstreamCheckedAt) === today) return { revision, collections: [] };
      const collections = await Promise.all(lists.map(async ([id, title, filename]) => {
        const raw = await json(`https://raw.githubusercontent.com/${REPO}/${revision}/lists/${filename}.json`);
        if (!Array.isArray(raw) || raw.length > 10000) throw new Error('Invalid movie list');
        const films = new Map();
        for (const entry of raw) { const m = movie(entry, today, true); if (m) films.set(m.id, m); }
        return { id, title, movies: [...films.values()] };
      }));
      return { revision, collections };
    }
    async function recent(today) {
      const params = new URLSearchParams({ include_adult: 'false', include_video: 'false', language: 'en',
        sort_by: 'primary_release_date.desc', 'vote_count.gte': '5',
        'primary_release_date.gte': date(now() - 180 * DAY), 'primary_release_date.lte': today });
      const page = async number => {
        const data = await json('https://db.wecollege.net/3/discover/movie?' + params + '&page=' + number);
        if (!Array.isArray(data?.results) || data.results.length > 100) throw new Error('Invalid new releases');
        return data;
      };
      const first = await page(1), pages = Math.max(1, Math.min(Number(first.total_pages) || 1, 3));
      const results = [first, ...await Promise.all(Array.from({ length: pages - 1 }, (_v, i) => page(i + 2)))];
      return { id: 'new', title: 'New Movies', movies: results.flatMap(result => result.results)
        .map(raw => movie(raw, today, true, 'Movy')).filter(Boolean) };
    }
    function schedule() {
      clearTimeout(timer);
      if (started) timer = setTimeout(() => refresh(), Math.max(1000, (state.retryAt || state.checkedAt + DAY) - now()));
    }
    function refresh({ force = false } = {}) {
      if (flight) return flight;
      flight = ready.then(async () => {
        if (!force && now() < (state.retryAt || state.checkedAt + DAY)) return { skipped: true };
        report('checking', 'Checking for new movies…');
        const today = date(now()), before = JSON.stringify(state.collections);
        const oldIds = new Set(state.collections.flatMap(c => c.movies.map(m => m.id)));
        const [curated, releases] = await Promise.allSettled([upstream(today), recent(today)]);
        if (curated.status === 'fulfilled') {
          state.collections = merge(state.collections, curated.value.collections);
          state.revision = curated.value.revision; state.upstreamCheckedAt = now();
        }
        if (releases.status === 'fulfilled') state.collections = merge(state.collections, [releases.value]);
        const successes = Number(curated.status === 'fulfilled') + Number(releases.status === 'fulfilled');
        state.retryAt = successes === 2 ? 0 : now() + RETRY;
        if (successes) state.checkedAt = now();
        const added = new Set(state.collections.flatMap(c => c.movies.map(m => m.id)).filter(id => !oldIds.has(id))).size;
        const saved = persist();
        if (before !== JSON.stringify(state.collections)) onUpdate({ collections: state.collections }, { reason: 'refresh', added });
        report(successes === 2 ? 'updated' : successes ? 'partial' : 'failed',
          successes === 2 ? (added ? `${added} new movies added.` : 'Movies are up to date.') :
            successes ? 'Movies updated. One source could not refresh; it will retry.' : 'Couldn’t check for new movies. Saved movies are still available.', added);
        if (successes && !saved) report(status.phase, status.message + ' Device storage is unavailable; updates are saved for this session only.', added);
        return { added, phase: status.phase };
      }).finally(() => { flight = null; schedule(); });
      return flight;
    }
    return { ready, refresh, get status() { return status; }, start() {
      if (started) return;
      started = true;
      window.addEventListener('online', () => refresh({ force: true }));
      document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
      refresh({ force: true });
    } };
  }
  window.StreamBoxMovieCatalog = { create, normalizeMovie(raw) { return movie(raw, date(Date.now()), false, raw?.source === 'Movy' ? 'Movy' : 'KiduyuTv'); } };
})();
