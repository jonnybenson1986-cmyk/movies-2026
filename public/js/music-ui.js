/* The Music pages, laid out the way Apple Music does it: Listen Now (shelves), Browse (genres), Radio, Library,
   search, and pages for a playlist, an album and an artist. Plus the mini player that stays at the bottom and
   the full-screen Now Playing view. Data and playback come from music.js (window.StreamBoxMusic). */
(() => {
  'use strict';
  const M = window.StreamBoxMusic;
  if (!M || !M.player) return;
  const { esc, clock, GENRES, genreById, player, data } = M;
  const $ = (s, root = document) => root.querySelector(s);
  let toast = () => {};

  const ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" stroke-width="3.4"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M20 5 9 12l11 7zM5 5v14" fill="currentColor"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="m4 5 11 7-11 7zM19 5v14" fill="currentColor"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24"><path d="M3 7h3c4 0 6 10 10 10h5M3 17h3c1.5 0 2.7-1.4 3.8-3.2M21 7h-5c-1.300 0-2.400 1-3.400 2.400M18 4l3 3-3 3M18 14l3 3-3 3"/></svg>',
    note: '<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>',
  };

  // ---- pieces
  const cover = (item, cls = '') => `<span class="am-cover ${cls}">${item.art ? `<img loading="lazy" decoding="async" src="${esc(item.art)}" alt="" onerror="this.remove()">` : ''}${ICON.note}</span>`;
  const favBtn = (item, favs) => { const on = M.isFav(favs, item.key); return `<button type="button" class="am-heart${on ? ' on' : ''}" data-m-fav="${esc(item.key)}" aria-pressed="${on}" aria-label="Favourite ${esc(item.name)}">${ICON.heart}</button>`; };

  let shown = new Map(), lists = [];
  const reg = list => { list.forEach(i => shown.set(i.key, i)); lists.push(list); return lists.length - 1; };

  const songCard = (item, li, favs) => `<div class="am-card" data-m-play="${esc(item.key)}" data-m-list="${li}">
    <button type="button" class="am-tile" data-m="play" aria-label="Play ${esc(item.name)}${item.artist ? ', ' + esc(item.artist) : ''}">${cover(item)}<span class="am-go">${ICON.play}</span>${item.type === 'radio' ? '<span class="am-live">LIVE</span>' : ''}</button>
    ${favBtn(item, favs)}<span class="am-name">${esc(item.name)}</span><span class="am-by">${esc(item.artist || item.genre || '')}</span></div>`;
  const linkCard = c => `<a class="am-card am-link" href="${esc(c.href)}"><span class="am-tile">${cover(c)}</span><span class="am-name">${esc(c.name)}</span><span class="am-by">${esc([c.by, c.note && c.kind === 'album' ? c.note : ''].filter(Boolean).join(' · '))}</span></a>`;
  const artistCard = a => `<a class="am-card am-artist" href="${esc(a.href)}"><span class="am-tile">${cover(a)}</span><span class="am-name">${esc(a.name)}${a.verified ? ' <i class="am-ok" title="Verified artist">' + ICON.check + '</i>' : ''}</span><span class="am-by">Artist</span></a>`;
  const featureCard = (c, label) => `<a class="am-feature" href="${esc(c.href)}"><span class="am-feature-tag">${esc(label)}</span><span class="am-feature-title">${esc(c.name)}</span><span class="am-feature-by">${esc(c.by)}</span>
    <span class="am-feature-art">${cover(c)}<span class="am-feature-text"><b>${esc(c.note ? c.note.slice(0, 110) : c.name)}</b><small>${c.count ? `${c.count} songs` : ''}</small></span></span></a>`;

  const shelf = (title, cards, { href = '', cls = '' } = {}) => (cards ? `<section class="row am-shelf ${cls}">
    <div class="row-head"><h2>${esc(title)}</h2>${href ? `<a class="see-all" href="${esc(href)}">See all ›</a>` : ''}</div>
    <div class="row-track-wrap"><button class="row-arrow left" aria-label="Scroll left"><svg viewBox="0 0 24 24"><path d="M15 18 9 12l6-6"/></svg></button>
      <div class="row-track">${cards}</div>
      <button class="row-arrow right" aria-label="Scroll right"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></button></div></section>` : '');
  const songShelf = (title, list, favs, opts) => { if (!list.length) return ''; const li = reg(list); return shelf(title, list.map(i => songCard(i, li, favs)).join(''), opts); };
  const grid = (list, favs) => { const li = reg(list); return `<div class="am-grid">${list.map(i => songCard(i, li, favs)).join('')}</div>`; };

  // Apple-style song list: number or artwork, title, artist, length, heart
  function rows(list, favs, { numbered = false, artistLinks = true } = {}) {
    if (!list.length) return '';
    const li = reg(list);
    return `<div class="am-rows" role="list">${list.map((s, i) => `<div class="am-row" role="listitem" data-m-play="${esc(s.key)}" data-m-list="${li}">
      <button type="button" class="am-row-main" data-m="play" aria-label="Play ${esc(s.name)}">
        ${numbered ? `<span class="am-num">${i + 1}</span>` : cover(s, 'am-row-art')}
        <span class="am-row-text"><b>${esc(s.name)}</b><small>${esc([s.artist, s.album].filter(Boolean).join(' · '))}</small></span></button>
      ${artistLinks && s.artistId ? `<a class="am-row-artist" href="#music/artist/${esc(encodeURIComponent(s.artistId))}" aria-label="Go to ${esc(s.artist)}">Artist</a>` : ''}
      <span class="am-len">${esc(clock(s.duration))}</span>${favBtn(s, favs)}</div>`).join('')}</div>`;
  }
  const playButtons = li => `<div class="am-actions"><button type="button" class="btn am-btn" data-m-act="play" data-m-list="${li}">${ICON.play} Play</button><button type="button" class="btn am-btn ghost" data-m-act="shuffle" data-m-list="${li}">${ICON.shuffle} Shuffle</button></div>`;

  const TABS = [['', 'Listen Now', 'home'], ['browse', 'Browse', 'browse'], ['radio', 'Radio', 'radio'], ['library', 'Library', 'library']];
  const tabOf = page => ({ genre: 'browse', playlist: 'home', album: 'home', artist: 'home', search: 'search' }[page] || page);
  function chrome(r, body) {
    const active = tabOf(r.page);
    return `<div class="page am" id="amRoot">
      <div class="am-top"><nav class="am-tabs" aria-label="Music sections">${TABS.map(([path, label, id]) => `<a href="#music${path ? '/' + path : ''}" class="${active === id ? 'active' : ''}"${active === id ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
        <form class="am-search" id="amSearch" role="search">${ICON.search}<input type="search" name="q" maxlength="80" value="${esc(r.search || '')}" placeholder="Artists, songs, stations" autocomplete="off" aria-label="Search music"></form></div>
      ${body}
      <p class="am-note">Songs, playlists and artist pictures from <a href="https://audius.co" target="_blank" rel="noopener noreferrer">Audius</a> (published by the artists). Creative Commons songs from Jamendo via <a href="https://openverse.org" target="_blank" rel="noopener noreferrer">Openverse</a>. Concerts and netlabel albums from the <a href="https://archive.org/details/etree" target="_blank" rel="noopener noreferrer">Internet Archive</a>. Radio from <a href="https://somafm.com" target="_blank" rel="noopener noreferrer">SomaFM</a> and <a href="https://www.radio-browser.info" target="_blank" rel="noopener noreferrer">Radio Browser</a>.</p></div>`;
  }
  const title = (text, sub = '') => `<header class="am-title"><h1>${esc(text)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</header>`;
  const empty = text => `<div class="empty">${text}</div>`;

  // A page made of sections that fill in as each source answers (one slow or failing source doesn't hold up the rest)
  function sections(view, r, live, head, parts) {
    view.innerHTML = chrome(r, `${head}<div class="am-wait" id="amWait"><div class="spinner"></div></div>${parts.map((_, i) => `<div data-sec="${i}" hidden></div>`).join('')}<div class="empty" id="amNone" hidden></div>`);
    let pending = parts.length, filled = 0;
    parts.forEach(async (load, i) => {
      let html = '';
      try { html = await load(); } catch (e) { console.warn('music section failed', e); }
      if (!live()) return;
      const slot = $(`[data-sec="${i}"]`, view);
      if (slot && html) { slot.innerHTML = html; slot.hidden = false; if (!load.fixed) filled++; $('#amWait', view)?.remove(); mark(); }
      if (--pending === 0) {
        $('#amWait', view)?.remove();
        if (!filled) { const none = $('#amNone', view); if (none) { none.hidden = false; none.innerHTML = '<b>Nothing to show right now.</b><br>Check your connection and try again.<br><button class="btn btn-more" id="amRetry" type="button" style="margin-top:14px">Try again</button>'; $('#amRetry', view).onclick = () => rerender?.(); } }
      }
    });
  }

  // ---- pages
  const pages = {
    home(view, r, live) {
      const favs = M.favs();
      const picks = [genreById('pop'), genreById('electronic'), genreById('hiphop'), genreById('rock')];
      sections(view, r, live, title('Listen Now'), [
        async () => { const p = await data.playlists(); return p.length ? `<section class="am-features"><div class="am-feature-track">${p.slice(0, 8).map((c, i) => featureCard(c, i === 0 ? 'Featured playlist' : 'Playlist')).join('')}</div></section>` : ''; },
        async () => songShelf('Trending Songs', await data.trending('', 30), favs),
        async () => { const s = await data.soma(); return songShelf('Radio Stations', s.slice(0, 20), favs, { href: '#music/radio' }); },
        async () => { const p = await data.playlists(); return shelf('Popular Playlists', p.slice(8).map(linkCard).join('')); },
        async () => songShelf('Underground: New & Rising', await data.underground(), favs),
        ...picks.map(g => async () => songShelf(`Top ${g.name}`, await data.trending(g.audius, 20), favs, { href: '#music/genre/' + g.id })),
        async () => songShelf('Creative Commons Picks', await data.cc('pop rock', 20), favs),
        async () => shelf('Live Concerts', (await data.concerts()).map(linkCard).join('')),
        Object.assign(async () => shelf('Browse by Genre', GENRES.slice(0, 12).map(genreTile).join(''), { href: '#music/browse', cls: 'am-genre-shelf' }), { fixed: true }),   // built in: doesn't count as a source answering
      ]);
    },
    browse(view, r) {
      view.innerHTML = chrome(r, `${title('Browse', 'Pick a genre')}<div class="am-genres">${GENRES.map(genreTile).join('')}</div>`);
    },
    genre(view, r, live) {
      const g = genreById(r.genre), favs = M.favs();
      const head = `<header class="am-banner" style="--g1:${g.c[0]};--g2:${g.c[1]}"><a class="am-back" href="#music/browse">‹ Browse</a><h1>${esc(g.name)}</h1></header>`;
      sections(view, r, live, head, [
        async () => { const t = await data.trending(g.audius, 40); if (!t.length) return ''; const li = reg(t); return `<div class="am-sec-head"><h2>Top Songs</h2>${playButtons(li)}</div>${rows(t.slice(0, 10), favs)}${t.length > 10 ? songShelf('More ' + g.name, t.slice(10), favs) : ''}`; },
        async () => songShelf('Creative Commons Picks', await data.cc(g.q, 20), favs),
        async () => {
          const [soma, rb] = await Promise.all([data.soma().catch(() => []), data.stations({ tag: g.radio, limit: 30 }).catch(() => [])]);
          return songShelf(`${g.name} Radio`, [...soma.filter(s => g.soma.includes(s.genre)), ...rb], favs, { href: '#music/radio/' + g.id });
        },
        async () => shelf('Albums from Netlabels', (await data.netlabels(g.q)).map(linkCard).join('')),
      ]);
    },
    radio(view, r, live) {
      const favs = M.favs(), g = genreById(r.genre);
      const chips = `<div class="chips am-chips"><a class="chip${!g && !r.search ? ' active' : ''}" href="#music/radio">🇦🇺 Australia</a>${GENRES.map(x => `<a class="chip${g === x ? ' active' : ''}" href="#music/radio/${x.id}">${esc(x.name)}</a>`).join('')}</div>`;
      const head = `${title('Radio', r.search ? `Stations matching “${r.search}”` : g ? `${g.name} stations` : 'Live stations')}
        <form class="am-inline-search" id="amRadioSearch"><input type="search" name="q" maxlength="80" value="${esc(r.search || '')}" placeholder="Find a station by name…" autocomplete="off" aria-label="Find a radio station"><button class="btn am-btn" type="submit">Find</button></form>${chips}`;
      sections(view, r, live, head, [
        async () => { if (r.search) return ''; const s = await data.soma(); const pick = g ? s.filter(x => g.soma.includes(x.genre)) : s; return songShelf('SomaFM · commercial-free', pick, favs); },
        async () => { const s = await data.stations(r.search ? { name: r.search } : g ? { tag: g.radio } : { cc: 'AU' }); return s.length ? `<div class="am-sec-head"><h2>${r.search ? 'Stations' : g ? `${esc(g.name)} stations` : 'Australian stations'}</h2></div>${grid(s, favs)}` : ''; },
      ]);
      $('#amRadioSearch', view).addEventListener('submit', e => { e.preventDefault(); const text = new FormData(e.currentTarget).get('q').trim().slice(0, 80); location.hash = text ? 'music/radio/search/' + encodeURIComponent(text) : 'music/radio'; });
    },
    library(view, r) {
      const favs = M.favs(), songs = favs.filter(i => i.type === 'song'), radios = favs.filter(i => i.type === 'radio');
      let body = empty('Tap the ♥ on a song or a radio station to keep it here.<br>Your library is saved to your account, so it follows you to your other devices.');
      if (favs.length) {
        const li = songs.length ? reg(songs) : -1;
        body = `${songs.length ? `<div class="am-sec-head"><h2>Songs <small>${songs.length}</small></h2>${playButtons(li)}</div>${rows(songs, favs)}` : ''}
          ${radios.length ? `<div class="am-sec-head"><h2>Stations <small>${radios.length}</small></h2></div>${grid(radios, favs)}` : ''}`;
      }
      view.innerHTML = chrome(r, `${title('Library', 'Your favourites')}${body}`);
    },
    search(view, r, live) {
      const favs = M.favs(), text = r.search;
      if (!text) { view.innerHTML = chrome(r, `${title('Search')}${empty('Type an artist, a song or a station above.')}`); return; }
      sections(view, r, live, title('Search', `Results for “${text}”`), [
        async () => shelf('Artists', (await data.artistSearch(text)).map(artistCard).join(''), { cls: 'am-artists' }),
        async () => { const s = await data.songSearch(text); return s.length ? `<div class="am-sec-head"><h2>Songs</h2></div>${rows(s.slice(0, 12), favs)}${s.length > 12 ? songShelf('More songs', s.slice(12), favs) : ''}` : ''; },
        async () => shelf('Playlists', (await data.playlistSearch(text)).map(linkCard).join('')),
        async () => songShelf('Creative Commons Songs', await data.cc(text, 20), favs),
        async () => songShelf('Stations', await data.stations({ name: text, limit: 30 }), favs),
        async () => shelf('Albums & Concerts', (await data.albumSearch(text)).map(linkCard).join('')),
      ]);
    },
    async collection(view, r, live, load, kindLabel, backHref) {
      view.innerHTML = chrome(r, '<div class="am-wait"><div class="spinner"></div></div>');
      try {
        const { info, tracks, note } = await load();
        if (!live()) return;
        if (!info) throw new Error('That couldn’t be found.');
        const favs = M.favs(), li = tracks.length ? reg(tracks) : -1, total = tracks.reduce((n, t) => n + (t.duration || 0), 0);
        view.innerHTML = chrome(r, `<header class="am-hero"><span class="am-hero-art">${cover({ art: M.bigArt(info) || info.art })}</span>
          <div class="am-hero-text"><span class="am-kind">${esc(kindLabel)}</span><h1>${esc(info.name)}</h1>
            <p class="am-hero-by">${info.byId ? `<a href="#music/artist/${esc(encodeURIComponent(info.byId))}">${esc(info.by)}</a>` : esc(info.by)}</p>
            <p class="am-hero-meta">${esc([note || (info.kind === 'album' ? info.note : ''), `${tracks.length} song${tracks.length === 1 ? '' : 's'}`, total ? `${Math.round(total / 60)} min` : ''].filter(Boolean).join(' · '))}</p>
            ${tracks.length ? playButtons(li) : ''}</div></header>
          ${info.kind === 'playlist' && info.note ? `<p class="am-about">${esc(info.note.slice(0, 400))}</p>` : ''}
          ${tracks.length ? rows(tracks, favs, { numbered: info.kind === 'album', artistLinks: info.kind !== 'album' }) : empty('Nothing here can be played in the app.')}
          ${info.kind === 'album' ? `<p class="am-about"><a href="https://archive.org/details/${esc(encodeURIComponent(info.id))}" target="_blank" rel="noopener noreferrer">About this recording on the Internet Archive ↗</a></p>` : ''}`);
        mark();
      } catch (e) { if (live()) fail(view, r, e, backHref); }
    },
    playlist(view, r, live) { return pages.collection(view, r, live, () => data.playlist(r.id), 'Playlist', '#music'); },
    album(view, r, live) { return pages.collection(view, r, live, () => data.album(r.id), 'Album', '#music'); },
    async artist(view, r, live) {
      view.innerHTML = chrome(r, '<div class="am-wait"><div class="spinner"></div></div>');
      try {
        const { info, tracks } = await data.artist(r.id);
        if (!live()) return;
        if (!info) throw new Error('That artist couldn’t be found.');
        const favs = M.favs(), li = tracks.length ? reg(tracks) : -1;
        view.innerHTML = chrome(r, `<header class="am-artist-head">${info.cover ? `<img class="am-artist-cover" src="${esc(info.cover)}" alt="" onerror="this.remove()">` : ''}
          <div class="am-artist-in"><span class="am-artist-pic">${cover({ art: M.bigArt(info) || info.art })}</span>
            <div><h1>${esc(info.name)}${info.verified ? ` <i class="am-ok" title="Verified artist">${ICON.check}</i>` : ''}</h1>
              <p class="am-hero-meta">${esc([info.where, `${info.followers.toLocaleString()} followers`, `${info.tracks} songs`].filter(Boolean).join(' · '))}</p>
              ${tracks.length ? playButtons(li) : ''}</div></div></header>
          ${info.bio ? `<p class="am-about">${esc(info.bio.slice(0, 500))}</p>` : ''}
          ${tracks.length ? `<div class="am-sec-head"><h2>Top Songs</h2></div>${rows(tracks, favs, { artistLinks: false })}` : empty('This artist has no songs to play yet.')}
          <p class="am-about"><a href="https://audius.co/${esc(encodeURIComponent(info.handle))}" target="_blank" rel="noopener noreferrer">${esc(info.name)} on Audius ↗</a></p>`);
        mark();
      } catch (e) { if (live()) fail(view, r, e, '#music'); }
    },
  };
  const genreTile = g => `<a class="am-genre" href="#music/genre/${g.id}" style="--g1:${g.c[0]};--g2:${g.c[1]}"><span>${esc(g.name)}</span></a>`;
  function fail(view, r, e, back) {
    view.innerHTML = chrome(r, `<div class="empty"><b>Couldn’t load this.</b><br>${esc(e.message)}<br><button class="btn btn-more" id="amRetry" type="button" style="margin-top:14px">Try again</button> <a class="btn btn-more" href="${esc(back)}" style="margin-top:14px">Back to Music</a></div>`);
    $('#amRetry', view).onclick = () => rerender?.();
  }

  // ---- one click handler for the whole Music page
  let rerender = null;
  function onClick(e) {
    const fav = e.target.closest('[data-m-fav]');
    if (fav) { const item = shown.get(fav.dataset.mFav) || (player.current?.key === fav.dataset.mFav ? player.current : null); if (item) toast(M.favourite(item) ? 'Added to your Library' : 'Removed from your Library'); return; }
    const act = e.target.closest('[data-m-act]');
    if (act) {
      const list = (lists[+act.dataset.mList] || []).filter(i => i.type === 'song');
      if (!list.length) return;
      const shuffle = act.dataset.mAct === 'shuffle';
      player.start(shuffle ? list[Math.floor(Math.random() * list.length)] : list[0], list, { shuffle });
      return;
    }
    const hit = e.target.closest('[data-m="play"]')?.closest('[data-m-play]');
    if (!hit) return;
    const item = shown.get(hit.dataset.mPlay);
    if (!item) return;
    if (player.current?.key === item.key) player.toggle();
    else player.start(item, (lists[+hit.dataset.mList] || [item]).filter(i => i.type === item.type));
  }

  // The app keeps the same page container and replaces its contents, so the listeners are attached once
  const wired = new WeakSet();
  function wire(view) {
    if (wired.has(view)) return;
    wired.add(view);
    view.addEventListener('click', e => { if (location.hash.startsWith('#music')) onClick(e); });
    view.addEventListener('submit', e => {
      if (e.target.id !== 'amSearch') return;
      e.preventDefault();
      const text = new FormData(e.target).get('q').trim().slice(0, 80);
      location.hash = text ? 'music/search/' + encodeURIComponent(text) : 'music';
    });
  }
  let libraryCount = -1;
  function render(view, arg, ctx = {}) {
    toast = ctx.toast || toast;
    player.onProblem = item => toast(`Couldn’t play “${item.name}”`);
    const live = ctx.isCurrent || (() => true);
    const r = M.parseRoute(arg);
    shown = new Map(); lists = [];
    rerender = () => render(view, arg, ctx);
    libraryCount = r.page === 'library' ? M.favs().length : -1;
    wire(view);
    (pages[r.page] || pages.home)(view, r, live);
    mark();
  }

  // ================================================================ mini player + Now Playing
  const bar = document.createElement('div');
  bar.className = 'music-bar'; bar.hidden = true;
  bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Music player');
  bar.innerHTML = `<i class="music-progress" id="musicProgress"></i>
    <button class="music-open" id="musicOpen" type="button" aria-label="Open Now Playing"><span class="music-art" id="musicArt"></span><span class="music-now"><b id="musicTitle"></b><small id="musicSub"></small></span></button>
    <button class="icon-btn" id="musicPrev" type="button" aria-label="Previous">${ICON.prev}</button>
    <button class="icon-btn music-play" id="musicPlay" type="button" aria-label="Pause">${ICON.pause}</button>
    <button class="icon-btn" id="musicNext" type="button" aria-label="Next">${ICON.next}</button>
    <button class="icon-btn" id="musicClose" type="button" aria-label="Close the music player">${ICON.close}</button>`;
  const np = document.createElement('div');
  np.className = 'np'; np.hidden = true;
  np.setAttribute('role', 'dialog'); np.setAttribute('aria-modal', 'true'); np.setAttribute('aria-label', 'Now Playing');
  np.innerHTML = `<div class="np-bg" id="npBg"></div>
    <div class="np-in">
      <button class="np-down" id="npDown" type="button" aria-label="Close Now Playing">${ICON.down}</button>
      <div class="np-main">
        <div class="np-art" id="npArt"></div>
        <div class="np-info"><div class="np-text"><b id="npTitle"></b><a id="npArtist" href="#music"></a></div><button type="button" class="am-heart np-heart" id="npFav" aria-label="Favourite" aria-pressed="false">${ICON.heart}</button></div>
        <div class="np-scrub" id="npScrub"><input type="range" id="npSeek" min="0" max="1000" value="0" aria-label="Position in the song"><div class="np-times"><span id="npElapsed">0:00</span><span id="npLeft"></span></div></div>
        <div class="np-live" id="npLive" hidden><span class="dot"></span>LIVE RADIO</div>
        <div class="np-controls"><button class="icon-btn" id="npPrev" type="button" aria-label="Previous">${ICON.prev}</button><button class="icon-btn np-play" id="npPlay" type="button" aria-label="Pause">${ICON.pause}</button><button class="icon-btn" id="npNext" type="button" aria-label="Next">${ICON.next}</button></div>
        <p class="np-hint">Keeps playing with the screen off. Use the lock-screen controls to pause or skip.</p>
      </div>
      <div class="np-queue" id="npQueue"></div>
    </div>`;
  document.body.append(bar, np);
  const audio = player.audio, seek = $('#npSeek');

  const openNP = () => { if (!player.current) return; np.hidden = false; document.body.classList.add('np-open'); sync(); $('#npDown').focus({ preventScroll: true }); };
  const closeNP = () => { if (np.hidden) return; np.hidden = true; document.body.classList.remove('np-open'); };

  function mark() {   // highlight what is playing, and keep the hearts right, on the page behind
    const key = player.current?.key, favs = M.favs();
    document.querySelectorAll('[data-m-play]').forEach(el => { const on = el.dataset.mPlay === key; el.classList.toggle('playing', on); el.classList.toggle('paused', on && player.paused); });
    document.querySelectorAll('[data-m-fav]').forEach(b => { const on = M.isFav(favs, b.dataset.mFav); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
  }
  let lastKey = '';
  function sync() {
    const c = player.current;
    if (libraryCount >= 0 && location.hash.startsWith('#music/library') && M.favs().length !== libraryCount) rerender?.();   // a favourite was added or removed
    mark();
    if (!c) { bar.hidden = true; document.body.classList.remove('has-music'); closeNP(); lastKey = ''; return; }
    bar.hidden = false; document.body.classList.add('has-music');
    const paused = player.paused, many = player.queue.length > 1, radio = c.type === 'radio';
    if (c.key !== lastKey) {
      lastKey = c.key;
      $('#musicArt').innerHTML = cover(c);
      $('#musicTitle').textContent = c.name;
      $('#musicSub').textContent = radio ? `LIVE · ${c.artist || 'Radio'}` : c.artist;
      const big = M.bigArt(c);
      $('#npArt').innerHTML = cover({ art: big });
      $('#npBg').style.backgroundImage = big ? `url("${big.replace(/["\\\n]/g, '')}")` : '';
      $('#npTitle').textContent = c.name;
      const a = $('#npArtist'); a.textContent = c.artist || (radio ? 'Radio' : '');
      if (c.artistId) a.href = '#music/artist/' + encodeURIComponent(c.artistId); else a.removeAttribute('href');
      $('#npScrub').hidden = radio; $('#npLive').hidden = !radio;
      seek.value = 0; $('#npElapsed').textContent = '0:00'; $('#npLeft').textContent = c.duration ? '-' + clock(c.duration) : '';
      $('#musicProgress').style.width = '0%';
    }
    for (const id of ['#musicPlay', '#npPlay']) { const b = $(id); b.innerHTML = paused ? ICON.play : ICON.pause; b.setAttribute('aria-label', paused ? 'Play' : 'Pause'); }
    for (const id of ['#musicPrev', '#musicNext', '#npPrev', '#npNext']) $(id).disabled = !many;
    np.classList.toggle('paused', paused);
    const fav = M.isFav(M.favs(), c.key);
    $('#npFav').classList.toggle('on', fav); $('#npFav').setAttribute('aria-pressed', String(fav));
    if (!np.hidden) {
      const q = player.queue, i = player.index, next = many ? Array.from({ length: Math.min(q.length - 1, 12) }, (_, n) => q[(i + 1 + n) % q.length]) : [];
      $('#npQueue').innerHTML = next.length ? `<h3>Up Next</h3>${next.map((s, n) => `<button type="button" class="np-next" data-np="${n + 1}">${cover(s, 'am-row-art')}<span class="am-row-text"><b>${esc(s.name)}</b><small>${esc(s.artist || '')}</small></span></button>`).join('')}` : '';
    }
  }
  function tick() {
    const d = audio.duration, t = audio.currentTime;
    if (!(d > 0) || !Number.isFinite(d)) return;
    $('#musicProgress').style.width = `${(t / d) * 100}%`;
    if (np.hidden) return;
    if (!seek.matches(':active')) seek.value = Math.round((t / d) * 1000);
    $('#npElapsed').textContent = clock(t) || '0:00'; $('#npLeft').textContent = '-' + (clock(d - t) || '0:00');
  }
  audio.addEventListener('timeupdate', tick);
  document.addEventListener('sb-music', sync);

  $('#musicOpen').onclick = openNP;
  $('#musicPlay').onclick = $('#npPlay').onclick = () => player.toggle();
  $('#musicPrev').onclick = $('#npPrev').onclick = () => player.step(-1);
  $('#musicNext').onclick = $('#npNext').onclick = () => player.step(1);
  $('#musicClose').onclick = () => player.stop();
  $('#npDown').onclick = closeNP;
  $('#npFav').onclick = () => { if (player.current) toast(M.favourite(player.current) ? 'Added to your Library' : 'Removed from your Library'); };
  $('#npArtist').addEventListener('click', closeNP);
  seek.addEventListener('input', () => { if (audio.duration > 0) player.seekTo((seek.value / 1000) * audio.duration); });
  $('#npQueue').addEventListener('click', e => { const b = e.target.closest('[data-np]'); if (!b) return; const q = player.queue; player.start(q[(player.index + +b.dataset.np) % q.length], q); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !np.hidden) { e.stopPropagation(); closeNP(); } }, true);
  addEventListener('hashchange', closeNP);
  // swipe down to put Now Playing away
  let swipeY = null;
  np.addEventListener('touchstart', e => { swipeY = e.touches.length === 1 && !e.target.closest('input, .np-queue') ? e.touches[0].clientY : null; }, { passive: true });
  np.addEventListener('touchend', e => { if (swipeY != null && e.changedTouches[0].clientY - swipeY > 90) closeNP(); swipeY = null; }, { passive: true });

  window.addEventListener('streambox-account-synced', () => { sync(); if (location.hash.startsWith('#music')) rerender?.(); });
  M.render = render;
})();
