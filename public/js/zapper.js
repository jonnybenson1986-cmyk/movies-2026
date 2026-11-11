/* Channel "remote control" logic: channels are grouped by country, and you move through them like a TV remote.
     channel up / down   next or previous channel in the same country (wraps round)
     country left / right   jump to the neighbouring country, landing on the channel last watched there
     number              type 1, 2, 3… to go straight to that channel in the country
   Only the logic lives here (no page code), so it can be tested on its own. app.js draws the buttons and lists. */
(() => {
  'use strict';

  const wrap = (i, dir, len) => ((i + dir) % len + len) % len;

  // Country groups in alphabetical order, with channels of unknown origin ("International / Other") last
  function groupChannels(channels, countryName = c => c.toUpperCase()) {
    const by = new Map();
    for (const c of channels) { const k = c.cc || ''; if (!by.has(k)) by.set(k, []); by.get(k).push(c); }
    return [...by].map(([cc, list]) => ({ cc, name: cc ? countryName(cc) : 'International / Other', channels: list }))
      .sort((a, b) => (!a.cc - !b.cc) || a.name.localeCompare(b.name));
  }

  // groups: () => groupChannels(...)   usable: channel => can it be played right now
  function createZapper({ groups, usable = () => true }) {
    const lastIn = new Map();   // country -> the channel last watched there
    let now = null, previous = null;   // what is on now, and what was on before it (for "last channel")

    const all = () => groups();
    const groupOf = item => all().find(g => g.cc === (item?.cc || '')) || null;
    const playable = (g, current) => (g ? g.channels.filter(c => c === current || usable(c)) : []);

    return {
      groupOf,
      // The channels of the current country that can be played, in order (the current one always stays in)
      list: item => playable(groupOf(item), item),
      // Countries that have something playable
      countries: current => all().map(g => ({ ...g, channels: playable(g, current) })).filter(g => g.channels.length),
      number: item => playable(groupOf(item), item).indexOf(item) + 1,

      // Remember what is being watched (call when a channel starts playing)
      remember(item) {
        if (now && now !== item) previous = now;
        now = item;
        lastIn.set(item.cc || '', item);
      },
      last: () => previous,

      // Channel up (+1) / down (-1) inside the country
      channel(item, dir) {
        const list = playable(groupOf(item), item);
        if (list.length < 2) return null;
        const i = list.indexOf(item);
        return list[wrap(i < 0 ? 0 : i, dir, list.length)];
      },
      // Neighbouring country (+1 / -1), landing on the channel last watched there, else its first
      country(item, dir) {
        const groups = this.countries(item);
        if (groups.length < 2) return null;
        let i = groups.findIndex(g => g.cc === (item?.cc || ''));
        if (i < 0) i = 0;
        const next = groups[wrap(i, dir, groups.length)];
        const back = lastIn.get(next.cc);
        return back && next.channels.includes(back) ? back : next.channels[0];
      },
      // A specific country (from the country picker)
      inCountry(cc, current) {
        const g = this.countries(current).find(x => x.cc === cc);
        if (!g) return null;
        const back = lastIn.get(cc);
        return back && g.channels.includes(back) ? back : g.channels[0];
      },
      // Type 7 on the remote: the 7th channel in this country
      byNumber(item, n) {
        const list = playable(groupOf(item), item);
        return Number.isInteger(n) && n >= 1 && n <= list.length ? list[n - 1] : null;
      },
    };
  }

  // Collects digits typed on a remote ("1", "2" -> 12) and hands the number over when typing pauses
  function createDigits(onShow, onDone, wait = 1400, timers = { set: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id) }) {   // wrapped: browsers reject clearTimeout called on another object
    let text = '', timer = 0;
    const finish = () => { timers.clear(timer); timer = 0; const n = text ? +text : 0; text = ''; if (n) onDone(n); else onShow(''); };
    return {
      press(d) {
        if (!/^\d$/.test(d)) return;
        if (text.length >= 4) text = '';
        text += d; onShow(text);
        timers.clear(timer); timer = timers.set(finish, wait);
      },
      commit: finish,
      cancel() { timers.clear(timer); timer = 0; text = ''; onShow(''); },
      get text() { return text; },
    };
  }

  const api = { wrap, groupChannels, createZapper, createDigits };
  if (typeof window !== 'undefined') window.StreamBoxZap = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
