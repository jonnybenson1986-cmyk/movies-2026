/* Generated from js/touch.js (sha c991b12065a16d3a) by scripts/build-legacy-js.mjs for older TV browsers. Do not edit. */
/* Phones and tablets: the "More" sheet (the tabs that don't fit in a phone's tab bar, plus shortcuts), and
   tapping the tab you're already on to scroll back to the top, as iOS and Android apps do. */
(() => {
    'use strict';
    var _a;
    const $ = s => document.querySelector(s);
    const sheet = $('#moreSheet'), more = $('#tabMore');
    if (!sheet || !more)
        return;
    const IN_MORE = ['sports', 'guide', 'classics', 'movy', 'mylist', 'library'];
    const routeName = () => decodeURIComponent(location.hash.slice(1) || 'home').split('/')[0];
    let lastFocus = null;
    function open() {
        var _a;
        lastFocus = document.activeElement;
        sheet.hidden = false;
        more.setAttribute('aria-expanded', 'true');
        document.body.classList.add('more-open');
        (_a = sheet.querySelector('.more-grid a, .more-grid button')) === null || _a === void 0 ? void 0 : _a.focus({ preventScroll: true });
    }
    function close() {
        var _a;
        if (sheet.hidden)
            return;
        sheet.hidden = true;
        more.setAttribute('aria-expanded', 'false');
        document.body.classList.remove('more-open');
        (_a = lastFocus === null || lastFocus === void 0 ? void 0 : lastFocus.focus) === null || _a === void 0 ? void 0 : _a.call(lastFocus, { preventScroll: true });
    }
    function mark() {
        const name = routeName();
        more.classList.toggle('active', IN_MORE.includes(name));
        sheet.querySelectorAll('[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === name));
    }
    more.addEventListener('click', () => (sheet.hidden ? open() : close()));
    sheet.addEventListener('click', e => {
        var _a, _b;
        if (e.target === sheet) {
            close();
            return;
        } // tapping outside the card
        const act = (_a = e.target.closest('[data-more-act]')) === null || _a === void 0 ? void 0 : _a.dataset.moreAct;
        if (act === 'close')
            close();
        else if (act === 'settings') {
            close();
            (_b = $('#settingsBtn')) === null || _b === void 0 ? void 0 : _b.click();
        }
        else if (act === 'search') {
            close();
            const t = $('#searchToggle');
            t === null || t === void 0 ? void 0 : t.click();
            setTimeout(() => { var _a; return (_a = $('#searchInput')) === null || _a === void 0 ? void 0 : _a.focus(); }, 50);
        }
        else if (e.target.closest('a[href]'))
            close();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) {
        e.stopPropagation();
        close();
    } }, true);
    // swipe the sheet down to close it
    let y0 = null;
    sheet.addEventListener('touchstart', e => { y0 = e.touches.length === 1 ? e.touches[0].clientY : null; }, { passive: true });
    sheet.addEventListener('touchend', e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 70)
        close(); y0 = null; }, { passive: true });
    // Tapping the tab of the page you're on takes you back to the top of it
    (_a = $('#tabbar')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', e => {
        const a = e.target.closest('a[href]');
        if (a && a.getAttribute('href') === location.hash) {
            e.preventDefault();
            scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
    addEventListener('hashchange', () => { close(); mark(); });
    mark();
})();
