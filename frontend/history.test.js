// The record's four parts, read back without a DOM.
//
// The payloads are the shapes the backend serves: a Trial Harmonic only ever
// observed on the pump (so its original decision is explicitly unavailable), a
// Focus ended by hand, and a Focus a later Trial preempted.
import assert from 'node:assert/strict';
import test from 'node:test';

import { stamp } from './frame.js';
import { comparisonReasonWords } from './follow-up.js';
import {
  changeSection, endingSection, lateConclusionSection, originalSection, reassessmentSection,
  recordRoster, settingValue,
} from './history.js';

/* ---------------------------------------------------------------- payloads */

// What reconciliation writes when Harmonic first SEES a change rather than
// being told about it: the decision is not recorded, and the record says so.
const FIRST_OBSERVED = {
  context: {
    version: '386:1', state: 'available', captured_at: '2026-09-08 15:15:35',
    input_revision: 8, action: null, policy: '386:1',
    explanation: 'Observed programmed setting transition; original decision is not recorded.',
    source_window: { start: '2024-06-16 08:00:00', end: '2024-06-30 23:55:00' },
    subjects: ['carb_ratio-all-20240616080000'], occurrences: [],
    settings: [{ value: 12.0, unit: 'g/U' }, { value: 10.0, unit: 'g/U' }],
    support: {}, unknowns: ['Original user decision is unavailable.'],
  },
  ending: { version: '386:1', state: 'unavailable', reason: 'not_recorded' },
  assessment: { version: '386:1', state: 'unavailable', reason: 'not_recorded' },
};

// A decision that WAS recorded, against a habit the backend admitted.
const DECIDED = {
  context: {
    version: '386:1', state: 'available', captured_at: '2024-05-15 00:00:00',
    action: { action_id: 'habit:missed_meal' }, explanation: 'Missed / unannounced meal',
    analysis_generation: 'guidance:abc:0:r6', subjects: ['habit:missed_meal'],
    occurrences: ['ep-001', 'ep-002'], settings: [], unknowns: [],
  },
  ending: { version: '386:1', state: 'unavailable', reason: 'not_recorded' },
  assessment: { version: '386:1', state: 'unavailable', reason: 'not_recorded' },
};

const MANUAL_ENDING = {
  version: '386:1', state: 'available', kind: 'manual',
  effective_at: '2024-05-30 23:00:00', recorded_at: '2024-05-30 23:00:00',
  conclusion: 'I set a reminder before lunch and kept it.',
  assessment: {
    version: '386:1', state: 'unavailable', reason: 'unavailable_adherence',
    assessment: { state: 'unclear', reason: 'Read each outcome separately.' },
    readiness: {}, outcomes: [], periods: {},
  },
};

const PREEMPTED_ENDING = {
  version: '386:1', state: 'available', kind: 'trial_preempted',
  effective_at: '2024-06-16 08:00:00', recorded_at: '2024-06-20 09:00:00',
  conclusion: null,
  assessment: {
    version: '386:1', state: 'available', reason: null,
    assessment: { state: 'unclear', reason: 'Read each outcome separately.' },
  },
};

/* ------------------------------------------------------------- the roster */

test('the roster names how each record ended, and marks the open ones', () => {
  const html = recordRoster({
    trials: [{
      id: 'carb_ratio-all-20240616080000', parameter: 'carb_ratio', slot: null,
      changed_at: '2024-06-16 08:00:00', before: 12.0, after: 10.0,
      ending: { state: 'unavailable', reason: 'not_recorded' }, watch_disposition: 'active',
    }],
    focuses: [
      { id: 1, lever: 'missed_meal', pinned_at: '2024-05-15 00:00:00', status: 'resolved', ending: MANUAL_ENDING },
      { id: 2, lever: 'late_bolus', pinned_at: '2024-06-01 00:00:00', status: 'dropped', ending: PREEMPTED_ENDING },
    ],
  });
  assert.match(html, /data-record="trial:carb_ratio-all-20240616080000"/);
  assert.match(html, /data-record="focus:1"/);
  assert.match(html, /data-record="focus:2"/);
  assert.match(html, /Ended by you/);
  assert.match(html, /Preempted by a Trial/);
  assert.match(html, /data-record-open="true"/);
  // Newest first: the Trial changed on Jun 16 leads the Focus pinned Jun 1.
  assert.ok(html.indexOf('trial:carb_ratio') < html.indexOf('focus:2'));
});

test('a two-member Edit gets one titled entry, its rows beneath it', () => {
  const edits = [{ key: 'edit-isf-all-1', first_changed_at: '2026-06-01 00:00:00',
    last_changed_at: '2026-06-02 00:00:00', count: 2, parameters: [{ parameter: 'isf', count: 2 }] }];
  const html = recordRoster({
    edits,
    trials: [
      { id: 'isf-all-1', parameter: 'isf', slot: null, changed_at: '2026-06-01 00:00:00',
        before: 40, after: 36, edit: 'edit-isf-all-1',
        ending: { kind: 'manual', effective_at: '2026-06-05 00:00:00' } },
      { id: 'isf-all-2', parameter: 'isf', slot: null, changed_at: '2026-06-02 00:00:00',
        before: 36, after: 34, edit: 'edit-isf-all-1',
        ending: { kind: 'manual', effective_at: '2026-06-05 00:00:00' } },
    ],
    focuses: [],
  });
  assert.match(html, /data-edit="edit-isf-all-1"/);
  assert.match(html, /2 setting changes/);
  assert.match(html, /Correction factor ×2/);
  assert.match(html, /data-edit-member="edit-isf-all-1"[^>]*>.*data-record="trial:isf-all-1"/s);
  assert.match(html, /data-edit-member="edit-isf-all-1"[^>]*>.*data-record="trial:isf-all-2"/s);
  // Both members share the same saved ending, so the entry shows it once.
  assert.match(html, /Ended by you/);
  assert.doesNotMatch(html, /ended · \d+ open/);
});

test('a one-member edit and an unkeyed row are not folded into a titled entry', () => {
  const edits = [{ key: 'edit-isf-all-1', first_changed_at: '2026-06-01 00:00:00',
    last_changed_at: '2026-06-01 00:00:00', count: 1, parameters: [{ parameter: 'isf', count: 1 }] }];
  const html = recordRoster({
    edits,
    trials: [
      { id: 'isf-all-1', parameter: 'isf', slot: null, changed_at: '2026-06-01 00:00:00',
        before: 40, after: 36, edit: 'edit-isf-all-1', ending: {} },
      { id: 'carb_ratio-all-1', parameter: 'carb_ratio', slot: null, changed_at: '2026-05-01 00:00:00',
        before: 12, after: 10, ending: {} },
    ],
    focuses: [],
  });
  assert.doesNotMatch(html, /data-edit=/);
  assert.doesNotMatch(html, /setting changes/);
  assert.match(html, /data-record="trial:isf-all-1"/);
  assert.match(html, /data-record="trial:carb_ratio-all-1"/);
});

test('a mixed-ending Edit shows how many of each rather than a false shared ending', () => {
  const edits = [{ key: 'edit-isf-all-1', first_changed_at: '2026-06-01 00:00:00',
    last_changed_at: '2026-06-02 00:00:00', count: 2, parameters: [{ parameter: 'isf', count: 2 }] }];
  const html = recordRoster({
    edits,
    trials: [
      { id: 'isf-all-1', parameter: 'isf', slot: null, changed_at: '2026-06-01 00:00:00',
        before: 40, after: 36, edit: 'edit-isf-all-1', ending: { kind: 'manual', effective_at: '2026-06-05 00:00:00' } },
      { id: 'isf-all-2', parameter: 'isf', slot: null, changed_at: '2026-06-02 00:00:00',
        before: 36, after: 34, edit: 'edit-isf-all-1', ending: {}, watch_disposition: 'not_selected_for_watch' },
    ],
    focuses: [],
  });
  assert.match(html, /1 ended · 1 open/);
});

test('an all-open Edit shows the disposition its members actually share, not a fabricated Active', () => {
  const edits = [{ key: 'edit-isf-all-1', first_changed_at: '2026-06-01 00:00:00',
    last_changed_at: '2026-06-02 00:00:00', count: 2, parameters: [{ parameter: 'isf', count: 2 }] }];
  const html = recordRoster({
    edits,
    trials: [
      { id: 'isf-all-1', parameter: 'isf', slot: null, changed_at: '2026-06-01 00:00:00',
        before: 40, after: 36, edit: 'edit-isf-all-1', ending: {}, watch_disposition: 'not_selected_for_watch' },
      { id: 'isf-all-2', parameter: 'isf', slot: null, changed_at: '2026-06-02 00:00:00',
        before: 36, after: 34, edit: 'edit-isf-all-1', ending: {}, watch_disposition: 'not_selected_for_watch' },
    ],
    focuses: [],
  });
  assert.match(html, /Still open/);
  assert.match(html, /Not watched/);
  assert.doesNotMatch(html, />Active</, 'no member is watch-active, so the entry must not claim Active');
});

test('the not-watched status word prints, never the served token', () => {
  const html = recordRoster({
    trials: [{ id: 'isf-all-1', parameter: 'isf', slot: null, changed_at: '2026-06-01 00:00:00',
      before: 40, after: 36, ending: {}, watch_disposition: 'not_selected_for_watch' }],
    focuses: [],
  });
  assert.match(html, /Not watched/);
  assert.doesNotMatch(html, /not_selected_for_watch/);
});

test('an empty roster says nothing has been recorded rather than standing blank', () => {
  assert.match(recordRoster({ trials: [], focuses: [] }), /No change has been recorded/);
});

test('a dropped habit keeps its own way in, so it stays reachable in Changes', () => {
  const html = recordRoster({
    trials: [],
    focuses: [
      { id: 1, lever: 'missed_meal', pinned_at: '2024-05-15 00:00:00', status: 'resolved', ending: MANUAL_ENDING },
      { id: 2, lever: 'late_bolus', pinned_at: '2024-06-01 00:00:00', status: 'dropped', ending: PREEMPTED_ENDING },
    ],
  });
  assert.match(html, /data-record="focus:2" data-focus="dropped"/);
  // Only the preempted one carries it; an ending by hand is not a drop.
  assert.doesNotMatch(html, /data-record="focus:1" data-focus="dropped"/);
});

/* --------------------------------------------- original, ending, reassessment */

test('a first-observed record marks its original decision explicitly unavailable', () => {
  const html = originalSection(FIRST_OBSERVED);
  assert.match(html, /Original context/);
  assert.match(html, /first observed/);
  assert.match(html, /<dt>Earlier decision<\/dt><dd>Not recorded<\/dd>/);
  assert.match(html, /data-unknown>Original user decision is unavailable\./);
  assert.match(html, /From the Trial record/);
});

test('a first-observed record names when Harmonic recorded it, apart from the pump\u2019s Detected time', () => {
  const html = originalSection(FIRST_OBSERVED);
  assert.match(html, new RegExp(`<dt>Recorded by Harmonic</dt><dd>${stamp('2026-09-08 15:15:35')}</dd>`));
  assert.doesNotMatch(html, /First seen/);
});

test('a recorded decision reads as a decision, not as a first sighting', () => {
  const html = originalSection(DECIDED);
  assert.match(html, /Original decision/);
  assert.match(html, /as decided/);
  assert.match(html, /Recorded with this change/);
  assert.match(html, /Missed \/ unannounced meal/);
});

test('an unavailable original context states its served reason in words', () => {
  const html = originalSection({ context: { state: 'unavailable', reason: 'not_recorded' } });
  assert.match(html, /data-unavailable="original"/);
  assert.match(html, /unavailable: not recorded\./);
  assert.doesNotMatch(html, /not_recorded/);
  // A served reason with no word is printed verbatim rather than swallowed.
  assert.match(originalSection({ context: { state: 'unavailable', reason: 'unworded_reason' } }),
    /unavailable: unworded_reason\./);
});

test('a still-open record has no ending, and says that rather than inventing one', () => {
  const html = endingSection({ state: 'unavailable', reason: 'not_recorded' }, { kind: 'trial' });
  assert.match(html, /data-unavailable="ending"/);
  assert.match(html, /still open/);
  assert.doesNotMatch(html, /data-ending-kind/);
});

test('a saved ending keeps its kind, its times and the wearer’s own words', () => {
  const html = endingSection(MANUAL_ENDING, { kind: 'focus' });
  assert.match(html, /Saved ending <span class="meta">immutable<\/span>/);
  assert.match(html, /data-ending-kind="manual"/);
  assert.match(html, /data-conclusion>I set a reminder before lunch and kept it\./);
  assert.match(html, /You ended this Focus\./);
  // The ending assessment was not computable, and the record says so instead of
  // implying the period went well.
  assert.match(html, /data-ending-assessment="unavailable"/);
  assert.match(html, /Unavailable · unavailable_adherence/);
  assert.match(html, /Nothing here required a favourable result\./);
});

test('a late Trial conclusion is separate from the immutable expired ending', () => {
  const html = lateConclusionSection({ state: 'available', recorded_at: '2026-09-10 12:00:00',
    conclusion: 'The change helped after I had more time to observe it.' });
  assert.match(html, /data-record-part="late-conclusion"/);
  assert.match(html, /recorded after expiry/);
  assert.match(html, /does not change the saved ending or resume the Trial/);
});

test('an expired Trial exposes a separately dated conclusion form, but an ordinary ending does not', () => {
  const pending = lateConclusionSection({ state: 'unavailable' }, {
    eligible: true, state: { conclusion: 'A later synthetic observation.' },
  });
  assert.match(pending, /data-late-conclusion="pending"/);
  assert.match(pending, /data-form="late-conclusion"/);
  assert.match(pending, /id="late-conclusion-conclusion"/);
  assert.match(pending, /<label for="late-conclusion-conclusion">Later conclusion<\/label>/);
  assert.match(pending, /A later synthetic observation\./);
  assert.match(pending, /does not change its saved ending or resume the Trial/);
  assert.equal(lateConclusionSection({ state: 'unavailable' }), '');
});

test('a preempted Focus is dropped, kept, and explicitly never resumed', () => {
  const html = endingSection(PREEMPTED_ENDING, { kind: 'focus' });
  assert.match(html, /data-ending-kind="trial_preempted"/);
  assert.match(html, /Preempted by a Trial/);
  assert.match(html, /does not resume/);
  assert.match(html, /a later attempt is a new Focus with its own identity/);
  assert.match(html, /data-conclusion>Not recorded/);
});

test('a lever-unavailable ending is a different ending from a manual one', () => {
  const html = endingSection({ ...PREEMPTED_ENDING, kind: 'lever_unavailable' }, { kind: 'focus' });
  assert.match(html, /data-ending-kind="lever_unavailable"/);
  assert.match(html, /no longer an offered lever/);
  assert.doesNotMatch(html, /You ended this Focus/);
});

test('a superseded ending names a later setting change inside the window, never the same setting', () => {
  const html = endingSection({ ...PREEMPTED_ENDING, kind: 'superseded' }, { kind: 'trial' });
  assert.match(html, /data-ending-kind="superseded"/);
  assert.match(html, /A later setting change was detected inside the watch window\. This record keeps the period it actually observed\./);
  assert.doesNotMatch(html, /same setting/);
});

test('a served ending kind with no wording of its own is printed verbatim', () => {
  const html = endingSection({ ...PREEMPTED_ENDING, kind: 'some_new_kind' }, { kind: 'trial' });
  assert.match(html, /data-ending-kind="some_new_kind"/);
  assert.match(html, />some_new_kind</);
});

test('a reassessment is offered beside the original and never in place of it', () => {
  const none = reassessmentSection({ reassessment: null }, 'original');
  assert.match(none, /data-reassessment="none"/);
  assert.match(none, /aria-pressed="true"><\/button>|data-assessment="original" aria-pressed="true"/);

  const retained = reassessmentSection({
    reassessment: {
      mode: 'retained', computed_at: '2026-09-08 15:15:44',
      comparison_context: { id: 'dcbc2e96d98ac06a3369dccc5fcdd4f2876c7c0f' },
      comparison: { availability: { state: 'available', reason: null }, assessment: { state: 'unclear' } },
    },
  }, 'retained');
  assert.match(retained, /data-reassessment-context="retained"/);
  assert.match(retained, /Stored context dcbc2e96d98a/);
  assert.match(retained, /data-reassessment-state="available"/);
  assert.match(retained, /never replaces the saved ending/);
});

test('a current-policy reassessment labels its context and claims no like-for-like read', () => {
  const html = reassessmentSection({
    reassessment: {
      mode: 'current', computed_at: '2026-09-08 15:15:44', comparison_context: {},
      comparison: { availability: { state: 'unavailable', reason: 'data_not_yet_arrived' } },
    },
  }, 'current');
  assert.match(html, /data-reassessment-context="current"/);
  assert.match(html, /not a like-for-like comparison/);
  // The result names a served reason in the desk's one set of words, never its code.
  assert.match(html, new RegExp(`data-reassessment-state="unavailable">Unavailable · ${comparisonReasonWords('data_not_yet_arrived')}<`));
  assert.doesNotMatch(html, /data_not_yet_arrived/);
});

test('the Original line points at a saved ending only when the record has one', () => {
  const open = reassessmentSection({ reassessment: null, original: FIRST_OBSERVED }, 'original', { kind: 'trial' });
  assert.match(open, /data-reassessment="none">Not requested\. The saved read carries no comparison until this change ends\./);
  assert.doesNotMatch(open, /saved ending above/);
  const openFocus = reassessmentSection({ reassessment: null, original: DECIDED }, 'original', { kind: 'focus' });
  assert.match(openFocus, /carries no comparison until this Focus ends\./);
  const ended = reassessmentSection({ reassessment: null, original: { ...DECIDED, ending: MANUAL_ENDING } }, 'original', { kind: 'focus' });
  assert.match(ended, /Not requested\. The saved ending above is what this record was decided on\./);
});

/* -------------------------------------------------------- the observed change */

test('the observed change reads its own units, and says the pump was not programmed', () => {
  const html = changeSection({
    kind: 'trial',
    changes: [{ parameter: 'carb_ratio', slot: null, before: 12.0, after: 10.0 }],
  });
  assert.match(html, /12 g\/U/);
  assert.match(html, /10 g\/U/);
  assert.match(html, /Harmonic did not program it\./);
});

test('a Focus changed no setting, and its record says that rather than showing a blank table', () => {
  const html = changeSection({ kind: 'focus', lever: 'carb_undercount', title: 'Highs after meals', changes: [] });
  assert.match(html, /The intended behavior: Highs after meals\. No pump setting changed\./);
  assert.doesNotMatch(html, /<table/);
  assert.doesNotMatch(html, /_/, 'the behavior is named by its served title, never its key');
});

test('a correction factor reads insulin first on both sides', () => {
  assert.equal(settingValue('isf', 40), '1 U : 40 mg/dL');
  assert.equal(settingValue('basal_rate', 0.6), '0.6 U/h');
  assert.equal(settingValue('carb_ratio', null), 'not recorded');
});
