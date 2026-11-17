// The album-poster lookup (netlify/functions/music-art.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickArt, createHandler } from '../netlify/functions/music-art.mjs';

const r = (artistName, collectionName, art = 'https://is1.mzstatic.com/x/100x100bb.jpg', extra = {}) => ({ artistName, collectionName, artworkUrl100: art, ...extra });

test('the artist has to match, and the closest album wins, at 600×600', () => {
  const results = [r('Radiohead Tribute Band', 'OK Computer'), r('Radiohead', 'OK Computer OKNOTOK 1997 2017', 'https://a.example/x/100x100bb.jpg'), r('Radiohead', 'OK Computer', 'https://b.example/x/100x100bb.jpg')];
  assert.equal(pickArt(results, 'radiohead', 'OK Computer'), 'https://b.example/x/600x600bb.jpg');
  assert.equal(pickArt(results, 'The Beatles', 'OK Computer'), '', 'another artist’s album is never used');
  assert.equal(pickArt([r('The Beatles', 'Help! (Remastered)')], 'Beatles', 'Help!'), 'https://is1.mzstatic.com/x/600x600bb.jpg', '"The" and bracketed extras don’t matter');
  assert.equal(pickArt([r('Abba', 'Gold', 'javascript:alert(1)')], 'Abba', 'Gold'), '');
  assert.equal(pickArt([r('Daft Punk & Pharrell Williams', 'Get Lucky')], 'Pharrell Williams', 'Get Lucky'), 'https://is1.mzstatic.com/x/600x600bb.jpg', 'a credited artist counts');
  assert.equal(pickArt([r('Simon & Garfunkel', 'Bookends')], 'Simon and Garfunkel', 'Bookends'), 'https://is1.mzstatic.com/x/600x600bb.jpg', 'a duo’s own name still matches');
  assert.equal(pickArt(null, 'a', 'b'), '');
});

test('the function looks for an album, then a single, and only returns the picture address', async () => {
  const asked = [];
  const fetcher = async url => { const u = new URL(url); asked.push(u.searchParams.get('entity')); return new Response(JSON.stringify({ results: u.searchParams.get('entity') === 'song' ? [{ artistName: 'Abba', trackName: 'Waterloo', artworkUrl100: 'https://c.example/100x100bb.png' }] : [] })); };
  const h = createHandler(fetcher);
  const res = await h(new Request('https://site.example/api/music-art?artist=Abba&album=Waterloo'));
  assert.deepEqual(await res.json(), { art: 'https://c.example/600x600bb.png' });
  assert.deepEqual(asked, ['album', 'song']);
  assert.match(res.headers.get('cache-control'), /max-age=604800/);
  assert.equal((await h(new Request('https://site.example/api/music-art?artist=Abba'))).status, 400);
  const down = createHandler(async () => { throw new Error('offline'); });
  assert.equal((await down(new Request('https://site.example/api/music-art?artist=a&album=b'))).status, 502);
});
