// Sign-in shared by the passcode gate (edge function) and the account API (function).
// People sign in with a username and password. They are set by the USERS environment variable in
// Netlify, a JSON object such as {"bb":"a-long-password","jb":"another"}. If USERS isn't set, the built-in
// list below is used: only salted SHA-256 hashes are stored here, never the passwords.
// Short numeric passwords can still be guessed, so prefer longer ones in USERS.

export const SESSION_COOKIE = 'sb_gate';     // "<user>:<password>", or "pk.<signed token>" after a Face ID / fingerprint sign-in. HttpOnly, session-only
export const MARKER_COOKIE = 'sb_gate_on';   // readable by the page: a gate is in front of the app
export const SALT = 'streambox-user|';
export const MAX_USER = 32;
export const MAX_PASSWORD = 64;

const DEFAULT_USERS = {
  bb: 'c879a0a00dcfd562fd7f515f099782410f8f79ff9783cc4079a5ed299f0ccf93',
  jb: '44d38b3af2e27b57c1caec22104524ba4d8b3e936325a17065d5554e60452522',
  sb: 'd541b4afb24728db630cff53eb2492d93739892397f0b73c54bf643afb28c715',
  tc: '66aa07d9fe0990cb44b6892e746e57863673378ae67289732fe8a5eeb7f9de74',
  nn: 'cf4121bc940b39045b0bb65afc45dcc824fdb236a0c4890c3e59ace05d83bc8c',
  bn: '84172c9c33df4a4c8bc11b4b9d531fe54bf208b4dcdcc61be1ab5dcd5c6abf52',
  ja: '40f2055b4e9d4e3a91ce0fd1eb2b1a1babdefaa96437a2a582138b09a5b33846',
};

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export const sha256 = async text => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
export const safeEqual = (a, b) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

// Usernames are lower-case letters, digits, _ and -
export const normalizeUser = value => {
  const user = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[a-z0-9_-]+$/.test(user) && user.length <= MAX_USER ? user : '';
};

function envUsers() {
  const raw = globalThis.Netlify?.env?.get?.('USERS') ?? globalThis.process?.env?.USERS;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

// Is this still one of the accounts? (A passkey only works while its account exists.)
export function userExists(userInput) {
  const user = normalizeUser(userInput);
  return !!user && Object.hasOwn(envUsers() || DEFAULT_USERS, user);
}

// ---- signed tokens (for passkey challenges and passkey sessions). The key is the SESSION_SECRET environment
// variable when set; otherwise it is derived from the account list, which is no weaker than that list already is.
const enc = new TextEncoder();
export const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64url = text => Uint8Array.from(atob(String(text).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function signingKey() {
  const secret = globalThis.Netlify?.env?.get?.('SESSION_SECRET') ?? globalThis.process?.env?.SESSION_SECRET
    ?? 'streambox-session|' + JSON.stringify(envUsers() || DEFAULT_USERS);
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}
const mac = async text => b64url(await crypto.subtle.sign('HMAC', await signingKey(), enc.encode(text)));
// kind keeps a token made for one purpose from being used for another
export async function signToken(kind, payload, seconds) {
  const body = b64url(enc.encode(JSON.stringify({ ...payload, exp: Date.now() + seconds * 1000 })));
  return `${body}.${await mac(kind + '.' + body)}`;
}
export async function readToken(kind, token) {
  if (typeof token !== 'string' || token.length > 2000) return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined || !safeEqual(sig, await mac(kind + '.' + body))) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    return payload && typeof payload === 'object' && payload.exp > Date.now() ? payload : null;
  } catch { return null; }
}
const PASSKEY_SESSION_DAYS = 30;   // the cookie itself still ends when the browser closes
export const passkeySessionValue = async user => 'pk.' + await signToken('session', { u: user }, PASSKEY_SESSION_DAYS * 86400);

// Returns the normalised username when the pair is right, otherwise ''
export async function verifyLogin(userInput, password) {
  const user = normalizeUser(userInput);
  if (!user || typeof password !== 'string' || !password || password.length > MAX_PASSWORD) return '';
  const fromEnv = envUsers();
  if (fromEnv) {
    const expected = Object.hasOwn(fromEnv, user) ? String(fromEnv[user]) : '';
    return expected && safeEqual(password, expected) ? user : '';
  }
  const expected = Object.hasOwn(DEFAULT_USERS, user) ? DEFAULT_USERS[user] : '';
  const actual = await sha256(SALT + user + '|' + password);
  return expected && safeEqual(actual, expected) ? user : '';
}

export const cookieValue = (request, name) => {
  const m = new RegExp('(?:^|;\\s*)' + name + '=([^;]*)').exec(request.headers.get('cookie') || '');
  try { return m ? decodeURIComponent(m[1]) : ''; } catch { return ''; }
};

export const sessionCookieValue = (user, password) => encodeURIComponent(user + ':' + password);

// The signed-in user for a request, or ''. Needs both cookies (the marker only exists for sessions made by this login).
export async function sessionUser(request) {
  if (cookieValue(request, MARKER_COOKIE) !== '1') return '';
  const value = cookieValue(request, SESSION_COOKIE);
  if (value.startsWith('pk.')) {   // signed in with a passkey
    const payload = await readToken('session', value.slice(3));
    return payload && userExists(payload.u) ? normalizeUser(payload.u) : '';
  }
  const i = value.indexOf(':');
  return i > 0 ? verifyLogin(value.slice(0, i), value.slice(i + 1)) : '';
}
