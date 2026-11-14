// Old-browser fallbacks for the app's stylesheets, for TV browsers from before 2020 (Chromium 51-87, e.g. Android TV
// boxes whose Android System WebView was never updated). Run at deploy (netlify.toml) with --write: it edits the
// copies of public/css/*.css that are about to be published, putting each fallback right in front of the modern
// declaration it stands in for. A modern browser reads both and keeps the later, modern one; an old browser drops
// the modern one as invalid and keeps the fallback. Nothing changes for modern browsers.
//
//   node scripts/build-legacy-css.mjs --write          edit public/css/*.css in place (deploy only; don't commit that)
//   node scripts/build-legacy-css.mjs --out <dir>      write the converted copies to <dir> instead, to look at them
//
// What it covers (with the first Chromium that doesn't need it):
//   inset (87) -> top/right/bottom/left         clamp() min() max() (79), env() (69), dvh/svh/lvh (108) -> one value
//   gap on flex boxes (84) -> margins            gap on grids (66) -> grid-gap
//   place-items/-content/-self (59) -> long-hands   display: grid (57) -> a flex layout of the same shape
//   :focus-visible (86) inside a selector list, which makes old browsers drop the whole rule -> the same rule again
//   without it (plus a keyboard-focus version), shown only to browsers older than Chromium 88
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'public/css');
export const MARK = '/* Old-browser fallbacks added at deploy by scripts/build-legacy-css.mjs */\n';
const OLD = '@supports not (aspect-ratio: 1 / 1)';   // true only in browsers older than Chromium 88

// ------------------------------------------------------------------ small parsing helpers
// Splits on a separator character, ignoring separators inside ( ) and quotes
export function splitTop(text, sep) {
  const parts = []; let depth = 0, quote = null, cur = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) { cur += ch; if (ch === '\\') { cur += text[++i] ?? ''; } else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && (sep === ' ' ? /\s/.test(ch) : ch === sep)) { if (sep !== ' ' || cur) parts.push(cur); cur = ''; } else cur += ch;
  }
  if (sep !== ' ' || cur) parts.push(cur);
  return parts.map(p => p.trim()).filter((p, i, a) => sep !== ' ' || p);
}

// The CSS shorthand rule: 1 value -> all four, 2 -> vertical horizontal, 3 -> top horizontal bottom, 4 -> clockwise
export function expandInset(value) {
  const parts = splitTop(value, ' ');
  const [t, r = t, b = t, l = r] = parts;
  return parts.length ? { top: t, right: r, bottom: b, left: l } : null;
}

// ------------------------------------------------------------------ choosing one value for clamp() / min() / max()
// The fallback has to be one fixed value. Lengths are compared on a typical TV screen (1280 x 720 CSS pixels, where
// most of these browsers are) and the winning argument is kept as written, so it still scales with the screen.
const VW = 12.8, VH = 7.2, REM = 16;
const UNIT = { px: 1, rem: REM, em: REM, vw: VW, vh: VH, vmin: VH, vmax: VW, '': 1 };
// A length as CSS pixels, or null when it can't be known here (%, var(), auto ...)
export function measure(text) {
  const src = text.trim().replace(/^calc\(/, '(');
  let i = 0;
  const skip = () => { while (/\s/.test(src[i] || '')) i++; };
  const atom = () => {
    skip();
    if (src[i] === '(') { i++; const v = sum(); skip(); if (src[i] !== ')') throw 0; i++; return v; }
    if (src.startsWith('calc(', i)) { i += 4; return atom(); }
    const m = /^(-?[\d.]+)([a-z%]*)/.exec(src.slice(i));
    if (!m || !(m[2] in UNIT)) throw 0;
    i += m[0].length; return parseFloat(m[1]) * UNIT[m[2]];
  };
  const product = () => { let v = atom(); for (;;) { skip(); const op = src[i]; if (op !== '*' && op !== '/') return v; i++; const w = atom(); v = op === '*' ? v * w : v / w; } };
  const sum = () => { let v = product(); for (;;) { skip(); const op = src[i]; if ((op !== '+' && op !== '-') || !/\s/.test(src[i + 1] || '')) return v; i++; const w = product(); v = op === '+' ? v + w : v - w; } };
  try { const v = sum(); skip(); return i === src.length && isFinite(v) ? v : null; } catch { return null; }
}
const asValue = arg => (/\s[-+*/]\s/.test(arg) && !/^calc\(/.test(arg) ? `calc(${arg})` : arg);
function choose(fn, args) {
  const sizes = args.map(measure);
  if (fn === 'clamp') {
    const [lo, mid, hi] = sizes;
    if (mid == null) return args[1];
    if (lo != null && mid < lo) return args[0];
    if (hi != null && mid > hi) return args[2];
    return args[1];
  }
  const known = sizes.map((s, i) => [s, i]).filter(([s]) => s != null);
  if (fn === 'min') {   // min(100%, 300px): the fixed limit is usually the point of it
    if (!known.length) return args[0];
    return args[known.reduce((a, b) => (b[0] < a[0] ? b : a))[1]];
  }
  // max(): an unknown (var(), %) is usually the real size and the number a floor
  if (known.length < args.length) return args[sizes.findIndex(s => s == null)];
  return args[known.reduce((a, b) => (b[0] > a[0] ? b : a))[1]];
}
// A value with clamp() min() max() env() and the new viewport units replaced by something old engines understand
export function simplify(value) {
  let v = value.replace(/(\d)[dsl]v([hw])\b/g, '$1v$2');
  for (let n = 0; n < 50; n++) {
    const re = /(^|[^\w-])(clamp|min|max|env)\(/g; let m, last = null;
    while ((m = re.exec(v))) last = m;       // the innermost (last-opened) function first
    if (!last) break;
    const open = last.index + last[1].length + last[2].length;
    let depth = 0, close = open;
    for (; close < v.length; close++) { if (v[close] === '(') depth++; else if (v[close] === ')' && --depth === 0) break; }
    const args = splitTop(v.slice(open + 1, close), ',');
    const out = last[2] === 'env' ? (args[1] || '0px') : asValue(choose(last[2], args));
    v = v.slice(0, open - last[2].length) + out + v.slice(close + 1);
  }
  return v;
}
const NEEDS_SIMPLIFY = /(^|[^\w-])(clamp|min|max|env)\(|\d[dsl]v[hw]\b/;

// ------------------------------------------------------------------ the stylesheet walker
// Every rule that holds declarations: its @media/@supports chain, selector and the positions of its braces
export function rules(css) {
  const out = [], stack = [];
  let i = 0, start = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); i = e < 0 ? css.length : e + 2; continue; }
    if (ch === '"' || ch === "'") { i++; while (i < css.length && css[i] !== ch) i += css[i] === '\\' ? 2 : 1; i++; continue; }
    if (ch === '{') {
      stack.push({ prelude: css.slice(start, i).replace(/\/\*[\s\S]*?\*\//g, '').trim(), open: i, child: false });
      if (stack.length > 1) stack[stack.length - 2].child = true;
      start = i + 1;
    } else if (ch === '}') {
      const b = stack.pop();
      if (b && !b.child && !b.prelude.startsWith('@')) out.push({ at: stack.map(s => s.prelude), selector: b.prelude, open: b.open, close: i });
      start = i + 1;
    } else if (ch === ';') start = i + 1;
    i++;
  }
  return out;
}
// The declarations inside a rule body: { at (offset of its first character), prop, value, important }
export function declarations(body) {
  const out = []; let depth = 0, quote = null, segStart = 0;
  const push = end => {
    const raw = body.slice(segStart, end), text = raw.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const colon = text.indexOf(':');
    if (colon > 0) {
      const lead = raw.length - raw.trimStart().length;
      let value = text.slice(colon + 1).trim(), important = false;
      if (/!\s*important$/i.test(value)) { important = true; value = value.replace(/\s*!\s*important$/i, ''); }
      out.push({ at: segStart + lead, prop: text.slice(0, colon).trim().toLowerCase(), value, important });
    }
  };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; continue; }
    if (ch === '/' && body[i + 1] === '*') { const e = body.indexOf('*/', i + 2); i = e < 0 ? body.length : e + 1; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ';' && depth === 0) { push(i); segStart = i + 1; }
  }
  push(body.length);
  return out;
}

// ------------------------------------------------------------------ the fallbacks
const imp = d => (d.important ? ' !important' : '');
// Declarations an old browser needs in front of `d` (empty when it needs none)
export function fallbacksFor(d) {
  const out = [], v = NEEDS_SIMPLIFY.test(d.value) ? simplify(d.value) : d.value;
  const put = (p, val) => out.push(`${p}: ${val}${imp(d)}`);
  if (d.prop === 'inset') { const x = expandInset(v); if (x) for (const side of ['top', 'right', 'bottom', 'left']) put(side, x[side]); return out; }
  const place = { 'place-items': ['align-items', 'justify-items'], 'place-content': ['align-content', 'justify-content'], 'place-self': ['align-self', 'justify-self'] }[d.prop];
  if (place) { const [a, b = a] = splitTop(v, ' '); put(place[0], a); put(place[1], b); return out; }
  const gridGap = { gap: 'grid-gap', 'row-gap': 'grid-row-gap', 'column-gap': 'grid-column-gap' }[d.prop];
  if (gridGap) put(gridGap, v);
  if (d.prop === 'display' && /^(inline-)?grid$/.test(v)) put('display', v.replace('grid', 'flex'));
  else if (v !== d.value) put(d.prop, v);
  return out;
}

const MODERN_SELECTOR = /:focus-visible|:has\(/;
// `html.tv .x` -> `html.kbd.tv .x`, `.x` -> `html.kbd .x`
const underHtml = (sel, cls) => (/^html(?=[.#:[\s>]|$)/.test(sel) ? sel.replace(/^html/, `html.${cls}`) : `html.${cls} ${sel}`);

// The extra rules to put after a rule: for selector lists old browsers would drop, for flex gaps and for grids
function extraRules(rule, decls, facts) {
  const extra = [], selectors = splitTop(rule.selector, ',');
  const body = decls.map(d => [...fallbacksFor(d), `${d.prop}: ${d.value}${imp(d)}`].join('; ')).join('; ');
  // 1. A selector list with :focus-visible / :has(): old browsers drop the whole rule, so repeat it without those
  if (selectors.length && selectors.some(s => MODERN_SELECTOR.test(s))) {
    const kept = [];
    for (const s of selectors) {
      if (/:has\(/.test(s)) continue;                       // js/tv.js mirrors these as classes, see css/tv.css
      kept.push(/:focus-visible/.test(s) ? underHtml(s.replace(/:focus-visible/g, ':focus'), 'kbd') : s);
    }
    if (kept.length) extra.push(`${OLD} { ${[...new Set(kept)].join(', ')} { ${body} } }`);
  }
  const plain = selectors.filter(s => !MODERN_SELECTOR.test(s));
  if (!plain.length) return extra;
  const get = p => decls.filter(d => d.prop === p).map(d => simplify(d.value)).pop();
  let gap = get('gap'), rowGap = get('row-gap'), colGap = get('column-gap');
  if (gap) { const [r, c = r] = splitTop(gap, ' '); rowGap = rowGap || r; colGap = colGap || c; }
  const display = get('display');
  // 2. gap on a flex box: margins between the children, while js/tv.js reports the browser can't do flex gaps
  const isFlex = display ? /flex/.test(display) : plain.every(s => facts.flex.has(s));
  if ((rowGap || colGap) && isFlex) {
    const column = /column/.test(get('flex-direction') || '') || plain.every(s => facts.column.has(s));
    const wrap = /^wrap/.test(get('flex-wrap') || '') || /wrap/.test(get('flex-flow') || '') || plain.every(s => facts.wrap.has(s));
    const sel = plain.map(s => `${underHtml(s, 'no-flex-gap')} > ${wrap ? '*' : '*:not(:last-child)'}`).join(', ');
    const m = wrap ? [colGap && `margin-right: ${colGap}`, rowGap && `margin-bottom: ${rowGap}`] : [column ? rowGap && `margin-bottom: ${rowGap}` : colGap && `margin-right: ${colGap}`];
    if (m.filter(Boolean).length) extra.push(`${sel} { ${m.filter(Boolean).join('; ')} }`);
  }
  // 3. display: grid in browsers without grids (Chromium < 57): a flex layout of the same shape
  if (display && /grid/.test(display)) {
    const sel = plain.join(', '), kids = plain.map(s => `${s} > *`).join(', ');
    const cols = get('grid-template-columns'), rows = get('grid-template-rows');
    const out = [];
    const center = /center/.test(get('place-items') || '') || /center/.test(get('align-items') || '');
    const tracks = list => splitTop(list, ' ').map(t => (/fr\)?$/.test(t) ? 'flex: 1 1 0; min-width: 0; min-height: 0' : t === 'auto' ? 'flex: 0 0 auto' : `flex: 0 0 ${t.replace(/^minmax\(([^,]+),.*\)$/, '$1')}`));
    const auto = cols && /^repeat\(auto-(fill|fit),\s*minmax\((.+),\s*[\d.]+fr\)\)$/.exec(cols);
    const count = cols && /^repeat\((\d+),\s*(.+)\)$/.exec(cols);
    if (auto) {
      out.push(`${sel} { flex-direction: row; flex-wrap: wrap }`, `${kids} { flex: 1 1 ${auto[2]}; margin: 0 ${colGap || 0} ${rowGap || 0} 0 }`);
    } else if (count) {
      const n = +count[1], w = /fr$/.test(count[2]) ? `calc((100% - ${n - 1} * ${colGap || '0px'}) / ${n})` : count[2];
      out.push(`${sel} { flex-direction: row; flex-wrap: wrap }`, `${kids} { flex: 0 0 ${w}; margin: 0 ${colGap || 0} ${rowGap || 0} 0 }`, `${plain.map(s => `${s} > :nth-child(${n}n)`).join(', ')} { margin-right: 0 }`);
    } else if (cols && !/repeat\(/.test(cols)) {
      out.push(`${sel} { flex-direction: row; align-items: stretch }`);
      tracks(cols).forEach((t, i, all) => out.push(`${plain.map(s => `${s} > :nth-child(${i + 1})`).join(', ')} { ${t}${colGap && i < all.length - 1 ? `; margin-right: ${colGap}` : ''} }`));
    } else if (rows && !/repeat\(/.test(rows)) {
      out.push(`${sel} { flex-direction: column }`);
      tracks(rows).forEach((t, i, all) => out.push(`${plain.map(s => `${s} > :nth-child(${i + 1})`).join(', ')} { ${t}${rowGap && i < all.length - 1 ? `; margin-bottom: ${rowGap}` : ''} }`));
    } else {
      out.push(`${sel} { flex-direction: column${center ? '; align-items: center; justify-content: center' : ''} }`);
      if (rowGap) out.push(`${plain.map(s => `${s} > * + *`).join(', ')} { margin-top: ${rowGap} }`);
    }
    extra.push(`@supports not (display: grid) { ${out.join(' ')} }`);
  }
  return extra;
}

// What every stylesheet says about each selector (a gap rule often sits apart from the display: flex rule)
export function collectFacts(files) {
  const facts = { flex: new Set(), column: new Set(), wrap: new Set() };
  for (const [, css] of files) {
    for (const r of rules(css)) {
      const ds = declarations(css.slice(r.open + 1, r.close));
      for (const s of splitTop(r.selector, ',')) {
        for (const d of ds) {
          if (d.prop === 'display' && /flex/.test(d.value)) facts.flex.add(s);
          if (d.prop === 'flex-direction' && /column/.test(d.value)) facts.column.add(s);
          if ((d.prop === 'flex-wrap' && /^wrap/.test(d.value)) || (d.prop === 'flex-flow' && /wrap/.test(d.value))) facts.wrap.add(s);
        }
      }
    }
  }
  return facts;
}

// One stylesheet with its fallbacks added (unchanged when it already has them)
export function addFallbacks(css, facts = collectFacts([['', css]])) {
  if (css.startsWith(MARK)) return css;
  const edits = [];
  for (const r of rules(css)) {
    if (r.at.some(a => /^@(-\w+-)?keyframes|^@font-face|^@page/.test(a))) continue;
    const body = css.slice(r.open + 1, r.close), decls = declarations(body);
    for (const d of decls) {
      const f = fallbacksFor(d);
      if (f.length) edits.push({ at: r.open + 1 + d.at, text: f.join('; ') + '; ' });
    }
    const extra = extraRules(r, decls, facts);
    if (extra.length) edits.push({ at: r.close + 1, text: '\n' + extra.join('\n') });
  }
  let out = css;
  for (const e of edits.sort((a, b) => b.at - a.at)) out = out.slice(0, e.at) + e.text + out.slice(e.at);
  return MARK + out;
}

export function addFallbacksToAll(files) {
  const facts = collectFacts(files);
  return files.map(([name, css]) => [name, addFallbacks(css, facts)]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const write = process.argv.includes('--write'), o = process.argv.indexOf('--out'), outDir = o > 0 ? process.argv[o + 1] : null;
  if (!write && !outDir) { console.error('Use --write (deploy) or --out <dir>; see the top of this file.'); process.exit(1); }
  const files = readdirSync(dir).filter(f => f.endsWith('.css')).sort().map(f => [f, readFileSync(join(dir, f), 'utf8')]);
  const target = write ? dir : outDir;
  mkdirSync(target, { recursive: true });
  let added = 0;
  for (const [name, css] of addFallbacksToAll(files)) {
    added += css.length - files.find(f => f[0] === name)[1].length;
    writeFileSync(join(target, name), css);
  }
  console.log(`Old-browser fallbacks: ${files.length} stylesheets, +${(added / 1024).toFixed(1)} KB, written to ${target}`);
}
