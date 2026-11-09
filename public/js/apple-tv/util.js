// Small helpers shared by the Apple TV pages. Pure functions, so they are easy to test.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function formatRuntime(minutes) {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function formatDate(value, options = { year: 'numeric', month: 'long', day: 'numeric' }) {
  const d = new Date(value);
  return value && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-AU', options) : '';
}

export function getYear(value) {
  if (!value) return '';
  const year = new Date(value).getFullYear();
  return Number.isFinite(year) ? String(year) : '';
}

export function formatMoney(n) {
  if (!n || n < 0) return '';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n}`;
}

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export function throttle(fn, ms) {
  let waiting = false;
  return (...args) => { if (waiting) return; waiting = true; fn(...args); setTimeout(() => { waiting = false; }, ms); };
}

// Age rating for a region (falls back to the US one when the region has none)
export function certification(releaseDates, region = 'AU') {
  const results = releaseDates?.results || [];
  for (const code of [region, 'US']) {
    const entry = results.find(r => r.iso_3166_1 === code);
    const cert = entry?.release_dates?.map(d => d.certification).find(Boolean);
    if (cert) return cert;
  }
  return '';
}

// The best trailer: an official YouTube trailer first, then any YouTube trailer, then any YouTube video
export function trailerOf(videos) {
  const list = (videos?.results || []).filter(v => v.site === 'YouTube' && v.key);
  return list.find(v => v.type === 'Trailer' && v.official) || list.find(v => v.type === 'Trailer') || list.find(v => v.type === 'Teaser') || list[0] || null;
}

// Where a title can be watched in a region, grouped. `link` is the JustWatch page for it.
export function providerGroups(watchProviders, region = 'AU') {
  const entry = watchProviders?.results?.[region];
  if (!entry) return { link: '', groups: [] };
  const uniq = list => (list || []).filter((p, i, a) => a.findIndex(q => q.provider_id === p.provider_id) === i);
  const groups = [
    { label: 'Included with a subscription', kind: 'stream', list: uniq(entry.flatrate) },
    { label: 'Free to watch', kind: 'free', list: uniq([...(entry.free || []), ...(entry.ads || [])]) },
    { label: 'Rent', kind: 'rent', list: uniq(entry.rent) },
    { label: 'Buy', kind: 'buy', list: uniq(entry.buy) },
  ].filter(g => g.list.length);
  return { link: typeof entry.link === 'string' && entry.link.startsWith('https://') ? entry.link : '', groups };
}

// Only badges that are true of the data: no guessing at 4K / HDR / Dolby
export function movieBadges(movie, cert = '') {
  const badges = [];
  if (movie?.vote_average >= 8 && movie?.vote_count >= 500) badges.push({ label: 'Top Rated', kind: 'rating' });
  if (cert) badges.push({ label: cert, kind: 'cert' });
  return badges;
}

// The shape StreamBox keeps for a title in My List
export function toItem(movie) {
  return {
    key: 't:' + movie.id, type: 'title', id: String(movie.id), cat: 'Movies',
    name: movie.title || movie.original_title || 'Untitled',
    year: getYear(movie.release_date),
    vote: movie.vote_average ? movie.vote_average.toFixed(1) : '',
    poster: movie.poster_path || '',
  };
}
