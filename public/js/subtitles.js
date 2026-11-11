/* Subtitle / closed-caption choices for the live player. Only the logic lives here (no page code), so it can be
   tested on its own. A channel can offer subtitles two ways:
     - HLS subtitle tracks listed in its playlist (read through hls.js: hls.subtitleTracks)
     - captions the video element already exposes (video.textTracks): CEA-608/708 captions inside the stream,
       and everything Safari plays natively
   app.js turns the chosen option on and the rest off. */
(() => {
  'use strict';

  const LANGS = (() => { try { return new Intl.DisplayNames(['en'], { type: 'language' }); } catch { return null; } })();
  const langName = code => { try { return (code && LANGS?.of(code)) || ''; } catch { return ''; } };

  // hlsTracks: hls.subtitleTracks ([{ name, lang }] or none); textTracks: video.textTracks (array-like).
  // hlsActive: the stream is playing through hls.js. A video element keeps the text tracks of the channel before
  // (they can't be removed), so then only hls.js's own subtitle list and caption tracks that hold captions count.
  function listOptions({ hlsTracks = [], textTracks = [], hlsActive = false } = {}) {
    const options = [];
    const hlsNames = new Set();
    hlsTracks.forEach((t, i) => {
      if (t.name) hlsNames.add(t.name);
      options.push({ source: 'hls', id: i, lang: t.lang || '', label: t.name || langName(t.lang) || `Subtitles ${i + 1}` });
    });
    let n = 0;
    for (const t of Array.from(textTracks)) {
      if (t.kind !== 'subtitles' && t.kind !== 'captions') continue;
      if (hlsActive && (t.kind === 'subtitles' || !t.cues?.length)) continue;   // left over from an earlier channel, or no captions yet
      if (hlsNames.has(t.label)) continue;   // hls.js shows its own subtitle tracks through the same list
      n++;
      options.push({ source: 'text', track: t, lang: t.language || '', label: t.label || langName(t.language) || (n > 1 ? `Captions ${n}` : 'Captions') });
    }
    return options;
  }

  // What to switch on when the person has subtitles turned on: their last language if there is one, else the first
  function preferred(options, pref = {}) {
    if (!pref.on || !options.length) return null;
    return options.find(o => pref.lang && o.lang && o.lang.slice(0, 2) === pref.lang.slice(0, 2)) || options[0];
  }

  const api = { listOptions, preferred };
  if (typeof window !== 'undefined') window.StreamBoxSubs = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
