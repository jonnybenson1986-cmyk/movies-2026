import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const c = createRequire(import.meta.url)('../public/js/classics.js');

test('every search asks only for films marked public domain', () => {
  for (const [id] of c.SHELVES) {
    const u = new URL(c.shelfUrl(id));
    assert.equal(u.origin + u.pathname, 'https://archive.org/advancedsearch.php');
    assert.match(u.searchParams.get('q'), /licenseurl:\*publicdomain\*/, id);
    assert.match(u.searchParams.get('q'), /mediatype:movies/, id);
  }
  const f = new URL(c.findUrl('his girl" OR (x)'));
  assert.match(f.searchParams.get('q'), /\(his girl OR x\) AND mediatype:movies AND licenseurl:\*publicdomain\*/, 'quotes and brackets can’t break out of the search');
  assert.equal(c.shelfUrl('nope'), '');
  assert.equal(new URL(c.shelfUrl('noir', { rows: 120 })).searchParams.get('rows'), '120');
});

test('a search result becomes a film card; odd ids and adult reels are left out', () => {
  assert.deepEqual(c.filmItem({ identifier: 'his_girl_friday', title: 'His Girl Friday', year: '1940', description: '<p>Hilarious &amp; fast</p>', runtime: '1:31:44' }), {
    id: 'his_girl_friday', name: 'His Girl Friday', year: '1940', overview: 'Hilarious & fast', runtime: '1:31:44',
    poster: 'https://archive.org/services/img/his_girl_friday', href: '#classics/film/his_girl_friday' });
  assert.equal(c.filmItem({ identifier: '../etc', title: 'X' }), null);
  assert.equal(c.filmItem({ identifier: 'a b', title: 'X' }), null);
  assert.equal(c.filmItem({ identifier: 'ok', title: '' }), null);
  assert.equal(c.filmItem({ identifier: 'sex_madness', title: 'Sex Madness' }), null);
  assert.equal(c.filmItem({ identifier: 'x', title: 'Film', year: 'c.1940' }).year, '');
  assert.deepEqual(c.films([{ identifier: 'a', title: 'Detour' }, { identifier: 'b', title: 'detour' }, { identifier: 'c', title: 'Scarlet Street' }]).map(f => f.id), ['a', 'c'], 'the same film uploaded twice shows once');
});

test('the playable files are MP4s, the full one first and the data-saving one second', () => {
  const meta = { metadata: { identifier: 'his_girl_friday' }, files: [
    { name: 'his_girl_friday.ogv', format: 'Ogg Video', size: '390000000' },
    { name: 'his_girl_friday_512kb.mp4', format: '512Kb MPEG4', size: '401000000', length: '5504.5' },
    { name: 'his_girl_friday.mp4', format: 'h.264', size: '575000000', length: '5504.57' },
    { name: 'his_girl_friday.ia.mp4', format: 'h.264 IA' },
    { name: 'sub dir/odd #1.mp4', format: 'MPEG4', size: '1000' },
  ] };
  const files = c.playable(meta);
  assert.deepEqual(files.map(f => [f.url, f.small, f.mb, f.seconds]), [
    ['https://archive.org/download/his_girl_friday/his_girl_friday.mp4', false, 575, 5505],
    ['https://archive.org/download/his_girl_friday/his_girl_friday_512kb.mp4', true, 401, 5505]]);
  assert.deepEqual(c.playable({}), []);
  assert.equal(c.playable({ metadata: { identifier: 'x' }, files: [{ name: 'sub dir/odd #1.mp4' }] })[0].url, 'https://archive.org/download/x/sub%20dir/odd%20%231.mp4');
});

test('a film plays in the app’s own player, like a personal video', () => {
  const film = c.filmItem({ identifier: 'detour', title: 'Detour', year: '1945' });
  assert.deepEqual(c.playItem(film, { url: 'https://archive.org/download/detour/detour.mp4' }), {
    key: 'ia:detour', id: 'detour', type: 'movie', catalog: 'personal', name: 'Detour', year: '1945', overview: '', url: 'https://archive.org/download/detour/detour.mp4', source: 'Internet Archive' });
  assert.equal(c.length(5505), '1h 32m'); assert.equal(c.length(1500), '25m'); assert.equal(c.length(0), '');
});

test('page addresses', () => {
  assert.deepEqual(c.parseRoute(''), { page: 'home' });
  assert.deepEqual(c.parseRoute('noir'), { page: 'shelf', shelf: 'noir' });
  assert.deepEqual(c.parseRoute('nope'), { page: 'home' });
  assert.deepEqual(c.parseRoute('search/his girl'), { page: 'search', search: 'his girl' });
  assert.deepEqual(c.parseRoute('film/his_girl_friday'), { page: 'film', id: 'his_girl_friday' });
  assert.deepEqual(c.parseRoute('film/../x'), { page: 'home' });
});
