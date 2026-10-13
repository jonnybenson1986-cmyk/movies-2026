/* Runs before provider scripts, in their own frame's MAIN world. */
(() => {
  'use strict';
  function allowed(url) {
    try {
      const u = new URL(url, location.href);
      return u.protocol === 'https:' && /(^|\.)(movy\.sx|vidy\.st|vidlink\.pro|moviesapi\.to|player\.videasy\.net|vidnest\.fun)$/.test(u.hostname);
    } catch { return false; }
  }
  // Popups are not part of playback, including blank/same-site popups used for ad chains.
  try { Object.defineProperty(window, 'open', { value: () => null, writable: false, configurable: false }); }
  catch { window.open = () => null; }
  window.addEventListener('click', event => {
    const anchor = event.target.closest?.('a[href]');
    if (!anchor) return;
    if (!allowed(anchor.href) || ['_blank', '_top', '_parent'].includes(anchor.target.toLowerCase())) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
})();
