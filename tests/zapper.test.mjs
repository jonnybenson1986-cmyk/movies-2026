import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { groupChannels, createZapper, createDigits, wrap } = createRequire(import.meta.url)('../public/js/zapper.js');

const ch = (name, cc, extra = {}) => ({ name, cc, ...extra });
const names = list => list.map(c => c.name);
const uk = [ch('BBC One', 'gb'), ch('BBC Two', 'gb'), ch('ITV', 'gb'), ch('Dead', 'gb', { bad: true })];
const au = [ch('ABC', 'au'), ch('Seven', 'au')];
const other = [ch('Mystery', '')];
const fr = [ch('TF1', 'fr')];
const all = [...other, ...fr, ...au, ...uk];
const make = (extra = {}) => createZapper({ groups: () => groupChannels(all, c => c.toUpperCase()), usable: c => !c.bad, ...extra });

test('channels are grouped by country, alphabetically, with unknown origin last', () => {
  const groups = groupChannels(all, c => c.toUpperCase());
  assert.deepEqual(groups.map(g => g.cc), ['au', 'fr', 'gb', '']);
  assert.equal(groups.at(-1).name, 'International / Other');
  assert.equal(groups[2].name, 'GB');
});

test('wrap goes round both ways', () => {
  assert.equal(wrap(2, 1, 3), 0);
  assert.equal(wrap(0, -1, 3), 2);
});

test('channel up and down stay in the country, wrap round and skip channels that don’t work', () => {
  const z = make();
  assert.equal(z.channel(uk[0], 1), uk[1]);
  assert.equal(z.channel(uk[2], 1), uk[0], 'ITV +1 skips the dead one and wraps to BBC One');
  assert.equal(z.channel(uk[0], -1), uk[2], 'BBC One -1 wraps to ITV');
  assert.equal(z.channel(fr[0], 1), null, 'a country with one channel has nowhere to go');
});

test('the channel you are on stays in the list even if it is flagged as not working', () => {
  const z = make();
  assert.deepEqual(names(z.list(uk[3])), ['BBC One', 'BBC Two', 'ITV', 'Dead']);
  assert.deepEqual(names(z.list(uk[0])), ['BBC One', 'BBC Two', 'ITV']);
  assert.equal(z.number(uk[2]), 3);
});

test('country left and right land on the channel last watched there', () => {
  const z = make();
  z.remember(au[1]);            // watched Seven
  z.remember(uk[0]);            // then went to the UK
  assert.equal(z.country(uk[0], 1), other[0], 'after GB comes International / Other');
  assert.equal(z.country(other[0], 1), au[1], 'wraps round to Australia, on Seven rather than ABC');
  assert.equal(z.country(uk[0], -1), fr[0]);
  assert.equal(z.country(au[1], -1), other[0], 'and backwards round the other way');
});

test('countries with nothing playable are skipped', () => {
  const bad = [ch('X', 'de', { bad: true })];
  const z = createZapper({ groups: () => groupChannels([...uk, ...bad, ...au]), usable: c => !c.bad });
  assert.equal(z.country(uk[0], 1), au[0]);
  assert.deepEqual(z.countries().map(g => g.cc), ['au', 'gb']);
  assert.equal(createZapper({ groups: () => groupChannels(au), usable: () => true }).country(au[0], 1), null, 'only one country');
});

test('a country picked from the list opens its last or first channel', () => {
  const z = make();
  assert.equal(z.inCountry('au', uk[0]), au[0]);
  z.remember(au[1]); z.remember(uk[0]);
  assert.equal(z.inCountry('au', uk[0]), au[1]);
  assert.equal(z.inCountry('zz', uk[0]), null);
});

test('typing a number goes to that channel in the country', () => {
  const z = make();
  assert.equal(z.byNumber(uk[0], 3), uk[2]);
  assert.equal(z.byNumber(uk[0], 4), null, 'no 4th working channel');
  assert.equal(z.byNumber(uk[0], 0), null);
  assert.equal(z.byNumber(uk[0], 1.5), null);
});

test('last channel flips between the two most recent', () => {
  const z = make();
  assert.equal(z.last(), null);
  z.remember(uk[0]); assert.equal(z.last(), null);
  z.remember(uk[1]); assert.equal(z.last(), uk[0]);
  z.remember(uk[1]); assert.equal(z.last(), uk[0], 're-selecting the same channel changes nothing');
  z.remember(uk[0]); assert.equal(z.last(), uk[1]);
});

test('digits are collected, then handed over when typing pauses', () => {
  let timer = null; const shown = []; let done = null;
  const timers = { set: fn => { timer = fn; return 1; }, clear: () => { timer = null; } };
  const d = createDigits(t => shown.push(t), n => { done = n; }, 1400, timers);
  d.press('1'); d.press('2'); d.press('x');
  assert.deepEqual(shown, ['1', '12']);
  assert.equal(done, null);
  timer();
  assert.equal(done, 12);
  d.press('7'); d.commit();
  assert.equal(done, 7, 'Enter hands it over at once');
  d.press('0'); d.commit();
  assert.equal(done, 7, '0 alone is not a channel');
  d.press('5'); d.cancel(); assert.equal(d.text, '');
  for (const k of '12345') d.press(k);
  assert.equal(d.text, '5', 'a fifth digit starts a new number');
});
