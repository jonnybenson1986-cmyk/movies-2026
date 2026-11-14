/* Generated from js/movies-ui.js (sha 0ab562a4fefc44d4) by scripts/build-legacy-js.mjs for older TV browsers. Do not edit. */
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
    const esc = s => String(s !== null && s !== void 0 ? s : '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const color = name => {
        let h = 0;
        for (const c of name)
            h = (h * 31 + c.charCodeAt(0)) | 0;
        h = Math.abs(h) % 360;
        return `linear-gradient(150deg, hsl(${h} 34% 27%), hsl(${(h + 30) % 360} 38% 10%))`;
    };
    const url = (movie, index = 0) => sources[index].base + movie.id;
    let collections = [], all = [], failed = false;
    function apply(data, detail) {
        const unique = new Map();
        collections = data.collections.map(c => (Object.assign(Object.assign({}, c), { movies: c.movies.map(m => {
                const movie = unique.get(m.id) || Object.assign(Object.assign({}, m), { key: 'm:' + m.id, type: 'movie', cat: 'Movies', source: m.source || 'KiduyuTv', collection: c.title, url: url(m) });
                unique.set(m.id, movie);
                return movie;
            }) })));
        all = [...unique.values()];
        failed = false;
        window.dispatchEvent(new CustomEvent('streambox-movies-updated', { detail }));
    }
    const updates = window.StreamBoxMovieCatalog.create({ onUpdate: apply, onStatus: status => {
            failed = !collections.length && status.phase === 'failed';
            window.dispatchEvent(new CustomEvent('streambox-movie-update-status', { detail: status }));
        } });
    const ready = updates.ready;
    function restore(saved) {
        if ((saved === null || saved === void 0 ? void 0 : saved.type) !== 'movie' || saved.catalog || saved.key !== 'm:' + saved.id)
            return null;
        const m = window.StreamBoxMovieCatalog.normalizeMovie(saved);
        return m ? Object.assign(Object.assign({}, m), { key: 'm:' + m.id, type: 'movie', cat: 'Movies', collection: 'Saved movie', url: url(m) }) : null;
    }
    function card(m) {
        const meta = [m.year, m.vote ? '★ ' + m.vote : ''].filter(Boolean).join(' · ');
        const type = m.mediaType === 'tv' || m.mediaType === 'anime' ? 'tv' : 'movie'; // TMDB endpoint used for artwork
        return `<button class="card apple poster movie-card" data-key="${esc(m.key)}" data-art-id="${esc(m.id)}" data-art-type="${type}" aria-label="${esc(m.name)}">
      <span class="art" style="--tile:${color(m.name)}"><span class="badge">MOVIE</span>
      <span class="art-year">${esc(m.year)}</span><span class="art-title">${esc(m.name)}</span></span>
      <span class="caption"><span class="name">${esc(m.name)}</span><span class="meta">${esc(meta)}</span></span></button>`;
    }
    // One featured title for the hero, the same all day
    function featured() {
        const pool = all.filter(m => (m.overview || '').length > 80 && m.year);
        return pool.length ? pool[Math.floor(Date.now() / 864e5) % pool.length] : null;
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
        var _a;
        if (failed || !collections.length) {
            view.innerHTML = '<div class="page"><div class="page-head"><h1>Movies</h1></div><div class="empty">Couldn’t load movies. Please reload to try again.</div></div>';
            return;
        }
        const c = id && collections.find(c => c.id === id);
        if (id && !c) {
            location.hash = 'movies';
            return;
        }
        if (c) {
            view.innerHTML = `<div class="page"><div class="page-head"><h1>${esc(c.title)}</h1>
        <span class="count">${c.movies.length} movies</span>
        <a class="btn btn-more page-btn" href="#movies">All collections</a></div>
        <div class="grid poster-grid movie-grid">${c.movies.map(card).join('')}</div></div>`;
            return;
        }
        const pick = featured();
        const hero = pick ? `<section class="hero movies-hero" data-art-id="${esc(pick.id)}" data-art-type="${pick.mediaType === 'tv' || pick.mediaType === 'anime' ? 'tv' : 'movie'}">
        <div class="hero-bg" style="background-image:${color(pick.name)}"></div>
        <div class="hero-content"><span class="hero-tag">Featured</span><h1>${esc(pick.name)}</h1>
          <p class="meta-line">${esc([pick.year, pick.vote ? '★ ' + pick.vote : '', pick.collection].filter(Boolean).join(' · '))}</p>
          <p>${esc(pick.overview)}</p>
          <div class="hero-actions"><button class="btn btn-play" data-key="${esc(pick.key)}">Details</button></div></div></section>` : '';
        view.innerHTML = `${hero}<div class="rows${pick ? '' : ' no-hero'}">
      <div class="chips">${collections.map(c => `<a class="chip" href="#movies/${esc(c.id)}">${esc(c.title)}</a>`).join('')}</div>
      ${collections.map(c => `<section class="row"><div class="row-head"><h2>${esc(c.title)}</h2>
        <a class="see-all" href="#movies/${esc(c.id)}">See all ›</a></div>
        <div class="row-track-wrap"><div class="row-track">${c.movies.slice(0, 40).map(card).join('')}</div></div></section>`).join('')}
      ${((_a = window.StreamBoxArt) === null || _a === void 0 ? void 0 : _a.enabled()) ? '<p class="attrib">This product uses the TMDB API but is not endorsed or certified by TMDB.</p>' : ''}</div>`;
    }
    window.StreamBoxMovies = { ready, card, detail, render, sources, url, restore, updates, get newMovies() { var _a; return ((_a = collections.find(c => c.id === 'new')) === null || _a === void 0 ? void 0 : _a.movies) || []; }, get all() { return all; } };
})();
