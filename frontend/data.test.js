// #102 — tests for the data-access module (data.js).
// Runs under Node's built-in test runner with no npm deps:
//   node --test 'frontend/**/*.test.js'
//
// Uses makeDeps({ fetch: fakeFetch }) to inject a fake transport — no real
// network, no DOM, no localStorage.

import test from 'node:test';
import assert from 'node:assert/strict';

import { makeDeps } from './data.js';

// ---------------------------------------------------------------------------
// Fake-fetch helpers
// ---------------------------------------------------------------------------

/**
 * Build a fake fetch that resolves with a JSON body and the given status.
 * Records every call in `calls` for inspection.
 *
 * @param {object} [body={}]
 * @param {number} [status=200]
 * @returns {{ fetch: Function, calls: Array }}
 */
function makeFakeFetch(body = {}, status = 200) {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts: opts || {} });
    const ok = status >= 200 && status < 300;
    return {
      ok,
      status,
      statusText: ok ? 'OK' : 'Error',
      json: async () => (ok ? body : { detail: 'server error detail' }),
    };
  };
  return { fetch: fakeFetch, calls };
}

// ---------------------------------------------------------------------------
// Token helper: simulate localStorage.getItem via globalThis
// ---------------------------------------------------------------------------

function withToken(token, fn) {
  // data.js reads `localStorage` from the calling scope's globalThis.
  // We temporarily install a minimal shim so the token path is exercised.
  const prev = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (k === 'ciq_token' ? token : null),
  };
  try { return fn(); }
  finally { globalThis.localStorage = prev; }
}

// ---------------------------------------------------------------------------
// URL / method / query-string construction
// ---------------------------------------------------------------------------

test('fetchCredentials builds GET /credentials', async () => {
  const { fetch, calls } = makeFakeFetch({ configured: true });
  const { fetchCredentials } = makeDeps({ fetch });
  await fetchCredentials();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/credentials');
  assert.ok(!calls[0].opts.method || calls[0].opts.method === 'GET');
});

test('saveCredentials builds POST /credentials with JSON body', async () => {
  const { fetch, calls } = makeFakeFetch({ configured: true });
  const { saveCredentials } = makeDeps({ fetch });
  const form = { email: 'a@b.com', password: 's3cr3t', region: 'US' };
  await saveCredentials(form);
  assert.equal(calls[0].url, '/credentials');
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].opts.body), form);
});

test('fetchStatus builds GET /status', async () => {
  const { fetch, calls } = makeFakeFetch({});
  const { fetchStatus } = makeDeps({ fetch });
  await fetchStatus();
  assert.equal(calls[0].url, '/status');
  assert.ok(!calls[0].opts.method || calls[0].opts.method === 'GET');
});

test('fetchNow builds POST /fetch', async () => {
  const { fetch, calls } = makeFakeFetch({});
  const { fetchNow } = makeDeps({ fetch });
  await fetchNow();
  assert.equal(calls[0].url, '/fetch');
  assert.equal(calls[0].opts.method, 'POST');
});

test('fetchPumpSettings builds GET /pump-settings', async () => {
  const { fetch, calls } = makeFakeFetch({ configured: false });
  const { fetchPumpSettings } = makeDeps({ fetch });
  await fetchPumpSettings();
  assert.equal(calls[0].url, '/pump-settings');
});

test('fetchBacktest builds GET /backtest with default holdout', async () => {
  const { fetch, calls } = makeFakeFetch({ n_matched: 0 });
  const { fetchBacktest } = makeDeps({ fetch });
  await fetchBacktest();
  assert.equal(calls[0].url, '/backtest');
});

test('fetchBacktest appends ?holdout_days when non-default', async () => {
  const { fetch, calls } = makeFakeFetch({ n_matched: 0 });
  const { fetchBacktest } = makeDeps({ fetch });
  await fetchBacktest({ holdoutDays: 5 });
  assert.equal(calls[0].url, '/backtest?holdout_days=5');
});

test('fetchAnalysis builds GET /analyze without params by default', async () => {
  const { fetch, calls } = makeFakeFetch({ basal: [], isf: [], ic: [] });
  const { fetchAnalysis } = makeDeps({ fetch });
  await fetchAnalysis();
  assert.equal(calls[0].url, '/analyze');
});

test('fetchAnalysis appends ?ignore_changes=1 when requested', async () => {
  const { fetch, calls } = makeFakeFetch({});
  const { fetchAnalysis } = makeDeps({ fetch });
  await fetchAnalysis({ ignoreChanges: true });
  assert.equal(calls[0].url, '/analyze?ignore_changes=1');
});

test('fetchAnalysis appends window param when provided', async () => {
  const { fetch, calls } = makeFakeFetch({});
  const { fetchAnalysis } = makeDeps({ fetch });
  await fetchAnalysis({ window: 14 });
  assert.equal(calls[0].url, '/analyze?window=14');
});

test('fetchAnalysis appends both params together', async () => {
  const { fetch, calls } = makeFakeFetch({});
  const { fetchAnalysis } = makeDeps({ fetch });
  await fetchAnalysis({ window: 7, ignoreChanges: true });
  // URLSearchParams orders by insertion: window first, then ignore_changes.
  assert.equal(calls[0].url, '/analyze?window=7&ignore_changes=1');
});

test('fetchScenarios builds GET /scenarios?window=N', async () => {
  const { fetch, calls } = makeFakeFetch({ patterns: [], episodes: {} });
  const { fetchScenarios } = makeDeps({ fetch });
  await fetchScenarios(30);
  assert.equal(calls[0].url, '/scenarios?window=30');
});

test('fetchCatalog builds GET /api/catalog', async () => {
  const { fetch, calls } = makeFakeFetch({ levers: [] });
  const { fetchCatalog } = makeDeps({ fetch });
  await fetchCatalog();
  assert.equal(calls[0].url, '/api/catalog');
});

test('fetchVerifyTrials builds the bounded roster request with selection', async () => {
  const { fetch, calls } = makeFakeFetch({ trials: [], selected: null });
  const { fetchVerifyTrials } = makeDeps({ fetch });
  await fetchVerifyTrials({ selected: 'carb_ratio-12-00-20260605090000' });
  assert.equal(
    calls[0].url,
    '/verify/trials?selected=carb_ratio-12-00-20260605090000',
  );
});

test('fetchTimeline builds GET /timeline with encoded start/end', async () => {
  const { fetch, calls } = makeFakeFetch({ cgm: [], boluses: [], basal: [] });
  const { fetchTimeline } = makeDeps({ fetch });
  const start = '2025-01-01T00:00:00';
  const end   = '2025-01-08T00:00:00';
  await fetchTimeline({ start, end });
  const url = calls[0].url;
  assert.ok(url.startsWith('/timeline?'), `expected /timeline? prefix, got: ${url}`);
  assert.ok(url.includes('start=' + encodeURIComponent(start)), `missing start param: ${url}`);
  assert.ok(url.includes('end='   + encodeURIComponent(end)),   `missing end param: ${url}`);
});

test('per-day reads forward an abort signal', async () => {
  const { fetch, calls } = makeFakeFetch({ cgm: [], boluses: [], basal: [] });
  const { fetchModelView, fetchTimeline, fetchCarbs } = makeDeps({ fetch });
  const signal = new AbortController().signal;
  const range = { start: '2025-01-01T00:00:00', end: '2025-01-02T00:00:00' };

  await Promise.all([
    fetchModelView('2025-01-01', { signal }),
    fetchTimeline(range, { signal }),
    fetchCarbs(range, { signal }),
  ]);

  assert.equal(calls.length, 3);
  for (const call of calls) assert.equal(call.opts.signal, signal);
});

test('loadPlan builds GET /plan', async () => {
  const { fetch, calls } = makeFakeFetch({ items: [] });
  const { loadPlan } = makeDeps({ fetch });
  await loadPlan();
  assert.equal(calls[0].url, '/plan');
  assert.ok(!calls[0].opts.method || calls[0].opts.method === 'GET');
});

test('fetchExploreTimeOfDay builds the fixed server-owned endpoint', async () => {
  const { fetch, calls } = makeFakeFetch({ bins: [] });
  await makeDeps({ fetch }).fetchExploreTimeOfDay();
  assert.equal(calls[0].url, '/explore/time-of-day');
});

test('fetchDiagnoseEventComparison builds one coordinate-owned projection request', async () => {
  const { fetch, calls } = makeFakeFetch({ schema: 'diagnose-event-comparison-v2' });
  await makeDeps({ fetch }).fetchDiagnoseEventComparison({
    view: 'lows', factor: 'correction_on_iob', block: 'evening', another: true,
    occurrenceId: 'lows-42',
  });
  assert.equal(calls[0].url,
    '/diagnose/event-comparison?view=lows&factor=correction_on_iob&block=evening&another=1&occ=lows-42');
});

test('audit dismissal uses the stable item id and evidence fingerprint', async () => {
  const { fetch, calls } = makeFakeFetch({});
  const deps = makeDeps({ fetch });
  await deps.fetchAuditDismissals();
  await deps.dismissAuditItem('basal:2', 'evidence-v1');
  assert.equal(calls[0].url, '/audit/dismissals');
  assert.deepEqual(JSON.parse(calls[1].opts.body), { item_id:'basal:2', evidence_fingerprint:'evidence-v1' });
});

test('savePlanDraft builds PUT /plan with JSON body', async () => {
  const { fetch, calls } = makeFakeFetch({ items: [] });
  const { savePlanDraft } = makeDeps({ fetch });
  const draft = { items: [{ type: 'basal', key: 'basal:0' }] };
  await savePlanDraft(draft);
  assert.equal(calls[0].url, '/plan');
  assert.equal(calls[0].opts.method, 'PUT');
  assert.equal(calls[0].opts.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].opts.body), draft);
});

test('loadPlanHistory builds GET /plan/history', async () => {
  const { fetch, calls } = makeFakeFetch({ history: [] });
  const { loadPlanHistory } = makeDeps({ fetch });
  await loadPlanHistory();
  assert.equal(calls[0].url, '/plan/history');
});

test('applyPlan builds POST /plan/apply', async () => {
  const { fetch, calls } = makeFakeFetch({});
  const { applyPlan } = makeDeps({ fetch });
  await applyPlan();
  assert.equal(calls[0].url, '/plan/apply');
  assert.equal(calls[0].opts.method, 'POST');
});

// ---------------------------------------------------------------------------
// Bearer token attachment
// ---------------------------------------------------------------------------

test('Bearer token is attached when localStorage has ciq_token', async () => {
  const { fetch, calls } = makeFakeFetch({});
  const { fetchStatus } = makeDeps({ fetch });
  await withToken('my-secret-token', () => fetchStatus());
  const authHeader = calls[0].opts.headers['Authorization'];
  assert.equal(authHeader, 'Bearer my-secret-token');
});

test('Authorization header is absent when no token is set', async () => {
  const { fetch, calls } = makeFakeFetch({});
  const { fetchStatus } = makeDeps({ fetch });
  // Ensure localStorage.getItem returns null (no shim = no localStorage in Node).
  await fetchStatus();
  assert.ok(!calls[0].opts.headers['Authorization'],
    'Authorization header should not be present without a token');
});

// ---------------------------------------------------------------------------
// Non-2xx error unwrapping
// ---------------------------------------------------------------------------

test('non-2xx response surfaces the unwrapped detail error', async () => {
  const { fetch } = makeFakeFetch({ detail: 'server error detail' }, 403);
  const { fetchStatus } = makeDeps({ fetch });
  await assert.rejects(
    () => fetchStatus(),
    (err) => {
      assert.equal(err.message, 'server error detail');
      return true;
    },
  );
});

test('non-2xx without detail falls back to statusText', async () => {
  // Simulate a non-JSON error body.
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    return {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => { throw new SyntaxError('not json'); },
    };
  };
  const { fetchStatus } = makeDeps({ fetch: fakeFetch });
  await assert.rejects(
    () => fetchStatus(),
    (err) => {
      assert.equal(err.message, 'Internal Server Error');
      return true;
    },
  );
});
