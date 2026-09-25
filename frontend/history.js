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
import { concludeTrial, failureMessage, fetchVerifyTrials } from './client.js';
import { desk, e, emptyFrame, errorFrame, loadingFrame, nameplate, readingHeader, stamp } from './frame.js';
import { settingValue } from './plan.js';
import { hold, navigate, render, view } from './routes.js';
// The comparison itself is the follow-up's evidence, and one record is a read of
// it, so its renderers have one owner and this module consumes them. The
// dependency runs one way only: follow-up.js imports nothing from here, and the
// Changes composition is handed both mounts by the entry module.
import {
  comparisonReasonWords, comparisonTables, evidenceFigure, figureColors, mountComparisonChart,
  conclusionForm, periodsSection, readinessSection, retainedEvidenceContext, saveErrorBlock, stateWords, supportingDateFocus,
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
  superseded: 'A later setting change was detected inside the watch window. This record keeps the period it actually observed.',
  reverted: 'The setting went back to its previous value on the pump, which ended the observation period.',
  expired_unreviewed: 'The watch reached the end of its lifecycle window without being reviewed. Its observations are still here.',
  user_finished: 'You recorded this ending. Harmonic did not program the pump; the change was entered by hand.',
};
const KIND_WORD = { trial: 'Setting change', focus: 'Focus' };
// The three reads a record offers, named as its segment names them; the
// reassessment heading names its served mode by the same words (ADR 450).
const MODE_WORD = { original: 'Original', retained: 'Retained context', current: 'Current policy' };
const STATUS_WORD = { active: 'Active', resolved: 'Resolved', dropped: 'Dropped',
  not_selected_for_watch: 'Not watched' };
const SETTING_NAME = {
  basal_rate: 'Basal', carb_ratio: 'Carb ratio', isf: 'Correction factor',
  target_bg: 'Target glucose', profile: 'Whole profile',
};

/* ------------------------------------------------------- the record's memory */

// `open` is the record that is open, `{ kind, id }`, or null on the roster, and
// `setOpenRecord` is its one writer. Whenever the identity changes — a roster
// press, Back to records, a finished change opening its record, an address
// naming another record — it drops what was held for the record being left:
// the chosen assessment, the record read, a failed destination read, any read
// still in flight, and the Later conclusion's text, failed save and request id
// (ADR 452); a later-conclusion save still in flight writes nothing when it
// returns. A re-render of the same record, a Day return included, keeps them.
//
// `mode` is the reader's own choice of assessment for the open record, or null
// until they make one: the record's default read, which its served ending
// decides once the record read has landed (ADR 430). `failed` is a reassessment
// read that failed for the open record; the record it was read for stays. It
// is cleared wherever a record read lands, so every opening of a record — by a
// roster press, its address or a reload — reads its reassessment afresh.
// `conclusion`, `conclusionFailure` and `conclusionAttempt` are the Later
// conclusion form's text, its failed save and that save's request id: held
// across a re-render so Retry resends the same request id, and emptied by a
// successful save as well as by the identity rule.
const memory = {
  roster: null, error: null, open: null, mode: null, failed: null,
  record: null, loading: null, conclusion: '', conclusionFailure: null, conclusionAttempt: null,
};

/** Set which record is open, `{ kind, id }` or null, dropping what the record
    being left held (the rule above). Opening installs a new identity object,
    so even reopening the record already open is a change. Its callers run it
    before navigating, which renders synchronously. Nothing started for the
    record being left lands on the next: the bumped generation drops the
    destination's own reads, and a later-conclusion save compares the identity
    it started under after each await and writes nothing once it differs. */
function setOpenRecord(next) {
  readGeneration += 1;
  memory.open = next;
  memory.mode = null; memory.record = null; memory.error = null; memory.loading = null;
  memory.conclusion = ''; memory.conclusionFailure = null; memory.conclusionAttempt = null;
}

/** Open one record on itself. The finished change is acknowledged before any
    other concern is offered, so finishing hands the identity here (HV2-28).
    Every open starts the record fresh, the one already open included, and
    re-reads the roster. */
export function openRecord(kind, id) {
  setOpenRecord({ kind, id: String(id) });
  memory.roster = null;
  navigate('changes', { subject: 'history', occurrence: `record:${kind}:${id}` });
}

/** Leave the open record for the roster, which holds none. */
function closeRecord() {
  setOpenRecord(null);
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
    edits: roster.edits || [],
  };
}

// The record read is TWO requests, and deliberately sequential. The original is
// what the record IS; a reassessment is a second, explicitly requested read that
// the server rejects (422) without a selection, so it can never arrive as a
// roster field (lock "Pre-ready values need a second request"). Each is its own
// keyed read, so the loading frame can name whichever one is pending, and a
// stale answer for another record is dropped by its generation.
async function loadRecord({ kind, id }, token) {
  const original = await fetchVerifyTrials({ kind, selected: id });
  const row = (kind === 'focus' ? memory.roster.focuses : memory.roster.trials).find(row => String(row.id) === id);
  const detail = { ...row, ...original.selected, revision: original.input_revision, admission: original.admission };
  if (readGeneration !== token) return;
  memory.record = { kind, id, mode: 'original', detail };
  memory.failed = null;
}

// A failed reassessment read is this record's failure, not the destination's:
// the record read already landed, so its Original read stays on screen and the
// stage names the read that failed and offers it again.
async function loadReassessment({ kind, id }, mode, token) {
  let again;
  try {
    again = await fetchVerifyTrials({ kind, selected: id, assessment: mode });
  } catch (error) {
    if (readGeneration === token) memory.failed = { mode, error };
    return;
  }
  if (readGeneration !== token) return;
  memory.record = { ...memory.record, mode, detail: { ...memory.record.detail, reassessment: again.selected.reassessment } };
}

/** The read a record shows: the reader's choice, else what its served ending
    decides. An ended record opens on its saved ending; one with no saved
    ending carries no comparison in its Original read, so it opens on its
    retained-context reassessment (ADR 430). The roster row is not consulted. */
const recordMode = (detail) => memory.mode
  || (((detail.original || {}).ending || {}).kind ? 'original' : 'retained');

/* -------------------------------------------------------------- the roster */

const endingOf = (row) => row.ending || {};
const isEnded = (row) => Boolean(endingOf(row).kind);

// A dropped (preempted) habit keeps the prototype's own way in, so it stays
// reachable in Changes as history rather than only through the generic roster
// (HV2-27, and the ledger's `[data-focus="dropped"]`).
const dropped = (row) => (row.kind === 'focus' && row.ending.kind === 'trial_preempted'
  ? ' data-focus="dropped"' : '');

const openCell = (status) =>
  `<span data-record-open="true">Still open</span><small>${e(STATUS_WORD[status] || status || 'active')}</small>`;
const endedCell = (ending) =>
  `${e(ENDING_WORD[ending.kind] || ending.kind)}<small>${e(stamp(ending.effective_at))}</small>`;

/** One record row, as the prototype rendered it. `editKey` marks it as a
    member beneath a titled Edit entry, for the roster's indentation. */
function recordRowHtml(row, editKey = null) {
  return `<tr${editKey ? ` data-edit-member="${e(editKey)}"` : ''}><td><button class="gf-row gf-record-row" data-record="${e(row.kind)}:${e(row.id)}"${dropped(row)} aria-pressed="false">${e(row.title)}<small>${e(KIND_WORD[row.kind])} · ${e(row.detail)}</small></button></td><td class="v">${isEnded(row) ? endedCell(row.ending) : openCell(row.status)}</td></tr>`;
}

/** The Ended cell an Edit entry shows for its members: the shared ending or
    the shared open disposition when every member agrees, otherwise how many
    of each — never a status no member actually holds. */
function editEndingCell(members) {
  const endedMembers = members.filter(isEnded);
  if (endedMembers.length === members.length) {
    const [first, ...rest] = endedMembers;
    if (rest.every((m) => m.ending.kind === first.ending.kind && m.ending.effective_at === first.ending.effective_at)) {
      return endedCell(first.ending);
    }
  } else if (endedMembers.length === 0) {
    const [first, ...rest] = members;
    if (rest.every((m) => m.status === first.status)) return openCell(first.status);
  }
  return `${endedMembers.length} ended · ${members.length - endedMembers.length} open`;
}

/** One titled entry for a served Edit with two or more members: its own
    summary row, then its member rows in the same table. */
function editEntryHtml(edit, members) {
  const parameters = (edit.parameters || [])
    .map((p) => `${e(SETTING_NAME[p.parameter] || p.parameter)}${p.count > 1 ? ` ×${p.count}` : ''}`)
    .join(' · ');
  const span = edit.first_changed_at === edit.last_changed_at
    ? stamp(edit.first_changed_at)
    : `${stamp(edit.first_changed_at)} – ${stamp(edit.last_changed_at)}`;
  const summary = `<tr class="gf-edit-row" data-edit="${e(edit.key)}"><td><span class="gf-row gf-edit-summary">${e(`${edit.count} setting changes`)}<small>${parameters}${parameters ? ' · ' : ''}${e(span)}</small></span></td><td class="v">${editEndingCell(members)}</td></tr>`;
  return summary + members.map((row) => recordRowHtml(row, edit.key)).join('');
}

/** One row per retained record, newest first, naming how each one ended. Two
    or more retained trials chained into one served Edit (ADR 414) render as
    one titled entry with their rows beneath; a one-member edit and every row
    with no served edit key (unretained candidates, Focus records) keep the
    flat row form in the same time order. */
export function recordRoster({ trials, focuses, edits = [] }) {
  const editByKey = new Map(edits.map((edit) => [edit.key, edit]));
  const trialRows = trials.map((row) => ({
    kind: 'trial', id: row.id, at: row.changed_at, edit: row.edit || null,
    title: `${SETTING_NAME[row.parameter] || row.parameter}${row.slot ? ` ${row.slot}` : ''}`,
    detail: row.before == null
      ? settingValue(row.parameter, row.after)
      : `${settingValue(row.parameter, row.before)} → ${settingValue(row.parameter, row.after)}`,
    ending: endingOf(row), status: row.watch_disposition || null,
  }));
  const focusRows = focuses.map((row) => ({
    kind: 'focus', id: row.id, at: row.pinned_at, edit: null,
    title: row.title || 'Focus',
    detail: `pinned ${stamp(row.pinned_at)}`,
    ending: endingOf(row), status: row.status || null,
  }));

  const grouped = new Map();
  const flatRows = [];
  for (const row of trialRows) {
    const edit = row.edit ? editByKey.get(row.edit) : null;
    if (edit && edit.count >= 2) {
      if (!grouped.has(row.edit)) grouped.set(row.edit, []);
      grouped.get(row.edit).push(row);
    } else {
      flatRows.push(row);
    }
  }

  const entries = [
    ...flatRows.map((row) => ({ at: row.at, html: recordRowHtml(row) })),
    ...focusRows.map((row) => ({ at: row.at, html: recordRowHtml(row) })),
    ...[...grouped.entries()].map(([key, members]) =>
      ({ at: editByKey.get(key).last_changed_at, html: editEntryHtml(editByKey.get(key), members) })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));

  if (!entries.length) return '<p class="gf-meta">No change has been recorded on this store yet.</p>';
  return `<table class="gf-table"><thead><tr><th scope="col">Record</th><th scope="col">Ended</th></tr></thead><tbody>${entries.map((entry) => entry.html).join('')}</tbody></table>`;
}

/* --------------------------------------------------------- the record's parts */

/** The original decision, or the first-observed context where there was none.
    Its unknowns are served facts and are printed as such (HV2-28, HV2-31). */
export function originalSection(original) {
  const context = original.context || {};
  const unavailable = context.state !== 'available';
  // The field names are the prototype's (harmonic-v2-glucose.js:635): what was
  // decided before the change and why. The third is when Harmonic recorded it —
  // every change one reconcile pass found shares that time — so it is named
  // apart from the stage's Detected, which is the pump's own transition.
  const rows = [
    ['Earlier decision', context.action ? 'Recorded with this change' : 'Not recorded'],
    ['Original explanation', unavailable ? 'Not recorded' : (context.explanation || 'Not recorded')],
    ['Recorded by Harmonic', unavailable ? 'Not recorded' : stamp(context.captured_at)],
  ];
  const unknowns = context.unknowns || [];
  return `<section class="gf-section" data-record-part="original"><h3>Original ${context.action ? 'decision' : 'context'} <span class="meta">${e(context.action ? 'as decided' : 'first observed')}</span></h3>
    <dl>${rows.map(([term, value]) => `<dt>${e(term)}</dt><dd>${e(value)}</dd>`).join('')}</dl>
    ${unavailable ? `<p class="gf-meta" data-unavailable="original">This record's original context is unavailable: ${e(comparisonReasonWords(context.reason || 'not_recorded'))}.</p>` : ''}
    ${unknowns.map((text) => `<p class="gf-meta" data-unknown>${e(text)}</p>`).join('')}
    <p class="gf-note">From the Trial record</p></section>`;
}

/** The immutable saved ending. First-wins: a later attempt reads this back
    unchanged, and no reassessment rewrites it. */
export function endingSection(ending, { kind }) {
  if (!ending || !ending.kind) {
    return `<section class="gf-section" data-record-part="ending"><h3>Ending</h3>
      <p class="gf-meta" data-unavailable="ending">Not recorded: this ${kind === 'focus' ? 'Focus' : 'change'} is still open.</p></section>`;
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
      ? `Recorded · ${e(stateWords(inference.state || 'unclear'))}`
      : `Unavailable · ${e(comparisonReasonWords(assessment.reason || 'not_recorded'))}`}</dd></dl>
    ${assessment.state === 'available' && inference.reason ? `<p class="gf-meta">${e(inference.reason)}</p>` : ''}
    <p class="gf-meta">An observation period may end without a clear answer. Nothing here required a favourable result.</p></section>`;
}

export function lateConclusionSection(conclusion, { eligible = false, state = {} } = {}) {
  if (conclusion?.state === 'available') {
    return `<section class="gf-section" data-record-part="late-conclusion" data-late-conclusion="available"><h3>Later conclusion <span class="meta">recorded after expiry</span></h3>
      <p data-late-conclusion-text>${e(conclusion.conclusion)}</p><p class="gf-meta">Recorded ${e(stamp(conclusion.recorded_at))}. This does not change the saved ending or resume the Trial.</p></section>`;
  }
  if (!eligible) return '';
  const formState = { conclusion: state.conclusion || '', failure: state.failure || null };
  return `<section class="gf-section" data-record-part="late-conclusion" data-late-conclusion="pending"><h3>Later conclusion <span class="meta">after expiry</span></h3>
    <p class="gf-meta">Record what you observed after this Trial expired. This does not change its saved ending or resume the Trial.</p>
    ${saveErrorBlock(formState, { form: 'late-conclusion' })}
    ${conclusionForm(formState, { form: 'late-conclusion', label: 'Record later conclusion',
      fieldLabel: 'Later conclusion', note: 'Nothing here is sent to your pump.' })}</section>`;
}

/** The observed change: the setting, and what it became. A Focus changed no
    setting, so it names the behavior it watched by its served name (ADR 449),
    which a Pattern's nameplate title is not. */
export function changeSection(detail) {
  const changes = detail.changes || [];
  if (!changes.length) {
    const behavior = detail.lever_title
      ? `The intended behavior: ${e(detail.lever_title)}.`
      : 'The behavior this Focus watched is no longer an offered lever.';
    return `<section class="gf-section" data-record-part="change"><h3>What changed</h3>
      <p class="gf-meta">${detail.kind === 'focus' ? `${behavior} No pump setting changed.` : 'Not recorded'}</p></section>`;
  }
  return `<section class="gf-section" data-record-part="change"><h3>What changed</h3>
    <table class="gf-table"><thead><tr><th scope="col">Setting</th><th scope="col">Before</th><th scope="col">Detected</th></tr></thead><tbody>${changes.map((change) => `<tr><td>${e(SETTING_NAME[change.parameter] || change.parameter)}${change.slots_changed ? `<small>${e(change.slots_changed)} time slots changed${change.uniform ? ' · uniform' : ` · values shown at ${e(change.slot)}`}</small>` : change.slot ? `<small>${e(change.slot)}</small>` : ''}</td><td class="v">${e(settingValue(change.parameter, change.before))}</td><td class="v">${e(settingValue(change.parameter, change.after))}</td></tr>`).join('')}</tbody></table>
    <p class="gf-meta">Observed on the pump. Harmonic did not program it.</p></section>`;
}

/** The reassessment: a second, explicitly requested read, kept beside the
    original rather than in place of it. */
export function reassessmentSection(detail, mode, { kind } = {}) {
  const controls = `<div class="seg" role="group" aria-label="Assessment">${Object.entries(MODE_WORD).map(([value, word]) => `<button data-assessment="${value}" aria-pressed="${mode === value}">${word}</button>`).join('')}</div>`;
  const reassessment = detail.reassessment;
  if (mode === 'original' || !reassessment) {
    // A record with no saved ending has nothing above to point at: its Original
    // read carries no comparison until it ends.
    const ended = Boolean(((detail.original || {}).ending || {}).kind);
    return `<section class="gf-section" data-record-part="reassessment"><h3>Reassessment</h3>${controls}
      <p class="gf-meta" data-reassessment="none">Not requested. ${ended
        ? 'The saved ending above is what this record was decided on.'
        : `The saved read carries no comparison until this ${kind === 'focus' ? 'Focus' : 'change'} ends.`}</p></section>`;
  }
  const comparison = reassessment.comparison || {};
  const availability = comparison.availability || {};
  const context = reassessment.comparison_context || {};
  return `<section class="gf-section" data-record-part="reassessment"><h3>Reassessment <span class="meta">${e(MODE_WORD[reassessment.mode] || reassessment.mode)}</span></h3>${controls}
    <dl>
      <dt>Computed</dt><dd>${e(stamp(reassessment.computed_at))}</dd>
      <dt>Context</dt><dd data-reassessment-context="${e(reassessment.mode)}">${reassessment.mode === 'current'
        ? 'Current policy: this is not a like-for-like comparison with the saved ending.'
        : context.captured_at ? `Stored context recorded ${e(stamp(context.captured_at))}` : 'No stored context was recorded'}</dd>
      <dt>Result</dt><dd data-reassessment-state="${e(availability.state || 'unavailable')}">${availability.state === 'available'
        ? e(stateWords((comparison.assessment || {}).state || 'unclear'))
        : `Unavailable · ${e(comparisonReasonWords(availability.reason || 'not_recorded'))}`}</dd>
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
      <p>The original decision or the first time Harmonic saw the change, the observed change itself, the ending you saved, and any later reassessment. They are kept apart because they answer different questions.</p>
      <p class="gf-meta">Opening a record shows its own evidence. Nothing here is sent to your pump.</p></section>
  </div></aside>`;
  return desk(stage, reading);
}

/**
 * The ONE comparison a record renders: the ending's own saved assessment where
 * it has one, and the requested reassessment where it does not. A saved ending
 * that serves no periods has nothing to draw, so a reassessment the reader
 * requests takes the stage instead (ADR 462); with none requested, the saved
 * ending still shows.
 *
 * Never the two at once, and never one for the figure and the other for the
 * rows — a stage carrying two generations is exactly what the replacement terms
 * forbid.
 */
function shownComparison(detail) {
  const ending = (detail.original || {}).ending || {};
  const saved = ending.kind && ending.assessment && ending.assessment.state ? ending.assessment : null;
  const requested = (detail.reassessment || {}).comparison || null;
  return saved && (Object.keys(saved.periods || {}).length || !requested)
    ? { comparison: saved, source: 'ending' }
    : { comparison: requested, source: 'reassessment' };
}

/** A failed reassessment read, in the stage: which read failed, and its retry.
    A served sentence keeps one full stop: the line appends its own. */
function reassessmentFailure(failed) {
  if (!failed) return '';
  const read = failed.mode === 'current' ? 'current-policy' : 'retained-context';
  return `<div class="gf-status" role="alert" data-reassessment-failed="${e(failed.mode)}"><p class="gf-error">The ${e(read)} reassessment could not load: ${e(failureMessage(failed.error).replace(/\.$/, ''))}.</p><p class="gf-meta">The record itself is unchanged.</p><div class="gf-actions"><button class="gf-btn primary" data-retry-reassessment>Retry reassessment</button></div></div>`;
}

/** One open record: its evidence on the stage, its four parts in the reading. */
function recordFrame(state) {
  const { detail, mode, kind, failed } = state;
  const ending = (detail.original || {}).ending || {};
  const ended = Boolean(ending.kind);
  const label = ended ? (ENDING_WORD[ending.kind] || ending.kind) : 'Still open';
  const title = recordTitle(detail, kind);
  const shown = shownComparison(detail);
  // A reassessment drawn for an ended record names its own mode, never the
  // saved ending's snapshot (ADR 462).
  const cap = ended && shown.source === 'reassessment' && shown.comparison
    ? `${MODE_WORD[detail.reassessment.mode] || detail.reassessment.mode} reassessment`
    : ended ? 'Ending snapshot' : 'Available observations';
  const stage = `<section class="pane gf-stage gf-stage-trial" aria-label="Record evidence">${nameplate({
    kicker: `${e(KIND_WORD[kind])} · <b>${e(label)}</b>`,
    title: e(title),
    sub: kind === 'focus' ? `Pinned ${e(stamp(detail.pinned_at))}` : `Detected ${e(stamp(detail.changed_at))}`,
    end: '<button class="gf-btn" data-record-close>Back to records</button><button class="gf-btn" data-action="overview">Back to Diagnose</button>',
  })}
    <div class="instruments"><div class="instrument"><span class="cap">${e(cap)}</span><span class="meta">${shown.source === 'ending' ? 'as saved at the ending' : shown.comparison ? 'recomputed now' : 'no comparison read'}</span></div><div class="instrument gf-tools"><span class="meta">Pump-local time</span></div></div>
    ${evidenceFigure(shown.comparison, kind, figureColors(), { saved: shown.source === 'ending' })}
    <div class="gf-scroll">${reassessmentFailure(failed)}${comparisonTables(shown.comparison, kind, { leverTitle: detail.lever_title, targets: detail.target_metrics })}</div></section>`;
  // The reading pane is named for what it holds, as the prototype named it.
  const pane = kind === 'focus' ? 'This Focus' : 'This trial';
  const reading = `<aside class="pane gf-reading" aria-label="${e(pane)}">${readingHeader(pane, e(label))}<div class="gf-pane-body">
    ${originalSection(detail.original || {})}
    ${endingSection(ending, { kind })}
    ${lateConclusionSection((detail.original || {}).late_conclusion, {
      eligible: kind === 'trial' && ending.kind === 'expired_unreviewed',
      state: { conclusion: memory.conclusion, failure: memory.conclusionFailure },
    })}
    ${periodsSection(shown.comparison, kind)}
    ${changeSection({ ...detail, kind })}
    ${readinessSection(shown.comparison, { kind, heading: 'Evidence accrued' })}
    ${reassessmentSection(detail, mode, { kind })}
  </div></aside>`;
  return desk(stage, reading);
}

// The record's nameplate title, which is also the name a Day entry opened from
// the record carries (ADR 426).
function recordTitle(detail, kind) {
  if (kind === 'focus') return detail.title || 'Focus';
  const changes = detail.changes || [];
  if (changes.length !== 1) return `Profile change · ${changes.length} settings`;
  const [change] = changes;
  const name = `${SETTING_NAME[change.parameter] || change.parameter}${change.slot && !change.uniform ? ` ${change.slot}` : ''}`;
  return change.before == null
    ? `${name} · ${settingValue(change.parameter, change.after)}`
    : `${name} · ${settingValue(change.parameter, change.before)} → ${settingValue(change.parameter, change.after)}`;
}

const conclusionAttemptId = () => {
  if (memory.conclusionAttempt) return memory.conclusionAttempt;
  memory.conclusionAttempt = `conclude:${globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  return memory.conclusionAttempt;
};

// A save belongs to the record it started on (ADR 452). After each await it
// writes nothing unless that record's identity is still the one open: a retry
// whose re-read returns after the record was left is abandoned unsent, and a
// failure or success returning then leaves the next record as it is.
async function submitLateConclusion({ retry = false } = {}) {
  const state = memory.record;
  const detail = state?.detail;
  const conclusion = (memory.conclusion || '').trim();
  if (!detail || state.kind !== 'trial' || !conclusion) return;
  const startedOn = memory.open;
  const left = () => memory.open !== startedOn;
  try {
    if (retry) {
      const fresh = await fetchVerifyTrials({ kind: 'trial', selected: state.id });
      if (left()) return;
      memory.record = { ...state, detail: { ...detail, ...fresh.selected, revision: fresh.input_revision } };
      memory.roster.revision = fresh.input_revision;
    }
    const body = { request_id: conclusionAttemptId(), input_revision: memory.record.detail.revision, conclusion };
    await concludeTrial(state.id, body);
    if (left()) return;
    memory.conclusion = ''; memory.conclusionFailure = null; memory.conclusionAttempt = null;
    memory.roster = null; memory.record = null;
  } catch (error) {
    if (left()) return;
    memory.conclusionFailure = { operation: 'conclude', headline: 'Recording the later conclusion failed',
      message: failureMessage(error) };
    view.focusAfterRender = '[data-retry-save="conclude"]';
  }
  render();
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
  // A press holds for this record while it stays open. The mount reads what
  // the chosen assessment still needs; pressing the one already shown needs
  // nothing and re-renders it as it stands. A press also clears a failed
  // reassessment read, so pressing its control again is a retry.
  for (const button of host.querySelectorAll('[data-assessment]')) {
    button.onclick = () => {
      memory.mode = button.dataset.assessment;
      memory.failed = null;
      view.focusAfterRender = `[data-assessment="${memory.mode}"]`;
      render();
    };
  }
  const retryReassessment = host.querySelector('[data-retry-reassessment]');
  if (retryReassessment) retryReassessment.onclick = () => {
    view.focusAfterRender = `[data-assessment="${memory.failed.mode}"]`;
    memory.failed = null;
    render();
  };
  // A supporting date opens that day through the published door, carrying the
  // subject, the record and the date, which is what the return comes back to
  // (HV2-14, ADR 445). This desk implements no Day of its own.
  for (const button of host.querySelectorAll('[data-day-date]')) {
    button.onclick = () => navigate('day', {
      date: button.dataset.dayDate,
      subject: memory.record?.detail?.subject || 'history',
      title: recordTitle(memory.record.detail, memory.record.kind),
      lever: button.dataset.dayLever || null,
      from: 'changes',
      occurrence: `record:${memory.open.kind}:${memory.open.id}`,
    });
  }
  const retry = host.querySelector('[data-retry]');
  if (retry) retry.onclick = () => { memory.error = null; render(); };
  const lateText = host.querySelector('#late-conclusion-conclusion');
  if (lateText) lateText.oninput = event => {
    memory.conclusion = event.target.value;
    const submit = host.querySelector('[data-form="late-conclusion"] [type="submit"]');
    if (submit) submit.disabled = !memory.conclusion.trim();
  };
  const lateForm = host.querySelector('[data-form="late-conclusion"]');
  if (lateForm) lateForm.onsubmit = event => {
    event.preventDefault();
    submitLateConclusion({ retry: Boolean(memory.conclusionFailure) });
  };
}

/** The record destination's content. */
export function mount(host, { hold: holdCleanup = hold, context = {}, navigation } = {}) {
  const match = /^record:(trial|focus):(.+)$/.exec(context.occurrence || '');
  const open = match ? { kind: match[1], id: match[2] } : null;
  if (open?.id !== memory.open?.id || open?.kind !== memory.open?.kind) setOpenRecord(open);
  if (memory.error) { host.innerHTML = errorFrame('Changes', 'The change records'); bind(host); return; }
  if (!memory.roster) { load('roster', loadRoster); host.innerHTML = loadingFrame('Changes', 'Reading change records'); return; }
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
  const record = memory.record?.kind === open.kind && memory.record.id === open.id ? memory.record : null;
  if (!record) {
    load(`record:${open.kind}:${open.id}`, token => loadRecord(open, token));
    host.innerHTML = loadingFrame('Changes', 'Reading change records');
    return;
  }
  const mode = recordMode(record.detail);
  const failed = memory.failed?.mode === mode ? memory.failed : null;
  if (record.mode !== mode && !failed) {
    if (mode === 'original') {
      // The Original read is the record read already held; nothing is requested.
      memory.record = { ...record, mode, detail: { ...record.detail, reassessment: null } };
    } else {
      load(`record:${open.kind}:${open.id}:${mode}`, token => loadReassessment(open, mode, token));
      host.innerHTML = loadingFrame('Reassessment', 'Computing reassessment');
      return;
    }
  }
  host.innerHTML = recordFrame({ ...memory.record, failed });
  bind(host);
  mountComparisonChart(host, shownComparison(memory.record.detail).comparison, holdCleanup);
  const back = supportingDateFocus({ context, navigation });
  if (back) view.focusAfterRender = back;
}
