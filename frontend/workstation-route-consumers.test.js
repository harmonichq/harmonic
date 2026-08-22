import test from 'node:test';
import assert from 'node:assert/strict';

import { createRouteResolver, parseRoute } from './url-state.js';
import {
  createDiagnoseRouteConsumer,
  createVerifyRouteConsumer,
  encodeDiagnoseOccurrence,
} from './workstation-route-consumers.js';

test('product Diagnose and Verify routes reject browser-fixture controls', () => {
  for (const address of [
    '/app/diagnose?state=dense',
    '/app/diagnose?mode=dense',
    '/app/diagnose?theme=dark',
    '/app/verify?state=complete',
    '/app/verify?theme=dark',
  ]) {
    assert.equal(parseRoute(address).kind, 'InvalidRoute', address);
  }
});

test('Verify resolves its omitted Trial before publishing the selected evidence', async () => {
  const roster = {
    trials: [
      { id: 'trial-complete', state: 'complete' },
      { id: 'trial-active', state: 'maturing' },
    ],
  };
  const details = {
    'trial-complete': { selected: { id: 'trial-complete' } },
    'trial-active': { selected: { id: 'trial-active' } },
  };
  const published = [];
  const routes = createRouteResolver();
  routes.register('verify', createVerifyRouteConsumer({
    loadRoster: async () => roster,
    loadTrial: async (id) => details[id],
    publish: (state, outcome) => published.push({ state, outcome }),
  }));

  const resolution = await routes.dispatch(parseRoute('http://example.test/app/verify'));

  assert.deepEqual(resolution.outcome, {
    kind: 'ResolvedRoute', page: 'verify', query: { trial: 'trial-active' },
  });
  assert.deepEqual(published, [], 'staged Trial evidence stays invisible');
  assert.equal(resolution.publish(), true);
  assert.deepEqual(published, [{
    state: { roster, details, trial: 'trial-active' },
    outcome: resolution.outcome,
  }]);
});

test('Verify rejects a named Trial outside the successful roster without applying selection', async () => {
  const published = [];
  const routes = createRouteResolver();
  routes.register('verify', createVerifyRouteConsumer({
    loadRoster: async () => ({ trials: [{ id: 'trial-present', state: 'maturing' }] }),
    loadTrial: async () => ({ selected: { id: 'trial-present' } }),
    publish: (...args) => published.push(args),
  }));

  const resolution = await routes.dispatch(parseRoute(
    'http://example.test/app/verify?trial=trial-missing'));

  assert.deepEqual(resolution.outcome, {
    kind: 'InvalidRoute', address: '/app/verify?trial=trial-missing', reason: 'membership',
  });
  assert.equal(resolution.publish(), true);
  assert.deepEqual(published, []);
});

test('Verify preserves its successful empty-roster surface without inventing a Trial', async () => {
  const published = [];
  const routes = createRouteResolver();
  routes.register('verify', createVerifyRouteConsumer({
    loadRoster: async () => ({ trials: [] }),
    loadTrial: async () => assert.fail('empty roster must not request detail'),
    publish: (state, outcome) => published.push({ state, outcome }),
  }));

  const resolution = await routes.dispatch(parseRoute('/app/verify'));

  assert.deepEqual(resolution.outcome, {
    kind: 'ResolvedRoute', page: 'verify', query: {},
  });
  resolution.publish();
  assert.deepEqual(published, [{
    state: { roster: { trials: [] }, details: {}, trial: null },
    outcome: resolution.outcome,
  }]);
});

test('Verify roster transport failure remains a page data error with no named Trial', async () => {
  const published = [];
  const routes = createRouteResolver();
  routes.register('verify', createVerifyRouteConsumer({
    loadRoster: async () => { throw new Error('roster unavailable'); },
    loadTrial: async () => assert.fail('failed roster must not request detail'),
    publish: (state, outcome) => published.push({ state, outcome }),
  }));

  const resolution = await routes.dispatch(parseRoute('/app/verify?trial=trial-present'));

  assert.equal(resolution.outcome.kind, 'RouteDataError');
  assert.equal(Object.hasOwn(resolution.outcome, 'query'), false);
  resolution.publish();
  assert.deepEqual(published, [{ state: undefined, outcome: resolution.outcome }]);
});

test('Verify never attaches another Trial response to the named roster identity', async () => {
  let published;
  const routes = createRouteResolver();
  routes.register('verify', createVerifyRouteConsumer({
    loadRoster: async () => ({ trials: [{ id: 'trial-present', state: 'maturing' }] }),
    loadTrial: async () => ({ selected: { id: 'trial-other' } }),
    publish: (state) => { published = state; },
  }));

  const resolution = await routes.dispatch(parseRoute(
    '/app/verify?trial=trial-present'));

  assert.equal(resolution.outcome.kind, 'ResolvedRoute');
  resolution.publish();
  assert.deepEqual(published.details, {},
    'mismatched evidence remains absent so Verify shows its existing detail error');
});

test('P53 resolves its factor default and occurrence from one successful projection', async () => {
  const projection = {
    coordinates: {
      view: 'lows', factor: 'over_treated_low',
      factor_options: [
        { key: 'over_treated_low' }, { key: 'correction_stacking' },
      ],
    },
    occurrences: [
      { identity: { id: 'low-occurrence-1' } },
      { identity: { id: 'low-occurrence-2' } },
    ],
    selection: { requested_id: 'low-occurrence-2' },
  };
  const requests = [];
  const published = [];
  const routes = createRouteResolver();
  routes.register('diagnose', createDiagnoseRouteConsumer({
    loadWorkstation: async () => assert.fail('P53 must not load workstation evidence'),
    loadComparison: async (coordinates) => {
      requests.push(coordinates);
      return projection;
    },
    publish: (state, outcome) => published.push({ state, outcome }),
  }));

  const resolution = await routes.dispatch(parseRoute(
    'http://example.test/app/diagnose?view=lows&start_min=60&end_min=180&occ=low-occurrence-2'));

  assert.deepEqual(requests, [{
    view: 'lows', factor: undefined, window: { start_min: 60, end_min: 180 },
    another: false, occurrenceId: 'low-occurrence-2',
  }]);
  assert.deepEqual(resolution.outcome, {
    kind: 'ResolvedRoute', page: 'diagnose', query: {
      view: 'lows', factor: 'over_treated_low', start_min: '60', end_min: '180',
      occ: 'low-occurrence-2',
    },
  });
  assert.deepEqual(published, []);
  resolution.publish();
  assert.deepEqual(published, [{
    state: {
      kind: 'comparison', projection,
      query: resolution.outcome.query,
    },
    outcome: resolution.outcome,
  }]);
});

test('P53 rejects a successful response that answers a different named factor', async () => {
  const routes = createRouteResolver();
  routes.register('diagnose', createDiagnoseRouteConsumer({
    loadWorkstation: async () => assert.fail('P53 must not load workstation evidence'),
    loadComparison: async () => ({
      coordinates: {
        view: 'lows', factor: 'over_treated_low',
        factor_options: [{ key: 'over_treated_low' }, { key: 'correction_stacking' }],
      },
      occurrences: [], selection: null,
    }),
    publish() {},
  }));

  const resolution = await routes.dispatch(parseRoute(
    '/app/diagnose?view=lows&factor=correction_stacking'));

  assert.equal(resolution.outcome.kind, 'InvalidRoute');
});

test('Diagnose resolves a complete workstation case file from one successful projection', async () => {
  const occurrence = {
    ep_id: 'episode-7', t: '2026-07-15 12:05:00', date: '2026-07-15',
  };
  const payload = {
    findings: { rows: [{
      id: 'finding:low-7', lever: 'over_treated_low',
      evidence: [{ family: 'lows', ep_id: occurrence.ep_id, t: occurrence.t }],
    }] },
    exposures: { exposures: { lows: { occurrences: [occurrence] } } },
  };
  const occ = encodeDiagnoseOccurrence('lows', occurrence);
  const requests = [];
  const published = [];
  const routes = createRouteResolver();
  routes.register('diagnose', createDiagnoseRouteConsumer({
    loadWorkstation: async (window) => { requests.push(window); return payload; },
    loadComparison: async () => assert.fail('clock projection must not load event comparison'),
    publish: (state, outcome) => published.push({ state, outcome }),
  }));
  const address = 'http://example.test/app/diagnose?finding=finding%3Alow-7'
    + `&factor=lows.over_treated_low&start_min=60&end_min=180&occ=${occ}`;

  const resolution = await routes.dispatch(parseRoute(address));

  assert.deepEqual(requests, [{ start_min: 60, end_min: 180 }]);
  assert.deepEqual(resolution.outcome, {
    kind: 'ResolvedRoute', page: 'diagnose', query: {
      finding: 'finding:low-7', factor: 'lows.over_treated_low',
      start_min: '60', end_min: '180', occ,
    },
  });
  assert.deepEqual(published, []);
  resolution.publish();
  assert.deepEqual(published, [{
    state: {
      kind: 'workstation', payload,
      selection: {
        finding: 'finding:low-7', family: 'lows', routeFamily: 'lows', lever: 'over_treated_low',
        window: [60, 180], projection: 'clock', occurrence,
      },
      query: resolution.outcome.query,
    },
    outcome: resolution.outcome,
  }]);
});

test('Diagnose stages event projection and its occurrence detail before route commit', async () => {
  const occurrence = { ep_id: 'episode-7', t: '2026-07-15 12:05:00' };
  const payload = {
    findings: { rows: [{
      id: 'finding:low-7', lever: 'over_treated_low',
      evidence: [{ family: 'lows', ...occurrence }],
    }] },
    exposures: { exposures: { lows: { occurrences: [occurrence] } } },
  };
  const catalog = {
    coordinates: { view: 'lows', factor: 'over_treated_low' },
    occurrences: [{ identity: { id: 'opaque-low-7', ...occurrence } }],
  };
  const selected = {
    ...catalog,
    selection: { requested_id: 'opaque-low-7', detail: { identity: catalog.occurrences[0].identity } },
  };
  const requests = [];
  const routes = createRouteResolver();
  let staged;
  routes.register('diagnose', createDiagnoseRouteConsumer({
    loadWorkstation: async () => payload,
    loadComparison: async (coordinates) => {
      requests.push(coordinates);
      return coordinates.occurrenceId ? selected : catalog;
    },
    publish(state) { staged = state; },
  }));
  const occ = encodeDiagnoseOccurrence('lows', occurrence);
  const resolution = await routes.dispatch(parseRoute(
    'http://example.test/app/diagnose?finding=finding%3Alow-7'
    + `&factor=lows.over_treated_low&projection=event&occ=${occ}`));

  assert.deepEqual(requests, [
    { view: 'lows', factor: 'over_treated_low', window: null,
      another: false, occurrenceId: undefined },
    { view: 'lows', factor: 'over_treated_low', window: null,
      another: false, occurrenceId: 'opaque-low-7' },
  ]);
  assert.equal(resolution.outcome.kind, 'ResolvedRoute');
  const secondRoutes = createRouteResolver();
  secondRoutes.register('diagnose', createDiagnoseRouteConsumer({
    loadWorkstation: async () => payload,
    loadComparison: async (coordinates) => coordinates.occurrenceId ? selected : catalog,
    publish: (state) => { staged = state; },
  }));
  const committed = await secondRoutes.dispatch(parseRoute(
    'http://example.test/app/diagnose?finding=finding%3Alow-7'
    + `&factor=lows.over_treated_low&projection=event&occ=${occ}`));
  committed.publish();
  assert.equal(staged.comparison, selected);
  assert.equal(staged.selection.projection, 'event');
  assert.equal(staged.selection.occurrence, occurrence);
});

test('Diagnose requires the canonical factor family to be published by the finding row', async () => {
  const payload = {
    findings: { rows: [{
      id: 'finding:iob', lever: 'correction_on_iob',
      evidence: [{ family: 'corrections', ep_id: 'correction-1', t: '2026-07-15 08:00:00' }],
    }] },
    exposures: { exposures: { lows: { occurrences: [] } } },
  };
  const routes = createRouteResolver();
  let staged;
  const comparisonRequests = [];
  routes.register('diagnose', createDiagnoseRouteConsumer({
    loadWorkstation: async () => payload,
    loadComparison: async (coordinates) => {
      comparisonRequests.push(coordinates);
      return {
        coordinates: {
          view: 'lows', factor: 'correction_on_iob',
          factor_options: [{ key: 'correction_on_iob' }],
        },
        occurrences: [],
      };
    },
    publish(state) { staged = state; },
  }));

  const invalid = await routes.dispatch(parseRoute(
    '/app/diagnose?finding=finding%3Aiob&factor=lows.correction_on_iob'));
  assert.equal(invalid.outcome.kind, 'InvalidRoute');

  const resolution = await routes.dispatch(parseRoute(
    '/app/diagnose?finding=finding%3Aiob&factor=corrections.correction_on_iob'));
  assert.equal(resolution.outcome.kind, 'ResolvedRoute');
  resolution.publish();
  assert.equal(staged.selection.routeFamily, 'corrections');
  assert.equal(staged.selection.family, 'lows');

  const event = await routes.dispatch(parseRoute(
    '/app/diagnose?finding=finding%3Aiob&factor=corrections.correction_on_iob&projection=event'));
  assert.equal(event.outcome.kind, 'ResolvedRoute');
  assert.deepEqual(comparisonRequests, [{
    view: 'lows', factor: 'correction_on_iob', window: null,
    another: false, occurrenceId: undefined,
  }]);
});

test('Diagnose rejects selected event detail that answers another occurrence', async () => {
  const occurrence = { ep_id: 'episode-7', t: '2026-07-15 12:05:00' };
  const payload = {
    findings: { rows: [{
      id: 'finding:low-7', lever: 'over_treated_low',
      evidence: [{ family: 'lows', ...occurrence }],
    }] },
    exposures: { exposures: { lows: { occurrences: [occurrence] } } },
  };
  const catalog = {
    coordinates: { view: 'lows', factor: 'over_treated_low' },
    occurrences: [{ identity: { id: 'opaque-low-7', ...occurrence } }],
    selection: null,
  };
  const routes = createRouteResolver();
  routes.register('diagnose', createDiagnoseRouteConsumer({
    loadWorkstation: async () => payload,
    loadComparison: async (coordinates) => coordinates.occurrenceId ? {
      ...catalog, selection: { requested_id: 'another-occurrence' },
    } : catalog,
    publish() {},
  }));
  const occ = encodeDiagnoseOccurrence('lows', occurrence);

  const resolution = await routes.dispatch(parseRoute(
    '/app/diagnose?finding=finding%3Alow-7'
    + `&factor=lows.over_treated_low&projection=event&occ=${occ}`));

  assert.equal(resolution.outcome.kind, 'InvalidRoute');
});

test('Diagnose restores a joined occurrence in its published secondary family', async () => {
  const occurrence = { ep_id: 'high-1', t: '2026-07-15 14:05:00' };
  const payload = {
    findings: { rows: [{
      id: 'finding:carbs', lever: 'carb_undercount',
      evidence: [{ family: 'highs', ...occurrence }],
    }] },
    exposures: { exposures: { highs: { occurrences: [occurrence] } } },
  };
  let staged;
  const routes = createRouteResolver();
  routes.register('diagnose', createDiagnoseRouteConsumer({
    loadWorkstation: async () => payload,
    loadComparison: async () => assert.fail('clock occurrence must not load event projection'),
    publish(state) { staged = state; },
  }));
  const occ = encodeDiagnoseOccurrence('highs', occurrence);

  const resolution = await routes.dispatch(parseRoute(
    `/app/diagnose?finding=finding%3Acarbs&factor=highs.carb_undercount&occ=${occ}`));

  assert.equal(resolution.outcome.kind, 'ResolvedRoute');
  resolution.publish();
  assert.equal(staged.selection.routeFamily, 'highs');
  assert.equal(staged.selection.family, 'highs');
  assert.equal(staged.selection.occurrence, occurrence);
});
