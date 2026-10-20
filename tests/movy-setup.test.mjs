import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const script = readFileSync(new URL('../public/js/movy-setup.js', import.meta.url), 'utf8');
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const EDGE = CHROME.replace('Chrome/126.0.0.0 Safari/537.36', 'Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0');
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

function element(tag = 'div') {
  const node = {
    tagName: tag, style: {}, hidden: false, dataset: {}, children: [], classes: new Set(),
    classList: {
      add: c => node.classes.add(c),
      remove: c => node.classes.delete(c),
      contains: c => node.classes.has(c),
    },
    addEventListener() {}, removeEventListener() {},
    appendChild(child) { node.children.push(child); return child; },
    remove() {}, focus() {}, select() {}, blur() {},
  };
  let html = '';
  Object.defineProperty(node, 'innerHTML', { get: () => html, set(v) { html = v; } });
  let text = '';
  Object.defineProperty(node, 'textContent', { get: () => text, set(v) { text = v; } });
  return node;
}
function harness(ua) {
  const win = new EventTarget();
  const nodes = new Map(['msStatus', 'msEnv', 'msExtUrl', 'msAuto', 'msWait', 'msStep1', 'msStep2', 'msStep3', 'msStep4']
    .map(id => [id, element()]));
  const doc = {
    createElement: tag => element(tag),
    body: element('body'),
    getElementById: id => nodes.get(id) || null,
    querySelector: () => null,
    addEventListener() {},
  };
  vm.runInNewContext(script, { window: win, document: doc, navigator: { userAgent: ua }, crypto: webcrypto, console: { warn() {} }, setTimeout, clearTimeout });
  return { win, doc, nodes, setup: win.StreamBoxMovySetup };
}

test('browser detection points Chrome/Edge at their own extensions page and excludes mobile', () => {
  const { setup } = harness(CHROME);
  const chrome = setup.detectBrowser(CHROME);
  assert.equal(chrome.name, 'Chrome');
  assert.equal(chrome.supported, true);
  assert.equal(chrome.extensionsUrl, 'chrome://extensions');
  const edge = setup.detectBrowser(EDGE);
  assert.equal(edge.name, 'Edge');
  assert.equal(edge.extensionsUrl, 'edge://extensions');
  const android = setup.detectBrowser(ANDROID);
  assert.equal(android.name, 'Chrome');
  assert.equal(android.mobile, true);
  assert.equal(android.supported, false);
  const safari = setup.detectBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15');
  assert.equal(safari.name, 'Safari');
  assert.equal(safari.supported, false);
});

test('detection activates the wizard and auto-plays the picked title once', async () => {
  const { doc, nodes, setup } = harness(CHROME);
  let checks = 0;
  const played = [];
  setup.configure({
    movy: { checkProtection: async () => { checks++; return true; } },
    play: record => played.push(record),
  });
  setup.open({ record: { type: 'movie', catalog: 'movy', mediaType: 'movie', id: 278, name: 'Test film' }, season: 1, episode: 2 });
  const overlay = doc.body.children[0];
  assert.equal(overlay.hidden, false);
  for (let waited = 0; played.length === 0 && waited < 3000; waited += 50) await new Promise(r => setTimeout(r, 50));
  assert.equal(checks, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(played[0])), { type: 'movie', catalog: 'movy', mediaType: 'movie', id: 278, name: 'Test film', season: 1, episode: 2 });
  for (const id of ['msStep1', 'msStep2', 'msStep3', 'msStep4']) assert.equal(nodes.get(id)?.classes.has('done'), true, id);
  assert.match(nodes.get('msStatus')?.textContent, /protection active/i);
  assert.equal(nodes.get('msWait')?.hidden, true);
  await new Promise(r => setTimeout(r, 1100));
  assert.equal(overlay.hidden, true);
  await new Promise(r => setTimeout(r, 50));
  assert.equal(played.length, 1);
});

test('closing the wizard stops the detection loop and clears the pending auto-play', async () => {
  const { doc, setup } = harness(CHROME);
  let checks = 0;
  const played = [];
  setup.configure({
    movy: { checkProtection: async () => { checks++; return false; } },
    play: record => played.push(record),
  });
  setup.open({ record: { type: 'movie', catalog: 'movy', mediaType: 'movie', id: 550, name: 'Pending' }, season: 1, episode: 1 });
  await new Promise(r => setTimeout(r, 100));
  setup.close();
  const after = checks;
  await new Promise(r => setTimeout(r, 2600));
  assert.equal(checks, after);
  assert.deepEqual(played, []);
  assert.equal(doc.body.children[0].hidden, true);
});
