// Converts playlists/*.xspf (VLC) into public/data/channels.json for the app.
// Run: node scripts/build-channels.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
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
};

const sourceOf = url => {
  if (/jmp2\.uk\/plu-|pluto/i.test(url)) return 'Pluto TV';
  if (/jmp2\.uk\/stvp-|samsung/i.test(url)) return 'Samsung TV Plus';
  if (/tubi/i.test(url)) return 'Tubi';
  if (/roku/i.test(url)) return 'Roku';
  if (/plex/i.test(url)) return 'Plex';
  return '';
};

const channels = [];
const seen = new Set();
for (const file of readdirSync(join(root, 'playlists')).filter(f => f.endsWith('.xspf'))) {
  const xml = readFileSync(join(root, 'playlists', file), 'utf8');
  for (const [, body] of xml.matchAll(/<track>([\s\S]*?)<\/track>/g)) {
    const url = decode(body.match(/<location>([^<]*)<\/location>/)?.[1] || '');
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const rawTitle = decode(body.match(/<title>([^<]*)<\/title>/)?.[1] || '');
    const creator = decode(body.match(/<creator>([^<]*)<\/creator>/)?.[1] || '');
    const options = [...body.matchAll(/<vlc:option>([^<]*)<\/vlc:option>/g)].map(m => decode(m[1]));
    const isPlaylist = /\.m3u$/i.test(url);
    const title = rawTitle || (isPlaylist ? 'iptv-org: All Channels' : url.split('/').pop());
    const quality = title.match(/\((\d{3,4}p)\)/)?.[1] || '';
    const name = title.replace(/\s*\(\d{3,4}p\)/, '').replace(/\s*\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
    const group = creator.match(/group-title="([^"]*)"/)?.[1]?.split(';')[0] || '';
    const category = (group && !/general|undefined/i.test(group) ? group : '')
      || CATEGORIES.find(([, re]) => re.test(name))?.[0] || 'Entertainment';
    channels.push({
      n: name,
      u: url,
      c: MERGE[category] || category,
      q: quality,
      s: sourceOf(url),
      // Streams that need custom headers or plain http won't play inside an https web app.
      h: options.some(o => /^http-(referrer|user-agent)/.test(o)) ? 1 : 0,
      p: isPlaylist ? 1 : 0,
    });
  }
}

writeFileSync(join(root, 'public/data/channels.json'), JSON.stringify(channels));
const counts = channels.reduce((a, c) => (a[c.c] = (a[c.c] || 0) + 1, a), {});
console.log(`${channels.length} channels`, counts);
