// Checks which channels in public/data/channels.json can load in a browser player, and writes
// playlists/probe.json, which build-channels.mjs merges in as flags on each channel:
//   verified -> v:1   manifest loads and a web page may read it (CORS ok)
//   noCors   -> nc:1  the stream is live but its server sends no CORS header (needs the proxy or VLC)
//   dead     -> dd:1  the manifest URL answers 404/410
//   node scripts/probe-streams.mjs [--limit N]
//   upgrade  -> the channel's http:// address also works over https://, so the build switches it (the app can
//               only play https). Recorded as the original http:// address.
// A stream is "verified" when its manifest answers 200, looks like HLS, and sends a CORS header that lets
// a web page read it. Channels listed with custom headers (user agent / referrer) are tried without them:
// a browser can't send those, so if the stream loads anyway the build stops treating it as VLC-only.
// Results depend on where this runs (region locks), so only positive results are kept.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const channels = JSON.parse(readFileSync(join(root, 'public/data/channels.json'), 'utf8'));
const li = process.argv.indexOf('--limit');
const limit = li > -1 ? +process.argv[li + 1] : Infinity;
const targets = channels.filter(c => !c.p && /^https?:\/\//.test(c.u)).slice(0, limit);
const CONCURRENCY = 150, TIMEOUT = 8000, ORIGIN = 'https://streambox.example';

const tally = {};
const count = k => (tally[k] = (tally[k] || 0) + 1);
const verified = [], noCors = [], dead = [], upgrade = [];

async function probe(c) {
  const wasHttp = c.u.startsWith('http://');
  const url = c.u.replace(/^http:/, 'https:');
  const tag = wasHttp ? 'http→https: ' : c.h ? 'no headers: ' : '';
  try {
    const res = await fetch(url, { headers: { Origin: ORIGIN, 'User-Agent': 'Mozilla/5.0 StreamBoxProbe' }, signal: AbortSignal.timeout(TIMEOUT), redirect: 'follow' });
    if (!res.ok) { if (!wasHttp && (res.status === 404 || res.status === 410)) dead.push(c.u); return count(`${tag}http ${res.status >= 500 ? '5xx' : res.status}`); }
    if (!res.url.startsWith('https://')) return count(`${tag}redirects to http`);
    const acao = res.headers.get('access-control-allow-origin');
    const text = (await res.text()).slice(0, 20000);
    if (!text.startsWith('#EXTM3U')) return count(`${tag}not an HLS manifest`);
    if (/^http:\/\//m.test(text)) return count(`${tag}manifest points at http`);   // its parts would still be blocked on an https page
    if (wasHttp || c.up) upgrade.push(c.u.replace(/^https:/, 'http:'));
    if (acao !== '*' && acao !== ORIGIN) { noCors.push(url); return count(`${tag}no CORS header`); }
    verified.push(url); count(`${tag}verified`);
  } catch (e) { count(`${tag}${e.name === 'TimeoutError' ? 'timeout' : 'network error'}`); }
}

let i = 0, done = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (i < targets.length) {
    await probe(targets[i++]);
    if (++done % 500 === 0) console.error(`${done}/${targets.length}`);
  }
}));

writeFileSync(join(root, 'playlists/probe.json'), JSON.stringify({ verified: verified.sort(), noCors: noCors.sort(), dead: dead.sort(), upgrade: upgrade.sort() }));
console.log(`probed ${targets.length} channels`, Object.fromEntries(Object.entries(tally).sort((a, b) => b[1] - a[1])));
