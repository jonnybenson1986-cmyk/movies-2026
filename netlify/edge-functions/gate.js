// Passcode gate for the whole site. Runs on Netlify's edge, before any file is served, so it can't be
// skipped by editing the page. The passcode is needed again every time the app or page is closed:
//  - the cookies are session cookies, which the browser drops when it closes, and
//  - the app also keeps an "unlocked" flag in sessionStorage (see the script at the top of index.html),
//    which the browser clears when the tab or the installed app is closed.
//
// The passcode is set by the PASSCODE environment variable in Netlify (Site configuration -> Environment
// variables). If that isn't set, the built-in default below is used: only its SHA-256 hash is stored here.
// A short numeric code can still be guessed, so prefer a longer PASSCODE.

const COOKIE = 'sb_gate';       // the passcode itself (HttpOnly), checked on every request
const MARKER = 'sb_gate_on';    // readable by the page: tells the app that a passcode gate is in front of it
const SALT = 'streambox-gate|';
const DEFAULT_HASH = '5bea84abca5ad70f26ac6cb2bb791cb537bf5e374bacbbb2b200ad173b471c58';
const MAX_CODE_LENGTH = 64;
const FAIL_DELAY_MS = 800;   // slows down guessing

// Reachable without the passcode: what a browser needs to show the lock screen and install the app
const isPublic = path => path === '/manifest.webmanifest' || path.startsWith('/icons/');

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256 = async text => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
const safeEqual = (a, b) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

async function passcodeOk(candidate) {
  if (typeof candidate !== 'string' || !candidate || candidate.length > MAX_CODE_LENGTH) return false;
  const fromEnv = globalThis.Netlify?.env?.get?.('PASSCODE');
  if (fromEnv) return safeEqual(candidate, fromEnv);
  return safeEqual(await sha256(SALT + candidate), DEFAULT_HASH);
}

const cookieValue = (request, name) => {
  const m = new RegExp('(?:^|;\\s*)' + name + '=([^;]*)').exec(request.headers.get('cookie') || '');
  try { return m ? decodeURIComponent(m[1]) : ''; } catch { return ''; }
};
// Needs both cookies: the passcode, and the marker that only this session-style login sets
// (so sign-ins made before this change, which lasted 30 days, are asked for the passcode again)
const signedIn = async request => (await passcodeOk(cookieValue(request, COOKIE))) && cookieValue(request, MARKER) === '1';

// Only ever redirect to a path on this site
const safeNext = value => (typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : '/');

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function lockPage(next, error) {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="robots" content="noindex"><meta name="theme-color" content="#141414">
<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<title>StreamBox</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;display:grid;place-items:center;padding:24px;background:#141414;color:#fff;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
  main{width:min(100%,340px);text-align:center}
  h1{color:#e50914;font-size:30px;font-weight:800;letter-spacing:1px;margin-bottom:6px}
  p{color:#b3b3b3;font-size:14px;margin-bottom:22px}
  input{width:100%;padding:14px;border-radius:6px;border:1px solid #444;background:#000;color:#fff;font-size:22px;letter-spacing:6px;text-align:center}
  input:focus{outline:none;border-color:#fff}
  button{width:100%;margin-top:12px;padding:13px;border:0;border-radius:6px;background:#e50914;color:#fff;font-size:16px;font-weight:700;cursor:pointer}
  .err{color:#ff6b6b;font-size:14px;margin:0 0 12px}
</style></head>
<body><main>
  <h1>STREAMBOX</h1><p>Enter the passcode to continue</p>
  ${error ? '<p class="err">Wrong passcode. Try again.</p>' : ''}
  <form method="post" action="/__gate">
    <input type="hidden" name="next" value="${esc(next)}">
    <input name="code" type="password" inputmode="text" autocomplete="current-password" maxlength="${MAX_CODE_LENGTH}" autofocus required aria-label="Passcode">
    <button type="submit">Unlock</button>
  </form>
</main></body></html>`;
  return new Response(html, {
    status: 401,   // not 200, so the app's offline cache never stores the lock screen
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });
}

// Shown for an instant after a correct passcode: marks this tab as unlocked, then continues to the app
function unlockedPage(next) {
  const target = JSON.stringify(next).replace(/</g, '\\u003c');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><title>StreamBox</title>
<script>try{sessionStorage.setItem('sb_unlocked','1')}catch(e){}location.replace(${target})</script></head>
<body style="background:#141414;color:#b3b3b3;font-family:system-ui,sans-serif;padding:24px"><noscript>Unlocked. <a href="${esc(next)}" style="color:#fff">Continue</a></noscript></body></html>`;
}

export default async function gate(request, context) {
  const url = new URL(request.url);

  if (url.pathname === '/__gate' && request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const next = safeNext(form?.get('next'));
    if (await passcodeOk(form?.get('code'))) {
      const secure = url.protocol === 'https:' ? '; Secure' : '';
      const headers = new Headers({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      // No Max-Age/Expires: these are session cookies and disappear when the browser closes
      headers.append('set-cookie', `${COOKIE}=${encodeURIComponent(form.get('code'))}; Path=/; HttpOnly; SameSite=Lax${secure}`);
      headers.append('set-cookie', `${MARKER}=1; Path=/; SameSite=Lax${secure}`);
      return new Response(unlockedPage(next), { status: 200, headers });
    }
    await new Promise(resolve => setTimeout(resolve, FAIL_DELAY_MS));
    return lockPage(next, true);
  }

  // The app sends a freshly opened tab or app here to ask for the passcode again
  if (url.pathname === '/__gate/lock' && request.method === 'GET') return lockPage(safeNext(url.searchParams.get('next')), false);

  if (isPublic(url.pathname) || (await signedIn(request))) return context.next();

  const wantsPage = request.method === 'GET' && (request.headers.get('accept') || '').includes('text/html');
  return wantsPage ? lockPage(url.pathname + url.search, false) : new Response('Passcode required', { status: 401, headers: { 'cache-control': 'no-store' } });
}

export const config = { path: '/*', excludedPath: ['/manifest.webmanifest', '/icons/*'] };
