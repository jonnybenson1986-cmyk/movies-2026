/* Movy's public catalogs, rendered with StreamBox controls and no upstream page scripts. */
(() => {
  'use strict';
  const DB = 'https://db.wecollege.net/3';
  const ANIME = 'https://anime.vidy.st/api';
  const LIBRARY = 'https://api.wecollege.net/4k-library';
  const cache = new Map();
  const entries = new Map();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const kinds = { movie: 'Movies', tv: 'TV Shows', anime: 'Anime', '4k': '4K Library' };
  let version = 0, browseState = null, detailState = null, hooks = null;
  let protectedPlayback = false, probe = null;
  window.addEventListener('message', e => {
    if (e.source !== window || e.origin !== location.origin || e.data?.type !== 'streambox-protection-ready' || !probe || e.data.nonce !== probe.nonce || !Array.isArray(e.data.capabilities) || !e.data.capabilities.includes('movie-fallback')) return;
    clearTimeout(probe.timer);
    probe.resolve(true);
    probe = null;
    protectedPlayback = true;
    const status = document.getElementById('movyProtection');
    if (status) status.textContent = 'Playback protection active';
    document.querySelectorAll('[data-movy-play]').forEach(b => { b.disabled = false; });
  });
  function checkProtection() {
    if (probe) { clearTimeout(probe.timer); probe.resolve(false); }
    protectedPlayback = false;
    document.querySelectorAll('[data-movy-play]').forEach(b => { b.disabled = true; });
    return new Promise(resolve => {
      const nonce = crypto.randomUUID();
      probe = { nonce, resolve, timer: setTimeout(() => {
        probe = null;
        const status = document.getElementById('movyProtection');
        if (status) status.textContent = 'Install or update the StreamBox playback helper (v1.1+) to enable Play.';
        resolve(false);
      }, 1500) };
      document.dispatchEvent(new CustomEvent('streambox-protection-check', { detail: nonce }));
    });
  }
  function playerUrl(record, season = 1, episode = 1) {
    if (!validId(record.mediaType, record.id)) throw new Error('Unsupported embed');
    if (!Number.isInteger(season) || season < 0 || !Number.isInteger(episode) || episode < 1) throw new Error('Invalid episode');
    const id = record.mediaType === 'anime' ? record.embedId : record.id;
    if (!/^[1-9]\d{0,9}$/.test(String(id))) throw new Error('Playback unavailable');
    const base = 'https://www.vidy.st/' + record.mediaType + '/' + id;
    return base + (record.mediaType === 'tv' ? '/' + season + '/' + episode : record.mediaType === 'anime' ? '/' + episode : '') + '?color=E50914&autoplay=true';
  }

  async function request(url) {
    const cached = cache.get(url);
    if (cached && cached.until > Date.now()) return cached.data;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, { signal: controller.signal, credentials: 'omit' });
      if (!res.ok) throw new Error('Catalog HTTP ' + res.status);
      const data = await res.json();
      if (data.success === false || data.error) throw new Error('Catalog unavailable');
      cache.set(url, { data, until: Date.now() + 300000 });
      if (cache.size > 60) cache.delete(cache.keys().next().value);
      return data;
    } finally { clearTimeout(timer); }
  }

  function validId(kind, id) {
    return kind === 'anime' ? /^[a-z0-9][a-z0-9-]{0,180}$/.test(String(id)) :
      (kind === 'movie' || kind === 'tv') && /^[1-9]\d{0,9}$/.test(String(id));
  }
  function item(kind, raw) {
    const id = kind === 'anime' ? String(raw.slug || raw.id || '').split('/')[0] : raw.id;
    if (!validId(kind, id)) return null;
    const name = String(raw.title || raw.name || 'Untitled').slice(0, 300);
    const key = `mv:${kind}:${id}`;
    const record = {
      key, id, type: 'movie', catalog: 'movy', mediaType: kind, name,
      overview: String(raw.overview || raw.synopsis || '').slice(0, 4000),
      year: String(raw.release_date || raw.first_air_date || raw.year || '').slice(0, 4),
      vote: Math.round((Number(raw.vote_average || raw.rating || raw.malScore || raw.vote) || 0) * 10) / 10,
      cat: kinds[kind], source: 'Movy', collection: kinds[kind],
      ...(/^[1-9]\d{0,9}$/.test(String(raw.embedId || '')) ? { embedId: Number(raw.embedId) } : {}),
      url: 'https://www.movy.sx/' + (kind === 'anime' ? 'anime' : kind) + '/' + id,
    };
    entries.set(key, record);
    hooks?.register(record);
    return record;
  }
  function restore(saved) {
    if (saved?.catalog !== 'movy' || !validId(saved.mediaType, saved.id) ||
      saved.key !== `mv:${saved.mediaType}:${saved.id}`) return null;
    return entries.get(saved.key) || item(saved.mediaType, { ...saved, title: saved.name, overview: saved.overview });
  }
  function card(m) {
    return window.StreamBoxMovies.card(m).replace('>MOVIE</span>', '>' + esc(kinds[m.mediaType] || 'Movy') + '</span>');
  }
  function link(kind, page = 1, params = new URLSearchParams()) {
    return `#movy/${kind}/${page}${params.size ? '?' + params.toString() : ''}`;
  }
  function shell(kind, params) {
    return `<div class="page"><div class="page-head"><h1>Movy · ${esc(kinds[kind])}</h1></div>
      <div class="chips">${Object.entries(kinds).map(([k, label]) => `<a class="chip ${kind === k ? 'active' : ''}" href="${esc(link(k, 1, new URLSearchParams(params.has('query') ? { query: params.get('query') } : {})))}">${label}</a>`).join('')}</div>
      <form id="movyFilters" class="movy-filters"><label>Search <input name="query" type="search" maxlength="120" value="${esc(params.get('query') || '')}" placeholder="Search ${esc(kinds[kind])}"></label>
      <label>Genre <select name="genre" id="movyGenre"><option value="">All genres</option></select></label>
      ${kind === 'movie' || kind === 'tv' ? `<label>Sort <select name="sort"><option value="popular">Popular</option><option value="newest">Newest</option><option value="rating">Top rated</option></select></label>` : ''}
      <button class="btn btn-play" type="submit">Apply</button></form>
      <div id="movyStatus" class="empty" role="status">Loading catalog…</div><div id="movyResults" class="grid poster-grid movie-grid"></div><div id="movyPages" class="movy-pages"></div></div>`;
  }

  async function browse(view, kind, page, params, token) {
    browseState = { kind, page, params };
    detailState = null;
    view.innerHTML = shell(kind, params);
    const query = (params.get('query') || '').slice(0, 120);
    const genre = params.get('genre') || '';
    let rows, pages, genres = [];
    if (kind === 'anime') {
      const home = (await request(ANIME)).results;
      // These two upstream genre labels currently have no corresponding endpoint.
      genres = (home.genres || []).filter(g => !['Award Winning', 'Mahou Shoujo'].includes(g))
        .map(g => ({ id: g.toLowerCase().replace(/&/g, '').trim().replace(/\s+/g, '-'), name: g }));
      if (query || genre) {
        const endpoint = query ? `/search?keyword=${encodeURIComponent(query)}&page=${page}` : `/genre/${encodeURIComponent(genre)}?page=${page}`;
        const result = (await request(ANIME + endpoint)).results;
        rows = (result.data || []).map(m => item('anime', m)).filter(Boolean);
        pages = Number(result.totalPages) || 1;
      } else {
        const unique = new Map([...(home.trending || []), ...(home.topAiring || [])].map(m => [String(m.slug).split('/')[0], m]));
        rows = [...unique.values()].map(m => item('anime', m)).filter(Boolean);
        pages = 1;
      }
    } else if (kind === '4k') {
      const result = await request(LIBRARY + '?page=' + page);
      rows = (result.items || []).map(m => item(m.type, m)).filter(Boolean);
      if (query) rows = rows.filter(m => m.name.toLowerCase().includes(query.toLowerCase()));
      pages = Number(result.pagination?.pages) || 1;
    } else {
      const options = new URLSearchParams({ page, include_adult: 'false', include_video: 'false', language: 'en' });
      let endpoint;
      if (query) { endpoint = `/search/${kind}`; options.set('query', query); }
      else {
        endpoint = `/discover/${kind}`;
        const sort = params.get('sort');
        options.set('sort_by', sort === 'rating' ? 'vote_average.desc' : sort === 'newest' ? (kind === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc') : 'popularity.desc');
        if (sort === 'rating') options.set('vote_count.gte', '300');
        options.set(kind === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte', new Date().toISOString().slice(0, 10));
        if (/^\d+$/.test(genre)) options.set('with_genres', genre);
      }
      const [result, genreList] = await Promise.all([request(DB + endpoint + '?' + options), request(DB + `/genre/${kind}/list?language=en`)]);
      rows = (result.results || []).map(m => item(kind, m)).filter(Boolean);
      pages = Math.min(Number(result.total_pages) || 1, 500);
      genres = genreList.genres || [];
    }
    if (token !== version) return;
    const genreSelect = document.getElementById('movyGenre');
    genreSelect.insertAdjacentHTML('beforeend', genres.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join(''));
    genreSelect.value = genre;
    genreSelect.closest('label').hidden = kind === '4k';
    const sortSelect = view.querySelector('[name="sort"]');
    if (sortSelect) sortSelect.value = params.get('sort') || 'popular';
    document.getElementById('movyStatus').textContent = rows.length ? `${rows.length} titles · Page ${page} of ${pages}${kind === '4k' && query ? ' · Search filters this page' : ''}` : 'No titles found.';
    document.getElementById('movyStatus').classList.add('movy-count');
    document.getElementById('movyResults').innerHTML = rows.map(card).join('');
    document.getElementById('movyPages').innerHTML = `${page > 1 ? `<a class="btn btn-more" href="${esc(link(kind, page - 1, params))}">Previous</a>` : ''}${page < pages ? `<a class="btn btn-play" href="${esc(link(kind, page + 1, params))}">Next</a>` : ''}`;
  }

  async function detail(view, kind, id, token) {
    browseState = null;
    view.innerHTML = '<div class="page"><div class="empty" role="status">Loading title…</div></div>';
    let record, seasons = [], episodes = [];
    if (kind === 'anime') {
      const [info, list] = await Promise.all([request(ANIME + '/info?id=' + encodeURIComponent(id)), request(ANIME + '/episodes/' + encodeURIComponent(id))]);
      let embedId = info.results.anilistId || info.results.anilist_id;
      const malId = Number(list.results.episodes?.find(e => e.mal_id)?.mal_id);
      if (!embedId && Number.isSafeInteger(malId) && malId > 0) {
        try {
          const res = await fetch('https://graphql.anilist.co', { method: 'POST', credentials: 'omit',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: 'query ($id: Int) { Media(idMal: $id, type: ANIME) { id } }', variables: { id: malId } }),
            signal: AbortSignal.timeout(10000) });
          if (res.ok) embedId = (await res.json()).data?.Media?.id;
        } catch { /* Catalog still works when player mapping is unavailable. */ }
      }
      record = item(kind, { ...info.results, id, slug: id, embedId });
      episodes = (list.results.episodes || []).map(e => ({ number: Number(e.episode_no), title: e.title || `Episode ${e.episode_no}`, episodeId: e.id }));
    } else {
      const result = await request(DB + `/${kind}/${id}?language=en`);
      record = item(kind, result);
      seasons = (result.seasons || []).filter(s => s.season_number >= 0 && s.episode_count > 0);
    }
    if (token !== version) return;
    if (!record) throw new Error('Invalid title');
    detailState = { record, seasons, episodes, token };
    view.innerHTML = `<div class="page"><div class="page-head"><h1>${esc(record.name)}</h1><a class="btn btn-more page-btn" href="${link(kind)}">Browse ${esc(kinds[kind])}</a></div>
      <div class="movy-detail"><p class="facts">${esc([record.year, record.vote ? '★ ' + record.vote : '', kinds[kind]].filter(Boolean).join(' · '))}</p>
      <p>${esc(record.overview) || 'No description available.'}</p>
      <div class="btns"><button class="btn btn-more" data-act="fav" data-key="${esc(record.key)}">${hooks.isSaved(record.key) ? '✓ In My List' : '+ My List'}</button></div>
      <p id="movyProtection" class="movie-note">Install or update the StreamBox playback helper (v1.1+) to enable Play.</p>
      <p class="movie-note"><a href="/playback-protection.html" target="_blank" rel="noopener">Download &amp; install playback protection</a> · Chrome or Edge desktop</p>
      ${kind === 'movie' ? `<button class="btn btn-play" data-movy-play="1" ${protectedPlayback ? '' : 'disabled'}>▶ Play</button>` : ''}
      ${kind === 'anime' && !record.embedId ? '<p class="movie-note">Playback is unavailable for this title. You can still browse its episodes.</p>' : ''}
      ${seasons.length ? `<label>Season <select id="movySeason">${seasons.map(s => `<option value="${s.season_number}">${esc(s.name)}</option>`).join('')}</select></label>` : ''}
      <div id="movyEpisodes" class="movy-episodes"></div></div></div>`;
    checkProtection();
    if (protectedPlayback) document.getElementById('movyProtection').textContent = 'Playback protection active';
    if (seasons.length) await season(seasons[0].season_number, detailState);
    else showEpisodes(episodes);
  }
  function showEpisodes(episodes) {
    const el = document.getElementById('movyEpisodes');
    if (el) el.innerHTML = episodes.map(e => (detailState?.record.mediaType === 'tv' || detailState?.record.embedId) ? `<button class="movy-episode" data-movy-play="${esc(e.number)}" ${protectedPlayback ? '' : 'disabled'}>▶ ${esc(e.number)} · ${esc(e.title)}</button>` : `<div class="movy-episode">${esc(e.number)} · ${esc(e.title)}</div>`).join('');
  }
  async function season(number, state) {
    const el = document.getElementById('movyEpisodes');
    if (el) el.textContent = 'Loading episodes…';
    const seasonVersion = state.seasonVersion = (state.seasonVersion || 0) + 1;
    try {
      const result = await request(DB + `/tv/${state.record.id}/season/${number}?language=en`);
      if (state !== detailState || state.token !== version || seasonVersion !== state.seasonVersion || String(number) !== document.getElementById('movySeason')?.value) return;
      state.episodes = (result.episodes || []).map(e => ({ number: Number(e.episode_number), title: e.name || `Episode ${e.episode_number}` }));
      showEpisodes(state.episodes);
    } catch {
      if (state === detailState && state.token === version && seasonVersion === state.seasonVersion && el) el.textContent = 'Couldn’t load episodes. Select a season to retry.';
    }
  }

  async function render(view, arg, callbacks) {
    hooks = callbacks;
    const token = ++version;
    const [path, query = ''] = arg.split('?');
    const parts = path.split('/');
    try {
      if (parts[0] === 'detail') {
        if (!validId(parts[1], parts[2])) throw new Error('Unknown title');
        await detail(view, parts[1], parts[2], token);
      } else {
        const kind = kinds[parts[0]] ? parts[0] : 'movie';
        const page = /^\d+$/.test(parts[1] || '') ? Math.max(1, Math.min(Number(parts[1]), 500)) : 1;
        await browse(view, kind, page, new URLSearchParams(query), token);
      }
    } catch (e) {
      if (token === version) view.innerHTML = '<div class="page"><div class="page-head"><h1>Movy</h1></div><div class="empty">Couldn’t load this catalog. <button class="btn btn-more" id="movyRetry">Try again</button></div></div>';
      console.warn('Movy catalog', e.message);
    }
  }
  document.addEventListener('submit', e => {
    if (e.target.id !== 'movyFilters' || !browseState) return;
    e.preventDefault();
    const data = new FormData(e.target), params = new URLSearchParams();
    for (const field of ['query', 'genre', 'sort']) if (data.get(field)) params.set(field, data.get(field));
    location.hash = link(browseState.kind, 1, params);
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'movySeason' && detailState) season(Number(e.target.value), detailState);
  });
  document.addEventListener('click', async e => {
    if (e.target.closest('#movyRetry')) hooks?.retry();
    const play = e.target.closest('[data-movy-play]');
    if (play && detailState && protectedPlayback) {
      const seasonNumber = Number(document.getElementById('movySeason')?.value || 1);
      const episodeNumber = Number(play.dataset.movyPlay);
      const record = detailState.record;
      if (record.mediaType !== 'movie' && !detailState.episodes.some(e => e.number === episodeNumber)) return;
      const state = detailState;
      if (await checkProtection() && state === detailState && state.token === version) hooks.play({ ...record, season: seasonNumber, episode: episodeNumber });
    }
  });
  window.StreamBoxMovy = { render, playerUrl, checkProtection, get protectedPlayback() { return protectedPlayback; }, card, restore, validId, cancel() { version++; detailState = null; browseState = null; }, get(key) { return entries.get(key); } };
})();
