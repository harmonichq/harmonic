// Manufactured, PHI-safe Explore payload in the roles settled by ADR 572 and ADR 577.
// The aggregate deliberately keeps all 288 five-minute local-time bins so the lock
// cannot be proved with a hand-drawn three-point statistic. The mock samples those
// bins only for its compact SVG display.

const MINUTES = 24 * 60;
const SELECTED_START = 11 * 60;
const SELECTED_END = 15 * 60;

const round = (value) => Math.round(value * 10) / 10;

function seeded(i) {
  const value = Math.sin((i + 17) * 12.9898) * 43758.5453;
  return (value - Math.floor(value)) - 0.5;
}

function centreAt(minute) {
  const hour = minute / 60;
  const lunchRise = Math.max(0, 46 - Math.abs(hour - 13.1) * 27);
  const morning = Math.max(0, 19 - Math.abs(hour - 8.3) * 15);
  const evening = Math.max(0, 28 - Math.abs(hour - 20.1) * 16);
  return 112 + lunchRise + morning + evening + seeded(minute) * 7;
}

function spreadAt(minute) {
  const hour = minute / 60;
  return 20 + Math.max(0, 13 - Math.abs(hour - 13) * 7) + Math.abs(seeded(minute + 4)) * 5;
}

function mealCountAt(minute) {
  const lunchBins = [11 * 12 + 1, 11 * 12 + 8, 12 * 12 + 3, 12 * 12 + 10,
    13 * 12 + 2, 13 * 12 + 9, 14 * 12 + 4, 14 * 12 + 11];
  const index = Math.round(minute / 5);
  return lunchBins.includes(index) ? (index % 3 === 0 ? 2 : 1) : 0;
}

export const timeOfDay = {
  window: {
    start: '2026-07-09 00:00:00',
    end: '2026-08-08 00:00:00',
    data_days: 30,
  },
  bin_minutes: 5,
  target_range: { low: 70, high: 180 },
  bins: Array.from({ length: 288 }, (_, index) => {
    const minute = index * 5;
    const median = centreAt(minute);
    const spread = spreadAt(minute);
    return {
      minute,
      n: 24,
      p10: round(Math.max(40, median - spread * 1.35 + seeded(index + 2) * 4)),
      p25: round(Math.max(40, median - spread * 0.72 + seeded(index + 7) * 3)),
      median: round(median),
      p75: round(median + spread * 0.72 + seeded(index + 11) * 3),
      p90: round(median + spread * 1.35 + seeded(index + 13) * 4),
      meal_count: mealCountAt(minute),
    };
  }),
};

const selectedWindow = {
  start_minute: SELECTED_START,
  end_minute: SELECTED_END,
  label: '11:00 AM–3:00 PM',
  qualifying_days: 10,
  meal_count: 10,
};

export const contributorScenes = {
  normal: [
    {
      id: 'ic-lunch',
      rank: 1,
      title: 'Carb ratio after lunch',
      kind: 'Setting',
      shape: 'circle',
      status: 'qualified in Audit',
      selected: true,
      summary: '7 of 10 qualifying lunches needed additional insulin after lunch.',
      auditItemId: 'ic-lunch-qualified',
      visualWindow: selectedWindow,
    },
    {
      id: 'late-bolus',
      rank: 2,
      title: 'Late pre-bolus',
      kind: 'Behavior',
      shape: 'square',
      status: 'Explore hypothesis',
      summary: 'Later boluses were followed by a larger rise in this window.',
      evidence: {
        behaviors: [{ text: '5 of 8 dinners had a late pre-bolus.' }],
        boluses: [{ text: 'Bolus arrived 8 minutes after the meal began.' }],
      },
      visualWindow: { start_minute: 18 * 60 + 10, end_minute: 21 * 60 + 10,
        label: '6:10 PM–9:10 PM', meal_count: 0 },
    },
    {
      id: 'basal-afternoon',
      rank: 3,
      title: 'Basal 12:00–2:00 PM',
      kind: 'Setting',
      shape: 'circle',
      status: 'Explore hypothesis',
      summary: 'Delivered basal ran above programmed delivery on several afternoons.',
      visualWindow: { start_minute: 12 * 60, end_minute: 12 * 60 + 30,
        label: '12:00 PM–12:30 PM', meal_count: 0 },
      basalEvidence: { current: 0.8, estimate: 0.88, lo: 0.83, hi: 0.93,
        points: [0.86, 0.9, 0.84, 0.89, 0.87] },
    },
  ],
  dense: [
    {
      id: 'ic-lunch', rank: 1, title: 'Carb ratio after lunch', kind: 'Setting', shape: 'circle',
      status: 'qualified in Audit', selected: true,
      summary: '7 of 10 qualifying lunches needed additional insulin after lunch.',
      auditItemId: 'ic-lunch-qualified',
      visualWindow: { ...selectedWindow, start_minute: 10.5 * 60, end_minute: 15.5 * 60,
        label: '10:30 AM–3:30 PM' },
    },
    {
      id: 'late-bolus', rank: 2, title: 'Late pre-bolus', kind: 'Behavior', shape: 'square',
      status: 'Explore hypothesis', summary: 'Later boluses were followed by a larger rise in this window.',
      evidence: {
        behaviors: [{ text: '5 of 8 dinners had a late pre-bolus.' }],
        boluses: [{ text: 'Bolus arrived 8 minutes after the meal began.' }],
      },
      visualWindow: { start_minute: 18 * 60 + 10, end_minute: 21 * 60 + 10,
        label: '6:10 PM–9:10 PM', meal_count: 0 },
    },
    {
      id: 'basal-afternoon', rank: 3, title: 'Basal 12:00–2:00 PM', kind: 'Setting', shape: 'circle',
      status: 'Explore hypothesis', summary: 'Delivered basal ran above programmed delivery on several afternoons.',
      visualWindow: { start_minute: 12 * 60, end_minute: 12 * 60 + 30,
        label: '12:00 PM–12:30 PM', meal_count: 0 },
      basalEvidence: { current: 0.8, estimate: 0.88, lo: 0.83, hi: 0.93,
        points: [0.86, 0.9, 0.84, 0.89, 0.87] },
    },
    {
      id: 'meal-size', rank: 4, title: 'Meal size and composition', kind: 'Context', shape: 'triangle',
      status: 'Explore only', summary: 'The available meal record varies across the selected days.',
      visualWindow: { start_minute: 10.5 * 60, end_minute: 15.5 * 60,
        label: '10:30 AM–3:30 PM', meal_count: 10 },
    },
  ],
};

export const scenes = {
  normal: {
    window: selectedWindow,
    contributors: contributorScenes.normal,
    evidence: {
      title: 'Carb ratio after lunch',
      eyebrow: 'Possible contributor · Setting',
      summary: 'The selected window shows a repeated post-lunch rise. Explore is showing evidence to inspect, not a setting to change.',
      observed: [
        ['Qualifying lunches', '10'],
        ['Rise after lunch', '+38 mg/dL median'],
        ['Corrections within 4 hours', '6 of 10'],
      ],
      note: 'The aggregate is a 30-day time-of-day read. It does not create a new cohort when you select the window.',
      occurrences: [
        ['Jul 28 · correction at +2h', 'Day · 07/28'],
        ['Jul 25 · rise above range', 'Day · 07/25'],
        ['Jul 19 · correction at +90m', 'Day · 07/19'],
      ],
      limits: [
        'Only 10 qualifying lunches are in this window.',
        'High-fat meals can extend a rise beyond the selected hours.',
        'Activity, stress, and illness can affect the same pattern.',
      ],
      pins: ['Pre-bolus timing vs. post-meal rise'],
    },
  },
  dense: {
    window: { ...selectedWindow, start_minute: 10.5 * 60, end_minute: 15.5 * 60,
      label: '10:30 AM–3:30 PM' },
    contributors: contributorScenes.dense,
    evidence: {
      title: 'Carb ratio after lunch',
      eyebrow: 'Possible contributor · Setting',
      summary: 'A larger selected window keeps the same 30-day evidence read in view while exposing more of the observed context.',
      observed: [
        ['Qualifying lunches', '10'],
        ['Median rise', '+38 mg/dL'],
        ['Post-meal corrections', '6 of 10'],
        ['Days with meal context', '8 of 10'],
      ],
      note: 'Filters change what is visible in the investigation; they do not change the server-owned Audit qualification.',
      occurrences: [
        ['Jul 28 · correction at +2h', 'Day · 07/28'],
        ['Jul 25 · rise above range', 'Day · 07/25'],
        ['Jul 19 · correction at +90m', 'Day · 07/19'],
        ['Jul 14 · meal context incomplete', 'Day · 07/14'],
      ],
      limits: [
        'The wider view includes more context but is not a new statistical cohort.',
        'Meal composition is not complete for every occurrence.',
        'Explore observations remain advisory and read-only.',
      ],
      pins: ['Pre-bolus timing vs. post-meal rise', 'Meal context · 07/14'],
    },
  },
};

export function sceneFor(mode) {
  return scenes[mode] || scenes.normal;
}

export function sampledBins(count = 48) {
  const step = (timeOfDay.bins.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, index) => timeOfDay.bins[Math.round(index * step)]);
}
