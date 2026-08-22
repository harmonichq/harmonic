import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouteResolver, parseRoute, resolveRoute, serializeRoute } from './url-state.js';

const parse = (path) => parseRoute(`http://example.test${path}`);
test('all six canonical paths parse as pending routes', () => {
  for (const page of ['day', 'diagnose', 'verify', 'plan', 'settings', 'guide']) {
    assert.equal(parse(`/app/${page}`).kind, 'PendingRoute');
  }
});
test('root is the one legacy redirect and canonical queries serialize byte-stably', () => {
  assert.deepEqual(parse('/?old=state#day'), { kind: 'LegacyRedirect', address: '/?old=state#day', to: '/app/diagnose' });
  const occ = 'WyJpYyIsImVwMSIsIjIwMjYtMDctMTVUMTI6MDA6MDAiXQ';
  const route = parse(`/app/diagnose?finding=f1&factor=ic.day&start_min=720&end_min=60&projection=event&occ=${occ}`);
  assert.equal(serializeRoute(route), `/app/diagnose?finding=f1&factor=ic.day&start_min=720&end_min=60&projection=event&occ=${occ}`);
});
test('resolved routes serialize in the ADR 53 page order, not caller object order', () => {
  assert.equal(serializeRoute({ kind: 'ResolvedRoute', page: 'diagnose', query: {
    occ: 'occ-1', another: '1', end_min: '60', factor: 'ic', view: 'lows', start_min: '720',
  } }), '/app/diagnose?view=lows&factor=ic&start_min=720&end_min=60&another=1&occ=occ-1');
  assert.equal(serializeRoute({ kind: 'ResolvedRoute', page: 'diagnose', query: {
    occ: 'WyJpYyIsImVwMSIsInQiXQ', projection: 'event', end_min: '60', finding: 'f1', factor: 'ic.day', start_min: '720',
  } }), '/app/diagnose?finding=f1&factor=ic.day&start_min=720&end_min=60&projection=event&occ=WyJpYyIsImVwMSIsInQiXQ');
  assert.equal(serializeRoute({ kind: 'ResolvedRoute', page: 'guide', query: { article: 'start-here' } }),
    '/app/guide?article=start-here');
});
test('all invalid classes stop atomically', () => {
  for (const path of ['/app/day#x', '/app/plan?x=1', '/app/day?date=', '/app/day?date=2026-02-30',
    '/app/diagnose?start_min=60&start_min=60&end_min=120', '/app/diagnose?view=glucose',
    '/app/diagnose?finding=x&factor=ic.day&projection=clock', '/app/guide?article=start-here&article=x',
    '/app/day?date=2026-01-01&x=1']) assert.equal(parse(path).kind, 'InvalidRoute', path);
});
test('empty trailing separators are rejected and retain their exact address', () => {
  for (const address of [
    '/app/plan?', '/app/settings#', '/app/diagnose?', '/app/day?date=2026-07-15#',
  ]) {
    assert.deepEqual(parse(address), { kind: 'InvalidRoute', address, reason: 'trailing-separator' });
  }
  assert.deepEqual(parseRoute('https://shared.example/app/plan?'), {
    kind: 'InvalidRoute', address: '/app/plan?', reason: 'trailing-separator',
  });
  assert.deepEqual(parseRoute('https://user:pass@shared.example/app/settings#'), {
    kind: 'InvalidRoute', address: '/app/settings#', reason: 'trailing-separator',
  });
  assert.equal(parseRoute('/app/day#x?').address, '/app/day#x?');
  assert.equal(parseRoute('/app/guide?article=reading-day?').address,
    '/app/guide?article=reading-day?');
  assert.deepEqual(parseRoute('https://user@shared.example/app/plan?#'), {
    kind: 'InvalidRoute', address: '/app/plan?#', reason: 'trailing-separator',
  });
});
test('resolution inserts defaults and rejects unresolved membership', () => {
  const day = resolveRoute(parse('/app/day'), { day: () => ({ date: '2026-07-15' }) });
  assert.equal(serializeRoute(day), '/app/day?date=2026-07-15');
  const verify = resolveRoute(parse('/app/verify'), { verify: () => ({ trial: 'trial-1' }) });
  assert.equal(serializeRoute(verify), '/app/verify?trial=trial-1');
  assert.equal(serializeRoute(resolveRoute(parse('/app/verify'), { verify: () => ({}) })), '/app/verify');
  assert.equal(resolveRoute(parse('/app/verify?trial=nope'), { verify: () => ({ invalid: true }) }).kind, 'InvalidRoute');
});
test('runtime-owned identities fail closed until their page resolver is registered', () => {
  assert.equal(resolveRoute(parse('/app/verify')).kind, 'InvalidRoute');
  assert.equal(resolveRoute(parse('/app/verify?trial=trial-1')).kind, 'InvalidRoute');
  assert.equal(resolveRoute(parse('/app/diagnose?finding=f1&factor=ic.day')).kind, 'InvalidRoute');
  assert.equal(serializeRoute(resolveRoute(parse('/app/diagnose'))), '/app/diagnose');
});
test('page consumers register one resolver and dispatch complete routes through it', async () => {
  const routes = createRouteResolver();
  const pending = parse('/app/verify?trial=trial-1');
  assert.equal((await routes.dispatch(pending)).outcome.kind, 'InvalidRoute');

  const unregister = routes.register('verify', {
    resolve: (query, transaction) => transaction.resolved(query), publish() {},
  });
  assert.equal(serializeRoute((await routes.dispatch(pending)).outcome), '/app/verify?trial=trial-1');
  assert.throws(() => routes.register('verify', {
    resolve: (query, transaction) => transaction.resolved(query), publish() {},
  }), /already registered/);

  unregister();
  assert.equal((await routes.dispatch(pending)).outcome.kind, 'InvalidRoute');
});
test('consumer resolution may add defaults but cannot replace named route state', async () => {
  const routes = createRouteResolver();
  routes.register('verify', {
    resolve: (_query, transaction) => transaction.resolved({ trial: 'trial-2' }), publish() {},
  });
  const resolved = (await routes.dispatch(parse('/app/verify?trial=trial-1'))).outcome;
  assert.equal(resolved.kind, 'InvalidRoute');
  assert.equal(resolved.reason, 'resolver-contract');
});
test('consumer route data stays staged until the winning transaction publishes', async () => {
  const published = [];
  const routes = createRouteResolver();
  routes.register('day', {
    async resolve(query, transaction) {
      return transaction.resolved({ date: query.date || '2026-07-15' }, { bounds: 'fresh' });
    },
    publish(state, outcome) { published.push({ state, outcome }); },
  });

  const transaction = await routes.dispatch(parse('/app/day'));
  assert.equal(serializeRoute(transaction.outcome), '/app/day?date=2026-07-15');
  assert.deepEqual(published, []);
  assert.equal(transaction.publish(), true);
  assert.deepEqual(published, [{
    state: { bounds: 'fresh' },
    outcome: transaction.outcome,
  }]);
  assert.equal(transaction.publish(), false);

  const failed = createRouteResolver();
  failed.register('verify', {
    async resolve() { throw new Error('roster unavailable'); },
    publish(state, outcome) { published.push({ state, outcome }); },
  });
  const failure = await failed.dispatch(parse('/app/verify?trial=trial-1'));
  assert.deepEqual(failure.outcome, {
    kind: 'RouteDataError', page: 'verify', address: '/app/verify?trial=trial-1',
    message: 'roster unavailable',
  });
  assert.equal(Object.hasOwn(failure.outcome, 'query'), false,
    'transport failure applies no named evidence');
  assert.equal(failure.publish(), true);
  assert.deepEqual(published.at(-1), { state: undefined, outcome: failure.outcome },
    'the winning shell commit can publish the consumer existing data-error state');
});
test('the consumer seam exposes only registration and staged dispatch', () => {
  assert.deepEqual(Object.keys(createRouteResolver()).sort(), ['dispatch', 'register']);
});
test('workstation occurrence is valid for clock or event and rejects malformed triples', () => {
  const occ = 'WyJpYyIsImVwMSIsIjIwMjYtMDctMTVUMTI6MDA6MDAiXQ';
  assert.equal(parse(`/app/diagnose?finding=f1&factor=ic.day&occ=${occ}`).kind, 'PendingRoute');
  assert.equal(parse(`/app/diagnose?finding=f1&factor=ic.day&projection=event&occ=${occ}`).kind, 'PendingRoute');
  const alias = `${occ.slice(0, -1)}R`; // XQ and XR decode alike, but only XQ is canonical base64url.
  for (const bad of ['not-base64!', alias, 'WzEsMiwzXQ', 'WyJpYyIsImVwMSJd', 'WyJpYyIsICJlcDEiLCAidCJd']) {
    assert.equal(parse(`/app/diagnose?finding=f1&factor=ic.day&occ=${bad}`).kind, 'InvalidRoute', bad);
  }
});
