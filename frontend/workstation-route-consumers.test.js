import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createRouteResolver, parseRoute } from './url-state.js';
import {
  createDiagnoseRouteConsumer,
  createVerifyRouteConsumer,
  encodeDiagnoseOccurrence,
} from './workstation-route-consumers.js';
import { projectSyntheticCapture } from '../mockups/diagnose-event-comparison.synthetic/project.mjs';

const eventFixtures = JSON.parse(readFileSync(
  new URL('./__fixtures__/event-comparison-mirror.json', import.meta.url), 'utf8'));
const findingsFixtures = JSON.parse(readFileSync(
  new URL('./__fixtures__/findings-projection.json', import.meta.url), 'utf8'));
const eventCapture = JSON.parse(readFileSync(
  new URL('../mockups/diagnose-event-comparison.synthetic/capture.json', import.meta.url), 'utf8'));

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
  const window = { start_min: 720, end_min: 1440 };
  const catalog = projectSyntheticCapture(eventCapture, { view: 'lows', window });
  const occurrenceId = catalog.occurrences[0].identity.id;
  const projection = projectSyntheticCapture(eventCapture, {
    view: 'lows', window, occurrenceId,
  });
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
    'http://example.test/app/diagnose?view=lows'
    + `&start_min=720&end_min=1440&occ=${occurrenceId}`));

  assert.deepEqual(requests, [{
    view: 'lows', factor: undefined, window,
    another: false, occurrenceId,
  }]);
  assert.deepEqual(resolution.outcome, {
    kind: 'ResolvedRoute', page: 'diagnose', query: {
      view: 'lows', factor: 'over_treated_low', start_min: '720', end_min: '1440',
      occ: occurrenceId,
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
    loadComparison: async () => structuredClone(eventFixtures.windows.lows_default),
    publish() {},
  }));

  const resolution = await routes.dispatch(parseRoute(
    '/app/diagnose?view=lows&factor=correction_stacking'));

  assert.equal(resolution.outcome.kind, 'InvalidRoute');
});

test('P53 rejects a successful full-day response for a scoped another-factor route', async () => {
  const published = [];
  const routes = createRouteResolver();
  routes.register('diagnose', createDiagnoseRouteConsumer({
    loadWorkstation: async () => assert.fail('P53 must not load workstation evidence'),
    loadComparison: async () => structuredClone(eventFixtures.windows.meals_default),
    publish: (...args) => published.push(args),
  }));

  const resolution = await routes.dispatch(parseRoute(
    '/app/diagnose?view=meals&factor=carb_undercount'
    + '&start_min=840&end_min=960&another=1'));

  assert.equal(resolution.outcome.kind, 'InvalidRoute');
  resolution.publish();
  assert.deepEqual(published, []);
});

test('P53 rejects a successful scoped response for an omitted whole-day window', async () => {
  const routes = createRouteResolver();
  routes.register('diagnose', createDiagnoseRouteConsumer({
    loadWorkstation: async () => assert.fail('P53 must not load workstation evidence'),
    loadComparison: async () => structuredClone(eventFixtures.windows.midday),
    publish() {},
  }));

  const resolution = await routes.dispatch(parseRoute(
    '/app/diagnose?view=meals&factor=carb_undercount'));

  assert.equal(resolution.outcome.kind, 'InvalidRoute');
});

test('P53 rejects a named Occurrence whose successful response says it is unavailable', async () => {
  const projection = structuredClone(eventFixtures.windows.selection);
  const occurrenceId = projection.selection.requested_id;
  projection.selection = { state: 'unavailable', requested_id: occurrenceId, detail: null };
  const published = [];
  const routes = createRouteResolver();
  routes.register('diagnose', createDiagnoseRouteConsumer({
    loadWorkstation: async () => assert.fail('P53 must not load workstation evidence'),
    loadComparison: async () => projection,
    publish: (...args) => published.push(args),
  }));

  const resolution = await routes.dispatch(parseRoute(
    `/app/diagnose?view=meals&factor=carb_undercount&occ=${occurrenceId}`));

  assert.equal(resolution.outcome.kind, 'InvalidRoute');
  resolution.publish();
  assert.deepEqual(published, []);
});

test('Diagnose resolves a complete workstation case file from one successful projection', async () => {
  const occurrence = {
    ep_id: 'episode-7', t: '2026-07-15 12:05:00', date: '2026-07-15',
  };
  const payload = {
    findings: {
      window: { scoped: true, start_min: 60, end_min: 180, label: '01:00–03:00' },
      rows: [{
        id: 'finding:low-7', lever: 'over_treated_low',
        evidence: [{ family: 'lows', ep_id: occurrence.ep_id, t: occurrence.t }],
      }],
    },
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

test('Diagnose rejects a successful whole-day findings projection for a scoped route', async () => {
  const findings = structuredClone(findingsFixtures.windows.global);
  const row = findings.rows.find((candidate) => candidate.id === 'finding:over_treated_low');
  const published = [];
  const routes = createRouteResolver();
  routes.register('diagnose', createDiagnoseRouteConsumer({
    loadWorkstation: async () => ({
      findings,
      exposures: structuredClone(findingsFixtures.inputs.exposures),
    }),
    loadComparison: async () => assert.fail('clock route must not load event projection'),
    publish: (...args) => published.push(args),
  }));

  const resolution = await routes.dispatch(parseRoute(
    `/app/diagnose?finding=${encodeURIComponent(row.id)}`
    + `&factor=lows.${row.lever}&start_min=720&end_min=840`));

  assert.equal(resolution.outcome.kind, 'InvalidRoute');
  resolution.publish();
  assert.deepEqual(published, []);
});

test('Diagnose rejects a successful scoped findings projection for an omitted window', async () => {
  const findings = structuredClone(findingsFixtures.windows.rebound);
  const row = findings.rows.find((candidate) => candidate.id === 'finding:over_treated_low');
  const family = row.evidence[0].family;
  const routes = createRouteResolver();
  routes.register('diagnose', createDiagnoseRouteConsumer({
    loadWorkstation: async () => ({
      findings,
      exposures: structuredClone(findingsFixtures.inputs.exposures),
    }),
    loadComparison: async () => assert.fail('clock route must not load event projection'),
    publish() {},
  }));

  const resolution = await routes.dispatch(parseRoute(
    `/app/diagnose?finding=${encodeURIComponent(row.id)}&factor=${family}.${row.lever}`));

  assert.equal(resolution.outcome.kind, 'InvalidRoute');
});

test('Diagnose stages event projection and its occurrence detail before route commit', async () => {
  const catalog = projectSyntheticCapture(eventCapture, {
    view: 'lows', factor: 'over_treated_low',
  });
  const eventOccurrence = catalog.occurrences[0];
  const occurrence = {
    ep_id: eventOccurrence.identity.ep_id, t: eventOccurrence.identity.t,
  };
  const payload = {
    findings: {
      window: { scoped: false, start_min: null, end_min: null, label: null },
      rows: [{
        id: 'finding:low-7', lever: 'over_treated_low',
        evidence: [{ family: 'lows', ...occurrence }],
      }],
    },
    exposures: { exposures: { lows: { occurrences: [occurrence] } } },
  };
  const selected = projectSyntheticCapture(eventCapture, {
    view: 'lows', factor: 'over_treated_low',
    occurrenceId: eventOccurrence.identity.id,
  });
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
      another: false, occurrenceId: eventOccurrence.identity.id },
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
    findings: {
      window: { scoped: false, start_min: null, end_min: null, label: null },
      rows: [{
        id: 'finding:iob', lever: 'correction_on_iob',
        evidence: [{ family: 'corrections', ep_id: 'correction-1', t: '2026-07-15 08:00:00' }],
      }],
    },
    exposures: { exposures: { lows: { occurrences: [] } } },
  };
  const routes = createRouteResolver();
  let staged;
  const comparisonRequests = [];
  routes.register('diagnose', createDiagnoseRouteConsumer({
    loadWorkstation: async () => payload,
    loadComparison: async (coordinates) => {
      comparisonRequests.push(coordinates);
      return projectSyntheticCapture(eventCapture, coordinates);
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

test('Diagnose rejects a full-day event projection for a scoped finding route', async () => {
  const payload = {
    findings: {
      window: { scoped: true, start_min: 720, end_min: 960, label: '12:00–16:00' },
      rows: [{
        id: 'finding:meal', lever: 'carb_undercount',
        evidence: [{ family: 'meals', ep_id: 'meal-1', t: '2026-07-15 13:00:00' }],
      }],
    },
    exposures: { exposures: { meals: { occurrences: [] } } },
  };
  const published = [];
  const routes = createRouteResolver();
  routes.register('diagnose', createDiagnoseRouteConsumer({
    loadWorkstation: async () => payload,
    loadComparison: async () => structuredClone(eventFixtures.windows.meals_default),
    publish: (...args) => published.push(args),
  }));

  const resolution = await routes.dispatch(parseRoute(
    '/app/diagnose?finding=finding%3Ameal&factor=meals.carb_undercount'
    + '&start_min=720&end_min=960&projection=event'));

  assert.equal(resolution.outcome.kind, 'InvalidRoute');
  resolution.publish();
  assert.deepEqual(published, []);
});

test('Diagnose rejects selected event detail that answers another occurrence', async () => {
  const catalog = projectSyntheticCapture(eventCapture, {
    view: 'lows', factor: 'over_treated_low',
  });
  const [requested, answered] = catalog.occurrences;
  const occurrence = {
    ep_id: requested.identity.ep_id, t: requested.identity.t,
  };
  const payload = {
    findings: {
      window: { scoped: false, start_min: null, end_min: null, label: null },
      rows: [{
        id: 'finding:low-7', lever: 'over_treated_low',
        evidence: [{ family: 'lows', ...occurrence }],
      }],
    },
    exposures: { exposures: { lows: { occurrences: [occurrence] } } },
  };
  const selected = projectSyntheticCapture(eventCapture, {
    view: 'lows', factor: 'over_treated_low', occurrenceId: answered.identity.id,
  });
  const routes = createRouteResolver();
  routes.register('diagnose', createDiagnoseRouteConsumer({
    loadWorkstation: async () => payload,
    loadComparison: async (coordinates) => coordinates.occurrenceId ? selected : catalog,
    publish() {},
  }));
  const occ = encodeDiagnoseOccurrence('lows', occurrence);

  const resolution = await routes.dispatch(parseRoute(
    '/app/diagnose?finding=finding%3Alow-7'
    + `&factor=lows.over_treated_low&projection=event&occ=${occ}`));

  assert.equal(resolution.outcome.kind, 'InvalidRoute');
});

test('Diagnose rejects a named event Occurrence whose detail response says unavailable', async () => {
  const catalog = structuredClone(eventFixtures.windows.meals_default);
  const selected = structuredClone(eventFixtures.windows.selection);
  const eventOccurrence = selected.occurrences.find((candidate) => (
    candidate.identity.id === selected.selection.requested_id
  ));
  selected.selection = {
    state: 'unavailable', requested_id: eventOccurrence.identity.id, detail: null,
  };
  const occurrence = {
    ep_id: eventOccurrence.identity.ep_id, t: eventOccurrence.identity.t,
  };
  const payload = {
    findings: {
      window: { scoped: false, start_min: null, end_min: null, label: null },
      rows: [{
        id: 'finding:meal', lever: 'carb_undercount',
        evidence: [{ family: 'meals', ...occurrence }],
      }],
    },
    exposures: { exposures: { meals: { occurrences: [occurrence] } } },
  };
  const published = [];
  const routes = createRouteResolver();
  routes.register('diagnose', createDiagnoseRouteConsumer({
    loadWorkstation: async () => payload,
    loadComparison: async (coordinates) => coordinates.occurrenceId ? selected : catalog,
    publish: (...args) => published.push(args),
  }));
  const occ = encodeDiagnoseOccurrence('meals', occurrence);

  const resolution = await routes.dispatch(parseRoute(
    `/app/diagnose?finding=finding%3Ameal&factor=meals.carb_undercount`
    + `&projection=event&occ=${occ}`));

  assert.equal(resolution.outcome.kind, 'InvalidRoute');
  resolution.publish();
  assert.deepEqual(published, []);
});

test('Diagnose rejects selected event detail projected for a different window', async () => {
  const window = { start_min: 720, end_min: 1440 };
  const catalog = projectSyntheticCapture(eventCapture, {
    view: 'lows', factor: 'over_treated_low', window,
  });
  const eventOccurrence = catalog.occurrences[0];
  const selected = projectSyntheticCapture(eventCapture, {
    view: 'lows', factor: 'over_treated_low',
    occurrenceId: eventOccurrence.identity.id,
  });
  const occurrence = {
    ep_id: eventOccurrence.identity.ep_id, t: eventOccurrence.identity.t,
  };
  const payload = {
    findings: {
      window: { scoped: true, ...window, label: '12:00–24:00' },
      rows: [{
        id: 'finding:low', lever: 'over_treated_low',
        evidence: [{ family: 'lows', ...occurrence }],
      }],
    },
    exposures: { exposures: { lows: { occurrences: [occurrence] } } },
  };
  const routes = createRouteResolver();
  routes.register('diagnose', createDiagnoseRouteConsumer({
    loadWorkstation: async () => payload,
    loadComparison: async (coordinates) => coordinates.occurrenceId ? selected : catalog,
    publish() {},
  }));
  const occ = encodeDiagnoseOccurrence('lows', occurrence);

  const resolution = await routes.dispatch(parseRoute(
    '/app/diagnose?finding=finding%3Alow&factor=lows.over_treated_low'
    + `&start_min=720&end_min=1440&projection=event&occ=${occ}`));

  assert.equal(resolution.outcome.kind, 'InvalidRoute');
});

test('Diagnose transport failures remain page data errors, not invalid links', async () => {
  for (const [address, loadWorkstation, loadComparison] of [
    [
      '/app/diagnose?view=lows&factor=over_treated_low',
      async () => assert.fail('P53 must not load workstation evidence'),
      async () => { throw new Error('comparison unavailable'); },
    ],
    [
      '/app/diagnose?finding=finding%3Alow&factor=lows.over_treated_low',
      async () => { throw new Error('findings unavailable'); },
      async () => assert.fail('failed findings must not load event comparison'),
    ],
  ]) {
    const routes = createRouteResolver();
    routes.register('diagnose', createDiagnoseRouteConsumer({
      loadWorkstation, loadComparison, publish() {},
    }));
    const resolution = await routes.dispatch(parseRoute(address));
    assert.equal(resolution.outcome.kind, 'RouteDataError', address);
    assert.equal(Object.hasOwn(resolution.outcome, 'query'), false, address);
  }
});

test('Diagnose restores a joined occurrence in its published secondary family', async () => {
  const occurrence = { ep_id: 'high-1', t: '2026-07-15 14:05:00' };
  const payload = {
    findings: {
      window: { scoped: false, start_min: null, end_min: null, label: null },
      rows: [{
        id: 'finding:carbs', lever: 'carb_undercount',
        evidence: [{ family: 'highs', ...occurrence }],
      }],
    },
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
