import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const script = readFileSync(new URL('../public/js/movy-browser.js', import.meta.url), 'utf8');
function harness() {
  const win = new EventTarget();
  const doc = new EventTarget();
  doc.getElementById = () => null;
  vm.runInNewContext(script, { window: win, document: doc, navigator: { userAgent: 'test' },
    crypto: webcrypto, URL, console: { warn() {} } });
  return win.StreamBoxMovyBrowser;
}

test('the browser box only opens Movy and its playback providers over https', () => {
  const box = harness();
  assert.equal(box.allowedUrl('https://www.vidy.st/movie/278?color=E50914&autoplay=true#x'), 'https://www.vidy.st/movie/278?color=E50914&autoplay=true');
  assert.equal(box.allowedUrl('https://www.movy.sx/movie/278'), 'https://www.movy.sx/movie/278');
  assert.equal(box.allowedUrl('https://player.videasy.net/movie/278'), 'https://player.videasy.net/movie/278');
  assert.equal(box.allowedUrl('https://moviesapi.to/movie/278'), 'https://moviesapi.to/movie/278');
  assert.equal(box.allowedUrl('https://a.b.vidnest.fun/x'), 'https://a.b.vidnest.fun/x');
  assert.equal(box.allowedUrl(box.HOME), box.HOME);
});

test('the browser box rejects non-provider, insecure and spoofed addresses', () => {
  const box = harness();
  assert.equal(box.allowedUrl('https://example.com/movie/1'), null);
  assert.equal(box.allowedUrl('http://www.vidy.st/movie/1'), null);
  assert.equal(box.allowedUrl('ftp://www.vidy.st/movie/1'), null);
  assert.equal(box.allowedUrl('javascript:alert(1)'), null);
  assert.equal(box.allowedUrl('data:text/html,hi'), null);
  assert.equal(box.allowedUrl('https://movy.sx.evil.example/movie/1'), null);
  assert.equal(box.allowedUrl('https://vidy.st.evil.example/movie/1'), null);
  assert.equal(box.allowedUrl('not a url'), null);
  assert.equal(box.allowedUrl(''), null);
  assert.equal(box.allowedUrl(null), null);
});

test('host matching follows the helper’s host permissions exactly', () => {
  const box = harness();
  assert.equal(box.hostAllowed('movy.sx'), true);
  assert.equal(box.hostAllowed('WWW.MOVY.SX'), true);
  assert.equal(box.hostAllowed('embed.vidy.st'), true);
  assert.equal(box.hostAllowed('notmovy.sx'), false);
  assert.equal(box.hostAllowed('movy.sx.evil.example'), false);
  assert.equal(box.hostAllowed(''), false);
  assert.equal(box.hostAllowed(null), false);
});

test('server search derives same-title player servers from a Movy title page', () => {
  const box = harness();
  const servers = box.serverUrls('https://www.movy.sx/movie/278');
  assert.equal(servers.length, 5);
  assert.deepEqual([...servers.map(s => String(s.name))], ['Vidy', 'VidLink', 'Vidnest', 'Videasy', 'MoviesAPI']);
  assert.ok(servers.every(s => box.allowedUrl(s.url)));
  const tv = box.serverUrls('https://www.movy.sx/tv/1399/2/3');
  assert.ok(tv[0].url.includes('/tv/1399/2/3'));
  // A provider URL that is itself the first candidate is not retried.
  const self = box.serverUrls('https://www.vidy.st/movie/278?autoplay=true');
  assert.ok(!self.some(s => s.url.startsWith('https://www.vidy.st/movie/278')));
  assert.deepEqual([...box.serverUrls('https://www.movy.sx/')], []);
});

test('the browser box provides a fullscreen toggle', () => {
  const box = harness();
  assert.equal(typeof box.toggleFullscreen, 'function');
  assert.match(readFileSync(new URL('../public/js/movy-browser.js', import.meta.url), 'utf8'), /data-mb="fullscreen"/);
  assert.match(readFileSync(new URL('../public/js/movy-browser.js', import.meta.url), 'utf8'), /data-mb="find"/);
});
