import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ANCHOR_STATE_WORD, buildEpisodeLedger, dayStats } from './day-chart.js';
import { glossaryGroups } from './glossary.js';

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
    lever: 'over_treated_low', lever_title: 'Over-treated low', spans_midnight: false,
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

// The Day destination's served reads, answered from the manufactured week and
// day above. data.js binds fetch once at import, so the stub is in place before
// day.js is first imported, which is why that import is dynamic (the
// changes.test.js pattern). data.js keeps the stub it bound; the global goes
// back at once. The read stamp is a Denver evening; the viewed-stamp test pins
// that zone itself.
const READ_AT = '2024-06-29 21:30:12';
const STATUS = { earliest_data_day: '2024-06-23', latest_data_day: '2024-06-29', last_success_at: READ_AT };
const dayModel = (iso) => (iso === MODEL.date ? MODEL : {
  date: iso, episodes: [],
  window: { start: `${iso} 00:00:00`, end: `${iso} 23:59:59`, cgm: [{ t: `${iso} 08:00:00`, bg: 118 }] },
});
function served(address) {
  const { pathname, searchParams } = new URL(address, 'http://desk.test');
  if (pathname === '/api/status') return STATUS;
  if (pathname === '/api/day-navigator') return { days: WEEK };
  if (pathname === '/api/model-view') return dayModel(searchParams.get('date'));
  if (pathname === '/api/timeline') return { start: searchParams.get('start'), end: searchParams.get('end') };
  if (pathname === '/api/carbs') return { carb_entries: [] };
  throw new Error(`the Day test serves no ${address}`);
}
const unstubbed = globalThis.fetch;
globalThis.fetch = async (address) => ({ ok: true, json: async () => served(address) });
const { dayFrame, dayReturnTarget, installDay } = await import('./day.js');
const { loading, navigate, render, startDesk } = await import('./routes.js');
const { evidenceDayContext } = await import('./diagnose-context.js');
globalThis.fetch = unstubbed;

// The page the desk is seated on: a plain host, and a browser whose history
// moves its location, so a test reads back the address navigate wrote.
const seat = { innerHTML: '', dataset: {}, querySelectorAll: () => [], querySelector: () => null };
const location = { pathname: '/day', search: '', hash: '' };
const goTo = (address) => {
  const url = new URL(address, 'http://desk.test');
  Object.assign(location, { pathname: url.pathname, search: url.search, hash: url.hash });
};
const browser = {
  location,
  history: { pushState: (data, title, address) => goTo(address), replaceState: (data, title, address) => goTo(address) },
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  addEventListener() {},
};

// Every open read has landed and rendered.
async function arrived() {
  do await new Promise((resolve) => setImmediate(resolve)); while (loading());
}

// A render reads document and getComputedStyle, and navigate writes the address
// through window.location and window.history. Each is replaced only while the
// desk runs. The desk is seated once, at /day, the first time a test needs it.
let seated = false;
async function onPage(run) {
  const previous = { document: globalThis.document, window: globalThis.window, getComputedStyle: globalThis.getComputedStyle };
  globalThis.document = { activeElement: { tagName: 'BODY' }, querySelectorAll: () => [], documentElement: {} };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
  globalThis.window = browser;
  try {
    if (!seated) { seated = true; installDay(); startDesk(seat, { browser }); }
    await arrived();
    await run();
  } finally {
    Object.assign(globalThis, previous);
  }
}

const pressed = (markup) => [...markup.matchAll(/class="gf-nav-col" data-pick="([\d-]+)" aria-pressed="true"/g)].map(([, iso]) => iso);
const kicker = (markup) => markup.match(/<div class="gf-kicker">(.*?)<\/div>/)?.[1];

const state = (overrides = {}) => ({
  iso: '2024-06-26',
  months: new Map([['2024-06', WEEK]]),
  bounds: { earliest: '2024-06-01', latest: '2024-06-30', dataDays: 29, readAt: null },
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

// Each Episode Log band caption: its printed text, and the Glossary control it carries.
const captions = (markup) => [...markup.matchAll(/<div class="gf-log-cap"><span class="gf-log-title">(.*?)<\/span>(<button[^>]*>[^<]*<\/button>)<\/div>/g)]
  .map(([, text, control]) => ({ text, control }));

test('each Episode Log row renders its served state word and its kind', () => {
  const markup = dayFrame(state());
  const rows = [...markup.matchAll(/<button class="gf-row gf-log-row" data-day-row="([^"]+)" aria-pressed="(\w+)">/g)];
  assert.deepEqual(rows.map(([, t]) => t), ['2024-06-26 13:55:00']);
  assert.deepEqual(captions(markup).map((cap) => cap.text), ['Findings · 1', 'Quiet · 1']);
  assert.match(markup, /<span class="tier" data-state="fired">finding<\/span>/);
  assert.match(markup, / · Over-treated low<\/span><\/button>/);
  // The shipped ledger folds a silent anchor into the quiet stretch rather than
  // giving it a row of its own; the desk renders that band, not a re-derivation.
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

// The text each rendered Episode Log row reads, keyed by its moment.
const logRows = (markup) => [...markup.matchAll(/<button class="gf-row gf-log-row" data-day-row="([^"]+)"[^>]*>.*?<span class="text">(.*?)<\/span><\/button>/g)]
  .map(([, t, text]) => ({ t, text: text.replace(/<[^>]+>/g, '').trim() }));
// The "Opened from" section's printed origin.
const openedFrom = (markup) => /<h3>Opened from<\/h3><p>(.*?)<\/p>/.exec(markup)?.[1] ?? null;
const ID_TEXT = /\b(pattern|finding|basal):/;

test('a contextual entry names the served title it was opened from and returns to what it left', () => {
  // The entry comes from the Diagnose door itself, over a served case file.
  const entry = evidenceDayContext({
    occurrence: { id: 'occ-7', t: '2024-06-26 13:55:00' },
    selected: { subject: 'pattern:highs-after-meals', occurrence: 'occ-7',
      finding: { id: 'pattern:highs-after-meals', title: 'Highs after meals' }, window: { start_min: 720, end_min: 1080 } },
    focus: '.occ-foot button:last-child',
  });
  const markup = dayFrame(state({ entry }));
  assert.equal(openedFrom(markup), 'Highs after meals');
  assert.doesNotMatch(markup, ID_TEXT, 'the Day desk printed a routing id');
  assert.match(markup, /data-day="return">Return to Diagnose</);

  const back = dayReturnTarget(entry);
  assert.deepEqual(back, {
    utility: null, destination: 'diagnose', label: 'Diagnose',
    focus: '.occ-foot button:last-child', title: 'Highs after meals',
  });
});

test('a basal-slot entry names the setting and its half-hour range', () => {
  const entry = evidenceDayContext({ occurrence: { t: '2024-06-26 03:00:00' }, slot: { start: 180, end: 210 }, focus: '#crumb-trail' });
  const markup = dayFrame(state({ entry }));
  assert.equal(openedFrom(markup), 'Basal · 03:00–03:30');
  assert.doesNotMatch(markup, ID_TEXT, 'the Day desk printed a routing id');
});

test('an entry whose address carries no title names the way back, never its subject', () => {
  // An address written before titles rode it, or edited by hand.
  const entry = { date: '2024-06-26', subject: 'pattern:served', from: 'diagnose', focus: '#crumb-trail' };
  const markup = dayFrame(state({ entry }));
  assert.equal(openedFrom(markup), 'Diagnose');
  assert.doesNotMatch(markup, ID_TEXT, 'the Day desk printed a routing id');
  const utility = dayFrame(state({ entry: { date: '2024-06-26', subject: 'pattern:served', from: 'changes.questions' } }));
  assert.equal(openedFrom(utility), 'Carb questions');
});

test('each attributed Episode Log row ends with its episode\'s served Lever name', () => {
  // Four Levers the desk once had no word for, each with the name the model
  // read serves, and one unattributed episode whose row names no Lever.
  const served = [
    ['missed_meal', 'Missed / unannounced meal', '07:10', 'high'],
    ['meal_bolus_short', 'Meal bolus fell short', '09:30', 'meal'],
    ['high_carb_sequence', 'High-carb sequence', '12:15', 'meal'],
    ['repeat_eating', 'Repeat eating', '16:40', 'meal'],
  ];
  const anchor = (t, kind, state, verdict) => ({ t, kind, bg: kind === 'meal' ? null : 210, insulin: null, carbs: null, state, verdicts: [verdict] });
  const model = {
    ...MODEL,
    episodes: [
      ...served.map(([lever, title, at, kind], i) => ({
        id: `2024-06-26-ep${i}`, start: `2024-06-26 ${at}:00`, end: `2024-06-26 ${at}:00`,
        lever, lever_title: title, spans_midnight: false,
        anchors: [anchor(`2024-06-26 ${at}:00`, kind, 'fired', { classifier: lever, matched: true, silence_reason: null })],
      })),
      { id: '2024-06-26-ep9', start: '2024-06-26 20:00:00', end: '2024-06-26 20:00:00', lever: null, lever_title: null, spans_midnight: false,
        anchors: [anchor('2024-06-26 20:00:00', 'high', 'near_miss', { classifier: 'missed_meal', matched: false, silence_reason: 'under_threshold' })] },
    ],
  };
  const rows = logRows(dayFrame(state({ ledger: buildEpisodeLedger(model) })));
  assert.equal(rows.length, 5);
  for (const [, title, at] of served) {
    const row = rows.find((r) => r.t === `2024-06-26 ${at}:00`);
    assert.ok(row.text.endsWith(` · ${title}`), `the ${at} row does not end with its served name: ${row.text}`);
  }
  for (const row of rows) assert.doesNotMatch(row.text, /\w_\w/, `a row printed an underscore token: ${row.text}`);
  const quiet = rows.find((r) => r.t === '2024-06-26 20:00:00');
  assert.equal(quiet.text, '△ High · 210 mg/dL', 'an unattributed row named a Lever');
});

// #423: a meal over-delivery day as the model read serves it — a fired meal, a
// clean correction, and a level-2 low that matched correction on active insulin
// on its own while meal over-delivery owns the episode, so its state is
// outranked. Every verdict carries its served Lever title.
const verdict = (classifier, title, matched, reason = null) => ({ classifier, title, matched, silence_reason: reason });
const CLAIMED = {
  ...MODEL,
  episodes: [{
    id: '2024-06-26-ep2', start: '2024-06-26 19:00:00', end: '2024-06-26 23:05:00',
    lever: 'meal_over_delivery', lever_title: 'Meal over-delivery', spans_midnight: false,
    anchors: [
      { t: '2024-06-26 19:00:00', kind: 'meal', bg: null, insulin: 7, carbs: 50, state: 'fired',
        verdicts: [verdict('meal_over_delivery', 'Meal over-delivery', true)] },
      { t: '2024-06-26 20:00:00', kind: 'correction', bg: null, insulin: 3, carbs: null, state: 'clean', verdicts: [] },
      { t: '2024-06-26 22:05:00', kind: 'low', bg: 48, insulin: null, carbs: null, state: 'outranked',
        verdicts: [verdict('over_treated_low', 'Over-treated low', false, 'no_trigger'),
          verdict('correction_on_iob', 'Correction on active insulin', true)] },
    ],
  }],
};
const claimedFrame = (model) => dayFrame(state({ ledger: buildEpisodeLedger(model) }));

test('#423 · a claimed low reads claimed, names what it matched, and ends with the Finding that claimed it', () => {
  const markup = claimedFrame(CLAIMED);
  assert.notEqual(ANCHOR_STATE_WORD.outranked, 'outranked', 'the claimed word is the engine state name');
  assert.match(markup, new RegExp(`<span class="tier" data-state="outranked">${ANCHOR_STATE_WORD.outranked}</span>`));
  assert.doesNotMatch(markup, />outranked</, 'an Episode Log row printed the engine state name');
  const rows = logRows(markup);
  const low = rows.find((r) => r.t === '2024-06-26 22:05:00');
  assert.equal(low.text, '▽ Low · 48 mg/dL · Correction on active insulin · Meal over-delivery');
  assert.ok(low.text.endsWith(' · Meal over-delivery'), 'the claimed row does not end with its episode\'s served name');
  for (const row of rows) assert.doesNotMatch(row.text, /\w_\w/, `a row printed an underscore token: ${row.text}`);
  // The fired row keeps the content #426 gives it.
  assert.equal(rows.find((r) => r.t === '2024-06-26 19:00:00').text, '◍ Meal bolus · Meal over-delivery');
});

test('#423 · a claimed row does not repeat the claiming Finding\'s own name', () => {
  const meal = (t, state) => ({ t, kind: 'meal', bg: null, insulin: 3, carbs: 40, state,
    verdicts: [verdict('carb_undercount', 'Carb undercount', true)] });
  const model = { ...MODEL, episodes: [{
    id: '2024-06-26-ep3', start: '2024-06-26 12:00:00', end: '2024-06-26 15:00:00',
    lever: 'carb_undercount', lever_title: 'Carb undercount', spans_midnight: false,
    anchors: [meal('2024-06-26 12:00:00', 'fired'), meal('2024-06-26 12:40:00', 'outranked')],
  }] };
  const second = logRows(claimedFrame(model)).find((r) => r.t === '2024-06-26 12:40:00');
  assert.equal(second.text, '◍ Meal bolus · Carb undercount');
});

test('#423 · the Findings caption counts Findings, and names claimed anchors apart', () => {
  const findings = (model) => captions(claimedFrame(model)).find((cap) => cap.text.startsWith('Findings'))?.text;
  // One Finding holding a fired and a claimed anchor.
  assert.equal(findings(CLAIMED), 'Findings · 1 · 1 claimed');
  // One Lever across two episodes is one Finding.
  const again = structuredClone(CLAIMED.episodes[0]);
  again.id = '2024-06-26-ep4';
  again.anchors = [{ ...again.anchors[0], t: '2024-06-26 07:30:00' }];
  const twoEpisodes = { ...MODEL, episodes: [again, { ...CLAIMED.episodes[0], anchors: [CLAIMED.episodes[0].anchors[0]] }] };
  assert.equal(findings(twoEpisodes), 'Findings · 1');
  // A high-carb sequence Finding has no fired anchor; its two claimed meals still count one Finding.
  const claimedMeal = (t) => ({ t, kind: 'meal', bg: null, insulin: 4, carbs: 60, state: 'outranked',
    verdicts: [verdict('carb_undercount', 'Carb undercount', true)] });
  const sequence = { ...MODEL, episodes: [{
    id: '2024-06-26-ep5', start: '2024-06-26 12:00:00', end: '2024-06-26 15:00:00',
    lever: 'high_carb_sequence', lever_title: 'High-carb sequence', spans_midnight: false,
    anchors: [claimedMeal('2024-06-26 12:00:00'), claimedMeal('2024-06-26 13:30:00')],
  }] };
  assert.equal(findings(sequence), 'Findings · 1 · 2 claimed');
});

test('#423 · each band caption carries a Glossary control named for its band', () => {
  const nearMiss = { t: '2024-06-26 16:00:00', kind: 'high', bg: 210, insulin: null, carbs: null, state: 'near_miss',
    verdicts: [verdict('missed_meal', 'Missed / unannounced meal', false, 'under_threshold')] };
  const model = { ...CLAIMED, episodes: [...CLAIMED.episodes, {
    id: '2024-06-26-ep6', start: '2024-06-26 15:30:00', end: '2024-06-26 17:00:00',
    lever: null, lever_title: null, spans_midnight: false, anchors: [nearMiss],
  }] };
  const caps = captions(claimedFrame(model));
  assert.deepEqual(caps.map((cap) => cap.text), ['Findings · 1 · 1 claimed', 'Also checked · 1', 'Quiet · 1']);
  const controls = caps.map((cap) => ({
    band: /data-log-glossary="([^"]+)"/.exec(cap.control)?.[1],
    name: /aria-label="([^"]+)"/.exec(cap.control)?.[1],
    button: /^<button type="button"/.test(cap.control),
  }));
  assert.deepEqual(controls, [
    { band: 'findings', name: 'Explain Findings in the Glossary', button: true },
    { band: 'also-checked', name: 'Explain Also checked in the Glossary', button: true },
    { band: 'quiet', name: 'Explain Quiet in the Glossary', button: true },
  ]);
});

test('#423 · a claimed tier word paints in the fired tier\'s colour, not the warning ink', () => {
  const css = readFileSync(new URL('./desk.css', import.meta.url), 'utf8');
  const rule = (state) => new RegExp(`\\.gf \\.gf-log-row \\.tier\\[data-state="${state}"\\] \\{([^}]*)\\}`).exec(css)?.[1];
  assert.ok(rule('outranked'), 'no claimed tier rule');
  assert.doesNotMatch(rule('outranked'), /--mk-warn/);
  assert.equal(rule('outranked'), rule('fired'));
});

test('#423 · the Glossary explains the Episode Log bands', () => {
  const group = glossaryGroups.find((g) => g.title === 'Episode Log');
  assert.ok(group, 'the Glossary has no Episode Log group');
  assert.deepEqual(group.terms.map((t) => t.term), ['Finding', 'Claimed', 'Also checked', 'Quiet']);
  const quiet = group.terms.find((t) => t.term === 'Quiet').def;
  for (const count of ['clean', 'explained', 'no data']) assert.match(quiet, new RegExp(count), `Quiet does not name its ${count} count`);
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

// #425: two month reads shaped as build_day_navigator serves them — the calendar
// month plus seven days either side, one row per day. June 2024 is recorded
// except June 10 and July 1–23 is recorded: 52 days with data in all. Each read
// stamps its own tir, so a cell shows which read supplied it.
const recordedDay = (iso) => (iso >= '2024-06-01' && iso <= '2024-06-30' && iso !== '2024-06-10')
  || (iso >= '2024-07-01' && iso <= '2024-07-23');
function paddedRead(y, m, tir) {
  const rows = [];
  const end = new Date(Date.UTC(y, m, 7));
  for (let d = new Date(Date.UTC(y, m - 1, 1 - 7)); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    rows.push(recordedDay(iso)
      ? { iso, has_data: true, lows: 0, highs: 0, tir, curve: [{ x: 0.5, bg: 120 }] }
      : { iso, has_data: false, lows: 0, highs: 0, tir: 0, curve: [] });
  }
  return rows;
}
const JUNE = paddedRead(2024, 6, 80);
const JULY = paddedRead(2024, 7, 90);
const SPAN = { earliest: '2024-06-01', latest: '2024-07-23', dataDays: 52, readAt: null };
const railCount = (markup) => Number(markup.match(/(\d+) recorded days? · /)[1]);
const monthHead = (markup) => Number(markup.match(/<span class="meta">(\d+) recorded days<\/span><\/div><div class="gf-nav-dow">/)[1]);
const cellTir = (markup, iso) => Number(markup.match(new RegExp(`class="gf-nav-cell" data-pick="${iso}"[^>]*><span class="dom">\\d+</span><span class="sev"><span class="g">[^<]*</span> (\\d+)</span>`))[1]);
const juneThenJuly = new Map([['2024-06', JUNE], ['2024-07', JULY]]);
const julyThenJune = new Map([['2024-07', JULY], ['2024-06', JUNE]]);

test('the rail prints the served recorded-day count, whichever months are loaded', () => {
  const juneLoaded = dayFrame(state({ months: new Map([['2024-06', JUNE]]), bounds: SPAN }));
  const bothLoaded = dayFrame(state({ months: juneThenJuly, bounds: SPAN, month: { y: 2024, m: 7 } }));
  assert.equal(railCount(juneLoaded), 52);
  assert.equal(railCount(bothLoaded), 52);
  // One recorded day keeps the singular.
  assert.match(dayFrame(state({ bounds: { ...SPAN, dataDays: 1 } })), /1 recorded day · Jun 1, 2024 to Jul 23, 2024/);
});

test('with a neighbouring month loaded, each month counts only its own days, once', () => {
  for (const months of [juneThenJuly, julyThenJune]) {
    const july = dayFrame(state({ months, bounds: SPAN, month: { y: 2024, m: 7 } }));
    const june = dayFrame(state({ months, bounds: SPAN, month: { y: 2024, m: 6 } }));
    assert.equal(monthHead(july), 23);
    assert.equal(monthHead(june), 29);
    // A shown month's cells come from its own read, not a neighbour's padding.
    assert.equal(cellTir(july, '2024-07-03'), 90);
    assert.equal(cellTir(june, '2024-06-26'), 80);
  }
});

test('a neighbour\'s padding row stands for a day only while that day\'s own month is unread', () => {
  // The week of Sunday June 30 reaches into July. With only June read, its July
  // days come from June's padding; once July is read, from July's own read.
  const ribbonTir = (markup, iso) => Number(markup.match(new RegExp(`class="gf-nav-col" data-pick="${iso}".*?<span class="sev"><span class="g">[^<]*</span> (\\d+)%</span>`))[1]);
  const juneOnly = dayFrame(state({ iso: '2024-06-30', months: new Map([['2024-06', JUNE]]), bounds: SPAN }));
  assert.equal(ribbonTir(juneOnly, '2024-07-03'), 80);
  for (const months of [juneThenJuly, julyThenJune]) {
    const both = dayFrame(state({ iso: '2024-06-30', months, bounds: SPAN }));
    assert.equal(ribbonTir(both, '2024-07-03'), 90);
    assert.equal(ribbonTir(both, '2024-06-30'), 80);
  }
});

test('a store with no recorded day says so and offers the way back', () => {
  const markup = dayFrame({ iso: null });
  assert.match(markup, /No days recorded/);
  assert.match(markup, /data-destination-action="diagnose"/);
});

test('the topbar\'s Day reopens the day last looked at, with no subject or return, at the plain address (ADR 427)', async () => {
  await onPage(async () => {
    assert.deepEqual(pressed(seat.innerHTML), ['2024-06-29'], 'a fresh page did not open the latest recorded day');

    navigate('day', {
      date: '2024-06-26', from: 'diagnose', subject: 'Selected occurrence · Jun 26 13:55',
      focus: ".gf-member-row[data-occ='occ-7']",
    });
    await arrived();
    assert.deepEqual(pressed(seat.innerHTML), ['2024-06-26']);
    assert.match(seat.innerHTML, /<h3>Opened from<\/h3>/);

    navigate('diagnose');
    navigate('changes');
    navigate('day');
    await arrived();
    assert.deepEqual(pressed(seat.innerHTML), ['2024-06-26'], 'a direct entry moved off the day last looked at');
    assert.ok(!seat.innerHTML.includes('Opened from'), 'a direct entry kept the earlier entry\'s subject');
    assert.ok(!seat.innerHTML.includes('data-day="return"'), 'a direct entry offered a return');
    // Accepted by ADR 427: the plain address does not carry the day shown.
    assert.equal(location.pathname, '/day');
    assert.equal(location.search, '');
  });
});

test('the viewed stamp is the reader\'s local clock, and a read in the same minute shows alone', async () => {
  const zone = process.env.TZ;
  process.env.TZ = 'America/Denver';
  // 22:45 on Jun 29 in Denver, when the UTC date is already Jun 30.
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2024-06-30T04:45:05Z') });
  try {
    await onPage(async () => {
      render();
      assert.equal(kicker(seat.innerHTML), 'Day · read <b>Jun 29, 2024 · 21:30</b> · viewed Jun 29, 2024 · 22:45');

      // The read's own local minute: 21:30:40 in Denver.
      mock.timers.setTime(Date.parse('2024-06-30T03:30:40Z'));
      render();
      assert.equal(kicker(seat.innerHTML), 'Day · read <b>Jun 29, 2024 · 21:30</b>');
      assert.doesNotMatch(seat.innerHTML, /viewed/);
    });
  } finally {
    mock.timers.reset();
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  }
});
