/* Movy Browser box: an in-app browser panel for Movy and its playback providers. */
(() => {
  'use strict';
  const ALLOWED = ['movy.sx', 'vidy.st', 'vidlink.pro', 'moviesapi.to', 'videasy.net', 'vidnest.fun'];
  const HOME = 'https://www.movy.sx/';
  const HOSTS = ['vidlink.pro', 'moviesapi.to', 'player.videasy.net', 'vidnest.fun'];
  const playerHost = host => HOSTS.some(d => host === d || host.endsWith('.' + d));
  const hostAllowed = host => {
    host = String(host || '').toLowerCase();
    return ALLOWED.some(d => host === d || host.endsWith('.' + d));
  };
  function allowedUrl(value) {
    let url;
    try { url = new URL(String(value ?? '').trim()); } catch { return null; }
    if (url.protocol !== 'https:' || !hostAllowed(url.hostname)) return null;
    url.hash = '';
    return url.href;
  }
  let el = null, frame = null, address = null, stateText = null, external = null;
  let backBtn = null, forwardBtn = null, fullBtn = null;
  let stack = [], at = -1, current = '', ownLoad = false, watchToken = '', openTitle = '';
  let servers = [], serverAt = -1, searchTimer = null, searching = false;

  function say(text) { if (stateText) stateText.textContent = text || ''; }
  function chip() {
    const ok = window.StreamBoxMovy?.protectedPlayback;
    return ok ? 'Helper active' : 'Helper not installed';
  }
  function updateButtons() {
    if (backBtn) backBtn.disabled = at <= 0;
    if (forwardBtn) forwardBtn.disabled = at < 0 || at >= stack.length - 1;
  }
  // The helper's observer lives on every provider page; only ask it to watch real player pages.
  function watchable(url) {
    try {
      const u = new URL(url);
      return playerHost(u.hostname) || /^\/(movie|tv|anime)\/[^/]+/.test(u.pathname);
    } catch { return false; }
  }
  function poke() {
    if (!frame?.contentWindow || !current || !watchable(current)) return;
    watchToken = crypto.randomUUID();
    try { frame.contentWindow.postMessage({ type: 'streambox-watch-movie', token: watchToken, url: current, autoplay: true }, new URL(current).origin); } catch { /* frame busy */ }
  }
  function navigate(url) {
    current = url;
    ownLoad = true;
    if (address) { address.value = url; address.placeholder = 'Type a Movy or provider address'; }
    if (external) external.hidden = false;
    say('');
    if (frame) frame.src = url;
    updateButtons();
  }
  // Playback servers that can host the same title. Browsers cannot query these
  // providers directly, so "find the server that works" is done by trying each
  // known player server for the title and watching for a real playback state.
  function serverUrls(url) {
    try {
      const u = new URL(url);
      const m = /^\/(movie|tv|anime)\/([^/]+)(?:\/(\d+))?(?:\/(\d+))?/.exec(u.pathname);
      if (!m) return [];
      const [, kind, id, season, episode] = m;
      const tail = kind === 'tv' && season ? '/' + season + '/' + (episode || 1) : kind === 'anime' && season ? '/' + season : '';
      const q = '?autoplay=true';
      return [
        { name: 'Vidy', url: 'https://www.vidy.st/' + kind + '/' + id + tail + q },
        { name: 'VidLink', url: 'https://vidlink.pro/' + kind + '/' + id + tail + q },
        { name: 'Vidnest', url: 'https://vidnest.fun/' + kind + '/' + id + tail + q },
        { name: 'Videasy', url: 'https://player.videasy.net/' + kind + '/' + id + tail + q },
        { name: 'MoviesAPI', url: 'https://moviesapi.to/' + kind + '/' + id + tail + q },
      ].filter(candidate => candidate.url !== u.origin + u.pathname + q);
    } catch { return []; }
  }
  function clearSearch() {
    searching = false;
    if (searchTimer) { clearTimeout(searchTimer); searchTimer = null; }
  }
  function tryServer(i) {
    if (!searching || !el || el.hidden) return;
    if (i >= servers.length) { clearSearch(); say('No server found that plays this title. Try another address.'); return; }
    serverAt = i;
    const server = servers[i];
    watchToken = crypto.randomUUID();
    say(`Searching for a working server… trying ${server.name} (${i + 1}/${servers.length})`);
    navigate(server.url);
    // If this server neither reports a state nor plays within the window, move on.
    searchTimer = setTimeout(() => {
      if (searching && serverAt === i) tryServer(i + 1);
    }, 12000);
  }
  function startServerSearch(url) {
    clearSearch();
    servers = serverUrls(url);
    if (!servers.length) { say(''); return; }
    searching = true;
    serverAt = -1;
    tryServer(0);
  }
  function go(url) {
    const clean = allowedUrl(url);
    if (!clean) { say('Only Movy and its playback providers open here.'); return false; }
    stack = stack.slice(0, at + 1);
    stack.push(clean);
    at = stack.length - 1;
    navigate(clean);
    startServerSearch(clean);
    return true;
  }
  function step(dir) {
    const next = at + dir;
    if (next < 0 || next >= stack.length) return;
    at = next;
    navigate(stack[at]);
  }
  function stateFor(value) {
    return {
      playing: 'Playing', starting: 'Starting…', stalled: 'Playback stalled',
      ready: 'Ready — press Play', idle: 'Ready — press Play', paused: 'Paused', ended: 'Finished',
      unavailable: 'Source unavailable — try another address',
      error: 'Source error — try another address',
      unknown: 'Automatic checking unavailable — use the site’s own controls',
    }[value] || '';
  }
  function message(event) {
    if (!el || el.hidden || event.source !== frame?.contentWindow || !current) return;
    let origin = '';
    try { origin = new URL(current).origin; } catch { return; }
    const data = event.data;
    if (event.origin === origin && data?.type === 'streambox-movie-state' && data.token === watchToken) {
      if (searching) {
        if (data.state === 'unavailable' || data.state === 'error') { clearTimeout(searchTimer); tryServer(serverAt + 1); return; }
        clearSearch();
        say(stateFor(data.state) + ' · server found');
      } else say(stateFor(data.state));
    } else if (event.origin === 'https://vidlink.pro' && data?.type === 'PLAYER_EVENT') {
      const ev = data.data?.event;
      if (searching && ev === 'play') { clearSearch(); say('Playing · VidLink · server found'); }
      else if (ev === 'play') say('Playing · VidLink');
      else if (ev === 'pause') say('Paused · VidLink');
      else if (ev === 'ended') say('Finished · VidLink');
    }
  }
  function build() {
    if (el) return;
    el = document.createElement('div');
    el.className = 'movy-browser';
    el.hidden = true;
    el.innerHTML = `
      <div class="movy-browser-bar">
        <button class="icon-btn" data-mb="back" aria-label="Back" title="Back"><svg viewBox="0 0 24 24"><path d="M15 18 9 12l6-6"/></svg></button>
        <button class="icon-btn" data-mb="forward" aria-label="Forward" title="Forward"><svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button>
        <button class="icon-btn" data-mb="reload" aria-label="Reload" title="Reload"><svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.3M21 3v6h-6"/></svg></button>
        <button class="icon-btn" data-mb="home" aria-label="Movy home" title="Movy home"><svg viewBox="0 0 24 24"><path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg></button>
        <button class="icon-btn" data-mb="find" aria-label="Find a working server" title="Search for a server that plays this video"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></button>
        <div class="movy-browser-address">
          <svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
          <input type="url" spellcheck="false" autocomplete="off" aria-label="Address">
        </div>
        <span class="movy-browser-state" role="status"></span>
        <button class="icon-btn" data-mb="fullscreen" aria-label="Fullscreen" title="Fullscreen"><svg viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg></button>
        <button class="icon-btn" data-mb="external" aria-label="Open in a browser tab" title="Open in a browser tab" hidden><svg viewBox="0 0 24 24"><path d="M14 3h7v7M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/></svg></button>
        <button class="icon-btn" data-mb="close" aria-label="Close" title="Close"><svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      </div>
      <iframe class="movy-browser-frame" title="Movy browser box" referrerpolicy="no-referrer" allow="autoplay *; fullscreen *; encrypted-media; picture-in-picture"></iframe>`;
    document.body.appendChild(el);
    frame = el.querySelector('.movy-browser-frame');
    address = el.querySelector('input');
    stateText = el.querySelector('.movy-browser-state');
    [backBtn, forwardBtn] = ['back', 'forward'].map(k => el.querySelector(`[data-mb="${k}"]`));
    external = el.querySelector('[data-mb="external"]');
    fullBtn = el.querySelector('[data-mb="fullscreen"]');
    document.addEventListener('fullscreenchange', updateFullscreenIcon);
    frame.addEventListener('load', () => {
      if (ownLoad) { ownLoad = false; poke(); return; }
      say('The site moved inside itself — the address shown may be out of date.');
    });
    el.addEventListener('click', e => {
      const btn = e.target.closest('[data-mb]');
      if (!btn) return;
      const action = btn.dataset.mb;
      if (action === 'back') step(-1);
      else if (action === 'forward') step(1);
      else if (action === 'reload') { if (current) navigate(current); }
      else if (action === 'home') go(HOME);
      else if (action === 'find' && current) startServerSearch(current);
      else if (action === 'fullscreen') toggleFullscreen();
      else if (action === 'external' && current) window.open(current, '_blank', 'noopener');
      else if (action === 'close') close();
    });
    address.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const value = address.value.trim();
      if (value && !/^\w+:\/\//.test(value)) go('https://' + value);
      else if (value) go(value);
      address.blur();
    });
    window.addEventListener('message', message);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && el && !el.hidden) close(); });
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen?.().catch(() => say('Fullscreen was blocked — try the browser’s full-screen control.'));
  }
  function updateFullscreenIcon() {
    if (!fullBtn) return;
    const on = !!document.fullscreenElement;
    fullBtn.title = on ? 'Exit fullscreen' : 'Fullscreen';
    fullBtn.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Fullscreen');
    fullBtn.innerHTML = on
      ? '<svg viewBox="0 0 24 24"><path d="M8 3v5H3M16 3v5h5M8 21v-5H3M16 21v-5h5"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>';
  }
  function open(url = HOME, name = 'Movy') {
    build();
    openTitle = String(name || 'Movy').slice(0, 120);
    if (frame) frame.title = openTitle + ' — browser box';
    el.hidden = false;
    document.body.style.overflow = 'hidden';
    if (!go(url)) go(HOME);
    say(chip());
    if (address) { address.focus(); address.select(); }
  }
  function close() {
    if (!el) return;
    clearSearch();
    el.hidden = true;
    if (document.fullscreenElement && document.fullscreenElement === el) document.exitFullscreen().catch(() => {});
    if (frame) frame.src = 'about:blank';
    current = ''; watchToken = ''; ownLoad = false; at = -1; stack = [];
    if (!document.querySelector('.player:not([hidden]), .movy-setup:not([hidden])')) document.body.style.overflow = '';
    say('');
  }
  window.StreamBoxMovyBrowser = { open, close, allowedUrl, hostAllowed, HOME, serverUrls, startServerSearch, toggleFullscreen };
})();
