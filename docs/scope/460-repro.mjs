// #460 reproduction (triage, 2026-09-24): a cold Diagnose seat whose /api/plan
// answer lands after the payload reads, driven through the destination with a
// fake workstation and made-up synthetic values; then the dock's view with a
// saved draft and no surface marks. Run from the repo root:
//   node docs/scope/460-repro.mjs
const root = process.cwd();
const draft = { items: [{ type: 'basal', start_min: 180, key: 6, label: '03:00', current: 0.9, value: 0.8 }], updated_at: 't1' };
let releasePlan;
const planGate = new Promise((resolve) => { releasePlan = resolve; });
globalThis.fetch = async (url) => {
  const path = new URL(url, 'http://desk.invalid').pathname;
  const ok = (body) => ({ ok: true, status: 200, statusText: 'OK', json: async () => body });
  if (path === '/api/plan') { await planGate; return ok(draft); }
  if (path === '/api/plan/history') return ok({ history: [] });
  if (path === '/api/pump-settings') return ok({ profile: { segments: [] } });
  if (path === '/api/guidance') return ok({ disposition: 'draft', selected: null, candidates: [], draft });
  return ok({});
};
if (!globalThis.MutationObserver) globalThis.MutationObserver = class { observe() {} disconnect() {} };
const { createDiagnoseDestination } = await import(`${root}/frontend/diagnose.js`);
const { watchDockView } = await import(`${root}/frontend/watched-change-dock.js`);
const { planDraft } = await import(`${root}/frontend/guidance.js`);
const analyze = { basal: [{ slot: 6, label: '03:00', asserts_move: true, current: 0.9, recommended: 0.8 }] };
const api = {
  fetchStatus: async () => ({ input_revision: 1 }),
  fetchAnalysis: async () => analyze, fetchScenarios: async () => ({}),
  fetchExploreTimeOfDay: async () => ({}), fetchExploreExposures: async () => ({}),
  fetchDiagnoseFindingCasePreparation: async () => ({ findings: {}, rendered_rows: [] }),
  fetchOutcomesTrend: async () => ({}),
};
const slot = { family: 'basal', key: 'basal:6' };
let callbacks;
const log = [];
const destination = createDiagnoseDestination({ api, createView(options) {
  callbacks = options.callbacks;
  return {
    setData(data) { if (data) log.push(`boot: isStaged=${callbacks.isStaged(slot)}`); },
    refresh() { log.push(`refresh: isStaged=${callbacks.isStaged(slot)}; callbacks carry planDraft=${'planDraft' in callbacks}`); },
    leaveSurface() {}, setError() {},
  };
} });
const body = { append() {}, removeChild() {} };
const doc = { body, defaultView: { addEventListener() {} } };
doc.createElement = () => ({ dataset: {}, style: {}, ownerDocument: doc, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], remove() {} });
const host = { childNodes: [], isConnected: true, ownerDocument: doc, set innerHTML(v) {}, get firstElementChild() { return null; },
  append(node) { node.parentNode = host; }, removeChild() {}, querySelector: () => ({}) };
destination.mount(host, { navigation: 0, hold() {} });
await destination.read();
destination.mount(host, { navigation: 0, hold() {} });
releasePlan();
await new Promise((resolve) => setTimeout(resolve, 50));
for (const line of log) console.log(line);
console.log('served draft items:', planDraft()?.items?.length);
console.log('dock with served draft, no marks:', watchDockView({ watched: null, pendingPlan: null, staged: { count: 0, title: '', values: '' } }).state);
