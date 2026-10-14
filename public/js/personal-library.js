/* StreamBox personal library and MacCMS catalogue connection. */
(() => {
  'use strict';
  const K = { local: 'sb:personalLibrary', manifest: 'sb:personalLibraryManifest', mac: 'sb:personalLibraryMacCms' };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const safeUrl = value => { try { const u = new URL(String(value || '')); return ['http:', 'https:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } };
  function directSource(raw) {
    const groups = String(raw || '').split('$$$');
    for (const group of groups) {
      for (const part of group.split('#')) {
        const at = part.indexOf('$');
        const candidate = at >= 0 ? part.slice(at + 1).trim() : part.trim();
        const clean = safeUrl(candidate);
        if (clean && /\.(mp4|m3u8|m4v|webm|mpd)(?:$|[?#])/i.test(clean)) return clean;
      }
    }
    return '';
  }
  function localItem(x, i) {
    if (!x || typeof x !== 'object') return null;
    const name = String(x.title || x.name || x.vod_name || '').trim();
    const media = safeUrl(x.url || x.stream || x.file);
    if (!name || !media) return null;
    return { id: String(x.id || i), key: 'pl:' + String(x.id || i), type: 'movie', catalog: 'personal',
      name, url: media, poster: safeUrl(x.poster || x.cover || x.vod_pic), year: x.year || x.vod_year || '',
      overview: x.description || x.overview || x.vod_content || '', source: 'My Library' };
  }
  async function loadItems() {
    const items = (Array.isArray(read(K.local, [])) ? read(K.local, []) : []).map(localItem).filter(Boolean);
    const notes = [];
    const manifest = safeUrl(read(K.manifest, ''));
    if (manifest) {
      try {
        const response = await fetch(manifest, { headers: { Accept: 'application/json' }, credentials: 'omit' });
        if (!response.ok) throw Error('HTTP ' + response.status);
        const data = await response.json();
        const list = Array.isArray(data) ? data : (data.items || data.movies || []);
        if (!Array.isArray(list)) throw Error('Expected a JSON array or an items array');
        items.push(...list.map(localItem).filter(Boolean));
        notes.push('Manifest: ' + list.length + ' titles');
      } catch (error) { notes.push('Manifest error: ' + error.message + '; check the URL and CORS'); }
    }
    const base = safeUrl(read(K.mac, ''));
    if (base) {
      try {
        const endpoint = new URL(base);
        endpoint.searchParams.set('ac', 'list');
        endpoint.searchParams.set('pg', '1');
        const response = await fetch(endpoint.href, { headers: { Accept: 'application/json' }, credentials: 'omit' });
        if (!response.ok) throw Error('HTTP ' + response.status);
        const data = await response.json();
        if (Number(data.code) !== 1 || !Array.isArray(data.list)) throw Error(data.msg || 'Unexpected MacCMS API response');
        data.list.forEach((record, i) => {
          const id = String(record.vod_id || i);
          items.push({ id: 'mac-' + id, macId: id, macBase: base, key: 'mac:' + id,
            type: 'movie', catalog: 'personal', name: String(record.vod_name || 'Untitled'),
            url: directSource(record.vod_play_url), poster: safeUrl(record.vod_pic), year: record.vod_year || '',
            overview: record.vod_content || '', series: record.type_name || '', source: 'MacCMS' });
        });
        notes.push('MacCMS: ' + data.list.length + ' titles loaded');
      } catch (error) { notes.push('MacCMS error: ' + error.message + '; check the API URL and CORS'); }
    }
    return { items, message: notes.join(' · ') || 'Add a video URL or connect a JSON manifest or MacCMS Provide API.' };
  }
  function card(item, index) {
    const poster = item.poster ? '<img loading="lazy" alt="" src="' + esc(item.poster) + '">' : '<span class="personal-poster-mark">▶</span>';
    const meta = [item.year, item.series, item.source].filter(Boolean).join(' · ');
    return '<button class="card poster personal-card" data-personal-play="' + index + '" aria-label="Play ' + esc(item.name) + '"><span class="tile">' +
      poster + '<span class="name">' + esc(item.name) + '</span><span class="meta">' + esc(meta || 'MY LIBRARY') + '</span></span></button>';
  }
  async function render(view, { play }) {
    const result = await loadItems();
    const items = result.items;
    view.innerHTML = '<div class="page"><div class="page-head"><h1>My Library</h1><span class="count">' + items.length + ' titles</span></div>' +
      '<p class="library-note">Browse and play media you own or are authorised to access.</p>' +
      '<form id="libAdd" class="personal-form"><label>Title<input name="title" required maxlength="180" placeholder="Movie or episode title"></label>' +
      '<label>Direct video URL<input name="url" type="url" required placeholder="https://your-server.example/video.mp4"></label><button class="btn btn-red" type="submit">Add video</button></form>' +
      '<form id="libMac" class="personal-form"><label>MacCMS Provide API URL<input name="api" type="url" placeholder="https://your-domain.example/api.php/provide/vod/" value="' + esc(read(K.mac, '')) + '"></label>' +
      '<button class="btn btn-red" type="submit">Connect MacCMS</button><button id="clearMac" class="btn btn-more" type="button">Clear</button></form>' +
      '<form id="libManifest" class="personal-form"><label>JSON manifest URL<input name="manifest" type="url" placeholder="https://your-server.example/library.json" value="' + esc(read(K.manifest, '')) + '"></label>' +
      '<button class="btn btn-more" type="submit">Connect manifest</button><button id="clearManifest" class="btn btn-more" type="button">Clear</button></form>' +
      '<p id="libStatus" class="library-note" role="status">' + esc(result.message) + '</p>' +
      (items.length ? '<div class="grid poster-grid personal-grid">' + items.map(card).join('') + '</div>' : '<div class="empty">No titles yet. Add a direct video URL or connect your server.</div>') +
      '<p class="library-note">MacCMS catalogue API: <code>/api.php/provide/vod/?ac=list</code>. When the CMS is hosted on a different origin, configure CORS to allow this app. Catalogue metadata loads separately from playback: direct MP4/HLS/WebM URLs can play, while third-party player pages and custom parsers need a dedicated adapter.</p></div>';
    view.querySelector('#libAdd').addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget, title = form.elements.title.value.trim(), media = safeUrl(form.elements.url.value);
      if (!title || !media) { view.querySelector('#libStatus').textContent = 'Enter a title and valid HTTP(S) video URL.'; return; }
      const saved = read(K.local, []);
      if (!Array.isArray(saved)) { view.querySelector('#libStatus').textContent = 'Saved library data is invalid. Clear browser library storage before adding videos.'; return; }
      saved.push({ id: 'local-' + Date.now(), title, url: media });
      if (!write(K.local, saved)) { view.querySelector('#libStatus').textContent = 'Could not save in browser storage.'; return; }
      render(view, { play });
    });
    view.querySelector('#libMac').addEventListener('submit', event => {
      event.preventDefault();
      const value = event.currentTarget.elements.api.value.trim(), normalized = value ? safeUrl(value) : '';
      if (value && !normalized) { view.querySelector('#libStatus').textContent = 'Enter a valid HTTP(S) MacCMS API URL.'; return; }
      write(K.mac, normalized); render(view, { play });
    });
    view.querySelector('#clearMac').addEventListener('click', () => { write(K.mac, ''); render(view, { play }); });
    view.querySelector('#libManifest').addEventListener('submit', event => {
      event.preventDefault();
      const value = event.currentTarget.elements.manifest.value.trim(), normalized = value ? safeUrl(value) : '';
      if (value && !normalized) { view.querySelector('#libStatus').textContent = 'Enter a valid HTTP(S) manifest URL.'; return; }
      write(K.manifest, normalized); render(view, { play });
    });
    view.querySelector('#clearManifest').addEventListener('click', () => { write(K.manifest, ''); render(view, { play }); });
    view.querySelectorAll('[data-personal-play]').forEach(button => button.addEventListener('click', async () => {
      const item = items[Number(button.dataset.personalPlay)], status = view.querySelector('#libStatus');
      if (!item) return;
      if (item.url) { play(item); return; }
      if (item.macId && item.macBase) {
        status.textContent = 'Loading MacCMS playback details…';
        try {
          const endpoint = new URL(item.macBase);
          endpoint.searchParams.set('ac', 'detail');
          endpoint.searchParams.set('ids', item.macId);
          const response = await fetch(endpoint.href, { headers: { Accept: 'application/json' }, credentials: 'omit' });
          if (!response.ok) throw Error('HTTP ' + response.status);
          const data = await response.json(), record = (data.list || [])[0], media = record && directSource(record.vod_play_url);
          if (media) { item.url = media; play(item); }
          else status.textContent = 'No direct supported media URL was found. This title may use an embedded player or custom parser that needs a separate adapter.';
        } catch (error) { status.textContent = 'Could not load playback details: ' + error.message + '. Check CORS and the API URL.'; }
        return;
      }
      status.textContent = 'This item needs a direct playable video URL.';
    }));
  }
  window.StreamBoxLibrary = { render };
})();