// StreamBox stream proxy: lets the web app play streams a browser can't load directly.
//   - adds CORS headers (many IPTV hosts don't send them)
//   - re-serves plain http:// streams over your https proxy (browsers block mixed content)
//   - sends the User-Agent / Referer a channel requires (browsers can't set those)
// Zero dependencies, Node 18+.   Run: node proxy/server.mjs
//
// Config (environment variables):
//   PORT             default 8787
//   ALLOWED_ORIGINS  comma-separated site origins allowed to use the proxy, e.g. https://my-streambox.netlify.app
//   PROXY_TOKEN      optional secret; requests must carry ?k=<token> (paste the same token into StreamBox settings)
//   MAX_CONNECTIONS  concurrent upstream requests, default 60
//   ALLOW_PRIVATE=1  development only: allow loopback/private upstream addresses
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';

const PORT = +process.env.PORT || 8787;
const ALLOWED = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
const TOKEN = process.env.PROXY_TOKEN || '';
const MAX_CONNECTIONS = +process.env.MAX_CONNECTIONS || 60;
const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE === '1';
const MANIFEST_LIMIT = 5 * 1024 * 1024;
const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// ---- SSRF protection: never let the proxy reach internal addresses
function isPrivateIPv4(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
function isPrivate(ip) {
  if (ALLOW_PRIVATE) return false;
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  const v = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return isPrivateIPv4(mapped[1]);
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v);
  if (hex) { const n = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16); return isPrivateIPv4([n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255].join('.')); }
  return v === '::1' || v === '::' || /^f[cdef]/.test(v);
}
// Checked at connect time, so DNS rebinding can't swap in an internal address
function safeLookup(hostname, options, cb) {
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) return cb(err);
    const list = Array.isArray(address) ? address : [{ address, family }];
    if (list.some(a => isPrivate(a.address))) return cb(Object.assign(new Error('blocked address'), { code: 'EBLOCKED' }));
    cb(null, address, family);
  });
}

let active = 0;

function request(urlStr, headers, redirects = 0) {
  return new Promise((resolve, reject) => {
    let url;
    try { url = new URL(urlStr); } catch { return reject(Object.assign(new Error('bad url'), { status: 400 })); }
    if (!/^https?:$/.test(url.protocol)) return reject(Object.assign(new Error('only http(s) urls'), { status: 400 }));
    if (net.isIP(url.hostname.replace(/^\[|\]$/g, '')) && isPrivate(url.hostname.replace(/^\[|\]$/g, ''))) return reject(Object.assign(new Error('blocked address'), { status: 403 }));
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(url, { headers, lookup: safeLookup, timeout: 15000 }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirects >= 5) return reject(Object.assign(new Error('too many redirects'), { status: 502 }));
        return resolve(request(new URL(res.headers.location, url).href, headers, redirects + 1));
      }
      res.finalUrl = url.href;
      resolve(res);
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('upstream timeout'), { status: 504 })));
    req.on('error', e => reject(e.code === 'EBLOCKED' ? Object.assign(e, { status: 403 }) : Object.assign(e, { status: e.status || 502 })));
    req.end();
  });
}

const enc = encodeURIComponent;
function proxied(abs, ctx) {
  // Relative URL: resolves against the proxy's own /hls address
  return `hls?u=${enc(abs)}${ctx.ua ? `&ua=${enc(ctx.ua)}` : ''}${ctx.rf ? `&rf=${enc(ctx.rf)}` : ''}${TOKEN ? `&k=${enc(TOKEN)}` : ''}`;
}
function rewriteManifest(text, base, ctx) {
  return text.split(/\r?\n/).map(line => {
    const l = line.trim();
    if (!l) return line;
    if (l.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${proxied(new URL(u, base).href, ctx)}"`);
    try { return proxied(new URL(l, base).href, ctx); } catch { return line; }
  }).join('\n');
}

function cors(req, res) {
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', ALLOWED.length && origin ? origin : '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
}
const fail = (res, status, message) => { if (!res.headersSent) { res.statusCode = status; res.setHeader('Content-Type', 'text/plain'); } res.end(message); };

const server = http.createServer(async (req, res) => {
  cors(req, res);
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return fail(res, 204, '');
  if (url.pathname === '/health') return fail(res, 200, 'ok');
  if (url.pathname !== '/hls' || req.method !== 'GET') return fail(res, 404, 'not found');

  if (TOKEN && url.searchParams.get('k') !== TOKEN) return fail(res, 401, 'bad token');
  if (!TOKEN && ALLOWED.length && req.headers.origin && !ALLOWED.includes(req.headers.origin)) return fail(res, 403, 'origin not allowed');
  if (active >= MAX_CONNECTIONS) return fail(res, 503, 'proxy busy');

  const target = url.searchParams.get('u');
  const ctx = { ua: url.searchParams.get('ua') || '', rf: url.searchParams.get('rf') || '' };
  const headers = { 'User-Agent': ctx.ua || DEFAULT_UA, Accept: '*/*', 'Accept-Encoding': 'identity' };
  if (ctx.rf) headers.Referer = ctx.rf;
  if (req.headers.range) headers.Range = req.headers.range;

  active++;
  let upstream;
  try {
    upstream = await request(target, headers);
  } catch (e) { active--; return fail(res, e.status || 502, `upstream error: ${e.message}`); }
  const release = (() => { let done = false; return () => { if (!done) { done = true; active--; } }; })();
  res.on('close', () => { upstream.destroy(); release(); });

  const type = upstream.headers['content-type'] || '';
  const looksHls = /mpegurl|m3u8/i.test(type) || /\.m3u8(\?|$)/i.test(upstream.finalUrl);
  if (looksHls && upstream.statusCode === 200) {
    const chunks = []; let size = 0;
    for await (const c of upstream) { size += c.length; if (size > MANIFEST_LIMIT) return fail(res, 502, 'manifest too large'); chunks.push(c); }
    const text = Buffer.concat(chunks).toString('utf8');
    if (text.trimStart().startsWith('#EXTM3U')) {
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' });
      return res.end(rewriteManifest(text, upstream.finalUrl, ctx));
    }
    res.writeHead(upstream.statusCode, { 'Content-Type': type || 'application/octet-stream' });
    return res.end(text);
  }

  // Segments, keys, MP4/TS streams: pass through, including Range requests
  const pass = { 'Content-Type': type || 'application/octet-stream' };
  for (const h of ['content-length', 'content-range', 'accept-ranges']) if (upstream.headers[h]) pass[h] = upstream.headers[h];
  res.writeHead(upstream.statusCode, pass);
  upstream.pipe(res);
  upstream.on('error', () => res.destroy());
});

server.listen(PORT, () => {
  console.log(`StreamBox proxy listening on :${PORT}`);
  if (!TOKEN && !ALLOWED.length) console.warn('WARNING: no PROXY_TOKEN or ALLOWED_ORIGINS set, so anyone who finds this proxy can use it. Set one before exposing it.');
});
