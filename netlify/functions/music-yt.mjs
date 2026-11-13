// YouTube Music for the Music section, fetched the way the open-source streaming apps in
// https://github.com/chayotic/Open-Source-Music-Streaming-Apps do it: through community Piped
// instances that front YouTube Music, prioritised over the open sources in public/js/music.js.
// This function sits on the site so the browser doesn't need any instance to send CORS headers,
// and it tries the instances in order until one answers.
//
//   ?op=search&q=...&filter=music_songs|music_playlists|videos   songs, playlists or regular YouTube videos
//   ?op=charts&region=au                                  Apple Music's Top Songs chart for a country, today
//   ?op=trending                                          the same chart (kept for older copies of the app)
//   ?op=playlist&id=PL...                                 the tracks of a playlist
// Songs play in YouTube's own embedded player (the IFrame Player API) by their video id; nothing here hands out
// audio addresses.
//
// Every op is an allowlisted GET; nothing from the request is passed through except these values.

const PIPED = ['https://api.piped.private.coffee', 'https://pipedapi.ducks.party', 'https://pipedapi.adminforge.de'];
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const FILTERS = new Set(['music_songs', 'music_playlists', 'videos']);   // videos: regular YouTube, not only YouTube Music
// Apple's official chart feed: the most-played songs on Apple Music in a country, refreshed daily, with official artwork
const APPLE_CHARTS = cc => `https://rss.marketingtools.apple.com/api/v2/${cc}/music/most-played/100/songs.json`;
const COUNTRIES = new Set(['au', 'nz', 'us', 'gb', 'ca', 'ie', 'za', 'in', 'sg', 'ph', 'jp', 'kr', 'de', 'fr', 'es', 'it', 'nl', 'se', 'br', 'mx']);
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
// One song of Apple's chart: the largest official artwork, and its Apple id (used for the official 30-second preview)
export function chartSong(r, rank) {
  const id = text(String(r?.id || ''), 20);
  if (!/^\d{1,20}$/.test(id) || !text(r?.name)) return null;
  const art = httpsUrl(r.artworkUrl100).replace(/\/\d+x\d+bb\.(jpg|png)$/, '/600x600bb.$1');
  const genre = text((Array.isArray(r.genres) ? r.genres : []).map(g => g?.name).find(n => n && n !== 'Music') || '', 60);
  return { id, rank, name: text(r.name), artist: text(r.artistName), art, genre, released: text(r.releaseDate, 10), src: 'chart' };
}

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
  // Today's real chart, from Apple (YouTube Music's own charts aren't exposed by the backends, and searching for
  // "top songs" returned remixes and compilations rather than the chart)
  async charts({ region }) {
    const cc = COUNTRIES.has(region) ? region : 'au';
    const data = await fetchJSON(APPLE_CHARTS(cc), 6000).catch(() => null);
    const items = (data?.feed?.results || []).map((r, i) => chartSong(r, i + 1)).filter(Boolean);
    return items.length ? { region: cc, updated: text(data.feed.updated, 60), items } : null;
  },
  trending(args) { return ops.charts(args); },
  async playlist({ id }) {
    const data = await fromPiped(`/playlists/${encodeURIComponent(id)}`);
    if (!data) return null;
    const { info, count, videos } = playlistDetail(data);
    if (!info) return null;
    return { ...info, count: count || videos.length, videos: videos.slice(0, 100) };
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
    const region = (url.searchParams.get('region') || '').trim().toLowerCase();
    const id = url.searchParams.get('id') || '';

    if (!ops[op]) return json({ error: 'Unknown op' }, 400);
    if (op === 'search' && !q) return json({ error: 'Missing q' }, 400);
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
