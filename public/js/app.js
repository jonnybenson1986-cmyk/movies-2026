/* StreamBox — Netflix-style player for live IPTV, sports and free movies. */
(() => {
  'use strict';

  // ---------------------------------------------------------------- constants
  const SKY_RACING = [
    { name: 'SKY Racing 1', url: 'https://skylivetab-new.akamaized.net/hls/live/2038780/sky1/index.m3u8' },
    { name: 'SKY Racing 2', url: 'https://skylivetab-new.akamaized.net/hls/live/2038781/sky2/index.m3u8' },
  ];

  const QUICK_LINKS = [
    { name: '7plus Live', url: 'https://7plus.com.au/live-tv?channel-id=Seven', icon: '📺', note: 'Free-to-air Seven Network' },
    { name: 'iptv-org', url: 'https://github.com/iptv-org/iptv', icon: '🌍', note: 'Source of the channel list' },
    { name: 'Internet Archive', url: 'https://archive.org/details/feature_films', icon: '🎞️', note: 'Public-domain feature films' },
  ];

  // Public-domain films on archive.org (CORS-enabled API). Only items with an MP4 are queried.
  const FEATURES = 'collection:(feature_films)';
  const MOVIE_COLLECTIONS = [
    { id: 'classics', title: 'Classic Feature Films', q: `${FEATURES} AND NOT title:(sex OR madness) AND NOT subject:(exploitation)` },
    { id: 'noir', title: 'Film Noir', q: `${FEATURES} AND subject:("film noir")` },
    { id: 'comedy', title: 'Comedy Classics', q: `${FEATURES} AND subject:(comedy)` },
    { id: 'horror', title: 'Horror', q: '(collection:(SciFi_Horror) OR (collection:(feature_films) AND subject:(horror)))' },
    { id: 'scifi', title: 'Sci-Fi', q: `${FEATURES} AND subject:("science fiction")` },
    { id: 'crime', title: 'Crime & Mystery', q: `${FEATURES} AND subject:(crime OR mystery)` },
    { id: 'westerns', title: 'Westerns', q: `${FEATURES} AND subject:(western)` },
    { id: 'cartoons', title: 'Cartoons & Animation', q: 'collection:(animationandcartoons)' },
    { id: 'silent', title: 'Silent Era', q: 'collection:(silent_films)' },
  ];
  const movieQuery = id => `${MOVIE_COLLECTIONS.find(c => c.id === id).q} AND mediatype:(movies) AND format:(MPEG4 OR "h.264")`;

  // TMDB (themoviedb.org): posters, trailers, ratings and "where to watch". Each user adds their own free API key in Settings.
  // TMDB titles are not played inside StreamBox; they link out to the services that carry them.
  const TMDB_API = 'https://api.themoviedb.org/3';
  const TMDB_IMG = 'https://image.tmdb.org/t/p/';
  const TMDB_REGION = 'AU';
  const TMDB_LISTS = [
    { id: 'trending', title: 'Trending This Week', path: 'trending/movie/week' },
    { id: 'popular', title: 'Popular', path: 'movie/popular' },
    { id: 'top', title: 'Top Rated', path: 'movie/top_rated' },
    { id: 'now', title: 'In Cinemas Now', path: 'movie/now_playing' },
    { id: 'upcoming', title: 'Coming Soon', path: 'movie/upcoming' },
  ];
  const TMDB_GENRES = [
    ['Action', 28], ['Comedy', 35], ['Drama', 18], ['Thriller', 53], ['Horror', 27], ['Sci-Fi', 878],
    ['Romance', 10749], ['Animation', 16], ['Family', 10751], ['Crime', 80], ['Documentary', 99], ['War', 10752], ['Western', 37],
  ];
  const TMDB_ATTRIBUTION = 'This product uses the TMDB API but is not endorsed or certified by TMDB.';

  const CATEGORY_ORDER = ['Sports', 'Movies', 'News', 'Comedy & Series', 'Kids', 'Documentary', 'Music', 'Lifestyle', 'Religious', 'Entertainment'];
  const ROW_LIMIT = 30;
  const GRID_CHUNK = 120;
  const PAGE_IS_HTTPS = location.protocol === 'https:';
  const IS_IOS = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // ---------------------------------------------------------------- storage
  const store = {
    get(key, fallback) { try { const v = localStorage.getItem('sb:' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem('sb:' + key, JSON.stringify(value)); } catch { /* private mode */ } },
  };
  const settings = Object.assign({ showAll: false, sources: [], tmdbKey: '' }, store.get('settings', {}));
  const saveSettings = () => store.set('settings', settings);

  // ---------------------------------------------------------------- state
  const items = new Map();        // key -> item, every card on screen points here
  let channels = [];              // live channels (bundled + user playlists)
  let channelsReady = null;       // promise
  const movieCache = new Map();   // collection/query -> items

  // ---------------------------------------------------------------- helpers
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
  const tileColor = name => { const h = hash(name) % 360; return `linear-gradient(135deg, hsl(${h} 55% 32%), hsl(${(h + 40) % 360} 60% 14%))`; };
  const initials = name => name.replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 2400);
  }

  const isPlayable = ch => ch.type !== 'live' || (!ch.needsHeaders && (!PAGE_IS_HTTPS || ch.url.startsWith('https://')));

  function register(item) { items.set(item.key, item); return item.key; }

  // ---------------------------------------------------------------- data: channels
  function liveItem(raw, i, origin) {
    return {
      key: `l:${origin}:${i}`, type: 'live',
      name: raw.n, url: raw.u, cat: raw.c || 'Entertainment', quality: raw.q || '',
      source: raw.s || '', logo: raw.l || '', needsHeaders: !!raw.h, isPlaylist: !!raw.p,
    };
  }

  function parseM3U(text) {
    const out = [];
    let meta = null;
    for (const line of text.split(/\r?\n/)) {
      const l = line.trim();
      if (l.startsWith('#EXTINF')) {
        const attr = k => l.match(new RegExp(`${k}="([^"]*)"`))?.[1] || '';
        const title = l.slice(l.lastIndexOf(',') + 1).trim();
        meta = { n: title.replace(/\s*\(\d{3,4}p\)/, '').replace(/\s*\[[^\]]*\]/g, '').trim(), q: title.match(/\((\d{3,4}p)\)/)?.[1] || '', c: attr('group-title').split(';')[0], l: attr('tvg-logo') };
      } else if (l.startsWith('#EXTVLCOPT') && meta && /http-(referrer|user-agent)/.test(l)) {
        meta.h = 1;
      } else if (l && !l.startsWith('#') && meta) {
        out.push({ ...meta, u: l, c: CATEGORY_ORDER.includes(meta.c) ? meta.c : guessCategory(meta.n, meta.c) });
        meta = null;
      }
    }
    return out;
  }

  function guessCategory(name, group) {
    const g = (group || '').toLowerCase();
    const map = [
      ['Sports', /sport/], ['News', /news|business|weather|legislative/], ['Movies', /movie|classic/], ['Kids', /kid|animation|family/],
      ['Music', /music/], ['Documentary', /docu|science|education|culture|history/], ['Comedy & Series', /series|comedy/],
      ['Lifestyle', /lifestyle|cooking|travel|outdoor|auto|relax|shop/], ['Religious', /relig/],
    ];
    return map.find(([, re]) => re.test(g) || re.test(name.toLowerCase()))?.[0] || 'Entertainment';
  }

  async function loadChannels() {
    const seen = new Set();
    const add = (list, origin) => list.forEach((raw, i) => {
      if (seen.has(raw.u)) return;
      seen.add(raw.u);
      const it = liveItem(raw, i, origin);
      register(it); channels.push(it);
    });

    // Featured sports first so they lead the Sports row
    add(SKY_RACING.map(s => ({ n: s.name, u: s.url, c: 'Sports', q: 'HD', s: 'SKY Racing' })), 'sky');

    try {
      const res = await fetch('/data/channels.json');
      add(await res.json(), 'xspf');
    } catch (e) { console.warn('channels.json failed', e); }

    await Promise.all(settings.sources.map(async (src, si) => {
      try {
        const res = await fetch(src);
        add(parseM3U(await res.text()), 'src' + si);
      } catch (e) { console.warn('source failed', src, e); toast(`Couldn't load playlist: ${src}`); }
    }));
    return channels;
  }

  const visibleChannels = () => channels.filter(c => !c.isPlaylist && (settings.showAll || isPlayable(c)));

  // ---------------------------------------------------------------- data: movies (archive.org)
  function movieItem(doc) {
    return {
      key: 'm:' + doc.identifier, type: 'vod', id: doc.identifier,
      name: doc.title || doc.identifier, year: doc.year || '',
      desc: Array.isArray(doc.description) ? doc.description[0] : (doc.description || ''),
      img: `https://archive.org/services/img/${encodeURIComponent(doc.identifier)}`,
    };
  }

  async function archiveSearch(q, rows = 40, sort = 'downloads desc') {
    const cacheKey = q + '|' + rows;
    if (movieCache.has(cacheKey)) return movieCache.get(cacheKey);
    const params = new URLSearchParams({ q, rows, page: 1, output: 'json' });
    ['identifier', 'title', 'year', 'description'].forEach(f => params.append('fl[]', f));
    params.append('sort[]', sort);
    const p = fetch(`https://archive.org/advancedsearch.php?${params}`)
      .then(r => r.json())
      .then(j => j.response.docs.map(movieItem).map(m => (register(m), m)))
      .catch(e => { console.warn('archive search failed', e); movieCache.delete(cacheKey); return []; });
    movieCache.set(cacheKey, p);
    return p;
  }

  async function resolveMovieUrl(item) {
    const meta = await fetch(`https://archive.org/metadata/${encodeURIComponent(item.id)}`).then(r => r.json());
    const files = meta.files || [];
    const rank = ['h.264 HD', 'h.264', 'MPEG4', '512Kb MPEG4', 'h.264 IA'];
    const mp4s = files.filter(f => /\.mp4$/i.test(f.name));
    mp4s.sort((a, b) => {
      const ra = rank.indexOf(a.format), rb = rank.indexOf(b.format);
      return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
    });
    const file = mp4s[0];
    if (!file) throw new Error('No playable video file found for this title.');
    if (!item.desc && meta.metadata?.description) item.desc = [].concat(meta.metadata.description)[0];
    return `https://archive.org/download/${encodeURIComponent(item.id)}/${file.name.split('/').map(encodeURIComponent).join('/')}`;
  }

  // ---------------------------------------------------------------- data: TMDB
  const tmdbCache = new Map();
  const hasTmdb = () => !!settings.tmdbKey;

  async function tmdb(path, params = {}) {
    const url = `${TMDB_API}/${path}?${new URLSearchParams({ api_key: settings.tmdbKey, language: 'en-AU', ...params })}`;
    if (!tmdbCache.has(url)) {
      const p = fetch(url).then(r => {
        if (r.status === 401) { toast('TMDB key rejected — check it in Settings'); throw new Error('TMDB key rejected'); }
        if (!r.ok) throw new Error(`TMDB error ${r.status}`);
        return r.json();
      });
      p.catch(() => tmdbCache.delete(url));
      tmdbCache.set(url, p);
    }
    return tmdbCache.get(url);
  }

  function tmdbItem(m) {
    return {
      key: 't:' + m.id, type: 'tmdb', id: m.id,
      name: m.title || m.original_title || 'Untitled', year: (m.release_date || '').slice(0, 4),
      desc: m.overview || '', rating: m.vote_average ? m.vote_average.toFixed(1) : '',
      img: m.poster_path ? TMDB_IMG + 'w342' + m.poster_path : '',
      backdrop: m.backdrop_path ? TMDB_IMG + 'w780' + m.backdrop_path : '',
    };
  }

  // One or more pages of a movie list, de-duplicated, with posters only
  async function tmdbList(path, params = {}, pages = 1) {
    try {
      const pagesData = await Promise.all(Array.from({ length: pages }, (_, i) => tmdb(path, { region: TMDB_REGION, ...params, page: i + 1 })));
      const seen = new Set();
      return pagesData.flatMap(p => p.results || [])
        .filter(m => m.poster_path && !seen.has(m.id) && seen.add(m.id))
        .map(tmdbItem).map(m => (register(m), m));
    } catch (e) { console.warn('tmdb list failed', path, e); return []; }
  }
  const tmdbGenre = (id, pages = 1) => tmdbList('discover/movie', { with_genres: id, sort_by: 'popularity.desc', include_adult: false }, pages);
  const tmdbSearch = q => tmdbList('search/movie', { query: q, include_adult: false }, 1);

  const tmdbBanner = () => `<section class="row"><div class="setup-card">
    <div><b>Unlock posters, trailers &amp; “where to watch”</b>
    <p>Add a free TMDB API key (themoviedb.org → Settings → API) to browse trending, top-rated and genre movies with streaming info for Australia.</p></div>
    <button class="btn btn-red" data-act="opensettings">Add key</button></div></section>`;

  function tmdbHomeRows() {
    if (!hasTmdb()) return tmdbBanner();
    return [
      asyncRow('Trending Movies', tmdbList('trending/movie/week'), '#movies/tmdb-trending'),
      asyncRow('Top Rated', tmdbList('movie/top_rated', {}, 1), '#movies/tmdb-top'),
      asyncRow('In Cinemas Now', tmdbList('movie/now_playing'), '#movies/tmdb-now'),
      asyncRow('Action', tmdbGenre(28), '#movies/tmdb-g28'),
      asyncRow('Comedy', tmdbGenre(35), '#movies/tmdb-g35'),
    ].join('');
  }

  // ---------------------------------------------------------------- my list & history
  const myList = () => store.get('mylist', []);
  const inMyList = key => myList().some(i => i.key === key);
  function toggleMyList(item) {
    let list = myList();
    if (list.some(i => i.key === item.key)) { list = list.filter(i => i.key !== item.key); toast('Removed from My List'); }
    else { list.unshift(snapshot(item)); toast('Added to My List'); }
    store.set('mylist', list.slice(0, 200));
  }
  function pushHistory(item) {
    const list = store.get('history', []).filter(i => i.key !== item.key);
    list.unshift(snapshot(item));
    store.set('history', list.slice(0, 30));
  }
  // Saved items survive reloads even if the source list changes
  const snapshot = it => {
    const { key, type, name, url, cat, quality, source, logo, needsHeaders, id, year, desc, img, backdrop, rating } = it;
    return { key, type, name, url, cat, quality, source, logo, needsHeaders, id, year, desc: (desc || '').slice(0, 400), img, backdrop, rating };
  };
  const revive = saved => items.get(saved.key) || (register(saved), saved);

  // ---------------------------------------------------------------- card rendering
  function cardHTML(item) {
    register(item);
    if (item.type === 'vod' || item.type === 'tmdb') {
      return `<button class="card poster" data-key="${esc(item.key)}" aria-label="${esc(item.name)}">
        <img loading="lazy" src="${esc(item.img)}" alt="" onerror="this.style.opacity=0">
        <span class="poster-title">${esc(item.name)}${item.year ? ` <small>(${esc(item.year)})</small>` : ''}</span>
      </button>`;
    }
    if (item.type === 'link') {
      return `<a class="card link-card" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
        <span class="ico">${item.icon}</span><span><span class="name">${esc(item.name)}</span><span class="meta">${esc(item.note)} ↗</span></span>
      </a>`;
    }
    const ok = isPlayable(item);
    const meta = [item.source, item.quality].filter(Boolean).join(' · ') || item.cat;
    return `<button class="card" data-key="${esc(item.key)}" aria-label="${esc(item.name)}">
      <span class="badge ${ok ? '' : 'warn'}">${ok ? '<span class="dot" style="background:#fff"></span>LIVE' : 'VLC'}</span>
      ${inMyList(item.key) ? '<span class="fav">★</span>' : ''}
      <span class="tile" style="--tile:${tileColor(item.name)}" data-initials="${esc(initials(item.name))}">
        ${item.logo ? `<img loading="lazy" src="${esc(item.logo)}" alt="" style="position:absolute;inset:18% 25% 38%;width:50%;height:44%;object-fit:contain" onerror="this.remove()">` : ''}
        <span class="name">${esc(item.name)}</span>
        <span class="meta">${esc(meta)}</span>
      </span>
    </button>`;
  }

  function rowHTML(title, list, seeAll, extraClass = '') {
    if (!list.length) return '';
    return `<section class="row ${extraClass}">
      <div class="row-head"><h2>${esc(title)}</h2>${seeAll ? `<a class="see-all" href="${esc(seeAll)}">See all ›</a>` : ''}</div>
      <div class="row-track-wrap">
        <button class="row-arrow left" aria-label="Scroll left"><svg viewBox="0 0 24 24"><path d="M15 18 9 12l6-6"/></svg></button>
        <div class="row-track">${list.map(cardHTML).join('')}</div>
        <button class="row-arrow right" aria-label="Scroll right"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></button>
      </div>
    </section>`;
  }

  // Async row: placeholder now, filled when data arrives
  function asyncRow(title, promise, seeAll) {
    const id = 'r' + Math.random().toString(36).slice(2);
    promise.then(list => {
      const el = document.getElementById(id);
      if (el) el.outerHTML = rowHTML(title, list, seeAll) || '';
    });
    return `<div id="${id}" class="row"><div class="row-head"><h2>${esc(title)}</h2></div><div class="row-track"><div class="spinner" style="margin:30px var(--gutter)"></div></div></div>`;
  }

  // Infinite grid for long lists
  function mountGrid(container, list, posters = false) {
    if (!list.length) { container.innerHTML = '<div class="empty">Nothing here yet.</div>'; return; }
    container.innerHTML = `<div class="grid ${posters ? 'posters' : ''}"></div><div class="grid-sentinel"></div>`;
    const grid = container.querySelector('.grid');
    let i = 0;
    const more = () => { grid.insertAdjacentHTML('beforeend', list.slice(i, i + GRID_CHUNK).map(cardHTML).join('')); i += GRID_CHUNK; if (i >= list.length) io.disconnect(); };
    const io = new IntersectionObserver(e => e[0].isIntersecting && more(), { rootMargin: '800px' });
    more();
    io.observe(container.querySelector('.grid-sentinel'));
  }

  // ---------------------------------------------------------------- views
  const view = $('#view');
  let heroHls = null;

  function stopHero() { if (heroHls) { heroHls.destroy(); heroHls = null; } const v = $('#heroVideo'); if (v) { v.pause(); v.removeAttribute('src'); v.load(); } }

  function startHero(url) {
    const v = $('#heroVideo');
    if (!v) return;
    v.muted = true;
    v.addEventListener('playing', () => v.style.opacity = 1, { once: true });
    if (!IS_IOS && window.Hls?.isSupported()) {
      heroHls = new Hls({ maxBufferLength: 8, capLevelToPlayerSize: true });
      heroHls.loadSource(url); heroHls.attachMedia(v);
      heroHls.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}));
    } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = url; v.play().catch(() => {});
    }
  }

  async function renderHome() {
    const hero = channels.find(c => c.url === SKY_RACING[0].url);
    const all = visibleChannels();
    const byCat = cat => all.filter(c => c.cat === cat);
    const history = store.get('history', []).map(revive);
    const mine = myList().map(revive);

    view.innerHTML = `
      <section class="hero">
        <div class="hero-bg"></div>
        <video id="heroVideo" muted playsinline autoplay loop style="opacity:0;transition:opacity 1s"></video>
        <div class="hero-content">
          <span class="hero-tag"><span class="dot"></span> Live now · Sports</span>
          <h1>SKY Racing Live</h1>
          <p>Thoroughbred, harness and greyhound racing from around Australia — streaming live 24/7. Plus ${all.length.toLocaleString()} live TV channels and hundreds of classic films.</p>
          <div class="hero-actions">
            <button class="btn btn-play" data-key="${esc(hero.key)}"><svg viewBox="0 0 24 24"><path d="M6 4v16l14-8z"/></svg>Play</button>
            <a class="btn btn-more" href="#sports"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>All Sports</a>
          </div>
        </div>
      </section>
      <div class="rows">
        ${rowHTML('Continue Watching', history.slice(0, ROW_LIMIT))}
        ${rowHTML('My List', mine.slice(0, ROW_LIMIT), '#mylist')}
        ${tmdbHomeRows()}
        ${rowHTML('Live Sports', byCat('Sports').slice(0, ROW_LIMIT), '#sports')}
        ${asyncRow('Free Movies — Classic Features', archiveSearch(movieQuery('classics')), '#movies')}
        ${rowHTML('Pluto TV Channels', all.filter(c => c.source === 'Pluto TV').slice(0, ROW_LIMIT), '#live/Pluto TV')}
        ${rowHTML('24/7 Movie Channels', byCat('Movies').slice(0, ROW_LIMIT), '#live/Movies')}
        ${rowHTML('News', byCat('News').slice(0, ROW_LIMIT), '#live/News')}
        ${asyncRow('Horror', archiveSearch(movieQuery('horror')), '#movies/horror')}
        ${rowHTML('Comedy & Series', byCat('Comedy & Series').slice(0, ROW_LIMIT), '#live/Comedy & Series')}
        ${rowHTML('Kids & Family', byCat('Kids').slice(0, ROW_LIMIT), '#live/Kids')}
        ${rowHTML('Documentaries', byCat('Documentary').slice(0, ROW_LIMIT), '#live/Documentary')}
        ${rowHTML('Music', byCat('Music').slice(0, ROW_LIMIT), '#live/Music')}
        ${asyncRow('Film Noir', archiveSearch(movieQuery('noir')), '#movies/noir')}
        ${rowHTML('Lifestyle', byCat('Lifestyle').slice(0, ROW_LIMIT), '#live/Lifestyle')}
        ${rowHTML('More Live TV', byCat('Entertainment').slice(0, ROW_LIMIT), '#live/Entertainment')}
        ${rowHTML('Quick Links', QUICK_LINKS.map((l, i) => ({ ...l, type: 'link', key: 'q:' + i })))}
      </div>`;
    startHero(hero.url);
  }

  function renderLive(cat) {
    const all = visibleChannels();
    const counts = all.reduce((a, c) => (a[c.cat] = (a[c.cat] || 0) + 1, a), {});
    const sources = [...new Set(all.map(c => c.source).filter(Boolean))];
    const chips = ['All', ...CATEGORY_ORDER.filter(c => counts[c]), ...sources];
    const active = cat || 'All';
    const list = active === 'All' ? all : all.filter(c => c.cat === active || c.source === active);
    view.innerHTML = `<div class="page">
      <div class="page-head"><h1>Live TV</h1><span class="count">${list.length.toLocaleString()} channels${settings.showAll ? '' : ' · browser-playable only'}</span></div>
      <div class="chips">${chips.map(c => `<a class="chip ${c === active ? 'active' : ''}" href="#live/${encodeURIComponent(c)}">${esc(c)}${counts[c] ? ` · ${counts[c]}` : ''}</a>`).join('')}</div>
      <div id="gridMount"></div>
    </div>`;
    mountGrid($('#gridMount'), list);
  }

  function renderSports() {
    const sports = visibleChannels().filter(c => c.cat === 'Sports');
    view.innerHTML = `<div class="page">
      <div class="page-head"><h1>Sports</h1><span class="count">${sports.length} live channels</span></div>
      <div class="rows">
        ${rowHTML('SKY Racing', channels.filter(c => c.source === 'SKY Racing'))}
        ${rowHTML('Sports Links', QUICK_LINKS.slice(0, 1).map((l, i) => ({ ...l, type: 'link', key: 'q:' + i })))}
      </div>
      <div class="row-head"><h2>All Sports Channels</h2></div>
      <div id="gridMount"></div>
    </div>`;
    mountGrid($('#gridMount'), sports.filter(c => c.source !== 'SKY Racing'));
  }

  function renderMovies(collection) {
    if (collection?.startsWith('tmdb-')) return renderTmdbList(collection.slice(5));
    if (collection) {
      const c = MOVIE_COLLECTIONS.find(m => m.id === collection) || MOVIE_COLLECTIONS[0];
      view.innerHTML = `<div class="page">
        <div class="page-head"><h1>${esc(c.title)}</h1><span class="count">Public domain · Internet Archive</span></div>
        <div class="chips">${MOVIE_COLLECTIONS.map(m => `<a class="chip ${m.id === c.id ? 'active' : ''}" href="#movies/${m.id}">${esc(m.title)}</a>`).join('')}</div>
        <div id="gridMount"><div class="spinner" style="margin:60px auto"></div></div>
      </div>`;
      archiveSearch(movieQuery(c.id), 300).then(list => { const m = $('#gridMount'); if (m) mountGrid(m, list, true); });
      return;
    }
    const tmdbRows = !hasTmdb() ? tmdbBanner() : [
      ...TMDB_LISTS.map(l => asyncRow(l.title, tmdbList(l.path), '#movies/tmdb-' + l.id)),
      ...TMDB_GENRES.map(([name, id]) => asyncRow(name, tmdbGenre(id), '#movies/tmdb-g' + id)),
    ].join('');
    view.innerHTML = `<div class="page">
      <div class="page-head"><h1>Movies</h1><span class="count">${hasTmdb() ? 'Posters, trailers &amp; where to watch in Australia' : 'Free, legal public-domain films + 24/7 movie channels'}</span></div>
      <div class="rows">
        ${tmdbRows}
        ${MOVIE_COLLECTIONS.map(c => asyncRow(c.title, archiveSearch(movieQuery(c.id)), '#movies/' + c.id)).join('')}
        ${rowHTML('24/7 Movie Channels', visibleChannels().filter(c => c.cat === 'Movies').slice(0, ROW_LIMIT), '#live/Movies')}
      </div>
      ${hasTmdb() ? `<p class="attrib">Streaming data by JustWatch via TMDB. ${TMDB_ATTRIBUTION}</p>` : ''}
    </div>`;
  }

  function renderTmdbList(id) {
    const list = TMDB_LISTS.find(l => l.id === id);
    const genre = TMDB_GENRES.find(([, g]) => 'g' + g === id);
    if (!hasTmdb() || (!list && !genre)) { location.hash = 'movies'; return; }
    const chips = [...TMDB_LISTS.map(l => [l.title, 'tmdb-' + l.id]), ...TMDB_GENRES.map(([n, g]) => [n, 'tmdb-g' + g])];
    view.innerHTML = `<div class="page">
      <div class="page-head"><h1>${esc(list ? list.title : genre[0])}</h1><span class="count">Australia · via TMDB</span></div>
      <div class="chips">${chips.map(([t, k]) => `<a class="chip ${k === 'tmdb-' + id ? 'active' : ''}" href="#movies/${k}">${esc(t)}</a>`).join('')}</div>
      <div id="gridMount"><div class="spinner" style="margin:60px auto"></div></div>
      <p class="attrib">Streaming data by JustWatch via TMDB. ${TMDB_ATTRIBUTION}</p>
    </div>`;
    const load = list ? tmdbList(list.path, {}, 5) : tmdbGenre(genre[1], 5);
    load.then(items => { const m = $('#gridMount'); if (m) mountGrid(m, items, true); });
  }

  function renderMyList() {
    const mine = myList().map(revive);
    view.innerHTML = `<div class="page">
      <div class="page-head"><h1>My List</h1><span class="count">${mine.length} saved</span></div>
      <div id="gridMount"></div>
    </div>`;
    if (!mine.length) { $('#gridMount').innerHTML = '<div class="empty">Tap <b>+ My List</b> on any movie or while watching a channel to save it here.</div>'; return; }
    mountGrid($('#gridMount'), mine);
  }

  function renderSearch(q) {
    const term = q.trim().toLowerCase();
    const live = term ? visibleChannels().filter(c => c.name.toLowerCase().includes(term) || c.cat.toLowerCase() === term) : [];
    const safe = term.replace(/[^\p{L}\p{N} ]/gu, ' ').trim();
    view.innerHTML = `<div class="page">
      <div class="page-head"><h1>Results for “${esc(q)}”</h1><span class="count">${live.length} channels</span></div>
      <div class="rows">
        ${safe && hasTmdb() ? asyncRow('Movies on TMDB', tmdbSearch(q.trim()), '') : ''}
        ${safe ? asyncRow('Public-domain films',archiveSearch(`title:(${safe}) AND mediatype:(movies) AND collection:(feature_films OR SciFi_Horror OR animationandcartoons OR silent_films) AND format:(MPEG4 OR "h.264")`, 40)) : ''}
      </div>
      <div class="row-head"><h2>Live Channels</h2></div>
      <div id="gridMount"></div>
    </div>`;
    mountGrid($('#gridMount'), live);
  }

  // ---------------------------------------------------------------- router
  async function route() {
    stopHero();
    const [name, ...rest] = decodeURIComponent(location.hash.slice(1) || 'home').split('/');
    const arg = rest.join('/');
    document.querySelectorAll('[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === name));
    await channelsReady;
    window.scrollTo(0, 0);
    switch (name) {
      case 'live': renderLive(arg); break;
      case 'sports': renderSports(); break;
      case 'movies': renderMovies(arg); break;
      case 'mylist': renderMyList(); break;
      case 'search': renderSearch(arg); break;
      default: renderHome();
    }
    $('#topbar').classList.toggle('solid', name !== 'home' && name !== '');
    onScroll();
  }

  // ---------------------------------------------------------------- player
  const player = $('#player'), video = $('#video'), msg = $('#playerMsg');
  let hls = null, current = null, currentList = [], stallTimer = null;

  function vlcLinks(url) {
    return {
      ios: `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(url)}`,
      android: `intent:${url}#Intent;package=org.videolan.vlc;type=video/*;end`,
    };
  }

  function showPlayerMsg(title, text, item) {
    const v = vlcLinks(item.url);
    msg.innerHTML = `<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="btns">
      ${item.type === 'live' ? `<a class="btn btn-red" href="${/Android/.test(navigator.userAgent) ? v.android : v.ios}">Open in VLC</a>` : ''}
      <button class="btn btn-more" data-act="copy">Copy stream URL</button>
      ${item.type === 'live' && currentList.length > 1 ? '<button class="btn btn-play" data-act="next">Next channel</button>' : ''}
    </div>`;
    msg.hidden = false;
  }

  function teardown() {
    clearTimeout(stallTimer);
    if (hls) { hls.destroy(); hls = null; }
    video.pause(); video.removeAttribute('src'); video.load();
  }

  async function play(item, list = []) {
    stopHero();
    teardown();
    current = item;
    currentList = list.length ? list : [item];
    player.hidden = false;
    document.body.style.overflow = 'hidden';
    $('#playerTitle').textContent = item.name;
    $('#playerSub').textContent = item.type === 'live' ? [item.source, item.quality, item.cat].filter(Boolean).join(' · ') : (item.year || '');
    $('#playerLive').hidden = item.type !== 'live';
    $('#playerPrev').hidden = $('#playerNext').hidden = item.type !== 'live' || currentList.length < 2;
    msg.innerHTML = '<div class="spinner"></div>'; msg.hidden = false;
    pushHistory(item);
    wakeControls();

    if (item.type === 'live' && !isPlayable(item)) {
      showPlayerMsg('Plays in VLC only', item.needsHeaders
        ? 'This channel needs special HTTP headers that web browsers can’t send.'
        : 'This channel streams over insecure http://, which browsers block on secure sites.', item);
      return;
    }

    let url = item.url;
    if (item.type === 'vod') {
      try { url = await resolveMovieUrl(item); } catch (e) { showPlayerMsg('Couldn’t load this film', e.message, item); return; }
      if (current !== item) return;
    }

    const fail = text => { if (current === item) showPlayerMsg('Channel unavailable', text, item); };
    stallTimer = setTimeout(() => fail('The stream didn’t start. It may be offline or geo-blocked in your region.'), 20000);
    video.onplaying = () => { clearTimeout(stallTimer); msg.hidden = true; };
    video.onerror = () => video.getAttribute('src') && fail('The stream returned an error. It may be offline or geo-blocked.');

    const isHls = /\.m3u8(\?|$)|\/hls\//i.test(url) || item.type === 'live';
    if (isHls && !IS_IOS && window.Hls?.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 30 });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => { video.muted = true; video.play().catch(() => {}); }));
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (!d.fatal) return;
        if (d.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
        fail(d.response?.code ? `Server responded ${d.response.code}. The channel may be offline or geo-blocked.` : 'Network error — the channel may be offline, geo-blocked, or not allow web playback.');
      });
    } else {
      video.src = url;
      video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
    }
  }

  function closePlayer() {
    teardown();
    current = null;
    player.hidden = true;
    msg.hidden = true;
    document.body.style.overflow = '';
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (!location.hash || location.hash === '#home') startHero(SKY_RACING[0].url);
  }

  function step(dir) {
    const playable = currentList.filter(isPlayable);
    if (!playable.length) return;
    const i = playable.indexOf(current);
    play(playable[(i + dir + playable.length) % playable.length], currentList);
  }

  let idleTimer;
  function wakeControls() {
    player.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => player.classList.add('idle'), 3500);
  }

  // ---------------------------------------------------------------- modals
  const modal = $('#modal'), modalCard = $('#modalCard');
  const closeBtn = '<button class="icon-btn modal-close" data-act="close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button>';
  function openModal(html) { modalCard.innerHTML = closeBtn + html; modal.hidden = false; document.body.style.overflow = 'hidden'; }
  function closeModal() { modal.hidden = true; if (player.hidden) document.body.style.overflow = ''; }

  function showMovie(item) {
    openModal(`
      <div class="modal-hero"><img src="${esc(item.img)}" alt=""><div class="inner">
        <h2>${esc(item.name)}</h2>
        <div class="hero-actions">
          <button class="btn btn-play" data-act="play" data-key="${esc(item.key)}"><svg viewBox="0 0 24 24"><path d="M6 4v16l14-8z"/></svg>Play</button>
          <button class="btn btn-more" data-act="fav" data-key="${esc(item.key)}">${inMyList(item.key) ? '✓ In My List' : '+ My List'}</button>
        </div>
      </div></div>
      <div class="modal-body">
        <div class="facts"><span class="ok">Free</span>${item.year ? `<span>${esc(item.year)}</span>` : ''}<span>Public domain · Internet Archive</span></div>
        <p>${esc((item.desc || 'No description available.').replace(/<[^>]+>/g, ' ').slice(0, 900))}</p>
      </div>`);
  }

  async function showTmdb(item) {
    openModal('<div class="spinner" style="margin:80px auto"></div>');
    let d;
    try {
      d = await tmdb(`movie/${item.id}`, { append_to_response: 'videos,watch/providers,credits' });
    } catch (e) {
      openModal(`<div class="modal-body" style="padding-top:28px"><p>${esc(e.message)}</p></div>`);
      return;
    }
    const wp = d['watch/providers']?.results?.[TMDB_REGION];
    const videos = d.videos?.results || [];
    const trailer = videos.find(v => v.site === 'YouTube' && v.type === 'Trailer') || videos.find(v => v.site === 'YouTube');
    const runtime = d.runtime ? `${Math.floor(d.runtime / 60)}h ${d.runtime % 60}m` : '';
    const cast = (d.credits?.cast || []).slice(0, 5).map(c => c.name).join(', ');
    const genres = (d.genres || []).map(g => g.name).join(' · ');
    const uniq = list => list.filter((p, i, a) => a.findIndex(q => q.provider_id === p.provider_id) === i);
    const groups = wp ? [
      ['Free to watch', uniq([...(wp.free || []), ...(wp.ads || [])])],
      ['Included with subscription', uniq(wp.flatrate || [])],
      ['Rent', uniq(wp.rent || [])],
      ['Buy', uniq(wp.buy || [])],
    ].filter(([, list]) => list.length) : [];
    const providersHTML = groups.map(([label, list]) => `<h3>${label}</h3><div class="providers">${list.map(p => `
      <a class="provider" href="${esc(wp.link)}" target="_blank" rel="noopener noreferrer">
        ${p.logo_path ? `<img src="${TMDB_IMG}w92${esc(p.logo_path)}" alt="">` : ''}<span>${esc(p.provider_name)}</span>
      </a>`).join('')}</div>`).join('');
    const img = item.backdrop || item.img;

    openModal(`
      <div class="modal-hero" style="--tile:${tileColor(item.name)}">
        ${img ? `<img src="${esc(img)}" alt="">` : ''}
        <div class="inner">
          <h2>${esc(item.name)}</h2>
          <div class="hero-actions">
            <button class="btn btn-more" data-act="fav" data-key="${esc(item.key)}">${inMyList(item.key) ? '✓ In My List' : '+ My List'}</button>
          </div>
        </div>
      </div>
      <div class="modal-body">
        <div class="facts">
          ${(d.vote_average ? d.vote_average.toFixed(1) : item.rating) ? `<span class="ok">★ ${esc(d.vote_average ? d.vote_average.toFixed(1) : item.rating)}</span>` : ''}
          ${item.year ? `<span>${esc(item.year)}</span>` : ''}${runtime ? `<span>${runtime}</span>` : ''}${genres ? `<span>${esc(genres)}</span>` : ''}
        </div>
        <p>${esc(d.overview || item.desc || 'No description available.')}</p>
        ${cast ? `<p style="margin-top:10px;color:var(--muted)">Starring ${esc(cast)}</p>` : ''}
        ${trailer ? `<div class="trailer"><iframe src="https://www.youtube-nocookie.com/embed/${esc(trailer.key)}" title="Trailer" allow="encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>` : ''}
        <h3>Where to watch in Australia</h3>
        ${providersHTML || '<p style="color:var(--muted)">Not currently listed for streaming in Australia.</p>'}
        <p class="attrib">Streaming data by JustWatch via TMDB. ${TMDB_ATTRIBUTION}</p>
      </div>`);
  }

  async function saveTmdbKey(key) {
    if (!/^[a-f0-9]{32}$/i.test(key)) {
      toast(key.startsWith('eyJ') ? 'That’s a v4 token. Use the 32-character “API Key” (v3) instead.' : 'TMDB API keys are 32 characters long.');
      return;
    }
    settings.tmdbKey = key; saveSettings(); tmdbCache.clear();
    closeModal();
    toast('TMDB key saved');
    route();
  }

  function showChannel(item) {
    const v = vlcLinks(item.url);
    openModal(`
      <div class="modal-hero" style="--tile:${tileColor(item.name)}"><div class="inner">
        <h2>${esc(item.name)}</h2>
        <div class="hero-actions">
          <a class="btn btn-red" href="${/Android/.test(navigator.userAgent) ? v.android : v.ios}">Open in VLC</a>
          <button class="btn btn-more" data-act="fav" data-key="${esc(item.key)}">${inMyList(item.key) ? '✓ In My List' : '+ My List'}</button>
        </div>
      </div></div>
      <div class="modal-body">
        <div class="facts"><span>${esc(item.cat)}</span>${item.quality ? `<span>${esc(item.quality)}</span>` : ''}</div>
        <p>This channel can’t play inside a web browser (${item.needsHeaders ? 'it needs custom HTTP headers' : 'it uses insecure http://'}). Open it in the free VLC app instead.</p>
        <p style="margin-top:10px"><code>${esc(item.url)}</code></p>
      </div>`);
    modalCard.dataset.url = item.url;
  }

  function showSettings() {
    openModal(`
      <div class="modal-body" style="padding-top:28px">
        <h2 style="font-size:24px;margin-bottom:6px">Settings</h2>
        <h3>Channels</h3>
        <label><input type="checkbox" id="optShowAll" ${settings.showAll ? 'checked' : ''}> Show channels that only play in VLC (http:// or header-protected)</label>
        <h3>TMDB: posters, trailers &amp; where to watch</h3>
        <p style="color:var(--muted)">${hasTmdb() ? `Key saved (ends …${esc(settings.tmdbKey.slice(-4))}). It's stored only on this device.` : 'Paste your free API key from themoviedb.org → Settings → API. It is stored only on this device.'}</p>
        <div class="form-row"><input type="text" id="tmdbInput" placeholder="TMDB API key (v3)" autocomplete="off" spellcheck="false"><button class="btn btn-red" data-act="savetmdb" style="padding:8px 16px">Save</button>${hasTmdb() ? '<button class="btn btn-more" data-act="cleartmdb" style="padding:8px 16px">Remove</button>' : ''}</div>
        <p style="color:#777;font-size:12px;margin-top:8px">${TMDB_ATTRIBUTION}</p>
        <h3>Playlists (M3U)</h3>
        <p style="color:var(--muted)">Add any M3U/M3U8 playlist URL. It must be https and allow cross-origin requests.</p>
        <ul class="src-list">${settings.sources.map((s, i) => `<li><span>${esc(s)}</span><button class="btn btn-more" style="padding:4px 10px;font-size:12px" data-act="rmsrc" data-i="${i}">Remove</button></li>`).join('') || '<li><span style="color:var(--muted)">No extra playlists.</span></li>'}</ul>
        <div class="form-row"><input type="url" id="srcInput" placeholder="https://example.com/playlist.m3u"><button class="btn btn-red" data-act="addsrc" style="padding:8px 16px">Add</button></div>
        <button class="btn btn-more" data-act="addiptv" style="margin-top:10px;font-size:13px;padding:6px 12px">+ Add iptv-org full list</button>
        <h3>Data</h3>
        <button class="btn btn-more" data-act="clearhist" style="font-size:13px;padding:6px 12px">Clear watch history</button>
        <h3>Install on your phone</h3>
        <p><b>iPhone / iPad:</b> open in Safari → Share → <i>Add to Home Screen</i>.<br><b>Android:</b> open in Chrome → ⋮ menu → <i>Install app</i>.</p>
      </div>`);
  }

  function addSource(url) {
    if (!/^https:\/\//.test(url)) { toast('Playlist URL must start with https://'); return; }
    if (settings.sources.includes(url)) { toast('Already added'); return; }
    settings.sources.push(url); saveSettings();
    toast('Playlist added — reloading…');
    setTimeout(() => location.reload(), 700);
  }

  // ---------------------------------------------------------------- events
  document.addEventListener('click', e => {
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      const item = items.get(act.dataset.key);
      if (a === 'close') closeModal();
      else if (a === 'play' && item) { closeModal(); play(item); }
      else if (a === 'fav' && item) { toggleMyList(item); act.textContent = inMyList(item.key) ? '✓ In My List' : '+ My List'; }
      else if (a === 'next') step(1);
      else if (a === 'copy') navigator.clipboard?.writeText(current?.url || modalCard.dataset.url || '').then(() => toast('Stream URL copied'));
      else if (a === 'addsrc') addSource($('#srcInput').value.trim());
      else if (a === 'addiptv') addSource('https://iptv-org.github.io/iptv/index.m3u');
      else if (a === 'rmsrc') { settings.sources.splice(+act.dataset.i, 1); saveSettings(); location.reload(); }
      else if (a === 'clearhist') { store.set('history', []); toast('History cleared'); }
      else if (a === 'opensettings') showSettings();
      else if (a === 'savetmdb') saveTmdbKey($('#tmdbInput').value.trim());
      else if (a === 'cleartmdb') { settings.tmdbKey = ''; saveSettings(); tmdbCache.clear(); toast('TMDB key removed'); route(); showSettings(); }
      return;
    }

    const card = e.target.closest('[data-key]');
    if (card && !card.closest('.modal')) {
      const item = items.get(card.dataset.key);
      if (!item) return;
      if (item.type === 'vod') return showMovie(item);
      if (item.type === 'tmdb') return showTmdb(item);
      if (item.isPlaylist) return addSource(item.url.replace(/^http:/, 'https:'));
      if (!isPlayable(item)) return showChannel(item);
      const siblings = [...card.parentElement.querySelectorAll('[data-key]')].map(el => items.get(el.dataset.key)).filter(i => i?.type === 'live');
      return play(item, siblings);
    }

    const arrow = e.target.closest('.row-arrow');
    if (arrow) {
      const track = arrow.parentElement.querySelector('.row-track');
      track.scrollBy({ left: (arrow.classList.contains('left') ? -1 : 1) * track.clientWidth * 0.9, behavior: 'smooth' });
    }
  });

  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  modal.addEventListener('change', e => { if (e.target.id === 'optShowAll') { settings.showAll = e.target.checked; saveSettings(); route(); } });

  $('#playerClose').onclick = closePlayer;
  $('#playerPrev').onclick = () => step(-1);
  $('#playerNext').onclick = () => step(1);
  player.addEventListener('pointermove', wakeControls);
  player.addEventListener('touchstart', wakeControls, { passive: true });

  // Add the current channel to My List from inside the player
  const favBtn = document.createElement('button');
  favBtn.className = 'icon-btn'; favBtn.title = 'My List'; favBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
  favBtn.onclick = () => current && toggleMyList(current);
  $('.player-nav').prepend(favBtn);

  document.addEventListener('keydown', e => {
    if (!player.hidden) {
      if (e.key === 'Escape') closePlayer();
      else if (e.key === 'ArrowUp' && current?.type === 'live') step(-1);
      else if (e.key === 'ArrowDown' && current?.type === 'live') step(1);
      else if (e.key === 'f') (document.fullscreenElement ? document.exitFullscreen() : player.requestFullscreen?.())?.catch?.(() => {});
      wakeControls();
    } else if (e.key === 'Escape' && !modal.hidden) closeModal();
  });

  // Search
  const searchInput = $('#searchInput');
  $('#searchToggle').onclick = () => { searchInput.classList.toggle('open'); if (searchInput.classList.contains('open')) searchInput.focus(); };
  searchInput.addEventListener('input', debounce(() => {
    const q = searchInput.value.trim();
    if (q.length >= 2) location.hash = 'search/' + encodeURIComponent(q);
  }, 350));
  $('#settingsBtn').onclick = showSettings;

  function onScroll() { if (!location.hash || location.hash === '#home') $('#topbar').classList.toggle('solid', scrollY > 60); }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('hashchange', route);

  // ---------------------------------------------------------------- boot
  view.innerHTML = '<div class="spinner" style="margin:40vh auto"></div>';
  channelsReady = loadChannels();
  route();

  if ('serviceWorker' in navigator && PAGE_IS_HTTPS) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
