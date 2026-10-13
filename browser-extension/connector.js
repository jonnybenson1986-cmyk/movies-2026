/* Announce protection only to pages identifying themselves as StreamBox. */
document.addEventListener('streambox-protection-check', event => {
  if (typeof event.detail !== 'string' || event.detail.length > 80) return;
  if (!document.querySelector('meta[name="streambox-app"][content="streambox"]')) return;
  window.postMessage({ type: 'streambox-protection-ready', version: '1.1.0', capabilities: ['movie-fallback'], nonce: event.detail }, location.origin);
});
