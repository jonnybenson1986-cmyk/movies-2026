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

test('the loudest m4a of a Piped answer is played, and only real audio passes the check', () => {
  const streams = [
    { url: 'https://p.example/webm', mimeType: 'audio/webm', bitrate: 160 },
    { url: 'https://p.example/low.m4a', mimeType: 'audio/mp4', bitrate: 48 },
    { url: 'https://p.example/high.m4a', mimeType: 'audio/mp4', bitrate: 128 },
    { url: 'http://insecure.example/a.mp4', mimeType: 'audio/mp4', bitrate: 256 },
  ];
  assert.equal(f.pickPipedAudio(streams), 'https://p.example/high.m4a');
  assert.equal(f.pickPipedAudio([streams[0]]), 'https://p.example/webm', 'without m4a the loudest other audio is used');
  assert.equal(f.pickPipedAudio([streams[3]]), '', 'an http stream is never played');
  assert.equal(f.pickPipedAudio([]), '');
  assert.equal(f.isAudio('audio/mp4', null), true);
  assert.equal(f.isAudio('', new Uint8Array([0xff, 0x3b]), ), true, 'a byte range that is clearly not an error page counts as audio');
  assert.equal(f.isAudio('text/html', new Uint8Array([0x3c, 0x21])), false, 'an html error page is not audio');
  assert.equal(f.isAudio('application/json', new Uint8Array([0x7b, 0x22])), false);
});

test('only the allowlisted ops with well-formed values are served', async () => {
  const h = f.createHandler();
  const call = async query => { const r = await h(new Request('https://site.example/api/music-yt' + query)); return [r.status, r.headers.get('cache-control'), await r.json()]; };
  await assert.deepEqual(await call('?op=nope'), [400, 'public, max-age=600', { error: 'Unknown op' }]);
  await assert.deepEqual(await call('?op=search&q='), [400, 'public, max-age=600', { error: 'Missing q' }]);
  await assert.deepEqual(await call('?op=streams&id=short'), [400, 'public, max-age=600', { error: 'Bad id' }]);
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
    assert.equal(await get('?op=streams&id=jNQXAC9IVRw'), 502);
    assert.equal(await get('?op=playlist&id=PLrAXtmErZgOdP_8GztsuPi9g_pyC8S1ys'), 502);
  } finally { globalThis.fetch = realFetch; }
});

test('a working instance is used: search, trending and verified streams are passed through', async () => {
  const realFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push(String(url));
    if (String(url).includes('/search?') && String(url).includes('music_playlists')) return Response.json({ items: [{ url: '/playlist?list=PLrAXtmErZgOdP_8GztsuPi9g_pyC8S1ys', name: 'Hits', uploaderName: 'YouTube Music', videos: 50 }] });
    if (String(url).includes('/search?')) return Response.json({ items: [piped, { ...piped, url: '/watch?v=aaaaaaaaaaa', title: ' mix ', duration: 3600 }] });
    if (String(url).includes('/streams/')) return Response.json({ audioStreams: [{ url: 'https://p.example/high.m4a', mimeType: 'audio/mp4', bitrate: 128 }] });
    if (String(url).includes('/playlists/')) return Response.json({ name: ' Hits ', uploader: 'YouTube Music', thumbnailUrl: 'https://p.example/c.jpg', videos: [piped] });
    if (String(url).startsWith('https://p.example/')) return new Response(new Uint8Array([0, 0, 0, 24]), { headers: { 'content-type': 'audio/mp4' } });
    throw new Error('unexpected ' + url);
  };
  try {
    const h = f.createHandler();
    const get = async q => (await h(new Request('https://site.example/api/music-yt' + q))).json();
    assert.deepEqual(await get('?op=search&q=daft%20punk'), { items: [f.songFromPiped(piped), { ...f.songFromPiped(piped), id: 'aaaaaaaaaaa', name: 'mix', duration: 3600 }] });
    assert.ok(seen[0].startsWith('https://api.piped.private.coffee/search?'));
    const t = await get('?op=trending');
    assert.deepEqual(t.items.map(v => v.id), ['khnokW3Mw24'], 'the hour-long mix is filtered out of the chart songs');
    assert.deepEqual(await get('?op=streams&id=jNQXAC9IVRw'), { url: 'https://p.example/high.m4a' });
    const p = await get('?op=playlist&id=PLrAXtmErZgOdP_8GztsuPi9g_pyC8S1ys');
    assert.equal(p.name, 'Hits');
    assert.equal(p.count, 1, 'the count is the number of tracks the playlist page can play');
  } finally { globalThis.fetch = realFetch; }
});

test('a stream that answers with an error page is not handed to the player', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url => (String(url).startsWith('https://p.example/')
    ? new Response('<!doctype html><html>Verifying your browser', { headers: { 'content-type': 'text/html' } })
    : Response.json({ audioStreams: [{ url: 'https://p.example/a.m4a', mimeType: 'audio/mp4', bitrate: 128 }] }));
  try {
    const h = f.createHandler();
    const r = await h(new Request('https://site.example/api/music-yt?op=streams&id=jNQXAC9IVRw'));
    assert.equal(r.status, 502);
  } finally { globalThis.fetch = realFetch; }
});
