// Changes: the Plan a setting change is carried through, from staged to keyed
// into the pump (HV2-20, HV2-21).
//
// Ported from the ★ LOCKED desktop prototype's setting journey, under the
// harmonic-v2-desktop lock manifest. Every class and data attribute the frozen
// ledger replays against is
// the prototype's; what changed is where the state lives. The prototype held
// staging, the draft, the decision and the re-key in page memory and said so;
// here each is a durable write with a served answer:
//
//   staged            this page, until the draft is saved — nothing is written
//   Save draft        PUT  /api/plan
//   Record decision   POST /api/plan/apply, a DURABLE request quoting the
//                     input_revision and analysis_generation it was read at
//   reconciliation    reconcileDeliverable() over the detected pump profile
//   Withdraw          POST /api/plan/history/withdraw
//
// THE SCHEDULE IS frontend/plan.js's, not this module's. buildDeliverable,
// collapseDeliverable, reconcileDeliverable, effectivePlanItems and
// segmentCapacity own construction, collapsing, the pump-precision match and the
// capacity copy for v1 and v2 alike. Nothing here rounds a dose, compares a
// value or counts a segment.
//
// THE STALE CONFLICT IS REAL, AND IT IS THE POINT. A decision is recorded
// against the revision this page read. Anything that moves the store in between
// — a set aside, an ingest, another window — makes that write a served 409
// carrying its own code, and the store records nothing. Retry re-reads first and
// then re-attempts, which is the only way past it. This surface never decides
// that a write "probably" landed.
import {
  buildDeliverable, collapseDeliverable, effectivePlanItems, formatStartMin,
  reconcileDeliverable, segmentCapacity, PLAN_PARAMS, PLAN_PARAM_FAMILY, isStageableIsf,
} from '../frontend/plan.js';
import { stageItemsFor } from '../frontend/diagnose-workspaces.js';
import {
  applyPlan, fetchPumpSettings, loadPlan, loadPlanHistory, savePlanDraft, withdrawPlan,
} from './client.js';
import { desk, e, emptyFrame, errorFrame, loadingFrame, nameplate, readingHeader, sheetToggle, stamp } from './frame.js';
import {
  analysisGeneration, candidateFor, guidance, guidanceSettled, hasAction, loadGuidance,
  selectedConcern, unavailableReason,
} from './guidance.js';
import { navigate, registerEscape, render, view } from './routes.js';
import { openUtility } from './utilities.js';

/* --------------------------------------------------- the setting vocabulary */

/** The four tuning settings, in the wearer's words (CONTEXT.md, DESIGN.md). */
export const SETTING_NAME = {
  basal_rate: 'Basal', isf: 'Correction factor', carb_ratio: 'Carb ratio', target_bg: 'Target',
};

/** Deliverable column heads, in PLAN_PARAMS order, with their served units. */
export const PLAN_HEAD = {
  basal_rate: 'Basal (U/h)', isf: 'Correction factor', carb_ratio: 'Carb ratio (g/U)', target_bg: 'Target (mg/dL)',
};

/** The plan family a guidance subject's parameter stages as. */
const PARAM_FAMILY = PLAN_PARAM_FAMILY;

/**
 * One setting value as the wearer reads it. A correction factor reads insulin
 * first (CONTEXT.md); every other parameter is the served number itself.
 */
export function userValue(param, value) {
  if (value == null || value === '') return '';
  return param === 'isf' ? `1 U : ${value} mg/dL` : String(value);
}

/** A pump profile's schedule as the Plan reads it — one row per segment. */
export function profileTable(profile) {
  const segments = profile?.segments || [];
  return `<table class="gf-table"><thead><tr><th scope="col">Start</th>${PLAN_PARAMS.map(({ param }) => `<th scope="col">${PLAN_HEAD[param]}</th>`).join('')}</tr></thead><tbody>${segments.map((segment) => `<tr><td class="v">${e(formatStartMin(segment.start_min))}</td>${PLAN_PARAMS.map(({ param }) => `<td class="v">${e(userValue(param, segment[param]))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

/* ------------------------------------------------------- this desk's memory */

// `staged` is the only thing here the store does not own: the items this page
// has picked and not yet saved. Everything else mirrors a served read.
const memory = {
  staged: null, plan: null, history: null, pump: null,
  subject: null, error: null, saveError: null, rekeyedAt: null, flash: null,
  decisionRequest: null, withdrawalRequest: null,
};
let pending = null;

function load(key, run) {
  if (pending === key) return;
  pending = key;
  memory.error = null;
  run().then(() => {
    if (pending === key) pending = null;
    render();
  }).catch((error) => {
    if (pending !== key) return;
    pending = null;
    memory.error = error;
    render();
  });
}

export async function loadPlanState() {
  try {
    const [plan, history, pump] = await Promise.all([
      loadPlan(), loadPlanHistory(), fetchPumpSettings(),
    ]);
    memory.plan = plan;
    memory.history = history;
    memory.pump = pump;
    memory.error = null;
  } catch (error) { memory.error = error; throw error; }
}

function evidenceItems(item, analyze) {
  if (item.family !== 'isf') return stageItemsFor(item.key, analyze, item.members);
  if (!isStageableIsf(item.raw)) return [];
  return (detectedProfile()?.segments || []).map((segment) => ({
    type: 'isf', start_min: segment.start_min, value: item.raw.recommended,
    recommended: item.raw.recommended, label: formatStartMin(segment.start_min),
  }));
}

/** The shared rail's stage callback reports refusal so its optimistic paint can
 * be undone. Save first; neither this draft nor the rail claims a refused save. */
export async function stageEvidence(item, desired = true, analyze = {}) {
  try {
    await loadPlanState();
    const items = evidenceItems(item, analyze);
    if (!items.length) return false;
    const keys = new Set(items.map((row) => `${row.type}:${row.start_min}`));
    const before = memory.plan.items || [];
    const next = desired
      ? [...before.filter((row) => row.type === items[0].type && !keys.has(`${row.type}:${row.start_min}`)), ...items]
      : before.filter((row) => !keys.has(`${row.type}:${row.start_min}`));
    const saved = await savePlanDraft({ items: next });
    memory.plan = { ...memory.plan, ...saved };
    memory.staged = null;
    memory.saveError = null;
    await loadGuidance({ force: true });
    return true;
  } catch (error) { memory.saveError = { kind: 'draft', error }; return false; }
}

export function evidenceIsStaged(item, analyze = {}) {
  const items = evidenceItems(item, analyze);
  return items.length > 0 && items.every((wanted) => draftItems().some((row) =>
    row.type === wanted.type && row.start_min === wanted.start_min));
}

/* ------------------------------------------------------ the served schedule */

const detectedProfile = () => memory.pump?.profile || null;
const detectedAt = () => memory.pump?.fetched_at || null;

/** Every Plan the store has recorded, newest last, as it serves them. */
const records = () => (memory.history?.history || []).filter((record) => record.withdrawal?.state !== 'available');

/**
 * The Plan awaiting the pump: recorded, not yet reconciled, not withdrawn.
 * The store's own predicate, read from the served record rather than re-derived.
 */
const pendingRecord = () => records().find((record) =>
  record.reconciliation?.state !== 'available' && record.withdrawal?.state !== 'available') || null;

/** The draft the store holds, or the items this page staged and has not saved. */
const draftItems = () => memory.staged || memory.plan?.items || [];

/** The deliverable, uncollapsed: what the wearer keys in, before folding. */
const rows = () => buildDeliverable({
  activeProfile: pendingRecord()?.deliverable?.source_profile || detectedProfile() || { segments: [] },
  acceptedItems: pendingRecord()?.items || draftItems(),
});

/** Whether the store already holds the items this page staged. */
const draftSaved = () => Boolean(memory.plan?.updated_at) && !memory.staged;

/** The time the decision this schedule belongs to was recorded, if it was. */
const decidedAt = () => (pendingRecord() || records().at(-1))?.applied_at || null;

// The decision's own time goes in, so a pump read from before it is held
// pending rather than read as a keying error the wearer could not have made.
const reconcile = () => {
  const readAt = String(detectedAt() || '').replace('T', ' ');
  if (decidedAt() && readAt <= String(decidedAt()).replace('T', ' ')) return { state: 'pending', matchedAt: null, groups: [] };
  return reconcileDeliverable(rows(), detectedProfile()?.segments || null, detectedAt(), records().length > 0);
};

/**
 * The one phase word for this change, from the served state alone.
 * Diagnose's roster row and this head read the same word, so nothing can name a
 * decision the store has not recorded.
 */
export function phase() {
  if (memory.saveError) return 'Save failed';
  if (pendingRecord()) {
    const result = reconcile();
    return result.state === 'confirmed' ? 'On pump' : result.state === 'mismatch' ? 'Mismatch' : 'Pending';
  }
  if (records().length) return 'On pump';
  if (draftSaved()) return 'Draft saved';
  return memory.staged ? 'Staged' : null;
}

/** True while this desk carries a change the wearer has not finished with. */
export const planUnderway = () => Boolean(memory.staged || (draftSaved() && draftItems().length) || pendingRecord());

/* -------------------------------------------------------------- the actions */

/**
 * Stage the selected concern's action as a draft.
 *
 * The items come from the backend's own `action` rows — their start minutes and
 * their recommended values — never from a value this surface computed.
 */
export function stage(candidate) {
  if (!hasAction(candidate)) return false;
  const parameter = candidate.parameter || candidate.action[0]?.parameter;
  const family = PARAM_FAMILY[parameter];
  if (!family) return false;
  memory.subject = `setting:${parameter}`;
  memory.staged = candidate.action.flatMap((action) => (action.member_start_mins || [action.start_min]).map((start) => ({
    type: family,
    start_min: start,
    value: action.recommended,
    recommended: action.recommended,
    label: formatStartMin(start),
    ...(family === 'ic' ? { ic_block_provenance: { block_start_min: action.start_min, block_end_min: action.end_min, block_member_start_mins: action.member_start_mins } } : {}),
  })));
  memory.saveError = null;
  memory.flash = null;
  return true;
}

export function unstage() {
  memory.staged = null;
  memory.saveError = null;
}

// Both writes report through one path: a failure is HELD and shown, and the
// served state is re-read either way so nothing on screen outlives the store.
async function commit(kind, run) {
  memory.saveError = null;
  memory.flash = null;
  try {
    await run();
    memory.staged = null;
  } catch (error) {
    memory.saveError = { kind, error };
  }
  await loadPlanState().catch((error) => { memory.error = error; });
  await loadGuidance({ force: true });
  render();
}

function saveDraft() {
  // The draft is the effective plan — the value in effect on each proposal cell,
  // which is what plan.js says confirmation must record.
  const items = effectivePlanItems(rows());
  return commit('draft', () => savePlanDraft({ items }));
}

async function recordDecision() {
  if (!memory.decisionRequest) {
    if (memory.staged) { await saveDraft(); if (memory.saveError || memory.error) return; }
    await loadGuidance({ force: true });
    const subject = memory.subject || `setting:${Object.entries(PARAM_FAMILY).find(([, family]) => family === draftItems()[0]?.type)?.[0] || ''}`;
    memory.decisionRequest = {
    // One request id per attempt of one decision: a retry of THIS attempt is
    // idempotent by receipt, and a fresh attempt after a conflict is a new one.
    request_id: `v2-plan-${memory.plan?.updated_at || ''}-${memory.plan?.input_revision}`,
    input_revision: memory.plan?.input_revision,
    subject,
    analysis_generation: analysisGeneration(),
    draft_updated_at: memory.plan?.updated_at,
    };
  }
  await commit('decision', () => applyPlan(memory.decisionRequest));
  // Only a received refusal permits a fresh attempt. A lost response keeps the
  // exact receipt request even if the subsequent read already sees the record.
  const status = memory.saveError?.error?.status;
  if (!memory.saveError || (status >= 400 && status < 500)) memory.decisionRequest = null;
}

async function withdraw() {
  const record = pendingRecord();
  if (!memory.withdrawalRequest) {
    if (!record) return;
    memory.withdrawalRequest = {
      request_id: `v2-withdraw-${record.applied_at}`,
      input_revision: memory.plan?.input_revision,
      applied_at: record.applied_at,
      reason: null,
    };
  }
  await commit('withdraw', () => withdrawPlan(memory.withdrawalRequest));
  const status = memory.saveError?.error?.status;
  if (!memory.saveError || (status >= 400 && status < 500)) memory.withdrawalRequest = null;
}

/**
 * Retry the write that failed — after re-reading, because a served conflict
 * means this page is behind. Re-attempting the same stale request would fail
 * the same way for the same reason.
 */
async function retrySave() {
  const kind = memory.saveError?.kind;
  if (!kind) return;
  memory.saveError = null;
  await loadPlanState().catch((error) => { memory.error = error; });
  await loadGuidance({ force: true });
  if (memory.error) return;
  if (kind === 'draft') await saveDraft();
  else if (kind === 'decision') await recordDecision();
  else if (kind === 'withdraw') await withdraw();
}

/* --------------------------------------------------------------- the frames */

// The served conflict, named as the store named it. `code` is the durable 409's
// own vocabulary; a transport fault has none and says what it says.
function saveFailure() {
  const held = memory.saveError;
  if (!held) return '';
  const what = held.kind === 'draft' ? 'Saving the draft failed' : held.kind === 'withdraw' ? 'Withdrawing failed' : 'Recording the decision failed';
  const retry = held.kind === 'draft' ? 'Retry saving the draft' : held.kind === 'withdraw' ? 'Retry withdrawing' : 'Retry recording the decision';
  // The locked copy is the sentence and nothing else. The store's conflict code
  // is transport vocabulary — it belongs in the response a test reads, not in
  // front of a wearer who cannot act on it.
  return `<div class="gf-status" role="alert"><p class="gf-error">${e(what)}: ${e(held.error.message)}</p><div class="gf-actions"><button class="gf-btn primary" data-set="retry-save">${e(retry)}</button></div></div>`;
}

// Shipped Plan reconciliation copy (index.html), verbatim, chosen by the
// shipped reconcile function's own state.
function planStatus(result) {
  if (memory.saveError) return saveFailure();
  const flash = memory.flash ? `<p class="gf-meta gf-flash" role="status">${e(memory.flash)}</p>` : '';
  if (!records().length) {
    return `<div class="gf-status"><p class="gf-meta">${draftSaved()
      ? `Draft saved ${e(stamp(memory.plan.updated_at))}. Recording the decision preserves what was known then.`
      : 'Draft not saved. Saving the draft preserves consideration.'}</p></div>`;
  }
  if (result.state === 'confirmed') {
    return `<div class="gf-status" data-state="confirmed" tabindex="-1"><p>✓ On pump as of ${e(stamp(result.matchedAt))} — the pump matches your plan.</p>${flash}</div>`;
  }
  if (result.state === 'mismatch') {
    const diff = `<table class="gf-table gf-diff"><thead><tr><th scope="col">Start time</th><th scope="col">Parameter</th><th scope="col">Planned</th><th scope="col">On pump</th></tr></thead><tbody>${result.groups.flatMap((group) => group.cells.map((cell) => `<tr><td class="v">${e(group.label)}</td><td>${e(SETTING_NAME[cell.param] || cell.label)}</td><td class="v">${e(userValue(cell.param, cell.planned))}</td><td class="v">${e(userValue(cell.param, cell.actual))}</td></tr>`)).join('')}</tbody></table>`;
    return `<div class="gf-status" data-state="mismatch" tabindex="-1"><p>The pump doesn't match your plan. Check these values — likely a keying error.</p>${diff}<div class="gf-actions"><button class="gf-btn primary" data-set="rekey">Re-key &amp; recheck</button></div>${flash}</div>`;
  }
  return `<div class="gf-status" data-state="pending" tabindex="-1"><p>Pending — program these into your pump. After the next fetch, this reconciles automatically: "✓ on pump" on a match, or a diff of the divergent values if a value was mis-keyed.</p>${flash}</div>`;
}

function decisionSection(result) {
  const record = pendingRecord() || records().at(-1) || null;
  return `<section class="gf-section"><h3>Decision</h3><dl>
    <dt>Draft saved</dt><dd>${draftSaved() ? e(stamp(memory.plan.updated_at)) : 'Not saved'}</dd>
    <dt>Decision recorded</dt><dd>${record ? e(stamp(record.applied_at)) : 'Not recorded'}</dd>
    ${record ? `<dt>On pump</dt><dd>${result?.state === 'confirmed' ? e(stamp(result.matchedAt)) : 'Awaiting pump evidence'}</dd>` : ''}
    ${memory.rekeyedAt ? `<dt>Re-key asked</dt><dd>${e(stamp(memory.rekeyedAt))}</dd>` : ''}
    ${record?.withdrawal?.state === 'available' ? `<dt>Withdrawn</dt><dd>${e(stamp(record.withdrawal.withdrawn_at))}</dd>` : ''}</dl></section>`;
}

/**
 * What the store retained about the concern this decision was made from — the
 * record's own `decision_context`, not this page's recollection of it.
 */
function knownSection() {
  const context = (pendingRecord() || records().at(-1))?.decision_context;
  if (!context || context.state !== 'available') return '';
  const settings = (context.settings || []).map((setting) => `${setting.value} ${setting.unit}`).join(' · ');
  return `<section class="gf-section"><h3>What was known</h3><dl>
    <dt>Priority</dt><dd>${e(context.subjects?.join(', ') || '')}</dd>
    <dt>Change</dt><dd>${e(settings)}</dd>
    <dt>Read at</dt><dd>${e(stamp(context.captured_at))}</dd></dl>
    <p>${e(context.explanation)}</p>
    ${(context.unknowns || []).map((text) => `<p class="gf-note">${e(text)}</p>`).join('')}</section>`;
}

function changePane(result, status) {
  const profile = detectedProfile();
  const meta = detectedAt() ? `Captured ${e(stamp(detectedAt()))}` : 'Current';
  return `${readingHeader('This change', e(status))}<div class="gf-pane-body">
    ${decisionSection(result)}
    ${knownSection()}
    <section class="gf-section"><h3>Detected pump settings <span class="meta">${meta}</span></h3>${profileTable(profile)}<p class="gf-meta">Detected schedule. The proposed schedule is the Plan beside it.</p>
      <div class="gf-actions"><button class="gf-btn" data-set="pump-settings">Pump settings</button></div></section>
  </div>`;
}

function planFrame(candidate) {
  const planned = collapseDeliverable(rows());
  const result = reconcile();
  const capacity = segmentCapacity(rows());
  const status = phase() ?? 'Staged';
  const record = pendingRecord();
  // Once the decision is recorded there is nothing left to save; what remains is
  // the pump, and — while it is still pending — the way to take it back.
  const end = record
    ? '<button class="gf-btn" data-set="withdraw">Withdraw</button>'
    : records().length
      ? ''
      : '<button class="gf-btn" data-set="save-draft">Save draft</button><button class="gf-btn primary" data-set="record">Record decision</button>';
  const title = candidate
    ? `${e(SETTING_NAME[candidate.parameter] || candidate.title)} · ${e(actionSpan(candidate))}`
    : 'This change';
  const head = nameplate({
    kicker: `Plan · <b>${e(status)}</b>`,
    title,
    // The deliverable's own rows against the profile's capacity, said as that.
    sub: `<b>${e(capacity.text)}</b> · Nothing here is sent to your pump.`,
    end,
  });
  const cell = (row, param) => {
    const value = row[param];
    if (value.value === value.current) return `<td class="v">${e(userValue(param, value.value))}</td>`;
    return `<td class="v gf-changed"><s>${e(userValue(param, value.current))}</s> ${e(userValue(param, value.value))}</td>`;
  };
  const table = `<table class="gf-table gf-plan"><thead><tr><th scope="col">Start time</th>${PLAN_PARAMS.map(({ param }) => `<th scope="col">${PLAN_HEAD[param]}</th>`).join('')}</tr></thead><tbody>${planned.map((row) => `<tr><td class="v">${e(row.label)}${row.isNewBreak ? ' <span class="gf-pill">new break</span>' : ''}</td>${PLAN_PARAMS.map(({ param }) => cell(row, param)).join('')}</tr>`).join('')}</tbody></table>`;
  const stage_ = `<section class="pane gf-stage gf-stage-table" aria-label="Plan">${head}
    <div class="instruments"><div class="instrument"><span class="cap">Deliverable</span><span class="meta">pump-ready schedule</span></div><div class="instrument gf-tools"><span class="meta gf-desk-only">Pump-local time</span>${sheetToggle('This change', view.sheetOpen)}</div></div>
    <div class="gf-scroll">${planStatus(result)}${table}</div></section>`;
  return desk(stage_, `<aside class="pane gf-reading" aria-label="This change">${changePane(result, status)}</aside>`);
}

/** The span a setting action covers, from the served action rows themselves. */
function actionSpan(candidate) {
  const action = candidate.action || [];
  if (!action.length) return '';
  const start = Math.min(...action.map((row) => row.start_min));
  const end = Math.max(...action.map((row) => row.end_min));
  return `${formatStartMin(start)} to ${formatStartMin(end % 1440)}`;
}

/** Changes with nothing underway: the concern, named, and the one route on. */
function idleFrame() {
  const candidate = selectedConcern();
  if (!candidate) {
    // "Nothing is ranked" is a claim about the roster. When the store says the
    // admission itself is unavailable, that is a different claim and the served
    // reason is what to say — reporting the first as the second would tell the
    // wearer their data is quiet when it has simply not been reconciled.
    const reason = unavailableReason();
    if (reason) {
      return emptyFrame('Changes', 'No change underway', e(reason.said),
        '<button class="gf-btn primary" data-action="explore">Open Diagnose</button>');
    }
    return emptyFrame('Changes', 'No change underway',
      'Nothing is ranked for action in this read.',
      '<button class="gf-btn primary" data-action="explore">Open Diagnose</button>');
  }
  const staging = hasAction(candidate)
    ? '<button class="gf-btn primary" data-set="stage">Stage change</button>'
    : '';
  return emptyFrame('Changes', 'No change underway',
    `${e(candidate.title || candidate.subject)}. ${e(guidance()?.reasons?.admission || '')}`,
    `<button class="gf-btn" data-action="explore">Inspect nights</button>${staging}`,
    hasAction(candidate) ? '' : 'This read stages no action for this concern, so nothing can be recorded from it.');
}

/* --------------------------------------------------------------- the wiring */

function bind(host) {
  for (const button of host.querySelectorAll('[data-set]')) {
    button.onclick = () => {
      const action = button.dataset.set;
      if (action === 'stage') {
        if (stage(selectedConcern())) { view.focusAfterRender = '[data-set="save-draft"]'; navigate('changes'); }
      } else if (action === 'unstage') {
        unstage(); view.focusAfterRender = '[data-set="stage"]'; render();
      } else if (action === 'save-draft') {
        saveDraft().then(() => { view.focusAfterRender = memory.saveError ? '[data-set="retry-save"]' : '[data-set="save-draft"]'; render(); });
      } else if (action === 'record') {
        recordDecision().then(() => { view.focusAfterRender = memory.saveError ? '[data-set="retry-save"]' : '.gf-status'; render(); });
      } else if (action === 'retry-save') {
        retrySave().then(() => { view.focusAfterRender = memory.saveError ? '[data-set="retry-save"]' : '.gf-status'; render(); });
      } else if (action === 'withdraw') {
        withdraw().then(() => { view.focusAfterRender = '.gf-status'; render(); });
      } else if (action === 'rekey') {
        // Nothing is sent anywhere: the wearer keys the flagged values in, and
        // the next fetch's profile is what settles it.
        memory.rekeyedAt = detectedAt();
        memory.flash = 'Re-key the flagged values on your pump — this rechecks on the next fetch';
        render();
      } else if (action === 'pump-settings') {
        openUtility('pump', button);
      }
    };
  }
  for (const button of host.querySelectorAll('[data-action="explore"]')) {
    button.onclick = () => navigate('diagnose');
  }
  const retry = host.querySelector('[data-retry]');
  if (retry) retry.onclick = () => { memory.error = null; load('plan', loadPlanState); render(); };
}

/**
 * Changes, mounted.
 *
 * Exported rather than private: chunk 3 composes the one Changes destination
 * and dispatches a current Plan here, so this stays a callable mount rather than
 * a registration only this module can reach.
 */
export function mount(host) {
  if (!guidanceSettled()) { loadGuidance(); host.innerHTML = loadingFrame('Changes'); return; }
  if (memory.error) { host.innerHTML = errorFrame('Changes', 'This change'); bind(host); return; }
  if (!memory.plan || !memory.pump) { load('plan', loadPlanState); host.innerHTML = loadingFrame('Changes'); return; }

  if (!planUnderway() && !records().length) { host.innerHTML = idleFrame(); bind(host); return; }
  const subject = (pendingRecord() || records().at(-1))?.decision_context?.subjects?.[0];
  host.innerHTML = planFrame(candidateFor(subject) || selectedConcern());
  bind(host);
}

/** Seat Changes on the desk. */
export function installPlan() {
  // Staging is the only step this desk can take back on its own; once the
  // decision is recorded, Withdraw is the store's route and Escape is not it.
  registerEscape('journey', () => {
    if (!memory.staged) return false;
    unstage();
    view.focusAfterRender = '[data-set="stage"]';
    render();
    return true;
  });
}
