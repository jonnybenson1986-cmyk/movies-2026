/* Phones and tablets: the "More" sheet (the tabs that don't fit in a phone's tab bar, plus shortcuts), and
   tapping the tab you're already on to scroll back to the top, as iOS and Android apps do. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const sheet = $('#moreSheet'), more = $('#tabMore');
  if (!sheet || !more) return;
  const IN_MORE = ['sports', 'guide', 'classics', 'movy', 'mylist', 'library'];
  const routeName = () => decodeURIComponent(location.hash.slice(1) || 'home').split('/')[0];

  let lastFocus = null;
  function open() {
    lastFocus = document.activeElement;
    sheet.hidden = false; more.setAttribute('aria-expanded', 'true'); document.body.classList.add('more-open');
    sheet.querySelector('.more-grid a, .more-grid button')?.focus({ preventScroll: true });
  }
  function close() {
    if (sheet.hidden) return;
    sheet.hidden = true; more.setAttribute('aria-expanded', 'false'); document.body.classList.remove('more-open');
    lastFocus?.focus?.({ preventScroll: true });
  }
  function mark() {   // More lights up when the page shown lives in it
    const name = routeName();
    more.classList.toggle('active', IN_MORE.includes(name));
    sheet.querySelectorAll('[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === name));
  }

  more.addEventListener('click', () => (sheet.hidden ? open() : close()));
  sheet.addEventListener('click', e => {
    if (e.target === sheet) { close(); return; }   // tapping outside the card
    const act = e.target.closest('[data-more-act]')?.dataset.moreAct;
    if (act === 'close') close();
    else if (act === 'settings') { close(); $('#settingsBtn')?.click(); }
    else if (act === 'search') { close(); const t = $('#searchToggle'); t?.click(); setTimeout(() => $('#searchInput')?.focus(), 50); }
    else if (e.target.closest('a[href]')) close();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) { e.stopPropagation(); close(); } }, true);
  // swipe the sheet down to close it
  let y0 = null;
  sheet.addEventListener('touchstart', e => { y0 = e.touches.length === 1 ? e.touches[0].clientY : null; }, { passive: true });
  sheet.addEventListener('touchend', e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 70) close(); y0 = null; }, { passive: true });

  // Tapping the tab of the page you're on takes you back to the top of it
  $('#tabbar')?.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (a && a.getAttribute('href') === location.hash) { e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); }
  });

  addEventListener('hashchange', () => { close(); mark(); });
  mark();
})();
