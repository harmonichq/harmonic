// #459 reproduction (triage, 2026-09-24): stage a carb-ratio block, then a basal
// slot, then a second basal slot, through Diagnose's stage callback with a stubbed
// transport and made-up synthetic values. Run from the repo root:
//   node docs/scope/459-repro.mjs
const root = process.cwd();
let draft = { items: [], updated_at: null };
const saves = [];
globalThis.fetch = async (url, options = {}) => {
  const path = new URL(url, 'http://desk.invalid').pathname;
  const ok = (body) => ({ ok: true, status: 200, statusText: 'OK', json: async () => body });
  if (path === '/api/plan' && options.method === 'PUT') {
    const body = JSON.parse(options.body);
    const types = new Set(body.items.map((i) => i.type));
    if (types.size > 1) return { ok: false, status: 400, statusText: 'Bad', json: async () => ({ detail: 'plan draft mixes tuning families' }) };
    draft = { items: body.items, updated_at: `t${saves.length + 1}` };
    saves.push(body.items.map((i) => `${i.type}@${i.start_min}`));
    return ok(draft);
  }
  if (path === '/api/plan') return ok(draft);
  if (path === '/api/plan/history') return ok({ history: [] });
  if (path === '/api/pump-settings') return ok({ profile: { segments: [] } });
  if (path === '/api/guidance') return ok({ draft, disposition: draft.items.length ? 'draft' : 'eligible_action' });
  return ok({});
};
const { stageEvidence, evidenceIsStaged } = await import(`${root}/frontend/plan-view.js`);
const { blockKey } = await import(`${root}/frontend/diagnose-workspaces.js`);
const analyze = {
  basal: [{ slot: 4, label: '02:00', asserts_move: true, current: 0.9, recommended: 0.8 },
          { slot: 6, label: '03:00', asserts_move: true, current: 0.9, recommended: 0.8 }],
  ic_blocks: [{ block_id: 'b1', start_min: 360, end_min: 600, member_start_mins: [360, 480],
                current_values: [12], recommended: 11, asserts_move: true }],
};
const ic = { family: 'ic', key: blockKey(analyze.ic_blocks[0]) };
const basal = { family: 'basal', key: 'basal:4', members: [120] };
const basal2 = { family: 'basal', key: 'basal:6', members: [180] };
console.log('stage carb ratio ->', await stageEvidence(ic, true, analyze));
console.log('stage basal 02:00 ->', await stageEvidence(basal, true, analyze));
console.log('carb ratio still staged?', evidenceIsStaged(ic, analyze));
console.log('stage basal 03:00 ->', await stageEvidence(basal2, true, analyze));
console.log('draft saves:', JSON.stringify(saves));
