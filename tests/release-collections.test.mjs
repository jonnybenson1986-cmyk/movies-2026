import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const code = readFileSync(new URL('../public/js/release-collections.js', import.meta.url), 'utf8');

test('release collection module parses and declares all three requested sections', () => {
  assert.doesNotThrow(() => new vm.Script(code));
  for (const title of [
    'New Movies – November 2026',
    'New Series & Seasons – November 2026',
    'Coming Soon – December 2026',
  ]) assert.ok(code.includes(title), title);
});

test('release collections query TMDB movies and TV across November and December 2026', () => {
  assert.match(code, /discover\('movie', 'movie', '2026-11-01', '2026-11-30'/);
  assert.match(code, /discover\('tv', 'tv', '2026-11-01', '2026-11-30'/);
  assert.match(code, /discover\('movie', 'movie', '2026-12-01', '2026-12-31'/);
  assert.match(code, /discover\('tv', 'tv', '2026-12-01', '2026-12-31'/);
  assert.match(code, /#movy\/detail\//);
});
