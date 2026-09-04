#!/usr/bin/env node
/* Labeled-synthetic fixture for the #677 browser replay and #694 support lock.
 * Detector verdicts remain fixture facts. The `visual_support` projection is
 * generated here, on the server side of the mock boundary, so the browser only
 * renders Supported / Limited / Withheld and never carries a numeric floor.
 * Identity and calendar facts come from the workstation's single synthetic
 * exposure population; comparison-specific shapes stay local here.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const factors = {
  meals: ['carb_undercount', 'late_bolus', 'meal_over_delivery'],
  lows: ['over_treated_low', 'correction_on_iob', 'correction_stacking'],
};
const labels = {
  carb_undercount: 'Carb undercount',
  late_bolus: 'Late bolus',
  meal_over_delivery: 'Meal over-delivery',
  over_treated_low: 'Over-treated low',
  correction_on_iob: 'Correction on active insulin',
  correction_stacking: 'Correction stacking',
};
const plan = [
  'fired', 'fired', 'fired', 'fired', 'fired', 'fired', 'fired',
  'near_rule', 'near_rule', 'near_rule', 'near_rule',
  'neutral', 'neutral', 'neutral', 'neutral', 'neutral', 'neutral',
  'another_factor', 'excluded', 'excluded',
];
// Comparison membership is fixture-local. Workstation rows supply the canonical
// identity/anchor/date tuple, but their counter-example attribution must never
// rewrite this capture's twenty-row cohort or outcome plan (ADR 64).
const outcomeMinutes = {
  meals: [455, 875, 1150, 465, 790, 1010, 80, 365, 730, 1085,
    290, 1150, 920, 1235, 205, 650, 990, 350, 845, 1180],
  lows: [95, 140, 185, 230, 275, 320, 505, 640, 905, 1075,
    410, 700, 1015, 160, 980, 55, 365, 515, 755, 835],
};
const WINDOWS = [null, { start_min: 0, end_min: 360 },
  { start_min: 360, end_min: 720 }, { start_min: 720, end_min: 1080 },
  { start_min: 1080, end_min: 1440 }, { start_min: 1320, end_min: 120 },
  { start_min: 720, end_min: 960 }, { start_min: 840, end_min: 960 },
  { start_min: 360, end_min: 480 }, { start_min: 455, end_min: 790 },
  { start_min: 465, end_min: 780 }, { start_min: 720, end_min: 1440 },
  { start_min: 840, end_min: 900 }];
const cohortRank = (index) => plan.slice(0, index).filter((cohort) => cohort === plan[index]).length;

function traceIncludes(cohort, rank, minute, start, end) {
  const span = end - start;
  const progress = (minute - start) / span;
  if (cohort === 'fired') {
    const starts = [0, 10, 15, 20, 25, 30, 35];
    const ends = [0, 0, 10, 15, 20, 25, 30];
    return minute >= start + starts[rank] && minute <= end - ends[rank];
  }
  if (cohort === 'near_rule') {
    const dropout = [[.64, .80], [.30, .45], [.47, .62], [.14, .25]][rank];
    return !(progress >= dropout[0] && progress <= dropout[1]);
  }
  if (cohort === 'neutral') {
    const starts = [0, 0, 5, 10, 15, 20];
    const ends = [0, 5, 10, 15, 20, 25];
    return minute >= start + starts[rank] && minute <= end - ends[rank];
  }
  return true;
}

function cgm(view, index) {
  const [start, end] = view === 'meals' ? [-60, 300] : [-60, 120];
  const cohort = plan[index];
  const rank = cohortRank(index);
  const spread = {
    fired: [-30, -18, -8, 1, 12, 22, 36],
    near_rule: [-38, -12, 18, 43],
    neutral: [-7, -4, -1, 2, 5, 8],
    another_factor: [8],
    excluded: [-3, 4],
  }[cohort][rank];
  const offset = { fired: 10, near_rule: 2, neutral: -10, another_factor: 6, excluded: 0 }[cohort] + spread;
  const rows = [];
  for (let minute = start; minute <= end; minute += 5) {
    if (!traceIncludes(cohort, rank, minute, start, end)) continue;
    let bg;
    if (view === 'meals') {
      const rise = minute < 120 ? Math.max(0, minute + 30) * .48 : 72 - (minute - 120) * .25;
      bg = 128 + Math.max(0, rise) + offset + Math.sin((minute + index * 17) / 24) * (7 + rank);
    } else {
      const distance = Math.abs(minute);
      const low = 150 - Math.max(0, 105 - distance * .48);
      const rebound = minute > 0 ? minute * .7 : 0;
      bg = low + rebound + offset + Math.sin((minute + index * 19) / 30) * (5 + rank * .7);
    }
    rows.push({ minute, bg: Math.max(42, Math.min(294, Math.round(bg))) });
  }
  // The Python projection rounds an episode trace to its nearest five-minute
  // bin. Keep one deliberately off-grid reading in the frozen fixture so the
  // mirror cannot silently turn that into floor-binning.
  if (view === 'meals' && index === 1) rows[0].minute += 3;
  return rows;
}

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
};

function aggregate(occurrences, window) {
  const [start, end] = window;
  const values = new Map();
  for (let minute = start; minute <= end; minute += 5) values.set(minute, []);
  for (const item of occurrences) {
    const occurrenceBins = new Map();
    for (const point of item.trace.cgm) {
      const minute = start + Math.round((point.minute - start) / 5) * 5;
      if (minute < start || minute > end) continue;
      const existing = occurrenceBins.get(minute);
      if (!existing || Math.abs(point.minute - minute) < Math.abs(existing.minute - minute)) {
        occurrenceBins.set(minute, point);
      }
    }
    for (const [minute, point] of occurrenceBins) values.get(minute).push(point.bg);
  }
  return [...values].map(([minute, rows]) => {
    const sorted = rows.sort((a, b) => a - b);
    return {
      minute, n: sorted.length,
      p25: quantile(sorted, .25), p50: quantile(sorted, .5), p75: quantile(sorted, .75),
    };
  });
}

const supportForCount = (count) => count <= 1 ? 'withheld' : count <= 4 ? 'limited' : 'supported';

function pointSupport(count, cohortCount, cohortSupport) {
  if (count <= 1) return 'withheld';
  if (count <= 4) return 'limited';
  if (cohortSupport !== 'supported') return 'limited';
  return count * 2 >= cohortCount ? 'supported' : 'limited';
}

function supportRuns(rows, cohortCount, cohortSupport) {
  const runs = [];
  for (const row of rows) {
    const support = pointSupport(row.n, cohortCount, cohortSupport);
    const prior = runs.at(-1);
    if (prior && prior.end + 5 === row.minute
        && prior.n === row.n && prior.support === support) {
      prior.end = row.minute;
    } else {
      runs.push({ start: row.minute, end: row.minute, n: row.n, support });
    }
  }
  return runs.map((run) => `${run.start}|${run.end}|${run.n}|${run.support}`);
}

function windowKey(window) {
  return window ? `${window.start_min}-${window.end_min}` : 'whole-day';
}

function inWindow(item, window) {
  if (!window) return true;
  return window.start_min < window.end_min
    ? item.outcome_min >= window.start_min && item.outcome_min < window.end_min
    : item.outcome_min >= window.start_min || item.outcome_min < window.end_min;
}

function visualProjection(view, factor, window, variant = 'dense') {
  const result = { server_owned: true, cohorts: {} };
  for (const cohort of ['fired', 'near_rule', 'neutral', 'another_factor']) {
    let occurrences = view.occurrences.filter((item) =>
      item.routes[factor]?.cohort === cohort && inWindow(item, window));
    if (variant === 'sparse') occurrences = occurrences.slice(0, 2);
    if (variant === 'zero-fired' && cohort === 'fired') occurrences = [];
    const cohortSupport = supportForCount(occurrences.length);
    result.cohorts[cohort] = {
      support: cohortSupport,
      occurrence_ids: occurrences.map((item) => item.id),
      // Compact fixture-only encoding: start|end|distinct contributors|server
      // state. Adjacent identical facts are run-length encoded at five minutes.
      // It keeps the committed manufactured capture reviewable without making
      // this temporary projection the production interface that #678 owns.
      points: supportRuns(aggregate(occurrences, view.window), occurrences.length, cohortSupport),
    };
  }
  return result;
}

function attachVisualSupport(view) {
  const support = {};
  for (const factor of view.factors) {
    for (const window of WINDOWS) {
      support[`dense:${factor}:${windowKey(window)}`] = visualProjection(view, factor, window);
    }
    support[`sparse:${factor}:whole-day`] = visualProjection(view, factor, null, 'sparse');
    support[`zero-fired:${factor}:whole-day`] = visualProjection(view, factor, null, 'zero-fired');
  }
  view.visual_support = support;
  return view;
}

function routes(view, cohort) {
  const [primary, second, third] = factors[view];
  const result = {};
  for (const factor of factors[view]) {
    let routed = 'excluded';
    if (cohort === 'neutral') routed = 'neutral';
    else if (cohort === 'excluded') routed = 'excluded';
    else if (cohort === 'near_rule') routed = factor === primary ? 'near_rule' : 'excluded';
    else if (cohort === 'fired') routed = factor === primary ? 'fired' : 'another_factor';
    else if (cohort === 'another_factor') routed = factor === second ? 'fired' : 'another_factor';
    result[factor] = {
      cohort: routed,
      provenance: routed === 'near_rule' ? 'synthetic boundary fixture'
        : routed === 'neutral' ? 'fully judged; no factor matched'
          : routed === 'excluded' ? 'not safely comparable'
            : routed === 'another_factor' ? 'another current classifier matched'
              : 'current classifier matched',
    };
    if (routed === 'near_rule') {
      result[factor].boundary = view === 'meals'
        ? { implied_carbs_g: 50, logged_carbs_g: 38, ratio: 1.32, gap_g: 12 }
        : { nadir_mgdl: 70, guarded_rebound_peak_mgdl: 150, live_bar_mgdl: 160 };
    }
    if (routed === 'another_factor') result[factor].other_factors = [second];
  }
  void third;
  return result;
}

function occurrence(view, index, source) {
  const stamp = source.t;
  // ADR 62 membership follows where the consequence landed, not the trigger.
  // This shared 13:00 meal key lands at 14:35, so a 14:00–15:00 request must
  // include it even though its anchor lies outside that window.
  const outcomeMin = outcomeMinutes[view][index];
  const cohort = plan[index];
  const primary = factors[view][0];
  const trace = {
    cgm: cgm(view, index),
    boluses: view === 'meals'
      ? [{ minute: 0, insulin: 3 + index * .1, carbs: 30 + index, completion: 'Completed', seq_num: index + 1 }]
      : [],
    suspends: [],
  };
  if (view === 'lows') {
    /* The source rows exercise #698's closed marker contract. Source is
       deliberately removed before the fixture reaches a renderer. The
       null-gram row is carried all the way into the committed capture (not
       filtered out here) so both replay legs — the mock's own inline filter
       and project.mjs's projection filter — genuinely drop it at render time,
       instead of it being absent from the fixture before either ever sees
       it (#711). */
    const rescueRows = index === 0 ? [
      { minute: 8, grams: 8, certainty: 'exact', source: 'manual' },
      { minute: 14, grams: 6, certainty: 'estimate', source: 'rise-prompt' },
      { minute: 21, grams: 4, certainty: 'unknown', source: 'low-prompt' },
      { minute: 28, grams: null, certainty: 'unknown', source: 'manual' },
    ] : [];
    trace.rescue_carbs = rescueRows
      .filter((row) => Number.isFinite(row.grams) && row.grams > 0 || row.grams === null)
      .map(({ source, ...marker }) => marker);
  }
  return {
    id: `${view}-synthetic-${index + 1}`,
    ep_id: source.ep_id,
    date: source.date,
    anchor_t: stamp,
    outcome_min: outcomeMin,
    anchor_bg: view === 'meals' ? 132 + index : 68 + (index % 3),
    worst_bg: view === 'meals' ? 205 + index : 58 + (index % 4),
    label: view === 'meals' ? 'Completed carb bolus' : 'Low excursion',
    verdicts: factors[view].map((factor) => ({
      classifier: factor,
      matched: routes(view, cohort)[factor].cohort === 'fired',
      detail: routes(view, cohort)[factor].cohort === 'fired'
        ? `${labels[factor]} matched the current rule.`
        : `${labels[factor]} did not match the current rule.`,
      evidence_tier: 'observed',
      silence_reason: routes(view, cohort)[factor].cohort === 'near_rule' ? 'under_threshold' : 'no_trigger',
    })),
    routes: routes(view, cohort),
    trace,
    ...(view === 'meals' ? { anchor_bolus: { seq_num: index + 1, carbs: 30 + index, insulin: 3 + index * .1 } } : {}),
  };
}

function sourceRows(workstationExposures, family) {
  const rows = workstationExposures?.exposures?.[family]?.occurrences;
  if (!Array.isArray(rows) || rows.length !== plan.length) {
    throw new Error(`incomplete ${family} exposure population: expected ${plan.length} rows, got ${rows?.length ?? 0}`);
  }
  const window = workstationExposures?.window;
  if (!window?.start || !window?.end) throw new Error('missing workstation exposure window');
  for (const [index, row] of rows.entries()) {
    if (!row?.ep_id || !row?.t || !row?.date) {
      throw new Error(`incomplete ${family} source row ${index + 1}`);
    }
    if (row.date < window.start || row.date > window.end) {
      throw new Error(`${family} source row ${index + 1} date ${row.date} outside inclusive window ${window.start}..${window.end}`);
    }
  }
  return rows;
}

/** Build and validate the fixture-only capture from the canonical workstation input. */
export function buildCapture(workstationExposures) {
  const meals = sourceRows(workstationExposures, 'meals');
  const lows = sourceRows(workstationExposures, 'lows');
  return {
    schema: 'finding-case-file-event-capture-v1',
    fixture: 'labeled-synthetic',
    source_window: structuredClone(workstationExposures.window),
    views: {
      meals: attachVisualSupport({
        anchor: 'completed carb-bolus', window: [-60, 300],
        factors: factors.meals, default_factor: 'carb_undercount',
        factor_labels: Object.fromEntries(factors.meals.map((key) => [key, labels[key]])),
        occurrences: plan.map((_, index) => occurrence('meals', index, meals[index])),
      }),
      lows: attachVisualSupport({
        anchor: 'excursion nadir', window: [-60, 120],
        factors: factors.lows, default_factor: 'over_treated_low',
        factor_labels: Object.fromEntries(factors.lows.map((key) => [key, labels[key]])),
        occurrences: plan.map((_, index) => occurrence('lows', index, lows[index])),
      }),
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const workstationExposures = JSON.parse(readFileSync(
    new URL('../diagnose-workstation.synthetic/payload.json', import.meta.url), 'utf8')).exposures;
  const capture = buildCapture(workstationExposures);
  const serialized = JSON.stringify(capture, null, 2) + '\n';
  const target = new URL('./capture.json', import.meta.url);
  if (process.argv.includes('--check')) {
    const current = readFileSync(target, 'utf8');
    if (current !== serialized) {
      process.stderr.write('stale fixture: mockups/diagnose-event-comparison.synthetic/capture.json — rerun generate.mjs --write\n');
      process.exitCode = 1;
    } else {
      process.stdout.write('event-comparison synthetic capture current\n');
    }
  } else if (process.argv.includes('--write')) {
    writeFileSync(target, serialized);
  } else {
    process.stdout.write(serialized);
  }
}
