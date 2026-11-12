/* Music: where the music comes from, what the app keeps about it, favourites, and the player itself.
   The page (shelves, genres, now playing) is in music-ui.js.
     Audius            songs, playlists and artists: an open platform where artists publish their own music
     Openverse         Creative Commons songs (from Jamendo), found through Openverse's open search API
     Internet Archive  live concerts (the Live Music Archive) and netlabel albums
     SomaFM            listener-supported radio channels
     Radio Browser     community directory of internet radio stations
   None of them needs a key. Favourites are saved in localStorage as sb:music, which account.js syncs to the
   signed-in person's account. The first half is plain logic (no page code) so it can be tested on its own. */
(() => {
  'use strict';
  const APP = 'StreamBox';
  const AUDIUS = 'https://api.audius.co/v1';
  const OPENVERSE = 'https://api.openverse.org/v1/audio/';
  const ARCHIVE = 'https://archive.org';
  const RADIO_HOSTS = ['de1', 'fi1', 'nl1', 'at1'].map(h => `https://${h}.api.radio-browser.info`);
  const FAV_KEY = 'sb:music', FAV_MAX = 300;

  // One list of genres for every source. audius: its exact genre name; q: search word for Openverse and the Archive;
  // radio: Radio Browser tag; soma: SomaFM genre names; c: tile colours.
  const G = (id, name, audius, q, radio, soma, c) => ({ id, name, audius, q, radio, soma, c });
  const GENRES = [
    G('pop', 'Pop', 'Pop', 'pop', 'pop', ['oldies'], ['#ff5e8a', '#b3125a']),
    G('hiphop', 'Hip-Hop', 'Hip-Hop/Rap', 'hiphop', 'hip hop', ['hiphop'], ['#f7a531', '#b3470c']),
    G('electronic', 'Electronic', 'Electronic', 'electronic', 'electronic', ['electronic'], ['#3fd2ff', '#1750c9']),
    G('rock', 'Rock', 'Rock', 'rock', 'rock', ['rock'], ['#ff5a4f', '#8a1210']),
    G('alternative', 'Alternative', 'Alternative', 'indie', 'alternative', ['alternative'], ['#b07cff', '#4b21b0']),
    G('rnb', 'R&B / Soul', 'R&B/Soul', 'soul', 'rnb', ['lounge'], ['#ff8ad0', '#7c1e8c']),
    G('house', 'House', 'House', 'house', 'house', ['electronic'], ['#37e0c3', '#0b6e7a']),
    G('lofi', 'Lo-Fi & Chill', 'Lo-Fi', 'chillout', 'chillout', ['chill', 'ambient'], ['#8fb6ff', '#3b4aa3']),
    G('jazz', 'Jazz', 'Jazz', 'jazz', 'jazz', ['jazz', 'bossanova'], ['#f2c14e', '#8a5a0a']),
    G('classical', 'Classical', 'Classical', 'classical', 'classical', [], ['#d9c7a3', '#6b5231']),
    G('country', 'Country', 'Country', 'country', 'country', ['americana'], ['#e6a15c', '#7a3d12']),
    G('folk', 'Folk & Acoustic', 'Folk', 'folk', 'folk', ['folk', 'celtic'], ['#9ad27a', '#2e6b2b']),
    G('ambient', 'Ambient', 'Ambient', 'ambient', 'ambient', ['ambient'], ['#7fe0e6', '#1e5d7a']),
    G('techno', 'Techno', 'Techno', 'techno', 'techno', ['electronic'], ['#c0c4d6', '#343a5c']),
    G('dnb', 'Drum & Bass', 'Drum & Bass', 'drumnbass', 'drum and bass', [], ['#ffd23f', '#c2410c']),
    G('reggae', 'Reggae', 'Reggae', 'reggae', 'reggae', ['reggae'], ['#59d36b', '#b38b00']),
    G('latin', 'Latin', 'Latin', 'latin', 'latin', [], ['#ff7a59', '#a3123f']),
    G('metal', 'Metal', 'Metal', 'metal', 'metal', ['metal'], ['#9aa0aa', '#23262d']),
    G('blues', 'Blues', 'Blues', 'blues', 'blues', [], ['#6aa7ff', '#143a7a']),
    G('funk', 'Funk', 'Funk', 'funk', 'funk', [], ['#ffb347', '#a3320b']),
    G('world', 'World', 'World', 'world', 'world music', ['world'], ['#4fd1a5', '#14607a']),
    G('soundtrack', 'Soundtrack', 'Soundtrack', 'soundtrack', 'soundtrack', [], ['#b9a6ff', '#3a2d7a']),
  ];
  const genreById = id => GENRES.find(g => g.id === id) || null;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const https = u => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : '');
  const str = v => String(v ?? '').trim();
  const clock = s => (s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');
  const seconds = v => { const p = String(v ?? '').split(':').map(Number); return p.some(Number.isNaN) ? 0 : Math.round(p.reduce((a, n) => a * 60 + n, 0)); };

  // ---- what the app keeps for a song, a station, a playlist or album, and an artist
  const art480 = a => https(a?.['480x480']) || https(a?.['150x150']);
  function songItem(t) {   // Audius track
    if (!t || !t.id || !t.title || t.is_streamable === false) return null;
    return {
      key: 's:' + t.id, type: 'song', src: 'audius', id: String(t.id), name: str(t.title), artist: str(t.user?.name), artistId: str(t.user?.id),
      art: art480(t.artwork), duration: Number.isFinite(t.duration) ? Math.round(t.duration) : 0, genre: str(t.genre),
    };
  }
  function ccItem(r) {   // Openverse result (Creative Commons, from Jamendo)
    const url = https(r?.url);
    if (!r || !r.id || !str(r.title) || !url) return null;
    return {
      key: 'c:' + r.id, type: 'song', src: 'cc', id: String(r.id), name: str(r.title), artist: str(r.creator), art: https(r.thumbnail), url,
      duration: Number.isFinite(r.duration) ? Math.round(r.duration / 1000) : 0, genre: str(r.genres?.[0]), album: str(r.audio_set?.title),
    };
  }
  // The playable tracks of an Internet Archive item (its metadata), in order
  function iaTracks(meta) {
    const id = str(meta?.metadata?.identifier);
    if (!id) return [];
    const artist = str([].concat(meta.metadata.creator || [])[0]), album = str([].concat(meta.metadata.title || [])[0]);
    const files = (meta.files || []).filter(f => /\.mp3$/i.test(f.name || '') && !/_(64kb|vbr)_sample/i.test(f.name));
    const n = f => parseInt(f.track, 10) || 1e6;
    return files.sort((a, b) => n(a) - n(b) || String(a.name).localeCompare(String(b.name))).map((f, i) => ({
      key: `a:${id.slice(0, 100)}#${i + 1}`, type: 'song', src: 'ia', id: `${id.slice(0, 100)}#${i + 1}`, name: str(f.title) || str(f.name).split('/').pop().replace(/\.mp3$/i, ''), artist, album,
      art: `${ARCHIVE}/services/img/${encodeURIComponent(id)}`, url: `${ARCHIVE}/download/${encodeURIComponent(id)}/${String(f.name).split('/').map(encodeURIComponent).join('/')}`,
      duration: seconds(f.length), genre: '',
    }));
  }
  function stationItem(s) {   // Radio Browser station
    const url = https(s?.url_resolved) || https(s?.url);
    if (!s || !s.stationuuid || !str(s.name) || !url || s.hls === 1) return null;   // https only: an https page can't play http audio
    const tags = String(s.tags || '').split(',').map(t => t.trim()).filter(Boolean);
    return { key: 'r:' + s.stationuuid, type: 'radio', src: 'rb', id: String(s.stationuuid), name: str(s.name), artist: [s.state, s.country].map(str).filter(Boolean).join(', '), art: https(s.favicon), url, genre: tags[0] || '' };
  }
  function somaItem(c) {   // SomaFM channel
    if (!c || !/^[a-z0-9]+$/i.test(c.id || '') || !str(c.title)) return null;
    return { key: 'r:soma-' + c.id, type: 'radio', src: 'soma', id: 'soma-' + c.id, name: 'SomaFM ' + str(c.title), artist: str(c.description), art: https(c.xlimage) || https(c.largeimage) || https(c.image), url: `https://ice2.somafm.com/${c.id}-128-mp3`, genre: str(c.genre).split('|')[0] };
  }
  function playlistItem(p) {   // Audius playlist or album
    if (!p || !p.id || !str(p.playlist_name)) return null;
    return { kind: 'playlist', id: String(p.id), name: str(p.playlist_name), by: str(p.user?.name), byId: str(p.user?.id), art: art480(p.artwork), count: p.track_count | 0, note: str(p.description), href: '#music/playlist/' + encodeURIComponent(p.id) };
  }
  function albumItem(d) {   // Internet Archive item (a concert or a netlabel release)
    const id = str(d?.identifier);
    if (!id) return null;
    return { kind: 'album', id, name: str([].concat(d.title || [])[0]) || id, by: str([].concat(d.creator || [])[0]), art: `${ARCHIVE}/services/img/${encodeURIComponent(id)}`, note: str(d.date).slice(0, 4), href: '#music/album/' + encodeURIComponent(id) };
  }
  function artistItem(u) {   // Audius artist
    if (!u || !u.id || !str(u.name)) return null;
    return { id: String(u.id), name: str(u.name), handle: str(u.handle), art: art480(u.profile_picture), cover: https(u.cover_photo?.['2000x']) || https(u.cover_photo?.['640x']), followers: u.follower_count | 0, tracks: u.track_count | 0, verified: !!u.is_verified, bio: str(u.bio), where: str(u.location), href: '#music/artist/' + encodeURIComponent(u.id) };
  }

  // The artwork at its largest (for the Now Playing screen and the lock screen)
  const bigArt = item => (item?.art || '').replace(/\/480x480\.jpg$/, '/1000x1000.jpg');
  const streamUrl = item => https(item.url) || `${AUDIUS}/tracks/${encodeURIComponent(item.id)}/stream?app_name=${APP}`;

  // ---- addresses
  const qs = params => new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
  const au = (path, params = {}) => `${AUDIUS}/${path}?${qs({ app_name: APP, ...params })}`;
  const urls = {
    trending: (genre = '', limit = 30) => au('tracks/trending', { time: 'week', limit, genre: GENRES.some(g => g.audius === genre) ? genre : '' }),
    underground: () => au('tracks/trending/underground', { limit: 30 }),
    songSearch: text => au('tracks/search', { query: text, limit: 40 }),
    artistSearch: text => au('users/search', { query: text, limit: 12 }),
    playlistSearch: text => au('playlists/search', { query: text, limit: 12 }),
    playlists: () => au('playlists/trending', { time: 'week', limit: 20 }),
    playlist: id => au(`playlists/${encodeURIComponent(id)}`),
    playlistTracks: id => au(`playlists/${encodeURIComponent(id)}/tracks`),
    artist: id => au(`users/${encodeURIComponent(id)}`),
    artistTracks: id => au(`users/${encodeURIComponent(id)}/tracks`, { sort: 'plays', limit: 50 }),
    cc: (text, size = 20) => `${OPENVERSE}?${qs({ q: text, source: 'jamendo', category: 'music', page_size: size })}`,
    archive: (query, sort, rows = 16) => `${ARCHIVE}/advancedsearch.php?${qs({ q: query, rows, output: 'json', 'sort[]': sort })}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=date`,
    concerts: () => urls.archive('collection:etree AND mediatype:etree', 'week desc'),
    netlabels: word => urls.archive(`collection:netlabels AND mediatype:audio AND subject:"${String(word).replace(/[^\w &-]/g, '')}"`, 'downloads desc', 12),
    albumSearch: text => urls.archive(`(collection:etree OR collection:netlabels) AND (${String(text).replace(/[^\p{L}\p{N} ]/gu, ' ').trim() || 'music'})`, 'downloads desc', 12),
    archiveItem: id => `${ARCHIVE}/metadata/${encodeURIComponent(id)}`,
    soma: () => 'https://somafm.com/channels.json',
    stations: ({ cc = '', tag = '', name = '', limit = 60 } = {}) => `/json/stations/search?${qs({ countrycode: cc, tag, name, is_https: 'true', hidebroken: 'true', order: 'clickcount', reverse: 'true', limit })}`,
  };

  // ---- favourites (newest first, no duplicates)
  const isFav = (list, key) => list.some(i => i.key === key);
  function toggleFav(list, item) {
    if (isFav(list, item.key)) return list.filter(i => i.key !== item.key);
    const { key, type, src, id, name, artist, artistId, art, url, duration, genre, album } = item;
    const keep = { key, type, src, id, name, artist, art, genre, ...(artistId && { artistId }), ...(album && { album }), ...(src !== 'audius' && { url }), ...(duration && { duration }) };
    return [keep, ...list].slice(0, FAV_MAX);
  }
  const validFav = i => !!i && typeof i.key === 'string' && !!i.id && !!i.name
    && ((i.type === 'radio' && !!https(i.url)) || (i.type === 'song' && (!i.src || i.src === 'audius' || !!https(i.url))));

  // Shuffled copy that starts with `first`
  function shuffled(list, first, random = Math.random) {
    const rest = list.filter(i => i !== first);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    return first ? [first, ...rest] : rest;
  }

  // "#music/<arg>" -> what to show
  function parseRoute(arg = '') {
    const [a = '', ...rest] = String(arg).split('/');
    const tail = rest.join('/');
    if (a === 'browse') return { page: 'browse' };
    if (a === 'genre') return genreById(rest[0]) ? { page: 'genre', genre: rest[0] } : { page: 'browse' };
    if (a === 'radio') return rest[0] === 'search' ? { page: 'radio', search: rest.slice(1).join('/') } : { page: 'radio', genre: genreById(rest[0]) ? rest[0] : '' };
    if (a === 'library' || a === 'favourites') return { page: 'library' };
    if (a === 'search') return { page: 'search', search: tail };
    if (a === 'playlist' && tail) return { page: 'playlist', id: tail };
    if (a === 'album' && tail) return { page: 'album', id: tail };
    if (a === 'artist' && tail) return { page: 'artist', id: tail };
    return { page: 'home' };
  }

  const pure = { GENRES, genreById, songItem, ccItem, iaTracks, stationItem, somaItem, playlistItem, albumItem, artistItem, bigArt, streamUrl, urls, isFav, toggleFav, validFav, shuffled, parseRoute, clock, seconds, esc, https };
  if (typeof module !== 'undefined') module.exports = pure;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // ================================================================ data (browser only)
  // Answers are remembered for this visit; Openverse allows only a couple of hundred anonymous requests a day,
  // so its answers are also kept for six hours.
  const cache = new Map();
  const KEEP = 6 * 3600e3;
  function getJSON(url) {
    if (cache.has(url)) return cache.get(url);
    const slow = url.startsWith(OPENVERSE), slot = 'sb:mc:' + url;
    if (slow) {
      try { const hit = JSON.parse(sessionStorage.getItem(slot) || localStorage.getItem(slot)); if (hit && hit.at > Date.now() - KEEP) { const p = Promise.resolve(hit.data); cache.set(url, p); return p; } } catch { /* nothing kept */ }
    }
    const req = fetch(url).then(r => { if (!r.ok) throw new Error(r.status === 429 ? 'Too many requests for now' : `HTTP ${r.status}`); return r.json(); });
    req.then(data => { if (slow) { try { localStorage.setItem(slot, JSON.stringify({ at: Date.now(), data })); } catch { /* storage full */ } } }, () => cache.delete(url));
    cache.set(url, req);
    return req;
  }
  const list = (items, map) => (items || []).map(map).filter(Boolean);
  const uniq = (items, by = i => i.key) => { const seen = new Set(); return items.filter(i => !seen.has(by(i)) && seen.add(by(i))); };
  async function radioBrowser(params) {
    let last;
    for (const host of RADIO_HOSTS) {   // the directory runs on several servers; use the first that answers
      try { return uniq(list(await getJSON(host + urls.stations(params)), stationItem), s => s.name.toLowerCase()); } catch (e) { last = e; }
    }
    throw last || new Error('Radio directory unavailable');
  }
  const data = {
    trending: async (genre, limit) => list((await getJSON(urls.trending(genre, limit))).data, songItem),
    underground: async () => list((await getJSON(urls.underground())).data, songItem),
    songSearch: async text => list((await getJSON(urls.songSearch(text))).data, songItem),
    artistSearch: async text => list((await getJSON(urls.artistSearch(text))).data, artistItem),
    playlistSearch: async text => list((await getJSON(urls.playlistSearch(text))).data, playlistItem),
    playlists: async () => list((await getJSON(urls.playlists())).data, playlistItem),
    playlist: async id => ({ info: playlistItem((await getJSON(urls.playlist(id))).data?.[0]), tracks: list((await getJSON(urls.playlistTracks(id))).data, songItem) }),
    artist: async id => ({ info: artistItem((await getJSON(urls.artist(id))).data), tracks: list((await getJSON(urls.artistTracks(id))).data, songItem) }),
    cc: async (text, size) => list((await getJSON(urls.cc(text, size))).results, ccItem),
    concerts: async () => list((await getJSON(urls.concerts())).response?.docs, albumItem),
    netlabels: async word => list((await getJSON(urls.netlabels(word))).response?.docs, albumItem),
    albumSearch: async text => list((await getJSON(urls.albumSearch(text))).response?.docs, albumItem),
    album: async id => { const meta = await getJSON(urls.archiveItem(id)); return { info: albumItem({ ...meta.metadata, identifier: meta.metadata?.identifier }), tracks: iaTracks(meta), note: str(meta.metadata?.venue || meta.metadata?.coverage) }; },
    soma: async () => list((await getJSON(urls.soma())).channels, somaItem),
    stations: radioBrowser,
  };

  // ================================================================ favourites
  const favs = () => { try { const l = JSON.parse(localStorage.getItem(FAV_KEY)); return Array.isArray(l) ? l.filter(validFav) : []; } catch { return []; } };
  const changed = () => document.dispatchEvent(new CustomEvent('sb-music'));
  function favourite(item) {
    const next = toggleFav(favs(), item);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch { /* storage full or private mode */ }
    changed();
    return isFav(next, item.key);
  }

  // ================================================================ player
  // One <audio> element for everything. Phones keep an <audio> element playing with the screen off, and the
  // Media Session below puts the song, its artwork and the controls on the lock screen. The next song is started
  // from inside the "ended" event on the same element, which is what lets it carry on while the phone is locked.
  const audio = document.createElement('audio');
  audio.preload = 'auto';
  audio.setAttribute('playsinline', '');
  audio.style.display = 'none';
  (document.body || document.documentElement).appendChild(audio);
  let queue = [], index = -1, current = null, failures = 0, retryTimer = 0, onProblem = () => {};
  const ms = 'mediaSession' in navigator ? navigator.mediaSession : null;

  function describe(item) {
    if (!ms) return;
    try {
      const art = bigArt(item);
      ms.metadata = new MediaMetadata({
        title: item.name, artist: item.artist || (item.type === 'radio' ? 'Radio' : ''), album: item.album || (item.type === 'radio' ? 'Live radio' : APP),
        artwork: art ? [{ src: item.art || art, sizes: '480x480' }, { src: art, sizes: '1000x1000' }] : [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
      });
    } catch { /* older browsers */ }
  }
  function position() {
    if (!ms?.setPositionState) return;
    try {
      if (current?.type === 'song' && audio.duration > 0 && Number.isFinite(audio.duration)) ms.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: audio.playbackRate || 1 });
      else ms.setPositionState();
    } catch { /* not supported */ }
  }
  function start(item, items, { shuffle = false } = {}) {
    clearTimeout(retryTimer);
    if (items) { queue = shuffle ? shuffled(items, item) : items; index = queue.findIndex(i => i.key === item.key); }
    current = item;
    audio.src = streamUrl(item);
    describe(item);
    audio.play().then(() => { failures = 0; }).catch(e => { if (e?.name !== 'AbortError') failed(); });
    changed();
  }
  function step(dir) {
    if (queue.length < 2) return false;
    index = ((index + dir) % queue.length + queue.length) % queue.length;
    start(queue[index]);
    return true;
  }
  function failed() {
    if (!current) return;
    failures++;
    if (current.type === 'radio' && failures <= 3) {   // a station that drops out (patchy mobile signal) is reconnected
      const item = current;
      retryTimer = setTimeout(() => { if (current === item) { audio.src = streamUrl(item); audio.play().catch(() => failed()); } }, 2000 * failures);
      return;
    }
    onProblem(current);
    if (current.type === 'song' && queue.length > 1 && failures < 4) step(1); else { failures = 0; changed(); }
  }
  function stop() { clearTimeout(retryTimer); audio.pause(); audio.removeAttribute('src'); audio.load(); current = null; queue = []; index = -1; if (ms) { try { ms.metadata = null; ms.playbackState = 'none'; } catch { /* ignore */ } } changed(); }
  const toggle = () => (audio.paused ? audio.play().catch(() => failed()) : audio.pause());
  function seekTo(time) { if (current?.type === 'song' && audio.duration > 0) { audio.currentTime = Math.max(0, Math.min(audio.duration - 0.25, time)); position(); } }

  audio.addEventListener('play', () => { if (ms) ms.playbackState = 'playing'; changed(); });
  audio.addEventListener('pause', () => { if (ms) ms.playbackState = 'paused'; changed(); });
  audio.addEventListener('ended', () => { if (!step(1)) changed(); });
  audio.addEventListener('error', () => { if (audio.getAttribute('src')) failed(); });
  audio.addEventListener('playing', () => { failures = 0; position(); });
  for (const ev of ['durationchange', 'seeked', 'ratechange']) audio.addEventListener(ev, position);
  if (ms) {
    const on = (name, fn) => { try { ms.setActionHandler(name, fn); } catch { /* not supported on this device */ } };
    on('play', () => audio.play().catch(() => failed()));
    on('pause', () => audio.pause());
    on('stop', stop);
    on('previoustrack', () => { if (audio.currentTime > 4 && current?.type === 'song') seekTo(0); else step(-1); });
    on('nexttrack', () => step(1));
    on('seekto', e => seekTo(e.seekTime));
    on('seekbackward', e => seekTo(audio.currentTime - (e.seekOffset || 10)));
    on('seekforward', e => seekTo(audio.currentTime + (e.seekOffset || 10)));
  }

  const player = {
    audio, start, step, stop, toggle, seekTo,
    pause: () => audio.pause(),
    get current() { return current; },
    get queue() { return queue; },
    get index() { return index; },
    get paused() { return audio.paused; },
    set onProblem(fn) { onProblem = fn; },
  };
  window.StreamBoxMusic = { ...pure, data, player, favs, favourite, pause: () => audio.pause(), stop, render: () => {} };
})();
