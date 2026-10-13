import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

function clock() {
  let now = 1000, sequence = 0;
  const jobs = new Map();
  return {
    now: () => now,
    setTimeout(fn, ms) { const id = ++sequence; jobs.set(id, { fn, at: now + ms }); return id; },
    clearTimeout(id) { jobs.delete(id); },
    tick(ms) {
      const end = now + ms;
      for (;;) {
        const entry = [...jobs].sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry || entry[1].at > end) break;
        now = entry[1].at; jobs.delete(entry[0]); entry[1].fn();
      }
      now = end;
    },
  };
}
function dispatch(target, type, fields = {}) {
  const event = new Event(type);
  Object.assign(event, fields);
  target.dispatchEvent(event);
}
const choices = [
  { name: 'VidLink', url: 'https://vidlink.pro/movie/278' },
  { name: 'MoviesAPI', url: 'https://moviesapi.to/movie/278' },
  { name: 'Videasy', url: 'https://player.videasy.net/movie/278' },
];
function player(canOpen) {
  const timers = clock(), win = new EventTarget(), frame = new EventTarget(), select = new EventTarget(), next = new EventTarget();
  const status = {}, external = { removeAttribute() { delete this.href; } }, document = { hidden: false }, requests = [];
  frame.contentWindow = { postMessage: (data, origin) => requests.push({ data, origin }) };
  select.replaceChildren = () => {};
  vm.runInNewContext(readFileSync(new URL('../public/js/movie-playback.js', import.meta.url), 'utf8'), {
    window: win, document, URL, crypto: webcrypto, Option: function() {},
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
  });
  const controller = win.StreamBoxMoviePlayback.create({ frame, select, next, status, external, canOpen });
  controller.start({ id: 278, mediaType: 'movie' }, choices);
  const load = () => { dispatch(frame, 'load'); return requests.at(-1).data.token; };
  function helper(state, extra = {}) {
    const token = load();
    dispatch(win, 'message', { source: frame.contentWindow, origin: new URL(frame.src).origin,
      data: { type: 'streambox-movie-state', token, state, time: 0 }, ...extra });
  }
  function official(event, currentTime) {
    dispatch(win, 'message', { source: frame.contentWindow, origin: 'https://vidlink.pro',
      data: { type: 'PLAYER_EVENT', data: { event, currentTime, mtmdbId: 278 } } });
  }
  return { controller, timers, win, frame, select, next, status, external, document, load, helper, official };
}

test('unavailable sources advance once, exhaust finitely, then support an explicit retry', () => {
  const p = player();
  p.load();
  assert(!p.status.textContent.startsWith('Playing'));
  p.helper('unavailable'); assert.equal(p.frame.src, choices[1].url);
  p.helper('error'); assert.equal(p.frame.src, choices[2].url);
  p.helper('unavailable'); assert.match(p.status.textContent, /No working source/);
  assert.equal(p.next.textContent, 'Retry sources');
  p.timers.tick(120000); assert.equal(p.frame.src, choices[2].url);
  dispatch(p.next, 'click'); assert.equal(p.frame.src, choices[0].url);
});

test('actual progress confirms playback; pause, seek and end never trigger a timed switch', () => {
  const p = player();
  p.official('play', 0); assert(!p.status.textContent.startsWith('Playing'));
  p.official('timeupdate', 1); assert.match(p.status.textContent, /^Playing/);
  p.official('pause', 1); p.timers.tick(60000); assert.equal(p.frame.src, choices[0].url);
  p.official('play', 1); p.official('seeking', 100); p.timers.tick(60000);
  assert.equal(p.frame.src, choices[0].url);
  p.official('seeked', 100); p.official('ended', 100); p.timers.tick(60000);
  assert.equal(p.frame.src, choices[0].url);
  p.official('play', 100); p.timers.tick(25000); assert.equal(p.frame.src, choices[1].url);
});

test('foreign frames, old attempt tokens and wrong movie IDs cannot drive source selection', () => {
  const p = player(), token = p.load();
  p.helper('error', { source: {} });
  p.helper('error', { origin: 'https://ads.example' });
  p.helper('error', { data: { type: 'streambox-movie-state', state: 'error', token: 'stale' } });
  assert.equal(p.frame.src, choices[0].url);
  p.select.value = '0'; dispatch(p.select, 'change');
  p.helper('error', { data: { type: 'streambox-movie-state', state: 'error', token } });
  dispatch(p.win, 'message', { source: p.frame.contentWindow, origin: 'https://vidlink.pro',
    data: { type: 'PLAYER_EVENT', data: { event: 'play', mtmdbId: 999, currentTime: 0 } } });
  p.timers.tick(25000); assert.equal(p.frame.src, choices[0].url);
});

test('no signals or an unsupported nested player never cause a blind timeout switch; close cancels work', () => {
  const p = player();
  p.timers.tick(90000); assert.equal(p.frame.src, choices[0].url);
  p.helper('unknown'); p.timers.tick(90000); assert.equal(p.frame.src, choices[0].url);
  dispatch(p.next, 'click'); assert.equal(p.frame.src, choices[1].url);
  p.helper('starting'); p.controller.stop(); p.timers.tick(90000);
  p.helper('error'); assert.equal(p.frame.src, choices[1].url);
});

test('a hidden tab suspends the provider-message stall deadline', () => {
  const p = player(); p.official('play', 0); p.document.hidden = true;
  p.timers.tick(75000); assert.equal(p.frame.src, choices[0].url);
  p.document.hidden = false; p.official('timeupdate', 1);
  assert.match(p.status.textContent, /^Playing/);
});

function observer({ video = null, text = '', nested = false, autoplay = false } = {}) {
  const timers = clock(), win = new EventTarget(), messages = [];
  win.parent = { postMessage: data => messages.push(data) };
  const doc = { hidden: false, body: { innerText: text }, querySelectorAll: () => video ? [video] : [], querySelector: () => nested ? {} : null };
  vm.runInNewContext(readFileSync(new URL('../browser-extension/playback.js', import.meta.url), 'utf8'), {
    window: win, document: doc, location: { href: choices[0].url },
    Date: { now: timers.now }, setInterval(fn, ms) { function run() { fn(); timers.setTimeout(run, ms); } timers.setTimeout(run, ms); },
  });
  dispatch(win, 'message', { source: win.parent, origin: 'http://localhost:8080', data: { type: 'streambox-watch-movie', token: 'attempt', url: choices[0].url, autoplay } });
  return { timers, messages, doc };
}
function media(fields = {}) {
  return { paused: false, ended: false, seeking: false, readyState: 3, currentTime: 0, duration: 7200, error: null,
    getClientRects: () => [{}], ...fields };
}

test('observer requires progressing video and detects a failed playback attempt', () => {
  const video = media(), o = observer({ video });
  assert.equal(o.messages.at(-1).state, 'starting');
  video.currentTime = 1; o.timers.tick(1000); assert.equal(o.messages.at(-1).state, 'playing');
  o.timers.tick(25000); assert.equal(o.messages.at(-1).state, 'stalled');
});

test('observer preserves autoplay-blocked, paused, seeking, ended and background playback', () => {
  const video = media({ paused: true }), o = observer({ video });
  o.timers.tick(60000); assert.equal(o.messages.at(-1).state, 'ready');
  video.currentTime = 20; o.timers.tick(1000); assert.equal(o.messages.at(-1).state, 'paused');
  video.paused = false; video.seeking = true; o.timers.tick(60000);
  assert.equal(o.messages.at(-1).state, 'seeking');
  video.seeking = false; o.doc.hidden = true; o.timers.tick(60000);
  assert(!o.messages.some(m => m.state === 'stalled'));
  video.ended = true; o.timers.tick(60000); assert.equal(o.messages.at(-1).state, 'ended');
});

test('observer identifies missing/error pages while preserving an opaque nested player', () => {
  assert.equal(observer({ text: 'Movie not found' }).messages.at(-1).state, 'unavailable');
  assert.equal(observer({ video: media({ error: { code: 4 } }) }).messages.at(-1).state, 'error');
  const missing = observer(); missing.timers.tick(35000);
  assert.equal(missing.messages.at(-1).state, 'unavailable');
  const nested = observer({ nested: true }); nested.timers.tick(35000);
  assert.equal(nested.messages.at(-1).state, 'unknown');
});


test('helper requests autoplay once and preserves the Play button when the browser refuses', async () => {
  let calls = 0;
  const video = media({ paused: true, play() { calls++; return Promise.reject(Object.assign(new Error('Autoplay refused'), { name: 'NotAllowedError' })); } });
  const o = observer({ video, autoplay: true });
  await Promise.resolve();
  o.timers.tick(60000);
  assert.equal(calls, 1);
  assert.equal(o.messages.at(-1).state, 'ready');
  assert(!o.messages.some(m => m.state === 'unavailable' || m.state === 'stalled'));
});


test('protected sources wait for verification; closing cancels a pending verification', async () => {
  let resolve;
  const verification = new Promise(r => { resolve = r; });
  const p = player(() => verification);
  assert.equal(p.frame.src, 'about:blank');
  p.controller.stop(); resolve(true); await Promise.resolve();
  assert.equal(p.frame.src, 'about:blank');
  const q = player(source => source.name !== 'VidLink');
  assert.equal(q.frame.src, choices[1].url);
});


test('an empty video placeholder with no source eventually advances; unloaded autoplay can start a source', async () => {
  const empty = observer({ video: media({ paused: true, readyState: 0 }) });
  empty.timers.tick(35000);
  assert.equal(empty.messages.at(-1).state, 'unavailable');
  let calls = 0;
  const unloaded = observer({ autoplay: true, video: media({ paused: true, readyState: 0, currentSrc: 'https://media.example/video',
    play() { calls++; return Promise.reject(Object.assign(new Error('Unsupported media'), { name: 'NotSupportedError' })); } }) });
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(unloaded.messages.at(-1).state, 'error');
});
