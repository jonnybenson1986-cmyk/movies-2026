// Things that made the app slow on TV boxes and phones (the Android app especially), so they don't come back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const { versionHtml, fingerprint } = await import(new URL('../scripts/version-assets.mjs', import.meta.url));
const read = path => readFileSync(new URL('../public/' + path, import.meta.url), 'utf8');

test('no video plays behind the home page', () => {
  const app = read('js/app.js');
  assert.doesNotMatch(app, /heroVideo|startHero|heroHls/, 'the home banner is a still picture');
  assert.doesNotMatch(read('index.html'), /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/hls\.js/, 'hls.js loads when needed, not on every launch');
  assert.match(app, /const loadHls = /);
});

test('nothing animates for ever on the cards of a page (hundreds at once kept TVs redrawing non-stop)', () => {
  for (const f of readdirSync(new URL('../public/css/', import.meta.url)).filter(f => f.endsWith('.css'))) {
    const css = read('css/' + f).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{[^}]*animation:[^;}]*\binfinite\b[^}]*\}/g)) {
      const selector = m[1].trim();
      assert.ok(/^(\.hero-tag \.dot|\.spinner|\.watch-hub-tile\.skeleton)$/.test(selector), `${f}: endless animation on "${selector}"`);
    }
  }
});

test('index.html gets fingerprinted script and style addresses at deploy', () => {
  const files = { '/css/app.css': 'a{}', '/js/tv.js': 'tv', '/js/app.js': 'app', '/js/legacy/app.js': 'old app' };
  const html = `<link rel="stylesheet" href="/css/app.css"><script src="/js/tv.js"></script><link href="/css/missing.css">
    <script>var V = {}; var files = ['app'];</script>`;
  const out = versionHtml(html, p => files[p] ?? null);
  assert.match(out, new RegExp(`href="/css/app\\.css\\?v=${fingerprint('a{}')}"`));
  assert.match(out, new RegExp(`src="/js/tv\\.js\\?v=${fingerprint('tv')}"`));
  assert.match(out, /href="\/css\/missing\.css"/, 'a file that is not there is left alone');
  assert.match(out, new RegExp(`var V = \\{"app":"${fingerprint('app', 'old app')}"\\};`), 'the script list covers the modern and the older-TV copy');
  assert.equal(versionHtml(out, p => files[p] ?? null), out, 'running it twice changes nothing');
  // the real page: every stylesheet and the script list get fingerprints
  const real = versionHtml(read('index.html'), p => { try { return read(p.slice(1)); } catch { return null; } });
  assert.equal((real.match(/href="\/css\/[\w-]+\.css\?v=/g) || []).length, (read('index.html').match(/href="\/css\/[\w-]+\.css"/g) || []).length);
  assert.match(real, /var V = \{"zapper":"[0-9a-f]{10}"/);
});

test('the channel and movie lists open from the saved copy; scripts are only re-saved when they change', () => {
  const sw = read('sw.js');
  assert.match(sw, /\\\/data\\\/\[\\w-\]\+\\\.json\$/, 'data files: saved copy first, refreshed in the background');
  assert.match(sw, /tag && tag === oldTag/, 'unchanged files are not written again');
  const toml = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
  assert.match(toml, /for = "\/js\/\*"[\s\S]*?stale-while-revalidate/);
  assert.match(toml, /version-assets\.mjs --write/);
});

test('channel logos are resized by Netlify for exactly the hosts netlify.toml allows', () => {
  const app = read('js/app.js'), toml = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
  const re = new RegExp(app.match(/const RESIZABLE_LOGO = \/(.+)\/;/)[1]);
  const allowed = [...toml.matchAll(/"https:\/\/([^"]+)\/\.\*"/g)].map(m => m[1].replace(/\\\\\./g, '.'));
  assert.ok(allowed.length >= 10);
  for (const host of allowed) assert.ok(re.test(`https://${host}/logo.png`), `${host} is allowed but not resized`);
  for (const host of ['i.imgur.com', 'images.pluto.tv', 'tvpnlogopeu.samsungcloud.tv', 'tvpnlogopus.samsungcloud.tv']) assert.ok(allowed.includes(host), host);
  assert.ok(!re.test('https://evil.example/i.imgur.com/x.png') && !re.test('http://i.imgur.com/x.png'));
  assert.doesNotMatch(app, /<img[^>]*src="\$\{esc\((item|c)\.logo\)\}"/, 'every channel logo goes through logoImg()');
});

test('the offline cache leaves resized logos and account data to the browser', () => {
  assert.match(read('sw.js'), /startsWith\('\/\.netlify\/'\) \|\| url\.pathname\.startsWith\('\/api\/'\)\) return;/);
});

test('the web font never holds up the first screen', () => {
  const html = read('index.html');
  assert.match(html, /fonts\.googleapis\.com\/css2[^"]*" rel="stylesheet" media="print" onload="this\.media='all'"/);
  assert.doesNotMatch(html.replace(/<noscript>[\s\S]*?<\/noscript>/g, ''), /fonts\.googleapis\.com\/css2[^"]*" rel="stylesheet">/);
});

test('every class in the stylesheets is used somewhere in the app', () => {
  const code = readdirSync(new URL('../public/js/', import.meta.url)).filter(f => f.endsWith('.js')).map(f => read('js/' + f)).join('\n')
    + ['index.html', 'spotify-callback.html', 'playback-protection.html'].map(read).join('\n');
  for (const f of readdirSync(new URL('../public/css/', import.meta.url)).filter(f => f.endsWith('.css'))) {
    const css = read('css/' + f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\([^)]*\)/g, '');
    for (const [, cls] of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) {
      if (code.includes(cls) || (/^access-/.test(cls) && code.includes('access-${'))) continue;   // access-* is built from data
      assert.fail(`${f}: .${cls} isn't used anywhere`);
    }
  }
});
