import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanItem, cleanData } from '../netlify/lib/account-data.mjs';
import * as util from '../public/js/apple-tv/util.js';
import { ArtworkManager } from '../public/js/apple-tv/artwork-manager.js';
import { pickNext } from '../public/js/apple-tv/focus.js';
import { card } from '../public/js/apple-tv/cards.js';

const KEY = 'a'.repeat(32);
const loadTmdb = async () => {
  globalThis.window = { StreamBoxArt: { key: () => KEY } };
  return import('../public/js/apple-tv/tmdb.js?' + Math.random());
};

test('runtime, money, dates and years are formatted', () => {
  assert.equal(util.formatRuntime(135), '2h 15m');
  assert.equal(util.formatRuntime(45), '45m');
  assert.equal(util.formatRuntime(0), '');
  assert.equal(util.formatMoney(2_500_000), '$2.5M');
  assert.equal(util.formatMoney(0), '');
  assert.equal(util.getYear('2019-05-03'), '2019');
  assert.equal(util.getYear('nonsense'), '');
  assert.equal(util.formatDate(''), '');
});

test('escaping covers the characters that break out of HTML', () => {
  assert.equal(util.esc(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
  assert.equal(util.esc(null), '');
});

test('age rating prefers Australia and falls back to the US', () => {
  const dates = { results: [{ iso_3166_1: 'US', release_dates: [{ certification: 'PG-13' }] }, { iso_3166_1: 'AU', release_dates: [{ certification: '' }, { certification: 'M' }] }] };
  assert.equal(util.certification(dates, 'AU'), 'M');
  assert.equal(util.certification({ results: [dates.results[0]] }, 'AU'), 'PG-13');
  assert.equal(util.certification(undefined), '');
});

test('the trailer chosen is an official YouTube trailer where there is one', () => {
  const videos = { results: [
    { site: 'Vimeo', key: 'v', type: 'Trailer', official: true },
    { site: 'YouTube', key: 'teaser', type: 'Teaser' },
    { site: 'YouTube', key: 'fan', type: 'Trailer', official: false },
    { site: 'YouTube', key: 'real', type: 'Trailer', official: true },
  ] };
  assert.equal(util.trailerOf(videos).key, 'real');
  assert.equal(util.trailerOf({ results: [{ site: 'Vimeo', key: 'v' }] }), null);
  assert.equal(util.trailerOf(undefined), null);
});

test('where-to-watch groups providers for the region, without duplicates', () => {
  const p = { results: { AU: { link: 'https://www.themoviedb.org/movie/1/watch?locale=AU', flatrate: [{ provider_id: 1, provider_name: 'A' }, { provider_id: 1, provider_name: 'A' }], rent: [{ provider_id: 2, provider_name: 'B' }], ads: [{ provider_id: 3, provider_name: 'C' }] } } };
  const out = util.providerGroups(p, 'AU');
  assert.deepEqual(out.groups.map(g => [g.kind, g.list.length]), [['stream', 1], ['free', 1], ['rent', 1]]);
  assert.ok(out.link.startsWith('https://'));
  assert.deepEqual(util.providerGroups(p, 'NZ'), { link: '', groups: [] });
  assert.equal(util.providerGroups({ results: { AU: { link: 'javascript:alert(1)', rent: [{ provider_id: 1 }] } } }, 'AU').link, '', 'only https links are used');
});

test('badges only say what the data supports', () => {
  assert.deepEqual(util.movieBadges({ vote_average: 8.4, vote_count: 9000 }, 'M').map(b => b.label), ['Top Rated', 'M']);
  assert.deepEqual(util.movieBadges({ vote_average: 9.5, vote_count: 3 }, ''), [], 'a few votes is not "top rated"');
});

test('a movie becomes a My List item', () => {
  assert.deepEqual(util.toItem({ id: 7, title: 'Seven', release_date: '1995-09-22', vote_average: 8.36, poster_path: '/p.jpg' }),
    { key: 't:7', type: 'title', id: '7', cat: 'Movies', name: 'Seven', year: '1995', vote: '8.4', poster: '/p.jpg' });
});

test('artwork URLs use the TMDB image host, with placeholders when there is no image', () => {
  const art = new ArtworkManager();
  assert.equal(art.getPosterUrl('/a.jpg', 'w500'), 'https://image.tmdb.org/t/p/w500/a.jpg');
  assert.equal(art.getBackdropUrl('/b.jpg'), 'https://image.tmdb.org/t/p/w1280/b.jpg');
  assert.equal(art.getProfileUrl(null), '/images/profile-placeholder.svg');
  assert.equal(art.getPosterUrl(''), '/images/poster-placeholder.svg');
  assert.equal(art.getBackdropUrl(undefined), '/images/backdrop-placeholder.svg');
});

test('TMDB calls carry the app key and language, and are remembered', async () => {
  const { api } = await loadTmdb();
  const urls = [];
  globalThis.fetch = async url => { urls.push(String(url)); return { ok: true, status: 200, json: async () => ({ results: [] }) }; };
  await api.trending(2); await api.trending(2);
  assert.equal(urls.length, 1, 'the same request is made once');
  const u = new URL(urls[0]);
  assert.equal(u.pathname, '/3/trending/movie/week');
  assert.equal(u.searchParams.get('api_key'), KEY);
  assert.equal(u.searchParams.get('language'), 'en-AU');
  assert.equal(u.searchParams.get('page'), '2');
  await api.movie('603');
  assert.match(urls[1], /\/movie\/603\?/);
  assert.match(decodeURIComponent(urls[1]), /append_to_response=credits,videos,watch\/providers/);
});

test('a bad key or a failed request is reported, and not remembered', async () => {
  const { api } = await loadTmdb();
  let status = 401;
  globalThis.fetch = async () => ({ ok: status === 200, status, json: async () => ({ results: [1] }) });
  await assert.rejects(api.popular(), /did not accept/);
  status = 500;
  await assert.rejects(api.popular(), /TMDB error 500/);
  status = 200;
  assert.deepEqual((await api.popular()).results, [1], 'a later try goes out again');
});

test('with no key set nothing is sent', async () => {
  globalThis.window = { StreamBoxArt: { key: () => '' } };
  const { api } = await import('../public/js/apple-tv/tmdb.js?' + Math.random());
  let called = false;
  globalThis.fetch = async () => { called = true; };
  await assert.rejects(api.trending(), /No TMDB key/);
  assert.equal(called, false);
});

test('arrow keys move to the nearest item in that direction', () => {
  const r = (left, top) => ({ left, top, width: 100, height: 100 });
  const here = r(200, 200), left = r(60, 200), right = r(340, 200), up = r(200, 60), down = r(200, 340), diagonal = r(340, 340);
  const all = [here, left, right, up, down, diagonal];
  assert.equal(pickNext(here, all, [-1, 0]), left);
  assert.equal(pickNext(here, all, [1, 0]), right);
  assert.equal(pickNext(here, all, [0, -1]), up);
  assert.equal(pickNext(here, all, [0, 1]), down, 'Down goes down');
  assert.equal(pickNext(right, [right, here], [1, 0]), null, 'nothing further right');
  assert.equal(pickNext(here, [here, r(340, 210), r(340, 600)], [1, 0]).top, 210, 'the one in line wins');
});

test('a title card escapes what it shows and opens through its key', () => {
  const html = card({ key: 't:1', type: 'title', id: '1', name: '<script>alert(1)</script>"', year: '2020', vote: '7.1', poster: '/p.jpg' });
  assert.ok(!html.includes('<script>'));
  assert.match(html, /data-key="t:1"/);
  assert.match(html, /image\.tmdb\.org\/t\/p\/w342\/p\.jpg/);
  assert.ok(!card({ key: 't:2', type: 'title', id: '2', name: 'No art', year: '', vote: '', poster: '' }).includes('<img'));
});

test('titles sync with an account, and only as safe TMDB data', () => {
  const t = { key: 't:603', type: 'title', id: '603', name: 'The Matrix', year: '1999', vote: '8.2', poster: '/abc.jpg', url: 'javascript:1', onclick: 'x' };
  assert.deepEqual(cleanItem(t), { key: 't:603', type: 'title', id: '603', name: 'The Matrix', year: '1999', vote: '8.2', poster: '/abc.jpg' }, 'no stream address is kept for a title');
  assert.equal(cleanItem({ ...t, id: 'abc' }), null, 'the id must be a TMDB number');
  assert.equal(cleanItem({ ...t, poster: 'https://evil.example/x.jpg' }).poster, undefined, 'the poster must be an image path');
  assert.equal(cleanData({ mylist: { at: 5, items: [t] } }).mylist.items.length, 1);
});
