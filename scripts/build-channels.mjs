// Builds public/data/channels.json for the app from playlists/*.m3u and playlists/*.xspf (VLC).
//   node scripts/build-channels.mjs           use the playlists in the repo
//   node scripts/build-channels.mjs --fetch   first refresh the playlists from their sources (used on every Netlify deploy)
// Sources: iptv-org (publicly available channels worldwide), Free-TV/IPTV (free-to-air and free ad-supported
// channels), and the free ad-supported services Samsung TV Plus, Pluto TV, Roku and Tubi (generated playlists).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const decode = s => s
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
  .replace(/&amp;/g, '&').trim();

const CATEGORIES = [
  ['Sports', /sport|espn|racing|golf|nba|nfl|nhl|mlb|ufc|wwe|fight|football|soccer|cricket|tennis|f1|motor|olympic|futbol|fútbol|deportes|bein|eurosport|arena|stadium|tvg|fox sports|dazn/i],
  ['News', /news|cnn|bbc world|al jazeera|euronews|bloomberg|cnbc|sky news|france 24|dw |nbc news|abc news|cbs news|noticias|nachrichten|haber|24\/7|weather/i],
  ['Movies', /movie|film|cinema|cine|kino|hollywood|bollywood|thriller|horror|western|action|classic tv|flix|scream|crime/i],
  ['Kids', /kid|cartoon|anime|junior|toon|baby|nick|disney|cbeebies|pbs kids|family|pokemon|spongebob|teletubbies|garfield/i],
  ['Music', /music|mtv|vevo|radio|hits|\bfm\b|rock|jazz|hip hop|country|karaoke|concert|vh1|clubbing/i],
  ['Documentary', /docu|history|nature|science|discovery|nat geo|wild|animal|planet|space|explore|curiosity/i],
  ['Comedy & Series', /comedy|sitcom|series|drama|replay|novela|reality|tv land|game show|retro|80s|90s|00s|star trek|baywatch/i],
  ['Lifestyle', /food|cook|kitchen|travel|home|garden|fashion|lifestyle|outdoor|fishing|hunting|auto|car|tastemade/i],
  ['Religious', /church|god|gospel|christ|islam|quran|bible|faith|catholic|daystar|tbn|hope|ewtn/i],
];

const MERGE = {
  Series: 'Comedy & Series', Comedy: 'Comedy & Series', Classic: 'Movies',
  Business: 'News', Legislative: 'News', Family: 'Kids', Animation: 'Kids',
  Cooking: 'Lifestyle', Travel: 'Lifestyle', Outdoor: 'Lifestyle', Auto: 'Lifestyle', Relax: 'Lifestyle',
  Education: 'Documentary', Science: 'Documentary', Culture: 'Documentary',
  Shop: 'Lifestyle', Weather: 'News', Public: 'News', Interactive: 'Entertainment',
};

const sourceOf = url => {
  if (/jmp2\.uk\/plu-|pluto/i.test(url)) return 'Pluto TV';
  if (/jmp2\.uk\/stvp-|samsung/i.test(url)) return 'Samsung TV Plus';
  if (/jmp2\.uk\/rok-/i.test(url)) return 'Roku';
  if (/tubi/i.test(url)) return 'Tubi';
  if (/roku/i.test(url)) return 'Roku';
  if (/plex/i.test(url)) return 'Plex';
  return '';
};

const FAST = 'https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/refs/heads/main/playlists';
// file in playlists/  ->  where it is refreshed from
const SOURCES = {
  'iptv-org.m3u': 'https://iptv-org.github.io/iptv/index.m3u',
  'free-tv.m3u': 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8',
  'fast-samsung.m3u': `${FAST}/samsungtvplus_all.m3u`,
  'fast-pluto.m3u': `${FAST}/plutotv_all.m3u`,
  'fast-roku.m3u': `${FAST}/roku_all.m3u`,
  'fast-tubi.m3u': `${FAST}/tubi_all.m3u`,
};
// How each extra playlist is read. countryGroups: its groups are countries, not kinds of channel. cc: every channel's country.
const EXTRA = {
  'free-tv.m3u': { countryGroups: true },
  'fast-samsung.m3u': { countryGroups: true }, 'fast-pluto.m3u': { countryGroups: true },
  'fast-roku.m3u': { cc: 'us' }, 'fast-tubi.m3u': { cc: 'us' },
};
if (process.argv.includes('--fetch')) {
  for (const [file, url] of Object.entries(SOURCES)) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      if (!res.ok || !text.startsWith('#EXTM3U')) throw new Error(`HTTP ${res.status}`);
      writeFileSync(join(root, 'playlists', file), text);
      console.log(`refreshed playlists/${file} (${(text.length / 1e6).toFixed(1)} MB)`);
    } catch (e) { console.warn(`could not refresh ${file} (${e.message}); using the copy in the repo`); }
  }
}

const channels = [];
const seen = new Set();
// URLs that scripts/probe-streams.mjs found loadable in a browser (manifest 200 + CORS); flagged `v: 1`
const probePath = join(root, 'playlists/probe.json');
const probe = existsSync(probePath) ? JSON.parse(readFileSync(probePath, 'utf8')) : {};
const verified = new Set(Array.isArray(probe) ? probe : probe.verified || []);   // (older probe files were a plain list)
const noCors = new Set(probe.noCors || []), dead = new Set(probe.dead || []);
// http:// streams whose server also answers on https:// (found by the probe): the app can only play https
const upgrade = new Set(probe.upgrade || []);

// Shared by both parsers. `raw` has name, url, group, quality?, tvgId?, logo?, ua?, rf?
function add({ name, url, group = '', quality = '', tvgId = '', logo = '', ua, rf, isPlaylist = false, cc = '', looseGroups = false }) {
  if (!url) return;
  const upgraded = upgrade.has(url);
  if (upgraded) url = url.replace(/^http:/, 'https:');
  const key = /^https:\/\/jmp2\.uk\//.test(url) ? url.replace(/\.m3u8$/, '') : url;   // the same redirect, listed with and without .m3u8
  if (seen.has(key)) return;
  seen.add(key);
  const known = g => (MERGE[g] || CATEGORIES.some(([c]) => c === g) || g === 'Entertainment' ? g : CATEGORIES.find(([, re]) => re.test(g))?.[0] || '');
  const category = (group && !/general|undefined/i.test(group) ? (looseGroups ? known(group) : group) : '')
    || CATEGORIES.find(([, re]) => re.test(name))?.[0] || 'Entertainment';
  // Fields that hold their default (Entertainment, '', 0) are left out: with ~18,000 channels that saves several
  // hundred KB that every device downloads and reads at launch (the app reads a missing field as the default).
  const cat = MERGE[category] || category, source = sourceOf(url);
  channels.push({
    n: name,
    u: url,
    ...(cat !== 'Entertainment' && { c: cat }),
    ...(quality && { q: quality }),
    ...(source && { s: source }),
    // Streams that need custom headers or plain http won't play inside an https web app
    // (unless the probe found the stream loads fine in a browser without them).
    ...((ua || rf) && !verified.has(url) && { h: 1 }),
    ...(isPlaylist && { p: 1 }),
    ...(verified.has(url) && { v: 1 }),
    ...(noCors.has(url) && { nc: 1 }),
    ...(dead.has(url) && { dd: 1 }),
    ...(upgraded && { up: 1 }),
    ...(cc && { cc }),
    ...(tvgId && { t: tvgId }),
    ...(logo && { l: logo }),
    // Header values are kept so "Open in VLC" playlists can send them (browsers can't)
    ...(ua && { ua }),
    ...(rf && { rf }),
  });
}
const cleanName = title => title.replace(/\s*\(\d{3,4}p\)/, '').replace(/\s*\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

const files = readdirSync(join(root, 'playlists'));

// 1) M3U first: richest data (tvg-id for the TV guide, logos, headers). iptv-org leads, so its details win for a shared stream.
const m3us = files.filter(f => /\.m3u8?$/i.test(f)).sort((a, b) => (b === 'iptv-org.m3u') - (a === 'iptv-org.m3u') || a.localeCompare(b));
for (const file of m3us) {
  const extra = EXTRA[file] || {};
  let meta = null;
  for (const line of readFileSync(join(root, 'playlists', file), 'utf8').split(/\r?\n/)) {
    const l = line.trim();
    if (l.startsWith('#EXTINF')) {
      const attr = k => l.match(new RegExp(`${k}="([^"]*)"`))?.[1] || '';
      const title = l.slice(l.lastIndexOf(',') + 1).trim();
      const country = (attr('tvg-country') || attr('channel-id').match(/-([a-z]{2})$/)?.[1] || extra.cc || '').toLowerCase();
      meta = { name: cleanName(title.replace(/\s*[\u24B6-\u24E9]/g, '')), quality: title.match(/\((\d{3,4}p)\)/)?.[1] || '', group: extra.countryGroups ? '' : attr('group-title').split(';')[0], looseGroups: file !== 'iptv-org.m3u', tvgId: attr('tvg-id'), logo: attr('tvg-logo'),
        cc: /^[a-z]{2}$/.test(country) ? (country === 'uk' ? 'gb' : country) : '' };
    } else if (l.startsWith('#EXTVLCOPT') && meta) {
      const m = /^#EXTVLCOPT:http-(user-agent|referrer)=(.*)$/.exec(l);
      if (m) meta[m[1] === 'referrer' ? 'rf' : 'ua'] = m[2];
    } else if (l && !l.startsWith('#') && meta) {
      if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(l)) add({ ...meta, url: l });   // YouTube pages aren't streams a player can open
      meta = null;
    }
  }
}

// 2) VLC .xspf playlists fill in anything the M3U didn't have
for (const file of files.filter(f => f.endsWith('.xspf'))) {
  const xml = readFileSync(join(root, 'playlists', file), 'utf8');
  for (const [, body] of xml.matchAll(/<track>([\s\S]*?)<\/track>/g)) {
    const url = decode(body.match(/<location>([^<]*)<\/location>/)?.[1] || '');
    const rawTitle = decode(body.match(/<title>([^<]*)<\/title>/)?.[1] || '');
    const creator = decode(body.match(/<creator>([^<]*)<\/creator>/)?.[1] || '');
    const options = [...body.matchAll(/<vlc:option>([^<]*)<\/vlc:option>/g)].map(m => decode(m[1]));
    const isPlaylist = /\.m3u$/i.test(url);
    const title = rawTitle || (isPlaylist ? 'iptv-org: All Channels' : url.split('/').pop());
    const opt = prefix => options.find(o => o.startsWith(prefix))?.slice(prefix.length);
    add({
      name: cleanName(title), url, isPlaylist,
      quality: title.match(/\((\d{3,4}p)\)/)?.[1] || '',
      group: creator.match(/group-title="([^"]*)"/)?.[1]?.split(';')[0] || '',
      ua: opt('http-user-agent='), rf: opt('http-referrer='),
    });
  }
}

writeFileSync(join(root, 'public/data/channels.json'), JSON.stringify(channels));
const counts = channels.reduce((a, c) => (a[c.c] = (a[c.c] || 0) + 1, a), {});
console.log(`${channels.length} channels (${channels.filter(c => c.v).length} verified, ${channels.filter(c => c.nc).length} need a proxy, ${channels.filter(c => c.dd).length} dead)`, counts);
