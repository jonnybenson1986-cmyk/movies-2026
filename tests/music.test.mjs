import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cleanMusicItem, cleanData, mergeData, LIMITS, EMPTY } from '../netlify/lib/account-data.mjs';
const m = createRequire(import.meta.url)('../public/js/music.js');

const track = (extra = {}) => ({ id: 'J7Xb000', title: ' Murder She Wrote ', user: { name: 'Brooke Evers' }, duration: 187.4, genre: 'House', artwork: { '150x150': 'https://a.example/150.jpg', '480x480': 'https://a.example/480.jpg' }, ...extra });
const station = (extra = {}) => ({ stationuuid: 'abc-1', name: ' Triple J ', url_resolved: 'https://live.example/triplej.mp3', favicon: 'http://insecure.example/x.png', tags: 'alternative, indie,music', state: 'New South Wales', country: 'Australia', hls: 0, ...extra });

test('an Audius track becomes a song the app can keep', () => {
  assert.deepEqual(m.songItem(track()), { key: 's:J7Xb000', type: 'song', id: 'J7Xb000', name: 'Murder She Wrote', artist: 'Brooke Evers', art: 'https://a.example/480.jpg', duration: 187, genre: 'House' });
  assert.equal(m.songItem(track({ artwork: { '480x480': 'javascript:alert(1)' } })).art, '', 'only https artwork is used');
  assert.equal(m.songItem(track({ is_streamable: false })), null);
  assert.equal(m.songItem({ id: 'x' }), null);
  assert.equal(m.songItem(null), null);
});

test('a radio station needs an https stream; http ones and HLS ones are left out', () => {
  assert.deepEqual(m.stationItem(station()), { key: 'r:abc-1', type: 'radio', id: 'abc-1', name: 'Triple J', artist: 'New South Wales, Australia', art: '', url: 'https://live.example/triplej.mp3', genre: 'alternative' });
  assert.equal(m.stationItem(station({ url_resolved: 'http://live.example/a.mp3', url: '' })), null);
  assert.equal(m.stationItem(station({ url_resolved: '', url: 'https://b.example/s' })).url, 'https://b.example/s');
  assert.equal(m.stationItem(station({ hls: 1 })), null);
  assert.equal(m.stationItem(station({ name: '  ' })), null);
});

test('stream and search addresses', () => {
  assert.equal(m.streamUrl(m.songItem(track({ id: 'a/b' }))), 'https://api.audius.co/v1/tracks/a%2Fb/stream?app_name=StreamBox');
  assert.equal(m.streamUrl(m.stationItem(station())), 'https://live.example/triplej.mp3');
  const t = new URL(m.urls.trending('Rock'));
  assert.equal(t.pathname, '/v1/tracks/trending'); assert.equal(t.searchParams.get('genre'), 'Rock'); assert.equal(t.searchParams.get('app_name'), 'StreamBox');
  assert.equal(new URL(m.urls.trending('<nope>')).searchParams.has('genre'), false, 'unknown genres are ignored');
  assert.equal(new URL(m.urls.songSearch('daft punk & co')).searchParams.get('query'), 'daft punk & co');
  const s = new URLSearchParams(m.urls.stations({ cc: 'AU' }).split('?')[1]);
  assert.equal(s.get('countrycode'), 'AU'); assert.equal(s.get('is_https'), 'true'); assert.equal(s.get('hidebroken'), 'true'); assert.equal(s.has('tag'), false);
});

test('favourites: newest first, no duplicates, and tapping again removes', () => {
  const a = m.songItem(track()), b = m.stationItem(station());
  let list = m.toggleFav([], a);
  list = m.toggleFav(list, b);
  assert.deepEqual(list.map(i => i.key), ['r:abc-1', 's:J7Xb000']);
  assert.equal(list[0].url, 'https://live.example/triplej.mp3');
  assert.equal('url' in list[1], false, 'a song keeps no address: it is played by its id');
  assert.ok(m.isFav(list, a.key));
  list = m.toggleFav(list, a);
  assert.deepEqual(list.map(i => i.key), ['r:abc-1']);
  assert.ok(m.validFav(list[0]));
  assert.ok(!m.validFav({ key: 'r:x', type: 'radio', id: 'x', name: 'X', url: 'http://x' }));
  assert.ok(!m.validFav({ key: 'z', type: 'video', id: '1', name: 'n' }));
});

test('page addresses map to what is shown', () => {
  assert.deepEqual(m.parseRoute(''), { tab: 'songs', genre: '' });
  assert.deepEqual(m.parseRoute('songs/Hip-Hop/Rap'), { tab: 'songs', genre: 'Hip-Hop/Rap' });
  assert.deepEqual(m.parseRoute('songs/<x>'), { tab: 'songs', genre: '' });
  assert.deepEqual(m.parseRoute('search/tame impala'), { tab: 'songs', search: 'tame impala' });
  assert.deepEqual(m.parseRoute('radio'), { tab: 'radio', tag: '' });
  assert.deepEqual(m.parseRoute('radio/jazz'), { tab: 'radio', tag: 'jazz' });
  assert.deepEqual(m.parseRoute('radio/search/abc'), { tab: 'radio', search: 'abc' });
  assert.deepEqual(m.parseRoute('favourites'), { tab: 'favourites' });
  assert.equal(m.clock(187), '3:07'); assert.equal(m.clock(0), '');
});

// ------------------------------------------------------------------ what the account keeps
test('favourite music is rebuilt from safe fields before it is stored', () => {
  const song = m.toggleFav([], m.songItem(track()))[0], radio = m.toggleFav([], m.stationItem(station()))[0];
  assert.deepEqual(cleanMusicItem({ ...song, onclick: 'x()' }), { key: 's:J7Xb000', type: 'song', id: 'J7Xb000', name: 'Murder She Wrote', artist: 'Brooke Evers', genre: 'House', art: 'https://a.example/480.jpg', duration: 187 });
  assert.equal(cleanMusicItem(radio).url, 'https://live.example/triplej.mp3');
  assert.equal(cleanMusicItem({ ...radio, url: 'javascript:alert(1)' }), null, 'a station must have an https stream');
  assert.equal(cleanMusicItem({ ...radio, url: 'http://plain.example/s' }), null);
  assert.equal(cleanMusicItem({ ...song, art: 'https://x.example/" onerror="alert(1)' }).art, undefined, 'artwork must be a clean https address');
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
