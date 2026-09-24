// ---------------------------------------------------------------------------
// The app's one address (#389, rehomed to the root page by ADR 416). Routing
// stays framework-free so both initial load and popstate use the same parse
// and the fallback can be covered without a browser.
//
// The desk keeps its contextual entry in the query, but names the current
// destination in the path. Old `?to=` links stay readable; an explicit path
// wins when both are present.
// ---------------------------------------------------------------------------
export const PAGE = '/';
export const DESTINATIONS = ['diagnose', 'changes', 'day'];
const DEFAULT_DESTINATION = 'diagnose';
// A contextual Day entry carries all of these; a direct one carries none
// (HV2-13/HV2-14). `from` is the destination to return to, `focus` the precise
// target within it — "restore the exact target" is what makes the return a
// return rather than a second arrival. Diagnose's own entries name that target
// by their `occurrence` instead (ADR 428). `title` is the entry's display name
// beside its routing `subject`, carried here so a reload or Back keeps the
// name Day prints for where it was opened from (ADR 426).
export const CONTEXT_KEYS = ['date', 'moment', 'subject', 'title', 'occurrence', 'window', 'lever', 'from', 'focus'];

export function resolveDestination(destination) {
  return DESTINATIONS.includes(destination) ? destination : DEFAULT_DESTINATION;
}

/**
 * The address Diagnose writes for the case on screen (ADR 428): exactly the keys
 * its entry restoration reads, plus a `from` that names another destination,
 * because Diagnose itself renders that return (Changes' "Return to Trial").
 * No Day-entry key and no return-focus selector survives, and the Findings
 * index — no case — is no context at all.
 */
export function caseAddress(onScreen, from = '') {
  const context = {};
  for (const key of ['subject', 'occurrence', 'window']) if (onScreen?.[key]) context[key] = onScreen[key];
  if (from && String(from).split('.')[0] !== 'diagnose') context.from = from;
  return context;
}

export function parseRoute({ pathname = PAGE, search = '' } = {}) {
  const params = new URLSearchParams(search);
  const context = {};
  for (const key of CONTEXT_KEYS) {
    const value = params.get(key);
    if (value) context[key] = value;
  }
  const pathDestination = pathname.startsWith(PAGE)
    ? pathname.slice(PAGE.length).replace(/\/$/, '') : '';
  return { destination: resolveDestination(pathDestination || params.get('to')), context };
}

export function serializeRoute({ destination, context = {} } = {}) {
  const params = new URLSearchParams();
  for (const key of CONTEXT_KEYS) {
    if (context[key]) params.set(key, context[key]);
  }
  const query = params.toString();
  return `${PAGE}${resolveDestination(destination)}${query ? `?${query}` : ''}`;
}

export function writeRoute(route, { location = window.location, history = window.history,
  replace = false, serialize = serializeRoute } = {}) {
  const address = serialize(route);
  // The comparison spans the fragment even though nothing routes on it: an
  // address that still carries one differs from its canonical form, so the
  // in-place write is what drops a stale fragment rather than leaving it.
  if (`${location.pathname}${location.search}${location.hash}` !== address) {
    history[replace ? 'replaceState' : 'pushState'](null, '', address);
  }
  return address;
}

export function subscribeRoute(listener, browser = window, parse = parseRoute) {
  let previous = null;
  const notify = () => {
    const address = `${browser.location.pathname}${browser.location.search}${browser.location.hash}`;
    if (address === previous) return;
    previous = address;
    listener(parse(browser.location));
  };
  browser.addEventListener('popstate', notify);
  return () => {
    browser.removeEventListener('popstate', notify);
  };
}
