/* The player for chart songs and YouTube Music songs, laid out like YouTube Music's own: the video where the cover
   would be, then the song, a scrubber, and shuffle / previous / play-pause / next / repeat, with Up Next below.
   It drives YouTube's official embedded player through the IFrame Player API (www.youtube.com/iframe_api): nothing is
   downloaded or extracted, and the video stays on screen at full size, as YouTube's terms require.
   A chart song is found on YouTube Music first (StreamBoxMusic.findOnYouTube); one YouTube won't play here is skipped.
   Used by music-ui.js: window.StreamBoxYouTubePlayer.play(item, list, { shuffle, toast }) and .close(). */
(() => {
  'use strict';
  const M = window.StreamBoxMusic;
  if (!M || typeof document === 'undefined') return;
  const { esc, clock } = M;
  const $ = (s, root = document) => root.querySelector(s);
  const ICON = {
    down: '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" stroke="none"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><path d="M19 5 9 12l10 7zM6 5v14" fill="currentColor"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="m5 5 10 7-10 7zM18 5v14" fill="currentColor"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24"><path d="M3 7h3c4 0 6 10 10 10h5M3 17h3c1.5 0 2.7-1.4 3.8-3.2M21 7h-5c-1.3 0-2.4 1-3.4 2.4M18 4l3 3-3 3M18 14l3 3-3 3"/></svg>',
    repeat: '<svg viewBox="0 0 24 24"><path d="M4 11V9a3 3 0 0 1 3-3h12M16 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H5M8 21l-3-3 3-3"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
  };

  // ---- YouTube's IFrame Player API, loaded once
  let apiReady = null;
  const loadApi = () => (apiReady ||= new Promise((resolve, reject) => {
    if (window.YT?.Player) { resolve(window.YT); return; }
    const before = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { before?.(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api'; s.async = true;
    s.onerror = () => { apiReady = null; reject(new Error('YouTube’s player couldn’t load')); };
    document.head.appendChild(s);
  }));

  // ---- state
  let layer = null, yt = null, list = [], order = [], at = 0, repeat = 'off', shuffleOn = false, tick = 0, toast = () => {}, tries = 0, startTimer = 0;
  const ids = new Map();   // chart song key -> YouTube video id (found once)
  const current = () => list[order[at]];

  function build() {
    layer = document.createElement('div');
    layer.className = 'am-youtube-layer amyt';
    layer.setAttribute('role', 'dialog'); layer.setAttribute('aria-modal', 'true'); layer.setAttribute('aria-label', 'Now Playing');
    layer.innerHTML = `<div class="amyt-bg" id="amytBg"></div>
      <div class="amyt-in">
        <div class="amyt-top"><button type="button" class="amyt-icon amyt-down" id="amytDown" aria-label="Close the player">${ICON.down}</button><span class="amyt-source">YouTube Music</span><span class="amyt-gap"></span></div>
        <div class="amyt-video"><div id="amytFrame"></div><p class="amyt-tap" id="amytTap" hidden>Tap the video to start</p></div>
        <div class="amyt-info"><div class="amyt-text"><b id="amytTitle"></b><span id="amytArtist"></span></div><button type="button" class="amyt-icon amyt-heart" id="amytFav" aria-label="Favourite" aria-pressed="false">${ICON.heart}</button></div>
        <div class="amyt-scrub"><input type="range" id="amytSeek" min="0" max="1000" value="0" aria-label="Position in the song"><div class="amyt-times"><span id="amytNow">0:00</span><span id="amytLen"></span></div></div>
        <div class="amyt-controls">
          <button type="button" class="amyt-icon" id="amytShuffle" aria-label="Shuffle" aria-pressed="false">${ICON.shuffle}</button>
          <button type="button" class="amyt-icon amyt-skip" id="amytPrev" aria-label="Previous">${ICON.prev}</button>
          <button type="button" class="amyt-play" id="amytPlay" aria-label="Pause">${ICON.pause}</button>
          <button type="button" class="amyt-icon amyt-skip" id="amytNext" aria-label="Next">${ICON.next}</button>
          <button type="button" class="amyt-icon amyt-repeat" id="amytRepeat" aria-label="Repeat: off" aria-pressed="false">${ICON.repeat}<i>1</i></button>
        </div>
        <p class="amyt-note">Plays in YouTube’s player. On the lock screen YouTube shows its own buttons; skip from here.</p>
        <div class="amyt-queue" id="amytQueue"></div>
      </div>`;
    document.body.appendChild(layer);
    $('#amytDown', layer).onclick = close;
    $('#amytPlay', layer).onclick = toggle;
    $('#amytNext', layer).onclick = () => step(1, true);
    $('#amytPrev', layer).onclick = () => { if (yt?.getCurrentTime?.() > 4) yt.seekTo(0, true); else step(-1, true); };
    $('#amytShuffle', layer).onclick = () => setShuffle(!shuffleOn);
    $('#amytRepeat', layer).onclick = () => { repeat = { off: 'all', all: 'one', one: 'off' }[repeat]; paintButtons(); toast({ off: 'Repeat off', all: 'Repeating the list', one: 'Repeating this song' }[repeat]); };
    $('#amytFav', layer).onclick = () => { const c = current(); if (c) { toast(M.favourite(c) ? 'Added to Favourites' : 'Removed from Favourites'); paintSong(); } };
    const seek = $('#amytSeek', layer);
    seek.addEventListener('input', () => { const d = yt?.getDuration?.(); if (d > 0) yt.seekTo((seek.value / 1000) * d, true); });
    $('#amytQueue', layer).addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) { at = +b.dataset.q; playCurrent(); } });
  }

  // ---- showing what's playing
  function paintSong() {
    const c = current();
    if (!c || !layer) return;
    $('#amytTitle', layer).textContent = c.name;
    $('#amytArtist', layer).textContent = c.artist || '';
    $('#amytBg', layer).style.backgroundImage = c.art ? `url("${String(c.art).replace(/["\\\n]/g, '')}")` : '';
    const fav = M.isFav(M.favs(), c.key);
    $('#amytFav', layer).classList.toggle('on', fav); $('#amytFav', layer).setAttribute('aria-pressed', String(fav));
    const upNext = [];   // what comes after this song: to the end of the list, or round again when repeating it
    for (let n = 1; n < order.length && upNext.length < 30; n++) { const i = at + n; if (i < order.length) upNext.push(i); else if (repeat === 'all') upNext.push(i - order.length); }
    $('#amytQueue', layer).innerHTML = upNext.length ? `<h3>Up Next</h3>${upNext.map(i => { const s = list[order[i]]; return `<button type="button" class="amyt-next" data-q="${i}">${s.art ? `<img src="${esc(s.art)}" alt="" loading="lazy" onerror="this.remove()">` : '<span></span>'}<span class="amyt-next-text"><b>${esc(s.name)}</b><small>${esc(s.artist || '')}</small></span></button>`; }).join('')}` : '';
    describe(c);
  }
  function paintButtons() {
    if (!layer) return;
    const playing = yt?.getPlayerState?.() === 1;
    const play = $('#amytPlay', layer);
    play.innerHTML = playing ? ICON.pause : ICON.play; play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    $('#amytShuffle', layer).classList.toggle('on', shuffleOn); $('#amytShuffle', layer).setAttribute('aria-pressed', String(shuffleOn));
    const r = $('#amytRepeat', layer);
    r.classList.toggle('on', repeat !== 'off'); r.classList.toggle('one', repeat === 'one');
    r.setAttribute('aria-pressed', String(repeat !== 'off')); r.setAttribute('aria-label', `Repeat: ${{ off: 'off', all: 'the list', one: 'this song' }[repeat]}`);
    const many = order.length > 1;
    $('#amytNext', layer).disabled = !many && repeat === 'off'; $('#amytShuffle', layer).disabled = !many;
  }
  function paintTime() {
    if (!layer || !yt?.getDuration) return;
    const d = yt.getDuration() || 0, t = yt.getCurrentTime() || 0, seek = $('#amytSeek', layer);
    if (d > 0 && !seek.matches(':active')) seek.value = Math.round((t / d) * 1000);
    $('#amytNow', layer).textContent = clock(t) || '0:00';
    $('#amytLen', layer).textContent = d > 0 ? clock(d) : '';
  }
  // The lock screen and Bluetooth/car displays: the song and its cover. (While YouTube's player plays, the phone may
  // show YouTube's own buttons instead; skipping then works from this screen.)
  function describe(c) {
    const ms = navigator.mediaSession;
    if (!ms) return;
    try {
      ms.metadata = new MediaMetadata({ title: c.name, artist: c.artist || '', album: 'StreamBox', artwork: c.art ? ['96x96', '256x256', '512x512'].map(sizes => ({ src: c.art, sizes })) : [] });
      const on = (n, fn) => { try { ms.setActionHandler(n, fn); } catch { /* not here */ } };
      on('play', () => yt?.playVideo?.()); on('pause', () => yt?.pauseVideo?.());
      on('nexttrack', () => step(1, true)); on('previoustrack', () => step(-1, true));
    } catch { /* older browsers */ }
  }

  // ---- playing
  async function videoOf(item) {
    if (item.src === 'youtube') return item.id;
    if (ids.has(item.key)) return ids.get(item.key);
    const found = await M.findOnYouTube(item);
    if (found) ids.set(item.key, found.id);
    return found?.id || '';
  }
  async function playCurrent() {
    const item = current();
    if (!item) return;
    paintSong(); paintButtons();
    $('#amytTap', layer).hidden = true;
    const id = await videoOf(item);
    if (current() !== item || !layer) return;
    if (!id) { toast(`Couldn’t find “${item.name}” on YouTube Music`); skipBroken(); return; }
    M.remember(item);
    const YT = await loadApi().catch(e => { toast(e.message); return null; });
    if (!YT || current() !== item || !layer) return;
    if (!yt) {
      yt = new YT.Player($('#amytFrame', layer), {
        videoId: id, width: '100%', height: '100%',
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, origin: location.origin },
        events: { onReady: e => { e.target.playVideo(); paintButtons(); }, onStateChange, onError },
      });
    } else yt.loadVideoById(id);
    // A phone can refuse to start YouTube's player by itself: then a tap on the video starts it
    clearTimeout(startTimer);
    startTimer = setTimeout(() => { if (layer && yt?.getPlayerState?.() !== 1 && yt?.getPlayerState?.() !== 3) $('#amytTap', layer).hidden = false; }, 3500);
  }
  function onStateChange(e) {
    if (e.data === 1) { tries = 0; $('#amytTap', layer).hidden = true; }
    if (e.data === 0) {   // ended
      if (repeat === 'one') { yt.seekTo(0, true); yt.playVideo(); } else if (!step(1, false)) paintButtons();
    }
    paintButtons();
  }
  function onError() { toast(`YouTube won’t play “${current()?.name || 'this song'}” here`); skipBroken(); }
  function skipBroken() { if (++tries < Math.min(5, order.length)) step(1, true); else { tries = 0; paintButtons(); } }
  // dir: +1 next, -1 previous. byHand: a press (wraps around); at the end of the list without repeat, it stops.
  function step(dir, byHand) {
    if (order.length < 2 && repeat === 'off') return false;
    let next = at + dir;
    if (next >= order.length) { if (repeat === 'off' && !byHand) return false; next = 0; }
    if (next < 0) next = order.length - 1;
    at = next; playCurrent();
    return true;
  }
  const toggle = () => { if (!yt?.getPlayerState) return; if (yt.getPlayerState() === 1) yt.pauseVideo(); else yt.playVideo(); };
  function setShuffle(on) {
    shuffleOn = on;
    const playing = order[at];
    order = on ? [playing, ...M.shuffled(list.map((_, i) => i).filter(i => i !== playing), undefined)] : list.map((_, i) => i);
    at = order.indexOf(playing);
    paintSong(); paintButtons();
    toast(on ? 'Shuffle on' : 'Shuffle off');
  }

  function play(item, items, opts = {}) {
    toast = opts.toast || toast;
    M.player.pause();   // one thing playing at a time
    list = (items && items.length ? items : [item]).filter(i => i.src === 'youtube' || i.src === 'chart');
    if (!list.some(i => i.key === item.key)) list.unshift(item);
    shuffleOn = !!opts.shuffle;
    const first = list.findIndex(i => i.key === item.key);
    order = shuffleOn ? [first, ...M.shuffled(list.map((_, i) => i).filter(i => i !== first), undefined)] : list.map((_, i) => i);
    at = order.indexOf(first); tries = 0;
    if (!layer) build();
    clearInterval(tick); tick = setInterval(paintTime, 500);
    playCurrent();
    $('#amytPlay', layer).focus({ preventScroll: true });   // a TV remote starts on play/pause
  }
  function close() {
    clearInterval(tick); clearTimeout(startTimer);
    try { yt?.destroy?.(); } catch { /* already gone */ }
    yt = null; layer?.remove(); layer = null;
  }
  // keys: media keys and a TV remote's play/pause and skip; Escape or Back closes
  document.addEventListener('keydown', e => {
    if (!layer) return;
    const k = e.key;
    const act = { Escape: close, GoBack: close, BrowserBack: close, MediaPlayPause: toggle, MediaPlay: () => yt?.playVideo?.(), MediaPause: () => yt?.pauseVideo?.(), MediaTrackNext: () => step(1, true), MediaTrackPrevious: () => step(-1, true) }[k];
    if (act) { e.preventDefault(); e.stopPropagation(); act(); }
  }, true);
  addEventListener('hashchange', close);

  window.StreamBoxYouTubePlayer = { play, close, get open() { return !!layer; } };
})();
