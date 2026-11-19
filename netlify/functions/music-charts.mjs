// Top songs in Australia across the charts, for the top of the Music page:
//   Apple Music  most played on Apple Music in Australia (Apple's official chart feed)
//   iTunes       top song purchases in Australia (Apple's official iTunes feed)
//   Shazam       most Shazamed in Australia this week (the CSV Shazam offers for download on its chart page)
//   Deezer       Deezer Charts' "Top Australia" playlist (Deezer's public API)
// The four are merged into one ranking: a song scores more the higher it is on each chart, and the more charts it is on.
// Every song keeps its official artwork (Apple's, or Deezer's album cover). Only names, ranks and artwork come back;
// songs are played elsewhere (YouTube's official player, through the OpenTune search). ARIA and Spotify publish their
// charts only as web pages or behind a sign-in, so they aren't used.
//
//   GET /api/music-charts  ->  { updated, sources: [{ id, name, count }], items: [{ rank, name, artist, art, charts: { apple: 3, ... } }] }

import { pickArt } from './music-art.mjs';

const TIMEOUT = 6000;
const SOURCES = [
  { id: 'apple', name: 'Apple Music', url: 'https://rss.marketingtools.apple.com/api/v2/au/music/most-played/100/songs.json', type: 'json' },
  { id: 'itunes', name: 'iTunes', url: 'https://itunes.apple.com/au/rss/topsongs/limit=100/json', type: 'json' },
  { id: 'shazam', name: 'Shazam', url: 'https://www.shazam.com/services/charts/csv/top-200/australia', type: 'text' },
  { id: 'deezer', name: 'Deezer', url: 'https://api.deezer.com/playlist/1313616925/tracks?limit=100', type: 'json' },   // "Top Australia" by Deezer Charts
];
const text = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const httpsUrl = v => (typeof v === 'string' && /^https:\/\/[^\s"'<>]+$/.test(v) ? v : '');
const big = url => httpsUrl(url).replace(/\/\d+x\d+bb\.(jpg|png)$/, '/600x600bb.$1');

// ---- each chart as [{ rank, name, artist, art }]
export const parseApple = d => (d?.feed?.results || []).map((r, i) => ({ rank: i + 1, name: text(r.name), artist: text(r.artistName), art: big(r.artworkUrl100) }));
export const parseItunes = d => (d?.feed?.entry || []).map((e, i) => ({ rank: i + 1, name: text(e['im:name']?.label), artist: text(e['im:artist']?.label), art: big([].concat(e['im:image'] || []).pop()?.label) }));
export const parseDeezer = d => (d?.data || []).map((t, i) => ({ rank: i + 1, name: text(t.title), artist: text(t.artist?.name), art: httpsUrl(t.album?.cover_xl) || httpsUrl(t.album?.cover_big) }));
export function parseShazam(csv) {
  const rows = [];
  for (const line of String(csv || '').replace(/^﻿/, '').split(/\r?\n/)) {
    const cells = [...line.matchAll(/("([^"]|"")*"|[^,]*)(,|$)/g)].map(m => m[1].replace(/^"|"$/g, '').replace(/""/g, '"')).slice(0, 3);
    if (/^\d+$/.test(cells[0]) && cells[2]) rows.push({ rank: +cells[0], name: text(cells[2]), artist: text(cells[1]), art: '' });
  }
  return rows;
}

// ---- matching the same song across charts: the title without extras, and the main artist
const plain = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[([][^)\]]*[)\]]/g, ' ').replace(/\s[-–]\s.*$/, ' ').replace(/\b(feat|ft|featuring|with)\b.*$/, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const mainArtist = s => plain(String(s || '').split(/,|&|\bx\b|\bfeat\.?|\bft\.?|\bwith\b|\band\b/i)[0]);
export const songKey = (name, artist) => `${plain(name)}|${mainArtist(artist)}`;

// The combined chart. lists: { apple: [...], itunes: [...], ... }; the first source listed for a song names it.
export function combine(lists, limit = 100) {
  const songs = new Map();
  for (const source of SOURCES) {
    for (const s of (lists[source.id] || []).slice(0, 100)) {
      if (!s.name || !s.artist) continue;
      const key = songKey(s.name, s.artist);
      if (!songs.has(key)) songs.set(key, { name: s.name, artist: s.artist, art: '', charts: {}, score: 0 });
      const song = songs.get(key);
      if (song.charts[source.id]) continue;
      song.charts[source.id] = s.rank;
      song.score += 101 - s.rank;
      if (!song.art && s.art) song.art = s.art;
    }
  }
  const best = s => Math.min(...Object.values(s.charts));
  return [...songs.values()].sort((a, b) => b.score - a.score || best(a) - best(b)).slice(0, limit)
    .map((s, i) => ({ rank: i + 1, name: s.name, artist: s.artist, art: s.art, charts: s.charts }));
}

const json = (body, status = 200, maxAge = 3600) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${maxAge}` },
});

export function createHandler(fetcher = fetch) {
  return async function handler() {
    const lists = {}, sources = [];
    await Promise.all(SOURCES.map(async src => {
      try {
        const r = await fetcher(src.url, { signal: AbortSignal.timeout(TIMEOUT), headers: { accept: src.type === 'json' ? 'application/json' : 'text/csv', 'user-agent': 'Mozilla/5.0 (StreamBox charts)' } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const body = src.type === 'json' ? await r.json() : await r.text();
        lists[src.id] = { apple: parseApple, itunes: parseItunes, shazam: parseShazam, deezer: parseDeezer }[src.id](body);
      } catch { lists[src.id] = []; }
    }));
    for (const src of SOURCES) if (lists[src.id].length) sources.push({ id: src.id, name: src.name, count: lists[src.id].length });
    if (!sources.length) return json({ error: 'No chart answered' }, 502, 0);
    const items = combine(lists);
    // Songs only Shazam lists come without a picture: their official artwork from Apple's catalogue search
    await Promise.all(items.filter(s => !s.art).map(async s => {
      try {
        const q = new URLSearchParams({ term: `${s.artist} ${s.name}`, entity: 'song', limit: '10', media: 'music', country: 'au' });
        const r = await fetcher(`https://itunes.apple.com/search?${q}`, { signal: AbortSignal.timeout(TIMEOUT) });
        if (r.ok) s.art = pickArt((await r.json())?.results, s.artist.split(/,|&/)[0], s.name);
      } catch { /* the tile shows a music note instead */ }
    }));
    return json({ updated: new Date().toISOString(), sources, items });
  };
}

export default async function musicCharts(request) {
  return createHandler()(request);
}

export const config = { path: '/api/music-charts' };
