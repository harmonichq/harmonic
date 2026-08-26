/* Rendered audit for the #694 sparse-evidence lock amendment.
 *
 * Uses the committed manufactured fixture through the built app opener — the
 * mock this audit once also ran against is archived (#722); the app is now
 * the sole contract. The cases prove the surface RENDERS support rather than
 * re-deriving it.
 *
 * #181 re-settled where support comes from: the served Finding case file, whose
 * three populations (Matched, Nearly matched, and the named comparison) each
 * carry their own grade, and which publishes no episodes for a withheld
 * population at all. So the rule this audit enforces is stricter than the one it
 * replaced: a withheld population draws NOTHING — no median, no spread, no
 * episodes — and says why in the legend.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  openApp,
  openerProblems,
} from '../frontend/diagnose-event-comparison-behavior.replay.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE
  || (() => { throw new Error('PLAYWRIGHT_MODULE is required'); })());
const out = process.env.AUDIT_SCREENSHOT_DIR;
const target = process.env.TARGET;
if (target !== 'app') throw new Error(`TARGET must be app, got ${target || '(unset)'} — the mock this audit once ran against is archived (#722); the app is now the sole contract`);
const open = openApp;

/* A served downgrade: the same case file, with the supported population regraded
   by the server to a single limited point. A surface that re-derived support
   from the occurrences would put the Supported aggregate back. */
const downgrade = (caseFile, url) => {
  if (url.searchParams.get('alignment') !== 'event') return caseFile;
  const matched = caseFile.projection.cohorts[0];
  matched.support = 'limited';
  matched.usable_count = 2;
  matched.points = matched.points.map((point) => point.minute % 60 === 0
    ? { ...point, n: 2, support: 'limited', median: 120, p25: 110, p75: 130 }
    : { ...point, n: 0, support: 'withheld', median: null, p25: null, p75: null });
  return caseFile;
};

const cases = [
  { name: 'matched-supported-light', finding: 'finding:late_bolus', theme: 'light' },
  { name: 'comparison-withheld-dark', finding: 'finding:missed_meal', theme: 'dark' },
  {
    name: 'selected-withheld-light', finding: 'finding:missed_meal', theme: 'light',
    selectCohort: 'matched',
  },
  {
    name: 'served-downgrade-light', finding: 'finding:late_bolus', theme: 'light',
    caseFile: downgrade,
  },
  {
    name: 'narrow-mixed-light', finding: 'finding:late_bolus', theme: 'light',
    viewport: { width: 390, height: 844 },
  },
];

async function facts(page) {
  return page.evaluate(() => {
    const exposed = window.__diagnoseEventComparison;
    const option = exposed.chart.getOption();
    const ids = option.series.map((series) => series.id).filter(Boolean);
    const served = exposed.projection.projection;
    const lineSeries = option.series.filter((series) => /:line:/.test(series.id || ''));
    /* The rule the whole audit exists for: a drawn point may only appear on the
       line graded for the support the SERVER gave that point. */
    const invalidLinePoints = [];
    for (const series of lineSeries) {
      const [cohort, , support] = series.id.split(':');
      const expected = new Map(exposed.aggregates[cohort].map((row) => [row.minute, row.support]));
      for (const [minute, value] of series.data) {
        if (value != null && expected.get(minute) !== support) {
          invalidLinePoints.push({ id: series.id, minute, support: expected.get(minute) });
        }
      }
    }
    const selectedCohort = exposed.selected?.cohort ?? null;
    const opacity = (predicate) => Math.max(0, ...lineSeries
      .filter((series) => predicate(series.id.split(':')[0]))
      .map((series) => series.lineStyle?.opacity || 0));
    return {
      serverOwned: exposed.projection.schema === 'diagnose-finding-case-file-v1'
        && served.alignment === 'event',
      cohorts: served.cohorts.map((cohort) => ({
        key: cohort.key,
        name: cohort.name,
        support: cohort.support,
        routed: cohort.routed_count,
        usable: cohort.usable_count,
        episodes: (cohort.episodes || []).length,
        series: ids.filter((id) => id.startsWith(`${cohort.key}:`)),
        maxSpread: Math.max(0, ...cohort.points
          .filter((point) => point.p25 != null && point.p75 != null)
          .map((point) => point.p75 - point.p25)),
      })),
      comparison: served.comparison,
      ids,
      invalidLinePoints,
      selected: exposed.selected?.id ?? null,
      selectedCohort,
      selectedOpacity: selectedCohort ? opacity((key) => key === selectedCohort) : 0,
      otherOpacity: selectedCohort ? opacity((key) => key !== selectedCohort) : 0,
      selectedTrace: option.series.some((series) => series.name === 'Selected trace'),
      legend: [...document.querySelectorAll('.ec-key-item')].map((item) => ({
        cohort: item.dataset.cohort,
        support: item.dataset.support || null,
        selected: item.dataset.selectedCohort || null,
        detail: item.querySelector('small')?.textContent.replace(/\s+/g, ' ').trim(),
        text: item.textContent.replace(/\s+/g, ' ').trim(),
      })),
      chartLabel: document.querySelector('#ec-chart')?.getAttribute('aria-label') || '',
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

if (out) await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const check of cases) {
    const page = await open(browser, check);
    try {
      const got = await facts(page);
      assert.equal(got.serverOwned, true, `${check.name}: support is not server-owned`);
      assert.deepEqual(got.invalidLinePoints, [], `${check.name}: line crossed a support boundary`);
      assert.ok(got.overflow <= 1, `${check.name}: page overflows by ${got.overflow}px`);
      assert.ok(!got.ids.some((id) => /:(?:line|spread):withheld$/.test(id)),
        `${check.name}: Withheld aggregate series exists`);
      assert.deepEqual(got.cohorts.map((cohort) => cohort.key),
        ['matched', 'nearly_matched', 'comparison'],
        `${check.name}: the three served populations did not reach the canvas`);

      for (const cohort of got.cohorts) {
        const item = got.legend.find((entry) => entry.cohort === cohort.key);
        assert.ok(item, `${check.name}: ${cohort.key} has no legend entry`);
        assert.equal(item.support, cohort.support,
          `${check.name}: ${cohort.key} legend mark does not match server support`);
        assert.ok(item.detail.startsWith(`${cohort.routed} occurrence`),
          `${check.name}: ${cohort.key} legend does not print the served count (${item.detail})`);
        if (cohort.support === 'withheld') {
          /* The case file publishes no episodes for a withheld population, so
             the canvas has nothing of its own to draw and has to say so. */
          assert.equal(cohort.episodes, 0,
            `${check.name}: ${cohort.key} served episodes for a withheld population`);
          assert.deepEqual(cohort.series, [],
            `${check.name}: ${cohort.key} drew ${cohort.series.join(', ')} while withheld`);
          assert.match(item.detail, /unavailable/,
            `${check.name}: ${cohort.key} does not say why it draws nothing (${item.detail})`);
        } else {
          assert.ok(cohort.series.includes(`${cohort.key}:line:${cohort.support}`),
            `${check.name}: ${cohort.key} drew no aggregate at its served grade`);
        }
      }
      assert.equal(got.comparison.state,
        got.cohorts[2].support === 'withheld' ? 'unavailable' : 'available',
        `${check.name}: the served comparison state disagrees with its own support`);

      if (check.name === 'matched-supported-light') {
        assert.equal(got.cohorts[0].support, 'supported', `${check.name}: matched cohort`);
        assert.equal(got.cohorts[2].support, 'limited', `${check.name}: comparison cohort`);
        /* The manufactured Matched traces are identical, so its band is flat by
           construction; the dispersion claim belongs to the population that has
           any. Both still have to DRAW their band at their own grade. */
        assert.ok(got.cohorts[2].maxSpread >= 30,
          `${check.name}: dispersed Limited cohort is not visible`);
        assert.ok(got.ids.includes('matched:spread:supported'),
          `${check.name}: the Supported cohort drew no spread`);
        assert.equal(got.legend.find((item) => item.cohort === 'matched').detail,
          `${got.cohorts[0].routed} occurrences`,
          `${check.name}: supported cohort detail is not a plain occurrence count`);
        assert.match(got.legend.find((item) => item.cohort === 'comparison').detail,
          /limited support$/,
          `${check.name}: limited cohort detail does not say limited support`);
        // A withheld point states that it has no value, and no cohort-level fact.
        await page.locator('#ec-chart').focus();
        await page.keyboard.press('End');
        const inspected = await page.locator('#ec-chart').getAttribute('aria-label');
        assert.match(inspected, /unavailable/i,
          `${check.name}: withheld point does not state that it has no value`);
        assert.doesNotMatch(inspected, /shown individually|episodes|whiskers|percentile/i,
          `${check.name}: inspected point states a false cohort-level fact`);
      }
      if (check.name === 'comparison-withheld-dark') {
        assert.equal(got.cohorts[2].support, 'supported',
          `${check.name}: the named comparison population lost its support`);
        assert.ok(got.cohorts.slice(0, 2).every((cohort) => cohort.support === 'withheld'),
          `${check.name}: the thin matched populations retained aggregate authority`);
      }
      if (check.name === 'selected-withheld-light') {
        assert.equal(got.selectedCohort, 'matched', `${check.name}: selected cohort`);
        assert.equal(got.cohorts[0].support, 'withheld', `${check.name}: cohort support`);
        assert.ok(got.selectedTrace, `${check.name}: exact trace missing`);
        assert.deepEqual(got.cohorts[0].series, [],
          `${check.name}: selection promoted a Withheld aggregate`);
        assert.equal(got.legend.find((item) => item.cohort === 'matched').selected, 'true',
          `${check.name}: legend does not identify the selected population`);
        assert.ok(got.selectedOpacity === 0 || got.selectedOpacity > got.otherOpacity,
          `${check.name}: a drawn selected cohort is not emphasized`);
      }
      if (check.name === 'served-downgrade-light') {
        assert.equal(got.cohorts[0].support, 'limited',
          `${check.name}: the served downgrade did not reach the canvas`);
        assert.ok(!got.ids.includes('matched:line:supported'),
          `${check.name}: the canvas restored an aggregate the server downgraded`);
        assert.ok(got.ids.includes('matched:line:limited'),
          `${check.name}: the downgraded aggregate was not drawn at its served grade`);
      }
      if (out) await page.screenshot({ path: join(out, `${check.name}.png`), fullPage: true });
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}

assert.deepEqual(openerProblems(), [], 'browser console/request failures');
console.log(`PASS ${cases.length} issue #694 support renders against ${target}`);
