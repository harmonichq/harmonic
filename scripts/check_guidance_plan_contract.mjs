#!/usr/bin/env node
/**
 * Cross-language guard for the guidance instruction → Plan boundary.
 *
 * Guidance owners round accepted-pick values in Python.  The Plan owns the
 * delivered schedule and its block provenance in JavaScript.  These examples
 * exercise both public boundaries, so neither side can silently drift into a
 * second interpretation of a staged instruction.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import {
  buildDeliverable,
  effectivePlanItems,
  PARAM_PRECISION,
  roundToPrecision,
} from '../frontend/plan.js';

const python = `
import json
from ciq_autotune.result import plan_value

samples = [
    ['basal_rate', 0.1235],
    ['isf', 29.5],
    ['carb_ratio', 5.25],
]
print(json.dumps([[parameter, value, plan_value(value, parameter)]
                  for parameter, value in samples]))
`;

const rounded = JSON.parse(execFileSync(
  'uv', ['run', 'python', '-c', python], { encoding: 'utf8' },
));

for (const [parameter, value, expected] of rounded) {
  assert.equal(
    roundToPrecision(value, PARAM_PRECISION[parameter]), expected,
    `${parameter} accepted-pick rounding diverged`,
  );
}

const activeProfile = {
  segments: [
    { start_min: 0, basal_rate: 0.1, isf: 30, carb_ratio: 5, target_bg: 110 },
    { start_min: 420, basal_rate: 0.1, isf: 30, carb_ratio: 5, target_bg: 110 },
    { start_min: 600, basal_rate: 0.1, isf: 30, carb_ratio: 5, target_bg: 110 },
    { start_min: 720, basal_rate: 0.1, isf: 30, carb_ratio: 5, target_bg: 110 },
  ],
};

const basalRows = buildDeliverable({
  activeProfile,
  acceptedItems: [{ type: 'basal', start_min: 0, value: 0.124 }],
});
assert.deepEqual(
  effectivePlanItems(basalRows).map(({ type, start_min, value }) => ({ type, start_min, value })),
  [{ type: 'basal', start_min: 0, value: 0.124 }],
  'a guidance basal instruction must occupy one 30-minute Plan slot',
);
assert.equal(
  basalRows.find((row) => row.start_min === 30).basal_rate.value,
  0.1,
  'the next Plan boundary must restore the active basal value',
);

const provenance = {
  block_start_min: 420,
  block_end_min: 720,
  block_member_start_mins: [420, 600],
};
const icRows = buildDeliverable({
  activeProfile,
  acceptedItems: [
    { type: 'ic', start_min: 420, value: 5.3, ic_block_provenance: provenance },
    { type: 'ic', start_min: 600, value: 5.3, ic_block_provenance: provenance },
  ],
});
const icItems = effectivePlanItems(icRows).filter((item) => item.type === 'ic');
assert.deepEqual(
  icItems.map((item) => item.start_min), [420, 600],
  'a complete guidance I:C block must retain every member in the Plan',
);
assert.ok(
  icItems.every((item) => item.ic_block_provenance),
  'a complete guidance I:C block must retain its provenance',
);

console.log('guidance Plan contract: PASS');
