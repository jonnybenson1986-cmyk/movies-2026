// The Apple TV style pages: Discover (hero + shelves), "see all" grids, and a title page.
// Ported from the pasted home-page.js / movie-page.js and fitted into the app: they render into the app's
// view, reuse its rows, cards, My List and modal, and talk to TMDB through ./tmdb.js. Play opens "Where to
// watch" (the legal services that carry the title), which is what the pasted Play button did with a toast.

import { api, REGION } from './tmdb.js';
import { artworkManager as art } from './artwork-manager.js';
import { esc, formatRuntime, formatDate, getYear, formatMoney, certification, trailerOf, providerGroups, movieBadges, toItem } from './util.js';
import { attachFocusNav } from './focus.js';

const GENRES = [[28, 'Action'], [12, 'Adventure'], [16, 'Animation'], [35, 'Comedy'], [80, 'Crime'], [18, 'Drama'], [10751, 'Family'], [14, 'Fantasy'], [27, 'Horror'], [9648, 'Mystery'], [10749, 'Romance'], [878, 'Sci-Fi'], [53, 'Thriller']];
const NOTE = 'This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability by JustWatch via TMDB.';

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/></svg>',
  trailer: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3z" fill="currentColor"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M12 3v12M12 3 7 8M12 3l5 5"/></svg>',
};

const loading = view => { view.innerHTML = '<div class="atv-loading"><div class="spinner"></div></div>'; };
function failure(view, error, retry) {
  view.innerHTML = `<div class="page"><div class="empty"><b>Couldn’t load this page.</b><br>${esc(error.message)}<br>
    <button class="btn btn-more" data-atv="retry" style="margin-top:14px">Try again</button></div></div>`;
  view.querySelector('[data-atv=retry]').onclick = retry;
}
const items = list => (list || []).filter(m => m.poster_path).map(toItem);
const dots = parts => parts.filter(Boolean).join('<span class="atv-dot"></span>');

// ---- poster tilt on mouse hover (not on touch screens or with reduced motion)
function tilt(el) {
  if (!el || matchMedia('(hover: none), (prefers-reduced-motion: reduce)').matches) return;
  el.addEventListener('mousemove', e => {
    const r = el.getBoundingClientRect();
    el.style.transform = `perspective(900px) rotateY(${((e.clientX - r.left) / r.width - .5) * 14}deg) rotateX(${(-(e.clientY - r.top) / r.height + .5) * 14}deg) scale(1.03)`;
  });
  el.addEventListener('mouseleave', () => { el.style.transform = ''; });
}

function heroHTML(movie, { cert = '', actions = '', details = '' } = {}) {
  const badges = movieBadges(movie, cert).map(b => `<span class="atv-badge atv-badge-${b.kind}">${esc(b.label)}</span>`).join('');
  const sub = dots([movie.vote_average ? `<span class="atv-rating">★ ${movie.vote_average.toFixed(1)}</span>` : '', esc(getYear(movie.release_date)), esc(formatRuntime(movie.runtime))]);
  const genres = (movie.genres || []).slice(0, 4).map(g => `<span class="atv-genre">${esc(g.name)}</span>`).join('');
  return `<section class="atv-hero">
    <div class="atv-hero-bg">${movie.backdrop_path ? `<img src="${esc(art.getBackdropUrl(movie.backdrop_path, 'w1280'))}" alt="" fetchpriority="high" onerror="this.remove()">` : ''}</div>
    <div class="atv-hero-inner">
      <div class="atv-poster"><img src="${esc(art.getPosterUrl(movie.poster_path, 'w500'))}" alt="${esc(movie.title)} poster" onerror="this.src='/images/poster-placeholder.svg'"><span class="atv-glare" aria-hidden="true"></span></div>
      <div class="atv-meta">
        ${badges ? `<div class="atv-badges">${badges}</div>` : ''}
        <h1 class="atv-title">${esc(movie.title)}</h1>
        ${sub ? `<div class="atv-sub">${sub}</div>` : ''}
        ${genres ? `<div class="atv-genres">${genres}</div>` : ''}
        <p class="atv-desc">${esc(movie.overview || 'No description available.')}</p>
        <div class="atv-actions">${actions}</div>
        ${details ? `<div class="atv-details">${details}</div>` : ''}
      </div>
    </div></section>`;
}

const listLabel = (ctx, item) => (ctx.inList(item.key) ? '✓ In My List' : '+ My List');

function openTrailer(trailer, ctx) {
  ctx.openModal(`<div class="atv-trailer"><iframe title="${esc(trailer.name || 'Trailer')}" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.key)}?autoplay=1&rel=0&modestbranding=1"
    sandbox="allow-scripts allow-same-origin allow-presentation" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`);
}

async function share(movie, ctx) {
  const url = `${location.origin}${location.pathname}#title/${movie.id}`;
  try {
    if (navigator.share) await navigator.share({ title: movie.title, text: `Have a look at “${movie.title}”`, url });
    else { await navigator.clipboard.writeText(url); ctx.toast('Link copied'); }
  } catch (e) { if (e?.name !== 'AbortError') ctx.toast('Couldn’t share this title'); }
}

// Buttons carry data-atv; one listener on the page root handles them
function wireActions(root, ctx, { movie, trailer, item, watch }) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-atv]');
    if (!b) return;
    const action = b.dataset.atv;
    if (action === 'watch') watch();
    else if (action === 'details') location.hash = '#title/' + movie.id;
    else if (action === 'trailer' && trailer) openTrailer(trailer, ctx);
    else if (action === 'share') share(movie, ctx);
    else if (action === 'list') { ctx.toggleList(item); b.textContent = listLabel(ctx, item); }
  });
}

// ------------------------------------------------------------------ Discover
export async function renderDiscover(view, ctx) {
  loading(view);
  try {
    const [trending, top, popular] = await Promise.all([api.trending(), api.topRated(), api.popular()]);
    const genreRows = await Promise.all(GENRES.slice(0, 8).map(async ([id, name]) => ({ id, name, results: (await api.discover(id)).results })));
    const pool = popular.results.filter(m => m.backdrop_path && m.overview);
    const pick = pool[Math.floor(Date.now() / 864e5) % Math.max(1, Math.min(pool.length, 6))] || trending.results[0];
    const detail = pick ? await api.movie(pick.id).catch(() => null) : null;
    if (!ctx.isCurrent()) return;

    const movie = detail || pick;
    const item = movie ? toItem(movie) : null;
    const trailer = detail ? trailerOf(detail.videos) : null;
    const resume = ctx.history().filter(i => (i.type === 'movie' || i.type === 'title') && /^\d+$/.test(String(i.id)))
      .map(i => ({ key: 't:' + i.id, type: 'title', id: String(i.id), cat: 'Movies', name: i.name, year: i.year || '', vote: i.vote || '', poster: i.poster || '' }));

    const hero = movie ? heroHTML(movie, {
      cert: detail ? certification(detail.release_dates, REGION) : '',
      actions: `<button class="btn btn-play" data-atv="watch">${ICON.play}Where to watch</button>
        <button class="btn btn-more" data-atv="details">Details</button>
        ${trailer ? `<button class="btn btn-more" data-atv="trailer">${ICON.trailer}Trailer</button>` : ''}
        <button class="btn btn-more" data-atv="list">${listLabel(ctx, item)}</button>`,
    }) : '';

    view.innerHTML = `<div class="atv" id="atvRoot">${hero}<div class="rows${movie ? '' : ' no-hero'}">
      ${ctx.rowHTML('Continue Watching', resume.slice(0, 20))}
      ${ctx.rowHTML('Trending This Week', items(trending.results).slice(0, 20), '#discover/list/trending')}
      ${ctx.rowHTML('Top Rated', items(top.results).slice(0, 20), '#discover/list/top')}
      ${genreRows.map(g => ctx.rowHTML(g.name, items(g.results).slice(0, 20), '#discover/list/genre-' + g.id)).join('')}
      <p class="attrib">${NOTE}</p></div></div>`;

    const root = view.querySelector('#atvRoot');
    if (movie) wireActions(root, ctx, { movie, trailer, item, watch: () => { location.hash = `#title/${movie.id}/watch`; } });
    attachFocusNav(root);
    tilt(root.querySelector('.atv-poster'));
  } catch (error) { if (ctx.isCurrent()) failure(view, error, () => renderDiscover(view, ctx)); }
}

// ------------------------------------------------------------------ "See all" grids
const LISTS = {
  trending: { title: 'Trending This Week', load: p => api.trending(p) },
  top: { title: 'Top Rated', load: p => api.topRated(p) },
  popular: { title: 'Popular', load: p => api.popular(p) },
};
for (const [id, name] of GENRES) LISTS['genre-' + id] = { title: name, load: p => api.discover(id, p) };

export async function renderList(view, kind, ctx) {
  const list = LISTS[kind];
  if (!list) { location.hash = '#discover'; return; }
  loading(view);
  try {
    const pages = await Promise.all([1, 2, 3, 4, 5].map(p => list.load(p).catch(() => ({ results: [] }))));
    if (!ctx.isCurrent()) return;
    const seen = new Set();
    const all = items(pages.flatMap(p => p.results)).filter(i => !seen.has(i.key) && seen.add(i.key));
    view.innerHTML = `<div class="page"><div class="page-head"><h1>${esc(list.title)}</h1><span class="count">${all.length} movies</span>
      <a class="btn btn-more page-btn" href="#discover">Discover</a></div><div id="atvGrid"></div><p class="attrib">${NOTE}</p></div>`;
    const grid = view.querySelector('#atvGrid');
    ctx.mountGrid(grid, all);
    grid.querySelector('.grid')?.classList.add('poster-grid');
    attachFocusNav(grid);
  } catch (error) { if (ctx.isCurrent()) failure(view, error, () => renderList(view, kind, ctx)); }
}

// ------------------------------------------------------------------ Title page
function castRow(cast) {
  if (!cast.length) return '';
  const arrow = (side, path) => `<button class="row-arrow ${side}" aria-label="Scroll ${side}"><svg viewBox="0 0 24 24"><path d="${path}"/></svg></button>`;
  return `<section class="row"><div class="row-head"><h2>Cast</h2></div><div class="row-track-wrap">
    ${arrow('left', 'M15 18 9 12l6-6')}
    <div class="row-track">${cast.slice(0, 18).map(p => `<div class="atv-person" role="group" aria-label="${esc(p.name)}${p.character ? ', ' + esc(p.character) : ''}">
      <img src="${esc(art.getProfileUrl(p.profile_path, 'w185'))}" alt="" loading="lazy" width="120" height="120" onerror="this.src='/images/profile-placeholder.svg'">
      <span class="atv-person-name">${esc(p.name)}</span>${p.character ? `<span class="atv-person-role">${esc(p.character)}</span>` : ''}</div>`).join('')}</div>
    ${arrow('right', 'm9 18 6-6-6-6')}</div></section>`;
}

function watchSection(prov) {
  const body = prov.groups.length
    ? prov.groups.map(g => `<h3>${esc(g.label)}</h3><div class="atv-providers">${g.list.map(p => {
        const tag = prov.link ? 'a' : 'span';
        return `<${tag} class="atv-provider" ${prov.link ? `href="${esc(prov.link)}" target="_blank" rel="noopener noreferrer"` : ''}>
          ${p.logo_path ? `<img src="${esc(art.getPosterUrl(p.logo_path, 'w92'))}" alt="" width="40" height="40" loading="lazy">` : ''}<span>${esc(p.provider_name)}</span></${tag}>`;
      }).join('')}</div>`).join('')
    : '<p class="atv-muted">This title isn’t listed on a streaming service in Australia right now. It may be in cinemas, or coming soon.</p>';
  return `<section class="atv-section" id="atvWatch" tabindex="-1"><h2>Where to watch</h2>${body}
    ${prov.link ? `<p><a class="btn btn-more" href="${esc(prov.link)}" target="_blank" rel="noopener noreferrer">See every option on JustWatch ↗</a></p>` : ''}
    <p class="atv-muted">Availability in Australia, from JustWatch via TMDB.</p></section>`;
}

function detailsGrid(m) {
  const cells = [
    ['Overview', m.overview || 'No overview available.', true], ['Genres', (m.genres || []).map(g => g.name).join(', ')],
    ['Release', formatDate(m.release_date)], ['Runtime', formatRuntime(m.runtime)], ['Status', m.status], ['Original title', m.original_title !== m.title ? m.original_title : ''],
    ['Tagline', m.tagline], ['Budget', formatMoney(m.budget)], ['Revenue', formatMoney(m.revenue)],
    ['Rating', m.vote_average ? `${m.vote_average.toFixed(1)} / 10 (${(m.vote_count || 0).toLocaleString('en-AU')} votes)` : ''],
    ['Production', (m.production_companies || []).slice(0, 3).map(c => c.name).join(', ')],
  ].filter(([, v]) => v);
  return `<section class="atv-section"><h2>Details</h2><div class="atv-grid">${cells.map(([t, v, wide]) =>
    `<div class="atv-cell${wide ? ' wide' : ''}"><h3>${esc(t)}</h3><p>${esc(v)}</p></div>`).join('')}</div></section>`;
}

export async function renderTitle(view, arg, ctx) {
  const [id, extra] = String(arg || '').split('/');
  if (!/^[1-9]\d{0,9}$/.test(id)) { failure(view, new Error('That title doesn’t exist.'), () => { location.hash = '#discover'; }); return; }
  loading(view);
  try {
    const movie = await api.movie(id);
    if (!ctx.isCurrent()) return;
    const item = toItem(movie), trailer = trailerOf(movie.videos), prov = providerGroups(movie['watch/providers'], REGION);
    const similar = items((movie.recommendations?.results?.length ? movie.recommendations : movie.similar)?.results).filter(i => i.id !== String(movie.id)).slice(0, 20);
    const stream = prov.groups.find(g => g.kind === 'stream')?.list.slice(0, 4).map(p => p.provider_name).join(', ');
    const details = [['Watch on', stream], ['Language', movie.original_language?.toUpperCase()], ['Status', movie.status]]
      .filter(([, v]) => v).map(([k, v]) => `<span class="atv-detail"><b>${esc(k)}</b> ${esc(v)}</span>`).join('');

    view.innerHTML = `<div class="atv" id="atvRoot">${heroHTML(movie, {
      cert: certification(movie.release_dates, REGION), details,
      actions: `<button class="btn btn-play" data-atv="watch">${ICON.play}Where to watch</button>
        ${trailer ? `<button class="btn btn-more" data-atv="trailer">${ICON.trailer}Trailer</button>` : ''}
        <button class="btn btn-more" data-atv="list">${listLabel(ctx, item)}</button>
        <button class="btn btn-more" data-atv="share">${ICON.share}Share</button>`,
    })}<div class="atv-body">${watchSection(prov)}${castRow(movie.credits?.cast || [])}${ctx.rowHTML('More like this', similar)}${detailsGrid(movie)}
      <p class="attrib">${NOTE}</p></div></div>`;

    const root = view.querySelector('#atvRoot');
    const goWatch = () => { const s = root.querySelector('#atvWatch'); s.scrollIntoView({ behavior: 'smooth', block: 'start' }); s.focus({ preventScroll: true }); };
    wireActions(root, ctx, { movie, trailer, item, watch: goWatch });
    attachFocusNav(root);
    tilt(root.querySelector('.atv-poster'));
    if (extra === 'watch') requestAnimationFrame(goWatch);
  } catch (error) { if (ctx.isCurrent()) failure(view, error, () => renderTitle(view, arg, ctx)); }
}
