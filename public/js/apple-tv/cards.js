import { esc } from './util.js';
import { artworkManager } from './artwork-manager.js';

const tile = name => {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) | 0;
  h = Math.abs(h) % 360;
  return `linear-gradient(150deg, hsl(${h} 34% 27%), hsl(${(h + 30) % 360} 38% 10%))`;
};

// A poster card for a title. Same look as the other poster cards; clicking it opens the title page.
export function card(item) {
  const meta = [item.year, item.vote ? '★ ' + item.vote : ''].filter(Boolean).join(' · ');
  const art = item.poster
    ? `<img class="art-img" loading="lazy" decoding="async" src="${esc(artworkManager.getPosterUrl(item.poster, 'w342'))}" alt="" onerror="this.parentElement.classList.remove('has-art');this.remove()">`
    : '';
  return `<button class="card apple poster title-card" data-key="${esc(item.key)}" aria-label="${esc(item.name)}${item.year ? ', ' + esc(item.year) : ''}">
    <span class="art${item.poster ? ' has-art' : ''}" style="--tile:${tile(item.name)}">${art}
      <span class="art-year">${esc(item.year)}</span><span class="art-title">${esc(item.name)}</span></span>
    <span class="caption"><span class="name">${esc(item.name)}</span><span class="meta">${esc(meta)}</span></span></button>`;
}
