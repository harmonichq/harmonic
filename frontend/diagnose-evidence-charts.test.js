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
    ['clock', 'event'], ['event', 'clock'], ['event', 'clock'], null,
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
  const EVIDENCE = { basal: 'nights of steady data', 'carb-ratio': 'meal runs' };
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
        assert.ok(title.endsWith(` · ${evidence}`), `${title} keeps the ${kind} evidence phrase`);
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
  assert.equal(byKind.basal.nameFor({ id: 'basal:0-30', parameter: 'basal_rate' }).title,
    'Basal · nights of steady data');
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
    'BASAL · NIGHTS OF STEADY DATA');
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

  assert.equal(basalClock.xAxis.type, 'category');
  assert.equal(isfEvent.xAxis.name, 'insulin acted (U)');
  assert.deepEqual(icEvent.yAxis.min, 80);
  assert.deepEqual(icEvent.yAxis.max, 220);
  assert.deepEqual(basalClock.grid, isfEvent.grid);
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

  assert.ok(options.every(({ legend }) => legend?.show === true));
  assert.ok(options.every(({ legend }) => legend.data.length > 0));
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
    assert.equal(light.basal.yAxis.axisLabel.color, '#3d5848');
    assert.equal(dark.basal.yAxis.axisLabel.color, '#a3968a');
    assert.equal(light.basal.series[1].lineStyle.color, '#5d7368');
    assert.equal(dark.basal.series[1].lineStyle.color, '#a89a85');
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
    'the target band rides with the traces');
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
