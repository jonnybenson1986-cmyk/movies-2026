/**
 * Artwork Manager
 * URLs and <img>/<picture> elements for TMDB posters, backdrops and profile photos, with placeholders.
 * (From the Apple TV interface code; the fake WebP <source> entries were removed because TMDB serves
 * JPEG at these URLs, and a source labelled WebP that returns JPEG just confused browsers.)
 */

const IMAGE_BASE = 'https://image.tmdb.org/t/p';
const PLACEHOLDER_POSTER = '/images/poster-placeholder.svg';
const PLACEHOLDER_BACKDROP = '/images/backdrop-placeholder.svg';
const PLACEHOLDER_PROFILE = '/images/profile-placeholder.svg';

export const ArtworkSizes = {
  backdrop: { original: 'original', w300: 'w300', w780: 'w780', w1280: 'w1280', originalFallback: 'w1280' },
  poster: { original: 'original', w92: 'w92', w154: 'w154', w185: 'w185', w342: 'w342', w500: 'w500', w780: 'w780', originalFallback: 'w500' },
  profile: { original: 'original', w45: 'w45', w185: 'w185', h632: 'h632', originalFallback: 'w185' },
  still: { original: 'original', w92: 'w92', w185: 'w185', w300: 'w300', originalFallback: 'w300' },
};

export class ArtworkManager {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || IMAGE_BASE;
    this.posterSize = options.posterSize || 'w342';
    this.backdropSize = options.backdropSize || 'w1280';
    this.profileSize = options.profileSize || 'w185';
    this.placeholderPoster = options.placeholderPoster || PLACEHOLDER_POSTER;
    this.placeholderBackdrop = options.placeholderBackdrop || PLACEHOLDER_BACKDROP;
    this.placeholderProfile = options.placeholderProfile || PLACEHOLDER_PROFILE;
  }

  getPosterUrl(path, size = null) { return path ? `${this.baseUrl}/${size || this.posterSize}${path}` : this.placeholderPoster; }
  getBackdropUrl(path, size = null) { return path ? `${this.baseUrl}/${size || this.backdropSize}${path}` : this.placeholderBackdrop; }
  getProfileUrl(path, size = null) { return path ? `${this.baseUrl}/${size || this.profileSize}${path}` : this.placeholderProfile; }
  getStillUrl(path, size = null) { return path ? `${this.baseUrl}/${size || 'w300'}${path}` : this.placeholderBackdrop; }

  getResponsivePosterUrls(path) {
    if (!path) return { default: this.placeholderPoster };
    const urls = { default: `${this.baseUrl}/${this.posterSize}${path}` };
    for (const size of ['w92', 'w154', 'w185', 'w342', 'w500', 'w780']) urls[size] = `${this.baseUrl}/${size}${path}`;
    return urls;
  }

  getResponsiveBackdropUrls(path) {
    if (!path) return { default: this.placeholderBackdrop };
    const urls = { default: `${this.baseUrl}/${this.backdropSize}${path}` };
    for (const size of ['w300', 'w780', 'w1280']) urls[size] = `${this.baseUrl}/${size}${path}`;
    return urls;
  }

  createPosterElement(movie, options = {}) {
    const { size = this.posterSize, className = 'movie-poster', alt = '', loading = 'lazy', width = 342, height = 513, onError = null, onLoad = null } = options;
    const img = document.createElement('img');
    img.className = className;
    img.src = this.getPosterUrl(movie.poster_path, size);
    img.alt = alt || (movie.title ? `${movie.title} poster` : 'Movie poster');
    img.loading = loading; img.width = width; img.height = height;
    img.onerror = onError || (() => { img.src = this.placeholderPoster; });
    if (onLoad) img.onload = onLoad;
    return img;
  }

  createBackdropElement(movie, options = {}) {
    const { size = this.backdropSize, className = 'movie-backdrop', alt = '', loading = 'eager', onError = null } = options;
    const img = document.createElement('img');
    img.className = className;
    img.src = this.getBackdropUrl(movie.backdrop_path, size);
    img.alt = alt; img.loading = loading;
    img.onerror = onError || (() => { img.style.display = 'none'; });
    return img;
  }

  createProfileElement(person, options = {}) {
    const { size = this.profileSize, className = 'person-profile', alt = '', loading = 'lazy', onError = null } = options;
    const img = document.createElement('img');
    img.className = className;
    img.src = this.getProfileUrl(person.profile_path, size);
    img.alt = alt || (person.name ? `${person.name} profile` : 'Person profile');
    img.loading = loading;
    img.onerror = onError || (() => { img.src = this.placeholderProfile; });
    return img;
  }

  preload(url) {
    return new Promise((resolve, reject) => { const img = new Image(); img.onload = resolve; img.onerror = reject; img.src = url; });
  }
  preloadPoster(path, size = null) { return path ? this.preload(this.getPosterUrl(path, size)) : Promise.resolve(); }
  preloadBackdrop(path, size = null) { return path ? this.preload(this.getBackdropUrl(path, size)) : Promise.resolve(); }
  async preloadMovieArtwork(movie) {
    await Promise.allSettled([movie.poster_path && this.preloadPoster(movie.poster_path), movie.backdrop_path && this.preloadBackdrop(movie.backdrop_path)]);
  }
}

export const artworkManager = new ArtworkManager();

// A <picture> that picks a poster size to suit the screen
export function createPictureElement(movie, options = {}) {
  const { posterSize = 'w342', className = 'movie-poster-picture', alt = '', loading = 'lazy' } = options;
  const picture = document.createElement('picture');
  picture.className = className;
  if (movie.poster_path) {
    for (const { media, size } of [{ media: '(min-width: 1200px)', size: 'w500' }, { media: '(min-width: 768px)', size: 'w342' }, { media: '(min-width: 480px)', size: 'w185' }]) {
      const source = document.createElement('source');
      source.srcset = artworkManager.getPosterUrl(movie.poster_path, size);
      source.media = media;
      picture.appendChild(source);
    }
  }
  const img = document.createElement('img');
  img.src = movie.poster_path ? artworkManager.getPosterUrl(movie.poster_path, posterSize) : artworkManager.placeholderPoster;
  img.alt = alt || (movie.title ? `${movie.title} poster` : 'Movie poster');
  img.loading = loading; img.width = 342; img.height = 513;
  picture.appendChild(img);
  return picture;
}

export function createBackdropPictureElement(movie, options = {}) {
  const { backdropSize = 'w1280', className = 'movie-backdrop-picture', alt = '' } = options;
  const picture = document.createElement('picture');
  picture.className = className;
  if (movie.backdrop_path) {
    for (const { media, size } of [{ media: '(min-width: 1920px)', size: 'original' }, { media: '(min-width: 1280px)', size: 'w1280' }, { media: '(min-width: 768px)', size: 'w780' }]) {
      const source = document.createElement('source');
      source.srcset = artworkManager.getBackdropUrl(movie.backdrop_path, size);
      source.media = media;
      picture.appendChild(source);
    }
  }
  const img = document.createElement('img');
  img.src = movie.backdrop_path ? artworkManager.getBackdropUrl(movie.backdrop_path, 'w300') : artworkManager.placeholderBackdrop;
  img.alt = alt;
  picture.appendChild(img);
  return picture;
}
