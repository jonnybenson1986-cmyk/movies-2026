// Checks which channels in public/data/channels.json can load in a browser player, and writes
// playlists/probe.json (a list of verified stream URLs) which build-channels.mjs merges in as `v: 1`.
//   node scripts/probe-streams.mjs [--limit N]
// A stream is "verified" when its manifest answers 200, looks like HLS, and sends a CORS header that lets
// a web page read it. Results depend on where this runs (region locks), so only positive results are kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const channels = JSON.parse(readFileSync(join(root, 'public/data/channels.json'), 'utf8'));
const li = process.argv.indexOf('--limit');
const limit = li > -1 ? +process.argv[li + 1] : Infinity;
const targets = channels.filter(c => !c.p && !c.h && c.u.startsWith('https://')).slice(0, limit);
const CONCURRENCY = 40, TIMEOUT = 8000, ORIGIN = 'https://streambox.example';

const tally = {};
const count = k => (tally[k] = (tally[k] || 0) + 1);
const verified = [];

async function probe(c) {
  try {
    const res = await fetch(c.u, { headers: { Origin: ORIGIN, 'User-Agent': 'Mozilla/5.0 StreamBoxProbe' }, signal: AbortSignal.timeout(TIMEOUT), redirect: 'follow' });
    if (!res.ok) return count(`http ${res.status >= 500 ? '5xx' : res.status}`);
    const acao = res.headers.get('access-control-allow-origin');
    const head = (await res.text()).slice(0, 64);
    if (!head.startsWith('#EXTM3U')) return count('not an HLS manifest');
    if (acao !== '*' && acao !== ORIGIN) return count('no CORS header');
    verified.push(c.u); count('verified');
  } catch (e) { count(e.name === 'TimeoutError' ? 'timeout' : 'network error'); }
}

let i = 0, done = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (i < targets.length) {
    await probe(targets[i++]);
    if (++done % 500 === 0) console.error(`${done}/${targets.length}`);
  }
}));

writeFileSync(join(root, 'playlists/probe.json'), JSON.stringify(verified.sort()));
console.log(`probed ${targets.length} https channels`, Object.fromEntries(Object.entries(tally).sort((a, b) => b[1] - a[1])));
