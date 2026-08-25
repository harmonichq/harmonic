/* Rendered audit for the #694 sparse-evidence lock amendment.
 *
 * Uses the committed manufactured fixture through the built app opener — the
 * mock this audit once also ran against is archived (#722); the app is now
 * the sole contract. The seven cases prove the port renders rather than
 * re-derives support.
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

const cases = [
  { name: 'matched-supported-light', finding: 'finding:late_bolus', theme: 'light' },
  { name: 'comparison-withheld-dark', finding: 'finding:missed_meal', theme: 'dark' },
  { name: 'selected-trace-light', finding: 'finding:missed_meal', theme: 'light' },
  {
    name: 'selected-withheld-light', view: 'meals', state: 'selected-occurrence',
    theme: 'light', another: 1, occ: 'meals-synthetic-18',
  },
  {
    name: 'narrow-mixed-light', view: 'meals', state: 'dense', theme: 'light',
    viewport: { width: 390, height: 844 },
  },
];

async function facts(page) {
  return page.evaluate(() => {
    const exposed = window.__diagnoseEventComparison || window.__issue677ReducedBands;
    const option = exposed.chart.getOption();
    const ids = option.series.map((series) => series.id).filter(Boolean);
    const lineSeries = option.series.filter((series) => /:line:/.test(series.id || ''));
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
    const selectedCohort = exposed.selected?.verdict?.cohort || exposed.selected?.__cohort;
    const selectedLines = lineSeries.filter((series) =>
      series.id.startsWith(`${selectedCohort}:`));
    const otherLines = lineSeries.filter((series) =>
      !series.id.startsWith(`${selectedCohort}:`));
    const cohorts = exposed.cohorts || exposed.support?.cohorts || {};
    return {
      serverOwned: exposed.projection?.schema === 'diagnose-finding-case-file-v1',
      cohortSupport: Object.fromEntries(Object.entries(cohorts)
        .map(([key, value]) => [key, value.support])),
      /* #62 — a cohort too thin for an aggregate draws its own episodes, faint
         and named as episodes. The count the server published and the count on
         the canvas have to be the same number. */
      cohortUsable: Object.fromEntries(Object.entries(cohorts)
        .map(([key, value]) => [key, value.usable_count])),
      episodeSeries: Object.fromEntries(Object.entries(cohorts).map(([key]) => [key,
        ids.filter((id) => id.startsWith(`${key}:episode:`)).length])),
      pointStates: Object.fromEntries(Object.entries(exposed.aggregates)
        .map(([key, rows]) => [key, [...new Set(rows.map((row) => row.support))].sort()])),
      maxSpread: Object.fromEntries(Object.entries(exposed.aggregates)
        .map(([key, rows]) => [key, Math.max(...rows
          .filter((row) => row.p25 != null && row.p75 != null)
          .map((row) => row.p75 - row.p25))])),
      ids,
      invalidLinePoints,
      selected: exposed.selected?.identity?.id || exposed.selected?.id || null,
      selectedCohort: selectedCohort || null,
      selectedOpacity: Math.max(0, ...selectedLines.map((series) => series.lineStyle?.opacity || 0)),
      otherOpacity: Math.max(0, ...otherLines.map((series) => series.lineStyle?.opacity || 0)),
      selectedTrace: option.series.some((series) => series.name === 'Selected occurrence'),
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
      for (const item of got.legend.filter((entry) => entry.cohort !== 'selected')) {
        assert.equal(item.support, got.cohortSupport[item.cohort],
          `${check.name}: ${item.cohort} legend mark does not match server support`);
      }
      assert.ok(!got.ids.some((id) => /:(?:line|spread):withheld$/.test(id)),
        `${check.name}: Withheld aggregate series exists`);
      // one occurrence never becomes a median; it is drawn as itself instead
      for (const [cohort, support] of Object.entries(got.cohortSupport)) {
        assert.equal(got.episodeSeries[cohort], support === 'withheld' ? got.cohortUsable[cohort] : 0,
          `${check.name}: ${cohort} drew ${got.episodeSeries[cohort]} episodes for ${got.cohortUsable[cohort]} usable (${support})`);
      }

      if (check.state === 'dense') {
        assert.ok(Object.hasOwn(got.cohortSupport, 'matched'), `${check.name}: matched cohort`);
        assert.ok(Object.hasOwn(got.cohortSupport, 'nearly_matched'), `${check.name}: nearly-matched cohort`);
        assert.ok(Object.hasOwn(got.cohortSupport, 'comparison'), `${check.name}: comparison cohort`);
        assert.deepEqual(got.pointStates.fired, ['limited', 'supported', 'withheld'],
          `${check.name}: changing point membership is absent`);
        assert.ok(got.maxSpread.fired >= 30,
          `${check.name}: dispersed Supported cohort is not visible`);
        assert.ok(got.maxSpread.near_rule >= 30,
          `${check.name}: dispersed Limited cohort is not visible`);
        assert.match(got.legend.find((item) => item.cohort === 'fired').detail,
          /^\d+ events?$/,
          `${check.name}: supported cohort detail is not plain event count`);
        assert.match(got.legend.find((item) => item.cohort === 'near_rule').detail,
          /^\d+ events? · thin$/,
          `${check.name}: limited cohort detail does not say thin`);
      }
      if (check.name === 'meals-mixed-light') {
        if (got.chartLabel) {
          assert.doesNotMatch(got.chartLabel, /episodes|whiskers|percentile/i,
            `${check.name}: chart's standing label retains retired explanatory copy`);
        }
        await page.locator('#ec-chart').focus();
        await page.keyboard.press('End');
        const inspectedLabel = await page.locator('#ec-chart').getAttribute('aria-label');
        assert.match(inspectedLabel, /no value at this point/i,
          `${check.name}: withheld point does not state that it has no value`);
        assert.doesNotMatch(inspectedLabel, /shown individually/i,
          `${check.name}: withheld point states a false cohort-level fact`);
      }
      if (check.state === 'sparse') {
        assert.ok(Object.values(got.cohortSupport).every((support) => support !== 'supported'),
          `${check.name}: sparse cohort retained Supported authority`);
      }
      if (check.state === 'zero-fired') {
        assert.equal(got.cohortSupport.fired, 'withheld', `${check.name}: zero cohort not Withheld`);
        /* #62 — a Withheld cohort now says WHY it draws no aggregate: with no
           usable episode there is nothing to draw at all, which is a different
           fact from a thin cohort drawing its episodes one by one. */
        assert.equal(got.cohortUsable.fired, 0, `${check.name}: zero cohort has usable episodes`);
        assert.equal(got.legend.find((item) => item.cohort === 'fired').detail,
          '0 events · nothing to draw',
          `${check.name}: zero cohort detail does not say nothing to draw`);
      }
      if (check.name === 'selected-supported-dark') {
        assert.ok(got.selected && got.selectedTrace, `${check.name}: selected trace missing`);
        assert.ok(got.selectedOpacity > got.otherOpacity,
          `${check.name}: selected cohort is not emphasized`);
      }
      if (check.name === 'selected-withheld-light') {
        assert.equal(got.selected, 'meals-synthetic-18', `${check.name}: selected occurrence`);
        assert.equal(got.cohortSupport.another_factor, 'withheld', `${check.name}: cohort support`);
        assert.equal(got.legend.find((item) => item.cohort === 'another_factor').detail,
          '1 event · too few to average · selected cohort',
          `${check.name}: one-event cohort detail does not say too few to average`);
        assert.ok(got.selectedTrace, `${check.name}: exact trace missing`);
        assert.ok(!got.ids.some((id) => /^another_factor:(?:line|spread):/.test(id)),
          `${check.name}: selection promoted a Withheld aggregate`);
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
