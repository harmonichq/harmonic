import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  assertMatchingFindingCasePreparation,
  validFindingCaseFile,
} from './finding-case-file-validation.js';
import { projectFindings } from '../mockups/findings-projection.mirror.mjs';
import { projectPatternCaseFile } from '../mockups/diagnose-event-comparison.synthetic/project.mjs';

const capture = JSON.parse(await readFile(new URL(
  '../mockups/diagnose-workstation.synthetic/finding-case-files.json', import.meta.url,
)));
const projectionFixture = JSON.parse(await readFile(new URL(
  './__fixtures__/findings-projection.json', import.meta.url,
)));
const patternCapture = JSON.parse(await readFile(new URL(
  '../mockups/diagnose-event-comparison.synthetic/capture.json', import.meta.url,
)));
const missedMealFixture = JSON.parse(await readFile(new URL(
  './__fixtures__/missed-meal-comparison.json', import.meta.url,
)));

const independent = (value) => JSON.parse(JSON.stringify(value));
const eventCase = () => independent(capture.cases['finding:meal_over_delivery'].event);
const missedMealCase = () => independent(capture.cases['finding:missed_meal'].event);
const mealBolusShortCase = () => independent(capture.cases['finding:meal_bolus_short'].event);
const zeroMissedMealCase = () => independent(missedMealFixture.zero_payload);
const selectedEventCase = () => independent(
  Object.values(capture.cases['finding:over_treated_low'].selected_event)[0]);
const patternChart = (key) => ({ key, window: {
  scoped: false, start_min: null, end_min: null, label: null,
} });

test('accepts the generator-owned Pattern case file and its additive member tags', () => {
  const caseFile = projectPatternCaseFile(patternCapture, {
    patternChart: patternChart('highs_after_meals'),
  });
  assert.equal(validFindingCaseFile(caseFile), true);
  assert.ok(caseFile.occurrences.some((row) => row.member.startsWith('habit:')));
  assert.ok(caseFile.occurrences.some((row) => row.member === 'clean'));
});

test('rejects a Pattern case file with a browser-invented member subject', () => {
  const caseFile = projectPatternCaseFile(patternCapture, {
    patternChart: patternChart('highs_after_meals'),
  });
  caseFile.occurrences[0].member = 'setting:carb_ratio';
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects a Pattern case file without its canonical subject', () => {
  const caseFile = projectPatternCaseFile(patternCapture, {
    patternChart: patternChart('highs_after_meals'),
  });
  delete caseFile.finding.subject;
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('accepts a preparation carrying the current v2 findings projection', () => {
  const preparation = independent(missedMealFixture.preparation);
  preparation.findings = projectFindings(projectionFixture.inputs);
  assert.equal(preparation.findings.schema, 'diagnose-findings-v2');
  assert.equal(
    assertMatchingFindingCasePreparation(preparation, null),
    preparation,
  );
});

test('accepts a wrapped chartless Pattern without a case header', () => {
  const preparation = independent(missedMealFixture.preparation);
  const pattern = {
    id: 'pattern:lows_after_correcting_highs', register: 'finding', kind: 'pattern',
    pattern_chart: null, case_header: undefined,
  };
  preparation.rendered_rows.push(pattern);
  preparation.findings.rows.push(independent(pattern));

  assert.equal(assertMatchingFindingCasePreparation(preparation, null), preparation);
});

test('accepts the generator-owned missed-meal preparation coordinate', () => {
  const preparation = independent(missedMealFixture.preparation);
  const header = preparation.behavioral_case_headers['finding:missed_meal'];
  assert.deepEqual(header.event_chart, {
    lever: header.lever,
    window: preparation.coordinates.window,
  });
  assert.equal(assertMatchingFindingCasePreparation(preparation, null), preparation);
});

test('rejects a preparation whose rendered case header diverges from its header map', () => {
  const preparation = independent(capture.preparation);
  preparation.rendered_rows[0].case_header.summary.claimed += 1;
  assert.throws(
    () => assertMatchingFindingCasePreparation(preparation, null),
    (error) => error.detail?.code === 'inconsistent_projection',
  );
});

test('accepts matching headers independent of JSON object key order', () => {
  const preparation = independent(missedMealFixture.preparation);
  const [id, header] = Object.entries(preparation.behavioral_case_headers)[0];
  preparation.behavioral_case_headers[id] = Object.fromEntries(
    Object.entries(header).reverse(),
  );
  assert.equal(
    assertMatchingFindingCasePreparation(preparation, null),
    preparation,
  );
});

test('rejects a header that has no rendered Finding', () => {
  const preparation = independent(missedMealFixture.preparation);
  preparation.behavioral_case_headers['finding:not-rendered'] = {
    ...independent(Object.values(preparation.behavioral_case_headers)[0]),
    finding_id: 'finding:not-rendered',
  };
  assert.throws(
    () => assertMatchingFindingCasePreparation(preparation, null),
    (error) => error.detail?.code === 'inconsistent_projection',
  );
});

test('rejects a rendered coordinate that diverges from the server case header', () => {
  const preparation = independent(missedMealFixture.preparation);
  preparation.rendered_rows[0].event_chart.lever = 'late_bolus';
  assert.throws(
    () => assertMatchingFindingCasePreparation(preparation, null),
    (error) => error.detail?.code === 'inconsistent_projection',
  );
});

test('rejects a rendered coordinate whose label diverges from the server case header', () => {
  const preparation = independent(missedMealFixture.preparation);
  preparation.rendered_rows[0].event_chart.window.label = 'forged';
  assert.throws(
    () => assertMatchingFindingCasePreparation(preparation, null),
    (error) => error.detail?.code === 'inconsistent_projection',
  );
});

test('rejects a malformed server case-header coordinate without throwing TypeError', () => {
  const preparation = independent(missedMealFixture.preparation);
  delete preparation.rendered_rows[0].case_header.event_chart;
  assert.throws(
    () => assertMatchingFindingCasePreparation(preparation, null),
    (error) => error.detail?.code === 'inconsistent_projection',
  );
});

test('rejects a preparation projected for a different requested window', () => {
  const preparation = independent(missedMealFixture.preparation);
  assert.throws(
    () => assertMatchingFindingCasePreparation(preparation, { start_min: 0, end_min: 360 }),
    (error) => error.detail?.code === 'inconsistent_projection',
  );
});

test('accepts the current valid event case-file cohort partition', () => {
  assert.equal(validFindingCaseFile(eventCase()), true);
});

test('accepts the policy-owned meal identity for Meal bolus fell short', () => {
  const caseFile = mealBolusShortCase();
  assert.ok(caseFile.occurrences.every((row) => /^m_[0-9a-f]{32}$/.test(row.id)));
  assert.equal(validFindingCaseFile(caseFile), true);
});

test('rejects a cross-population identity for Meal bolus fell short', () => {
  const caseFile = mealBolusShortCase();
  assert.equal(caseFile.cross_population, false);
  assert.equal(caseFile.population, 'meals');
  caseFile.projection.cohorts[2].occurrence_ids[0] = 'm_ffffffffffffffffffffffffffffffff';
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects an event case without the three exact ADR 180 cohorts', () => {
  const caseFile = eventCase();
  caseFile.projection.cohorts[2].key = 'not_a_cohort';
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects a cohort occurrence outside the canonical response roster', () => {
  const caseFile = eventCase();
  const cohort = caseFile.projection.cohorts[0];
  cohort.occurrence_ids[0] = 'o_ffffffffffffffffffffffffffffffff';
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects duplicated cohort membership even when each cohort count still matches', () => {
  const caseFile = eventCase();
  const matched = caseFile.projection.cohorts.find((cohort) => cohort.key === 'matched');
  const comparison = caseFile.projection.cohorts.find((cohort) => cohort.key === 'comparison');
  comparison.occurrence_ids[0] = matched.occurrence_ids[0];
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects a nearly-matched cohort whose member is not nearly matched', () => {
  const caseFile = eventCase();
  const matched = caseFile.projection.cohorts.find((cohort) => cohort.key === 'matched');
  const near = caseFile.projection.cohorts.find((cohort) => cohort.key === 'nearly_matched');
  near.occurrence_ids[0] = matched.occurrence_ids[0];
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects routed-count and denominator equations that do not reconcile', () => {
  const caseFile = eventCase();
  caseFile.projection.cohorts[0].routed_count += 1;
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('accepts the served count outside the comparison on both comparison kinds', () => {
  const same = eventCase();
  assert.equal(same.cross_population, false);
  assert.equal(same.projection.counts.outside_comparison, 0);
  assert.equal(validFindingCaseFile(same), true);
  const cross = missedMealCase();
  const { counts } = cross.projection;
  assert.equal(cross.cross_population, true);
  assert.ok(counts.outside_comparison > 0);
  assert.equal(counts.matched + counts.nearly_matched + counts.outside_comparison,
    cross.summary.denominator);
  assert.equal(validFindingCaseFile(cross), true);
});

test('rejects a case file that still serves the retired leftover key', () => {
  const caseFile = eventCase();
  caseFile.projection.counts.not_comparable = caseFile.projection.counts.outside_comparison;
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects a case file that serves no count outside the comparison', () => {
  const caseFile = eventCase();
  delete caseFile.projection.counts.outside_comparison;
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects an outside count that repeats the comparison cohort', () => {
  const caseFile = eventCase();
  const { counts } = caseFile.projection;
  assert.ok(counts.comparison > 0);
  counts.outside_comparison = counts.comparison;
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects a cross-population outside count that does not reconcile', () => {
  const caseFile = missedMealCase();
  caseFile.projection.counts.outside_comparison += 1;
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('accepts cohorts naming exactly the band state they hold', () => {
  assert.deepEqual(eventCase().projection.cohorts.map((cohort) => cohort.band_verdict),
    ['fired', 'near_miss', null]);
  assert.deepEqual(missedMealCase().projection.cohorts.map((cohort) => cohort.band_verdict),
    [null, 'near_miss', null]);
});

test('rejects a cohort band state its members do not hold', () => {
  const caseFile = eventCase();
  const near = caseFile.projection.cohorts[1];
  // The count alone would agree: only the members' own verdicts refuse it.
  assert.equal(caseFile.verdict_counts.clean, near.routed_count);
  near.band_verdict = 'clean';
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects a cohort band state whose count is not the band count', () => {
  const caseFile = eventCase();
  const other = Object.keys(caseFile.verdict_counts)
    .find((key) => key !== 'fired' && caseFile.verdict_counts[key] > 0);
  caseFile.verdict_counts.fired += 1;
  caseFile.verdict_counts[other] -= 1;
  assert.equal(validFindingCaseFile(caseFile), false);
  // Missed meal's Matched cohort is the attributed subset of Meets criteria, so
  // naming the whole band on it is rejected.
  const missed = missedMealCase();
  assert.ok(missed.projection.counts.matched < missed.verdict_counts.fired);
  missed.projection.cohorts[0].band_verdict = 'fired';
  assert.equal(validFindingCaseFile(missed), false);
});

test('rejects a cohort with no served band state or an unknown one', () => {
  const missing = eventCase();
  delete missing.projection.cohorts[1].band_verdict;
  assert.equal(validFindingCaseFile(missing), false);
  const unknown = eventCase();
  unknown.projection.cohorts[0].band_verdict = 'meets_criteria';
  assert.equal(validFindingCaseFile(unknown), false);
});

/* #468 — every cohort serves the band states it holds (ADR 468 decision 4). */
const BAND_ORDER = ['fired', 'near_miss', 'clean', 'outranked', 'no_data'];

test('#468 · accepts the band states served on both comparison kinds', () => {
  const same = eventCase();
  const roster = new Map(same.occurrences.map((row) => [row.id, row.verdict]));
  const [, , comparison] = same.projection.cohorts;
  const held = new Set(comparison.occurrence_ids.map((id) => roster.get(id)));
  assert.deepEqual(same.projection.cohorts.map((cohort) => cohort.band_states),
    [['fired'], ['near_miss'], BAND_ORDER.filter((state) => held.has(state))]);
  assert.ok(comparison.band_states.length > 1, 'premise: the comparison holds several states');
  assert.equal(validFindingCaseFile(same), true);
  const cross = missedMealCase();
  assert.deepEqual(cross.projection.cohorts.map((cohort) => cohort.band_states),
    [[], ['near_miss'], []]);
  assert.equal(validFindingCaseFile(cross), true);
});

test('#468 · rejects a cohort that serves no band states', () => {
  for (const index of [0, 1, 2]) {
    const caseFile = eventCase();
    delete caseFile.projection.cohorts[index].band_states;
    assert.equal(validFindingCaseFile(caseFile), false, `cohort ${index}`);
  }
});

test('#468 · rejects a cohort naming a band state that serves anything but it', () => {
  const extra = eventCase();
  extra.projection.cohorts[1].band_states = ['near_miss', 'clean'];
  assert.equal(validFindingCaseFile(extra), false);
  const empty = eventCase();
  empty.projection.cohorts[0].band_states = [];
  assert.equal(validFindingCaseFile(empty), false);
  const other = eventCase();
  other.projection.cohorts[0].band_states = ['near_miss'];
  assert.equal(validFindingCaseFile(other), false);
});

test('#468 · rejects a same-population comparison whose states are not its members\' verdicts in band order', () => {
  const omitted = eventCase();
  omitted.projection.cohorts[2].band_states.pop();
  assert.equal(validFindingCaseFile(omitted), false);
  const invented = independent(capture.cases['finding:meal_bolus_short'].event);
  assert.equal(invented.verdict_counts.clean, 0, 'premise: no member is clean');
  invented.projection.cohorts[2].band_states = ['clean', ...invented.projection.cohorts[2].band_states];
  assert.equal(validFindingCaseFile(invented), false);
  const reordered = eventCase();
  reordered.projection.cohorts[2].band_states.reverse();
  assert.equal(validFindingCaseFile(reordered), false);
});

test('#468 · rejects a cross-population comparison that serves a band state', () => {
  const caseFile = missedMealCase();
  caseFile.projection.cohorts[2].band_states = ['clean'];
  assert.equal(validFindingCaseFile(caseFile), false);
  const matched = missedMealCase();
  matched.projection.cohorts[0].band_states = ['fired'];
  assert.equal(validFindingCaseFile(matched), false);
});

test('accepts the three-cohort fixed-axis missed-meal comparison', () => {
  const caseFile = missedMealCase();
  assert.deepEqual(caseFile.projection.cohorts.map((cohort) => cohort.key),
    ['matched', 'nearly_matched', 'comparison']);
  assert.equal(validFindingCaseFile(caseFile), true);
});

test('accepts structurally valid server-owned support classifications', () => {
  const caseFile = missedMealCase();
  const missed = caseFile.projection.cohorts[0];
  const point = missed.points.find((candidate) => candidate.n === 1);
  missed.support = 'supported';
  point.support = 'limited';
  point.p25 = 119;
  point.median = 120;
  point.p75 = 121;
  assert.equal(validFindingCaseFile(caseFile), true);
});

test('rejects drawable aggregates on a zero-sample point in a nonzero cohort', () => {
  const caseFile = missedMealCase();
  const missed = caseFile.projection.cohorts[0];
  const point = missed.points.find((candidate) => candidate.n === 0);
  assert.ok(point, 'the generated nonzero cohort includes an unsampled axis point');
  point.support = 'limited';
  point.p25 = 119;
  point.median = 120;
  point.p75 = 121;
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects support values outside the server contract enum', () => {
  const cohortCase = missedMealCase();
  cohortCase.projection.cohorts[0].support = 'plausible';
  assert.equal(validFindingCaseFile(cohortCase), false);
  const pointCase = missedMealCase();
  pointCase.projection.cohorts[0].points[0].support = 'plausible';
  assert.equal(validFindingCaseFile(pointCase), false);
});

test('rejects missed-meal aggregate points that exceed their usable cohort', () => {
  const caseFile = missedMealCase();
  caseFile.projection.cohorts[0].usable_count = 0;
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects a declared zero missed cohort that retains drawable aggregate points', () => {
  const caseFile = missedMealCase();
  const missed = caseFile.projection.cohorts[0];
  for (const row of caseFile.occurrences) {
    row.attributed = false;
    row.comparison_anchor = null;
  }
  caseFile.summary.claimed = 0;
  missed.occurrence_ids = [];
  missed.routed_count = 0;
  missed.usable_count = 0;
  caseFile.projection.counts.matched = 0;
  caseFile.projection.counts.outside_comparison = caseFile.summary.denominator;
  assert.equal(caseFile.projection.cohorts[0].usable_count, 0);
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('accepts the exact generator-authored zero-attribution response', () => {
  const caseFile = zeroMissedMealCase();
  const missed = caseFile.projection.cohorts[0];
  assert.equal(missed.routed_count, 0);
  assert.equal(missed.usable_count, 0);
  assert.ok(missed.points.every((point) => point.n === 0
    && point.support === 'withheld'
    && point.median === null && point.p25 === null && point.p75 === null));
  assert.equal(validFindingCaseFile(caseFile), true);
  missed.episodes = [{}];
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects a missed-meal comparison with a widened or roster-mismatched axis', () => {
  const caseFile = missedMealCase();
  caseFile.projection.cohorts[0].points.pop();
  assert.equal(validFindingCaseFile(caseFile), false);
  const mismatched = missedMealCase();
  mismatched.projection.cohorts[0].occurrence_ids.pop();
  mismatched.projection.cohorts[0].routed_count -= 1;
  mismatched.projection.counts.matched -= 1;
  mismatched.projection.counts.outside_comparison += 1;
  assert.equal(validFindingCaseFile(mismatched), false);
});

test('rejects a missed-meal comparison with a malformed cohort anchor', () => {
  const caseFile = missedMealCase();
  caseFile.projection.cohorts[0].anchor.label = 7;
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects a forged selected announced-meal detail', () => {
  const selected = independent(missedMealFixture.selected_announced);
  selected.selection.detail.verdict = 'fired';
  assert.equal(validFindingCaseFile(selected), false);
});

test('rejects replacing an attributed missed winner with another fired High', () => {
  const caseFile = missedMealCase();
  const attributed = caseFile.occurrences.find((row) => row.attributed);
  const replacement = caseFile.occurrences.find((row) => row.id
    !== attributed.id && row.verdict === 'fired');
  if (!replacement) return;
  caseFile.projection.cohorts[0].occurrence_ids[0] = replacement.id;
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects synchronized fabricated missed-meal identities', () => {
  const caseFile = missedMealCase();
  const fabricated = 'o_ffffffffffffffffffffffffffffffff';
  caseFile.projection.cohorts[0].occurrence_ids[0] = fabricated;
  caseFile.projection.attributed_occurrence_ids = [fabricated];
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects retired High-peak selected detail for a missed meal', () => {
  const caseFile = independent(missedMealFixture.selected_missed);
  const rosterRow = caseFile.occurrences.find(
    (row) => row.id === caseFile.selection.requested_id,
  );
  caseFile.selection.detail.anchor = independent(rosterRow.anchor);
  caseFile.selection.detail.date = rosterRow.date;
  caseFile.selection.detail.day_target.date = rosterRow.date;
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects missed-meal selected traces outside the fixed comparison window', () => {
  const caseFile = independent(missedMealFixture.selected_missed);
  caseFile.selection.detail.glucose.push({
    t: '2026-01-03 05:45:00', minute: -61, bg: 109,
  });
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('fails closed when selected missed-meal marker families are malformed', () => {
  const caseFile = independent(missedMealFixture.selected_missed);
  delete caseFile.selection.detail.markers;
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects an event-aligned selection that names no comparison cohort', () => {
  const caseFile = selectedEventCase();
  assert.equal(validFindingCaseFile(caseFile), true);
  delete caseFile.selection.detail.comparison_cohort;
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects an event-aligned selection naming a cohort it was not routed into', () => {
  const caseFile = selectedEventCase();
  const { detail } = caseFile.selection;
  detail.comparison_cohort = caseFile.projection.cohorts
    .find((cohort) => !cohort.occurrence_ids.includes(detail.id)).key;
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('accepts event-to-clock transition with an unavailable announced selection', () => {
  const caseFile = independent(missedMealFixture.clock_after_announced);
  assert.equal(caseFile.selection.state, 'unavailable');
  assert.equal(validFindingCaseFile(caseFile), true);
});

test('#432 · accepts the served anchor dose, carbs, outcome and reason as generated', () => {
  const selected = selectedEventCase();
  assert.equal(validFindingCaseFile(selected), true);
  assert.ok(selected.selection.detail.reason.habits.length);
  const meals = eventCase();
  assert.ok(meals.occurrences.some((row) => row.outcome?.kind === 'nadir'));
  assert.equal(validFindingCaseFile(meals), true);
});

test('#432 · refuses an anchor missing or malforming its dose or carbs', () => {
  for (const [key, value] of [['insulin', undefined], ['carbs', undefined], ['insulin', '4'], ['carbs', {}]]) {
    const row = eventCase();
    if (value === undefined) delete row.occurrences[0].anchor[key];
    else row.occurrences[0].anchor[key] = value;
    assert.equal(validFindingCaseFile(row), false, `roster anchor ${key}=${String(value)}`);
    const detail = selectedEventCase();
    if (value === undefined) delete detail.selection.detail.anchor[key];
    else detail.selection.detail.anchor[key] = value;
    assert.equal(validFindingCaseFile(detail), false, `detail anchor ${key}=${String(value)}`);
  }
  const missed = missedMealCase();
  const attributed = missed.occurrences.find((row) => row.attributed);
  delete attributed.comparison_anchor.carbs;
  assert.equal(validFindingCaseFile(missed), false, 'rise-onset comparison anchor without carbs');
});

test('#432 · refuses a roster row or selected detail without a well-formed outcome', () => {
  const mealRow = (caseFile) => caseFile.occurrences.find((row) => row.outcome);
  for (const outcome of [undefined, { kind: 'max', bg: 120, t: '2020-03-01 11:00:00', minute: 180 },
    { kind: 'peak', bg: '120', t: '2020-03-01 11:00:00', minute: 180 },
    { kind: 'nadir', bg: 120, t: null, minute: 180 }]) {
    const caseFile = eventCase();
    if (outcome === undefined) delete mealRow(caseFile).outcome;
    else mealRow(caseFile).outcome = outcome;
    assert.equal(validFindingCaseFile(caseFile), false, JSON.stringify(outcome ?? 'absent'));
  }
  const detail = selectedEventCase();
  delete detail.selection.detail.outcome;
  assert.equal(validFindingCaseFile(detail), false, 'selected detail without outcome');
});

test('#432 · refuses a selected detail without a well-formed served reason', () => {
  const broken = [
    (reason) => { delete reason.habits; },
    (reason) => { reason.cause = { lever: 'over_treated_low', title: 'Over-treated low' }; },
    (reason) => { reason.habits[0].verdict = 'matched'; },
    (reason) => { reason.habits[0].detail = 7; },
    (reason) => { delete reason.habits[0].title; },
  ];
  for (const breakReason of broken) {
    const caseFile = selectedEventCase();
    breakReason(caseFile.selection.detail.reason);
    assert.equal(validFindingCaseFile(caseFile), false, breakReason.toString());
  }
  const absent = selectedEventCase();
  delete absent.selection.detail.reason;
  assert.equal(validFindingCaseFile(absent), false, 'selected detail without reason');
});
