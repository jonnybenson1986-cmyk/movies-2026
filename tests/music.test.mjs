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
  assert.equal(m.streamUrl(m.songItem(track({ id: 'a/b' }))), 'https://api.audius.co/v1/tracks/a%2Fb/stream?app_name=StreamBox');
  assert.equal(m.streamUrl(m.ccItem(cc())), 'https://prod-1.storage.jamendo.com/?trackid=1227396&format=mp32');
  assert.equal(m.streamUrl(m.stationItem(station())), 'https://live.example/triplej.mp3');
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

test('a YouTube Music song is played by its id, and its playlists carry the yt- prefix', () => {
  const v = { id: 'khnokW3Mw24', name: ' Instant Crush ', artist: 'Daft Punk', art: 'https://proxy.example/x.jpg', duration: 338 };
  assert.deepEqual(m.ytSong(v), { key: 'y:khnokW3Mw24', type: 'song', src: 'yt', id: 'khnokW3Mw24', name: 'Instant Crush', artist: 'Daft Punk', art: 'https://proxy.example/x.jpg', duration: 338, genre: '' });
  assert.equal(m.ytSong({ ...v, art: 'http://plain.example/x.jpg' }).art, '', 'only https artwork is used');
  assert.equal(m.ytSong({ ...v, id: 'too short' }), null);
  assert.equal(m.ytSong({ ...v, name: '' }), null);
  assert.equal(m.ytSong(null), null);
  const p = m.ytPlaylist({ id: 'PLrAXtmErZgOdP_8GztsuPi9g_pyC8S1ys', name: 'Today’s hits', by: 'YouTube Music', count: 50, art: 'https://p.example/c.jpg' });
  assert.deepEqual(p, { kind: 'playlist', id: 'yt-PLrAXtmErZgOdP_8GztsuPi9g_pyC8S1ys', name: 'Today’s hits', by: 'YouTube Music', art: 'https://p.example/c.jpg', count: 50, note: '', href: '#music/playlist/yt-PLrAXtmErZgOdP_8GztsuPi9g_pyC8S1ys' });
  assert.equal(m.ytPlaylist({ id: 'short', name: 'x' }), null);
});

test('a YouTube Music favourite keeps no stream address: it is re-resolved when played', () => {
  const y = m.ytSong({ id: 'khnokW3Mw24', name: 'Instant Crush', artist: 'Daft Punk', art: 'https://proxy.example/x.jpg', duration: 338 });
  const list = m.toggleFav([], y);
  assert.equal('url' in list[0], false);
  assert.ok(m.validFav(list[0]));
  assert.ok(!m.validFav({ ...list[0], src: 'other' }), 'a song from an unknown source still needs its own address');
  assert.equal(m.streamUrl(y), '', 'the address is looked up through /api/music-yt when the song starts');
  assert.deepEqual(JSON.parse(JSON.stringify(list[0])), { key: 'y:khnokW3Mw24', type: 'song', src: 'yt', id: 'khnokW3Mw24', name: 'Instant Crush', artist: 'Daft Punk', art: 'https://proxy.example/x.jpg', genre: '', duration: 338 });
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
  assert.deepEqual(m.parseRoute('library'), { page: 'library' });
  assert.deepEqual(m.parseRoute('favourites'), { page: 'library' }, 'the old address still works');
  assert.deepEqual(m.parseRoute('playlist/DOPRl'), { page: 'playlist', id: 'DOPRl' });
  assert.deepEqual(m.parseRoute('album/gd85-06-30.sbd'), { page: 'album', id: 'gd85-06-30.sbd' });
  assert.deepEqual(m.parseRoute('artist/G2ag35x'), { page: 'artist', id: 'G2ag35x' });
  assert.equal(m.clock(187), '3:07'); assert.equal(m.clock(0), ''); assert.equal(m.seconds('1:02:03'), 3723); assert.equal(m.seconds('abc'), 0);
});

// ------------------------------------------------------------------ what the account keeps
test('favourite music is rebuilt from safe fields before it is stored', () => {
  const [ccFav, radio, song] = m.toggleFav(m.toggleFav(m.toggleFav([], m.songItem(track())), m.stationItem(station())), m.ccItem(cc()));
  assert.deepEqual(cleanMusicItem({ ...song, onclick: 'x()' }), { key: 's:J7Xb000', type: 'song', id: 'J7Xb000', name: 'Murder She Wrote', artist: 'Brooke Evers', genre: 'House', src: 'audius', artistId: 'G2ag35x', art: 'https://a.example/c/480x480.jpg', duration: 187 });
  assert.equal(cleanMusicItem(radio).url, 'https://live.example/triplej.mp3');
  assert.equal(cleanMusicItem(ccFav).url, 'https://prod-1.storage.jamendo.com/?trackid=1227396&format=mp32');
  assert.equal(cleanMusicItem(ccFav).album, 'Midnight Grooves');
  assert.equal(cleanMusicItem({ ...ccFav, url: 'javascript:alert(1)' }), null, 'a song from outside Audius must have an https address');
  const yt = m.ytSong({ id: 'khnokW3Mw24', name: 'Instant Crush', artist: 'Daft Punk', art: 'https://proxy.example/x.jpg', duration: 338 });
  assert.deepEqual(cleanMusicItem(yt), { key: 'y:khnokW3Mw24', type: 'song', src: 'yt', id: 'khnokW3Mw24', name: 'Instant Crush', artist: 'Daft Punk', art: 'https://proxy.example/x.jpg', duration: 338 }, 'a YouTube Music song is kept without an address and replayed by its id');
  assert.equal(cleanMusicItem({ ...yt, src: 'random', url: '' }), null, 'a song from an unknown source still needs an https address');
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

test('a YouTube song is looked up elsewhere by its cleaned title and artist, closest match first', () => {
  assert.equal(m.cleanTitle('Never Gonna Give You Up (Official Video) (4K Remaster)'), 'Never Gonna Give You Up');
  assert.deepEqual(m.ytQueries({ name: 'Rick Astley - Never Gonna Give You Up (Official Video)', artist: 'Rick Astley' }), ['Never Gonna Give You Up Rick Astley', 'Never Gonna Give You Up']);
  assert.deepEqual(m.ytQueries({ name: 'Blinding Lights', artist: 'The Weeknd - Topic' }), ['Blinding Lights The Weeknd', 'Blinding Lights']);
  const yt = { name: 'Blinding Lights', artist: 'The Weeknd - Topic' };
  const exact = m.matchScore(yt, { name: 'The Weeknd - Blinding Lights', artist: 'x' });
  assert.ok(exact > m.matchScore(yt, { name: 'Blinding Lights (DJ Velocity Remix)', artist: 'y' }));
  assert.ok(exact > m.matchScore(yt, { name: 'Something Else', artist: 'z' }));
});
