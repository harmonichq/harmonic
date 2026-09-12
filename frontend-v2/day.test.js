import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildEpisodeLedger, dayStats } from '../frontend/day-chart.js';
import { dayFrame, dayReturnTarget } from './day.js';

// A manufactured week: the navigator's own served shape, with one day of no
// data so the ribbon has a gap to disable (S63).
const WEEK = [
  { iso: '2024-06-23', has_data: true, lows: 0, highs: 1, tir: 74, curve: [{ x: 0.1, bg: 120 }, { x: 0.5, bg: 190 }] },
  { iso: '2024-06-24', has_data: true, lows: 1, highs: 0, tir: 81, curve: [{ x: 0.2, bg: 96 }, { x: 0.6, bg: 64 }] },
  { iso: '2024-06-25', has_data: false, lows: 0, highs: 0, tir: 0, curve: [] },
  { iso: '2024-06-26', has_data: true, lows: 1, highs: 1, tir: 68, curve: [{ x: 0.3, bg: 120 }, { x: 0.7, bg: 48 }] },
  { iso: '2024-06-27', has_data: true, lows: 0, highs: 0, tir: 95, curve: [{ x: 0.4, bg: 110 }] },
  { iso: '2024-06-28', has_data: true, lows: 0, highs: 0, tir: 92, curve: [{ x: 0.4, bg: 115 }] },
  { iso: '2024-06-29', has_data: true, lows: 0, highs: 0, tir: 90, curve: [{ x: 0.4, bg: 118 }] },
];

// The /api/model-view shape the shipped ledger reads. Two anchors: one fired
// finding and one clean moment, so the Episode Log has a band and a quiet
// stretch to render.
const MODEL = {
  date: '2024-06-26',
  window: {
    start: '2024-06-26 00:00:00', end: '2024-06-27 00:00:00',
    cgm: [
      { t: '2024-06-26 08:00:00', bg: 120 },
      { t: '2024-06-26 13:55:00', bg: 48 },
      { t: '2024-06-26 18:00:00', bg: 190 },
    ],
  },
  episodes: [{
    id: '2024-06-26-ep1', start: '2024-06-26 13:00:00', end: '2024-06-26 15:00:00',
    lever: 'over_treated_low', spans_midnight: false,
    anchors: [
      { t: '2024-06-26 13:55:00', kind: 'low', bg: 48, insulin: null, carbs: null, state: 'fired',
        verdicts: [{ classifier: 'over_treated_low', matched: true, silence_reason: null }] },
      { t: '2024-06-26 18:00:00', kind: 'high', bg: 190, insulin: null, carbs: null, state: 'clean',
        verdicts: [{ classifier: 'late_bolus', matched: false, silence_reason: 'no_trigger' }] },
    ],
  }],
};

const COLORS = {
  inRange: '#86ad78', high: '#e2be4c', low: '#ec6f55', accent: '#d08150',
  secondary: '#a89a85', manualCarb: '#d2743e', basal: '#a89a85', line: '#3f3833',
};

const state = (overrides = {}) => ({
  iso: '2024-06-26',
  rows: WEEK,
  bounds: { earliest: '2024-06-01', latest: '2024-06-30', readAt: null },
  month: null,
  stats: dayStats(MODEL),
  ledger: buildEpisodeLedger(MODEL),
  entry: null,
  moved: null,
  focusT: null,
  readAt: null,
  viewedAt: '2024-06-30 09:00:00',
  isNarrow: false,
  colors: COLORS,
  ...overrides,
});

test('the Day desk pairs its chronology with the Episode Log and states the day', () => {
  const markup = dayFrame(state());
  assert.match(markup, /class="pane gf-stage gf-stage-day" aria-label="Day"/);
  assert.match(markup, /class="pane gf-reading" aria-label="Episode Log"/);
  assert.match(markup, /data-day-chart="lanes"/);
  // The day's own statistics come from the shipped dayStats over the served
  // window, never re-derived here: one of three readings is in range.
  assert.match(markup, /<b>33% in range<\/b> · 1 low · 1 high · 3 readings · 48–190 mg\/dL/);
  assert.match(markup, /<dt>Readings<\/dt><dd>3<\/dd>/);
  // With no recorded read instant the desk names the clock it is viewed at,
  // rather than inventing a read it does not have.
  assert.match(markup, /Day · viewed <b>Jun 30, 2024 · 09:00<\/b>/);
  assert.match(markup, /<span class="meta">viewed Jun 30, 2024 · 09:00<\/span>/);
});

test('a store that records its last fetch names that read, and the clock beside it', () => {
  const markup = dayFrame(state({ readAt: '2024-06-30 07:15:00' }));
  assert.match(markup, /Day · read <b>Jun 30, 2024 · 07:15<\/b> · viewed Jun 30, 2024 · 09:00/);
  assert.match(markup, /<span class="meta">read Jun 30, 2024 · 07:15<\/span>/);
});

test('the week ribbon offers each recorded day and disables the ones with no data', () => {
  const markup = dayFrame(state());
  const columns = [...markup.matchAll(/<button class="gf-nav-col" data-pick="([\d-]+)"([^>]*)>/g)]
    .map(([, iso, attrs]) => ({ iso, disabled: attrs.includes('disabled'), labelled: attrs.includes('aria-label=') }));
  assert.equal(columns.length, 7);
  assert.deepEqual(columns.map((c) => c.iso), WEEK.map((d) => d.iso));
  for (const column of columns) assert.ok(column.labelled, `${column.iso} has no accessible label`);
  assert.deepEqual(columns.filter((c) => c.disabled).map((c) => c.iso), ['2024-06-25']);
  assert.match(markup, /data-pick="2024-06-26" aria-pressed="true"/);
});

test('the recorded-day and month controls disable at the recorded bounds', () => {
  const held = dayFrame(state());
  assert.match(held, /data-day="prev" aria-label="Previous recorded day" >/);
  assert.match(held, /data-day="next" aria-label="Next recorded day" >/);
  const atLatest = dayFrame(state({ iso: '2024-06-30' }));
  assert.match(atLatest, /data-day="next" aria-label="Next recorded day" disabled>/);
  assert.match(atLatest, /data-day="latest" disabled>/);
  const atEarliest = dayFrame(state({ iso: '2024-06-01' }));
  assert.match(atEarliest, /data-day="prev" aria-label="Previous recorded day" disabled>/);
});

test('the month toggle opens the grid in the ribbon\'s place and steps within the bounds', () => {
  const week = dayFrame(state());
  assert.match(week, /class="gf-btn gf-month-toggle" data-day="month" aria-expanded="false"/);
  assert.ok(!week.includes('gf-nav-cell'), 'the month grid rendered while the week was in hand');

  const month = dayFrame(state({ month: { y: 2024, m: 6 } }));
  assert.match(month, /data-day="month" aria-expanded="true"/);
  assert.ok(month.includes('gf-nav-cell'), 'the month grid rendered no cells');
  // June 2024 is the whole recorded range, so both steppers are at a bound.
  assert.match(month, /data-day="prev-month" aria-label="Previous month" disabled>/);
  assert.match(month, /data-day="next-month" aria-label="Next month" disabled>/);
  const july = dayFrame(state({ month: { y: 2024, m: 7 }, iso: '2024-06-30' }));
  assert.match(july, /data-day="prev-month" aria-label="Previous month" >/);
});

test('a month still being read says so instead of drawing every day as no data', () => {
  // Stepping the month is a served read. Drawing the unread month as a grid of
  // disabled cells would state something about the wearer's record — that these
  // days hold nothing — which is a different claim from "this has not arrived".
  const loading = dayFrame(state({ month: { y: 2024, m: 5 }, monthArrived: false }));
  assert.match(loading, /role="status">Loading…</);
  assert.ok(!loading.includes('— no data'), 'an unread month claimed the days hold no data');
  assert.ok(!/\d+ recorded days<\/span><\/div><div class="gf-nav-dow"/.test(loading),
    'an unread month stated a recorded-day count it cannot know');
  // The desk itself stays standing: the stage, its rail and the month's own
  // stepper are all still there to press.
  assert.match(loading, /class="pane gf-stage gf-stage-day"/);
  assert.match(loading, /data-day="prev-month"/);
  assert.match(loading, /data-day="next-month"/);
  assert.match(loading, /aria-label="May 2024"/);
});

test('a retained Day frame has a visible, non-destructive loading treatment', () => {
  const source = readFileSync(new URL('./desk.css', import.meta.url), 'utf8');
  assert.match(source, /\.gf-stage-day\[aria-busy="true"\]\s*\{[^}]*opacity:\.55/);
  assert.match(source, /\.gf-stage-day\[aria-busy="true"\] \.gf-day-loading/);
  assert.match(source, /\.gf-loading\.gf-day-loading/,
    'the retained frame reuses the desk loading primitive instead of replacing the Day context');
});

test('each Episode Log row renders its served state word and its kind', () => {
  const markup = dayFrame(state());
  const rows = [...markup.matchAll(/<button class="gf-row gf-log-row" data-day-row="([^"]+)" aria-pressed="(\w+)">/g)];
  assert.deepEqual(rows.map(([, t]) => t), ['2024-06-26 13:55:00']);
  assert.match(markup, /<div class="gf-log-cap">Findings · 1<\/div>/);
  assert.match(markup, /<span class="tier" data-state="fired">finding<\/span>/);
  assert.match(markup, /over-treated low/);
  // The shipped ledger folds a silent anchor into the quiet stretch rather than
  // giving it a row of its own; the desk renders that band, not a re-derivation.
  assert.match(markup, /<div class="gf-log-cap">Quiet · 1<\/div>/);
  assert.match(markup, /1 clean · 0 explained · 0 no data/);
  // A focused moment is the pressed row (S67).
  const focused = dayFrame(state({ focusT: '2024-06-26 13:55:00' }));
  assert.match(focused, /data-day-row="2024-06-26 13:55:00" aria-pressed="true"/);
});

test('direct entry invents no prior subject and offers no return', () => {
  const markup = dayFrame(state());
  assert.ok(!markup.includes('Opened from'), 'direct Day entry named a prior subject');
  assert.ok(!markup.includes('data-day="return"'), 'direct Day entry invented a return target');
  assert.equal(dayReturnTarget(null), null);
  assert.equal(dayReturnTarget({ from: 'diagnose' }), null, 'a return needs the entry that carried it');
});

test('a contextual entry names its subject verbatim and returns to what it left', () => {
  const entry = {
    date: '2024-06-26', subject: 'Selected occurrence · Jun 26 13:55',
    from: 'diagnose', focus: ".gf-member-row[data-occ='occ-7']",
  };
  const markup = dayFrame(state({ entry }));
  assert.match(markup, /<h3>Opened from<\/h3><p>Selected occurrence · Jun 26 13:55<\/p>/);
  assert.match(markup, /data-day="return">Return to Diagnose</);

  const back = dayReturnTarget(entry);
  assert.deepEqual(back, {
    utility: null, destination: 'diagnose', label: 'Diagnose',
    focus: ".gf-member-row[data-occ='occ-7']", subject: 'Selected occurrence · Jun 26 13:55',
  });
});

test('a utility entry is named for the utility and returns over the destination it was opened on', () => {
  // S76 and the lock's verbatim `Return to Carb questions`.
  const entry = {
    date: '2024-06-26', subject: 'Questions · Jun 26 13:55',
    from: 'diagnose.questions', focus: "[data-question-card='q-7'] [data-action='day']",
  };
  assert.match(dayFrame(state({ entry })), /data-day="return">Return to Carb questions</);
  const back = dayReturnTarget(entry);
  assert.equal(back.utility, 'questions');
  assert.equal(back.destination, 'diagnose');
  assert.equal(back.label, 'Carb questions');
});

test('a date the read does not carry says so rather than showing an empty day as the answer', () => {
  const markup = dayFrame(state({ moved: '2024-05-04' }));
  assert.match(markup, /May 4, 2024 is not among this read's recorded days/);
});

test('a store with no recorded day says so and offers the way back', () => {
  const markup = dayFrame({ iso: null });
  assert.match(markup, /No days recorded/);
  assert.match(markup, /data-destination-action="diagnose"/);
});
