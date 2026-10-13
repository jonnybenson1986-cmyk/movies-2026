/* StreamBox Movies — curated lists from KiduyuTv */
(function () {
  'use strict';
  const TMDB = 'https://image.tmdb.org/t/p';
  let collections = [];
  const map = new Map();

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function tileColor(name) { const h = hash(name) % 360; return 'linear-gradient(135deg, hsl(' + h + ' 55% 32%), hsl(' + ((h + 40) % 360) + ' 60% 14%))'; }

  async function load() {
    try {
      // Each pack loads on its own, so a missing or broken file doesn't blank the whole Movies tab
      const packs = await Promise.all(['a', 'b', 'c', 'd'].map(async k => {
        try { const r = await fetch('/data/movies-' + k + '.json'); return r.ok ? await r.json() : []; } catch (e) { return []; }
      }));
      const cols = packs.flat();
      collections = cols.map((col, ci) => ({
        id: col.id, title: col.title,
        movies: (col.movies || []).map(m => {
          const it = {
            key: 'm:' + m.id + ':' + ci, type: 'movie', id: m.id, name: m.title,
            overview: m.overview || '', poster: m.poster || '', backdrop: m.backdrop || '',
            vote: m.vote || 0, year: m.year || '', collection: col.title
          };
          map.set(it.key, it);
          return it;
        })
      }));
    } catch (e) { console.warn('movies', e); collections = []; }
  }

  function card(m) {
    const poster = m.poster ? TMDB + '/w342' + m.poster : '';
    const meta = [m.year, m.vote ? '\u2605 ' + m.vote : ''].filter(Boolean).join(' \u00b7 ');
    return '<button class="card poster" data-movie-key="' + esc(m.key) + '" aria-label="' + esc(m.name) + '">' +
      (poster ? '<img class="poster-img" loading="lazy" src="' + esc(poster) + '" alt="" onerror="this.remove()">' : '') +
      '<span class="tile" style="--tile:' + tileColor(m.name) + '"><span class="name">' + esc(m.name) + '</span><span class="meta">' + esc(meta) + '</span></span></button>';
  }

  function row(title, list, seeAll) {
    if (!list.length) return '';
    return '<section class="row"><div class="row-head"><h2>' + esc(title) + '</h2>' +
      (seeAll ? '<a class="see-all" href="' + esc(seeAll) + '">See all \u203a</a>' : '') + '</div>' +
      '<div class="row-track-wrap"><div class="row-track">' + list.map(card).join('') + '</div></div></section>';
  }

  function showDetail(m) {
    const modal = document.getElementById('modal');
    const cardEl = document.getElementById('modalCard');
    if (!modal || !cardEl) return;
    const poster = m.poster ? TMDB + '/w342' + m.poster : '';
    const backdrop = m.backdrop ? TMDB + '/w780' + m.backdrop : '';
    cardEl.innerHTML = '<button class="icon-btn modal-close" onclick="document.getElementById(\'modal\').hidden=true;document.body.style.overflow=\'\'" aria-label="Close">' +
      '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button>' +
      '<div class="modal-hero movie-hero" style="--tile:' + tileColor(m.name) + '">' +
      (backdrop ? '<img src="' + esc(backdrop) + '" alt="" onerror="this.remove()">' : '') +
      (poster ? '<img class="poster-side" src="' + esc(poster) + '" alt="">' : '') +
      '<div class="inner" style="padding-left:' + (poster ? 'clamp(120px,22vw,180px)' : '28px') + '"><h2>' + esc(m.name) + '</h2>' +
      '<a class="btn btn-play" href="https://www.themoviedb.org/movie/' + m.id + '" target="_blank" rel="noopener" style="font-size:13px;padding:6px 12px">TMDB \u2197</a></div></div>' +
      '<div class="modal-body"><div class="facts">' +
      (m.year ? '<span>' + esc(m.year) + '</span>' : '') +
      (m.vote ? '<span class="ok">\u2605 ' + m.vote + '</span>' : '') +
      (m.collection ? '<span>' + esc(m.collection) + '</span>' : '') +
      '</div><p>' + (esc(m.overview) || 'No synopsis available.') + '</p>' +
      '<p style="color:var(--muted);font-size:12px;margin-top:16px">Curated from KiduyuTv lists. Discovery metadata only.</p></div>';
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  async function renderMovies(colId) {
    await loadPromise;
    const view = document.getElementById('view');
    if (!view) return;
    if (colId) {
      const col = collections.find(c => c.id === colId);
      if (!col) { location.hash = 'movies'; return; }
      view.innerHTML = '<div class="page"><div class="page-head"><h1>' + esc(col.title) + '</h1><span class="count">' + col.movies.length + ' titles</span>' +
        '<a class="btn btn-more page-btn" href="#movies">All collections</a></div>' +
        '<div class="grid poster-grid" style="padding:12px var(--gutter) 40px">' + col.movies.map(card).join('') + '</div></div>';
      return;
    }
    const total = collections.reduce((n, c) => n + c.movies.length, 0);
    view.innerHTML = '<div class="page"><div class="page-head"><h1>Movies</h1><span class="count">' + total + ' titles \u00b7 ' + collections.length + ' collections</span></div>' +
      '<div class="chips">' + collections.map(c => '<a class="chip" href="#movies/' + esc(c.id) + '">' + esc(c.title) + '</a>').join('') + '</div>' +
      '<div class="rows">' + collections.map(c => row(c.title, c.movies.slice(0, 30), '#movies/' + c.id)).join('') + '</div></div>';
  }

  const loadPromise = load();

  async function onHash() {
    const raw = decodeURIComponent(location.hash.slice(1) || 'home');
    const [name, ...rest] = raw.split('/');
    if (name !== 'movies') return false;
    document.querySelectorAll('[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === 'movies'));
    const top = document.getElementById('topbar');
    if (top) top.classList.add('solid');
    await renderMovies(rest.join('/'));
    return true;
  }

  addEventListener('hashchange', () => { onHash(); });
  setTimeout(() => onHash(), 200);
  setTimeout(() => onHash(), 1000);

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-movie-key]');
    if (btn) {
      const m = map.get(btn.dataset.movieKey);
      if (m) showDetail(m);
    }
  });
})();
