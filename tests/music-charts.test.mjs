// The combined Australian chart (netlify/functions/music-charts.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseApple, parseItunes, parseShazam, parseDeezer, combine, songKey, createHandler } from '../netlify/functions/music-charts.mjs';

const apple = { feed: { results: [{ name: "Choosin' Texas", artistName: 'Ella Langley', artworkUrl100: 'https://is1.mzstatic.com/a/100x100bb.jpg' }, { name: 'Housewife', artistName: 'Tate McRae', artworkUrl100: 'https://is1.mzstatic.com/b/100x100bb.jpg' }] } };
const itunes = { feed: { entry: [{ 'im:name': { label: 'Babydoll' }, 'im:artist': { label: 'Jamie Miller' }, 'im:image': [{ label: 'https://is1.mzstatic.com/c/55x55bb.png' }, { label: 'https://is1.mzstatic.com/c/170x170bb.png' }] }, { 'im:name': { label: "Choosin' Texas" }, 'im:artist': { label: 'Ella Langley' }, 'im:image': [] }] } };
const shazam = '﻿\n"Thursday, 19 November 2026 [performance over the past 7 days]"\nRank,Artist,Title\n1,"HUGEL, Imael Angel & Ultra Naté","Movin\' To The Sun"\n2,"Jamie Miller","Babydoll"\n3,Ella Langley,"Choosin\' Texas (Live)"\n';
const deezer = { data: [{ title: 'Housewife', artist: { name: 'Tate McRae' }, album: { cover_xl: 'https://cdn-images.dzcdn.net/x/1000x1000.jpg' } }] };

test('each chart is read into rank, name, artist and the largest official artwork', () => {
  assert.deepEqual(parseApple(apple)[0], { rank: 1, name: "Choosin' Texas", artist: 'Ella Langley', art: 'https://is1.mzstatic.com/a/600x600bb.jpg' });
  assert.deepEqual(parseItunes(itunes)[0], { rank: 1, name: 'Babydoll', artist: 'Jamie Miller', art: 'https://is1.mzstatic.com/c/600x600bb.png' });
  assert.deepEqual(parseShazam(shazam).map(s => [s.rank, s.name, s.artist]), [[1, "Movin' To The Sun", 'HUGEL, Imael Angel & Ultra Naté'], [2, 'Babydoll', 'Jamie Miller'], [3, "Choosin' Texas (Live)", 'Ella Langley']], 'quoted names with commas, and the header lines skipped');
  assert.equal(parseDeezer(deezer)[0].art, 'https://cdn-images.dzcdn.net/x/1000x1000.jpg');
  assert.deepEqual(parseApple(null), []); assert.deepEqual(parseShazam(''), []);
});

test('the same song on several charts is one entry, ranked by how high it is on each and how many charts list it', () => {
  assert.equal(songKey("Choosin' Texas (Live)", 'Ella Langley'), songKey("Choosin' Texas", 'Ella Langley & Friend'));
  const out = combine({ apple: parseApple(apple), itunes: parseItunes(itunes), shazam: parseShazam(shazam), deezer: parseDeezer(deezer) });
  assert.equal(out[0].name, "Choosin' Texas");
  assert.deepEqual(out[0].charts, { apple: 1, itunes: 2, shazam: 3 });
  assert.equal(out[0].art, 'https://is1.mzstatic.com/a/600x600bb.jpg', 'the poster comes from the first chart that has one');
  assert.deepEqual(out.map(s => s.rank), out.map((_, i) => i + 1));
  const housewife = out.find(s => s.name === 'Housewife');
  assert.deepEqual(housewife.charts, { apple: 2, deezer: 1 });
});

test('the function answers with whatever charts respond, and fails only when none do', async () => {
  const bodies = { 'rss.marketingtools.apple.com': apple, 'itunes.apple.com': itunes, 'www.shazam.com': shazam, 'api.deezer.com': deezer };
  const fetcher = async url => { const u = new URL(url); if (u.pathname === '/search') return new Response(JSON.stringify({ results: [] })); const b = bodies[u.host]; return typeof b === 'string' ? new Response(b) : new Response(JSON.stringify(b)); };
  const res = await createHandler(fetcher)(new Request('https://x/api/music-charts'));
  const d = await res.json();
  assert.deepEqual(d.sources.map(s => s.id), ['apple', 'itunes', 'shazam', 'deezer']);
  assert.equal(d.items[0].name, "Choosin' Texas");
  assert.match(res.headers.get('cache-control'), /max-age=3600/);
  const someDown = await (await createHandler(async url => (new URL(url).host === 'api.deezer.com' ? new Response(JSON.stringify(deezer)) : new Response('', { status: 503 })))(new Request('https://x/'))).json();
  assert.deepEqual(someDown.sources.map(s => s.id), ['deezer']);
  assert.equal((await createHandler(async () => { throw new Error('offline'); })(new Request('https://x/'))).status, 502);
});
