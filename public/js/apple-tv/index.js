// Entry point for the Apple TV pages. app.js imports this and calls render() for #discover and #title/<id>.
import { renderDiscover, renderList, renderTitle } from './pages.js';
export { card } from './cards.js';
export { toItem } from './util.js';

export function render(view, name, arg, ctx) {
  if (name === 'title') return renderTitle(view, arg, ctx);
  if (arg.startsWith('list/')) return renderList(view, arg.slice(5), ctx);
  return renderDiscover(view, ctx);
}
