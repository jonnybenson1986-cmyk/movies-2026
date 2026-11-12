// Sign-in with Face ID, Touch ID, a fingerprint or Windows Hello (passkeys).
//   POST /api/passkey/register/options   signed in: start setting up a passkey on this device
//   POST /api/passkey/register           signed in: save the new passkey (its public key only)
//   GET  /api/passkey                    signed in: this person's passkeys
//   POST /api/passkey/remove             signed in: remove one
//   POST /api/passkey/login/options      anyone: start a passkey sign-in
//   POST /api/passkey/login              anyone: finish it; sets the same session cookies as the password form
// The gate lets the two login routes through without a session; everything else here checks the session itself.
import { sessionUser, userExists, normalizeUser, signToken, readToken, b64url, sha256, passkeySessionValue, SESSION_COOKIE, MARKER_COOKIE } from '../lib/auth.mjs';
import { checkRegistration, checkAssertion } from '../lib/webauthn.mjs';

const MAX_PER_PERSON = 10, CHALLENGE_SECONDS = 300, FAIL_DELAY_MS = 600;
const json = (body, status = 200, headers) => {
  const h = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' });
  for (const [k, v] of headers || []) h.append(k, v);
  return new Response(JSON.stringify(body), { status, headers: h });
};
const newChallenge = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
const credKey = async id => `passkey/${await sha256(id)}`;
const deviceName = ua => (/iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android device' : /Macintosh|Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows PC' : /CrOS/.test(ua) ? 'Chromebook' : 'Device');

export function createHandler({ getStore }) {
  return async function handler(request) {
    const url = new URL(request.url);
    const site = { origin: url.origin, rpId: url.hostname };
    const route = url.pathname.replace(/^\/api\/passkey\/?/, '').replace(/\/$/, '');
    const store = getStore();
    const listOf = async user => (await store.get(`passkeys/${user}`, { type: 'json' }).catch(() => null)) || [];

    if (request.method === 'GET' && route === '') {
      const user = await sessionUser(request);
      return user ? json({ user, passkeys: await listOf(user) }) : json({ error: 'Sign-in required' }, 401);
    }
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const raw = await request.text();
    if (raw.length > 20000) return json({ error: 'Too large' }, 413);
    let body = {};
    if (raw) { try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid JSON' }, 400); } }
    if (!body || typeof body !== 'object') return json({ error: 'Invalid JSON' }, 400);

    // ---------------------------------------------------------------- signing in (no session yet)
    if (route === 'login/options') {
      const challenge = newChallenge();
      return json({ challenge, token: await signToken('pk-login', { c: challenge }, CHALLENGE_SECONDS), rpId: site.rpId, timeout: 60000, userVerification: 'required' });
    }
    if (route === 'login') {
      const refuse = async why => { await new Promise(r => setTimeout(r, FAIL_DELAY_MS)); return json({ error: why }, 401); };
      const started = await readToken('pk-login', body.token);
      if (!started) return refuse('That took too long. Try again.');
      if (typeof body.id !== 'string' || !body.id || body.id.length > 600) return refuse('Passkey not recognised');
      const credential = await store.get(await credKey(body.id), { type: 'json' }).catch(() => null);
      if (!credential || credential.id !== body.id) return refuse('Passkey not recognised');
      try { await checkAssertion(body, credential, { challenge: started.c, ...site }); } catch (e) { return refuse('Passkey sign-in failed'); }
      const user = normalizeUser(credential.user);
      if (!userExists(user)) return refuse('That account no longer exists');
      const secure = url.protocol === 'https:' ? '; Secure' : '';
      return json({ ok: true, user }, 200, [
        ['set-cookie', `${SESSION_COOKIE}=${await passkeySessionValue(user)}; Path=/; HttpOnly; SameSite=Lax${secure}`],   // session cookies, as with a password
        ['set-cookie', `${MARKER_COOKIE}=1; Path=/; SameSite=Lax${secure}`],
      ]);
    }

    // ---------------------------------------------------------------- managing passkeys (signed in)
    const user = await sessionUser(request);
    if (!user) return json({ error: 'Sign-in required' }, 401);

    if (route === 'register/options') {
      const mine = await listOf(user);
      if (mine.length >= MAX_PER_PERSON) return json({ error: `You already have ${MAX_PER_PERSON} passkeys. Remove one first.` }, 409);
      const challenge = newChallenge();
      return json({
        challenge, token: await signToken('pk-register', { c: challenge, u: user }, CHALLENGE_SECONDS),
        rp: { id: site.rpId, name: 'StreamBox' },
        user: { id: b64url(new TextEncoder().encode(user)), name: user, displayName: user },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        // "platform": the device's own Face ID / fingerprint, not a USB key. "required": it must check who it is.
        authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
        excludeCredentials: mine.map(p => ({ type: 'public-key', id: p.id })),
        attestation: 'none', timeout: 60000,
      });
    }
    if (route === 'register') {
      const started = await readToken('pk-register', body.token);
      if (!started || started.u !== user) return json({ error: 'That took too long. Try again.' }, 400);
      let made;
      try { made = await checkRegistration(body, { challenge: started.c, ...site }); } catch (e) { return json({ error: `Couldn’t set up the passkey (${e.message})` }, 400); }
      const key = await credKey(made.id);
      if (await store.get(key, { type: 'json' }).catch(() => null)) return json({ error: 'That passkey is already set up' }, 409);
      const mine = await listOf(user);
      if (mine.length >= MAX_PER_PERSON) return json({ error: `You already have ${MAX_PER_PERSON} passkeys. Remove one first.` }, 409);
      const at = Date.now(), label = deviceName(request.headers.get('user-agent') || '');
      await store.setJSON(key, { ...made, user, at, label });
      await store.setJSON(`passkeys/${user}`, [...mine, { id: made.id, label, at }]);
      return json({ ok: true, id: made.id, label });
    }
    if (route === 'remove') {
      const mine = await listOf(user);
      if (typeof body.id !== 'string' || !mine.some(p => p.id === body.id)) return json({ error: 'Passkey not found' }, 404);   // only your own
      await store.delete(await credKey(body.id));
      await store.setJSON(`passkeys/${user}`, mine.filter(p => p.id !== body.id));
      return json({ ok: true });
    }
    return json({ error: 'Not found' }, 404);
  };
}

export default async function passkey(request) {
  const { getStore } = await import('@netlify/blobs');   // only needed when running on Netlify
  return createHandler({ getStore: () => getStore({ name: 'streambox-accounts', consistency: 'strong' }) })(request);
}

export const config = { path: ['/api/passkey', '/api/passkey/*'] };
