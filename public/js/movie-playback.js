/* Sequential provider fallback. An iframe load is never proof of video playback. */
(() => {
  'use strict';
  function create({ frame, select, external, status, next, canOpen }) {
    let movie = null, sources = [], index = -1, token = '', timer = null;
    let attempted = new Set(), lastTime = null, active = false, seeking = false;
    const say = text => { status.textContent = text; };
    const clear = () => { clearTimeout(timer); timer = null; };
    function watchProgress() {
      clear();
      timer = setTimeout(() => {
        if (!movie || !active || seeking) return;
        // Background tabs can throttle both media and provider messages.
        if (document.hidden) { watchProgress(); return; }
        fail('Playback stalled');
      }, 25000);
    }
    function observe() {
      if (!movie || index < 0 || frame.src !== sources[index].url) return;
      frame.contentWindow?.postMessage({ type: 'streambox-watch-movie', token, url: sources[index].url, autoplay: true }, new URL(sources[index].url).origin);
    }
    function open(number) {
      clear();
      index = number;
      attempted.add(index);
      token = crypto.randomUUID();
      lastTime = null; active = false; seeking = false;
      select.value = String(index);
      next.disabled = sources.length < 2;
      next.textContent = 'Try next source';
      const attemptToken = token;
      const load = allowed => {
        if (!movie || token !== attemptToken) return;
        if (!allowed) { advance('Playback protection unavailable'); return; }
        frame.src = external.href = sources[index].url;
        say(`Trying ${sources[index].name} · ${attempted.size}/${sources.length}. Press Play if needed.`);
        timer = setTimeout(() => {
          if (!active) say(`${sources[index].name}: press Play. If unavailable, try next source or install the playback helper.`);
        }, 20000);
      };
      const permission = canOpen ? canOpen(sources[index]) : true;
      if (permission && typeof permission.then === 'function') {
        frame.src = 'about:blank';
        external.removeAttribute('href');
        say('Checking playback protection…');
        permission.then(load, () => load(false));
      } else load(permission);
    }
    function advance(reason) {
      clear();
      const number = sources.findIndex((_source, i) => !attempted.has(i));
      if (number >= 0) { open(number); say(`${reason}. Trying ${sources[number].name} · ${attempted.size}/${sources.length}.`); }
      else {
        active = false;
        token = ''; // Late failures from the final attempt cannot restart the search.
        next.disabled = false;
        next.textContent = 'Retry sources';
        say('No working source found. Retry sources or try again later.');
      }
    }
    function fail(reason) { if (movie) advance(reason); }
    function state(value, time) {
      if (!movie) return;
      if (value === 'unavailable' || value === 'error') { fail('Source unavailable'); return; }
      if (value === 'stalled') { fail('Playback stalled'); return; }
      if (value === 'paused' || value === 'ended' || value === 'ready' || value === 'idle') {
        clear(); active = false; seeking = false;
        say(value === 'idle' ? `${sources[index].name}: press Play.` : value === 'ready' ? `${sources[index].name}: ready. Press Play.` : `${value === 'paused' ? 'Paused' : 'Finished'} · ${sources[index].name}`);
      } else if (value === 'seeking') {
        clear(); seeking = true;
      } else if (value === 'starting') {
        active = true; seeking = false; watchProgress();
        say(`Starting ${sources[index].name}…`);
      } else if (value === 'playing') {
        active = true; seeking = false; clear();
        say(`Playing · ${sources[index].name}`);
      } else if (value === 'unknown') {
        clear(); active = false;
        say(`${sources[index].name}: automatic checking unavailable. Try next source if it does not play.`);
      }
      if (Number.isFinite(time)) lastTime = time;
    }
    function message(event) {
      if (!movie || !token || event.source !== frame.contentWindow || event.origin !== new URL(sources[index].url).origin) return;
      const data = event.data;
      if (data?.type === 'streambox-movie-state' && data.token === token) {
        state(data.state, data.time);
      } else if (event.origin === 'https://vidlink.pro' && data?.type === 'PLAYER_EVENT' &&
        movie.mediaType !== 'anime' && String(data.data?.mtmdbId) === String(movie.id)) {
        const info = data.data;
        if (info.event === 'play') state('starting', info.currentTime);
        else if (info.event === 'pause') state('paused', info.currentTime);
        else if (info.event === 'ended') state('ended', info.currentTime);
        else if (info.event === 'seeking') state('seeking', info.currentTime);
        else if (info.event === 'seeked') { seeking = false; lastTime = info.currentTime; if (active) watchProgress(); }
        else if (info.event === 'timeupdate' && active && !seeking && Number.isFinite(info.currentTime)) {
          if (lastTime !== null && info.currentTime > lastTime + 0.2) {
            say(`Playing · ${sources[index].name}`);
            watchProgress();
          }
          lastTime = info.currentTime;
        }
      }
    }
    frame.addEventListener('load', observe);
    frame.addEventListener('error', () => fail('Player could not load'));
    select.addEventListener('change', () => {
      const number = Number(select.value);
      if (movie && Number.isInteger(number) && sources[number]) open(number);
    });
    next.addEventListener('click', () => {
      if (!movie) return;
      if (!token) { attempted.clear(); open(0); }
      else advance('Next source');
    });
    window.addEventListener('message', message);
    function stop() {
      clear(); movie = null; sources = []; index = -1; token = ''; active = false;
    }
    return {
      start(record, choices) {
        stop(); movie = record; sources = choices; attempted = new Set();
        select.replaceChildren(...choices.map((source, i) => new Option(source.name, String(i))));
        if (choices.length) open(0);
      },
      stop,
    };
  }
  window.StreamBoxMoviePlayback = { create };
})();
