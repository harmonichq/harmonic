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
//   uv run python scripts/smoke_app.py --case pattern-correction-fold --then node --test frontend/ui/app/live.contract.test.mjs
//   uv run python scripts/smoke_app.py --case basal-and-carb-ratio-lower --then node --test frontend/ui/app/live.contract.test.mjs
//   uv run python scripts/smoke_app.py --case pattern-correction-collapse --then node --test frontend/ui/app/live.contract.test.mjs
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
    // One previous change: the whole-day carb ratio move, with no saved result.
    previous: [{ title: 'I:C', block: null, moves: [[null, 12, 10, 'g/U']], result: null }],
    overview: { tir: 98.6, previous: 100, isf: { current: 40, recommended: null, uncertain: true, nights: 14 },
      // The 48 half-hour slots, and the moves the basal analyzer stages (ADR 523).
      basal: { slots: 48, estimated: 48, moves: [[180, 'lower'], [210, 'lower']] } },
    day: { latest: '2024-06-30', insulin: 19.56, firstLowBg: 48 },
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
    findings: {
      '2024-05-14': [['2024-05-14 22:00:00', 'pattern', ['Correction on active insulin']]],
      '2024-05-16': [['2024-05-16 13:55:00', 'pattern', ['Over-treated low']]],
      '2024-05-24': [['2024-05-24 14:40:00', 'correction', ['Correction stacking']],
        ['2024-05-24 16:05:00', 'pattern', ['Correction stacking']]],
      '2024-05-27': [['2024-05-27 17:00:00', 'pattern', ['Missed / unannounced meal']]],
    },
  },
  'isf-strengthen': {
    queue: ['setting:isf'],
    isf: { current: 40, recommended: 32, uncertain: false, nights: 29 },
    change: { kind: 'none' },
  },
  // A queued carb ratio: its card draws the block, current → suggested and range.
  'basal-and-carb-ratio-lower': {
    queue: ['setting:basal_rate', 'pattern:highs_after_meals', 'pattern:lows_after_meals', 'setting:carb_ratio'],
    ic: { title: 'I:C', units: 'g/U', start: 0, end: 1440, current: 10, suggested: 9, estimate: 8, lo: 8, hi: 8,
      // The meal runs the estimate counts: the stat row's count and the chart's dots (ADR 523).
      count: { label: 'Meal runs', value: 8 }, dots: 8 },
    isf: null,
    change: { kind: 'none' },
  },
  // Lows after correcting highs, served as its one admitted habit, counts the low
  // a stacked pair of corrections reached as well as that habit's own two.
  'pattern-correction-collapse': {
    queue: ['pattern:lows_after_correcting_highs', 'pattern:highs_after_treating_lows'],
    pattern: { key: 'lows_after_correcting_highs', title: 'Lows after correcting highs',
      magnitude: { count: 3, denominator: 6, noun: 'lows' },
      traces: { anchor: 'correction', window: [0, 240], episodes: 3, patternBins: 49, typicalBins: 0, typical: 1 },
      caseFile: { summary: { claimed: 3, denominator: 6, noun: 'lows' }, outcome: 'nadir', impact: null } },
    isf: null,
    change: { kind: 'none' },
  },
  'c3-trial': {
    queue: ['setting:basal_rate'],
    basal: { start: 60, end: 90, current: 0.6, suggested: 0.48, trial: false },
    isf: null,
    change: { kind: 'trial', title: 'Basal', maturing: false, result: 'unclear', canEnd: true },
    // #524: its block, what moved, the trace by clock time across the block (its
    // nights before and after), every module, and Control-IQ's delivered rate.
    trial: { block: [180, 210], moves: [['03:00', 0.6, 0.54, 'U/h']], meals: null,
      trace: { alignment: 'clock', episodes: [13, 15] },
      modules: { ranges: ['tir', 'tbr', 'tar'], glucose: ['mean', 'gmi', 'cv'], basal: ['delivered', 'above', 'below'] },
      delivered: [0.48, 0.48] },
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
      for (const [module, keys] of Object.entries(trial.modules)) {
        assert.deepEqual(active[module].map((row) => row.key), keys, module);
      }
      const delivered = active.basal.find((row) => row.key === 'delivered');
      assert.deepEqual([delivered.before, delivered.after], trial.delivered);
    }
    if (expected.previous) {
      const previous = values(changes.previousChanges('wearer'));
      assert.equal(values(changes.previousCount('wearer')), expected.previous.length, 'Previous · N');
      assert.deepEqual(previous.map((row) => ({ title: row.title, block: row.block,
        moves: row.moves.map((m) => [m.slot, m.before, m.after, m.units]), result: row.result })), expected.previous);
    }
  });

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
    assert.equal(values(day.lowPrompts())[0].bg, expected.day.firstLowBg);
  });

  await t.test('Settings', async () => {
    await Promise.all(['status', 'account', 'pump'].map((part) => live.settings.read(part)));
    const source = values(settings.tandemSource(null, live.accountState()));
    assert.equal(source.account.configured, false);
    assert.equal(source.data.days, expected.settings.days);
    assert.deepEqual(values(settings.pumpProfile('wearer')).segments, expected.settings.segments);
  });
});
