// Hash-tab routing stays Vue-free so both initial load and hashchange use the
// same migration and the fallback can be covered without a browser.
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
const DIAGNOSE_KEYS = ['view', 'factor', 'start_min', 'end_min', 'another', 'occ'];

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
  if (page === 'diagnose') {
    return Object.fromEntries(DIAGNOSE_KEYS.map((key) => [key, params.get(key) || null]));
  }
  return {};
}

// The one hash-routing seam owns the page plus only the page-local state that
// already round-trips. It deliberately transports values without validating
// them; each existing page retains its own defaults and value handling.
export function parseRoute({ hash = '', search = '' } = {}) {
  const raw = hash.replace(/^#/, '');
  const [path = '', query = ''] = raw.split('?');
  const splitParams = new URLSearchParams(search.replace(/^\?/, ''));
  const page = path ? resolveTab(path.replace(/^\//, ''))
    : DIAGNOSE_KEYS.some((key) => splitParams.has(key)) ? 'diagnose' : null;
  if (!page) return { page: null };
  const params = new URLSearchParams(query);
  if (page === 'diagnose') {
    for (const key of DIAGNOSE_KEYS) {
      if (!params.has(key) && splitParams.has(key)) params.set(key, splitParams.get(key));
    }
  }
  return { page, ...routeState(page, params) };
}

export function serializeRoute(route, extra = []) {
  const page = resolveTab(route.page);
  const params = new URLSearchParams();
  const keys = page === 'day' ? ['date'] : page === 'guide' ? ['article']
    : page === 'diagnose' ? DIAGNOSE_KEYS : [];
  for (const key of keys) {
    if (route[key]) params.set(key, route[key]);
  }
  for (const [key, value] of extra) params.set(key, value);
  const query = params.toString();
  return `#/${page}${query ? `?${query}` : ''}`;
}

export function writeRoute(route, { location = window.location, history = window.history,
  replace = false, extra = [] } = {}) {
  const hash = serializeRoute(route, extra);
  const address = `${location.pathname}${hash}`;
  if (`${location.pathname}${location.search}${location.hash}` !== address) {
    history[replace ? 'replaceState' : 'pushState'](null, '', address);
  }
  return hash;
}

export function subscribeRoute(listener, browser = window) {
  let previous = null;
  const notify = () => {
    const address = `${browser.location.search}${browser.location.hash}`;
    if (address === previous) return;
    previous = address;
    listener(parseRoute(browser.location));
  };
  browser.addEventListener('hashchange', notify);
  browser.addEventListener('popstate', notify);
  return () => {
    browser.removeEventListener('hashchange', notify);
    browser.removeEventListener('popstate', notify);
  };
}
