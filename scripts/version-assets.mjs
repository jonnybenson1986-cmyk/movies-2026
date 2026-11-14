// Fingerprints the app's scripts and stylesheets in the published index.html (deploy only, from netlify.toml):
//   /css/app.css -> /css/app.css?v=3f2a9c01   and the script list's   var V = {}  ->  var V = { "app": "…", ... }
// A new deploy changes the addresses of the files that changed, so browsers can keep the others (netlify.toml lets
// them reuse /js/* and /css/* without asking the server first) and never mix an old script with a new page.
// Without this, every launch re-checked ~30 files with the server one after another: slow on TV boxes and phones.
//   node scripts/version-assets.mjs --write      edit public/index.html in place (deploy only; don't commit that)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
export const fingerprint = (...texts) => { const h = createHash('sha256'); for (const t of texts) h.update(t ?? ''); return h.digest('hex').slice(0, 10); };

// read(path) gives a file's text (or null); returns the html with fingerprints added
export function versionHtml(html, read) {
  html = html.replace(/(<(?:link|script)\b[^>]*?\s(?:href|src)=")(\/(?:css|js)\/[\w./-]+\.(?:css|js))(")/g, (m, a, path, z) => {
    const text = read(path);
    return text == null ? m : `${a}${path}?v=${fingerprint(text)}${z}`;
  });
  return html.replace(/var V = \{\};/, () => {
    const names = (/var files = \[([^\]]+)\]/.exec(html) || [, ''])[1].match(/'([\w-]+)'/g) || [];
    const map = {};
    for (const q of names) { const n = q.slice(1, -1); map[n] = fingerprint(read(`/js/${n}.js`), read(`/js/legacy/${n}.js`)); }
    return `var V = ${JSON.stringify(map)};`;
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!process.argv.includes('--write')) { console.error('Use --write (deploy only); see the top of this file.'); process.exit(1); }
  const read = p => { const f = join(pub, p); return existsSync(f) ? readFileSync(f, 'utf8') : null; };
  const file = join(pub, 'index.html'), out = versionHtml(readFileSync(file, 'utf8'), read);
  writeFileSync(file, out);
  console.log(`index.html: ${(out.match(/\?v=/g) || []).length} fingerprinted links, ${(/var V = (\{[^;]*\})/.exec(out) || [, '{}'])[1].split(':').length - 1} scripts in the list`);
}
