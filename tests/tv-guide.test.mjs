import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { CITIES, url, alias, official, rows, pageHTML, detailHTML } = createRequire(import.meta.url)('../public/js/tv-guide.js');

const H = 3600e3, NOW = Date.UTC(2026, 10, 11, 9, 30);
const prog = (startH, hours, title, desc = '') => ({ start: NOW + startH * H, stop: NOW + (startH + hours) * H, title, desc });
const byId = new Map([
  ['seven', [prog(-2, 1, 'Finished'), prog(-0.5, 1, 'The Chase'), prog(0.5, 1, 'News'), prog(1.5, 1, 'Later')]],
  ['abc', [prog(-1, 2, 'Hard Quiz', 'A quiz.'), prog(1, 1, '7.30')]],
  ['empty', [prog(-3, 1, 'Long gone')]],
]);
const names = new Map([['seven', 'Seven'], ['abc', 'ABC TV'], ['empty', 'Nothing On']]);
const ids = ['seven', 'abc', 'empty'];

test('each capital city has a guide address, and anything else has none', () => {
  assert.equal(url('Sydney'), 'https://i.mjh.nz/au/Sydney/epg.xml.gz');
  assert.equal(CITIES.length, 8);
  for (const c of CITIES) assert.match(url(c), /^https:\/\/i\.mjh\.nz\/au\/[A-Za-z]+\/epg\.xml\.gz$/);
  for (const bad of ['off', '', undefined, '../x', 'sydney']) assert.equal(url(bad), '');
});

test('app channel names are matched to the guide’s names', () => {
  assert.equal(alias('abctvplus'), 'abcfamily');
  assert.equal(alias('10bold'), '10drama');
  assert.equal(alias('9gem'), '9gem', 'names that already match are left alone');
});

test('a channel the app lists per city only matches the guide of that city', () => {
  assert.equal(alias('channel9australia', 'Sydney'), 'channel9');
  assert.equal(alias('channel9australia', 'Perth'), '', 'plain Channel 9 is Sydney’s');
  assert.equal(alias('channel9australiaperth', 'Perth'), 'channel9');
  assert.equal(alias('channel9australiaperth', 'Sydney'), '');
  assert.equal(alias('abctv', 'Sydney'), 'abctv');
  assert.equal(alias('abctvvic', 'Melbourne'), 'abctv');
  assert.equal(alias('abctvvic', 'Sydney'), '');
  assert.equal(alias('abctvact', 'Canberra'), 'abctv');
  assert.equal(alias('abctvwa', 'Perth'), 'abctv');
});

test('rows hold what is on now and next, channels you can watch first, finished shows dropped', () => {
  const stream = { key: 'l:1', name: 'ABC TV' };
  const r = rows({ ids, names, byId, streamOf: id => (id === 'abc' ? stream : null), now: NOW, limit: 2 });
  assert.deepEqual(r.map(x => x.id), ['abc', 'seven'], 'watchable first; a channel with nothing left is left out');
  assert.equal(r[0].stream, stream);
  assert.deepEqual(r[1].programmes.map(p => p.title), ['The Chase', 'News'], 'limit applies after dropping finished shows');
});

test('the page shows now with progress, later times, Watch for streams, and escapes titles', () => {
  byId.set('evil', [prog(-1, 2, '<img src=x onerror=alert(1)>')]);
  names.set('evil', '<b>Evil</b>');
  const list = rows({ ids: [...ids, 'evil'], names, byId, streamOf: id => (id === 'abc' ? { key: 'l:"1' } : null), now: NOW });
  const html = pageHTML({ state: 'ready', city: 'Sydney', list, onlyWatchable: false, now: NOW });
  assert.match(html, /NOW · until/);
  assert.match(html, /width:50\.0%/, 'Hard Quiz is half way through');
  assert.match(html, /data-key="l:&quot;1"/);
  assert.match(html, /Guide only/);
  assert.ok(!html.includes('<img src=x') && !html.includes('<b>Evil</b>'));
  assert.match(html, /<option selected>Sydney<\/option>/);
  assert.equal((html.match(/class="epg-row"/g) || []).length, 3);
  const only = pageHTML({ state: 'ready', city: 'Sydney', list, onlyWatchable: true, now: NOW });
  assert.equal((only.match(/class="epg-row"/g) || []).length, 1);
});

test('free-to-air channels without a stream link to the network’s own free service', () => {
  assert.deepEqual(official('mjh-seven-syd'), { name: '7plus', url: 'https://7plus.com.au/live-tv' });
  assert.equal(official('mjh-7mate-per').name, '7plus');
  assert.equal(official('mjh-gem-vic').name, '9Now');
  assert.equal(official('mjh-10peach-nsw').name, '10');
  assert.equal(official('mjh-sbs-sbst').name, 'SBS On Demand');
  assert.equal(official('mjh-abc-kids').name, 'ABC iview');
  assert.equal(official('mjh-judgejudy-fast'), null);
  assert.equal(official('mjh-sky-racing-1'), null);
  const list = rows({ ids: ['mjh-seven-syd'], names: new Map([['mjh-seven-syd', 'Seven']]), byId: new Map([['mjh-seven-syd', [prog(-1, 2, 'Sunrise')]]]), now: NOW });
  const html = pageHTML({ state: 'ready', city: 'Sydney', list, onlyWatchable: false, now: NOW });
  assert.match(html, /href="https:\/\/7plus\.com\.au\/live-tv" target="_blank" rel="noopener noreferrer">7plus ↗/);
  assert.ok(!html.includes('Guide only'));
});

test('loading, failed and off each say so', () => {
  const base = { city: 'Sydney', list: [], onlyWatchable: false, now: NOW };
  assert.match(pageHTML({ ...base, state: 'loading' }), /Loading the TV guide/);
  assert.match(pageHTML({ ...base, state: 'failed' }), /data-act="guidereload"/);
  assert.match(pageHTML({ ...base, state: 'off', city: 'off' }), /switched off/);
  assert.match(pageHTML({ ...base, state: 'off', city: 'off' }), /<option value="off" selected>/);
});

test('programme details are escaped and fall back when there is no description', () => {
  assert.match(detailHTML('ABC TV', byId.get('abc')[0]), /A quiz\./);
  const html = detailHTML('<x>', { start: NOW, stop: NOW + H, title: '', desc: '' });
  assert.match(html, /To be announced/); assert.match(html, /No description/); assert.ok(!html.includes('<x>'));
});
