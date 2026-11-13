import test from 'node:test';
import assert from 'node:assert/strict';
import * as f from '../netlify/functions/music-yt.mjs';

const piped = { url: '/watch?v=khnokW3Mw24', type: 'stream', title: ' Instant Crush ', thumbnail: 'https://proxy.piped.example/x=w120-h120?host=yt3.googleusercontent.com', uploaderName: 'Daft Punk', duration: 338 };

test('songs and playlists from the backend become the few fields the app keeps', () => {
  assert.deepEqual(f.songFromPiped(piped), { id: 'khnokW3Mw24', name: 'Instant Crush', artist: 'Daft Punk', art: 'https://proxy.piped.example/x=w120-h120?host=yt3.googleusercontent.com', duration: 338, src: 'yt' });
  assert.equal(f.songFromPiped({ ...piped, url: '/watch?v=short' }), null);
  assert.equal(f.songFromPiped({ ...piped, title: '' }), null);
  assert.equal(f.songFromPiped(null), null);
  assert.deepEqual(f.playlistFromSearch({ url: '/playlist?list=PLrAXtmErZgOdP_8GztsuPi9g_pyC8S1ys', name: 'Hits', uploaderName: 'YouTube Music', thumbnail: 'https://p.example/c.jpg', videos: 50 }), { id: 'PLrAXtmErZgOdP_8GztsuPi9g_pyC8S1ys', name: 'Hits', by: 'YouTube Music', art: 'https://p.example/c.jpg', count: 50, src: 'yt' });
  assert.equal(f.playlistFromSearch({ url: '/playlist?list=tooshort', name: 'x' }), null);
  const d = f.playlistDetail({ name: ' Hits ', uploader: 'YouTube Music', thumbnailUrl: 'https://p.example/c.jpg', videos: [piped, { url: '/watch?v=bad' }] });
  assert.deepEqual(d.info, { name: 'Hits', by: 'YouTube Music', art: 'https://p.example/c.jpg', src: 'yt' });
  assert.deepEqual(d.videos.map(v => v.id), ['khnokW3Mw24']);
  assert.deepEqual(f.playlistDetail(null), { count: 0, info: null, videos: [] });
});

const apple = (id, name, artist, extra = {}) => ({ id, name, artistName: artist, artworkUrl100: `https://is1-ssl.mzstatic.com/image/thumb/Music/v4/${id}/cover.jpg/100x100bb.jpg`, releaseDate: '2026-10-17', genres: [{ name: 'Pop' }, { name: 'Music' }], ...extra });

test('a song from Apple’s chart keeps its rank, official artwork at full size, and Apple id', () => {
  assert.deepEqual(f.chartSong(apple('1844932150', " Choosin' Texas ", 'Ella Langley'), 1), {
    id: '1844932150', rank: 1, name: "Choosin' Texas", artist: 'Ella Langley', art: 'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/1844932150/cover.jpg/600x600bb.jpg', genre: 'Pop', released: '2026-10-17', src: 'chart' });
  assert.equal(f.chartSong(apple('x1', 'Song', 'A'), 1), null, 'the id must be Apple’s number');
  assert.equal(f.chartSong(apple('1', '', 'A'), 1), null);
  assert.equal(f.chartSong({ ...apple('1', 'Song', 'A'), artworkUrl100: 'http://plain.example/a.jpg' }, 1).art, '', 'only https artwork');
  assert.equal(f.chartSong({ ...apple('1', 'Song', 'A'), genres: [{ name: 'Music' }] }, 1).genre, '');
  assert.equal(f.chartSong(null, 1), null);
});

test('only the allowlisted ops with well-formed values are served', async () => {
  const h = f.createHandler();
  const call = async query => { const r = await h(new Request('https://site.example/api/music-yt' + query)); return [r.status, r.headers.get('cache-control'), await r.json()]; };
  await assert.deepEqual(await call('?op=nope'), [400, 'public, max-age=600', { error: 'Unknown op' }]);
  await assert.deepEqual(await call('?op=search&q='), [400, 'public, max-age=600', { error: 'Missing q' }]);
  await assert.deepEqual(await call('?op=streams&id=jNQXAC9IVRw'), [400, 'public, max-age=600', { error: 'Unknown op' }], 'the app never asks for audio addresses');
  await assert.deepEqual(await call('?op=playlist&id=..'), [400, 'public, max-age=600', { error: 'Bad id' }]);
});

test('when every instance is down every op says so', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('down'); };
  try {
    const h = f.createHandler();
    const get = async q => (await h(new Request('https://site.example/api/music-yt' + q))).status;
    assert.equal(await get('?op=search&q=daft'), 502);
    assert.equal(await get('?op=trending'), 502);
    assert.equal(await get('?op=charts&region=au'), 502);
    assert.equal(await get('?op=playlist&id=PLrAXtmErZgOdP_8GztsuPi9g_pyC8S1ys'), 502);
  } finally { globalThis.fetch = realFetch; }
});

test('a working instance is used for search and playlists, and the chart comes from Apple', async () => {
  const realFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async url => {
    seen.push(String(url));
    if (String(url).startsWith('https://rss.marketingtools.apple.com/')) return Response.json({ feed: { updated: 'Fri, 13 Nov 2026', results: [apple('1844932150', "Choosin' Texas", 'Ella Langley'), apple('bad', 'Nope', 'X'), apple('1830000000', 'Housewife', 'Tate McRae')] } });
    if (String(url).includes('/search?') && String(url).includes('music_playlists')) return Response.json({ items: [{ url: '/playlist?list=PLrAXtmErZgOdP_8GztsuPi9g_pyC8S1ys', name: 'Hits', uploaderName: 'YouTube Music', videos: 50 }] });
    if (String(url).includes('/search?')) return Response.json({ items: [piped, { ...piped, url: '/watch?v=aaaaaaaaaaa', title: ' mix ', duration: 3600 }] });
    if (String(url).includes('/playlists/')) return Response.json({ name: ' Hits ', uploader: 'YouTube Music', thumbnailUrl: 'https://p.example/c.jpg', videos: [piped] });
    throw new Error('unexpected ' + url);
  };
  try {
    const h = f.createHandler();
    const get = async q => (await h(new Request('https://site.example/api/music-yt' + q))).json();
    assert.deepEqual(await get('?op=search&q=daft%20punk'), { items: [f.songFromPiped(piped), { ...f.songFromPiped(piped), id: 'aaaaaaaaaaa', name: 'mix', duration: 3600 }] });
    assert.ok(seen[0].startsWith('https://api.piped.private.coffee/search?'));
    const c = await get('?op=charts&region=AU');
    assert.equal(c.region, 'au');
    assert.deepEqual(c.items.map(v => [v.rank, v.name]), [[1, "Choosin' Texas"], [3, 'Housewife']], 'ranks follow the chart; a bad entry is skipped');
    assert.ok(seen.includes('https://rss.marketingtools.apple.com/api/v2/au/music/most-played/100/songs.json'));
    await get('?op=charts&region=../x');
    assert.equal(seen.at(-1), 'https://rss.marketingtools.apple.com/api/v2/au/music/most-played/100/songs.json', 'an unknown country falls back to Australia');
    await get('?op=charts&region=nz');
    assert.equal(seen.at(-1), 'https://rss.marketingtools.apple.com/api/v2/nz/music/most-played/100/songs.json');
    assert.deepEqual((await get('?op=trending')).items.map(v => v.name), ["Choosin' Texas", 'Housewife'], 'older copies of the app asking for "trending" get the real chart');
    const p = await get('?op=playlist&id=PLrAXtmErZgOdP_8GztsuPi9g_pyC8S1ys');
    assert.equal(p.name, 'Hits');
    assert.equal(p.count, 1, 'the count is the number of tracks the playlist page can play');
  } finally { globalThis.fetch = realFetch; }
});
