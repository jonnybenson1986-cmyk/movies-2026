/* StreamBox personal library: local entries plus an optional JSON manifest from the user's own server. */
(() => {
  'use strict';
  const ITEMS_KEY = 'sb:personalLibrary';
  const MANIFEST_KEY = 'sb:personalLibraryManifest';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const read = (key, fallback) => { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
  const safeUrl = value => { try { const u = new URL(String(value || '')); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
  const localItems = () => read(ITEMS_KEY, []).filter(x => x && typeof x.title === 'string' && safeUrl(x.url));
  function normalize(raw, i) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const title = String(raw.title || raw.name || '').trim();
    const url = safeUrl(raw.url || raw.stream || raw.file);
    if (!title || !url) return null;
    return { id: String(raw.id || 'server-' + i), key: 'pl:' + String(raw.id || i), type: 'movie',
      catalog: 'personal', name: title, url, year: raw.year || '', overview: raw.description || raw.overview || '',
      poster: safeUrl(raw.poster || raw.cover || ''), source: 'My Library', series: raw.series || '',
      season: raw.season || 0, episode: raw.episode || 0, mediaType: raw.mediaType || raw.type || 'movie' };
  }
  async function getItems() {
    const local = localItems().map(normalize).filter(Boolean);
    const manifest = safeUrl(read(MANIFEST_KEY, ''));
    if (!manifest) return { items: local, message: 'Add video URLs below, or connect a JSON manifest from your own server.' };
    try {
      const res = await fetch(manifest, { headers: { Accept: 'application/json' }, credentials: 'omit' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.items || data.movies || data.series || []);
      if (!Array.isArray(list)) throw new Error('Expected a JSON array or an { items: [...] } object');
      const server = list.map(normalize).filter(Boolean);
      return { items: [...local, ...server], message: 'Connected to your manifest. ' + server.length + ' server item(s).' };
    } catch (e) {
      return { items: local, message: 'Could not load the manifest (' + e.message + '). Check the URL and server CORS settings.' };
    }
  }
  function card(item, i) {
    const poster = item.poster ? '<img loading="lazy" alt="" src="' + esc(item.poster) + '">' : '<span class="personal-poster-mark">▶</span>';
    const meta = [item.year, item.series, item.season ? 'Season ' + item.season : '', item.episode ? 'Episode ' + item.episode : ''].filter(Boolean).join(' · ');
    return '<button class="card poster personal-card" data-personal-play="' + i + '" aria-label="Play ' + esc(item.name) + '"><span class="tile">' + poster + '<span class="name">' + esc(item.name) + '</span><span class="meta">' + esc(meta || 'MY LIBRARY') + '</span></span></button>';
  }
  async function render(view, { play }) {
    const { items, message } = await getItems();
    view.innerHTML = '<div class="page"><div class="page-head"><h1>My Library</h1><span class="count">' + items.length + ' titles</span></div>' +
      '<p class="library-note">Play videos you own or are authorised to access. Add direct video URLs or connect a JSON manifest on your own server.</p>' +
      '<form id="personalAddForm" class="personal-form"><label>Title <input name="title" required maxlength="180" placeholder="Movie or episode title"></label><label>Video URL <input name="url" type="url" required placeholder="https://your-server.example/video.mp4"></label><button class="btn btn-red" type="submit">Add video</button></form>' +
      '<form id="personalManifestForm" class="personal-form"><label>Library manifest URL <input name="manifest" type="url" placeholder="https://your-server.example/library.json" value="' + esc(read(MANIFEST_KEY, '')) + '"></label><button class="btn btn-more" type="submit">Connect server</button><button class="btn btn-more" id="personalDisconnect" type="button">Disconnect</button></form>' +
      '<p id="personalStatus" class="library-note" role="status">' + esc(message) + '</p>' +
      (items.length ? '<div class="grid poster-grid personal-grid">' + items.map(card).join('') + '</div>' : '<div class="empty">Your library is empty. Add a video URL above or connect your server manifest.</div>') +
      '<p class="library-note">Manifest format: a JSON array or an object with an <code>items</code> array. Each item needs <code>title</code> and <code>url</code>; optional fields include <code>id</code>, <code>year</code>, <code>description</code>, <code>poster</code>, <code>series</code>, <code>season</code> and <code>episode</code>. Your server must permit browser requests from this app (CORS). HTTPS hosting is recommended.</p></div>';
    const form = view.querySelector('#personalAddForm');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const title = form.elements.title.value.trim(), url = safeUrl(form.elements.url.value);
      if (!title || !url) { view.querySelector('#personalStatus').textContent = 'Enter a title and a valid HTTP(S) video URL.'; return; }
      const saved = localItems();
      saved.push({ id: 'local-' + Date.now(), title, url });
      if (!write(ITEMS_KEY, saved)) { view.querySelector('#personalStatus').textContent = 'Could not save to this device storage.'; return; }
      render(view, { play });
    });
    view.querySelector('#personalManifestForm').addEventListener('submit', e => {
      e.preventDefault();
      const value = formSafeManifest(view.querySelector('[name="manifest"]').value);
      if (view.querySelector('[name="manifest"]').value.trim() && !value) { view.querySelector('#personalStatus').textContent = 'Manifest URL must be a valid HTTP(S) URL.'; return; }
      write(MANIFEST_KEY, value);
      render(view, { play });
    });
    view.querySelector('#personalDisconnect').addEventListener('click', () => { write(MANIFEST_KEY, ''); render(view, { play }); });
    view.querySelectorAll('[data-personal-play]').forEach(button => button.addEventListener('click', () => {
      const item = items[Number(button.dataset.personalPlay)];
      if (item) play(item);
    }));
  }
  function formSafeManifest(value) { return value.trim() ? safeUrl(value) : ''; }
  window.StreamBoxLibrary = { render };
})();