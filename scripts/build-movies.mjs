// Normalize the upstream lists into a local movie catalog, without remote artwork.
// Usage: node scripts/build-movies.mjs [--source /path/to/KiduyuTv_final]
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const revision = 'c432c7338a9ba19e7095ee67a1deeef238136873';
const sourceIndex = process.argv.indexOf('--source');
const source = sourceIndex >= 0 ? process.argv[sourceIndex + 1] : null;
if (sourceIndex >= 0 && !source) throw new Error('--source requires a checkout path');
if (source && execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() !== revision) {
  throw new Error('The source checkout must match the pinned catalog revision: ' + revision);
}
const lists = [
  ['oscar', 'Oscar Contenders 2026', 'oscar_winners_2026'],
  ['hp', 'Harry Potter', 'harry_potter_collection'],
  ['mcu', 'Marvel Cinematic Universe', 'marvel_cinematic_universe'],
  ['bond', 'James Bond', 'james_bond_collection'],
  ['pirates', 'Pirates of the Caribbean', 'pirates_of_the_caribbean'],
  ['statham', 'Jason Statham', 'jason_statham_movies'],
  ['time_travel', 'Time Travel', 'time_travel_movies'],
  ['horror', 'Popular Horror', 'popular_horror'],
  ['classics', 'Classic Cinema', 'best_classics'],
  ['hallmark', 'Hallmark', 'hallmark_movies'],
  ['christian', 'Christian Movies', 'christian_movies'],
  ['bible', 'Movies from the Bible', 'movies_from_the_bible'],
  ['true_story', 'True Story Movies', 'true_story_movies'],
];
const today = new Date().toISOString().slice(0, 10);
const collections = await Promise.all(lists.map(async ([id, title, file]) => {
  let data;
  if (source) data = JSON.parse(await readFile(path.join(source, 'lists', file + '.json'), 'utf8'));
  else {
    const res = await fetch(`https://raw.githubusercontent.com/kiduyu-klaus/KiduyuTv_final/${revision}/lists/${file}.json`);
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    data = await res.json();
  }
  const seen = new Set();
  const movies = data.filter(m => {
    // TV IDs must never be sent to movie providers; unreleased titles have no movie yet.
    if (!Number.isSafeInteger(m.id) || m.id <= 0 || !m.title || m.mediaType === 'tv' || m.firstAirDate ||
      (m.genreIds || []).some(g => g >= 10759 && g <= 10768) ||
      !m.releaseDate || m.releaseDate > today || seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  }).map(m => ({ id: m.id, name: m.title, overview: m.overview || '', year: m.releaseDate.slice(0, 4),
    vote: Math.round((Number(m.voteAverage) || 0) * 10) / 10 }));
  return { id, title, movies };
}));
const output = fileURLToPath(new URL('../public/data/movies.json', import.meta.url));
await writeFile(output, JSON.stringify({ source: 'https://github.com/kiduyu-klaus/KiduyuTv_final', revision, collections }) + '\n');
console.log(`Saved ${new Set(collections.flatMap(c => c.movies.map(m => m.id))).size} movies in ${collections.length} collections`);
