/* Generated from js/music-local.js (sha 59f737d4c5dacf37) by scripts/build-legacy-js.mjs for older TV browsers. Do not edit. */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
/* My Music: your own music files, kept on this device so they play with no subscription and no connection.
   - Add files or a whole folder (Settings of the Music page). Songs are stored in the browser's own database
     (IndexedDB), with their details read from the files' tags by jsmediatags (open source, BSD licence, loaded
     from cdnjs only while adding): title, artist, album artist, album, track and disc number, year, genre and the
     embedded cover picture.
   - No tags? The folder and file names are used instead: Artist/Album/01 Title.mp3, or "Artist - Title.mp3".
   - Albums with no cover picture get their official artwork (music.js findArt), so every album has a poster.
   Everything stays on this device; nothing is uploaded. To have the same collection everywhere, connect your own
   music server instead (Navidrome and similar, see music.js). */
(() => {
    'use strict';
    if (typeof window === 'undefined' || !window.indexedDB)
        return;
    const DB = 'streambox-music', TAGS_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js';
    const AUDIO = /\.(mp3|m4a|aac|mp4|flac|wav|ogg|oga|opus|webm|aif|aiff|alac)$/i;
    const songs = new Map(), artUrls = new Map();
    let dbp = null, loaded = null;
    // ---- the database: tracks (details), files (the audio itself) and art (cover pictures, one per album)
    function open() {
        if (!dbp)
            dbp = new Promise((resolve, reject) => {
                const req = indexedDB.open(DB, 1);
                req.onupgradeneeded = () => { const db = req.result; for (const s of ['tracks', 'files', 'art'])
                    if (!db.objectStoreNames.contains(s))
                        db.createObjectStore(s); };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error || new Error('This browser won’t store music (private browsing?)'));
            });
        return dbp;
    }
    const done = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    function store(name_1) {
        return __awaiter(this, arguments, void 0, function* (name, mode = 'readonly') { return (yield open()).transaction(name, mode).objectStore(name); });
    }
    function all(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const s = yield store(name);
            const [keys, values] = yield Promise.all([done(s.getAllKeys()), done(s.getAll())]);
            return keys.map((k, i) => [k, values[i]]);
        });
    }
    // A stored track as the music player uses it
    const item = t => ({
        key: 'm:' + t.id, type: 'song', src: 'local', id: t.id, name: t.name, artist: t.artist, albumArtist: t.albumArtist || '', album: t.album || '',
        track: t.track | 0, disc: t.disc | 0, year: t.year || '', genre: t.genre || '', duration: t.duration | 0, added: t.added || 0,
        art: artUrls.get(t.artKey) || t.artUrl || '',
    });
    function load() {
        if (!loaded)
            loaded = (() => __awaiter(this, void 0, void 0, function* () {
                const [tracks, art] = yield Promise.all([all('tracks'), all('art')]);
                for (const [k, blob] of art)
                    if (blob instanceof Blob)
                        artUrls.set(k, URL.createObjectURL(blob));
                for (const [, t] of tracks)
                    songs.set(t.id, item(t));
                return songs;
            }))().catch(e => { loaded = null; throw e; });
        return loaded;
    }
    // ---- reading the details of a file
    let tagLib = null;
    const loadTags = () => (tagLib || (tagLib = new Promise(resolve => {
        if (window.jsmediatags) {
            resolve(window.jsmediatags);
            return;
        }
        const s = document.createElement('script');
        s.src = TAGS_LIB;
        s.async = true;
        s.onload = () => resolve(window.jsmediatags || null);
        s.onerror = () => { tagLib = null; resolve(null); }; // offline: names come from the files and folders
        document.head.appendChild(s);
    })));
    const readTags = (file) => __awaiter(void 0, void 0, void 0, function* () {
        const lib = yield loadTags();
        if (!lib)
            return {};
        return new Promise(resolve => {
            const timer = setTimeout(() => resolve({}), 15000);
            try {
                lib.read(file, { onSuccess: r => { clearTimeout(timer); resolve(r.tags || {}); }, onError: () => { clearTimeout(timer); resolve({}); } });
            }
            catch (_a) {
                clearTimeout(timer);
                resolve({});
            }
        });
    });
    const text = v => { var _a; return String((_a = (v && typeof v === 'object' && 'data' in v ? v.data : v)) !== null && _a !== void 0 ? _a : '').replace(/\0/g, '').trim(); };
    const num = v => parseInt(String(text(v)).split('/')[0], 10) || 0;
    // What a file's tags (or, failing those, its path) say it is
    function describe(file, tags) {
        const path = String(file.webkitRelativePath || file.name).split('/'), base = path.pop().replace(/\.[^.]+$/, '');
        const m = base.match(/^(?:(\d{1,3})[\s.\-_]+)?(?:(.+?)\s+-\s+)?(.+)$/) || [];
        const folderArtist = path.length >= 3 ? path[path.length - 2] : '', folderAlbum = path.length >= 2 ? path[path.length - 1] : '';
        return {
            name: text(tags.title) || (m[3] || base).trim(),
            artist: text(tags.artist) || (m[2] || '').trim() || folderArtist || 'Unknown Artist',
            albumArtist: text(tags.TPE2) || text(tags.aART) || text(tags.ALBUMARTIST) || '',
            album: text(tags.album) || folderAlbum || '',
            track: num(tags.track) || parseInt(m[1], 10) || 0,
            disc: num(tags.TPOS) || num(tags.disk) || num(tags.DISCNUMBER) || 0,
            year: text(tags.year).slice(0, 4),
            genre: text(tags.genre).replace(/^\(\d+\)/, ''),
        };
    }
    const artKeyOf = d => `${(d.albumArtist || d.artist).toLowerCase()}|${(d.album || d.name).toLowerCase()}`;
    // ---- adding files. onProgress(done, total, name) is called as it goes; returns { added, skipped, failed }
    function add(fileList_1) {
        return __awaiter(this, arguments, void 0, function* (fileList, onProgress = () => { }) {
            var _a, _b, _c;
            yield load();
            const files = [...fileList].filter(f => AUDIO.test(f.name) || /^audio\//.test(f.type));
            try {
                yield ((_b = (_a = navigator.storage) === null || _a === void 0 ? void 0 : _a.persist) === null || _b === void 0 ? void 0 : _b.call(_a));
            }
            catch ( /* the browser decides */_d) { /* the browser decides */ }
            const have = new Set([...songs.values()].map(s => `${s.name}|${s.artist}|${s.album}`.toLowerCase()));
            let added = 0, skipped = 0, failed = 0;
            for (const [i, file] of files.entries()) {
                onProgress(i, files.length, file.name);
                try {
                    const tags = yield readTags(file), d = describe(file, tags);
                    const dupe = `${d.name}|${d.artist}|${d.album}`.toLowerCase();
                    if (have.has(dupe)) {
                        skipped++;
                        continue;
                    }
                    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8), artKey = artKeyOf(d);
                    const pic = tags.picture;
                    if (((_c = pic === null || pic === void 0 ? void 0 : pic.data) === null || _c === void 0 ? void 0 : _c.length) && !artUrls.has(artKey)) {
                        const blob = new Blob([new Uint8Array(pic.data)], { type: pic.format || 'image/jpeg' });
                        yield done((yield store('art', 'readwrite')).put(blob, artKey));
                        artUrls.set(artKey, URL.createObjectURL(blob));
                    }
                    const record = Object.assign(Object.assign({ id }, d), { artKey, size: file.size, type: file.type || '', added: Date.now(), duration: 0 });
                    yield done((yield store('files', 'readwrite')).put(file, id));
                    yield done((yield store('tracks', 'readwrite')).put(record, id));
                    songs.set(id, item(record));
                    have.add(dupe);
                    added++;
                }
                catch (e) {
                    console.warn('Couldn’t add', file.name, e);
                    failed++;
                    if ((e === null || e === void 0 ? void 0 : e.name) === 'QuotaExceededError') {
                        failed += files.length - i - 1;
                        break;
                    } // the device is out of room
                }
            }
            onProgress(files.length, files.length, '');
            document.dispatchEvent(new CustomEvent('sb-music'));
            findPosters();
            return { added, skipped, failed, total: files.length };
        });
    }
    // Albums with no cover picture: their official artwork, saved with the tracks so it's there next time
    function findPosters() {
        return __awaiter(this, void 0, void 0, function* () {
            const M = window.StreamBoxMusic;
            if (!(M === null || M === void 0 ? void 0 : M.findArt))
                return;
            const missing = new Map();
            for (const s of songs.values())
                if (!s.art && s.artist !== 'Unknown Artist') {
                    const k = artKeyOf(s);
                    if (!missing.has(k))
                        missing.set(k, []);
                    missing.get(k).push(s);
                }
            for (const group of missing.values()) {
                const s = group[0], art = yield M.findArt(s.albumArtist || s.artist, s.album || s.name);
                if (!art)
                    continue;
                for (const t of group)
                    yield update(t.id, { artUrl: art });
                document.dispatchEvent(new CustomEvent('sb-music'));
            }
        });
    }
    function update(id, patch) {
        return __awaiter(this, void 0, void 0, function* () {
            const s = yield store('tracks', 'readwrite'), t = yield done(s.get(id));
            if (!t)
                return;
            const next = Object.assign(Object.assign({}, t), patch);
            yield done((yield store('tracks', 'readwrite')).put(next, id));
            songs.set(id, item(next));
        });
    }
    function remove(ids) {
        return __awaiter(this, void 0, void 0, function* () {
            for (const id of [].concat(ids)) {
                yield done((yield store('files', 'readwrite')).delete(id));
                yield done((yield store('tracks', 'readwrite')).delete(id));
                songs.delete(id);
            }
            const used = new Set([...songs.values()].map(artKeyOf));
            for (const [k, url] of artUrls)
                if (!used.has(k)) {
                    URL.revokeObjectURL(url);
                    artUrls.delete(k);
                    yield done((yield store('art', 'readwrite')).delete(k));
                }
            document.dispatchEvent(new CustomEvent('sb-music'));
        });
    }
    const file = (id) => __awaiter(void 0, void 0, void 0, function* () { return done((yield store('files')).get(id)); });
    function space() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const e = yield navigator.storage.estimate();
                return { used: e.usage || 0, free: Math.max(0, (e.quota || 0) - (e.usage || 0)) };
            }
            catch (_a) {
                return null;
            }
        });
    }
    window.StreamBoxMusicLocal = {
        load, add, remove, update, file, space, findPosters,
        get: id => songs.get(id) || null,
        all: () => [...songs.values()],
        get count() { return songs.size; },
        canPickFolder: 'webkitdirectory' in document.createElement('input'),
        describe, // for tests
    };
})();
