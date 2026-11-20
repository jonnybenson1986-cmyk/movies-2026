import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../public/js/xmltv-worker.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8');
function worker(fetchImpl) {
  const posted = [];
  const ctx = { self: { postMessage: m => posted.push(m) }, fetch: fetchImpl, Response, String, Date, RegExp, Error, parseInt };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  return { ctx, posted, send: d => ctx.self.onmessage({ data: d }) };
}
const NOW = Date.UTC(2026, 10, 20, 10, 0), H = 3600e3;
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<tv generator-info-name="test">
  <channel id="seven.syd"><display-name>Seven</display-name><display-name lang="en">7 Sydney</display-name></channel>
  <channel id='abc'><display-name>ABC &amp; Friends</display-name></channel>
  <programme start="20261120080000 +0000" stop="20261120090000 +0000" channel="seven.syd"><title>Over</title></programme>
  <programme start="20261120203000 +1100" stop="20261120213000 +1100" channel="seven.syd"><title lang="en">The Chase &#8211; Live</title><desc><![CDATA[Fish & chips <b>tonight</b>]]></desc></programme>
  <programme start="20261123000000 +0000" stop="20261123010000 +0000" channel="abc"><title>Too far ahead</title></programme>
  <programme start="20261120100000 +0000" stop="20261120110000 +0000" channel="abc"><title>Q&amp;A</title><desc>  Talk.  </desc></programme>
</tv>`;
const reply = async w => { for (let i = 0; i < 20 && !w.posted.length; i++) await new Promise(r => setTimeout(r, 5)); return w.posted[0]; };

test('the guide worker reads XMLTV off the page: names, times with offsets, entities, CDATA, only the next 36 hours', async () => {
  const w = worker(async () => new Response(XML));
  w.send({ url: 'https://guide.test/epg.xml', now: NOW, horizon: NOW + 36 * H });
  const out = await reply(w);
  assert.deepEqual(JSON.parse(JSON.stringify(out.channels)), [['seven.syd', ['Seven', '7 Sydney']], ['abc', ['ABC & Friends']]]);
  assert.deepEqual(JSON.parse(JSON.stringify(out.programmes)), {
    'seven.syd': [[Date.UTC(2026, 10, 20, 9, 30), Date.UTC(2026, 10, 20, 10, 30), 'The Chase – Live', 'Fish & chips <b>tonight</b>']],
    abc: [[NOW, NOW + H, 'Q&A', 'Talk.']],
  });
});

test('a guide that is missing or not XMLTV is reported as final, so the page does not download it again', async () => {
  let w = worker(async () => new Response('nope', { status: 404 }));
  w.send({ url: 'https://guide.test/x.xml', now: NOW, horizon: NOW + H });
  assert.deepEqual({ ...(await reply(w)) }, { error: 'HTTP 404', final: true });
  w = worker(async () => new Response('<html>hello</html>'));
  w.send({ url: 'https://guide.test/x.xml', now: NOW, horizon: NOW + H });
  assert.deepEqual({ ...(await reply(w)) }, { error: 'not valid XMLTV', final: true });
  w = worker(async () => { throw new TypeError('Failed to fetch'); });
  w.send({ url: 'https://guide.test/x.xml', now: NOW, horizon: NOW + H });
  assert.equal((await reply(w)).final, false, 'a network problem may still work from the page');
});

test('the page hands guides to the worker and reads them itself only when a worker cannot', () => {
  assert.match(app, /new Worker\('\/js\/xmltv-worker\.js'\)/);
  assert.match(app, /catch \(e\) \{ if \(e\.final\) throw e;/);
  assert.match(app, /ingestGuide\(data \|\| xmltvData\(await fetchGuideText\(url\), now, horizon\), au\)/);
  assert.doesNotMatch(src, /=>|\bconst\b|\blet\b|`/, 'ES5 only, for older TVs');
});

test('live channels play steady rather than low-latency', () => {
  assert.match(app, /lowLatencyMode: false, backBufferLength: window\.StreamBoxTV\?\.on \? 10 : 30/);
  assert.doesNotMatch(app, /lowLatencyMode: true/);
});
