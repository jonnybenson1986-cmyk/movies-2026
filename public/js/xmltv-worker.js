/* StreamBox: downloads and reads a TV guide (XMLTV) away from the page, so the video keeps playing smoothly.
   The Sydney guide is ~7.5 MB of XML: reading it on the page froze a Fire TV Stick for ~4 seconds, long enough to
   stall a channel that had just started. ES5 only (older TVs run this file as is).
   In:  { url, now, horizon }
   Out: { channels: [[id, [name, ...]], ...], programmes: { id: [[start, stop, title, desc], ...] } }
        or { error, final } (final: the guide itself is bad, so the page shouldn't try again itself) */
'use strict';

var ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
function text(s) {
  if (!s) return '';
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, function (_, c) { return c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); });   // literal text
  return s.replace(/<[^>]+>/g, '').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, function (m, e) {
    if (e.charAt(0) === '#') {
      var code = e.charAt(1).toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch (err) { return m; }
    }
    var v = ENTITIES[e.toLowerCase()];
    return v === undefined ? m : v;
  }).trim();
}
function attr(attrs, name) {
  var m = new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')').exec(attrs);
  return m ? text(m[1] !== undefined ? m[1] : m[2]) : '';
}
function first(body, tag) {
  var m = new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)</' + tag + '>').exec(body);
  return m ? text(m[1]) : '';
}
function time(s) {
  var m = /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?\s*([+-])?(\d\d)?(\d\d)?/.exec(s || '');
  if (!m) return 0;
  var offset = m[7] ? (m[7] === '-' ? -1 : 1) * ((+m[8] || 0) * 60 + (+m[9] || 0)) : 0;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - offset * 60000;
}

function parse(xml, now, horizon) {
  if (xml.length > 80e6) throw final('guide file too large');
  if (!/<tv\b/.test(xml.slice(0, 4096)) && !/<(channel|programme)\b/.test(xml)) throw final('not valid XMLTV');
  var channels = [], programmes = {}, m, names, n;
  var chRe = /<channel\b([^>]*)>([\s\S]*?)<\/channel>/g, nameRe = /<display-name\b[^>]*>([\s\S]*?)<\/display-name>/g;
  while ((m = chRe.exec(xml))) {
    var id = attr(m[1], 'id');
    if (!id) continue;
    names = [];
    nameRe.lastIndex = 0;
    while ((n = nameRe.exec(m[2]))) { var t = text(n[1]); if (t) names.push(t); }
    channels.push([id, names]);
  }
  var prRe = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;
  while ((m = prRe.exec(xml))) {
    var start = time(attr(m[1], 'start')), stop = time(attr(m[1], 'stop'));
    if (!stop || stop < now || start > horizon) continue;
    var ch = attr(m[1], 'channel');
    (programmes[ch] || (programmes[ch] = [])).push([start, stop, first(m[2], 'title'), first(m[2], 'desc')]);
  }
  return { channels: channels, programmes: programmes };
}
function final(message) { var e = new Error(message); e.final = true; return e; }

function download(url) {
  return fetch(url).then(function (res) {
    if (!res.ok) throw final('HTTP ' + res.status);
    if (/\.gz(\?|$)/i.test(url) && typeof DecompressionStream !== 'undefined') {
      return new Response(res.clone().body.pipeThrough(new DecompressionStream('gzip'))).text()
        .catch(function () { return res.text(); });   // the server already decompressed it
    }
    return res.text();
  });
}

self.onmessage = function (e) {
  var d = e.data || {};
  download(d.url).then(function (xml) { self.postMessage(parse(xml, d.now, d.horizon)); })
    .catch(function (err) { self.postMessage({ error: (err && err.message) || 'guide failed', final: !!(err && err.final) }); });
};
