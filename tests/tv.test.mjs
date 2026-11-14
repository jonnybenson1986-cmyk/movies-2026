import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const { expandInset, simplify, measure, addFallbacks, addFallbacksToAll, MARK } = await import(new URL('../scripts/build-legacy-css.mjs', import.meta.url));
const legacyJs = await import(new URL('../scripts/build-legacy-js.mjs', import.meta.url));
const css = new URL('../public/css/', import.meta.url);
const js = new URL('../public/js/', import.meta.url);
const stylesheets = () => readdirSync(css).filter(f => f.endsWith('.css')).sort().map(f => [f, readFileSync(new URL(f, css), 'utf8')]);
// A JavaScript parser that checks syntax against a given ECMAScript year (installed with the dev tools; optional)
const acorn = (() => { for (const where of ['acorn', '/opt/node-tools/node_modules/acorn']) { try { return createRequire(import.meta.url)(where); } catch { /* next */ } } return null; })();

test('inset shorthand becomes the four long-hand sides, the CSS way', () => {
  assert.deepEqual(expandInset('0'), { top: '0', right: '0', bottom: '0', left: '0' });
  assert.deepEqual(expandInset('auto 0'), { top: 'auto', right: '0', bottom: 'auto', left: '0' });
  assert.deepEqual(expandInset('1px 2px 3px'), { top: '1px', right: '2px', bottom: '3px', left: '2px' });
  assert.deepEqual(expandInset('calc(10px + var(--a, 0px)) 0 auto max(1px, 2px)'), { top: 'calc(10px + var(--a, 0px))', right: '0', bottom: 'auto', left: 'max(1px, 2px)' }, 'spaces inside calc() don’t split');
});

test('clamp() min() max() env() and new viewport units become one value an old engine understands', () => {
  assert.equal(measure('2rem + 10px'), 42); assert.equal(measure('calc(50vw - 40px)'), 600); assert.equal(measure('100%'), null); assert.equal(measure('var(--x)'), null);
  assert.equal(simplify('clamp(28px, 3vw, 40px)'), '3vw');                 // 38.4px on a 1280-wide TV: inside the limits
  assert.equal(simplify('clamp(34px, 1vw, 64px)'), '34px');
  assert.equal(simplify('min(100%, 52dvh)'), '52vh');                       // the fixed limit wins over an unknown %
  assert.equal(simplify('min(86vw, 300px)'), '300px');
  assert.equal(simplify('max(var(--gutter), env(safe-area-inset-left))'), 'var(--gutter)');
  assert.equal(simplify('calc(10px + env(safe-area-inset-top, 4px))'), 'calc(10px + 4px)');
  assert.equal(simplify('repeat(auto-fill, minmax(min(44%, 170px), 1fr))'), 'repeat(auto-fill, minmax(170px, 1fr))', 'minmax() is not max()');
  assert.equal(simplify('clamp(16px, 1rem + 1vw, 30px)'), 'calc(1rem + 1vw)');
  assert.equal(simplify('100dvh'), '100vh');
});

test('fallbacks go right in front of the modern declaration, so modern browsers still use the modern one', () => {
  const out = addFallbacks('.a { width: clamp(10px, 2vw, 40px); inset: 0 !important; color: red } @keyframes k { from { inset: 0 } } .b { place-items: center end }');
  assert.ok(out.startsWith(MARK));
  assert.match(out, /\.a \{ width: 2vw; width: clamp\(10px, 2vw, 40px\); top: 0 !important; right: 0 !important; bottom: 0 !important; left: 0 !important; inset: 0 !important; color: red \}/);
  assert.match(out, /from \{ inset: 0 \}/, 'keyframes are left alone');
  assert.match(out, /\.b \{ align-items: center; justify-items: end; place-items: center end \}/);
  assert.equal(addFallbacks(out), out, 'running it twice changes nothing');
});

test('a selector list with :focus-visible is repeated for old engines (which drop the whole rule) with keyboard focus instead', () => {
  const out = addFallbacks('.c:hover, .c:focus-visible { color: red } html.tv .d:focus-visible { color: blue } .e:has(> input) { display: flex }');
  assert.match(out, /@supports not \(aspect-ratio: 1 \/ 1\) \{ \.c:hover, html\.kbd \.c:focus \{ color: red \} \}/);
  assert.match(out, /@supports not \(aspect-ratio: 1 \/ 1\) \{ html\.kbd\.tv \.d:focus \{ color: blue \} \}/);
  assert.doesNotMatch(out, /\{ \.e/, ':has() rules are left to the class stand-ins in tv.css');
});

test('flex gaps become margins and grids become flex layouts in engines without them', () => {
  const out = addFallbacks('.row { display: flex; gap: 8px } .wrap { display: flex; flex-wrap: wrap; gap: 4px 6px } .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px } .pair { display: grid; grid-template-columns: 170px minmax(0, 1fr); gap: 12px }');
  assert.match(out, /html\.no-flex-gap \.row > \*:not\(:last-child\) \{ margin-right: 8px \}/);
  assert.match(out, /html\.no-flex-gap \.wrap > \* \{ margin-right: 6px; margin-bottom: 4px \}/);
  assert.match(out, /\.grid \{ display: flex; display: grid; .*grid-gap: 10px; gap: 10px \}/);
  assert.match(out, /@supports not \(display: grid\) \{ \.grid \{ flex-direction: row; flex-wrap: wrap \} \.grid > \* \{ flex: 1 1 150px; margin: 0 10px 10px 0 \} \}/);
  assert.match(out, /\.pair > :nth-child\(1\) \{ flex: 0 0 170px; margin-right: 12px \} \.pair > :nth-child\(2\) \{ flex: 1 1 0; min-width: 0; min-height: 0 \}/);
});

test('every stylesheet converts cleanly: balanced braces, nothing modern left without a fallback in front', () => {
  for (const [name, out] of addFallbacksToAll(stylesheets())) {
    const bare = out.replace(/\/\*[\s\S]*?\*\//g, '');
    let depth = 0; for (const ch of bare) { depth += ch === '{' ? 1 : ch === '}' ? -1 : 0; assert.ok(depth >= 0, name); }
    assert.equal(depth, 0, name);
    // each `prop: clamp(...)` is preceded in the same rule by a plain `prop:` fallback
    for (const m of bare.matchAll(/([\w-]+): ([^;{}]*\b(?:clamp|min|max)\([^;{}]*)/g)) {
      if (/minmax\(/.test(m[2]) && !/(^|[^\w-])(clamp|min|max)\(/.test(m[2])) continue;
      const before = bare.slice(Math.max(0, m.index - 400), m.index);
      assert.ok(new RegExp(`${m[1]}: [^;{}]*;\\s*$`).test(before), `${name}: no fallback before ${m[0].slice(0, 80)}`);
    }
  }
});

test('every app script has a converted copy in js/legacy, made from the current version (run scripts/build-legacy-js.mjs)', () => {
  const names = legacyJs.sources();
  const legacy = readdirSync(new URL('legacy/', js)).filter(f => f.endsWith('.js')).sort();
  assert.deepEqual(legacy, names, 'one copy per script, nothing left over');
  for (const f of names) {
    const copy = readFileSync(new URL(`legacy/${f}`, js), 'utf8');
    assert.equal(legacyJs.hashOf(copy), legacyJs.hash(readFileSync(new URL(f, js), 'utf8')), `js/legacy/${f} is out of date`);
  }
});

test('the converted copies only use JavaScript an ES2015 engine can read (Chromium 51+)', { skip: !acorn && 'acorn not installed' }, () => {
  for (const f of legacyJs.sources()) {
    const code = readFileSync(new URL(`legacy/${f}`, js), 'utf8');
    assert.doesNotThrow(() => acorn.parse(code, { ecmaVersion: 2015, sourceType: 'script' }), f);
  }
});

test('index.html loads every app script, in both versions, through the one list', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const list = html.match(/var files = \[([^\]]+)\]/)[1].match(/'([\w-]+)'/g).map(s => s.slice(1, -1) + '.js');
  assert.deepEqual([...list].sort(), legacyJs.sources());
  assert.ok(list.indexOf('app.js') > list.indexOf('music.js') && list.at(-1) === 'touch.js', 'order kept: app.js after the modules it uses');
  assert.doesNotMatch(html, /<script src="\/js\/(?!tv\.js)/, 'no app script is loaded outside the list (old engines would run it twice or fail on it)');
});

test('the early check sorts browsers into modern / converted copies / too old', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const check = html.match(/<script>\s*(\/\/ Which version[\s\S]*?)<\/script>/)[1];
  const run = () => { const root = { className: '' }; vm.runInNewContext(check, { document: { documentElement: root }, window: { Promise, fetch() {}, Symbol }, Function }); return root.className.trim(); };
  assert.equal(run(), '', 'this engine is modern: nothing marked');
  const legacy = { className: '' };
  // An engine that can't parse ?. / ?? but has ES2015
  const OldFunction = function (src) { if (/\?\.|\?\?/.test(src)) throw new SyntaxError('old'); return Function(src); };
  vm.runInNewContext(check, { document: { documentElement: legacy }, window: { Promise, fetch() {}, Symbol }, Function: OldFunction });
  assert.equal(legacy.className.trim(), 'legacy-js');
  const ancient = { className: '' };
  vm.runInNewContext(check, { document: { documentElement: ancient }, window: {}, Function() { throw new SyntaxError('ES5 only'); } });
  assert.equal(ancient.className.trim(), 'too-old');
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
