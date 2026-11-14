/* Generated from js/classics.js (sha a15edf820edc15da) by scripts/build-legacy-js.mjs for older TV browsers. Do not edit. */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/* Free Classics: public-domain feature films from the Internet Archive (archive.org), played in StreamBox's own
   player (so resume, full screen and AirPlay work). Only films the Archive lists with a public-domain mark are
   shown. The top half is plain logic (no page code) so it can be tested on its own. */
(() => {
    'use strict';
    const ARCHIVE = 'https://archive.org';
    const PD = 'mediatype:movies AND licenseurl:*publicdomain*';
    // id, shelf title, what to search for
    const SHELVES = [
        ['popular', 'Most Watched', 'collection:feature_films'],
        ['comedy', 'Comedy', 'collection:Comedy_Films'],
        ['noir', 'Film Noir & Crime', 'collection:Film_Noir'],
        ['scifi', 'Sci-Fi & Horror', 'collection:SciFi_Horror'],
        ['silent', 'Silent Films', 'collection:silent_films'],
        ['western', 'Westerns', 'collection:feature_films AND subject:(western OR westerns)'],
        ['adventure', 'Adventure', 'collection:feature_films AND subject:(adventure)'],
        ['mystery', 'Mystery & Thrillers', 'collection:feature_films AND subject:(mystery OR thriller)'],
    ];
    const shelfById = id => SHELVES.find(s => s[0] === id) || null;
    const ADULT = /\b(sex|sexy|nude|nudist|naked|erotic|burlesque|striptease|stag|xxx|adults? only)\b/i; // old exploitation reels: left out of a family app
    const esc = s => String(s !== null && s !== void 0 ? s : '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const first = v => { var _a; return String((_a = [].concat(v !== null && v !== void 0 ? v : '')[0]) !== null && _a !== void 0 ? _a : '').trim(); };
    const plain = html => first(html).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
    function searchUrl(query, { rows = 24, page = 1 } = {}) {
        const p = new URLSearchParams({ q: `${query} AND ${PD}`, rows, page, output: 'json', 'sort[]': 'downloads desc' });
        return `${ARCHIVE}/advancedsearch.php?${p}&fl[]=identifier&fl[]=title&fl[]=year&fl[]=description&fl[]=runtime`;
    }
    const shelfUrl = (id, opts) => { const s = shelfById(id); return s ? searchUrl(s[2], opts) : ''; };
    const findUrl = (text, opts) => searchUrl(`collection:feature_films AND (${String(text).replace(__sbRe("[^\\p{L}\\p{N} ]", "gu"), ' ').replace(/\s+/g, ' ').trim() || 'film'})`, opts);
    function filmItem(d) {
        const id = first(d === null || d === void 0 ? void 0 : d.identifier), name = plain(d === null || d === void 0 ? void 0 : d.title);
        if (!/^[\w.-]{1,120}$/.test(id) || !name || ADULT.test(name))
            return null;
        const year = /^\d{4}$/.test(first(d.year)) ? first(d.year) : '';
        return { id, name, year, overview: plain(d.description).slice(0, 600), runtime: first(d.runtime), poster: `${ARCHIVE}/services/img/${encodeURIComponent(id)}`, href: '#classics/film/' + encodeURIComponent(id) };
    }
    const films = docs => { const seen = new Set(); return (docs || []).map(filmItem).filter(f => f && !seen.has(f.name.toLowerCase()) && seen.add(f.name.toLowerCase())); };
    // The files a browser can play, best first: the full h.264 MP4, then the smaller 512 kb MP4
    function playable(meta) {
        var _a;
        const id = first((_a = meta === null || meta === void 0 ? void 0 : meta.metadata) === null || _a === void 0 ? void 0 : _a.identifier);
        if (!id)
            return [];
        const mp4 = (meta.files || []).filter(f => /\.mp4$/i.test(f.name || '') && !/\.ia\.mp4$/i.test(f.name));
        const rank = f => (/_512kb\.mp4$/i.test(f.name) ? 1 : f.format === 'h.264' ? 0 : 2);
        return mp4.sort((a, b) => rank(a) - rank(b) || (+b.size || 0) - (+a.size || 0)).slice(0, 2).map(f => ({
            url: `${ARCHIVE}/download/${encodeURIComponent(id)}/${String(f.name).split('/').map(encodeURIComponent).join('/')}`,
            small: /_512kb\.mp4$/i.test(f.name), mb: Math.round((+f.size || 0) / 1e6), seconds: Math.round(+f.length || 0),
        }));
    }
    // What the app's player needs: it treats this like one of the person's own videos
    const playItem = (film, file) => ({ key: 'ia:' + film.id, id: film.id, type: 'movie', catalog: 'personal', name: film.name, year: film.year, overview: film.overview, url: file.url, source: 'Internet Archive' });
    const length = s => (s > 0 ? `${Math.floor(s / 3600) ? Math.floor(s / 3600) + 'h ' : ''}${Math.round((s % 3600) / 60)}m` : '');
    function parseRoute(arg = '') {
        const [a = '', ...rest] = String(arg).split('/');
        const tail = rest.join('/');
        if (a === 'film' && /^[\w.-]{1,120}$/.test(tail))
            return { page: 'film', id: tail };
        if (a === 'search')
            return { page: 'search', search: tail };
        if (shelfById(a))
            return { page: 'shelf', shelf: a };
        return { page: 'home' };
    }
    const pure = { SHELVES, shelfById, searchUrl, shelfUrl, findUrl, filmItem, films, playable, playItem, length, parseRoute, plain };
    if (typeof module !== 'undefined')
        module.exports = pure;
    if (typeof window === 'undefined' || typeof document === 'undefined')
        return;
    // ================================================================ page (browser only)
    const cache = new Map();
    const getJSON = url => { if (!cache.has(url)) {
        const p = fetch(url).then(r => { if (!r.ok)
            throw new Error(`HTTP ${r.status}`); return r.json(); });
        p.catch(() => cache.delete(url));
        cache.set(url, p);
    } return cache.get(url); };
    const load = (url) => __awaiter(void 0, void 0, void 0, function* () { var _a; return films((_a = (yield getJSON(url)).response) === null || _a === void 0 ? void 0 : _a.docs); });
    const card = f => `<a class="card apple poster classic-card" href="${esc(f.href)}" aria-label="${esc(f.name)}${f.year ? ', ' + esc(f.year) : ''}">
    <span class="art has-art"><img class="art-img" loading="lazy" decoding="async" src="${esc(f.poster)}" alt="" onerror="this.parentElement.classList.remove('has-art');this.remove()"><span class="art-title">${esc(f.name)}</span></span>
    <span class="caption"><span class="name">${esc(f.name)}</span><span class="meta">${esc([f.year, f.runtime].filter(Boolean).join(' · '))}</span></span></a>`;
    const shelf = (title, list, href) => (list.length ? `<section class="row"><div class="row-head"><h2>${esc(title)}</h2>${href ? `<a class="see-all" href="${esc(href)}">See all ›</a>` : ''}</div>
    <div class="row-track-wrap"><button class="row-arrow left" aria-label="Scroll left"><svg viewBox="0 0 24 24"><path d="M15 18 9 12l6-6"/></svg></button>
    <div class="row-track">${list.map(card).join('')}</div>
    <button class="row-arrow right" aria-label="Scroll right"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></button></div></section>` : '');
    const NOTE = '<p class="classics-note">Public-domain films from the <a href="https://archive.org/details/feature_films" target="_blank" rel="noopener noreferrer">Internet Archive</a>. Only titles the Archive marks as public domain are listed. They play in StreamBox’s own player.</p>';
    const head = (title, sub, search = '') => `<div class="page-head"><h1>${esc(title)}</h1><span class="count">${esc(sub)}</span><a class="btn btn-more page-btn" href="#movies">‹ Movies</a></div>
    <form class="classics-search" id="classicsSearch"><input type="search" name="q" maxlength="80" value="${esc(search)}" placeholder="Find a classic film…" autocomplete="off" aria-label="Find a classic film"><button class="btn btn-play" type="submit">Search</button></form>
    <div class="chips"><a class="chip" href="#classics">All</a>${SHELVES.map(s => `<a class="chip" href="#classics/${s[0]}">${esc(s[1])}</a>`).join('')}</div>`;
    function render(view_1, arg_1) {
        return __awaiter(this, arguments, void 0, function* (view, arg, ctx = {}) {
            var _a;
            const live = ctx.isCurrent || (() => true), r = parseRoute(arg);
            const wire = () => { var _a; return (_a = view.querySelector('#classicsSearch')) === null || _a === void 0 ? void 0 : _a.addEventListener('submit', e => { e.preventDefault(); const t = new FormData(e.currentTarget).get('q').trim().slice(0, 80); location.hash = t ? 'classics/search/' + encodeURIComponent(t) : 'classics'; }); };
            const fail = e => { view.innerHTML = `<div class="page">${head('Free Classics', '')}<div class="empty"><b>Couldn’t load the films.</b><br>${esc(e.message)}<br><button class="btn btn-more" id="classicsRetry" style="margin-top:14px">Try again</button></div></div>`; wire(); view.querySelector('#classicsRetry').onclick = () => render(view, arg, ctx); };
            const wait = (title, sub, search) => { view.innerHTML = `<div class="page">${head(title, sub, search)}<div class="empty"><div class="spinner"></div></div></div>`; wire(); };
            if (r.page === 'film') {
                view.innerHTML = '<div class="page"><div class="empty"><div class="spinner"></div></div></div>';
                try {
                    const meta = yield getJSON(`${ARCHIVE}/metadata/${encodeURIComponent(r.id)}`);
                    if (!live())
                        return;
                    const film = filmItem(Object.assign(Object.assign({}, meta.metadata), { identifier: r.id })), files = playable(meta);
                    if (!film)
                        throw new Error('That film couldn’t be found.');
                    view.innerHTML = `<div class="page"><div class="classics-film">
          <img class="classics-poster" src="${esc(film.poster)}" alt="" onerror="this.remove()">
          <div><a class="classics-back" href="#classics">‹ Free Classics</a><h1>${esc(film.name)}</h1>
            <p class="classics-meta">${esc([film.year, length((_a = files[0]) === null || _a === void 0 ? void 0 : _a.seconds) || film.runtime, 'Public domain'].filter(Boolean).join(' · '))}</p>
            <div class="classics-actions">${files.length ? files.map((f, i) => `<button class="btn ${i ? 'btn-more' : 'btn-play'}" type="button" data-classic-play="${i}">${i ? '' : '▶ '}${f.small ? `${i ? 'Smaller file' : 'Play'} (${f.mb} MB, saves data)` : `Play${f.mb ? ` · ${f.mb} MB` : ''}`}</button>`).join('') : '<p class="classics-meta">This film has no version a browser can play.</p>'}</div>
            <p class="classics-about">${esc(film.overview || 'No description.')}</p>
            <p class="classics-meta"><a href="${ARCHIVE}/details/${esc(encodeURIComponent(film.id))}" target="_blank" rel="noopener noreferrer">About this film on the Internet Archive ↗</a></p></div></div>${NOTE}</div>`;
                    view.querySelectorAll('[data-classic-play]').forEach(b => { b.onclick = () => { var _a; return (_a = ctx.play) === null || _a === void 0 ? void 0 : _a.call(ctx, playItem(film, files[+b.dataset.classicPlay])); }; });
                }
                catch (e) {
                    if (live())
                        fail(e);
                }
                return;
            }
            try {
                if (r.page === 'home') {
                    wait('Free Classics', 'Public-domain films');
                    const rows = yield Promise.all(SHELVES.map(s => load(shelfUrl(s[0])).catch(() => [])));
                    if (!live())
                        return;
                    if (!rows.some(l => l.length))
                        throw new Error('The Internet Archive didn’t answer.');
                    view.innerHTML = `<div class="page">${head('Free Classics', 'Public-domain films')}<div class="rows">${SHELVES.map((s, i) => shelf(s[1], rows[i], '#classics/' + s[0])).join('')}</div>${NOTE}</div>`;
                }
                else {
                    const s = r.page === 'shelf' ? shelfById(r.shelf) : null, title = s ? s[1] : `Results for “${r.search}”`;
                    wait('Free Classics', title, r.search);
                    const list = yield load(s ? shelfUrl(s[0], { rows: 120 }) : findUrl(r.search, { rows: 60 }));
                    if (!live())
                        return;
                    view.innerHTML = `<div class="page">${head('Free Classics', `${title} · ${list.length} films`, r.search)}${list.length ? `<div class="grid poster-grid classics-grid">${list.map(card).join('')}</div>` : '<div class="empty">No films found.</div>'}${NOTE}</div>`;
                }
                wire();
                view.querySelectorAll('.chips .chip').forEach(c => c.classList.toggle('active', c.getAttribute('href') === (r.page === 'shelf' ? '#classics/' + r.shelf : r.page === 'home' ? '#classics' : '')));
            }
            catch (e) {
                if (live())
                    fail(e);
            }
        });
    }
    window.StreamBoxClassics = Object.assign(Object.assign({}, pure), { render });
})();
