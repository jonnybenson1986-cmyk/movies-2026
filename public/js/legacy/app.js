/* Generated from js/app.js (sha 5aa2e71560c77b20) by scripts/build-legacy-js.mjs for older TV browsers. Do not edit. */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/* StreamBox — Netflix-style player for live TV and sports. */
(() => {
    'use strict';
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    // ---------------------------------------------------------------- constants
    const SKY_RACING = [
        // `id` is the channel's site ID in the Australian directory (public/data/australia.json), which is how it shows up there
        { name: 'SKY Racing 1', id: 'SKYR', url: 'https://skylivetab-new.akamaized.net/hls/live/2038780/sky1/index.m3u8' },
        { name: 'SKY Racing 2', id: 'SKYR2', url: 'https://skylivetab-new.akamaized.net/hls/live/2038781/sky2/index.m3u8' },
    ];
    const QUICK_LINKS = [
        { name: '7plus Live', url: 'https://7plus.com.au/live-tv?channel-id=Seven', icon: '📺', note: 'Free-to-air Seven Network' },
        { name: 'iptv-org', url: 'https://github.com/iptv-org/iptv', icon: '🌍', note: 'Source of the channel list' },
    ];
    const CATEGORY_ORDER = ['Sports', 'Movies', 'News', 'Comedy & Series', 'Kids', 'Documentary', 'Music', 'Lifestyle', 'Religious', 'Entertainment'];
    const ROW_LIMIT = 30;
    const GRID_CHUNK = 120;
    const PAGE_IS_HTTPS = location.protocol === 'https:';
    const IS_IOS = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    // Running inside the StreamBox Android app (android/), and where the app's APK is downloaded (netlify.toml sends
    // /apk to the newest GitHub release)
    const IN_ANDROID_APP = /StreamBoxApp\//.test(navigator.userAgent);
    const APK_URL = '/apk';
    const IS_ANDROID = /Android/.test(navigator.userAgent);
    const IS_SAFARI = /^((?!chrome|chromium|crios|fxios|edg|android).)*safari/i.test(navigator.userAgent);
    // iPhone, iPad and Safari play HLS natively. Only the native player can be sent to an Apple TV with AirPlay,
    // and it needs no CORS permission from the stream.
    const NATIVE_HLS = (IS_IOS || IS_SAFARI) && !!document.createElement('video').canPlayType('application/vnd.apple.mpegurl');
    const VLC_STORES = {
        ios: 'https://apps.apple.com/app/vlc-for-mobile/id650377962',
        android: 'https://play.google.com/store/apps/details?id=org.videolan.vlc',
        desktop: 'https://www.videolan.org/vlc/',
    };
    const VLC_LIST_LIMIT = 3000;
    const movies = window.StreamBoxMovies;
    const movy = window.StreamBoxMovy;
    // ---------------------------------------------------------------- storage
    const store = {
        get(key, fallback) { try {
            const v = localStorage.getItem('sb:' + key);
            return v == null ? fallback : JSON.parse(v);
        }
        catch (_a) {
            return fallback;
        } },
        set(key, value) { try {
            localStorage.setItem('sb:' + key, JSON.stringify(value));
        }
        catch ( /* private mode */_a) { /* private mode */ } },
    };
    const settings = Object.assign({ showAll: false, autoVlc: true, autoFullscreen: !!(matchMedia === null || matchMedia === void 0 ? void 0 : matchMedia('(pointer: coarse)').matches), hideBad: true, autoSkip: true, sources: [], guides: [], auGuide: 'Sydney', proxyUrl: '', proxyToken: '' }, store.get('settings', {}));
    const saveSettings = () => store.set('settings', settings);
    // ---------------------------------------------------------------- state
    const items = new Map(); // key -> item, every card on screen points here
    let channels = []; // live channels (bundled + user playlists)
    let channelsReady = null; // promise
    let vlcList = { name: 'streambox', items: [] }; // channels on the current page, for "Play this list in VLC"
    // ---------------------------------------------------------------- helpers
    const $ = sel => document.querySelector(sel);
    const esc = s => String(s !== null && s !== void 0 ? s : '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const hash = s => { let h = 0; for (let i = 0; i < s.length; i++)
        h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
    const tileColor = name => { const h = hash(name) % 360; return `linear-gradient(150deg, hsl(${h} 34% 27%), hsl(${(h + 30) % 360} 38% 10%))`; };
    const initials = name => name.replace(__sbRe("[^\\p{L}\\p{N} ]", "gu"), '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
    // Availability notices queue up and show one after another, each opening the title
    const alerts = [];
    function showAlert() {
        if (showAlert.busy || !alerts.length)
            return;
        const { text, href } = alerts.shift();
        const el = $('#toast');
        showAlert.busy = true;
        el.innerHTML = `<a href="${esc(href)}" class="toast-link">🔔 ${esc(text)} ›</a>`;
        el.hidden = false;
        clearTimeout(toast.t);
        toast.t = setTimeout(() => { el.hidden = true; showAlert.busy = false; showAlert(); }, 6000);
    }
    function toast(msg) {
        const el = $('#toast');
        showAlert.busy = false; // a newer message replaces an availability notice; the rest wait for the next Home visit
        el.textContent = msg;
        el.hidden = false;
        clearTimeout(toast.t);
        toast.t = setTimeout(() => (el.hidden = true), 2400);
    }
    // A browser can load a stream directly unless it needs custom headers or is plain http:// on an https page.
    // With a StreamBox proxy configured (Settings), every channel can play in the app.
    const CORS_EXEMPT = IS_IOS || IS_ANDROID || NATIVE_HLS; // the platform's own HLS player ignores CORS; hls.js can't
    const directOK = ch => ch.type !== 'live' || (!ch.needsHeaders && (!PAGE_IS_HTTPS || ch.url.startsWith('https://')) && !(ch.noCors && !CORS_EXEMPT));
    const hasProxy = () => {
        try {
            const u = new URL(settings.proxyUrl);
            return u.protocol === 'https:' || !PAGE_IS_HTTPS || /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
        }
        catch (_a) {
            return false;
        }
    };
    const isPlayable = ch => directOK(ch) || hasProxy();
    const proxiedUrl = item => {
        const q = (k, v) => (v ? `&${k}=${encodeURIComponent(v)}` : '');
        return `${settings.proxyUrl.replace(/\/+$/, '')}/hls?u=${encodeURIComponent(item.url)}${q('ua', item.ua)}${q('rf', item.rf)}${q('k', settings.proxyToken)}`;
    };
    // Channels that failed to play on this device are hidden for 12 hours (Settings can reset this)
    const BAD_TTL = 12 * 3600e3;
    const bad = Object.fromEntries(Object.entries(store.get('bad', {})).filter(([, t]) => t > Date.now() - BAD_TTL));
    const isBad = ch => ch.type === 'live' && bad[ch.url] > Date.now() - BAD_TTL;
    function markBad(item) { if (item.type === 'live') {
        bad[item.url] = Date.now();
        store.set('bad', bad);
    } }
    function register(item) { items.set(item.key, item); return item.key; }
    // ---------------------------------------------------------------- country / area of origin
    // Each channel's country comes from its iptv-org ID, e.g. "BBCOne.uk@SD" -> United Kingdom.
    const CC_ALIAS = { uk: 'gb' };
    const AREAS = {
        Americas: 'ag ai ar aw bb bm bo br bs bz ca cl co cr cu cw dm do ec gd gf gl gp gt gy hn ht jm kn ky lc mq ms mx ni pa pe pr py sr sv tt us uy vc ve vg vi',
        Europe: 'ad al am at az ba be bg by ch cy cz de dk ee es fi fo fr gb ge gg gi gr hr hu ie im is it je li lt lu lv mc md me mk mt nl no pl pt ro rs ru se si sk sm ua va xk',
        Asia: 'af bd bn bt cn hk id in jp kg kh kp kr kz la lk mm mn mo mv my np pk ph sg th tj tl tm tw uz vn',
        'Middle East': 'ae bh iq ir il jo kw lb om ps qa sa sy tr ye',
        Africa: 'ao bf bi bj bw cd cf cg ci cm cv dj dz eg er et ga gh gm gn gq gw ke km lr ls ly ma mg ml mr mu mw mz na ne ng re rw sc sd sh sl sn so ss st sz td tg tn tz ug yt za zm zw',
        Oceania: 'as au ck fj fm gu ki mh mp nc nr nu nz pf pg pw sb to tv vu wf ws',
    };
    const HOME_CC = 'au'; // Australia comes first everywhere countries are listed
    const AREA_ORDER = ['Oceania', 'Americas', 'Europe', 'Asia', 'Middle East', 'Africa', 'International'];
    const AREA_OF = {};
    for (const [area, codes] of Object.entries(AREAS))
        codes.split(' ').forEach(c => { AREA_OF[c] = area; });
    const areaOf = cc => AREA_OF[cc] || 'International';
    function ccFromId(id) {
        const m = /\.([a-z]{2})(?:@|$)/i.exec(id || '');
        const cc = m ? m[1].toLowerCase() : '';
        return CC_ALIAS[cc] || cc;
    }
    const regionNames = (() => { try {
        return new Intl.DisplayNames(['en'], { type: 'region' });
    }
    catch (_a) {
        return null;
    } })();
    function countryName(cc) {
        if (!cc)
            return 'International / Other';
        try {
            const n = regionNames === null || regionNames === void 0 ? void 0 : regionNames.of(cc.toUpperCase());
            return n && n !== cc.toUpperCase() ? n : cc.toUpperCase();
        }
        catch (_a) {
            return cc.toUpperCase();
        }
    }
    // Flag emoji don't render on Windows, so use small images (hidden if they can't load)
    const flagUrl = cc => `https://flagcdn.com/w40/${cc}.png`;
    const flagImg = (cc, cls = 'flag') => (cc ? `<img class="${cls}" loading="lazy" src="${flagUrl(cc)}" alt="" onerror="this.remove()">` : `<span class="${cls} globe">🌐</span>`);
    function groupByCountry(list) {
        const by = new Map();
        for (const c of list) {
            const k = c.cc || '';
            if (!by.has(k))
                by.set(k, []);
            by.get(k).push(c);
        }
        return [...by].map(([cc, chans]) => ({ cc, name: countryName(cc), area: areaOf(cc), channels: chans }))
            .sort((a, b) => (b.cc === HOME_CC) - (a.cc === HOME_CC) || b.channels.length - a.channels.length || a.name.localeCompare(b.name));
    }
    // ---------------------------------------------------------------- data: channels
    function liveItem(raw, i, origin) {
        return {
            key: `l:${origin}:${i}`, type: 'live',
            name: raw.n, url: raw.u, cat: raw.c || 'Entertainment', quality: raw.q || '',
            source: raw.s || '', logo: raw.l || '', needsHeaders: !!raw.h, isPlaylist: !!raw.p, tvgId: raw.t || '',
            cc: raw.cc || ccFromId(raw.t), // country of origin (ISO 3166-1 alpha-2, lower case), '' if unknown
            ua: raw.ua || '', rf: raw.rf || '', // HTTP headers the stream needs (sent via the VLC playlist / proxy)
            verified: !!raw.v, // manifest loaded with CORS when the build probed it
            noCors: !!raw.nc, // live, but its server sends no CORS header (browsers can't read it)
            dead: !!raw.dd, // manifest answered 404/410 when probed
        };
    }
    function parseM3U(text) {
        var _a, _b;
        const out = [];
        out.guides = []; // XMLTV guide URLs advertised in the #EXTM3U header
        let meta = null;
        for (const line of text.split(/\r?\n/)) {
            const l = line.trim();
            if (l.startsWith('#EXTM3U')) {
                (((_a = l.match(/(?:url-tvg|x-tvg-url)="([^"]*)"/)) === null || _a === void 0 ? void 0 : _a[1]) || '').split(',').map(u => u.trim()).filter(u => /^https:\/\//.test(u)).forEach(u => out.guides.push(u));
            }
            else if (l.startsWith('#EXTINF')) {
                const attr = k => { var _a; return ((_a = l.match(new RegExp(`${k}="([^"]*)"`))) === null || _a === void 0 ? void 0 : _a[1]) || ''; };
                const title = l.slice(l.lastIndexOf(',') + 1).trim();
                meta = { n: title.replace(/\s*\(\d{3,4}p\)/, '').replace(/\s*\[[^\]]*\]/g, '').trim(), q: ((_b = title.match(/\((\d{3,4}p)\)/)) === null || _b === void 0 ? void 0 : _b[1]) || '', c: attr('group-title').split(';')[0], l: attr('tvg-logo'), t: attr('tvg-id') };
            }
            else if (l.startsWith('#EXTVLCOPT') && meta) {
                const m = /^#EXTVLCOPT:http-(user-agent|referrer)=(.*)$/.exec(l);
                if (m) {
                    meta.h = 1;
                    meta[m[1] === 'referrer' ? 'rf' : 'ua'] = m[2];
                }
            }
            else if (l && !l.startsWith('#') && meta) {
                out.push(Object.assign(Object.assign({}, meta), { u: l, c: CATEGORY_ORDER.includes(meta.c) ? meta.c : guessCategory(meta.n, meta.c) }));
                meta = null;
            }
        }
        return out;
    }
    function guessCategory(name, group) {
        var _a;
        const g = (group || '').toLowerCase();
        const map = [
            ['Sports', /sport/], ['News', /news|business|weather|legislative/], ['Movies', /movie|classic/], ['Kids', /kid|animation|family/],
            ['Music', /music/], ['Documentary', /docu|science|education|culture|history/], ['Comedy & Series', /series|comedy/],
            ['Lifestyle', /lifestyle|cooking|travel|outdoor|auto|relax|shop/], ['Religious', /relig/],
        ];
        return ((_a = map.find(([, re]) => re.test(g) || re.test(name.toLowerCase()))) === null || _a === void 0 ? void 0 : _a[0]) || 'Entertainment';
    }
    function loadChannels() {
        return __awaiter(this, void 0, void 0, function* () {
            const seen = new Set();
            const add = (list, origin) => list.forEach((raw, i) => {
                if (seen.has(raw.u))
                    return;
                seen.add(raw.u);
                const it = liveItem(raw, i, origin);
                register(it);
                channels.push(it);
            });
            // Featured sports first so they lead the Sports row
            add(SKY_RACING.map(s => ({ n: s.name, u: s.url, c: 'Sports', q: 'HD', s: 'SKY Racing', v: 1, t: s.id, cc: 'au' })), 'sky');
            try {
                const res = yield fetch('/data/channels.json');
                add(yield res.json(), 'xspf');
            }
            catch (e) {
                console.warn('channels.json failed', e);
            }
            yield Promise.all(settings.sources.map((src, si) => __awaiter(this, void 0, void 0, function* () {
                try {
                    const res = yield fetch(src);
                    const list = parseM3U(yield res.text());
                    list.guides.forEach(g => autoGuides.add(g));
                    add(list, 'src' + si);
                }
                catch (e) {
                    console.warn('source failed', src, e);
                    toast(`Couldn't load playlist: ${src}`);
                }
            })));
            return channels;
        });
    }
    const visibleChannels = () => channels
        .filter(c => !c.isPlaylist && (settings.showAll || (isPlayable(c) && !c.dead)) && !(settings.hideBad && isBad(c)))
        .sort((a, b) => (b.cc === HOME_CC) - (a.cc === HOME_CC) || (b.verified | 0) - (a.verified | 0)); // Australian channels first, then verified streams
    // ---------------------------------------------------------------- data: TV guide (XMLTV)
    // Channels match a guide by tvg-id, or by normalised channel name. Only the next ~36 hours are kept.
    const guide = { byId: new Map(), byName: new Map(), names: new Map(), au: [] }; // au: channel ids of the Australian guide, in file order
    let auGuideState = 'loading'; // 'loading' | 'ready' | 'failed' | 'off'
    const autoGuides = new Set(); // guide URLs advertised by the user's M3U playlists
    const normName = s => (s || '').toLowerCase().replace(/\b(hd|fhd|uhd|sd)\b/g, '').replace(/[^a-z0-9]/g, '');
    function parseXmltvTime(s) {
        const m = /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?\s*([+-])?(\d\d)?(\d\d)?/.exec(s || '');
        if (!m)
            return 0;
        const offset = m[7] ? (m[7] === '-' ? -1 : 1) * ((+m[8] || 0) * 60 + (+m[9] || 0)) : 0;
        return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - offset * 60000;
    }
    function fetchGuideText(url) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = yield fetch(url);
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            if (/\.gz(\?|$)/i.test(url) && 'DecompressionStream' in window) {
                try {
                    return yield new Response(res.clone().body.pipeThrough(new DecompressionStream('gzip'))).text();
                }
                catch ( /* server already decompressed it */_a) { /* server already decompressed it */ }
            }
            return res.text();
        });
    }
    function ingestXmltv(xml, au = false) {
        var _a, _b;
        if (xml.length > 80e6)
            throw new Error('guide file too large');
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        if (doc.getElementsByTagName('parsererror').length)
            throw new Error('not valid XMLTV');
        const now = Date.now(), horizon = now + 36 * 3600e3;
        for (const ch of doc.getElementsByTagName('channel')) {
            const id = ch.getAttribute('id');
            if (!id)
                continue;
            for (const dn of ch.getElementsByTagName('display-name')) {
                const n = normName(dn.textContent);
                if (n)
                    guide.byName.set(n, id);
                if (!guide.names.has(id))
                    guide.names.set(id, dn.textContent.trim());
            }
            if (au && !guide.au.includes(id))
                guide.au.push(id);
        }
        for (const p of doc.getElementsByTagName('programme')) {
            const start = parseXmltvTime(p.getAttribute('start')), stop = parseXmltvTime(p.getAttribute('stop'));
            if (!stop || stop < now || start > horizon)
                continue;
            const id = p.getAttribute('channel');
            if (!guide.byId.has(id))
                guide.byId.set(id, []);
            guide.byId.get(id).push({ start, stop, title: ((_a = p.getElementsByTagName('title')[0]) === null || _a === void 0 ? void 0 : _a.textContent) || '', desc: ((_b = p.getElementsByTagName('desc')[0]) === null || _b === void 0 ? void 0 : _b.textContent) || '' });
        }
        guide.byId.forEach(list => list.sort((a, b) => a.start - b.start));
    }
    // The guide channel for an app channel: by its guide id, by name, or by a known other name (Australian guide)
    function guideIdOf(item) {
        if (item.tvgId && guide.byId.has(item.tvgId))
            return item.tvgId;
        const n = normName(item.name);
        return guide.byName.get(n) || (item.cc === HOME_CC ? guide.byName.get(window.StreamBoxGuide.alias(n, settings.auGuide)) : undefined);
    }
    function guideFor(item) {
        if (!guide.byId.size || item.type !== 'live')
            return null;
        const id = guideIdOf(item);
        const list = id && guide.byId.get(id);
        if (!list)
            return null;
        const t = Date.now();
        const now = list.find(p => p.start <= t && p.stop > t) || null;
        const next = list.find(p => p.start > t) || null;
        return now || next ? { now, next } : null;
    }
    // Update channel cards already on screen once guide data arrives or the programme changes
    function patchGuide() {
        document.querySelectorAll('.card[data-key]').forEach(el => {
            var _a;
            const it = items.get(el.dataset.key);
            const nowOn = (it === null || it === void 0 ? void 0 : it.type) === 'live' && ((_a = guideFor(it)) === null || _a === void 0 ? void 0 : _a.now);
            const meta = el.querySelector('.meta');
            if (nowOn && meta)
                meta.textContent = `Now: ${nowOn.title}`;
        });
        renderPlayerSub();
    }
    function loadGuides() {
        return __awaiter(this, void 0, void 0, function* () {
            const urls = [...new Set([...settings.guides, ...autoGuides])].slice(0, 5);
            for (const url of urls) {
                try {
                    ingestXmltv(yield fetchGuideText(url));
                }
                catch (e) {
                    console.warn('guide failed', url, e);
                    toast(`Couldn’t load TV guide (${e.message})`);
                }
            }
            // The built-in Australian guide (Settings or the TV Guide page picks the city, or turns it off)
            const auUrl = window.StreamBoxGuide.url(settings.auGuide);
            if (!auUrl)
                auGuideState = 'off';
            else {
                auGuideState = 'loading';
                try {
                    ingestXmltv(yield fetchGuideText(auUrl), true);
                    auGuideState = 'ready';
                }
                catch (e) {
                    console.warn('Australian guide failed', e);
                    auGuideState = 'failed';
                }
            }
            patchGuide();
            if (location.hash.startsWith('#guide'))
                route();
        });
    }
    // ---------------------------------------------------------------- TV guide page (Australia)
    function renderGuide(arg) {
        const now = Date.now();
        const au = visibleChannels().filter(c => c.cc === HOME_CC);
        const streams = new Map();
        for (const c of au) {
            const id = guideIdOf(c);
            if (id && !streams.has(id))
                streams.set(id, c);
        }
        const list = auGuideState === 'ready' ? window.StreamBoxGuide.rows({ ids: guide.au, names: guide.names, byId: guide.byId, streamOf: id => streams.get(id), now }) : [];
        list.forEach(r => r.stream && register(r.stream));
        view.innerHTML = window.StreamBoxGuide.pageHTML({ state: auGuideState, city: window.StreamBoxGuide.url(settings.auGuide) ? settings.auGuide : 'off', list, onlyWatchable: arg === 'watch', now });
        $('#epgCity').onchange = e => { settings.auGuide = e.target.value; saveSettings(); location.reload(); };
        $('#epgFilter').addEventListener('input', e => {
            const q = e.target.value.trim().toLowerCase();
            view.querySelectorAll('.epg-row').forEach(r => { r.hidden = !!q && !r.dataset.name.includes(q); });
        });
    }
    setInterval(() => { var _a; if (location.hash.startsWith('#guide') && player.hidden && modal.hidden && document.visibilityState === 'visible' && !((_a = $('#epgFilter')) === null || _a === void 0 ? void 0 : _a.value))
        route(); }, 60000); // keeps "now" current
    // ---------------------------------------------------------------- my list & history
    const restoreMovie = saved => movy.restore(saved) || movies.restore(saved);
    const savedItems = list => list.filter(i => { var _a; return (i === null || i === void 0 ? void 0 : i.type) === 'live' || ((i === null || i === void 0 ? void 0 : i.type) === 'movie' && (((_a = items.get(i.key)) === null || _a === void 0 ? void 0 : _a.type) === 'movie' || restoreMovie(i))); }); // Ignore obsolete discovery entries
    const myList = () => savedItems(store.get('mylist', []));
    for (const saved of [...store.get('mylist', []), ...store.get('history', [])]) {
        const restored = restoreMovie(saved);
        if (restored)
            register(restored);
    }
    const inMyList = key => myList().some(i => i.key === key);
    function toggleMyList(item) {
        let list = myList();
        if (list.some(i => i.key === item.key)) {
            list = list.filter(i => i.key !== item.key);
            toast('Removed from My List');
        }
        else {
            list.unshift(snapshot(item));
            toast('Added to My List');
        }
        store.set('mylist', list.slice(0, 200));
    }
    function pushHistory(item) {
        const list = savedItems(store.get('history', [])).filter(i => i.key !== item.key);
        list.unshift(snapshot(item));
        store.set('history', list.slice(0, 30));
    }
    // Saved items survive reloads even if the source list changes
    const snapshot = it => {
        const { key, type, name, url, cat, quality, source, logo, needsHeaders, tvgId, ua, rf, id, catalog, mediaType, overview, year, vote, season, episode, embedId, cc } = it;
        return { key, type, name, url, cat, quality, source, logo, needsHeaders, tvgId, ua, rf, id, catalog, mediaType, overview, year, vote, season, episode, embedId, cc };
    };
    const revive = saved => items.get(saved.key) || restoreMovie(saved) || (register(saved), saved);
    // ---------------------------------------------------------------- card rendering
    function cardHTML(item) {
        var _a;
        register(item);
        if (item.type === 'movie')
            return item.catalog === 'movy' ? movy.card(item) : movies.card(item);
        if (item.type === 'link') {
            return `<a class="card link-card" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
        <span class="ico">${item.icon}</span><span><span class="name">${esc(item.name)}</span><span class="meta">${esc(item.note)} ↗</span></span>
      </a>`;
        }
        const ok = isPlayable(item);
        const nowOn = (_a = guideFor(item)) === null || _a === void 0 ? void 0 : _a.now;
        const meta = nowOn ? `Now: ${nowOn.title}` : ([item.source, item.quality].filter(Boolean).join(' · ') || item.cat);
        return `<button class="card apple" data-key="${esc(item.key)}" aria-label="${esc(item.name)}">
      <span class="art" style="--tile:${tileColor(item.name)}">
        ${item.logo ? `<span class="plate"><img loading="lazy" src="${esc(item.logo)}" alt="" onerror="this.closest('.plate').remove()"></span>` : ''}
        <span class="initials">${esc(initials(item.name))}</span>
        <span class="badge ${ok ? '' : 'warn'}">${ok ? '<span class="dot"></span>LIVE' : 'VLC'}</span>
        ${inMyList(item.key) ? '<span class="fav">★</span>' : ''}
        ${item.cc ? flagImg(item.cc, 'card-flag') : ''}
      </span>
      <span class="caption"><span class="name">${esc(item.name)}</span><span class="meta">${esc(meta)}</span></span>
    </button>`;
    }
    function rowHTML(title, list, seeAll, extraClass = '') {
        if (!list.length)
            return '';
        return `<section class="row ${extraClass}">
      <div class="row-head"><h2>${esc(title)}</h2>${seeAll ? `<a class="see-all" href="${esc(seeAll)}">See all ›</a>` : ''}</div>
      <div class="row-track-wrap">
        <button class="row-arrow left" aria-label="Scroll left"><svg viewBox="0 0 24 24"><path d="M15 18 9 12l6-6"/></svg></button>
        <div class="row-track">${list.map(cardHTML).join('')}</div>
        <button class="row-arrow right" aria-label="Scroll right"><svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg></button>
      </div>
    </section>`;
    }
    // Infinite grid for long lists
    function mountGrid(container, list) {
        if (!list.length) {
            container.innerHTML = '<div class="empty">Nothing here yet.</div>';
            return;
        }
        container.innerHTML = `<div class="grid"></div><div class="grid-sentinel"></div>`;
        const grid = container.querySelector('.grid');
        let i = 0;
        const more = () => { grid.insertAdjacentHTML('beforeend', list.slice(i, i + GRID_CHUNK).map(cardHTML).join('')); i += GRID_CHUNK; if (i >= list.length)
            io.disconnect(); };
        const io = new IntersectionObserver(e => e[0].isIntersecting && more(), { rootMargin: '800px' });
        more();
        io.observe(container.querySelector('.grid-sentinel'));
    }
    // ---------------------------------------------------------------- views
    const view = $('#view');
    let heroHls = null;
    function stopHero() { if (heroHls) {
        heroHls.destroy();
        heroHls = null;
    } const v = $('#heroVideo'); if (v) {
        v.pause();
        v.removeAttribute('src');
        v.load();
    } }
    function startHero(url) {
        var _a;
        const v = $('#heroVideo');
        if (!v)
            return;
        v.muted = true;
        v.addEventListener('playing', () => v.style.opacity = 1, { once: true });
        if (!IS_IOS && ((_a = window.Hls) === null || _a === void 0 ? void 0 : _a.isSupported())) {
            heroHls = new Hls({ maxBufferLength: 8, capLevelToPlayerSize: true });
            heroHls.loadSource(url);
            heroHls.attachMedia(v);
            heroHls.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => { }));
        }
        else if (v.canPlayType('application/vnd.apple.mpegurl')) {
            v.src = url;
            v.play().catch(() => { });
        }
    }
    function renderHome() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const hero = channels.find(c => c.url === SKY_RACING[0].url);
            const all = visibleChannels();
            const byCat = cat => all.filter(c => c.cat === cat);
            const history = savedItems(store.get('history', [])).map(revive);
            const mine = myList().map(revive);
            view.innerHTML = `
      <section class="hero">
        <div class="hero-bg"></div>
        <video id="heroVideo" muted playsinline autoplay loop style="opacity:0;transition:opacity 1s"></video>
        <div class="hero-content">
          <span class="hero-tag"><span class="dot"></span> Live now · Sports</span>
          <h1>SKY Racing Live</h1>
          <p>Thoroughbred, harness and greyhound racing from around Australia — streaming live 24/7. Plus ${all.length.toLocaleString()} more live TV channels.</p>
          <div class="hero-actions">
            <button class="btn btn-play" data-key="${esc(hero.key)}"><svg viewBox="0 0 24 24"><path d="M6 4v16l14-8z"/></svg>Play</button>
            <a class="btn btn-more" href="#sports"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>All Sports</a>
          </div>
        </div>
      </section>
      <div class="rows">
        ${rowHTML('Continue Watching', history.slice(0, ROW_LIMIT))}
        ${rowHTML('My List', mine.slice(0, ROW_LIMIT), '#mylist')}
        ${rowHTML('New Movies', movies.newMovies.slice(0, ROW_LIMIT), '#movies/new')}
        ${rowHTML('Movies', movies.all.slice(0, ROW_LIMIT), '#movies')}
        <section class="row"><div class="row-head"><h2>Australia</h2><a class="see-all" href="#australia">${window.StreamBoxAustralia.count} guide channels ›</a></div></section>
        <section class="row"><div class="row-head"><h2>Movy</h2></div><div class="chips"><a class="chip" href="#movy/movie">Movies</a><a class="chip" href="#movy/tv">TV Shows</a><a class="chip" href="#movy/anime">Anime</a><a class="chip" href="#movy/4k">4K Library</a></div></section>
        <section class="row watch-hub" id="watchHub" data-watch-hub aria-label="Browse by Streaming Service"></section>
        ${countryRow('Browse by country', groupByCountry(all).filter(g => g.cc).slice(0, 24), '#countries')}
        ${rowHTML('Live Sports', byCat('Sports').slice(0, ROW_LIMIT), '#sports')}
        ${rowHTML('Pluto TV Channels', all.filter(c => c.source === 'Pluto TV').slice(0, ROW_LIMIT), '#live/Pluto TV')}
        ${rowHTML('News', byCat('News').slice(0, ROW_LIMIT), '#live/News')}
        ${rowHTML('Comedy & Series', byCat('Comedy & Series').slice(0, ROW_LIMIT), '#live/Comedy & Series')}
        ${rowHTML('Kids & Family', byCat('Kids').slice(0, ROW_LIMIT), '#live/Kids')}
        ${rowHTML('Documentaries', byCat('Documentary').slice(0, ROW_LIMIT), '#live/Documentary')}
        ${rowHTML('Music', byCat('Music').slice(0, ROW_LIMIT), '#live/Music')}
        ${rowHTML('Lifestyle', byCat('Lifestyle').slice(0, ROW_LIMIT), '#live/Lifestyle')}
        ${rowHTML('More Live TV', byCat('Entertainment').slice(0, ROW_LIMIT), '#live/Entertainment')}
        ${rowHTML('Quick Links', QUICK_LINKS.map((l, i) => (Object.assign(Object.assign({}, l), { type: 'link', key: 'q:' + i }))))}
      </div>`;
            (_a = window.StreamBoxWatch) === null || _a === void 0 ? void 0 : _a.mountHub($('#watchHub'));
            // "Notify Me When Available": tell the person when a title they are waiting for has arrived on a service
            (_b = window.StreamBoxWatch) === null || _b === void 0 ? void 0 : _b.checkAlerts((text, href) => { alerts.push({ text, href }); showAlert(); });
            startHero(hero.url);
        });
    }
    function renderLive(cat) {
        const all = visibleChannels();
        const counts = all.reduce((a, c) => (a[c.cat] = (a[c.cat] || 0) + 1, a), {});
        const sources = [...new Set(all.map(c => c.source).filter(Boolean))];
        const vlcOnly = all.filter(c => !isPlayable(c));
        counts['VLC only'] = vlcOnly.length;
        counts.Verified = all.filter(c => c.verified).length;
        const chips = ['All', ...(counts.Verified ? ['Verified'] : []), ...CATEGORY_ORDER.filter(c => counts[c]), ...sources, ...(vlcOnly.length ? ['VLC only'] : [])];
        const active = cat || 'All';
        const list = active === 'All' ? all : active === 'VLC only' ? vlcOnly : active === 'Verified' ? all.filter(c => c.verified) : all.filter(c => c.cat === active || c.source === active);
        vlcList = { name: `streambox-${active}`, items: list };
        view.innerHTML = `<div class="page">
      <div class="page-head"><h1>Live TV</h1><span class="count">${list.length.toLocaleString()} channels${settings.showAll ? '' : ` · ${channels.filter(c => !c.isPlaylist && !c.dead && !isPlayable(c)).length.toLocaleString()} more need VLC or a proxy (Settings)`}</span>
        <button class="btn btn-more page-btn" data-act="vlcpl">Play this list in VLC</button></div>
      <div class="chips"><a class="chip chip-accent" href="#countries">🌍 By country</a><a class="chip chip-accent" href="#guide">📅 TV Guide</a><a class="chip" href="#australia">Australia · ${window.StreamBoxAustralia.count} guide channels</a>${chips.map(c => `<a class="chip ${c === active ? 'active' : ''}" href="#live/${encodeURIComponent(c)}">${esc(c)}${counts[c] ? ` · ${counts[c]}` : ''}</a>`).join('')}</div>
      <div id="gridMount"></div>
    </div>`;
        mountGrid($('#gridMount'), list);
    }
    // ---------------------------------------------------------------- countries
    const countryTile = g => `<a class="country-tile" href="#country/${esc(g.cc || 'other')}" data-name="${esc(g.name.toLowerCase())}">
      ${flagImg(g.cc)}<span><b>${esc(g.name)}</b><small>${g.channels.length.toLocaleString()} channel${g.channels.length === 1 ? '' : 's'}</small></span></a>`;
    function countryRow(title, groups, seeAll) {
        if (!groups.length)
            return '';
        return `<section class="row">
      <div class="row-head"><h2>${esc(title)}</h2>${seeAll ? `<a class="see-all" href="${esc(seeAll)}">See all ›</a>` : ''}</div>
      <div class="row-track-wrap"><div class="row-track country-row">${groups.map(countryTile).join('')}</div></div>
    </section>`;
    }
    // All countries, grouped by area. `area` (optional) narrows to one area.
    function renderCountries(area) {
        const groups = groupByCountry(visibleChannels());
        const areas = AREA_ORDER.filter(a => groups.some(g => g.area === a));
        const active = areas.includes(area) ? area : '';
        const shown = groups.filter(g => !active || g.area === active);
        const total = shown.reduce((n, g) => n + g.channels.length, 0);
        view.innerHTML = `<div class="page">
      <div class="page-head"><h1>Countries</h1><span class="count">${shown.filter(g => g.cc).length} countries · ${total.toLocaleString()} channels</span>
        <input class="country-filter" id="countryFilter" type="search" placeholder="Find a country…" autocomplete="off"></div>
      <div class="chips"><a class="chip chip-accent" href="#live">📺 All channels</a><a class="chip chip-accent" href="#guide">📅 TV Guide · Australia</a><a class="chip ${active ? '' : 'active'}" href="#countries">All areas</a>${areas.map(a => {
            const n = groups.filter(g => g.area === a).reduce((m, g) => m + g.channels.length, 0);
            return `<a class="chip ${a === active ? 'active' : ''}" href="#countries/${encodeURIComponent(a)}">${esc(a)} · ${n.toLocaleString()}</a>`;
        }).join('')}</div>
      ${areas.filter(a => !active || a === active).map(a => {
            const list = shown.filter(g => g.area === a);
            return `<section class="area"><h2 class="area-head">${esc(a)} <small>${list.length} ${list.length === 1 ? 'country' : 'countries'}</small></h2>
          <div class="country-grid">${list.map(countryTile).join('')}</div></section>`;
        }).join('')}
    </div>`;
        $('#countryFilter').addEventListener('input', e => {
            const q = e.target.value.trim().toLowerCase();
            view.querySelectorAll('.country-tile').forEach(t => { t.hidden = !!q && !t.dataset.name.includes(q); });
            view.querySelectorAll('.area').forEach(sec => { sec.hidden = ![...sec.querySelectorAll('.country-tile')].some(t => !t.hidden); });
        });
    }
    // One country's channels bundled together, with category filters. arg is "<cc>" or "<cc>/<category>".
    function renderCountry(arg) {
        const [code, ...rest] = (arg || '').split('/');
        const cc = code === 'other' ? '' : code.toLowerCase();
        const category = rest.join('/');
        const all = visibleChannels().filter(c => (c.cc || '') === cc);
        if (!all.length) {
            view.innerHTML = '<div class="page"><div class="empty">No channels for that country.<br><a class="btn btn-more" href="#countries" style="margin-top:14px">All countries</a></div></div>';
            return;
        }
        const counts = all.reduce((a, c) => (a[c.cat] = (a[c.cat] || 0) + 1, a), {});
        const cats = CATEGORY_ORDER.filter(c => counts[c]);
        const active = cats.includes(category) ? category : 'All';
        const list = active === 'All' ? all : all.filter(c => c.cat === active);
        const name = countryName(cc);
        vlcList = { name: `streambox-${name}`, items: list };
        view.innerHTML = `<div class="page">
      <div class="page-head country-head">${flagImg(cc, 'flag flag-lg')}<h1>${esc(name)}</h1>
        <span class="count">${esc(areaOf(cc))} · ${list.length.toLocaleString()} channels</span>
        <a class="btn btn-more page-btn" href="#countries">All countries</a>${cc === HOME_CC ? '<a class="btn btn-more" href="#guide" style="font-size:13px;padding:7px 14px">📅 TV Guide</a>' : ''}
        <button class="btn btn-more" data-act="vlcpl" style="font-size:13px;padding:7px 14px">Play in VLC</button></div>
      <div class="chips"><a class="chip ${active === 'All' ? 'active' : ''}" href="#country/${esc(code)}">All · ${all.length}</a>${cats.map(c => `<a class="chip ${c === active ? 'active' : ''}" href="#country/${esc(code)}/${encodeURIComponent(c)}">${esc(c)} · ${counts[c]}</a>`).join('')}</div>
      <div id="gridMount"></div>
    </div>`;
        mountGrid($('#gridMount'), list);
    }
    function renderSports() {
        const sports = visibleChannels().filter(c => c.cat === 'Sports');
        view.innerHTML = `<div class="page">
      <div class="page-head"><h1>Sports</h1><span class="count">${sports.length} live channels</span></div>
      <div class="rows">
        ${rowHTML('SKY Racing', channels.filter(c => c.source === 'SKY Racing'))}
        ${rowHTML('Sports Links', QUICK_LINKS.slice(0, 1).map((l, i) => (Object.assign(Object.assign({}, l), { type: 'link', key: 'q:' + i }))))}
      </div>
      <div class="row-head"><h2>All Sports Channels</h2></div>
      <div id="gridMount"></div>
    </div>`;
        mountGrid($('#gridMount'), sports.filter(c => c.source !== 'SKY Racing'));
    }
    function renderMyList() {
        const mine = myList().map(revive);
        vlcList = { name: 'streambox-my-list', items: mine.filter(i => i.type === 'live') };
        view.innerHTML = `<div class="page">
      <div class="page-head"><h1>My List</h1><span class="count">${mine.length} saved</span>
        ${mine.some(i => i.type === 'live') ? '<button class="btn btn-more page-btn" data-act="vlcpl">Play channels in VLC</button>' : ''}</div>
      <div id="gridMount"></div>
    </div>`;
        if (!mine.length) {
            $('#gridMount').innerHTML = '<div class="empty">Tap <b>+ My List</b> on a channel or movie to save it here.</div>';
            return;
        }
        mountGrid($('#gridMount'), mine);
    }
    function renderSearch(q) {
        const term = q.trim().toLowerCase();
        const live = term ? visibleChannels().filter(c => c.name.toLowerCase().includes(term) || c.cat.toLowerCase() === term || (term.length >= 3 && countryName(c.cc).toLowerCase().startsWith(term))) : [];
        const films = term ? movies.all.filter(m => m.name.toLowerCase().includes(term)) : [];
        view.innerHTML = `<div class="page">
      <div class="page-head"><h1>Results for “${esc(q)}”</h1><span class="count">${live.length} channels · ${films.length} movies</span></div>
      <div class="row-head"><h2>Live Channels</h2></div>
      <div id="gridMount"></div>
    </div>`;
        mountGrid($('#gridMount'), live);
        view.insertAdjacentHTML('beforeend', '<div class="row-head"><h2>Movies</h2></div><div id="movieResults"></div>');
        mountGrid($('#movieResults'), films);
        view.insertAdjacentHTML('beforeend', `<div class="movy-pages"><a class="btn btn-more" href="#movy/movie/1?query=${encodeURIComponent(q)}">Search Movy movies, TV shows &amp; anime</a></div>`);
    }
    // ---------------------------------------------------------------- router
    let routeVersion = 0;
    function route() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const version = ++routeVersion;
            pendingMovieRender = false;
            stopHero();
            movy.cancel();
            const [name, ...rest] = decodeURIComponent(location.hash.slice(1) || 'home').split('/');
            const arg = rest.join('/');
            const navName = name === 'country' || name === 'countries' || name === 'guide' ? 'live' : name === 'classics' ? 'movies' : name; // Live TV opens the country list
            document.querySelectorAll('[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === navName));
            yield Promise.all([channelsReady, movies.ready, window.StreamBoxAustralia.ready]);
            if (version !== routeVersion)
                return;
            movies.all.forEach(register);
            window.scrollTo(0, 0);
            switch (name) {
                case 'live':
                    renderLive(arg);
                    break;
                case 'sports':
                    renderSports();
                    break;
                case 'australia':
                    window.StreamBoxAustralia.render(view, arg, { streams: channels.filter(c => !(settings.hideBad && isBad(c))), card: cardHTML });
                    break;
                case 'countries':
                    renderCountries(arg);
                    break;
                case 'guide':
                    renderGuide(arg);
                    break;
                case 'music':
                    window.StreamBoxMusic.render(view, arg, { toast, isCurrent: () => version === routeVersion });
                    break;
                case 'country':
                    renderCountry(arg);
                    break;
                case 'movies':
                    movies.render(view, arg);
                    if (!arg)
                        (_a = view.querySelector('.rows')) === null || _a === void 0 ? void 0 : _a.insertAdjacentHTML('afterbegin', `<section class="row"><a class="classics-banner" href="#classics">
          <span><b>🎞 Free Classics</b><small>Hundreds of public-domain films: comedy, noir, sci-fi, silent and westerns. Played in StreamBox’s own player.</small></span><span class="btn btn-play">Browse</span></a></section>`); // classics.js
                    break;
                case 'classics':
                    yield window.StreamBoxClassics.render(view, arg, { play, isCurrent: () => version === routeVersion });
                    break;
                case 'library':
                    yield window.StreamBoxLibrary.render(view, { play });
                    break;
                case 'movy':
                    yield movy.render(view, location.hash.slice(1).split('/').slice(1).join('/'), { register, isSaved: inMyList, retry: route, play });
                    break;
                case 'mylist':
                    renderMyList();
                    break;
                case 'search':
                    renderSearch(arg);
                    break;
                default: renderHome();
            }
            if (version !== routeVersion)
                return;
            $('#topbar').classList.toggle('solid', name !== 'home' && name !== '');
            onScroll();
        });
    }
    // ---------------------------------------------------------------- player
    const player = $('#player'), video = $('#video'), msg = $('#playerMsg');
    const movieFrame = $('#movieFrame'), movieTools = $('#movieTools'), movieSource = $('#movieSource');
    const moviePlayback = window.StreamBoxMoviePlayback.create({
        frame: movieFrame, select: movieSource, external: $('#movieExternal'),
        status: $('#movieSourceStatus'), next: $('#movieNextSource'),
        canOpen: source => (current === null || current === void 0 ? void 0 : current.catalog) === 'movy' || source.url.startsWith('https://www.vidy.st/') ? movy.checkProtection() : true,
    });
    (_a = window.StreamBoxMovySetup) === null || _a === void 0 ? void 0 : _a.configure({ movy, play });
    function movieChoices(item) {
        var _a, _b;
        if (item.catalog === 'movy' && item.mediaType !== 'movie') {
            return [{ name: 'Vidy · Protected', url: movy.playerUrl(item, (_a = item.season) !== null && _a !== void 0 ? _a : 1, (_b = item.episode) !== null && _b !== void 0 ? _b : 1) }];
        }
        const alternatives = movies.sources.map((source, i) => ({ name: source.name, url: movies.url(item, i) + (source.name === 'VidLink' ? '?autoPlay=true' : '') }));
        if (movy.protectedPlayback) {
            const vidy = { name: 'Vidy · Protected', url: movy.playerUrl(Object.assign(Object.assign({}, item), { mediaType: 'movie' })) };
            return item.catalog === 'movy' ? [vidy, ...alternatives] : [...alternatives, vidy];
        }
        return alternatives;
    }
    let hls = null, current = null, currentList = [], stallTimer = null;
    // ---- VLC hand-off. Browsers can't embed VLC or send custom headers, so channels that need either
    // are opened in the VLC app: a deep link on mobile, or an .m3u file that carries the headers.
    const oneLine = s => String(s !== null && s !== void 0 ? s : '').replace(/[\r\n]+/g, ' ').trim();
    function vlcLinks(url) {
        const m = /^(https?):\/\/(.+)$/.exec(url);
        return {
            ios: `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(url)}`,
            android: m ? `intent://${m[2]}#Intent;scheme=${m[1]};action=android.intent.action.VIEW;type=video/*;package=org.videolan.vlc;S.browser_fallback_url=${encodeURIComponent(VLC_STORES.android)};end` : '',
        };
    }
    const vlcDeepLink = url => (IS_ANDROID ? vlcLinks(url).android : IS_IOS ? vlcLinks(url).ios : '');
    function buildM3U(list) {
        return '#EXTM3U\n' + list.map(c => [
            `#EXTINF:-1 group-title="${oneLine(c.cat).replace(/"/g, "'")}",${oneLine(c.name)}`,
            c.ua && `#EXTVLCOPT:http-user-agent=${oneLine(c.ua)}`,
            c.rf && `#EXTVLCOPT:http-referrer=${oneLine(c.rf)}`,
            oneLine(c.url),
        ].filter(Boolean).join('\n')).join('\n') + '\n';
    }
    // Share sheet where files can be shared (iOS/Android), otherwise a normal download
    function saveFile(name, mime, text) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const blob = new Blob([text], { type: mime });
            const file = new File([blob], name, { type: mime });
            if ((_a = navigator.canShare) === null || _a === void 0 ? void 0 : _a.call(navigator, { files: [file] })) {
                try {
                    yield navigator.share({ files: [file], title: name });
                    return;
                }
                catch (e) {
                    if (e.name === 'AbortError')
                        return;
                }
            }
            const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            toast(`Saved ${name}`);
        });
    }
    const vlcButtons = item => {
        const link = vlcDeepLink(item.url);
        return `${link ? `<a class="btn btn-red" href="${esc(link)}">Open in VLC</a>` : ''}
      <button class="btn ${link ? 'btn-more' : 'btn-red'}" data-act="vlcfile" data-key="${esc(item.key)}">Open in VLC (.m3u file)</button>
      <button class="btn btn-more" data-act="copy" data-key="${esc(item.key)}">Copy stream URL</button>`;
    };
    function exportVlcList() {
        const { name, items: list } = vlcList;
        if (!list.length) {
            toast('No channels to export');
            return;
        }
        const slice = list.slice(0, VLC_LIST_LIMIT);
        saveFile(`${name.replace(/[^\w.-]+/g, '_')}.m3u`, 'audio/x-mpegurl', buildM3U(slice));
        if (list.length > slice.length)
            toast(`Exported the first ${VLC_LIST_LIMIT.toLocaleString()} of ${list.length.toLocaleString()} channels`);
    }
    function openVlcChannel(item) {
        showChannel(item);
        // On phones, jump straight into VLC (this runs inside the tap, so the browser allows it)
        const link = settings.autoVlc && vlcDeepLink(item.url);
        if (link)
            location.href = link;
    }
    function renderPlayerSub() {
        if (!current)
            return;
        const base = [current.cc && countryName(current.cc), current.source, current.quality, current.cat].filter(Boolean).join(' · ');
        const g = guideFor(current);
        const at = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        $('#playerSub').textContent = [base, (g === null || g === void 0 ? void 0 : g.now) && `Now: ${g.now.title}`, (g === null || g === void 0 ? void 0 : g.next) && `Next ${at(g.next.start)}: ${g.next.title}`].filter(Boolean).join(' · ');
    }
    function showPlayerMsg(title, text, item, detail = '') {
        msg.innerHTML = `<h3>${esc(title)}</h3><p>${esc(text)}</p>${detail ? `<p style="font-size:12px;color:#777;margin:-8px 0 14px">${esc(detail)}</p>` : ''}<div class="btns">
      ${item.type === 'live' ? vlcButtons(item) : ''}
      ${item.type === 'live' && !hasProxy() ? '<button class="btn btn-more" data-act="proxysetup">Set up proxy</button>' : ''}
      ${item.type === 'live' && currentList.length > 1 ? '<button class="btn btn-play" data-act="next">Next working channel</button>' : ''}
    </div>`;
        msg.hidden = false;
    }
    // ---- where the person is up to in a video. Only for videos StreamBox plays itself (their own library):
    // third-party movie players run in their own frame, which StreamBox can't see into.
    const progressMap = () => { const m = store.get('progress', {}); return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; };
    let progressKey = null, progressSavedAt = 0, resumeFrom = null;
    const clock = sec => { const s = Math.floor(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return `${h ? h + ':' + String(m).padStart(2, '0') : m}:${String(s % 60).padStart(2, '0')}`; };
    function saveProgress(force = false) {
        if (!progressKey || !(video.duration > 0))
            return;
        const now = Date.now();
        if (!force && now - progressSavedAt < 5000)
            return;
        progressSavedAt = now;
        const map = progressMap(), t = video.currentTime, d = video.duration;
        // Barely started or finished: remember it as "no place" (t: 0), so the account forgets the old place too
        map[progressKey] = t > 10 && t < d - 30 ? { t: Math.floor(t), d: Math.floor(d), at: now } : { t: 0, d: Math.floor(d), at: now };
        const newest = Object.entries(map).sort((a, b) => b[1].at - a[1].at).slice(0, 300);
        store.set('progress', Object.fromEntries(newest));
    }
    video.addEventListener('loadedmetadata', () => {
        const from = resumeFrom;
        resumeFrom = null;
        if (progressKey && from && from.t > 10 && video.duration > from.t + 30) {
            video.currentTime = from.t;
            toast(`Resuming at ${clock(from.t)}`);
        }
    });
    video.addEventListener('timeupdate', () => saveProgress());
    video.addEventListener('pause', () => saveProgress(true));
    video.addEventListener('ended', () => { if (progressKey) {
        const map = progressMap();
        map[progressKey] = { t: 0, d: Math.floor(video.duration) || 0, at: Date.now() };
        store.set('progress', map);
    } });
    addEventListener('pagehide', () => saveProgress(true));
    function teardown() {
        clearTimeout(stallTimer);
        moviePlayback.stop();
        movieFrame.src = 'about:blank';
        movieFrame.hidden = movieTools.hidden = true;
        video.hidden = false;
        player.classList.remove('movie-mode');
        playerHint.hidden = true;
        if (hls) {
            hls.destroy();
            hls = null;
        }
        video.pause();
        video.removeAttribute('src');
        video.load();
        closeSubsMenu();
    }
    // When a channel won't load, the player moves on to the next one in the same country by itself (Settings can turn
    // this off). skip counts the channels passed over since the person last picked one.
    const MAX_SKIPS = 5;
    const reconnected = new Set(); // channels already reconnected once this visit
    let skip = { count: 0, dir: 1, from: null, notes: [] };
    function play(item_1) {
        return __awaiter(this, arguments, void 0, function* (item, list = [], force = false, { auto = false, dir = 1, reconnect = false } = {}) {
            var _a, _b, _c, _d, _e, _f;
            if (!auto && !reconnect)
                skip = { count: 0, dir, from: item, notes: [] };
            stopHero();
            (_a = window.StreamBoxMusic) === null || _a === void 0 ? void 0 : _a.pause(); // one thing playing at a time
            saveProgress(true); // where the previous video was up to
            progressKey = resumeFrom = null;
            teardown();
            player.classList.remove('live-mode'); // each stream attempt calls teardown(), so this is reset here, not there
            current = item;
            currentList = list.length ? list : [item];
            if (item.type === 'live') { // channels are zapped by country, like a TV remote
                zap.remember(item);
                const inCountry = zap.list(item);
                if (inCountry.length)
                    currentList = inCountry;
            }
            player.hidden = false;
            if (!player.contains(document.activeElement))
                (_c = (_b = document.activeElement) === null || _b === void 0 ? void 0 : _b.blur) === null || _c === void 0 ? void 0 : _c.call(_b); // so Enter and the arrow keys go to the player, not the card behind it
            document.body.style.overflow = 'hidden';
            $('#playerTitle').textContent = item.name;
            renderPlayerSub();
            $('#playerLive').hidden = item.type !== 'live';
            $('#playerPrev').hidden = $('#playerNext').hidden = item.type !== 'live' || currentList.length < 2;
            msg.innerHTML = '<div class="spinner"></div>';
            msg.hidden = false;
            pushHistory(item);
            wakeControls();
            zapOnPlay(item);
            if (item.type === 'movie' && item.catalog === 'personal') {
                video.hidden = false;
                movieFrame.hidden = movieTools.hidden = true;
                player.classList.add('movie-mode');
                video.controls = true;
                syncPlayerUI(); // shows the AirPlay button when an Apple TV or speaker is nearby
                // Pick up a place saved from another device a moment ago (but never wait long for it)
                if ((_d = window.StreamBoxAccount) === null || _d === void 0 ? void 0 : _d.enabled)
                    yield Promise.race([window.StreamBoxAccount.sync(), new Promise(r => setTimeout(r, 1500))]);
                if (current !== item)
                    return;
                progressKey = item.key;
                progressSavedAt = Date.now();
                resumeFrom = progressMap()[item.key] || null;
                const isHls = /\.m3u8(?:$|\?)/i.test(item.url);
                if (isHls && !IS_IOS && !NATIVE_HLS && ((_e = window.Hls) === null || _e === void 0 ? void 0 : _e.isSupported())) {
                    hls = new Hls({ enableWorker: true, backBufferLength: 30 });
                    hls.loadSource(item.url);
                    hls.attachMedia(video);
                    hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => { }));
                    hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal && current === item)
                        showPlayerMsg('Video unavailable', 'The server may be offline or may not allow cross-origin playback. Check its CORS settings.', item, d.details || 'HLS playback error'); });
                }
                else {
                    video.src = item.url;
                    video.play().catch(() => { msg.hidden = false; msg.innerHTML = '<p>Press play to start this video. If it fails, check the URL, file format and server permissions.</p>'; });
                }
                msg.hidden = true;
                return;
            }
            if (item.type === 'movie' && item.catalog === 'movy' && !movy.protectedPlayback) {
                msg.innerHTML = `<h3>Playback protection required</h3>
        <p>Movy plays through the StreamBox helper extension. Set it up automatically — StreamBox detects the install and starts <b>${esc(item.name)}</b> by itself — or watch right now in the Browser box, no helper needed.</p>
        <div class="btns">
          <button class="btn btn-red" data-act="movysetup">Set up helper &amp; auto-play</button>
          <button class="btn btn-more" data-act="movybrowser">Open in Browser box</button>
        </div>`;
                msg.hidden = false;
                return;
            }
            if (item.type === 'movie') {
                movieFrame.allow = item.catalog === 'movy' ? 'encrypted-media; autoplay *; fullscreen *; picture-in-picture' : 'autoplay; fullscreen; encrypted-media; picture-in-picture';
                video.hidden = true;
                movieFrame.hidden = movieTools.hidden = false;
                movieFrame.title = item.name + ' player';
                player.classList.add('movie-mode');
                msg.hidden = true;
                syncPlayerUI();
                moviePlayback.start(item, movieChoices(item));
                return;
            }
            if (item.type === 'live') {
                player.classList.add('live-mode');
                video.controls = false; // StreamBox's own controls (below) replace the browser's
                applyVolume();
                syncPlayerUI();
                showPlayerHint();
                // Straight from the tap that opened the channel (browsers only allow full screen then). Not when switching channels.
                if (settings.autoFullscreen && !inFullscreen())
                    enterFullscreen();
            }
            if (item.type === 'live' && !force && !isPlayable(item)) {
                showPlayerMsg('Plays in VLC only', item.needsHeaders
                    ? 'This channel needs special HTTP headers that web browsers can’t send.'
                    : 'This channel streams over insecure http://, which browsers block on secure sites.', item);
                return;
            }
            const url = item.url;
            // Cheapest route first, then fall back: direct (hls.js) -> the browser's own HLS player (no CORS check) -> your proxy
            const hlsJs = !IS_IOS && !NATIVE_HLS && !!((_f = window.Hls) === null || _f === void 0 ? void 0 : _f.isSupported());
            const plan = [];
            if (directOK(item) || force) {
                const direct = { url, native: !hlsJs, label: 'direct' }, native = { url, native: true, label: 'native' };
                const canNative = hlsJs && !!video.canPlayType('application/vnd.apple.mpegurl');
                if (item.noCors && canNative)
                    plan.push(native, direct); // hls.js would be blocked by CORS; the platform player isn't
                else {
                    plan.push(direct);
                    if (canNative)
                        plan.push(native);
                }
            }
            if (hasProxy())
                plan.push({ url: proxiedUrl(item), native: !hlsJs, label: 'proxy' });
            const reasons = [];
            for (const attempt of plan) {
                if (current !== item)
                    return;
                try {
                    yield attemptPlay(attempt.url, attempt.native, item);
                    return;
                }
                catch (e) {
                    reasons.push(`${attempt.label}: ${e.message}`);
                    console.warn('play attempt failed:', item.name, attempt.label, e.message);
                }
            }
            if (current !== item)
                return;
            markBad(item);
            // Move on to the next channel in this country that hasn't failed, the way a TV skips a dead channel
            const next = settings.autoSkip && skip.count < MAX_SKIPS && zap.channel(item, skip.dir);
            if (next && next !== skip.from) {
                skip.count++;
                skip.notes.push(item.name); // shown on the next channel's banner
                play(next, [], false, { auto: true });
                return;
            }
            const why = explainFailure(reasons);
            showPlayerMsg(skip.count ? `${skip.count + 1} channels in a row didn’t load` : 'Channel unavailable', skip.count ? `${why.text} StreamBox tried the next ${skip.count} channel${skip.count === 1 ? '' : 's'} too.` : why.text, item, why.detail);
        });
    }
    // Resolves once the video is playing; rejects with a short reason otherwise.
    // After it has resolved, a later failure is shown to the user directly.
    function attemptPlay(url, native, item) {
        return new Promise((resolve, reject) => {
            teardown();
            let settled = false;
            const finish = err => {
                if (settled)
                    return false;
                settled = true;
                clearTimeout(stallTimer);
                err ? reject(err) : resolve();
                return true;
            };
            // A stream that drops after it was playing (a server hiccup, or the phone changing networks) is reconnected once
            const midStream = why => {
                if (current !== item)
                    return;
                if (item.type === 'live' && !reconnected.has(item.key)) {
                    reconnected.add(item.key);
                    play(item, currentList, false, { reconnect: true }); // (shows the channel banner straight away, so the note goes after it)
                    showBanner(`<b class="zap-num">⟳</b><span class="zap-info"><strong>Reconnecting…</strong><span>${esc(item.name)}</span></span>`, 3000);
                    return;
                }
                showPlayerMsg('Stream stopped', why, item);
            };
            stallTimer = setTimeout(() => finish(new Error('no video after 10s')), 10000);
            video.onplaying = () => { finish(); msg.hidden = true; applySubs(); };
            video.onerror = () => {
                var _a, _b;
                if (!video.getAttribute('src'))
                    return;
                const why = `media error ${(_b = (_a = video.error) === null || _a === void 0 ? void 0 : _a.code) !== null && _b !== void 0 ? _b : ''}`.trim();
                if (!finish(new Error(why)))
                    midStream(`The stream stopped (${why}).`);
            };
            if (native) {
                video.src = url;
                video.play().catch(() => { video.muted = true; video.play().catch(() => { }); });
                return;
            }
            hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 30 });
            let recoveries = 0;
            hls.loadSource(url);
            hls.attachMedia(video);
            hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, applySubs);
            hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, syncSubsUI);
            hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => { video.muted = true; video.play().catch(() => { }); }));
            hls.on(Hls.Events.ERROR, (_, d) => {
                var _a;
                if (!d.fatal)
                    return;
                if (d.type === Hls.ErrorTypes.MEDIA_ERROR && recoveries++ < 2) {
                    hls.recoverMediaError();
                    return;
                }
                const code = (_a = d.response) === null || _a === void 0 ? void 0 : _a.code;
                const why = d.type === Hls.ErrorTypes.NETWORK_ERROR ? (code >= 400 ? `HTTP ${code}` : code ? d.details : 'blocked or unreachable (likely CORS)') : d.details;
                if (!finish(new Error(why)))
                    midStream(`The stream stopped (${why}).`);
            });
        });
    }
    function explainFailure(reasons) {
        const detail = reasons.join(' · ');
        if (reasons.some(r => /CORS/.test(r)) && !hasProxy()) {
            return { detail, text: 'This channel’s server doesn’t allow web players to read it, so a browser can’t play it directly. Set up the StreamBox proxy, or open it in VLC.' };
        }
        return { detail, text: hasProxy() ? 'It may be offline or region-locked.' : 'It may be offline or geo-blocked in your region.' };
    }
    let pendingMovieRender = false;
    function closePlayer() {
        closeZapPanel();
        hideBanner();
        digits.cancel();
        saveProgress(true);
        progressKey = resumeFrom = null;
        teardown();
        current = null;
        player.hidden = true;
        msg.hidden = true;
        document.body.style.overflow = '';
        if (fsElement() === player || video.webkitDisplayingFullscreen)
            exitFullscreen();
        player.classList.remove('live-mode');
        if (pendingMovieRender) {
            pendingMovieRender = false;
            route();
        }
        if (!location.hash || location.hash === '#home')
            startHero(SKY_RACING[0].url);
    }
    // Channel up (+1) / down (-1) within the country
    function step(dir) {
        const next = current && zap.channel(current, dir);
        if (next)
            play(next, [], false, { dir });
        else if (current)
            toast(`No other channels in ${current.cc ? countryName(current.cc) : 'this group'}`);
    }
    let idleTimer;
    function wakeControls() {
        player.classList.remove('idle');
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => { if (zapPanel.hidden && subsMenu.hidden)
            player.classList.add('idle'); }, 3500); // stays awake while the channel list is open
    }
    // ---------------------------------------------------------------- live player controls
    // Play/pause, volume, full screen, picture-in-picture and touch gestures for live channels.
    const svg = body => `<svg viewBox="0 0 24 24">${body}</svg>`;
    const ICON = {
        play: svg('<path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/>'),
        pause: svg('<path d="M8 5v14M16 5v14" stroke-width="3.4"/>'),
        volume: svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'),
        muted: svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="m17 9 5 6M22 9l-5 6"/>'),
        enter: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
        exit: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
        pip: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="12" width="7" height="5" rx="1" fill="currentColor"/>'),
        airplay: svg('<path d="M6 17H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="m12 14 5.5 7h-11z" fill="currentColor"/>'),
    };
    const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
    const inFullscreen = () => fsElement() === player || !!video.webkitDisplayingFullscreen;
    const isLivePlayer = () => player.classList.contains('live-mode');
    // The whole player goes full screen so the channel controls stay on screen.
    // iPhone only allows the video element itself, so it falls back to that.
    function enterFullscreen() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            try {
                if (player.requestFullscreen)
                    yield player.requestFullscreen({ navigationUI: 'hide' });
                else if (player.webkitRequestFullscreen)
                    player.webkitRequestFullscreen();
                else if (video.webkitEnterFullscreen)
                    video.webkitEnterFullscreen();
                else
                    return false;
            }
            catch (_c) {
                try {
                    if (!video.webkitEnterFullscreen)
                        return false;
                    video.webkitEnterFullscreen();
                }
                catch (_d) {
                    return false;
                }
            }
            try {
                yield ((_b = (_a = screen.orientation) === null || _a === void 0 ? void 0 : _a.lock) === null || _b === void 0 ? void 0 : _b.call(_a, 'landscape'));
            }
            catch ( /* only allowed in full screen, and not by every browser */_e) { /* only allowed in full screen, and not by every browser */ }
            return true;
        });
    }
    function exitFullscreen() {
        var _a, _b, _c, _d, _e, _f;
        try {
            (_b = (_a = screen.orientation) === null || _a === void 0 ? void 0 : _a.unlock) === null || _b === void 0 ? void 0 : _b.call(_a);
        }
        catch ( /* ignore */_g) { /* ignore */ }
        if (fsElement())
            (_e = (_d = (_c = (document.exitFullscreen || document.webkitExitFullscreen)) === null || _c === void 0 ? void 0 : _c.call(document)) === null || _d === void 0 ? void 0 : _d.catch) === null || _e === void 0 ? void 0 : _e.call(_d, () => { });
        else if (video.webkitDisplayingFullscreen)
            (_f = video.webkitExitFullscreen) === null || _f === void 0 ? void 0 : _f.call(video);
    }
    function toggleFullscreen() {
        return __awaiter(this, void 0, void 0, function* () {
            if (inFullscreen())
                exitFullscreen();
            else if (!(yield enterFullscreen()))
                toast('Full screen isn’t available in this browser');
        });
    }
    const playBtn = $('#playerPlay'), muteBtn = $('#playerMute'), volInput = $('#playerVol');
    const fsBtn = $('#playerFs'), pipBtn = $('#playerPip'), playerHint = $('#playerHint');
    const fsTopBtn = $('#playerFsTop'), airBtn = $('#playerAirplay'), airTopBtn = $('#playerAirTop');
    const volumeState = Object.assign({ v: 1, m: false }, store.get('volume', {}));
    function applyVolume() {
        if (!IS_IOS)
            video.volume = volumeState.v; // iPhone/iPad ignore this (hardware buttons)
        video.muted = volumeState.m;
    }
    function syncPlayerUI() {
        playBtn.innerHTML = video.paused ? ICON.play : ICON.pause;
        playBtn.setAttribute('aria-label', video.paused ? 'Play' : 'Pause');
        const muted = video.muted || video.volume === 0;
        muteBtn.innerHTML = muted ? ICON.muted : ICON.volume;
        muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
        volInput.value = video.muted ? 0 : video.volume;
        const full = inFullscreen();
        fsBtn.innerHTML = fsTopBtn.innerHTML = full ? ICON.exit : ICON.enter;
        for (const b of [fsBtn, fsTopBtn])
            b.setAttribute('aria-label', full ? 'Exit full screen' : 'Full screen');
        airBtn.innerHTML = ICON.airplay;
        airBtn.hidden = !airplayAvailable;
        airBtn.classList.toggle('on', !!video.webkitCurrentPlaybackTargetIsWireless);
        airBtn.setAttribute('aria-label', video.webkitCurrentPlaybackTargetIsWireless ? 'Playing on AirPlay. Tap to change' : 'AirPlay');
        // The same button at the top of the movie player, for a video StreamBox plays itself (not one inside another site's frame)
        const ownMovie = player.classList.contains('movie-mode') && !video.hidden;
        airTopBtn.innerHTML = ICON.airplay;
        airTopBtn.hidden = !(ownMovie && airplayAvailable);
        airTopBtn.classList.toggle('on', !!video.webkitCurrentPlaybackTargetIsWireless);
        airTopBtn.setAttribute('aria-label', airBtn.getAttribute('aria-label'));
        syncAppFullscreen();
        player.classList.toggle('fullscreen', full);
        pipBtn.innerHTML = ICON.pip;
        pipBtn.hidden = !(document.pictureInPictureEnabled && !video.disablePictureInPicture);
        player.classList.toggle('no-volume', IS_IOS);
    }
    // AirPlay (Safari on iPhone, iPad and Mac): the button only appears when an Apple TV or speaker is nearby
    let airplayAvailable = false;
    video.addEventListener('webkitplaybacktargetavailabilitychanged', e => { airplayAvailable = e.availability === 'available'; syncPlayerUI(); });
    video.addEventListener('webkitcurrentplaybacktargetiswirelesschanged', syncPlayerUI);
    airBtn.onclick = airTopBtn.onclick = () => { try {
        video.webkitShowPlaybackTargetPicker();
    }
    catch (_a) {
        toast('AirPlay isn’t available right now');
    } };
    function togglePlayback() {
        if (!video.paused) {
            video.pause();
            return;
        }
        if (hls === null || hls === void 0 ? void 0 : hls.liveSyncPosition)
            video.currentTime = hls.liveSyncPosition; // resume at the live edge, not where it paused
        video.play().catch(() => { });
    }
    playBtn.onclick = togglePlayback;
    fsBtn.onclick = fsTopBtn.onclick = toggleFullscreen;
    pipBtn.onclick = () => { var _a, _b; return (_b = (_a = (document.pictureInPictureElement ? document.exitPictureInPicture() : video.requestPictureInPicture())) === null || _a === void 0 ? void 0 : _a.catch) === null || _b === void 0 ? void 0 : _b.call(_a, () => toast('Picture in picture isn’t available')); };
    muteBtn.onclick = () => {
        video.muted = !video.muted;
        if (!video.muted && video.volume === 0)
            video.volume = 0.5;
        volumeState.m = video.muted;
        volumeState.v = video.volume || 0.5;
        store.set('volume', volumeState);
    };
    volInput.oninput = () => {
        const v = +volInput.value;
        video.volume = v;
        video.muted = v === 0;
        volumeState.m = v === 0;
        if (v > 0)
            volumeState.v = v;
        store.set('volume', volumeState);
    };
    for (const ev of ['play', 'pause', 'volumechange', 'emptied', 'webkitbeginfullscreen', 'webkitendfullscreen'])
        video.addEventListener(ev, syncPlayerUI);
    for (const ev of ['fullscreenchange', 'webkitfullscreenchange'])
        document.addEventListener(ev, () => {
            var _a, _b;
            if (!fsElement()) {
                try {
                    (_b = (_a = screen.orientation) === null || _a === void 0 ? void 0 : _a.unlock) === null || _b === void 0 ? void 0 : _b.call(_a);
                }
                catch ( /* ignore */_c) { /* ignore */ }
            }
            syncPlayerUI();
        });
    // Show a spinner while the stream is buffering (the first-load spinner is handled in play())
    video.addEventListener('waiting', () => { if (isLivePlayer() && current && msg.hidden) {
        msg.innerHTML = '<div class="spinner"></div>';
        msg.hidden = false;
    } });
    video.addEventListener('playing', () => { if (isLivePlayer() && msg.querySelector('.spinner') && !msg.querySelector('h3'))
        msg.hidden = true; });
    // Mouse: click plays/pauses, double-click is full screen. Touch: tap shows/hides the controls, double-tap is full screen,
    // swipe down closes the player.
    let pointerType = 'mouse', idleAtDown = false, tapTimer = 0, swipe = null;
    player.addEventListener('pointerdown', e => { pointerType = e.pointerType; idleAtDown = player.classList.contains('idle'); });
    video.addEventListener('click', () => {
        if (!isLivePlayer())
            return;
        if (!zapPanel.hidden) {
            closeZapPanel();
            return;
        } // a tap on the picture puts the channel list away
        if (tapTimer) {
            clearTimeout(tapTimer);
            tapTimer = 0;
            toggleFullscreen();
            return;
        }
        tapTimer = setTimeout(() => {
            tapTimer = 0;
            if (pointerType === 'touch')
                player.classList.toggle('idle', !idleAtDown);
            else
                togglePlayback();
        }, 250);
    });
    player.addEventListener('touchstart', e => {
        if (!isLivePlayer() || e.touches.length !== 1 || e.target.closest('.player-bar, .player-top, .player-msg, .zap-remote, .zap-panel')) {
            swipe = null;
            return;
        }
        swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now() };
    }, { passive: true });
    player.addEventListener('touchend', e => {
        if (!swipe)
            return;
        const t = e.changedTouches[0], dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
        if (dy > 110 && Math.abs(dx) < 70 && Date.now() - swipe.at < 700) {
            clearTimeout(tapTimer);
            tapTimer = 0;
            closePlayer();
        }
        swipe = null;
    }, { passive: true });
    function showPlayerHint() {
        const seen = store.get('hintSeen', 0);
        if (seen >= 3 || !('ontouchstart' in window))
            return;
        store.set('hintSeen', seen + 1);
        playerHint.textContent = 'Swipe down to close · double-tap for full screen';
        playerHint.hidden = false;
        clearTimeout(showPlayerHint.timer);
        showPlayerHint.timer = setTimeout(() => { playerHint.hidden = true; }, 4000);
    }
    // ---------------------------------------------------------------- modals
    const modal = $('#modal'), modalCard = $('#modalCard');
    const closeBtn = '<button class="icon-btn modal-close" data-act="close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button>';
    function openModal(html) { modalCard.innerHTML = closeBtn + html; modal.hidden = false; document.body.style.overflow = 'hidden'; }
    function closeModal() {
        modal.hidden = true;
        if (player.hidden) {
            document.body.style.overflow = '';
            if (pendingMovieRender) {
                pendingMovieRender = false;
                route();
            }
        }
    }
    // ---------------------------------------------------------------- backup & restore
    function exportData() {
        return __awaiter(this, void 0, void 0, function* () {
            const data = {
                app: 'streambox', version: 1, exported: new Date().toISOString(),
                mylist: myList(), history: store.get('history', []),
                settings: { showAll: settings.showAll, sources: settings.sources, guides: settings.guides },
            };
            yield saveFile('streambox-backup.json', 'application/json', JSON.stringify(data, null, 2));
        });
    }
    function importData(file) {
        return __awaiter(this, void 0, void 0, function* () {
            let data;
            try {
                data = JSON.parse(yield file.text());
            }
            catch (_a) {
                toast('That file isn’t valid JSON');
                return;
            }
            if ((data === null || data === void 0 ? void 0 : data.app) !== 'streambox') {
                toast('That isn’t a StreamBox backup');
                return;
            }
            // Only accept known item types and re-build each entry from whitelisted fields
            const clean = list => (Array.isArray(list) ? list : [])
                .filter(i => { var _a; return i && typeof i.key === 'string' && (i.type === 'live' || (i.type === 'movie' && (((_a = items.get(i.key)) === null || _a === void 0 ? void 0 : _a.type) === 'movie' || restoreMovie(i)))) && /^https?:\/\//.test(i.url || ''); })
                .map(i => snapshot(i.type === 'movie' ? (items.get(i.key) || restoreMovie(i)) : i));
            const merge = (a, b) => { const seen = new Set(a.map(i => i.key)); return [...a, ...b.filter(i => !seen.has(i.key))]; };
            store.set('mylist', merge(myList(), clean(data.mylist)).slice(0, 200));
            store.set('history', merge(store.get('history', []), clean(data.history)).slice(0, 30));
            const s = data.settings || {};
            for (const k of ['sources', 'guides']) {
                const incoming = (Array.isArray(s[k]) ? s[k] : []).filter(u => typeof u === 'string' && /^https:\/\//.test(u));
                settings[k] = [...new Set([...settings[k], ...incoming])];
            }
            saveSettings();
            toast('Backup imported — reloading…');
            setTimeout(() => location.reload(), 700);
        });
    }
    function showChannel(item) {
        const reason = item.needsHeaders
            ? 'it needs custom HTTP headers (a user-agent or referrer) that web browsers can’t send'
            : item.noCors ? 'its server doesn’t allow web pages to read it (it sends no CORS headers)'
                : 'it streams over insecure http://, which browsers block on secure sites';
        openModal(`
      <div class="modal-hero" style="--tile:${tileColor(item.name)}"><div class="inner"><h2>${esc(item.name)}</h2></div></div>
      <div class="modal-body">
        <div class="facts"><span>${esc(item.cat)}</span>${item.quality ? `<span>${esc(item.quality)}</span>` : ''}${item.source ? `<span>${esc(item.source)}</span>` : ''}</div>
        <p>This channel can’t play inside a browser: ${reason}. VLC can play it.</p>
        <div class="hero-actions" style="margin:14px 0">${vlcButtons(item)}</div>
        <p style="color:var(--muted);font-size:13px">Want it to play inside StreamBox? <button class="btn btn-more" data-act="opensettings" style="font-size:12px;padding:4px 10px;margin-left:6px">Set up the stream proxy</button></p>
        ${item.ua || item.rf ? '<p style="color:var(--muted);font-size:13px">The .m3u file includes the headers this channel needs, so use it if the direct link fails.</p>' : ''}
        <div class="hero-actions" style="margin-top:12px">
          ${item.needsHeaders && item.url.startsWith('https://') ? `<button class="btn btn-more" data-act="tryweb" data-key="${esc(item.key)}" style="font-size:13px;padding:6px 12px">Try in browser anyway</button>` : ''}
          <button class="btn btn-more" data-act="fav" data-key="${esc(item.key)}" style="font-size:13px;padding:6px 12px">${inMyList(item.key) ? '✓ In My List' : '+ My List'}</button>
        </div>
        <h3>Don’t have VLC?</h3>
        <p><a href="${VLC_STORES.ios}" target="_blank" rel="noopener noreferrer" style="color:var(--gold)">iPhone / iPad</a> ·
           <a href="${VLC_STORES.android}" target="_blank" rel="noopener noreferrer" style="color:var(--gold)">Android</a> ·
           <a href="${VLC_STORES.desktop}" target="_blank" rel="noopener noreferrer" style="color:var(--gold)">Windows / Mac / Linux</a></p>
      </div>`);
    }
    function movieUpdateText(status) {
        return status.message + (status.checkedAt ? ' Last updated: ' + new Date(status.checkedAt).toLocaleString() : '');
    }
    // ---- Face ID / fingerprint sign-in (passkeys): the section in Settings, and a one-time offer after signing in
    function renderPasskeys() {
        return __awaiter(this, void 0, void 0, function* () {
            const box = $('#passkeyBox');
            if (!box)
                return;
            const pk = window.StreamBoxPasskey;
            if (!pk.supported()) {
                box.innerHTML = '<p style="color:var(--muted)">This browser doesn’t support Face ID or fingerprint sign-in.</p>';
                return;
            }
            const [can, mine] = yield Promise.all([pk.available(), pk.list().catch(() => null)]);
            if (!$('#passkeyBox'))
                return;
            if (mine === null) {
                box.innerHTML = '<p style="color:var(--muted)">Face ID sign-in isn’t available right now.</p>';
                return;
            }
            const when = t => new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
            box.innerHTML = `<p style="color:var(--muted)">Sign in with your face or fingerprint instead of typing your password. Your face or fingerprint never leaves this device: it only unlocks a key that proves it’s you.</p>
      <ul class="src-list">${mine.map(p => `<li><span>${esc(p.label)} · added ${esc(when(p.at))}</span><button class="btn btn-more" style="padding:4px 10px;font-size:12px" data-act="pkremove" data-id="${esc(p.id)}">Remove</button></li>`).join('') || '<li><span style="color:var(--muted)">Not set up on any device yet.</span></li>'}</ul>
      ${can ? '<button class="btn btn-red" data-act="pkadd" style="font-size:14px;padding:8px 16px">Set up on this device</button>' : '<p style="color:var(--muted);font-size:13px">This device has no Face ID, Touch ID, fingerprint or Windows Hello set up, so it can’t be added here.</p>'}`;
        });
    }
    function setUpPasskey(button) {
        return __awaiter(this, void 0, void 0, function* () {
            if (button)
                button.disabled = true;
            try {
                const saved = yield window.StreamBoxPasskey.setUp();
                toast(`Face ID / fingerprint sign-in is on for this ${saved.label || 'device'}`);
                if ($('#passkeyBox'))
                    renderPasskeys();
                else
                    closeModal();
            }
            catch (e) {
                if (e.message !== 'Cancelled')
                    toast(e.message);
                if (button)
                    button.disabled = false;
                if (e.message === 'This device is already set up' && $('#passkeyBox'))
                    renderPasskeys();
            }
        });
    }
    // Offered once per device, a moment after the app opens, to someone who signed in with their password
    function offerPasskey() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const pk = window.StreamBoxPasskey;
            if (!((_a = window.StreamBoxAccount) === null || _a === void 0 ? void 0 : _a.enabled) || pk.known || store.get('passkeyAsked', false) || !(yield pk.available()))
                return;
            if (!player.hidden || !modal.hidden)
                return;
            store.set('passkeyAsked', true);
            openModal(`<div class="modal-body" style="padding-top:28px"><h2>Sign in with your face next time?</h2>
      <p style="color:var(--muted);line-height:1.5;margin:10px 0 18px">Use Face ID, Touch ID or your fingerprint on this device instead of typing your password. You can change this any time in Settings.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-red" data-act="pkadd">Set it up</button><button class="btn btn-more" data-act="pklater">Not now</button></div></div>`);
        });
    }
    (_c = (_b = window.StreamBoxAccount) === null || _b === void 0 ? void 0 : _b.ready) === null || _c === void 0 ? void 0 : _c.then(() => setTimeout(offerPasskey, 2500));
    function showSettings() {
        var _a;
        openModal(`
      <div class="modal-body" style="padding-top:28px">
        <h2 style="font-size:24px;margin-bottom:6px">Settings</h2>
        ${((_a = window.StreamBoxAccount) === null || _a === void 0 ? void 0 : _a.enabled) ? `<h3>Account</h3>
        <p style="color:var(--muted)">Signed in as <b style="color:#fff">${esc(window.StreamBoxAccount.user)}</b>. Your My List, Continue Watching and your place in your own videos are saved to your account and follow you to your other devices.</p>
        <button class="btn btn-more" data-act="signout" style="font-size:13px;padding:6px 12px">Sign out</button>
        <h3>Face ID / fingerprint sign-in</h3>
        <div id="passkeyBox"><p style="color:var(--muted)">Checking this device…</p></div>` : ''}
        <h3>Movie updates</h3>
        <p>Checks for new movies on launch and once a day while the app is open. Saved titles stay available offline.</p>
        <p id="movieUpdateStatus" role="status" style="color:var(--muted)">${esc(movieUpdateText(movies.updates.status))}</p>
        <button class="btn btn-more" data-act="refreshmovies" style="font-size:13px;padding:6px 12px">Check for new movies</button>
        <h3>TV &amp; remote control</h3>
        <div class="form-row" style="align-items:center"><label for="optTv" style="flex:1">TV mode (large text, remote-control navigation)</label><select id="optTv" style="padding:8px 10px;border-radius:8px">
          ${['auto', 'on', 'off'].map(m => { var _a, _b; return `<option value="${m}"${(((_a = window.StreamBoxTV) === null || _a === void 0 ? void 0 : _a.mode) || 'auto') === m ? ' selected' : ''}>${m === 'auto' ? `Automatic (${((_b = window.StreamBoxTV) === null || _b === void 0 ? void 0 : _b.detected) ? 'TV found' : 'not a TV'})` : m === 'on' ? 'On' : 'Off'}</option>`; }).join('')}</select></div>
        <p style="color:var(--muted);font-size:13px">With a remote or keyboard: arrows move, OK/Enter selects, Back closes or goes back, and the play/pause, rewind, fast-forward and skip buttons control what is playing.</p>
        <h3>Full screen &amp; AirPlay</h3>
        <label><input type="checkbox" id="optAutoFs" ${settings.autoFullscreen ? 'checked' : ''}> Open channels in full screen</label>
        <p style="color:var(--muted);font-size:13px">While watching: tap the full-screen button, double-tap or double-click the picture, or press <b>F</b>. ${IS_IOS ? 'On iPhone full screen uses the built-in video player.' : ''}</p>
        <p style="color:var(--muted);font-size:13px"><b>AirPlay</b> button appears in the player when an Apple TV or AirPlay speaker is on the same Wi-Fi. It works in Safari on iPhone, iPad and Mac (Chrome and Edge can’t AirPlay). Channels that play through your proxy or need VLC can’t be sent.</p>
        <h3>Channels</h3>
        <label><input type="checkbox" id="optShowAll" ${settings.showAll ? 'checked' : ''}> Show channels that only play in VLC (http:// or header-protected)</label>
        <label><input type="checkbox" id="optAutoVlc" ${settings.autoVlc ? 'checked' : ''}> On iPhone/Android, open those channels in VLC automatically</label>
        <h3>Stream proxy (play every channel inside the app)</h3>
        <p style="color:var(--muted)">Some channels can’t load in a browser (no CORS headers, plain http://, or required headers). A StreamBox proxy that you host fixes that. See <code>proxy/</code> in the repo. ${hasProxy() ? `<b style="color:var(--green)">Proxy set.</b>` : ''}</p>
        <div class="form-row"><input type="url" id="proxyInput" placeholder="https://your-proxy.example.com" value="${esc(settings.proxyUrl)}"><button class="btn btn-more" data-act="localproxy" style="padding:8px 12px;font-size:13px" title="Run: npm run proxy">This computer</button></div>
        <div class="form-row"><input type="text" id="proxyToken" placeholder="Token (optional, if your proxy uses PROXY_TOKEN)" value="${esc(settings.proxyToken)}" autocomplete="off" spellcheck="false"><button class="btn btn-red" data-act="saveproxy" style="padding:8px 16px">Save</button>${hasProxy() ? '<button class="btn btn-more" data-act="clearproxy" style="padding:8px 16px">Remove</button>' : ''}</div>
        <label><input type="checkbox" id="optHideBad" ${settings.hideBad ? 'checked' : ''}> Hide channels that failed to play on this device (for 12 hours)</label>
        <label><input type="checkbox" id="optAutoSkip" ${settings.autoSkip ? 'checked' : ''}> When a channel won’t load, go to the next one by itself</label>
        <button class="btn btn-more" data-act="resetbad" style="font-size:13px;padding:6px 12px">Show hidden channels again (${Object.keys(bad).length})</button>
        <h3>Artwork for movies &amp; series</h3>
        <p style="color:var(--muted)">${artworkKey() ? `Using your own TMDB key (ends …${esc(artworkKey().slice(-4))}), stored only on this device.` : 'Artwork is on, using the key built into StreamBox. You can use your own TMDB API key instead (themoviedb.org → Settings → API).'}</p>
        <div class="form-row"><input type="text" id="artInput" placeholder="Your own TMDB API key (optional)" autocomplete="off" spellcheck="false"><button class="btn btn-red" data-act="saveart" style="padding:8px 16px">Save</button>${artworkKey() ? '<button class="btn btn-more" data-act="clearart" style="padding:8px 16px">Use built-in key</button>' : ''}</div>
        <p style="color:#777;font-size:12px;margin-top:8px">This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        <h3>Playlists (M3U)</h3>
        <p style="color:var(--muted)">Add any M3U/M3U8 playlist URL. It must be https and allow cross-origin requests.</p>
        <ul class="src-list">${settings.sources.map((s, i) => `<li><span>${esc(s)}</span><button class="btn btn-more" style="padding:4px 10px;font-size:12px" data-act="rmsrc" data-i="${i}">Remove</button></li>`).join('') || '<li><span style="color:var(--muted)">No extra playlists.</span></li>'}</ul>
        <div class="form-row"><input type="url" id="srcInput" placeholder="https://example.com/playlist.m3u"><button class="btn btn-red" data-act="addsrc" style="padding:8px 16px">Add</button></div>
        <p style="color:var(--muted);font-size:13px;margin-top:8px">The iptv-org list is already built in and is refreshed every time the site is deployed.</p>
        <h3>TV guide (XMLTV)</h3>
        <p style="color:var(--muted)">Adds “Now / Next” to channels. Guides listed in your M3U playlists are picked up automatically. ${guide.byId.size ? `<b>${guide.byId.size}</b> channels with guide data loaded.` : ''} URLs must be https and allow cross-origin requests; .xml and .xml.gz both work.</p>
        <div class="form-row" style="align-items:center;margin-bottom:10px"><label for="optAuGuide" style="flex:1">Australian TV guide (built in)</label><select id="optAuGuide" style="padding:8px 10px;border-radius:8px">${window.StreamBoxGuide.CITIES.map(c => `<option${c === settings.auGuide ? ' selected' : ''}>${c}</option>`).join('')}<option value="off"${window.StreamBoxGuide.url(settings.auGuide) ? '' : ' selected'}>Off</option></select></div>
        <ul class="src-list">${settings.guides.map((s, i) => `<li><span>${esc(s)}</span><button class="btn btn-more" style="padding:4px 10px;font-size:12px" data-act="rmguide" data-i="${i}">Remove</button></li>`).join('') || '<li><span style="color:var(--muted)">No guide URLs added.</span></li>'}</ul>
        <div class="form-row"><input type="url" id="guideInput" placeholder="https://example.com/guide.xml"><button class="btn btn-red" data-act="addguide" style="padding:8px 16px">Add</button></div>
        <h3>Backup &amp; restore</h3>
        <p style="color:var(--muted)">Move My List, watch history and playlists between your phone and laptop.</p>
        <div class="form-row">
          <button class="btn btn-more" data-act="export" style="font-size:13px;padding:6px 12px">Export backup</button>
          <button class="btn btn-more" data-act="import" style="font-size:13px;padding:6px 12px">Import backup</button>
          <input type="file" id="importFile" accept="application/json,.json" hidden>
        </div>
        <h3>Data</h3>
        <button class="btn btn-more" data-act="clearhist" style="font-size:13px;padding:6px 12px">Clear watch history</button>
        <h3>Download the app</h3>
        ${isInstalled() ? '<p style="color:var(--green)">StreamBox is installed on this device ✓</p>' : '<button class="btn btn-red" data-act="install" style="font-size:13px;padding:6px 12px">Download StreamBox</button>'}
        ${IN_ANDROID_APP ? '' : `<p style="margin-top:12px"><b>Android phones, tablets &amp; Android TV:</b> <a href="${APK_URL}" style="color:var(--text);text-decoration:underline">download the Android app (APK)</a>. Open the file when it has downloaded and choose <i>Install</i> (allow your browser to install apps if Android asks). On a TV, open the <b>Downloader</b> app and enter <code>${esc(location.origin)}${APK_URL}</code>.</p>`}
        <p style="margin-top:8px"><b>iPhone / iPad:</b> open in Safari → Share → <i>Add to Home Screen</i>.<br><b>Android:</b> the app above, or open in Chrome → ⋮ menu → <i>Install app</i>.<br><b>Windows / Mac:</b> open in Chrome or Edge → install icon in the address bar.</p>
      </div>`);
        renderPasskeys();
    }
    const artworkKey = () => (/^[a-f0-9]{32}$/i.test(settings.tmdbKey || '') ? settings.tmdbKey : '');
    function saveArtworkKey(key) {
        var _a;
        if (!/^[a-f0-9]{32}$/i.test(key)) {
            toast(key.startsWith('eyJ') ? 'That’s a v4 token. Use the 32-character “API Key” (v3).' : 'TMDB API keys are 32 characters long.');
            return;
        }
        settings.tmdbKey = key;
        saveSettings();
        (_a = window.StreamBoxArt) === null || _a === void 0 ? void 0 : _a.reload();
        closeModal();
        toast('Artwork on');
        route();
    }
    function saveProxy(url, token) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!/^https?:\/\//.test(url)) {
                toast('Proxy URL must start with https://');
                return;
            }
            const prev = { u: settings.proxyUrl, t: settings.proxyToken };
            settings.proxyUrl = url;
            settings.proxyToken = token;
            if (!hasProxy()) {
                Object.assign(settings, { proxyUrl: prev.u, proxyToken: prev.t });
                toast('An https page needs an https:// proxy');
                return;
            }
            try {
                const res = yield fetch(`${url}/health`);
                if (!res.ok)
                    throw new Error(res.status);
            }
            catch (_a) {
                Object.assign(settings, { proxyUrl: prev.u, proxyToken: prev.t });
                toast('Couldn’t reach that proxy (is it running, and does it allow this site?)');
                return;
            }
            saveSettings();
            Object.keys(bad).forEach(k => delete bad[k]);
            store.set('bad', bad); // earlier failures may work now
            toast('Proxy connected ✓');
            closeModal();
            route();
        });
    }
    function addGuide(url) {
        if (!/^https:\/\//.test(url)) {
            toast('Guide URL must start with https://');
            return;
        }
        if (settings.guides.includes(url)) {
            toast('Already added');
            return;
        }
        settings.guides.push(url);
        saveSettings();
        toast('Guide added — reloading…');
        setTimeout(() => location.reload(), 700);
    }
    function addSource(url) {
        if (!/^https:\/\//.test(url)) {
            toast('Playlist URL must start with https://');
            return;
        }
        if (settings.sources.includes(url)) {
            toast('Already added');
            return;
        }
        settings.sources.push(url);
        saveSettings();
        toast('Playlist added — reloading…');
        setTimeout(() => location.reload(), 700);
    }
    // ---------------------------------------------------------------- install (download the app)
    // Chrome/Edge/Android hand us an install prompt; iOS Safari has no prompt, so we show the steps instead.
    let installPrompt = null;
    const isInstalled = () => IN_ANDROID_APP || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const installBtn = $('#installBtn');
    const refreshInstallBtn = () => { installBtn.hidden = isInstalled() || !(installPrompt || IS_IOS || IS_ANDROID); }; // Android: the APK is always on offer
    addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; refreshInstallBtn(); });
    addEventListener('appinstalled', () => { installPrompt = null; refreshInstallBtn(); toast('StreamBox installed ✓'); });
    function installApp() {
        return __awaiter(this, void 0, void 0, function* () {
            if (isInstalled()) {
                toast('StreamBox is already installed');
                return;
            }
            if (installPrompt && !IS_ANDROID) { // on Android the window below offers the APK first
                const prompt = installPrompt;
                installPrompt = null;
                prompt.prompt();
                const { outcome } = yield prompt.userChoice.catch(() => ({}));
                if (outcome !== 'accepted')
                    installPrompt = prompt;
                refreshInstallBtn();
                return;
            }
            openModal(`
      <div class="modal-body" style="padding-top:28px">
        <h2 style="font-size:24px;margin-bottom:6px">Download StreamBox</h2>
        <p style="color:var(--muted)">StreamBox installs straight from your browser — no app store needed. It opens full-screen with its own icon.</p>
        ${IS_IOS ? `<h3>iPhone / iPad</h3>
        <p>1. Open this page in <b>Safari</b>.<br>2. Tap the <b>Share</b> button (the square with an arrow).<br>3. Choose <i>Add to Home Screen</i>, then <i>Add</i>.</p>` : `<h3>Android phones, tablets &amp; Android TV</h3>
        <p><a class="btn btn-red" href="${APK_URL}" style="font-size:15px;padding:8px 16px">Download the Android app (APK)</a></p>
        <p>Open the downloaded file and choose <i>Install</i>. If Android asks, allow your browser to install apps (Settings → Apps → Special app access → <i>Install unknown apps</i>).<br>On <b>Android TV</b>: install the free <b>Downloader</b> app from the Play Store, open it and enter <code>${esc(location.origin)}${APK_URL}</code>.<br>Or, without the APK: open this page in <b>Chrome</b> → ⋮ menu → <i>Install app</i>.</p>
        <h3>Windows / Mac / Linux</h3>
        <p>Open this page in <b>Chrome</b> or <b>Edge</b> → click the install icon at the right of the address bar (or ⋮ menu → <i>Install StreamBox</i>).</p>
        <h3>iPhone / iPad</h3>
        <p>Open this page in <b>Safari</b> → Share → <i>Add to Home Screen</i>.</p>`}
      </div>`);
        });
    }
    installBtn.onclick = installApp;
    refreshInstallBtn();
    // ---------------------------------------------------------------- events
    document.addEventListener('click', e => {
        var _a, _b, _c, _d, _e;
        const act = e.target.closest('[data-act]');
        if (act) {
            const a = act.dataset.act;
            const item = items.get(act.dataset.key);
            if (a === 'close')
                closeModal();
            else if (a === 'movieplay' && (item === null || item === void 0 ? void 0 : item.type) === 'movie') {
                closeModal();
                play(item);
            }
            else if (a === 'fav' && item) {
                toggleMyList(item);
                act.textContent = inMyList(item.key) ? '✓ In My List' : '+ My List';
            }
            else if (a === 'next')
                step(1);
            else if (a === 'copy')
                (_a = navigator.clipboard) === null || _a === void 0 ? void 0 : _a.writeText((item === null || item === void 0 ? void 0 : item.url) || (current === null || current === void 0 ? void 0 : current.url) || '').then(() => toast('Stream URL copied'));
            else if (a === 'vlcfile' && item)
                saveFile(`${oneLine(item.name).replace(/[^\w.-]+/g, '_')}.m3u`, 'audio/x-mpegurl', buildM3U([item]));
            else if (a === 'tryweb' && item) {
                closeModal();
                play(item, [], true);
            }
            else if (a === 'vlcpl')
                exportVlcList();
            else if (a === 'addsrc')
                addSource($('#srcInput').value.trim());
            else if (a === 'rmsrc') {
                settings.sources.splice(+act.dataset.i, 1);
                saveSettings();
                location.reload();
            }
            else if (a === 'refreshmovies')
                movies.updates.refresh({ force: true });
            else if (a === 'clearhist') {
                store.set('history', []);
                toast('History cleared');
            }
            else if (a === 'opensettings')
                showSettings();
            else if (a === 'pkadd')
                setUpPasskey(act);
            else if (a === 'pkremove') {
                act.disabled = true;
                window.StreamBoxPasskey.remove(act.dataset.id).then(() => { toast('Removed'); renderPasskeys(); }).catch(e => { toast(e.message); act.disabled = false; });
            }
            else if (a === 'pklater')
                closeModal();
            else if (a === 'signout') {
                toast('Signing out…');
                Promise.resolve((_b = window.StreamBoxAccount) === null || _b === void 0 ? void 0 : _b.flush()).finally(() => { location.href = '/__gate/logout'; });
            }
            else if (a === 'saveart')
                saveArtworkKey($('#artInput').value.trim());
            else if (a === 'clearart') {
                settings.tmdbKey = '';
                saveSettings();
                (_c = window.StreamBoxArt) === null || _c === void 0 ? void 0 : _c.reload();
                toast('Using the built-in key');
                route();
                showSettings();
            }
            else if (a === 'movysetup' && (current === null || current === void 0 ? void 0 : current.catalog) === 'movy') {
                (_d = window.StreamBoxMovySetup) === null || _d === void 0 ? void 0 : _d.open({ record: current, season: Number.isInteger(current.season) ? current.season : 1, episode: Number.isInteger(current.episode) ? current.episode : 1 });
            }
            else if (a === 'movybrowser' && current) {
                const item = current;
                closePlayer();
                let url = null;
                try {
                    url = movy.playerUrl(item, Number.isInteger(item.season) ? item.season : 1, Number.isInteger(item.episode) ? item.episode : 1);
                }
                catch ( /* fall back to Movy home */_f) { /* fall back to Movy home */ }
                (_e = window.StreamBoxMovyBrowser) === null || _e === void 0 ? void 0 : _e.open(url || window.StreamBoxMovyBrowser.HOME, item.name);
            }
            else if (a === 'proxysetup') {
                closePlayer();
                showSettings();
            }
            else if (a === 'localproxy')
                $('#proxyInput').value = 'http://localhost:8787';
            else if (a === 'saveproxy')
                saveProxy($('#proxyInput').value.trim().replace(/\/+$/, ''), $('#proxyToken').value.trim());
            else if (a === 'clearproxy') {
                settings.proxyUrl = settings.proxyToken = '';
                saveSettings();
                toast('Proxy removed');
                route();
                showSettings();
            }
            else if (a === 'resetbad') {
                Object.keys(bad).forEach(k => delete bad[k]);
                store.set('bad', bad);
                toast('Hidden channels restored');
                route();
                showSettings();
            }
            else if (a === 'guidereload')
                location.reload();
            else if (a === 'addguide')
                addGuide($('#guideInput').value.trim());
            else if (a === 'rmguide') {
                settings.guides.splice(+act.dataset.i, 1);
                saveSettings();
                location.reload();
            }
            else if (a === 'export')
                exportData();
            else if (a === 'install')
                installApp();
            else if (a === 'import')
                $('#importFile').click();
            return;
        }
        const prog = e.target.closest('[data-epg]');
        if (prog) {
            const [id, start] = prog.dataset.epg.split('|');
            const p = (guide.byId.get(id) || []).find(x => x.start === +start);
            if (p)
                openModal(window.StreamBoxGuide.detailHTML(guide.names.get(id) || id, p));
            return;
        }
        const card = e.target.closest('[data-key]');
        if (card) {
            const item = items.get(card.dataset.key);
            if (!item)
                return;
            if (item.catalog === 'movy') {
                location.hash = 'movy/detail/' + item.mediaType + '/' + item.id;
                return;
            }
            if (item.type === 'movie')
                return openModal(movies.detail(item, inMyList(item.key)));
            if (item.isPlaylist)
                return addSource(item.url.replace(/^http:/, 'https:'));
            if (!isPlayable(item))
                return openVlcChannel(item);
            const siblings = [...card.parentElement.querySelectorAll('[data-key]')].map(el => items.get(el.dataset.key)).filter(i => (i === null || i === void 0 ? void 0 : i.type) === 'live');
            return play(item, siblings);
        }
        const arrow = e.target.closest('.row-arrow');
        if (arrow) {
            const track = arrow.parentElement.querySelector('.row-track');
            track.scrollBy({ left: (arrow.classList.contains('left') ? -1 : 1) * track.clientWidth * 0.9, behavior: 'smooth' });
        }
    });
    modal.addEventListener('click', e => { if (e.target === modal)
        closeModal(); });
    modal.addEventListener('change', e => {
        var _a, _b;
        if (e.target.id === 'optShowAll') {
            settings.showAll = e.target.checked;
            saveSettings();
            route();
        }
        else if (e.target.id === 'optAuGuide') {
            settings.auGuide = e.target.value;
            saveSettings();
            location.reload();
        }
        else if (e.target.id === 'optAutoVlc') {
            settings.autoVlc = e.target.checked;
            saveSettings();
        }
        else if (e.target.id === 'optTv') {
            (_a = window.StreamBoxTV) === null || _a === void 0 ? void 0 : _a.set(e.target.value);
            toast(((_b = window.StreamBoxTV) === null || _b === void 0 ? void 0 : _b.on) ? 'TV mode on' : 'TV mode off');
        }
        else if (e.target.id === 'optAutoFs') {
            settings.autoFullscreen = e.target.checked;
            saveSettings();
        }
        else if (e.target.id === 'optAutoSkip') {
            settings.autoSkip = e.target.checked;
            saveSettings();
        }
        else if (e.target.id === 'optHideBad') {
            settings.hideBad = e.target.checked;
            saveSettings();
            route();
        }
        else if (e.target.id === 'importFile' && e.target.files[0])
            importData(e.target.files[0]);
    });
    $('#playerClose').onclick = closePlayer;
    $('#playerPrev').onclick = () => step(-1);
    $('#playerNext').onclick = () => step(1);
    player.addEventListener('pointermove', wakeControls);
    player.addEventListener('touchstart', wakeControls, { passive: true });
    // Add the current channel to My List from inside the player
    const favBtn = document.createElement('button');
    favBtn.className = 'icon-btn';
    favBtn.title = 'My List';
    favBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
    favBtn.onclick = () => current && toggleMyList(current);
    $('.player-nav').prepend(favBtn);
    // ---------------------------------------------------------------- subtitles
    // A CC button in the live player. With one choice it switches subtitles on and off; with several it opens a short
    // menu. The choice is remembered (Settings aren't needed) and applied to the next channel that has subtitles.
    const subsBtn = $('#playerSubs'), subsMenu = $('#subsMenu');
    const subsPref = Object.assign({ on: false, lang: '' }, store.get('subs', {}));
    const saveSubsPref = () => store.set('subs', subsPref);
    const ICON_CC = '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10.5 10.2a2.2 2.2 0 1 0 0 3.6M17 10.2a2.2 2.2 0 1 0 0 3.6" stroke-width="1.8"/></svg>';
    const subOptions = () => window.StreamBoxSubs.listOptions({ hlsTracks: (hls === null || hls === void 0 ? void 0 : hls.subtitleTracks) || [], textTracks: video.textTracks, hlsActive: !!hls });
    const subIsOn = o => (o.source === 'hls' ? (hls === null || hls === void 0 ? void 0 : hls.subtitleTrack) === o.id && (hls === null || hls === void 0 ? void 0 : hls.subtitleDisplay) !== false : o.track.mode === 'showing');
    function setSubtitle(option) {
        for (const t of Array.from(video.textTracks))
            if (t.kind === 'subtitles' || t.kind === 'captions') {
                if (t.mode === 'showing')
                    t.mode = 'disabled';
            }
        if (hls) {
            hls.subtitleDisplay = !!option && option.source === 'hls';
            hls.subtitleTrack = (option === null || option === void 0 ? void 0 : option.source) === 'hls' ? option.id : -1;
        }
        if ((option === null || option === void 0 ? void 0 : option.source) === 'text')
            option.track.mode = 'showing';
        syncSubsUI();
    }
    // Make what is showing match what the person chose (tracks can appear after the stream starts)
    function applySubs() {
        if (!isLivePlayer())
            return;
        setSubtitle(window.StreamBoxSubs.preferred(subOptions(), subsPref));
    }
    function syncSubsUI() {
        const options = subOptions(), on = options.find(subIsOn);
        subsBtn.innerHTML = ICON_CC;
        subsBtn.classList.toggle('on', !!on);
        subsBtn.setAttribute('aria-pressed', String(!!on));
        subsBtn.title = on ? `Subtitles: ${on.label} (C)` : 'Subtitles (C)';
        if (!subsMenu.hidden)
            renderSubsMenu(options);
    }
    function renderSubsMenu(options = subOptions()) {
        subsMenu.innerHTML = `<button type="button" role="menuitemradio" aria-checked="${!options.some(subIsOn)}" data-sub="-1">Off</button>${options.map((o, i) => `<button type="button" role="menuitemradio" aria-checked="${subIsOn(o)}" data-sub="${i}">${esc(o.label)}</button>`).join('')}`;
    }
    function closeSubsMenu() { if (subsMenu.hidden)
        return; subsMenu.hidden = true; subsBtn.setAttribute('aria-expanded', 'false'); }
    function chooseSubtitle(option) {
        subsPref.on = !!option;
        if (option === null || option === void 0 ? void 0 : option.lang)
            subsPref.lang = option.lang;
        saveSubsPref();
        setSubtitle(option);
        toast(option ? `Subtitles on: ${option.label}` : 'Subtitles off');
    }
    function toggleSubtitles() {
        const options = subOptions();
        if (!options.length) {
            toast('No subtitles found on this channel');
            return;
        }
        chooseSubtitle(options.some(subIsOn) ? null : window.StreamBoxSubs.preferred(options, { on: true, lang: subsPref.lang }));
    }
    subsBtn.onclick = e => {
        var _a;
        e.stopPropagation();
        const options = subOptions();
        if (!options.length) {
            toast('No subtitles found on this channel');
            return;
        }
        if (options.length === 1) {
            toggleSubtitles();
            return;
        }
        subsMenu.hidden = !subsMenu.hidden;
        subsBtn.setAttribute('aria-expanded', String(!subsMenu.hidden));
        if (!subsMenu.hidden) {
            renderSubsMenu(options);
            (_a = subsMenu.querySelector('[aria-checked=true]')) === null || _a === void 0 ? void 0 : _a.focus();
            wakeControls();
        }
    };
    subsMenu.addEventListener('click', e => {
        const b = e.target.closest('[data-sub]');
        if (!b)
            return;
        const i = +b.dataset.sub;
        chooseSubtitle(i < 0 ? null : subOptions()[i]);
        closeSubsMenu();
        subsBtn.focus({ preventScroll: true });
    });
    document.addEventListener('click', e => { if (!subsMenu.hidden && !e.target.closest('#subsMenu, #playerSubs'))
        closeSubsMenu(); });
    (_e = (_d = video.textTracks).addEventListener) === null || _e === void 0 ? void 0 : _e.call(_d, 'addtrack', applySubs);
    (_g = (_f = video.textTracks).addEventListener) === null || _g === void 0 ? void 0 : _g.call(_f, 'removetrack', syncSubsUI);
    (_j = (_h = video.textTracks).addEventListener) === null || _j === void 0 ? void 0 : _j.call(_h, 'change', syncSubsUI);
    syncSubsUI();
    // ---------------------------------------------------------------- channel remote
    // Live channels are grouped by country. Up/down changes channel, left/right changes country, a number goes
    // straight to that channel, and the list (OK / Enter) shows every country and channel to pick from.
    let zapCache = { key: '', groups: [] };
    function zapGroups() {
        const key = `${channels.length}|${settings.showAll}|${settings.proxyUrl}`;
        if (zapCache.key !== key) {
            const list = channels.filter(c => !c.isPlaylist && (settings.showAll || (isPlayable(c) && !c.dead)))
                .sort((a, b) => (b.verified | 0) - (a.verified | 0));
            zapCache = { key, groups: window.StreamBoxZap.groupChannels(list, countryName, HOME_CC) };
        }
        return zapCache.groups;
    }
    const zap = window.StreamBoxZap.createZapper({ groups: zapGroups, usable: c => isPlayable(c) && !isBad(c) });
    const zapPanel = $('#zapPanel'), zapCountries = $('#zapCountries'), zapList = $('#zapList'), zapBanner = $('#zapBanner');
    let browseCc = '', bannerTimer = 0;
    function showBanner(html, ms = 3200) {
        clearTimeout(bannerTimer);
        zapBanner.innerHTML = html;
        zapBanner.hidden = false;
        if (ms)
            bannerTimer = setTimeout(() => { zapBanner.hidden = true; }, ms);
    }
    const hideBanner = () => { clearTimeout(bannerTimer); zapBanner.hidden = true; };
    function channelBanner(item) {
        var _a;
        const g = (_a = guideFor(item)) === null || _a === void 0 ? void 0 : _a.now;
        const note = skip.count && skip.notes.length ? `<span class="zap-skip">Skipped ${esc(skip.notes.slice(-2).join(', '))}${skip.notes.length > 2 ? ` and ${skip.notes.length - 2} more` : ''}: not working</span>` : '';
        showBanner(`<b class="zap-num">${zap.number(item) || ''}</b><span class="zap-info">
      <strong>${esc(item.name)}</strong>
      <span>${item.cc ? flagImg(item.cc, 'flag') : ''}${esc(item.cc ? countryName(item.cc) : 'International / Other')}</span>
      ${g ? `<span class="zap-now">Now: ${esc(g.title)}</span>` : ''}${note}</span>`, note ? 5000 : 3200);
    }
    const digits = window.StreamBoxZap.createDigits(text => (text ? showBanner(`<b class="zap-num">${esc(text)}</b><span class="zap-info"><span>Go to channel…</span></span>`, 0) : hideBanner()), n => {
        const ch = current && zap.byNumber(current, n);
        if (ch)
            play(ch);
        else
            showBanner(`<b class="zap-num">${n}</b><span class="zap-info"><span>No channel ${n} in ${esc((current === null || current === void 0 ? void 0 : current.cc) ? countryName(current.cc) : 'this group')}</span></span>`);
    });
    function countryStep(dir) {
        const next = current && zap.country(current, dir);
        if (next)
            play(next);
        else
            toast('There’s only one country to choose from');
    }
    function lastChannel() {
        const last = zap.last();
        if (last && isPlayable(last))
            play(last);
        else
            toast('No previous channel yet');
    }
    // ---- the channel list
    const zapRow = (c, i, on) => {
        var _a;
        const g = (_a = guideFor(c)) === null || _a === void 0 ? void 0 : _a.now;
        return `<button class="zap-row${on ? ' on' : ''}" type="button" role="option" aria-selected="${on}" data-zap="${i}">
      <span class="zap-n">${i + 1}</span>
      <span class="zap-logo">${c.logo ? `<img loading="lazy" src="${esc(c.logo)}" alt="" onerror="this.remove()">` : ''}<i>${esc(initials(c.name))}</i></span>
      <span class="zap-txt"><span class="zap-name">${esc(c.name)}</span><span class="zap-meta">${esc(g ? `Now: ${g.title}` : [c.quality, c.cat].filter(Boolean).join(' · '))}</span></span>
      ${on ? '<span class="zap-live" aria-label="Playing now">▶</span>' : ''}</button>`;
    };
    let browseList = [];
    function centerChip() {
        const chip = zapCountries.querySelector('.active');
        if (chip)
            zapCountries.scrollLeft = chip.offsetLeft - (zapCountries.clientWidth - chip.offsetWidth) / 2;
    }
    function renderZapPanel({ scroll = true } = {}) {
        if (!current || zapPanel.hidden)
            return;
        const groups = zap.countries(current);
        if (!groups.some(g => g.cc === browseCc))
            browseCc = current.cc || '';
        zapCountries.innerHTML = groups.map(g => `<button class="zap-ctry${g.cc === browseCc ? ' active' : ''}" type="button" role="tab" aria-selected="${g.cc === browseCc}" data-cc="${esc(g.cc)}">${flagImg(g.cc, 'flag')}<span>${esc(g.name)}</span><small>${g.channels.length}</small></button>`).join('');
        browseList = (groups.find(g => g.cc === browseCc) || { channels: [] }).channels;
        zapList.innerHTML = browseList.map((c, i) => zapRow(c, i, c === current)).join('') || '<p class="zap-empty">No channels here.</p>';
        centerChip();
        if (scroll)
            setTimeout(centerChip, 300); // again once the flags have loaded and the panel has settled
        if (scroll) {
            const on = zapList.querySelector('.on');
            zapList.scrollTop = on ? on.offsetTop - (zapList.clientHeight - on.offsetHeight) / 2 : 0;
        }
    }
    function openZapPanel() {
        var _a;
        if ((current === null || current === void 0 ? void 0 : current.type) !== 'live')
            return;
        browseCc = current.cc || '';
        zapPanel.hidden = false;
        player.classList.add('zap-open');
        player.classList.remove('idle');
        renderZapPanel();
        (_a = (zapList.querySelector('.on') || zapList.querySelector('.zap-row'))) === null || _a === void 0 ? void 0 : _a.focus({ preventScroll: true });
    }
    function closeZapPanel() {
        if (zapPanel.hidden)
            return;
        zapPanel.hidden = true;
        player.classList.remove('zap-open');
        if (!player.hidden && isLivePlayer())
            $('#zapOk').focus({ preventScroll: true });
        wakeControls();
    }
    const toggleZapPanel = () => (zapPanel.hidden ? openZapPanel() : closeZapPanel());
    function browseCountry(dir) {
        var _a;
        const groups = zap.countries(current);
        if (groups.length < 2)
            return;
        const i = Math.max(0, groups.findIndex(g => g.cc === browseCc));
        browseCc = groups[window.StreamBoxZap.wrap(i, dir, groups.length)].cc;
        renderZapPanel({ scroll: false });
        zapList.scrollTop = 0;
        (_a = zapList.querySelector('.zap-row')) === null || _a === void 0 ? void 0 : _a.focus({ preventScroll: true });
    }
    // Called by play() each time a channel starts
    function zapOnPlay(item) {
        var _a;
        const live = item.type === 'live';
        zapOpenTop.hidden = !live;
        if (!live) {
            closeZapPanel();
            hideBanner();
            return;
        }
        channelBanner(item);
        if (!zapPanel.hidden) {
            browseCc = item.cc || '';
            renderZapPanel();
            (_a = (zapList.querySelector('.on'))) === null || _a === void 0 ? void 0 : _a.focus({ preventScroll: true });
        }
    }
    zapList.addEventListener('click', e => {
        const row = e.target.closest('[data-zap]');
        const c = row && browseList[+row.dataset.zap];
        if (c && c !== current)
            play(c);
    });
    zapCountries.addEventListener('click', e => {
        const b = e.target.closest('[data-cc]');
        if (!b)
            return;
        browseCc = b.dataset.cc;
        renderZapPanel({ scroll: false });
        zapList.scrollTop = 0;
    });
    $('#zapClose').onclick = closeZapPanel;
    $('#zapChUp').onclick = () => step(1);
    $('#zapChDown').onclick = () => step(-1);
    $('#zapCtryPrev').onclick = () => countryStep(-1);
    $('#zapCtryNext').onclick = () => countryStep(1);
    $('#zapOk').onclick = toggleZapPanel;
    const zapOpenTop = document.createElement('button');
    zapOpenTop.className = 'icon-btn';
    zapOpenTop.type = 'button';
    zapOpenTop.title = 'Channel list (Enter)';
    zapOpenTop.setAttribute('aria-label', 'Channel list');
    zapOpenTop.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg>';
    zapOpenTop.onclick = toggleZapPanel;
    $('.player-nav').prepend(zapOpenTop);
    // Keys, the way a TV remote works. Returns true when the key was used.
    function remoteKey(e) {
        var _a;
        if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
            return false;
        const k = e.key, inPanel = !zapPanel.hidden;
        if (/^\d$/.test(k)) {
            digits.press(k);
            return true;
        }
        if (k === 'Enter' && digits.text) {
            digits.commit();
            e.preventDefault();
            return true;
        }
        if (inPanel) {
            if (k === 'ArrowLeft') {
                browseCountry(-1);
                e.preventDefault();
                return true;
            }
            if (k === 'ArrowRight') {
                browseCountry(1);
                e.preventDefault();
                return true;
            }
            if (k === 'ArrowUp' || k === 'ArrowDown') {
                const rows = [...zapList.querySelectorAll('.zap-row')];
                const i = rows.indexOf(document.activeElement);
                const next = rows[i < 0 ? Math.max(0, rows.findIndex(r => r.classList.contains('on'))) : Math.min(rows.length - 1, Math.max(0, i + (k === 'ArrowDown' ? 1 : -1)))];
                next === null || next === void 0 ? void 0 : next.focus();
                e.preventDefault();
                return true;
            }
            if (k === 'Enter' && !/^(BUTTON|A)$/.test(e.target.tagName)) {
                (_a = zapList.querySelector('.on, .zap-row')) === null || _a === void 0 ? void 0 : _a.focus();
                e.preventDefault();
                return true;
            }
            if (k === 'g' || k === 'G' || k === 'ContextMenu') {
                closeZapPanel();
                e.preventDefault();
                return true;
            }
            return false;
        }
        if (k === 'ArrowUp' || k === 'PageUp' || k === 'ChannelUp') {
            step(1);
            e.preventDefault();
            return true;
        }
        if (k === 'ArrowDown' || k === 'PageDown' || k === 'ChannelDown') {
            step(-1);
            e.preventDefault();
            return true;
        }
        if (k === 'ArrowRight') {
            countryStep(1);
            e.preventDefault();
            return true;
        }
        if (k === 'ArrowLeft') {
            countryStep(-1);
            e.preventDefault();
            return true;
        }
        if ((k === 'Enter' && !/^(BUTTON|A)$/.test(e.target.tagName)) || k === 'g' || k === 'G' || k === 'ContextMenu') {
            openZapPanel();
            e.preventDefault();
            return true;
        }
        if (k === 'Backspace' || k === 'l' || k === 'L') {
            lastChannel();
            e.preventDefault();
            return true;
        }
        return false;
    }
    document.addEventListener('keydown', e => {
        if (!player.hidden) {
            if (e.key === 'Escape') {
                if (!subsMenu.hidden) {
                    closeSubsMenu();
                    subsBtn.focus({ preventScroll: true });
                }
                else if (!zapPanel.hidden)
                    closeZapPanel();
                else
                    closePlayer();
            }
            else if ((current === null || current === void 0 ? void 0 : current.type) === 'live' && remoteKey(e)) { /* handled like a TV remote */ }
            else if (e.key === 'f' || e.key === 'F')
                toggleFullscreen();
            else if ((e.key === ' ' || e.key === 'k') && isLivePlayer() && !/^(BUTTON|INPUT|A|SELECT)$/.test(e.target.tagName)) {
                e.preventDefault();
                togglePlayback();
            }
            else if ((e.key === 'm' || e.key === 'M') && isLivePlayer())
                muteBtn.click();
            else if ((e.key === 'c' || e.key === 'C') && isLivePlayer() && !e.ctrlKey && !e.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
                toggleSubtitles();
            wakeControls();
        }
        else if (e.key === 'Escape' && !modal.hidden)
            closeModal();
        else if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !appFsBtn.hidden)
            appFsBtn.click();
    });
    // Search
    const searchInput = $('#searchInput');
    $('#searchToggle').onclick = () => { searchInput.classList.toggle('open'); if (searchInput.classList.contains('open'))
        searchInput.focus(); };
    searchInput.addEventListener('input', debounce(() => {
        const q = searchInput.value.trim();
        if (q.length >= 2)
            location.hash = 'search/' + encodeURIComponent(q);
    }, 350));
    $('#settingsBtn').onclick = showSettings;
    function onScroll() { if (!location.hash || location.hash === '#home')
        $('#topbar').classList.toggle('solid', scrollY > 60); }
    addEventListener('scroll', onScroll, { passive: true });
    // ---- Full screen for the whole app (desktop, Android, iPad). Not shown in the installed app, which already is, or on iPhone Safari.
    const appFsBtn = $('#appFsBtn');
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const root = document.documentElement;
    const canAppFullscreen = !!(root.requestFullscreen || root.webkitRequestFullscreen);
    function syncAppFullscreen() {
        appFsBtn.hidden = !canAppFullscreen || standalone;
        const on = fsElement() === root;
        appFsBtn.innerHTML = on ? ICON.exit : ICON.enter;
        appFsBtn.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
    }
    appFsBtn.onclick = () => { if (fsElement())
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else
        (root.requestFullscreen || root.webkitRequestFullscreen).call(root); };
    syncAppFullscreen();
    // ---- Back button: the previous page in the app, or Home when there isn't one (e.g. the app was opened on this page)
    const backBtn = $('#backBtn');
    let navIndex = Number.isInteger((_k = history.state) === null || _k === void 0 ? void 0 : _k.i) ? history.state.i : 0;
    if (!Number.isInteger((_l = history.state) === null || _l === void 0 ? void 0 : _l.i))
        history.replaceState(Object.assign(Object.assign({}, (history.state || {})), { i: navIndex }), '');
    const updateBack = () => {
        backBtn.hidden = (location.hash.slice(1).split('/')[0] || 'home') === 'home';
        $('#topbar').classList.toggle('has-back', !backBtn.hidden); // lets the CSS make room on narrow screens
    };
    addEventListener('hashchange', () => {
        var _a;
        const i = (_a = history.state) === null || _a === void 0 ? void 0 : _a.i;
        if (Number.isInteger(i))
            navIndex = i; // going back or forward to a page we have already been on
        else {
            navIndex += 1;
            history.replaceState(Object.assign(Object.assign({}, (history.state || {})), { i: navIndex }), '');
        } // a new page
        updateBack();
    });
    backBtn.onclick = () => { if (navIndex > 0)
        history.back();
    else
        location.hash = '#home'; };
    updateBack();
    addEventListener('hashchange', route);
    window.addEventListener('streambox-account-synced', () => {
        const name = location.hash.slice(1).split('/')[0] || 'home';
        if (['home', 'mylist'].includes(name)) {
            if (player.hidden && modal.hidden)
                route();
            else
                pendingMovieRender = true;
        }
    });
    window.addEventListener('streambox-movies-updated', e => {
        var _a;
        movies.all.forEach(register);
        const name = location.hash.slice(1).split('/')[0] || 'home';
        if (['home', 'movies', 'mylist', 'search'].includes(name)) {
            if (player.hidden && modal.hidden)
                route();
            else
                pendingMovieRender = true;
        }
        if (((_a = e.detail) === null || _a === void 0 ? void 0 : _a.reason) === 'refresh' && e.detail.added)
            toast(e.detail.added + ' new movies added');
    });
    window.addEventListener('streambox-movie-update-status', e => {
        const status = $('#movieUpdateStatus');
        if (status)
            status.textContent = movieUpdateText(e.detail);
    });
    // ---------------------------------------------------------------- boot
    view.innerHTML = '<div class="spinner" style="margin:40vh auto"></div>';
    movy.checkProtection();
    channelsReady = loadChannels();
    channelsReady.then(loadGuides);
    setInterval(patchGuide, 60000);
    route();
    movies.updates.start();
    if ('serviceWorker' in navigator && PAGE_IS_HTTPS)
        navigator.serviceWorker.register('/sw.js').catch(() => { });
})();
