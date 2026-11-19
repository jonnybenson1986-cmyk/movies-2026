/* Generated from js/music-ui.js (sha 4420ee9981df4ff3) by scripts/build-legacy-js.mjs for older TV browsers. Do not edit. */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/* The Music pages, laid out the way Apple Music does it: Listen Now, Browse (genres), Radio, Library (your music,
   playlists, favourites, history and artists and albums), your music server, search, and pages for a playlist, an
   album and an artist. Plus the mini player at the bottom and the full-screen Now Playing view.
   Data and playback come from music.js (window.StreamBoxMusic); your own files from music-local.js. */
(() => {
    'use strict';
    const M = window.StreamBoxMusic;
    if (!M || !M.player)
        return;
    const { esc, clock, GENRES, genreById, player, data, server } = M;
    const L = () => window.StreamBoxMusicLocal || null;
    const $ = (s, root = document) => root.querySelector(s);
    let toast = () => { }, openModal = null, closeModal = () => { };
    const ICON = {
        play: '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/></svg>',
        pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" stroke-width="3.4"/></svg>',
        prev: '<svg viewBox="0 0 24 24"><path d="M20 5 9 12l11 7zM5 5v14" fill="currentColor"/></svg>',
        next: '<svg viewBox="0 0 24 24"><path d="m4 5 11 7-11 7zM19 5v14" fill="currentColor"/></svg>',
        heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
        close: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
        down: '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
        shuffle: '<svg viewBox="0 0 24 24"><path d="M3 7h3c4 0 6 10 10 10h5M3 17h3c1.5 0 2.7-1.4 3.8-3.2M21 7h-5c-1.3 0-2.4 1-3.4 2.4M18 4l3 3-3 3M18 14l3 3-3 3"/></svg>',
        note: '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
        search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
        check: '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>',
        more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg>',
        plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
        folder: '<svg viewBox="0 0 24 24"><path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
        server: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>',
        list: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h7M17 15v6M14 18h6"/></svg>',
        person: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
        disc: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/></svg>',
        clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    };
    // ---- pieces
    const cover = (item, cls = '') => `<span class="am-cover ${cls}">${item.art ? `<img loading="lazy" decoding="async" src="${esc(item.art)}" alt="" onerror="this.remove()">` : ''}${ICON.note}</span>`;
    const favBtn = (item, favs) => { const on = M.isFav(favs, item.key); return `<button type="button" class="am-heart${on ? ' on' : ''}" data-m-fav="${esc(item.key)}" aria-pressed="${on}" aria-label="Favourite ${esc(item.name)}">${ICON.heart}</button>`; };
    const moreBtn = item => `<button type="button" class="am-more" data-m-more="${esc(item.key)}" aria-label="More for ${esc(item.name)}">${ICON.more}</button>`;
    let shown = new Map(), lists = [], context = {};
    const reg = list => { list.forEach(i => shown.set(i.key, i)); lists.push(list); return lists.length - 1; };
    const songCard = (item, li, favs) => `<div class="am-card" data-m-play="${esc(item.key)}" data-m-list="${li}">
    <button type="button" class="am-tile" data-m="play" aria-label="Play ${esc(item.name)}${item.artist ? ', ' + esc(item.artist) : ''}">${cover(item)}<span class="am-go">${ICON.play}</span>${item.type === 'radio' ? '<span class="am-live">LIVE</span>' : ''}</button>
    ${favBtn(item, favs)}<span class="am-name">${esc(item.name)}</span><span class="am-by">${esc(item.artist || item.genre || '')}</span></div>`;
    const linkCard = c => `<a class="am-card am-link" href="${esc(c.href)}"><span class="am-tile">${cover(c)}</span><span class="am-name">${esc(c.name)}</span><span class="am-by">${esc([c.by, c.note && c.kind === 'album' ? c.note : '', c.count && c.kind === 'mine' ? `${c.count} song${c.count === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · '))}</span></a>`;
    const artistCard = a => `<a class="am-card am-artist" href="${esc(a.href)}"><span class="am-tile">${cover(a)}</span><span class="am-name">${esc(a.name)}${a.verified ? ' <i class="am-ok" title="Verified artist">' + ICON.check + '</i>' : ''}</span><span class="am-by">${esc(a.sub || (a.followers ? `${a.followers.toLocaleString()} followers` : ''))}</span></a>`;
    const shelf = (title, cards, { href = '', cls = '' } = {}) => (cards ? `<section class="row am-shelf ${cls}">
    <div class="row-head"><h2>${esc(title)}</h2>${href ? `<a class="see-all" href="${esc(href)}">See all ›</a>` : ''}</div>
    <div class="row-track-wrap"><button class="row-arrow left" aria-label="Scroll left"><svg viewBox="0 0 24 24"><path d="M15 18 9 12l6-6"/></svg></button>
      <div class="row-track">${cards}</div>
      <button class="row-arrow right" aria-label="Scroll right"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></button></div></section>` : '');
    const songShelf = (title, list, favs, opts) => { if (!list.length)
        return ''; const li = reg(list); return shelf(title, list.map(i => songCard(i, li, favs)).join(''), opts); };
    const grid = (list, favs) => { const li = reg(list); return `<div class="am-grid">${list.map(i => songCard(i, li, favs)).join('')}</div>`; };
    const cardGrid = cards => `<div class="am-grid">${cards}</div>`;
    // Apple-style song list: number or artwork, title, artist, length, heart, and ⋯ for playlists and more
    function rows(list, favs, { numbered = false } = {}) {
        if (!list.length)
            return '';
        const li = reg(list);
        return `<div class="am-rows" role="list">${list.map((s, i) => `<div class="am-row" role="listitem" data-m-play="${esc(s.key)}" data-m-list="${li}">
      <button type="button" class="am-row-main" data-m="play" aria-label="Play ${esc(s.name)}">
        ${numbered ? `<span class="am-num">${s.rank || s.track || i + 1}</span>` : cover(s, 'am-row-art')}
        ${numbered && s.src === 'chart' ? cover(s, 'am-row-art') : ''}
        <span class="am-row-text"><b>${esc(s.name)}</b><small>${esc([s.artist, s.album || s.chartLine].filter(Boolean).join(' · '))}</small></span></button>
      <span class="am-len">${esc(clock(s.duration))}</span>${favBtn(s, favs)}${s.type === 'song' ? moreBtn(s) : ''}</div>`).join('')}</div>`;
    }
    const playButtons = li => `<div class="am-actions"><button type="button" class="btn am-btn" data-m-act="play" data-m-list="${li}">${ICON.play} Play</button><button type="button" class="btn am-btn ghost" data-m-act="shuffle" data-m-list="${li}">${ICON.shuffle} Shuffle</button></div>`;
    const songsBlock = (title, list, favs, opts = {}) => { if (!list.length)
        return ''; const li = reg(list); return `<div class="am-sec-head"><h2>${esc(title)}${opts.count ? ` <small>${list.length}</small>` : ''}</h2>${playButtons(li)}</div>${rows(list, favs, opts)}`; };
    const TABS = [['', 'Listen Now', 'home'], ['browse', 'Browse', 'browse'], ['radio', 'Radio', 'radio'], ['library', 'Library', 'library']];
    const tabOf = page => ({ charts: 'home', genre: 'browse', playlist: 'home', album: 'home', artist: 'home', search: 'search', mylist: 'library', myartist: 'library', myalbum: 'library', server: 'library', subalbum: 'library', subartist: 'library' }[page] || page);
    function chrome(r, body) {
        const active = tabOf(r.page);
        return `<div class="page am" id="amRoot">
      <div class="am-top"><nav class="am-tabs" aria-label="Music sections">${TABS.map(([path, label, id]) => `<a href="#music${path ? '/' + path : ''}" class="${active === id ? 'active' : ''}"${active === id ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
        <form class="am-search" id="amSearch" role="search">${ICON.search}<input type="search" name="q" maxlength="80" value="${esc(r.search || '')}" placeholder="Your music, artists, songs, stations" autocomplete="off" aria-label="Search music"></form></div>
      ${body}
      <p class="am-note">Free and legal, no subscription: your own music, your own server, artists who publish on <a href="https://audius.co" target="_blank" rel="noopener noreferrer">Audius</a>, Creative Commons songs from <a href="https://www.jamendo.com" target="_blank" rel="noopener noreferrer">Jamendo</a> (via Openverse), concerts and netlabels on the <a href="https://archive.org/details/audio" target="_blank" rel="noopener noreferrer">Internet Archive</a>, and internet radio. Albums without a cover show their official artwork from Apple’s catalogue.</p></div>`;
    }
    const title = (text, sub = '') => `<header class="am-title"><h1>${esc(text)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</header>`;
    const empty = text => `<div class="empty">${text}</div>`;
    // A page made of sections that fill in as each source answers (one slow or failing source doesn't hold up the rest)
    function sections(view, r, live, head, parts) {
        view.innerHTML = chrome(r, `${head}<div class="am-wait" id="amWait"><div class="spinner"></div></div>${parts.map((_, i) => `<div data-sec="${i}" hidden></div>`).join('')}<div class="empty" id="amNone" hidden></div>`);
        let pending = parts.length, filled = 0;
        parts.forEach((load, i) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            let html = '';
            try {
                html = yield load();
            }
            catch (e) {
                console.warn('music section failed', e);
            }
            if (!live())
                return;
            const slot = $(`[data-sec="${i}"]`, view);
            if (slot && html) {
                slot.innerHTML = html;
                slot.hidden = false;
                if (!load.fixed)
                    filled++;
                (_a = $('#amWait', view)) === null || _a === void 0 ? void 0 : _a.remove();
                mark();
            }
            if (--pending === 0) {
                (_b = $('#amWait', view)) === null || _b === void 0 ? void 0 : _b.remove();
                if (!filled) {
                    const none = $('#amNone', view);
                    if (none) {
                        none.hidden = false;
                        none.innerHTML = '<b>Nothing to show right now.</b><br>Check your connection and try again.<br><button class="btn btn-more" id="amRetry" type="button" style="margin-top:14px">Try again</button>';
                        $('#amRetry', view).onclick = () => rerender === null || rerender === void 0 ? void 0 : rerender();
                    }
                }
            }
        }));
    }
    const fixed = fn => Object.assign(fn, { fixed: true }); // built-in decoration: doesn't count as content arriving
    // ---- your music on this device, organised
    const mine = () => { var _a; return M.organise(((_a = L()) === null || _a === void 0 ? void 0 : _a.all()) || []); };
    const myArtistCard = a => artistCard({ name: a.name, art: a.art, href: '#music/my-artist/' + encodeURIComponent(a.name), sub: `${a.songs.length} song${a.songs.length === 1 ? '' : 's'}` });
    const myAlbumCard = al => linkCard({ kind: 'album', name: al.name, by: al.by, art: al.art, note: al.year, href: '#music/my-album/' + encodeURIComponent(al.key) });
    const playlistCard = p => { var _a; return linkCard({ kind: 'mine', name: p.name, by: 'Your playlist', art: ((_a = p.items.find(i => i.art)) === null || _a === void 0 ? void 0 : _a.art) || '', count: p.items.length, href: '#music/list/' + encodeURIComponent(p.id) }); };
    const ownMusicInvite = () => `<section class="am-own"><div><h2>Your music, no subscription</h2><p>Add music files from this device, or connect your own music server (Navidrome and similar), and they sit here alongside free music from artists and radio, with playlists, favourites, shuffle and history.</p></div>
    <div class="am-actions"><a class="btn am-btn" href="#music/library">${ICON.plus} Add your music</a><a class="btn am-btn ghost" href="#music/server">${ICON.server} Connect a server</a></div></section>`;
    // ---- pages
    const pages = {
        home(view, r, live) {
            var _a;
            const favs = M.favs(), recent = M.recent(), own = ((_a = L()) === null || _a === void 0 ? void 0 : _a.all()) || [], picks = [genreById('pop'), genreById('electronic'), genreById('hiphop'), genreById('rock')];
            const lists_ = M.playlists();
            sections(view, r, live, title('Listen Now'), [
                () => __awaiter(this, void 0, void 0, function* () { return songShelf('Top Songs · Australia', (yield data.charts()).slice(0, 30), favs, { href: '#music/charts', cls: 'am-charts' }); }),
                () => __awaiter(this, void 0, void 0, function* () { return songShelf('Recently Played', recent.slice(0, 20), favs, { href: '#music/library/recent' }); }),
                () => __awaiter(this, void 0, void 0, function* () { return (lists_.length ? shelf('Your Playlists', lists_.map(playlistCard).join(''), { href: '#music/library/playlists' }) : ''); }),
                () => __awaiter(this, void 0, void 0, function* () { return songShelf('Recently Added to My Music', [...own].sort((a, b) => b.added - a.added).slice(0, 20), favs, { href: '#music/library/songs' }); }),
                fixed(() => __awaiter(this, void 0, void 0, function* () { return (!own.length && !server.connected ? ownMusicInvite() : ''); })),
                () => __awaiter(this, void 0, void 0, function* () { return (server.connected ? shelf('New on Your Server', (yield data.serverAlbums('newest', 20)).map(linkCard).join(''), { href: '#music/server' }) : ''); }),
                () => __awaiter(this, void 0, void 0, function* () { const p = yield data.playlists(); return p.length ? shelf('Playlists on Audius', p.slice(0, 10).map(linkCard).join('')) : ''; }),
                () => __awaiter(this, void 0, void 0, function* () { return songShelf('Trending on Audius', yield data.trending('', 30), favs); }),
                () => __awaiter(this, void 0, void 0, function* () { const s = yield data.soma(); return songShelf('Radio Stations', s.slice(0, 20), favs, { href: '#music/radio' }); }),
                () => __awaiter(this, void 0, void 0, function* () { return songShelf('Underground: New & Rising', yield data.underground(), favs); }),
                ...picks.map(g => () => __awaiter(this, void 0, void 0, function* () { return songShelf(`Top ${g.name}`, yield data.trending(g.audius, 20), favs, { href: '#music/genre/' + g.id }); })),
                () => __awaiter(this, void 0, void 0, function* () { return songShelf('Creative Commons Picks', yield data.cc('pop rock', 20), favs); }),
                () => __awaiter(this, void 0, void 0, function* () { return shelf('Live Concerts', (yield data.concerts()).map(linkCard).join('')); }),
                fixed(() => __awaiter(this, void 0, void 0, function* () { return shelf('Browse by Genre', GENRES.slice(0, 12).map(genreTile).join(''), { href: '#music/browse', cls: 'am-genre-shelf' }); })),
            ]);
        },
        // The top songs in Australia: Apple Music, iTunes, Shazam and Deezer combined (netlify/functions/music-charts.mjs)
        charts(view, r, live) {
            const favs = M.favs();
            sections(view, r, live, title('Top Songs · Australia', 'Apple Music, iTunes, Shazam and Deezer combined, updated hourly. Songs play in YouTube’s player.'), [
                () => __awaiter(this, void 0, void 0, function* () { const t = yield data.charts(); return t.length ? `<div class="am-sec-head"><h2>Top ${t.length}</h2>${playButtons(reg(t))}</div>${rows(t, favs, { numbered: true })}` : ''; }),
            ]);
        },
        browse(view, r) {
            view.innerHTML = chrome(r, `${title('Browse', 'Pick a genre')}<div class="am-genres">${GENRES.map(genreTile).join('')}</div>`);
        },
        genre(view, r, live) {
            var _a;
            const g = genreById(r.genre), favs = M.favs();
            const head = `<header class="am-banner" style="--g1:${g.c[0]};--g2:${g.c[1]}"><a class="am-back" href="#music/browse">‹ Browse</a><h1>${esc(g.name)}</h1></header>`;
            const own = (((_a = L()) === null || _a === void 0 ? void 0 : _a.all()) || []).filter(s => s.genre && s.genre.toLowerCase().includes(g.q.slice(0, 4)));
            sections(view, r, live, head, [
                () => __awaiter(this, void 0, void 0, function* () { return songsBlock(`${g.name} in My Music`, own, favs); }),
                () => __awaiter(this, void 0, void 0, function* () { const t = yield data.trending(g.audius, 40); return t.length ? `${songsBlock('Top Songs on Audius', t.slice(0, 10), favs)}${t.length > 10 ? songShelf('More on Audius', t.slice(10), favs) : ''}` : ''; }),
                () => __awaiter(this, void 0, void 0, function* () { return songShelf('Creative Commons Picks', yield data.cc(g.q, 20), favs); }),
                () => __awaiter(this, void 0, void 0, function* () {
                    const [soma, rb] = yield Promise.all([data.soma().catch(() => []), data.stations({ tag: g.radio, limit: 30 }).catch(() => [])]);
                    return songShelf(`${g.name} Radio`, [...soma.filter(s => g.soma.includes(s.genre)), ...rb], favs, { href: '#music/radio/' + g.id });
                }),
                () => __awaiter(this, void 0, void 0, function* () { return shelf('Albums from Netlabels', (yield data.netlabels(g.q)).map(linkCard).join('')); }),
            ]);
        },
        radio(view, r, live) {
            const favs = M.favs(), g = genreById(r.genre);
            const chips = `<div class="chips am-chips"><a class="chip${!g && !r.search ? ' active' : ''}" href="#music/radio">🇦🇺 Australia</a>${GENRES.map(x => `<a class="chip${g === x ? ' active' : ''}" href="#music/radio/${x.id}">${esc(x.name)}</a>`).join('')}</div>`;
            const head = `${title('Radio', r.search ? `Stations matching “${r.search}”` : g ? `${g.name} stations` : 'Live stations')}
        <form class="am-inline-search" id="amRadioSearch"><input type="search" name="q" maxlength="80" value="${esc(r.search || '')}" placeholder="Find a station by name…" autocomplete="off" aria-label="Find a radio station"><button class="btn am-btn" type="submit">Search</button></form>${chips}`;
            sections(view, r, live, head, [
                () => __awaiter(this, void 0, void 0, function* () { if (r.search)
                    return ''; const s = yield data.soma(); const pick = g ? s.filter(x => g.soma.includes(x.genre)) : s; return songShelf('SomaFM · commercial-free', pick, favs); }),
                () => __awaiter(this, void 0, void 0, function* () { const s = yield data.stations(r.search ? { name: r.search } : g ? { tag: g.radio } : { cc: 'AU' }); return s.length ? `<div class="am-sec-head"><h2>${r.search ? 'Stations' : g ? `${esc(g.name)} stations` : 'Australian stations'}</h2></div>${grid(s, favs)}` : ''; }),
            ]);
        },
        // Library: your music, organised, and everything you keep
        library(view, r) {
            var _a;
            const part = r.part, favs = M.favs(), own = mine(), lists_ = M.playlists(), recent = M.recent();
            const parts = [['playlists', 'Playlists', ICON.list, lists_.length], ['artists', 'Artists', ICON.person, own.artists.length], ['albums', 'Albums', ICON.disc, own.albums.length], ['songs', 'Songs', ICON.note, own.songs.length], ['favourites', 'Favourites', ICON.heart, favs.length], ['recent', 'Recently Played', ICON.clock, recent.length]];
            const nav = `<nav class="am-libnav" aria-label="Your library">${parts.map(([id, label, icon, n]) => `<a href="#music/library/${id}" class="${part === id ? 'active' : ''}">${icon}<span>${label}</span><small>${n || ''}</small></a>`).join('')}<a href="#music/server" class="">${ICON.server}<span>${server.connected ? 'Your Server' : 'Connect a Server'}</span><small></small></a></nav>`;
            const adder = `<section class="am-import" id="amImport"><div><h2>My Music</h2><p class="am-muted" id="amSpace">${own.songs.length ? `${own.songs.length} song${own.songs.length === 1 ? '' : 's'} on this device` : 'Add your own music files: they’re kept on this device and play with no connection.'}</p></div>
        <div class="am-actions"><button type="button" class="btn am-btn" data-m-add="files">${ICON.plus} Add music files</button>${((_a = L()) === null || _a === void 0 ? void 0 : _a.canPickFolder) ? `<button type="button" class="btn am-btn ghost" data-m-add="folder">${ICON.folder} Add a folder</button>` : ''}</div>
        <input type="file" id="amFiles" accept="audio/*,.mp3,.m4a,.aac,.flac,.wav,.ogg,.opus" multiple hidden><input type="file" id="amFolder" webkitdirectory multiple hidden>
        <div class="am-progress" id="amProgress" hidden><i></i><span></span></div></section>`;
            let body;
            if (part === 'songs')
                body = own.songs.length ? songsBlock('Songs', own.songs, favs, { count: true }) : empty('No songs on this device yet. Use <b>Add music files</b> above.');
            else if (part === 'artists')
                body = own.artists.length ? cardGrid(own.artists.map(myArtistCard).join('')) : empty('Artists appear here once you add music.');
            else if (part === 'albums')
                body = own.albums.length ? cardGrid(own.albums.map(myAlbumCard).join('')) : empty('Albums appear here once you add music.');
            else if (part === 'playlists')
                body = `<div class="am-sec-head"><h2>Playlists <small>${lists_.length}</small></h2><div class="am-actions"><button type="button" class="btn am-btn" data-m-newlist>${ICON.plus} New Playlist</button></div></div>
        ${lists_.length ? cardGrid(lists_.map(playlistCard).join('')) : empty('Make a playlist with <b>New Playlist</b>, or with the ⋯ button on any song.')}`;
            else if (part === 'favourites') {
                const songs = favs.filter(i => i.type === 'song'), radios = favs.filter(i => i.type === 'radio');
                body = favs.length ? `${songsBlock('Favourite Songs', songs, favs, { count: true })}${radios.length ? `<div class="am-sec-head"><h2>Stations <small>${radios.length}</small></h2></div>${grid(radios, favs)}` : ''}`
                    : empty('Tap the ♥ on a song or a radio station to keep it here.<br>Favourites are saved to your account, so they follow you to your other devices.');
            }
            else if (part === 'recent')
                body = recent.length ? `${songsBlock('Recently Played', recent.filter(i => i.type === 'song'), favs)}${recent.some(i => i.type === 'radio') ? songShelf('Stations', recent.filter(i => i.type === 'radio'), favs) : ''}<p class="am-about"><button type="button" class="am-link-btn" data-m-clear>Clear listening history</button></p>` : empty('Songs and stations you play show up here.');
            else {
                body = `${adder}${songShelf('Recently Added', [...own.songs].sort((a, b) => b.added - a.added).slice(0, 20), favs, { href: '#music/library/songs' })}
          ${own.albums.length ? shelf('Albums', own.albums.slice(0, 20).map(myAlbumCard).join(''), { href: '#music/library/albums' }) : ''}
          ${lists_.length ? shelf('Your Playlists', lists_.map(playlistCard).join(''), { href: '#music/library/playlists' }) : ''}
          ${songShelf('Recently Played', recent.slice(0, 20), favs, { href: '#music/library/recent' })}`;
            }
            view.innerHTML = chrome(r, `${title(part ? parts.find(p => p[0] === part)[1] : 'Library')}${nav}${body}`);
            if (!part)
                showSpace(view);
        },
        myartist(view, r) {
            const a = mine().artists.find(x => x.name.toLowerCase() === r.name.toLowerCase());
            if (!a) {
                view.innerHTML = chrome(r, empty('That artist isn’t in your music on this device.'));
                return;
            }
            const favs = M.favs(), li = reg(a.songs);
            view.innerHTML = chrome(r, `<header class="am-hero"><span class="am-hero-art">${cover({ art: a.art })}</span><div class="am-hero-text"><span class="am-kind">Artist · My Music</span><h1>${esc(a.name)}</h1>
        <p class="am-hero-meta">${esc(`${a.albums.length} album${a.albums.length === 1 ? '' : 's'} · ${a.songs.length} song${a.songs.length === 1 ? '' : 's'}`)}</p>${playButtons(li)}</div></header>
        ${shelf('Albums', a.albums.map(myAlbumCard).join(''))}${songsBlock('Songs', [...a.songs].sort((x, y) => x.name.localeCompare(y.name)), favs)}`);
        },
        myalbum(view, r) {
            const al = mine().albums.find(x => x.key === r.key);
            if (!al) {
                view.innerHTML = chrome(r, empty('That album isn’t in your music on this device.'));
                return;
            }
            const favs = M.favs(), li = reg(al.songs), total = al.songs.reduce((n, s) => n + (s.duration || 0), 0);
            view.innerHTML = chrome(r, `<header class="am-hero"><span class="am-hero-art">${cover({ art: al.art })}</span><div class="am-hero-text"><span class="am-kind">Album · My Music</span><h1>${esc(al.name)}</h1>
        <p class="am-hero-by"><a href="#music/my-artist/${esc(encodeURIComponent(al.by))}">${esc(al.by)}</a></p>
        <p class="am-hero-meta">${esc([al.year, `${al.songs.length} song${al.songs.length === 1 ? '' : 's'}`, total ? `${Math.round(total / 60)} min` : ''].filter(Boolean).join(' · '))}</p>${playButtons(li)}</div></header>${rows(al.songs, favs, { numbered: true })}`);
        },
        mylist(view, r) {
            var _a;
            const p = M.playlists().find(x => x.id === r.id);
            if (!p) {
                view.innerHTML = chrome(r, empty('That playlist doesn’t exist any more. <a href="#music/library/playlists">Your playlists ›</a>'));
                return;
            }
            const favs = M.favs(), songs = p.items.filter(i => i.type === 'song'), li = songs.length ? reg(songs) : -1, total = songs.reduce((n, s) => n + (s.duration || 0), 0);
            context = { playlist: p.id };
            view.innerHTML = chrome(r, `<header class="am-hero"><span class="am-hero-art">${cover({ art: ((_a = songs.find(s => s.art)) === null || _a === void 0 ? void 0 : _a.art) || '' })}</span><div class="am-hero-text"><span class="am-kind">Your Playlist</span><h1>${esc(p.name)}</h1>
        <p class="am-hero-meta">${esc([`${songs.length} song${songs.length === 1 ? '' : 's'}`, total ? `${Math.round(total / 60)} min` : ''].filter(Boolean).join(' · '))}</p>
        ${songs.length ? playButtons(li) : ''}<div class="am-actions am-small"><button type="button" class="btn am-btn ghost" data-m-list-act="rename">Rename</button><button type="button" class="btn am-btn ghost" data-m-list-act="delete">Delete</button></div></div></header>
        ${songs.length ? rows(songs, favs) : empty('Add songs with the ⋯ button next to any song, then choose this playlist.')}`);
        },
        // your own music server
        server(view, r, live) {
            if (!server.connected) {
                view.innerHTML = chrome(r, `${title('Your Music Server', 'Your whole collection, on every device')}
          <section class="am-setup"><p>Run a free, open-source music server at home or on a small cloud machine, point it at your music folder, and StreamBox plays it on your phone, tablet, TV and computer, with its artists, albums, playlists and cover art. Any server that speaks the <b>Subsonic API</b> works:</p>
          <ul><li><a href="https://www.navidrome.org" target="_blank" rel="noopener noreferrer">Navidrome</a> (recommended: light, fast, runs on a Raspberry Pi or a NAS)</li><li><a href="https://github.com/sentriz/gonic" target="_blank" rel="noopener noreferrer">Gonic</a>, <a href="https://github.com/airsonic-advanced/airsonic-advanced" target="_blank" rel="noopener noreferrer">Airsonic-Advanced</a>, or Jellyfin with its Subsonic plugin</li></ul>
          <p class="am-muted">It needs an <b>https://</b> address that StreamBox can reach (for example through Tailscale, Cloudflare Tunnel or your NAS’s own https link). Your password isn’t stored: only a signed token, on this device.</p>
          <form id="amServerForm" class="am-form"><input name="url" type="url" required placeholder="https://music.example.com" aria-label="Server address" autocomplete="url">
            <input name="user" required placeholder="Username" aria-label="Username" autocomplete="username" autocapitalize="none" spellcheck="false">
            <input name="password" type="password" required placeholder="Password" aria-label="Password" autocomplete="current-password">
            <button class="btn am-btn" type="submit">Connect</button></form></section>`);
                $('#amServerForm', view).addEventListener('submit', (e) => __awaiter(this, void 0, void 0, function* () {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget), btn = e.currentTarget.querySelector('button');
                    btn.disabled = true;
                    btn.textContent = 'Connecting…';
                    try {
                        yield server.connect(f.get('url'), f.get('user'), f.get('password'));
                        toast('Music server connected');
                        rerender === null || rerender === void 0 ? void 0 : rerender();
                    }
                    catch (err) {
                        toast(err.message);
                        btn.disabled = false;
                        btn.textContent = 'Connect';
                    }
                }));
                return;
            }
            const favs = M.favs(), host = (() => { try {
                return new URL(server.settings.url).host;
            }
            catch (_a) {
                return '';
            } })();
            sections(view, r, live, `${title('Your Music Server', `${server.settings.user} on ${host}`)}<p class="am-about"><button type="button" class="am-link-btn" data-m-disconnect>Disconnect this server</button></p>`, [
                () => __awaiter(this, void 0, void 0, function* () { return shelf('Newest Albums', (yield data.serverAlbums('newest', 24)).map(linkCard).join('')); }),
                () => __awaiter(this, void 0, void 0, function* () { return shelf('Most Played', (yield data.serverAlbums('frequent', 24)).map(linkCard).join('')); }),
                () => __awaiter(this, void 0, void 0, function* () { const s = yield data.serverRandom(40); return s.length ? `${songsBlock('Shuffle Your Collection', s.slice(0, 12), favs)}` : ''; }),
                () => __awaiter(this, void 0, void 0, function* () { const a = yield data.serverArtists(); return a.length ? `<div class="am-sec-head"><h2>Artists <small>${a.length}</small></h2></div>${cardGrid(a.slice(0, 120).map(x => artistCard(Object.assign(Object.assign({}, x), { sub: `${x.albums} album${x.albums === 1 ? '' : 's'}` }))).join(''))}` : ''; }),
            ]);
        },
        subalbum(view, r, live) {
            return __awaiter(this, void 0, void 0, function* () { return pages.collection(view, r, live, () => data.serverAlbum(r.id), 'Album · Your Server', '#music/server'); });
        },
        subartist(view, r, live) {
            return __awaiter(this, void 0, void 0, function* () {
                view.innerHTML = chrome(r, '<div class="am-wait"><div class="spinner"></div></div>');
                try {
                    const { info, albums } = yield data.serverArtist(r.id);
                    if (!live())
                        return;
                    view.innerHTML = chrome(r, `<header class="am-hero"><span class="am-hero-art">${cover({ art: info === null || info === void 0 ? void 0 : info.art })}</span><div class="am-hero-text"><span class="am-kind">Artist · Your Server</span><h1>${esc((info === null || info === void 0 ? void 0 : info.name) || '')}</h1>
          <p class="am-hero-meta">${albums.length} album${albums.length === 1 ? '' : 's'}</p></div></header>${albums.length ? cardGrid(albums.map(linkCard).join('')) : empty('No albums.')}`);
                }
                catch (e) {
                    if (live())
                        fail(view, r, e, '#music/server');
                }
            });
        },
        search(view, r, live) {
            var _a;
            const favs = M.favs(), text = r.search;
            if (!text) {
                view.innerHTML = chrome(r, `${title('Search')}${empty('Type an artist, a song, an album or a station above.')}`);
                return;
            }
            const own = M.organise((((_a = L()) === null || _a === void 0 ? void 0 : _a.all()) || []).filter(s => M.matches(s, text)));
            const myLists = M.playlists().filter(p => M.matches({ name: p.name }, text));
            sections(view, r, live, title('Search', `Results for “${text}”`), [
                () => __awaiter(this, void 0, void 0, function* () { const s = yield data.openTuneSearch(text); return s.length ? songsBlock('OpenTune · YouTube Music', s, favs) : ''; }),
                () => __awaiter(this, void 0, void 0, function* () { return songsBlock('In My Music', own.songs.slice(0, 30), favs); }),
                () => __awaiter(this, void 0, void 0, function* () { return (own.albums.length ? shelf('Albums in My Music', own.albums.map(myAlbumCard).join('')) : ''); }),
                () => __awaiter(this, void 0, void 0, function* () { return (myLists.length ? shelf('Your Playlists', myLists.map(playlistCard).join('')) : ''); }),
                () => __awaiter(this, void 0, void 0, function* () { if (!server.connected)
                    return ''; const s = yield data.serverSearch(text); return `${songsBlock('On Your Server', s.songs, favs)}${shelf('Albums on Your Server', s.albums.map(linkCard).join(''))}${shelf('Artists on Your Server', s.artists.map(a => artistCard(Object.assign(Object.assign({}, a), { sub: 'Your server' }))).join(''), { cls: 'am-artists' })}`; }),
                () => __awaiter(this, void 0, void 0, function* () { return shelf('Artists on Audius', (yield data.artistSearch(text)).map(artistCard).join(''), { cls: 'am-artists' }); }),
                () => __awaiter(this, void 0, void 0, function* () { const s = yield data.songSearch(text); return s.length ? `${songsBlock('Songs on Audius', s.slice(0, 12), favs)}${s.length > 12 ? songShelf('More songs on Audius', s.slice(12), favs) : ''}` : ''; }),
                () => __awaiter(this, void 0, void 0, function* () { return shelf('Playlists on Audius', (yield data.playlistSearch(text)).map(linkCard).join('')); }),
                () => __awaiter(this, void 0, void 0, function* () { return songShelf('Creative Commons Songs', yield data.cc(text, 20), favs); }),
                () => __awaiter(this, void 0, void 0, function* () { return songShelf('Stations', yield data.stations({ name: text, limit: 30 }), favs); }),
                () => __awaiter(this, void 0, void 0, function* () { return shelf('Albums & Concerts', (yield data.albumSearch(text)).map(linkCard).join('')); }),
            ]);
        },
        collection(view, r, live, load, kindLabel, backHref) {
            return __awaiter(this, void 0, void 0, function* () {
                view.innerHTML = chrome(r, '<div class="am-wait"><div class="spinner"></div></div>');
                try {
                    const { info, tracks, note } = yield load();
                    if (!live())
                        return;
                    if (!info)
                        throw new Error('That couldn’t be found.');
                    const favs = M.favs(), li = tracks.length ? reg(tracks) : -1, total = tracks.reduce((n, t) => n + (t.duration || 0), 0);
                    const byHref = info.byId ? (r.page === 'subalbum' ? '#music/server/artist/' : '#music/artist/') + encodeURIComponent(info.byId) : '';
                    view.innerHTML = chrome(r, `<header class="am-hero"><span class="am-hero-art">${cover({ art: M.bigArt(info) || info.art })}</span>
          <div class="am-hero-text"><span class="am-kind">${esc(kindLabel)}</span><h1>${esc(info.name)}</h1>
            <p class="am-hero-by">${byHref ? `<a href="${esc(byHref)}">${esc(info.by)}</a>` : esc(info.by)}</p>
            <p class="am-hero-meta">${esc([note || (info.kind === 'album' ? info.note : ''), `${tracks.length} song${tracks.length === 1 ? '' : 's'}`, total ? `${Math.round(total / 60)} min` : ''].filter(Boolean).join(' · '))}</p>
            ${tracks.length ? playButtons(li) : ''}</div></header>
          ${info.kind === 'playlist' && info.note ? `<p class="am-about">${esc(info.note.slice(0, 400))}</p>` : ''}
          ${tracks.length ? rows(tracks, favs, { numbered: info.kind === 'album' }) : empty('Nothing here can be played in the app.')}
          ${info.kind === 'album' && r.page === 'album' ? `<p class="am-about"><a href="https://archive.org/details/${esc(encodeURIComponent(info.id))}" target="_blank" rel="noopener noreferrer">About this recording on the Internet Archive ↗</a></p>` : ''}`);
                    mark();
                }
                catch (e) {
                    if (live())
                        fail(view, r, e, backHref);
                }
            });
        },
        playlist(view, r, live) { return pages.collection(view, r, live, () => data.playlist(r.id), 'Playlist · Audius', '#music'); },
        album(view, r, live) { return pages.collection(view, r, live, () => data.album(r.id), 'Album · Internet Archive', '#music'); },
        artist(view, r, live) {
            return __awaiter(this, void 0, void 0, function* () {
                view.innerHTML = chrome(r, '<div class="am-wait"><div class="spinner"></div></div>');
                try {
                    const { info, tracks } = yield data.artist(r.id);
                    if (!live())
                        return;
                    if (!info)
                        throw new Error('That artist couldn’t be found.');
                    const favs = M.favs(), li = tracks.length ? reg(tracks) : -1;
                    view.innerHTML = chrome(r, `<header class="am-artist-head">${info.cover ? `<img class="am-artist-cover" src="${esc(info.cover)}" alt="" onerror="this.remove()">` : ''}
          <div class="am-artist-in"><span class="am-artist-pic">${cover({ art: M.bigArt(info) || info.art })}</span>
            <div><h1>${esc(info.name)}${info.verified ? ` <i class="am-ok" title="Verified artist">${ICON.check}</i>` : ''}</h1>
              <p class="am-hero-meta">${esc([info.where, `${info.followers.toLocaleString()} followers`, `${info.tracks} songs`].filter(Boolean).join(' · '))}</p>
              ${tracks.length ? playButtons(li) : ''}</div></div></header>
          ${info.bio ? `<p class="am-about">${esc(info.bio.slice(0, 500))}</p>` : ''}
          ${tracks.length ? `<div class="am-sec-head"><h2>Top Songs</h2></div>${rows(tracks, favs)}` : empty('This artist has no songs to play yet.')}
          <p class="am-about"><a href="https://audius.co/${esc(encodeURIComponent(info.handle))}" target="_blank" rel="noopener noreferrer">${esc(info.name)} on Audius ↗</a></p>`);
                    mark();
                }
                catch (e) {
                    if (live())
                        fail(view, r, e, '#music');
                }
            });
        },
    };
    const genreTile = g => `<a class="am-genre" href="#music/genre/${g.id}" style="--g1:${g.c[0]};--g2:${g.c[1]}"><span>${esc(g.name)}</span></a>`;
    function fail(view, r, e, back) {
        view.innerHTML = chrome(r, `<div class="empty"><b>Couldn’t load this.</b><br>${esc(e.message)}<br><button class="btn btn-more" id="amRetry" type="button" style="margin-top:14px">Try again</button> <a class="btn btn-more" href="${esc(back || '#music')}" style="margin-top:14px">Back</a></div>`);
        $('#amRetry', view).onclick = () => rerender === null || rerender === void 0 ? void 0 : rerender();
    }
    function showSpace(view) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const s = yield ((_b = (_a = L()) === null || _a === void 0 ? void 0 : _a.space) === null || _b === void 0 ? void 0 : _b.call(_a)), el = $('#amSpace', view), n = ((_c = L()) === null || _c === void 0 ? void 0 : _c.count) || 0;
            if (!el || !s || !n)
                return;
            const gb = b => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b < 1e6 ? 'under 1 MB' : `${Math.round(b / 1e6)} MB`);
            el.textContent = `${n} song${n === 1 ? '' : 's'} on this device · ${gb(s.used)} used, about ${gb(s.free)} free`;
        });
    }
    // ---- adding your own music
    function addFiles(view, files) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!(files === null || files === void 0 ? void 0 : files.length) || !L())
                return;
            const box = $('#amProgress', view), bar = box === null || box === void 0 ? void 0 : box.querySelector('i'), label = box === null || box === void 0 ? void 0 : box.querySelector('span');
            if (box)
                box.hidden = false;
            try {
                const r = yield L().add(files, (done, total, name) => {
                    if (bar)
                        bar.style.width = `${total ? (done / total) * 100 : 0}%`;
                    if (label)
                        label.textContent = done < total ? `Adding ${done + 1} of ${total}: ${name}` : 'Finishing…';
                });
                toast(r.total ? `Added ${r.added} song${r.added === 1 ? '' : 's'}${r.skipped ? `, ${r.skipped} already here` : ''}${r.failed ? `, ${r.failed} couldn’t be added` : ''}` : 'No music files there');
            }
            catch (e) {
                toast(e.message || 'Couldn’t add music on this device');
            }
            rerender === null || rerender === void 0 ? void 0 : rerender();
        });
    }
    // A name typed into the app's own window (prompt() is awkward with a TV remote)
    function ask(heading, value, button, done) {
        var _a;
        if (!openModal) {
            const v = prompt(heading, value);
            if (v !== null)
                done(v);
            return;
        }
        openModal(`<div class="modal-body am-menu"><h2>${esc(heading)}</h2><form class="am-form" id="amAsk"><input name="v" maxlength="80" value="${esc(value)}" aria-label="${esc(heading)}" autofocus><button class="btn btn-red" type="submit">${esc(button)}</button></form></div>`);
        const form = document.querySelector('#modal #amAsk');
        (_a = form === null || form === void 0 ? void 0 : form.querySelector('input')) === null || _a === void 0 ? void 0 : _a.focus();
        form === null || form === void 0 ? void 0 : form.addEventListener('submit', e => { e.preventDefault(); const v = new FormData(form).get('v'); closeModal(); done(String(v)); });
    }
    // ---- the ⋯ menu for a song: play next, favourite, playlists, and (for your own files) its album and removal
    function songMenu(item) {
        if (!openModal)
            return;
        const lists_ = M.playlists(), inList = context.playlist, fav = M.isFav(M.favs(), item.key);
        openModal(`<div class="modal-body am-menu"><div class="am-menu-head">${cover(item, 'am-row-art')}<div><h2>${esc(item.name)}</h2><p>${esc([item.artist, item.album].filter(Boolean).join(' · '))}</p></div></div>
      <div class="am-menu-acts">${item.src === 'chart' || item.src === 'youtube' ? '' : `<button type="button" class="btn btn-more" data-mm="next">${ICON.next} Play Next</button>`}<button type="button" class="btn btn-more" data-mm="fav">${ICON.heart} ${fav ? 'Remove from Favourites' : 'Add to Favourites'}</button>
        ${inList ? `<button type="button" class="btn btn-more" data-mm="up">Move Up</button><button type="button" class="btn btn-more" data-mm="down">Move Down</button><button type="button" class="btn btn-more" data-mm="unlist">Remove from This Playlist</button>` : ''}
        ${item.src === 'local' ? `<a class="btn btn-more" href="#music/my-album/${esc(encodeURIComponent(M.organise([item]).albums[0].key))}">${ICON.disc} Go to Album</a><button type="button" class="btn btn-more" data-mm="delete">Remove from This Device</button>` : ''}</div>
      <h3>Add to a Playlist</h3><div class="am-menu-lists">${lists_.filter(p => p.id !== inList).map(p => `<button type="button" class="btn btn-more" data-mm-add="${esc(p.id)}">${ICON.list} ${esc(p.name)}</button>`).join('') || '<p class="am-muted">No playlists yet.</p>'}</div>
      <form class="am-form" id="amNewList"><input name="name" maxlength="80" placeholder="New playlist name" aria-label="New playlist name"><button class="btn btn-red" type="submit">${ICON.plus} New Playlist</button></form></div>`);
        const body = document.querySelector('#modal .am-menu');
        if (!body)
            return;
        body.addEventListener('click', e => {
            var _a, _b, _c, _d;
            const b = e.target.closest('[data-mm], [data-mm-add]');
            if (!b)
                return;
            if (b.dataset.mmAdd) {
                M.playlist.add(b.dataset.mmAdd, [item]);
                toast(`Added to “${((_a = M.playlists().find(p => p.id === b.dataset.mmAdd)) === null || _a === void 0 ? void 0 : _a.name) || 'playlist'}”`);
            }
            else if (b.dataset.mm === 'next') {
                player.playNext(item);
                toast(((_b = player.current) === null || _b === void 0 ? void 0 : _b.key) === item.key ? 'Playing' : 'Plays next');
            }
            else if (b.dataset.mm === 'fav')
                toast(M.favourite(item) ? 'Added to Favourites' : 'Removed from Favourites');
            else if (b.dataset.mm === 'unlist') {
                M.playlist.remove(inList, item.key);
                toast('Removed from this playlist');
            }
            else if (b.dataset.mm === 'up' || b.dataset.mm === 'down')
                M.playlist.move(inList, item.key, b.dataset.mm === 'up' ? -1 : 1);
            else if (b.dataset.mm === 'delete') {
                if (!confirm(`Remove “${item.name}” from this device?`))
                    return;
                if (((_c = player.current) === null || _c === void 0 ? void 0 : _c.key) === item.key)
                    player.stop();
                (_d = L()) === null || _d === void 0 ? void 0 : _d.remove(item.id).then(() => { toast('Removed from this device'); rerender === null || rerender === void 0 ? void 0 : rerender(); });
            }
            closeModal();
            rerender === null || rerender === void 0 ? void 0 : rerender();
        });
        body.querySelector('#amNewList').addEventListener('submit', e => {
            e.preventDefault();
            const name = new FormData(e.currentTarget).get('name');
            M.playlist.create(name, [item]);
            toast(`Added to new playlist “${String(name).trim() || 'New Playlist'}”`);
            closeModal();
            rerender === null || rerender === void 0 ? void 0 : rerender();
        });
    }
    // OpenTune uses YouTube's official embedded player; no audio is downloaded or proxied.
    let youtubeLayer = null;
    function closeYouTube() { if (youtubeLayer) {
        youtubeLayer.remove();
        youtubeLayer = null;
    } }
    function openYouTube(item, onNext) {
        closeYouTube();
        player.pause();
        const layer = document.createElement('div');
        layer.className = 'am-youtube-layer';
        layer.style.cssText = 'position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:18px;';
        layer.innerHTML = '<div style="width:min(100%,960px);display:flex;align-items:center;justify-content:space-between;color:white;padding:0 0 12px"><div style="min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></b><small style="opacity:.75"></small></div><button type="button" aria-label="Close YouTube player" style="font-size:26px;color:white;background:#333;border:0;border-radius:50%;width:42px;height:42px;margin-left:12px">×</button></div><div style="width:min(100%,960px);aspect-ratio:16/9;background:#111"><iframe title="YouTube Music playback" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" style="width:100%;height:100%;border:0"></iframe></div><small style="color:#bbb;margin-top:12px;text-align:center">Playback provided by YouTube</small>';
        layer.querySelector('b').textContent = item.name;
        layer.querySelector('small').textContent = item.artist || 'YouTube Music';
        layer.querySelector('button').addEventListener('click', closeYouTube);
        layer.querySelector('iframe').src = 'https://www.youtube.com/embed/' + encodeURIComponent(item.id) + '?autoplay=1&playsinline=1&rel=0';
        layer.addEventListener('click', e => { if (e.target === layer)
            closeYouTube(); });
        if (onNext) { // the next song of the list it came from (the chart, a search)
            const next = document.createElement('button');
            next.type = 'button';
            next.className = 'btn btn-more am-yt-next';
            next.textContent = 'Next ›';
            next.addEventListener('click', onNext);
            layer.querySelector('button').before(next);
        }
        document.body.appendChild(layer);
        youtubeLayer = layer;
        layer.querySelector('button').focus({ preventScroll: true }); // a TV remote starts on the player's buttons
    }
    document.addEventListener('keydown', e => { if (youtubeLayer && (e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack')) {
        e.preventDefault();
        e.stopPropagation();
        closeYouTube();
    } }, true);
    addEventListener('hashchange', closeYouTube);
    // Chart songs and YouTube Music songs play in YouTube's official player; a chart song is found there first
    function playOnYouTube(item_1, items_1) {
        return __awaiter(this, arguments, void 0, function* (item, items, shuffle = false) {
            let list = (items || [item]).filter(i => i.src === 'youtube' || i.src === 'chart');
            if (shuffle)
                list = M.shuffled(list, item);
            const at = list.findIndex(x => x.key === item.key);
            const next = list.length > 1 ? () => playOnYouTube(list[(at + 1) % list.length], list) : null;
            let video = item;
            if (item.src === 'chart') {
                toast(`Finding “${item.name}”…`);
                const found = yield M.findOnYouTube(item);
                if (!found) {
                    toast(`Couldn’t find “${item.name}” on YouTube Music right now`);
                    return;
                }
                video = Object.assign(Object.assign({}, found), { name: item.name, artist: item.artist });
            }
            M.remember(item);
            openYouTube(video, next);
        });
    }
    function playMusicItem(item, items, opts = {}) {
        if ((item === null || item === void 0 ? void 0 : item.src) === 'youtube' || (item === null || item === void 0 ? void 0 : item.src) === 'chart') {
            playOnYouTube(item, items, opts.shuffle);
            return;
        }
        closeYouTube();
        player.start(item, items, opts);
    }
    // ---- one click handler for the whole Music page
    let rerender = null;
    function onClick(e, view) {
        var _a, _b, _c, _d, _e;
        const fav = e.target.closest('[data-m-fav]');
        if (fav) {
            const item = shown.get(fav.dataset.mFav) || (((_a = player.current) === null || _a === void 0 ? void 0 : _a.key) === fav.dataset.mFav ? player.current : null);
            if (item)
                toast(M.favourite(item) ? 'Added to Favourites' : 'Removed from Favourites');
            return;
        }
        const more = e.target.closest('[data-m-more]');
        if (more) {
            const item = shown.get(more.dataset.mMore);
            if (item)
                songMenu(item);
            return;
        }
        const act = e.target.closest('[data-m-act]');
        if (act) {
            const list = (lists[+act.dataset.mList] || []).filter(i => i.type === 'song');
            if (!list.length)
                return;
            const shuffle = act.dataset.mAct === 'shuffle';
            const first = shuffle ? list[Math.floor(Math.random() * list.length)] : list[0];
            playMusicItem(first, list, { shuffle });
            return;
        }
        const add = e.target.closest('[data-m-add]');
        if (add) {
            (_b = $(add.dataset.mAdd === 'folder' ? '#amFolder' : '#amFiles', view)) === null || _b === void 0 ? void 0 : _b.click();
            return;
        }
        if (e.target.closest('[data-m-newlist]')) {
            ask('New Playlist', '', 'Create', name => { const id = M.playlist.create(name, []); location.hash = 'music/list/' + encodeURIComponent(id); });
            return;
        }
        const la = e.target.closest('[data-m-list-act]');
        if (la && context.playlist) {
            const p = M.playlists().find(x => x.id === context.playlist);
            if (la.dataset.mListAct === 'rename') {
                const id = context.playlist;
                ask('Rename Playlist', (p === null || p === void 0 ? void 0 : p.name) || '', 'Save', name => { M.playlist.rename(id, name); rerender === null || rerender === void 0 ? void 0 : rerender(); });
            }
            else if (confirm(`Delete the playlist “${(p === null || p === void 0 ? void 0 : p.name) || ''}”? The songs stay where they are.`)) {
                M.playlist.delete(context.playlist);
                location.hash = 'music/library/playlists';
            }
            return;
        }
        if (e.target.closest('[data-m-clear]')) {
            M.clearRecent();
            rerender === null || rerender === void 0 ? void 0 : rerender();
            return;
        }
        if (e.target.closest('[data-m-disconnect]')) {
            server.disconnect();
            toast('Music server disconnected on this device');
            rerender === null || rerender === void 0 ? void 0 : rerender();
            return;
        }
        const hit = (_c = e.target.closest('[data-m="play"]')) === null || _c === void 0 ? void 0 : _c.closest('[data-m-play]');
        if (!hit)
            return;
        const item = shown.get(hit.dataset.mPlay);
        if (!item)
            return;
        if (item.src === 'youtube' && ((_d = player.current) === null || _d === void 0 ? void 0 : _d.key) === item.key) {
            closeYouTube();
            return;
        }
        if (((_e = player.current) === null || _e === void 0 ? void 0 : _e.key) === item.key)
            player.toggle();
        else
            playMusicItem(item, (lists[+hit.dataset.mList] || [item]).filter(i => i.type === item.type));
    }
    // The app keeps the same page container and replaces its contents, so the listeners are attached once
    const wired = new WeakSet();
    function wire(view) {
        if (wired.has(view))
            return;
        wired.add(view);
        view.addEventListener('click', e => { if (location.hash.startsWith('#music'))
            onClick(e, view); });
        // the files are copied out before the input is cleared (clearing it empties the same list), so the same files can be picked again
        view.addEventListener('change', e => { if (e.target.id === 'amFiles' || e.target.id === 'amFolder') {
            const files = [...(e.target.files || [])];
            e.target.value = '';
            addFiles(view, files);
        } });
        view.addEventListener('submit', e => {
            if (e.target.id === 'amSearch') {
                e.preventDefault();
                const text = new FormData(e.target).get('q').trim().slice(0, 80);
                location.hash = text ? 'music/search/' + encodeURIComponent(text) : 'music';
            }
            else if (e.target.id === 'amRadioSearch') {
                e.preventDefault();
                const text = new FormData(e.target).get('q').trim().slice(0, 80);
                location.hash = text ? 'music/radio/search/' + encodeURIComponent(text) : 'music/radio';
            }
        });
    }
    function render(view, arg, ctx = {}) {
        toast = ctx.toast || toast;
        openModal = ctx.openModal || openModal;
        closeModal = ctx.closeModal || closeModal;
        player.onProblem = (item, why) => toast(`Couldn’t play “${item.name}”${why ? `: ${why}` : ''}`);
        const live = ctx.isCurrent || (() => true);
        const r = M.parseRoute(arg);
        shown = new Map();
        lists = [];
        context = {};
        rerender = () => { if (live())
            render(view, arg, ctx); };
        wire(view);
        const go = () => { if (live()) {
            (pages[r.page] || pages.home)(view, r, live);
            mark();
        } };
        const lib = L();
        if (lib)
            lib.load().then(go, () => go());
        else
            go();
    }
    // ================================================================ mini player + Now Playing
    const bar = document.createElement('div');
    bar.className = 'music-bar';
    bar.hidden = true;
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Music player');
    bar.innerHTML = `<i class="music-progress" id="musicProgress"></i>
    <button class="music-open" id="musicOpen" type="button" aria-label="Open Now Playing"><span class="music-art" id="musicArt"></span><span class="music-now"><b id="musicTitle"></b><small id="musicSub"></small></span></button>
    <button class="icon-btn" id="musicPrev" type="button" aria-label="Previous">${ICON.prev}</button>
    <button class="icon-btn music-play" id="musicPlay" type="button" aria-label="Pause">${ICON.pause}</button>
    <button class="icon-btn" id="musicNext" type="button" aria-label="Next">${ICON.next}</button>
    <button class="icon-btn" id="musicClose" type="button" aria-label="Close the music player">${ICON.close}</button>`;
    const np = document.createElement('div');
    np.className = 'np';
    np.hidden = true;
    np.setAttribute('role', 'dialog');
    np.setAttribute('aria-modal', 'true');
    np.setAttribute('aria-label', 'Now Playing');
    np.innerHTML = `<div class="np-bg" id="npBg"></div>
    <div class="np-in">
      <button class="np-down" id="npDown" type="button" aria-label="Close Now Playing">${ICON.down}</button>
      <div class="np-main">
        <div class="np-art" id="npArt"></div>
        <div class="np-info"><div class="np-text"><b id="npTitle"></b><a id="npArtist" href="#music"></a></div><button type="button" class="am-heart np-heart" id="npFav" aria-label="Favourite" aria-pressed="false">${ICON.heart}</button><button type="button" class="am-more np-more" id="npMore" aria-label="More">${ICON.more}</button></div>
        <div class="np-scrub" id="npScrub"><input type="range" id="npSeek" min="0" max="1000" value="0" aria-label="Position in the song"><div class="np-times"><span id="npElapsed">0:00</span><span id="npLeft"></span></div></div>
        <div class="np-live" id="npLive" hidden><span class="dot"></span>LIVE RADIO</div>
        <div class="np-controls"><button class="icon-btn" id="npShuffle" type="button" aria-label="Shuffle the rest">${ICON.shuffle}</button><button class="icon-btn" id="npPrev" type="button" aria-label="Previous">${ICON.prev}</button><button class="icon-btn np-play" id="npPlay" type="button" aria-label="Pause">${ICON.pause}</button><button class="icon-btn" id="npNext" type="button" aria-label="Next">${ICON.next}</button></div>
        <p class="np-hint">Keeps playing with the screen off. Use the lock-screen controls to pause or skip.</p>
      </div>
      <div class="np-queue" id="npQueue"></div>
    </div>`;
    document.body.append(bar, np);
    const audio = player.audio, seek = $('#npSeek');
    const openNP = () => { if (!player.current)
        return; np.hidden = false; document.body.classList.add('np-open'); sync(); $('#npDown').focus({ preventScroll: true }); };
    const closeNP = () => { if (np.hidden)
        return; np.hidden = true; document.body.classList.remove('np-open'); };
    function mark() {
        var _a;
        const key = (_a = player.current) === null || _a === void 0 ? void 0 : _a.key, favs = M.favs();
        document.querySelectorAll('[data-m-play]').forEach(el => { const on = el.dataset.mPlay === key; el.classList.toggle('playing', on); el.classList.toggle('paused', on && player.paused); });
        document.querySelectorAll('[data-m-fav]').forEach(b => { const on = M.isFav(favs, b.dataset.mFav); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    }
    const artistHref = c => (c.src === 'local' ? '#music/my-artist/' + encodeURIComponent(c.albumArtist || c.artist) : c.src === 'sub' && c.artistId ? '#music/server/artist/' + encodeURIComponent(c.artistId) : c.src === 'audius' && c.artistId ? '#music/artist/' + encodeURIComponent(c.artistId) : '');
    let lastKey = '', lastArt = '';
    function sync() {
        const c = player.current;
        mark();
        if (!c) {
            bar.hidden = true;
            document.body.classList.remove('has-music');
            closeNP();
            lastKey = '';
            return;
        }
        bar.hidden = false;
        document.body.classList.add('has-music');
        const paused = player.paused, many = player.queue.length > 1, radio = c.type === 'radio';
        if (c.key !== lastKey || c.art !== lastArt) { // a new song, or its poster just arrived
            if (c.key !== lastKey) {
                seek.value = 0;
                $('#npElapsed').textContent = '0:00';
                $('#musicProgress').style.width = '0%';
            }
            lastKey = c.key;
            lastArt = c.art;
            $('#musicArt').innerHTML = cover(c);
            $('#musicTitle').textContent = c.name;
            $('#musicSub').textContent = radio ? `LIVE · ${c.artist || 'Radio'}` : c.artist;
            const big = M.bigArt(c);
            $('#npArt').innerHTML = cover({ art: big });
            $('#npBg').style.backgroundImage = big ? `url("${big.replace(/["\\\n]/g, '')}")` : '';
            $('#npTitle').textContent = c.name;
            const a = $('#npArtist'), href = artistHref(c);
            a.textContent = c.artist || (radio ? 'Radio' : '');
            if (href)
                a.href = href;
            else
                a.removeAttribute('href');
            $('#npScrub').hidden = radio;
            $('#npLive').hidden = !radio;
            $('#npMore').hidden = radio;
            $('#npShuffle').hidden = radio;
            $('#npLeft').textContent = c.duration ? '-' + clock(c.duration) : '';
        }
        for (const id of ['#musicPlay', '#npPlay']) {
            const b = $(id);
            b.innerHTML = paused ? ICON.play : ICON.pause;
            b.setAttribute('aria-label', paused ? 'Play' : 'Pause');
        }
        for (const id of ['#musicPrev', '#musicNext', '#npPrev', '#npNext', '#npShuffle'])
            $(id).disabled = !many;
        np.classList.toggle('paused', paused);
        const fav = M.isFav(M.favs(), c.key);
        $('#npFav').classList.toggle('on', fav);
        $('#npFav').setAttribute('aria-pressed', String(fav));
        if (!np.hidden) {
            const q = player.queue, i = player.index, next = many ? Array.from({ length: Math.min(q.length - 1, 12) }, (_, n) => q[(i + 1 + n) % q.length]) : [];
            $('#npQueue').innerHTML = next.length ? `<h3>Up Next</h3>${next.map((s, n) => `<button type="button" class="np-next" data-np="${n + 1}">${cover(s, 'am-row-art')}<span class="am-row-text"><b>${esc(s.name)}</b><small>${esc(s.artist || '')}</small></span></button>`).join('')}` : '';
        }
    }
    function tick() {
        const d = audio.duration, t = audio.currentTime;
        if (!(d > 0) || !Number.isFinite(d))
            return;
        $('#musicProgress').style.width = `${(t / d) * 100}%`;
        if (np.hidden)
            return;
        if (!seek.matches(':active'))
            seek.value = Math.round((t / d) * 1000);
        $('#npElapsed').textContent = clock(t) || '0:00';
        $('#npLeft').textContent = '-' + (clock(d - t) || '0:00');
    }
    audio.addEventListener('timeupdate', tick);
    document.addEventListener('sb-music', sync);
    $('#musicOpen').onclick = openNP;
    $('#musicPlay').onclick = $('#npPlay').onclick = () => player.toggle();
    $('#musicPrev').onclick = $('#npPrev').onclick = () => player.step(-1);
    $('#musicNext').onclick = $('#npNext').onclick = () => player.step(1);
    $('#musicClose').onclick = () => player.stop();
    $('#npDown').onclick = closeNP;
    $('#npShuffle').onclick = () => { player.shuffleRest(); toast('Shuffled what’s next'); };
    $('#npFav').onclick = () => { if (player.current)
        toast(M.favourite(player.current) ? 'Added to Favourites' : 'Removed from Favourites'); };
    $('#npMore').onclick = () => { if (player.current) {
        closeNP();
        songMenu(player.current);
    } };
    $('#npArtist').addEventListener('click', closeNP);
    seek.addEventListener('input', () => { if (audio.duration > 0)
        player.seekTo((seek.value / 1000) * audio.duration); });
    $('#npQueue').addEventListener('click', e => { const b = e.target.closest('[data-np]'); if (!b)
        return; const q = player.queue; player.start(q[(player.index + +b.dataset.np) % q.length], q); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !np.hidden) {
        e.stopPropagation();
        closeNP();
    } }, true);
    addEventListener('hashchange', closeNP);
    // swipe down to put Now Playing away
    let swipeY = null;
    np.addEventListener('touchstart', e => { swipeY = e.touches.length === 1 && !e.target.closest('input, .np-queue') ? e.touches[0].clientY : null; }, { passive: true });
    np.addEventListener('touchend', e => { if (swipeY != null && e.changedTouches[0].clientY - swipeY > 90)
        closeNP(); swipeY = null; }, { passive: true });
    window.addEventListener('streambox-account-synced', () => { sync(); if (location.hash.startsWith('#music'))
        rerender === null || rerender === void 0 ? void 0 : rerender(); });
    M.render = render;
})();
