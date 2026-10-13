/* OzTiVo's Australian channel directory. Guide identifiers are not stream URLs. */
(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let catalog = null;
  const ready = fetch('/data/australia.json').then(r => {
    if (!r.ok) throw new Error('Australia directory unavailable');
    return r.json();
  }).then(data => {
    if (data.country !== 'Australia' || !Array.isArray(data.channels) || !data.channels.every(c =>
      typeof c.name === 'string' && typeof c.siteId === 'string' && typeof c.guideId === 'string')) throw new Error('Invalid directory');
    catalog = data;
  }).catch(() => {});
  // Exact guide identifiers only: names can refer to different regional feeds.
  function matchingStreams(entry, streams) {
    return streams.filter(s => s.type === 'live' && !s.dead && !s.isPlaylist && /^https?:\/\//.test(s.url || '') &&
      s.tvgId && (s.tvgId === entry.guideId || s.tvgId === entry.siteId));
  }
  function render(view, query, { streams, card }) {
    if (!catalog) {
      view.innerHTML = '<div class="page"><div class="empty">Couldn’t load Australian channels. Please reload to try again.</div></div>';
      return;
    }
    const term = query.trim().toLowerCase();
    const rows = catalog.channels.filter(c => [c.name, c.siteId, c.guideId].some(s => s.toLowerCase().includes(term)));
    view.innerHTML = `<div class="page"><div class="page-head"><h1>Australia</h1><span class="count">${rows.length} of ${catalog.channels.length} channels</span></div>
      <p class="australia-note">All channel entries from OzTiVo’s guide configuration, including regional and older names. This file supplies guide IDs, not video streams or programme schedules. Add a playlist in Settings with matching guide IDs to connect streams.</p>
      <div class="chips"><a class="chip" href="#live">All Live TV</a><a class="chip" href="/data/australia.json" download>Download channel directory</a><button class="chip" data-act="opensettings">Add a playlist</button></div>
      <form id="australiaFilters" class="movy-filters"><label>Find a channel <input name="query" maxlength="150" value="${esc(query)}" placeholder="Name, region or guide ID"></label><button class="btn btn-play" type="submit">Search</button></form>
      <div class="grid australia-grid">${rows.map(entry => {
        const matches = matchingStreams(entry, streams);
        return `<article class="australia-channel"><h2>${esc(entry.name)}</h2><p>Guide ID: ${esc(entry.guideId)}<br>Site ID: ${esc(entry.siteId)}</p>${matches.length ? matches.map(card).join('') : '<p class="movie-note">Stream not supplied</p>'}</article>`;
      }).join('')}</div>${rows.length ? '' : '<div class="empty">No matching channels.</div>'}</div>`;
    view.querySelector('#australiaFilters').addEventListener('submit', event => {
      event.preventDefault();
      location.hash = 'australia/' + encodeURIComponent(new FormData(event.currentTarget).get('query').trim().slice(0, 150));
    });
  }
  window.StreamBoxAustralia = { ready, render, matchingStreams, get count() { return catalog?.channels.length || 0; } };
})();
