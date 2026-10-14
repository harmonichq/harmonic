// The app's one client (data.js), through its public namespace with a fake
// transport. Runs under Node's built-in test runner with no npm deps:
//   node --test 'frontend/**/*.test.js'
import test from 'node:test';
import assert from 'node:assert/strict';

import { ApiTransportError, TOKEN_KEY, makeDeps } from './data.js';

/** A fake fetch answering every call with `body` at `status`, recording each call. */
function fakeFetch(body = {}, status = 200) {
  const calls = [];
  const fetch = async (url, opts) => {
    calls.push({ url, opts: opts || {} });
    const ok = status >= 200 && status < 300;
    return { ok, status, statusText: ok ? 'OK' : 'Error', json: async () => body };
  };
  return { fetch, calls };
}

function withToken(token, fn) {
  const prev = globalThis.localStorage;
  globalThis.localStorage = { getItem: (key) => (key === TOKEN_KEY ? token : null) };
  try { return fn(); } finally { globalThis.localStorage = prev; }
}

const body = (call) => JSON.parse(call.opts.body);

test('each read asks for its endpoint', async () => {
  const { fetch, calls } = fakeFetch();
  const api = makeDeps({ fetch });
  await api.fetchStatus();
  await api.fetchCredentials();
  await api.fetchPumpSettings();
  await api.fetchGuidance();
  await api.fetchDiagnoseFindings();
  await api.fetchAnalysis();
  await api.fetchDiagnoseFindingCasePreparation();
  await api.fetchFocuses();
  await api.fetchExploreTimeOfDay();
  await api.fetchDayNavigator();
  await api.fetchDayNavigator('2026-03');
  await api.fetchPrompts();
  assert.deepEqual(calls.map((c) => c.url), [
    '/api/status', '/api/credentials', '/api/pump-settings', '/api/guidance', '/api/diagnose/findings',
    '/api/analyze', '/api/diagnose/finding-case-file-preparation', '/api/focus', '/api/explore/time-of-day',
    '/api/day-navigator', '/api/day-navigator?month=2026-03', '/api/prompts',
  ]);
  assert.ok(calls.every((c) => !c.opts.method));
});

test('parameterised reads encode their query', async () => {
  const { fetch, calls } = fakeFetch();
  const api = makeDeps({ fetch });
  await api.fetchOutcomes(30);
  await api.fetchVerifyTrials();
  await api.fetchVerifyTrials({ selected: 'trial:1', kind: 'focus', assessment: 'retained' });
  await api.fetchTimeline({ start: '2026-09-29T00:00:00', end: '2026-09-30T00:00:00' });
  await api.fetchCarbs({ start: '2026-09-29T00:00:00', end: '2026-09-30T00:00:00' });
  await api.fetchDiagnoseFindingCase({ projection_id: 'p 1', finding_id: 'pattern:x', alignment: 'event' });
  assert.deepEqual(calls.map((c) => c.url), [
    '/api/outcomes?window=30',
    '/api/verify/trials',
    '/api/verify/trials?selected=trial%3A1&kind=focus&assessment=retained',
    '/api/timeline?start=2026-09-29T00%3A00%3A00&end=2026-09-30T00%3A00%3A00',
    '/api/carbs?start=2026-09-29T00%3A00%3A00&end=2026-09-30T00%3A00%3A00',
    '/api/diagnose/finding-case-file?projection_id=p+1&finding_id=pattern%3Ax&alignment=event',
  ]);
});

test('each write sends its method and JSON body', async () => {
  const { fetch, calls } = fakeFetch();
  const api = makeDeps({ fetch });
  await api.saveCredentials({ email: 'a@example.invalid', password: 'p', region: 'US' });
  await api.setGuidancePreference('pattern:highs after meals', { generation: 'g1' });
  await api.restoreGuidancePreference('pattern:highs after meals');
  await api.pinFocus({ pattern_key: 'k', outcome_window: { start_min: 0, end_min: 1440 } });
  await api.resolveFocus(7);
  await api.finishTrial('trial:1', { request_id: 'r', input_revision: 3 });
  await api.createCarb({ t: '2026-09-29 12:00:00', grams: 30, certainty: 'exact', source: 'manual' });
  await api.updateCarb(12, { grams: 15, certainty: 'exact' });
  await api.answerPrompt({ detector: 'low', anchor_t: '2026-09-29 03:00:00', answer: 'no' });
  assert.deepEqual(calls.map((c) => [c.opts.method, c.url]), [
    ['POST', '/api/credentials'],
    ['PUT', '/api/guidance/preferences/pattern%3Ahighs%20after%20meals'],
    ['DELETE', '/api/guidance/preferences/pattern%3Ahighs%20after%20meals'],
    ['POST', '/api/focus'],
    ['POST', '/api/focus/7/resolve'],
    ['POST', '/api/verify/trials/trial%3A1/finish'],
    ['POST', '/api/carbs'],
    ['PATCH', '/api/carbs/12'],
    ['POST', '/api/prompts/answer'],
  ]);
  assert.deepEqual(body(calls[1]), { generation: 'g1', reason: null });
  assert.equal(calls[2].opts.body, undefined);
  assert.equal(calls[4].opts.body, undefined);
  assert.deepEqual(body(calls[7]), { grams: 15, certainty: 'exact' });
  assert.equal(calls[0].opts.headers['Content-Type'], 'application/json');
});

test('the stored token rides every request as a Bearer header', async () => {
  const { fetch, calls } = fakeFetch();
  const api = makeDeps({ fetch });
  await withToken('synthetic-token', () => api.fetchStatus());
  await api.fetchStatus();
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer synthetic-token');
  assert.equal(calls[1].opts.headers.Authorization, undefined);
});

test('a refused request rejects with its status, code and served words', async () => {
  const detail = { code: 'immature_trial', message: 'The Trial has not matured.' };
  const { fetch } = fakeFetch({ detail }, 409);
  await assert.rejects(makeDeps({ fetch }).finishTrial('t', {}), (error) => {
    assert.ok(error instanceof ApiTransportError);
    assert.equal(error.status, 409);
    assert.equal(error.code, 'immature_trial');
    assert.equal(error.message, 'The Trial has not matured.');
    return true;
  });
  const plain = fakeFetch({ detail: 'guidance is unavailable' }, 503);
  await assert.rejects(makeDeps({ fetch: plain.fetch }).fetchGuidance(), { status: 503, message: 'guidance is unavailable' });
});
