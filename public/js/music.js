/* Music: songs, radio stations and favourites, with a small player that keeps playing while you browse.
     Songs     Audius (audius.co): an open music platform where artists publish their own tracks, with a public API
     Radio     Radio Browser (radio-browser.info): a community directory of internet radio stations
     Favourites  saved in localStorage as sb:music, which account.js syncs to the signed-in person's account
   The top half is plain logic (no page code) so it can be tested on its own; the page and player follow. */
(() => {
  'use strict';
  const APP = 'StreamBox';
  const AUDIUS = 'https://api.audius.co/v1';
  const RADIO_HOSTS = ['de1', 'fi1', 'nl1', 'at1'].map(h => `https://${h}.api.radio-browser.info`);
  const GENRES = ['Electronic', 'Rock', 'Hip-Hop/Rap', 'Pop', 'Alternative', 'R&B/Soul', 'Ambient', 'Jazz', 'Country', 'Folk', 'Classical', 'Reggae', 'Latin', 'Metal', 'Lo-Fi'];
  const RADIO_TAGS = ['pop', 'rock', 'hits', 'dance', 'jazz', 'classical', 'country', '80s', '90s', 'chillout'];
  const FAV_KEY = 'sb:music', FAV_MAX = 300;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const https = u => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : '');
  const clock = s => (s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');

  // ---- what the app keeps for a song or a station
  function songItem(t) {
    if (!t || !t.id || !t.title || t.is_streamable === false) return null;
    return {
      key: 's:' + t.id, type: 'song', id: String(t.id), name: String(t.title).trim(), artist: String(t.user?.name || '').trim(),
      art: https(t.artwork?.['480x480']) || https(t.artwork?.['150x150']), duration: Number.isFinite(t.duration) ? Math.round(t.duration) : 0, genre: String(t.genre || ''),
    };
  }
  function stationItem(s) {
    const url = https(s?.url_resolved) || https(s?.url);
    if (!s || !s.stationuuid || !String(s.name || '').trim() || !url || s.hls === 1) return null;   // https only: an https page can't play http audio
    const tags = String(s.tags || '').split(',').map(t => t.trim()).filter(Boolean);
    return {
      key: 'r:' + s.stationuuid, type: 'radio', id: String(s.stationuuid), name: String(s.name).trim(),
      artist: [s.state, s.country].map(x => String(x || '').trim()).filter(Boolean).join(', '), art: https(s.favicon), url, genre: tags[0] || '',
    };
  }
  const streamUrl = item => (item.type === 'song' ? `${AUDIUS}/tracks/${encodeURIComponent(item.id)}/stream?app_name=${APP}` : item.url);

  // ---- addresses
  const q = params => new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
  const urls = {
    trending: genre => `${AUDIUS}/tracks/trending?${q({ app_name: APP, time: 'week', limit: 60, genre: GENRES.includes(genre) ? genre : '' })}`,
    songSearch: text => `${AUDIUS}/tracks/search?${q({ app_name: APP, query: text, limit: 60 })}`,
    stations: ({ cc = '', tag = '', name = '' } = {}) => `/json/stations/search?${q({ countrycode: cc, tag, name, is_https: 'true', hidebroken: 'true', order: 'clickcount', reverse: 'true', limit: 80 })}`,
  };

  // ---- favourites (newest first, no duplicates)
  const isFav = (list, key) => list.some(i => i.key === key);
  function toggleFav(list, item) {
    if (isFav(list, item.key)) return list.filter(i => i.key !== item.key);
    const { key, type, id, name, artist, art, url, duration, genre } = item;
    return [{ key, type, id, name, artist, art, ...(type === 'radio' && { url }), ...(duration && { duration }), genre }, ...list].slice(0, FAV_MAX);
  }
  const validFav = i => i && typeof i.key === 'string' && (i.type === 'song' || (i.type === 'radio' && https(i.url))) && i.id && i.name;

  // "#music/<arg>" -> what to show
  function parseRoute(arg = '') {
    const [a = '', b = '', ...rest] = String(arg).split('/');
    const tail = [b, ...rest].filter(Boolean).join('/');
    if (a === 'radio') return b === 'search' ? { tab: 'radio', search: rest.join('/') } : { tab: 'radio', tag: RADIO_TAGS.includes(b) ? b : '' };
    if (a === 'favourites') return { tab: 'favourites' };
    if (a === 'search') return { tab: 'songs', search: tail };
    return { tab: 'songs', genre: GENRES.includes(tail) ? tail : '' };
  }

  const pure = { GENRES, RADIO_TAGS, songItem, stationItem, streamUrl, urls, isFav, toggleFav, validFav, parseRoute, clock };
  if (typeof module !== 'undefined') module.exports = pure;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // ================================================================ page and player (browser only)
  const $ = s => document.querySelector(s);
  let toast = () => {};
  const favs = () => { try { const l = JSON.parse(localStorage.getItem(FAV_KEY)); return Array.isArray(l) ? l.filter(validFav) : []; } catch { return []; } };
  const saveFavs = list => { try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch { /* storage full or private mode */ } };

  // ---- data
  const cache = new Map();
  async function getJSON(url) {
    if (!cache.has(url)) {
      const req = fetch(url).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
      req.catch(() => cache.delete(url));
      cache.set(url, req);
    }
    return cache.get(url);
  }
  const songs = async url => ((await getJSON(url)).data || []).map(songItem).filter(Boolean);
  async function stations(params) {
    let last;
    for (const host of RADIO_HOSTS) {   // the directory runs on several servers; use the first that answers
      try {
        const seen = new Set();
        return (await getJSON(host + urls.stations(params))).map(stationItem).filter(s => s && !seen.has(s.name.toLowerCase()) && seen.add(s.name.toLowerCase()));
      } catch (e) { last = e; }
    }
    throw last || new Error('Radio directory unavailable');
  }

  // ---- player
  const ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" stroke-width="3.2"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M18 5 8 12l10 7zM6 5v14" fill="currentColor"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="m6 5 10 7-10 7zM18 5v14" fill="currentColor"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    note: '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  };
  const audio = new Audio();
  audio.preload = 'none';
  let queue = [], index = -1, current = null, failures = 0;

  const bar = document.createElement('div');
  bar.className = 'music-bar'; bar.hidden = true;
  bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Music player');
  bar.innerHTML = `<input class="music-seek" id="musicSeek" type="range" min="0" max="1000" value="0" aria-label="Position in the song">
    <span class="music-art" id="musicArt"></span>
    <span class="music-now"><b id="musicTitle"></b><small id="musicSub"></small></span>
    <button class="icon-btn" id="musicPrev" type="button" aria-label="Previous">${ICON.prev}</button>
    <button class="icon-btn music-play" id="musicPlay" type="button" aria-label="Pause">${ICON.pause}</button>
    <button class="icon-btn" id="musicNext" type="button" aria-label="Next">${ICON.next}</button>
    <button class="icon-btn music-heart" id="musicFav" type="button" aria-label="Favourite" aria-pressed="false">${ICON.heart}</button>
    <button class="icon-btn" id="musicClose" type="button" aria-label="Close the music player">${ICON.close}</button>`;
  document.body.appendChild(bar);
  const seek = $('#musicSeek');

  const artHTML = (item, cls = '') => `<span class="${cls} music-cover">${item.art ? `<img loading="lazy" src="${esc(item.art)}" alt="" onerror="this.remove()">` : ''}${ICON.note}</span>`;

  function syncBar() {
    if (!current) { bar.hidden = true; document.body.classList.remove('has-music'); return; }
    bar.hidden = false; document.body.classList.add('has-music');
    $('#musicArt').innerHTML = artHTML(current);
    $('#musicTitle').textContent = current.name;
    $('#musicSub').textContent = current.type === 'radio' ? `LIVE · ${current.artist || 'Radio'}` : current.artist;
    $('#musicPlay').innerHTML = audio.paused ? ICON.play : ICON.pause;
    $('#musicPlay').setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
    const fav = isFav(favs(), current.key);
    $('#musicFav').classList.toggle('on', fav); $('#musicFav').setAttribute('aria-pressed', String(fav));
    $('#musicPrev').disabled = $('#musicNext').disabled = queue.length < 2;
    seek.hidden = current.type !== 'song';
    document.querySelectorAll('[data-m-play]').forEach(el => el.classList.toggle('playing', el.dataset.mPlay === current.key));
  }

  function start(item, list) {
    if (list) { queue = list; index = list.findIndex(i => i.key === item.key); }
    current = item;
    audio.src = streamUrl(item);
    seek.value = 0;
    audio.play().then(() => { failures = 0; }).catch(e => { if (e?.name !== 'AbortError') failed(); });
    syncBar();
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: item.name, artist: item.artist || (item.type === 'radio' ? 'Radio' : ''), album: APP, artwork: item.art ? [{ src: item.art }] : [] });
      } catch { /* older browsers */ }
    }
  }
  function step(dir) {
    if (queue.length < 2) return;
    index = ((index + dir) % queue.length + queue.length) % queue.length;
    start(queue[index]);
  }
  function failed() {
    if (!current) return;
    toast(`Couldn’t play “${current.name}”`);
    if (current.type === 'song' && queue.length > 1 && ++failures < 4) step(1); else { failures = 0; syncBar(); }
  }
  function stop() { audio.pause(); audio.removeAttribute('src'); audio.load(); current = null; queue = []; index = -1; syncBar(); }
  const toggle = () => (audio.paused ? audio.play().catch(failed) : audio.pause());

  audio.addEventListener('play', syncBar);
  audio.addEventListener('pause', syncBar);
  audio.addEventListener('ended', () => step(1));
  audio.addEventListener('error', () => { if (audio.getAttribute('src')) failed(); });
  audio.addEventListener('timeupdate', () => { if (audio.duration > 0 && !seek.matches(':active')) seek.value = Math.round((audio.currentTime / audio.duration) * 1000); });
  seek.addEventListener('input', () => { if (audio.duration > 0) audio.currentTime = (seek.value / 1000) * audio.duration; });
  $('#musicPlay').onclick = toggle;
  $('#musicPrev').onclick = () => step(-1);
  $('#musicNext').onclick = () => step(1);
  $('#musicClose').onclick = stop;
  $('#musicFav').onclick = () => current && favourite(current);
  if ('mediaSession' in navigator) {
    for (const [name, fn] of [['play', toggle], ['pause', toggle], ['previoustrack', () => step(-1)], ['nexttrack', () => step(1)]]) {
      try { navigator.mediaSession.setActionHandler(name, fn); } catch { /* not supported */ }
    }
  }

  function favourite(item) {
    const list = toggleFav(favs(), item);
    saveFavs(list);
    const on = isFav(list, item.key);
    toast(on ? 'Added to Favourites' : 'Removed from Favourites');
    document.querySelectorAll('[data-m-fav]').forEach(b => { if (b.dataset.mFav === item.key) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); } });
    const count = document.querySelector('#musicFavCount'); if (count) count.textContent = list.length;
    syncBar();
    if (location.hash.startsWith('#music/favourites')) rerender?.();
  }

  // ---- page
  let shown = new Map(), rerender = null;
  function card(item, favList) {
    shown.set(item.key, item);
    const fav = isFav(favList, item.key);
    return `<div class="music-card${current?.key === item.key ? ' playing' : ''}" data-m-play="${esc(item.key)}">
      <button type="button" class="music-tile" data-m="play" aria-label="Play ${esc(item.name)}${item.artist ? ' — ' + esc(item.artist) : ''}">
        ${artHTML(item, 'music-tile-art')}<span class="music-go">${ICON.play}</span>
        ${item.type === 'radio' ? '<span class="music-live">LIVE</span>' : item.duration ? `<span class="music-len">${esc(clock(item.duration))}</span>` : ''}</button>
      <button type="button" class="music-heart${fav ? ' on' : ''}" data-m="fav" data-m-fav="${esc(item.key)}" aria-pressed="${fav}" aria-label="Favourite ${esc(item.name)}">${ICON.heart}</button>
      <span class="music-name">${esc(item.name)}</span><span class="music-by">${esc(item.artist || item.genre || '')}</span></div>`;
  }
  const grid = (list, favList) => `<div class="music-grid">${list.map(i => card(i, favList)).join('')}</div>`;
  const chip = (href, label, active) => `<a class="chip${active ? ' active' : ''}" href="${esc(href)}">${esc(label)}</a>`;

  async function render(view, arg, ctx = {}) {
    toast = ctx.toast || toast;
    const live = ctx.isCurrent || (() => true);
    const r = parseRoute(arg), favList = favs();
    rerender = () => render(view, arg, ctx);
    shown = new Map();
    const head = `<div class="page-head"><h1>Music</h1><span class="count">${r.tab === 'radio' ? 'Radio stations' : r.tab === 'favourites' ? 'Your favourites' : 'Songs'}</span></div>
      <div class="chips music-tabs">${chip('#music', '♪ Songs', r.tab === 'songs')}${chip('#music/radio', '📻 Radio', r.tab === 'radio')}
        <a class="chip${r.tab === 'favourites' ? ' active' : ''}" href="#music/favourites">♥ Favourites · <span id="musicFavCount">${favList.length}</span></a></div>`;
    const searchBox = (placeholder, value) => `<form class="music-search" id="musicSearch"><input type="search" name="q" maxlength="80" value="${esc(value || '')}" placeholder="${esc(placeholder)}" autocomplete="off" aria-label="${esc(placeholder)}"><button class="btn btn-play" type="submit">Search</button></form>`;
    const wire = (list, onSearch) => {
      const root = view.querySelector('.music-page');
      root.addEventListener('click', e => {
        const b = e.target.closest('[data-m]'); if (!b) return;
        const item = shown.get(b.closest('[data-m-play]')?.dataset.mPlay || b.dataset.mFav);
        if (!item) return;
        if (b.dataset.m === 'fav') favourite(item);
        else if (current?.key === item.key) toggle();
        else start(item, list.filter(i => i.type === item.type));
      });
      root.querySelector('#musicSearch')?.addEventListener('submit', e => { e.preventDefault(); onSearch(new FormData(e.currentTarget).get('q').trim().slice(0, 80)); });
      root.querySelector('[data-m-all]')?.addEventListener('click', () => { const first = list.find(i => i.type === 'song') || list[0]; if (first) start(first, list.filter(i => i.type === first.type)); });
    };
    const page = body => { view.innerHTML = `<div class="page music-page">${head}${body}<p class="music-note">Songs from <a href="https://audius.co" target="_blank" rel="noopener noreferrer">Audius</a>, where artists publish their own music. Radio from the <a href="https://www.radio-browser.info" target="_blank" rel="noopener noreferrer">Radio Browser</a> community directory. More open-source music apps: <a href="https://github.com/chayotic/Open-Source-Music-Streaming-Apps" target="_blank" rel="noopener noreferrer">this list ↗</a></p></div>`; };
    const failure = e => page(`<div class="empty"><b>Couldn’t load music.</b><br>${esc(e.message)}<br><button class="btn btn-more" id="musicRetry" style="margin-top:14px">Try again</button></div>`);
    const loading = () => page('<div class="empty"><div class="spinner"></div></div>');

    if (r.tab === 'favourites') {
      const fs = favList.filter(i => i.type === 'song'), fr = favList.filter(i => i.type === 'radio');
      page(favList.length
        ? `${fs.length ? `<div class="row-head"><h2>Songs</h2><button class="btn btn-play music-all" data-m-all type="button">${ICON.play} Play all</button></div>${grid(fs, favList)}` : ''}
           ${fr.length ? `<div class="row-head"><h2>Radio stations</h2></div>${grid(fr, favList)}` : ''}`
        : '<div class="empty">Tap the ♥ on a song or a radio station to keep it here.<br>Favourites are saved to your account, so they follow you to your other devices.</div>');
      wire(favList, () => {});
      return;
    }

    loading();
    try {
      if (r.tab === 'radio') {
        const list = await stations(r.search ? { name: r.search } : r.tag ? { tag: r.tag } : { cc: 'AU' });
        if (!live()) return;
        page(`${searchBox('Find a radio station…', r.search)}
          <div class="chips">${chip('#music/radio', '🇦🇺 Australia', !r.tag && !r.search)}${RADIO_TAGS.map(t => chip('#music/radio/' + t, t[0].toUpperCase() + t.slice(1), r.tag === t)).join('')}</div>
          ${list.length ? grid(list, favList) : '<div class="empty">No stations found.</div>'}`);
        wire(list, text => { location.hash = text ? 'music/radio/search/' + encodeURIComponent(text) : 'music/radio'; });
      } else {
        const list = await songs(r.search ? urls.songSearch(r.search) : urls.trending(r.genre));
        if (!live()) return;
        page(`${searchBox('Find a song or an artist…', r.search)}
          <div class="chips">${chip('#music', 'Trending', !r.genre && !r.search)}${GENRES.map(g => chip('#music/songs/' + encodeURIComponent(g), g, r.genre === g)).join('')}</div>
          <div class="row-head"><h2>${esc(r.search ? `Results for “${r.search}”` : r.genre ? `Trending in ${r.genre}` : 'Trending this week')}</h2>${list.length ? `<button class="btn btn-play music-all" data-m-all type="button">${ICON.play} Play all</button>` : ''}</div>
          ${list.length ? grid(list, favList) : '<div class="empty">No songs found.</div>'}`);
        wire(list, text => { location.hash = text ? 'music/search/' + encodeURIComponent(text) : 'music'; });
      }
    } catch (e) {
      if (!live()) return;
      failure(e);
      view.querySelector('#musicRetry').onclick = () => rerender();
    }
  }

  window.addEventListener('streambox-account-synced', () => { syncBar(); if (location.hash.startsWith('#music')) rerender?.(); });
  window.StreamBoxMusic = { ...pure, render, pause: () => audio.pause(), stop, get playing() { return !!current && !audio.paused; } };
})();
