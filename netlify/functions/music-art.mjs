// Album posters for the Music section: the official artwork of an album (or a single), looked up by artist and
// album name in Apple's public catalogue search (the iTunes Search API, which needs no key). Used for music that has
// no picture of its own: your own files without embedded covers, and songs from free sources that come without one.
//
//   GET /api/music-art?artist=Radiohead&album=OK%20Computer   ->   { "art": "https://…/600x600bb.jpg" }   ({} if none)
//
// Only the artwork address comes back; nothing is played from Apple. Answers are cached for a week.

const SEARCH = 'https://itunes.apple.com/search';
const TIMEOUT = 5000;
const text = (v, max = 100) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const httpsUrl = v => (typeof v === 'string' && /^https:\/\/[^\s"'<>]+$/.test(v) ? v : '');
// Words of a name, lower case, "&" read as "and", without "The", punctuation and bracketed extras ("(Remastered 2011)", "[Deluxe]")
const words = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[([][^)\]]*[)\]]/g, ' ').replace(/^the\s+/, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const same = (a, b) => { const x = words(a).join(' '), y = words(b).join(' '); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };
// The artist must be the same one, or one of those credited ("A & B", "A feat. B"): "Radiohead Tribute Band" isn't Radiohead
const sameArtist = (credited, wanted) => {
  const want = words(wanted).join(' ');
  return !!want && [String(credited || ''), ...String(credited || '').split(/\s*(?:&|,|\/|\band\b|\bfeat\.?|\bfeaturing\b|\bft\.?|\bwith\b|\bx\b)\s*/i)].some(part => words(part).join(' ') === want);
};

// The best result: the artist has to match, then the album (or the song, for singles) as closely as possible
export function pickArt(results, artist, album) {
  const scored = (Array.isArray(results) ? results : []).map(r => {
    if (!sameArtist(r?.artistName, artist)) return null;
    const title = r.collectionName || r.trackName || '';
    const score = same(title, album) ? (words(title).join(' ') === words(album).join(' ') ? 3 : 2) : 0;
    return score ? { score, art: httpsUrl(r.artworkUrl100) } : null;
  }).filter(r => r && r.art).sort((a, b) => b.score - a.score);
  return scored[0] ? scored[0].art.replace(/\/\d+x\d+bb\.(jpg|png)$/, '/600x600bb.$1') : '';
}

const json = (body, status = 200, maxAge = 604800) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${maxAge}` },
});

export function createHandler(fetcher = fetch) {
  return async function handler(request) {
    const url = new URL(request.url);
    const artist = text(url.searchParams.get('artist')), album = text(url.searchParams.get('album'));
    if (!artist || !album) return json({ error: 'artist and album are needed' }, 400, 0);
    const find = async entity => {
      const q = new URLSearchParams({ term: `${artist} ${album}`, entity, limit: '10', media: 'music' });
      const r = await fetcher(`${SEARCH}?${q}`, { signal: AbortSignal.timeout(TIMEOUT), headers: { accept: 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return pickArt((await r.json())?.results, artist, album);
    };
    try {
      const art = (await find('album')) || (await find('song'));   // an album, or failing that a single of that name
      return json(art ? { art } : {});
    } catch {
      return json({ error: 'Artwork search unavailable' }, 502, 0);
    }
  };
}

export default async function musicArt(request) {
  return createHandler()(request);
}

export const config = { path: '/api/music-art' };
