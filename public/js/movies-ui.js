/* KiduyuTv movie collections and player sources, with cached release updates. */
(() => {
  'use strict';
  // Provider templates from KiduyuTv's StreamProvider.kt. IDs are provider lookup keys.
  const sources = [
    { name: 'VidLink', base: 'https://vidlink.pro/movie/' },
    { name: 'MoviesAPI', base: 'https://moviesapi.to/movie/' },
    { name: 'Videasy', base: 'https://player.videasy.net/movie/' },
    { name: 'VidNest', base: 'https://vidnest.fun/movie/' },
  ];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const color = name => {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
    h = Math.abs(h) % 360;
    return `linear-gradient(135deg, hsl(${h} 55% 32%), hsl(${(h + 40) % 360} 60% 14%))`;
  };
  const url = (movie, index = 0) => sources[index].base + movie.id;
  let collections = [], all = [], failed = false;
  function apply(data, detail) {
    const unique = new Map();
    collections = data.collections.map(c => ({ ...c, movies: c.movies.map(m => {
      const movie = unique.get(m.id) || {
        ...m, key: 'm:' + m.id, type: 'movie', cat: 'Movies', source: m.source || 'KiduyuTv',
        collection: c.title, url: url(m),
      };
      unique.set(m.id, movie);
      return movie;
    }) }));
    all = [...unique.values()]; failed = false;
    window.dispatchEvent(new CustomEvent('streambox-movies-updated', { detail }));
  }
  const updates = window.StreamBoxMovieCatalog.create({ onUpdate: apply, onStatus: status => {
    failed = !collections.length && status.phase === 'failed';
    window.dispatchEvent(new CustomEvent('streambox-movie-update-status', { detail: status }));
  } });
  const ready = updates.ready;

  function restore(saved) {
    if (saved?.type !== 'movie' || saved.catalog || saved.key !== 'm:' + saved.id) return null;
    const m = window.StreamBoxMovieCatalog.normalizeMovie(saved);
    return m ? { ...m, key: 'm:' + m.id, type: 'movie', cat: 'Movies', collection: 'Saved movie', url: url(m) } : null;
  }

  function card(m) {
    const meta = [m.year, m.vote ? '★ ' + m.vote : ''].filter(Boolean).join(' · ');
    return `<button class="card poster movie-card" data-key="${esc(m.key)}" aria-label="${esc(m.name)}">
      <span class="badge">MOVIE</span>
      <span class="tile" style="--tile:${color(m.name)}"><span class="movie-mark" aria-hidden="true">▶</span>
      <span class="name">${esc(m.name)}</span><span class="meta">${esc(meta)}</span></span></button>`;
  }

  function detail(m, saved) {
    return `<div class="modal-hero movie-hero" style="background:${color(m.name)}">
      <div class="inner"><h2>${esc(m.name)}</h2><div class="btns">
        <button class="btn btn-play" data-act="movieplay" data-key="${esc(m.key)}">▶ Play</button>
        <button class="btn btn-more" data-act="fav" data-key="${esc(m.key)}">${saved ? '✓ In My List' : '+ My List'}</button>
      </div></div></div><div class="modal-body"><div class="facts">
      <span>${esc(m.year)}</span>${m.vote ? `<span class="ok">★ ${esc(m.vote)}</span>` : ''}<span>${esc(m.collection)}</span>
      </div><p>${esc(m.overview) || 'No synopsis available.'}</p>
      <p class="movie-note">Choose another source in the player if the movie is unavailable.</p></div>`;
  }

  function render(view, id) {
    if (failed || !collections.length) {
      view.innerHTML = '<div class="page"><div class="page-head"><h1>Movies</h1></div><div class="empty">Couldn’t load movies. Please reload to try again.</div></div>';
      return;
    }
    const c = id && collections.find(c => c.id === id);
    if (id && !c) { location.hash = 'movies'; return; }
    view.innerHTML = `<div class="page"><div class="page-head"><h1>${esc(c ? c.title : 'Movies')}</h1>
      <span class="count">${c ? c.movies.length : all.length} movies${c ? '' : ' · ' + collections.length + ' collections'}</span>
      ${c ? '<a class="btn btn-more page-btn" href="#movies">All collections</a>' : ''}</div>
      ${c ? `<div class="grid poster-grid movie-grid">${c.movies.map(card).join('')}</div>` :
        `<div class="chips">${collections.map(c => `<a class="chip" href="#movies/${esc(c.id)}">${esc(c.title)} (${c.movies.length})</a>`).join('')}</div>
        <div class="rows">${collections.map(c => `<section class="row"><div class="row-head"><h2>${esc(c.title)}</h2>
          <a class="see-all" href="#movies/${esc(c.id)}">See all ›</a></div>
          <div class="row-track-wrap"><div class="row-track">${c.movies.slice(0, 40).map(card).join('')}</div></div></section>`).join('')}</div>`}</div>`;
  }

  window.StreamBoxMovies = { ready, card, detail, render, sources, url, restore, updates, get newMovies() { return collections.find(c => c.id === 'new')?.movies || []; }, get all() { return all; } };
})();
