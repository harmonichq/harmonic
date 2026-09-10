/* Triage spike for #367 — a selected occurrence's trace is drawn against a
 * y-axis computed without it.
 *
 *   node docs/scope/367-selected-trace-axis.spike.mjs
 *
 * Part A observes, through the shipped exported option builder, what the stage
 * draws today: `option()` pushes `selectedSeries` whenever `!mini`, but the
 * range it is handed comes from `eventComparisonGlucoseValues`, which
 * deliberately omits `selection.detail.glucose`. So the stage draws a series
 * the axis never saw. Part A asserts only stable facts, and prints the clipping
 * as an observation, so this file stays green before and after the fix and its
 * A2 line reads as the before/after.
 *
 * Part B pins the arithmetic of the proposed fix — widen the axis this chart
 * draws against so it covers the trace this chart draws, quantised to
 * GLUCOSE_STEP, never narrowing the injected field range. The literals in the
 * work order come from running this file, not from prose.
 *
 * Every value here is synthetic: the committed generator-owned case-file
 * fixture, and clones of it perturbed in this file.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  eventComparisonChartOption,
  eventComparisonGlucoseValues,
  glucoseRange,
  GLUCOSE_STEP,
} from '../../frontend/diagnose-event-comparison.js';

const cases = JSON.parse(readFileSync(
  new URL('../../mockups/diagnose-workstation.synthetic/finding-case-files.json', import.meta.url),
  'utf8',
)).cases;

/* One committed selected case file, and the range the shipped mount computes
   for it — `renderEventSurface` line 233 does exactly this pair. */
const selectedCase = (findingId) => {
  const bundle = cases[findingId];
  const [id] = Object.keys(bundle.selected_event);
  return structuredClone(bundle.selected_event[id]);
};
const mountRange = (caseFile) => glucoseRange(eventComparisonGlucoseValues(caseFile));
const traceExtent = (option) => {
  const trace = option.series.find((series) => series.id === 'selected:trace');
  if (!trace) return null;
  const values = trace.data.map(([, bg]) => bg).filter(Number.isFinite);
  return [Math.min(...values), Math.max(...values)];
};
const setPeak = (caseFile, bg) => {
  const points = caseFile.selection.detail.glucose;
  points[Math.floor(points.length / 2)].bg = bg;
  return caseFile;
};

const report = [];

/* ---- A. what the shipped public interface draws today ------------------- */

const resting = selectedCase('finding:carb_undercount');
const restingRange = mountRange(resting);
const restingOption = eventComparisonChartOption(resting, restingRange, null, false);
report.push(['A1 committed selection, unperturbed',
  `axis=[${restingOption.yAxis.min},${restingOption.yAxis.max}] sel=[${traceExtent(restingOption)}]`]);
assert.deepEqual(restingRange, [60, 200], 'the committed fixture rests on the envelope');
assert.ok(traceExtent(restingOption)[1] <= restingOption.yAxis.max,
  'no committed selection clips today — the fixture cannot show the defect unperturbed');

/* The reproduction. 260 is the peak measured on synthetic server 8802 for the
   single matched occurrence of `finding:over_treated_low`.

   This is an OBSERVATION, not an assertion: the line below prints what the
   shipped builder does today and will print `contained` once #367 lands, so the
   spike stays green on both sides of the fix and its output is the before/after.
   At triage it printed `DRAWN OFF THE PLOT`. */
const clipping = setPeak(selectedCase('finding:carb_undercount'), 260);
const clippingRange = mountRange(clipping);
const clippingOption = eventComparisonChartOption(clipping, clippingRange, null, false);
const [clippedLow, clippedPeak] = traceExtent(clippingOption);
report.push(['A2 selection peaking at 260 (the 8802 shape)',
  `axis=[${clippingOption.yAxis.min},${clippingOption.yAxis.max}] peak=${clippedPeak} `
  + `${clippedPeak > clippingOption.yAxis.max ? 'DRAWN OFF THE PLOT (pre-fix)' : 'contained'}`]);
assert.equal(clippedPeak, 260, 'the perturbed clone did not reach the posed peak');

/* The mini rank never draws the trace, so it never had the defect. */
const miniOption = eventComparisonChartOption(clipping, clippingRange, null, true);
report.push(['A3 the same case file at the mini rank',
  `axis=[${miniOption.yAxis.min},${miniOption.yAxis.max}] trace=${traceExtent(miniOption)}`]);
assert.equal(traceExtent(miniOption), null, 'a mini draws no selected trace');

/* ---- B. the proposed rule's arithmetic ---------------------------------- */

/* Widen the range this chart draws against to cover the values this chart
   draws. Never narrows the injected range, so a widened chart still contains
   the shared field ruler; quantised to GLUCOSE_STEP so the bound lands on the
   same grid the envelope machinery already uses. */
const containing = (range, values) => {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return range;
  return [
    Math.min(range[0], Math.floor(Math.min(...finite) / GLUCOSE_STEP) * GLUCOSE_STEP),
    Math.max(range[1], Math.ceil(Math.max(...finite) / GLUCOSE_STEP) * GLUCOSE_STEP),
  ];
};

const table = [
  ['a selection inside the field leaves the axis alone', [60, 200], [87.5, 162.5], [60, 200]],
  ['the 8802 peak (260) widens to the next step', [40, 200], [48, 260], [40, 260]],
  ['8803 late_bolus 204.6 widens one step', [60, 200], [120.2, 204.6], [60, 220]],
  ['8803 late_bolus 210.4 widens one step', [60, 200], [142.6, 210.4], [60, 220]],
  ['a selection below the field widens downward', [60, 200], [38, 150], [20, 200]],
  ['an injected field wider than the selection is never narrowed', [40, 320], [90, 190], [40, 320]],
  ['a selection exactly on a step does not over-widen', [60, 200], [100, 220], [60, 220]],
];
for (const [name, range, [low, high], expected] of table) {
  assert.deepEqual(containing(range, [low, high]), expected, name);
  report.push([`B ${name}`, `${JSON.stringify(range)} + [${low},${high}] -> ${JSON.stringify(expected)}`]);
}

/* Applied to the reproduction, the trace lands inside its own axis. This is the
   invariant #367 must establish, and it holds before and after the fix because
   it is asserted against the rule's own output rather than the shipped axis. */
const fixedRange = containing(clippingRange, clipping.selection.detail.glucose.map((p) => p.bg));
report.push(['B applied to A2', `axis=[${fixedRange}] contains [${clippedLow},${clippedPeak}]`]);
assert.ok(clippedPeak <= fixedRange[1] && clippedLow >= fixedRange[0],
  'the proposed rule still leaves the trace outside its axis');
assert.ok(fixedRange[0] <= clippingRange[0] && fixedRange[1] >= clippingRange[1],
  'the proposed rule narrowed the injected field range');

for (const [name, detail] of report) console.log(`${name.padEnd(52)} ${detail}`);
console.log('\nspike ok — see A2 for the shipped behaviour, B for the proposed arithmetic');
