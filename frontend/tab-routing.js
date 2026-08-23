// Path-tab routing stays Vue-free so both initial load and popstate use the
// same parse and the fallback can be covered without a browser.
export const TABS = [
  // #248 (ADR 0027): Daily report + Model view merged into one Day surface.
  // #246 (ADR 0027): Diagnose fused Recommendations + Patterns into one queue;
  // #495 rebuilt that queue as the Settings audit clock-workspace surface —
  // the tab keeps its Diagnose name (maintainer call) and its `diagnose` id.
  { id: 'day', label: 'Day' },
  { id: 'diagnose', label: 'Diagnose' },
  { id: 'verify', label: 'Verify' },       // #245: Outcomes → Verify
  { id: 'plan', label: 'Plan' },
  // Keep the destination's established accessible label. The #634 cockpit
  // footer uses the shorter visible "Settings" label without changing its id.
  { id: 'settings', label: 'App settings' },
  { id: 'guide', label: 'Guide' },
];

const DEFAULT_TAB = 'diagnose';
const TAB_IDS = new Set(TABS.map((tab) => tab.id));
const DIAGNOSE_KEYS = ['view', 'factor', 'start_min', 'end_min', 'another', 'occ', 'mode'];

export function resolveTab(tab) {
  const migrated = (tab === 'dashboard' || tab === 'pump' || tab === 'review' || tab === 'patterns') ? 'diagnose'
    : (tab === 'daily' || tab === 'modelview') ? 'day'
    : tab === 'outcomes' ? 'verify'
    : tab;
  return TAB_IDS.has(migrated) ? migrated : DEFAULT_TAB;
}

function routeState(page, params) {
  if (page === 'day') return { date: params.get('date') || null };
  if (page === 'guide') return { article: params.get('article') || null };
  if (page === 'verify') return { state: params.get('state') || null };
  if (page === 'diagnose') {
    return Object.fromEntries(DIAGNOSE_KEYS.map((key) => [key, params.get(key) || null]));
  }
  return {};
}

// The one routing seam owns the page plus only the page-local state that
// already round-trips. It deliberately transports values without validating
// them; each existing page retains its own defaults and value handling.
//
// #94: the address is the pathname and the ordinary query. A fragment carries
// no route — the retired `#/<page>?...` grammar is not read, not migrated and
// not honoured, so a saved hash link arrives as the bare `/` it literally is.
export function parseRoute({ pathname = '/', search = '' } = {}) {
  const params = new URLSearchParams(search);
  const page = pathname === '/' ? DEFAULT_TAB : resolveTab(pathname.replace(/^\//, ''));
  // Every address resolves to a page, so "which page is this" is not the same
  // question as "did the wearer name one". A bare `/` names none, and the shell
  // may then choose for them — the maturing-Trial promotion. A query carrying
  // Diagnose's own state names Diagnose even from `/`, so an address that
  // already says where it is is never promoted away from it.
  const pageNamed = pathname !== '/' || DIAGNOSE_KEYS.some((key) => params.has(key));
  return { page, pageNamed, ...routeState(page, params) };
}

export function serializeRoute(route, extra = []) {
  const page = resolveTab(route.page);
  const params = new URLSearchParams();
  const keys = page === 'day' ? ['date'] : page === 'guide' ? ['article'] : page === 'verify' ? ['state']
    : page === 'diagnose' ? DIAGNOSE_KEYS : [];
  for (const key of keys) {
    if (route[key]) params.set(key, route[key]);
  }
  for (const [key, value] of extra) params.set(key, value);
  const query = params.toString();
  return `/${page}${query ? `?${query}` : ''}`;
}

export function writeRoute(route, { location = window.location, history = window.history,
  replace = false, extra = [] } = {}) {
  const address = serializeRoute(route, extra);
  // The comparison spans the fragment even though nothing routes on it: an
  // address that still carries one differs from its canonical form, so the
  // in-place write is what drops a stale fragment rather than leaving it.
  if (`${location.pathname}${location.search}${location.hash}` !== address) {
    history[replace ? 'replaceState' : 'pushState'](null, '', address);
  }
  return address;
}

export function subscribeRoute(listener, browser = window) {
  let previous = null;
  const notify = () => {
    const address = `${browser.location.pathname}${browser.location.search}${browser.location.hash}`;
    if (address === previous) return;
    previous = address;
    listener(parseRoute(browser.location));
  };
  browser.addEventListener('popstate', notify);
  return () => {
    browser.removeEventListener('popstate', notify);
  };
}
