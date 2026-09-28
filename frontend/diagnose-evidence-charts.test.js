import { expandSequenceFixture } from './eating-sequence-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { makeDeps } from './data.js';
import { eventComparisonChartOption, renderEventSurface } from './diagnose-event-comparison.js';
import { projectPatternCaseFile } from '../mockups/diagnose-event-comparison.synthetic/project.mjs';
import { projectFindings } from '../mockups/findings-projection.mirror.mjs';

import {
  DIAGNOSE_EVIDENCE_CHARTS,
  GLUCOSE_ENVELOPE,
  GLUCOSE_STEP,
  excludedNightReasons,
  glucoseRange,
} from './diagnose-evidence-charts.js';
import { fieldRange } from './diagnose-canvas-layout.js';
import { queuePreviewOption } from './diagnose-workstation-chart.js';

const fixture = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
/* A served excluded-night breakdown: the analyzer stamps all six keys on every
   basal slot (#434), so a hand-built payload carries them all too. */
const excludedReasons = (counts = {}) => ({
  before_current_setting: 0, below_range_or_suspended: 0, above_range: 0,
  insulin_acting: 0, carb_log: 0, other: 0, ...counts,
});
/* The comparison kind reads a served Finding case file — the same payload the
   inspector's own drill reads (#181/#135), never a second projection. */
const caseFiles = () => fixture('../mockups/diagnose-workstation.synthetic/finding-case-files.json');
const eventCase = () => caseFiles().cases['finding:carb_undercount'].event;
/* The projection's own frozen inputs, re-projected through the mirror the
   browser gates serve from (#735) — so the rows these names are built from are
   the rows the app is handed, not rows written here. */
const projectionFixture = fixture('./__fixtures__/findings-projection.json');
/* The generator's own window table, re-declared as the request each frozen
   answer was made for — the same list `findings-projection-mirror.test.js`
   holds the mirror to. */
const PROJECTED_WINDOWS = {
  global: null,
  morning: { start_min: 270, end_min: 480 },
  low_block: { start_min: 720, end_min: 840 },
  rebound: { start_min: 840, end_min: 960 },
  afternoon: { start_min: 840, end_min: 1260 },
  overnight: { start_min: 1320, end_min: 120 },
  quiet: { start_min: 180, end_min: 240 },
};

function fakeFetch(body = {}) {
  const calls = [];
  return {
    calls,
    fetch: async (url, opts = {}) => {
      calls.push({ url, opts });
      return { ok: true, status: 200, statusText: 'OK', json: async () => body };
    },
  };
}

test('the shared glucose range contains the envelope and expands in 20 mg/dL steps', () => {
  assert.equal(GLUCOSE_STEP, 20);
  assert.deepEqual(GLUCOSE_ENVELOPE, [60, 200]);
  assert.deepEqual(glucoseRange([]), [60, 200]);
  assert.deepEqual(glucoseRange([100, 160]), [60, 200]);
  assert.deepEqual(glucoseRange([55, 210]), [40, 220]);
  assert.deepEqual(glucoseRange([38, 301]), [20, 320]);
  assert.deepEqual(glucoseRange([NaN, Infinity]), [60, 200]);
});

test('Diagnose evidence clients send each feed its declared request coordinates', async () => {
  const transport = fakeFetch();
  const deps = makeDeps({ fetch: transport.fetch });
  const carbRatio = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'carb-ratio');
  const coordinateValues = { block_id: 1200, analysis_generation: 'process:7' };
  const declaredCoordinates = Object.fromEntries(carbRatio.coordinateSchema
    .map((name) => [name, coordinateValues[name]]));

  await deps.fetchDiagnoseBasalNightEvidence({ slot: 11 });
  await deps.fetchDiagnoseIsfRestWindowEvidence();
  await deps.fetchDiagnoseCarbRatioBlockEvidence(declaredCoordinates);

  assert.deepEqual(transport.calls.map(({ url }) => url), [
    '/api/diagnose/basal-night-evidence?slot=11',
    '/api/diagnose/isf-rest-window-evidence',
    '/api/diagnose/carb-ratio-block-evidence?block_id=1200&analysis_generation=process%3A7',
  ]);
});

test('I:C block evidence turns only a stale-generation 409 into a typed stale result', async () => {
  const detail = { code: 'analysis_generation_mismatch',
    message: 'Evidence changed. Refresh findings.' };
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return { ok: false, status: 409, statusText: 'Conflict',
      json: async () => ({ detail }) };
  };

  assert.deepEqual(await makeDeps({ fetch }).fetchDiagnoseCarbRatioBlockEvidence({
    block_id: 660, analysis_generation: 'process:8',
  }), { stale: true, message: 'Evidence changed. Refresh findings.' });
  assert.equal(calls, 1, 'the transport reports staleness without retrying');
});

test('the registry declares six stateless chart kinds and their request coordinates', () => {
  assert.deepEqual(DIAGNOSE_EVIDENCE_CHARTS.map(({ kind }) => kind), [
    'basal', 'isf', 'carb-ratio', 'eating-sequence', 'event-comparison', 'pattern-case-file',
  ]);
  assert.deepEqual(DIAGNOSE_EVIDENCE_CHARTS.map(({ coordinateSchema }) => coordinateSchema), [
    ['slot'], [], ['block_id', 'analysis_generation'],
    ['projection_id', 'finding_id', 'alignment', 'factor', 'view'],
    ['projection_id', 'finding_id', 'alignment', 'factor', 'view'],
    ['projection_id', 'finding_id', 'alignment', 'factor', 'view'],
  ]);
  assert.deepEqual(DIAGNOSE_EVIDENCE_CHARTS.map(({ modes }) => modes), [
    null, ['event', 'clock'], null, null, null, null,
  ]);
  assert.ok(DIAGNOSE_EVIDENCE_CHARTS.every((entry) => typeof entry.matches === 'function'));
  assert.ok(DIAGNOSE_EVIDENCE_CHARTS.every((entry) => typeof entry.coordinates === 'function'));
  /* The workstation calls entry.meta(mode) for every tile; a string here
     throws at mount and blanks the canvas (caught live during #205). */
  assert.ok(DIAGNOSE_EVIDENCE_CHARTS.every((entry) => entry.meta == null || typeof entry.meta === 'function'));
});

test('every entry produces exactly the coordinates it declares', () => {
  const findings = { analysis_generation: 'process:7', projection_id: 'fp_7' };
  const rows = {
    basal: { id: 'basal:30-60', parameter: 'basal_rate', span: { start_min: 30, end_min: 60 } },
    isf: { id: 'isf', parameter: 'isf' },
    'carb-ratio': { id: 'ic:720', parameter: 'carb_ratio', span: { start_min: 720, end_min: 1440 } },
    'eating-sequence': { id: 'finding:high_carb_sequence', lever: 'high_carb_sequence', title: 'High-carb sequence', event_chart: { lever: 'high_carb_sequence' } },
    'event-comparison': { id: 'finding:missed_meal', title: 'Missed meal',
      appearances: [{ family: 'highs', noun: 'highs' }],
      event_chart: { lever: 'missed_meal', window: { scoped: false } } },
    'pattern-case-file': { id: 'pattern:highs_after_meals', title: 'Highs after meals',
      pattern: { key: 'highs_after_meals', n: 3 },
      pattern_chart: { key: 'highs_after_meals', window: { scoped: false } } },
  };
  for (const entry of DIAGNOSE_EVIDENCE_CHARTS) {
    const row = rows[entry.kind];
    assert.ok(entry.matches(row), `${entry.kind} matches its own row`);
    assert.deepEqual(Object.keys(entry.coordinates(row, findings)), [...entry.coordinateSchema],
      `${entry.kind} produces its declared request coordinates`);
    for (const other of DIAGNOSE_EVIDENCE_CHARTS) {
      if (other !== entry) {
        assert.ok(!other.matches(row), `${other.kind} does not claim the ${entry.kind} row`);
      }
    }
  }
  const named = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'event-comparison');
  assert.deepEqual(named.nameFor(rows['event-comparison']), {
    title: 'Missed meal', meta: 'highs aligned to each event',
  });
});

/* THE LIVE REPRO: two basal slots in one window seated two tiles both reading
   `Basal · nights of steady data`, so the reader could not tell which slot
   either answered — and the canvas suite's distinct-name assertion caught it.
   Every kind a window can publish more than one of names each tile from its own
   row. Built from projection rows, never from a hand-set title. */
test('every kind a window publishes more than once names each tile from its own row', () => {
  const byKind = Object.fromEntries(DIAGNOSE_EVIDENCE_CHARTS.map((entry) => [entry.kind, entry]));
  const EVIDENCE = { basal: 'delivered vs programmed', 'carb-ratio': 'meal runs' };
  const most = { basal: 0, 'carb-ratio': 0 };

  const projected = Object.entries(PROJECTED_WINDOWS).map(([name, bounds]) => [
    name, projectFindings(projectionFixture.inputs, bounds).rows,
  ]);
  // the one frozen answer carrying two carb-ratio blocks at once, projected by
  // the server itself rather than posed here
  projected.push(['carb_ratio_raise', projectionFixture.settings_cases.carb_ratio_raise.rows]);

  for (const [name, published] of projected) {
    const rows = published.filter((row) => row.register !== 'history');
    const titles = [];
    for (const [kind, evidence] of Object.entries(EVIDENCE)) {
      const own = rows.filter((row) => byKind[kind].matches(row));
      most[kind] = Math.max(most[kind], own.length);
      for (const row of own) {
        const { title } = byKind[kind].nameFor(row);
        assert.ok(title.includes(row.span.label),
          `${title} carries its own row's published span in ${name}`);
        assert.ok(kind === 'basal' ? byKind[kind].name.includes(evidence) : title.endsWith(` · ${evidence}`),
          `${kind} keeps its evidence phrase`);
        assert.doesNotMatch(title, /I:C/);
        titles.push(title);
      }
    }
    assert.equal(new Set(titles).size, titles.length,
      `no two parameter tiles in ${name} share a name (${titles})`);
  }
  assert.ok(most.basal >= 2, 'a frozen window publishes several basal slots at once');
  assert.ok(most['carb-ratio'] >= 2, 'a frozen window publishes several carb-ratio blocks at once');
});

test('a parameter row arriving without a span keeps the standing kind name', () => {
  const byKind = Object.fromEntries(DIAGNOSE_EVIDENCE_CHARTS.map((entry) => [entry.kind, entry]));
  assert.equal(byKind.basal.nameFor({ id: 'basal:0-30', parameter: 'basal_rate' }).title, 'Basal');
  assert.equal(byKind['carb-ratio'].nameFor({ id: 'ic:0', parameter: 'carb_ratio' }).title,
    'Carb ratio · meal runs');
});

/* The drawer prints the descriptor's name above the mini chart AND inside it;
   both come from the tile's one name, so a second slot cannot wear the first
   slot's caption. */
test('a parameter thumbnail captions itself with the tile name it was given', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const ic = fixture('../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json')
    .cases.cross_midnight;
  const byKind = Object.fromEntries(DIAGNOSE_EVIDENCE_CHARTS.map((entry) => [entry.kind, entry]));

  assert.equal(byKind.basal.thumbnail(basal, 'Basal 05:30 · nights of steady data')
    .graphic[0].style.text, 'BASAL 05:30 · NIGHTS OF STEADY DATA');
  assert.equal(byKind['carb-ratio'].thumbnail(ic, 'Carb ratio 12:00 to 24:00 · meal runs')
    .graphic[0].style.text, 'CARB RATIO 12:00 TO 24:00 · MEAL RUNS');
  assert.equal(byKind.basal.thumbnail(basal).graphic[0].style.text,
    'BASAL · DELIVERED VS PROGRAMMED');
});

test('entries build different alignments simultaneously with one optical spine', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const isf = fixture('../mockups/diagnose-workstation.synthetic/isf-rest-window-evidence.capture.json').payload;
  const ic = fixture('../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json')
    .cases.cross_midnight;
  const byKind = Object.fromEntries(DIAGNOSE_EVIDENCE_CHARTS.map((entry) => [entry.kind, entry]));

  const basalEditorial = byKind.basal.option(null, {
    data: basal, range: null, explore: false, mini: false, window: [1320, 120],
  });
  const isfEvent = byKind.isf.option('event', {
    data: isf, range: null, explore: false, mini: false, window: [1320, 120],
  });
  const icOverview = byKind['carb-ratio'].option('overview', {
    data: ic, range: [80, 220], explore: false, mini: false, window: [1320, 120],
  });
  const event = eventCase();
  const comparison = byKind['event-comparison'].option(null, {
    data: event, range: [80, 220], explore: false, mini: false, window: [1320, 120],
  });

  assert.equal(basalEditorial.series.some(({ id }) => id === 'furniture'), true);
  assert.equal(isfEvent.xAxis.name, 'insulin acted (U)');
  assert.equal(basalEditorial.legend.show, false);
  const { containLabel, ...isfPlot } = isfEvent.grid;
  assert.deepEqual(isfPlot, comparison.grid,
    'the comparison shares the other kinds\' plot insets');
  /* The carb-ratio tile's two lanes open on the same spine and close on the
     same right inset. */
  assert.ok(icOverview.grid.every((lane) => lane.left === isfEvent.grid.left
    && lane.right === isfEvent.grid.right));
});

/* A FULL-RANK AXIS NAME BELONGS TO ITS OWN AXIS (#360). The grid runs
   `containLabel: false`, so nothing reserves room for a name, and ECharts' own
   `nameLocation: 'end'` centres a vertical name on the axis end and hangs a
   horizontal one past it — which painted `glucose change (mg/dL)` 18px left of
   the correction-factor chart and sheared `insulin acted (U)` 43px off its
   right. The seat is written once, in the helper both builders spread, so it is
   asserted here through the registry in every mode each publishes. That is also
   the carb-ratio chart's whole guarantee: no finding row on the QA database
   renders it, so the browser capture cannot reach it (ADR 360). */
test('every full-rank evidence axis name is anchored to the axis it labels', () => {
  const isf = fixture('../mockups/diagnose-workstation.synthetic/isf-rest-window-evidence.capture.json').payload;
  const ic = fixture('../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json')
    .cases.cross_midnight;
  const byKind = Object.fromEntries(DIAGNOSE_EVIDENCE_CHARTS.map((entry) => [entry.kind, entry]));
  const built = (mini) => [
    ['isf', 'event', byKind.isf.option('event', { data: isf, range: null, mini, window: [1320, 120] })],
    ['isf', 'clock', byKind.isf.option('clock', { data: isf, range: null, mini, window: [1320, 120] })],
  ];

  const seated = [];
  for (const [kind, mode, option] of built(false)) {
    for (const [dim, align] of [['xAxis', 'right'], ['yAxis', 'left']]) {
      const axis = option[dim];
      if (!axis.name) continue;
      seated.push(`${kind}/${mode} ${dim} ${axis.name}`);
      assert.equal(axis.nameTextStyle.align, align,
        `${kind}/${mode} ${dim} name starts where its axis does`);
      assert.equal(Object.hasOwn(axis, 'nameLocation'), false,
        `${kind}/${mode} ${dim} name stays at the axis end rather than relocated`);
    }
    /* The horizontal name joins its own tick labels at the plot bottom instead
       of riding a zero rule through the middle of the plot. */
    assert.equal(option.xAxis.axisLine.onZero, false,
      `${kind}/${mode} x-axis sits with its labels`);
    /* Nothing that already rendered moves: the canvas-wide spine inset, the
       right inset the last axis label needs, and the legend's own seat are the
       ones these entries returned before — and the browser driver sees none of
       them, because it measures a name against the container box. */
    assert.deepEqual(option.grid,
      { left: 34, right: 34, top: 26, bottom: 42, containLabel: false },
      `${kind}/${mode} keeps its plot insets`);
    assert.deepEqual([option.legend.left, option.legend.right, option.legend.bottom],
      [34, 22, 0], `${kind}/${mode} keeps its legend seat`);
  }
  /* Every name the two builders draw, unchanged in wording and in reach. */
  assert.deepEqual(seated, [
    'isf/event xAxis insulin acted (U)',
    'isf/event yAxis glucose change (mg/dL)',
    'isf/clock yAxis glucose change (mg/dL)',
  ]);

  /* The mini rank still carries no axis name at all — it drops the name rather
     than seating it, which is the same rule fixed for a cell too small to read
     one. */
  for (const [kind, mode, option] of built(true)) {
    assert.equal(option.xAxis.name, undefined, `${kind}/${mode} mini names no x-axis`);
    assert.equal(option.yAxis.name, undefined, `${kind}/${mode} mini names no y-axis`);
  }

  /* The carb-ratio tile names one axis — its ratio strip's, "g/U" — seated at
     the axis end the same way; its thumbnail names none. */
  const icFull = byKind['carb-ratio'].option('overview', { data: ic });
  assert.deepEqual(icFull.xAxis.map(({ name }) => name), ['g/U', undefined]);
  assert.equal(icFull.xAxis[0].nameTextStyle.align, 'right');
  assert.equal(Object.hasOwn(icFull.xAxis[0], 'nameLocation'), false);
  assert.ok(icFull.yAxis.every(({ name }) => name === undefined));
  const icMini = byKind['carb-ratio'].option('overview', { data: ic, mini: true });
  assert.equal(icMini.xAxis.name, undefined);

  /* And the one chart whose name already measured seated keeps the seat it has. */
  const basal = byKind.basal.option(null, {
    data: fixture('./__fixtures__/basal-night-evidence.json').expected,
  });
  assert.equal(basal.xAxis.nameLocation, 'middle');
  assert.equal(basal.xAxis.nameGap, 26);
  assert.equal(basal.xAxis.nameTextStyle.align, undefined,
    'the basal name is centred on its own axis rather than anchored to an end');
});

test('basal routes every legacy mode to editorial', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');
  const held = entry.option('event', { data: {
    ...basal,
    directional_support_count: 12,
    asserts_move: false,
    safety_status: 'insufficient evidence',
  } });
  const moving = entry.option('clock', { data: {
    ...basal,
    directional_support_count: 12,
    asserts_move: true,
    safety_status: 'lower',
  } });

  assert.equal(held.series.some(({ id }) => id === 'furniture'), true);
  assert.equal(moving.series.some(({ id }) => id === 'furniture'), true);
  assert.equal(entry.modes, null);
});

test('the editorial treatment keeps payload-derived tallies and tolerates an absent estimate', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');
  const more = basal.nights.filter(({ sign }) => sign === 1).length;
  const less = basal.nights.filter(({ sign }) => sign === -1).length;
  for (const mode of [null]) {
    const option = entry.option(mode, { data: basal });
    assert.equal(option.animation, false);
    assert.ok(option.series.every((series) => series.animation === false));
    const rendered = JSON.stringify(option);
    assert.match(option.aria.description, new RegExp(`${more} more, ${less} less`));
    assert.doesNotThrow(() => entry.option(mode, { data: { ...basal, estimate: null } }));
  }
});

/* The editorial staircase counts the roster ITSELF — its crossing height, its
   step count and every tally in its rail come off the payload, so a fixture with
   no estimate at all still draws, and one with an interval still crosses at the
   nights that reached the programmed rate. */
test('the editorial staircase counts the roster from the payload', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');
  const more = basal.nights.filter(({ sign }) => sign === 1).length;
  const less = basal.nights.filter(({ sign }) => sign === -1).length;
  const asSet = basal.nights.filter(({ sign }) => sign === null).length;
  const programmed = basal.nights[0].programmed_rate;
  const option = entry.option('editorial', {
    data: { ...basal, estimate: { value: .74, lo: .6, hi: .92 } },
  });

  assert.equal(option.animation, false);
  assert.ok(option.series.every((series) => series.animation === false));
  /* THE RAIL IS SET AS A TABLE OF PAIRS: every numeral right-aligned to one
     fixed x, every label left-aligned one fixed gutter after it, and the numeral
     centred against its own label rather than hung from the label's first line.
     Set as rich-text rows each row was laid out to its own content and the
     numerals staggered; set as two column-wide blocks the numerals were marooned
     a column away from the words they belong to. */
  const drawn = option.series.find(({ id }) => id === 'rail')
    .renderItem({ dataIndex: 0 }, { getWidth: () => 950, getHeight: () => 307 }).children;
  const numerals = drawn.filter(({ style }) => style.align === 'right');
  const labels = drawn.filter(({ style }) => style.align === 'left');
  /* The fixture serves one excluded night, under insulin on board: the total
     keeps its own row and the served reason follows it (#434). */
  assert.deepEqual(numerals.map(({ style }) => style.text),
    [more, less, asSet, basal.excluded_night_count,
      basal.excluded_night_reasons.insulin_acting].map(String));
  assert.deepEqual(labels.map(({ style }) => style.text),
    ['more than programmed', 'less', 'exactly as set', 'excluded', 'insulin on board'],
    'the total reads "excluded" and each served reason follows it on its own row');
  assert.ok(numerals.every(({ style }) => style.x === numerals[0].style.x),
    'one numeral column, one x');
  assert.ok(labels.every(({ style }) => style.x === numerals[0].style.x + 10),
    'every label begins one gutter after the numeral column, never at the far margin');
  /* Each pair shares one centre line, so a 16px count sits against the middle of
     its 11px label rather than the label's first line. */
  for (const [index, numeral] of numerals.entries()) {
    assert.equal(labels[index].style.y, numeral.style.y,
      `row ${index} centres its numeral against its label`);
    assert.equal(numeral.style.verticalAlign, 'middle');
    assert.equal(labels[index].style.verticalAlign, 'middle');
  }
  assert.deepEqual(numerals.map(({ style }) => style.y), [114, 138, 162, 200, 224],
    'one pitch down the tally, the excluded row below its own rule, and its reason one pitch on');
  assert.ok(option.graphic.every(({ style }) => !/circle/.test(style?.text ?? '')));
  assert.equal(option.series.find(({ id }) => id === 'furniture')
    .renderItem({ coordSys: { x: 28, y: 80, width: 672, height: 147 }, dataIndex: 0 }, {
      coord: ([x, y]) => [28 + ((x - option.xAxis.min) / (option.xAxis.max - option.xAxis.min)) * 672,
        80 + (y / option.yAxis.max) * 147],
      getWidth: () => 950, getHeight: () => 307,
    }).children.some(({ type }) => type === 'circle'), false,
  'no glyph floats at the crossing — the label anchors to the rule itself');
  /* And the verdict block above shares that margin, so the section has one edge
     rather than four. */
  const rail = JSON.stringify(option.graphic);
  const heads = option.graphic.filter(({ style }) => style?.width === 206);
  assert.equal(heads.length, 4, 'slug, estimate, range and table head');
  assert.ok(heads.every(({ right, style }) => right === 28 && style.align === 'right'));
  assert.ok(rail.includes(`${basal.nights.length} STEADY NIGHTS`));
  /* The scale is a rate, and it says so under its own numbers in the domain's
     own term: a bare 0.0–1.8 ladder on a chart about nights was read as a count
     of days. */
  assert.equal(option.xAxis.name, 'basal rate, U/h');
  assert.equal(option.xAxis.nameLocation, 'middle');
  assert.ok(option.xAxis.nameGap > 8, 'the name clears the tick labels it sits under');
  /* ONE CELL PER NIGHT, one row each, sorted largest-more first through the
     nights that ran exactly as set to largest-less last — so the rows' far ends
     fall away from the rule and the reader counts down to the crossing. */
  const cells = option.series.find(({ id }) => id === 'nights');
  assert.equal(cells.data.length, basal.nights.length);
  assert.deepEqual(cells.data.map(({ value }) => value[1]),
    basal.nights.map((_, index) => index + 1),
    'the cells occupy one row each, counted down from the top');
  assert.deepEqual(cells.data.map(({ delivered }) => delivered),
    [...basal.nights.map(({ delivered_rate: rate }) => rate)].sort((a, b) => b - a),
    'the stack is ordered by how far the night ran from the programmed rate');
  assert.equal(option.yAxis.inverse, true, 'rank one is the top row');
  /* The silhouette is implied by arrangement, never drawn: no mark on this plot
     spans more than one night, because a path through the nights' ends would
     assert a continuity independent observations do not have. So the crossing is
     read off the cells that reach the rule, not off a curve. */
  assert.equal(option.series.some(({ type }) => type === 'line'), false,
    'nothing connects one night to the next');
  assert.equal(cells.data.filter(({ value }) => value[0] >= programmed).length, more + asSet,
    'the cells reaching the programmed rule are the nights at or above it');
  assert.equal(cells.data.filter(({ value }) => value[0] >= option.xAxis.max).length, 0,
    'no night runs past this roster ceiling');
});

/* THE STAGE CARD'S TITLE IS THE HEADLINE'S ONLY HOME (ADR 306): the deck no
   longer composes or draws one, and the vertical room that reserved is given
   back to the plot. */
test('the full-rank basal deck draws no headline, and the plot reclaims its room', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');
  const option = entry.option('editorial', {
    data: { ...basal, estimate: { value: .74, lo: .6, hi: .92 } },
  });

  const texts = option.graphic.map(({ style }) => style?.text ?? '').join(' | ');
  assert.doesNotMatch(texts, /Pump ran (above|below|at) the programmed rate/,
    'the deck composes no headline sentence of its own');
  assert.doesNotMatch(texts, /nights, counted by the rate the pump ran/);
  assert.ok(option.graphic.every(({ style }) => !/21px/.test(style?.font ?? '')),
    'no graphic element uses the retired headline type size');
  assert.equal(option.grid.top, 76, 'the plot starts where the reclaimed deck budget now allows');
});

/* ONE BIG NIGHT MAY NOT SET THE SCALE, AND MAY NOT BE HIDDEN EITHER: the
   ceiling rides the roster, and a night past it keeps its true value where
   the reader can still be told it. */
test('the editorial ceiling caps an outlier night without hiding its value', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');
  const outlier = { date: '2026-01-09', delivered_rate: 3.7, programmed_rate: 0.6,
    sign: 1, t: '2026-01-09T00:00:00' };
  const option = entry.option('editorial', {
    data: { ...basal, nights: [...basal.nights, outlier] },
  });

  assert.ok(option.xAxis.max < outlier.delivered_rate,
    'the domain answers to the roster, not to its tallest night');
  const cells = option.series.find(({ id }) => id === 'nights');
  const capped = cells.data.find(({ name }) => name === outlier.date);
  assert.equal(capped.value[0], option.xAxis.max, 'the capped night runs to the ceiling');
  assert.equal(capped.delivered, outlier.delivered_rate,
    'the number the night reports is never the capped one');
  assert.equal(cells.data.filter(({ value }) => value[0] >= option.xAxis.max).length, 1,
    'the night beyond the ceiling is the one cell that reaches the right edge');
});

/* THE THIRD SEAT. The explorer grid draws every chart at roughly 480x240 and
   the workstation only ever says `mini` for the dock, so the full treatment was
   poured into a cell a third its width: the headline ran under the slug and the
   axis labels fused into one smear. The rank is taken from the host element the
   workstation is already passing — the box is the fact, where the seat name is
   only an intention (`fieldNarrow` shrinks the focal seat too). */
test('the editorial tile takes a middle rank from the seat it is handed', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');
  const data = { ...basal, estimate: { value: .74, lo: .6, hi: .92 } };
  const more = basal.nights.filter(({ sign }) => sign === 1).length;
  const asSet = basal.nights.filter(({ sign }) => sign === null).length;
  const middle = entry.option('editorial', { data, surface: { clientWidth: 480 } });
  const full = entry.option('editorial', { data, surface: { clientWidth: 950 } });

  assert.deepEqual(full.graphic, entry.option('editorial', { data }).graphic,
    'a wide seat is the rank the tile already had');
  /* The deck and the rail go; nothing they carried goes with them. */
  assert.equal(middle.graphic.length, 2, 'two compressed lines in place of deck and rail');
  const [statement, tally] = middle.graphic.map(({ style }) => style.text);
  assert.match(statement, /INSUFFICIENT EVIDENCE/);
  assert.match(statement, /0\.74 U\/h/);
  assert.match(statement, /\(0\.60–0\.92\)/, 'the interval survives the rank');
  assert.match(statement, /programmed now 0\.60/,
    'the rule loses its flag, so the line names the rate in force now');
  /* The fixture's one excluded night is under insulin on board, not low or
     suspended, so the tally ends on the total: a zero count never prints. */
  assert.equal(basal.excluded_night_reasons.below_range_or_suspended, 0);
  assert.equal(tally, `${basal.nights.length} steady nights · ${more} more · 0 less`
    + ` · ${asSet} as set · ${basal.excluded_night_count} excluded`);
  assert.match(entry.option('editorial', { data: { ...data, nights: [data.nights[0]] },
    surface: { clientWidth: 480 } }).graphic[1].style.text, /^1 steady night · /,
  'one night is not "1 steady nights"');
  assert.equal(middle.series.some(({ id }) => id === 'rail'), false, 'no rail table');
  assert.ok(middle.grid.right < 60, 'no rail width is reserved');
  assert.ok(middle.grid.top < full.grid.top && middle.grid.bottom < full.grid.bottom);
  /* The figure itself is unchanged in kind: one cell per night, anchored on the
     rule, and nothing spanning two nights. */
  assert.equal(middle.series.some(({ type }) => type === 'line'), false);
  assert.equal(middle.series.find(({ id }) => id === 'nights').data.length, basal.nights.length);
  assert.equal(middle.xAxis.name, 'basal rate, U/h');
  assert.ok(middle.animation === false && middle.series.every(({ animation }) => animation === false));
});

test('the middle rank keeps its labels inside a 480px cell', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');
  const option = entry.option('editorial', {
    data: { ...basal, estimate: { value: .74, lo: .6, hi: .92 } },
    surface: { clientWidth: 480 },
  });
  const plot = { x: 14, y: 46, width: 426, height: 140 };
  const api = {
    coord: ([x, y]) => [plot.x + ((x - option.xAxis.min) / (option.xAxis.max - option.xAxis.min)) * plot.width,
      plot.y + (y / option.yAxis.max) * plot.height],
    getWidth: () => 480, getHeight: () => 240,
  };
  const drawn = option.series.find(({ id }) => id === 'furniture')
    .renderItem({ coordSys: plot, dataIndex: 0 }, api).children;
  const marks = drawn.filter(({ type }) => type === 'text').map(({ style }) => {
    const size = Number(/(\d+)px/.exec(style.font)[1]);
    const width = String(style.text).length * size * .52;
    return { text: style.text, width, x: style.align === 'right' ? style.x - width : style.x };
  });
  for (const mark of marks) {
    assert.ok(mark.x >= 0, `"${mark.text}" runs off the left of a narrow cell`);
    assert.ok(mark.x + mark.width <= 480, `"${mark.text}" runs off the right of a narrow cell`);
  }
  /* The axis stops crowding: at this width the full rank's ladder fused. */
  assert.ok((option.xAxis.max - option.xAxis.min) / option.xAxis.interval <= 8,
    'the middle rank thins its ticks');
  assert.equal(drawn.some(({ style }) => /PROGRAMMED/.test(style?.text ?? '')), false,
    'the rule flies no flag where the deck has become two lines');
});

/* #455 — THE VERDICT LINE BREAKS BETWEEN ITS FACTS. At the narrowest split the
   Spotlight's seat is about 381px, and its one verdict line ran past the Keep
   control and the canvas edge, losing the programmed rate. The line now breaks
   where a whole fact does not fit the column that ends at the plot's right
   edge, and the tally and the figure move down one 14px pitch per added line.
   The data is the served fixture with the replay store's slot shape: a
   verdict word, an estimate, its range and a programmed rate. */
test('the middle-rank verdict line breaks between facts at the narrowest split', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');
  const data = { ...basal, estimate: { value: .7, lo: .7, hi: .7 } };
  const facts = ['INSUFFICIENT EVIDENCE', '0.70 U/h', '(0.70–0.70)', 'programmed now 0.60'];
  const wide = entry.option('editorial', { data, surface: { clientWidth: 750 } });
  const narrow = entry.option('editorial', { data, surface: { clientWidth: 381 } });

  const [wideVerdict, wideTally] = wide.graphic;
  assert.equal(wideVerdict.style.text, facts.join(' · '), 'a line that fits stays as it was');
  assert.equal('lineHeight' in wideVerdict.style, false);
  assert.equal(wideTally.top, 24);
  assert.equal(wide.grid.top, 46);

  const [verdict, tally] = narrow.graphic;
  const lines = verdict.style.text.split('\n');
  assert.deepEqual(lines, [facts.slice(0, 3).join(' · '), facts[3]], 'the break replaces a separator');
  const column = 381 - 14 - (14 + 26);
  for (const line of lines) {
    assert.ok(line.length * 11 * .62 <= column, `"${line}" stays inside the ${column}px column`);
  }
  assert.equal(verdict.style.lineHeight, 14);
  assert.equal(tally.top, 24 + 14, 'the tally moves down one pitch');
  assert.equal(narrow.grid.top, 46 + 14, 'the figure moves down one pitch');
  assert.equal(tally.style.text, wideTally.style.text);
});

/* #455 — THE PROGRAMMED RULE ENDS AT THE AXIS TICK. It ran to 24px under the
   axis, through the tick labels 6px below it, so a tick at the programmed rate
   read "0.|60". It now stops at the x axis's own 4px tick, at both ranks. */
test('the programmed rule ends at the axis tick, above the tick labels, at both ranks', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');
  const data = { ...basal, estimate: { value: .74, lo: .6, hi: .92 } };
  for (const [clientWidth, plot, height] of [
    [480, { x: 14, y: 46, width: 426, height: 140 }, 240],
    [950, { x: 28, y: 76, width: 510, height: 150 }, 307],
  ]) {
    const option = entry.option('editorial', { data, surface: { clientWidth } });
    const api = {
      coord: ([x, y]) => [plot.x + ((x - option.xAxis.min) / (option.xAxis.max - option.xAxis.min)) * plot.width,
        plot.y + (y / option.yAxis.max) * plot.height],
      getWidth: () => clientWidth, getHeight: () => height,
    };
    const drawn = option.series.find(({ id }) => id === 'furniture')
      .renderItem({ coordSys: plot, dataIndex: 0 }, api).children;
    const rule = drawn.find(({ type, shape }) => type === 'rect' && shape.width === 1.5);
    const base = plot.y + plot.height;
    assert.ok(rule, `the ${clientWidth}px seat draws the rule`);
    assert.equal(rule.shape.y + rule.shape.height, base + option.xAxis.axisTick.length,
      `the rule ends at the axis tick in the ${clientWidth}px seat`);
    assert.ok(rule.shape.y + rule.shape.height < base + option.xAxis.axisLabel.margin,
      'the rule stops above the tick labels');
  }
});

/* A ROSTER CAN SPAN A PROFILE CHANGE. `analyze_basal` measures each night against
   the rate in force THAT night and stamps the direction it found; the roster
   carries both, and `current` carries today's. The chart used to anchor every
   night on the oldest night's rate and re-derive direction from the pixels, so a
   payload like this one drew, counted and read aloud a rate half its nights were
   never measured against — and the geometry could disagree with the served sign
   outright. */
test('the editorial tile honours a roster whose programmed rate moved', () => {
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');
  const night = (day, delivered, programmed, sign) => ({
    date: `2026-03-${String(day).padStart(2, '0')}`, t: `2026-03-${String(day).padStart(2, '0')}T05:30:00`,
    delivered_rate: delivered, programmed_rate: programmed, sign,
  });
  const data = {
    schema: 'diagnose-basal-night-evidence-v1', slot: 11, current: 0.90,
    estimate: { value: .95, lo: .88, hi: 1.08 }, asserts_move: false,
    safety_status: 'insufficient evidence', excluded_night_count: 2,
    excluded_night_reasons: excludedReasons({ above_range: 1, insulin_acting: 1 }),
    roster_count: 6, directional_support_count: 4,
    nights: [
      /* Three nights on the old 0.70 profile, then three on today's 0.90 —
         including one that ran 0.80: above its own rate, below the rule. */
      night(1, 0.86, 0.70, 1), night(2, 0.70, 0.70, null), night(3, 0.64, 0.70, -1),
      night(4, 1.02, 0.90, 1), night(5, 0.80, 0.90, -1), night(6, 0.95, 0.90, 1),
    ],
  };
  const option = entry.option('editorial', { data });
  const cells = option.series.find(({ id }) => id === 'nights');
  const byDate = new Map(cells.data.map((item) => [item.name, item]));

  /* Each night reports the rate IT was measured against, never today's. */
  assert.equal(byDate.get('2026-03-01').programmed, 0.70);
  assert.equal(byDate.get('2026-03-04').programmed, 0.90);
  assert.equal(cells.tooltip.formatter({ name: '2026-03-01', data: byDate.get('2026-03-01') }),
    '2026-03-01 — delivered 0.86 U/h · programmed 0.70');
  /* Direction is the served sign everywhere, so the night that ran 0.80 counts
     as LESS — it ran under the 0.90 in force for it — even though 0.80 sits
     above the old profile's rate and would have read as "more" off the pixels. */
  const railRows = option.series.find(({ id }) => id === 'rail')
    .renderItem({ dataIndex: 0 }, { getWidth: () => 950, getHeight: () => 307 }).children
    .map(({ style }) => style.text);
  assert.deepEqual(railRows, ['3', 'more than programmed', '2', 'less', '1', 'exactly as set',
    '2', 'excluded', '1', 'high', '1', 'insulin on board']);
  assert.match(option.aria.description, /3 more, 2 less, 1 exactly as set/);
  assert.match(option.aria.description,
    /at or above the rate programmed for that night on 4 of them/);
  /* The rule is today's rate, named as such — not a rate lifted off a night. */
  assert.match(option.aria.description, /programmed now 0\.90 U\/h/);
  /* Each cell is anchored on its own night's rate: the 0.80 night's cell runs
     from 0.90 down to 0.80, entirely right of nothing and left of its anchor. */
  const api = {
    coord: ([x]) => [28 + x * 400, 100],
    getWidth: () => 950, getHeight: () => 307,
  };
  const params = { coordSys: { x: 28, y: 80, width: 672, height: 147 }, dataIndex: 0 };
  for (const [date, anchor] of [['2026-03-01', 0.70], ['2026-03-05', 0.90]]) {
    const index = cells.data.findIndex((item) => item.name === date);
    const [body] = cells.renderItem({ ...params, dataIndex: index },
      { ...api, coord: ([x, y]) => [28 + x * 400, 80 + y * 20],
        value: (dimension) => cells.data[index].value[dimension] }).children;
    const edge = 28 + anchor * 400;
    assert.ok(Math.abs(body.shape.x - edge) <= 1 || Math.abs(body.shape.x + body.shape.width - edge) <= 1,
      `${date} is anchored on ${anchor}, not on today's rate`);
  }
  /* And the domain holds every anchor: a cell drawn from a rate off the scale
     would start from nowhere. */
  assert.ok(option.xAxis.min <= 0.64 && option.xAxis.max >= 1.02);
});

/* A night the analyzer could not compare is not a night that matched. */
test('the editorial tile counts unpaired nights apart from the ties', () => {
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');
  const night = (day, delivered, programmed, sign) => ({
    date: `2026-04-0${day}`, t: `2026-04-0${day}T05:30:00`,
    delivered_rate: delivered, programmed_rate: programmed, sign,
  });
  const data = {
    slot: 11, current: 0.80, excluded_night_count: 0, excluded_night_reasons: excludedReasons(),
    roster_count: 4,
    nights: [night(1, 0.80, 0.80, null), night(2, 0.90, 0.80, 1),
      /* No programmed samples that night: `sign` is null for the same reason a
         tie is, and only the missing rate tells them apart. */
      night(3, 0.83, null, null), night(4, 0.75, null, null)],
  };
  const option = entry.option('editorial', { data });
  const railRows = option.series.find(({ id }) => id === 'rail')
    .renderItem({ dataIndex: 0 }, { getWidth: () => 950, getHeight: () => 307 }).children
    .map(({ style }) => style.text);

  assert.match(option.aria.description, /1 more, 0 less, 1 exactly as set, 2 with no programmed rate on file/);
  assert.match(option.aria.description, /at or above the rate programmed for that night on 2 of them/);
  assert.deepEqual(railRows, ['1', 'more than programmed', '0', 'less', '1', 'exactly as set',
    '2', 'no programmed rate', '0', 'excluded'],
  'the unpaired nights get their own row rather than joining the ties, and no zero reason prints');
  assert.ok(railRows.every((row) => !row.includes('\n')), 'every rail row still sets on one line');
  const cells = option.series.find(({ id }) => id === 'nights');
  const unpaired = cells.data.find((item) => item.name === '2026-04-03');
  assert.equal(unpaired.programmed, null);
  assert.equal(cells.tooltip.formatter({ name: unpaired.name, data: unpaired }),
    '2026-04-03 — delivered 0.83 U/h · no programmed rate on file');
  /* They rank at the foot of the stack, having no departure to sort by. */
  assert.deepEqual(cells.data.map(({ name }) => name).slice(-2), ['2026-04-03', '2026-04-04']);
});

/* #434 — WHY THE NIGHTS WERE LEFT OUT. The analyzer stamps one reason on every
   excluded night; the tile reads the served breakdown through the one reason
   table and prints each nonzero reason beside the served total, summing and
   re-deriving nothing. */
const reasonScenario = () => ({
  ...fixture('./__fixtures__/basal-night-evidence.json').expected,
  excluded_night_count: 5,
  excluded_night_reasons: excludedReasons({ before_current_setting: 3,
    below_range_or_suspended: 1, insulin_acting: 1 }),
});
/* The full-furniture basal tile's canvas, measured on the served base desk
   (a4d374a7, the showcase's 12:30 slot, measured by the coordinator): 806x308 at
   1280x720 and 966x482 at 1440x900, both with the tally rail. The smaller
   height is the one a crowded rail has to fit (#434, measure-434-tile.json). */
const FULL_TILE_CANVAS_HEIGHT = 308;
const railBox = ({ style }) => {
  const size = Number(/(\d+)px/.exec(style.font)[1]);
  const lines = String(style.text).split('\n');
  const width = Math.max(...lines.map(({ length }) => length)) * size * .52;
  const height = lines.length * (style.lineHeight || size * 1.25);
  return { text: style.text, width, height,
    x: style.align === 'right' ? style.x - width : style.x,
    y: style.verticalAlign === 'middle' ? style.y - height / 2 : style.y };
};

test('the reason table reads the served breakdown in rank order and prints no zero', () => {
  /* Keys arrive in the reverse of rank order: the order printed is the table's. */
  const served = { other: 1, carb_log: 2, insulin_acting: 3, above_range: 4,
    below_range_or_suspended: 5, before_current_setting: 6 };
  assert.deepEqual(excludedNightReasons({ excluded_night_reasons: served }), [
    { key: 'before_current_setting', count: 6, words: 'before the current rate' },
    { key: 'below_range_or_suspended', count: 5, words: 'low or suspended' },
    { key: 'above_range', count: 4, words: 'high' },
    { key: 'insulin_acting', count: 3, words: 'insulin on board' },
    { key: 'carb_log', count: 2, words: 'logged carbs' },
    { key: 'other', count: 1, words: 'other reason' },
  ]);
  assert.deepEqual(excludedNightReasons({
    excluded_night_reasons: excludedReasons({ insulin_acting: 1, other: 2 }) }),
  [{ key: 'insulin_acting', count: 1, words: 'insulin on board' },
    { key: 'other', count: 2, words: 'other reasons' }]);
  assert.deepEqual(excludedNightReasons({ excluded_night_reasons: excludedReasons() }), []);
});

test('one night left out for another reason reads in the singular, two in the plural', () => {
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');
  for (const [count, words] of [[1, 'other reason'], [2, 'other reasons']]) {
    const data = { ...reasonScenario(), excluded_night_count: count,
      excluded_night_reasons: excludedReasons({ other: count }) };
    assert.deepEqual(excludedNightReasons(data), [{ key: 'other', count, words }]);
    const option = entry.option('editorial', { data });
    const texts = option.series.find(({ id }) => id === 'rail')
      .renderItem({ dataIndex: 0 }, { getWidth: () => 950, getHeight: () => 482 }).children
      .map(({ style }) => style.text);
    assert.deepEqual(texts.slice(texts.indexOf('excluded') - 1),
      [String(count), 'excluded', String(count), words], `the rail at ${count}`);
    assert.ok(option.aria.description.endsWith(
      `; ${count} night${count === 1 ? '' : 's'} excluded: ${count} ${words}`),
    `the description at ${count}: ${option.aria.description}`);
  }
});

test('the full rail names each served reason beneath the excluded total', () => {
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');
  const option = entry.option('editorial', { data: reasonScenario() });
  const drawn = option.series.find(({ id }) => id === 'rail')
    .renderItem({ dataIndex: 0 }, { getWidth: () => 950, getHeight: () => 482 }).children;
  const texts = drawn.map(({ style }) => style.text);

  assert.deepEqual(texts.slice(6), ['5', 'excluded', '3', 'before the current rate',
    '1', 'low or suspended', '1', 'insulin on board'],
  'the total keeps its own row and each nonzero reason follows, in rank order');
  assert.equal(texts.includes('excluded — not steady'), false, 'the retired label is gone');
  /* Where the rows fit, they stand at today's pitch. */
  assert.deepEqual(drawn.filter(({ style }) => style.align === 'right').map(({ style }) => style.y),
    [114, 138, 162, 200, 224, 248, 272]);
  assert.match(option.aria.description,
    /; 5 nights excluded: 3 before the current rate, 1 low or suspended, 1 insulin on board$/);
});

test('the middle-rank tally keeps the low-or-suspended count', () => {
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');
  const middle = entry.option('editorial', { data: reasonScenario(), surface: { clientWidth: 480 } });

  assert.match(middle.graphic[1].style.text, / · 5 excluded \(1 low or suspended\)$/);
});

test('a crowded tally fits the narrowest middle rank and keeps the low count', () => {
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');
  const night = (day, delivered, programmed, sign) => ({
    date: `2026-05-${String(day).padStart(2, '0')}`, t: `2026-05-${String(day).padStart(2, '0')}T05:30:00`,
    delivered_rate: delivered, programmed_rate: programmed, sign,
  });
  const nights = [
    ...Array.from({ length: 10 }, (_, index) => night(index + 1, 0.9, 0.8, 1)),
    ...Array.from({ length: 3 }, (_, index) => night(index + 11, 0.7, 0.8, -1)),
    night(14, 0.8, 0.8, null), night(15, 0.85, null, null), night(16, 0.75, null, null),
  ];
  const data = { slot: 11, current: 0.8, roster_count: 16, excluded_night_count: 14,
    excluded_night_reasons: excludedReasons({ below_range_or_suspended: 12, above_range: 1, other: 1 }),
    nights };
  const seat = 480;
  const option = entry.option('editorial', { data, surface: { clientWidth: seat } });
  const tally = option.graphic[1];
  const lines = tally.style.text.split('\n');
  const size = Number(/(\d+)px/.exec(tally.style.font)[1]);

  assert.equal(lines.join(' '), '16 steady nights · 10 more · 3 less · 1 as set · 2 unpaired'
    + ' · 14 excluded (12 low or suspended)', 'every token keeps its words and order');
  assert.ok(size >= 9, `the tally is set no smaller than the design system's 9px, not ${size}px`);
  for (const line of lines) {
    assert.ok(tally.left >= 14 && tally.left + line.length * size * .52 <= seat - 14,
      `"${line}" runs past the ${seat}px seat's side margins at ${size}px`);
  }
});

test('a crowded rail stays legible at the measured full-size tile height', () => {
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');
  const night = (day, delivered, programmed, sign) => ({
    date: `2026-06-0${day}`, t: `2026-06-0${day}T05:30:00`,
    delivered_rate: delivered, programmed_rate: programmed, sign,
  });
  const data = { slot: 11, current: 0.8, roster_count: 7, excluded_night_count: 21,
    excluded_night_reasons: excludedReasons({ before_current_setting: 6, below_range_or_suspended: 5,
      above_range: 4, insulin_acting: 3, carb_log: 2, other: 1 }),
    nights: [night(1, 0.9, 0.8, 1), night(2, 0.95, 0.8, 1), night(3, 1.0, 0.8, 1),
      night(4, 0.7, 0.8, -1), night(5, 0.65, 0.8, -1), night(6, 0.8, 0.8, null),
      /* The night with no programmed rate adds the tally's fourth row. */
      night(7, 0.85, null, null)],
  };
  const option = entry.option('editorial', { data });
  const [width, height] = [950, FULL_TILE_CANVAS_HEIGHT];
  const plot = { x: 28, y: option.grid.top, width: width - option.grid.left - option.grid.right,
    height: height - option.grid.top - option.grid.bottom };
  const api = {
    coord: ([x, y]) => [plot.x + ((x - option.xAxis.min) / (option.xAxis.max - option.xAxis.min)) * plot.width,
      plot.y + (y / option.yAxis.max) * plot.height],
    getWidth: () => width, getHeight: () => height,
  };
  const drawn = option.series.find(({ id }) => id === 'rail').renderItem({ dataIndex: 0 }, api).children;

  assert.deepEqual(drawn.map(({ style }) => style.text), [
    '3', 'more than programmed', '2', 'less', '1', 'exactly as set', '1', 'no programmed rate',
    '21', 'excluded', '6', 'before the current rate', '5', 'low or suspended', '4', 'high',
    '3', 'insulin on board', '2', 'logged carbs', '1', 'other reason',
  ], 'every rail row prints');
  /* The rail's own head blocks are rail text too: the table must clear them. */
  const heads = option.graphic.filter(({ style }) => style?.width === 206 && style.font)
    .map(({ top, style }) => {
      const size = Number(/(\d+)px/.exec(style.font)[1]);
      const textWidth = String(style.text).length * size * .52;
      return { text: style.text, x: width - 28 - textWidth, y: top, width: textWidth, height: size * 1.25 };
    });
  const boxes = [...heads, ...drawn.map(railBox)];
  for (const [index, box] of boxes.entries()) {
    for (const other of boxes.slice(index + 1)) {
      assert.ok(box.x >= other.x + other.width || other.x >= box.x + box.width
        || box.y >= other.y + other.height || other.y >= box.y + box.height,
      `"${box.text}" overlaps "${other.text}"`);
    }
  }
  const furniture = option.series.find(({ id }) => id === 'furniture')
    .renderItem({ coordSys: plot, dataIndex: 0 }, api).children;
  const footer = furniture.find(({ type, shape }) => type === 'rect' && shape.y === height - 28);
  assert.ok(footer, 'the footer rule is drawn at the canvas foot');
  const railRules = furniture.filter(({ type, shape }) => type === 'rect' && shape.width === 206 && shape.height === 1);
  assert.equal(railRules.length, 2, 'the table head rule and the rule above the excluded total');
  for (const box of drawn.map(railBox)) {
    assert.ok(box.y + box.height <= footer.shape.y, `"${box.text}" crosses the footer rule`);
    for (const { shape } of railRules) {
      assert.ok(box.y + box.height <= shape.y || box.y >= shape.y + 1,
        `"${box.text}" is struck through by the rail rule at ${shape.y}`);
    }
  }
});

test('the editorial staircase tolerates an absent estimate at both ranks', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');

  assert.equal(Object.hasOwn(basal, 'estimate'), true, 'the fixture carries the analyzer estimate');
  for (const data of [basal, { ...basal, estimate: null },
    { ...basal, estimate: { value: null, lo: null, hi: null } }, { ...basal, nights: [] }]) {
    assert.doesNotThrow(() => entry.option('editorial', { data }));
    assert.doesNotThrow(() => entry.option('editorial', { data, mini: true }));
  }
  const bare = entry.option('editorial', { data: basal });
  assert.equal(JSON.stringify(bare.graphic).includes('range '), true,
    'the served interval is printed');
  assert.equal(bare.series.some(({ id }) => id === 'furniture'), true,
    'the plot furniture still draws without an interval');
});

/* The tile's page furniture — rules, rail hairlines, the interval shadow, the
   cliff, the callouts — is drawn from pixels the renderer hands back, so nothing
   about it is visible in the option alone. Driving renderItem against a stub
   coordinate system is the only way the dependency-free gate sees that path at
   all, and it is the path an absent interval or an absent programmed rate walks
   a different way through. */
test('the editorial furniture draws against every payload shape', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');
  const api = {
    coord: ([x, y]) => [28 + x * 400, 244 - y * 8],
    getWidth: () => 950,
    getHeight: () => 330,
  };
  const params = { coordSys: { x: 28, y: 88, width: 640, height: 156 }, dataIndex: 0 };
  const shapes = [
    basal,
    { ...basal, estimate: { value: .74, lo: .6, hi: .92 } },
    { ...basal, estimate: null },
    { ...basal, nights: basal.nights.map((night) => ({ ...night, programmed_rate: null })) },
    /* A roster that spans a profile change, and one that mixes in nights the
       analyzer had no rate to compare against. */
    { ...basal, current: .9,
      nights: basal.nights.map((night, index) => ({ ...night,
        programmed_rate: index % 2 ? .9 : .6, sign: index % 2 ? -1 : 1 })) },
    { ...basal,
      nights: basal.nights.map((night, index) => (index % 3
        ? night : { ...night, programmed_rate: null, sign: null })) },
  ];
  for (const data of shapes) {
    for (const mini of [false, true]) {
      const option = entry.option('editorial', { data, mini });
      assert.equal(option.series.some(({ type }) => type === 'line'), false,
        `the ${mini ? 'mini' : 'full'} rank draws no mark spanning more than one night`);
      const furniture = option.series.find(({ id }) => id === 'furniture');
      const drawn = furniture.renderItem(params, api);
      assert.equal(drawn.type, 'group');
      assert.ok(drawn.children.every((child) => typeof child.type === 'string'
        && Number.isFinite(child.shape?.x ?? child.shape?.x1 ?? child.style?.x ?? 0)));
      /* And every night cell: one row of the stack, anchored on the rate
         programmed for THAT night and extending only as far as it departed from
         it. Nothing grows from a shared baseline, so a cell's own end is the
         only thing its width can mean — and a night the analyzer had no
         programmed rate for is marked where it ran, having no delta to draw. */
      const cells = option.series.find(({ id }) => id === 'nights');
      for (const [index, item] of (cells?.data || []).entries()) {
        const boxes = cells.renderItem({ ...params, dataIndex: index },
          { ...api, value: (dimension) => item.value[dimension] }).children;
        const [body] = boxes;
        /* A signed night is anchored on the rate it was measured against — its
           own where it has one, today's where a served sign leaves no other
           anchor. A night with no rate on file was never compared, so it is
           marked where it ran instead of against a rule it never met. */
        const served = data.nights.find(({ date }) => date === item.name);
        const ran = api.coord([item.value[0], 0])[0];
        const anchored = [item.programmed, ...(served.sign === null ? [] : [data.current])]
          .filter(Number.isFinite).map((rate) => api.coord([rate, 0])[0]);
        assert.ok(anchored.length
          ? anchored.some((anchor) => Math.abs(body.shape.x - anchor) <= 5
            || Math.abs(body.shape.x + body.shape.width - anchor) <= 5)
          : Math.abs(body.shape.x + body.shape.width / 2 - ran) <= 5,
        `the cell for ${item.name} is anchored on a rate it was measured against`);
        assert.ok(boxes.length > 0, 'a night is drawn as at least one cell');
        for (const cell of boxes) {
          assert.ok(cell.shape.height > 0 && cell.shape.width >= 0);
          assert.ok(cell.shape.y >= params.coordSys.y - 1
            && cell.shape.y + cell.shape.height <= params.coordSys.y + params.coordSys.height + 1,
          'a night cell stays inside the plot');
        }
      }
    }
  }
});

/* THE COLLISION THE SWEEP CAUGHT, held open. Under the harness's held edge
   payload the programmed rule sits far right, and a label hung off it ran out of
   the plot and into the tally rail; a crossing at the ceiling put another one
   through the rule's own flag. Nothing on this canvas reflows, so the guard is
   arithmetic: every label hung off a mark is measured, mirrored to the mark's
   other side when it would overrun, and kept out of the flag's band. */
test('editorial labels stay inside the plot and clear of each other (held payload)', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');
  const night = (delivered, sign) => ({ date: `2026-02-0${sign + 2}`, delivered_rate: delivered,
    programmed_rate: .72, sign, t: '2026-02-01T00:00:00' });
  const held = { ...basal, slot: 'edge-hold', excluded_night_count: 0, asserts_move: false,
    safety_status: 'held (recurring-low gate)',
    nights: [night(.62, -1), night(.61, -1), night(.72, null)] };
  /* A roster spanning a profile change puts cells on both sides of the rule, so
     the two quadrants the crossing label used to rely on are no longer empty. */
  const moved = { ...basal, current: .9, excluded_night_count: 1,
    nights: [{ ...night(1.02, 1), programmed_rate: .9 }, { ...night(.64, -1), programmed_rate: .7 },
      { ...night(.7, null), programmed_rate: .7 }, { ...night(.8, -1), programmed_rate: .9 }] };
  const plot = { x: 28, y: 80, width: 672, height: 147 };
  for (const data of [held, moved, { ...basal, estimate: { value: .74, lo: .6, hi: .92 } }]) {
    const option = entry.option('editorial', { data });
    /* Rank one is the top row, so the stub counts downward like the axis. */
    const api = {
      coord: ([x, y]) => [plot.x + ((x - option.xAxis.min) / (option.xAxis.max - option.xAxis.min)) * plot.width,
        plot.y + (y / option.yAxis.max) * plot.height],
      getWidth: () => 950, getHeight: () => 307,
    };
    const boxes = option.series.find(({ id }) => id === 'furniture')
      .renderItem({ coordSys: plot, dataIndex: 0 }, api).children
      .filter(({ type }) => type === 'text')
      .map(({ style }) => {
        const lines = String(style.text).split('\n');
        const size = Number(/(\d+)px/.exec(style.font)[1]);
        const width = Math.max(...lines.map(({ length }) => length)) * size * .52;
        const height = lines.length * (style.lineHeight || size * 1.25);
        return { text: style.text, width, height,
          x: style.align === 'right' ? style.x - width : style.x,
          y: style.verticalAlign === 'bottom' ? style.y - height : style.y };
      });
    for (const box of boxes) {
      assert.ok(box.x + box.width <= plot.x + plot.width + 2,
        `"${box.text}" runs out of the plot and into the rail`);
      /* The rank ruler is named in the left margin — outside the plot, because
         the cells no longer start at its edge — but never off the canvas. */
      assert.ok(box.x >= 8, `"${box.text}" runs off the left of the canvas`);
    }
    /* THE NIGHTS ARE OBSTACLES NOW. Anchored on the rule, the cells occupy the
       middle of the plot where labels used to be safe — the rule's own flag was
       sitting in the top row's band the moment the cells stopped growing from
       the left edge — so every label is measured against every cell, not only
       against the other labels. */
    const cells = option.series.find(({ id }) => id === 'nights');
    const marks = cells.data.flatMap((item, index) => cells
      .renderItem({ coordSys: plot, dataIndex: index },
        { ...api, value: (dimension) => item.value[dimension] }).children
      .filter(({ type }) => type === 'rect')
      .map(({ shape }) => ({ text: `the cell for ${item.name}`, x: shape.x, y: shape.y,
        width: shape.width, height: shape.height })));
    for (const [index, box] of boxes.entries()) {
      for (const other of [...boxes.slice(index + 1), ...marks]) {
        assert.ok(box.x >= other.x + other.width || other.x >= box.x + box.width
          || box.y >= other.y + other.height || other.y >= box.y + box.height,
        `"${box.text}" collides with "${other.text}"`);
      }
    }
    for (const cell of marks) {
      assert.ok(cell.height > 0 && cell.width > 0, `${cell.text} has no extent`);
      assert.ok(cell.y >= plot.y - 1 && cell.y + cell.height <= plot.y + plot.height + 1,
        `${cell.text} leaves the plot`);
    }
  }
  /* A slot the payload never numbered prints no window rather than NaN:NaN. */
  const option = entry.option('editorial', { data: held });
  assert.doesNotMatch(JSON.stringify(option.graphic), /NaN/);
  assert.doesNotMatch(option.aria.description, /NaN/);
});

/* The figure read aloud is its crossing and its tally, not the standing roster
   line the other basal modes carry. */
test('the editorial reading names the crossing, the tally and the exclusions', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');
  const more = basal.nights.filter(({ sign }) => sign === 1).length;
  const asSet = basal.nights.filter(({ sign }) => sign === null).length;
  const { description } = entry.option('editorial', { data: basal }).aria;

  /* The reading names the night's own basis, never one rate standing in for a
     roster: each night is measured against the rate programmed for THAT night,
     and today's schedule is named separately as the rule the figure draws. */
  assert.match(description,
    new RegExp(`at or above the rate programmed for that night on ${more + asSet} of them`));
  assert.match(description, new RegExp(`${more} more, 0 less, ${asSet} exactly as set`));
  assert.match(description, /programmed now 0\.60 U\/h/);
  assert.match(description, new RegExp(`${basal.excluded_night_count} night excluded`));
  /* One night, in the singular, and the served reason it was left out for. */
  assert.match(description, /; 1 night excluded: 1 insulin on board$/);
});

test('every multi-series evidence form carries an on-chart legend', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const isf = fixture('../mockups/diagnose-workstation.synthetic/isf-rest-window-evidence.capture.json').payload;
  const ic = fixture('../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json')
    .cases.directional_only;
  const byKind = Object.fromEntries(DIAGNOSE_EVIDENCE_CHARTS.map((entry) => [entry.kind, entry]));
  const options = [
    byKind.basal.option(null, { data: basal }),
    byKind.isf.option('clock', { data: isf }),
    byKind.isf.option('event', { data: isf }),
    byKind['carb-ratio'].option('overview', { data: ic }),
  ];

  const legends = options.slice(1).flatMap(({ legend }) => [legend].flat());
  assert.ok(legends.every((legend) => legend?.show === true));
  assert.ok(legends.every((legend) => legend.data.length > 0));
  assert.equal(options[0].legend.show, false);
  assert.ok(options[0].graphic.length > 0, 'the basal editorial treatment uses its instrument ledger in place of a legend');
});

/* The correction-factor feed serves no fit, so its chart draws none. The
   carb-ratio block (v2) serves its programmed ratio, its recommendation and its
   estimate with the estimate's range, so its tile draws each exactly as served
   — and draws none it was not served. */
test('evidence forms draw the fit and current-setting values they are served, as served', () => {
  const isf = fixture('../mockups/diagnose-workstation.synthetic/isf-rest-window-evidence.capture.json').payload;
  const byKind = Object.fromEntries(DIAGNOSE_EVIDENCE_CHARTS.map((entry) => [entry.kind, entry]));

  assert.deepEqual(Object.keys(isf).sort(), ['counts', 'finding', 'schema', 'steps', 'windows']);
  assert.ok(isf.steps.every((step) => !Object.hasOwn(step, 'fit')));
  assert.deepEqual(byKind.isf.option('event', { data: isf }).series
    .map(({ name }) => name), ['Qualifying fasting steps']);
  assert.deepEqual(byKind.isf.option('clock', { data: isf }).series
    .map(({ name }) => name), ['Qualifying fasting steps']);
  for (const [name, ic] of Object.entries(fixture(
    '../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json').cases)) {
    assert.ok(Object.hasOwn(ic.block, 'current'), `premise: ${name} serves its programmed ratio`);
    const { block } = ic;
    const rules = byKind['carb-ratio'].option('overview', { data: ic }).series
      .find(({ id }) => id === 'ic:rules');
    assert.deepEqual(rules.markLine.data.map(({ name: rule, xAxis }) => [rule, xAxis]), [
      ['programmed', block.current], ['recommended', block.recommendation?.value],
      ['estimate', block.estimate?.value],
    ].filter(([, value]) => Number.isFinite(value)), `${name} draws each served ratio as served`);
    const ranged = Number.isFinite(block.estimate?.lo) && Number.isFinite(block.estimate?.hi);
    assert.deepEqual(rules.markArea?.data ?? null,
      ranged ? [[{ xAxis: block.estimate.lo }, { xAxis: block.estimate.hi }]] : null,
      `${name} draws the served range and no other`);
  }
});

test('surface copy says Carb ratio rather than the engine abbreviation', () => {
  const ic = fixture('../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json')
    .cases.directional_only;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'carb-ratio');
  const option = entry.option('overview', { data: ic });
  const visible = JSON.stringify({
    name: entry.name,
    meta: entry.meta(null),
    overview: option,
    legend: option.legend.map((legend) => legend.data.map(({ name }) =>
      (legend.formatter ? legend.formatter(name) : name))),
    tooltip: ic.runs.map((run) => option.tooltip.formatter({ data: { runId: run.run_id } })),
    thumbnail: entry.thumbnail(ic),
  });

  assert.doesNotMatch(visible, /I:C/);
  assert.match(visible, /Carb ratio/);
});

test('chart options resolve live theme tokens', () => {
  const prior = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle };
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const isf = fixture('../mockups/diagnose-workstation.synthetic/isf-rest-window-evidence.capture.json').payload;
  const ic = fixture('../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json')
    .cases.directional_only;
  const event = eventCase();
  const byKind = Object.fromEntries(DIAGNOSE_EVIDENCE_CHARTS.map((entry) => [entry.kind, entry]));
  const build = (tokens) => {
    globalThis.document = { documentElement: {} };
    globalThis.getComputedStyle = () => ({
      getPropertyValue: (name) => tokens[name] || '',
    });
    return {
      basal: byKind.basal.option(null, { data: basal }),
      isf: byKind.isf.option('event', { data: isf }),
      ic: byKind['carb-ratio'].option('overview', { data: ic }),
      event: byKind['event-comparison'].option(null, { data: event, range: [60, 240] }),
      thumbnail: byKind.basal.thumbnail(basal),
    };
  };
  const luminance = (hex) => {
    const channels = hex.match(/[0-9a-f]{2}/gi).map((value) => parseInt(value, 16) / 255)
      .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
  };
  const contrast = (foreground, background) => {
    const [lighter, darker] = [luminance(foreground), luminance(background)]
      .sort((a, b) => b - a);
    return (lighter + .05) / (darker + .05);
  };
  try {
    const light = build({ '--text': '#141a15', '--muted': '#3d5848',
      '--line': '#c3bfb4', '--in-range': '#3f5a3b', '--basal': '#5d7368',
      '--secondary': '#4d5c53', '--warn': '#8d3c17', '--notindata': '#6b7169',
      '--surface': '#faf8f4', '--primary': '#a94f21', '--accent': '#a94f21',
      '--ok': '#5d7368', '--danger': '#9d3018', '--manual-carb': '#a94f21',
      // the comparison draws on the cockpit's own token names
      '--mk-muted': '#3d5848', '--mk-line': '#c3bfb4', '--mk-ok': '#5d7368' });
    const dark = build({ '--text': '#f5ece0', '--muted': '#a3968a',
      '--line': '#4d4742', '--in-range': '#86ad78', '--basal': '#a89a85',
      '--secondary': '#a89a85', '--warn': '#c98a4e', '--notindata': '#8d8579',
      '--surface': '#26221f', '--primary': '#e07f3f', '--accent': '#d08150',
      '--ok': '#9aada1', '--danger': '#ec6f55', '--manual-carb': '#d2743e',
      '--mk-muted': '#a3968a', '--mk-line': '#4d4742', '--mk-ok': '#9aada1' });
    assert.equal(light.basal.xAxis.axisLabel.color, '#3d5848');
    assert.equal(dark.basal.xAxis.axisLabel.color, '#a3968a');
    assert.equal(light.isf.series[0].itemStyle.color, '#3f5a3b');
    assert.equal(dark.isf.series[0].itemStyle.color, '#86ad78');
    /* The carb-ratio tile's runs are in the text ink and its estimate in the
       data ink, both resolved live. */
    const estimateInk = (option) => option.series.find(({ id }) => id === 'ic:rules')
      .markLine.data.find(({ name }) => name === 'estimate').lineStyle.color;
    const dotInk = (option) => option.series.find(({ id }) => id === 'ic:dots:whole').itemStyle.color;
    assert.equal(estimateInk(light.ic), '#3f5a3b');
    assert.equal(estimateInk(dark.ic), '#86ad78');
    assert.equal(dotInk(light.ic), '#141a15');
    assert.equal(dotInk(dark.ic), '#f5ece0');
    assert.equal(light.event.yAxis.axisLabel.color, '#3d5848');
    assert.equal(dark.event.yAxis.axisLabel.color, '#a3968a');
    assert.equal(light.thumbnail.graphic[0].style.fill, '#3d5848');
    assert.equal(dark.thumbnail.graphic[0].style.fill, '#a3968a');
    assert.ok(contrast('#3d5848', '#faf8f4') >= 4.5);
    assert.ok(contrast('#a3968a', '#26221f') >= 4.5);
  } finally {
    globalThis.document = prior.document;
    globalThis.getComputedStyle = prior.getComputedStyle;
  }
});

/* #304 retired the app's Light theme, so the five Dark/Light constant pairs
   this module used to pick between (`colors.dark ? a : b`) are now the Dark
   arm alone, with no `document.documentElement.classList` read to select it.
   Pinning the rendered fills and strokes here means a reintroduced Light arm
   — or a stray `colors.dark` read — fails this test rather than silently
   reappearing. */
test('the editorial furniture renders the Dark-only fills and strokes (#304)', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');
  const data = { ...basal, estimate: { value: .74, lo: .6, hi: .92 } };
  const option = entry.option('editorial', { data });

  assert.match(JSON.stringify(option.xAxis.axisTick.lineStyle.color),
    /color-mix\(in srgb, .* 18%, transparent\)/,
    'the axis tick keeps the inlined Dark hairline percentage');

  const api = { coord: ([x, y]) => [28 + x * 400, 244 - y * 8], getWidth: () => 950, getHeight: () => 330 };
  const params = { coordSys: { x: 28, y: 88, width: 640, height: 156 }, dataIndex: 0 };
  const furnitureFills = option.series.find(({ id }) => id === 'furniture')
    .renderItem(params, api).children.map(({ style }) => style?.fill).filter(Boolean);
  assert.ok(furnitureFills.some((fill) => /18%, transparent\)$/.test(fill)),
    'the hairline rules render at the inlined 18% mix');
  assert.ok(furnitureFills.some((fill) => /26%, transparent\)$/.test(fill)),
    'the interval shadow renders at the inlined 26% mix');

  const signed = { ...basal, nights: [
    { date: '2026-03-04', delivered_rate: .9, programmed_rate: .6, sign: 1, t: '2026-03-04T05:30:00' },
    { date: '2026-03-05', delivered_rate: .4, programmed_rate: .6, sign: -1, t: '2026-03-05T05:30:00' },
  ] };
  const signedOption = entry.option('editorial', { data: signed });
  const cells = signedOption.series.find(({ id }) => id === 'nights');
  const moreIndex = cells.data.findIndex((item) => item.name === '2026-03-04');
  const lessIndex = cells.data.findIndex((item) => item.name === '2026-03-05');
  const moreFill = cells.renderItem({ ...params, dataIndex: moreIndex },
    { ...api, value: (dimension) => cells.data[moreIndex].value[dimension] }).children[0].style.fill;
  const lessFill = cells.renderItem({ ...params, dataIndex: lessIndex },
    { ...api, value: (dimension) => cells.data[lessIndex].value[dimension] }).children[0].style.fill;
  assert.match(moreFill, /34%, transparent\)$/,
    'a night that ran more than programmed fills at the inlined Dark 34% rust mix');
  assert.match(lessFill, /24%, transparent\)$/,
    'a night that ran less than programmed fills at the inlined Dark 24% grey mix');
});

test('payload counts stay distinct in chart and thumbnail presentation', () => {
  const basal = {
    roster_count: 19, directional_support_count: 3, nights: [],
    asserts_move: false, safety_status: 'insufficient evidence', slot: 0,
  };
  const isf = {
    counts: { detected_windows: 7, qualifying_windows: 2, qualifying_steps: 41 },
    windows: [], steps: [], finding: { asserts_move: false, direction: null },
  };
  const ic = {
    block: { label: 'Overnight', examined_runs: 11, support: 4, excluded_runs: 7,
      start_min: 1200, end_min: 420, run_ends: { n: 3 },
      support_detail: { whole_runs: 2, fractional_run_ownership: 1.5 } },
    harm_evidence: { groups: { counted_run: 5, uncounted_run: 6, not_a_meal_run: 8 }, lows: [] },
    runs: [], series: [],
  };
  const byKind = Object.fromEntries(DIAGNOSE_EVIDENCE_CHARTS.map((entry) => [entry.kind, entry]));

  assert.match(byKind.basal.option(null, { data: basal, mini: false }).aria.description,
    /0 steady nights/);
  assert.match(byKind.isf.option('event', { data: isf, mini: false }).aria.description,
    /7 detected.*2 qualifying windows.*41 qualifying steps/);
  assert.match(byKind['carb-ratio'].option('overview', { data: ic, mini: false }).aria.description,
    /^3 counted meal runs: 2 counted whole, 1\.5 .*: 5 on counted runs, 6 on runs not counted, 8 after/);
  assert.equal(byKind.basal.thumbnail(basal).graphic[1].style.text, '19 / 3');
  assert.equal(byKind.isf.thumbnail(isf).graphic[1].style.text, '7 / 2 / 41');
  assert.equal(byKind['carb-ratio'].thumbnail(ic).graphic[1].style.text, '11 / 4');
});

test('glucose projections expose served values and thumbnails have no axis furniture', () => {
  const event = eventCase();
  const byKind = Object.fromEntries(DIAGNOSE_EVIDENCE_CHARTS.map((entry) => [entry.kind, entry]));

  assert.equal(byKind.basal.glucoseValues, null);
  assert.equal(byKind.isf.glucoseValues, null);
  assert.equal(byKind['carb-ratio'].glucoseValues, null,
    'the carb-ratio tile keeps its own glucose scale, so it widens no other tile\'s');
  const servedMedian = event.projection.cohorts
    .flatMap((cohort) => cohort.points).find((point) => point.median !== null).median;
  assert.ok(byKind['event-comparison'].glucoseValues(event).includes(servedMedian),
    'the comparison reports the medians the case file serves');
  for (const entry of DIAGNOSE_EVIDENCE_CHARTS) {
    if (entry.kind === 'eating-sequence') {
      const data = expandSequenceFixture(fixture('../mockups/eating-sequence-findings.synthetic/payload.json'))
        .states.repeat_eating_empty.windows.global.cases['finding:repeat_eating'].event;
      const thumb = entry.thumbnail(data);
      assert.ok(thumb.xAxis.every((axis) => axis.axisLabel.show === false));
      assert.ok(thumb.yAxis.every((axis) => axis.axisLabel.show === false));
      assert.equal(thumb.tooltip.show, false);
      continue;
    }
    const thumbData = entry.kind === 'basal' ? { roster_count: 0, directional_support_count: 0, nights: [] }
      : entry.kind === 'isf' ? { counts: { detected_windows: 0, qualifying_windows: 0,
        qualifying_steps: 0 }, windows: [], steps: [] }
        : entry.kind === 'carb-ratio' ? { block: { examined_runs: 0, support: 0 }, runs: [], series: [] }
          : entry.kind === 'pattern-case-file' ? projectPatternCaseFile(
            fixture('../mockups/diagnose-event-comparison.synthetic/capture.json'), {
              patternChart: { key: 'highs_after_meals' },
            }) : event;
    const thumbnail = entry.thumbnail(thumbData);
    assert.equal(thumbnail.xAxis.show, false);
    assert.equal(thumbnail.yAxis.show, false);
    assert.match(thumbnail.graphic[0].style.font, /600/);
    assert.match(thumbnail.graphic[1].style.font, /monospace/);
  }
});

test('the event-comparison entry draws the shipped cohort series at the injected range', () => {
  const event = eventCase();
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'event-comparison');
  const option = entry.option(null, { data: event, range: [80, 240] });

  assert.equal(option.yAxis.min, 80);
  assert.equal(option.yAxis.max, 240);
  assert.deepEqual([option.xAxis.min, option.xAxis.max], event.projection.window_min,
    'the event window is the served one');
  /* The tile is the same draw as the shipped mount: one median line and one
     spread per served cohort support, keyed by the cohort the server named. */
  const supported = event.projection.cohorts
    .filter((cohort) => cohort.points.some((point) => point.support === 'supported'));
  assert.ok(supported.length > 0, 'the fixture serves at least one supported cohort');
  for (const cohort of supported) {
    const line = option.series.find((series) => series.id === `${cohort.key}:line:supported`);
    assert.equal(line.name, cohort.name);
    assert.equal(line.data.length, cohort.points.length);
    assert.ok(option.series.some((series) => series.id === `${cohort.key}:spread:supported`));
  }
  assert.ok(option.series.some((series) => series.name === 'Target range'),
    'the target rails ride with the traces');
});

test('the event-comparison entry carries the dock mini rank through the registry', () => {
  const event = eventCase();
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'event-comparison');
  const option = entry.option(null, { data: event, range: [80, 240], mini: true });

  assert.deepEqual(option.grid, { left: 6, right: 6, top: 6, bottom: 6 });
  assert.equal(option.tooltip.show, false);
  assert.equal(option.xAxis.axisLabel.show, false);
  assert.equal(option.yAxis.axisLabel.show, false);
  assert.equal(option.series.some((series) => /:episode:|selected:trace/.test(series.id || '')), false);
});

test('the shipped event-comparison mount derives its axis from rendered cohort glucose', () => {
  const prior = {
    window: globalThis.window,
    ResizeObserver: globalThis.ResizeObserver,
    getComputedStyle: globalThis.getComputedStyle,
  };
  let mountedOption;
  const chart = {
    setOption: (option) => { mountedOption = option; },
    on() {}, getZr: () => ({ on() {} }), resize() {}, dispose() {},
  };
  const key = { dataset: {}, innerHTML: '',
    insertAdjacentHTML: (_position, html) => { key.innerHTML += html; } };
  const chartElement = { addEventListener() {}, setAttribute() {} };
  const surface = {
    innerHTML: '',
    querySelector: (selector) => selector === '#ec-chart-key' ? key : chartElement,
  };
  globalThis.window = { echarts: { init: () => chart } };
  globalThis.ResizeObserver = class { observe() {} };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#3d5848' });
  try {
    const event = eventCase();
    renderEventSurface(surface, event);
    assert.deepEqual([mountedOption.yAxis.min, mountedOption.yAxis.max], GLUCOSE_ENVELOPE,
      'served values inside the envelope leave the resting axis alone');

    /* One cohort median above the envelope must widen the mount's own axis —
       the axis is read off what this surface draws, not off a constant. */
    const widened = JSON.parse(JSON.stringify(event));
    const point = widened.projection.cohorts
      .flatMap((cohort) => cohort.points).find((row) => row.median !== null);
    point.median = 265;
    renderEventSurface(surface, widened);
    assert.deepEqual([mountedOption.yAxis.min, mountedOption.yAxis.max],
      [GLUCOSE_ENVELOPE[0], 280]);

    const highCarb = structuredClone(event);
    highCarb.projection = { ...highCarb.projection,
      schema: 'high-carb-sequence-response-v1', scope: 'pooled', period: 'post_6h',
      source_window: expandSequenceFixture(fixture('../mockups/eating-sequence-findings.synthetic/payload.json'))
        .states.high_carb_sequence_empty.windows.global.cases['finding:high_carb_sequence']
        .event.projection.response.source_window };
    renderEventSurface(surface, highCarb, { range: [80, 240] });
    assert.match(key.innerHTML, /Source population · Sequences at all times of day · 30 days · Next 6 h/);
    assert.deepEqual([mountedOption.yAxis.min, mountedOption.yAxis.max], [80, 240],
      'the focal surface preserves its injected shared range');
    highCarb.projection.scope = 'evening';
    renderEventSurface(surface, highCarb);
    assert.match(key.innerHTML, /Source population · Evening sequences · 30 days · Next 6 h/);
    assert.doesNotMatch(key.innerHTML, /pooled|evening scope/);
  } finally {
    globalThis.window = prior.window;
    globalThis.ResizeObserver = prior.ResizeObserver;
    globalThis.getComputedStyle = prior.getComputedStyle;
  }
});

test('a selected occurrence and a withheld cohort keep their own shipped series', () => {
  const cases = caseFiles().cases['finding:carb_undercount'];
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'event-comparison');
  const [selectedId] = Object.keys(cases.selected_event);
  const selected = cases.selected_event[selectedId];

  const withoutSelection = entry.option(null, { data: cases.event, range: [60, 240] });
  assert.ok(!withoutSelection.series.some((series) => series.id === 'selected:trace'),
    'an unselected case file draws no focus trace');

  const withSelection = entry.option(null, { data: selected, range: [60, 240] });
  const trace = withSelection.series.find((series) => series.id === 'selected:trace');
  assert.equal(trace.data.length, selected.selection.detail.glucose.length);

  /* A withheld cohort has no average to draw, so it contributes no median line
     — the server's withholding is carried, never averaged around. */
  const withheld = cases.event.projection.cohorts
    .filter((cohort) => cohort.support === 'withheld');
  assert.ok(withheld.length > 0, 'the fixture serves a withheld cohort');
  for (const cohort of withheld) {
    assert.ok(!withoutSelection.series.some((series) =>
      series.id === `${cohort.key}:line:supported`));
  }
});

test('a selected occurrence trace never changes the field range', () => {
  const cases = caseFiles().cases['finding:carb_undercount'];
  const [selectedId] = Object.keys(cases.selected_event);
  const selected = structuredClone(cases.selected_event[selectedId]);
  selected.selection.detail.glucose[0].bg = 360;
  const descriptor = (data) => ({ chartId: 'finding:carb_undercount',
    kind: 'event-comparison', state: 'ok', data });

  assert.deepEqual(
    fieldRange([descriptor(cases.event)], DIAGNOSE_EVIDENCE_CHARTS, glucoseRange),
    fieldRange([descriptor(selected)], DIAGNOSE_EVIDENCE_CHARTS, glucoseRange),
    'selection-only glucose cannot rescale the shared mini field',
  );
});

/* The other half of that ruling (#367). The field range excludes the selection,
   and the `!mini` branch draws it anyway — so the branch that draws the trace is
   the one that has to hold it. The clone is perturbed to the peak measured on
   the synthetic QA showcase, where the only occurrence that matched the finding
   was the only one drawn off the plot. */
test('a selected occurrence trace is contained by the axis it is drawn against', () => {
  const cases = caseFiles().cases['finding:carb_undercount'];
  const [selectedId] = Object.keys(cases.selected_event);
  const selected = structuredClone(cases.selected_event[selectedId]);
  const points = selected.selection.detail.glucose;
  points[Math.floor(points.length / 2)].bg = 260;
  const injected = [...GLUCOSE_ENVELOPE];

  const option = eventComparisonChartOption(selected, injected, null, false);
  const trace = option.series.find((series) => series.id === 'selected:trace');
  assert.equal(trace.data.length, points.length, 'the stage draws the whole selected trace');
  for (const [minute, bg] of trace.data) {
    assert.ok(bg >= option.yAxis.min && bg <= option.yAxis.max,
      `${bg} at ${minute} min falls outside the axis [${option.yAxis.min}, ${option.yAxis.max}]`);
  }

  /* Outward only: the widened stage still contains the shared field ruler, and
     the mini rank, which draws no selected trace, keeps it exactly. */
  assert.ok(option.yAxis.min <= injected[0] && option.yAxis.max >= injected[1],
    'the widened axis narrowed the injected field range');
  const mini = eventComparisonChartOption(selected, injected, null, true);
  assert.deepEqual([mini.yAxis.min, mini.yAxis.max], injected);
});

test('glucose chart options fail closed without one injected field range', () => {
  const event = eventCase();
  const byKind = Object.fromEntries(DIAGNOSE_EVIDENCE_CHARTS.map((entry) => [entry.kind, entry]));

  assert.throws(() => byKind['event-comparison'].option(null, { data: event }),
    /field glucose range/);
});

test('#395 · the Pattern rail preview labels served cohorts and seats the event label inside the plot', () => {
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find((item) => item.kind === 'pattern-case-file');
  const capture = fixture('../mockups/diagnose-event-comparison.synthetic/capture.json');
  const colors = { misses: '#d08150', body: '#c7bca8', muted: '#3d5848',
    warn: '#e2be4c', text: '#141a15', line: '#c3bfb4' };
  for (const [key, label, outcome] of [
    ['highs_after_meals', 'COMPLETED CARB BOLUS', 'RAN HIGH'],
    ['lows_after_correcting_highs', 'LOW EXCURSION', 'FOLLOWED A CORRECTION'],
  ]) {
    const data = projectPatternCaseFile(capture, {
      patternChart: { key, window: { scoped: false, start_min: null, end_min: null } },
      projectionId: 'fp_test',
    });
    // The outcome word is the SERVED row's own count sentence (#413) — never a
    // frontend word table keyed by lever.
    const row = { count_sentences: [{ outcome: outcome.toLowerCase(),
      noun: key.includes('meals') ? 'meals' : 'lows', count: data.summary.claimed,
      denominator: data.summary.denominator }] };
    const option = entry.queuePreview({ kind: entry.kind, data }, [60, 260], colors, row);
    assert.deepEqual(option.graphic.map((item) => item.style.text), [
      `${outcome} · ${data.summary.claimed}`, `TYPICAL · ${data.summary.denominator}`,
    ]);
    assert.deepEqual([option.xAxis.min, option.xAxis.max], data.projection.window_min);
    assert.deepEqual([option.yAxis.min, option.yAxis.max], [60, 260]);
    assert.ok(!option.series.some((series) => series.id.includes('matched:band:')));
    const median = option.series.find((series) => series.id === 'queue:event:matched:median');
    assert.equal(median.lineStyle.color, colors.misses);
    assert.equal(median.showSymbol, false);
    assert.equal(option.series.find((series) => series.id === 'queue:event:comparison:median')
      .lineStyle.color, colors.body);
    // The dashed 70-180 target band is `queuePreviewOption`'s own
    // `queue:event:180` series, not a second copy — one builder owns it.
    assert.equal(option.series.filter((series) => /^queue:(pattern|event):180$/.test(series.id)).length, 1,
      'the dashed target band must be drawn exactly once');
    assert.equal(option.series.find((series) => series.id === 'queue:event:180')
      .markLine.lineStyle.color, colors.warn);
    const marker = option.series.find((series) => series.id === 'queue:event:event-anchor')
      .renderItem({ coordSys: { y: 20, height: 62 } }, { coord: () => [48, 20] });
    // The anchor label is drawn by one builder only (#413 review round 1):
    // walk the WHOLE rendered marker tree rather than trusting a fixed child
    // index, so a second builder re-wrapping the same marker and drawing its
    // own duplicate label at identical coordinates fails this test.
    const textNodes = (node) => !node ? [] : [
      ...(node.type === 'text' ? [node] : []),
      ...(node.children || []).flatMap(textNodes),
    ];
    const served = data.projection.anchor.label.toUpperCase();
    assert.equal(served, label, 'the served anchor names the event the Pattern is counted on');
    const labelNodes = textNodes(marker).filter((node) => node.style.text === served);
    assert.equal(labelNodes.length, 1, `the anchor label must be drawn exactly once, saw ${labelNodes.length}`);
    assert.equal(labelNodes[0].y, option.grid.top + 3, 'label rides inside the existing plot');
    assert.deepEqual(option.series.find((series) => series.id === 'queue:event:180')
      .markLine.data, [{ yAxis: 70 }, { yAxis: 180 }]);
  }
});

test('#413 · the High-carb-sequence mini draws the same instrument, never the comparison token', () => {
  // #413 review round 1: every fixture claims finding:high_carb_sequence, so
  // its rail mini was never exercised by a mini-mounting test even though the
  // registry already reroutes it through the shared cohort builder. Drive the
  // registry entry directly against the real case file the app would serve
  // for a RANKED (unclaimed) row, so a regression here fails even though the
  // showcase never renders one live.
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find((item) => item.kind === 'eating-sequence');
  const generated = expandSequenceFixture(fixture('../mockups/eating-sequence-findings.synthetic/payload.json'));
  const data = generated.states.high_carb_sequence_in_sequence.windows.global.cases['finding:high_carb_sequence'].event;
  const row = { count_sentences: [
    { count: 8, denominator: 40, noun: 'sequences', outcome: 'ran less in range',
      sentence: '8 of 40 sequences ran less in range' },
  ] };
  // The rail's own cohort palette, never the case file's comparison token —
  // deliberately distinct hex values so a leaked `--ec-comparison`/blue read
  // is caught rather than coincidentally matching.
  const colors = { text: '#141a15', muted: '#3d5848', line: '#c3bfb4', signal: '#5a7a52',
    high: '#caa23b', basal: '#9a8f7e', excluded: '#6b7169', warn: '#caa23b',
    misses: '#b0632e', body: '#a79c88',
    cohorts: { matched: '#5a7a52', nearly_matched: '#caa23b', comparison: '#b0632e' } };
  const COMPARISON_BLUE = '#3b6ea5';
  const option = entry.queuePreview({ kind: entry.kind, data }, [60, 260], colors, row);
  assert.deepEqual(option.graphic.map((item) => item.style.text),
    ['RAN LESS IN RANGE · 8', 'TYPICAL · 40'], 'the same cohort-label/TYPICAL instrument as every other mini');
  assert.equal(option.graphic[0].style.fill, colors.misses, 'the rail miss ink, as on the Pattern mini');
  const anchor = option.series.find((series) => series.id === 'queue:event:event-anchor')
    .renderItem({ coordSys: { y: 20, height: 62 } }, { coord: () => [48, 20] });
  const servedAnchor = data.projection.response.anchor?.label;
  assert.ok(servedAnchor, 'premise: the High-carb response serves an anchor label');
  assert.equal(anchor.children[1].style.text, servedAnchor.toUpperCase(),
    'the anchor names the served event, not a desk word table');
  const band = option.series.find((series) => series.id === 'queue:event:180');
  assert.ok(band, 'the dashed 70-180 target band must render');
  assert.equal(band.markLine.lineStyle.color, colors.warn);
  const paintedColors = option.series.flatMap((series) =>
    [series.lineStyle?.color, series.itemStyle?.color, series.markLine?.lineStyle?.color]).filter(Boolean);
  assert.ok(paintedColors.length > 0, 'the mini must actually paint series');
  for (const color of paintedColors) {
    assert.notEqual(color, COMPARISON_BLUE, 'no mini series may resolve to the comparison-blue token');
  }
  assert.ok(paintedColors.every((color) =>
    [colors.misses, colors.body, colors.cohorts.nearly_matched, colors.warn].includes(color)),
    `every painted color must resolve to a rail cohort token or the warn band, saw ${JSON.stringify(paintedColors)}`);
});


test('#413 · a Pattern chart row match reads `pattern_chart` alone, the served roster', () => {
  // The projection serves `pattern_chart` only for a chartable Pattern
  // (#413 ADR "the desk carries no fallback"), so the frontend no longer
  // polices the key against a word table of its own — it trusts the server.
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find((item) => item.kind === 'pattern-case-file');
  for (const key of ['future_pattern', '__proto__', 'highs_after_meals']) {
    assert.equal(entry.matches({ pattern_chart: { key } }), true);
  }
  assert.equal(entry.matches({ pattern_chart: null }), false);
  assert.equal(entry.matches({}), false);
});


test('#395 · Pattern evidence joins the shared field and malformed previews fail closed', () => {
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find((item) => item.kind === 'pattern-case-file');
  const capture = fixture('../mockups/diagnose-event-comparison.synthetic/capture.json');
  const data = projectPatternCaseFile(capture, {
    patternChart: { key: 'lows_after_correcting_highs', window: caseFiles().preparation.coordinates.window },
  });
  const lever = { kind: 'event-comparison', state: 'ok', data: eventCase() };
  const pattern = { kind: entry.kind, state: 'ok', data };
  assert.deepEqual(glucoseRange(entry.glucoseValues(data)), [40, 220]);
  assert.deepEqual(fieldRange([lever], DIAGNOSE_EVIDENCE_CHARTS, glucoseRange), [60, 200]);
  assert.deepEqual(fieldRange([lever, pattern], DIAGNOSE_EVIDENCE_CHARTS, glucoseRange), [40, 220]);
  const range = fieldRange([lever, pattern], DIAGNOSE_EVIDENCE_CHARTS, glucoseRange);
  for (const descriptor of [lever, pattern]) {
    const chart = DIAGNOSE_EVIDENCE_CHARTS.find((item) => item.kind === descriptor.kind);
    for (const mini of [true, false]) {
      const option = chart.option(null, { data: descriptor.data, range, mini });
      assert.deepEqual([option.yAxis.min, option.yAxis.max], range,
        'every Pattern and Lever tile keeps the shared field extent');
    }
  }
  assert.equal(entry.validateData(data), true);
  const invalidSupport = structuredClone(data);
  invalidSupport.projection.cohorts[0].support = 'unknown';
  for (const malformed of [null, {}, { ...data, projection: undefined }, invalidSupport]) {
    assert.equal(entry.validateData(malformed), false,
      'the tile rejects malformed evidence before mounting a preview');
    assert.throws(() => entry.queuePreview({ ...pattern, data: malformed }, [60, 200], {}),
      { name: 'Error', message: 'Pattern evidence is unavailable.' },
      'the shared mini mount catches the named failure without dereferencing missing cohorts');
  }
});


/* #464 · THE SETTLED BLOCK DESIGN. The carb-ratio tile is one view in two
   lanes: the ratio strip above — one dot per counted run at its served ratio
   against the served programmed, recommended and estimated ratios — and below,
   where each counted run started and ended, with the listed lows. Every mark is
   a served field; these tests read the option the registry builds from the
   synthetic capture, `explained` above all. */
const icCases = () => fixture('../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json').cases;
const COUNTED_REASONS = ['counted-whole', 'counted-by-share'];
const countedRuns = (data) => data.runs.filter((run) => COUNTED_REASONS.includes(run.pool_reason));
const carbRatioEntry = () => DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'carb-ratio');
const overview = (data, context = {}) => carbRatioEntry().option('overview', { data, ...context });
const byId = (option, id) => option.series.find((series) => series.id === id);
const dayOf = (t) => Date.parse(`${t.slice(0, 10)}T00:00:00`);

test('#464 · the ratio strip draws one dot per counted run at its served ratio', () => {
  for (const [name, data] of Object.entries(icCases())) {
    const option = overview(data);
    const whole = byId(option, 'ic:dots:whole');
    const share = byId(option, 'ic:dots:share');
    const counted = countedRuns(data);
    assert.equal(whole.data.length + share.data.length, counted.length, `${name}: one dot per counted run`);
    assert.deepEqual(whole.data.map(({ runId }) => runId),
      counted.filter((run) => run.pool_reason === 'counted-whole').map((run) => run.run_id));
    assert.deepEqual(share.data.map(({ runId }) => runId),
      counted.filter((run) => run.pool_reason === 'counted-by-share').map((run) => run.run_id));
    const ratio = new Map(counted.map((run) => [run.run_id, run.true_ic]));
    assert.ok([...whole.data, ...share.data].every(({ runId, value }) => value[0] === ratio.get(runId)),
      `${name}: each dot sits at its run's served ratio`);
    assert.equal(whole.name, 'whole run');
    assert.equal(share.name, 'counted by share');
  }
  const explained = icCases().explained;
  const option = overview(explained);
  assert.equal(countedRuns(explained).length, explained.block.run_ends.n,
    'premise: the capture counts its runs the way the block serves the count');
  /* A whole run is a filled dot and a run counted by share a ring, both in the
     text ink; no hollow ECharts symbol, whose fill is a hard-coded white. */
  const whole = byId(option, 'ic:dots:whole');
  const share = byId(option, 'ic:dots:share');
  assert.equal(whole.symbol, 'circle');
  assert.equal(share.symbol, 'circle');
  assert.equal(share.itemStyle.color, 'transparent');
  assert.equal(share.itemStyle.borderColor, whole.itemStyle.color);
  assert.equal(share.itemStyle.borderWidth, 2);
});

test('#464 · a dot grows with its served fit weight, 8 to 14 px', () => {
  const data = icCases().explained;
  const option = overview(data);
  const weight = new Map(countedRuns(data).map((run) => [run.run_id, run.fit_weight]));
  const dots = [...byId(option, 'ic:dots:whole').data, ...byId(option, 'ic:dots:share').data]
    .map(({ runId, symbolSize }) => [weight.get(runId), symbolSize])
    .sort(([a], [b]) => a - b);
  assert.ok(new Set(dots.map(([w]) => w)).size > 1, 'premise: the capture serves more than one weight');
  assert.ok(dots.every(([, size]) => size >= 8 && size <= 14), 'every dot is 8 to 14 px across');
  for (let index = 1; index < dots.length; index += 1) {
    assert.ok(dots[index][1] >= dots[index - 1][1], 'a heavier run never draws a smaller dot');
    if (dots[index][0] > dots[index - 1][0]) {
      assert.ok(dots[index][1] > dots[index - 1][1], 'a strictly heavier run draws a larger dot');
    }
  }
});

test('#464 · the three rules sit at the served ratios and the band spans the served range', () => {
  const data = icCases().explained;
  const option = overview(data);
  const rules = byId(option, 'ic:rules');
  assert.deepEqual(rules.markLine.data.map(({ name, xAxis, lineStyle }) => [name, xAxis, lineStyle.type]), [
    ['programmed', data.block.current, 'solid'],
    ['recommended', data.block.recommendation.value, 'dotted'],
    ['estimate', data.block.estimate.value, 'dashed'],
  ]);
  assert.ok(rules.markLine.data.every(({ lineStyle }) => lineStyle.width === 1));
  assert.deepEqual(rules.markArea.data, [[{ xAxis: data.block.estimate.lo }, { xAxis: data.block.estimate.hi }]]);
  assert.ok(rules.markArea.itemStyle.opacity <= .06, 'the range is a faint wash');
  /* The scale is fitted to what the lane draws, on the half g/U, ticked every
     half, and named for its unit. */
  const axis = option.xAxis[0];
  const drawn = [...countedRuns(data).map((run) => run.true_ic), data.block.current,
    data.block.recommendation.value, data.block.estimate.lo, data.block.estimate.hi];
  assert.equal(axis.interval, .5);
  assert.equal(axis.min * 2 % 1, 0);
  assert.equal(axis.max * 2 % 1, 0);
  assert.ok(drawn.every((value) => value > axis.min && value < axis.max));
  assert.equal(axis.axisLabel.formatter(4), '4.0');
  assert.equal(axis.name, 'g/U');
});

/* Three labels over three rules, placed on at most two rows: none overlaps
   another and none leaves the plot, whether the rules stand apart or crowd. */
test('#464 · the rule labels never overlap or clip, on at most two rows', () => {
  const data = icCases().explained;
  const layout = (block, width) => {
    const option = overview({ ...data, block });
    const axis = option.xAxis[0];
    const cs = { x: 34, y: 44, width, height: 100 };
    const api = { coord: ([value, y]) => [cs.x + (value - axis.min) / (axis.max - axis.min) * cs.width, y] };
    return { cs, texts: byId(option, 'ic:rule-labels').renderItem({ coordSys: cs, dataIndex: 0 }, api)
      .children.map(({ style }) => style) };
  };
  const crowded = { ...data.block, current: 5.3, recommendation: { ...data.block.recommendation, value: 5.3 },
    estimate: { ...data.block.estimate, value: 5.32, lo: 5.2, hi: 5.45 } };
  const atEdge = { ...data.block, current: 4.6, recommendation: { ...data.block.recommendation, value: 4.7 },
    estimate: { ...data.block.estimate, value: 4.75, lo: 4.62, hi: 4.9 } };
  for (const [block, width] of [[data.block, 900], [data.block, 420], [crowded, 900], [crowded, 420],
    [atEdge, 900], [atEdge, 420]]) {
    const { cs, texts } = layout(block, width);
    assert.deepEqual(texts.map(({ text }) => text).sort(), [
      `programmed ${block.current.toFixed(2)}`,
      `recommended ${block.recommendation.value.toFixed(2)}`,
      `estimate ${block.estimate.value.toFixed(2)} (${block.estimate.lo.toFixed(2)}–${block.estimate.hi.toFixed(2)})`,
    ].sort());
    const boxes = texts.map(({ text, x, y, align }) => {
      const w = text.length * 11 * .55;
      const left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
      return { left, right: left + w, y };
    });
    assert.ok(new Set(boxes.map(({ y }) => y)).size <= 2, 'two rows at most');
    assert.ok(boxes.every(({ left, right, y }) => left >= cs.x && right <= cs.x + cs.width && y < cs.y),
      'every label sits above the plot, inside its width');
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) {
        assert.ok(a.y !== b.y || a.right <= b.left || b.right <= a.left, `${JSON.stringify(texts)} overlap`);
      }
    }
  }
});

test('#464 · the lower lane draws each counted run from its bolus glucose to where it ended', () => {
  for (const [name, data] of Object.entries(icCases())) {
    const option = overview(data);
    const served = countedRuns(data).filter((run) => Number.isFinite(run.start_bg)
      && Number.isFinite(run.outcome_bg));
    const stems = byId(option, 'ic:stems');
    assert.equal(stems.data.length, served.length, `${name}: one stem per counted run with a served start and end`);
    assert.deepEqual(stems.data.map(({ value }) => value),
      served.map((run) => [dayOf(run.t), run.start_bg, run.outcome_bg]));
    assert.deepEqual(byId(option, 'ic:starts').data.map(({ value }) => value),
      served.map((run) => [dayOf(run.t), run.start_bg]));
    assert.deepEqual(byId(option, 'ic:ends').data.map(({ value }) => value),
      served.map((run) => [dayOf(run.t), run.outcome_bg]));
  }
  const data = icCases().explained;
  const option = overview(data);
  /* The stem is one 1 px line; the served band edges are the lane's two
     labelled hairlines. */
  const stems = byId(option, 'ic:stems');
  const line = stems.renderItem({ dataIndex: 0 }, {
    value: (dimension) => stems.data[0].value[dimension], coord: ([x, y]) => [x, y],
  }).children.find(({ type }) => type === 'line');
  assert.equal(line.style.lineWidth, 1);
  const band = byId(option, 'ic:band');
  assert.deepEqual(band.markLine.data.map(({ yAxis }) => yAxis), [data.outcomes.band.low, data.outcomes.band.high]);
  assert.equal(band.markLine.label.show, true);
  assert.equal(option.xAxis[1].type, 'time');
  assert.equal(option.xAxis[1].minInterval, 7 * 864e5, 'the date axis ticks by the week');
});

test('#464 · every listed low is a ▼ at its glucose on its date, filled only on a counted run', () => {
  const data = icCases().explained;
  const lows = data.harm_evidence.lows;
  const regrouped = { ...data, harm_evidence: { ...data.harm_evidence,
    lows: [...lows, { ...lows[0], group: 'uncounted-run', bg: 61 },
      { ...lows[1], group: 'not-a-meal-run', run_id: null, bg: 55 }] } };
  for (const payload of [data, regrouped]) {
    const option = overview(payload);
    const filled = byId(option, 'ic:lows:counted');
    const hollow = byId(option, 'ic:lows:other');
    const served = payload.harm_evidence.lows;
    assert.equal(filled.data.length + hollow.data.length, served.length, 'one ▼ per listed low');
    assert.deepEqual(filled.data.map(({ value }) => value),
      served.filter((low) => low.group === 'counted-run').map((low) => [dayOf(low.t), low.bg]));
    assert.deepEqual(hollow.data.map(({ value }) => value),
      served.filter((low) => low.group !== 'counted-run').map((low) => [dayOf(low.t), low.bg]));
    assert.equal(filled.symbolRotate, 180);
    assert.equal(hollow.symbolRotate, 180);
    assert.equal(hollow.itemStyle.color, 'transparent');
    assert.equal(hollow.itemStyle.borderColor, filled.itemStyle.color);
  }
  assert.equal(byId(overview(regrouped), 'ic:lows:other').data.length, 2,
    'premise: the regrouped payload lists lows off counted runs');
});

test('#464 · the tile keys itself in two legend rows, in the settled words, and nothing else', () => {
  const option = overview(icCases().explained);
  assert.equal(option.legend.length, 2);
  const words = (legend) => legend.data.map(({ name }) => (legend.formatter ? legend.formatter(name) : name));
  assert.deepEqual(words(option.legend[0]), ['whole run',
    'counted by share · size = carbs counted · hover a dot for the insulin behind its ratio']);
  assert.deepEqual(words(option.legend[1]), ['at the bolus', 'where the run ended', 'listed low',
    'on a run not counted']);
  const named = new Set(option.series.map(({ name }) => name));
  for (const legend of option.legend) {
    assert.ok(legend.data.every(({ name }) => named.has(name)), 'every chip keys a drawn series');
    assert.equal(legend.selectedMode, false);
  }
  assert.equal(option.title, undefined, 'no caption sentences');
  assert.ok(!(option.graphic || []).some((item) => item.type === 'text'), 'no caption sentences');
});

test('#464 · no carb-ratio option draws a directional-only run, a meal, or a peak', () => {
  for (const [name, data] of Object.entries(icCases())) {
    for (const mini of [false, true]) {
      const option = overview(data, { mini });
      const names = option.series.map((series) => series.name);
      assert.ok(!names.includes('Directional-only run'), `${name}: no directional-only series`);
      assert.ok(option.series.every((series) => /^ic:/.test(series.id || '')
        && !/meal|peak|member/i.test(series.id)), `${name}: no per-meal marks or peak ticks`);
    }
  }
});

test('#464 · the tooltip reads a run its served ledger terms and a low its served delay', () => {
  const data = icCases().explained;
  const option = overview(data);
  const run = countedRuns(data).find((row) => row.pool_reason === 'counted-by-share');
  const dot = byId(option, 'ic:dots:share').data.find(({ runId }) => runId === run.run_id);
  const lines = option.tooltip.formatter({ data: dot }).split('<br>');
  const corrections = run.post_correction_user + run.post_correction_ciq + run.post_correction_unknown;
  const end = { lower: 'lower', flat: 'about flat', higher: 'higher' }[run.end_class];
  assert.deepEqual(lines, [
    run.t.slice(0, 10),
    run.t.slice(11, 16),
    `${run.n_meals} meal${run.n_meals === 1 ? '' : 's'}`,
    `carbs ${Number(run.carbs.toFixed(1))} g ÷ insulin ${run.effective_insulin.toFixed(2)} U = ${run.true_ic.toFixed(2)} g/U`,
    `insulin: bolus ${run.meal_dose.toFixed(2)} · corrections ${corrections.toFixed(2)} · Control-IQ basal ${run.ciq_basal_delta_acted_u.toFixed(2)} · glucose change ${run.bg_outcome_u.toFixed(2)}`,
    `ended ${Math.round(run.outcome_bg)} mg/dL after ${Number((run.outcome_min / 60).toFixed(1))} h (${end})`,
  ]);
  /* A stem and its markers read the same run. */
  const stem = byId(option, 'ic:stems').data.find(({ runId }) => runId === run.run_id);
  assert.equal(option.tooltip.formatter({ data: stem }), lines.join('<br>'));
  const low = byId(option, 'ic:lows:counted').data[0];
  assert.equal(data.harm_evidence.lows[0].minutes_after_bolus, 210, 'premise: the served delay');
  assert.equal(option.tooltip.formatter({ data: low }),
    `low ${data.harm_evidence.lows[0].bg} mg/dL, 3 h 30 min after its bolus`);
  assert.equal(option.tooltip.trigger, 'item');
  assert.match(option.tooltip.extraCssText, /max-width: 320px/);
});

test('#464 · a selected run is ringed on both lanes, and a click or Enter selects a run', () => {
  const data = icCases().explained;
  const [first] = [...countedRuns(data)].sort((a, b) => (a.t < b.t ? -1 : 1));
  const selected = countedRuns(data)[5];
  const option = overview(data, { selectedRunId: selected.run_id });
  const dot = [...byId(option, 'ic:dots:whole').data, ...byId(option, 'ic:dots:share').data]
    .find(({ runId }) => runId === selected.run_id);
  assert.deepEqual(byId(option, 'ic:selected:dot').data.map(({ value }) => value), [dot.value]);
  assert.deepEqual(byId(option, 'ic:selected:end').data.map(({ value }) => value),
    [[dayOf(selected.t), selected.outcome_bg]]);
  assert.equal(byId(overview(data), 'ic:selected:dot').data.length, 0);

  const listeners = new Map();
  const surface = { clientWidth: 966, clientHeight: 459, tabIndex: -1, dataset: {},
    setAttribute(key, value) { this[key] = value; },
    addEventListener(type, handler, { signal } = {}) {
      listeners.set(type, [...(listeners.get(type) || []), { handler, signal }]);
    } };
  const fire = (type, event = {}) => (listeners.get(type) || [])
    .filter(({ signal }) => !signal?.aborted).forEach(({ handler }) => handler({ preventDefault() {}, ...event }));
  const handlers = [];
  const actions = [];
  const chart = { on: (type, handler) => handlers.push([type, handler]),
    off: (type, handler) => handlers.splice(handlers.findIndex((row) => row[1] === handler), 1),
    setOption() {}, dispatchAction: (action) => actions.push(action) };
  const prior = globalThis.echarts;
  globalThis.echarts = { getInstanceByDom: (el) => (el === surface ? chart : undefined) };
  try {
    const chosen = [];
    const built = overview(data, { surface, onSelectRun: (runId) => chosen.push(runId) });
    fire('pointerdown');
    assert.deepEqual(handlers.map(([type]) => type), ['click']);
    handlers[0][1]({ data: { runId: selected.run_id } });
    handlers[0][1]({ data: { low: data.harm_evidence.lows[0] } });
    assert.deepEqual(chosen, [selected.run_id], 'a dot or stem selects its run; a low selects nothing');

    assert.equal(surface.tabIndex, 0, 'the tile takes focus');
    fire('keydown', { key: 'ArrowRight' });
    const tip = actions.at(-1);
    assert.equal(tip.type, 'showTip');
    assert.equal(built.series[tip.seriesIndex].data[tip.dataIndex].runId, first.run_id,
      'the arrows walk the counted runs by date');
    fire('keydown', { key: 'Enter' });
    assert.deepEqual(chosen, [selected.run_id, first.run_id]);

    /* A relayout rebuilds the option on the same host: the earlier binding
       goes, so a click still selects once. */
    overview(data, { surface, onSelectRun: (runId) => chosen.push(runId) });
    fire('pointerdown');
    assert.equal(handlers.length, 1, 'one click binding per host');
  } finally {
    globalThis.echarts = prior;
  }
});

/* The keyed tip lands on the run's own dot, but ECharts re-shows a tip by pixel
   on every later render, and a relayout is a rebuild — so in a column of runs
   sharing one ratio the re-show lands on whichever hit-testable mark is on top
   there. ECharts' manual tip is a no-op under node, so the re-show is modelled
   as that pick: the topmost scatter mark in the cursor run's column (highest
   z, then last drawn), handed to the tile's own tooltip formatter. */
test('#464 · the keyboard readout names the run under the cursor, even where its dot is stacked', async () => {
  const data = icCases().explained;
  const [first, second] = [...countedRuns(data)].sort((a, b) => (a.t < b.t ? -1 : 1));
  const dots = (option) => [...byId(option, 'ic:dots:whole').data, ...byId(option, 'ic:dots:share').data];
  const xOf = (option, run) => dots(option).find(({ runId }) => runId === run.run_id).value[0];
  const column = (option, run) => dots(option).filter(({ value }) => value[0] === xOf(option, run));
  const topmost = (option, run) => {
    let best = null;
    for (const series of option.series) {
      if (series.xAxisIndex !== 0 || series.silent || series.type !== 'scatter') continue;
      for (const dot of series.data) {
        if (dot.value[0] === xOf(option, run) && (!best || (series.z ?? 0) >= best.z)) best = { z: series.z ?? 0, dot };
      }
    }
    return best.dot;
  };
  const read = (option, dot) => option.tooltip.formatter({ data: dot }).split('<br>').slice(0, 2).join(' ');
  const named = (run) => `${run.t.slice(0, 10)} ${run.t.slice(11, 16)}`;
  const namedById = new Map(countedRuns(data).map((run) => [run.run_id, named(run)]));
  const everyDotReadsItsOwnRun = (option, why) => assert.deepEqual(
    dots(option).map((dot) => read(option, dot)), dots(option).map(({ runId }) => namedById.get(runId)), why);
  const prior = globalThis.echarts;
  try {
    for (const [size, relaid] of [[[966, 459], [806, 240]], [[806, 240], [966, 459]]]) {
      const listeners = new Map();
      const surface = { clientWidth: size[0], clientHeight: size[1], tabIndex: -1,
        setAttribute(key, value) { this[key] = value; },
        addEventListener(type, handler, { signal, capture = false } = {}) {
          listeners.set(type, [...(listeners.get(type) || []), { handler, signal, capture }]);
        } };
      const fire = (type, event = {}) => (listeners.get(type) || [])
        .filter(({ signal }) => !signal?.aborted).forEach(({ handler }) => handler({ preventDefault() {}, ...event }));
      const actions = [];
      /* The chart keeps what the host and the tile set on it: the host a whole
         option, the tile a series merged by id. */
      const chart = { option: null, on() {}, off() {}, dispatchAction: (action) => actions.push(action),
        setOption(next, notMerge) {
          if (notMerge) this.option = next;
          else for (const part of next.series) Object.assign(this.option.series.find(({ id }) => id === part.id), part);
        } };
      globalThis.echarts = { getInstanceByDom: (el) => (el === surface ? chart : undefined) };
      const chosen = [];
      const relayout = () => chart.setOption(overview(data,
        { surface, onSelectRun: (runId) => chosen.push(runId) }), true);
      const tipRun = () => chart.option.series[actions.at(-1).seriesIndex].data[actions.at(-1).dataIndex].runId;
      const at = `${size.join('×')}`;

      relayout();
      for (const run of [first, second]) {
        assert.ok(column(chart.option, run).length > 1, `premise: ${named(run)} shares its ratio column (${at})`);
      }
      fire('keydown', { key: 'ArrowRight' });
      assert.equal(tipRun(), first.run_id, `the tip is keyed to the first run by date (${at})`);
      assert.equal(read(chart.option, topmost(chart.option, first)), named(first),
        `a re-show by pixel reads out the first run (${at})`);

      [surface.clientWidth, surface.clientHeight] = relaid;
      const shown = actions.length;
      relayout();
      await Promise.resolve();
      assert.equal(actions.length, shown + 1, `a relayout re-shows the tip (${at})`);
      assert.equal(tipRun(), first.run_id, `the re-shown tip sits on the first run's new dot (${at})`);
      assert.equal(read(chart.option, topmost(chart.option, first)), named(first),
        `after a relayout to ${relaid.join('×')} a re-show by pixel still reads out the first run (${at})`);

      fire('keydown', { key: 'ArrowRight' });
      assert.equal(tipRun(), second.run_id, `the next arrow keys the second run (${at})`);
      assert.equal(read(chart.option, topmost(chart.option, second)), named(second),
        `a re-show by pixel reads out the second run (${at})`);
      fire('keydown', { key: 'Enter' });
      assert.deepEqual(chosen, [second.run_id], `Enter selects the run being read (${at})`);
    }
  } finally {
    globalThis.echarts = prior;
  }
});

/* The keyboard cursor yields to the pointer. ECharts reads a hover out through
   the same formatter, synchronously, on its own pointer handler — so the
   formatter must read out the dot it is handed while the keys still hold a
   run, and the pointer must lift the cursor mark before the chart sees it. */
test('#464 · a hover after the keys reads out the hovered run, a ring counted by share included', () => {
  const data = icCases().explained;
  const named = (run) => `${run.t.slice(0, 10)} ${run.t.slice(11, 16)}`;
  const namedById = new Map(countedRuns(data).map((run) => [run.run_id, named(run)]));
  const dots = (option) => [...byId(option, 'ic:dots:whole').data, ...byId(option, 'ic:dots:share').data];
  const everyDotReadsItsOwnRun = (option, why) => assert.deepEqual(
    dots(option).map((dot) => option.tooltip.formatter({ data: dot }).split('<br>').slice(0, 2).join(' ')),
    dots(option).map(({ runId }) => namedById.get(runId)), why);
  const listeners = new Map();
  const surface = { clientWidth: 966, clientHeight: 459, tabIndex: -1,
    setAttribute(key, value) { this[key] = value; },
    addEventListener(type, handler, { signal, capture = false } = {}) {
      listeners.set(type, [...(listeners.get(type) || []), { handler, signal, capture }]);
    } };
  const fire = (type, event = {}) => (listeners.get(type) || [])
    .filter(({ signal }) => !signal?.aborted).forEach(({ handler }) => handler({ preventDefault() {}, ...event }));
  const chart = { option: null, on() {}, off() {}, dispatchAction() {},
    setOption(next, notMerge) {
      if (notMerge) this.option = next;
      else for (const part of next.series) Object.assign(this.option.series.find(({ id }) => id === part.id), part);
    } };
  const prior = globalThis.echarts;
  globalThis.echarts = { getInstanceByDom: (el) => (el === surface ? chart : undefined) };
  try {
    chart.setOption(overview(data, { surface, onSelectRun: () => {} }), true);
    for (const key of ['ArrowRight', 'ArrowRight', 'ArrowRight']) fire('keydown', { key });
    everyDotReadsItsOwnRun(chart.option, 'every dot reads out its own run while the keys hold one');
    assert.ok(byId(chart.option, 'ic:dots:share').data.length > 0, 'premise: the block has rings');
    assert.ok(listeners.get('pointermove').every(({ capture }) => capture),
      'the pointer is caught on its way down, before the chart handles it');
    fire('pointermove');
    assert.equal(byId(chart.option, 'ic:cursor').data.length, 0, 'a moving pointer lifts the cursor mark');
    everyDotReadsItsOwnRun(chart.option, 'every dot reads out its own run after the pointer moves');
  } finally {
    globalThis.echarts = prior;
  }
});

/* The keys' run is announced the way the comparison chart announces its cursor:
   the focused host's label carries the reading. ECharts writes the option's
   resting description onto the host on every render, and the fake chart here
   does the same. */
test('#464 · stepping the cursor labels the tile with the cursor run, in the tooltip\'s own words', async () => {
  const data = icCases().explained;
  const [first, second] = [...countedRuns(data)].sort((a, b) => (a.t < b.t ? -1 : 1));
  const listeners = new Map();
  const surface = { clientWidth: 966, clientHeight: 459, tabIndex: -1,
    setAttribute(key, value) { this[key] = value; },
    addEventListener(type, handler, { signal } = {}) {
      listeners.set(type, [...(listeners.get(type) || []), { handler, signal }]);
    } };
  const fire = (type, event = {}) => (listeners.get(type) || [])
    .filter(({ signal }) => !signal?.aborted).forEach(({ handler }) => handler({ preventDefault() {}, ...event }));
  const chart = { option: null, on() {}, off() {}, dispatchAction() {},
    setOption(next, notMerge) {
      if (notMerge) this.option = next;
      else for (const part of next.series) Object.assign(this.option.series.find(({ id }) => id === part.id), part);
      surface.setAttribute('aria-label', this.option.aria.description);
    } };
  const words = (run) => {
    const dot = [...byId(chart.option, 'ic:dots:whole').data, ...byId(chart.option, 'ic:dots:share').data]
      .find(({ runId }) => runId === run.run_id);
    return `${chart.option.tooltip.formatter({ data: dot }).split('<br>').join('. ')}.`;
  };
  const prior = globalThis.echarts;
  globalThis.echarts = { getInstanceByDom: (el) => (el === surface ? chart : undefined) };
  try {
    const relayout = () => chart.setOption(overview(data, { surface, onSelectRun: () => {} }), true);
    relayout();
    const resting = chart.option.aria.description;
    assert.equal(surface['aria-label'], resting, 'premise: at rest the tile carries its description');

    fire('keydown', { key: 'ArrowRight' });
    assert.equal(surface['aria-label'], words(first), 'the first step reads out the first run by date');
    assert.ok(surface['aria-label'].startsWith(`${first.t.slice(0, 10)}. ${first.t.slice(11, 16)}. `),
      'the reading opens on the run\'s date and time');
    fire('keydown', { key: 'ArrowRight' });
    assert.equal(surface['aria-label'], words(second), 'the next step reads out the second run');

    relayout();
    await Promise.resolve();
    assert.equal(surface['aria-label'], words(second), 'a relayout keeps the reading on the cursor run');

    const hovered = byId(chart.option, 'ic:dots:share').data.find(({ runId }) => runId !== second.run_id);
    chart.option.tooltip.formatter({ data: hovered });
    assert.equal(surface['aria-label'], words(second), 'a hover leaves the reading alone');
    fire('pointermove');
    assert.equal(surface['aria-label'], resting, 'a released cursor leaves the tile at rest');
    fire('keydown', { key: 'ArrowRight' });
    fire('blur');
    assert.equal(surface['aria-label'], resting, 'focus leaving puts the tile at rest');
  } finally {
    globalThis.echarts = prior;
  }
});

/* A tile whose request fails, or that repaints, disposes its chart and keeps
   its host. The host's handlers must then do nothing — never call into a chart
   that is absent or disposed — and drop themselves. */
test('#464 · the tile host handlers are inert and detach once the chart is absent or disposed', () => {
  const data = icCases().explained;
  const host = () => {
    const listeners = new Map();
    return {
      listeners, clientWidth: 966, clientHeight: 459, tabIndex: -1,
      setAttribute(key, value) { this[key] = value; },
      addEventListener(type, handler, { signal } = {}) {
        listeners.set(type, [...(listeners.get(type) || []), { handler, signal }]);
      },
      live: () => [...listeners.values()].flat().filter(({ signal }) => !signal?.aborted).length,
      fire(type, event = {}) {
        (listeners.get(type) || []).filter(({ signal }) => !signal?.aborted)
          .forEach(({ handler }) => handler({ preventDefault() {}, ...event }));
      },
    };
  };
  const everything = (surface) => {
    surface.fire('pointerdown');
    for (const key of ['ArrowRight', 'Enter', 'End', 'ArrowLeft', 'Home']) surface.fire('keydown', { key });
    surface.fire('blur');
  };
  const refusing = () => { throw new TypeError("Cannot read properties of null (reading 'getComponent')"); };
  const disposedChart = { isDisposed: () => true, on: refusing, off: refusing, dispatchAction: refusing };
  const prior = globalThis.echarts;
  try {
    for (const [name, chartFor] of [['absent', () => null], ['disposed', () => disposedChart]]) {
      const surface = host();
      const chosen = [];
      globalThis.echarts = { getInstanceByDom: (el) => (el === surface ? chartFor() : undefined) };
      overview(data, { surface, onSelectRun: (runId) => chosen.push(runId) });
      assert.ok(surface.live() > 0, 'premise: the build bound its handlers');
      assert.doesNotThrow(() => everything(surface), `${name}: no call reaches the chart`);
      assert.deepEqual(chosen, [], `${name}: nothing is selected without a chart`);
      assert.equal(surface.live(), 0, `${name}: the host dropped every handler`);
    }

    /* A chart that was live when the click was bound, then disposed by the
       tile leaving its chart state. */
    const surface = host();
    const handlers = [];
    let disposed = false;
    const chart = {
      isDisposed: () => disposed,
      on: (type, handler) => (disposed ? refusing() : handlers.push([type, handler])),
      off: (type, handler) => (disposed ? refusing()
        : handlers.splice(handlers.findIndex((row) => row[1] === handler), 1)),
      setOption: () => (disposed ? refusing() : undefined),
      dispatchAction: () => (disposed ? refusing() : undefined),
    };
    globalThis.echarts = { getInstanceByDom: (el) => (el === surface ? chart : undefined) };
    overview(data, { surface, onSelectRun: () => {} });
    surface.fire('pointerdown');
    surface.fire('keydown', { key: 'ArrowRight' });
    assert.equal(handlers.length, 1, 'premise: the live chart took the click binding');
    disposed = true;
    assert.doesNotThrow(() => everything(surface), 'a disposed chart is never called');
    assert.equal(surface.live(), 0, 'the host dropped every handler');
    assert.doesNotThrow(() => overview(data, { surface, onSelectRun: () => {} }),
      'a rebuild over the disposed chart does not call into it either');
  } finally {
    globalThis.echarts = prior;
  }
});

test('#464 · the tile reads aloud only the counts the block serves', () => {
  const data = icCases().explained;
  const { run_ends: ends, support_detail: detail } = data.block;
  const groups = data.harm_evidence.groups;
  assert.equal(overview(data).aria.description,
    `${ends.n} counted meal runs: ${detail.whole_runs} counted whole, `
    + `${detail.fractional_run_ownership} runs' worth counted by carb share; listed lows: `
    + `${groups.counted_run} on counted runs, ${groups.uncounted_run} on runs not counted, `
    + `${groups.not_a_meal_run} after a bolus that is not one of these meals. `
    + `Block state: ${data.block.state}.`);
});

/* A block that is not measured yet still draws the runs it serves, but draws
   no recommendation it was not served, and says which state it is in. */
test('#464 · a block not in the numeric state names its served state and draws no unserved recommendation', () => {
  const cases = icCases();
  for (const name of ['below_floor', 'all_rejected']) {
    const data = cases[name];
    assert.notEqual(data.block.state, 'numeric', `premise: ${name} is not numeric`);
    const option = overview(data);
    assert.match(option.aria.description, new RegExp(` Block state: ${data.block.state}\\.$`));
    const served = data.block.recommendation.value;
    const rules = byId(option, 'ic:rules').markLine.data.map(({ name: rule }) => rule);
    assert.equal(rules.includes('recommended'), Number.isFinite(served),
      `${name} draws a recommended rule only when one is served`);
    const axis = option.xAxis[0];
    const cs = { x: 34, y: 44, width: 900, height: 100 };
    const labels = byId(option, 'ic:rule-labels').renderItem({ coordSys: cs, dataIndex: 0 }, {
      coord: ([value, y]) => [cs.x + (value - axis.min) / (axis.max - axis.min) * cs.width, y],
    }).children.map(({ style }) => style.text);
    assert.equal(labels.some((text) => text.startsWith('recommended')), Number.isFinite(served),
      `${name} labels a recommendation only when one is served`);
    assert.equal(byId(option, 'ic:dots:whole').data.length + byId(option, 'ic:dots:share').data.length,
      countedRuns(data).length, `${name} still draws its served counted runs`);
  }
  assert.equal(cases.all_rejected.block.recommendation.value, null,
    'premise: one case serves no recommendation');
});

/* The keys are filled or hollow as their marks are, never ECharts' `empty*`
   icons, which fill with a hard-coded white; a hollow key is an outline path
   filled with its mark's ink. */
test('#464 · each legend key is filled or hollow as its mark is', () => {
  const option = overview(icCases().explained);
  const keys = Object.fromEntries(option.legend.flatMap(({ data }) => data)
    .map(({ name, icon, itemStyle }) => [name, { icon, ink: itemStyle.color }]));
  const hollow = ['counted by share', 'at the bolus', 'on a run not counted'];
  const filled = ['whole run', 'where the run ended', 'listed low'];
  for (const [solid, open] of [['whole run', 'counted by share'], ['where the run ended', 'at the bolus'],
    ['listed low', 'on a run not counted']]) {
    assert.notEqual(keys[solid].icon, keys[open].icon, `${solid} and ${open} key differently`);
  }
  assert.ok(hollow.every((name) => keys[name].icon.startsWith('path://')
    && keys[name].icon.match(/M/g).length === 2), 'a hollow key is an outline path with its hole cut');
  assert.ok(filled.every((name) => !/M.*M/.test(keys[name].icon)), 'a filled key has no hole');
  assert.ok(Object.values(keys).every(({ icon }) => !icon.startsWith('empty')));
  assert.equal(keys['counted by share'].icon, keys['at the bolus'].icon, 'one ring glyph');
  const series = Object.fromEntries(option.series.map((item) => [item.name, item]));
  for (const [name, { ink }] of Object.entries(keys)) {
    const style = series[name].itemStyle;
    assert.equal(ink, hollow.includes(name) ? style.borderColor : style.color,
      `${name} keys in its mark's ink`);
  }
});

test('#464 · the thumbnail and the queue-row mini draw the ratio strip alone', () => {
  const data = icCases().explained;
  const entry = carbRatioEntry();
  const counted = countedRuns(data).length;
  const dots = (option) => option.series.filter(({ id }) => id?.startsWith('ic:dots:'))
    .reduce((sum, series) => sum + series.data.length, 0);
  const mini = overview(data, { mini: true });
  const thumbnail = entry.thumbnail(data, 'Carb ratio 00:00 to 12:00 · meal runs');
  const queue = queuePreviewOption({ kind: 'carb-ratio', data }, [60, 240], {
    text: '#f2ede2', muted: '#a49c90', line: '#3f3833', signal: '#86ad78' });
  for (const option of [mini, thumbnail, queue]) {
    assert.equal(dots(option), counted, 'every counted run is a dot');
    assert.ok(option.series.some(({ id }) => id === 'ic:rules'), 'the three rules stay');
    assert.ok(!option.series.some(({ id }) => /^ic:(stems|starts|ends|lows|band|rule-labels)/.test(id)),
      'nothing from the lower lane, and no labels');
    assert.ok([option.xAxis, option.yAxis].flat().every((axis) => axis.show === false));
  }
  assert.equal(mini.legend.show, false);
  assert.equal(thumbnail.graphic[0].style.text, 'CARB RATIO 00:00 TO 12:00 · MEAL RUNS');
  /* A mini dot is scaled down from the tile's, and still grows with its weight. */
  const size = (option) => Math.max(...option.series.filter(({ id }) => id?.startsWith('ic:dots:'))
    .flatMap(({ data: rows }) => rows.map(({ symbolSize }) => symbolSize)));
  assert.ok(size(mini) < size(overview(data)));
});
