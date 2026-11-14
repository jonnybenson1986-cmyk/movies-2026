/* Generated from js/tv-guide.js (sha 0ba5aab1bbf65456) by scripts/build-legacy-js.mjs for older TV browsers. Do not edit. */
/* Australian TV guide (EPG). The programme data is the free XMLTV guide published at i.mjh.nz (one file per
   capital city, refreshed through the day); app.js downloads and reads it with the XMLTV code it already has.
   This file holds what is specific to the guide: where the data lives, how app channels are matched to guide
   channels, and the guide page itself. No page code runs on load, so the logic can be tested on its own. */
(() => {
    'use strict';
    const CITIES = ['Sydney', 'Melbourne', 'Brisbane', 'Adelaide', 'Perth', 'Hobart', 'Darwin', 'Canberra'];
    const url = city => (CITIES.includes(city) ? `https://i.mjh.nz/au/${city}/epg.xml.gz` : '');
    // Channels whose name in the app differs from the guide's: app name -> guide name (both normalised: lower case,
    // letters and digits only)
    const ALIASES = { abctvplus: 'abcfamily', '10bold': '10drama', ausbiztv: 'ausbiz' };
    // Channels the app lists once per city or state. Each guide file has one "ABC TV" and one "Channel 9" for its
    // own city, so a feed only matches when it is the chosen city's (the app's plain "ABC TV" and "Channel 9" are Sydney's)
    const FEEDS = [
        { re: /^abctv(act|nt|qld|sa|tas|vic|wa)?$/, to: 'abctv', city: { '': 'Sydney', act: 'Canberra', nt: 'Darwin', qld: 'Brisbane', sa: 'Adelaide', tas: 'Hobart', vic: 'Melbourne', wa: 'Perth' } },
        { re: /^channel9australia(adelaide|brisbane|perth)?$/, to: 'channel9', city: { '': 'Sydney', adelaide: 'Adelaide', brisbane: 'Brisbane', perth: 'Perth' } },
    ];
    function alias(name, city = 'Sydney') {
        for (const f of FEEDS) {
            const m = f.re.exec(name);
            if (m)
                return f.city[m[1] || ''] === city ? f.to : '';
        }
        return ALIASES[name] || name;
    }
    // Free-to-air channels StreamBox has no stream for: where the network itself streams them, free
    const OFFICIAL = [
        [/^mjh-(seven|7two|7mate|7flix|7bravo)\b/, '7plus', 'https://7plus.com.au/live-tv'],
        [/^mjh-(channel-9|gem|go|life|rush)-/, '9Now', 'https://www.9now.com.au/live'],
        [/^mjh-10/, '10', 'https://10.com.au/live'],
        [/^mjh-sbs-/, 'SBS On Demand', 'https://www.sbs.com.au/ondemand/live'],
        [/^mjh-abc-/, 'ABC iview', 'https://iview.abc.net.au/'],
    ];
    function official(id) {
        const hit = OFFICIAL.find(([re]) => re.test(id));
        return hit ? { name: hit[1], url: hit[2] } : null;
    }
    const esc = s => String(s !== null && s !== void 0 ? s : '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const clock = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    // One row per guide channel that has something on: channels you can watch in the app come first.
    // ids: guide channel ids in file order; names: id -> name; byId: id -> programmes (sorted);
    // streamOf: id -> the app's channel for it, if there is one.
    function rows({ ids, names, byId, streamOf = () => null, now = Date.now(), limit = 8 }) {
        const out = [];
        for (const id of ids) {
            const programmes = (byId.get(id) || []).filter(p => p.stop > now).slice(0, limit);
            if (!programmes.length)
                continue;
            out.push({ id, name: names.get(id) || id, stream: streamOf(id) || null, programmes });
        }
        return out.sort((a, b) => !a.stream - !b.stream); // stable: file order is kept within each half
    }
    function rowHTML(row, now) {
        const progs = row.programmes.map(p => {
            const live = p.start <= now;
            const pct = live ? Math.max(0, Math.min(100, ((now - p.start) / (p.stop - p.start)) * 100)) : 0;
            return `<button type="button" class="epg-prog${live ? ' now' : ''}" data-epg="${esc(row.id)}|${p.start}">
        <small>${live ? `NOW · until ${esc(clock(p.stop))}` : esc(clock(p.start))}</small><b>${esc(p.title || 'To be announced')}</b>
        ${live ? `<i class="epg-bar"><i style="width:${pct.toFixed(1)}%"></i></i>` : ''}</button>`;
        }).join('');
        return `<section class="epg-row" data-name="${esc(row.name.toLowerCase())}">
      <div class="epg-ch"><b>${esc(row.name)}</b>${row.stream
            ? `<button type="button" class="btn btn-play epg-watch" data-key="${esc(row.stream.key)}" aria-label="Watch ${esc(row.name)}">▶ Watch</button>`
            : (o => (o ? `<a class="btn btn-more epg-watch" href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">${esc(o.name)} ↗</a>` : '<small>Guide only</small>'))(official(row.id))}</div>
      <div class="epg-track">${progs}</div></section>`;
    }
    // state: 'ready' | 'loading' | 'failed' | 'off'
    function pageHTML({ state, city, list, onlyWatchable, now = Date.now() }) {
        const shown = onlyWatchable ? list.filter(r => r.stream) : list;
        const watchable = list.filter(r => r.stream).length;
        const body = state === 'off' ? '<div class="empty">The Australian TV guide is switched off.<br>Pick a city above to turn it on.</div>'
            : state === 'loading' ? '<div class="empty"><div class="spinner"></div><br>Loading the TV guide…</div>'
                : state === 'failed' ? '<div class="empty"><b>Couldn’t load the TV guide.</b><br>Check your connection and try again.<br><button class="btn btn-more" data-act="guidereload" style="margin-top:14px">Try again</button></div>'
                    : shown.length ? `<div class="epg">${shown.map(r => rowHTML(r, now)).join('')}</div>`
                        : '<div class="empty">No guide channels to show.</div>';
        return `<div class="page">
      <div class="page-head"><h1>TV Guide</h1><span class="count">Australia${state === 'ready' ? ` · ${shown.length} channels` : ''}</span>
        <label class="epg-city">City <select id="epgCity" aria-label="City for the TV guide">${CITIES.map(c => `<option${c === city ? ' selected' : ''}>${c}</option>`).join('')}<option value="off"${city === 'off' ? ' selected' : ''}>Off</option></select></label></div>
      <div class="chips"><a class="chip" href="#countries">‹ Live TV</a>
        <a class="chip ${onlyWatchable ? '' : 'active'}" href="#guide">All channels</a>
        <a class="chip ${onlyWatchable ? 'active' : ''}" href="#guide/watch">Watch in StreamBox · ${watchable}</a>
        <input class="country-filter" id="epgFilter" type="search" placeholder="Find a channel…" autocomplete="off"></div>
      ${body}
      <p class="epg-note">Guide data: i.mjh.nz (free-to-air and streaming channels, ${esc(city === 'off' ? 'off' : city)} times shown in your device’s time zone). Channels without a Watch button have no stream in StreamBox; where the network streams the channel itself, the button opens its free app or site.</p></div>`;
    }
    function detailHTML(name, p) {
        const day = new Date(p.start).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
        return `<h2>${esc(p.title || 'To be announced')}</h2>
      <p style="color:var(--muted)">${esc(name)} · ${esc(day)} · ${esc(clock(p.start))} – ${esc(clock(p.stop))}</p>
      <p>${esc(p.desc || 'No description for this programme.')}</p>`;
    }
    const api = { CITIES, url, alias, official, rows, pageHTML, detailHTML };
    if (typeof window !== 'undefined')
        window.StreamBoxGuide = api;
    if (typeof module !== 'undefined')
        module.exports = api;
})();
