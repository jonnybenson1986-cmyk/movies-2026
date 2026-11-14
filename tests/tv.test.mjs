import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
const { expandInset, findInsets, buildLegacyCss } = await import(new URL('../scripts/build-legacy-css.mjs', import.meta.url));
const css = new URL('../public/css/', import.meta.url);

test('inset shorthand becomes the four long-hand sides, the CSS way', () => {
  assert.deepEqual(expandInset('0'), { top: '0', right: '0', bottom: '0', left: '0' });
  assert.deepEqual(expandInset('auto 0'), { top: 'auto', right: '0', bottom: 'auto', left: '0' });
  assert.deepEqual(expandInset('1px 2px 3px'), { top: '1px', right: '2px', bottom: '3px', left: '2px' });
  assert.deepEqual(expandInset('calc(10px + var(--a, 0px)) 0 auto max(1px, 2px)'), { top: 'calc(10px + var(--a, 0px))', right: '0', bottom: 'auto', left: 'max(1px, 2px)' }, 'spaces inside calc() don’t split');
});

test('rules inside @media keep their @media, comments and keyframes are left alone', () => {
  const found = findInsets('/* .x { inset: 9px } */ .a { inset: 0; } @media (max-width: 600px) { .b, .c { color: red; inset: auto 1px 2px 3px !important } } @keyframes k { from { inset: 0 } } .d { top: 0 }');
  assert.deepEqual(found.map(f => [f.at.join(), f.selector, f.inset, f.important]), [['', '.a', '0', false], ['@media (max-width: 600px)', '.b, .c', 'auto 1px 2px 3px', true], ['@keyframes k', 'from', '0', false]]);
  const out = buildLegacyCss([['x.css', '.a { inset: 0 } @keyframes k { from { inset: 0 } }']]);
  assert.match(out, /@supports not \(inset: 0\)/); assert.match(out, /\.a \{ top: 0; right: 0; bottom: 0; left: 0; \}/); assert.doesNotMatch(out, /from \{/);
});

test('public/css/legacy.css is up to date with the stylesheets (run scripts/build-legacy-css.mjs)', () => {
  const files = readdirSync(css).filter(f => f.endsWith('.css') && f !== 'legacy.css').sort().map(f => [f, readFileSync(new URL(f, css), 'utf8')]);
  assert.equal(readFileSync(new URL('legacy.css', css), 'utf8'), buildLegacyCss(files));
});

test('tv.js only uses syntax an old TV engine can read (no ?. ?? => let const class or template strings)', () => {
  const code = readFileSync(new URL('../public/js/tv.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/\/(?:[^/\\\n]|\\.)+\/[gimsuy]*/g, '/r/');
  for (const [name, re] of [['?.', /\?\./], ['??', /\?\?/], ['arrow function', /=>/], ['let/const', /\b(let|const)\s/], ['class', /\bclass\s+\w/], ['template string', /`/], ['spread', /\.\.\.\w/]]) assert.doesNotMatch(code, re, name);
});

test('TV browsers are recognised from their user agent, and phones and computers are not', () => {
  const ua = readFileSync(new URL('../public/js/tv.js', import.meta.url), 'utf8').match(/var TV_UA = (\/.*\/i);/)[1];
  const re = vm.runInNewContext(ua);
  for (const tv of ['Mozilla/5.0 (Linux; Android 12; BRAVIA 4K VH2 Build/STT1.211025.001; wv) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 11; AFTKA Build/RS8143) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 10; Android TV; Chromecast) AppleWebKit/537.36 Chrome/96 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 9; SHIELD Android TV Build/PPR1.180610.011) AppleWebKit/537.36 Chrome/112 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 9; MIBOX4 Build/PI) AppleWebKit/537.36 Chrome/79 Safari/537.36',
    'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 SamsungBrowser/4.0 TV Safari/537.36',
    'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 Chrome/87 Safari/537.36 WebAppManager']) assert.ok(re.test(tv), tv);
  for (const other of ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/126 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15']) assert.ok(!re.test(other), other);
});
