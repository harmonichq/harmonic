// ADR 53's sole browser-address adapter.  Page code receives complete route
// objects; URLSearchParams, location, and history do not escape this module.
export const TABS = Object.freeze([
  Object.freeze({ id: 'day', label: 'Day' }),
  Object.freeze({ id: 'diagnose', label: 'Diagnose' }),
  Object.freeze({ id: 'verify', label: 'Verify' }),
  Object.freeze({ id: 'plan', label: 'Plan' }),
  Object.freeze({ id: 'settings', label: 'App settings' }),
  Object.freeze({ id: 'guide', label: 'Guide' }),
]);

const PAGE_IDS = new Set(TABS.map(({ id }) => id));
const IDENTIFIER = /^[A-Za-z0-9._:-]{1,160}$/;
const FACTOR_PART = /^[a-z][a-z0-9_]*$/;
const ARTICLE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OCC = /^[A-Za-z0-9_-]{1,512}$/;
const INTEGER = /^(?:0|[1-9][0-9]*)$/;

function freeze(value) { return Object.freeze(value); }
function invalid(address, reason) { return freeze({ kind: 'InvalidRoute', address, reason }); }
function pending(page, query) { return freeze({ kind: 'PendingRoute', page, query: freeze(query) }); }
function decodeSearch(search, address) {
  try { return new URLSearchParams(search); } catch { return null; }
}
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function pairedBounds(params) {
  const start = params.get('start_min'), end = params.get('end_min');
  if ((start == null) !== (end == null)) return null;
  if (start == null) return {};
  if (!INTEGER.test(start) || !INTEGER.test(end)) return null;
  const startMin = Number(start), endMin = Number(end);
  if (startMin > 1440 || endMin > 1440 || startMin === endMin ||
      (startMin === 0 && endMin === 1440) || (startMin === 1440 && endMin === 0)) return null;
  return { start_min: start, end_min: end };
}
function validRawSearch(address, params, query) {
  const serialized = queryString(query);
  return address.search === serialized;
}
function queryString(query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value != null) params.set(key, value);
  const value = params.toString();
  return value ? `?${value}` : '';
}
function checkKeys(params, allowed) {
  const seen = new Set();
  for (const [key, value] of params) {
    if (!allowed.has(key) || !value || seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}
function validOccurrence(value) {
  if (!OCC.test(value)) return false;
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    const text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
    if (/\s/.test(text)) return false;
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) && parsed.length === 3 && parsed.every((part) => typeof part === 'string' && part.length > 0);
  } catch { return false; }
}

/** Parse static syntax only; membership and defaults happen in resolveRoute. */
export function parseRoute(address) {
  let url;
  const browser = typeof window !== 'undefined';
  const source = address ?? (browser ? window.location.href : 'http://localhost/app/diagnose');
  try { url = new URL(source, browser ? window.location.origin : 'http://localhost'); } catch { return invalid(String(source), 'malformed-address'); }
  const shown = url.pathname + url.search + url.hash;
  if (url.pathname === '/') return freeze({ kind: 'LegacyRedirect', address: shown, to: '/app/diagnose' });
  if (!url.pathname.startsWith('/app/')) return invalid(shown, 'unknown-page');
  if (url.hash) return invalid(shown, 'fragment');
  const page = url.pathname.slice('/app/'.length);
  if (!PAGE_IDS.has(page) || url.pathname !== `/app/${page}`) return invalid(shown, 'unknown-page');
  if (/%(?![0-9A-Fa-f]{2})/.test(url.search)) return invalid(shown, 'malformed-percent-escape');
  const params = decodeSearch(url.search, shown);
  if (!params) return invalid(shown, 'malformed-query');
  const keys = {
    day: new Set(['date']), diagnose: new Set(['finding', 'factor', 'start_min', 'end_min', 'projection', 'occ', 'view', 'another']),
    verify: new Set(['trial']), plan: new Set(), settings: new Set(), guide: new Set(['article']),
  }[page];
  if (!checkKeys(params, keys)) return invalid(shown, 'query-keys');
  let query = {};
  if (page === 'day') {
    if (params.has('date') && !validDate(params.get('date'))) return invalid(shown, 'date');
    query = params.has('date') ? { date: params.get('date') } : {};
  } else if (page === 'guide') {
    if (params.has('article') && !ARTICLE.test(params.get('article'))) return invalid(shown, 'article');
    query = params.has('article') ? { article: params.get('article') } : {};
  } else if (page === 'verify') {
    if (params.has('trial') && !IDENTIFIER.test(params.get('trial'))) return invalid(shown, 'trial');
    query = params.has('trial') ? { trial: params.get('trial') } : {};
  } else if (page === 'diagnose') {
    const bounds = pairedBounds(params); if (!bounds) return invalid(shown, 'bounds');
    if (params.has('view')) {
      if (!['meals', 'lows'].includes(params.get('view')) || params.has('finding') || params.has('projection')) return invalid(shown, 'direct-comparison');
      if (params.has('factor') && !FACTOR_PART.test(params.get('factor'))) return invalid(shown, 'factor');
      if (params.has('occ') && !IDENTIFIER.test(params.get('occ'))) return invalid(shown, 'occ');
      if (params.has('another') && params.get('another') !== '1') return invalid(shown, 'another');
      query = { view: params.get('view'), ...(params.has('factor') ? { factor: params.get('factor') } : {}), ...bounds,
        ...(params.has('another') ? { another: '1' } : {}), ...(params.has('occ') ? { occ: params.get('occ') } : {}) };
    } else {
      if (params.has('another')) return invalid(shown, 'another');
      const hasFinding = params.has('finding'), hasFactor = params.has('factor');
      if (hasFinding !== hasFactor || (!hasFinding && (Object.keys(bounds).length || params.has('projection') || params.has('occ')))) return invalid(shown, 'workstation-pair');
      if (hasFinding && (!IDENTIFIER.test(params.get('finding')) || !/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(params.get('factor')))) return invalid(shown, 'finding');
      if (params.has('projection') && params.get('projection') !== 'event') return invalid(shown, 'projection');
      if (params.has('occ') && !validOccurrence(params.get('occ'))) return invalid(shown, 'occ');
      query = hasFinding ? { finding: params.get('finding'), factor: params.get('factor'), ...bounds,
        ...(params.has('projection') ? { projection: 'event' } : {}), ...(params.has('occ') ? { occ: params.get('occ') } : {}) } : {};
    }
  }
  if (!validRawSearch(url, params, query)) return invalid(shown, 'non-canonical');
  return pending(page, query);
}

/** Resolver supplies server-owned membership/defaults, never partial page state. */
export function resolveRoute(route, resolve = {}) {
  if (route.kind !== 'PendingRoute') return route;
  const result = resolve[route.page] ? resolve[route.page](route.query) : route.query;
  if (!result || result.invalid) return invalid(serializeRoute(route), 'membership');
  return freeze({ kind: 'ResolvedRoute', page: route.page, query: freeze(result) });
}

export function serializeRoute(route) {
  if (route.kind === 'LegacyRedirect') return route.to;
  if (route.kind === 'InvalidRoute') return route.address;
  return `/app/${route.page}${queryString(route.query)}`;
}

export function pushRoute(route) { history.pushState(null, '', serializeRoute(route)); }
export function replaceRoute(route) { history.replaceState(null, '', serializeRoute(route)); }
export function subscribeRoutes(listener) {
  const restored = () => listener(parseRoute());
  window.addEventListener('popstate', restored);
  return () => window.removeEventListener('popstate', restored);
}
