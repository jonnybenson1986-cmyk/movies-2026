// What is saved for each signed-in person: My List, Continue Watching, favourite music, and where they are
// up to in videos. Everything arriving from a browser is re-built field by field here, so a stored account can
// only ever hold plain, size-limited data.

export const LIMITS = { mylist: 200, history: 30, music: 300, progress: 400, bytes: 400_000 };
const ITEM_TYPES = new Set(['live', 'movie']);
const TEXT = { name: 300, url: 1000, cat: 80, quality: 20, source: 80, logo: 1000, tvgId: 120, ua: 300, rf: 300, id: 120, catalog: 40, mediaType: 20, overview: 700, year: 8, vote: 8, embedId: 120, cc: 3 };

const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : typeof value === 'number' && Number.isFinite(value) ? String(value).slice(0, max) : '');
const num = (value, max) => (Number.isFinite(value) && value >= 0 ? Math.min(value, max) : 0);
// A timestamp from a browser can't be far in the future, or it would win every later comparison
const stamp = value => num(value, Date.now() + 3600e3);

export function cleanItem(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.key !== 'string' || !raw.key || !ITEM_TYPES.has(raw.type)) return null;
  const item = { key: text(raw.key, 120), type: raw.type };
  for (const [field, max] of Object.entries(TEXT)) { const v = text(raw[field], max); if (v) item[field] = v; }
  if (raw.needsHeaders === true) item.needsHeaders = true;
  for (const field of ['season', 'episode']) if (Number.isInteger(raw[field]) && raw[field] >= 0) item[field] = Math.min(raw[field], 9999);
  if (item.type === 'live' && !/^https?:\/\//.test(item.url || '')) return null;
  return item;
}

// A favourite song or radio station (see public/js/music.js for where they come from)
const MUSIC_TEXT = { id: 120, name: 300, artist: 300, genre: 80, src: 12, artistId: 40, album: 200 };
const httpsUrl = (value, max) => (typeof value === 'string' && value.length <= max && /^https:\/\/[^\s"'<>]+$/.test(value) ? value : '');
export function cleanMusicItem(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.key !== 'string' || !raw.key || (raw.type !== 'song' && raw.type !== 'radio')) return null;
  const item = { key: text(raw.key, 120), type: raw.type };
  for (const [field, max] of Object.entries(MUSIC_TEXT)) { const v = text(raw[field], max); if (v) item[field] = v; }
  if (!item.id || !item.name) return null;
  const art = httpsUrl(raw.art, 600); if (art) item.art = art;
  const url = httpsUrl(raw.url, 1000); if (url) item.url = url;
  // A station is its stream address, and so is a song from anywhere but Audius (those are played by their id)
  if (!item.url && (item.type === 'radio' || (item.src && item.src !== 'audius'))) return null;
  if (Number.isFinite(raw.duration) && raw.duration > 0) item.duration = Math.min(Math.round(raw.duration), 1e6);
  return item;
}

export function cleanList(list, limit, clean = cleanItem) {
  const seen = new Set(), out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const item = clean(raw);
    if (!item || seen.has(item.key)) continue;
    seen.add(item.key); out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

// { key: { t: seconds watched to, d: length in seconds, at: when } }
export function cleanProgress(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
  const entries = [];
  for (const [key, v] of Object.entries(map)) {
    if (!key || key.length > 120 || !v || typeof v !== 'object') continue;
    if (!Number.isFinite(v.t) || v.t < 0) continue;
    // t: 0 means "finished or barely started"; it is kept so an older saved place can't come back
    entries.push([key, { t: Math.round(num(v.t, 1e6)), d: Math.round(num(v.d, 1e6)), at: stamp(v.at) }]);
  }
  return Object.fromEntries(entries.sort((a, b) => b[1].at - a[1].at).slice(0, LIMITS.progress));
}

export const EMPTY = () => ({ v: 1, mylist: { at: 0, items: [] }, history: { at: 0, items: [] }, music: { at: 0, items: [] }, progress: {} });
const LISTS = ['mylist', 'history', 'music'];

// Clean whatever fields are present. Absent fields stay absent (a partial update).
export function cleanData(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const name of LISTS) {
    if (raw[name] && typeof raw[name] === 'object') out[name] = { at: stamp(raw[name].at), items: cleanList(raw[name].items, LIMITS[name], name === 'music' ? cleanMusicItem : cleanItem) };
  }
  if (raw.progress && typeof raw.progress === 'object') out.progress = cleanProgress(raw.progress);
  return out;
}

// Lists: the newer whole list wins. Progress: per video, the most recent position wins.
export function mergeData(stored, incoming) {
  const base = { ...EMPTY(), ...cleanData(stored) };
  const out = { ...base };
  for (const name of LISTS) if (incoming[name] && incoming[name].at >= base[name].at) out[name] = incoming[name];
  if (incoming.progress) {
    const merged = { ...base.progress };
    for (const [key, v] of Object.entries(incoming.progress)) if (!merged[key] || v.at >= merged[key].at) merged[key] = v;
    out.progress = cleanProgress(merged);
  }
  return out;
}
