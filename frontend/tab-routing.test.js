import test from 'node:test';
import assert from 'node:assert/strict';

import { parseRoute, resolveTab, serializeRoute, subscribeRoute, writeRoute } from './tab-routing.js';

test('resolveTab keeps a live page and sends every other id to the default page', () => {
  for (const tab of ['day', 'diagnose', 'verify', 'plan', 'settings', 'guide']) {
    assert.equal(resolveTab(tab), tab);
  }
  // #352: the ids retired by #99/#245/#246/#248 get no page of their own. The
  // server serves the shell at the live page paths only, so a retired id's
  // address answers 404 before any script loads and never reaches this.
  for (const retired of ['dashboard', 'pump', 'review', 'patterns', 'daily', 'modelview', 'outcomes']) {
    assert.equal(resolveTab(retired), 'diagnose', retired);
  }
  // The fallback that does still have an input: a Guide article's `app:<id>`
  // handoff renders whatever word an author writes, so an unrecognized id has
  // to land on a real surface.
  assert.equal(resolveTab('doesnotexist'), 'diagnose');
});

test('six page routes round-trip through clean paths', () => {
  for (const page of ['day', 'diagnose', 'verify', 'plan', 'settings', 'guide']) {
    const route = parseRoute({ pathname: `/${page}`, search: '' });
    assert.equal(route.page, page);
    assert.equal(serializeRoute(route), `/${page}`);
  }
});

test('the parse reports whether the address named a page, so a bare arrival can be chosen for', () => {
  // #94: the clean grammar has no "no page" address — a bare `/` resolves to the
  // default — so the parse reports which happened rather than encoding "named
  // nothing" as a null page the callers would each have to default again.
  for (const page of ['day', 'diagnose', 'verify', 'plan', 'settings', 'guide']) {
    assert.equal(parseRoute({ pathname: `/${page}`, search: '' }).pageNamed, true);
  }
  // `view` remains a Diagnose compatibility coordinate; the case file, not the
  // address, owns the event comparison it can render.
  assert.equal(parseRoute({ pathname: '/', search: '?view=glucose' }).pageNamed, true);
  // #94: the retired `#/<page>?...` grammar is not read, so a saved hash link
  // names nothing — it is the bare `/` it literally is, and is treated as one.
  const stale = parseRoute({ pathname: '/', hash: '#/verify', search: '' });
  assert.equal(stale.pageNamed, false, 'a fragment names no page');
  assert.equal(stale.page, 'diagnose', 'a saved hash link lands on the default page');

  const bare = parseRoute({ pathname: '/', hash: '', search: '' });
  assert.equal(bare.pageNamed, false, 'a bare arrival names no page');
  assert.equal(bare.page, 'diagnose', 'and is still resolved to the default for routing');
  assert.equal(serializeRoute(bare), '/diagnose', 'and still canonicalizes in place');
});

test('Diagnose mode round-trips from its page route and from a bare query', () => {
  const canonical = parseRoute({ pathname: '/diagnose', search: '?mode=drawn' });
  assert.equal(canonical.mode, 'drawn');
  assert.equal(serializeRoute(canonical), '/diagnose?mode=drawn');

  // Diagnose state on a bare `/` still resolves to Diagnose and serializes to
  // its page route; only the page is implied, never the values.
  const implied = parseRoute({ pathname: '/', search: '?mode=drawn' });
  assert.equal(implied.mode, 'drawn');
  assert.equal(serializeRoute(implied), '/diagnose?mode=drawn');
});

test('Day date and Guide article restore from their page route and leave with the page', () => {
  const day = parseRoute({ pathname: '/day', search: '?date=2026-08-22' });
  const guide = parseRoute({ pathname: '/guide', search: '?article=reading-day' });
  assert.equal(day.date, '2026-08-22');
  assert.equal(guide.article, 'reading-day');
  assert.equal(serializeRoute({ ...day, page: 'diagnose' }), '/diagnose');
  assert.equal(serializeRoute({ ...guide, page: 'diagnose' }), '/diagnose');

  const writes = [];
  const location = { pathname: '/diagnose', hash: '', search: '' };
  const history = { pushState: (_state, _title, address) => writes.push(address) };
  writeRoute(day, { location, history });
  writeRoute(guide, { location, history });
  assert.deepEqual(writes, ['/day?date=2026-08-22', '/guide?article=reading-day']);
});

test('the stable glucose route keeps only its compatibility view state', () => {
  const route = parseRoute({ pathname: '/', search: '?view=lows&factor=correction_stacking&start_min=0&end_min=120&another=1&occ=low-7' });
  assert.deepEqual(route, { page: 'diagnose', pageNamed: true, view: 'lows', mode: null });
  assert.equal(serializeRoute(route), '/diagnose?view=lows');

  // The parsed route replaces the address in place with its canonical form, and
  // a stale fragment does not survive that replacement — #94 retired the
  // `#/<page>?...` grammar outright, so no fragment may linger in the address.
  const carried = parseRoute({ pathname: '/diagnose', search: '?view=glucose&mode=drawn' });
  const replacements = [];
  writeRoute(carried, {
    location: { pathname: '/diagnose', hash: '#/diagnose?factor=late_bolus', search: '?view=glucose&mode=drawn' },
    history: { replaceState: (_state, _title, address) => replacements.push(address) },
    replace: true,
  });
  assert.deepEqual(replacements, ['/diagnose?view=glucose&mode=drawn']);

  const listeners = new Map();
  const browser = {
    location: { hash: '', search: '?view=glucose&mode=drawn', pathname: '/diagnose' },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener() {},
  };
  const seen = [];
  const unsubscribe = subscribeRoute((next) => seen.push(next), browser);
  listeners.get('popstate')();
  unsubscribe();
  assert.deepEqual(seen, [{ page: 'diagnose', pageNamed: true, view: 'glucose', mode: 'drawn' }]);
});
