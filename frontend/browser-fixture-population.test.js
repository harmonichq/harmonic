import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildCapture } from '../mockups/diagnose-event-comparison.synthetic/generate.mjs';
import {
  patternVerdict,
  projectPatternCaseFile,
} from '../mockups/diagnose-event-comparison.synthetic/project.mjs';
import { projectFindings } from '../mockups/findings-projection.mirror.mjs';
import {
  populateFindingCasePreparation,
  populateFindingsProjectionInput,
} from './browser-fixture-population.js';
import {
  assertMatchingFindingCasePreparation,
  validFindingCaseFile,
} from './finding-case-file-validation.js';
import { queueMeta, queueRows } from './diagnose-findings-queue.js';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const normalizeOpaqueIds = (value) => JSON.parse(
  JSON.stringify(value).replace(/o_[0-9a-f]{32}/g, 'o_<opaque>'),
);
const payload = JSON.parse(readFileSync(
  here('../mockups/diagnose-workstation.synthetic/payload.json'), 'utf8'));
const capture = JSON.parse(readFileSync(
  here('../mockups/diagnose-event-comparison.synthetic/capture.json'), 'utf8'));
const caseFiles = JSON.parse(readFileSync(
  here('../mockups/diagnose-workstation.synthetic/finding-case-files.json'), 'utf8'));
const findingsFixture = JSON.parse(readFileSync(
  here('./__fixtures__/findings-projection.json'), 'utf8'));

const join = (row) => `${row.ep_id}|${row.t || row.anchor_t}`;
const families = ['meals', 'lows'];

test('browser fixtures retain the canonical nested workstation exposure object', () => {
  const workstationCapture = JSON.parse(readFileSync(
    here('../mockups/diagnose-workstation.synthetic/explore-exposures.capture.json'), 'utf8'));
  assert.deepEqual(payload.exposures, {
    window: workstationCapture.window,
    exposures: workstationCapture.exposures,
  });
});

test('browser fixtures publish the exact same source window for case-file preparation', () => {
  assert.deepEqual(capture.source_window, payload.exposures.window,
    'event capture source window must exactly equal the workstation window');
  assert.equal(capture.schema, 'finding-case-file-event-capture-v1');
});

test('browser fixtures preserve both twenty-row populations, their joins, and their dates', () => {
  const { start, end } = payload.exposures.window;
  for (const family of families) {
    const source = payload.exposures.exposures[family].occurrences;
    const comparison = capture.views[family].occurrences;
    assert.equal(source.length, 20, `${family} workstation population must contain twenty rows`);
    assert.equal(comparison.length, 20, `${family} comparison population must contain twenty rows`);
    assert.deepEqual(comparison.map(join), source.map(join),
      `${family} comparison rows must retain the source identity and anchor time by index`);
    assert.ok(comparison.every(({ date }) => date >= start && date <= end),
      `${family} comparison dates must fall inside the inclusive source window`);
  }

  const mealJoins = payload.exposures.exposures.meals.occurrences.map(join);
  assert.ok(new Set(mealJoins).size < mealJoins.length,
    'the S32 source population must retain a deliberately non-unique join pair');
});

test('the expanded meal population preserves the workstation queue sift shape', () => {
  const meals = payload.exposures.exposures.meals.occurrences;
  const fired = meals.filter((row) => row.cause_lever === 'late_bolus');
  assert.equal(fired.length, 2,
    'only the two intended meal findings contribute to the unpriced queue order');
  assert.ok(fired.every((row) => Number(row.t.slice(11, 13)) * 60 + Number(row.t.slice(14, 16)) >= 360),
    'the fired meal findings stay outside the Overnight all-hidden sift');
  assert.equal(meals.filter((row) => !row.attributed).length, 18,
    'the remaining population rows stay as counter-examples');
});

test('browser preparation joins keep each scoped event-chart coordinate intact', () => {
  const requested = { start_min: 135, end_min: 285 };
  const projection = projectFindings(populateFindingsProjectionInput({
    analysis: payload.analyze,
    exposures: payload.exposures,
    scenarios: payload.scenarios,
  }), requested);
  const preparation = structuredClone(caseFiles.preparation);
  preparation.coordinates.window = projection.window;
  populateFindingCasePreparation(preparation, projection, capture);

  assert.doesNotThrow(() => assertMatchingFindingCasePreparation(preparation, requested));
  const row = preparation.rendered_rows.find(({ id }) => id === 'finding:over_treated_low');
  assert.deepEqual(row.event_chart.window, projection.window);
  assert.deepEqual(row.case_header.event_chart, row.event_chart,
    'the row and case header carry the same server-published scoped coordinate');
});

test('browser fixture population supplies the backend-prepared Pattern roster', () => {
  assert.deepEqual(populateFindingsProjectionInput({}).outcome_patterns,
    findingsFixture.browser_outcome_patterns,
    'every browser gate receives the frozen prepared roster from one adapter');
});

test('browser Pattern rows and case files share the public producer denominator', () => {
  const inputs = populateFindingsProjectionInput({
    analysis: payload.analyze,
    exposures: payload.exposures,
    scenarios: payload.scenarios,
  });
  const projection = projectFindings(inputs);
  const preparation = populateFindingCasePreparation(
    structuredClone(caseFiles.preparation), projection, capture,
  );
  const row = preparation.rendered_rows.find(({ id }) => id === 'pattern:highs_after_meals');
  const caseFile = projectPatternCaseFile(capture, {
    patternChart: row.pattern_chart, projectionId: preparation.projection_id,
  });
  const clockCase = projectPatternCaseFile(capture, {
    patternChart: row.pattern_chart, projectionId: preparation.projection_id,
    alignment: 'clock',
  });

  assert.deepEqual(
    [caseFile.summary.denominator, caseFile.summary.claimed],
    [row.pattern.n, row.pattern.k],
  );
  assert.equal(caseFile.verdict_counts.fired, row.pattern.k);
  assert.equal(clockCase.projection.alignment, 'clock');
  assert.equal(clockCase.projection.clock.total, row.pattern.k);
  for (const field of ['finding', 'family', 'summary', 'verdict_counts', 'occurrences']) {
    assert.deepEqual(clockCase[field], caseFile[field]);
  }
  const selectedClock = projectPatternCaseFile(capture, {
    patternChart: row.pattern_chart, alignment: 'clock',
    occurrenceId: clockCase.occurrences[0].id,
  });
  assert.equal(selectedClock.selection.state, 'selected');
  assert.equal(selectedClock.selection.detail.id, clockCase.occurrences[0].id);
  assert.equal(validFindingCaseFile(selectedClock), true);
  assert.deepEqual(
    normalizeOpaqueIds(selectedClock), normalizeOpaqueIds(findingsFixture.pattern_clock_case),
    'the fixture-only projector stays byte-shaped like the frozen Python answer',
  );
  assert.deepEqual(row.pattern_chart, row.case_header.pattern_chart);
  assert.equal(row.event_chart, null);
  assert.doesNotThrow(() => assertMatchingFindingCasePreparation(preparation, null));
});

test('#454 · the Pattern mirror judges only its rate family, as the Python producer answers', () => {
  const frozen = Object.entries(findingsFixture.pattern_family_cases);
  assert.deepEqual(frozen.map(([key]) => key).sort(), ['highs_after_meals', 'lows_after_correcting_highs']);
  for (const [key, answer] of frozen) {
    assert.ok(answer.roster_row.members.some(({ subject }) => subject === `habit:${answer.lever}`),
      `${key} premise: the frozen roster carries its out-of-family member`);
    const variant = structuredClone(capture);
    variant.outcome_patterns = variant.outcome_patterns.map((row) => (row.key === key
      ? structuredClone(answer.roster_row) : row));
    const patternChart = { key, window: { scoped: false, start_min: null, end_min: null, label: null } };
    const clock = projectPatternCaseFile(variant, { patternChart, alignment: 'clock' });
    assert.deepEqual(clock.verdict_counts, answer.clock.verdict_counts, `${key} verdict counts`);
    assert.deepEqual(clock.occurrences.map(({ verdict, member }) => [verdict, member]),
      answer.clock.occurrences.map(({ verdict, member }) => [verdict, member]), `${key} rows in order`);
    const selected = projectPatternCaseFile(variant, {
      patternChart, alignment: 'clock', occurrenceId: clock.occurrences[0].id });
    assert.deepEqual(selected.selection.detail.reason, answer.selected.selection.detail.reason,
      `${key} selected reason`);
    const unmapped = structuredClone(variant);
    delete unmapped.pattern_families[answer.lever];
    assert.throws(() => projectPatternCaseFile(unmapped, { patternChart, alignment: 'clock' }),
      new RegExp(`no frozen rate family: ${answer.lever}`));
  }
});

test('correction-on-IOB claims the lows in its Pattern population', () => {
  const inputs = populateFindingsProjectionInput({
    analysis: payload.analyze,
    exposures: payload.exposures,
    scenarios: payload.scenarios,
  });
  const projection = projectFindings(inputs);
  const member = projection.rows.find(({ id }) => id === 'finding:correction_on_iob');
  const pattern = projection.rows.find(({ id }) => id === 'pattern:lows_after_correcting_highs');
  const caseFile = projectPatternCaseFile(capture, { patternChart: pattern.pattern_chart });

  assert.equal(member.claimed_by, 'pattern:lows_after_correcting_highs');
  assert.equal(caseFile.family, 'lows');
  assert.equal(caseFile.summary.denominator, payload.exposures.exposures.lows.n);
  assert.equal(caseFile.summary.claimed, pattern.pattern.k);
  assert.equal(caseFile.occurrences.filter(
    (row) => row.member === 'habit:correction_on_iob',
  ).length, pattern.pattern.k);
});

test('correcting-highs Pattern selection uses the low-nadir comparison idiom', () => {
  const inputs = populateFindingsProjectionInput({
    analysis: payload.analyze,
    exposures: payload.exposures,
    scenarios: payload.scenarios,
  });
  const projection = projectFindings(inputs);
  const pattern = projection.rows.find(({ id }) => id === 'pattern:lows_after_correcting_highs');
  const enriched = structuredClone(capture);
  const source = enriched.pattern_populations.lows[0];

  const caseFile = projectPatternCaseFile(enriched, {
    patternChart: pattern.pattern_chart,
    alignment: 'clock',
    occurrenceId: source.id,
  });

  assert.equal(caseFile.selection.state, 'selected');
  assert.equal('member' in caseFile.selection.detail, false);
  assert.equal(caseFile.selection.detail.anchor.kind, 'low');
  const eventCase = projectPatternCaseFile(enriched, {
    patternChart: pattern.pattern_chart,
  });
  assert.equal(eventCase.projection.anchor.kind, 'excursion_nadir');
  assert.deepEqual(eventCase.projection.window_min, [-60, 120]);
  assert.deepEqual(caseFile.selection.detail.source_corrections, []);
});

test('Pattern misses prefer near misses over outranked member states', () => {
  assert.equal(patternVerdict(['outranked', 'near_miss']), 'near_miss');
  assert.equal(patternVerdict(['near_miss', 'outranked'], true), 'fired');
});

test('memberless Patterns remain served without an invented chart', () => {
  const inputs = populateFindingsProjectionInput({
    analysis: payload.analyze,
    exposures: payload.exposures,
    scenarios: payload.scenarios,
  });
  const projection = projectFindings(inputs);
  const preparation = populateFindingCasePreparation(
    structuredClone(caseFiles.preparation), projection, capture,
  );
  const row = preparation.rendered_rows.find(({ id }) => id === 'pattern:lows_after_meals');

  assert.equal(row.pattern.n, 20);
  assert.equal(row.pattern_chart, null);
  assert.equal(projectPatternCaseFile(capture, { patternChart: row.pattern_chart }), null);
  assert.equal(projectPatternCaseFile(capture, {
    patternChart: row.pattern_chart, alignment: 'clock',
  }), null);
});

test('every chartable fixture Pattern resolves through preparation validation', () => {
  const projection = projectFindings(populateFindingsProjectionInput({
    analysis: payload.analyze, exposures: payload.exposures, scenarios: payload.scenarios,
  }));
  const preparation = populateFindingCasePreparation(
    structuredClone(caseFiles.preparation), projection, capture,
  );
  const chartable = projection.rows.filter((row) => row.pattern_chart);

  assert.ok(chartable.length > 0);
  assert.deepEqual(chartable.map((row) => row.id), preparation.rendered_rows
    .filter((row) => row.pattern_chart).map((row) => row.id));
  assert.doesNotThrow(() => assertMatchingFindingCasePreparation(preparation, null));
});

// Over-treated low is the one Cause the producer drives from two anchor kinds: its
// low, and a rebound High it claims. The committed payload claims no rebound High, so
// this clone makes its unclaimed High one, in the shape the producer serves.
function withReboundHigh(exposures) {
  const clone = structuredClone(exposures);
  const highs = clone.exposures.highs;
  const high = highs.occurrences.find((row) => !row.attributed);
  const text = 'Synthetic rebound narrative: the treated low climbed into this high.';
  Object.assign(high, {
    attributed: true, attributed_levers: ['over_treated_low'], cause_lever: 'over_treated_low',
    cause_title: 'Over-treated low', state: 'fired', text,
    verdicts: [{ classifier: 'over_treated_low', matched: true, detail: text,
      evidence_tier: 'inferred', silence_reason: null }],
  });
  Object.assign(highs, {
    attributed: highs.attributed + 1, clean: highs.clean - 1, uncaused: highs.uncaused - 1,
    levers: [...highs.levers, 'over_treated_low'],
    by_cause: { ...highs.by_cause, 'Over-treated low': 1 },
  });
  return clone;
}

test('browser preparation mirrors the wrapped row: both families, case file first, headline from the lead', () => {
  const projection = projectFindings(populateFindingsProjectionInput({
    analysis: payload.analyze,
    exposures: withReboundHigh(payload.exposures),
    scenarios: payload.scenarios,
  }));
  const preparation = structuredClone(caseFiles.preparation);
  preparation.coordinates.window = projection.window;
  populateFindingCasePreparation(preparation, projection, capture);

  const projected = projection.rows.find(({ id }) => id === 'finding:over_treated_low');
  assert.deepEqual(projected.appearances.map(({ family }) => family),
    ['highs', 'lows'],
    'the projection sorts by family name, so the case file\'s family arrives second');

  const row = preparation.rendered_rows.find(({ id }) => id === 'finding:over_treated_low');
  assert.deepEqual(row.appearances, [
    { family: 'lows', m: 10, n: 1, noun: 'lows' },
    { family: 'highs', noun: 'highs', n: 1, m: 4 },
  ], 'the case file\'s family leads at the case file\'s counts and the other family keeps the projection\'s');
  assert.equal(row.headline,
    'Ranks among this window\'s findings. Showed up in 1 of 10 lows in this window.',
    'the served sentence is composed from the leading appearance the row publishes');
});

test('the cockpit exposure population produces its event-comparison Finding row', () => {
  const projection = projectFindings(populateFindingsProjectionInput({
    analysis: payload.analyze,
    exposures: payload.exposures,
    scenarios: payload.scenarios,
  }));
  assert.ok(projection.rows.some(({ id }) => id === 'finding:late_bolus'));
});

test('the Afternoon fixture retains all four published behavioral Findings', () => {
  const projection = projectFindings(populateFindingsProjectionInput({
    analysis: payload.analyze,
    exposures: payload.exposures,
    scenarios: payload.scenarios,
  }), { start_min: 720, end_min: 1080 });
  const selected = new Set(['highs', 'meals', 'corrections']);
  const shown = queueRows(projection, selected)
    .filter((row) => !row.hidden && !row.collapsed);

  // The server's shown rows, in its order: both Patterns fold their causes here, and
  // the priced Over-treated low leads (ADR 454).
  assert.deepEqual(shown.map(({ id }) => id), [
    'finding:over_treated_low',
    'pattern:highs_after_meals',
    'pattern:lows_after_correcting_highs',
    'finding:missed_meal',
  ]);
  assert.equal(queueMeta(projection, selected, true), '4 in this window');
});

const browserProjection = (bounds) => projectFindings(
  populateFindingsProjectionInput({ exposures: payload.exposures }), bounds);

test('#454 · the test desk serves the server\'s own answer, in its order, in each browser window', () => {
  assert.deepEqual(Object.keys(findingsFixture.browser_windows),
    ['0-360', '135-285', '720-1080', 'whole_day']);
  for (const [key, served] of Object.entries(findingsFixture.browser_windows)) {
    const bounds = key === 'whole_day' ? null
      : Object.fromEntries(key.split('-').map(Number).map((minute, index) =>
        [index ? 'end_min' : 'start_min', minute]));
    const projection = browserProjection(bounds);
    assert.deepEqual(projection.rows.map(({ id }) => id), served.rows.map(({ id }) => id), `${key} row order`);
    assert.deepEqual(projection, served, `${key} is the server's projection, byte for byte`);
    if (!bounds) continue;

    const preparation = structuredClone(caseFiles.preparation);
    preparation.coordinates.window = projection.window;
    populateFindingCasePreparation(preparation, projection, capture);
    const charted = preparation.rendered_rows.filter((row) => row.kind === 'pattern' && row.pattern_chart);
    const cases = findingsFixture.browser_pattern_cases_by_window[key];
    assert.deepEqual(charted.map((row) => row.pattern.key).sort(), Object.keys(cases).sort(), key);
    for (const row of charted) {
      const { summary, verdict_counts } = cases[row.pattern.key].event;
      assert.deepEqual([row.case_header.summary, row.case_header.verdict_counts], [summary, verdict_counts],
        `${key} ${row.id} header`);
    }
  }
});

test('#454 · a narrowed window or Pattern case the server never answered fails by name', () => {
  assert.throws(() => browserProjection({ start_min: 360, end_min: 720 }),
    /no frozen Pattern roster for window 360-720/);
  const frozen = findingsFixture.browser_pattern_cases_by_window['0-360'].highs_after_meals;
  const served = { key: 'highs_after_meals', window: frozen.event.window };
  const answered = projectPatternCaseFile(capture, {
    patternChart: served, projectionId: `fp_${'5'.repeat(32)}`, alignment: 'event' });
  assert.deepEqual(answered, { ...frozen.event, projection_id: `fp_${'5'.repeat(32)}` });
  const other = { key: 'highs_after_meals', window: { ...frozen.event.window, start_min: 360, end_min: 720 } };
  assert.throws(() => projectPatternCaseFile(capture, { patternChart: other, alignment: 'clock' }),
    /no frozen narrowed Pattern case: highs_after_meals 360-720 clock/);
  assert.throws(() => projectPatternCaseFile(capture, {
    patternChart: served, alignment: 'clock', occurrenceId: frozen.clock.occurrences[0].id }),
  /serves no selection in a narrowed Pattern case: highs_after_meals 0-360 clock/);
});

test('comparison keeps plan-local outcomes and verdicts when workstation attribution changes', () => {
  const altered = structuredClone(payload.exposures);
  altered.exposures.meals.occurrences = altered.exposures.meals.occurrences.map((row, index) => ({
    ...row,
    t: `2020-03-0${index % 3 + 1} 00:00:00`,
    date: `2020-03-0${index % 3 + 1}`,
    attributed: false,
    cause_lever: null,
    cause_title: null,
    state: 'clean',
    verdicts: [],
  }));

  const rebuilt = buildCapture(altered);
  const localFacts = (occurrences) => occurrences.map(({ outcome_min, routes, verdicts }) =>
    ({ outcome_min, routes, verdicts }));
  assert.deepEqual(localFacts(rebuilt.views.meals.occurrences),
    localFacts(capture.views.meals.occurrences),
    'comparison outcomes and verdicts come from its local plan, not workstation attribution');
  assert.deepEqual(rebuilt.views.meals.occurrences.map(({ ep_id, anchor_t, date }) =>
    ({ ep_id, anchor_t, date })), altered.exposures.meals.occurrences.map(({ ep_id, t, date }) =>
      ({ ep_id, anchor_t: t, date })),
  'comparison preserves canonical workstation identity and anchor time');
});

test('buildCapture rejects an incomplete source family by name', () => {
  const input = structuredClone(payload.exposures);
  input.exposures.lows.occurrences.pop();
  assert.throws(() => buildCapture(input), /incomplete lows exposure population/);
});

test('buildCapture rejects a missing canonical source window by name', () => {
  const input = structuredClone(payload.exposures);
  delete input.window;
  assert.throws(() => buildCapture(input), /missing workstation exposure window/);
});

test('buildCapture rejects a source row missing its identity by name', () => {
  const input = structuredClone(payload.exposures);
  delete input.exposures.meals.occurrences[0].ep_id;
  assert.throws(() => buildCapture(input), /incomplete meals source row 1/);
});

test('buildCapture rejects a source row outside the inclusive window by name', () => {
  const input = structuredClone(payload.exposures);
  input.exposures.meals.occurrences[0].date = '1999-12-31';
  assert.throws(() => buildCapture(input),
    /meals source row 1 date 1999-12-31 outside inclusive window/);
});

test('buildCapture transcribes the target-family attribution feed', () => {
  const patterns = findingsFixture.browser_outcome_patterns;
  const generated = buildCapture(payload.exposures, patterns);
  for (const pattern of patterns) {
    const family = generated.outcome_patterns.find((row) => row.key === pattern.key)?.rate_family
      || ({ highs_after_meals: 'meals', lows_after_meals: 'meals',
        highs_after_treating_lows: 'lows', lows_after_correcting_highs: 'lows' })[pattern.key];
    if (!family) continue;
    const source = payload.exposures.exposures[family].occurrences;
    const population = generated.pattern_populations[family];
    const expected = new Set(source.flatMap((row, index) => (
      pattern.rate_levers.some((subject) => {
        const lever = subject.replace('habit:', '');
        return (row.attributed_levers || []).includes(lever)
          || (row.attributed && row.cause_lever === lever);
      }) ? [population[index].id] : []
    )));
    assert.deepEqual(
      new Set(Object.keys(generated.pattern_attribution[pattern.key])), expected,
    );
  }
});
