/* Generated from js/passkey.js (sha d7634e8d76b6ae80) by scripts/build-legacy-js.mjs for older TV browsers. Do not edit. */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/* Face ID / fingerprint sign-in (passkeys) for the signed-in person: setting it up on this device, listing and
   removing. The sign-in itself happens on the lock screen (netlify/edge-functions/gate.js), and the checks are
   on the server (netlify/functions/passkey.mjs). The device keeps the secret; the server only gets a public key. */
(() => {
    'use strict';
    const FLAG = 'sb:passkey'; // "1" once a passkey has been set up or used on this device: the lock screen then leads with it
    const enc = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const dec = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const flag = on => { try {
        on ? localStorage.setItem(FLAG, '1') : localStorage.removeItem(FLAG);
    }
    catch ( /* private mode */_a) { /* private mode */ } };
    function api(path_1, body_1) {
        return __awaiter(this, arguments, void 0, function* (path, body, method = 'POST') {
            const res = yield fetch('/api/passkey' + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
            const data = (res.headers.get('content-type') || '').includes('json') ? yield res.json() : {};
            if (!res.ok)
                throw new Error(data.error || `HTTP ${res.status}`);
            return data;
        });
    }
    const supported = () => { var _a; return !!(window.PublicKeyCredential && ((_a = navigator.credentials) === null || _a === void 0 ? void 0 : _a.create)); };
    // Does this device have Face ID / Touch ID / a fingerprint reader / Windows Hello set up?
    function available() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!supported())
                return false;
            try {
                return yield PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
            }
            catch (_a) {
                return false;
            }
        });
    }
    function setUp() {
        return __awaiter(this, void 0, void 0, function* () {
            const o = yield api('/register/options', {});
            let made;
            try {
                made = yield navigator.credentials.create({ publicKey: {
                        challenge: dec(o.challenge), rp: o.rp, user: Object.assign(Object.assign({}, o.user), { id: dec(o.user.id) }), pubKeyCredParams: o.pubKeyCredParams, timeout: o.timeout,
                        authenticatorSelection: o.authenticatorSelection, attestation: o.attestation, excludeCredentials: o.excludeCredentials.map(c => (Object.assign(Object.assign({}, c), { id: dec(c.id) }))),
                    } });
            }
            catch (e) {
                if ((e === null || e === void 0 ? void 0 : e.name) === 'InvalidStateError') {
                    flag(true);
                    throw new Error('This device is already set up');
                }
                if ((e === null || e === void 0 ? void 0 : e.name) === 'NotAllowedError' || (e === null || e === void 0 ? void 0 : e.name) === 'AbortError')
                    throw new Error('Cancelled');
                throw new Error('This device couldn’t create a passkey');
            }
            const r = made.response;
            if (!r.getPublicKey || !r.getAuthenticatorData)
                throw new Error('This browser is too old for Face ID sign-in. Update it and try again.');
            const publicKey = r.getPublicKey();
            if (!publicKey)
                throw new Error('This device made a kind of key StreamBox can’t use');
            const saved = yield api('/register', { token: o.token, id: made.id, clientDataJSON: enc(r.clientDataJSON), authenticatorData: enc(r.getAuthenticatorData()), publicKey: enc(publicKey), alg: r.getPublicKeyAlgorithm() });
            flag(true);
            return saved;
        });
    }
    const list = () => __awaiter(void 0, void 0, void 0, function* () { return (yield api('', null, 'GET')).passkeys || []; });
    function remove(id) {
        return __awaiter(this, void 0, void 0, function* () {
            yield api('/remove', { id });
            if (!(yield list().catch(() => [1])).length)
                flag(false);
        });
    }
    window.StreamBoxPasskey = { supported, available, setUp, list, remove, get known() { try {
            return localStorage.getItem(FLAG) === '1';
        }
        catch (_a) {
            return false;
        } } };
})();
