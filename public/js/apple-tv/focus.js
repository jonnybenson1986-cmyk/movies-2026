// Arrow-key navigation (for keyboards and TV remotes). Moves focus to the nearest focusable item in the
// direction pressed, and keeps it in view. Attached to a container, so it goes away with the page.
// (Rewritten from the pasted FocusManager: that one crashed on a missing focusHistory object, treated the
// Down arrow as Up, and drew a floating ring that drifted out of place inside scrolling rows.)

const SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };

// Pick the best candidate from `current` in direction (dx, dy); pure geometry, so it can be tested
export function pickNext(current, candidates, [dx, dy]) {
  const c = { x: current.left + current.width / 2, y: current.top + current.height / 2 };
  let best = null, bestScore = Infinity;
  for (const rect of candidates) {
    if (rect === current) continue;
    const p = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const along = dx ? (p.x - c.x) * dx : (p.y - c.y) * dy;   // distance in the direction pressed
    if (along <= 1) continue;                                  // not in that direction
    const across = Math.abs(dx ? p.y - c.y : p.x - c.x);       // how far off to the side
    const score = along + across * 2.5;
    if (score < bestScore) { bestScore = score; best = rect; }
  }
  return best;
}

export function attachFocusNav(container) {
  container.addEventListener('keydown', e => {
    const dir = ARROWS[e.key];
    if (!dir || e.altKey || e.ctrlKey || e.metaKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (document.querySelector('.modal:not([hidden])')) return;
    const current = e.target.closest(SELECTOR);
    if (!current || !container.contains(current)) return;
    const els = [...container.querySelectorAll(SELECTOR)].filter(visible);
    const rects = els.map(el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, el }; });
    const here = rects.find(r => r.el === current);
    const next = here && pickNext(here, rects, dir);
    if (!next) return;
    e.preventDefault();
    next.el.focus({ preventScroll: true });
    next.el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  });
}
