/* TMDB-powered release rows for the Movies page. */
(() => {
  'use strict';
  const movies = window.StreamBoxMovies;
  const art = window.StreamBoxArt;
  if (!movies || !art?.request) return;
  const ids = ['new_movies_nov_2026', 'new_series_nov_2026', 'coming_soon_dec_2026'];
  const labels = {
    new_movies_nov_2026: 'New Movies – November 2026',
    new_series_nov_2026: 'New Series & Seasons – November 2026',
    coming_soon_dec_2026: 'Coming Soon – December 2026',
  };
  const requests = new Map();
  let cache = null;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  function params(mediaType, from, to, sort) {
    return { language: 'en-US', include_adult: false, include_video: false, page: 1, sort_by: sort,
      [mediaType === 'tv' ? 'first_air_date.gte' : 'primary_release_date.gte']: from,
      [mediaType === 'tv' ? 'first_air_date.lte' : 'primary_release_date.lte']: to,
      'vote_count.gte': 0 };
  }
  async function discover(type, mediaType, from, to, sort) {
    const data = await art.request('discover/' + type, params(mediaType, from, to, sort));
    return (data.results || []).map(raw => {
      const date = mediaType === 'tv' ? raw.first_air_date : raw.release_date;
      if (!Number.isSafeInteger(raw.id) || raw.id <= 0 || !date) return null;
      return { id: raw.id, name: raw.title || raw.name || 'Untitled', overview: raw.overview || '',
        year: date.slice(0, 4), releaseDate: date, vote: Number(raw.vote_average) || 0, mediaType };
    }).filter(Boolean);
  }
  function load() {
    if (cache) return cache;
    cache = Promise.all([
      discover('movie', 'movie', '2026-11-01', '2026-11-30', 'primary_release_date.desc'),
      discover('tv', 'tv', '2026-11-01', '2026-11-30', 'first_air_date.desc'),
      discover('movie', 'movie', '2026-12-01', '2026-12-31', 'primary_release_date.asc'),
      discover('tv', 'tv', '2026-12-01', '2026-12-31', 'first_air_date.asc'),
    ]).then(([novMovies, novTv, decMovies, decTv]) => [
      { id: ids[0], title: labels[ids[0]], movies: novMovies },
      { id: ids[1], title: labels[ids[1]], movies: novTv },
      { id: ids[2], title: labels[ids[2]], movies: [...decMovies, ...decTv] },
    ]).catch(error => { cache = null; throw error; });
    return cache;
  }
  function card(item) {
    const tv = item.mediaType === 'tv';
    const type = tv ? 'tv' : 'movie';
    const date = item.releaseDate || '';
    return `<a class="card apple poster movie-card" href="#movy/detail/${type}/${esc(item.id)}" data-art-id="${esc(item.id)}" data-art-type="${type}" aria-label="Open ${esc(item.name)} in Movy">
      <span class="art"><span class="badge">${tv ? 'SERIES' : 'MOVIE'}</span><span class="art-year">${esc(date || item.year)}</span><span class="art-title">${esc(item.name)}</span></span>
      <span class="caption"><span class="name">${esc(item.name)}</span><span class="meta">${esc(date)}</span></span></a>`;
  }
  function row(collection) {
    return `<section class="row" data-release-row="${collection.id}"><div class="row-head"><h2>${esc(collection.title)}</h2><a class="see-all" href="#movies/releases/${collection.id}">See all ›</a></div><div class="row-track-wrap"><div class="row-track">${collection.movies.slice(0, 24).map(card).join('')}</div></div></section>`;
  }
  async function home(view) {
    const rows = view.querySelector('.rows');
    if (!rows || rows.dataset.releaseRows === '1') return;
    rows.dataset.releaseRows = '1';
    const chips = rows.querySelector('.chips');
    if (chips) chips.insertAdjacentHTML('beforeend', ids.map(id => `<a class="chip" href="#movies/releases/${id}">${esc(labels[id])}</a>`).join(''));
    rows.insertAdjacentHTML('beforeend', ids.map(id => row({ id, title: labels[id], movies: [] })).join(''));
    try {
      const collections = await load();
      if (!view.isConnected || location.hash.slice(1).split('/')[0] !== 'movies') return;
      collections.forEach(c => {
        const el = rows.querySelector('[data-release-row="' + c.id + '"] .row-track');
        if (el) el.innerHTML = c.movies.length ? c.movies.slice(0, 24).map(card).join('') : '<p class="movie-note">No titles listed yet.</p>';
      });
    } catch (error) {
      rows.querySelectorAll('[data-release-row] .row-track').forEach(el => { el.innerHTML = '<p class="movie-note">Release listings temporarily unavailable. Try again later.</p>'; });
      console.warn('Release collections', error?.message || error);
    }
  }
  async function collectionPage(view, id) {
    view.innerHTML = `<div class="page"><div class="page-head"><h1>${esc(labels[id] || 'Release collections')}</h1><a class="btn btn-more page-btn" href="#movies">All collections</a></div><div class="empty" role="status">Loading release dates…</div></div>`;
    try {
      const collection = (await load()).find(c => c.id === id);
      if (!collection) throw new Error('Collection not found');
      view.innerHTML = `<div class="page"><div class="page-head"><h1>${esc(collection.title)}</h1><span class="count">${collection.movies.length} titles</span><a class="btn btn-more page-btn" href="#movies">All collections</a></div><div class="grid poster-grid movie-grid">${collection.movies.map(card).join('')}</div></div>`;
    } catch {
      view.querySelector('.empty').textContent = 'Couldn’t load this release collection. Check your connection and try again.';
    }
  }
  const original = movies.render.bind(movies);
  movies.render = function(view, arg) {
    if (String(arg || '').startsWith('releases/')) {
      const id = String(arg).slice('releases/'.length);
      if (ids.includes(id)) { collectionPage(view, id); return; }
    }
    original(view, arg);
    if (!arg) home(view);
  };
})();
