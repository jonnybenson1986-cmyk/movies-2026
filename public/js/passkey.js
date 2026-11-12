/* Face ID / fingerprint sign-in (passkeys) for the signed-in person: setting it up on this device, listing and
   removing. The sign-in itself happens on the lock screen (netlify/edge-functions/gate.js), and the checks are
   on the server (netlify/functions/passkey.mjs). The device keeps the secret; the server only gets a public key. */
(() => {
  'use strict';
  const FLAG = 'sb:passkey';   // "1" once a passkey has been set up or used on this device: the lock screen then leads with it
  const enc = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const dec = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const flag = on => { try { on ? localStorage.setItem(FLAG, '1') : localStorage.removeItem(FLAG); } catch { /* private mode */ } };
  async function api(path, body, method = 'POST') {
    const res = await fetch('/api/passkey' + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : {};
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  const supported = () => !!(window.PublicKeyCredential && navigator.credentials?.create);
  // Does this device have Face ID / Touch ID / a fingerprint reader / Windows Hello set up?
  async function available() {
    if (!supported()) return false;
    try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch { return false; }
  }

  async function setUp() {
    const o = await api('/register/options', {});
    let made;
    try {
      made = await navigator.credentials.create({ publicKey: {
        challenge: dec(o.challenge), rp: o.rp, user: { ...o.user, id: dec(o.user.id) }, pubKeyCredParams: o.pubKeyCredParams, timeout: o.timeout,
        authenticatorSelection: o.authenticatorSelection, attestation: o.attestation, excludeCredentials: o.excludeCredentials.map(c => ({ ...c, id: dec(c.id) })),
      } });
    } catch (e) {
      if (e?.name === 'InvalidStateError') { flag(true); throw new Error('This device is already set up'); }
      if (e?.name === 'NotAllowedError' || e?.name === 'AbortError') throw new Error('Cancelled');
      throw new Error('This device couldn’t create a passkey');
    }
    const r = made.response;
    if (!r.getPublicKey || !r.getAuthenticatorData) throw new Error('This browser is too old for Face ID sign-in. Update it and try again.');
    const publicKey = r.getPublicKey();
    if (!publicKey) throw new Error('This device made a kind of key StreamBox can’t use');
    const saved = await api('/register', { token: o.token, id: made.id, clientDataJSON: enc(r.clientDataJSON), authenticatorData: enc(r.getAuthenticatorData()), publicKey: enc(publicKey), alg: r.getPublicKeyAlgorithm() });
    flag(true);
    return saved;
  }
  const list = async () => (await api('', null, 'GET')).passkeys || [];
  async function remove(id) {
    await api('/remove', { id });
    if (!(await list().catch(() => [1])).length) flag(false);
  }

  window.StreamBoxPasskey = { supported, available, setUp, list, remove, get known() { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } } };
})();
