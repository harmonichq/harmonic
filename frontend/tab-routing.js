// ---------------------------------------------------------------------------
// The app's one address (#389, #495). The current tab is the path: `/` is the
// Queue, and each other tab is its own page path. Drill-downs stay inside
// their tab and are not addressed: opening one pushes a history entry at the
// same address, marked with which drill-down it is, so the platform's Back (a
// phone's edge-swipe) returns from it, a Back from another tab returns to it,
// and a reload lands on the tab (ADR 594). Framework-free, so the
// initial load and popstate share one parse and the fallback is covered without
// a browser.
//
// ciq_autotune/api.py serves the same closed set of page paths; a path not in
// it is a 404 there, and the Queue here.
// ---------------------------------------------------------------------------
export const PAGE = '/';
export const TABS = ['queue', 'changes', 'overview', 'day', 'settings'];
const DEFAULT_TAB = 'queue';

export const resolveTab = (tab) => (TABS.includes(tab) ? tab : DEFAULT_TAB);

/** The tab a location names: its path, else the Queue. */
export function parseRoute({ pathname = PAGE } = {}) {
  return resolveTab(pathname.startsWith(PAGE) ? pathname.slice(PAGE.length).replace(/\/$/, '') : '');
}

/** The address of a tab: the Queue at the root page, every other tab at its own path. */
export const serializeRoute = (tab) => (resolveTab(tab) === DEFAULT_TAB ? PAGE : `${PAGE}${resolveTab(tab)}`);

/** Move the address to `tab`, adding one history entry unless it is already there. */
export function writeRoute(tab, { location = window.location, history = window.history } = {}) {
  const address = serializeRoute(tab);
  if (`${location.pathname}${location.search}${location.hash}` !== address) history.pushState(null, '', address);
  return address;
}

/** On load: a reload lands on its tab, never a drill-down, so a drill-down's entry the browser kept
 *  becomes the tab's own, and a later drill-down's Back returns to it in one step. */
export function landRoute({ location = window.location, history = window.history } = {}) {
  if (history.state?.drillDown) history.replaceState(null, '', `${location.pathname}${location.search}${location.hash}`);
}

/** Open a drill-down: one history entry at the current address, marked with which drill-down
 *  it is (a plain value, such as its view and subject), so a Back onto it from another tab can
 *  return to it. */
export function pushDrillDown(drillDown, { location = window.location, history = window.history } = {}) {
  history.pushState({ drillDown }, '', `${location.pathname}${location.search}${location.hash}`);
}

/** Call `listener` with the tab each Back or Forward lands on, and the drill-down that entry
 *  marks (null for none); returns the unsubscribe. */
export function subscribeRoute(listener, browser = window) {
  const notify = () => listener(parseRoute(browser.location), { drillDown: browser.history?.state?.drillDown ?? null });
  browser.addEventListener('popstate', notify);
  return () => browser.removeEventListener('popstate', notify);
}
