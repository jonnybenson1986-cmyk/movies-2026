// Sign-in gate for the whole site. Runs on Netlify's edge, before any file is served, so it can't be
// skipped by editing the page. People sign in with a username and password (see ../lib/auth.mjs), and
// it is asked for again every time the app or page is closed:
//  - the cookies are session cookies, which the browser drops when it closes, and
//  - the app also keeps an "unlocked" flag in sessionStorage (see the script at the top of index.html),
//    which the browser clears when the tab or the installed app is closed.

import {
  SESSION_COOKIE, MARKER_COOKIE, MAX_USER, MAX_PASSWORD,
  verifyLogin, normalizeUser, sessionCookieValue, sessionUser,
} from '../lib/auth.mjs';

const FAIL_DELAY_MS = 800;   // slows down guessing

// Reachable without signing in: what a browser needs to show the lock screen and install the app, and the two
// requests that sign someone in with Face ID / fingerprint (netlify/functions/passkey.mjs checks those itself)
const isPublic = path => path === '/manifest.webmanifest' || path.startsWith('/icons/') || path === '/api/passkey/login/options' || path === '/api/passkey/login';

// Only ever redirect to a path on this site
const safeNext = value => (typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : '/');

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function lockPage(next, error, user = '') {
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="robots" content="noindex"><meta name="theme-color" content="#000000">
<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<title>StreamBox</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;display:grid;place-items:center;padding:24px;background:#000;color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased}
  main{width:min(100%,340px);text-align:center}
  h1{color:#e50914;font-size:28px;font-weight:800;letter-spacing:.04em;margin-bottom:6px}
  p{color:#8e8e93;font-size:15px;margin-bottom:24px}
  input{display:block;width:100%;padding:14px 16px;margin-bottom:10px;border-radius:12px;border:0;background:#1c1c1e;color:#fff;font-size:17px;text-align:left}
  input::placeholder{color:#636366}
  input:focus{outline:2px solid #fff;outline-offset:-2px}
  button{width:100%;margin-top:6px;padding:14px;border:0;border-radius:999px;background:#f5f5f7;color:#000;font-size:17px;font-weight:600;cursor:pointer}
  .err{color:#ff453a;font-size:14px;margin:0 0 14px}
  #pk{display:flex;align-items:center;justify-content:center;gap:10px;margin:0 0 18px;background:#1c1c1e;color:#f5f5f7}
  #pk[hidden],#pkErr[hidden],#or[hidden]{display:none}
  #pk.main{background:#f5f5f7;color:#000}
  #pk svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  #pk:disabled{opacity:.6}
  #or{color:#636366;font-size:13px;margin:0 0 14px}
  body.haspk form button{background:#1c1c1e;color:#f5f5f7}
</style></head>
<body><main>
  <h1>STREAMBOX</h1><p>Sign in to continue</p>
  ${error ? '<p class="err">Wrong username or password. Try again.</p>' : ''}
  <button type="button" id="pk" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 9v1.5M15 9v1.5M12 9v4h-1M9 15.5c1.8 1.4 4.2 1.4 6 0"/></svg><span>Sign in with Face ID or fingerprint</span></button>
  <p class="err" id="pkErr" role="alert" hidden></p>
  <p id="or" hidden>or use your password</p>
  <form method="post" action="/__gate">
    <input type="hidden" name="next" value="${esc(next)}">
    <input name="user" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="${MAX_USER}" placeholder="Username" value="${esc(user)}" ${user ? '' : 'autofocus'} required aria-label="Username">
    <input name="code" type="password" autocomplete="current-password" maxlength="${MAX_PASSWORD}" placeholder="Password" ${user ? 'autofocus' : ''} required aria-label="Password">
    <button type="submit">Sign in</button>
  </form>
</main>
<script>
// Face ID / fingerprint sign-in (a passkey). Offered on devices that support it; it is the main button on a
// device where it has been set up (Settings in the app), and it opens by itself there, like other apps do.
(function () {
  if (!window.PublicKeyCredential || !navigator.credentials) return;
  var btn = document.getElementById('pk'), err = document.getElementById('pkErr'), next = ${JSON.stringify(next).replace(/</g, '\\u003c')};
  var known = false, auto = true;
  try { known = localStorage.getItem('sb:passkey') === '1'; auto = sessionStorage.getItem('sb_no_auto') !== '1'; sessionStorage.removeItem('sb_no_auto'); } catch (e) {}
  var enc = function (buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))).replace(/[+]/g, '-').replace(/[/]/g, '_').replace(/=+$/, ''); };
  var dec = function (s) { return Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), function (c) { return c.charCodeAt(0); }); };
  var post = function (path, body) { return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Sign-in failed'); return j; }); }); };
  function signIn(quiet) {
    err.hidden = true; btn.disabled = true;
    post('/api/passkey/login/options').then(function (o) {
      return navigator.credentials.get({ publicKey: { challenge: dec(o.challenge), rpId: o.rpId, timeout: o.timeout, userVerification: o.userVerification } }).then(function (c) {
        return post('/api/passkey/login', { token: o.token, id: c.id, clientDataJSON: enc(c.response.clientDataJSON), authenticatorData: enc(c.response.authenticatorData), signature: enc(c.response.signature) });
      });
    }).then(function () {
      try { sessionStorage.setItem('sb_unlocked', '1'); localStorage.setItem('sb:passkey', '1'); } catch (e) {}
      location.replace(next);
    }).catch(function (e) {
      btn.disabled = false;
      var cancelled = e && (e.name === 'NotAllowedError' || e.name === 'AbortError');   // dismissed, or the browser wants a tap first
      if (quiet || cancelled) return;
      err.textContent = e && e.message ? e.message : 'Face ID or fingerprint sign-in didn’t work. Use your password.'; err.hidden = false;
    });
  }
  btn.hidden = false; document.getElementById('or').hidden = false;
  if (known) { btn.className = 'main'; document.body.className = 'haspk'; var focused = document.activeElement; if (focused && focused.blur) focused.blur(); }   // Face ID leads; no keyboard popping up
  btn.onclick = function () { signIn(false); };
  if (known && auto) signIn(true);
})();
</script>
</body></html>`;
  return new Response(html, {
    status: 401,   // not 200, so the app's offline cache never stores the lock screen
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });
}

// Shown for an instant after signing in: marks this tab as unlocked, then continues to the app
function unlockedPage(next) {
  const target = JSON.stringify(next).replace(/</g, '\\u003c');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><title>StreamBox</title>
<script>try{sessionStorage.setItem('sb_unlocked','1')}catch(e){}location.replace(${target})</script></head>
<body style="background:#000;color:#8e8e93;font-family:system-ui,sans-serif;padding:24px"><noscript>Signed in. <a href="${esc(next)}" style="color:#fff">Continue</a></noscript></body></html>`;
}

// Signing out: forget this session, and this person's lists on this device (they stay in their account)
function signedOutPage(secure) {
  const headers = new Headers({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  for (const name of [SESSION_COOKIE, MARKER_COOKIE]) headers.append('set-cookie', `${name}=; Path=/; Max-Age=0; SameSite=Lax${secure}`);
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="robots" content="noindex"><title>StreamBox</title>
<script>try{sessionStorage.removeItem('sb_unlocked');sessionStorage.setItem('sb_no_auto','1');for(const k of ['mylist','history','music','progress','acct-meta'])localStorage.removeItem('sb:'+k)}catch(e){}location.replace('/')</script></head>
<body style="background:#000"></body></html>`;
  return new Response(html, { status: 200, headers });
}

export default async function gate(request, context) {
  const url = new URL(request.url);
  const secure = url.protocol === 'https:' ? '; Secure' : '';

  if (url.pathname === '/__gate' && request.method === 'POST') {
    const form = await request.formData().catch(() => null);
    const next = safeNext(form?.get('next'));
    const password = form?.get('code');
    const user = await verifyLogin(form?.get('user'), password);
    if (user) {
      const headers = new Headers({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      // No Max-Age/Expires: these are session cookies and disappear when the browser closes
      headers.append('set-cookie', `${SESSION_COOKIE}=${sessionCookieValue(user, password)}; Path=/; HttpOnly; SameSite=Lax${secure}`);
      headers.append('set-cookie', `${MARKER_COOKIE}=1; Path=/; SameSite=Lax${secure}`);
      return new Response(unlockedPage(next), { status: 200, headers });
    }
    await new Promise(resolve => setTimeout(resolve, FAIL_DELAY_MS));
    return lockPage(next, true, normalizeUser(form?.get('user')));
  }

  if (url.pathname === '/__gate/logout') return signedOutPage(secure);

  // The app sends a freshly opened tab or app here to ask for the sign-in again
  if (url.pathname === '/__gate/lock' && request.method === 'GET') return lockPage(safeNext(url.searchParams.get('next')), false);

  if (isPublic(url.pathname) || (await sessionUser(request))) return context.next();

  const wantsPage = request.method === 'GET' && (request.headers.get('accept') || '').includes('text/html');
  return wantsPage ? lockPage(url.pathname + url.search, false) : new Response('Sign-in required', { status: 401, headers: { 'cache-control': 'no-store' } });
}

export const config = { path: '/*', excludedPath: ['/manifest.webmanifest', '/icons/*'] };
