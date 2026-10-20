/* StreamBox — Netflix-style player for live TV and sports. */
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
  ];

  const CATEGORY_ORDER = ['Sports', 'Movies', 'News', 'Comedy & Series', 'Kids', 'Documentary', 'Music', 'Lifestyle', 'Religious', 'Entertainment'];
  const ROW_LIMIT = 30;
  const GRID_CHUNK = 120;
  const PAGE_IS_HTTPS = location.protocol === 'https:';
  const IS_IOS = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const IS_ANDROID = /Android/.test(navigator.userAgent);
  const VLC_STORES = {
    ios: 'https://apps.apple.com/app/vlc-for-mobile/id650377962',
    android: 'https://play.google.com/store/apps/details?id=org.videolan.vlc',
    desktop: 'https://www.videolan.org/vlc/',
  };
  const VLC_LIST_LIMIT = 3000;

  const movies = window.StreamBoxMovies;
  const movy = window.StreamBoxMovy;

  // ---------------------------------------------------------------- storage
  const store = {
    get(key, fallback) { try { const v = localStorage.getItem('sb:' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem('sb:' + key, JSON.stringify(value)); } catch { /* private mode */ } },
  };
  const settings = Object.assign({ showAll: false, autoVlc: true, hideBad: true, sources: [], guides: [], proxyUrl: '', proxyToken: '' }, store.get('settings', {}));
  const saveSettings = () => store.set('settings', settings);

  // ---------------------------------------------------------------- state
  const items = new Map();        // key -> item, every card on screen points here
  let channels = [];              // live channels (bundled + user playlists)
  let channelsReady = null;       // promise
  let vlcList = { name: 'streambox', items: [] };   // channels on the current page, for "Play this list in VLC"

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

  // A browser can load a stream directly unless it needs custom headers or is plain http:// on an https page.
  // With a StreamBox proxy configured (Settings), every channel can play in the app.
  const CORS_EXEMPT = IS_IOS || IS_ANDROID;   // the phone's own HLS player ignores CORS; desktop hls.js can't
  const directOK = ch => ch.type !== 'live' || (!ch.needsHeaders && (!PAGE_IS_HTTPS || ch.url.startsWith('https://')) && !(ch.noCors && !CORS_EXEMPT));
  const hasProxy = () => {
    try {
      const u = new URL(settings.proxyUrl);
      return u.protocol === 'https:' || !PAGE_IS_HTTPS || /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
    } catch { return false; }
  };
  const isPlayable = ch => directOK(ch) || hasProxy();
  const proxiedUrl = item => {
    const q = (k, v) => (v ? `&${k}=${encodeURIComponent(v)}` : '');
    return `${settings.proxyUrl.replace(/\/+$/, '')}/hls?u=${encodeURIComponent(item.url)}${q('ua', item.ua)}${q('rf', item.rf)}${q('k', settings.proxyToken)}`;
  };

  // Channels that failed to play on this device are hidden for 12 hours (Settings can reset this)
  const BAD_TTL = 12 * 3600e3;
  const bad = Object.fromEntries(Object.entries(store.get('bad', {})).filter(([, t]) => t > Date.now() - BAD_TTL));
  const isBad = ch => ch.type === 'live' && bad[ch.url] > Date.now() - BAD_TTL;
  function markBad(item) { if (item.type === 'live') { bad[item.url] = Date.now(); store.set('bad', bad); } }

  function register(item) { items.set(item.key, item); return item.key; }

  // ---------------------------------------------------------------- country / area of origin
  // Each channel's country comes from its iptv-org ID, e.g. "BBCOne.uk@SD" -> United Kingdom.
  const CC_ALIAS = { uk: 'gb' };
  const AREAS = {
    Americas: 'ag ai ar aw bb bm bo br bs bz ca cl co cr cu cw dm do ec gd gf gl gp gt gy hn ht jm kn ky lc mq ms mx ni pa pe pr py sr sv tt us uy vc ve vg vi',
    Europe: 'ad al am at az ba be bg by ch cy cz de dk ee es fi fo fr gb ge gg gi gr hr hu ie im is it je li lt lu lv mc md me mk mt nl no pl pt ro rs ru se si sk sm ua va xk',
    Asia: 'af bd bn bt cn hk id in jp kg kh kp kr kz la lk mm mn mo mv my np pk ph sg th tj tl tm tw uz vn',
    'Middle East': 'ae bh iq ir il jo kw lb om ps qa sa sy tr ye',
    Africa: 'ao bf bi bj bw cd cf cg ci cm cv dj dz eg er et ga gh gm gn gq gw ke km lr ls ly ma mg ml mr mu mw mz na ne ng re rw sc sd sh sl sn so ss st sz td tg tn tz ug yt za zm zw',
    Oceania: 'as au ck fj fm gu ki mh mp nc nr nu nz pf pg pw sb to tv vu wf ws',
  };
  const AREA_ORDER = ['Americas', 'Europe', 'Asia', 'Middle East', 'Africa', 'Oceania', 'International'];
  const AREA_OF = {};
  for (const [area, codes] of Object.entries(AREAS)) codes.split(' ').forEach(c => { AREA_OF[c] = area; });
  const areaOf = cc => AREA_OF[cc] || 'International';

  function ccFromId(id) {
    const m = /\.([a-z]{2})(?:@|$)/i.exec(id || '');
    const cc = m ? m[1].toLowerCase() : '';
    return CC_ALIAS[cc] || cc;
  }
  const regionNames = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; } })();
  function countryName(cc) {
    if (!cc) return 'International / Other';
    try { const n = regionNames?.of(cc.toUpperCase()); return n && n !== cc.toUpperCase() ? n : cc.toUpperCase(); } catch { return cc.toUpperCase(); }
  }
  // Flag emoji don't render on Windows, so use small images (hidden if they can't load)
  const flagUrl = cc => `https://flagcdn.com/w40/${cc}.png`;
  const flagImg = (cc, cls = 'flag') => (cc ? `<img class="${cls}" loading="lazy" src="${flagUrl(cc)}" alt="" onerror="this.remove()">` : `<span class="${cls} globe">🌐</span>`);

  function groupByCountry(list) {
    const by = new Map();
    for (const c of list) { const k = c.cc || ''; if (!by.has(k)) by.set(k, []); by.get(k).push(c); }
    return [...by].map(([cc, chans]) => ({ cc, name: countryName(cc), area: areaOf(cc), channels: chans }))
      .sort((a, b) => b.channels.length - a.channels.length || a.name.localeCompare(b.name));
  }

  // ---------------------------------------------------------------- data: channels
  function liveItem(raw, i, origin) {
    return {
      key: `l:${origin}:${i}`, type: 'live',
      name: raw.n, url: raw.u, cat: raw.c || 'Entertainment', quality: raw.q || '',
      source: raw.s || '', logo: raw.l || '', needsHeaders: !!raw.h, isPlaylist: !!raw.p, tvgId: raw.t || '',
      cc: ccFromId(raw.t),                  // country of origin (ISO 3166-1 alpha-2, lower case), '' if unknown
      ua: raw.ua || '', rf: raw.rf || '',   // HTTP headers the stream needs (sent via the VLC playlist / proxy)
      verified: !!raw.v,                    // manifest loaded with CORS when the build probed it
      noCors: !!raw.nc,                     // live, but its server sends no CORS header (browsers can't read it)
      dead: !!raw.dd,                       // manifest answered 404/410 when probed
    };
  }

  function parseM3U(text) {
    const out = [];
    out.guides = [];   // XMLTV guide URLs advertised in the #EXTM3U header
    let meta = null;
    for (const line of text.split(/\r?\n/)) {
      const l = line.trim();
      if (l.startsWith('#EXTM3U')) {
        (l.match(/(?:url-tvg|x-tvg-url)="([^"]*)"/)?.[1] || '').split(',').map(u => u.trim()).filter(u => /^https:\/\//.test(u)).forEach(u => out.guides.push(u));
      } else if (l.startsWith('#EXTINF')) {
        const attr = k => l.match(new RegExp(`${k}="([^"]*)"`))?.[1] || '';
        const title = l.slice(l.lastIndexOf(',') + 1).trim();
        meta = { n: title.replace(/\s*\(\d{3,4}p\)/, '').replace(/\s*\[[^\]]*\]/g, '').trim(), q: title.match(/\((\d{3,4}p)\)/)?.[1] || '', c: attr('group-title').split(';')[0], l: attr('tvg-logo'), t: attr('tvg-id') };
      } else if (l.startsWith('#EXTVLCOPT') && meta) {
        const m = /^#EXTVLCOPT:http-(user-agent|referrer)=(.*)$/.exec(l);
        if (m) { meta.h = 1; meta[m[1] === 'referrer' ? 'rf' : 'ua'] = m[2]; }
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
    add(SKY_RACING.map(s => ({ n: s.name, u: s.url, c: 'Sports', q: 'HD', s: 'SKY Racing', v: 1 })), 'sky');

    try {
      const res = await fetch('/data/channels.json');
      add(await res.json(), 'xspf');
    } catch (e) { console.warn('channels.json failed', e); }

    await Promise.all(settings.sources.map(async (src, si) => {
      try {
        const res = await fetch(src);
        const list = parseM3U(await res.text());
        list.guides.forEach(g => autoGuides.add(g));
        add(list, 'src' + si);
      } catch (e) { console.warn('source failed', src, e); toast(`Couldn't load playlist: ${src}`); }
    }));
    return channels;
  }

  const visibleChannels = () => channels
    .filter(c => !c.isPlaylist && (settings.showAll || (isPlayable(c) && !c.dead)) && !(settings.hideBad && isBad(c)))
    .sort((a, b) => (b.verified | 0) - (a.verified | 0));   // verified streams first

  // ---------------------------------------------------------------- data: TV guide (XMLTV)
  // Channels match a guide by tvg-id, or by normalised channel name. Only the next ~36 hours are kept.
  const guide = { byId: new Map(), byName: new Map() };
  const autoGuides = new Set();   // guide URLs advertised by the user's M3U playlists
  const normName = s => (s || '').toLowerCase().replace(/\b(hd|fhd|uhd|sd)\b/g, '').replace(/[^a-z0-9]/g, '');

  function parseXmltvTime(s) {
    const m = /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?\s*([+-])?(\d\d)?(\d\d)?/.exec(s || '');
    if (!m) return 0;
    const offset = m[7] ? (m[7] === '-' ? -1 : 1) * ((+m[8] || 0) * 60 + (+m[9] || 0)) : 0;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - offset * 60000;
  }

  async function fetchGuideText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (/\.gz(\?|$)/i.test(url) && 'DecompressionStream' in window) {
      try { return await new Response(res.clone().body.pipeThrough(new DecompressionStream('gzip'))).text(); }
      catch { /* server already decompressed it */ }
    }
    return res.text();
  }

  function ingestXmltv(xml) {
    if (xml.length > 80e6) throw new Error('guide file too large');
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('not valid XMLTV');
    const now = Date.now(), horizon = now + 36 * 3600e3;
    for (const ch of doc.getElementsByTagName('channel')) {
      const id = ch.getAttribute('id');
      if (!id) continue;
      for (const dn of ch.getElementsByTagName('display-name')) { const n = normName(dn.textContent); if (n) guide.byName.set(n, id); }
    }
    for (const p of doc.getElementsByTagName('programme')) {
      const start = parseXmltvTime(p.getAttribute('start')), stop = parseXmltvTime(p.getAttribute('stop'));
      if (!stop || stop < now || start > horizon) continue;
      const id = p.getAttribute('channel');
      if (!guide.byId.has(id)) guide.byId.set(id, []);
      guide.byId.get(id).push({ start, stop, title: p.getElementsByTagName('title')[0]?.textContent || '', desc: p.getElementsByTagName('desc')[0]?.textContent || '' });
    }
    guide.byId.forEach(list => list.sort((a, b) => a.start - b.start));
  }

  function guideFor(item) {
    if (!guide.byId.size || item.type !== 'live') return null;
    const id = item.tvgId && guide.byId.has(item.tvgId) ? item.tvgId : guide.byName.get(normName(item.name));
    const list = id && guide.byId.get(id);
    if (!list) return null;
    const t = Date.now();
    const now = list.find(p => p.start <= t && p.stop > t) || null;
    const next = list.find(p => p.start > t) || null;
    return now || next ? { now, next } : null;
  }

  // Update channel cards already on screen once guide data arrives or the programme changes
  function patchGuide() {
    document.querySelectorAll('.card[data-key]').forEach(el => {
      const it = items.get(el.dataset.key);
      const nowOn = it?.type === 'live' && guideFor(it)?.now;
      const meta = el.querySelector('.meta');
      if (nowOn && meta) meta.textContent = `Now: ${nowOn.title}`;
    });
    renderPlayerSub();
  }

  async function loadGuides() {
    const urls = [...new Set([...settings.guides, ...autoGuides])].slice(0, 5);
    for (const url of urls) {
      try { ingestXmltv(await fetchGuideText(url)); }
      catch (e) { console.warn('guide failed', url, e); toast(`Couldn’t load TV guide (${e.message})`); }
    }
    patchGuide();
  }

  // ---------------------------------------------------------------- my list & history
  const restoreMovie = saved => movy.restore(saved) || movies.restore(saved);
  const savedItems = list => list.filter(i => i?.type === 'live' || (i?.type === 'movie' && (items.get(i.key)?.type === 'movie' || restoreMovie(i)))); // Ignore obsolete discovery entries
  const myList = () => savedItems(store.get('mylist', []));
  for (const saved of [...store.get('mylist', []), ...store.get('history', [])]) {
    const restored = restoreMovie(saved);
    if (restored) register(restored);
  }
  const inMyList = key => myList().some(i => i.key === key);
  function toggleMyList(item) {
    let list = myList();
    if (list.some(i => i.key === item.key)) { list = list.filter(i => i.key !== item.key); toast('Removed from My List'); }
    else { list.unshift(snapshot(item)); toast('Added to My List'); }
    store.set('mylist', list.slice(0, 200));
  }
  function pushHistory(item) {
    const list = savedItems(store.get('history', [])).filter(i => i.key !== item.key);
    list.unshift(snapshot(item));
    store.set('history', list.slice(0, 30));
  }
  // Saved items survive reloads even if the source list changes
  const snapshot = it => {
    const { key, type, name, url, cat, quality, source, logo, needsHeaders, tvgId, ua, rf, id, catalog, mediaType, overview, year, vote, season, episode, embedId, cc } = it;
    return { key, type, name, url, cat, quality, source, logo, needsHeaders, tvgId, ua, rf, id, catalog, mediaType, overview, year, vote, season, episode, embedId, cc };
  };
  const revive = saved => items.get(saved.key) || restoreMovie(saved) || (register(saved), saved);

  // ---------------------------------------------------------------- card rendering
  function cardHTML(item) {
    register(item);
    if (item.type === 'movie') return item.catalog === 'movy' ? movy.card(item) : movies.card(item);
    if (item.type === 'link') {
      return `<a class="card link-card" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
        <span class="ico">${item.icon}</span><span><span class="name">${esc(item.name)}</span><span class="meta">${esc(item.note)} ↗</span></span>
      </a>`;
    }
    const ok = isPlayable(item);
    const nowOn = guideFor(item)?.now;
    const meta = nowOn ? `Now: ${nowOn.title}` : ([item.source, item.quality].filter(Boolean).join(' · ') || item.cat);
    return `<button class="card" data-key="${esc(item.key)}" aria-label="${esc(item.name)}">
      <span class="badge ${ok ? '' : 'warn'}">${ok ? '<span class="dot" style="background:#fff"></span>LIVE' : 'VLC'}</span>
      ${inMyList(item.key) ? '<span class="fav">★</span>' : ''}
      <span class="tile" style="--tile:${tileColor(item.name)}" data-initials="${esc(initials(item.name))}">
        ${item.logo ? `<img loading="lazy" src="${esc(item.logo)}" alt="" style="position:absolute;inset:18% 25% 38%;width:50%;height:44%;object-fit:contain" onerror="this.remove()">` : ''}
        <span class="name">${esc(item.name)}</span>
        <span class="meta">${esc(meta)}</span>
        ${item.cc ? flagImg(item.cc, 'card-flag') : ''}
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

  // Infinite grid for long lists
  function mountGrid(container, list) {
    if (!list.length) { container.innerHTML = '<div class="empty">Nothing here yet.</div>'; return; }
    container.innerHTML = `<div class="grid"></div><div class="grid-sentinel"></div>`;
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
    const history = savedItems(store.get('history', [])).map(revive);
    const mine = myList().map(revive);

    view.innerHTML = `
      <section class="hero">
        <div class="hero-bg"></div>
        <video id="heroVideo" muted playsinline autoplay loop style="opacity:0;transition:opacity 1s"></video>
        <div class="hero-content">
          <span class="hero-tag"><span class="dot"></span> Live now · Sports</span>
          <h1>SKY Racing Live</h1>
          <p>Thoroughbred, harness and greyhound racing from around Australia — streaming live 24/7. Plus ${all.length.toLocaleString()} more live TV channels.</p>
          <div class="hero-actions">
            <button class="btn btn-play" data-key="${esc(hero.key)}"><svg viewBox="0 0 24 24"><path d="M6 4v16l14-8z"/></svg>Play</button>
            <a class="btn btn-more" href="#sports"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>All Sports</a>
          </div>
        </div>
      </section>
      <div class="rows">
        ${rowHTML('Continue Watching', history.slice(0, ROW_LIMIT))}
        ${rowHTML('My List', mine.slice(0, ROW_LIMIT), '#mylist')}
        ${rowHTML('New Movies', movies.newMovies.slice(0, ROW_LIMIT), '#movies/new')}
        ${rowHTML('Movies', movies.all.slice(0, ROW_LIMIT), '#movies')}
        <section class="row"><div class="row-head"><h2>Australia</h2><a class="see-all" href="#australia">${window.StreamBoxAustralia.count} guide channels ›</a></div></section>
        <section class="row"><div class="row-head"><h2>Movy</h2></div><div class="chips"><a class="chip" href="#movy/movie">Movies</a><a class="chip" href="#movy/tv">TV Shows</a><a class="chip" href="#movy/anime">Anime</a><a class="chip" href="#movy/4k">4K Library</a></div></section>
        ${countryRow('Browse by country', groupByCountry(all).filter(g => g.cc).slice(0, 24), '#countries')}
        ${rowHTML('Live Sports', byCat('Sports').slice(0, ROW_LIMIT), '#sports')}
        ${rowHTML('Pluto TV Channels', all.filter(c => c.source === 'Pluto TV').slice(0, ROW_LIMIT), '#live/Pluto TV')}
        ${rowHTML('News', byCat('News').slice(0, ROW_LIMIT), '#live/News')}
        ${rowHTML('Comedy & Series', byCat('Comedy & Series').slice(0, ROW_LIMIT), '#live/Comedy & Series')}
        ${rowHTML('Kids & Family', byCat('Kids').slice(0, ROW_LIMIT), '#live/Kids')}
        ${rowHTML('Documentaries', byCat('Documentary').slice(0, ROW_LIMIT), '#live/Documentary')}
        ${rowHTML('Music', byCat('Music').slice(0, ROW_LIMIT), '#live/Music')}
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
    const vlcOnly = all.filter(c => !isPlayable(c));
    counts['VLC only'] = vlcOnly.length;
    counts.Verified = all.filter(c => c.verified).length;
    const chips = ['All', ...(counts.Verified ? ['Verified'] : []), ...CATEGORY_ORDER.filter(c => counts[c]), ...sources, ...(vlcOnly.length ? ['VLC only'] : [])];
    const active = cat || 'All';
    const list = active === 'All' ? all : active === 'VLC only' ? vlcOnly : active === 'Verified' ? all.filter(c => c.verified) : all.filter(c => c.cat === active || c.source === active);
    vlcList = { name: `streambox-${active}`, items: list };
    view.innerHTML = `<div class="page">
      <div class="page-head"><h1>Live TV</h1><span class="count">${list.length.toLocaleString()} channels${settings.showAll ? '' : ` · ${channels.filter(c => !c.isPlaylist && !c.dead && !isPlayable(c)).length.toLocaleString()} more need VLC or a proxy (Settings)`}</span>
        <button class="btn btn-more page-btn" data-act="vlcpl">Play this list in VLC</button></div>
      <div class="chips"><a class="chip chip-accent" href="#countries">🌍 By country</a><a class="chip" href="#australia">Australia · ${window.StreamBoxAustralia.count} guide channels</a>${chips.map(c => `<a class="chip ${c === active ? 'active' : ''}" href="#live/${encodeURIComponent(c)}">${esc(c)}${counts[c] ? ` · ${counts[c]}` : ''}</a>`).join('')}</div>
      <div id="gridMount"></div>
    </div>`;
    mountGrid($('#gridMount'), list);
  }

  // ---------------------------------------------------------------- countries
  const countryTile = g => `<a class="country-tile" href="#country/${esc(g.cc || 'other')}" data-name="${esc(g.name.toLowerCase())}">
      ${flagImg(g.cc)}<span><b>${esc(g.name)}</b><small>${g.channels.length.toLocaleString()} channel${g.channels.length === 1 ? '' : 's'}</small></span></a>`;

  function countryRow(title, groups, seeAll) {
    if (!groups.length) return '';
    return `<section class="row">
      <div class="row-head"><h2>${esc(title)}</h2>${seeAll ? `<a class="see-all" href="${esc(seeAll)}">See all ›</a>` : ''}</div>
      <div class="row-track-wrap"><div class="row-track country-row">${groups.map(countryTile).join('')}</div></div>
    </section>`;
  }

  // All countries, grouped by area. `area` (optional) narrows to one area.
  function renderCountries(area) {
    const groups = groupByCountry(visibleChannels());
    const areas = AREA_ORDER.filter(a => groups.some(g => g.area === a));
    const active = areas.includes(area) ? area : '';
    const shown = groups.filter(g => !active || g.area === active);
    const total = shown.reduce((n, g) => n + g.channels.length, 0);
    view.innerHTML = `<div class="page">
      <div class="page-head"><h1>Countries</h1><span class="count">${shown.filter(g => g.cc).length} countries · ${total.toLocaleString()} channels</span>
        <input class="country-filter" id="countryFilter" type="search" placeholder="Find a country…" autocomplete="off"></div>
      <div class="chips"><a class="chip ${active ? '' : 'active'}" href="#countries">All areas</a>${areas.map(a => {
        const n = groups.filter(g => g.area === a).reduce((m, g) => m + g.channels.length, 0);
        return `<a class="chip ${a === active ? 'active' : ''}" href="#countries/${encodeURIComponent(a)}">${esc(a)} · ${n.toLocaleString()}</a>`;
      }).join('')}</div>
      ${areas.filter(a => !active || a === active).map(a => {
        const list = shown.filter(g => g.area === a);
        return `<section class="area"><h2 class="area-head">${esc(a)} <small>${list.length} ${list.length === 1 ? 'country' : 'countries'}</small></h2>
          <div class="country-grid">${list.map(countryTile).join('')}</div></section>`;
      }).join('')}
    </div>`;
    $('#countryFilter').addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      view.querySelectorAll('.country-tile').forEach(t => { t.hidden = !!q && !t.dataset.name.includes(q); });
      view.querySelectorAll('.area').forEach(sec => { sec.hidden = ![...sec.querySelectorAll('.country-tile')].some(t => !t.hidden); });
    });
  }

  // One country's channels bundled together, with category filters. arg is "<cc>" or "<cc>/<category>".
  function renderCountry(arg) {
    const [code, ...rest] = (arg || '').split('/');
    const cc = code === 'other' ? '' : code.toLowerCase();
    const category = rest.join('/');
    const all = visibleChannels().filter(c => (c.cc || '') === cc);
    if (!all.length) { view.innerHTML = '<div class="page"><div class="empty">No channels for that country.<br><a class="btn btn-more" href="#countries" style="margin-top:14px">All countries</a></div></div>'; return; }
    const counts = all.reduce((a, c) => (a[c.cat] = (a[c.cat] || 0) + 1, a), {});
    const cats = CATEGORY_ORDER.filter(c => counts[c]);
    const active = cats.includes(category) ? category : 'All';
    const list = active === 'All' ? all : all.filter(c => c.cat === active);
    const name = countryName(cc);
    vlcList = { name: `streambox-${name}`, items: list };
    view.innerHTML = `<div class="page">
      <div class="page-head country-head">${flagImg(cc, 'flag flag-lg')}<h1>${esc(name)}</h1>
        <span class="count">${esc(areaOf(cc))} · ${list.length.toLocaleString()} channels</span>
        <a class="btn btn-more page-btn" href="#countries">All countries</a>
        <button class="btn btn-more" data-act="vlcpl" style="font-size:13px;padding:7px 14px">Play in VLC</button></div>
      <div class="chips"><a class="chip ${active === 'All' ? 'active' : ''}" href="#country/${esc(code)}">All · ${all.length}</a>${cats.map(c => `<a class="chip ${c === active ? 'active' : ''}" href="#country/${esc(code)}/${encodeURIComponent(c)}">${esc(c)} · ${counts[c]}</a>`).join('')}</div>
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

  function renderMyList() {
    const mine = myList().map(revive);
    vlcList = { name: 'streambox-my-list', items: mine.filter(i => i.type === 'live') };
    view.innerHTML = `<div class="page">
      <div class="page-head"><h1>My List</h1><span class="count">${mine.length} saved</span>
        ${mine.some(i => i.type === 'live') ? '<button class="btn btn-more page-btn" data-act="vlcpl">Play channels in VLC</button>' : ''}</div>
      <div id="gridMount"></div>
    </div>`;
    if (!mine.length) { $('#gridMount').innerHTML = '<div class="empty">Tap <b>+ My List</b> on a channel or movie to save it here.</div>'; return; }
    mountGrid($('#gridMount'), mine);
  }

  function renderSearch(q) {
    const term = q.trim().toLowerCase();
    const live = term ? visibleChannels().filter(c => c.name.toLowerCase().includes(term) || c.cat.toLowerCase() === term || (term.length >= 3 && countryName(c.cc).toLowerCase().startsWith(term))) : [];
    const films = term ? movies.all.filter(m => m.name.toLowerCase().includes(term)) : [];
    view.innerHTML = `<div class="page">
      <div class="page-head"><h1>Results for “${esc(q)}”</h1><span class="count">${live.length} channels · ${films.length} movies</span></div>
      <div class="row-head"><h2>Live Channels</h2></div>
      <div id="gridMount"></div>
    </div>`;
    mountGrid($('#gridMount'), live);
    view.insertAdjacentHTML('beforeend', '<div class="row-head"><h2>Movies</h2></div><div id="movieResults"></div>');
    mountGrid($('#movieResults'), films);
    view.insertAdjacentHTML('beforeend', `<div class="movy-pages"><a class="btn btn-more" href="#movy/movie/1?query=${encodeURIComponent(q)}">Search Movy movies, TV shows &amp; anime</a></div>`);
  }

  // ---------------------------------------------------------------- router
  let routeVersion = 0;
  async function route() {
    const version = ++routeVersion;
    pendingMovieRender = false;
    stopHero();
    movy.cancel();
    const [name, ...rest] = decodeURIComponent(location.hash.slice(1) || 'home').split('/');
    const arg = rest.join('/');
    const navName = name === 'country' ? 'countries' : name;
    document.querySelectorAll('[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === navName));
    await Promise.all([channelsReady, movies.ready, window.StreamBoxAustralia.ready]);
    if (version !== routeVersion) return;
    movies.all.forEach(register);
    window.scrollTo(0, 0);
    switch (name) {
      case 'live': renderLive(arg); break;
      case 'sports': renderSports(); break;
      case 'australia': window.StreamBoxAustralia.render(view, arg, { streams: channels.filter(c => !(settings.hideBad && isBad(c))), card: cardHTML }); break;
      case 'countries': renderCountries(arg); break;
      case 'country': renderCountry(arg); break;
      case 'movies': movies.render(view, arg); break;
      case 'library': await window.StreamBoxLibrary.render(view, { play }); break;
      case 'movy': await movy.render(view, location.hash.slice(1).split('/').slice(1).join('/'), { register, isSaved: inMyList, retry: route, play }); break;
      case 'mylist': renderMyList(); break;
      case 'search': renderSearch(arg); break;
      default: renderHome();
    }
    if (version !== routeVersion) return;
    $('#topbar').classList.toggle('solid', name !== 'home' && name !== '');
    onScroll();
  }

  // ---------------------------------------------------------------- player
  const player = $('#player'), video = $('#video'), msg = $('#playerMsg');
  const movieFrame = $('#movieFrame'), movieTools = $('#movieTools'), movieSource = $('#movieSource');
  const moviePlayback = window.StreamBoxMoviePlayback.create({
    frame: movieFrame, select: movieSource, external: $('#movieExternal'),
    status: $('#movieSourceStatus'), next: $('#movieNextSource'),
    canOpen: source => current?.catalog === 'movy' || source.url.startsWith('https://www.vidy.st/') ? movy.checkProtection() : true,
  });
  window.StreamBoxMovySetup?.configure({ movy, play });
  function movieChoices(item) {
    if (item.catalog === 'movy' && item.mediaType !== 'movie') {
      return [{ name: 'Vidy · Protected', url: movy.playerUrl(item, item.season ?? 1, item.episode ?? 1) }];
    }
    const alternatives = movies.sources.map((source, i) => ({ name: source.name, url: movies.url(item, i) + (source.name === 'VidLink' ? '?autoPlay=true' : '') }));
    if (movy.protectedPlayback) {
      const vidy = { name: 'Vidy · Protected', url: movy.playerUrl({ ...item, mediaType: 'movie' }) };
      return item.catalog === 'movy' ? [vidy, ...alternatives] : [...alternatives, vidy];
    }
    return alternatives;
  }
  let hls = null, current = null, currentList = [], stallTimer = null;

  // ---- VLC hand-off. Browsers can't embed VLC or send custom headers, so channels that need either
  // are opened in the VLC app: a deep link on mobile, or an .m3u file that carries the headers.
  const oneLine = s => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();

  function vlcLinks(url) {
    const m = /^(https?):\/\/(.+)$/.exec(url);
    return {
      ios: `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(url)}`,
      android: m ? `intent://${m[2]}#Intent;scheme=${m[1]};action=android.intent.action.VIEW;type=video/*;package=org.videolan.vlc;S.browser_fallback_url=${encodeURIComponent(VLC_STORES.android)};end` : '',
    };
  }
  const vlcDeepLink = url => (IS_ANDROID ? vlcLinks(url).android : IS_IOS ? vlcLinks(url).ios : '');

  function buildM3U(list) {
    return '#EXTM3U\n' + list.map(c => [
      `#EXTINF:-1 group-title="${oneLine(c.cat).replace(/"/g, "'")}",${oneLine(c.name)}`,
      c.ua && `#EXTVLCOPT:http-user-agent=${oneLine(c.ua)}`,
      c.rf && `#EXTVLCOPT:http-referrer=${oneLine(c.rf)}`,
      oneLine(c.url),
    ].filter(Boolean).join('\n')).join('\n') + '\n';
  }

  // Share sheet where files can be shared (iOS/Android), otherwise a normal download
  async function saveFile(name, mime, text) {
    const blob = new Blob([text], { type: mime });
    const file = new File([blob], name, { type: mime });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`Saved ${name}`);
  }

  const vlcButtons = item => {
    const link = vlcDeepLink(item.url);
    return `${link ? `<a class="btn btn-red" href="${esc(link)}">Open in VLC</a>` : ''}
      <button class="btn ${link ? 'btn-more' : 'btn-red'}" data-act="vlcfile" data-key="${esc(item.key)}">Open in VLC (.m3u file)</button>
      <button class="btn btn-more" data-act="copy" data-key="${esc(item.key)}">Copy stream URL</button>`;
  };

  function exportVlcList() {
    const { name, items: list } = vlcList;
    if (!list.length) { toast('No channels to export'); return; }
    const slice = list.slice(0, VLC_LIST_LIMIT);
    saveFile(`${name.replace(/[^\w.-]+/g, '_')}.m3u`, 'audio/x-mpegurl', buildM3U(slice));
    if (list.length > slice.length) toast(`Exported the first ${VLC_LIST_LIMIT.toLocaleString()} of ${list.length.toLocaleString()} channels`);
  }

  function openVlcChannel(item) {
    showChannel(item);
    // On phones, jump straight into VLC (this runs inside the tap, so the browser allows it)
    const link = settings.autoVlc && vlcDeepLink(item.url);
    if (link) location.href = link;
  }

  function renderPlayerSub() {
    if (!current) return;
    const base = [current.cc && countryName(current.cc), current.source, current.quality, current.cat].filter(Boolean).join(' · ');
    const g = guideFor(current);
    const at = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    $('#playerSub').textContent = [base, g?.now && `Now: ${g.now.title}`, g?.next && `Next ${at(g.next.start)}: ${g.next.title}`].filter(Boolean).join(' · ');
  }

  function showPlayerMsg(title, text, item, detail = '') {
    msg.innerHTML = `<h3>${esc(title)}</h3><p>${esc(text)}</p>${detail ? `<p style="font-size:12px;color:#777;margin:-8px 0 14px">${esc(detail)}</p>` : ''}<div class="btns">
      ${item.type === 'live' ? vlcButtons(item) : ''}
      ${item.type === 'live' && !hasProxy() ? '<button class="btn btn-more" data-act="proxysetup">Set up proxy</button>' : ''}
      ${item.type === 'live' && currentList.length > 1 ? '<button class="btn btn-play" data-act="next">Next working channel</button>' : ''}
    </div>`;
    msg.hidden = false;
  }

  function teardown() {
    clearTimeout(stallTimer);
    moviePlayback.stop();
    movieFrame.src = 'about:blank';
    movieFrame.hidden = movieTools.hidden = true;
    video.hidden = false;
    player.classList.remove('movie-mode');
    if (hls) { hls.destroy(); hls = null; }
    video.pause(); video.removeAttribute('src'); video.load();
  }

  async function play(item, list = [], force = false) {
    stopHero();
    teardown();
    current = item;
    currentList = list.length ? list : [item];
    player.hidden = false;
    document.body.style.overflow = 'hidden';
    $('#playerTitle').textContent = item.name;
    renderPlayerSub();
    $('#playerLive').hidden = item.type !== 'live';
    $('#playerPrev').hidden = $('#playerNext').hidden = item.type !== 'live' || currentList.length < 2;
    msg.innerHTML = '<div class="spinner"></div>'; msg.hidden = false;
    pushHistory(item);
    wakeControls();

    if (item.type === 'movie' && item.catalog === 'personal') {
      video.hidden = false;
      movieFrame.hidden = movieTools.hidden = true;
      player.classList.add('movie-mode');
      video.controls = true;
      const isHls = /\.m3u8(?:$|\?)/i.test(item.url);
      if (isHls && !IS_IOS && window.Hls?.isSupported()) {
        hls = new Hls({ enableWorker: true, backBufferLength: 30 });
        hls.loadSource(item.url); hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
        hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal && current === item) showPlayerMsg('Video unavailable', 'The server may be offline or may not allow cross-origin playback. Check its CORS settings.', item, d.details || 'HLS playback error'); });
      } else {
        video.src = item.url;
        video.play().catch(() => { msg.hidden = false; msg.innerHTML = '<p>Press play to start this video. If it fails, check the URL, file format and server permissions.</p>'; });
      }
      msg.hidden = true;
      return;
    }

    if (item.type === 'movie' && item.catalog === 'movy' && !movy.protectedPlayback) {
      msg.innerHTML = `<h3>Playback protection required</h3>
        <p>Movy plays through the StreamBox helper extension. Set it up automatically — StreamBox detects the install and starts <b>${esc(item.name)}</b> by itself — or watch right now in the Browser box, no helper needed.</p>
        <div class="btns">
          <button class="btn btn-red" data-act="movysetup">Set up helper &amp; auto-play</button>
          <button class="btn btn-more" data-act="movybrowser">Open in Browser box</button>
        </div>`;
      msg.hidden = false;
      return;
    }
    if (item.type === 'movie') {
      movieFrame.allow = item.catalog === 'movy' ? 'encrypted-media; autoplay *; fullscreen *; picture-in-picture' : 'autoplay; fullscreen; encrypted-media; picture-in-picture';
      video.hidden = true;
      movieFrame.hidden = movieTools.hidden = false;
      movieFrame.title = item.name + ' player';
      player.classList.add('movie-mode');
      msg.hidden = true;
      moviePlayback.start(item, movieChoices(item));
      return;
    }

    if (item.type === 'live' && !force && !isPlayable(item)) {
      showPlayerMsg('Plays in VLC only', item.needsHeaders
        ? 'This channel needs special HTTP headers that web browsers can’t send.'
        : 'This channel streams over insecure http://, which browsers block on secure sites.', item);
      return;
    }

    const url = item.url;
    // Cheapest route first, then fall back: direct (hls.js) -> the browser's own HLS player (no CORS check) -> your proxy
    const hlsJs = !IS_IOS && !!window.Hls?.isSupported();
    const plan = [];
    if (directOK(item) || force) {
      const direct = { url, native: !hlsJs, label: 'direct' }, native = { url, native: true, label: 'native' };
      const canNative = hlsJs && !!video.canPlayType('application/vnd.apple.mpegurl');
      if (item.noCors && canNative) plan.push(native, direct);   // hls.js would be blocked by CORS; the platform player isn't
      else { plan.push(direct); if (canNative) plan.push(native); }
    }
    if (hasProxy()) plan.push({ url: proxiedUrl(item), native: !hlsJs, label: 'proxy' });

    const reasons = [];
    for (const attempt of plan) {
      if (current !== item) return;
      try { await attemptPlay(attempt.url, attempt.native, item); return; }
      catch (e) { reasons.push(`${attempt.label}: ${e.message}`); console.warn('play attempt failed:', item.name, attempt.label, e.message); }
    }
    if (current !== item) return;
    markBad(item);
    const why = explainFailure(reasons);
    showPlayerMsg('Channel unavailable', why.text, item, why.detail);
  }

  // Resolves once the video is playing; rejects with a short reason otherwise.
  // After it has resolved, a later failure is shown to the user directly.
  function attemptPlay(url, native, item) {
    return new Promise((resolve, reject) => {
      teardown();
      let settled = false;
      const finish = err => {
        if (settled) return false;
        settled = true; clearTimeout(stallTimer);
        err ? reject(err) : resolve();
        return true;
      };
      const midStream = why => { if (current === item) showPlayerMsg('Stream stopped', why, item); };
      stallTimer = setTimeout(() => finish(new Error('no video after 15s')), 15000);
      video.onplaying = () => { finish(); msg.hidden = true; };
      video.onerror = () => {
        if (!video.getAttribute('src')) return;
        const why = `media error ${video.error?.code ?? ''}`.trim();
        if (!finish(new Error(why))) midStream(`The stream stopped (${why}).`);
      };

      if (native) {
        video.src = url;
        video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
        return;
      }
      hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 30 });
      let recoveries = 0;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => { video.muted = true; video.play().catch(() => {}); }));
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (!d.fatal) return;
        if (d.type === Hls.ErrorTypes.MEDIA_ERROR && recoveries++ < 2) { hls.recoverMediaError(); return; }
        const code = d.response?.code;
        const why = d.type === Hls.ErrorTypes.NETWORK_ERROR ? (code >= 400 ? `HTTP ${code}` : code ? d.details : 'blocked or unreachable (likely CORS)') : d.details;
        if (!finish(new Error(why))) midStream(`The stream stopped (${why}).`);
      });
    });
  }

  function explainFailure(reasons) {
    const detail = reasons.join(' · ');
    if (reasons.some(r => /CORS/.test(r)) && !hasProxy()) {
      return { detail, text: 'This channel’s server doesn’t allow web players to read it, so a browser can’t play it directly. Set up the StreamBox proxy, or open it in VLC.' };
    }
    return { detail, text: hasProxy() ? 'It may be offline or region-locked.' : 'It may be offline or geo-blocked in your region.' };
  }

  let pendingMovieRender = false;
  function closePlayer() {
    teardown();
    current = null;
    player.hidden = true;
    msg.hidden = true;
    document.body.style.overflow = '';
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (pendingMovieRender) { pendingMovieRender = false; route(); }
    if (!location.hash || location.hash === '#home') startHero(SKY_RACING[0].url);
  }

  function step(dir) {
    const playable = currentList.filter(c => isPlayable(c) && (c === current || !isBad(c)));
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
  function closeModal() {
    modal.hidden = true;
    if (player.hidden) {
      document.body.style.overflow = '';
      if (pendingMovieRender) { pendingMovieRender = false; route(); }
    }
  }

  // ---------------------------------------------------------------- backup & restore
  async function exportData() {
    const data = {
      app: 'streambox', version: 1, exported: new Date().toISOString(),
      mylist: myList(), history: store.get('history', []),
      settings: { showAll: settings.showAll, sources: settings.sources, guides: settings.guides },
    };
    await saveFile('streambox-backup.json', 'application/json', JSON.stringify(data, null, 2));
  }

  async function importData(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch { toast('That file isn’t valid JSON'); return; }
    if (data?.app !== 'streambox') { toast('That isn’t a StreamBox backup'); return; }
    // Only accept known item types and re-build each entry from whitelisted fields
    const clean = list => (Array.isArray(list) ? list : [])
      .filter(i => i && typeof i.key === 'string' && (i.type === 'live' || (i.type === 'movie' && (items.get(i.key)?.type === 'movie' || restoreMovie(i)))) && /^https?:\/\//.test(i.url || ''))
      .map(i => snapshot(i.type === 'movie' ? (items.get(i.key) || restoreMovie(i)) : i));
    const merge = (a, b) => { const seen = new Set(a.map(i => i.key)); return [...a, ...b.filter(i => !seen.has(i.key))]; };
    store.set('mylist', merge(myList(), clean(data.mylist)).slice(0, 200));
    store.set('history', merge(store.get('history', []), clean(data.history)).slice(0, 30));
    const s = data.settings || {};
    for (const k of ['sources', 'guides']) {
      const incoming = (Array.isArray(s[k]) ? s[k] : []).filter(u => typeof u === 'string' && /^https:\/\//.test(u));
      settings[k] = [...new Set([...settings[k], ...incoming])];
    }
    saveSettings();
    toast('Backup imported — reloading…');
    setTimeout(() => location.reload(), 700);
  }

  function showChannel(item) {
    const reason = item.needsHeaders
      ? 'it needs custom HTTP headers (a user-agent or referrer) that web browsers can’t send'
      : item.noCors ? 'its server doesn’t allow web pages to read it (it sends no CORS headers)'
      : 'it streams over insecure http://, which browsers block on secure sites';
    openModal(`
      <div class="modal-hero" style="--tile:${tileColor(item.name)}"><div class="inner"><h2>${esc(item.name)}</h2></div></div>
      <div class="modal-body">
        <div class="facts"><span>${esc(item.cat)}</span>${item.quality ? `<span>${esc(item.quality)}</span>` : ''}${item.source ? `<span>${esc(item.source)}</span>` : ''}</div>
        <p>This channel can’t play inside a browser: ${reason}. VLC can play it.</p>
        <div class="hero-actions" style="margin:14px 0">${vlcButtons(item)}</div>
        <p style="color:var(--muted);font-size:13px">Want it to play inside StreamBox? <button class="btn btn-more" data-act="opensettings" style="font-size:12px;padding:4px 10px;margin-left:6px">Set up the stream proxy</button></p>
        ${item.ua || item.rf ? '<p style="color:var(--muted);font-size:13px">The .m3u file includes the headers this channel needs, so use it if the direct link fails.</p>' : ''}
        <div class="hero-actions" style="margin-top:12px">
          ${item.needsHeaders && item.url.startsWith('https://') ? `<button class="btn btn-more" data-act="tryweb" data-key="${esc(item.key)}" style="font-size:13px;padding:6px 12px">Try in browser anyway</button>` : ''}
          <button class="btn btn-more" data-act="fav" data-key="${esc(item.key)}" style="font-size:13px;padding:6px 12px">${inMyList(item.key) ? '✓ In My List' : '+ My List'}</button>
        </div>
        <h3>Don’t have VLC?</h3>
        <p><a href="${VLC_STORES.ios}" target="_blank" rel="noopener noreferrer" style="color:var(--gold)">iPhone / iPad</a> ·
           <a href="${VLC_STORES.android}" target="_blank" rel="noopener noreferrer" style="color:var(--gold)">Android</a> ·
           <a href="${VLC_STORES.desktop}" target="_blank" rel="noopener noreferrer" style="color:var(--gold)">Windows / Mac / Linux</a></p>
      </div>`);
  }

  function movieUpdateText(status) {
    return status.message + (status.checkedAt ? ' Last updated: ' + new Date(status.checkedAt).toLocaleString() : '');
  }
  function showSettings() {
    openModal(`
      <div class="modal-body" style="padding-top:28px">
        <h2 style="font-size:24px;margin-bottom:6px">Settings</h2>
        <h3>Movie updates</h3>
        <p>Checks for new movies on launch and once a day while the app is open. Saved titles stay available offline.</p>
        <p id="movieUpdateStatus" role="status" style="color:var(--muted)">${esc(movieUpdateText(movies.updates.status))}</p>
        <button class="btn btn-more" data-act="refreshmovies" style="font-size:13px;padding:6px 12px">Check for new movies</button>
        <h3>Channels</h3>
        <label><input type="checkbox" id="optShowAll" ${settings.showAll ? 'checked' : ''}> Show channels that only play in VLC (http:// or header-protected)</label>
        <label><input type="checkbox" id="optAutoVlc" ${settings.autoVlc ? 'checked' : ''}> On iPhone/Android, open those channels in VLC automatically</label>
        <h3>Stream proxy (play every channel inside the app)</h3>
        <p style="color:var(--muted)">Some channels can’t load in a browser (no CORS headers, plain http://, or required headers). A StreamBox proxy that you host fixes that. See <code>proxy/</code> in the repo. ${hasProxy() ? `<b style="color:var(--green)">Proxy set.</b>` : ''}</p>
        <div class="form-row"><input type="url" id="proxyInput" placeholder="https://your-proxy.example.com" value="${esc(settings.proxyUrl)}"><button class="btn btn-more" data-act="localproxy" style="padding:8px 12px;font-size:13px" title="Run: npm run proxy">This computer</button></div>
        <div class="form-row"><input type="text" id="proxyToken" placeholder="Token (optional, if your proxy uses PROXY_TOKEN)" value="${esc(settings.proxyToken)}" autocomplete="off" spellcheck="false"><button class="btn btn-red" data-act="saveproxy" style="padding:8px 16px">Save</button>${hasProxy() ? '<button class="btn btn-more" data-act="clearproxy" style="padding:8px 16px">Remove</button>' : ''}</div>
        <label><input type="checkbox" id="optHideBad" ${settings.hideBad ? 'checked' : ''}> Hide channels that failed to play on this device (for 12 hours)</label>
        <button class="btn btn-more" data-act="resetbad" style="font-size:13px;padding:6px 12px">Show hidden channels again (${Object.keys(bad).length})</button>
        <h3>Playlists (M3U)</h3>
        <p style="color:var(--muted)">Add any M3U/M3U8 playlist URL. It must be https and allow cross-origin requests.</p>
        <ul class="src-list">${settings.sources.map((s, i) => `<li><span>${esc(s)}</span><button class="btn btn-more" style="padding:4px 10px;font-size:12px" data-act="rmsrc" data-i="${i}">Remove</button></li>`).join('') || '<li><span style="color:var(--muted)">No extra playlists.</span></li>'}</ul>
        <div class="form-row"><input type="url" id="srcInput" placeholder="https://example.com/playlist.m3u"><button class="btn btn-red" data-act="addsrc" style="padding:8px 16px">Add</button></div>
        <p style="color:var(--muted);font-size:13px;margin-top:8px">The iptv-org list is already built in and is refreshed every time the site is deployed.</p>
        <h3>TV guide (XMLTV)</h3>
        <p style="color:var(--muted)">Adds “Now / Next” to channels. Guides listed in your M3U playlists are picked up automatically. ${guide.byId.size ? `<b>${guide.byId.size}</b> channels with guide data loaded.` : ''} URLs must be https and allow cross-origin requests; .xml and .xml.gz both work.</p>
        <ul class="src-list">${settings.guides.map((s, i) => `<li><span>${esc(s)}</span><button class="btn btn-more" style="padding:4px 10px;font-size:12px" data-act="rmguide" data-i="${i}">Remove</button></li>`).join('') || '<li><span style="color:var(--muted)">No guide URLs added.</span></li>'}</ul>
        <div class="form-row"><input type="url" id="guideInput" placeholder="https://example.com/guide.xml"><button class="btn btn-red" data-act="addguide" style="padding:8px 16px">Add</button></div>
        <h3>Backup &amp; restore</h3>
        <p style="color:var(--muted)">Move My List, watch history and playlists between your phone and laptop.</p>
        <div class="form-row">
          <button class="btn btn-more" data-act="export" style="font-size:13px;padding:6px 12px">Export backup</button>
          <button class="btn btn-more" data-act="import" style="font-size:13px;padding:6px 12px">Import backup</button>
          <input type="file" id="importFile" accept="application/json,.json" hidden>
        </div>
        <h3>Data</h3>
        <button class="btn btn-more" data-act="clearhist" style="font-size:13px;padding:6px 12px">Clear watch history</button>
        <h3>Download the app</h3>
        ${isInstalled() ? '<p style="color:var(--green)">StreamBox is installed on this device ✓</p>' : '<button class="btn btn-red" data-act="install" style="font-size:13px;padding:6px 12px">Download StreamBox</button>'}
        <p style="margin-top:8px"><b>iPhone / iPad:</b> open in Safari → Share → <i>Add to Home Screen</i>.<br><b>Android:</b> open in Chrome → ⋮ menu → <i>Install app</i>.<br><b>Windows / Mac:</b> open in Chrome or Edge → install icon in the address bar.</p>
      </div>`);
  }

  async function saveProxy(url, token) {
    if (!/^https?:\/\//.test(url)) { toast('Proxy URL must start with https://'); return; }
    const prev = { u: settings.proxyUrl, t: settings.proxyToken };
    settings.proxyUrl = url; settings.proxyToken = token;
    if (!hasProxy()) { Object.assign(settings, { proxyUrl: prev.u, proxyToken: prev.t }); toast('An https page needs an https:// proxy'); return; }
    try {
      const res = await fetch(`${url}/health`);
      if (!res.ok) throw new Error(res.status);
    } catch { Object.assign(settings, { proxyUrl: prev.u, proxyToken: prev.t }); toast('Couldn’t reach that proxy (is it running, and does it allow this site?)'); return; }
    saveSettings();
    Object.keys(bad).forEach(k => delete bad[k]); store.set('bad', bad);   // earlier failures may work now
    toast('Proxy connected ✓');
    closeModal(); route();
  }

  function addGuide(url) {
    if (!/^https:\/\//.test(url)) { toast('Guide URL must start with https://'); return; }
    if (settings.guides.includes(url)) { toast('Already added'); return; }
    settings.guides.push(url); saveSettings();
    toast('Guide added — reloading…');
    setTimeout(() => location.reload(), 700);
  }

  function addSource(url) {
    if (!/^https:\/\//.test(url)) { toast('Playlist URL must start with https://'); return; }
    if (settings.sources.includes(url)) { toast('Already added'); return; }
    settings.sources.push(url); saveSettings();
    toast('Playlist added — reloading…');
    setTimeout(() => location.reload(), 700);
  }

  // ---------------------------------------------------------------- install (download the app)
  // Chrome/Edge/Android hand us an install prompt; iOS Safari has no prompt, so we show the steps instead.
  let installPrompt = null;
  const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const installBtn = $('#installBtn');
  const refreshInstallBtn = () => { installBtn.hidden = isInstalled() || !(installPrompt || IS_IOS); };
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; refreshInstallBtn(); });
  addEventListener('appinstalled', () => { installPrompt = null; refreshInstallBtn(); toast('StreamBox installed ✓'); });

  async function installApp() {
    if (isInstalled()) { toast('StreamBox is already installed'); return; }
    if (installPrompt) {
      const prompt = installPrompt; installPrompt = null;
      prompt.prompt();
      const { outcome } = await prompt.userChoice.catch(() => ({}));
      if (outcome !== 'accepted') installPrompt = prompt;
      refreshInstallBtn();
      return;
    }
    openModal(`
      <div class="modal-body" style="padding-top:28px">
        <h2 style="font-size:24px;margin-bottom:6px">Download StreamBox</h2>
        <p style="color:var(--muted)">StreamBox installs straight from your browser — no app store needed. It opens full-screen with its own icon.</p>
        ${IS_IOS ? `<h3>iPhone / iPad</h3>
        <p>1. Open this page in <b>Safari</b>.<br>2. Tap the <b>Share</b> button (the square with an arrow).<br>3. Choose <i>Add to Home Screen</i>, then <i>Add</i>.</p>` : `<h3>Android</h3>
        <p>Open this page in <b>Chrome</b> → ⋮ menu → <i>Install app</i> (or <i>Add to Home screen</i>).</p>
        <h3>Windows / Mac / Linux</h3>
        <p>Open this page in <b>Chrome</b> or <b>Edge</b> → click the install icon at the right of the address bar (or ⋮ menu → <i>Install StreamBox</i>).</p>
        <h3>iPhone / iPad</h3>
        <p>Open this page in <b>Safari</b> → Share → <i>Add to Home Screen</i>.</p>`}
      </div>`);
  }
  installBtn.onclick = installApp;
  refreshInstallBtn();

  // ---------------------------------------------------------------- events
  document.addEventListener('click', e => {
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      const item = items.get(act.dataset.key);
      if (a === 'close') closeModal();
      else if (a === 'movieplay' && item?.type === 'movie') { closeModal(); play(item); }
      else if (a === 'fav' && item) { toggleMyList(item); act.textContent = inMyList(item.key) ? '✓ In My List' : '+ My List'; }
      else if (a === 'next') step(1);
      else if (a === 'copy') navigator.clipboard?.writeText(item?.url || current?.url || '').then(() => toast('Stream URL copied'));
      else if (a === 'vlcfile' && item) saveFile(`${oneLine(item.name).replace(/[^\w.-]+/g, '_')}.m3u`, 'audio/x-mpegurl', buildM3U([item]));
      else if (a === 'tryweb' && item) { closeModal(); play(item, [], true); }
      else if (a === 'vlcpl') exportVlcList();
      else if (a === 'addsrc') addSource($('#srcInput').value.trim());
      else if (a === 'rmsrc') { settings.sources.splice(+act.dataset.i, 1); saveSettings(); location.reload(); }
      else if (a === 'refreshmovies') movies.updates.refresh({ force: true });
      else if (a === 'clearhist') { store.set('history', []); toast('History cleared'); }
      else if (a === 'opensettings') showSettings();
      else if (a === 'movysetup' && current?.catalog === 'movy') {
        window.StreamBoxMovySetup?.open({ record: current, season: Number.isInteger(current.season) ? current.season : 1, episode: Number.isInteger(current.episode) ? current.episode : 1 });
      }
      else if (a === 'movybrowser' && current) {
        const item = current;
        closePlayer();
        let url = null;
        try { url = movy.playerUrl(item, Number.isInteger(item.season) ? item.season : 1, Number.isInteger(item.episode) ? item.episode : 1); } catch { /* fall back to Movy home */ }
        window.StreamBoxMovyBrowser?.open(url || window.StreamBoxMovyBrowser.HOME, item.name);
      }
      else if (a === 'proxysetup') { closePlayer(); showSettings(); }
      else if (a === 'localproxy') $('#proxyInput').value = 'http://localhost:8787';
      else if (a === 'saveproxy') saveProxy($('#proxyInput').value.trim().replace(/\/+$/, ''), $('#proxyToken').value.trim());
      else if (a === 'clearproxy') { settings.proxyUrl = settings.proxyToken = ''; saveSettings(); toast('Proxy removed'); route(); showSettings(); }
      else if (a === 'resetbad') { Object.keys(bad).forEach(k => delete bad[k]); store.set('bad', bad); toast('Hidden channels restored'); route(); showSettings(); }
      else if (a === 'addguide') addGuide($('#guideInput').value.trim());
      else if (a === 'rmguide') { settings.guides.splice(+act.dataset.i, 1); saveSettings(); location.reload(); }
      else if (a === 'export') exportData();
      else if (a === 'install') installApp();
      else if (a === 'import') $('#importFile').click();
      return;
    }

    const card = e.target.closest('[data-key]');
    if (card) {
      const item = items.get(card.dataset.key);
      if (!item) return;
      if (item.catalog === 'movy') { location.hash = 'movy/detail/' + item.mediaType + '/' + item.id; return; }
      if (item.type === 'movie') return openModal(movies.detail(item, inMyList(item.key)));
      if (item.isPlaylist) return addSource(item.url.replace(/^http:/, 'https:'));
      if (!isPlayable(item)) return openVlcChannel(item);
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
  modal.addEventListener('change', e => {
    if (e.target.id === 'optShowAll') { settings.showAll = e.target.checked; saveSettings(); route(); }
    else if (e.target.id === 'optAutoVlc') { settings.autoVlc = e.target.checked; saveSettings(); }
    else if (e.target.id === 'optHideBad') { settings.hideBad = e.target.checked; saveSettings(); route(); }
    else if (e.target.id === 'importFile' && e.target.files[0]) importData(e.target.files[0]);
  });

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

  window.addEventListener('streambox-movies-updated', e => {
    movies.all.forEach(register);
    const name = location.hash.slice(1).split('/')[0] || 'home';
    if (['home', 'movies', 'mylist', 'search'].includes(name)) {
      if (player.hidden && modal.hidden) route();
      else pendingMovieRender = true;
    }
    if (e.detail?.reason === 'refresh' && e.detail.added) toast(e.detail.added + ' new movies added');
  });
  window.addEventListener('streambox-movie-update-status', e => {
    const status = $('#movieUpdateStatus');
    if (status) status.textContent = movieUpdateText(e.detail);
  });

  // ---------------------------------------------------------------- boot
  view.innerHTML = '<div class="spinner" style="margin:40vh auto"></div>';
  movy.checkProtection();
  channelsReady = loadChannels();
  channelsReady.then(loadGuides);
  setInterval(patchGuide, 60000);
  route();
  movies.updates.start();

  if ('serviceWorker' in navigator && PAGE_IS_HTTPS) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
