// App-shell cache so StreamBox opens instantly when installed. Streams are never cached.
const CACHE = 'streambox-v13';
const SHELL = ['/', '/index.html', '/css/app.css', '/js/app.js', '/js/personal-library.js', '/css/personal-library.css', '/js/movies-ui.js', '/js/movie-catalog.js', '/js/movy-ui.js', '/js/movy-browser.js', '/js/movy-setup.js', '/js/watch-providers.js', '/css/watch.css', '/js/movie-playback.js', '/data/movies.json', '/data/australia.json', '/js/australia-ui.js', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // The channel and movie lists (several MB) open straight from the saved copy, and the newest version downloads in
  // the background for next time, so a launch never waits for them (first launch aside).
  if (/^\/data\/[\w-]+\.json$/.test(url.pathname)) {
    e.respondWith(caches.open(CACHE).then(cache => cache.match(e.request).then(saved => {
      const fresh = fetch(e.request).then(res => { if (res.ok) cache.put(e.request, res.clone()); return res; });
      if (saved) { e.waitUntil(fresh.catch(() => {})); return saved; }
      return fresh;
    })));
    return;
  }
  // Everything else: network first, fall back to cache when offline. The saved copy is only rewritten when the file
  // changed (a different ETag), not on every launch: rewriting ~1 MB of files each time slowed launches on TV boxes.
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const copy = res.clone(), tag = res.headers.get('etag') || res.headers.get('last-modified');
          e.waitUntil(caches.open(CACHE).then(c => c.match(e.request).then(old => {
            const oldTag = old && (old.headers.get('etag') || old.headers.get('last-modified'));
            if (tag && tag === oldTag) return;
            // a fingerprinted file (app.js?v=…) replaces the copies of its older versions
            const drop = /^\?v=\w+$/.test(url.search) ? c.keys().then(keys => Promise.all(keys.filter(k => { const u = new URL(k.url); return u.pathname === url.pathname && u.search !== url.search; }).map(k => c.delete(k)))) : null;
            return Promise.all([c.put(e.request, copy), drop]);
          })).catch(() => {}));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match(e.request, { ignoreSearch: true })).then(r => r || caches.match('/index.html')))
  );
});
