/* Music: a personal music system with no subscriptions. Your own music plus free, legal music platforms, with
   favourites, playlists, shuffle, listening history, and artists and albums. The pages are in music-ui.js.

   Where the music comes from (none needs a key or an account):
     My Music          your own files, kept on this device (music-local.js)
     Your server       optional: your own Navidrome, Gonic or Airsonic server (open source, the Subsonic API), so your
                       whole collection plays on every device
     Audius            songs, playlists and artists: a platform where artists publish their own music, free to stream
     Openverse         Creative Commons songs (from Jamendo), through Openverse's open search API
     Internet Archive  the Live Music Archive (concerts) and netlabel albums
     SomaFM, Radio Browser   listener-supported and community-listed internet radio

   Posters: every song, album and artist shows its artwork. When something has none (often your own files), the
   album's official artwork is looked up by artist and album (/api/music-art).

   Kept in localStorage: favourites (sb:music, which account.js syncs to the signed-in person's account), playlists
   (sb:music-playlists), listening history (sb:music-recent) and the server connection (sb:music-server), the last
   three on this device only. The first half is plain logic (no page code) so it can be tested on its own. */
(() => {
  'use strict';
  const APP = 'StreamBox';
  const AUDIUS = 'https://api.audius.co/v1';
  const OPENVERSE = 'https://api.openverse.org/v1/audio/';
  const ARCHIVE = 'https://archive.org';
  const RADIO_HOSTS = ['de1', 'fi1', 'nl1', 'at1'].map(h => `https://${h}.api.radio-browser.info`);
  const ART = '/api/music-art';
  const KEYS = { favs: 'sb:music', playlists: 'sb:music-playlists', recent: 'sb:music-recent', server: 'sb:music-server' };
  const LIMITS = { favs: 300, playlists: 100, playlistSongs: 500, recent: 100 };
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
  const sortName = s => str(s).toLowerCase().replace(/^the\s+/, '');
  const byName = (a, b) => sortName(a).localeCompare(sortName(b));

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

  // ---- your own music server (Navidrome, Gonic, Airsonic...: the Subsonic API)
  // Requests are signed with a token (md5 of the password and a random salt), so the password itself is never kept.
  function md5(text) {   // RFC 1321, for the Subsonic token
    const bytes = new TextEncoder().encode(text), n = ((bytes.length + 8) >> 6) + 1, w = new Uint32Array(n * 16);
    bytes.forEach((b, i) => { w[i >> 2] |= b << ((i % 4) * 8); });
    w[bytes.length >> 2] |= 0x80 << ((bytes.length % 4) * 8);
    w[n * 16 - 2] = bytes.length * 8;
    const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
    let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
    for (let o = 0; o < w.length; o += 16) {
      let [a, b, c, d] = [a0, b0, c0, d0];
      for (let i = 0; i < 64; i++) {
        const r = i >> 4;
        const f = r === 0 ? (b & c) | (~b & d) : r === 1 ? (d & b) | (~d & c) : r === 2 ? b ^ c ^ d : c ^ (b | ~d);
        const g = r === 0 ? i : r === 1 ? (5 * i + 1) % 16 : r === 2 ? (3 * i + 5) % 16 : (7 * i) % 16;
        const s = S[r * 4 + (i % 4)], sum = (a + f + K[i] + w[o + g]) >>> 0;
        [a, d, c] = [d, c, b];
        b = (b + ((sum << s) | (sum >>> (32 - s)))) >>> 0;
      }
      a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
    }
    return [a0, b0, c0, d0].map(x => Array.from({ length: 4 }, (_, i) => ((x >>> (i * 8)) & 255).toString(16).padStart(2, '0')).join('')).join('');
  }
  // The saved connection: the server's address (https: an https page can't load http music) and the signed token
  function serverLogin(url, user, password, salt) {
    const base = https(str(url).replace(/\/+$/, '').replace(/\/rest$/, ''));
    if (!base) throw new Error('Use the server’s https:// address (a secure page can’t play music from an http:// one).');
    if (!str(user) || !password) throw new Error('Enter your username and password.');
    return { url: base, user: str(user), salt, token: md5(password + salt) };
  }
  const subUrl = (server, method, params = {}) => `${server.url}/rest/${method}?${qs({ u: server.user, t: server.token, s: server.salt, v: '1.16.1', c: APP, f: 'json', ...params })}`;
  const subSong = s => (s && s.id && str(s.title) && !s.isVideo
    ? { key: 'v:' + s.id, type: 'song', src: 'sub', id: String(s.id), name: str(s.title), artist: str(s.artist), artistId: str(s.artistId), album: str(s.album), albumId: str(s.albumId), coverArt: str(s.coverArt), duration: s.duration | 0, genre: str(s.genre), track: s.track | 0 }
    : null);
  const subAlbum = a => (a && a.id && str(a.name || a.title) ? { kind: 'album', id: String(a.id), name: str(a.name || a.title), by: str(a.artist), byId: str(a.artistId), coverArt: str(a.coverArt), count: a.songCount | 0, note: a.year ? String(a.year) : '', href: '#music/server/album/' + encodeURIComponent(a.id) } : null);
  const subArtist = a => (a && a.id && str(a.name) ? { id: String(a.id), name: str(a.name), coverArt: str(a.coverArt), albums: a.albumCount | 0, href: '#music/server/artist/' + encodeURIComponent(a.id) } : null);

  // ---- your playlists and listening history
  // What is kept of a song or station: enough to show it and play it again. Songs played by their id keep no address
  // (a server song's address carries the sign-in token, and your own files are found on the device by their id).
  const BY_ID = new Set(['audius', 'local', 'sub', 'youtube']);
  function slim(item) {
    const { key, type, src, id, name, artist, artistId, art, url, duration, genre, album, albumId, coverArt } = item;
    const keepArt = src !== 'sub' && src !== 'local' && https(art);   // those two get their picture back from their source
    return { key, type, src, id, name, artist: artist || '', genre: genre || '', ...(keepArt && { art: keepArt }), ...(artistId && { artistId }), ...(album && { album }), ...(albumId && { albumId }), ...(coverArt && { coverArt }), ...(!BY_ID.has(src) && { url }), ...(duration && { duration }) };
  }
  const isFav = (list, key) => list.some(i => i.key === key);
  function toggleFav(list, item) {
    if (isFav(list, item.key)) return list.filter(i => i.key !== item.key);
    return [slim(item), ...list].slice(0, LIMITS.favs);
  }
  const validItem = i => !!i && typeof i.key === 'string' && !!i.id && !!i.name
    && ((i.type === 'radio' && !!https(i.url)) || (i.type === 'song' && (BY_ID.has(i.src) || !i.src || !!https(i.url))));
  const validFav = validItem;
  // Listening history: newest first, each song once
  const addRecent = (list, item, at = Date.now()) => [{ ...slim(item), at }, ...list.filter(i => i.key !== item.key)].slice(0, LIMITS.recent);
  // Playlists: { id, name, at, items: [...] }
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  function createPlaylist(lists, name, items = [], id = newId()) {
    const title = str(name).slice(0, 80) || 'New Playlist';
    return { lists: [{ id, name: title, at: Date.now(), items: items.map(slim).slice(0, LIMITS.playlistSongs) }, ...lists].slice(0, LIMITS.playlists), id };
  }
  const editPlaylist = (lists, id, fn) => lists.map(p => (p.id === id ? { ...p, ...fn(p), at: Date.now() } : p));
  const addToPlaylist = (lists, id, items) => editPlaylist(lists, id, p => ({ items: [...p.items, ...items.filter(i => !p.items.some(x => x.key === i.key)).map(slim)].slice(0, LIMITS.playlistSongs) }));
  const removeFromPlaylist = (lists, id, key) => editPlaylist(lists, id, p => ({ items: p.items.filter(i => i.key !== key) }));
  const moveInPlaylist = (lists, id, key, by) => editPlaylist(lists, id, p => {
    const items = [...p.items], i = items.findIndex(x => x.key === key), j = Math.max(0, Math.min(items.length - 1, i + by));
    if (i >= 0) items.splice(j, 0, items.splice(i, 1)[0]);
    return { items };
  });
  const renamePlaylist = (lists, id, name) => editPlaylist(lists, id, () => ({ name: str(name).slice(0, 80) || 'Playlist' }));
  const deletePlaylist = (lists, id) => lists.filter(p => p.id !== id);
  const cleanPlaylists = raw => (Array.isArray(raw) ? raw : []).filter(p => p && typeof p.id === 'string' && str(p.name))
    .map(p => ({ id: p.id, name: str(p.name).slice(0, 80), at: +p.at || 0, items: (Array.isArray(p.items) ? p.items : []).filter(validItem).slice(0, LIMITS.playlistSongs) }));

  // ---- your music, organised by artist and album (your own files, or any list of songs)
  function organise(songs) {
    const artists = new Map(), albums = new Map();
    for (const s of songs) {
      const who = str(s.albumArtist || s.artist) || 'Unknown Artist';
      const albumKey = `${who.toLowerCase()}||${str(s.album).toLowerCase() || '(singles)'}`;
      if (!albums.has(albumKey)) albums.set(albumKey, { key: albumKey, name: str(s.album) || 'Singles', by: who, art: s.art || '', year: s.year || '', songs: [] });
      const al = albums.get(albumKey);
      al.songs.push(s);
      if (!al.art && s.art) al.art = s.art;
      if (!artists.has(who.toLowerCase())) artists.set(who.toLowerCase(), { name: who, art: '', albums: new Set(), songs: [] });
      const ar = artists.get(who.toLowerCase());
      ar.songs.push(s); ar.albums.add(albumKey);
      if (!ar.art && s.art) ar.art = s.art;
    }
    for (const al of albums.values()) al.songs.sort((a, b) => (a.disc | 0) - (b.disc | 0) || (a.track | 0) - (b.track | 0) || byName(a.name, b.name));
    return {
      artists: [...artists.values()].map(a => ({ ...a, albums: [...a.albums].map(k => albums.get(k)) })).sort((a, b) => byName(a.name, b.name)),
      albums: [...albums.values()].sort((a, b) => byName(a.by, b.by) || byName(a.name, b.name)),
      songs: [...songs].sort((a, b) => byName(a.name, b.name)),
    };
  }
  // Song, artist or album words in any order: "beatles help" finds Help! by The Beatles
  function matches(item, text) {
    const hay = `${item.name} ${item.artist || ''} ${item.album || ''} ${item.genre || ''}`.toLowerCase();
    return str(text).toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
  }

  // The artwork at its largest (for the Now Playing screen and the lock screen)
  const bigArt = item => (item?.art || '').replace(/\/480x480\.jpg$/, '/1000x1000.jpg').replace(/\/600x600bb\.(jpg|png)$/, '/1000x1000bb.$1');

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
    stream: id => `${AUDIUS}/tracks/${encodeURIComponent(id)}/stream?app_name=${APP}`,
    cc: (text, size = 20) => `${OPENVERSE}?${qs({ q: text, source: 'jamendo', category: 'music', page_size: size })}`,
    archive: (query, sort, rows = 16) => `${ARCHIVE}/advancedsearch.php?${qs({ q: query, rows, output: 'json', 'sort[]': sort })}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=date`,
    concerts: () => urls.archive('collection:etree AND mediatype:etree', 'week desc'),
    netlabels: word => urls.archive(`collection:netlabels AND mediatype:audio AND subject:"${String(word).replace(/[^\w &-]/g, '')}"`, 'downloads desc', 12),
    albumSearch: text => urls.archive(`(collection:etree OR collection:netlabels) AND (${String(text).replace(/[^\p{L}\p{N} ]/gu, ' ').trim() || 'music'})`, 'downloads desc', 12),
    archiveItem: id => `${ARCHIVE}/metadata/${encodeURIComponent(id)}`,
    soma: () => 'https://somafm.com/channels.json',
    stations: ({ cc = '', tag = '', name = '', limit = 60 } = {}) => `/json/stations/search?${qs({ countrycode: cc, tag, name, is_https: 'true', hidebroken: 'true', order: 'clickcount', reverse: 'true', limit })}`,
    art: (artist, album) => `${ART}?${qs({ artist: str(artist).slice(0, 100), album: str(album).slice(0, 100) })}`,
  };

  // Shuffled copy that starts with `first`
  function shuffled(list, first, random = Math.random) {
    const rest = list.filter(i => i !== first);
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    return first ? [first, ...rest] : rest;
  }

  // "#music/<arg>" -> what to show
  const LIBRARY_PARTS = ['songs', 'artists', 'albums', 'playlists', 'favourites', 'recent'];
  function parseRoute(arg = '') {
    const [a = '', b = '', ...rest] = String(arg).split('/');
    const tail = [b, ...rest].join('/');
    if (a === 'browse') return { page: 'browse' };
    if (a === 'genre') return genreById(b) ? { page: 'genre', genre: b } : { page: 'browse' };
    if (a === 'radio') return b === 'search' ? { page: 'radio', search: rest.join('/') } : { page: 'radio', genre: genreById(b) ? b : '' };
    if (a === 'library') return LIBRARY_PARTS.includes(b) ? { page: 'library', part: b } : { page: 'library', part: '' };
    if (a === 'favourites') return { page: 'library', part: 'favourites' };
    if (a === 'list' && b) return { page: 'mylist', id: b };
    if (a === 'my-artist' && tail) return { page: 'myartist', name: tail };
    if (a === 'my-album' && tail) return { page: 'myalbum', key: tail };
    if (a === 'server') return b === 'album' && rest.length ? { page: 'subalbum', id: rest.join('/') } : b === 'artist' && rest.length ? { page: 'subartist', id: rest.join('/') } : { page: 'server' };
    if (a === 'search') return { page: 'search', search: tail };
    if (a === 'playlist' && tail) return { page: 'playlist', id: tail };
    if (a === 'album' && tail) return { page: 'album', id: tail };
    if (a === 'artist' && tail) return { page: 'artist', id: tail };
    return { page: 'home' };
  }

  const pure = {
    GENRES, genreById, songItem, ccItem, iaTracks, stationItem, somaItem, playlistItem, albumItem, artistItem, bigArt, urls, md5, serverLogin, subUrl, subSong, subAlbum, subArtist,
    slim, isFav, toggleFav, validFav, validItem, addRecent, createPlaylist, addToPlaylist, removeFromPlaylist, moveInPlaylist, renamePlaylist, deletePlaylist, cleanPlaylists,
    organise, matches, shuffled, parseRoute, esc, clock, LIMITS,
  };
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
      try { const hit = JSON.parse(localStorage.getItem(slot)); if (hit && hit.at > Date.now() - KEEP) { const p = Promise.resolve(hit.data); cache.set(url, p); return p; } } catch { /* nothing kept */ }
    }
    const req = fetch(url).then(r => { if (!r.ok) throw new Error(r.status === 429 ? 'Too many requests for now' : `HTTP ${r.status}`); return r.json(); });
    req.then(d => { if (slow) { try { localStorage.setItem(slot, JSON.stringify({ at: Date.now(), data: d })); } catch { /* storage full */ } } }, () => cache.delete(url));
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

  // ---- saved lists
  const read = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or private mode */ } };
  const changed = () => document.dispatchEvent(new CustomEvent('sb-music'));
  const favs = () => (Array.isArray(read(KEYS.favs, [])) ? read(KEYS.favs, []).filter(validFav).map(revive) : []);
  function favourite(item) {
    const next = toggleFav(read(KEYS.favs, []).filter(validFav), item);
    write(KEYS.favs, next); changed();
    return isFav(next, item.key);
  }
  const playlists = () => cleanPlaylists(read(KEYS.playlists, [])).map(p => ({ ...p, items: p.items.map(revive) }));
  function savePlaylists(fn) { const next = fn(cleanPlaylists(read(KEYS.playlists, []))); write(KEYS.playlists, next); changed(); return next; }
  const recent = () => (Array.isArray(read(KEYS.recent, [])) ? read(KEYS.recent, []).filter(validItem).map(revive) : []);
  const local = () => window.StreamBoxMusicLocal || null;

  // ---- your server
  const server = {
    get settings() { const s = read(KEYS.server, null); return s && https(s.url) && s.user && /^[0-9a-f]{32}$/.test(s.token) ? s : null; },
    get connected() { return !!server.settings; },
    async connect(url, user, password) {
      const salt = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
      const s = serverLogin(url, user, password, salt);
      let r;
      try { r = await (await fetch(subUrl(s, 'ping'))).json(); } catch { throw new Error('The server didn’t answer. Check the address, and that it allows this site (CORS: Navidrome does).'); }
      const res = r?.['subsonic-response'];
      if (res?.status !== 'ok') throw new Error(res?.error?.message || 'The server refused the sign-in.');
      write(KEYS.server, s); cache.clear(); changed();
      return s;
    },
    disconnect() { try { localStorage.removeItem(KEYS.server); } catch { /* ignore */ } changed(); },
    async call(method, params) {
      const s = server.settings;
      if (!s) throw new Error('No music server connected');
      const res = (await getJSON(subUrl(s, method, params)))?.['subsonic-response'];
      if (res?.status !== 'ok') throw new Error(res?.error?.message || 'The music server didn’t answer');
      return res;
    },
    cover: (id, size = 600) => (server.settings && id ? subUrl(server.settings, 'getCoverArt', { id, size }) : ''),
    stream: id => (server.settings ? subUrl(server.settings, 'stream', { id }) : ''),
  };
  const withCover = x => (x ? { ...x, art: x.art || server.cover(x.coverArt) } : x);

  // A saved song (favourite, playlist, history) gets back what isn't kept: its picture
  function revive(item) {
    if (item.src === 'sub') return withCover(item);
    if (item.src === 'local') { const own = local()?.get(item.id); return own ? { ...item, ...own } : item; }
    return item;
  }

  // Posters for songs and albums that have none: the album's official artwork, looked up once per album
  const artLookups = new Map();
  function findArt(artist, album) {
    const k = `${str(artist).toLowerCase()}|${str(album).toLowerCase()}`;
    if (!artLookups.has(k)) artLookups.set(k, fetch(urls.art(artist, album)).then(r => (r.ok ? r.json() : {})).then(d => https(d.art)).catch(() => ''));
    return artLookups.get(k);
  }

  const data = {
    openTuneSearch: async query => {
      const response = await fetch('https://streambox-opentune.onrender.com/api/search?q=' + encodeURIComponent(query));
      if (!response.ok) throw new Error('OpenTune search unavailable');
      const payload = await response.json();
      return (payload.results || []).map(track => {
        if (!track.videoId || !track.title) return null;
        const parts = String(track.duration || '').split(':').map(Number);
        const duration = parts.reduce((total, part) => total * 60 + (Number.isFinite(part) ? part : 0), 0);
        return { key: 'yt:' + track.videoId, type: 'song', src: 'youtube', id: String(track.videoId), name: String(track.title), artist: String(track.artist || ''), art: https(track.thumbnail), duration };
      }).filter(Boolean);
    },
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
    // your server
    serverAlbums: async (type = 'newest', size = 24) => list((await server.call('getAlbumList2', { type, size })).albumList2?.album, subAlbum).map(withCover),
    serverRandom: async (size = 30) => list((await server.call('getRandomSongs', { size })).randomSongs?.song, subSong).map(withCover),
    serverArtists: async () => list((await server.call('getArtists')).artists?.index?.flatMap(i => i.artist || []), subArtist).map(withCover),
    serverArtist: async id => { const a = (await server.call('getArtist', { id })).artist; return { info: withCover(subArtist(a)), albums: list(a?.album, subAlbum).map(withCover) }; },
    serverAlbum: async id => { const a = (await server.call('getAlbum', { id })).album; return { info: withCover(subAlbum(a)), tracks: list(a?.song, subSong).map(withCover) }; },
    serverSearch: async text => { const r = (await server.call('search3', { query: text, songCount: 30, albumCount: 12, artistCount: 12 })).searchResult3 || {}; return { songs: list(r.song, subSong).map(withCover), albums: list(r.album, subAlbum).map(withCover), artists: list(r.artist, subArtist).map(withCover) }; },
  };

  // ================================================================ player
  // One <audio> element for everything. Phones keep it playing with the screen off, and the Media Session below puts
  // the song, its artwork and the controls on the lock screen. The next song is started from inside the "ended"
  // event, which lets it carry on while locked. `media` is the <audio> element; the page listens to it.
  const audio = document.createElement('audio');
  audio.preload = 'auto';
  audio.setAttribute('playsinline', '');
  audio.style.display = 'none';
  (document.body || document.documentElement).appendChild(audio);
  const media = audio;
  let queue = [], index = -1, current = null, failures = 0, retryTimer = 0, onProblem = () => {}, objectUrl = '', heard = '';
  const ms = 'mediaSession' in navigator ? navigator.mediaSession : null;

  // Your own files come from the device's storage, which takes a moment: phones only start audio inside the tap
  // that asked for it, so the tap starts a tiny silent clip first, which unlocks the element for the song.
  const SILENCE = (() => {   // a quarter-second of 8 kHz 8-bit mono silence as a WAV file
    const n = 2000, b = new Uint8Array(44 + n).fill(128), v = new DataView(b.buffer);
    [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']].forEach(([o, t]) => [...t].forEach((c, i) => b[o + i] = c.charCodeAt(0)));
    v.setUint32(4, 36 + n, true); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); v.setUint32(40, n, true);
    let bin = ''; b.forEach(x => bin += String.fromCharCode(x));
    return 'data:audio/wav;base64,' + btoa(bin);
  })();
  const silent = () => audio.src === SILENCE;
  function unlock() { try { audio.src = SILENCE; const p = audio.play(); if (p) p.catch(() => {}); } catch { /* nothing to unlock */ } }

  function describe(item) {
    if (!ms) return;
    try {
      const art = bigArt(item) || item.art;
      ms.metadata = new MediaMetadata({
        title: item.name, artist: item.artist || (item.type === 'radio' ? 'Radio' : ''), album: item.album || (item.type === 'radio' ? 'Live radio' : APP),
        artwork: art ? [{ src: art, sizes: '600x600' }] : [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
      });
    } catch { /* older browsers */ }
  }
  function position() {
    if (!ms?.setPositionState) return;
    try {
      const d = media.duration;
      if (current?.type === 'song' && d > 0 && Number.isFinite(d)) ms.setPositionState({ duration: d, position: Math.min(media.currentTime, d), playbackRate: media.playbackRate || 1 });
      else ms.setPositionState();
    } catch { /* not supported */ }
  }
  async function sourceOf(item) {
    if (item.src === 'local') { const blob = await local()?.file(item.id); if (!blob) throw new Error('This song isn’t on this device'); return URL.createObjectURL(blob); }
    if (item.src === 'sub') { const u = server.stream(item.id); if (!u) throw new Error('Connect your music server to play this'); return u; }
    return https(item.url) || (item.src === 'audius' ? urls.stream(item.id) : '');
  }
  async function begin(item) {
    let url;
    try { url = await sourceOf(item); } catch (e) { if (current === item) { onProblem(item, e.message); failedSkip(); } return; }
    if (current !== item) { if (url.startsWith('blob:')) URL.revokeObjectURL(url); return; }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = url.startsWith('blob:') ? url : '';
    audio.src = url;
    describe(item);
    audio.play().then(() => { failures = 0; }).catch(e => { if (e?.name !== 'AbortError' && e?.name !== 'NotAllowedError') failed(); });
  }
  // Posters for whatever is playing: a song without one gets its album's official artwork
  function poster(item) {
    if (item.art || item.type !== 'song' || !item.artist) return;
    findArt(item.artist, item.album || item.name).then(art => { if (art && current === item && !item.art) { item.art = art; describe(item); changed(); } });
  }

  function start(item, items, { shuffle = false } = {}) {
    clearTimeout(retryTimer);
    if (items) { queue = shuffle ? shuffled(items, item) : items; index = queue.findIndex(i => i.key === item.key); }
    current = item; heard = '';
    if (item.src === 'local') unlock();
    changed();
    poster(item);
    begin(item);
  }
  // Play next: the song goes straight after the one playing (or starts, if nothing is)
  function playNext(item) {
    if (!current) { start(item, [item]); return; }
    queue = queue.filter((x, i) => x.key !== item.key || i === index);
    index = queue.findIndex(x => x.key === current.key);
    queue.splice(index + 1, 0, item);
    changed();
  }
  // Shuffle what's left: the song playing carries on, the rest of the list is shuffled after it
  function shuffleRest() {
    if (!current || queue.length < 3) return;
    queue = shuffled(queue, queue.find(x => x.key === current.key) || current); index = 0;
    changed();
  }
  function step(dir) {
    if (queue.length < 2) return false;
    index = ((index + dir) % queue.length + queue.length) % queue.length;
    start(queue[index]);
    return true;
  }
  function failedSkip() { if (current?.type === 'song' && queue.length > 1 && failures++ < 4) step(1); else { failures = 0; changed(); } }
  function failed() {
    if (!current) return;
    failures++;
    if (current.type === 'radio' && failures <= 3) {   // a station that drops out (patchy mobile signal) is reconnected
      const item = current;
      retryTimer = setTimeout(() => { if (current === item) begin(item); }, 2000 * failures);
      return;
    }
    onProblem(current, '');
    if (current.type === 'song' && queue.length > 1 && failures < 4) step(1); else { failures = 0; changed(); }
  }
  function stop() {
    clearTimeout(retryTimer);
    audio.pause(); audio.removeAttribute('src'); audio.load(); current = null; queue = []; index = -1;
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = ''; }
    if (ms) { try { ms.metadata = null; ms.playbackState = 'none'; } catch { /* ignore */ } }
    changed();
  }
  const resume = () => audio.play().catch(() => failed());
  const pause = () => audio.pause();
  const toggle = () => (media.paused ? resume() : pause());
  function seekTo(time) {
    const d = media.duration;
    if (current?.type !== 'song' || !(d > 0)) return;
    audio.currentTime = Math.max(0, Math.min(d - 0.25, time));
    position();
  }

  media.addEventListener('play', () => { if (ms) ms.playbackState = 'playing'; changed(); });
  media.addEventListener('pause', () => { if (ms) ms.playbackState = 'paused'; changed(); });
  media.addEventListener('ended', () => { if (silent()) return; if (!step(1)) changed(); });
  media.addEventListener('error', () => { if (audio.getAttribute('src') && !silent()) failed(); });
  media.addEventListener('playing', () => {
    if (silent()) return;
    failures = 0; position();
    if (current && heard !== current.key) { heard = current.key; write(KEYS.recent, addRecent(read(KEYS.recent, []).filter(validItem), current)); }   // listening history
  });
  media.addEventListener('loadedmetadata', () => {   // your own files learn their length the first time they play
    if (current?.src === 'local' && !current.duration && audio.duration > 0 && Number.isFinite(audio.duration)) { current.duration = Math.round(audio.duration); local()?.update(current.id, { duration: current.duration }); }
  });
  for (const ev of ['durationchange', 'seeked', 'ratechange']) media.addEventListener(ev, position);
  // The lock screen / Control Center buttons. Videos in the main player take them over while they play (app.js), so
  // music claims them back whenever it starts or resumes.
  function claimSession() {
    if (!ms) return;
    const on = (name, fn) => { try { ms.setActionHandler(name, fn); } catch { /* not supported on this device */ } };
    on('play', resume);
    on('pause', pause);
    on('stop', stop);
    on('previoustrack', () => { if (media.currentTime > 4 && current?.type === 'song') seekTo(0); else step(-1); });
    on('nexttrack', () => step(1));
    on('seekto', e => seekTo(e.seekTime));
    on('seekbackward', e => seekTo(media.currentTime - (e.seekOffset || 10)));
    on('seekforward', e => seekTo(media.currentTime + (e.seekOffset || 10)));
  }
  claimSession();
  media.addEventListener('play', () => { if (current && !silent()) describe(current); claimSession(); });

  const player = {
    audio: media, start, step, stop, toggle, seekTo, pause, playNext, shuffleRest,
    get current() { return current; },
    get queue() { return queue; },
    get index() { return index; },
    get paused() { return media.paused || silent(); },
    set onProblem(fn) { onProblem = fn; },
  };
  window.StreamBoxMusic = {
    ...pure, data, player, server, favs, favourite, playlists, recent, revive, findArt, pause, stop, render: () => {},
    playlist: {
      create: (name, items) => { let id; savePlaylists(l => { const r = createPlaylist(l, name, items); id = r.id; return r.lists; }); return id; },
      add: (id, items) => savePlaylists(l => addToPlaylist(l, id, items)),
      remove: (id, key) => savePlaylists(l => removeFromPlaylist(l, id, key)),
      move: (id, key, by) => savePlaylists(l => moveInPlaylist(l, id, key, by)),
      rename: (id, name) => savePlaylists(l => renamePlaylist(l, id, name)),
      delete: id => savePlaylists(l => deletePlaylist(l, id)),
    },
    clearRecent: () => { write(KEYS.recent, []); changed(); },
  };
})();
