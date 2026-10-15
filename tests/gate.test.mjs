import test from 'node:test';
import assert from 'node:assert/strict';

const gateUrl = new URL('../netlify/edge-functions/gate.js', import.meta.url);
const { default: gate, config } = await import(gateUrl);

const origin = 'https://streambox.example';
const passed = () => new Response('app', { status: 200 });
const context = { next: async () => passed() };
const html = { accept: 'text/html' };
const get = (path, headers = {}) => gate(new Request(origin + path, { headers }), context);
const post = (fields, headers = {}) => {
  const body = new URLSearchParams(fields);
  return gate(new Request(origin + '/__gate', { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers } }), context);
};
const withEnv = async (value, fn) => {
  globalThis.Netlify = { env: { get: key => (key === 'PASSCODE' ? value : undefined) } };
  try { await fn(); } finally { delete globalThis.Netlify; }
};

test('a visitor without the passcode gets the lock screen, not the app', async () => {
  const res = await get('/', html);
  assert.equal(res.status, 401);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const page = await res.text();
  assert.match(page, /Enter the passcode/);
  assert.doesNotMatch(page, /3280/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('app files and data are refused too, not just the page', async () => {
  for (const path of ['/js/app.js', '/data/channels.json', '/downloads/streambox-playback-protection.zip', '/sw.js']) {
    const res = await get(path, { accept: '*/*' });
    assert.equal(res.status, 401, path);
    assert.equal(await res.text(), 'Passcode required');
  }
});

test('the manifest and icons stay reachable so the lock screen can be installed', async () => {
  for (const path of ['/manifest.webmanifest', '/icons/icon-192.png']) assert.equal((await get(path)).status, 200, path);
  assert.deepEqual(config.excludedPath, ['/manifest.webmanifest', '/icons/*']);
});

test('the right passcode sets a cookie and returns to the page that was asked for', async () => {
  const res = await post({ code: '3280', next: '/countries' });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/countries');
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /^sb_gate=3280;/);
  for (const part of ['HttpOnly', 'SameSite=Lax', 'Secure', 'Max-Age=2592000', 'Path=/']) assert.ok(cookie.includes(part), part);
});

test('the cookie lets requests through', async () => {
  const res = await get('/js/app.js', { cookie: 'theme=dark; sb_gate=3280' });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'app');
});

test('wrong passcodes are rejected, with a delay, and set no cookie', async () => {
  const started = Date.now();
  const res = await post({ code: '0000', next: '/' });
  assert.ok(Date.now() - started >= 700, 'failed attempts are slowed down');
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('set-cookie'), null);
  assert.match(await res.text(), /Wrong passcode/);
});

test('a wrong, empty, odd or oversized cookie does not unlock', async () => {
  for (const cookie of ['sb_gate=0000', 'sb_gate=', 'sb_gate=%E0%A4%A', `sb_gate=${'9'.repeat(200)}`, 'sb_gate=3280x', 'other=3280']) {
    assert.equal((await get('/', { ...html, cookie })).status, 401, cookie);
  }
});

test('the redirect target can only be a path on this site', async () => {
  for (const next of ['//evil.example', 'https://evil.example', '/\\evil.example', 'javascript:alert(1)', '', undefined]) {
    const res = await post({ code: '3280', ...(next === undefined ? {} : { next }) });
    assert.equal(res.headers.get('location'), '/', String(next));
  }
});

test('the lock screen escapes the page it will return to', async () => {
  const res = await get('/"><script>alert(1)</script>', html);
  const page = await res.text();
  assert.doesNotMatch(page, /<script>alert/);
});

test('only GET navigations get the lock page; other requests get a plain 401', async () => {
  const res = await gate(new Request(origin + '/data/channels.json', { method: 'POST' }), context);
  assert.equal(res.status, 401);
  assert.equal(await res.text(), 'Passcode required');
});

test('a PASSCODE environment variable replaces the built-in passcode', async () => {
  await withEnv('correct horse battery', async () => {
    assert.equal((await post({ code: '3280' })).status, 401, 'the default no longer works');
    const ok = await post({ code: 'correct horse battery', next: '/live' });
    assert.equal(ok.status, 303);
    assert.equal((await get('/', { ...html, cookie: 'sb_gate=3280' })).status, 401, 'old cookies stop working');
    assert.equal((await get('/', { ...html, cookie: 'sb_gate=correct%20horse%20battery' })).status, 200);
  });
});

test('changing the passcode signs out everyone who had the old one', async () => {
  const cookie = 'sb_gate=3280';
  assert.equal((await get('/', { ...html, cookie })).status, 200);
  await withEnv('newcode9', async () => assert.equal((await get('/', { ...html, cookie })).status, 401));
});

test('cookies are only marked Secure on https', async () => {
  const res = await gate(new Request('http://localhost:8888/__gate', { method: 'POST', body: new URLSearchParams({ code: '3280' }), headers: { 'content-type': 'application/x-www-form-urlencoded' } }), context);
  assert.doesNotMatch(res.headers.get('set-cookie'), /Secure/);
});
