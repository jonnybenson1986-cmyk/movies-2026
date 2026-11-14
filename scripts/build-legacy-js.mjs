// Builds public/js/legacy/*.js: the app's scripts converted to older JavaScript (ES2015) for TV browsers from before
// 2020 (Chromium 51-79, e.g. Android TV boxes whose Android System WebView was never updated). index.html loads these
// instead of public/js/*.js when the browser can't read the modern syntax (?. ?? async/await object spread ...).
// Missing browser features (Object.entries, AbortController, ...) are filled in separately by public/js/tv.js.
//
// Uses TypeScript's compiler only as a JavaScript converter (no types are involved). It is taken from the project's
// node_modules if present, otherwise from the global npm folder. Where neither has it (e.g. on Netlify), the
// committed files are kept and checked: a script that changed since its legacy copy was made is reported, so run
//   node scripts/build-legacy-js.mjs
// after changing anything in public/js (npm test also checks that the copies are current).
import { readFileSync, writeFileSync, readdirSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'public/js');
const out = join(src, 'legacy');
// tv.js is already written in ES5 and is loaded directly by every browser.
export const SKIP = new Set(['tv.js']);

export const hash = text => createHash('sha256').update(text).digest('hex').slice(0, 16);
const header = (name, h) => `/* Generated from js/${name} (sha ${h}) by scripts/build-legacy-js.mjs for older TV browsers. Do not edit. */\n`;
export const hashOf = text => (/^\/\* Generated from js\/\S+ \(sha ([0-9a-f]+)\)/.exec(text) || [])[1] || null;

export async function loadTypeScript() {
  try { return (await import('typescript')).default; } catch { /* not in node_modules */ }
  try {
    const global = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return createRequire(join(global, 'noop.js'))('typescript');
  } catch { return null; }
}

// Regex features older engines can't even parse (a regex literal they can't parse breaks the whole file).
// \p{L} / \p{N} are converted to a runtime call that falls back to explicit ranges (window.__sbRe in tv.js);
// anything else is refused, so it gets noticed at build time rather than on someone's TV.
function regexTransformer(ts, file) {
  return context => {
    const visit = node => {
      if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
        const text = node.text, cut = text.lastIndexOf('/');
        const pattern = text.slice(1, cut), flags = text.slice(cut + 1);
        if (/\(\?<[=!]|\(\?<[A-Za-z]|\\[pP]\{(?![LN]\})/.test(pattern) || flags.includes('s') || flags.includes('d') || flags.includes('v')) {
          throw new Error(`${file}: the regular expression ${text} uses a feature older TV browsers can't read; rewrite it or teach scripts/build-legacy-js.mjs a fallback`);
        }
        if (/\\[pP]\{[LN]\}/.test(pattern)) {
          return context.factory.createCallExpression(context.factory.createIdentifier('__sbRe'), undefined,
            [context.factory.createStringLiteral(pattern), context.factory.createStringLiteral(flags)]);
        }
      }
      return ts.visitEachChild(node, visit, context);
    };
    return sourceFile => ts.visitNode(sourceFile, visit);
  };
}

export function convert(ts, name, code) {
  const result = ts.transpileModule(code, {
    fileName: name,
    reportDiagnostics: true,
    transformers: { before: [regexTransformer(ts, name)] },
    compilerOptions: {
      target: ts.ScriptTarget.ES2015,          // let/const, arrows, classes stay; ?. ?? async/await, spread in objects, class fields... are converted
      module: ts.ModuleKind.ESNext,            // the files are plain scripts (no import/export), so nothing module-related is emitted
      allowJs: true,
      checkJs: false,
      removeComments: false,
      useDefineForClassFields: false,
      alwaysStrict: false,                     // keep each file's own strictness ("use strict" only where the original has it)
      ignoreDeprecations: '6.0',
    },
  });
  const errors = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(`${name}: ${errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; ')}`);
  let text = result.outputText.replace(/^export \{\};\s*$/m, '');
  return header(name, hash(code)) + text;
}

export const sources = () => readdirSync(src).filter(f => f.endsWith('.js') && !SKIP.has(f)).sort();

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ts = await loadTypeScript();
  if (!ts) {
    // No converter here: keep the committed copies, and say which ones are out of date (the deploy still goes ahead,
    // because blocking it would also block everyone on a modern browser).
    const stale = sources().filter(f => {
      const file = join(out, f);
      return !existsSync(file) || hashOf(readFileSync(file, 'utf8')) !== hash(readFileSync(join(src, f), 'utf8'));
    });
    if (stale.length) console.warn(`WARNING: older TV browsers will get out-of-date copies of: ${stale.join(', ')}. Run node scripts/build-legacy-js.mjs where TypeScript is installed and commit public/js/legacy.`);
    else console.log('public/js/legacy: up to date (TypeScript not available here, kept the committed copies)');
  } else {
    mkdirSync(out, { recursive: true });
    const names = sources();
    for (const f of readdirSync(out)) if (f.endsWith('.js') && !names.includes(f)) unlinkSync(join(out, f));
    let changed = 0;
    for (const f of names) {
      const text = convert(ts, f, readFileSync(join(src, f), 'utf8'));
      const file = join(out, f);
      if (!existsSync(file) || readFileSync(file, 'utf8') !== text) { writeFileSync(file, text); changed++; }
    }
    console.log(`public/js/legacy: ${names.length} scripts (${changed} updated), TypeScript ${ts.version}`);
  }
}
