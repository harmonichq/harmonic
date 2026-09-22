// ---------------------------------------------------------------------------
// The app's one address (#389, rehomed to the root page by ADR 416). Routing
// stays framework-free so both initial load and popstate use the same parse
// and the fallback can be covered without a browser.
//
// The desk keeps its contextual entry in the query, but names the current
// destination in the path. Old `?to=` links stay readable; an explicit path
// wins when both are present.
// ---------------------------------------------------------------------------
export const V2_PAGE = '/';
export const V2_DESTINATIONS = ['diagnose', 'changes', 'day'];
const V2_DEFAULT_DESTINATION = 'diagnose';
// A contextual Day entry carries all of these; a direct one carries none
// (HV2-13/HV2-14). `from` is the destination to return to, `focus` the precise
// target within it — "restore the exact target" is what makes the return a
// return rather than a second arrival.
export const V2_CONTEXT_KEYS = ['date', 'moment', 'subject', 'occurrence', 'window', 'lever', 'from', 'focus'];

export function resolveDestination(destination) {
  return V2_DESTINATIONS.includes(destination) ? destination : V2_DEFAULT_DESTINATION;
}

export function parseV2Route({ pathname = V2_PAGE, search = '' } = {}) {
  const params = new URLSearchParams(search);
  const context = {};
  for (const key of V2_CONTEXT_KEYS) {
    const value = params.get(key);
    if (value) context[key] = value;
  }
  const pathDestination = pathname.startsWith(V2_PAGE)
    ? pathname.slice(V2_PAGE.length).replace(/\/$/, '') : '';
  return { destination: resolveDestination(pathDestination || params.get('to')), context };
}

export function serializeV2Route({ destination, context = {} } = {}) {
  const params = new URLSearchParams();
  for (const key of V2_CONTEXT_KEYS) {
    if (context[key]) params.set(key, context[key]);
  }
  const query = params.toString();
  return `${V2_PAGE}${resolveDestination(destination)}${query ? `?${query}` : ''}`;
}

export function writeRoute(route, { location = window.location, history = window.history,
  replace = false, serialize = serializeV2Route } = {}) {
  const address = serialize(route);
  // The comparison spans the fragment even though nothing routes on it: an
  // address that still carries one differs from its canonical form, so the
  // in-place write is what drops a stale fragment rather than leaving it.
  if (`${location.pathname}${location.search}${location.hash}` !== address) {
    history[replace ? 'replaceState' : 'pushState'](null, '', address);
  }
  return address;
}

export function subscribeRoute(listener, browser = window, parse = parseV2Route) {
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
