/* Poster and backdrop artwork from TMDB, loaded lazily for the cards on screen.
   It uses the app's built-in TMDB key, so artwork shows on every device with no setup.
   A key saved in Settings (stored on that device) takes priority over the built-in one. */
(() => {
  'use strict';
  const STORE = 'sb:art-v1', LIMIT = 6000, IMG = 'https://image.tmdb.org/t/p/', CONCURRENCY = 6;
  // TMDB "API Key (v3)": a read-only key for public movie data. Anyone who can load the app can see it.
  const BUILT_IN_KEY = '3aff4c9f91e0d6aa6841f7af6c6a42c5';
  const validKey = k => /^[a-f0-9]{32}$/i.test(k || '');
  const read = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
  let cache = read(), dirty = false, active = 0;
  const queue = [], pending = new Map();   // pending: "type:id" -> elements waiting for the answer

  const key = () => {
    try { const k = JSON.parse(localStorage.getItem('sb:settings') || '{}').tmdbKey; if (validKey(k)) return k; } catch { /* storage blocked */ }
    return BUILT_IN_KEY;
  };
  function save() {
    if (!dirty) return;
    dirty = false;
    try {
      const keys = Object.keys(cache);
      if (keys.length > LIMIT) for (const k of keys.slice(0, keys.length - LIMIT)) delete cache[k];
      localStorage.setItem(STORE, JSON.stringify(cache));
    } catch { /* storage full or blocked: artwork still shows this session */ }
  }
  setInterval(save, 3000);
  addEventListener('pagehide', save);

  function paint(el, art) {
    if (!art || !el.isConnected) return;
    if (el.classList.contains('hero')) {
      const bg = el.querySelector('.hero-bg');
      if (bg && art.b) {
        const img = new Image();
        img.onload = () => { bg.style.backgroundImage = `url(${img.src})`; bg.classList.add('has-art'); };
        img.src = IMG + 'w1280' + art.b;
      }
      return;
    }
    const holder = el.querySelector('.art');
    if (!holder || !art.p || holder.querySelector('.art-img')) return;
    const img = new Image();
    img.className = 'art-img'; img.alt = ''; img.decoding = 'async';
    img.onload = () => { holder.prepend(img); holder.classList.add('has-art'); };
    img.src = IMG + 'w342' + art.p;
  }

  async function fetchArt(type, id) {
    const k = `${type}:${id}`;
    const apiKey = key();
    if (!apiKey) return null;
    try {
      const res = await fetch(`https://api.themoviedb.org/3/${type}/${encodeURIComponent(id)}?api_key=${apiKey}`);
      if (res.status === 404) cache[k] = 0;
      else if (res.ok) { const j = await res.json(); cache[k] = { p: j.poster_path || '', b: j.backdrop_path || '' }; }
      else return null;   // rate limit, bad key, server error: try again later, don't remember it
      dirty = true;
      return cache[k];
    } catch { return null; }
  }

  function pump() {
    while (active < CONCURRENCY && queue.length) {
      const k = queue.shift(); const [type, id] = k.split(':');
      active++;
      fetchArt(type, id).then(art => { for (const el of pending.get(k) || []) paint(el, art); pending.delete(k); })
        .finally(() => { active--; pump(); });
    }
  }
  function want(el) {
    const k = `${el.dataset.artType === 'tv' ? 'tv' : 'movie'}:${el.dataset.artId}`;
    if (k in cache) { paint(el, cache[k]); return; }
    if (!key()) return;
    if (!pending.has(k)) { pending.set(k, []); queue.push(k); }
    pending.get(k).push(el);
    pump();
  }

  const seen = new WeakSet();
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); want(e.target); }
  }, { rootMargin: '500px' });
  function scan(root = document) {
    root.querySelectorAll?.('[data-art-id]').forEach(el => { if (!seen.has(el)) { seen.add(el); io.observe(el); } });
  }
  let scheduled = false;
  new MutationObserver(() => { if (!scheduled) { scheduled = true; requestAnimationFrame(() => { scheduled = false; scan(); }); } })
    .observe(document.documentElement, { childList: true, subtree: true });
  scan();

  window.StreamBoxArt = {
    enabled: () => !!key(),
    // Call after the key changes: cards on screen are looked at again
    reload() { save(); document.querySelectorAll('[data-art-id]').forEach(el => { seen.delete(el); }); scan(); },   // keeps what is already fetched
  };
})();
