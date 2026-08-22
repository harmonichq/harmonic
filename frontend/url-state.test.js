import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouteResolver, parseRoute, resolveRoute, serializeRoute } from './url-state.js';

const WORKSTATION_OCC = 'WyJpYyIsImVwMSIsIjIwMjYtMDctMTVUMTI6MDA6MDAiXQ';
const parse = (path) => parseRoute(`http://example.test${path}`);
function assertInvalid(label, address, reason) {
  assert.deepEqual(parse(address), { kind: 'InvalidRoute', address, reason }, label);
}
function assertResolved(label, route, page, address, query) {
  assert.deepEqual(route, { kind: 'ResolvedRoute', page, query }, label);
  assert.equal(serializeRoute(route), address, label);
}
async function dispatchThrough(page, address, resolve, publish = () => {}) {
  const routes = createRouteResolver();
  routes.register(page, { resolve, publish });
  return routes.dispatch(parse(address));
}

test('all six canonical paths parse as pending routes', () => {
  for (const page of ['day', 'diagnose', 'verify', 'plan', 'settings', 'guide']) {
    assert.equal(parse(`/app/${page}`).kind, 'PendingRoute');
  }
});
test('all six ADR rows resolve their valid explicit and default forms', async () => {
  const dayExplicit = resolveRoute(parse('/app/day?date=2026-07-15'), {
    day: (query) => query,
  });
  assertResolved('Day explicit date', dayExplicit, 'day', '/app/day?date=2026-07-15',
    { date: '2026-07-15' });
  const dayLatest = resolveRoute(parse('/app/day'), {
    day: () => ({ date: '2026-07-15' }),
  });
  assertResolved('Day omitted date uses latest', dayLatest, 'day', '/app/day?date=2026-07-15',
    { date: '2026-07-15' });
  const dayNoData = resolveRoute(parse('/app/day'), { day: () => ({}) });
  assertResolved('Day no-data keeps date omitted', dayNoData, 'day', '/app/day', {});

  const diagnose = resolveRoute(parse('/app/diagnose'));
  assertResolved('Diagnose queue', diagnose, 'diagnose', '/app/diagnose', {});

  const verifyDefault = await dispatchThrough('verify', '/app/verify',
    (_query, transaction) => transaction.resolved({ trial: 'trial-default' }));
  assertResolved('Verify omitted Trial uses consumer default', verifyDefault.outcome, 'verify',
    '/app/verify?trial=trial-default', { trial: 'trial-default' });
  const verifyExplicit = await dispatchThrough('verify', '/app/verify?trial=trial-2',
    (query, transaction) => transaction.resolved(query));
  assertResolved('Verify explicit Trial', verifyExplicit.outcome, 'verify',
    '/app/verify?trial=trial-2', { trial: 'trial-2' });
  const verifyEmpty = await dispatchThrough('verify', '/app/verify',
    (_query, transaction) => transaction.resolved({}));
  assertResolved('Verify empty roster keeps Trial omitted', verifyEmpty.outcome, 'verify',
    '/app/verify', {});

  assertResolved('Plan', resolveRoute(parse('/app/plan')), 'plan', '/app/plan', {});
  assertResolved('Settings', resolveRoute(parse('/app/settings')), 'settings', '/app/settings', {});

  const guideDefault = resolveRoute(parse('/app/guide'), {
    guide: () => ({ article: 'start-here' }),
  });
  assertResolved('Guide omitted article uses start-here', guideDefault, 'guide',
    '/app/guide?article=start-here', { article: 'start-here' });
  const guideExplicit = resolveRoute(parse('/app/guide?article=start-here'), {
    guide: (query) => query,
  });
  assertResolved('Guide explicit start-here', guideExplicit, 'guide',
    '/app/guide?article=start-here', { article: 'start-here' });
});
test('Diagnose workstation queue and complete evidence route resolve byte-stably', () => {
  assert.deepEqual(parse('/app/diagnose'), {
    kind: 'PendingRoute', page: 'diagnose', query: {},
  });
  const address = '/app/diagnose?finding=finding-1&factor=ic.day&start_min=720&end_min=60'
    + `&projection=event&occ=${WORKSTATION_OCC}`;
  const query = {
    finding: 'finding-1', factor: 'ic.day', start_min: '720', end_min: '60',
    projection: 'event', occ: WORKSTATION_OCC,
  };
  assert.deepEqual(parse(address), { kind: 'PendingRoute', page: 'diagnose', query });
  assertResolved('complete workstation evidence',
    resolveRoute(parse(address), { diagnose: (candidate) => candidate }),
    'diagnose', address, query);
});
test('P53 direct comparison resolves complete state and consumer-owned factor default', async () => {
  const completeAddress = '/app/diagnose?view=lows&factor=ic&start_min=720&end_min=60'
    + '&another=1&occ=occ-1';
  const completeQuery = {
    view: 'lows', factor: 'ic', start_min: '720', end_min: '60',
    another: '1', occ: 'occ-1',
  };
  assert.deepEqual(parse(completeAddress), {
    kind: 'PendingRoute', page: 'diagnose', query: completeQuery,
  });
  assertResolved('complete P53 state', resolveRoute(parse(completeAddress), {
    diagnose: (query) => query,
  }), 'diagnose', completeAddress, completeQuery);

  const defaulted = await dispatchThrough('diagnose',
    '/app/diagnose?view=meals&start_min=60&end_min=180',
    (query, transaction) => transaction.resolved({ ...query, factor: 'ic' }));
  assertResolved('P53 omitted factor uses response default', defaulted.outcome, 'diagnose',
    '/app/diagnose?view=meals&factor=ic&start_min=60&end_min=180', {
      view: 'meals', factor: 'ic', start_min: '60', end_min: '180',
    });
});
test('root is the one legacy redirect and canonical queries serialize byte-stably', () => {
  assert.deepEqual(parse('/?old=state#day'), { kind: 'LegacyRedirect', address: '/?old=state#day', to: '/app/diagnose' });
  const route = parse(`/app/diagnose?finding=f1&factor=ic.day&start_min=720&end_min=60&projection=event&occ=${WORKSTATION_OCC}`);
  assert.equal(serializeRoute(route), `/app/diagnose?finding=f1&factor=ic.day&start_min=720&end_min=60&projection=event&occ=${WORKSTATION_OCC}`);
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
test('static address and canonical-query invalid classes retain exact reasons', () => {
  for (const [label, address, reason] of [
    ['duplicate key', '/app/day?date=2026-07-15&date=2026-07-16', 'query-keys'],
    ['unknown key', '/app/day?date=2026-07-15&extra=1', 'query-keys'],
    ['empty value', '/app/day?date=', 'query-keys'],
    ['malformed percent escape', '/app/verify?trial=%ZZ', 'malformed-percent-escape'],
    ['nonempty fragment', '/app/day#summary', 'fragment'],
    ['empty fragment', '/app/day#', 'trailing-separator'],
    ['empty trailing query', '/app/day?', 'trailing-separator'],
    ['non-canonical raw encoding', '/app/guide?article=reading%2Dday', 'non-canonical'],
    ['non-canonical key order', '/app/diagnose?factor=ic.day&finding=f1', 'non-canonical'],
    ['explicit clock default', '/app/diagnose?finding=f1&factor=ic.day&projection=clock', 'projection'],
    ['explicit false another default', '/app/diagnose?view=lows&another=0', 'another'],
    ['unknown app page', '/app/nope', 'unknown-page'],
    ['empty app page', '/app/', 'unknown-page'],
    ['trailing page slash', '/app/day/', 'unknown-page'],
    ['extra path segment', '/app/day/extra', 'unknown-page'],
    ['outside app namespace', '/outside', 'unknown-page'],
  ]) assertInvalid(label, address, reason);
  assert.deepEqual(parseRoute('http://['), {
    kind: 'InvalidRoute', address: 'http://[', reason: 'malformed-address',
  });
});
test('paired bounds reject every incomplete or non-canonical interval', () => {
  for (const [label, suffix] of [
    ['missing end', 'start_min=60'],
    ['missing start', 'end_min=120'],
    ['leading-zero start', 'start_min=060&end_min=120'],
    ['leading-zero end', 'start_min=60&end_min=0120'],
    ['start greater than 1440', 'start_min=1441&end_min=120'],
    ['end greater than 1440', 'start_min=120&end_min=1441'],
    ['equal bounds', 'start_min=120&end_min=120'],
    ['full-day 0/1440', 'start_min=0&end_min=1440'],
    ['full-day 1440/0', 'start_min=1440&end_min=0'],
  ]) {
    const address = `/app/diagnose?view=lows&${suffix}`;
    assertInvalid(label, address, 'bounds');
  }
});
test('paired bounds include 0 and 1440 in distinct non-full-day intervals', () => {
  for (const [label, startMin, endMin] of [
    ['inclusive zero start', '0', '60'],
    ['inclusive 1440 end', '1380', '1440'],
    ['inclusive 1440 start', '1440', '60'],
  ]) {
    const address = `/app/diagnose?view=lows&start_min=${startMin}&end_min=${endMin}`;
    const query = { view: 'lows', start_min: startMin, end_min: endMin };
    const pending = parse(address);
    assert.deepEqual(pending, { kind: 'PendingRoute', page: 'diagnose', query }, label);
    assertResolved(label, resolveRoute(pending, { diagnose: (candidate) => candidate }),
      'diagnose', address, query);
  }
});
test('workstation pairing, tokens, projection, and occurrence grammar fail closed', () => {
  const occurrenceAlias = `${WORKSTATION_OCC.slice(0, -1)}R`;
  for (const [label, suffix, reason] of [
    ['finding without factor', 'finding=f1', 'workstation-pair'],
    ['factor without finding', 'factor=ic.day', 'workstation-pair'],
    ['bounds without finding/factor', 'start_min=60&end_min=120', 'workstation-pair'],
    ['projection without finding/factor', 'projection=event', 'workstation-pair'],
    ['occurrence without finding/factor', `occ=${WORKSTATION_OCC}`, 'workstation-pair'],
    ['finding has canonically encoded invalid syntax', 'finding=bad%7Eid&factor=ic.day', 'finding'],
    ['finding exceeds 160 characters', `finding=${'a'.repeat(161)}&factor=ic.day`, 'finding'],
    ['factor missing lever', 'finding=f1&factor=ic', 'finding'],
    ['factor has uppercase family', 'finding=f1&factor=IC.day', 'finding'],
    ['factor has uppercase lever', 'finding=f1&factor=ic.Day', 'finding'],
    ['projection value is not event', 'finding=f1&factor=ic.day&projection=clock', 'projection'],
    ['occurrence alphabet', 'finding=f1&factor=ic.day&occ=not-base64!', 'occ'],
    ['occurrence non-canonical base64url', `finding=f1&factor=ic.day&occ=${occurrenceAlias}`, 'occ'],
    ['occurrence JSON values are not strings', 'finding=f1&factor=ic.day&occ=WzEsMiwzXQ', 'occ'],
    ['occurrence JSON has wrong arity', 'finding=f1&factor=ic.day&occ=WyJpYyIsImVwMSJd', 'occ'],
    ['occurrence JSON contains whitespace', 'finding=f1&factor=ic.day&occ=WyJpYyIsICJlcDEiLCAidCJd', 'occ'],
  ]) {
    const address = `/app/diagnose?${suffix}`;
    assertInvalid(label, address, reason);
  }
});
test('Diagnose direct/workstation union and P53 token grammar are closed', () => {
  for (const [label, suffix, reason] of [
    ['view conflicts with workstation finding', 'view=lows&finding=f1&factor=ic.day', 'direct-comparison'],
    ['view conflicts with workstation projection', 'view=lows&projection=event', 'direct-comparison'],
    ['view grammar', 'view=glucose', 'direct-comparison'],
    ['another requires direct view', 'another=1', 'another'],
    ['another conflicts with workstation', 'finding=f1&factor=ic.day&another=1', 'another'],
    ['another grammar', 'view=lows&another=2', 'another'],
    ['P53 factor cannot contain a dot', 'view=lows&factor=ic.day', 'factor'],
    ['P53 factor is lowercase', 'view=lows&factor=IC', 'factor'],
    ['P53 occurrence identifier grammar', 'view=lows&occ=bad%20id', 'occ'],
  ]) {
    const address = `/app/diagnose?${suffix}`;
    assertInvalid(label, address, reason);
  }
});
test('page-specific scalar grammars and stateless pages reject invalid queries', () => {
  for (const [label, address, reason] of [
    ['Day calendar date', '/app/day?date=2026-02-30', 'date'],
    ['Day date shape', '/app/day?date=2026-2-03', 'date'],
    ['Verify identifier', '/app/verify?trial=bad%20trial', 'trial'],
    ['Guide slug uppercase', '/app/guide?article=Start-here', 'article'],
    ['Guide slug double separator', '/app/guide?article=start--here', 'article'],
    ['Plan has no query', '/app/plan?x=1', 'query-keys'],
    ['Settings has no query', '/app/settings?x=1', 'query-keys'],
  ]) assertInvalid(label, address, reason);
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
