// TMDB client for the Apple TV pages. Calls TMDB straight from the browser with the app's key
// (window.StreamBoxArt.key(): the built-in key, or the one saved in Settings) and remembers answers.
// The pasted code expected a Netlify redirect that adds an Authorization header from an environment
// variable; Netlify can't do that for redirects, so the browser calls TMDB itself, as artwork.js already does.

const API = 'https://api.themoviedb.org/3';
export const REGION = 'AU';
const cache = new Map();

export const apiKey = () => globalThis.window?.StreamBoxArt?.key?.() || '';

export async function tmdb(path, params = {}) {
  const key = apiKey();
  if (!key) throw new Error('No TMDB key is set');
  const url = `${API}/${path}?${new URLSearchParams({ api_key: key, language: 'en-AU', ...params })}`;
  if (!cache.has(url)) {
    const request = fetch(url).then(res => {
      if (res.status === 401) throw new Error('TMDB did not accept the API key');
      if (!res.ok) throw new Error(`TMDB error ${res.status}`);
      return res.json();
    });
    request.catch(() => cache.delete(url));   // a failure is never remembered
    cache.set(url, request);
  }
  return cache.get(url);
}

export const api = {
  trending: (page = 1) => tmdb('trending/movie/week', { page }),
  popular: (page = 1) => tmdb('movie/popular', { page, region: REGION }),
  topRated: (page = 1) => tmdb('movie/top_rated', { page, region: REGION }),
  genreList: () => tmdb('genre/movie/list'),
  discover: (genreId, page = 1) => tmdb('discover/movie', { with_genres: genreId, sort_by: 'popularity.desc', include_adult: false, page, region: REGION }),
  // One request carries everything the title page needs
  movie: id => tmdb(`movie/${encodeURIComponent(id)}`, { append_to_response: 'credits,videos,watch/providers,release_dates,recommendations,similar', include_video_language: 'en,null' }),
};

export const clearCache = () => cache.clear();
