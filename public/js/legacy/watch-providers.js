/* Generated from js/watch-providers.js (sha 8ccb39684e7596a2) by scripts/build-legacy-js.mjs for older TV browsers. Do not edit. */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/* Where to Stream: which partner services carry a Movy title, and a "Browse by Streaming Service" hub.
   Availability comes from the same TMDB-compatible service Movy's catalog uses (watch/providers endpoints),
   grouped by how you get it (Stream, Free, With ads, Rent, Buy) for the chosen country.
   "Notify Me When Available" alerts are saved to the signed-in account (/api/watch-alerts) and also kept on
   this device, so they work without an account. They are checked when the Home screen opens. */
(() => {
    'use strict';
    const DB = 'https://db.wecollege.net/3';
    const IMG = 'https://image.tmdb.org/t/p/';
    const REGION_KEY = 'sb:watch-region', ALERTS_KEY = 'sb:watch-alerts', CHECKED_KEY = 'sb:watch-alerts-checked';
    const esc = s => String(s !== null && s !== void 0 ? s : '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const q = s => encodeURIComponent(s);
    // The big services, always offered first when they operate in the chosen country. `ids` are TMDB provider IDs
    // (some services use a different ID per country). `quality` is the best picture the service offers.
    const FEATURED = [
        { slug: 'netflix', name: 'Netflix', ids: [8], color: '#e50914', quality: '4K', search: t => 'https://www.netflix.com/search?q=' + q(t) },
        { slug: 'prime', name: 'Prime Video', ids: [9, 119], color: '#00a8e1', quality: '4K', search: t => 'https://www.primevideo.com/search?phrase=' + q(t) },
        { slug: 'disney', name: 'Disney+', ids: [337], color: '#113ccf', quality: '4K', search: t => 'https://www.disneyplus.com/search?q=' + q(t) },
        { slug: 'appletv', name: 'Apple TV+', ids: [350], color: '#000000', quality: '4K', search: t => 'https://tv.apple.com/search?term=' + q(t) },
        { slug: 'max', name: 'Max', ids: [1899, 384], color: '#002be7', quality: '4K' },
        { slug: 'hulu', name: 'Hulu', ids: [15], color: '#1ce783', quality: '4K', search: t => 'https://www.hulu.com/search?q=' + q(t) },
    ];
    // Extra services Movy tracks. Add an entry here to put another service in the hub; it only shows in countries
    // where TMDB lists it. `logo` is optional (TMDB's logo is used when it has one).
    const CUSTOM = [
        { slug: 'paramount', name: 'Paramount+', ids: [531, 2303, 2616], color: '#0064ff', quality: '4K' },
        { slug: 'peacock', name: 'Peacock', ids: [386, 387], color: '#000000', quality: '4K' },
        { slug: 'stan', name: 'Stan', ids: [21], color: '#0072ce', quality: '4K' },
        { slug: 'binge', name: 'BINGE', ids: [385], color: '#4b1fff', quality: 'HD' },
        { slug: 'crunchyroll', name: 'Crunchyroll', ids: [283], color: '#f47521', quality: 'HD', search: t => 'https://www.crunchyroll.com/search?q=' + q(t) },
        { slug: 'britbox', name: 'BritBox', ids: [151], color: '#1f2b5a', quality: 'HD' },
        { slug: 'tubi', name: 'Tubi', ids: [73], color: '#fa382f', quality: 'HD', search: t => 'https://tubitv.com/search/' + q(t) },
    ];
    const SERVICES = [...FEATURED, ...CUSTOM];
    // Stores where titles are rented or bought, for their deep links and picture badges
    const STORES = {
        2: { quality: '4K', search: t => 'https://tv.apple.com/search?term=' + q(t) },
        3: { quality: 'HD', search: t => 'https://play.google.com/store/search?c=movies&q=' + q(t) },
        10: { quality: '4K', search: t => 'https://www.amazon.com/s?i=instant-video&k=' + q(t) },
        192: { quality: 'HD', search: t => 'https://www.youtube.com/results?search_query=' + q(t) },
        7: { quality: '4K' },
    };
    const serviceFor = id => SERVICES.find(s => s.ids.includes(Number(id)));
    // How a title is offered. TMDB's own keys, in display order.
    const ACCESS = [
        { key: 'flatrate', label: 'Stream', badge: 'Subscription' },
        { key: 'free', label: 'Free', badge: 'Free' },
        { key: 'ads', label: 'With ads', badge: 'Free with ads' },
        { key: 'rent', label: 'Rent', badge: 'Rent' },
        { key: 'buy', label: 'Buy', badge: 'Buy' },
    ];
    // Browse filters for the hub ("Stream" includes free and ad-supported)
    const MONETIZATION = { stream: 'flatrate|free|ads', rent: 'rent', buy: 'buy' };
    const store = {
        get(key, fallback) { try {
            const v = localStorage.getItem(key);
            return v == null ? fallback : JSON.parse(v);
        }
        catch (_a) {
            return fallback;
        } },
        set(key, value) { try {
            localStorage.setItem(key, JSON.stringify(value));
        }
        catch ( /* private mode */_a) { /* private mode */ } },
    };
    const validRegion = r => typeof r === 'string' && /^[A-Z]{2}$/.test(r);
    function localeRegion() {
        const tags = [...(navigator.languages || []), navigator.language, Intl.DateTimeFormat().resolvedOptions().locale];
        for (const tag of tags) {
            const m = /[-_]([A-Za-z]{2})(?:$|[-_])/.exec(tag || '');
            if (m)
                return m[1].toUpperCase();
        }
        return 'US';
    }
    let region = validRegion(store.get(REGION_KEY)) ? store.get(REGION_KEY) : localeRegion();
    function setRegion(value) {
        if (!validRegion(value) || value === region)
            return;
        region = value;
        store.set(REGION_KEY, value);
        window.dispatchEvent(new CustomEvent('streambox-watch-region', { detail: value }));
    }
    const cache = new Map();
    function request(path) {
        return __awaiter(this, void 0, void 0, function* () {
            const hit = cache.get(path);
            if (hit && hit.until > Date.now())
                return hit.data;
            const res = yield fetch(DB + path, { credentials: 'omit', signal: AbortSignal.timeout(15000) });
            if (!res.ok)
                throw new Error('Providers HTTP ' + res.status);
            const data = yield res.json();
            cache.set(path, { data, until: Date.now() + 30 * 60e3 });
            if (cache.size > 80)
                cache.delete(cache.keys().next().value);
            return data;
        });
    }
    let regionsPromise = null;
    function regions() {
        regionsPromise || (regionsPromise = request('/watch/providers/regions?language=en')
            .then(d => (d.results || []).filter(r => validRegion(r.iso_3166_1)).map(r => ({ code: r.iso_3166_1, name: r.english_name || r.iso_3166_1 }))
            .sort((a, b) => a.name.localeCompare(b.name)))
            .catch(e => { regionsPromise = null; throw e; }));
        return regionsPromise;
    }
    function regionSelect(id) {
        return __awaiter(this, void 0, void 0, function* () {
            let list;
            try {
                list = yield regions();
            }
            catch (_a) {
                list = [];
            }
            if (!list.some(r => r.code === region))
                list = [{ code: region, name: region }, ...list];
            return `<label class="watch-region"><span>Region</span><select data-watch-region id="${esc(id)}" aria-label="Country or region">
      ${list.map(r => `<option value="${esc(r.code)}"${r.code === region ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>`;
        });
    }
    // The hub's services that operate in the current region, with TMDB's official logos
    function hubServices() {
        return __awaiter(this, void 0, void 0, function* () {
            const [movie, tv] = yield Promise.all(['movie', 'tv'].map(kind => request(`/watch/providers/${kind}?language=en&watch_region=${region}`).then(d => d.results || []).catch(() => [])));
            const known = new Map([...movie, ...tv].map(p => [p.provider_id, p]));
            return SERVICES.map(s => {
                var _a;
                const present = s.ids.filter(id => known.has(id));
                if (!present.length)
                    return null;
                return Object.assign(Object.assign({}, s), { present, logo: s.logo || (((_a = known.get(present[0])) === null || _a === void 0 ? void 0 : _a.logo_path) ? IMG + 'w154' + known.get(present[0]).logo_path : '') });
            }).filter(Boolean);
        });
    }
    const initials = name => name.replace(__sbRe("[^\\p{L}\\p{N} ]", "gu"), '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    function logoHTML(name, logo, color, cls = 'watch-logo') {
        return `<span class="${cls}" style="--brand:${esc(color || '#2a2a2a')}">${logo ? `<img src="${esc(logo)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ''}<span class="watch-logo-initials">${esc(initials(name))}</span></span>`;
    }
    const browseLink = (service, kind = 'movie', access = 'stream') => `#movy/${kind === 'tv' ? 'tv' : 'movie'}/1?provider=${q(service.slug)}${access !== 'stream' ? '&access=' + q(access) : ''}`;
    // Home: "Browse by Streaming Service"
    function mountHub(el_1) {
        return __awaiter(this, arguments, void 0, function* (el, { active = '', kind = 'movie', title = 'Browse by Streaming Service' } = {}) {
            if (!el)
                return;
            const token = el.dataset.watchToken = String(Math.random());
            el.dataset.watchKind = kind;
            el.dataset.watchActive = active;
            el.dataset.watchTitle = title;
            el.innerHTML = `<div class="row-head watch-hub-head"><h2>${esc(title)}</h2></div><div class="watch-hub-track" aria-busy="true">${'<span class="watch-hub-tile skeleton"></span>'.repeat(6)}</div>`;
            const [services, select] = yield Promise.all([hubServices(), regionSelect('watchHubRegion')]);
            if (el.dataset.watchToken !== token || !el.isConnected)
                return;
            el.innerHTML = `<div class="row-head watch-hub-head"><h2>${esc(title)}</h2>${select}</div>
      ${services.length ? `<div class="row-track-wrap"><div class="watch-hub-track" role="list">${services.map(s => `
        <a class="watch-hub-tile${s.slug === active ? ' active' : ''}" role="listitem" href="${esc(browseLink(s, kind))}" title="Browse ${esc(s.name)}" aria-label="Browse titles on ${esc(s.name)}"${s.slug === active ? ' aria-current="true"' : ''}>
          ${logoHTML(s.name, s.logo, s.color)}<span class="watch-hub-name">${esc(s.name)}</span></a>`).join('')}</div></div>`
                : '<p class="watch-empty-note">No tracked services list titles for this region yet. Try another region.</p>'}`;
        });
    }
    // Movy browse: turn ?provider=…&access=… into TMDB discover options
    function discoverOptions(params) {
        const service = SERVICES.find(s => s.slug === params.get('provider'));
        if (!service)
            return null;
        const access = MONETIZATION[params.get('access')] ? params.get('access') : 'stream';
        return { service, access, options: { with_watch_providers: service.ids.join('|'), watch_region: region, with_watch_monetization_types: MONETIZATION[access] } };
    }
    function filterBanner(params, kind, linkFor) {
        const f = discoverOptions(params);
        if (!f)
            return '';
        const without = new URLSearchParams(params);
        without.delete('provider');
        without.delete('access');
        const withAccess = a => { const p = new URLSearchParams(params); if (a === 'stream')
            p.delete('access');
        else
            p.set('access', a); return linkFor(kind, 1, p); };
        return `<div class="watch-filter">${logoHTML(f.service.name, '', f.service.color, 'watch-logo small')}
      <span>Showing ${kind === 'tv' ? 'shows' : 'movies'} on <b>${esc(f.service.name)}</b> in ${esc(region)}</span>
      <span class="chips watch-filter-chips">${Object.keys(MONETIZATION).map(a => `<a class="chip ${a === f.access ? 'active' : ''}" href="${esc(withAccess(a))}">${a[0].toUpperCase() + a.slice(1)}</a>`).join('')}</span>
      <a class="chip" href="${esc(linkFor(kind, 1, without))}">✕ Clear</a></div>`;
    }
    // Movie detail: "Available on Movy's Partner Services"
    function watchUrl(p, title, regionLink) {
        const s = serviceFor(p.provider_id), store = STORES[p.provider_id];
        const make = (s === null || s === void 0 ? void 0 : s.search) || (store === null || store === void 0 ? void 0 : store.search);
        return make ? make(title) : regionLink || 'https://www.themoviedb.org/search?query=' + q(title);
    }
    function groups(data) {
        return ACCESS.map(a => {
            const seen = new Set();
            const list = ((data === null || data === void 0 ? void 0 : data[a.key]) || []).filter(p => p && Number.isInteger(p.provider_id) && !seen.has(p.provider_id) && seen.add(p.provider_id))
                .sort((x, y) => { var _a, _b; return ((_a = x.display_priority) !== null && _a !== void 0 ? _a : 999) - ((_b = y.display_priority) !== null && _b !== void 0 ? _b : 999); });
            return Object.assign(Object.assign({}, a), { list });
        }).filter(g => g.list.length);
    }
    function providerCard(p, group, title, regionLink) {
        const s = serviceFor(p.provider_id), extra = STORES[p.provider_id];
        const quality = p.quality || (s === null || s === void 0 ? void 0 : s.quality) || (extra === null || extra === void 0 ? void 0 : extra.quality);
        const badges = [`<span class="watch-badge access-${esc(group.key)}">${esc(group.badge)}</span>`,
            quality ? `<span class="watch-badge quality">${quality === '4K' ? '4K UHD' : esc(quality)}</span>` : '',
            p.price ? `<span class="watch-badge price">${esc(p.price)}</span>` : ''].join('');
        const logo = p.logo_path ? IMG + 'w154' + p.logo_path : '';
        return `<li class="watch-card">${logoHTML(p.provider_name, logo, s === null || s === void 0 ? void 0 : s.color)}
      <span class="watch-card-body"><span class="watch-card-name">${esc(p.provider_name)}</span><span class="watch-badges">${badges}</span></span>
      <a class="btn btn-play watch-now" href="${esc(watchUrl(p, title, regionLink))}" target="_blank" rel="noopener noreferrer" aria-label="Watch ${esc(title)} on ${esc(p.provider_name)}">Watch Now <span aria-hidden="true">↗</span></a></li>`;
    }
    function mountDetail(el, record) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (!el || !record || !['movie', 'tv'].includes(record.mediaType) || !/^[1-9]\d{0,9}$/.test(String(record.id))) {
                if (el)
                    el.hidden = true;
                return;
            }
            const token = el.dataset.watchToken = String(Math.random());
            el.hidden = false;
            el.dataset.watchKind = record.mediaType;
            el.dataset.watchId = record.id;
            el.dataset.watchName = record.name;
            el.innerHTML = `<div class="watch-panel-head"><h2>Available on Movy’s Partner Services</h2></div><p class="watch-empty-note" role="status">Checking streaming services…</p>`;
            let data, failed = false;
            try {
                data = yield request(`/${record.mediaType}/${record.id}/watch/providers`);
            }
            catch (_b) {
                failed = true;
            }
            const select = yield regionSelect('watchDetailRegion');
            if (el.dataset.watchToken !== token || !el.isConnected)
                return;
            const local = (_a = data === null || data === void 0 ? void 0 : data.results) === null || _a === void 0 ? void 0 : _a[region];
            const list = groups(local);
            const head = `<div class="watch-panel-head"><div><h2>Available on Movy’s Partner Services</h2>
      <p class="watch-sub">Where to stream <b>${esc(record.name)}</b> in ${esc(region)}</p></div>${select}</div>`;
            if (failed) {
                el.innerHTML = head + '<p class="watch-empty-note">Couldn’t check streaming services right now. <button class="btn btn-more" type="button" data-watch-retry>Try again</button></p>';
                return;
            }
            if (!list.length) {
                const on = isAlertOn(record);
                const elsewhere = Object.keys((data === null || data === void 0 ? void 0 : data.results) || {}).length;
                el.innerHTML = head + `<div class="watch-empty">
        <p><b>Not on any tracked service in ${esc(region)} yet.</b>${elsewhere ? ` It is available in ${elsewhere} other ${elsewhere === 1 ? 'region' : 'regions'} — try changing the region.` : ''}</p>
        <button class="btn watch-notify${on ? ' on' : ''}" type="button" data-watch-notify aria-pressed="${on}">
          <span class="watch-toggle" aria-hidden="true"></span>${on ? 'We’ll notify you' : 'Notify Me When Available'}</button>
        <p class="watch-sub">${on ? 'You’ll get a notice in StreamBox when it arrives on a service in this region.' : 'Get a notice in StreamBox when this title arrives on a service in this region.'}</p></div>`;
                return;
            }
            el.innerHTML = head + list.map(g => `<section class="watch-group"><h3>${esc(g.label)} <span>${g.list.length}</span></h3>
      <ul class="watch-grid">${g.list.map(p => providerCard(p, g, record.name, local.link)).join('')}</ul></section>`).join('') +
                `<p class="watch-attrib">Availability data from JustWatch via TMDB. Watch Now opens the service in a new tab; you need your own subscription for streaming services.
      Prefer to stay in the app? <button class="watch-inline" type="button" data-movy-browser="1">Open in the Movy Browser box</button>.</p>`;
        });
    }
    // ---------------------------------------------------------------- Notify Me alerts
    const alertKey = r => `${r.mediaType}:${r.id}:${r.region || region}`;
    let alerts = store.get(ALERTS_KEY, []);
    if (!Array.isArray(alerts))
        alerts = [];
    let accountAlerts = null; // null = not checked; false = no account API
    const isAlertOn = record => alerts.some(a => a.key === alertKey(record));
    function syncAlerts() {
        return __awaiter(this, void 0, void 0, function* () {
            if (accountAlerts !== null)
                return; // once per app launch
            try {
                const res = yield fetch('/api/watch-alerts', { cache: 'no-store' });
                if (!res.ok) {
                    accountAlerts = false;
                    return;
                }
                const remote = (yield res.json()).alerts || [];
                const keys = new Set(alerts.map(a => a.key));
                alerts = [...alerts, ...remote.filter(a => (a === null || a === void 0 ? void 0 : a.key) && !keys.has(a.key))];
                store.set(ALERTS_KEY, alerts);
                accountAlerts = true;
            }
            catch (_a) {
                accountAlerts = false;
            }
        });
    }
    function saveAlert(alert, on) {
        return __awaiter(this, void 0, void 0, function* () {
            if (accountAlerts === null)
                yield syncAlerts();
            if (!accountAlerts)
                return;
            try {
                yield fetch('/api/watch-alerts', { method: 'PUT', headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ on, alert: { kind: alert.kind, id: alert.id, name: alert.name, region: alert.region } }) });
            }
            catch ( /* kept on this device */_a) { /* kept on this device */ }
        });
    }
    function toggleAlert(record) {
        const key = alertKey(record), on = !alerts.some(a => a.key === key);
        const alert = { key, kind: record.mediaType, id: String(record.id), name: String(record.name).slice(0, 300), region, at: Date.now() };
        alerts = on ? [alert, ...alerts.filter(a => a.key !== key)].slice(0, 100) : alerts.filter(a => a.key !== key);
        store.set(ALERTS_KEY, alerts);
        saveAlert(alert, on);
        return on;
    }
    // When Home opens (at most every few hours), see if any title someone is waiting for has arrived
    function checkAlerts(notify) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            yield syncAlerts();
            if (!alerts.length || Date.now() - (store.get(CHECKED_KEY, 0) || 0) < 3 * 3600e3)
                return;
            store.set(CHECKED_KEY, Date.now());
            for (const a of alerts.slice(0, 20)) {
                if (!['movie', 'tv'].includes(a.kind) || !/^[1-9]\d{0,9}$/.test(a.id) || !validRegion(a.region))
                    continue;
                try {
                    const data = yield request(`/${a.kind}/${a.id}/watch/providers`);
                    const found = groups((_a = data === null || data === void 0 ? void 0 : data.results) === null || _a === void 0 ? void 0 : _a[a.region])[0];
                    if (!found)
                        continue;
                    notify(`${a.name} is now on ${found.list[0].provider_name} (${found.label})`, `#movy/detail/${a.kind}/${a.id}`);
                    alerts = alerts.filter(x => x.key !== a.key);
                    store.set(ALERTS_KEY, alerts);
                    saveAlert(a, false);
                }
                catch ( /* try again next time */_b) { /* try again next time */ }
            }
        });
    }
    // ---------------------------------------------------------------- events
    document.addEventListener('change', e => {
        var _a, _b;
        if (!((_b = (_a = e.target).matches) === null || _b === void 0 ? void 0 : _b.call(_a, '[data-watch-region]')))
            return;
        setRegion(e.target.value);
    });
    window.addEventListener('streambox-watch-region', () => {
        document.querySelectorAll('[data-watch-hub]').forEach(el => mountHub(el, { active: el.dataset.watchActive, kind: el.dataset.watchKind, title: el.dataset.watchTitle }));
        document.querySelectorAll('[data-watch-detail]').forEach(el => el.dataset.watchId && mountDetail(el, { mediaType: el.dataset.watchKind, id: el.dataset.watchId, name: el.dataset.watchName }));
    });
    document.addEventListener('click', e => {
        const panel = e.target.closest('[data-watch-detail]');
        if (!panel)
            return;
        const record = { mediaType: panel.dataset.watchKind, id: panel.dataset.watchId, name: panel.dataset.watchName };
        if (e.target.closest('[data-watch-retry]')) {
            cache.clear();
            mountDetail(panel, record);
            return;
        }
        if (e.target.closest('[data-watch-notify]')) {
            toggleAlert(record);
            mountDetail(panel, record);
        }
    });
    window.StreamBoxWatch = {
        mountHub, mountDetail, discoverOptions, filterBanner, checkAlerts, toggleAlert, isAlertOn, groups, watchUrl, localeRegion,
        SERVICES, FEATURED, CUSTOM, get region() { return region; }, setRegion,
    };
})();
