// Passkey (WebAuthn) checks: what lets someone sign in with Face ID, Touch ID, a fingerprint or Windows Hello.
// The device keeps a private key and proves it holds it by signing a one-time challenge; only the public key is
// stored on the server, so there is nothing here worth stealing. Uses WebCrypto only (Node 20+, Deno, browsers).
import { b64url, fromB64url } from './auth.mjs';

const UP = 0x01, UV = 0x04, AT = 0x40;   // flags: user present, user verified (face / finger / PIN), credential data attached
const sha256 = async bytes => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const fail = message => { throw new Error(message); };

export const ALGS = { '-7': 'ES256', '-257': 'RS256' };

// The fixed-layout start of authenticator data (and the credential id when one is attached)
export function parseAuthData(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 37) fail('authenticator data is too short');
  const out = { rpIdHash: bytes.slice(0, 32), flags: bytes[32], counter: new DataView(bytes.buffer, bytes.byteOffset + 33, 4).getUint32(0) };
  if (out.flags & AT) {
    if (bytes.length < 55) fail('credential data is missing');
    const len = new DataView(bytes.buffer, bytes.byteOffset + 53, 2).getUint16(0);
    if (bytes.length < 55 + len) fail('credential id is cut short');
    out.credentialId = bytes.slice(55, 55 + len);
  }
  return out;
}

// What the browser says it did: the right kind of request, for our challenge, on our site
function checkClientData(bytes, { type, challenge, origin }) {
  let data;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { fail('client data is not JSON'); }
  if (data.type !== type) fail('wrong kind of request');
  if (data.challenge !== challenge) fail('the challenge does not match');
  if (data.origin !== origin) fail('wrong site');
  if (data.crossOrigin === true) fail('cross-origin requests are not accepted');
}
async function checkAuthData(bytes, rpId, needCredential) {
  const auth = parseAuthData(bytes);
  if (!same(auth.rpIdHash, await sha256(new TextEncoder().encode(rpId)))) fail('made for a different site');
  if (!(auth.flags & UP)) fail('nobody was present');
  if (!(auth.flags & UV)) fail('the device did not check who it was');
  if (needCredential && !auth.credentialId) fail('no credential was created');
  return auth;
}

// ECDSA signatures arrive ASN.1 DER encoded; WebCrypto wants the two 32-byte numbers side by side
export function derToRaw(der, size = 32) {
  let i = 0;
  const read = tag => {
    if (der[i++] !== tag) fail('bad signature');
    let len = der[i++];
    if (len & 0x80) { const n = len & 0x7f; if (n < 1 || n > 2) fail('bad signature'); len = 0; for (let k = 0; k < n; k++) len = (len << 8) | der[i++]; }
    return len;
  };
  read(0x30);
  const part = () => {
    const len = read(0x02);
    let bytes = der.slice(i, i + len); i += len;
    while (bytes.length > size && bytes[0] === 0) bytes = bytes.slice(1);
    if (bytes.length > size) fail('bad signature');
    const out = new Uint8Array(size); out.set(bytes, size - bytes.length);
    return out;
  };
  const r = part(), s = part();
  if (i !== der.length) fail('bad signature');
  const raw = new Uint8Array(size * 2); raw.set(r); raw.set(s, size);
  return raw;
}

async function importPublicKey(alg, spki) {
  if (alg === 'ES256') return crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  if (alg === 'RS256') return crypto.subtle.importKey('spki', spki, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  return fail('unsupported key type');
}

const bytesOf = (value, name, max = 4096) => {
  if (typeof value !== 'string' || !value || value.length > max * 2) fail(`${name} is missing`);
  try { return fromB64url(value); } catch { return fail(`${name} is not valid`); }
};

// A new passkey. Returns what to store: { id, publicKey, alg }.
// (No attestation is asked for, so the public key the browser reports is as trustworthy as one dug out of the
// attestation object would be: either way it is the key of whoever is signed in and setting this up.)
export async function checkRegistration(body, { challenge, origin, rpId }) {
  checkClientData(bytesOf(body.clientDataJSON, 'client data'), { type: 'webauthn.create', challenge, origin });
  const auth = await checkAuthData(bytesOf(body.authenticatorData, 'authenticator data'), rpId, true);
  const id = b64url(auth.credentialId);
  if (body.id !== id) fail('the credential id does not match');
  if (id.length > 512) fail('the credential id is too long');
  const alg = ALGS[String(body.alg)] || fail('unsupported key type');
  const spki = bytesOf(body.publicKey, 'public key');
  await importPublicKey(alg, spki);   // refuses anything that isn't a real key of that type
  return { id, publicKey: b64url(spki), alg };
}

// A sign-in with a stored passkey ({ publicKey, alg }). Throws unless everything checks out.
export async function checkAssertion(body, credential, { challenge, origin, rpId }) {
  const clientData = bytesOf(body.clientDataJSON, 'client data'), authData = bytesOf(body.authenticatorData, 'authenticator data');
  checkClientData(clientData, { type: 'webauthn.get', challenge, origin });
  await checkAuthData(authData, rpId, false);
  const signed = new Uint8Array(authData.length + 32);
  signed.set(authData); signed.set(await sha256(clientData), authData.length);
  const key = await importPublicKey(credential.alg, fromB64url(credential.publicKey));
  const signature = bytesOf(body.signature, 'signature');
  const ok = credential.alg === 'ES256'
    ? await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(signature), signed)
    : await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signed);
  if (!ok) fail('the signature is wrong');
  return true;
}
