// YouTube Music for the Music section, fetched the way the open-source streaming apps in
// https://github.com/chayotic/Open-Source-Music-Streaming-Apps do it: through community Piped
// instances that front YouTube Music, prioritised over the open sources in public/js/music.js.
// This function sits on the site so the browser doesn't need any instance to send CORS headers,
// and it tries the instances in order until one answers.
//
//   ?op=search&q=...&filter=music_songs|music_playlists   songs or playlists matching a search
//   ?op=trending                                          today's chart songs
//   ?op=playlist&id=PL...                                 the tracks of a playlist
//   ?op=streams&id=<videoId>                              a verified playable https audio address,
//                                                         or nothing when no instance can provide one
//                                                         (the app then plays the song from Audius)
//
// Every op is an allowlisted GET; nothing from the request is passed through except these values.

const PIPED = ['https://api.piped.private.coffee', 'https://pipedapi.ducks.party', 'https://pipedapi.adminforge.de'];
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const FILTERS = new Set(['music_songs', 'music_playlists']);
const CHARTS_QUERY = 'global top 50 songs';   // answered with today's chart hits by YouTube Music search
const TIMEOUT = 4000;

const httpsUrl = v => (typeof v === 'string' && /^https:\/\/[^\s"'<>]+$/.test(v) ? v : '');
const text = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const seconds = v => (Number.isFinite(v) && v > 0 ? Math.min(Math.round(v), 360000) : 0);

// ---- normalisers: turn what the backends send into the few fields the app keeps
export function songFromPiped(v) {
  const id = text(String(v?.url || '').match(/[?&]v=([\w-]{11})/)?.[1] || '', 16);
  if (!id || !text(v?.title)) return null;
  return { id, name: text(v.title), artist: text(v.uploaderName), art: httpsUrl(v.thumbnail), duration: seconds(v.duration), src: 'yt' };
}
export function playlistFromSearch(p) {
  const id = text(String(p?.url || '').match(/[?&]list=([\w-]{10,64})/)?.[1] || '', 64);
  if (!id || !text(p?.name)) return null;
  return { id, name: text(p.name), by: text(p.uploaderName), art: httpsUrl(p.thumbnail), count: Number.isFinite(p.videos) ? p.videos : 0, src: 'yt' };
}
export function playlistDetail(r) {
  const info = r && text(r.name) ? { name: text(r.name), by: text(r.uploader), art: httpsUrl(r.thumbnailUrl) || httpsUrl(r.thumbnail), src: 'yt' } : null;
  // A Piped playlist detail counts its videos in "videos" and lists the tracks in "relatedStreams"
  const streams = (Array.isArray(r?.relatedStreams) && r.relatedStreams.length ? r.relatedStreams : Array.isArray(r?.videos) ? r.videos : []);
  return { info, count: Number.isFinite(r?.videos) ? r.videos : streams.length, videos: streams.map(songFromPiped).filter(Boolean) };
}
// The best audio of a Piped result: https only, preferring m4a (plays everywhere), loudest first
export function pickPipedAudio(streams) {
  const audio = (Array.isArray(streams) ? streams : []).filter(s => httpsUrl(s?.url) && String(s.mimeType || '').startsWith('audio/'));
  if (!audio.length) return '';
  const m4a = audio.filter(s => s.mimeType.startsWith('audio/mp4'));
  const pool = (m4a.length ? m4a : audio).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  return httpsUrl(pool[0].url);
}
// A proxied stream is only handed to the player once it has answered with real audio, not an error page
export const isAudio = (contentType, bytes) => (contentType || '').startsWith('audio/')
  || (!!bytes && !(bytes[0] === 0x3c || bytes[0] === 0x7b || bytes[0] === 0x5b));   // '<', '{', '['

// ---- backends: the first one that answers wins
const fetchJSON = async (url, timeout = TIMEOUT) => {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};
async function fromPiped(path) {
  for (const host of PIPED) {
    try {
      const data = await fetchJSON(host + path);
      // an error comes back as 200 + {"error": ...}; everything else is a real answer
      if (data && typeof data === 'object' && !data.error) return data;
    } catch { /* try the next instance */ }
  }
  return null;
}

// ---- ops
const ops = {
  async search({ q, filter }) {
    const f = FILTERS.has(filter) ? filter : 'music_songs';
    const data = await fromPiped(`/search?q=${encodeURIComponent(q)}&filter=${f}`);
    if (!data) return null;
    const map = f === 'music_playlists' ? playlistFromSearch : songFromPiped;
    return { items: (data.items || []).map(map).filter(Boolean).slice(0, 40) };
  },
  // YouTube Music's own charts aren't exposed by the backends, so the trending shelf is what its
  // search returns for a chart query, with the hour-long mixes and live streams filtered out.
  async trending() {
    const data = await fromPiped(`/search?q=${encodeURIComponent(CHARTS_QUERY)}&filter=music_songs`);
    if (!data) return null;
    return { items: (data.items || []).map(songFromPiped).filter(v => v && v.duration >= 60 && v.duration <= 700).slice(0, 30) };
  },
  async playlist({ id }) {
    const data = await fromPiped(`/playlists/${encodeURIComponent(id)}`);
    if (!data) return null;
    const { info, count, videos } = playlistDetail(data);
    if (!info) return null;
    return { ...info, count: count || videos.length, videos: videos.slice(0, 100) };
  },
  // An instance can answer with the song's details but no audio (YouTube blocks them from time to time),
  // so every instance is asked, at once, and the first verified audio address wins.
  async streams({ id }) {
    const tryHost = async host => {
      const data = await fetchJSON(`${host}/streams/${encodeURIComponent(id)}`);
      const url = data && !data.error && pickPipedAudio(data.audioStreams);
      if (!url) throw new Error('no audio');
      const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), headers: { 'user-agent': UA, range: 'bytes=0-999' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const probe = new Uint8Array(await r.arrayBuffer());
      if (!isAudio(r.headers.get('content-type'), probe)) throw new Error('not audio');
      return { url };
    };
    try { return await Promise.any(PIPED.map(tryHost)); } catch { return null; }
  },
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=600' },
});

export function createHandler() {
  return async function handler(request) {
    const url = new URL(request.url);
    const op = url.searchParams.get('op') || '';
    const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
    const filter = url.searchParams.get('filter') || '';
    const region = (url.searchParams.get('region') || '').trim();
    const id = url.searchParams.get('id') || '';

    if (!ops[op]) return json({ error: 'Unknown op' }, 400);
    if (op === 'search' && !q) return json({ error: 'Missing q' }, 400);
    if (op === 'streams' && !/^[A-Za-z0-9_-]{11}$/.test(id)) return json({ error: 'Bad id' }, 400);
    if (op === 'playlist' && !/^[\w-]{10,64}$/.test(id)) return json({ error: 'Bad id' }, 400);

    try {
      const out = await ops[op]({ q, filter, region, id });
      return out ? json(out) : json({ error: 'No backend answered' }, 502);
    } catch {
      return json({ error: 'Upstream failed' }, 502);
    }
  };
}

export default async function musicYt(request) {
  return createHandler()(request);
}

export const config = { path: '/api/music-yt' };
