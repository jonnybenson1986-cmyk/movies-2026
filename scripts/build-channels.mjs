// Builds public/data/channels.json for the app from playlists/*.m3u and playlists/*.xspf (VLC).
//   node scripts/build-channels.mjs           use the playlists in the repo
//   node scripts/build-channels.mjs --fetch   first refresh playlists/iptv-org.m3u from iptv-org (used on every Netlify deploy)
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
  if (/tubi/i.test(url)) return 'Tubi';
  if (/roku/i.test(url)) return 'Roku';
  if (/plex/i.test(url)) return 'Plex';
  return '';
};

const IPTV_ORG = 'https://iptv-org.github.io/iptv/index.m3u';
if (process.argv.includes('--fetch')) {
  try {
    const res = await fetch(IPTV_ORG);
    const text = await res.text();
    if (!res.ok || !text.startsWith('#EXTM3U')) throw new Error(`HTTP ${res.status}`);
    writeFileSync(join(root, 'playlists/iptv-org.m3u'), text);
    console.log(`refreshed playlists/iptv-org.m3u (${(text.length / 1e6).toFixed(1)} MB)`);
  } catch (e) { console.warn(`could not refresh iptv-org (${e.message}); using the copy in the repo`); }
}

const channels = [];
const seen = new Set();
// URLs that scripts/probe-streams.mjs found loadable in a browser (manifest 200 + CORS); flagged `v: 1`
const probePath = join(root, 'playlists/probe.json');
const probe = existsSync(probePath) ? JSON.parse(readFileSync(probePath, 'utf8')) : {};
const verified = new Set(Array.isArray(probe) ? probe : probe.verified || []);   // (older probe files were a plain list)
const noCors = new Set(probe.noCors || []), dead = new Set(probe.dead || []);

// Shared by both parsers. `raw` has name, url, group, quality?, tvgId?, logo?, ua?, rf?
function add({ name, url, group = '', quality = '', tvgId = '', logo = '', ua, rf, isPlaylist = false }) {
  if (!url || seen.has(url)) return;
  seen.add(url);
  const category = (group && !/general|undefined/i.test(group) ? group : '')
    || CATEGORIES.find(([, re]) => re.test(name))?.[0] || 'Entertainment';
  channels.push({
    n: name,
    u: url,
    c: MERGE[category] || category,
    q: quality,
    s: sourceOf(url),
    // Streams that need custom headers or plain http won't play inside an https web app.
    h: ua || rf ? 1 : 0,
    p: isPlaylist ? 1 : 0,
    ...(verified.has(url) && { v: 1 }),
    ...(noCors.has(url) && { nc: 1 }),
    ...(dead.has(url) && { dd: 1 }),
    ...(tvgId && { t: tvgId }),
    ...(logo && { l: logo }),
    // Header values are kept so "Open in VLC" playlists can send them (browsers can't)
    ...(ua && { ua }),
    ...(rf && { rf }),
  });
}
const cleanName = title => title.replace(/\s*\(\d{3,4}p\)/, '').replace(/\s*\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();

const files = readdirSync(join(root, 'playlists'));

// 1) M3U first: richest data (tvg-id for the TV guide, logos, headers)
for (const file of files.filter(f => /\.m3u8?$/i.test(f))) {
  let meta = null;
  for (const line of readFileSync(join(root, 'playlists', file), 'utf8').split(/\r?\n/)) {
    const l = line.trim();
    if (l.startsWith('#EXTINF')) {
      const attr = k => l.match(new RegExp(`${k}="([^"]*)"`))?.[1] || '';
      const title = l.slice(l.lastIndexOf(',') + 1).trim();
      meta = { name: cleanName(title), quality: title.match(/\((\d{3,4}p)\)/)?.[1] || '', group: attr('group-title').split(';')[0], tvgId: attr('tvg-id'), logo: attr('tvg-logo') };
    } else if (l.startsWith('#EXTVLCOPT') && meta) {
      const m = /^#EXTVLCOPT:http-(user-agent|referrer)=(.*)$/.exec(l);
      if (m) meta[m[1] === 'referrer' ? 'rf' : 'ua'] = m[2];
    } else if (l && !l.startsWith('#') && meta) {
      add({ ...meta, url: l });
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
