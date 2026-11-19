import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cleanMusicItem, cleanData, mergeData, LIMITS, EMPTY } from '../netlify/lib/account-data.mjs';
const m = createRequire(import.meta.url)('../public/js/music.js');

const track = (extra = {}) => ({ id: 'J7Xb000', title: ' Murder She Wrote ', user: { id: 'G2ag35x', name: 'Brooke Evers' }, duration: 187.4, genre: 'House', artwork: { '150x150': 'https://a.example/c/150x150.jpg', '480x480': 'https://a.example/c/480x480.jpg' }, ...extra });
const station = (extra = {}) => ({ stationuuid: 'abc-1', name: ' Triple J ', url_resolved: 'https://live.example/triplej.mp3', favicon: 'http://insecure.example/x.png', tags: 'alternative, indie,music', state: 'New South Wales', country: 'Australia', hls: 0, ...extra });
const cc = (extra = {}) => ({ id: '855cb4ec', title: 'Jazz Cantina', creator: 'Mazelo Nostra', url: 'https://prod-1.storage.jamendo.com/?trackid=1227396&format=mp32', thumbnail: 'https://api.openverse.org/v1/audio/855cb4ec/thumb/', duration: 255000, genres: ['chillout', 'jazz'], audio_set: { title: 'Midnight Grooves' }, ...extra });

test('an Audius track becomes a song, with the artist it belongs to', () => {
  assert.deepEqual(m.songItem(track()), { key: 's:J7Xb000', type: 'song', src: 'audius', id: 'J7Xb000', name: 'Murder She Wrote', artist: 'Brooke Evers', artistId: 'G2ag35x', art: 'https://a.example/c/480x480.jpg', duration: 187, genre: 'House' });
  assert.equal(m.songItem(track({ artwork: { '480x480': 'javascript:alert(1)' } })).art, '', 'only https artwork is used');
  assert.equal(m.songItem(track({ is_streamable: false })), null);
  assert.equal(m.songItem({ id: 'x' }), null);
  assert.equal(m.songItem(null), null);
});

test('a Creative Commons song from Openverse carries its own address and album', () => {
  assert.deepEqual(m.ccItem(cc()), { key: 'c:855cb4ec', type: 'song', src: 'cc', id: '855cb4ec', name: 'Jazz Cantina', artist: 'Mazelo Nostra', art: 'https://api.openverse.org/v1/audio/855cb4ec/thumb/', url: 'https://prod-1.storage.jamendo.com/?trackid=1227396&format=mp32', duration: 255, genre: 'chillout', album: 'Midnight Grooves' });
  assert.equal(m.ccItem(cc({ url: 'http://plain.example/a.mp3' })), null);
  assert.equal(m.ccItem(cc({ title: '' })), null);
});

test('an Internet Archive recording becomes an album of tracks in order', () => {
  const meta = { metadata: { identifier: 'gd85-06-30', creator: 'Grateful Dead', title: 'Live at Merriweather' }, files: [
    { name: 'gd85-06-30d1t02.mp3', format: 'VBR MP3', title: 'C C Rider', track: '2', length: '08:13' },
    { name: 'gd85-06-30d1t01.mp3', format: 'VBR MP3', title: 'Half-Step', track: '1', length: '510.2' },
    { name: 'gd85-06-30d1t01.flac', format: 'Flac' }, { name: 'info.txt' }, { name: 'x_64kb_sample.mp3' }, { name: 'dir/odd name #3.mp3' },
  ] };
  const t = m.iaTracks(meta);
  assert.deepEqual(t.map(x => x.name), ['Half-Step', 'C C Rider', 'odd name #3']);
  assert.deepEqual(t.map(x => x.duration), [510, 493, 0]);
  assert.equal(t[0].key, 'a:gd85-06-30#1'); assert.equal(t[0].artist, 'Grateful Dead'); assert.equal(t[0].album, 'Live at Merriweather');
  assert.equal(t[0].url, 'https://archive.org/download/gd85-06-30/gd85-06-30d1t01.mp3');
  assert.equal(t[2].url, 'https://archive.org/download/gd85-06-30/dir/odd%20name%20%233.mp3');
  assert.equal(t[0].art, 'https://archive.org/services/img/gd85-06-30');
  assert.deepEqual(m.iaTracks({}), []);
  assert.deepEqual(m.albumItem({ identifier: 'gd85-06-30', title: 'Live', creator: ['Grateful Dead'], date: '1985-06-30T00:00:00Z' }), { kind: 'album', id: 'gd85-06-30', name: 'Live', by: 'Grateful Dead', art: 'https://archive.org/services/img/gd85-06-30', note: '1985', href: '#music/album/gd85-06-30' });
});

test('radio stations need an https stream; SomaFM channels get their logo and stream', () => {
  assert.deepEqual(m.stationItem(station()), { key: 'r:abc-1', type: 'radio', src: 'rb', id: 'abc-1', name: 'Triple J', artist: 'New South Wales, Australia', art: '', url: 'https://live.example/triplej.mp3', genre: 'alternative' });
  assert.equal(m.stationItem(station({ url_resolved: 'http://live.example/a.mp3', url: '' })), null);
  assert.equal(m.stationItem(station({ hls: 1 })), null);
  const s = m.somaItem({ id: 'groovesalad', title: 'Groove Salad', description: 'Chilled beats', genre: 'ambient|electronic', xlimage: 'https://api.somafm.com/logos/512/groovesalad512.png' });
  assert.deepEqual(s, { key: 'r:soma-groovesalad', type: 'radio', src: 'soma', id: 'soma-groovesalad', name: 'SomaFM Groove Salad', artist: 'Chilled beats', art: 'https://api.somafm.com/logos/512/groovesalad512.png', url: 'https://ice2.somafm.com/groovesalad-128-mp3', genre: 'ambient' });
  assert.equal(m.somaItem({ id: '../x', title: 'Bad' }), null);
});

test('playlists and artists keep their official pictures', () => {
  const p = m.playlistItem({ id: 'DOPRl', playlist_name: 'Hot & New', user: { id: 'u1', name: 'Audius' }, track_count: 22, description: 'Fresh', artwork: { '480x480': 'https://v.example/c/480x480.jpg' } });
  assert.deepEqual(p, { kind: 'playlist', id: 'DOPRl', name: 'Hot & New', by: 'Audius', byId: 'u1', art: 'https://v.example/c/480x480.jpg', count: 22, note: 'Fresh', href: '#music/playlist/DOPRl' });
  const a = m.artistItem({ id: 'G2ag35x', name: 'Brooke Evers', handle: 'brookeevers', follower_count: 36, track_count: 4, is_verified: true, profile_picture: { '480x480': 'https://f.example/p/480x480.jpg' }, cover_photo: { '640x': 'https://f.example/c/640x.jpg', '2000x': 'https://f.example/c/2000x.jpg' } });
  assert.equal(a.art, 'https://f.example/p/480x480.jpg'); assert.equal(a.cover, 'https://f.example/c/2000x.jpg'); assert.equal(a.verified, true); assert.equal(a.href, '#music/artist/G2ag35x');
  assert.equal(m.bigArt(m.songItem(track())), 'https://a.example/c/1000x1000.jpg', 'the largest artwork is used on the Now Playing and lock screens');
  assert.equal(m.bigArt(m.ccItem(cc())), 'https://api.openverse.org/v1/audio/855cb4ec/thumb/');
  assert.equal(m.bigArt({}), '');
});

test('every genre maps to each source, and stream and search addresses are built from it', () => {
  assert.ok(m.GENRES.length >= 20);
  assert.equal(new Set(m.GENRES.map(g => g.id)).size, m.GENRES.length);
  for (const g of m.GENRES) assert.ok(g.name && g.audius && g.q && g.radio && Array.isArray(g.soma) && g.c.length === 2, g.id);
  assert.equal(m.genreById('hiphop').audius, 'Hip-Hop/Rap'); assert.equal(m.genreById('nope'), null);
  assert.equal(m.urls.stream('a/b'), 'https://api.audius.co/v1/tracks/a%2Fb/stream?app_name=StreamBox');
  const t = new URL(m.urls.trending('Hip-Hop/Rap'));
  assert.equal(t.pathname, '/v1/tracks/trending'); assert.equal(t.searchParams.get('genre'), 'Hip-Hop/Rap'); assert.equal(t.searchParams.get('app_name'), 'StreamBox');
  assert.equal(new URL(m.urls.trending('<nope>')).searchParams.has('genre'), false, 'unknown genres are ignored');
  assert.equal(new URL(m.urls.songSearch('daft punk & co')).searchParams.get('query'), 'daft punk & co');
  const o = new URL(m.urls.cc('jazz')); assert.equal(o.searchParams.get('source'), 'jamendo'); assert.equal(o.searchParams.get('q'), 'jazz');
  assert.match(decodeURIComponent(m.urls.netlabels('rock" OR x')).replace(/\+/g, ' '), /subject:"rock OR x"/, 'quotes can’t break out of the search');
  assert.equal(m.urls.archiveItem('a b'), 'https://archive.org/metadata/a%20b');
  const s = new URLSearchParams(m.urls.stations({ cc: 'AU' }).split('?')[1]);
  assert.equal(s.get('countrycode'), 'AU'); assert.equal(s.get('is_https'), 'true'); assert.equal(s.has('tag'), false);
});

test('favourites: newest first, no duplicates, and tapping again removes', () => {
  const a = m.songItem(track()), b = m.stationItem(station()), c = m.ccItem(cc());
  let list = m.toggleFav(m.toggleFav(m.toggleFav([], a), b), c);
  assert.deepEqual(list.map(i => i.key), ['c:855cb4ec', 'r:abc-1', 's:J7Xb000']);
  assert.equal('url' in list[2], false, 'an Audius song keeps no address: it is played by its id');
  assert.equal(list[2].artistId, 'G2ag35x');
  assert.ok(list[0].url && list[1].url && list[0].album);
  list = m.toggleFav(list, a);
  assert.deepEqual(list.map(i => i.key), ['c:855cb4ec', 'r:abc-1']);
  assert.ok(list.every(m.validFav));
  assert.ok(m.validFav({ key: 's:1', type: 'song', id: '1', name: 'Old favourite' }), 'favourites saved before sources were added still work');
  assert.ok(!m.validFav({ key: 'c:1', type: 'song', src: 'cc', id: '1', name: 'No address' }));
  assert.ok(!m.validFav({ key: 'r:x', type: 'radio', id: 'x', name: 'X', url: 'http://x' }));
});

test('shuffle keeps the chosen song first and loses nothing', () => {
  const l = [1, 2, 3, 4, 5].map(n => ({ key: 'k' + n }));
  const out = m.shuffled(l, l[2], () => 0.99);
  assert.equal(out[0], l[2]); assert.equal(out.length, 5); assert.equal(new Set(out).size, 5);
});

test('page addresses map to what is shown', () => {
  assert.deepEqual(m.parseRoute(''), { page: 'home' });
  assert.deepEqual(m.parseRoute('browse'), { page: 'browse' });
  assert.deepEqual(m.parseRoute('genre/jazz'), { page: 'genre', genre: 'jazz' });
  assert.deepEqual(m.parseRoute('genre/<x>'), { page: 'browse' });
  assert.deepEqual(m.parseRoute('search/tame impala'), { page: 'search', search: 'tame impala' });
  assert.deepEqual(m.parseRoute('radio'), { page: 'radio', genre: '' });
  assert.deepEqual(m.parseRoute('radio/jazz'), { page: 'radio', genre: 'jazz' });
  assert.deepEqual(m.parseRoute('radio/search/abc'), { page: 'radio', search: 'abc' });
  assert.deepEqual(m.parseRoute('library'), { page: 'library', part: '' });
  assert.deepEqual(m.parseRoute('library/artists'), { page: 'library', part: 'artists' });
  assert.deepEqual(m.parseRoute('library/<x>'), { page: 'library', part: '' });
  assert.deepEqual(m.parseRoute('favourites'), { page: 'library', part: 'favourites' }, 'the old address still works');
  assert.deepEqual(m.parseRoute('list/abc123'), { page: 'mylist', id: 'abc123' });
  assert.deepEqual(m.parseRoute('my-artist/AC/DC'), { page: 'myartist', name: 'AC/DC' });
  assert.deepEqual(m.parseRoute('my-album/ac/dc||back in black'), { page: 'myalbum', key: 'ac/dc||back in black' });
  assert.deepEqual(m.parseRoute('server'), { page: 'server' });
  assert.deepEqual(m.parseRoute('server/album/al-1'), { page: 'subalbum', id: 'al-1' });
  assert.deepEqual(m.parseRoute('server/artist/ar-9'), { page: 'subartist', id: 'ar-9' });
  assert.deepEqual(m.parseRoute('charts'), { page: 'charts' });
  assert.deepEqual(m.parseRoute('playlist/DOPRl'), { page: 'playlist', id: 'DOPRl' });
  assert.deepEqual(m.parseRoute('album/gd85-06-30.sbd'), { page: 'album', id: 'gd85-06-30.sbd' });
  assert.deepEqual(m.parseRoute('artist/G2ag35x'), { page: 'artist', id: 'G2ag35x' });
  assert.equal(m.clock(187), '3:07'); assert.equal(m.clock(0), '');
});

// ------------------------------------------------------------------ what the account keeps
test('favourite music is rebuilt from safe fields before it is stored', () => {
  const [ccFav, radio, song] = m.toggleFav(m.toggleFav(m.toggleFav([], m.songItem(track())), m.stationItem(station())), m.ccItem(cc()));
  assert.deepEqual(cleanMusicItem({ ...song, onclick: 'x()' }), { key: 's:J7Xb000', type: 'song', id: 'J7Xb000', name: 'Murder She Wrote', artist: 'Brooke Evers', genre: 'House', src: 'audius', artistId: 'G2ag35x', art: 'https://a.example/c/480x480.jpg', duration: 187 });
  assert.equal(cleanMusicItem(radio).url, 'https://live.example/triplej.mp3');
  assert.equal(cleanMusicItem(ccFav).url, 'https://prod-1.storage.jamendo.com/?trackid=1227396&format=mp32');
  assert.equal(cleanMusicItem(ccFav).album, 'Midnight Grooves');
  assert.equal(cleanMusicItem({ ...ccFav, url: 'javascript:alert(1)' }), null, 'a song from outside Audius must have an https address');
  assert.equal(cleanMusicItem({ key: 'y:khnokW3Mw24', type: 'song', src: 'yt', id: 'khnokW3Mw24', name: 'Old YouTube favourite' }), null, 'favourites from the old YouTube bridge are dropped');
  assert.equal(cleanMusicItem({ ...song, src: 'random', url: '' }), null, 'a song from an unknown source still needs an https address');
  assert.equal(cleanMusicItem({ ...radio, url: 'http://plain.example/s' }), null, 'a station must have an https stream');
  assert.equal(cleanMusicItem({ ...song, art: 'https://x.example/" onerror="alert(1)' }).art, undefined, 'artwork must be a clean https address');
  assert.ok(cleanMusicItem({ key: 's:1', type: 'song', id: '1', name: 'Saved before sources were added' }));
  assert.equal(cleanMusicItem({ ...song, type: 'live' }), null);
  assert.equal(cleanMusicItem({ ...song, name: '' }), null);
  assert.equal(cleanMusicItem(null), null);
});

test('favourites sync like the other lists: size-limited, newest list wins, other lists untouched', () => {
  const many = Array.from({ length: 500 }, (_, i) => ({ key: 's:' + i, type: 'song', id: String(i), name: 'Song ' + i }));
  const data = cleanData({ music: { at: 5, items: [...many, many[0], { key: 'bad', type: 'movie', id: '1', name: 'x' }] } });
  assert.equal(data.music.items.length, LIMITS.music);
  assert.equal('mylist' in data, false);
  assert.deepEqual(EMPTY().music, { at: 0, items: [] });
  const stored = { ...EMPTY(), mylist: { at: 9, items: [{ key: 'l:1', type: 'live', name: 'A', url: 'https://a/b.m3u8' }] }, music: { at: 10, items: many.slice(0, 2) } };
  assert.equal(mergeData(stored, cleanData({ music: { at: 4, items: [] } })).music.items.length, 2, 'an older list does not replace a newer one');
  const merged = mergeData(stored, cleanData({ music: { at: 20, items: many.slice(0, 5) } }));
  assert.equal(merged.music.items.length, 5);
  assert.equal(merged.mylist.items.length, 1);
});


// ------------------------------------------------------------------ your own music server (Subsonic API)
import { createHash } from 'node:crypto';
test('md5 (for the music server’s sign-in token) matches the standard', () => {
  for (const t of ['', 'a', 'password' + 'c19b2d', 'ünïcödé 🎵', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64), 'w'.repeat(200)]) assert.equal(m.md5(t), createHash('md5').update(t).digest('hex'), JSON.stringify(t.slice(0, 20)));
});

test('connecting a server keeps a signed token, never the password, and needs https', () => {
  const s = m.serverLogin(' https://music.example.com/rest/ ', ' jonny ', 'sesame', 'c19b2d');
  assert.deepEqual(s, { url: 'https://music.example.com', user: 'jonny', salt: 'c19b2d', token: m.md5('sesamec19b2d') });
  assert.ok(!JSON.stringify(s).includes('sesame'));
  assert.throws(() => m.serverLogin('http://192.168.1.5:4533', 'a', 'b', 's'), /https/);
  assert.throws(() => m.serverLogin('https://x.example', '', 'b', 's'), /username/);
  const u = new URL(m.subUrl(s, 'getAlbum', { id: 'al 1' }));
  assert.equal(u.pathname, '/rest/getAlbum');
  for (const [k, v] of [['u', 'jonny'], ['t', s.token], ['s', 'c19b2d'], ['f', 'json'], ['c', 'StreamBox'], ['id', 'al 1']]) assert.equal(u.searchParams.get(k), v, k);
  assert.equal(u.searchParams.has('p'), false, 'no password in any request');
});

test('server songs, albums and artists; a server song keeps no address or picture (they carry the token)', () => {
  const song = m.subSong({ id: 'tr1', title: 'Help!', artist: 'The Beatles', artistId: 'ar1', album: 'Help!', albumId: 'al1', coverArt: 'al1', duration: 139, track: 1, genre: 'Rock' });
  assert.deepEqual(song, { key: 'v:tr1', type: 'song', src: 'sub', id: 'tr1', name: 'Help!', artist: 'The Beatles', artistId: 'ar1', album: 'Help!', albumId: 'al1', coverArt: 'al1', duration: 139, genre: 'Rock', track: 1 });
  assert.equal(m.subSong({ id: 'v', title: 'Clip', isVideo: true }), null);
  assert.equal(m.subAlbum({ id: 'al1', name: 'Help!', artist: 'The Beatles', artistId: 'ar1', songCount: 14, year: 1965 }).href, '#music/server/album/al1');
  assert.equal(m.subArtist({ id: 'ar1', name: 'The Beatles', albumCount: 13 }).href, '#music/server/artist/ar1');
  const kept = m.slim({ ...song, art: 'https://music.example.com/rest/getCoverArt?t=secret', url: 'https://music.example.com/rest/stream?t=secret' });
  assert.ok(!JSON.stringify(kept).includes('secret'), 'nothing with the token is saved or synced');
  assert.equal(kept.coverArt, 'al1');
  const synced = cleanMusicItem({ ...kept, url: 'https://music.example.com/rest/stream?t=secret' });
  assert.ok(synced && !('url' in synced) && synced.coverArt === 'al1', 'the account keeps it by its id');
});

// ------------------------------------------------------------------ playlists, history, your music
const song = (n, extra = {}) => ({ key: 'm:' + n, type: 'song', src: 'local', id: String(n), name: 'Song ' + n, artist: 'Artist', art: 'blob:https://x/1', ...extra });
test('your playlists: create, add without duplicates, remove, move, rename, delete', () => {
  let { lists, id } = m.createPlaylist([], '  Road Trip  ', [song(1)], 'p1');
  assert.deepEqual(lists.map(p => [p.id, p.name, p.items.length]), [['p1', 'Road Trip', 1]]);
  assert.equal('art' in lists[0].items[0], false, 'a picture made on this device (blob:) isn’t kept');
  lists = m.addToPlaylist(lists, id, [song(1), song(2), song(3)]);
  assert.deepEqual(lists[0].items.map(i => i.id), ['1', '2', '3']);
  lists = m.moveInPlaylist(lists, id, 'm:3', -2);
  assert.deepEqual(lists[0].items.map(i => i.id), ['3', '1', '2']);
  lists = m.removeFromPlaylist(lists, id, 'm:1');
  assert.deepEqual(lists[0].items.map(i => i.id), ['3', '2']);
  lists = m.renamePlaylist(lists, id, 'Summer');
  assert.equal(lists[0].name, 'Summer');
  assert.equal(m.createPlaylist(lists, '').lists[0].name, 'New Playlist');
  assert.deepEqual(m.deletePlaylist(lists, id), []);
  const cleaned = m.cleanPlaylists([{ id: 'x', name: 'Ok', items: [song(1), { key: 'bad' }, { key: 'c:1', type: 'song', src: 'cc', id: '1', name: 'No address' }] }, { name: 'no id' }, null]);
  assert.deepEqual(cleaned.map(p => p.items.length), [1]);
});

test('listening history: newest first, each song once, limited', () => {
  let h = [];
  for (const n of [1, 2, 3, 2]) h = m.addRecent(h, song(n), n);
  assert.deepEqual(h.map(i => i.id), ['2', '3', '1']);
  for (let n = 0; n < 150; n++) h = m.addRecent(h, song(n + 10));
  assert.equal(h.length, m.LIMITS.recent);
});

test('your music is organised by artist (album artist first) and album, in track order', () => {
  const songs = [
    song(1, { name: 'Help!', artist: 'The Beatles', album: 'Help!', track: 1 }),
    song(2, { name: 'Ticket to Ride', artist: 'The Beatles', album: 'Help!', track: 7, art: '' }),
    song(3, { name: 'The Night Before', artist: 'The Beatles', album: 'Help!', track: 2 }),
    song(4, { name: 'Feat. song', artist: 'Guest', albumArtist: 'Abba', album: 'Gold', track: 3 }),
    song(5, { name: 'Loose single', artist: 'Abba', album: '' }),
  ];
  const o = m.organise(songs);
  assert.deepEqual(o.artists.map(a => a.name), ['Abba', 'The Beatles'], '"The" is ignored when sorting');
  assert.deepEqual(o.artists[0].albums.map(a => a.name), ['Gold', 'Singles']);
  const help = o.albums.find(a => a.name === 'Help!');
  assert.deepEqual(help.songs.map(s => s.track), [1, 2, 7]);
  assert.equal(help.art, 'blob:https://x/1', 'the album poster comes from one of its songs');
  assert.ok(m.matches(songs[0], 'beatles help') && !m.matches(songs[0], 'abba'));
});

test('song details are read from tags, or from the folder and file name when there are none', async () => {
  const vm = await import('node:vm');
  const { readFileSync } = await import('node:fs');
  const ctx = { window: { indexedDB: {} }, document: { createElement: () => ({}) }, URL, Blob, console };
  ctx.window.window = ctx.window; ctx.window.document = ctx.document;
  vm.runInNewContext(readFileSync(new URL('../public/js/music-local.js', import.meta.url), 'utf8'), ctx.window);
  const d = ctx.window.StreamBoxMusicLocal.describe;
  assert.deepEqual(JSON.parse(JSON.stringify(d({ name: 'x.mp3' }, { title: 'Help!', artist: 'The Beatles', album: 'Help!', track: '1/14', year: '1965-08-06', genre: '(17)Rock', TPE2: { data: 'The Beatles' }, TPOS: { data: '1/1' } }))),
    { name: 'Help!', artist: 'The Beatles', albumArtist: 'The Beatles', album: 'Help!', track: 1, disc: 1, year: '1965', genre: 'Rock' });
  const f = d({ name: '07 Ticket to Ride.mp3', webkitRelativePath: 'Music/The Beatles/Help!/07 Ticket to Ride.mp3' }, {});
  assert.equal(f.name, 'Ticket to Ride'); assert.equal(f.artist, 'The Beatles'); assert.equal(f.album, 'Help!'); assert.equal(f.track, 7);
  const g = d({ name: 'Daft Punk - One More Time.m4a' }, {});
  assert.equal(g.name, 'One More Time'); assert.equal(g.artist, 'Daft Punk');
  assert.equal(d({ name: 'untitled.wav' }, {}).artist, 'Unknown Artist');
});

test('your own files and server songs are favourites by their id (they play from this device or your server)', () => {
  const fav = m.toggleFav([], song(9, { album: 'Gold' }))[0];
  assert.ok(m.validFav(fav));
  assert.equal('art' in fav || 'url' in fav, false);
  assert.ok(cleanMusicItem(fav), 'the account accepts it');
});

// ------------------------------------------------------------------ the Australian charts
test('a chart song keeps its position on each chart, its official poster, and plays by its name', () => {
  const c = m.chartItem({ rank: 1, name: "Choosin' Texas", artist: 'Ella Langley', art: 'https://is1.mzstatic.com/x/600x600bb.jpg', charts: { apple: 1, itunes: 2, shazam: 19, deezer: 2, bogus: 3 } });
  assert.equal(c.key, 'ch:choosin texas|ella langley'); assert.equal(c.src, 'chart');
  assert.equal(c.chartLine, 'Apple Music #1 · iTunes #2 · Shazam #19 · Deezer #2');
  assert.equal(c.art, 'https://is1.mzstatic.com/x/600x600bb.jpg');
  const fav = m.toggleFav([], c)[0];
  assert.ok(m.validFav(fav) && !('url' in fav), 'a favourite chart song is kept by its id');
  assert.ok(cleanMusicItem(fav), 'and the account keeps it');
  assert.equal(m.chartItem({ name: 'No artist' }), null);
});

test('the full song on YouTube Music: title and artist match, karaoke and covers lose', () => {
  const song = m.chartItem({ name: 'Man I Need', artist: 'Olivia Dean' });
  const results = [
    { key: 'yt:k', src: 'youtube', id: 'kara', name: 'Man I Need (By Olivia Dean)', artist: 'ZZang KARAOKE' },
    { key: 'yt:c', src: 'youtube', id: 'cover', name: 'Man I Need (Cover)', artist: 'Someone' },
    { key: 'yt:o', src: 'youtube', id: 'official', name: 'Man I Need', artist: 'Olivia Dean' },
  ];
  assert.equal(m.pickYouTube(song, results).id, 'official');
  assert.equal(m.pickYouTube(song, results.slice(0, 2)), null, 'no karaoke or cover version instead of the real song');
  assert.equal(m.pickYouTube(m.chartItem({ name: 'Lies (feat. Lana Del Rey)', artist: 'Zach Bryan & Lana Del Rey' }), [{ id: 'z', name: 'Lies', artist: 'Zach Bryan' }]).id, 'z', '"feat." and second artists don’t get in the way');
  assert.equal(m.pickYouTube(song, []), null);
});
