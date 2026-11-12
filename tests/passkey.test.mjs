import test from 'node:test';
import assert from 'node:assert/strict';

const { createHandler } = await import(new URL('../netlify/functions/passkey.mjs', import.meta.url));
const { default: gate } = await import(new URL('../netlify/edge-functions/gate.js', import.meta.url));
const { sessionUser, signToken, readToken, b64url, fromB64url } = await import(new URL('../netlify/lib/auth.mjs', import.meta.url));
const { derToRaw, parseAuthData } = await import(new URL('../netlify/lib/webauthn.mjs', import.meta.url));

// Made-up accounts (the real passwords are never stored in the repository)
const USERS = { eve: 'shared-pass', fay: 'shared-pass' };
const useUsers = users => { globalThis.Netlify = { env: { get: key => (key === 'USERS' ? JSON.stringify(users) : undefined) } }; };
useUsers(USERS);
const ORIGIN = 'https://streambox.example', RP = 'streambox.example';
const password = (user, pass) => `sb_gate=${encodeURIComponent(user + ':' + pass)}; sb_gate_on=1`;
const EVE = password('eve', 'shared-pass'), FAY = password('fay', 'shared-pass');

const memoryStore = () => {
  const data = new Map();
  return { data, get: async key => (data.has(key) ? JSON.parse(data.get(key)) : null), setJSON: async (key, value) => { data.set(key, JSON.stringify(value)); }, delete: async key => { data.delete(key); } };
};
const site = () => { const store = memoryStore(); return { store, handler: createHandler({ getStore: () => store }) }; };
const call = (handler, path, body, cookie, { method = 'POST', origin = ORIGIN } = {}) => handler(new Request(origin + '/api/passkey' + path, {
  method, headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }));
const enc = new TextEncoder();
const sha = async bytes => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
const cat = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { out.set(p, i); i += p.length; } return out; };

// WebCrypto signs ECDSA as r||s; a real device sends it DER encoded
function rawToDer(raw) {
  const int = bytes => { let b = [...bytes]; while (b.length > 1 && b[0] === 0 && !(b[1] & 0x80)) b.shift(); if (b[0] & 0x80) b.unshift(0); return [0x02, b.length, ...b]; };
  const body = [...int(raw.slice(0, 32)), ...int(raw.slice(32))];
  return new Uint8Array([0x30, body.length, ...body]);
}

// A stand-in for a phone's Face ID: holds a private key, makes a credential, and signs challenges
async function device({ rsa = false } = {}) {
  const keys = rsa
    ? await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])
    : await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const credId = crypto.getRandomValues(new Uint8Array(16)), id = b64url(credId);
  const clientData = (type, challenge, origin) => enc.encode(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  const authData = async (rpId, flags, withCredential) => cat(await sha(enc.encode(rpId)), new Uint8Array([flags, 0, 0, 0, 1]),
    withCredential ? cat(new Uint8Array(16), new Uint8Array([0, credId.length]), credId, new Uint8Array([0xa5, 1, 2, 3])) : new Uint8Array(0));
  return {
    id,
    async create(o, { origin = ORIGIN, rpId = RP, flags = 0x45, challenge = o.challenge } = {}) {
      return { token: o.token, id, clientDataJSON: b64url(clientData('webauthn.create', challenge, origin)), authenticatorData: b64url(await authData(rpId, flags, true)),
        publicKey: b64url(await crypto.subtle.exportKey('spki', keys.publicKey)), alg: rsa ? -257 : -7 };
    },
    async get(o, { origin = ORIGIN, rpId = RP, flags = 0x05, challenge = o.challenge, type = 'webauthn.get' } = {}) {
      const cd = clientData(type, challenge, origin), ad = await authData(rpId, flags, false), signed = cat(ad, await sha(cd));
      const sig = rsa ? new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, signed))
        : rawToDer(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, signed)));
      return { token: o.token, id, clientDataJSON: b64url(cd), authenticatorData: b64url(ad), signature: b64url(sig) };
    },
  };
}
const json = async res => ({ status: res.status, body: await res.json(), cookies: res.headers.getSetCookie?.() || [] });
async function enrol(handler, cookie = EVE, opts) {
  const phone = await device(opts);
  const o = (await json(await call(handler, '/register/options', {}, cookie))).body;
  const saved = await json(await call(handler, '/register', await phone.create(o), cookie));
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  return phone;
}
const loginOptions = async handler => (await json(await call(handler, '/login/options', {}))).body;
const cookieHeader = cookies => cookies.map(c => c.split(';')[0]).join('; ');

test('setting up Face ID needs a signed-in person; signing in with it does not', async () => {
  const { handler } = site();
  for (const path of ['/register/options', '/register', '/remove']) assert.equal((await call(handler, path, {})).status, 401, path);
  assert.equal((await call(handler, '', undefined, undefined, { method: 'GET' })).status, 401);
  assert.equal((await call(handler, '/login/options', {})).status, 200);
  // the gate lets only the two sign-in requests through without a session
  const next = { next: async () => new Response('reached', { status: 200 }) };
  const through = path => gate(new Request(ORIGIN + path, { method: 'POST' }), next).then(r => r.status);
  assert.equal(await through('/api/passkey/login/options'), 200);
  assert.equal(await through('/api/passkey/login'), 200);
  assert.equal(await through('/api/passkey/register'), 401);
  assert.equal(await through('/api/passkey/remove'), 401);
  assert.equal(await through('/api/me'), 401);
});

test('a face sign-in works end to end and gives the same kind of session as a password', async () => {
  const { handler, store } = site();
  const phone = await enrol(handler);
  assert.ok(![...store.data.values()].some(v => /private|shared-pass/i.test(v)), 'only a public key is stored');
  const done = await json(await call(handler, '/login', await phone.get(await loginOptions(handler))));
  assert.equal(done.status, 200); assert.equal(done.body.user, 'eve');
  assert.equal(done.cookies.length, 2);
  for (const c of done.cookies) { assert.ok(!/max-age|expires/i.test(c), 'session cookies end when the browser closes'); assert.match(c, /SameSite=Lax; Secure$/); }
  assert.match(done.cookies[0], /^sb_gate=pk\.[\w-]+\.[\w-]+; Path=\/; HttpOnly/);
  assert.ok(!done.cookies[0].includes('shared-pass'), 'the password is not in the cookie');
  const cookie = cookieHeader(done.cookies);
  assert.equal(await sessionUser(new Request(ORIGIN + '/api/me', { headers: { cookie } })), 'eve');
  const res = await gate(new Request(ORIGIN + '/', { headers: { cookie, accept: 'text/html' } }), { next: async () => new Response('app') });
  assert.equal(await res.text(), 'app', 'the gate lets the passkey session in');
  assert.equal(await sessionUser(new Request(ORIGIN + '/', { headers: { cookie: cookie.replace('; sb_gate_on=1', '') } })), '', 'both cookies are needed');
});

test('each person has their own passkeys, listed with the device, and can remove only their own', async () => {
  const { handler } = site();
  const evePhone = await enrol(handler, EVE), fayPhone = await enrol(handler, FAY);
  const mine = (await json(await call(handler, '', undefined, EVE, { method: 'GET' }))).body;
  assert.equal(mine.user, 'eve'); assert.deepEqual(mine.passkeys.map(p => [p.id, p.label]), [[evePhone.id, 'iPhone']]);
  assert.equal((await call(handler, '/remove', { id: fayPhone.id }, EVE)).status, 404, 'not someone else’s');
  assert.equal((await json(await call(handler, '/login', await fayPhone.get(await loginOptions(handler))))).body.user, 'fay');
  assert.equal((await call(handler, '/remove', { id: evePhone.id }, EVE)).status, 200);
  assert.equal((await call(handler, '/login', await evePhone.get(await loginOptions(handler)))).status, 401, 'a removed passkey no longer signs in');
  assert.deepEqual((await json(await call(handler, '', undefined, EVE, { method: 'GET' }))).body.passkeys, []);
});

test('the same passkey can’t be added twice, and there is a limit per person', async () => {
  const { handler } = site();
  const phone = await enrol(handler);
  const o = (await json(await call(handler, '/register/options', {}, EVE))).body;
  assert.deepEqual(o.excludeCredentials.map(c => c.id), [phone.id], 'the device is told what it already has');
  assert.equal(o.authenticatorSelection.userVerification, 'required'); assert.equal(o.authenticatorSelection.authenticatorAttachment, 'platform'); assert.equal(o.rp.id, RP);
  assert.equal((await call(handler, '/register', await phone.create(o), EVE)).status, 409);
  for (let i = 0; i < 9; i++) await enrol(handler);
  assert.equal((await call(handler, '/register/options', {}, EVE)).status, 409, 'ten is the limit');
});

test('a sign-in is refused when anything about it is wrong', async () => {
  const { handler } = site();
  const phone = await enrol(handler), stranger = await device();
  const attempt = async (make, label) => { const res = await call(handler, '/login', await make(await loginOptions(handler))); assert.equal(res.status, 401, label); assert.equal(res.headers.getSetCookie().length, 0, label + ': no cookie'); };
  await attempt(o => phone.get(o, { origin: 'https://evil.example' }), 'another site’s page');
  await attempt(o => phone.get(o, { rpId: 'evil.example' }), 'made for another site');
  await attempt(o => phone.get(o, { challenge: b64url(new Uint8Array(32)) }), 'the wrong challenge');
  await attempt(o => phone.get(o, { flags: 0x01 }), 'the device did not check the face');
  await attempt(o => phone.get(o, { flags: 0x04 }), 'nobody present');
  await attempt(o => phone.get(o, { type: 'webauthn.create' }), 'the wrong kind of request');
  await attempt(o => stranger.get(o), 'an unknown device');
  await attempt(async o => ({ ...(await stranger.get(o)), id: phone.id }), 'someone else’s key claiming this passkey');
  await attempt(async o => { const b = await phone.get(o); const sig = fromB64url(b.signature); sig[sig.length - 1] ^= 1; return { ...b, signature: b64url(sig) }; }, 'a changed signature');
  await attempt(async o => { const b = await phone.get(o); const ad = fromB64url(b.authenticatorData); ad[36] ^= 1; return { ...b, authenticatorData: b64url(ad) }; }, 'changed data');
  await attempt(async o => ({ ...(await phone.get(o)), token: 'x.y' }), 'a made-up token');
  await attempt(async o => ({ ...(await phone.get(o)), token: (await json(await call(handler, '/register/options', {}, EVE))).body.token }), 'a set-up token used to sign in');
  await attempt(async o => { const b = await phone.get(o); delete b.signature; return b; }, 'no signature');
  assert.equal((await call(handler, '/login', '{not json')).status, 400);
  assert.equal((await call(handler, '/login', 'x'.repeat(30000))).status, 413);
  assert.equal((await call(handler, '/login', undefined, undefined, { method: 'DELETE' })).status, 405);
  // and after all that, the real device still signs in
  assert.equal((await call(handler, '/login', await phone.get(await loginOptions(handler)))).status, 200);
});

test('set-up is refused for the wrong person, site or an unverified device', async () => {
  const { handler } = site();
  const phone = await device();
  const o = (await json(await call(handler, '/register/options', {}, EVE))).body;
  assert.equal((await call(handler, '/register', await phone.create(o), FAY)).status, 400, 'started by someone else');
  assert.equal((await call(handler, '/register', await phone.create(o, { origin: 'https://evil.example' }), EVE)).status, 400);
  assert.equal((await call(handler, '/register', await phone.create(o, { flags: 0x41 }), EVE)).status, 400, 'no face or fingerprint check');
  assert.equal((await call(handler, '/register', { ...(await phone.create(o)), publicKey: b64url(new Uint8Array(40)) }, EVE)).status, 400, 'not a real key');
  assert.equal((await call(handler, '/register', { ...(await phone.create(o)), alg: -8 }, EVE)).status, 400, 'a key type that isn’t supported');
  assert.equal((await call(handler, '/register', { ...(await phone.create(o)), id: 'other' }, EVE)).status, 400);
  assert.equal((await call(handler, '/register', await phone.create(o), EVE)).status, 200);
});

test('challenges expire, and a session ends when the account is removed', async () => {
  const { handler } = site();
  const phone = await enrol(handler);
  const o = await loginOptions(handler), body = await phone.get(o);
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 6 * 60 * 1000;
    assert.equal((await call(handler, '/login', body)).status, 401, 'a challenge is good for five minutes');
  } finally { Date.now = realNow; }
  const done = await json(await call(handler, '/login', await phone.get(await loginOptions(handler))));
  const cookie = cookieHeader(done.cookies), request = () => new Request(ORIGIN + '/', { headers: { cookie } });
  assert.equal(await sessionUser(request()), 'eve');
  try {
    useUsers({ eve: 'a-new-password', fay: 'shared-pass' });
    assert.equal(await sessionUser(request()), '', 'changing the account list signs passkey sessions out (the signing key comes from it)');
    useUsers({ fay: 'shared-pass' });
    assert.equal((await call(handler, '/login', await phone.get(await loginOptions(handler)))).status, 401, 'no sign-in for an account that is gone');
  } finally { useUsers(USERS); }
  try {
    Date.now = () => realNow() + 31 * 86400e3;
    assert.equal(await sessionUser(request()), '', 'a passkey session is good for 30 days at most');
  } finally { Date.now = realNow; }
});

test('Windows Hello style keys (RS256) work too', async () => {
  const { handler } = site();
  const pc = await enrol(handler, EVE, { rsa: true });
  assert.equal((await call(handler, '/login', await pc.get(await loginOptions(handler)))).status, 200);
  assert.equal((await call(handler, '/login', await pc.get(await loginOptions(handler), { origin: 'https://evil.example' }))).status, 401);
});

test('tokens can’t be changed, reused for another purpose, or outlive their time', async () => {
  const token = await signToken('pk-login', { c: 'abc' }, 60);
  assert.equal((await readToken('pk-login', token)).c, 'abc');
  assert.equal(await readToken('session', token), null);
  const [body, sig] = token.split('.');
  assert.equal(await readToken('pk-login', b64url(new TextEncoder().encode(JSON.stringify({ c: 'abc', exp: Date.now() + 9e9 }))) + '.' + sig), null);
  assert.equal(await readToken('pk-login', body + '.' + sig + 'x'), null);
  for (const bad of ['', 'a', 'a.b.c', null, 42, 'x'.repeat(3000)]) assert.equal(await readToken('pk-login', bad), null);
  assert.equal(await readToken('pk-login', await signToken('pk-login', { c: 'abc' }, -1)), null);
});

test('signature and authenticator data parsing reject malformed input', () => {
  const raw = derToRaw(new Uint8Array([0x30, 0x08, 0x02, 0x02, 0x00, 0x81, 0x02, 0x02, 0x01, 0x02]));
  assert.equal(raw.length, 64); assert.equal(raw[31], 0x81); assert.equal(raw[62], 0x01); assert.equal(raw[63], 0x02);
  for (const bad of [[0x31, 0], [0x30, 2, 0x02, 0], [0x30, 0x06, 0x02, 0x01, 1, 0x02, 0x01, 1, 9]]) assert.throws(() => derToRaw(new Uint8Array(bad)));
  assert.throws(() => parseAuthData(new Uint8Array(10)));
  assert.throws(() => parseAuthData(cat(new Uint8Array(32), new Uint8Array([0x45, 0, 0, 0, 0]))), /missing/);
  assert.equal(parseAuthData(cat(new Uint8Array(32), new Uint8Array([0x05, 0, 0, 0, 7]))).counter, 7);
});

test('the sign-in screen offers Face ID without opening a hole', async () => {
  const page = await (await gate(new Request(ORIGIN + '/__gate/lock?next=' + encodeURIComponent('/x</script><script>alert(1)</script>'), { headers: { accept: 'text/html' } }), { next: async () => new Response('app') })).text();
  assert.match(page, /id="pk" hidden/); assert.match(page, /Sign in with Face ID or fingerprint/);
  assert.ok(!page.includes('<script>alert(1)'), 'the return address can’t inject script');
  const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Function(scripts[0]), 'the sign-in script is valid JavaScript');
  assert.match(scripts[0], /\/api\/passkey\/login\/options/); assert.match(scripts[0], /userVerification/);
  assert.match(page, /<form method="post" action="\/__gate">/, 'the password form is still there');
  const out = await (await gate(new Request(ORIGIN + '/__gate/logout'), { next: async () => new Response('app') })).text();
  assert.match(out, /sb_no_auto/, 'signing out doesn’t pop Face ID straight back up');
  assert.ok(!out.includes("'passkey'"), 'signing out keeps Face ID set up on the device');
});
