/* Android TV (and other TV browsers / WebViews): remote-control navigation, Back, media keys and TV mode.
   Written in ES5 on purpose (var, function, no ?. or arrow functions): it is the one script that has to run on old
   TV engines too, so that even when the rest of the app can't, the screen explains what to do instead of going blank.

   What it does
   - TV mode: detects TV browsers (or ?tv=1, or Settings) and adds class "tv" to <html>, which css/tv.css uses for
     the 10-foot layout (bigger type, safe-zone margins, strong focus).
   - D-pad: Up / Down / Left / Right move focus to the nearest control in that direction, inside whatever is on top
     (the player, a window, Now Playing, the More sheet, or the page). Enter/OK activates it (tick boxes included).
   - Back: closes what is on top (player, window, Now Playing, menus), otherwise goes back a page, instead of
     leaving the app. On TV, opening the player or a window adds a history step, so the remote's Back closes it.
   - Media keys: Play/Pause, Stop, Fast-forward, Rewind, Next, Previous drive whatever is playing (TV channel,
     your own video, or music).
   - Keyboard focus: adds class "kbd" to <html> while keys are being used, for engines without :focus-visible.
   - :has() stand-ins: mirrors two :has() states as classes for engines that don't support :has(). */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement, win = window;

  // ---------------------------------------------------------------- small polyfills for old TV engines
  if (!Element.prototype.matches) Element.prototype.matches = Element.prototype.webkitMatchesSelector || Element.prototype.msMatchesSelector;
  if (!Element.prototype.closest) Element.prototype.closest = function (sel) { var el = this; while (el && el.nodeType === 1) { if (el.matches(sel)) return el; el = el.parentElement; } return null; };
  // The rest of the app runs on old engines as js/legacy/*.js (built by scripts/build-legacy-js.mjs: the syntax is
  // converted there). What the syntax can't fix is missing browser features, so those are filled in here, each only
  // when the browser lacks it. Oldest supported: Chromium 51 (Android TV 7 era).
  function define(obj, name, fn) { if (obj && !obj[name]) try { Object.defineProperty(obj, name, { value: fn, configurable: true, writable: true }); } catch (e) { obj[name] = fn; } }
  define(Object, 'entries', function (o) { return Object.keys(o).map(function (k) { return [k, o[k]]; }); });
  define(Object, 'values', function (o) { return Object.keys(o).map(function (k) { return o[k]; }); });
  function pad(atStart) {
    return function (len, fill) {
      var s = String(this); fill = fill === undefined ? ' ' : String(fill); len = len >> 0;
      if (s.length >= len || !fill) return s;
      var add = ''; while (add.length < len - s.length) add += fill;
      add = add.slice(0, len - s.length); return atStart ? add + s : s + add;
    };
  }
  define(String.prototype, 'padStart', pad(true));
  define(String.prototype, 'padEnd', pad(false));
  define(String.prototype, 'trimStart', function () { return String(this).replace(/^\s+/, ''); });
  define(String.prototype, 'trimEnd', function () { return String(this).replace(/\s+$/, ''); });
  define(String.prototype, 'replaceAll', function (a, b) { return a instanceof RegExp ? this.replace(a, b) : String(this).split(a).join(b); });
  define(String.prototype, 'at', function (i) { i = Math.trunc(i) || 0; if (i < 0) i += this.length; return this.charAt(i) || undefined; });
  define(Array.prototype, 'includes', function (x) { for (var i = 0; i < this.length; i++) if (this[i] === x || (x !== x && this[i] !== this[i])) return true; return false; });
  define(Array.prototype, 'flat', function (depth) { depth = depth === undefined ? 1 : depth; return depth < 1 ? this.slice() : this.reduce(function (a, x) { return a.concat(Array.isArray(x) ? x.flat(depth - 1) : [x]); }, []); });
  define(win, 'globalThis', win);
  define(win, 'queueMicrotask', function (fn) { Promise.resolve().then(fn); });
  define(Promise.prototype, 'finally', function (fn) {
    var P = this.constructor || Promise;
    return this.then(function (v) { return P.resolve(fn()).then(function () { return v; }); }, function (e) { return P.resolve(fn()).then(function () { throw e; }); });
  });
  define(Promise, 'allSettled', function (list) {
    return Promise.all(Array.from(list, function (p) {
      return Promise.resolve(p).then(function (value) { return { status: 'fulfilled', value: value }; }, function (reason) { return { status: 'rejected', reason: reason }; });
    }));
  });
  if (win.NodeList) define(NodeList.prototype, 'forEach', Array.prototype.forEach);
  if (win.Symbol && Symbol.iterator && win.NodeList) define(NodeList.prototype, Symbol.iterator, Array.prototype[Symbol.iterator]);
  // DOM methods from 2016-2020: append / prepend / replaceChildren, remove / before / after / replaceWith, isConnected
  function nodes(args) {
    var f = doc.createDocumentFragment();
    for (var i = 0; i < args.length; i++) f.appendChild(args[i] instanceof Node ? args[i] : doc.createTextNode(String(args[i])));
    return f;
  }
  [Element.prototype, Document.prototype, DocumentFragment.prototype].forEach(function (P) {
    define(P, 'append', function () { this.appendChild(nodes(arguments)); });
    define(P, 'prepend', function () { this.insertBefore(nodes(arguments), this.firstChild); });
    define(P, 'replaceChildren', function () { while (this.lastChild) this.removeChild(this.lastChild); this.appendChild(nodes(arguments)); });
  });
  [Element.prototype, CharacterData.prototype, DocumentType.prototype].forEach(function (P) {
    define(P, 'remove', function () { if (this.parentNode) this.parentNode.removeChild(this); });
    define(P, 'before', function () { if (this.parentNode) this.parentNode.insertBefore(nodes(arguments), this); });
    define(P, 'after', function () { if (this.parentNode) this.parentNode.insertBefore(nodes(arguments), this.nextSibling); });
    define(P, 'replaceWith', function () { if (this.parentNode) this.parentNode.replaceChild(nodes(arguments), this); });
  });
  if (!('isConnected' in Node.prototype)) Object.defineProperty(Node.prototype, 'isConnected', { get: function () { return doc.documentElement.contains(this); } });
  // scrollTo / scrollBy with an options object (Chromium 61): the row arrows and page changes use it
  if (!('scrollBehavior' in root.style)) {
    var opt = function (el, a, b, by) {
      var o = a && typeof a === 'object' ? a : { left: a, top: b };
      var x = o.left === undefined ? (by ? 0 : el.scrollLeft) : +o.left, y = o.top === undefined ? (by ? 0 : el.scrollTop) : +o.top;
      if (by) { x += el.scrollLeft; y += el.scrollTop; }
      el.scrollLeft = x; el.scrollTop = y;
    };
    Element.prototype.scrollTo = function (a, b) { opt(this, a, b, false); };
    Element.prototype.scrollBy = function (a, b) { opt(this, a, b, true); };
    var wTo = win.scrollTo, wBy = win.scrollBy;
    win.scrollTo = function (a, b) { if (a && typeof a === 'object') wTo.call(win, a.left === undefined ? win.pageXOffset : a.left, a.top === undefined ? win.pageYOffset : a.top); else wTo.call(win, a, b); };
    win.scrollBy = function (a, b) { if (a && typeof a === 'object') wBy.call(win, a.left || 0, a.top || 0); else wBy.call(win, a, b); };
  }
  // IntersectionObserver entries got isIntersecting in Chromium 58 (the endless channel list and artwork use it)
  if (win.IntersectionObserverEntry && !('isIntersecting' in IntersectionObserverEntry.prototype)) {
    Object.defineProperty(IntersectionObserverEntry.prototype, 'isIntersecting', { get: function () { return this.intersectionRatio > 0; } });
  }
  // new URLSearchParams({ a: 1 }) (Chromium 61): older engines read the object as the text "[object Object]"
  if (win.URLSearchParams && new URLSearchParams({ a: 1 }).get('a') !== '1') {
    var USP = URLSearchParams;
    win.URLSearchParams = function (init) {
      if (!init || typeof init !== 'object' || init instanceof USP) return new USP(init);
      var p = new USP(); Object.keys(init).forEach(function (k) { p.append(k, init[k]); }); return p;
    };
    win.URLSearchParams.prototype = USP.prototype;
  }
  // matchMedia(...).addEventListener('change') (older engines only have addListener)
  if (win.MediaQueryList && !MediaQueryList.prototype.addEventListener) {
    MediaQueryList.prototype.addEventListener = function (t, fn) { if (t === 'change') this.addListener(fn); };
    MediaQueryList.prototype.removeEventListener = function (t, fn) { if (t === 'change') this.removeListener(fn); };
  }
  // AbortController (Chromium 66). The stand-in can't stop the download itself, but fetch() gives up on abort,
  // which is what the app relies on (timeouts and "a newer search replaced this one").
  if (typeof AbortController === 'undefined') {
    var Signal = function () { var f = doc.createDocumentFragment(); this.aborted = false; this.onabort = null; this.addEventListener = f.addEventListener.bind(f); this.removeEventListener = f.removeEventListener.bind(f); this.dispatchEvent = f.dispatchEvent.bind(f); };
    var abortError = function () { try { return new DOMException('The operation was aborted.', 'AbortError'); } catch (e) { var err = new Error('The operation was aborted.'); err.name = 'AbortError'; return err; } };
    win.AbortSignal = Signal;
    win.AbortController = function () { this.signal = new Signal(); };
    win.AbortController.prototype.abort = function () {
      var s = this.signal; if (s.aborted) return; s.aborted = true;
      var ev = doc.createEvent('Event'); ev.initEvent('abort', false, false); s.dispatchEvent(ev);
      if (typeof s.onabort === 'function') s.onabort(ev);
    };
    if (win.fetch) {
      var nativeFetch = win.fetch;
      win.fetch = function (input, init) {
        var sig = init && init.signal;
        if (!(sig instanceof Signal)) return nativeFetch.apply(win, arguments);
        var rest = {}; for (var k in init) if (k !== 'signal') rest[k] = init[k];
        if (sig.aborted) return Promise.reject(abortError());
        return new Promise(function (resolve, reject) { sig.addEventListener('abort', function () { reject(abortError()); }); nativeFetch(input, rest).then(resolve, reject); });
      };
    }
  }
  // Regular expressions with \p{L} / \p{N} (letters / digits in any language; Chromium 64). In js/legacy/*.js the
  // build turns each such /.../u into __sbRe(source, flags): the real thing where it works, otherwise the same pattern
  // with the main alphabets spelled out as ranges (Latin, Greek, Cyrillic, Hebrew, Arabic, Indic, Thai, Korean, Japanese, Chinese).
  var LETTERS = 'A-Za-z\\u00AA\\u00B5\\u00BA\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02C1\\u0370-\\u03FF\\u0400-\\u052F\\u0531-\\u0587\\u05D0-\\u05EA\\u0620-\\u064A\\u0671-\\u06D3\\u0900-\\u0DFF\\u0E01-\\u0E30\\u10A0-\\u10FF\\u1100-\\u11FF\\u1E00-\\u1FFF\\u3040-\\u30FF\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uAC00-\\uD7A3';
  var DIGITS = '0-9\\u00B2\\u00B3\\u00B9\\u00BC-\\u00BE\\u0660-\\u0669\\u06F0-\\u06F9\\u0966-\\u096F\\uFF10-\\uFF19';
  win.__sbRe = function (source, flags) {
    try { return new RegExp(source, flags); } catch (e) {
      return new RegExp(source.replace(/\\p\{L\}/g, LETTERS).replace(/\\p\{N\}/g, DIGITS), flags.replace('u', ''));
    }
  };
  if (typeof AbortSignal !== 'undefined' && !AbortSignal.timeout) AbortSignal.timeout = function (ms) { var c = new AbortController(); setTimeout(function () { c.abort(); }, ms); return c.signal; };
  if (!Array.prototype.at) Array.prototype.at = function (i) { i = Math.trunc(i) || 0; if (i < 0) i += this.length; return this[i]; };
  if (!Array.prototype.flatMap) Array.prototype.flatMap = function (fn, self) { return Array.prototype.concat.apply([], this.map(fn, self)); };
  if (!Object.fromEntries) Object.fromEntries = function (it) { var o = {}; Array.from(it).forEach(function (kv) { o[kv[0]] = kv[1]; }); return o; };
  if (win.crypto && !win.crypto.randomUUID && win.crypto.getRandomValues) win.crypto.randomUUID = function () {
    var b = win.crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  };
  try { new EventTarget(); } catch (e) {   // Chromium before 64 can't construct an EventTarget (music.js needs one)
    win.EventTarget = function () { var f = doc.createDocumentFragment(); this.addEventListener = f.addEventListener.bind(f); this.removeEventListener = f.removeEventListener.bind(f); this.dispatchEvent = f.dispatchEvent.bind(f); };
  }

  // ---------------------------------------------------------------- TV mode
  var KEY = 'sb:tv';   // "1" on, "0" off, missing = decide from the device
  var TV_UA = /Android ?TV|GoogleTV|Google TV|\bAFT[A-Z0-9]|BRAVIA|SMART-?TV|SmartTV|HbbTV|Tizen|Web0S|webOS|NetCast|CrKey|Chromecast|MiTV|MIBOX|SHIELD Android TV|\bTV\b.*Android|Android.*\b(TV|Television)\b|Aquos|Philips|Hisense|TCL.*TV|Roku/i;
  function stored() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function decide() {
    var q = /[?&]tv=(1|0|auto)\b/.exec(location.search);
    if (q) { try { if (q[1] === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, q[1]); } catch (e) { /* private mode */ } }
    var s = stored();
    if (s === '1') return true;
    if (s === '0') return false;
    return TV_UA.test(navigator.userAgent || '');
  }
  function apply(on) { root.classList.toggle('tv', !!on); }
  apply(decide());

  // ---------------------------------------------------------------- engines too old for the app: say so, don't go blank
  // index.html marks <html class="too-old"> when this browser can't read even the converted scripts in js/legacy/
  // (engines from before about 2016, without let/const, classes and arrow functions).
  function legacyNotice() {
    if (!root.classList.contains('too-old') || doc.getElementById('legacyNotice')) return;
    var box = doc.createElement('div');
    box.id = 'legacyNotice'; box.setAttribute('role', 'alert');
    box.innerHTML = '<h1>STREAMBOX</h1><p>This TV&rsquo;s web browser is too old to run StreamBox.</p>' +
      '<p>On Android TV, open the <b>Google Play Store</b>, search for <b>Android System WebView</b> (and <b>Chrome</b> if you use it) and choose <b>Update</b>. Then open StreamBox again.</p>' +
      '<p class="legacy-small">Needs a browser engine from 2016 or later (Chromium 51+).</p>';
    doc.body.appendChild(box);
  }

  // ---------------------------------------------------------------- keyboard modality (for focus rings without :focus-visible)
  var NAV_KEYS = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Up: 1, Down: 1, Left: 1, Right: 1, Enter: 1, Tab: 1 };
  doc.addEventListener('keydown', function (e) { if (NAV_KEYS[e.key] || e.keyCode >= 37 && e.keyCode <= 40) root.classList.add('kbd'); }, true);
  ['mousedown', 'touchstart', 'pointerdown'].forEach(function (t) { doc.addEventListener(t, function (e) { if (!e.pointerType || e.pointerType !== 'unknown') root.classList.remove('kbd'); }, { capture: true, passive: true }); });

  // ---------------------------------------------------------------- what is on top
  function shown(sel) { var el = doc.querySelector(sel); return el && !el.hidden && el.getClientRects().length ? el : null; }
  // Layers, top first. Navigation stays inside the top one.
  function topLayer() {
    return shown('#legacyNotice') || shown('#moreSheet') || shown('#subsMenu') || shown('#modal') || shown('.np') || shown('#player') || null;
  }

  // ---------------------------------------------------------------- D-pad spatial navigation
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';
  var SKIP = '.row-arrow, .yt-bridge *, [aria-hidden="true"] *, [inert] *';
  function visible(el) {
    if (el.matches(SKIP)) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (el.closest('[hidden]')) return false;
    for (var n = el; n && n !== doc.body; n = n.parentElement) {
      var cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false;
    }
    return true;
  }
  // Focusable controls in `scope`. With `quick`, only the cheap checks: the full visible() test (styles of every
  // ancestor) is then done on the one control a key press picks, not on hundreds of them (slow on TV boxes).
  function candidates(scope, quick) {
    var list = (scope || doc).querySelectorAll(FOCUSABLE), out = [];
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (!scope && el.closest('#player, #modal, #moreSheet, .np, #subsMenu')) continue;   // overlays that aren't open
      if (quick ? !el.matches(SKIP) && !el.closest('[hidden]') : visible(el)) out.push(el);
    }
    return out;
  }
  // The best next control from rect `cur` in direction (dx, dy).
  // Up/Down: the nearest row in that direction first, then the closest item within that row (so a list or a form
  // goes line by line even when its items don't line up). Left/Right: the nearest item that shares the row.
  function pick(cur, list, dx, dy) {
    var cx = cur.left + cur.width / 2, cy = cur.top + cur.height / 2, items = [], i, r;
    for (i = 0; i < list.length; i++) {
      r = list[i].getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;   // not laid out (display: none)
      var x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (dx ? (x - cx) * dx <= 2 : (y - cy) * dy <= 2) continue;
      var along = dx ? Math.max(0, dx > 0 ? r.left - cur.right : cur.left - r.right) : Math.max(0, dy > 0 ? r.top - cur.bottom : cur.top - r.bottom);
      var gap = dx ? Math.max(0, r.top - cur.bottom, cur.top - r.bottom) : Math.max(0, r.left - cur.right, cur.left - r.right);
      var off = dx ? Math.abs(y - cy) : Math.abs(x - cx);
      items.push({ el: list[i], along: along, gap: gap, off: off });
    }
    if (!items.length) return null;
    var best = null, score, bestScore = Infinity;
    if (dy) {
      var minAlong = Infinity;
      for (i = 0; i < items.length; i++) minAlong = Math.min(minAlong, items[i].along);
      var band = minAlong + Math.max(24, cur.height * 0.75);
      for (i = 0; i < items.length; i++) {
        if (items[i].along > band) continue;
        score = items[i].gap * 2 + items[i].off * 0.2 + items[i].along * 0.1;
        if (score < bestScore) { bestScore = score; best = items[i].el; }
      }
      return best;
    }
    for (i = 0; i < items.length; i++) {
      score = items[i].along + (items[i].gap ? items[i].gap * 4 + items[i].off * 0.5 : items[i].off * 0.1);
      if (score < bestScore) { bestScore = score; best = items[i].el; }
    }
    return best;
  }
  function focusEl(el) {
    if (!el) return false;
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { el.scrollIntoView(false); }
    return doc.activeElement === el;
  }
  // Where focus starts when nothing sensible has it yet: the first control in view, inside what is on top
  function start(scope) {
    var list = candidates(scope), main = !scope && doc.getElementById('view');
    var inView = list.filter(function (el) { var r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; });
    var pool = main ? inView.filter(function (el) { return main.contains(el); }) : inView;
    if (!pool.length) pool = inView.length ? inView : list;
    var prefer = pool.filter(function (el) { return el.matches('[autofocus], .btn-play'); })[0];
    var notTyping = pool.filter(function (el) { return !typing(el); })[0];   // a text box would bring up the TV keyboard
    return focusEl(prefer || notTyping || pool[0]);
  }
  var DIRS = { ArrowUp: [0, -1], Up: [0, -1], ArrowDown: [0, 1], Down: [0, 1], ArrowLeft: [-1, 0], Left: [-1, 0], ArrowRight: [1, 0], Right: [1, 0] };
  var CODE_DIRS = { 37: [-1, 0], 38: [0, -1], 39: [1, 0], 40: [0, 1] };
  function typing(el) {
    return el && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset|range|color|file|image)$/.test(el.type)));
  }
  win.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;   // the app (e.g. the channel remote) already used it
    var dir = DIRS[e.key] || (!e.key || e.key === 'Unidentified' ? CODE_DIRS[e.keyCode] : null), t = doc.activeElement;
    if (dir) {
      if (typing(t) && dir[0]) return;                                   // Left / Right move the text cursor
      if (t && t.type === 'range' && dir[0]) return;                      // ... and the volume slider
      var layer = topLayer();
      var here = t && t !== doc.body && visible(t) && (!layer || layer.contains(t)) && (layer || !t.closest('#player, #modal, #moreSheet, .np, #subsMenu'));
      e.preventDefault();
      if (!here) { start(layer); return; }
      var from = t.getBoundingClientRect(), pool = candidates(layer, true).filter(function (el) { return el !== t; }), next;
      // nearest first; anything that turns out to be invisible (visibility: hidden, opacity 0) is dropped and the next tried
      for (var tries = 0; tries < 25 && (next = pick(from, pool, dir[0], dir[1])) && !visible(next); tries++) pool.splice(pool.indexOf(next), 1);
      if (next && !visible(next)) next = null;
      if (next) focusEl(next);
      else if (!layer && dir[1] < 0) win.scrollTo(0, 0);                  // past the top: show the header
      return;
    }
    if ((e.key === 'Enter' || e.keyCode === 13) && t && (t.type === 'checkbox' || t.type === 'radio')) { e.preventDefault(); t.click(); }
  });

  // On TV, a new page starts with focus on its first control (unless focus is already somewhere useful)
  var settle = 0;
  // Pages sometimes redraw (new data arrives); remember what had focus so it comes back to the same item
  var lastSig = '';
  function signature(el) {
    var esc = win.CSS && CSS.escape ? CSS.escape : function (v) { return String(v).replace(/["\\]/g, '\\$&'); };
    if (el.id) return '#' + esc(el.id);
    var attrs = ['data-key', 'data-m-play', 'data-epg', 'data-zap', 'data-cc', 'data-act', 'href'];
    for (var i = 0; i < attrs.length; i++) { var v = el.getAttribute(attrs[i]); if (v) return el.tagName.toLowerCase() + '[' + attrs[i] + '="' + esc(v) + '"]'; }
    return '';
  }
  doc.addEventListener('focusin', function (e) { if (e.target && e.target !== doc.body) lastSig = signature(e.target); });
  function restore() {
    if (!lastSig) return false;
    var list = doc.querySelectorAll(lastSig);
    for (var i = 0; i < list.length; i++) if (visible(list[i]) && !list[i].closest('#nav, #tabbar, #moreSheet')) return focusEl(list[i]);
    return false;
  }
  // A menu item picked with OK (top navigation, tab bar, More sheet): focus goes into the page it opened
  var fromMenu = false;
  function focusAfterRender() {
    if (!root.classList.contains('tv')) return;
    clearTimeout(settle);
    settle = setTimeout(function () {
      var a = doc.activeElement;
      var menu = a && a.closest && a.closest('#nav, #tabbar, #moreSheet');
      if (topLayer() || (a && a !== doc.body && doc.body.contains(a) && visible(a) && !(fromMenu && menu))) return;
      // Page not drawn yet (slow TVs: its data is still loading): wait for it, keeping what we know about how we got
      // here, rather than parking focus in the header where it would then stay. The page's first draw calls this again.
      var view = doc.getElementById('view');
      if (view && !view.querySelector(FOCUSABLE)) { if (!fromMenu) navigated = true; return; }
      var redraw = !fromMenu && !navigated;
      fromMenu = false; navigated = false;
      if (redraw && restore()) return;   // the same page redrew: back to the same item
      start(null);
    }, 450);
  }
  var navigated = false;
  win.addEventListener('hashchange', function () {
    var a = doc.activeElement;
    navigated = true;
    fromMenu = !!(a && a.closest && a.closest('#nav, #tabbar, #moreSheet'));
    focusAfterRender();
  });
  // Pages draw after their data arrives, so wait for the page's content to settle rather than for "load"
  function watchView() {
    var view = doc.getElementById('view');
    if (view) new MutationObserver(focusAfterRender).observe(view, { childList: true });
  }

  // ---------------------------------------------------------------- Back
  // The remote's Back (and Escape) closes what is on top; with nothing on top it goes back a page.
  var BACK_KEYS = { GoBack: 1, BrowserBack: 1, Back: 1 }, BACK_CODES = { 4: 1, 166: 1, 461: 1, 10009: 1 };
  function closeTop() {
    if (!topLayer()) return false;
    var esc;
    try { esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }); } catch (e) { esc = doc.createEvent('Event'); esc.initEvent('keydown', true, true); esc.key = 'Escape'; }
    (doc.activeElement || doc.body).dispatchEvent(esc);   // the app's own Escape handling closes the right thing
    return true;
  }
  // true when Back had something to do; false on the home page with nothing open (the Android app then closes)
  function goBack() {
    if (closeTop()) return true;
    if (location.hash && location.hash !== '#home') { history.back(); return true; }
    return false;
  }
  win.addEventListener('keydown', function (e) {
    var back = BACK_KEYS[e.key] || BACK_CODES[e.keyCode] || (root.classList.contains('tv') && e.key === 'Backspace' && !typing(doc.activeElement) && !shown('#player'));
    if (!back || e.defaultPrevented) return;
    e.preventDefault();
    goBack();
  });
  // TV: opening the player, a window, Now Playing or the More sheet adds a history step, so a Back that the TV
  // browser turns into "go back a page" closes it instead of leaving the screen.
  var LAYERS = ['#player', '#modal', '.np', '#moreSheet'], layerOpen = {}, skipPop = 0;
  function watchLayers() {
    LAYERS.forEach(function (sel) {
      var el = doc.querySelector(sel);
      if (!el || el.__sbWatched) return;
      el.__sbWatched = true;
      new MutationObserver(function () {
        if (!root.classList.contains('tv')) return;
        var open = !el.hidden;
        if (open === !!layerOpen[sel]) return;
        layerOpen[sel] = open;
        if (open) history.pushState({ sbLayer: sel }, '', location.href);
        else if (history.state && history.state.sbLayer === sel) { skipPop++; history.back(); }
      }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
    });
  }
  win.addEventListener('popstate', function (e) {
    if (skipPop) { skipPop--; return; }
    var open = false;
    LAYERS.forEach(function (sel) { if (layerOpen[sel]) open = true; });
    if (open && closeTop()) return;
    if (e.state && e.state.sbLayer) history.back();   // a leftover step for something already closed
  });

  // ---------------------------------------------------------------- media keys
  var MEDIA = { MediaPlayPause: 'toggle', MediaPlay: 'play', MediaPause: 'pause', MediaStop: 'stop', MediaFastForward: 'ff', MediaRewind: 'rw', MediaTrackNext: 'next', MediaTrackPrevious: 'prev' };
  var MEDIA_CODES = { 179: 'toggle', 250: 'toggle', 85: 'toggle', 415: 'play', 19: 'pause', 178: 'stop', 413: 'stop', 228: 'ff', 417: 'ff', 227: 'rw', 412: 'rw', 176: 'next', 425: 'next', 177: 'prev', 424: 'prev' };
  function click(sel) { var el = doc.querySelector(sel); if (el && !el.disabled) { el.click(); return true; } return false; }   // works on hidden controls too (TV mode hides the on-screen D-pad)
  function media(action) {
    var player = shown('#player'), video = doc.getElementById('video');
    if (player) {
      var live = player.classList.contains('live-mode'), own = video && !video.hidden && !live;
      if (action === 'stop') return click('#playerClose');
      if (live) {
        if (action === 'next') return click('#zapChUp');
        if (action === 'prev') return click('#zapChDown');
        if (action === 'toggle' || (action === 'play' && video.paused) || (action === 'pause' && !video.paused)) return click('#playerPlay');
        return false;   // a live channel can't be fast-forwarded
      }
      if (own) {
        if (action === 'toggle') { video.paused ? video.play() : video.pause(); return true; }
        if (action === 'play') { video.play(); return true; }
        if (action === 'pause') { video.pause(); return true; }
        if (action === 'ff' || action === 'rw') { video.currentTime = Math.max(0, video.currentTime + (action === 'ff' ? 10 : -10)); return true; }
      }
      return false;   // a film inside another site's player can't be reached
    }
    var M = win.StreamBoxMusic, p = M && M.player;
    if (!p || !p.current) return false;
    if (action === 'toggle') p.toggle();
    else if (action === 'play') { if (p.paused) p.toggle(); }
    else if (action === 'pause') { if (!p.paused) p.toggle(); }
    else if (action === 'stop') p.stop();
    else if (action === 'next') p.step(1);
    else if (action === 'prev') p.step(-1);
    else if (action === 'ff' || action === 'rw') p.seekTo((p.audio.currentTime || 0) + (action === 'ff' ? 10 : -10));
    return true;
  }
  win.addEventListener('keydown', function (e) {
    if (e.defaultPrevented) return;
    var action = MEDIA[e.key] || MEDIA_CODES[e.keyCode];
    if (action && media(action)) e.preventDefault();
  });

  // ---------------------------------------------------------------- :has() stand-ins (engines before Chromium 105)
  function mirrorHas() {
    var input = doc.getElementById('searchInput'), bar = doc.getElementById('topbar');
    if (input && bar) {
      var sync = function () { bar.classList.toggle('search-open', input.classList.contains('open')); };
      new MutationObserver(sync).observe(input, { attributes: true, attributeFilter: ['class'] });
      sync();
    }
    new MutationObserver(function () {
      var labels = doc.querySelectorAll('.modal-body label');
      for (var i = 0; i < labels.length; i++) if (labels[i].querySelector(':scope > input[type=checkbox]')) labels[i].classList.add('has-check');
    }).observe(doc.getElementById('modal') || doc.body, { childList: true, subtree: true });
  }

  // Flex boxes with gap (Chromium 84): without it, the stylesheets' deploy-time fallbacks space items with margins
  // under html.no-flex-gap (scripts/build-legacy-css.mjs)
  function flexGap() {
    var box = doc.createElement('div');
    box.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';
    box.appendChild(doc.createElement('div')); box.appendChild(doc.createElement('div'));
    doc.body.appendChild(box);
    var ok = box.scrollHeight === 1;
    doc.body.removeChild(box);
    if (!ok) root.classList.add('no-flex-gap');
  }
  try { flexGap(); } catch (e) { /* no body yet: ready() runs it */ }

  function ready() { if (!root.classList.contains('no-flex-gap')) try { flexGap(); } catch (e) {} legacyNotice(); watchLayers(); mirrorHas(); watchView(); focusAfterRender(); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', ready); else ready();

  // ---------------------------------------------------------------- the Android app (android/): screen on while playing
  // The app gives the page window.StreamBoxAndroid. TVs dim to a screensaver when the remote isn't touched, so keep the
  // screen on while any video or music is playing.
  if (win.StreamBoxAndroid && win.StreamBoxAndroid.keepScreenOn) {
    var awake = null;
    var checkPlaying = function () {
      var playing = false, media = doc.querySelectorAll('video, audio');
      for (var i = 0; i < media.length; i++) if (!media[i].paused && !media[i].ended) playing = true;
      if (playing !== awake) { awake = playing; try { win.StreamBoxAndroid.keepScreenOn(playing); } catch (e) { /* app gone */ } }
    };
    ['playing', 'pause', 'ended', 'emptied'].forEach(function (type) { doc.addEventListener(type, checkPlaying, true); });
  }

  win.StreamBoxTV = {
    back: goBack,
    get on() { return root.classList.contains('tv'); },
    get mode() { var s = stored(); return s === '1' ? 'on' : s === '0' ? 'off' : 'auto'; },
    set: function (mode) {   // 'on' | 'off' | 'auto'
      try { if (mode === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, mode === 'on' ? '1' : '0'); } catch (e) { /* private mode */ }
      apply(decide());
    },
    detected: TV_UA.test(navigator.userAgent || ''),
    pick: pick,
  };
})();
