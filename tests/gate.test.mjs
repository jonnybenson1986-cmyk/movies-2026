import test from 'node:test';
import assert from 'node:assert/strict';

const { default: gate, config } = await import(new URL('../netlify/edge-functions/gate.js', import.meta.url));

const origin = 'https://streambox.example';
// Made-up accounts: the real passwords are never stored in the repository (see the optional last test)
const USERS = { eve: 'shared-pass', fay: 'shared-pass', cat: 'cat-pass-2', dan: 'dan-pass-3', gus: 'gus-pass-4', ann: 'gus-pass-4', ben: 'ben-pass-6' };
const BASE_ENV = { env: { get: key => (key === 'USERS' ? JSON.stringify(USERS) : undefined) } };
globalThis.Netlify = BASE_ENV;
const context = { next: async () => new Response('app', { status: 200 }) };
const html = { accept: 'text/html' };
const get = (path, headers = {}) => gate(new Request(origin + path, { headers }), context);
const post = (fields, headers = {}, base = origin) => gate(new Request(base + '/__gate', { method: 'POST', body: new URLSearchParams(fields), headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers } }), context);
const session = (user, password) => `sb_gate=${encodeURIComponent(user + ':' + password)}; sb_gate_on=1`;
const withEnv = async (value, fn) => {
  globalThis.Netlify = { env: { get: key => (key === 'USERS' ? value : undefined) } };
  try { await fn(); } finally { globalThis.Netlify = BASE_ENV; }
};

test('a visitor who is not signed in gets the sign-in screen, not the app', async () => {
  const res = await get('/', html);
  assert.equal(res.status, 401);
  assert.match(res.headers.get('content-type'), /text\/html/);
  const page = await res.text();
  assert.match(page, /Sign in to continue/);
  assert.match(page, /name="user"/);
  assert.match(page, /name="code" type="password"/);
  for (const password of new Set(Object.values(USERS))) assert.doesNotMatch(page, new RegExp(password));
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('app files and data are refused too, not just the page', async () => {
  for (const path of ['/js/app.js', '/data/channels.json', '/api/me', '/downloads/streambox-playback-protection.zip', '/sw.js']) {
    const res = await get(path, { accept: '*/*' });
    assert.equal(res.status, 401, path);
    assert.equal(await res.text(), 'Sign-in required');
  }
});

test('the manifest and icons stay reachable so the sign-in screen can be installed', async () => {
  for (const path of ['/manifest.webmanifest', '/icons/icon-192.png']) assert.equal((await get(path)).status, 200, path);
  assert.deepEqual(config.excludedPath, ['/manifest.webmanifest', '/icons/*']);
});

test('every user can sign in with their own username and password', async () => {
  for (const [user, password] of Object.entries(USERS)) {
    const res = await post({ user, code: password, next: '/countries' });
    assert.equal(res.status, 200, user);
    assert.match(res.headers.getSetCookie()[0], new RegExp(`^sb_gate=${encodeURIComponent(user + ':' + password)};`), user);
  }
});

test('the old shared passcode no longer works on its own', async () => {
  assert.equal((await post({ user: '', code: 'dan-pass-3' })).status, 401);
  assert.equal((await post({ code: 'dan-pass-3' })).status, 401);
  assert.equal((await get('/', { ...html, cookie: 'sb_gate=dan-pass-3; sb_gate_on=1' })).status, 401);
});

test('a wrong password, an unknown user, or someone else’s password is rejected', async () => {
  const started = Date.now();
  const first = await post({ user: 'eve', code: '000000' });
  assert.ok(Date.now() - started >= 700, 'failed attempts are slowed down');
  assert.equal(first.status, 401);
  assert.equal(first.headers.get('set-cookie'), null);
  const page = await first.text();
  assert.match(page, /Wrong username or password/);
  assert.match(page, /value="eve"/, 'the username is kept so only the password needs retyping');
  for (const fields of [{ user: 'xx', code: 'dan-pass-3' }, { user: 'eve', code: 'cat-pass-2' }, { user: 'dan', code: 'shared-pass' }, { user: 'eve', code: '' }, { user: '', code: 'shared-pass' }, { user: 'eve' }]) {
    assert.equal((await post(fields)).status, 401, JSON.stringify(fields));
  }
});

test('usernames are not case sensitive and spaces around them are ignored', async () => {
  const res = await post({ user: '  EVE ', code: 'shared-pass' });
  assert.equal(res.status, 200);
  assert.match(res.headers.getSetCookie()[0], /^sb_gate=eve%3Ashared-pass;/);
});

test('signing in uses session cookies that end when the browser closes', async () => {
  const cookies = (await post({ user: 'cat', code: 'cat-pass-2' })).headers.getSetCookie();
  assert.equal(cookies.length, 2);
  const [gateCookie, marker] = cookies;
  assert.match(marker, /^sb_gate_on=1;/);
  for (const c of cookies) {
    assert.doesNotMatch(c, /Max-Age|Expires/i);
    for (const part of ['SameSite=Lax', 'Secure', 'Path=/']) assert.ok(c.includes(part), part);
  }
  assert.ok(gateCookie.includes('HttpOnly'), 'the credentials are hidden from page scripts');
  assert.ok(!marker.includes('HttpOnly'), 'the page must be able to see the marker');
});

test('signing in marks this tab as unlocked, then continues to the page that was asked for', async () => {
  const page = await (await post({ user: 'dan', code: 'dan-pass-3', next: '/countries' })).text();
  assert.match(page, /sessionStorage\.setItem\('sb_unlocked','1'\)/);
  assert.match(page, /location\.replace\("\/countries"\)/);
});

test('both cookies let requests through, for the right user only', async () => {
  for (const [user, password] of Object.entries(USERS)) assert.equal((await get('/js/app.js', { cookie: session(user, password) })).status, 200, user);
  assert.equal((await get('/js/app.js', { cookie: session('eve', 'cat-pass-2') })).status, 401);
  assert.equal((await get('/', { ...html, cookie: 'sb_gate=eve%3Ashared-pass' })).status, 401, 'the marker cookie is needed too');
  assert.equal((await get('/', { ...html, cookie: 'sb_gate_on=1' })).status, 401);
});

test('a wrong, empty, odd or oversized cookie does not let anyone in', async () => {
  for (const cookie of ['sb_gate=; sb_gate_on=1', 'sb_gate=%E0%A4%A; sb_gate_on=1', `sb_gate=${'9'.repeat(200)}; sb_gate_on=1`, 'sb_gate=eve; sb_gate_on=1', 'sb_gate=eve%3A; sb_gate_on=1', 'sb_gate=%3Ashared-pass; sb_gate_on=1', 'other=1; sb_gate_on=1', `${session('eve', 'shared-pass')}; sb_gate_on=0`.replace('sb_gate_on=1; ', '')]) {
    assert.equal((await get('/', { ...html, cookie })).status, 401, cookie);
  }
});

test('the app can send a freshly opened tab to the sign-in screen without signing anyone out', async () => {
  const res = await get('/__gate/lock?next=/live', { ...html, cookie: session('eve', 'shared-pass') });
  assert.equal(res.status, 401);
  assert.match(await res.text(), /name="next" value="\/live"/);
  assert.equal(res.headers.get('set-cookie'), null);
  assert.match(await (await get('/__gate/lock?next=//evil.example', html)).text(), /name="next" value="\/"/);
});

test('signing out clears the session and this device’s saved lists', async () => {
  const res = await get('/__gate/logout', { cookie: session('eve', 'shared-pass') });
  assert.equal(res.status, 200);
  const cookies = res.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  for (const c of cookies) assert.match(c, /Max-Age=0/);
  const page = await res.text();
  assert.match(page, /sessionStorage\.removeItem\('sb_unlocked'\)/);
  for (const key of ['mylist', 'history', 'progress', 'acct-meta']) assert.ok(page.includes(`'${key}'`), key);
  assert.equal((await get('/__gate/logout')).status, 200, 'works even when not signed in');
});

test('the redirect target can only be a path on this site', async () => {
  for (const next of ['//evil.example', 'https://evil.example', '/\\evil.example', 'javascript:alert(1)', '', undefined]) {
    const page = await (await post({ user: 'eve', code: 'shared-pass', ...(next === undefined ? {} : { next }) })).text();
    assert.match(page, /location\.replace\("\/"\)/, String(next));
  }
  const page = await (await post({ user: 'eve', code: 'shared-pass', next: '/</script><script>alert(1)</script>' })).text();
  assert.doesNotMatch(page, /<\/script><script>alert/);
});

test('the sign-in screen escapes what it echoes back', async () => {
  assert.doesNotMatch(await (await get('/"><script>alert(1)</script>', html)).text(), /<script>alert/);
  const wrong = await post({ user: '"><script>alert(1)</script>', code: 'x' });
  assert.doesNotMatch(await wrong.text(), /<script>alert/);
});

test('only GET navigations get the sign-in page; other requests get a plain 401', async () => {
  const res = await gate(new Request(origin + '/data/channels.json', { method: 'POST' }), context);
  assert.equal(res.status, 401);
  assert.equal(await res.text(), 'Sign-in required');
});

test('the USERS environment variable replaces the whole list', async () => {
  await withEnv(JSON.stringify({ ann: 'correct horse battery', eve: 'new-password' }), async () => {
    assert.equal((await post({ user: 'dan', code: 'dan-pass-3' })).status, 401, 'built-in users no longer work');
    assert.equal((await post({ user: 'eve', code: 'shared-pass' })).status, 401, 'including the old password of a user who is still listed');
    assert.equal((await post({ user: 'ann', code: 'correct horse battery' })).status, 200);
    assert.equal((await post({ user: 'eve', code: 'new-password' })).status, 200);
    assert.equal((await get('/', { ...html, cookie: session('eve', 'shared-pass') })).status, 401, 'old sign-ins stop working');
    assert.equal((await get('/', { ...html, cookie: session('ann', 'correct horse battery') })).status, 200);
  });
});

test('a broken USERS value never lets a made-up user in, and never crashes', async () => {
  for (const value of ['{not json', '[]', '"text"', '']) await withEnv(value, async () => {
    for (const user of Object.keys(USERS)) assert.equal((await post({ user, code: USERS[user] })).status, 401, `${value} ${user}`);
  });
});

// The real accounts are stored only as hashes. To check them, run:  STREAMBOX_BUILTIN_USERS='{"user":"password",...}' npm test
test('the built-in accounts sign in with their own passwords only', { skip: !process.env.STREAMBOX_BUILTIN_USERS && 'set STREAMBOX_BUILTIN_USERS to check the built-in accounts' }, async () => {
  const real = JSON.parse(process.env.STREAMBOX_BUILTIN_USERS);
  await withEnv(undefined, async () => {
    for (const [user, password] of Object.entries(real)) {
      assert.equal((await post({ user, code: password })).status, 200, user);
      assert.equal((await post({ user, code: password + 'x' })).status, 401, `${user} wrong password`);
      assert.equal((await get('/', { ...html, cookie: session(user, password) })).status, 200, `${user} cookie`);
    }
    assert.equal((await post({ user: 'nobody-here', code: Object.values(real)[0] })).status, 401);
  });
});

test('changing a password signs that person out', async () => {
  const cookie = session('dan', 'dan-pass-3');
  assert.equal((await get('/', { ...html, cookie })).status, 200);
  await withEnv(JSON.stringify({ tc: 'different' }), async () => assert.equal((await get('/', { ...html, cookie })).status, 401));
});

test('cookies are only marked Secure on https', async () => {
  const res = await post({ user: 'dan', code: 'dan-pass-3' }, {}, 'http://localhost:8888');
  for (const c of res.headers.getSetCookie()) assert.doesNotMatch(c, /Secure/);
});
