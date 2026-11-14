/* Generated from js/music.js (sha fe8afa7137f2a130) by scripts/build-legacy-js.mjs for older TV browsers. Do not edit. */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/* Music: where the music comes from, what the app keeps about it, favourites, and the player itself.
   The page (shelves, genres, now playing) is in music-ui.js.

     YouTube Music    trending songs, searches and playlists, through the same community backends the
                      open-source streaming apps in github.com/chayotic/Open-Source-Music-Streaming-Apps use.
                      Served by the site's /api/music-yt function so every browser can reach the instances
     Audius           songs, playlists and artists: an open platform where artists publish their own music
     Openverse        Creative Commons songs (from Jamendo), found through Openverse's open search API
     Internet Archive live concerts (the Live Music Archive) and netlabel albums
     SomaFM           listener-supported radio channels
     Radio Browser    community directory of internet radio stations

   None of them needs a key. Favourites are saved in localStorage as sb:music, which account.js syncs to the
   signed-in person's account. The first half is plain logic (no page code) so it can be tested on its own. */
(() => {
    'use strict';
    const APP = 'StreamBox';
    const AUDIUS = 'https://api.audius.co/v1';
    const OPENVERSE = 'https://api.openverse.org/v1/audio/';
    const ARCHIVE = 'https://archive.org';
    const RADIO_HOSTS = ['de1', 'fi1', 'nl1', 'at1'].map(h => `https://${h}.api.radio-browser.info`);
    const YT = '/api/music-yt';
    const PIPED = ['https://api.piped.private.coffee', 'https://pipedapi.ducks.party']; // public YouTube search backends, used straight from the browser if the site's function can't reach them
    // A search result from those backends, in the shape the site's function sends
    const pipedSong = v => { var _a; return ({ id: ((_a = String((v === null || v === void 0 ? void 0 : v.url) || '').match(/[?&]v=([\w-]{11})/)) === null || _a === void 0 ? void 0 : _a[1]) || '', name: String((v === null || v === void 0 ? void 0 : v.title) || '').trim(), artist: String((v === null || v === void 0 ? void 0 : v.uploaderName) || '').trim(), art: v === null || v === void 0 ? void 0 : v.thumbnail, duration: v === null || v === void 0 ? void 0 : v.duration }); };
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
    const esc = s => String(s !== null && s !== void 0 ? s : '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const https = u => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : '');
    const str = v => String(v !== null && v !== void 0 ? v : '').trim();
    const clock = s => (s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');
    const seconds = v => { const p = String(v !== null && v !== void 0 ? v : '').split(':').map(Number); return p.some(Number.isNaN) ? 0 : Math.round(p.reduce((a, n) => a * 60 + n, 0)); };
    // ---- what the app keeps for a song, a station, a playlist or album, and an artist
    const art480 = a => https(a === null || a === void 0 ? void 0 : a['480x480']) || https(a === null || a === void 0 ? void 0 : a['150x150']);
    function songItem(t) {
        var _a, _b;
        if (!t || !t.id || !t.title || t.is_streamable === false)
            return null;
        return {
            key: 's:' + t.id, type: 'song', src: 'audius', id: String(t.id), name: str(t.title), artist: str((_a = t.user) === null || _a === void 0 ? void 0 : _a.name), artistId: str((_b = t.user) === null || _b === void 0 ? void 0 : _b.id),
            art: art480(t.artwork), duration: Number.isFinite(t.duration) ? Math.round(t.duration) : 0, genre: str(t.genre),
        };
    }
    function ccItem(r) {
        var _a, _b;
        const url = https(r === null || r === void 0 ? void 0 : r.url);
        if (!r || !r.id || !str(r.title) || !url)
            return null;
        return {
            key: 'c:' + r.id, type: 'song', src: 'cc', id: String(r.id), name: str(r.title), artist: str(r.creator), art: https(r.thumbnail), url,
            duration: Number.isFinite(r.duration) ? Math.round(r.duration / 1000) : 0, genre: str((_a = r.genres) === null || _a === void 0 ? void 0 : _a[0]), album: str((_b = r.audio_set) === null || _b === void 0 ? void 0 : _b.title),
        };
    }
    // The playable tracks of an Internet Archive item (its metadata), in order
    function iaTracks(meta) {
        var _a;
        const id = str((_a = meta === null || meta === void 0 ? void 0 : meta.metadata) === null || _a === void 0 ? void 0 : _a.identifier);
        if (!id)
            return [];
        const artist = str([].concat(meta.metadata.creator || [])[0]), album = str([].concat(meta.metadata.title || [])[0]);
        const files = (meta.files || []).filter(f => /\.mp3$/i.test(f.name || '') && !/_(64kb|vbr)_sample/i.test(f.name));
        const n = f => parseInt(f.track, 10) || 1e6;
        return files.sort((a, b) => n(a) - n(b) || String(a.name).localeCompare(String(b.name))).map((f, i) => ({
            key: `a:${id.slice(0, 100)}#${i + 1}`, type: 'song', src: 'ia', id: `${id.slice(0, 100)}#${i + 1}`, name: str(f.title) || str(f.name).split('/').pop().replace(/\.mp3$/i, ''), artist, album,
            art: `${ARCHIVE}/services/img/${encodeURIComponent(id)}`, url: `${ARCHIVE}/download/${encodeURIComponent(id)}/${String(f.name).split('/').map(encodeURIComponent).join('/')}`,
            duration: seconds(f.length), genre: '',
        }));
    }
    function stationItem(s) {
        const url = https(s === null || s === void 0 ? void 0 : s.url_resolved) || https(s === null || s === void 0 ? void 0 : s.url);
        if (!s || !s.stationuuid || !str(s.name) || !url || s.hls === 1)
            return null; // https only: an https page can't play http audio
        const tags = String(s.tags || '').split(',').map(t => t.trim()).filter(Boolean);
        return { key: 'r:' + s.stationuuid, type: 'radio', src: 'rb', id: String(s.stationuuid), name: str(s.name), artist: [s.state, s.country].map(str).filter(Boolean).join(', '), art: https(s.favicon), url, genre: tags[0] || '' };
    }
    function somaItem(c) {
        if (!c || !/^[a-z0-9]+$/i.test(c.id || '') || !str(c.title))
            return null;
        return { key: 'r:soma-' + c.id, type: 'radio', src: 'soma', id: 'soma-' + c.id, name: 'SomaFM ' + str(c.title), artist: str(c.description), art: https(c.xlimage) || https(c.largeimage) || https(c.image), url: `https://ice2.somafm.com/${c.id}-128-mp3`, genre: str(c.genre).split('|')[0] };
    }
    function playlistItem(p) {
        var _a, _b;
        if (!p || !p.id || !str(p.playlist_name))
            return null;
        return { kind: 'playlist', id: String(p.id), name: str(p.playlist_name), by: str((_a = p.user) === null || _a === void 0 ? void 0 : _a.name), byId: str((_b = p.user) === null || _b === void 0 ? void 0 : _b.id), art: art480(p.artwork), count: p.track_count | 0, note: str(p.description), href: '#music/playlist/' + encodeURIComponent(p.id) };
    }
    function ytSong(v) {
        const id = str(v === null || v === void 0 ? void 0 : v.id);
        if (!/^[A-Za-z0-9_-]{11}$/.test(id) || !str(v === null || v === void 0 ? void 0 : v.name))
            return null;
        return { key: 'y:' + id, type: 'song', src: 'yt', id, name: str(v.name), artist: str(v.artist), art: https(v.art), duration: Number.isFinite(v.duration) ? Math.round(v.duration) : 0, genre: '' };
    }
    function chartItem(c) {
        const id = str(c === null || c === void 0 ? void 0 : c.id);
        if (!/^\d{1,20}$/.test(id) || !str(c === null || c === void 0 ? void 0 : c.name))
            return null;
        return { key: 'ch:' + id, type: 'song', src: 'chart', id, name: str(c.name), artist: str(c.artist), art: https(c.art), duration: 0, genre: str(c.genre), rank: c.rank | 0 };
    }
    function ytPlaylist(p) {
        const id = str(p === null || p === void 0 ? void 0 : p.id);
        if (!/^[\w-]{10,64}$/.test(id) || !str(p === null || p === void 0 ? void 0 : p.name))
            return null;
        return { kind: 'playlist', id: 'yt-' + id, name: str(p.name), by: str(p.by), art: https(p.art), count: p.count | 0, note: '', href: '#music/playlist/' + encodeURIComponent('yt-' + id) };
    }
    function albumItem(d) {
        const id = str(d === null || d === void 0 ? void 0 : d.identifier);
        if (!id)
            return null;
        return { kind: 'album', id, name: str([].concat(d.title || [])[0]) || id, by: str([].concat(d.creator || [])[0]), art: `${ARCHIVE}/services/img/${encodeURIComponent(id)}`, note: str(d.date).slice(0, 4), href: '#music/album/' + encodeURIComponent(id) };
    }
    function artistItem(u) {
        var _a, _b;
        if (!u || !u.id || !str(u.name))
            return null;
        return { id: String(u.id), name: str(u.name), handle: str(u.handle), art: art480(u.profile_picture), cover: https((_a = u.cover_photo) === null || _a === void 0 ? void 0 : _a['2000x']) || https((_b = u.cover_photo) === null || _b === void 0 ? void 0 : _b['640x']), followers: u.follower_count | 0, tracks: u.track_count | 0, verified: !!u.is_verified, bio: str(u.bio), where: str(u.location), href: '#music/artist/' + encodeURIComponent(u.id) };
    }
    // The artwork at its largest (for the Now Playing screen and the lock screen)
    const bigArt = item => ((item === null || item === void 0 ? void 0 : item.art) || '').replace(/\/480x480\.jpg$/, '/1000x1000.jpg').replace(/\/600x600bb\.(jpg|png)$/, '/1000x1000bb.$1');
    // A YouTube Music song is played by its id: the music-yt function finds a working audio address for it
    const streamUrl = item => https(item.url) || (item.src === 'yt' || item.src === 'chart' ? '' : `${AUDIUS}/tracks/${encodeURIComponent(item.id)}/stream?app_name=${APP}`);
    // YouTube titles carry extras ("(Official Video)", "[4K Remaster]", "ft. …") and channels end in " - Topic" or
    // "VEVO"; stripping them gives searches on other sources a real chance of finding the same song.
    const cleanTitle = t => str(t)
        .replace(/[(\[][^)\]]*(official|video|audio|lyric|visuali[sz]er|remaster|hd|4k|mv|music|explicit|clean|live|version)[^)\]]*[)\]]/gi, ' ')
        .replace(/\b(official\s+(music\s+)?(video|audio)|lyrics?\s+video|ft\.?|feat\.?)\b.*$/i, ' ')
        .replace(/[|•].*$/, ' ').replace(/\s+/g, ' ').trim();
    const cleanArtist = a => str(a).replace(/\s*-\s*topic$/i, '').replace(/vevo$/i, '').replace(/\s*official$/i, '').trim();
    // The searches tried, most precise first, to find a YouTube song on Audius
    function ytQueries(item) {
        const artist = cleanArtist(item === null || item === void 0 ? void 0 : item.artist);
        let title = cleanTitle(item === null || item === void 0 ? void 0 : item.name);
        const dash = title.match(/^(.+?)\s+[-–—]\s+(.+)$/); // "Artist - Song"
        let byTitle = '';
        if (dash) {
            byTitle = dash[1];
            title = dash[2];
        }
        const who = artist || byTitle;
        return [...new Set([[title, who].filter(Boolean).join(' '), [title, byTitle].filter(Boolean).join(' '), title].map(q => q.trim()).filter(Boolean))];
    }
    // The song in Spotify: a search for its title and artist, which opens the Spotify app where it's installed
    // (the web player otherwise). Spotify doesn't let a site start one exact song without a developer key.
    const spotifyUrl = item => `https://open.spotify.com/search/${encodeURIComponent(`${cleanTitle(item === null || item === void 0 ? void 0 : item.name)} ${cleanArtist(item === null || item === void 0 ? void 0 : item.artist)}`.trim())}`;
    const onSpotify = item => (item === null || item === void 0 ? void 0 : item.type) === 'song' && (item.src === 'chart' || item.src === 'yt'); // mainstream songs; open music and radio aren't on Spotify
    // How closely another source's song matches a YouTube song: shared title words, plus the artist
    const words = t => cleanTitle(t).toLowerCase().split(__sbRe("[^\\p{L}\\p{N}]+", "u")).filter(w => w.length > 1);
    function matchScore(item, cand) {
        const want = words(ytQueries(item).at(-1) || item.name), got = new Set(words(cand.name));
        if (!want.length)
            return 0;
        const hit = want.filter(w => got.has(w)).length / want.length;
        const a = cleanArtist(item.artist).toLowerCase(), b = str(cand.artist).toLowerCase();
        const extra = Math.min(0.3, 0.04 * [...got].filter(w => !want.includes(w) && !words(item.artist).includes(w)).length);
        const variant = /\b(remix|cover|karaoke|instrumental|8d|sped|slowed|mix|edit|reblend|bootleg|flip|mashup|vip)\b/i;
        return hit + (a && b && (a.includes(b) || b.includes(a)) ? 0.5 : 0) - extra - (variant.test(cand.name) && !variant.test(item.name) ? 0.3 : 0);
    }
    // ---- addresses
    const qs = params => new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
    const au = (path, params = {}) => `${AUDIUS}/${path}?${qs(Object.assign({ app_name: APP }, params))}`;
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
        albumSearch: text => urls.archive(`(collection:etree OR collection:netlabels) AND (${String(text).replace(__sbRe("[^\\p{L}\\p{N} ]", "gu"), ' ').trim() || 'music'})`, 'downloads desc', 12),
        archiveItem: id => `${ARCHIVE}/metadata/${encodeURIComponent(id)}`,
        soma: () => 'https://somafm.com/channels.json',
        stations: ({ cc = '', tag = '', name = '', limit = 60 } = {}) => `/json/stations/search?${qs({ countrycode: cc, tag, name, is_https: 'true', hidebroken: 'true', order: 'clickcount', reverse: 'true', limit })}`,
    };
    // ---- favourites (newest first, no duplicates)
    const isFav = (list, key) => list.some(i => i.key === key);
    function toggleFav(list, item) {
        if (isFav(list, item.key))
            return list.filter(i => i.key !== item.key);
        const { key, type, src, id, name, artist, artistId, art, url, duration, genre, album } = item;
        const byId = src === 'audius' || src === 'yt' || src === 'chart'; // these are played by their id, so they keep no address
        const keep = Object.assign(Object.assign(Object.assign(Object.assign({ key, type, src, id, name, artist, art, genre }, (artistId && { artistId })), (album && { album })), (!byId && { url })), (duration && { duration }));
        return [keep, ...list].slice(0, FAV_MAX);
    }
    const validFav = i => !!i && typeof i.key === 'string' && !!i.id && !!i.name
        && ((i.type === 'radio' && !!https(i.url)) || (i.type === 'song' && (!i.src || i.src === 'audius' || i.src === 'yt' || i.src === 'chart' || !!https(i.url))));
    // Shuffled copy that starts with `first`
    function shuffled(list, first, random = Math.random) {
        const rest = list.filter(i => i !== first);
        for (let i = rest.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [rest[i], rest[j]] = [rest[j], rest[i]];
        }
        return first ? [first, ...rest] : rest;
    }
    // "#music/<arg>" -> what to show
    function parseRoute(arg = '') {
        const [a = '', ...rest] = String(arg).split('/');
        const tail = rest.join('/');
        if (a === 'charts')
            return { page: 'charts' };
        if (a === 'browse')
            return { page: 'browse' };
        if (a === 'genre')
            return genreById(rest[0]) ? { page: 'genre', genre: rest[0] } : { page: 'browse' };
        if (a === 'radio')
            return rest[0] === 'search' ? { page: 'radio', search: rest.slice(1).join('/') } : { page: 'radio', genre: genreById(rest[0]) ? rest[0] : '' };
        if (a === 'library' || a === 'favourites')
            return { page: 'library' };
        if (a === 'search')
            return { page: 'search', search: tail };
        if (a === 'playlist' && tail)
            return { page: 'playlist', id: tail };
        if (a === 'album' && tail)
            return { page: 'album', id: tail };
        if (a === 'artist' && tail)
            return { page: 'artist', id: tail };
        return { page: 'home' };
    }
    const pure = { spotifyUrl, onSpotify, GENRES, genreById, songItem, ccItem, iaTracks, stationItem, somaItem, playlistItem, ytSong, chartItem, ytPlaylist, albumItem, artistItem, bigArt, streamUrl, cleanTitle, ytQueries, matchScore, urls, isFav, toggleFav, validFav, shuffled, parseRoute, clock, seconds, esc, https };
    if (typeof module !== 'undefined')
        module.exports = pure;
    if (typeof window === 'undefined' || typeof document === 'undefined')
        return;
    // ================================================================ data (browser only)
    // Answers are remembered for this visit; Openverse allows only a couple of hundred anonymous requests a day,
    // so its answers are also kept for six hours.
    const cache = new Map();
    const KEEP = 6 * 3600e3;
    function getJSON(url) {
        if (cache.has(url))
            return cache.get(url);
        const slow = url.startsWith(OPENVERSE), slot = 'sb:mc:' + url;
        if (slow) {
            try {
                const hit = JSON.parse(sessionStorage.getItem(slot) || localStorage.getItem(slot));
                if (hit && hit.at > Date.now() - KEEP) {
                    const p = Promise.resolve(hit.data);
                    cache.set(url, p);
                    return p;
                }
            }
            catch ( /* nothing kept */_a) { /* nothing kept */ }
        }
        const req = fetch(url).then(r => { if (!r.ok)
            throw new Error(r.status === 429 ? 'Too many requests for now' : `HTTP ${r.status}`); return r.json(); });
        req.then(data => { if (slow) {
            try {
                localStorage.setItem(slot, JSON.stringify({ at: Date.now(), data }));
            }
            catch ( /* storage full */_a) { /* storage full */ }
        } }, () => cache.delete(url));
        cache.set(url, req);
        return req;
    }
    const list = (items, map) => (items || []).map(map).filter(Boolean);
    const uniq = (items, by = i => i.key) => { const seen = new Set(); return items.filter(i => !seen.has(by(i)) && seen.add(by(i))); };
    function radioBrowser(params) {
        return __awaiter(this, void 0, void 0, function* () {
            let last;
            for (const host of RADIO_HOSTS) { // the directory runs on several servers; use the first that answers
                try {
                    return uniq(list(yield getJSON(host + urls.stations(params)), stationItem), s => s.name.toLowerCase());
                }
                catch (e) {
                    last = e;
                }
            }
            throw last || new Error('Radio directory unavailable');
        });
    }
    const data = {
        trending: (genre, limit) => __awaiter(void 0, void 0, void 0, function* () { return list((yield getJSON(urls.trending(genre, limit))).data, songItem); }),
        underground: () => __awaiter(void 0, void 0, void 0, function* () { return list((yield getJSON(urls.underground())).data, songItem); }),
        songSearch: (text) => __awaiter(void 0, void 0, void 0, function* () { return list((yield getJSON(urls.songSearch(text))).data, songItem); }),
        artistSearch: (text) => __awaiter(void 0, void 0, void 0, function* () { return list((yield getJSON(urls.artistSearch(text))).data, artistItem); }),
        playlistSearch: (text) => __awaiter(void 0, void 0, void 0, function* () { return list((yield getJSON(urls.playlistSearch(text))).data, playlistItem); }),
        playlists: () => __awaiter(void 0, void 0, void 0, function* () { return list((yield getJSON(urls.playlists())).data, playlistItem); }),
        playlist: (id) => __awaiter(void 0, void 0, void 0, function* () { var _a; return ({ info: playlistItem((_a = (yield getJSON(urls.playlist(id))).data) === null || _a === void 0 ? void 0 : _a[0]), tracks: list((yield getJSON(urls.playlistTracks(id))).data, songItem) }); }),
        artist: (id) => __awaiter(void 0, void 0, void 0, function* () { return ({ info: artistItem((yield getJSON(urls.artist(id))).data), tracks: list((yield getJSON(urls.artistTracks(id))).data, songItem) }); }),
        cc: (text, size) => __awaiter(void 0, void 0, void 0, function* () { return list((yield getJSON(urls.cc(text, size))).results, ccItem); }),
        concerts: () => __awaiter(void 0, void 0, void 0, function* () { var _a; return list((_a = (yield getJSON(urls.concerts())).response) === null || _a === void 0 ? void 0 : _a.docs, albumItem); }),
        netlabels: (word) => __awaiter(void 0, void 0, void 0, function* () { var _a; return list((_a = (yield getJSON(urls.netlabels(word))).response) === null || _a === void 0 ? void 0 : _a.docs, albumItem); }),
        albumSearch: (text) => __awaiter(void 0, void 0, void 0, function* () { var _a; return list((_a = (yield getJSON(urls.albumSearch(text))).response) === null || _a === void 0 ? void 0 : _a.docs, albumItem); }),
        album: (id) => __awaiter(void 0, void 0, void 0, function* () { var _a, _b, _c; const meta = yield getJSON(urls.archiveItem(id)); return { info: albumItem(Object.assign(Object.assign({}, meta.metadata), { identifier: (_a = meta.metadata) === null || _a === void 0 ? void 0 : _a.identifier })), tracks: iaTracks(meta), note: str(((_b = meta.metadata) === null || _b === void 0 ? void 0 : _b.venue) || ((_c = meta.metadata) === null || _c === void 0 ? void 0 : _c.coverage)) }; }),
        soma: () => __awaiter(void 0, void 0, void 0, function* () { return list((yield getJSON(urls.soma())).channels, somaItem); }),
        stations: radioBrowser,
        charts: (region) => __awaiter(void 0, void 0, void 0, function* () { return list((yield getJSON(`${YT}?${qs({ op: 'charts', region: String(region || 'au').toLowerCase() })}`)).items, chartItem); }),
        ytTrending: (region) => __awaiter(void 0, void 0, void 0, function* () { return data.charts(region); }),
        // Searches YouTube through the site's function; if that can't reach a backend (they sometimes refuse requests
        // from servers), the browser asks the same public backends itself, which allow it (CORS). Only names and video
        // ids come back: the song is always played in YouTube's own player.
        ytSearch: (text_1, ...args_1) => __awaiter(void 0, [text_1, ...args_1], void 0, function* (text, filter = 'music_songs') {
            const map = filter === 'music_playlists' ? ytPlaylist : ytSong;
            try {
                const found = list((yield getJSON(`${YT}?${qs({ op: 'search', q: text, filter })}`)).items, map);
                if (found.length || filter === 'music_playlists')
                    return found;
            }
            catch ( /* the site's function couldn't reach a backend: try from the browser */_a) { /* the site's function couldn't reach a backend: try from the browser */ }
            if (filter === 'music_playlists')
                return [];
            for (const host of PIPED) {
                try {
                    const r = yield getJSON(`${host}/search?${qs({ q: text, filter })}`);
                    const found = list((r.items || []).filter(v => (v === null || v === void 0 ? void 0 : v.type) !== 'channel' && (v === null || v === void 0 ? void 0 : v.type) !== 'playlist').map(pipedSong), ytSong);
                    if (found.length)
                        return found;
                }
                catch ( /* next one */_b) { /* next one */ }
            }
            return [];
        }),
        ytPlaylist: (id) => __awaiter(void 0, void 0, void 0, function* () {
            const r = yield getJSON(`${YT}?${qs({ op: 'playlist', id })}`);
            const info = ytPlaylist(Object.assign(Object.assign({}, r), { id }));
            let tracks = list(r.videos, ytSong);
            if (info && !tracks.length) { // some backends can't list a playlist's own tracks; play matching songs instead
                const alt = (yield data.ytSearch(info.name).catch(() => [])).slice(0, 30);
                if (alt.length) {
                    info.note = 'This playlist’s own track list isn’t available through the community backends right now, so matching songs are playing instead.';
                    tracks = alt;
                }
            }
            return { info, tracks };
        }),
    };
    // A YouTube Music playlist's id carries the yt- prefix; everything else belongs to Audius
    data.playlist = (id) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        return (/^yt-[\w-]{10,64}$/.test(String(id))
            ? data.ytPlaylist(String(id).slice(3))
            : { info: playlistItem((_a = (yield getJSON(urls.playlist(id))).data) === null || _a === void 0 ? void 0 : _a[0]), tracks: list((yield getJSON(urls.playlistTracks(id))).data, songItem) });
    });
    // ================================================================ favourites
    const favs = () => { try {
        const l = JSON.parse(localStorage.getItem(FAV_KEY));
        return Array.isArray(l) ? l.filter(validFav) : [];
    }
    catch (_a) {
        return [];
    } };
    const changed = () => document.dispatchEvent(new CustomEvent('sb-music'));
    function favourite(item) {
        const next = toggleFav(favs(), item);
        try {
            localStorage.setItem(FAV_KEY, JSON.stringify(next));
        }
        catch ( /* storage full or private mode */_a) { /* storage full or private mode */ }
        changed();
        return isFav(next, item.key);
    }
    // ================================================================ player
    // Two engines behind one set of controls:
    //   - one <audio> element for Audius, Openverse, the Archive and radio. Phones keep an <audio> element playing
    //     with the screen off, and the Media Session below puts the song, its artwork and the controls on the lock
    //     screen. The next song is started from inside the "ended" event, which lets it carry on while locked.
    //   - the YouTube bridge for YouTube Music songs: YouTube's own embedded player (the IFrame Player API), kept in a
    //     small box on the page. The community backends that used to hand out YouTube audio addresses are blocked by
    //     YouTube, so the official player is the one way a YouTube song reliably plays in the browser.
    // `media` is what the page listens to: it looks like an <audio> element (paused, currentTime, duration, and the
    // play / pause / playing / timeupdate / ended events) whichever engine is playing.
    const audio = document.createElement('audio');
    audio.preload = 'auto';
    audio.setAttribute('playsinline', '');
    audio.style.display = 'none';
    (document.body || document.documentElement).appendChild(audio);
    let queue = [], index = -1, current = null, failures = 0, retryTimer = 0, onProblem = () => { };
    let engine = 'audio'; // 'audio' or 'yt': which one the current item plays on
    let onNotice = () => { }, needsTap = false, problemReason = ''; // needsTap: the phone stopped YouTube's player starting by itself
    const ms = 'mediaSession' in navigator ? navigator.mediaSession : null;
    const media = new EventTarget();
    const emit = type => media.dispatchEvent(new Event(type));
    // ---------------------------------------------------------------- YouTube bridge
    const bridge = (() => {
        const host = document.createElement('div');
        host.id = 'sbYtBridge';
        host.className = 'yt-bridge';
        host.setAttribute('aria-hidden', 'true');
        // The site sends "Referrer-Policy: no-referrer", but YouTube's player refuses to play without knowing which
        // site embeds it (error 153). So the bridge builds its own iframe that sends just this site's origin.
        const slot = document.createElement('iframe');
        slot.title = 'YouTube player';
        slot.allow = 'autoplay; encrypted-media; picture-in-picture';
        slot.referrerPolicy = 'strict-origin-when-cross-origin';
        slot.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        const embed = new URLSearchParams({ enablejsapi: 1, autoplay: 0, controls: 0, disablekb: 1, fs: 0, playsinline: 1, rel: 0, iv_load_policy: 3, origin: location.origin });
        host.appendChild(slot);
        (document.body || document.documentElement).appendChild(host);
        let yt = null, ready = null, ticker = 0, waiting = null, playing = false, lastId = '', stirred = false; // stirred: YouTube began loading the song
        const S = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
        // The API script is loaded once, as soon as the Music page is opened, so the player already exists by the time
        // a song is tapped: browsers only let the embedded player start with sound inside (or right after) that tap.
        function load() {
            if (ready)
                return ready;
            ready = new Promise((resolve, reject) => {
                var _a;
                const make = () => {
                    try {
                        if (!slot.src)
                            slot.src = 'https://www.youtube.com/embed/?' + embed;
                        yt = new window.YT.Player(slot, {
                            events: { onReady: () => resolve(yt), onStateChange: e => state(e.data), onError: e => problem(e.data) },
                        });
                    }
                    catch (e) {
                        reject(e);
                    }
                };
                if ((_a = window.YT) === null || _a === void 0 ? void 0 : _a.Player)
                    return make();
                const prev = window.onYouTubeIframeAPIReady;
                window.onYouTubeIframeAPIReady = () => { try {
                    prev === null || prev === void 0 ? void 0 : prev();
                }
                catch ( /* someone else's hook */_a) { /* someone else's hook */ } make(); };
                const s = document.createElement('script');
                s.src = 'https://www.youtube.com/iframe_api';
                s.async = true;
                s.onerror = () => { ready = null; reject(new Error('YouTube player unavailable')); };
                document.head.appendChild(s);
                setTimeout(() => reject(new Error('YouTube player timed out')), 12000);
            });
            ready.catch(() => { ready = null; });
            return ready;
        }
        function state(s) {
            if (s === S.BUFFERING || s === S.PLAYING)
                stirred = true;
            if (s === S.PLAYING) {
                playing = true;
                if (waiting) {
                    waiting.resolve();
                    waiting = null;
                }
                if (needsTap) {
                    needsTap = false;
                    failures = 0;
                    audio.pause();
                    changed();
                }
                if (engine !== 'yt')
                    return;
                clearInterval(ticker);
                ticker = setInterval(() => emit('timeupdate'), 250);
                emit('play');
                emit('playing');
                emit('durationchange');
            }
            else if (s === S.PAUSED || s === S.ENDED) {
                playing = false;
                clearInterval(ticker);
                if (engine !== 'yt')
                    return;
                emit('pause');
                if (s === S.ENDED)
                    emit('ended');
            }
        }
        // 2: bad id, 5: can't play in this browser, 100: removed or private, 101 / 150: the owner doesn't allow embedding,
        // 153: no referrer reached YouTube
        function problem(code) {
            playing = false;
            clearInterval(ticker);
            const err = new Error('YouTube error ' + code);
            if (waiting) {
                waiting.reject(err);
                waiting = null;
                return;
            }
            if (engine === 'yt')
                emit('error');
        }
        // Starts a song; resolves once it is really playing, rejects if YouTube won't play it here.
        function play(id) {
            return __awaiter(this, void 0, void 0, function* () {
                var _a, _b;
                const p = yield load();
                if (waiting)
                    waiting.reject(new Error('Replaced'));
                const started = new Promise((resolve, reject) => { waiting = { resolve, reject }; });
                lastId = id;
                stirred = false;
                host.classList.add('on');
                p.loadVideoById({ videoId: id, startSeconds: 0 });
                (_a = p.unMute) === null || _a === void 0 ? void 0 : _a.call(p);
                (_b = p.setVolume) === null || _b === void 0 ? void 0 : _b.call(p, 100);
                // If YouTube hasn't even begun loading the song after a few seconds, the phone stopped it starting by itself;
                // a song that is loading on a slow connection gets longer
                const blocked = () => { if (waiting) {
                    waiting.reject(new Error('YouTube player did not start'));
                    waiting = null;
                } };
                const quick = setTimeout(() => { if (!stirred)
                    blocked(); }, 4000), slow = setTimeout(blocked, 15000);
                try {
                    yield started;
                }
                finally {
                    clearTimeout(quick);
                    clearTimeout(slow);
                }
            });
        }
        function stop() {
            var _a;
            if (waiting) {
                waiting.reject(new Error('Stopped'));
                waiting = null;
            }
            clearInterval(ticker);
            playing = false;
            lastId = '';
            host.classList.remove('on');
            try {
                (_a = yt === null || yt === void 0 ? void 0 : yt.stopVideo) === null || _a === void 0 ? void 0 : _a.call(yt);
            }
            catch ( /* not ready yet */_b) { /* not ready yet */ }
        }
        return {
            host, load, play, stop,
            resume: () => { try {
                yt === null || yt === void 0 ? void 0 : yt.playVideo();
            }
            catch ( /* not ready */_a) { /* not ready */ } },
            pause: () => { try {
                yt === null || yt === void 0 ? void 0 : yt.pauseVideo();
            }
            catch ( /* not ready */_a) { /* not ready */ } },
            seek: t => { try {
                yt === null || yt === void 0 ? void 0 : yt.seekTo(t, true);
                emit('timeupdate');
            }
            catch ( /* not ready */_a) { /* not ready */ } },
            get paused() { return !playing; },
            get time() { var _a; try {
                return ((_a = yt === null || yt === void 0 ? void 0 : yt.getCurrentTime) === null || _a === void 0 ? void 0 : _a.call(yt)) || 0;
            }
            catch (_b) {
                return 0;
            } },
            get duration() { var _a; try {
                return ((_a = yt === null || yt === void 0 ? void 0 : yt.getDuration) === null || _a === void 0 ? void 0 : _a.call(yt)) || NaN;
            }
            catch (_b) {
                return NaN;
            } },
            get id() { return lastId; },
        };
    })();
    // ---------------------------------------------------------------- Spotify remote
    // The Spotify app (in the background on this device) plays; StreamBox reads what it's doing every second or two
    // and shows it. The songs after the one picked go to Spotify as one list, so it carries on through them by
    // itself, screen off included.
    const remote = (() => {
        const SP = () => window.StreamBoxSpotify;
        let st = null, seenAt = 0, deviceId = '', poll = 0, tick = 0, byUri = new Map(), active = false;
        const time = () => (!st ? 0 : Math.min(st.duration, st.progress + (st.playing ? (Date.now() - seenAt) / 1000 : 0)));
        function refresh() {
            return __awaiter(this, void 0, void 0, function* () {
                if (!active)
                    return;
                let next;
                try {
                    next = yield SP().state();
                }
                catch (_a) {
                    return;
                }
                if (!active)
                    return;
                const was = st;
                st = next;
                seenAt = Date.now();
                if (!st) {
                    if (was === null || was === void 0 ? void 0 : was.playing)
                        emit('pause');
                    return;
                }
                if (st.deviceId)
                    deviceId = st.deviceId;
                if (st.uri !== (was === null || was === void 0 ? void 0 : was.uri) && byUri.has(st.uri))
                    onTrack(byUri.get(st.uri)); // Spotify moved on to the next song by itself
                if (!was || was.playing !== st.playing) {
                    emit(st.playing ? 'play' : 'pause');
                    if (st.playing)
                        emit('playing');
                }
                emit('durationchange');
                emit('timeupdate');
            });
        }
        function begin() {
            active = true;
            clearInterval(poll);
            clearInterval(tick);
            poll = setInterval(() => { if (!document.hidden)
                refresh(); }, 1500);
            tick = setInterval(() => { if (st === null || st === void 0 ? void 0 : st.playing)
                emit('timeupdate'); }, 500);
            refresh();
        }
        function halt(pauseSpotify = true) {
            if (active && pauseSpotify && (st === null || st === void 0 ? void 0 : st.playing))
                SP().pause(deviceId).catch(() => { });
            active = false;
            clearInterval(poll);
            clearInterval(tick);
            st = null;
            byUri = new Map();
        }
        const nudge = playing => { if (st) {
            st = Object.assign(Object.assign({}, st), { progress: time(), playing });
            seenAt = Date.now();
        } emit(playing ? 'play' : 'pause'); setTimeout(refresh, 700); };
        return {
            begin, halt, refresh,
            set(device, pairs) { deviceId = device; byUri = new Map(pairs); st = null; begin(); },
            has: item => [...byUri.values()].includes(item),
            pause() { SP().pause(deviceId).catch(() => { }); nudge(false); },
            resume() { SP().resume(deviceId).catch(() => { }); nudge(true); },
            next() { SP().next(deviceId).catch(() => { }); setTimeout(refresh, 700); },
            previous() { SP().previous(deviceId).catch(() => { }); setTimeout(refresh, 700); },
            seek(t) { SP().seek(deviceId, t).catch(() => { }); if (st) {
                st = Object.assign(Object.assign({}, st), { progress: t });
                seenAt = Date.now();
            } emit('timeupdate'); },
            get paused() { return !(st === null || st === void 0 ? void 0 : st.playing); },
            get time() { return time(); },
            get duration() { return (st === null || st === void 0 ? void 0 : st.duration) || NaN; },
            get device() { return (st === null || st === void 0 ? void 0 : st.device) || ''; },
        };
    })();
    function onTrack(item) {
        if (current === item)
            return;
        current = item;
        index = queue.indexOf(item);
        describe(item);
        changed();
    }
    Object.defineProperties(media, {
        paused: { get: () => (engine === 'spotify' ? remote.paused : engine === 'yt' ? bridge.paused : audio.paused) },
        currentTime: { get: () => (engine === 'spotify' ? remote.time : engine === 'yt' ? bridge.time : audio.currentTime) },
        duration: { get: () => (engine === 'spotify' ? remote.duration : engine === 'yt' ? bridge.duration : audio.duration) },
        playbackRate: { get: () => (engine === 'yt' || engine === 'spotify' ? 1 : audio.playbackRate) },
    });
    for (const ev of ['play', 'pause', 'playing', 'timeupdate', 'durationchange', 'seeked', 'ratechange', 'ended', 'error']) {
        audio.addEventListener(ev, () => { if (engine === 'audio')
            emit(ev); });
    }
    function describe(item) {
        if (!ms)
            return;
        try {
            const art = bigArt(item);
            ms.metadata = new MediaMetadata({
                title: item.name, artist: item.artist || (item.type === 'radio' ? 'Radio' : ''), album: item.album || (item.type === 'radio' ? 'Live radio' : APP),
                artwork: art ? [{ src: item.art || art, sizes: '480x480' }, { src: art, sizes: '1000x1000' }] : [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
            });
        }
        catch ( /* older browsers */_a) { /* older browsers */ }
    }
    function position() {
        if (!(ms === null || ms === void 0 ? void 0 : ms.setPositionState))
            return;
        try {
            const d = media.duration;
            if ((current === null || current === void 0 ? void 0 : current.type) === 'song' && d > 0 && Number.isFinite(d))
                ms.setPositionState({ duration: d, position: Math.min(media.currentTime, d), playbackRate: media.playbackRate || 1 });
            else
                ms.setPositionState();
        }
        catch ( /* not supported */_a) { /* not supported */ }
    }
    function useEngine(next) {
        if (engine === next)
            return;
        if (engine === 'spotify')
            remote.halt();
        if (next === 'yt')
            audio.pause();
        else if (next === 'spotify') {
            audio.pause();
            bridge.stop();
        }
        else
            bridge.stop();
        engine = next;
    }
    function begin(item, url) {
        useEngine('audio');
        audio.src = url || streamUrl(item);
        describe(item);
        audio.play().then(() => { failures = 0; }).catch(e => { if ((e === null || e === void 0 ? void 0 : e.name) !== 'AbortError')
            failed(); });
    }
    // When the YouTube bridge can't play a song, the <audio> element takes over. Phones (Safari above all) refuse
    // to start an <audio> element outside the tap that asked for it, so the tap itself starts a tiny silent clip,
    // which unlocks the element; the stand-in song can then start on it once it has been found.
    const SILENCE = (() => {
        const n = 2000, b = new Uint8Array(44 + n).fill(128), v = new DataView(b.buffer);
        [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']].forEach(([o, t]) => [...t].forEach((c, i) => b[o + i] = c.charCodeAt(0)));
        v.setUint32(4, 36 + n, true);
        v.setUint32(16, 16, true);
        v.setUint16(20, 1, true);
        v.setUint16(22, 1, true);
        v.setUint32(24, 8000, true);
        v.setUint32(28, 8000, true);
        v.setUint16(32, 1, true);
        v.setUint16(34, 8, true);
        v.setUint32(40, n, true);
        let bin = '';
        b.forEach(x => bin += String.fromCharCode(x));
        return 'data:audio/wav;base64,' + btoa(bin);
    })();
    const silent = () => audio.src === SILENCE;
    function unlock() {
        try {
            audio.src = SILENCE;
            const p = audio.play();
            if (p)
                p.catch(() => { });
        }
        catch ( /* nothing to unlock */_a) { /* nothing to unlock */ }
    }
    // Chart songs and YouTube songs play in full in YouTube's own player. Getting there:
    //   - a chart song is matched to the same song on YouTube Music by title and artist; the best few matches are kept,
    //     because the owner of one upload (often the official music video) may have switched off playing it on other
    //     sites, and then the next upload of the same song (usually YouTube Music's official audio) is tried
    //   - a phone can stop the player starting by itself; then the player is shown and one tap on it starts the song
    //   - only if no upload of the song can play anywhere is the same song by the same artist on Audius played, and
    //     failing that, the song is skipped. No 30-second previews.
    const ytMatches = new Map(); // Apple id (or a YouTube song's key) -> YouTube video ids, best match first
    function ytCandidates(item) {
        return __awaiter(this, void 0, void 0, function* () {
            if (item.src === 'yt') { // a YouTube song: its own id, then other uploads of it
                if (!ytMatches.has(item.key)) {
                    const more = (yield data.ytSearch(`${cleanTitle(item.name)} ${cleanArtist(item.artist)}`.trim()).catch(() => []))
                        .filter(s => s.id !== item.id && matchScore(item, s) >= 1.3).slice(0, 3).map(s => s.id);
                    ytMatches.set(item.key, more);
                }
                return [item.id, ...ytMatches.get(item.key)];
            }
            if (ytMatches.has(item.id))
                return ytMatches.get(item.id);
            const scored = new Map();
            for (const [q, filter] of [[`${item.name} ${item.artist}`.trim(), 'music_songs'], [`${item.name} ${item.artist}`.trim(), 'videos'], [item.name, 'music_songs']]) {
                for (const s of (yield data.ytSearch(q, filter).catch(() => [])).slice(0, 15)) {
                    const other = /\b(live|remix|cover|karaoke|instrumental|sped up|slowed|8d)\b/i; // not the recording on the chart
                    const sc = matchScore(item, s) - (other.test(s.name) && !other.test(item.name) ? 1 : 0);
                    if (sc >= 1 && !(scored.get(s.id) >= sc))
                        scored.set(s.id, sc); // the title has to match: a wrong song is worse than none
                }
                if (filter === 'videos' && [...scored.values()].some(v => v >= 1.3))
                    break; // YouTube Music and YouTube both asked, and the song was found
            }
            const ids = [...scored].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => id);
            if (ids.length)
                ytMatches.set(item.id, ids);
            return ids;
        });
    }
    // Finds the YouTube matches for the first songs of a list ahead of time, so a tap can start the player at once
    let warming = Promise.resolve();
    function warm(items) {
        for (const item of (items || []).filter(i => (i === null || i === void 0 ? void 0 : i.src) === 'chart' && !ytMatches.has(i.id)).slice(0, 12))
            warming = warming.then(() => ytCandidates(item)).catch(() => { });
        return warming;
    }
    function audiusTwin(item) {
        return __awaiter(this, void 0, void 0, function* () {
            let best = null, bestScore = -1;
            for (const q of ytQueries(item)) {
                const found = (yield data.songSearch(q).catch(() => [])).filter(s => s.src === 'audius').slice(0, 15);
                for (const s of found) {
                    const sc = matchScore(item, s);
                    if (sc > bestScore) {
                        best = s;
                        bestScore = sc;
                    }
                }
                if (bestScore >= 1.3)
                    break; // the title and the artist both matched
            }
            return bestScore >= 1.3 ? best : null;
        });
    }
    function playElsewhere(item) {
        audiusTwin(item).then(alt => {
            if (current !== item)
                return;
            if (!alt) {
                failed();
                return;
            }
            current = alt;
            queue = queue.map(i => (i.key === item.key ? alt : i));
            changed();
            begin(alt);
        }).catch(() => { if (current === item)
            failed(); });
    }
    // Through the Spotify app: the song (and the ones after it that are already looked up) start there
    let viaSpotify = false, needsSpotify = false; // needsSpotify: the Spotify app has to be opened once
    function startSpotify(item) {
        return __awaiter(this, void 0, void 0, function* () {
            useEngine('spotify');
            describe(item);
            const SP = window.StreamBoxSpotify;
            try {
                const track = yield SP.findTrack(item, matchScore);
                if (current !== item)
                    return;
                if (!track) {
                    problemReason = 'not found on Spotify';
                    useEngine('audio');
                    failed();
                    return;
                }
                const after = [...queue.slice(index + 1), ...queue.slice(0, Math.max(0, index))].filter(i => onSpotify(i)).map(i => [i, SP.cached(i)]).filter(([, t]) => t).slice(0, 60);
                const dev = yield SP.device();
                if (current !== item)
                    return;
                if (!dev) {
                    needsSpotify = true;
                    changed();
                    return;
                }
                yield SP.play(dev.id, [track.uri, ...after.map(([, t]) => t.uri)]);
                if (current !== item)
                    return;
                remote.set(dev.id, [[track.uri, item], ...after.map(([i, t]) => [t.uri, i])]);
                needsSpotify = false;
                failures = 0;
                changed();
                warmSpotify(queue.slice(index + 1, index + 30)); // look up the rest, ready for next time
            }
            catch (e) {
                if (current !== item)
                    return;
                if (e.code === 'no-device') {
                    needsSpotify = true;
                    changed();
                    return;
                }
                useEngine('audio');
                onProblem(item, e.code === 'premium' ? 'Spotify Premium is needed to play songs from StreamBox' : e.code === 'signed-out' ? 'connect Spotify again (Music page)' : e.message);
                changed(); // stays on this song rather than skipping through the whole list
            }
        });
    }
    let spWarming = Promise.resolve();
    function warmSpotify(items) {
        const SP = window.StreamBoxSpotify;
        if (!(SP === null || SP === void 0 ? void 0 : SP.connected))
            return spWarming;
        for (const item of (items || []).filter(i => onSpotify(i) && !SP.cached(i)).slice(0, 30))
            spWarming = spWarming.then(() => SP.findTrack(item, matchScore)).catch(() => { });
        return spWarming;
    }
    // Coming back from the Spotify app after opening it: try again
    document.addEventListener('visibilitychange', () => { if (!document.hidden && needsSpotify && current && engine === 'spotify')
        startSpotify(current);
    else if (!document.hidden && engine === 'spotify')
        remote.refresh(); });
    function start(item, items, { shuffle = false, spotify } = {}) {
        var _a;
        clearTimeout(retryTimer);
        if (items) {
            queue = shuffle ? shuffled(items, item) : items;
            index = queue.findIndex(i => i.key === item.key);
        }
        if (spotify !== undefined)
            viaSpotify = !!spotify;
        current = item;
        needsTap = false;
        needsSpotify = false;
        changed();
        if (viaSpotify && onSpotify(item) && ((_a = window.StreamBoxSpotify) === null || _a === void 0 ? void 0 : _a.connected)) {
            startSpotify(item);
            return;
        }
        if (item.src !== 'yt' && item.src !== 'chart') {
            begin(item);
            return;
        }
        unlock(); // keeps the <audio> element ready in case the song has to be played from elsewhere
        useEngine('yt');
        describe(item);
        (() => __awaiter(this, void 0, void 0, function* () {
            const ids = yield ytCandidates(item);
            const refused = [];
            if (!ids.length)
                problemReason = 'not found on YouTube';
            for (const id of ids) {
                if (current !== item)
                    return;
                try {
                    yield bridge.play(id);
                    if (current !== item)
                        return;
                    audio.pause();
                    failures = 0;
                    changed();
                    return;
                }
                catch (e) {
                    if (current !== item || /Replaced|Stopped/.test(e.message))
                        return;
                    if (/did not start/.test(e.message)) { // the phone wants a tap on the player itself
                        needsTap = true;
                        changed(); // Now Playing opens with the player and a hint (music-ui.js)
                        return;
                    }
                    // this upload can't be played here (embedding switched off, removed, region): try the next one
                    refused.push(String(e.message).replace(/^YouTube error /, ''));
                    console.warn('YouTube refused', id, e.message);
                }
            }
            if (refused.length)
                problemReason = `YouTube wouldn’t play it here (${[...new Set(refused)].join(', ')})`;
            if (current !== item)
                return;
            useEngine('audio');
            playElsewhere(item);
        }))();
    }
    function step(dir) {
        if (queue.length < 2)
            return false;
        index = ((index + dir) % queue.length + queue.length) % queue.length;
        const target = queue[index];
        if (engine === 'spotify' && remote.has(target) && remote.has(current)) { // it's in the list Spotify already has
            dir > 0 ? remote.next() : remote.previous();
            onTrack(target);
            return true;
        }
        start(target);
        return true;
    }
    function failed() {
        if (!current)
            return;
        failures++;
        if (current.type === 'radio' && failures <= 3) { // a station that drops out (patchy mobile signal) is reconnected
            const item = current;
            retryTimer = setTimeout(() => { if (current === item) {
                audio.src = streamUrl(item);
                audio.play().catch(() => failed());
            } }, 2000 * failures);
            return;
        }
        onProblem(current, problemReason);
        problemReason = '';
        if (current.type === 'song' && queue.length > 1 && failures < 4)
            step(1);
        else {
            failures = 0;
            changed();
        }
    }
    function stop() {
        clearTimeout(retryTimer);
        bridge.stop();
        if (engine === 'spotify')
            remote.halt();
        engine = 'audio';
        needsSpotify = false;
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        current = null;
        queue = [];
        index = -1;
        if (ms) {
            try {
                ms.metadata = null;
                ms.playbackState = 'none';
            }
            catch ( /* ignore */_a) { /* ignore */ }
        }
        changed();
    }
    const resume = () => (engine === 'spotify' ? remote.resume() : engine === 'yt' ? bridge.resume() : audio.play().catch(() => failed()));
    const pause = () => (engine === 'spotify' ? remote.pause() : engine === 'yt' ? bridge.pause() : audio.pause());
    const toggle = () => (media.paused ? resume() : pause());
    function seekTo(time) {
        const d = media.duration;
        if ((current === null || current === void 0 ? void 0 : current.type) !== 'song' || !(d > 0))
            return;
        const t = Math.max(0, Math.min(d - 0.25, time));
        if (engine === 'spotify')
            remote.seek(t);
        else if (engine === 'yt')
            bridge.seek(t);
        else
            audio.currentTime = t;
        position();
    }
    media.addEventListener('play', () => { if (ms)
        ms.playbackState = 'playing'; changed(); });
    media.addEventListener('pause', () => { if (ms)
        ms.playbackState = 'paused'; changed(); });
    media.addEventListener('ended', () => { if (engine === 'audio' && silent())
        return; if (!step(1))
        changed(); });
    media.addEventListener('error', () => { if (engine === 'yt' || (audio.getAttribute('src') && !silent()))
        failed(); });
    media.addEventListener('playing', () => { if (engine === 'yt' || !silent())
        failures = 0; position(); });
    for (const ev of ['durationchange', 'seeked', 'ratechange'])
        media.addEventListener(ev, position);
    if (ms) {
        const on = (name, fn) => { try {
            ms.setActionHandler(name, fn);
        }
        catch ( /* not supported on this device */_a) { /* not supported on this device */ } };
        on('play', resume);
        on('pause', pause);
        on('stop', stop);
        on('previoustrack', () => { if (media.currentTime > 4 && (current === null || current === void 0 ? void 0 : current.type) === 'song')
            seekTo(0);
        else
            step(-1); });
        on('nexttrack', () => step(1));
        on('seekto', e => seekTo(e.seekTime));
        on('seekbackward', e => seekTo(media.currentTime - (e.seekOffset || 10)));
        on('seekforward', e => seekTo(media.currentTime + (e.seekOffset || 10)));
    }
    const player = {
        audio: media, start, step, stop, toggle, seekTo, pause,
        prepare: () => bridge.load().catch(() => { }), // loads the YouTube bridge ahead of the first tap
        bridge: bridge.host,
        get engine() { return engine; },
        get current() { return current; },
        get queue() { return queue; },
        get index() { return index; },
        get paused() { return media.paused; },
        set onProblem(fn) { onProblem = fn; },
        set onNotice(fn) { onNotice = fn; },
        get needsTap() { return needsTap; },
        get needsSpotify() { return needsSpotify; },
        get spotifyDevice() { return engine === 'spotify' ? remote.device : ''; },
        warm, warmSpotify,
    };
    window.StreamBoxMusic = Object.assign(Object.assign({}, pure), { data, player, favs, favourite, pause, stop, render: () => { } });
})();
