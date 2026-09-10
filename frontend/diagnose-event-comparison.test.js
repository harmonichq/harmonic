import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  caseFileSelectionCohort, eventComparisonChartOption, GLUCOSE_ENVELOPE,
} from './diagnose-event-comparison.js';

const caseFiles = () => JSON.parse(readFileSync(
  new URL('../mockups/diagnose-workstation.synthetic/finding-case-files.json', import.meta.url), 'utf8',
));

test('case-file comparison selection uses its served cohort identity', () => {
  const matched = Object.values(caseFiles().cases['finding:missed_meal'].selected_event)
    .find((caseFile) => caseFile.selection.detail.comparison_cohort === 'matched')
    .selection.detail;
  assert.equal(matched.verdict, 'fired');
  assert.equal(caseFileSelectionCohort(matched), 'matched');
  assert.equal(caseFileSelectionCohort({ verdict: 'fired' }), null,
    'the renderer does not derive a comparison cohort from a verdict');
});

/* THE CAPTION MUST NOT BE STRUCK BY THE LINE IT NAMES (#355). ECharts places an
   unpositioned markArea label at the centre of the area's TOP edge — here the
   y = 180 target boundary — with no background, so the boundary rule struck the
   text out and the centre-tick gridline crossed it. The rewrite onto served case
   files kept the caption's `name` and dropped the `label` block that placed it,
   so this pins the placement and the plate rather than the words. */
test('the stage target band caption clears its own boundary, on an opaque plate', () => {
  const prior = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle };
  const tokens = {
    '--mk-muted': '#3d5848', '--mk-line': '#c3bfb4', '--mk-ok': '#5d7368',
    '--ck-rail': '#efeae0',
  };
  const targetBand = (option) => option.series
    .find((series) => series.name === 'Target range').markArea.data[0][0];
  try {
    globalThis.document = { documentElement: {} };
    globalThis.getComputedStyle = () => ({
      getPropertyValue: (name) => tokens[name] || '',
    });
    const caseFile = caseFiles().cases['finding:late_bolus'].event;
    const stage = targetBand(eventComparisonChartOption(caseFile, GLUCOSE_ENVELOPE));
    const mini = targetBand(eventComparisonChartOption(caseFile, GLUCOSE_ENVELOPE, null, true));

    assert.equal(stage.name, 'target 70–180');
    assert.equal(stage.label?.show, true, 'the caption is placed by the app, never by the library');
    assert.equal(stage.label.position, 'insideStartTop',
      'centred on the top edge is where the 180 rule strikes it out');
    assert.equal(stage.label.distance, 10, 'it drops into the band\'s own clear space');
    assert.equal(stage.label.color, '#3d5848');
    assert.equal(stage.label.backgroundColor, '#efeae0',
      'the plate is the panel ground token, so gridlines break behind the text');
    assert.doesNotMatch(String(stage.label.backgroundColor), /color-mix/,
      'zrender silently drops a color-mix() plate on this path, painting nothing');

    /* A MINI KEEPS NO AXIS FURNITURE AT ALL (ADR 215 amendments). */
    assert.equal(mini.name, undefined);
    assert.equal(mini.label, undefined);
  } finally {
    globalThis.document = prior.document;
    globalThis.getComputedStyle = prior.getComputedStyle;
  }
});
