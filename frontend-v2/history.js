// The record: what a change was decided from, and how it ended (HV2-28).
//
// Ported from the ★ LOCKED desktop prototype's saved-record frames
// (harmonic-v2-glucose.js:626-640 historyFrame, :686-688 detectedSettings, and
// the Focus record at harmonic-v2-glucose-focus.js:224-232) under the
// harmonic-v2-desktop lock manifest, with one substitution: the prototype held
// the conclusion and the ending in page memory and said so in its own header,
// and this reads the retained record the backend saved.
//
// FOUR THINGS THIS SEPARATES, because the backend serves them separately and a
// reader who cannot tell them apart cannot trust any of them (HV2-28):
//
//   1. the ORIGINAL decision context, or — where Harmonic only ever observed the
//      change on the pump — the first-observed context, with its own unknowns
//   2. the observed change itself: what the setting was, and what it became
//   3. the IMMUTABLE saved ending: its kind, its times, the wearer's own
//      conclusion, and the ending assessment as it stood then
//   4. a RETAINED or CURRENT reassessment, computed now under a stored or a
//      current context, which never replaces the original
//
// An explicitly unavailable legacy fact is served, not blank: a record whose
// original decision was never recorded says so, and so does one whose ending
// assessment could not be computed. `Not recorded` is an answer.
//
// PUBLISHED FOR THE CHANGES COMPOSITION (#389 chunk 3):
//
//   mount(host, deps)        the record destination's content
//   openRecord(kind, id)     open one record on itself, before anything else
//   selectedRecord()         which record is open, or null
import { fetchVerifyTrials } from './client.js';
import { desk, e, emptyFrame, errorFrame, loadingFrame, nameplate, readingHeader, stamp } from './frame.js';
import { hold, navigate, render, view } from './routes.js';
// The comparison itself is the follow-up's evidence, and one record is a read of
// it, so its renderers have one owner and this module consumes them. The
// dependency runs one way only: follow-up.js imports nothing from here, and the
// Changes composition is handed both mounts by the entry module.
import {
  comparisonTables, evidenceFigure, figureColors, mountComparisonChart,
  periodsSection, readinessSection, retainedEvidenceContext,
} from './follow-up.js';

// The backend's own ending vocabulary, rendered as the words a reader reads.
// The KEYS are the served values (lock "Backend binding notes"); a served kind
// with no entry here is printed verbatim rather than swallowed.
const ENDING_WORD = {
  user_finished: 'Finished by you',
  manual: 'Ended by you',
  reverted: 'Reverted on the pump',
  superseded: 'Superseded by a later change',
  expired_unreviewed: 'Expired unreviewed',
  trial_preempted: 'Preempted by a Trial',
  lever_unavailable: 'Lever no longer available',
};
// What each ending means for whether this subject can come back. A preempted
// Focus is dropped and never silently resumes (HV2-27), and the record says so
// rather than leaving the reader to infer it from a status word.
const ENDING_NOTE = {
  trial_preempted: 'A setting change took the active-change seat. This Focus was dropped and does not resume; a later attempt is a new Focus with its own identity.',
  lever_unavailable: 'The behavior this Focus watched is no longer an offered lever, so the watch ended. Nothing resumes it.',
  manual: 'You ended this Focus. Its periods and its observations are fixed at the ending.',
  superseded: 'A later change to the same setting took over. This record keeps the period it actually observed.',
  reverted: 'The setting went back to its previous value on the pump, which ended the observation period.',
  expired_unreviewed: 'The watch reached the end of its lifecycle window without being reviewed. Its observations are still here.',
  user_finished: 'You recorded this ending. Harmonic did not program the pump; the change was entered by hand.',
};
const KIND_WORD = { trial: 'Setting change', focus: 'Focus' };
const STATUS_WORD = { active: 'Active', resolved: 'Resolved', dropped: 'Dropped' };
const SETTING_NAME = {
  basal_rate: 'Basal', carb_ratio: 'Carb ratio', isf: 'Correction factor',
  target_bg: 'Target glucose', profile: 'Whole profile',
};
const UNIT = { basal_rate: 'U/h', carb_ratio: 'g/U', target_bg: 'mg/dL' };

/** One programmed value in its own unit; a correction factor reads insulin first. */
export function settingValue(parameter, value) {
  if (value == null) return 'not recorded';
  if (parameter === 'isf') return `1 U : ${value} mg/dL`;
  return `${value} ${UNIT[parameter] || ''}`.trim();
}

/* ------------------------------------------------------- the record's memory */

const memory = {
  roster: null, error: null, open: null, mode: 'original',
  record: null, loading: null,
};

export const selectedRecord = () => memory.open;

/** Open one record on itself. The finished change is acknowledged before any
    other concern is offered, so finishing hands the identity here (HV2-28). */
export function openRecord(kind, id) {
  memory.open = { kind, id: String(id) };
  memory.roster = null;
  navigate('changes', { subject: 'history', occurrence: `record:${kind}:${id}` });
  memory.mode = 'original';
  memory.record = null;
}

/** Drop the open record, back to the roster. */
function closeRecord() {
  memory.open = null;
  memory.record = null;
  navigate('changes', { subject: 'history' });
}

/* --------------------------------------------------------------- served reads */

// One in-flight read at a time, keyed by what it reads, so a second render while
// a fetch is open starts nothing and a stale answer cannot overwrite a newer
// subject (HV2-34).
let readGeneration = 0;
function load(key, run) {
  if (memory.loading?.key === key) return;
  const token = ++readGeneration;
  memory.loading = { key, token };
  memory.error = null;
  run(token).then(() => {
    if (readGeneration !== token) return;
    memory.loading = null;
    render();
  }).catch((error) => {
    if (readGeneration !== token) return;
    memory.loading = null;
    memory.error = error;
    render();
  });
}

async function loadRoster(token = readGeneration) {
  // One read carries both rosters: the derived-plus-retained Trial rows, and the
  // Focus records beside them — including the ones no derived roster would still
  // carry, which is what keeps a retained record selectable outside the old cap.
  const roster = await fetchVerifyTrials();
  if (readGeneration !== token) return;
  memory.roster = {
    revision: roster.input_revision,
    admission: roster.admission,
    trials: roster.trials || [],
    focuses: roster.focuses || [],
  };
}

// The record read is TWO requests, and deliberately sequential. The original is
// what the record IS; a reassessment is a second, explicitly requested read that
// the server rejects (422) without a selection, so it can never arrive as a
// roster field (lock "Pre-ready values need a second request").
async function loadRecord({ kind, id }, mode, token) {
  const original = await fetchVerifyTrials({ kind, selected: id });
  const row = (kind === 'focus' ? memory.roster.focuses : memory.roster.trials).find(row => String(row.id) === id);
  const record = { ...row, ...original.selected, revision: original.input_revision, admission: original.admission };
  if (mode !== 'original') {
    const again = await fetchVerifyTrials({ kind, selected: id, assessment: mode });
    record.reassessment = again.selected.reassessment;
  }
  if (readGeneration === token) memory.record = { kind, id, mode, detail: record };
}

/* -------------------------------------------------------------- the roster */

const endingOf = (row) => row.ending || {};
const isEnded = (row) => Boolean(endingOf(row).kind);

/** One row per retained record, newest first, naming how each one ended. */
export function recordRoster({ trials, focuses }) {
  const rows = [
    ...trials.map((row) => ({
      kind: 'trial', id: row.id, at: row.changed_at,
      title: `${SETTING_NAME[row.parameter] || row.parameter}${row.slot ? ` ${row.slot}` : ''}`,
      detail: row.before == null
        ? settingValue(row.parameter, row.after)
        : `${settingValue(row.parameter, row.before)} → ${settingValue(row.parameter, row.after)}`,
      ending: endingOf(row), status: row.watch_disposition || null,
    })),
    ...focuses.map((row) => ({
      kind: 'focus', id: row.id, at: row.pinned_at,
      title: row.subject || (row.pattern_key ? `pattern:${row.pattern_key}` : row.lever),
      detail: `pinned ${stamp(row.pinned_at)}`,
      ending: endingOf(row), status: row.status || null,
    })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
  if (!rows.length) return '<p class="gf-meta">No change has been recorded on this store yet.</p>';
  // A dropped (preempted) habit keeps the prototype's own way in, so it stays
  // reachable in Changes as history rather than only through the generic roster
  // (HV2-27, and the ledger's `[data-focus="dropped"]`).
  const dropped = (row) => (row.kind === 'focus' && row.ending.kind === 'trial_preempted'
    ? ' data-focus="dropped"' : '');
  return `<table class="gf-table"><thead><tr><th scope="col">Record</th><th scope="col">Ended</th></tr></thead><tbody>${rows.map((row) => `<tr><td><button class="gf-row gf-record-row" data-record="${e(row.kind)}:${e(row.id)}"${dropped(row)} aria-pressed="false">${e(row.title)}<small>${e(KIND_WORD[row.kind])} · ${e(row.detail)}</small></button></td><td class="v">${isEnded(row)
    ? `${e(ENDING_WORD[row.ending.kind] || row.ending.kind)}<small>${e(stamp(row.ending.effective_at))}</small>`
    : `<span data-record-open="true">Still open</span><small>${e(STATUS_WORD[row.status] || row.status || 'active')}</small>`}</td></tr>`).join('')}</tbody></table>`;
}

/* --------------------------------------------------------- the record's parts */

/** The original decision, or the first-observed context where there was none.
    Its unknowns are served facts and are printed as such (HV2-28, HV2-31). */
export function originalSection(original) {
  const context = original.context || {};
  const unavailable = context.state !== 'available';
  // The field names are the prototype's (harmonic-v2-glucose.js:635): what was
  // decided before the change, why, and when Harmonic first saw it.
  const rows = [
    ['Earlier decision', context.action ? 'Recorded with this change' : 'Not recorded'],
    ['Original explanation', unavailable ? 'Not recorded' : (context.explanation || 'Not recorded')],
    ['First seen', unavailable ? 'Not recorded' : stamp(context.captured_at)],
  ];
  const unknowns = context.unknowns || [];
  return `<section class="gf-section" data-record-part="original"><h3>Original ${context.action ? 'decision' : 'context'} <span class="meta">${e(context.action ? 'as decided' : 'first observed')}</span></h3>
    <dl>${rows.map(([term, value]) => `<dt>${e(term)}</dt><dd>${e(value)}</dd>`).join('')}</dl>
    ${unavailable ? `<p class="gf-meta" data-unavailable="original">This record's original context is unavailable: ${e(context.reason || 'not recorded')}.</p>` : ''}
    ${unknowns.map((text) => `<p class="gf-meta" data-unknown>${e(text)}</p>`).join('')}
    <p class="gf-note">From the Trial record</p></section>`;
}

/** The immutable saved ending. First-wins: a later attempt reads this back
    unchanged, and no reassessment rewrites it. */
export function endingSection(ending, { kind }) {
  if (!ending || !ending.kind) {
    return `<section class="gf-section" data-record-part="ending"><h3>Ending</h3>
      <p class="gf-meta" data-unavailable="ending">Not recorded — this ${kind === 'focus' ? 'Focus' : 'change'} is still open.</p></section>`;
  }
  const assessment = ending.assessment || {};
  const inference = assessment.assessment || {};
  return `<section class="gf-section" data-record-part="ending"><h3>Saved ending <span class="meta">immutable</span></h3>
    <dl>
      <dt>How it ended</dt><dd data-ending-kind="${e(ending.kind)}">${e(ENDING_WORD[ending.kind] || ending.kind)}</dd>
      <dt>Conclusion</dt><dd data-conclusion>${ending.conclusion ? e(ending.conclusion) : 'Not recorded'}</dd>
      <dt>${kind === 'focus' ? 'Ended' : 'Finished'}</dt><dd>${e(stamp(ending.effective_at))}</dd>
      <dt>Recorded</dt><dd>${e(stamp(ending.recorded_at))}</dd>
    </dl>
    ${ENDING_NOTE[ending.kind] ? `<p class="gf-meta">${e(ENDING_NOTE[ending.kind])}</p>` : ''}
    <dl><dt>Ending assessment</dt><dd data-ending-assessment="${e(assessment.state || 'unavailable')}">${assessment.state === 'available'
      ? `Recorded · ${e(inference.state || 'unclear')}`
      : `Unavailable · ${e(assessment.reason || 'not recorded')}`}</dd></dl>
    ${assessment.state === 'available' && inference.reason ? `<p class="gf-meta">${e(inference.reason)}</p>` : ''}
    <p class="gf-meta">An observation period may end without a clear answer. Nothing here required a favourable result.</p></section>`;
}

/** The observed change: the setting, and what it became. */
export function changeSection(detail) {
  const changes = detail.changes || [];
  if (!changes.length) {
    return `<section class="gf-section" data-record-part="change"><h3>What changed</h3>
      <p class="gf-meta">${detail.kind === 'focus' ? `The intended behavior: ${e(SETTING_NAME[detail.lever] || detail.lever)}. No pump setting changed.` : 'Not recorded'}</p></section>`;
  }
  return `<section class="gf-section" data-record-part="change"><h3>What changed</h3>
    <table class="gf-table"><thead><tr><th scope="col">Setting</th><th scope="col">Before</th><th scope="col">Detected</th></tr></thead><tbody>${changes.map((change) => `<tr><td>${e(SETTING_NAME[change.parameter] || change.parameter)}${change.slots_changed ? `<small>${e(change.slots_changed)} time slots changed${change.uniform ? ' · uniform' : ` · values shown at ${e(change.slot)}`}</small>` : change.slot ? `<small>${e(change.slot)}</small>` : ''}</td><td class="v">${e(settingValue(change.parameter, change.before))}</td><td class="v">${e(settingValue(change.parameter, change.after))}</td></tr>`).join('')}</tbody></table>
    <p class="gf-meta">Observed on the pump. Harmonic did not program it.</p></section>`;
}

/** The reassessment: a second, explicitly requested read, kept beside the
    original rather than in place of it. */
export function reassessmentSection(detail, mode) {
  const controls = `<div class="seg" role="group" aria-label="Assessment"><button data-assessment="original" aria-pressed="${mode === 'original'}">Original</button><button data-assessment="retained" aria-pressed="${mode === 'retained'}">Retained context</button><button data-assessment="current" aria-pressed="${mode === 'current'}">Current policy</button></div>`;
  const reassessment = detail.reassessment;
  if (mode === 'original' || !reassessment) {
    return `<section class="gf-section" data-record-part="reassessment"><h3>Reassessment</h3>${controls}
      <p class="gf-meta" data-reassessment="none">Not requested. The saved ending above is what this record was decided on.</p></section>`;
  }
  const comparison = reassessment.comparison || {};
  const availability = comparison.availability || {};
  const context = reassessment.comparison_context || {};
  return `<section class="gf-section" data-record-part="reassessment"><h3>Reassessment <span class="meta">${e(reassessment.mode)}</span></h3>${controls}
    <dl>
      <dt>Computed</dt><dd>${e(stamp(reassessment.computed_at))}</dd>
      <dt>Context</dt><dd data-reassessment-context="${e(reassessment.mode)}">${reassessment.mode === 'current'
        ? 'Current policy — this is not a like-for-like comparison with the saved ending.'
        : `Stored context ${e(context.id ? String(context.id).slice(0, 12) : 'unavailable')}`}</dd>
      <dt>Result</dt><dd data-reassessment-state="${e(availability.state || 'unavailable')}">${availability.state === 'available'
        ? e((comparison.assessment || {}).state || 'unclear')
        : `Unavailable · ${e(availability.reason || 'not recorded')}`}</dd>
    </dl>
    <p class="gf-meta">A reassessment never replaces the saved ending, and cannot claim an improvement the ending did not record.</p></section>`;
}

/* ----------------------------------------------------------------- the frames */

/** The roster of records, when none is open. */
function rosterFrame(roster) {
  const stage = `<section class="pane gf-stage gf-stage-table" aria-label="Change records">${nameplate({
    kicker: 'Changes · <b>Records</b>',
    title: 'What has been changed, and how it ended',
    sub: `${roster.trials.length + roster.focuses.length} recorded`,
  })}<div class="gf-scroll">${recordRoster(roster)}</div></section>`;
  const reading = `<aside class="pane gf-reading" aria-label="Records">${readingHeader('Records')}<div class="gf-pane-body">
    <section class="gf-section"><h3>What a record keeps</h3>
      <p>The original decision or the first time Harmonic saw the change, the observed change itself, the ending you saved, and any later reassessment — kept apart, because they answer different questions.</p>
      <p class="gf-meta">Opening a record shows its own evidence. Nothing here is sent to your pump.</p></section>
  </div></aside>`;
  return desk(stage, reading);
}

/**
 * The ONE comparison a record renders: the ending's own saved assessment where
 * it has one, and the requested reassessment where it does not.
 *
 * Never the two at once, and never one for the figure and the other for the
 * rows — a stage carrying two generations is exactly what the replacement terms
 * forbid.
 */
function shownComparison(detail) {
  const ending = (detail.original || {}).ending || {};
  return ending.kind && ending.assessment && ending.assessment.state
    ? { comparison: ending.assessment, source: 'ending' }
    : { comparison: (detail.reassessment || {}).comparison || null, source: 'reassessment' };
}

/** One open record: its evidence on the stage, its four parts in the reading. */
function recordFrame(state) {
  const { detail, mode, kind } = state;
  const ending = (detail.original || {}).ending || {};
  const ended = Boolean(ending.kind);
  const label = ended ? (ENDING_WORD[ending.kind] || ending.kind) : 'Still open';
  const title = kind === 'focus'
    ? (detail.subject || (detail.pattern_key ? `pattern:${detail.pattern_key}` : detail.lever))
    : recordTitle(detail);
  const shown = shownComparison(detail);
  const stage = `<section class="pane gf-stage gf-stage-trial" aria-label="Record evidence">${nameplate({
    kicker: `${e(KIND_WORD[kind])} · <b>${e(label)}</b>`,
    title: e(title),
    sub: kind === 'focus' ? `Pinned ${e(stamp(detail.pinned_at))}` : `Detected ${e(stamp(detail.changed_at))}`,
    end: '<button class="gf-btn" data-record-close>Back to records</button><button class="gf-btn" data-action="overview">Back to Diagnose</button>',
  })}
    <div class="instruments"><div class="instrument"><span class="cap">${ended ? 'Ending snapshot' : 'Available observations'}</span><span class="meta">${shown.source === 'ending' ? 'as saved at the ending' : 'recomputed now'}</span></div><div class="instrument gf-tools"><span class="meta">Pump-local time</span></div></div>
    ${evidenceFigure(shown.comparison, kind, figureColors())}
    <div class="gf-scroll">${comparisonTables(shown.comparison, kind)}</div></section>`;
  // The reading pane is named for what it holds, as the prototype named it.
  const pane = kind === 'focus' ? 'This Focus' : 'This trial';
  const reading = `<aside class="pane gf-reading" aria-label="${e(pane)}">${readingHeader(pane, e(label))}<div class="gf-pane-body">
    ${originalSection(detail.original || {})}
    ${endingSection(ending, { kind })}
    ${periodsSection(shown.comparison, kind)}
    ${changeSection({ ...detail, kind })}
    ${readinessSection(shown.comparison, { kind, heading: 'Evidence accrued' })}
    ${reassessmentSection(detail, mode)}
  </div></aside>`;
  return desk(stage, reading);
}

function recordTitle(detail) {
  const changes = detail.changes || [];
  if (changes.length !== 1) return `Profile change · ${changes.length} settings`;
  const [change] = changes;
  const name = `${SETTING_NAME[change.parameter] || change.parameter}${change.slot && !change.uniform ? ` ${change.slot}` : ''}`;
  return change.before == null
    ? `${name} · ${settingValue(change.parameter, change.after)}`
    : `${name} · ${settingValue(change.parameter, change.before)} → ${settingValue(change.parameter, change.after)}`;
}

/* ------------------------------------------------------------------- binding */

function bind(host) {
  const back = host.querySelector('[data-action="overview"]');
  if (back) back.onclick = () => navigate('diagnose', retainedEvidenceContext(memory.record?.detail));
  for (const button of host.querySelectorAll('[data-record]')) {
    button.onclick = () => {
      const [kind, ...rest] = button.dataset.record.split(':');
      openRecord(kind, rest.join(':'));
      view.focusAfterRender = '.gf-reading > header h2';
      render();
    };
  }
  const close = host.querySelector('[data-record-close]');
  if (close) close.onclick = () => { closeRecord(); view.focusAfterRender = '.gf-stage .gf-title'; render(); };
  for (const button of host.querySelectorAll('[data-assessment]')) {
    button.onclick = () => {
      memory.mode = button.dataset.assessment;
      memory.record = null;
      view.focusAfterRender = `[data-assessment="${memory.mode}"]`;
      render();
    };
  }
  // A supporting date opens that day through the published door, carrying the
  // subject and the exact control to come back to (HV2-14). This desk implements
  // no Day of its own.
  for (const button of host.querySelectorAll('[data-day-date]')) {
    button.onclick = () => navigate('day', {
      date: button.dataset.dayDate,
      subject: memory.record?.detail?.subject || 'history',
      lever: button.dataset.dayLever || null,
      from: 'changes', focus: `[data-day-date="${button.dataset.dayDate}"]`,
      occurrence: `record:${memory.open.kind}:${memory.open.id}`,
    });
  }
  const retry = host.querySelector('[data-retry]');
  if (retry) retry.onclick = () => { memory.error = null; render(); };
}

/** The record destination's content. */
export function mount(host, { hold: holdCleanup = hold, context = {} } = {}) {
  const match = /^record:(trial|focus):(.+)$/.exec(context.occurrence || '');
  const open = match ? { kind: match[1], id: match[2] } : null;
  if (open?.id !== memory.open?.id || open?.kind !== memory.open?.kind) {
    readGeneration += 1;
    memory.open = open; memory.record = null; memory.error = null; memory.loading = null;
  }
  if (memory.error) { host.innerHTML = errorFrame('Changes', 'The change records'); bind(host); return; }
  if (!memory.roster) { load('roster', loadRoster); host.innerHTML = loadingFrame('Changes'); return; }
  if (memory.error) { host.innerHTML = errorFrame('Changes', 'The change records'); bind(host); return; }
  if (!memory.open) {
    if (!memory.roster.trials.length && !memory.roster.focuses.length) {
      host.innerHTML = emptyFrame('Changes', 'No change underway',
        'No setting change and no Pattern Focus has been recorded on this store yet.',
        '<button class="gf-btn primary" data-destination-action="diagnose">Inspect the evidence</button>');
      bind(host);
      return;
    }
    host.innerHTML = rosterFrame(memory.roster);
    bind(host);
    return;
  }
  const key = `record:${memory.open.kind}:${memory.open.id}:${memory.mode}`;
  if (!memory.record || memory.record.mode !== memory.mode
      || memory.record.id !== memory.open.id || memory.record.kind !== memory.open.kind) {
    load(key, token => loadRecord(memory.open, memory.mode, token));
    host.innerHTML = loadingFrame('Changes');
    return;
  }
  host.innerHTML = recordFrame({ ...memory.record });
  bind(host);
  mountComparisonChart(host, shownComparison(memory.record.detail).comparison, holdCleanup);
}
