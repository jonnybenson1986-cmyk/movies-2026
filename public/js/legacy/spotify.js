/* Generated from js/spotify.js (sha bb252fe094bd45dc) by scripts/build-legacy-js.mjs for older TV browsers. Do not edit. */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/* Spotify remote control (Spotify Connect, through the official Web API). StreamBox picks the songs and shows Now
   Playing; the Spotify app on the same device (running in the background) plays them. Spotify's audio never passes
   through StreamBox: Spotify doesn't allow that, and an iPad doesn't let one app play another's sound.
   Needs: Spotify Premium (Spotify only lets other apps start playback for Premium), and a Spotify developer app's
   Client ID (Netlify environment variable SPOTIFY_CLIENT_ID, or pasted into the Music page once).
   Sign-in is OAuth with PKCE: no client secret, and the tokens stay on this device for the signed-in StreamBox user.
   The top half is plain logic (no page code) so it can be tested on its own. */
(() => {
    'use strict';
    const AUTH = 'https://accounts.spotify.com/authorize';
    const TOKEN = 'https://accounts.spotify.com/api/token';
    const API = 'https://api.spotify.com/v1';
    const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
    const KEY = 'sb:spotify', CLIENT = 'sb:spotify-client', PENDING = 'sb:spotify-pkce';
    const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const redirectUri = origin => `${origin}/spotify-callback.html`;
    const validClientId = id => /^[0-9a-f]{32}$/i.test(String(id || '').trim());
    const randomText = (n = 64) => b64url(crypto.getRandomValues(new Uint8Array(n)));
    const challengeFor = (verifier) => __awaiter(void 0, void 0, void 0, function* () { return b64url(yield crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))); });
    function authUrl({ clientId, redirect, challenge, state }) {
        const p = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirect, code_challenge_method: 'S256', code_challenge: challenge, state, scope: SCOPES });
        return `${AUTH}?${p}`;
    }
    // The device to play on: the one already playing, else this kind of device (phone / tablet), else a computer
    function pickDevice(devices, prefer = 'Tablet') {
        const ok = (devices || []).filter(d => d && d.id && !d.is_restricted);
        return ok.find(d => d.is_active) || ok.find(d => d.type === prefer) || ok.find(d => d.type === 'Smartphone' || d.type === 'Tablet') || ok.find(d => d.type === 'Computer') || ok[0] || null;
    }
    function trackItem(t) {
        var _a, _b;
        if (!t || !/^spotify:track:[A-Za-z0-9]{22}$/.test(t.uri || ''))
            return null;
        const images = (((_a = t.album) === null || _a === void 0 ? void 0 : _a.images) || []).filter(i => /^https:\/\//.test((i === null || i === void 0 ? void 0 : i.url) || '')).sort((a, b) => (b.width || 0) - (a.width || 0));
        return { uri: t.uri, name: String(t.name || ''), artist: (t.artists || []).map(a => a === null || a === void 0 ? void 0 : a.name).filter(Boolean).join(', '), art: ((_b = images[0]) === null || _b === void 0 ? void 0 : _b.url) || '', durationMs: t.duration_ms | 0 };
    }
    // The best match for a song among Spotify's search results; `score(item, candidate)` is music.js's matchScore
    function bestTrack(item, tracks, score) {
        let best = null, bestScore = 0;
        for (const t of (tracks || []).map(trackItem).filter(Boolean)) {
            const s = score(item, t);
            if (s > bestScore) {
                best = t;
                bestScore = s;
            }
        }
        return bestScore >= 1 ? best : null; // the title has to match: a wrong song is worse than none
    }
    const searchQuery = (title, artist) => [title && `track:${String(title).replace(/"/g, '')}`, artist && `artist:${String(artist).replace(/"/g, '')}`].filter(Boolean).join(' ');
    // What Spotify is doing now (GET /me/player), in the few fields Now Playing needs
    function parseState(s) {
        var _a, _b;
        if (!s || !s.item)
            return null;
        const t = trackItem(s.item);
        return t && { playing: !!s.is_playing, progress: (s.progress_ms | 0) / 1000, duration: t.durationMs / 1000, uri: t.uri, name: t.name, artist: t.artist, art: t.art, device: String(((_a = s.device) === null || _a === void 0 ? void 0 : _a.name) || ''), deviceId: String(((_b = s.device) === null || _b === void 0 ? void 0 : _b.id) || '') };
    }
    // Spotify's error answers, as a short reason
    function reason(status, body) {
        var _a;
        const r = String(((_a = body === null || body === void 0 ? void 0 : body.error) === null || _a === void 0 ? void 0 : _a.reason) || '');
        if (status === 404 || r === 'NO_ACTIVE_DEVICE')
            return 'no-device';
        if (status === 403 && /PREMIUM/.test(r))
            return 'premium';
        if (status === 403)
            return 'forbidden';
        if (status === 401)
            return 'signed-out';
        if (status === 429)
            return 'busy';
        return 'error';
    }
    const pure = { SCOPES, redirectUri, validClientId, challengeFor, authUrl, pickDevice, trackItem, bestTrack, searchQuery, parseState, reason };
    if (typeof module !== 'undefined')
        module.exports = pure;
    if (typeof window === 'undefined' || typeof document === 'undefined')
        return;
    // ================================================================ browser
    const read = (store, key) => { try {
        return JSON.parse(store.getItem(key));
    }
    catch (_a) {
        return null;
    } };
    const write = (store, key, value) => { try {
        value == null ? store.removeItem(key) : store.setItem(key, JSON.stringify(value));
    }
    catch ( /* private mode */_a) { /* private mode */ } };
    const who = () => { var _a; return ((_a = window.StreamBoxAccount) === null || _a === void 0 ? void 0 : _a.user) || ''; };
    // Tokens belong to the StreamBox person who connected them on this device
    const saved = () => { const t = read(localStorage, KEY); return t && t.refresh && (t.user || '') === who() ? t : null; };
    let siteClientId = null;
    function clientId() {
        return __awaiter(this, void 0, void 0, function* () {
            const own = read(localStorage, CLIENT);
            if (validClientId(own))
                return own;
            if (siteClientId === null) {
                try {
                    const r = yield fetch('/api/spotify-config', { cache: 'no-store' });
                    siteClientId = r.ok ? String((yield r.json()).clientId || '') : '';
                }
                catch (_a) {
                    siteClientId = '';
                }
            }
            return validClientId(siteClientId) ? siteClientId : '';
        });
    }
    const setClientId = id => { if (!validClientId(id))
        throw new Error('That isn’t a Spotify Client ID (32 letters and numbers)'); write(localStorage, CLIENT, String(id).trim()); };
    // Signing in: off to Spotify, then back to /spotify-callback.html, which calls finish()
    function connect() {
        return __awaiter(this, arguments, void 0, function* (back = location.hash || '#music') {
            const id = yield clientId();
            if (!id)
                throw Object.assign(new Error('No Spotify Client ID yet'), { code: 'no-client' });
            const verifier = randomText(64), state = randomText(16);
            write(sessionStorage, PENDING, { verifier, state, clientId: id, back, user: who() });
            location.assign(authUrl({ clientId: id, redirect: redirectUri(location.origin), challenge: yield challengeFor(verifier), state }));
        });
    }
    function exchange(body) {
        return __awaiter(this, void 0, void 0, function* () {
            const r = yield fetch(TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
            const j = yield r.json().catch(() => ({}));
            if (!r.ok || !j.access_token)
                throw new Error(j.error_description || j.error || `Spotify sign-in failed (${r.status})`);
            return j;
        });
    }
    function finish() {
        return __awaiter(this, arguments, void 0, function* (params = new URLSearchParams(location.search)) {
            const pending = read(sessionStorage, PENDING);
            write(sessionStorage, PENDING, null);
            if (params.get('error'))
                throw new Error(params.get('error') === 'access_denied' ? 'Spotify connection was cancelled' : `Spotify said: ${params.get('error')}`);
            if (!pending || !params.get('code') || params.get('state') !== pending.state)
                throw new Error('That Spotify sign-in didn’t come from this device. Try again.');
            const j = yield exchange({ grant_type: 'authorization_code', code: params.get('code'), redirect_uri: redirectUri(location.origin), client_id: pending.clientId, code_verifier: pending.verifier });
            write(localStorage, KEY, { user: pending.user || '', clientId: pending.clientId, access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000 });
            return pending.back || '#music';
        });
    }
    const disconnect = () => write(localStorage, KEY, null);
    let refreshing = null;
    function token() {
        return __awaiter(this, arguments, void 0, function* (force = false) {
            const t = saved();
            if (!t)
                throw Object.assign(new Error('Not connected to Spotify'), { code: 'signed-out' });
            if (!force && t.exp - 60e3 > Date.now())
                return t.access;
            refreshing || (refreshing = exchange({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: t.clientId })
                .then(j => { write(localStorage, KEY, Object.assign(Object.assign({}, t), { access: j.access_token, refresh: j.refresh_token || t.refresh, exp: Date.now() + (j.expires_in || 3600) * 1000 })); return j.access_token; })
                .catch(e => { if (/invalid_grant|revoked/i.test(e.message))
                disconnect(); throw Object.assign(e, { code: 'signed-out' }); })
                .finally(() => { refreshing = null; }));
            return refreshing;
        });
    }
    function api(path_1) {
        return __awaiter(this, arguments, void 0, function* (path, { method = 'GET', query, body } = {}, retried = false) {
            var _a;
            const url = `${API}${path}${query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== ''))}` : ''}`;
            const r = yield fetch(url, { method, headers: Object.assign({ authorization: `Bearer ${yield token()}` }, (body ? { 'content-type': 'application/json' } : {})), body: body ? JSON.stringify(body) : undefined });
            if (r.status === 401 && !retried) {
                yield token(true);
                return api(path, { method, query, body }, true);
            }
            if (r.status === 204 || r.status === 202)
                return null;
            const j = yield r.json().catch(() => null);
            if (!r.ok)
                throw Object.assign(new Error(((_a = j === null || j === void 0 ? void 0 : j.error) === null || _a === void 0 ? void 0 : _a.message) || `Spotify error ${r.status}`), { code: reason(r.status, j) });
            return j;
        });
    }
    const found = new Map(); // song key -> Spotify track (or null when Spotify doesn't have it)
    function findTrack(item, score) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (found.has(item.key))
                return found.get(item.key);
            const clean = s => String(s || '').replace(/\s*[([].*?[)\]]/g, '').trim();
            let best = null;
            for (const q of [searchQuery(clean(item.name), item.artist), `${clean(item.name)} ${item.artist || ''}`.trim()]) {
                const r = yield api('/search', { query: { q, type: 'track', limit: 8, market: 'from_token' } });
                best = bestTrack(item, (_a = r === null || r === void 0 ? void 0 : r.tracks) === null || _a === void 0 ? void 0 : _a.items, score);
                if (best)
                    break;
            }
            found.set(item.key, best);
            return best;
        });
    }
    const prefer = /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'Tablet' : /iPhone|Android.*Mobile/.test(navigator.userAgent) ? 'Smartphone' : 'Computer';
    const devices = () => __awaiter(void 0, void 0, void 0, function* () { var _a; return ((_a = (yield api('/me/player/devices'))) === null || _a === void 0 ? void 0 : _a.devices) || []; });
    const device = () => __awaiter(void 0, void 0, void 0, function* () { return pickDevice(yield devices(), prefer); });
    window.StreamBoxSpotify = Object.assign(Object.assign({}, pure), { get connected() { return !!saved(); },
        clientId, setClientId, connect, finish, disconnect, api, findTrack, devices, device, cached: item => found.get(item === null || item === void 0 ? void 0 : item.key) || null, play: (deviceId, uris, offset = 0) => api('/me/player/play', { method: 'PUT', query: { device_id: deviceId }, body: { uris, offset: { position: offset } } }), resume: deviceId => api('/me/player/play', { method: 'PUT', query: { device_id: deviceId } }), pause: deviceId => api('/me/player/pause', { method: 'PUT', query: { device_id: deviceId } }), next: deviceId => api('/me/player/next', { method: 'POST', query: { device_id: deviceId } }), previous: deviceId => api('/me/player/previous', { method: 'POST', query: { device_id: deviceId } }), seek: (deviceId, seconds) => api('/me/player/seek', { method: 'PUT', query: { device_id: deviceId, position_ms: Math.max(0, Math.round(seconds * 1000)) } }), state: () => __awaiter(void 0, void 0, void 0, function* () { return parseState(yield api('/me/player', { query: { market: 'from_token' } })); }), 
        // Opens the Spotify app, so it becomes a device StreamBox can play on
        wakeUrl: 'spotify://' });
})();
