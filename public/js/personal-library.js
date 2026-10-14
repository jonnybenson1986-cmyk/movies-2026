/* StreamBox personal library: local entries plus an optional JSON manifest from the user's own server. */
(() => {
  'use strict';
  const ITEMS_KEY = 'sb:personalLibrary';
  const MANIFEST_KEY = 'sb:personalLibraryManifest';
  const MACCMS_KEY = 'sb:personalLibraryMacCms';
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
  function directSources(raw) {
    const text = String(raw || '');
    return text.split(/\\$\\$\\$/).flatMap(group => group.split('#')).map(part => {
      const pos = part.indexOf('
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
      '<form id="personalManifestForm" class="personal-form"><label>JSON manifest URL <input name="manifest" type="url" placeholder="https://your-server.example/library.json" value="' + esc(read(MANIFEST_KEY, '')) + '"></label><button class="btn btn-more" type="submit">Connect manifest</button><button class="btn btn-more" id="personalDisconnect" type="button">Clear manifest</button></form>' +
      '<form id="personalMacForm" class="personal-form"><label>MacCMS Provide API URL <input name="maccms" type="url" placeholder="https://your-domain.example/api.php/provide/vod/" value="' + esc(read(MACCMS_KEY, '')) + '"></label><button class="btn btn-red" type="submit">Connect MacCMS</button><button class="btn btn-more" id="personalMacDisconnect" type="button">Clear MacCMS</button></form>' +
      '<p id="personalStatus" class="library-note" role="status">' + esc(message) + '</p>' +
      (items.length ? '<div class="grid poster-grid personal-grid">' + items.map(card).join('') + '</div>' : '<div class="empty">Your library is empty. Add a video URL above or connect your server manifest.</div>') +
      '<p class="library-note">MacCMS uses the Provide API, usually <code>/api.php/provide/vod/</code>. Cross-origin API requests require CORS; HTTPS is recommended. Automatic playback works only when MacCMS supplies a direct supported media URL such as MP4 or HLS, not a third-party player webpage.</p>' +
      '<p class="library-note">Manifest format: a JSON array or an object with an <code>items</code> array. Each item needs <code>title</code> and <code>url</code>; optional fields include <code>id</code>, <code>year</code>, <code>description</code>, <code>poster</code>, <code>series</code>, <code>season</code> and <code>episode</code>.</p></div>';
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
    view.querySelector('#personalMacForm').addEventListener('submit', e => {
      e.preventDefault();
      const raw = view.querySelector('[name="maccms"]').value.trim(), value = raw ? safeUrl(raw) : '';
      if (raw && !value) { view.querySelector('#personalStatus').textContent = 'Enter a valid HTTP(S) MacCMS API URL.'; return; }
      write(MACCMS_KEY, value); render(view, { play });
    });
    view.querySelector('#personalMacDisconnect').addEventListener('click', () => { write(MACCMS_KEY, ''); render(view, { play }); });
    view.querySelectorAll('[data-personal-play]').forEach(button => button.addEventListener('click', async () => {
      const item = items[Number(button.dataset.personalPlay)];
      if (!item) return;
      if (item.url) { play(item); return; }
      if (item.macId && item.macBase) {
        const status = view.querySelector('#personalStatus'); status.textContent = 'Checking MacCMS playback sources…';
        try {
          const endpoint = new URL(item.macBase); endpoint.searchParams.set('ac', 'detail'); endpoint.searchParams.set('ids', item.macId);
          const res = await fetch(endpoint.href, { headers: { Accept: 'application/json' }, credentials: 'omit' });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const data = await res.json(), raw = (data.list || [])[0];
          const urls = raw ? directSources(raw.vod_play_url) : [];
          if (urls.length) { item.url = urls[0]; play(item); }
          else status.textContent = 'MacCMS returned no direct MP4/HLS/WebM stream for this title. It may use a player webpage or parser; those need a separate compatible playback adapter.';
        } catch (err) { status.textContent = 'Could not load MacCMS details: ' + err.message + '. Check CORS and the API endpoint.'; }
        return;
      }
      status.textContent = 'This item has no playable URL.';
    }));
  }
  function formSafeManifest(value) { return value.trim() ? safeUrl(value) : ''; }
  window.StreamBoxLibrary = { render };
})();); return pos >= 0 ? part.slice(pos + 1).trim() : part.trim();
    }).filter(url => /^(https?:\\/\\/).+\\.(mp4|m3u8|m4v|webm|mpd)(?:$|[?#])/i.test(url)).map(safeUrl).filter(Boolean);
  }
  function macItem(raw, i, base) {
    const id = String(raw.vod_id || raw.id || i);
    const sources = directSources(raw.vod_play_url || raw.url || raw.stream);
    return { id: 'mac-' + id, macId: id, key: 'mac:' + id, type: 'movie', catalog: 'personal',
      name: String(raw.vod_name || raw.title || 'Untitled'), url: sources[0] || '',
      poster: safeUrl(raw.vod_pic || raw.poster || ''), year: raw.vod_year || raw.year || '',
      overview: raw.vod_content || raw.description || '', series: raw.type_name || '',
      source: 'MacCMS', macBase: base, mediaType: /剧|series|tv/i.test(String(raw.type_name || '')) ? 'series' : 'movie' };
  }
  async function getItems() {
    const local = localItems().map(normalize).filter(Boolean);
    const manifest = safeUrl(read(MANIFEST_KEY, ''));
    let items = [...local], notes = [];
    if (manifest) {
      try {
        const res = await fetch(manifest, { headers: { Accept: 'application/json' }, credentials: 'omit' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.items || data.movies || data.series || []);
        if (!Array.isArray(list)) throw new Error('Expected a JSON array or an { items: [...] } object');
        items.push(...list.map(normalize).filter(Boolean));
        notes.push('Manifest: ' + list.length + ' item(s)');
      } catch (e) { notes.push('Manifest failed: ' + e.message + ' (check CORS)'); }
    }
    const macBase = safeUrl(read(MACCMS_KEY, ''));
    if (macBase) {
      try {
        const endpoint = new URL(macBase);
        endpoint.searchParams.set('ac', 'list'); endpoint.searchParams.set('pg', '1');
        const res = await fetch(endpoint.href, { headers: { Accept: 'application/json' }, credentials: 'omit' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (Number(data.code) !== 1 || !Array.isArray(data.list)) throw new Error(data.msg || 'Unexpected MacCMS API response');
        items.push(...data.list.map((raw, i) => macItem(raw, i, macBase)));
        notes.push('MacCMS: ' + data.list.length + ' title(s) loaded');
      } catch (e) { notes.push('MacCMS failed: ' + e.message + ' (check API URL and CORS)'); }
    }
    return { items, message: notes.join(' · ') || 'Add video URLs, connect a JSON manifest, or enter your MacCMS Provide API URL.' };
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