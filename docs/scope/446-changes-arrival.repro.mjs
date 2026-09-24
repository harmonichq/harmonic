// #446 reproduction: which reads Changes' mount makes on a plain arrival after an
// earlier Open Plan, while the server serves an active change.
// Synthetic inputs only; nothing is served. Run from the repo root:
//   node docs/scope/446-changes-arrival.repro.mjs
// Each line prints the distinct paths one arrival read. The Plan reads
// /api/plan, /api/plan/history and /api/pump-settings; the watched record's
// follow-up reads /api/verify/trials.
const W = new URL('../../frontend', import.meta.url).href;
const reads = [];
let guidanceAnswer = null;
globalThis.fetch = async (url) => {
  reads.push(url);
  const path = url.split('?')[0];
  const body = path === '/api/guidance' ? guidanceAnswer
    : path === '/api/verify/trials' ? { input_revision: 1, admission: { state: 'available', active_kind: null }, trials: [], focuses: [] }
    : path === '/api/focus' ? { input_revision: 1, admission: {}, pinnable_patterns: [] }
    : path === '/api/plan/history' ? { history: [] }
    : path === '/api/plan' ? { items: [] }
    : {};
  return { ok: true, json: async () => body };
};
const { loadGuidance } = await import(`${W}/guidance.js`);
const { mount } = await import(`${W}/changes.js`);

const candidate = { subject: 'pattern:served', kind: 'pattern', title: 'Served concern', parameter: 'basal_rate',
  action: [{ parameter: 'basal_rate', start_min: 180, end_min: 210, recommended: .54, direction: 'lower' }],
  members: [], preference: {} };
const eligible = { disposition: 'eligible_action', selected: candidate, candidates: [candidate], reasons: {} };
const watching = { disposition: 'active_change', selected: null, candidates: [], reasons: {} };
const controls = {};
const host = { innerHTML: '',
  querySelectorAll(selector) {
    const control = /^\[data-set="([^"]+)"\]$/.exec(selector)?.[1];
    if (!control || !this.innerHTML.includes(`data-set="${control}"`)) return [];
    return [controls[control] ||= {}];
  }, querySelector: () => null };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const serve = async (answer) => { guidanceAnswer = answer; await settle(); await loadGuidance({ force: true }); };
// A new `navigation` value is what the router hands every arrival (routes.js
// navigate and the history subscription); a re-render keeps the value.
async function arrive(navigation, context) {
  reads.length = 0;
  const deps = { navigation, ...(context ? { context } : {}) };
  mount(host, deps); await settle(); await settle(); mount(host, deps);
  return [...new Set(reads.map((url) => url.split('?')[0]))];
}

await serve(watching);
console.log('control · plain arrival, no earlier Open Plan, active_change:', JSON.stringify(await arrive(1)));
await serve(eligible);
mount(host, { navigation: 2 }); controls.stage.onclick(); mount(host, { navigation: 2 }); controls['open-plan'].onclick();
await serve(watching);
console.log('plain arrival after Open Plan, active_change:            ', JSON.stringify(await arrive(3)));
console.log('watch arrival (subject=watch) after Open Plan:            ', JSON.stringify(await arrive(4, { subject: 'watch' })));
await serve(eligible);
await arrive(5);
console.log('plain arrival after Open Plan, nothing watched · Plan frame:', /class="[^"]*gf-plan/.test(host.innerHTML),
  '· Open Plan offered:', host.innerHTML.includes('data-set="open-plan"'));
