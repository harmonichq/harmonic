import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { makeDeps } from './data.js';
import { renderEventSurface } from './diagnose-event-comparison.js';
import { projectFindings } from '../mockups/findings-projection.mirror.mjs';

import {
  DIAGNOSE_EVIDENCE_CHARTS,
  GLUCOSE_ENVELOPE,
  GLUCOSE_STEP,
  glucoseRange,
} from './diagnose-evidence-charts.js';
import { fieldRange } from './diagnose-canvas-layout.js';

const fixture = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
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

test('the registry declares four stateless chart kinds and their request coordinates', () => {
  assert.deepEqual(DIAGNOSE_EVIDENCE_CHARTS.map(({ kind }) => kind), [
    'basal', 'isf', 'carb-ratio', 'event-comparison',
  ]);
  assert.deepEqual(DIAGNOSE_EVIDENCE_CHARTS.map(({ coordinateSchema }) => coordinateSchema), [
    ['slot'], [], ['block_id', 'analysis_generation'],
    ['projection_id', 'finding_id', 'alignment', 'factor', 'view'],
  ]);
  assert.deepEqual(DIAGNOSE_EVIDENCE_CHARTS.map(({ modes }) => modes), [
    ['clock', 'bay', 'ledger', 'editorial', 'event'], ['event', 'clock'], ['event', 'clock'], null,
  ]);
  assert.ok(DIAGNOSE_EVIDENCE_CHARTS.every((entry) => typeof entry.matches === 'function'));
  assert.ok(DIAGNOSE_EVIDENCE_CHARTS.every((entry) => typeof entry.coordinates === 'function'));
});

test('every entry produces exactly the coordinates it declares', () => {
  const findings = { analysis_generation: 'process:7', projection_id: 'fp_7' };
  const rows = {
    basal: { id: 'basal:30-60', parameter: 'basal_rate', span: { start_min: 30, end_min: 60 } },
    isf: { id: 'isf', parameter: 'isf' },
    'carb-ratio': { id: 'ic:720', parameter: 'carb_ratio', span: { start_min: 720, end_min: 1440 } },
    'event-comparison': { id: 'finding:missed_meal', title: 'Missed meal',
      appearances: [{ family: 'highs', noun: 'highs' }],
      event_chart: { lever: 'missed_meal', window: { scoped: false } } },
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

  const basalClock = byKind.basal.option('clock', {
    data: basal, range: null, explore: false, mini: false, window: [1320, 120],
  });
  const isfEvent = byKind.isf.option('event', {
    data: isf, range: null, explore: false, mini: false, window: [1320, 120],
  });
  const icEvent = byKind['carb-ratio'].option('event', {
    data: ic, range: [80, 220], explore: false, mini: false, window: [1320, 120],
  });
  const event = eventCase();
  const comparison = byKind['event-comparison'].option(null, {
    data: event, range: [80, 220], explore: false, mini: false, window: [1320, 120],
  });

  assert.equal(basalClock.xAxis[0].type, 'category');
  assert.equal(isfEvent.xAxis.name, 'insulin acted (U)');
  assert.deepEqual(icEvent.yAxis.min, 80);
  assert.deepEqual(icEvent.yAxis.max, 220);
  assert.equal(basalClock.grid[0].left, isfEvent.grid.left);
  assert.deepEqual(isfEvent.grid, icEvent.grid);
  const { containLabel, ...icPlot } = icEvent.grid;
  assert.deepEqual(icPlot, comparison.grid,
    'the comparison shares the other kinds\' plot insets');
});

test('basal event treatment follows the backend verdict in product language', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');
  const held = entry.option('event', { data: {
    ...basal,
    directional_support_count: 12,
    asserts_move: false,
    safety_status: 'insufficient evidence',
  } });
  const moving = entry.option('event', { data: {
    ...basal,
    directional_support_count: 12,
    asserts_move: true,
    safety_status: 'lower',
  } });

  assert.equal(held.series[0].type, 'bar');
  assert.deepEqual(held.series[0].data, [12]);
  assert.notEqual(held.series[0].itemStyle.color, moving.series[0].itemStyle.color);
  const gated = entry.option('event', { data: {
    ...basal, asserts_move: false, safety_status: 'held (recurring-low gate)',
  } });
  assert.deepEqual(held.legend.data, ['Insufficient evidence']);
  assert.deepEqual(moving.legend.data, ['Supported']);
  assert.deepEqual(gated.legend.data, ['Held'],
    'a withheld raise reads as the shipped result state, not the engine string');
  assert.doesNotMatch(
    JSON.stringify({ held, moving, gated, meta: entry.meta('event') }),
    /directional support|analyzer verdict|recurring-low gate/i);
});

test('Bay and Ledger keep payload-derived tallies and tolerate an absent estimate', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');
  const more = basal.nights.filter(({ sign }) => sign === 1).length;
  const less = basal.nights.filter(({ sign }) => sign === -1).length;
  for (const mode of ['bay', 'ledger']) {
    const option = entry.option(mode, { data: basal });
    assert.equal(option.animation, false);
    assert.ok(option.series.every((series) => series.animation === false));
    const rendered = JSON.stringify(option);
    assert.ok(rendered.includes(`{n|${more}`), `${mode} keeps the payload-derived more count`);
    assert.ok(rendered.includes(`{n|${less}`), `${mode} keeps the payload-derived less count`);
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
  assert.deepEqual(numerals.map(({ style }) => style.text),
    [more, less, asSet, basal.excluded_night_count].map(String));
  assert.deepEqual(labels.map(({ style }) => style.text),
    ['more than programmed', 'less', 'exactly as set', 'excluded — not steady'],
    'the exclusion reads as one statement on one line, not two data points');
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
  assert.deepEqual(numerals.map(({ style }) => style.y), [118, 142, 166, 204],
    'one pitch down the tally, and the excluded row below its own rule');
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

/* ONE BIG NIGHT MAY NOT SET THE SCALE, AND MAY NOT BE HIDDEN EITHER. A single
   2.5 U/h night stretched the live domain to three units and crushed the finding
   into the left third of the tile; the ceiling now rides the roster, and the
   night past it keeps its true value where the reader can still be told it. */
test('the editorial ceiling caps an outlier night without hiding its value', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');
  const outlier = { date: '2026-01-09', delivered_rate: 2.5, programmed_rate: 0.6,
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

test('the editorial staircase tolerates an absent estimate at both ranks', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'basal');

  assert.equal(Object.hasOwn(basal, 'estimate'), false, 'the fixture serves no estimate');
  for (const data of [basal, { ...basal, estimate: null },
    { ...basal, estimate: { value: null, lo: null, hi: null } }, { ...basal, nights: [] }]) {
    assert.doesNotThrow(() => entry.option('editorial', { data }));
    assert.doesNotThrow(() => entry.option('editorial', { data, mini: true }));
  }
  const bare = entry.option('editorial', { data: basal });
  assert.equal(JSON.stringify(bare.graphic).includes('range '), false,
    'no interval is printed when none was served');
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
      /* And every night cell: one row of the stack, anchored ON the programmed
         rule and extending only as far as that night deviated from it. Nothing
         grows from a shared baseline, so a cell's own end is the only thing its
         width can mean. */
      const programmed = data.nights[0].programmed_rate;
      const rule = Number.isFinite(programmed) ? api.coord([programmed, 0])[0] : params.coordSys.x;
      const cells = option.series.find(({ id }) => id === 'nights');
      for (const [index, item] of (cells?.data || []).entries()) {
        const boxes = cells.renderItem({ ...params, dataIndex: index },
          { ...api, value: (dimension) => item.value[dimension] }).children;
        const [body] = boxes;
        assert.ok(Math.abs(body.shape.x - rule) <= 5
          || Math.abs(body.shape.x + body.shape.width - rule) <= 5,
        `the cell for ${item.name} is anchored on the programmed rule`);
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
  const plot = { x: 28, y: 80, width: 672, height: 147 };
  for (const data of [held, { ...basal, estimate: { value: .74, lo: .6, hi: .92 } }]) {
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

  assert.match(description, new RegExp(`at or above the programmed 0\\.60 U/h on ${more + asSet} of them`));
  assert.match(description, new RegExp(`${more} more, 0 less, ${asSet} exactly as set`));
  assert.match(description, new RegExp(`${basal.excluded_night_count} nights excluded`));
});

test('every multi-series evidence form carries an on-chart legend', () => {
  const basal = fixture('./__fixtures__/basal-night-evidence.json').expected;
  const isf = fixture('../mockups/diagnose-workstation.synthetic/isf-rest-window-evidence.capture.json').payload;
  const ic = fixture('../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json')
    .cases.directional_only;
  const byKind = Object.fromEntries(DIAGNOSE_EVIDENCE_CHARTS.map((entry) => [entry.kind, entry]));
  const options = [
    byKind.basal.option('clock', { data: basal }),
    byKind.basal.option('event', { data: basal }),
    byKind.isf.option('clock', { data: isf }),
    byKind.isf.option('event', { data: isf }),
    byKind['carb-ratio'].option('clock', { data: ic, window: [1200, 420] }),
  ];

  assert.ok(options.slice(1).every(({ legend }) => legend?.show === true));
  assert.ok(options.slice(1).every(({ legend }) => legend.data.length > 0));
  assert.equal(options[0].legend.show, false);
  assert.ok(options[0].graphic.length > 0, 'the basal clock uses its instrument ledger in place of a legend');
});

test('carb-ratio target boundaries stay rails while meal runs stay distinct strands (#255)', () => {
  const data = fixture('../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json')
    .cases.directional_only;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'carb-ratio');
  const option = entry.option('event', { data, range: [80, 220], mini: false });
  const target = option.series.find(({ name }) => name === 'Target range');
  const runs = option.series.filter(({ name, type }) => type === 'line' &&
    (name === 'Support run' || name === 'Directional-only run'));

  assert.equal(target.markArea, undefined, 'the target range does not fill the evidence plot');
  assert.deepEqual(target.markLine.data, [{ yAxis: 70 }, { yAxis: 180 }]);
  assert.equal(target.markLine.lineStyle.type, 'dashed');
  assert.deepEqual(runs.map(({ name, symbol, data: points, lineStyle }) =>
    ({ name, symbol, points, type: lineStyle.type, opacity: lineStyle.opacity })),
  runs.map(({ name, symbol, data: points, lineStyle }) => ({
    name, symbol, points, type: lineStyle.type,
    opacity: name === 'Support run' ? .34 : .20,
  })), 'only the locked strand opacity pair changes presentation');
});

test('feed-only forms do not invent unavailable fit or current-setting values', () => {
  const isf = fixture('../mockups/diagnose-workstation.synthetic/isf-rest-window-evidence.capture.json').payload;
  const ic = fixture('../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json')
    .cases.directional_only;
  const byKind = Object.fromEntries(DIAGNOSE_EVIDENCE_CHARTS.map((entry) => [entry.kind, entry]));

  assert.deepEqual(Object.keys(isf).sort(), ['counts', 'finding', 'schema', 'steps', 'windows']);
  assert.ok(isf.steps.every((step) => !Object.hasOwn(step, 'fit')));
  assert.deepEqual(byKind.isf.option('event', { data: isf }).series
    .map(({ name }) => name), ['Qualifying fasting steps']);
  assert.deepEqual(byKind.isf.option('clock', { data: isf }).series
    .map(({ name }) => name), ['Qualifying fasting steps']);
  assert.equal(Object.hasOwn(ic.block, 'current'), false);
  assert.deepEqual(byKind['carb-ratio'].option('clock', { data: ic }).series
    .map(({ name }) => name), ['Directional-only run', 'Support run']);
});

test('surface copy says Carb ratio rather than the engine abbreviation', () => {
  const ic = fixture('../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json')
    .cases.directional_only;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'carb-ratio');
  const visible = JSON.stringify({
    name: entry.name,
    meta: entry.modes.map((mode) => entry.meta(mode)),
    clock: entry.option('clock', { data: ic, window: [1200, 420] }),
    event: entry.option('event', { data: ic, range: [60, 200] }),
    thumbnail: entry.thumbnail(ic),
  });

  assert.doesNotMatch(visible, /I:C/);
  assert.match(visible, /Carb ratio/);
});

test('chart options resolve live light and dark theme tokens', () => {
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
      basal: byKind.basal.option('clock', { data: basal }),
      isf: byKind.isf.option('event', { data: isf }),
      ic: byKind['carb-ratio'].option('event', { data: ic, range: [60, 240] }),
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
    assert.equal(light.basal.yAxis[0].axisLabel.color, '#3d5848');
    assert.equal(dark.basal.yAxis[0].axisLabel.color, '#a3968a');
    assert.equal(light.basal.series[1].markLine.lineStyle.color, '#4d5c53');
    assert.equal(dark.basal.series[1].markLine.lineStyle.color, '#a89a85');
    assert.equal(light.isf.series[0].itemStyle.color, '#3f5a3b');
    assert.equal(dark.isf.series[0].itemStyle.color, '#86ad78');
    assert.equal(light.ic.series[1].lineStyle.color, '#3f5a3b');
    assert.equal(dark.ic.series[1].lineStyle.color, '#86ad78');
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
      start_min: 1200, end_min: 420 },
    runs: [], series: [],
  };
  const byKind = Object.fromEntries(DIAGNOSE_EVIDENCE_CHARTS.map((entry) => [entry.kind, entry]));

  assert.match(byKind.basal.option('clock', { data: basal, mini: false }).aria.description,
    /19 nights.*3 support this reading/);
  assert.match(byKind.isf.option('event', { data: isf, mini: false }).aria.description,
    /7 detected.*2 qualifying windows.*41 qualifying steps/);
  assert.match(byKind['carb-ratio'].option('clock', { data: ic, mini: false,
    window: [1200, 420] }).aria.description, /11 examined.*4 support.*7 excluded/);
  assert.equal(byKind.basal.thumbnail(basal).graphic[1].style.text, '19 / 3');
  assert.equal(byKind.isf.thumbnail(isf).graphic[1].style.text, '7 / 2 / 41');
  assert.equal(byKind['carb-ratio'].thumbnail(ic).graphic[1].style.text, '11 / 4');
});

test('glucose projections expose served values and thumbnails have no axis furniture', () => {
  const ic = fixture('../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json')
    .cases.below_floor;
  const event = eventCase();
  const byKind = Object.fromEntries(DIAGNOSE_EVIDENCE_CHARTS.map((entry) => [entry.kind, entry]));

  assert.equal(byKind.basal.glucoseValues, null);
  assert.equal(byKind.isf.glucoseValues, null);
  assert.ok(byKind['carb-ratio'].glucoseValues(ic).includes(220));
  const servedMedian = event.projection.cohorts
    .flatMap((cohort) => cohort.points).find((point) => point.median !== null).median;
  assert.ok(byKind['event-comparison'].glucoseValues(event).includes(servedMedian),
    'the comparison reports the medians the case file serves');
  for (const entry of DIAGNOSE_EVIDENCE_CHARTS) {
    const thumbData = entry.kind === 'basal' ? { roster_count: 0, directional_support_count: 0, nights: [] }
      : entry.kind === 'isf' ? { counts: { detected_windows: 0, qualifying_windows: 0,
        qualifying_steps: 0 }, windows: [], steps: [] }
        : entry.kind === 'carb-ratio' ? { block: { examined_runs: 0, support: 0 }, runs: [], series: [] }
          : event;
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
  const key = { dataset: {}, innerHTML: '', insertAdjacentHTML() {} };
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

test('current I:C event options render every published meal member', () => {
  const cases = fixture('../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json')
    .cases;
  const ic = cases.cross_midnight;
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === 'carb-ratio');
  const option = entry.option('event', { data: ic, range: [60, 200] });
  const expectedMembers = ic.runs.reduce((count, run) => count + run.member_offsets_min.length, 0);
  const markers = option.series.filter(({ type }) => type === 'scatter');
  const traces = option.series.filter((series) => series.type === 'line' && series.data.length);

  assert.deepEqual(markers.map(({ symbol }) => symbol), ['diamond', 'emptyDiamond']);
  assert.equal(markers.reduce((count, series) => count + series.data.length, 0), expectedMembers);
  assert.ok(traces.every(({ connectNulls }) => connectNulls === true));
  assert.deepEqual(option.legend.data.map(({ name }) => name),
    ['Support run', 'Directional-only run']);

  const mixed = entry.option('event', { data: cases.directional_only, range: [60, 200] });
  const mixedTraces = mixed.series.filter((series) => series.type === 'line' && series.data.length);
  assert.ok(mixedTraces.every(({ connectNulls }) => connectNulls === true));
  assert.ok(mixedTraces.some(({ lineStyle }) => lineStyle.type === 'solid'));
  assert.ok(mixedTraces.some(({ lineStyle }) => lineStyle.type === 'dashed'));
  assert.deepEqual(mixed.series.filter(({ type }) => type === 'scatter').map(({ symbol }) => symbol),
    ['diamond', 'emptyDiamond']);
});

test('glucose chart options fail closed without one injected field range', () => {
  const ic = fixture('../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json')
    .cases.below_floor;
  const event = eventCase();
  const byKind = Object.fromEntries(DIAGNOSE_EVIDENCE_CHARTS.map((entry) => [entry.kind, entry]));

  assert.throws(() => byKind['carb-ratio'].option('event', { data: ic }),
    /field glucose range/);
  assert.throws(() => byKind['event-comparison'].option(null, { data: event }),
    /field glucose range/);
});
