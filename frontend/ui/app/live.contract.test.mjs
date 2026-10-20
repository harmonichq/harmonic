// The live adapter's contract (#475): the engine's real answers, read from a
// synthetic no-fetch serve through the app's one client and the live adapter,
// produce the screen models each of the five tabs draws. No browser: the
// adapter and the models are plain modules, so Node drives them directly.
//
// Run it against a serve that scripts/smoke_app.py boots and warms:
//
//   uv run python scripts/smoke_app.py --then node --test frontend/ui/app/live.contract.test.mjs
//   uv run python scripts/smoke_app.py --case isf-strengthen --then node --test frontend/ui/app/live.contract.test.mjs
//   uv run python scripts/smoke_app.py --case c3-trial --then node --test frontend/ui/app/live.contract.test.mjs
//   uv run python scripts/smoke_app.py --case c3-ic-trial --then node --test frontend/ui/app/live.contract.test.mjs
//   uv run python scripts/smoke_app.py --case pattern-correction-fold --then node --test frontend/ui/app/live.contract.test.mjs
//   uv run python scripts/smoke_app.py --case basal-and-carb-ratio-lower --then node --test frontend/ui/app/live.contract.test.mjs
//   uv run python scripts/smoke_app.py --case pattern-correction-collapse --then node --test frontend/ui/app/live.contract.test.mjs
//   uv run python scripts/smoke_app.py --case behavioral-missed-meal --then node --test frontend/ui/app/live.contract.test.mjs
//   uv run python scripts/smoke_app.py --case pattern-meal-two-causes --then node --test frontend/ui/app/live.contract.test.mjs
//
// smoke_app names the serve in HARMONIC_URL and the store in HARMONIC_CASE.
// Every expected value is a literal read once from that store's served answers,
// never derived from the adapter's output at assertion time. It fails closed:
// without a serve it fails, and a store with no expectations here fails.
//
// The fast gate's glob (`frontend/**/*.test.js`) does not match this file,
// because it needs a server.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { registerHooks } from 'node:module';

// The models are TypeScript imported without extensions, as Vite resolves
// them; Node strips their types, and this resolves `./x` to `./x.ts`.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.')) return next(`${specifier}.ts`, context);
      throw error;
    }
  },
});

const BASE = process.env.HARMONIC_URL;
const CASE = process.env.HARMONIC_CASE ?? 'showcase';

/** The client's transport, over a fresh connection per request (no keep-alive
 *  socket to race the server's idle close, #507). */
function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request(`${BASE}${url}`, { method: opts.method ?? 'GET', headers: opts.headers, agent: false },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          statusText: response.statusMessage,
          json: async () => JSON.parse(body),
        }));
      });
    request.on('error', reject);
    if (opts.body) request.write(opts.body);
    request.end();
  });
}

/** A model's output with every Sourced value replaced by the value it carries. */
const values = (model) => JSON.parse(JSON.stringify(model ?? null,
  (_, v) => (v && typeof v === 'object' && 'source' in v && 'value' in v ? v.value : v)));
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} ≠ ${expected}`);

const EXPECTED = {
  showcase: {
    queue: ['setting:basal_rate', 'pattern:highs_after_treating_lows'],
    basal: { start: 180, end: 240, current: 0.6, suggested: 0.48, trial: false },
    pattern: { key: 'highs_after_treating_lows', title: 'Highs after treating lows',
      magnitude: { count: 1, denominator: 5, noun: 'lows' },
      // One low rebounds, from its nadir, against the other lows (ADR 523). One
      // episode serves no bin of three readings, so the card draws no impact line.
      traces: { anchor: 'nadir', window: [0, 180], episodes: 1, patternBins: 0, typicalBins: 37, typical: 4 },
      caseFile: { summary: { claimed: 1, denominator: 5, noun: 'lows' }, outcome: 'peak', impact: null } },
    isf: null,
    change: { kind: 'none' },
    done: { subject: 'setting:basal_rate', waiting: { subject: 'setting:basal_rate', title: 'Basal',
      block: { start: 180, end: 240 }, moves: [{ name: null, slot: null, before: 0.6, after: 0.48, units: 'U/h' }] } },
    // One previous change: the whole-day carb ratio move, with no saved result.
    previous: [{ title: 'I:C', block: null, moves: [[null, 12, 10, 'g/U']], result: null }],
    overview: { tir: 98.6, previous: 100, isf: { current: 40, recommended: null, uncertain: true, nights: 14 },
      // The 48 half-hour slots, and the moves the basal analyzer stages (ADR 523).
      basal: { slots: 48, estimated: 48, moves: [[180, 'lower'], [210, 'lower']] },
      // Meal size at the window shown (ADR 501, #565): each size's bounds, its
      // meal count, its whisker's 10th and 90th percentiles (#570, to a tenth),
      // and its median Climb, Peak at and At 3 h as printed, At 3 h over its own
      // count. The showcase's meals are all 40 g or more.
      mealSize: {
        14: { hours: 3, rows: [
          [null, 25, 0, null, null, null, null, null, 0],
          [25, 40, 0, null, null, null, null, null, 0],
          [40, 60, 15, 1.7, 13.9, 8, 5, 6, 15],
          [60, null, 1, 153, 153, 153, 120, 96, 1],
        ] },
        90: { hours: 3, rows: [
          [null, 25, 0, null, null, null, null, null, 0],
          [25, 40, 0, null, null, null, null, null, 0],
          [40, 60, 31, 0.4, 11.8, 7, 5, 6, 31],
          [60, null, 1, 153, 153, 153, 120, 96, 1],
        ] },
      } },
    day: { latest: '2024-06-30', insulin: 19.56, firstLowBg: 48 },
    // Five lows and no rise: Day's Lows row alone.
    prompts: { lows: 5, rises: [] },
    // The 22:00 low resolves after midnight: it is the 29th's finding.
    findings: {
      '2024-06-25': [['2024-06-25 12:00:00', 'meal', ['Carb undercount']]],
      '2024-06-26': [['2024-06-26 13:55:00', 'pattern', ['Over-treated low']]],
      '2024-06-29': [['2024-06-29 22:00:00', 'pattern', ['Correction on active insulin']]],
      '2024-06-30': [],
    },
    settings: { days: 35, segments: [{ start: 0, basal: 0.6, isf: 40, carbRatio: 10 }] },
  },
  // Five kinds of finding over its days: the stacking dose and the low it
  // reached, evening lows that resolve after midnight, a treated low, and an
  // unannounced rise.
  'pattern-correction-fold': {
    queue: ['pattern:lows_after_correcting_highs', 'pattern:highs_after_treating_lows'],
    // Each counted low drawn from the correction it followed, against every other
    // lone correction (ADR 523).
    pattern: { key: 'lows_after_correcting_highs', title: 'Lows after correcting highs',
      magnitude: { count: 4, denominator: 7, noun: 'lows' },
      traces: { anchor: 'correction', window: [0, 240], episodes: 4, patternBins: 49, typicalBins: 0, typical: 1 },
      caseFile: { summary: { claimed: 4, denominator: 7, noun: 'lows' }, outcome: 'nadir', impact: null } },
    isf: null,
    change: { kind: 'none' },
    done: null,
    findings: {
      '2024-05-14': [['2024-05-14 22:00:00', 'pattern', ['Correction on active insulin']]],
      '2024-05-16': [['2024-05-16 13:55:00', 'pattern', ['Over-treated low']]],
      '2024-05-24': [['2024-05-24 14:40:00', 'correction', ['Correction stacking']],
        ['2024-05-24 16:05:00', 'pattern', ['Correction stacking']]],
      '2024-05-27': [['2024-05-27 17:00:00', 'pattern', ['Missed / unannounced meal']]],
    },
    // #529: the unannounced rise is Day's one Rise, asked at its 15:55 onset
    // and drawn at its served 385 mg/dL peak at 17:00, beside two lows.
    prompts: { lows: 2, rises: [{ anchorT: '2024-05-27 15:55:00', at: '2024-05-27 17:00:00', bg: 385 }] },
  },
  'isf-strengthen': {
    queue: ['setting:isf'],
    isf: { current: 40, recommended: 32, uncertain: false, nights: 29 },
    change: { kind: 'none' },
    done: { subject: 'setting:isf', waiting: { subject: 'setting:isf', title: 'ISF', block: null,
      moves: [{ name: null, slot: null, before: 40, after: 32, units: 'mg/dL/U' }] } },
  },
  // A queued carb ratio: its card draws the block, current → suggested and range.
  // Its move strengthens the ratio, so it answers highs after meals and never
  // lows after meals (ADR 530).
  'basal-and-carb-ratio-lower': {
    queue: ['setting:basal_rate', 'pattern:highs_after_meals', 'setting:carb_ratio'],
    ic: { title: 'I:C', units: 'g/U', start: 0, end: 1440, current: 10, suggested: 9, estimate: 8, lo: 8, hi: 8,
      // The meal runs the estimate counts: the stat row's count and the chart's dots (ADR 523).
      count: { label: 'Meal runs', value: 8 }, dots: 8 },
    isf: null,
    change: { kind: 'none' },
    // Done on the I:C card waits for the pump like any Setting (#518).
    done: { subject: 'setting:carb_ratio', waiting: { subject: 'setting:carb_ratio', title: 'I:C', block: { start: 0, end: 1440 },
      moves: [{ name: null, slot: null, before: 10, after: 9, units: 'g/U' }] } },
  },
  // Lows after correcting highs, served as its one admitted habit, counts the low
  // a stacked pair of corrections reached as well as that habit's own two.
  'pattern-correction-collapse': {
    queue: ['pattern:lows_after_correcting_highs', 'pattern:highs_after_treating_lows'],
    pattern: { key: 'lows_after_correcting_highs', title: 'Lows after correcting highs',
      magnitude: { count: 3, denominator: 6, noun: 'lows' },
      traces: { anchor: 'correction', window: [0, 240], episodes: 3, patternBins: 49, typicalBins: 0, typical: 1 },
      caseFile: { summary: { claimed: 3, denominator: 6, noun: 'lows' }, outcome: 'nadir', impact: null } },
    // Its causes, largest harm first (ADR 593): the habit's two lows before the
    // stacked pair's one, which no member of the Pattern answers, so it cannot be
    // focused. Each is drawn from the doses its own lows followed.
    causes: { row: 'finding:correction_on_iob', key: 'lows_after_correcting_highs',
      counts: [['habit:correction_on_iob', 'Correction on active insulin', 2, true],
        ['habit:correction_stacking', 'Correction stacking', 1, false]],
      traces: [['habit:correction_on_iob', 2], ['habit:correction_stacking', 1]] },
    // Served as its habit, it is multi-cause like any Pattern (ADR 594): its
    // drill-down offers no Focus on Correction stacking.
    drillDown: { key: 'lows_after_correcting_highs', focusable: true,
      causes: [['habit:correction_on_iob', 'Correction on active insulin', 2, 3, 'lows', true, 2],
        ['habit:correction_stacking', 'Correction stacking', 1, 3, 'lows', false, 1]] },
    isf: null,
    change: { kind: 'none' },
    done: null,
  },
  // Highs after meals keeps its row with two causes (ADR 593): Carb undercount,
  // first in the roster, claims four milder rises; Late bolus three longer highs,
  // so it leads. Both can be focused, and each is drawn from its own meals.
  'pattern-meal-two-causes': {
    queue: ['pattern:highs_after_meals'],
    pattern: { key: 'highs_after_meals', title: 'Highs after meals',
      magnitude: { count: 7, denominator: 21, noun: 'meals' },
      traces: { anchor: 'bolus', window: [-30, 240], episodes: 7, patternBins: 55, typicalBins: 55, typical: 14 },
      caseFile: { summary: { claimed: 7, denominator: 21, noun: 'meals' }, outcome: 'peak',
        impact: { kind: 'peak', own: 360, typical: 120 } } },
    causes: { row: 'pattern:highs_after_meals', key: 'highs_after_meals',
      counts: [['habit:late_bolus', 'Late bolus', 3, true], ['habit:carb_undercount', 'Carb undercount', 4, true]],
      traces: [['habit:late_bolus', 3], ['habit:carb_undercount', 4]] },
    // Its card is multi-cause, so it offers no Focus; its drill-down draws each
    // cause's count over the Pattern's 7 meals and its own trace (ADR 594). A
    // Focus on Late bolus, served first though Carb undercount is the Pattern's
    // first member, watches Late bolus.
    drillDown: { key: 'highs_after_meals', focusable: true,
      causes: [['habit:late_bolus', 'Late bolus', 3, 7, 'meals', true, 3],
        ['habit:carb_undercount', 'Carb undercount', 4, 7, 'meals', true, 4]],
      pin: { lever: 'late_bolus', focusedCause: 'Late bolus',
        focus: { kind: 'focus', habit: 'Late bolus', pattern: 'Highs after meals', maturing: true } } },
    isf: null,
    change: { kind: 'none' },
    done: null,
  },
  // A standalone habit (ADR 528): the missed meal no Pattern owns is its own
  // card. Its count is its case file's, the rises it claims of its own highs; its
  // chart each rise from its onset, against the meals bolused for (two, too few
  // for a band); and Focus starts one on the habit itself, with no Pattern.
  'behavioral-missed-meal': {
    queue: ['habit:missed_meal'],
    habit: { subject: 'habit:missed_meal', title: 'Missed / unannounced meal',
      magnitude: { count: 2, denominator: 6, noun: 'highs' },
      traces: { anchor: 'meal_start', window: [-60, 300], episodes: 2, patternBins: 0, typicalBins: 0, typical: 2 } },
    isf: null,
    change: { kind: 'none' },
    done: null,
    pin: { subject: 'habit:missed_meal',
      focus: { kind: 'focus', habit: 'Missed / unannounced meal', pattern: null, maturing: true } },
  },
  'c3-trial': {
    queue: ['setting:basal_rate'],
    basal: { start: 60, end: 90, current: 0.6, suggested: 0.48, trial: false },
    isf: null,
    change: { kind: 'trial', title: 'Basal', maturing: false, result: 'unclear', canEnd: true },
    // A Done while the Trial is watched: it waits on its own (#518).
    done: { subject: 'setting:basal_rate', waiting: { subject: 'setting:basal_rate', title: 'Basal',
      block: { start: 60, end: 90 }, moves: [{ name: null, slot: null, before: 0.6, after: 0.48, units: 'U/h' }] } },
    // #524: its block, what moved, the trace by clock time across the block (its
    // nights before and after), every module, and Control-IQ's delivered rate.
    trial: { block: [180, 210], moves: [['03:00', 0.6, 0.54, 'U/h']], meals: null,
      // A night is never left off, so neither arm prints "of" (#575).
      trace: { alignment: 'clock', episodes: [13, 15], of: [null, null] },
      modules: { ranges: ['tir', 'tbr', 'tar'], glucose: ['mean', 'gmi', 'cv'], basal: ['delivered', 'above', 'below'] },
      delivered: [0.48, 0.48], readings: [78, 90],
      // Every row but CV prints unchanged, so only CV, lower, is coloured: green.
      tones: { tir: null, tbr: null, tar: null, mean: null, gmi: null, cv: 'favorable',
        delivered: null, above: null, below: null } },
    previous: [],
  },
  // #554: a carb ratio Trial six days in, retained by a release before #503 and #553.
  // Maturing, it shows its data as it forms: each arm's meals, the trace at
  // each meal bolus, every glucose module over the readings read so far, and
  // no result.
  'c3-ic-trial': {
    queue: [],
    isf: null,
    change: { kind: 'trial', title: 'I:C', maturing: true, result: null, canEnd: false },
    done: null,
    trial: { block: [660, 840], moves: [['11:00', 5, 4.4, 'g/U']], meals: { before: 24, after: 6 },
      // Every meal has a reading before its bolus, so the trace draws each of
      // the card's meals and neither arm prints "of" (#575).
      trace: { alignment: 'meal', episodes: [24, 6], of: [null, null] },
      modules: { ranges: ['tir', 'tbr', 'tar'], glucose: ['mean', 'gmi', 'cv'], basal: [] },
      delivered: null, readings: [1440, 360],
      // Its arms print the same on every row: no arrow, neutral.
      tones: { tir: null, tbr: null, tar: null, mean: null, gmi: null, cv: null } },
    previous: [],
  },
};

test(`the live adapter serves each tab's model from the ${CASE} store`, async (t) => {
  assert.ok(BASE, 'HARMONIC_URL is unset: run this under scripts/smoke_app.py --then');
  const expected = EXPECTED[CASE];
  assert.ok(expected, `no expectations for the ${CASE} store`);

  const { makeDeps } = await import('../../data.js');
  const { createLive } = await import('./live.js');
  const { serve } = await import('../answers.ts');
  const queue = await import('../queue-model.ts');
  const changes = await import('../changes-model.ts');
  const overview = await import('../overview-model.ts');
  const day = await import('../day-model.ts');
  const settings = await import('../settings-model.ts');

  const client = makeDeps({ fetch });
  const live = createLive({ client, glossary: [] });
  serve(live.answers);

  await t.test('Queue', async () => {
    await live.readTab('queue');
    const ranking = values(queue.ranking('wearer'));
    assert.deepEqual(ranking.map((item) => item.subject), expected.queue);
    if (expected.basal) {
      const basal = ranking.find((item) => item.subject === 'setting:basal_rate').data;
      for (const [key, value] of Object.entries(expected.basal)) assert.equal(basal[key], value, `basal ${key}`);
    }
    if (expected.ic) {
      const ic = ranking.find((item) => item.subject === 'setting:carb_ratio').data;
      const { dots, ...fields } = expected.ic;
      for (const [key, value] of Object.entries(fields)) assert.deepEqual(ic[key], value, `I:C ${key}`);
      assert.equal(ic.dots.length, dots, 'one dot per counted meal run');
    }
    if (expected.pattern) {
      const { key, title, magnitude, traces, caseFile } = expected.pattern;
      const pattern = values(queue.pattern('wearer', key));
      assert.equal(pattern.title, title);
      assert.deepEqual(pattern.magnitude, magnitude);
      // The trace chart the card draws, as served: its start, its minutes, the
      // Pattern's episodes (or null past eight) and each cohort's bins.
      assert.deepEqual({
        anchor: pattern.traces.anchor, window: pattern.traces.window,
        episodes: pattern.traces.episodes?.length ?? null,
        patternBins: pattern.traces.pattern.length, typicalBins: pattern.traces.typical.length,
      }, (({ typical, ...drawn }) => drawn)(traces));
      if (caseFile) {
        // The case file the card reads its impact line from: the Queue's own
        // subject, the same population as the card's count, and each event's
        // own peak or nadir.
        assert.deepEqual(pattern.impact, caseFile.impact);
        const { projection_id } = await client.fetchDiagnoseFindingCasePreparation();
        const served = await client.fetchDiagnoseFindingCase({ projection_id, finding_id: `pattern:${key}`, alignment: 'event' });
        assert.deepEqual(served.summary, caseFile.summary);
        assert.equal(served.traces.typical.anchors.length, traces.typical, 'Typical episodes drawn');
        assert.equal(served.summary.claimed, pattern.magnitude.count, 'one population backs the count and the case file');
        assert.ok(served.occurrences.length > 0);
        for (const occurrence of served.occurrences) assert.equal(occurrence.outcome?.kind, caseFile.outcome, occurrence.anchor.t);
      }
    }
    if (expected.causes) {
      // A Pattern's causes as the live adapter carries them (ADR 593): the served
      // shares in the engine's order, each with whether it can be focused, and
      // each cause's own trace in the same order.
      const { row: id, key, counts, traces } = expected.causes;
      const carried = live.answers.queue.wearer;
      const row = carried.findings.rows.find((r) => r.id === id);
      const shares = row.kind === 'pattern' ? row.cause_counts : row.served_as.cause_counts;
      assert.deepEqual(shares.map((c) => [c.subject, c.title, c.count, c.pinnable]), counts);
      assert.deepEqual(carried.cases[key].traces.causes.map((c) => [c.subject, c.pattern.episodes?.length ?? null]),
        traces);
    }
    if (expected.drillDown) {
      // A multi-cause Pattern (ADR 594): its card offers no Focus, and its
      // drill-down's causes are the served ones, in the served order, each count
      // over the Pattern's own and each trace the cause's own.
      const { key, focusable, causes } = expected.drillDown;
      const card = values(queue.pattern('wearer', key));
      assert.deepEqual([card.multiCause, card.focusedCause, card.pinned], [true, null, false]);
      assert.equal(queue.focusable('wearer'), focusable, 'the served admission');
      assert.deepEqual(values(queue.causes('wearer', key)).map((c) => [c.subject, c.title, c.magnitude.count,
        c.magnitude.denominator, c.magnitude.noun, c.pinnable, c.traces?.episodes?.length ?? null]), causes);
    }
    if (expected.habit) {
      // The habit's card, as served: its count, its chart, unpinned; and its row
      // and card read one population, the case file's own.
      const { subject, title, magnitude, traces } = expected.habit;
      const item = ranking.find((i) => i.subject === subject);
      assert.equal(item.kind, 'habit');
      const habit = item.data;
      assert.deepEqual([habit.kind, habit.title, habit.uncertain, habit.impact, habit.pinned],
        ['habit', title, false, null, false]);
      assert.deepEqual(habit.magnitude, magnitude);
      assert.deepEqual({
        anchor: habit.traces.anchor, window: habit.traces.window, episodes: habit.traces.episodes?.length ?? null,
        patternBins: habit.traces.pattern.length, typicalBins: habit.traces.typical.length,
      }, (({ typical, ...drawn }) => drawn)(traces));
      const { projection_id } = await client.fetchDiagnoseFindingCasePreparation();
      const served = await client.fetchDiagnoseFindingCase({ projection_id, finding_id: subject.replace('habit:', 'finding:'),
        alignment: 'event' });
      assert.equal(served.summary.claimed, served.traces.pattern.anchors.length, 'each claimed episode is drawn');
      assert.equal(served.traces.typical.anchors.length, traces.typical, 'Typical episodes drawn');
    }
    const isf = values(queue.isfSetting('wearer'));
    if (expected.isf === null) assert.equal(isf, null);
    else for (const [key, value] of Object.entries(expected.isf)) assert.equal(isf[key], value, `ISF ${key}`);
  });

  await t.test('Changes', async () => {
    await live.readTab('changes');
    const active = values(changes.change('wearer'));
    for (const [key, value] of Object.entries(expected.change)) assert.equal(active[key], value, `change ${key}`);
    const trial = expected.trial;
    if (trial) {
      assert.deepEqual(active.block && [active.block.start, active.block.end], trial.block);
      assert.deepEqual(active.moves.map((m) => [m.slot, m.before, m.after, m.units]), trial.moves);
      assert.deepEqual(active.meals, trial.meals);
      assert.equal(active.trace.alignment, trial.trace.alignment);
      assert.deepEqual([active.trace.before.episodes, active.trace.after.episodes], trial.trace.episodes);
      // The legend's meals are the card's (#575): "of" only where the engine left one off.
      assert.deepEqual([active.trace.before.of, active.trace.after.of], trial.trace.of);
      for (const [module, keys] of Object.entries(trial.modules)) {
        assert.deepEqual(active[module].map((row) => row.key), keys, module);
      }
      if (trial.delivered) {
        const delivered = active.basal.find((row) => row.key === 'delivered');
        assert.deepEqual([delivered.before, delivered.after], trial.delivered);
      }
      // Each glucose module's readings, before and after (#554).
      assert.deepEqual([active.readings.before, active.readings.after], trial.readings);
      // Each Δ green or red by the way it moved, maturing or matured; neutral
      // where neither way is better (§2.5, 2026-10-19). The verdict is the result's.
      assert.deepEqual(Object.fromEntries([...active.ranges, ...active.glucose, ...active.basal]
        .map((row) => [row.key, row.delta?.tone ?? null])), trial.tones, 'Δ colours');
    }
    if (expected.previous) {
      const previous = values(changes.previousChanges('wearer'));
      assert.equal(values(changes.previousCount('wearer')), expected.previous.length, 'Previous · N');
      assert.deepEqual(previous.map((row) => ({ title: row.title, block: row.block,
        moves: row.moves.map((m) => [m.slot, m.before, m.after, m.units]), result: row.result })), expected.previous);
    }
  });

  // Done (#518) on the store's queued Setting, then Undo: the card leaves the
  // Queue for Changes' Waiting for pump, and comes back. The serve's store is a
  // scratch copy, and Undo leaves only a withdrawn Plan behind.
  // A store that queues no Setting declares `done: null`, and says so.
  await t.test('Done and Undo', async () => {
    assert.ok(expected.done !== undefined, `no Done expectation for the ${CASE} store`);
    const queued = () => values(queue.ranking('wearer')).map((item) => item.subject);
    if (expected.done === null) {
      assert.deepEqual(queued().filter((s) => s.startsWith('setting:')), [], 'no Setting card is queued');
      return;
    }
    const { subject, waiting } = expected.done;
    await live.queueWrites.done(subject);
    assert.ok(!queued().includes(subject), 'Done takes the card out of the Queue');
    assert.deepEqual(values(changes.waiting('wearer')), [waiting]);
    await live.queueWrites.undoDone(subject);
    assert.deepEqual(queued(), expected.queue, 'Undo puts it back');
    assert.deepEqual(values(changes.waiting('wearer')), []);
  });

  if (expected.pin) {
    // Focus on a standalone habit's card (ADR 528): a Focus on the habit itself,
    // under its own key, which the card shows pinned and Changes follows as a
    // Focus with no Pattern; End resolves it, and the card is unpinned again.
    await t.test('Focus a habit, then End it', async () => {
      const { subject, focus } = expected.pin;
      const card = () => values(queue.ranking('wearer')).find((i) => i.subject === subject).data;
      await live.queueWrites.pin(subject);
      assert.equal(card().pinned, true, 'the card shows the Focus pill');
      const active = values(changes.change('wearer'));
      for (const [key, value] of Object.entries(focus)) assert.deepEqual(active[key], value, `focus ${key}`);
      await live.changesWrites.end();
      assert.equal(values(changes.change('wearer')).kind, 'none');
      assert.equal(card().pinned, false, 'the card offers Focus again');
    });
  }

  if (expected.drillDown?.pin) {
    // A cause's Focus (ADR 594): it watches the cause it was started on, which the
    // Queue card names and Changes follows; then no card offers Focus, and End
    // brings the buttons back.
    await t.test('Focus a cause, then End it', async () => {
      const { key, pin } = expected.drillDown;
      const subject = `pattern:${key}`;
      await live.queueWrites.pin(subject, pin.lever);
      const card = values(queue.pattern('wearer', key));
      assert.deepEqual([card.pinned, card.focusedCause], [true, pin.focusedCause]);
      assert.deepEqual(values(queue.causes('wearer', key)).filter((c) => c.pinned).map((c) => c.lever), [pin.lever]);
      assert.equal(queue.focusable('wearer'), false, 'no other Focus while one is watched');
      const active = values(changes.change('wearer'));
      for (const [field, value] of Object.entries(pin.focus)) assert.deepEqual(active[field], value, `focus ${field}`);
      await live.changesWrites.end();
      assert.equal(values(changes.change('wearer')).kind, 'none');
      await live.readTab('queue');
      assert.deepEqual([values(queue.pattern('wearer', key)).focusedCause, queue.focusable('wearer')], [null, true],
        'End brings the buttons back');
    });
  }

  if (expected.findings) {
    // Every finding the engine served on a day reaches its Day model: a bolus it
    // counted carries its habits, and any other moment is its own Pattern row.
    await t.test('Day findings', async () => {
      await live.readTab('day');
      for (const [iso, rows] of Object.entries(expected.findings)) {
        await live.readDay(iso);
        const counted = values(day.dayChartOf(iso)).events.filter((e) => e.habits?.length);
        assert.deepEqual(counted.map((e) => [e.time, e.kind, e.habits]), rows, iso);
      }
    });
  }

  if (expected.prompts) {
    // Day's Lows and Rises (#529): each kind's count and card from the served
    // Prompts, a rise drawn at its served peak; each rise answered No through
    // the adapter leaves the Rises, and the lows stay.
    await t.test('Day Prompts', async () => {
      await live.readTab('day');
      const counts = () => [values(day.unanswered('wearer', 'low')), values(day.unanswered('wearer', 'rise'))];
      assert.deepEqual(counts(), [expected.prompts.lows, expected.prompts.rises.length]);
      assert.equal(values(day.unanswered('wearer')), expected.prompts.lows + expected.prompts.rises.length, 'the Day badge');
      const rises = values(day.promptsOfKind('rise'));
      assert.deepEqual(rises.map((r) => ({ anchorT: r.anchorT, at: r.time, bg: r.bg })), expected.prompts.rises);
      for (const rise of rises) {
        assert.equal(rise.cgm.find((reading) => reading.minute === rise.key)?.bg, rise.bg, 'the peak is among its readings');
      }
      for (const rise of day.promptsOfKind('rise')) await live.dayWrites.answer(rise, 'no');
      assert.deepEqual(counts(), [expected.prompts.lows, 0]);
    });
  }

  if (!expected.overview) return;

  await t.test('Overview', async () => {
    await live.readTab('overview');
    const tir = values(overview.metric('wearer', '14', 'tir'));
    assert.deepEqual([tir.value, tir.previous], [expected.overview.tir, expected.overview.previous]);
    assert.ok(values(overview.profile('wearer', '14')).bins.length > 0, 'the glucose profile has bins');
    const isf = values(overview.isfEstimate('wearer', '14'));
    for (const [key, value] of Object.entries(expected.overview.isf)) assert.equal(isf[key], value, `ISF ${key}`);
    const basal = values(overview.basalEstimate('wearer', '14'));
    assert.deepEqual({
      slots: basal.slots.length, estimated: basal.slots.filter((slot) => slot.estimate).length,
      moves: basal.slots.filter((slot) => slot.move).map((slot) => [slot.start, slot.move]),
    }, expected.overview.basal);
    const printed = (value) => (value === null ? null : Math.round(value));
    const tenth = (value) => (value === null ? null : Math.round(value * 10) / 10);
    for (const window of ['14', '90']) {
      await live.readWindow(window);
      const meals = values(overview.mealSize('wearer', window));
      assert.deepEqual({
        hours: meals.hours,
        rows: meals.rows.map((row) => [row.from, row.to, row.meals, tenth(row.p10), tenth(row.p90),
          printed(row.median), printed(row.toPeak), printed(row.at3h), row.at3hMeals]),
      }, expected.overview.mealSize[window], `Meal size at ${window} d`);
    }
  });

  await t.test('Day', async () => {
    await live.readTab('day');
    const latest = day.latestDay();
    assert.equal(latest, expected.day.latest);
    await live.readDay(latest);
    near(values(day.insulinBar(latest)).total, expected.day.insulin, 'the day\'s insulin');
    assert.deepEqual(values(day.insulinBar(latest)).parts.map((p) => p.key),
      ['basal', 'meal', 'correction', 'control_iq_bolus']);
    assert.ok(values(day.dayChartOf(latest)).cgm.length > 0, 'the day chart has readings');
    assert.equal(values(day.promptsOfKind('low'))[0].bg, expected.day.firstLowBg);
  });

  await t.test('Settings', async () => {
    await Promise.all(['status', 'account', 'pump'].map((part) => live.settings.read(part)));
    const source = values(settings.tandemSource(null, live.accountState()));
    assert.equal(source.account.configured, false);
    assert.equal(source.data.days, expected.settings.days);
    assert.deepEqual(values(settings.pumpProfile('wearer')).segments, expected.settings.segments);
  });
});
