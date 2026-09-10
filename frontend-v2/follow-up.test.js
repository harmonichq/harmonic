// The follow-up arm's rendering, read back without a DOM.
//
// Every payload below is the SHAPE the backend actually serves, taken from a
// recorded probe of `/api/verify/trials` against manufactured stores: the
// setting arm from an I:C Trial, the Focus arm from a Focus pinned inside the
// data span. Nothing here is hand-shaped to suit the renderer.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adherenceTable, comparisonPairs, comparisonTables, conclusionForm,
  dailyEvidence, evidenceFigure, maturitySection, outcomesTable, periodsSection,
  planRouteSection, readinessArm, readinessSection, saveErrorBlock,
} from './follow-up.js';

/* ---------------------------------------------------------------- payloads */

// A setting arm, as `_comparison_readiness` serves it for carb ratio.
const SETTING_ARM = {
  elapsed_days: 14.663194444444445,
  contributing_dates: ['2024-06-18', '2024-06-19'],
  criterion_met: false,
  reason: 'collecting',
  available: true,
  unit: 'effective qualifying closed meal runs',
  required: 8,
  observed: 3.5,
  runs: [],
};

// The Focus override. Nine keys, and `available` and `required` are not among
// them — that absence is the contract this surface renders against.
const FOCUS_ARM = {
  unit: 'highs',
  observed: 5,
  measured: 5,
  unmeasured: 0,
  elapsed_days: 15.996527777777779,
  required_elapsed_days: 14,
  criterion_met: true,
  contributing_dates: ['2024-05-24', '2024-05-25'],
  reason: null,
};

const SETTING_COMPARISON = {
  availability: { state: 'available', reason: null },
  readiness: { before: SETTING_ARM, after: { ...SETTING_ARM, observed: 8.25 } },
  assessment: {
    state: 'unclear', mixed: false, low_exposure_worsened: true,
    reason: 'Read each outcome separately; an uncertain low-exposure worsening still limits favorable interpretation.',
  },
  limitations: ['Observed differences do not establish causation.'],
  periods: {
    before: {
      start: '2024-06-02 08:00:00', end: '2024-06-16 08:00:00',
      boundary_reasons: { start: 'previous_relevant_setting_change', end: 'setting_change' },
      semantics: '[start,end)', data_cutoff: '2024-06-30 23:55:00', source_revision: 9,
    },
    after: {
      start: '2024-06-16 08:00:00', end: '2024-06-30 08:00:00',
      boundary_reasons: { start: 'setting_change', end: 'data_tail' },
      semantics: '[start,end)', data_cutoff: '2024-06-30 23:55:00', source_revision: 9,
    },
  },
  outcomes: [
    {
      key: 'tir', label: 'Time in range', unit: '%', before: 100.0, after: 96.1,
      denominator: 'observed CGM readings in eligible windows',
      denominators: { before: 4032, after: 4032 }, difference: -3.9,
      availability: { state: 'available', reason: null },
      assessment: { state: 'unclear', reasons: [] },
    },
    {
      key: 'peak', label: 'Post-meal peak (up to 3 hours)', unit: 'mg/dL',
      before: null, after: 120.0, denominator: 'meals with readable peak',
      denominators: { before: 0, after: 16 }, difference: null,
      availability: { state: 'available', reason: null },
      assessment: { state: 'context', reasons: [] },
    },
  ],
  views: {
    before: { clock: [{ t: '00:00', n: 84, med: 120 }, { t: '00:30', n: 84, med: 118 }] },
    after: { clock: [{ t: '00:00', n: 84, med: 112 }, { t: '01:00', n: 40, med: 130 }] },
  },
};

const FOCUS_COMPARISON = {
  availability: { state: 'unavailable', reason: 'unavailable_adherence' },
  readiness: {
    before: {
      unit: 'highs', observed: 1, measured: 0, unmeasured: 1, elapsed_days: 14.0,
      required_elapsed_days: 14, criterion_met: false, contributing_dates: [],
      reason: 'insufficient_measurement',
    },
    after: FOCUS_ARM,
  },
  assessment: { state: 'concerning', mixed: false, low_exposure_worsened: false, reason: 'Read each outcome separately.' },
  adherence: {
    before: {
      lever: 'missed_meal', numerator: 0, denominator: 'highs', opportunities: 1,
      unit: 'proportion', rate: null, harm: 0, measured_opportunities: 0,
      unmeasured_opportunities: 1, harm_availability: { state: 'available', reason: null },
      informative_dates: 0, availability: { state: 'unavailable', reason: 'insufficient_measurement' },
    },
    after: {
      lever: 'missed_meal', numerator: 2, denominator: 'highs', opportunities: 5,
      unit: 'proportion', rate: 0.4, harm: 0, measured_opportunities: 5,
      unmeasured_opportunities: 0, harm_availability: { state: 'available', reason: null },
      informative_dates: 5, availability: { state: 'available', reason: null },
    },
    assessment: { state: 'unclear', unit: 'proportion', denominator: 'highs' },
  },
  outcomes: [
    {
      key: 'tir', label: 'Time in range', unit: '%', before: 100.0, after: 97.4,
      role: 'mapped_outcome', denominator: 'observed CGM readings in eligible windows',
      denominators: { before: 4008, after: 4600 }, difference: -2.6,
      availability: { state: 'available', reason: null },
      assessment: { state: 'concerning', reasons: [] },
    },
    {
      key: 'tbr', label: 'Time below range', unit: '%', before: 0.0, after: 0.0,
      role: 'context', denominator: 'observed CGM readings in eligible windows',
      denominators: { before: 4008, after: 4600 }, difference: 0.0,
      availability: { state: 'available', reason: null },
      assessment: { state: 'unclear', reasons: [] },
    },
  ],
  periods: {
    before: {
      start: '2024-05-01 00:00:00', end: '2024-05-15 00:00:00',
      boundary_reasons: { start: 'available_history', end: 'pin' },
      semantics: '[start,end)', data_cutoff: '2024-05-30 23:55:00', source_revision: 7,
    },
    after: {
      start: '2024-05-15 00:00:00', end: '2024-05-30 23:55:00',
      boundary_reasons: { start: 'pin', end: 'data_tail' },
      semantics: '[start,end)', data_cutoff: '2024-05-30 23:55:00', source_revision: 7,
    },
  },
  views: {},
};

/* ------------------------------------- the readiness contract, both arms */

test('a setting arm renders its required count, its availability and its served reason', () => {
  const html = readinessArm('after', SETTING_ARM);
  assert.match(html, /data-readiness="after"/);
  assert.match(html, /3\.5 of 8 effective qualifying closed meal runs/);
  assert.match(html, /data-required="8"/);
  assert.match(html, /data-readiness-available="true"/);
  assert.match(html, /Not met — collecting\./);
  assert.match(html, /14 days elapsed/);
});

test('the Focus arm renders no required-count meter and no availability flag', () => {
  const html = readinessArm('after', FOCUS_ARM);
  // The two fields the Focus override omits must not be manufactured here.
  assert.doesNotMatch(html, /data-required=/);
  assert.doesNotMatch(html, /data-readiness-available=/);
  assert.doesNotMatch(html, /required</);
  // What it does carry: the actual positive and measured population, and days.
  assert.match(html, /5 highs/);
  assert.match(html, /data-focus-population/);
  assert.match(html, /5 measured · 0 unmeasured/);
  assert.match(html, /15 of 14 days elapsed/);
  assert.match(html, /data-criterion-met="true"/);
});

test('the browser reads criterion_met and never evaluates the criterion itself', () => {
  // Observed is well past required, and the backend says the criterion is NOT
  // met. A surface that compared the two numbers would contradict it.
  const overshoot = { ...SETTING_ARM, observed: 40, required: 8, criterion_met: false, reason: 'unmatchable_captured_membership' };
  const html = readinessArm('after', overshoot);
  assert.match(html, /data-criterion-met="false"/);
  assert.match(html, /Not met — unmatchable_captured_membership\./);
  assert.doesNotMatch(html, /Criterion met\./);

  // And the reverse: short of the requirement, and the backend says met.
  const undershoot = { ...SETTING_ARM, observed: 1, required: 8, criterion_met: true, reason: null };
  const met = readinessArm('after', undershoot);
  assert.match(met, /data-criterion-met="true"/);
  assert.match(met, /Criterion met\./);
});

test('an unavailable setting arm prints the served reason rather than a gap', () => {
  const html = readinessArm('before', {
    ...SETTING_ARM, available: false, criterion_met: false,
    reason: 'unmatchable_captured_membership', observed: 0, contributing_dates: [],
  });
  assert.match(html, /data-readiness-available="false"/);
  assert.match(html, /unavailable: unmatchable_captured_membership/);
  assert.match(html, /No contributing date has qualified in this period yet\./);
});

test('an unavailable comparison carries no readiness, and the section says so', () => {
  const html = readinessSection({ availability: { state: 'unavailable', reason: 'data_not_yet_arrived' } }, { kind: 'focus' });
  assert.match(html, /data-availability="unavailable"/);
  assert.match(html, /data-readiness-state="unavailable"/);
  assert.match(html, /data_not_yet_arrived/);
  assert.doesNotMatch(html, /data-readiness="before"/);
});

test('the readiness section never claims a favourable ending', () => {
  const html = readinessSection(SETTING_COMPARISON, { kind: 'trial' });
  assert.match(html, /data-inference="unclear"/);
  assert.doesNotMatch(html, /Favourable/);
  assert.match(html, /A period may end without a clear answer\./);
});

test('a supporting date reaches Day through the published route, not a local one', () => {
  const html = readinessArm('after', SETTING_ARM);
  assert.match(html, /data-day-date="2024-06-18"/);
  assert.match(html, /data-day-date="2024-06-19"/);
});

test('a habit’s supporting date carries the lever its adherence names', () => {
  // The lever rides on the adherence rows, not on the comparison — reading it
  // off the comparison silently dropped it.
  const html = readinessSection(FOCUS_COMPARISON, { kind: 'focus' });
  assert.match(html, /data-day-date="2024-05-24" data-day-lever="missed_meal"/);
  // A setting arm has no lever to carry, and does not invent one.
  assert.doesNotMatch(readinessSection(SETTING_COMPARISON, { kind: 'trial' }), /data-day-lever/);
});

/* -------------------------------------------- adherence beside outcomes */

test('the Focus renders adherence as its own table, ahead of the mapped outcomes', () => {
  const html = comparisonTables(FOCUS_COMPARISON, 'focus');
  const adherenceAt = html.indexOf('data-table="adherence"');
  const outcomesAt = html.indexOf('data-table="outcomes"');
  assert.ok(adherenceAt >= 0 && outcomesAt >= 0);
  assert.ok(adherenceAt < outcomesAt, 'the intended behavior leads, not glucose');
});

test('zero opportunities, an absent measurement and a measured rate stay distinct', () => {
  const zero = adherenceTable({
    adherence: {
      before: { lever: 'missed_meal', opportunities: 0, denominator: 'highs', rate: null, harm: 0, harm_availability: { state: 'available' }, availability: { state: 'unavailable', reason: 'zero_opportunities' } },
      after: FOCUS_COMPARISON.adherence.after,
      assessment: { state: 'unclear' },
    },
  });
  assert.match(zero, /data-adherence-state="zero-opportunities"/);
  assert.match(zero, /no highs/);

  const partial = adherenceTable(FOCUS_COMPARISON);
  assert.match(partial, /data-adherence-state="unavailable"/);
  assert.match(partial, /insufficient_measurement · 0 of 1 measured/);
  assert.match(partial, /data-adherence-state="available"/);
  assert.match(partial, /2 of 5/);
  // A missing measurement is never rendered as an observed zero.
  assert.doesNotMatch(partial, /data-adherence-state="unavailable">0 of 1/);
});

test('harm availability is read separately from the behavior', () => {
  const html = adherenceTable({
    adherence: {
      before: { ...FOCUS_COMPARISON.adherence.before, harm_availability: { state: 'unavailable', reason: 'partial_tail' } },
      after: FOCUS_COMPARISON.adherence.after,
      assessment: { state: 'unclear' },
    },
  });
  assert.match(html, /data-harm-state="unavailable"/);
  assert.match(html, /partial_tail/);
  assert.match(html, /data-harm-state="available"/);
});

test('a mapped outcome leads the outcome table and context rows are marked', () => {
  const html = outcomesTable(FOCUS_COMPARISON, 'focus');
  assert.match(html, /data-role="mapped_outcome"/);
  assert.match(html, /data-role="context"/);
  assert.ok(html.indexOf('data-outcome="tir"') < html.indexOf('data-outcome="tbr"'));
});

test('a null outcome against a zero denominator is not an unavailable measurement', () => {
  const html = outcomesTable(SETTING_COMPARISON, 'trial');
  // The prototype's own wording: an absent population says so in its own terms,
  // and only a population that exists but could not be read is "unavailable".
  assert.match(html, /no meals<small>no meals in period<\/small>/);
  assert.doesNotMatch(html, /no meals<small>no meals in period<\/small><\/td><td class="v">unavailable<small>no meals/);
  // A setting change reads Before against Trial, as the reader calls it.
  assert.match(html, /<th scope="col">Before<\/th><th scope="col">Trial<\/th>/);
});

test('a habit’s second table is its Glucose outcomes, beside its behavior', () => {
  const html = outcomesTable(FOCUS_COMPARISON, 'focus');
  assert.match(html, /<th scope="col">Glucose outcomes<\/th><th scope="col">Before<\/th><th scope="col">After<\/th>/);
});

/* ------------------------------------------------ maturity, kept separate */

test('watch maturity is labelled lifecycle metadata and its bar never overfills', () => {
  const html = maturitySection({
    maturing: { days_elapsed: 15, days_required: 14, gap_count: 1 },
    readiness: { label: 'Ready to judge', message: 'This Trial is ready for a before-and-Trial read.' },
  });
  assert.match(html, /Watch maturity <span class="meta">lifecycle<\/span>/);
  assert.match(html, /15 days<small>14 required · 1 data gap<\/small>/);
  assert.doesNotMatch(html, /15 of 14 days/);
  assert.match(html, /<progress value="14" max="14"/);
  assert.match(html, /It is not the evidence criterion/);
});

test('a maturing watch reads against what it still needs', () => {
  const html = maturitySection({
    maturing: { days_elapsed: 6, days_required: 14, gap_count: 2 },
    readiness: { label: 'Maturing', message: 'Still collecting.' },
  });
  assert.match(html, /6 of 14 days<small>2 data gaps<\/small>/);
  assert.match(html, /<progress value="6" max="14"/);
});

/* -------------------------------------------- the Available-days read */

const DAY_ROWS = {
  before_period: [
    { date: '2024-06-01', n_readings: 288, meals: 1, tir: 97.2, tbr: 0.0 },
    { date: '2024-06-02', n_readings: 96, meals: 0, tir: 91.7, tbr: 0.0 },
  ],
  trial_period: [
    { date: '2024-06-06', n_readings: 288, meals: 2, tir: 96.1, tbr: 0.7 },
  ],
};

test('one served day reads its own numbers, and is not claimed as a complete day', () => {
  const html = dailyEvidence({ day_rows: DAY_ROWS }, { period: 'trial_period', day: 0 });
  assert.match(html, /data-select="evidence-period"/);
  assert.match(html, /data-select="evidence-day"/);
  assert.match(html, /<option value="before_period">Before<\/option>/);
  assert.match(html, /<option value="trial_period" selected>Trial<\/option>/);
  assert.match(html, /288 glucose readings/);
  assert.match(html, /96\.1%/);
  assert.match(html, /is not necessarily a complete day of data/);
  assert.match(html, /maturity stays unchanged/);
});

test('the day select is clamped to the period’s own served rows', () => {
  const html = dailyEvidence({ day_rows: DAY_ROWS }, { period: 'trial_period', day: 9 });
  // One row served, so the ninth cannot be selected into nothing.
  assert.match(html, /<option value="0" selected>/);
  assert.doesNotMatch(html, /<option value="1"/);
});

test('a day with readings and no meals says so rather than showing a zero rate', () => {
  const html = dailyEvidence({ day_rows: DAY_ROWS }, { period: 'before_period', day: 1 });
  assert.match(html, /96 glucose readings/);
  assert.match(html, /<td>Meals<\/td><td class="v">0<\/td>/);
});

test('a period with no served day says that instead of an empty select', () => {
  const html = dailyEvidence({ day_rows: { before_period: [], trial_period: [] } }, { period: 'before_period', day: 0 });
  assert.match(html, /No day was recorded in this period/);
  assert.doesNotMatch(html, /data-select="evidence-day"/);
});

/* -------------------------------------------------- periods and the figure */

test('the periods section names each boundary the backend chose', () => {
  const html = periodsSection(SETTING_COMPARISON);
  assert.match(html, /data-period="before"/);
  assert.match(html, /previous_relevant_setting_change → setting_change/);
  assert.match(html, /setting_change → data_tail/);
});

test('the figure pairs only the clock bins both periods served', () => {
  const bound = comparisonPairs(SETTING_COMPARISON);
  assert.equal(bound.paired.length, 1);
  assert.deepEqual(bound.paired[0], { t: 0, b: 120, v: 112, d: -8 });
  assert.match(bound.beforeLabel, /^Before · /);
  assert.match(bound.afterLabel, /^After · /);
});

test('a period with no readings pairs nothing and keeps its Before figure', () => {
  const bound = comparisonPairs({
    ...SETTING_COMPARISON,
    views: { before: SETTING_COMPARISON.views.before, after: { clock: [] } },
  });
  assert.equal(bound.paired.length, 0);
  assert.equal(bound.before.length, 2);
});

test('a comparison with no envelope at all says so, rather than reporting no readings', () => {
  // A saved ending retains the rows and the assessment, not the curve, so the
  // figure must not claim the later period had nothing in it.
  const retained = evidenceFigure({ ...SETTING_COMPARISON, views: {} }, 'trial');
  assert.match(retained, /no clock envelope is retained for this record/);
  const beforeOnly = evidenceFigure({
    ...SETTING_COMPARISON,
    views: { before: SETTING_COMPARISON.views.before, after: { clock: [] } },
  }, 'trial');
  assert.match(beforeOnly, /no Trial readings to compare yet/);
  assert.match(evidenceFigure(SETTING_COMPARISON, 'trial'), /Trial above Before/);
  assert.match(evidenceFigure(FOCUS_COMPARISON, 'focus'), /data-focus-chart/);
  assert.match(evidenceFigure(SETTING_COMPARISON, 'trial'), /data-trial-chart/);
});

/* ------------------------------------------------------- the conclusion */

test('the conclusion is required and nothing is put in the wearer’s mouth', () => {
  const blank = conclusionForm({ conclusion: '' }, { label: 'Record conclusion & finish', note: 'Nothing here is sent to your pump.' });
  assert.match(blank, /<textarea id="conclusion" required aria-required="true"><\/textarea>/);
  assert.match(blank, /type="submit" disabled/);
  const written = conclusionForm({ conclusion: 'It held overnight.' }, { label: 'Record conclusion & finish', note: 'x' });
  assert.match(written, />It held overnight\.<\/textarea>/);
  assert.doesNotMatch(written, /type="submit" disabled/);
});

test('a failed write keeps the wearer’s words and offers a Retry, recording nothing', () => {
  const html = saveErrorBlock({
    conclusion: 'It held overnight.',
    failure: { operation: 'finish', headline: 'Recording the conclusion failed', message: 'stale_input_revision (409)' },
  });
  assert.match(html, /role="alert"/);
  assert.match(html, /Recording the conclusion failed: stale_input_revision \(409\)/);
  assert.match(html, /Nothing was recorded\. Your conclusion is still here\./);
  assert.match(html, /data-retry-save="finish"/);
  assert.doesNotMatch(html, /Retry" disabled/);
});

test('a Retry stays refused while the conclusion is blank', () => {
  const html = saveErrorBlock({
    conclusion: '   ',
    failure: { operation: 'resolve', headline: 'Ending the Focus failed', message: 'no response from the store' },
  });
  assert.match(html, /data-retry-save="resolve" disabled/);
});

/* ------------------------------------------------------ the empty Changes */

test('Revert-to-Plan renders the backend-supplied route and implies no pump write', () => {
  const html = planRouteSection({
    plan_route: {
      mode: 'manual-review', label: 'Review this change in Plan',
      message: 'This Trial does not have one prior setting that can be staged.',
    },
  }, { canOpen: false });
  assert.match(html, /data-plan-route="manual-review"/);
  assert.match(html, /Review this change in Plan/);
  // With no Plan composed there is no control that would do nothing.
  assert.doesNotMatch(html, /data-action="plan-route"/);
  const composed = planRouteSection({ plan_route: { mode: 'stageable', label: 'Revert in Plan', message: 'x' } }, { canOpen: true });
  assert.match(composed, /data-action="plan-route"/);
});


test('Pattern readiness preserves the served opportunity verdict even above its gate', () => {
  const html = readinessArm('after', { count: 17, gate: 12, observed: 17, required: 12,
    unit: 'meals', verdict: 'withheld', criterion_met: false, reason: 'served hold',
    measured: 4, unmeasured: 2, required_elapsed_days: null, elapsed_days: 4,
    contributing_dates: ['2024-05-05'] });
  assert.match(html, /17 of 12 meals/);
  assert.match(html, /data-opportunity-verdict="withheld"/);
  assert.match(html, /served hold/);
  assert.doesNotMatch(html, /of .* days elapsed/);
  assert.doesNotMatch(html, /data-focus-population/);
});

test('the produced basal setting arm keeps its count requirement when it also carries an elapsed requirement', () => {
  // comparison_evidence(parameter='basal') uses the coverage-qualified setting
  // arm, also produced for target_bg/profile; basal_rate has its own night arm.
  const html = readinessArm('after', {
    elapsed_days: 32, contributing_dates: [], criterion_met: false,
    reason: 'collecting', available: true, unit: 'coverage-qualified informative dates',
    required: 30, required_elapsed_days: 30, observed: 0,
  });
  assert.match(html, /0 of 30 coverage-qualified informative dates/);
  assert.match(html, /data-required="30"/);
  assert.match(html, /32 days elapsed of 30 required/);
  assert.match(html, /data-readiness-available="true"/);
  assert.match(html, /data-criterion-met="false"/);
  assert.doesNotMatch(html, /data-focus-population|— measured|— unmeasured/);
});

test('a Pattern arm without a required alias shows its opportunity gate without a fabricated requirement', () => {
  const html = readinessArm('before', {
    count: 17, gate: 12, observed: 17, unit: 'meals', verdict: 'withheld',
    criterion_met: false, reason: 'served hold', measured: 4, unmeasured: 2,
    required_elapsed_days: null, elapsed_days: 4, contributing_dates: [],
  });
  assert.match(html, /17 of 12 meals/);
  assert.match(html, /data-opportunity-verdict="withheld"/);
  assert.match(html, /data-criterion-met="false"/);
  assert.doesNotMatch(html, /data-required|data-focus-population|of .* days elapsed/);
});
