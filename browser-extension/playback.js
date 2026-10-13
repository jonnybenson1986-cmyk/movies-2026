/* Observe native media locally. Only playback state and time are sent to the app. */
(() => {
  'use strict';
  let watch = null, lastTime = null, progressedAt = 0, attemptedAt = 0, sent = '';
  function report(state, video) {
    if (!watch) return;
    // Report ongoing progress too, so the app can distinguish a loaded player from playback.
    if (state === sent && state !== 'playing') return;
    sent = state;
    window.parent.postMessage({ type: 'streambox-movie-state', token: watch.token, state,
      time: video && Number.isFinite(video.currentTime) ? video.currentTime : 0 }, watch.origin);
  }
  function sample() {
    if (!watch) return;
    const now = Date.now();
    const videos = [...document.querySelectorAll('video')].filter(v => v.getClientRects().length);
    const video = videos.sort((a, b) => (b.duration || 0) - (a.duration || 0))[0];
    const unavailable = /(?:movie|video|content|stream|title) (?:is )?(?:unavailable|not found)|no (?:sources|streams) (?:found|available)|failed to (?:load|fetch) (?:video|stream|sources)|error loading (?:video|media)/i.test(document.body?.innerText || '');
    if ((!video || video.readyState < 2) && unavailable) { report('unavailable'); return; }
    if (video) {
      if (video.error && video.error.code !== 1) { report('error', video); return; }
      if (video.ended) { attemptedAt = 0; report('ended', video); return; }
      if (video.seeking) { progressedAt = now; lastTime = video.currentTime; report('seeking', video); return; }
      const hasSource = !!(video.currentSrc || video.getAttribute?.('src') || video.querySelector?.('source[src]'));
      if (!hasSource && video.readyState === 0 && video.currentTime === 0 && now - watch.started >= 35000 && !document.hidden && !document.querySelector('iframe')) {
        report('unavailable', video); return;
      }
      if (video.paused && video.currentTime === 0 && (video.readyState >= 1 || hasSource) && watch.autoplay && !watch.interacted && !watch.autoplayTried && !document.hidden) {
        watch.autoplayTried = true;
        const attempt = watch;
        video.play().catch(error => {
          // Browser autoplay policy is not a source failure. Keep the user's Play control.
          if (watch === attempt && video.paused) report(error.name === 'NotSupportedError' ? 'error' : 'ready', video);
        });
      }
      if (video.paused) {
        attemptedAt = 0; progressedAt = now; lastTime = video.currentTime;
        report(video.currentTime === 0 ? (video.readyState >= 1 ? 'ready' : 'idle') : 'paused', video);
        return;
      }
      if (!attemptedAt) attemptedAt = progressedAt = now;
      if (video.readyState >= 2 && lastTime !== null && video.currentTime > lastTime + 0.2) {
        progressedAt = now; report('playing', video);
      } else if (!document.hidden && now - progressedAt >= 25000) report('stalled', video);
      else if (sent !== 'playing') report('starting', video);
      if (document.hidden) progressedAt = now;
      lastTime = video.currentTime;
      return;
    }
    if (now - watch.started >= 35000) {
      // A nested, cross-origin player may already be playing. Do not discard it blindly.
      report(document.querySelector('iframe') ? 'unknown' : 'unavailable');
    }
  }
  window.addEventListener('message', event => {
    if (event.source !== window.parent || window.parent === window || event.data?.type !== 'streambox-watch-movie' ||
      typeof event.data.token !== 'string' || event.data.token.length > 80 || event.data.url !== location.href) return;
    if (watch?.token === event.data.token) return;
    watch = { token: event.data.token, origin: event.origin, started: Date.now(), autoplay: event.data.autoplay === true, interacted: false, autoplayTried: false };
    lastTime = null; attemptedAt = 0; progressedAt = Date.now(); sent = '';
    sample();
  });
  for (const event of ['pointerdown', 'keydown']) window.addEventListener(event, () => { if (watch) watch.interacted = true; }, true);
  setInterval(sample, 1000);
})();
