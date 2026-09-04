# Generated facts — #277 plan inputs

These transcripts ground the closed expected diff. Regenerate; never edit.

## Data helper precedent

Command:

```sh
sed -n '213,224p' frontend/data.js; sed -n '450,518p' frontend/data.js
```

Output:

```text
  function fetchVerifyTrials({ selected } = {}) {
    const params = new URLSearchParams();
    if (selected) params.set('selected', selected);
    const qs = params.toString();
    return api('/api/verify/trials' + (qs ? '?' + qs : ''));
  }

  /** GET /api/explore/time-of-day — fixed server-owned 30-day aggregate. */
  function fetchExploreTimeOfDay() { return api('/api/explore/time-of-day'); }
  /** GET /api/explore/exposures — every exposure in the window with each
   *  classifier's verdict; the Diagnose inspector's own feed (#654). */
  function fetchExploreExposures() { return api('/api/explore/exposures'); }

  return {
    fetchCredentials,
    saveCredentials,
    fetchStatus,
    fetchNow,
    fetchPumpSettings,
    fetchBacktest,
    fetchAnalysis,
    fetchScenarios,
    fetchCatalog,
    fetchKbArticle,
    fetchModelView,
    fetchDayNavigator,
    fetchOutcomesTrend,
    fetchVerifyTrials,
    fetchExploreTimeOfDay,
    fetchExploreExposures,
    fetchDiagnoseBasalNightEvidence,
    fetchDiagnoseIsfRestWindowEvidence,
    fetchDiagnoseCarbRatioBlockEvidence,
    fetchDiagnoseFindings,
    fetchDiagnoseCarbRatioHistoryEvents,
    fetchDiagnoseFindingCasePreparation,
    fetchDiagnoseFindingCase,
    fetchAuditDismissals,
    dismissAuditItem,
    fetchTimeline,
    fetchCarbs,
    createCarb,
    fetchPrompts,
    answerPrompt,
    clearPrompt,
    fetchFocuses,
    resolveFocus,
    pinFocus,
    loadPlan,
    savePlanDraft,
    loadPlanHistory,
    applyPlan,
  };
}

const _defaults = makeDeps();

export const fetchCredentials  = _defaults.fetchCredentials;
export const saveCredentials   = _defaults.saveCredentials;
export const fetchStatus       = _defaults.fetchStatus;
export const fetchNow          = _defaults.fetchNow;
export const fetchPumpSettings = _defaults.fetchPumpSettings;
export const fetchBacktest     = _defaults.fetchBacktest;
export const fetchAnalysis     = _defaults.fetchAnalysis;
export const fetchScenarios    = _defaults.fetchScenarios;
export const fetchCatalog      = _defaults.fetchCatalog;
export const fetchKbArticle    = _defaults.fetchKbArticle;
export const fetchModelView    = _defaults.fetchModelView;
export const fetchDayNavigator = _defaults.fetchDayNavigator;
export const fetchOutcomesTrend = _defaults.fetchOutcomesTrend;
export const fetchVerifyTrials = _defaults.fetchVerifyTrials;
export const fetchExploreTimeOfDay = _defaults.fetchExploreTimeOfDay;
export const fetchExploreExposures = _defaults.fetchExploreExposures;
```

## Vue-free adapter and fresh-age precedents

Command:

```sh
sed -n '15,36p' frontend/diagnose-workstation-data.js; sed -n '19,37p' frontend/diagnose-data-age.js
```

Output:

```text
export function envelopeFromPooled(pooled) {
  const bins = pooled?.bins || [];
  const col = (key) => bins.map((bin) => (bin[key] == null ? null : bin[key]));
  return {
    labels: bins.map((bin) => hhmm(bin.minute)),
    p10: col('p10'), p25: col('p25'), p50: col('median'), p75: col('p75'), p90: col('p90'),
    counts: bins.map((bin) => bin.n || 0), raw: bins.map((bin) => bin.raw_n || 0),
    readings: pooled?.reading_count || 0, days: pooled?.captured_days || 0,
    pool: pooled?.pool_minutes ?? 45,
  };
}
export function recordDiagnoseAge(ages, shape, payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    delete ages[shape];
    return null;
  }
  if (!Object.hasOwn(payload, 'input_data_age')) {
    delete ages[shape];
    return payload;
  }
  if (!validInputDataAge(payload.input_data_age)) {
    delete ages[shape];
    return null;
  }
  ages[shape] = payload.input_data_age;
  const { input_data_age, ...display } = payload;
  return display;
}
```

## Diagnose input loading and browser stubs

Command:

```sh
sed -n '5324,5350p' frontend/index.html; sed -n '326,333p' frontend/cockpit-shell.browser.test.mjs; sed -n '1880,1898p' frontend/diagnose-workstation.browser.test.mjs; sed -n '95,112p' frontend/diagnose-canvas-composition.browser.test.mjs
```

Output:

```text
async function loadAudit() {
  if (!hasToken.value || diagnoseLoaded) return;
  diagnoseLoaded = true;
  resetDiagnoseAges(diagnoseAges.value);
  try {
    const [a, s, e, x, p, o] = await Promise.all([
      enqueue(() => dataFetchAnalysis({ window: 30, pool: true })),
      enqueue(() => dataFetchScenarios(30)),
      enqueue(() => dataFetchExploreTimeOfDay()),
      enqueue(() => dataFetchExploreExposures()),
      enqueue(() => dataFetchDiagnoseFindingCasePreparation(null)),
      enqueue(() => dataFetchOutcomesTrend(30)),
    ]);
    const displays = [
      recordDiagnoseAge(diagnoseAges.value, 'analysis', a),
      recordDiagnoseAge(diagnoseAges.value, 'scenarios', s),
      recordDiagnoseAge(diagnoseAges.value, 'time_of_day', e),
      recordDiagnoseAge(diagnoseAges.value, 'exposures', x),
      recordDiagnoseAge(diagnoseAges.value, 'trend', o),
    ];
if (url.pathname === '/api/credentials') return route.fulfill({ json: { configured: false } });
if (url.pathname === '/api/explore/time-of-day') return route.fulfill({ json: timeOfDay });
if (url.pathname === '/api/diagnose/finding-case-file-preparation') {
const STUBS = [
  [apiPattern('/scenarios'), () => payload.scenarios],
  [apiPattern('/explore/time'), () => payload.evidence],
  [apiPattern('/status'), () => ({ ok: true, last_fetch: payload.analyze.generated_at, counts: payload.analyze.data_quality?.counts || {} })],
  [apiPattern('/plan/history'), () => ({ history: [] })],
  [apiPattern('/plan'), () => ({ items: [], updated_at: null })],
  [apiPattern('/verify/trials'), () => ({ trials: [] })],
  [apiPattern('/catalog'), () => ({ articles: [] })],
  [apiPattern('/carbs'), () => ({ entries: [] })],
  [apiPattern('/prompts'), () => ({ prompts: [] })],
  [apiPattern('/credentials'), () => ({ configured: true })],
  [apiPattern('/audit/dismissals'), () => ({ dismissed: [] })],
  [apiPattern('/outcomes'), () => ({ points: [] })],
  [apiPattern('/timeline'), () => ({ events: [] })],
  [apiPattern('/backtest'), () => ({ folds: [] })],
  [apiPattern('/model'), () => ({ entries: [] })],
  [apiPattern('/day'), () => ({ days: [] })],
  [apiPattern('/pump'), () => ({ settings: {} })],
];
async function openCanvas(browser, { routes = null, ...options } = {}) {
  const page = await openApp(browser, { appSource: 'fixture', findingsInputs: FINDINGS_INPUTS, ...options });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (routes) await routes(page);
```

## Generated replay payload and harness story input

Command:

```sh
sed -n '1,20p' mockups/diagnose-workstation.synthetic/payload.json; sed -n '1,28p' .claude/qa/gen_synthetic_fixtures.py; sed -n '597,603p' .claude/qa/gen_synthetic_fixtures.py; sed -n '33,42p' harness/stories.js
```

Output:

```text
"_generated_by": ".claude/qa/gen_synthetic_fixtures.py",
"_note": "SYNTHETIC. Manufactured for the CI behaviour-replay gate — no real CGM, pump or personal data, every number from a fixed seed. See the module docstring.",
"""Manufacture the CI gate's fixture set for the Diagnose workstation.
... one file per capture name the mock loads, plus the API-shaped payload the app opener serves.
... every number is manufactured from a fixed seed, so the set is PHI-free by construction and byte-reproducible in CI.
    'payload.json': build_payload(scenarios, evidence, browser_exposures, audit, ic,
                                  ic_asserting),
async function drawWorkstation(host, state, story) {
  const slot = story.id === 'basal' ? basalSlot(state.slot) : null;
  const [analyze, scenarios, evidence, exposures, preparation, outcomes] = await Promise.all([
    request('/api/analyze?window=30&pool=1'), request('/api/scenarios?window=30'),
    request('/api/explore/time-of-day'), request('/api/explore/exposures'),
    request('/api/diagnose/finding-case-file-preparation'), request('/api/outcomes?window=30'),
  ]);
```

## Expected-diff paths

Command:

```sh
for p in openspec/changes/eating-sequence-evidence-plumbing frontend/data.js frontend/diagnose-eating-sequences.js frontend/diagnose-eating-sequences.test.js frontend/diagnose-data-age.test.js frontend/cockpit-shell.browser.test.mjs frontend/diagnose-workstation.browser.test.mjs frontend/diagnose-canvas-composition.browser.test.mjs CONTEXT.md; do test -e "$p" && echo "present $p" || echo "absent $p"; done
```

Output:

```text
absent openspec/changes/eating-sequence-evidence-plumbing
present frontend/data.js
absent frontend/diagnose-eating-sequences.js
absent frontend/diagnose-eating-sequences.test.js
present frontend/diagnose-data-age.test.js
present frontend/cockpit-shell.browser.test.mjs
present frontend/diagnose-workstation.browser.test.mjs
present frontend/diagnose-canvas-composition.browser.test.mjs
present CONTEXT.md
```
