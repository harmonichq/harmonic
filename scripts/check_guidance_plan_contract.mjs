#!/usr/bin/env node
/** Cross-language guard for the source-owned guidance instruction → Plan boundary. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import {
  buildDeliverable,
  effectivePlanItems,
  reconcileDeliverable,
  PARAM_PRECISION,
  roundToPrecision,
} from '../frontend/plan.js';

const python = `
import json
import tempfile

from ciq_autotune.settings import PumpSettings, ProfileSettings, ProfileSegment
from ciq_autotune.store import Store
from ciq_autotune.result import plan_value
from scripts.qa_e2e_cases import QA_CASES, execute_case, materialize_case

def profile():
    return PumpSettings(active_idp=1, profiles=(ProfileSettings(
        idp=1, name="QA parity profile", dia_min=180, carb_entry=True,
        max_bolus=10.0,
        segments=(
            ProfileSegment(0, 0.6, 40, 10, 110),
            ProfileSegment(420, 0.6, 40, 10, 110),
            ProfileSegment(720, 0.6, 40, 10, 110),
        ),
    ),))

def owner_action(case_name, field):
    case = next(case for case in QA_CASES if case.name == case_name)
    with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
        with Store.open(database.name) as store:
            materialize_case(store, case)
            # The source action remains analyzer-produced. This profile merely
            # supplies the existing Plan's multiple active boundaries so the
            # delivered I:C membership and ISF fan-out are observable.
            store.upsert_settings_snapshot("2024-05-30 23:59:00", profile())
            execution = execute_case(store, case)
            action = next(row["guidance"]["action"] for row in execution.analysis[field]
                          if row.get("guidance", {}).get("action") is not None)
            active = store.settings_snapshots()[-1].settings.active()
    return action, [{
        "start_min": segment.start_min,
        "basal_rate": segment.basal_rate,
        "isf": segment.isf,
        "carb_ratio": segment.carb_ratio,
        "target_bg": segment.target_bg,
    } for segment in active.segments]

actions, profiles = {}, {}
for name, case_name, field in (
    ("basal", "basal-raise", "basal"),
    ("ic", "ic-raise", "ic_blocks"),
    ("isf", "isf-strengthen", "isf"),
):
    actions[name], profiles[name] = owner_action(case_name, field)

samples = [[parameter, value, plan_value(value, parameter)] for parameter, value in (
    ("basal_rate", 0.1235), ("isf", 29.5), ("carb_ratio", 5.25),
)]
print(json.dumps({"actions": actions, "profiles": profiles, "samples": samples}))
`;

const source = JSON.parse(execFileSync(
  'uv', ['run', 'python', '-c', python], { encoding: 'utf8' },
));

for (const [parameter, value, expected] of source.samples) {
  assert.equal(roundToPrecision(value, PARAM_PRECISION[parameter]), expected,
    `${parameter} accepted-pick rounding diverged`);
}

function activeProfile(parameter) {
  return { segments: source.profiles[parameter] };
}

function basalItem(action) {
  return {
    type: 'basal', start_min: action.start_min, value: action.recommended,
  };
}

function icItems(action) {
  const provenance = {
    block_start_min: action.start_min,
    block_end_min: action.end_min,
    block_member_start_mins: action.member_start_mins,
  };
  return action.member_start_mins.map((start_min) => ({
    type: 'ic', start_min, value: action.recommended, ic_block_provenance: provenance,
  }));
}

function isfItems(action, profile) {
  return profile.segments
    .filter(({ start_min }) => start_min >= action.start_min && start_min < action.end_min)
    .map(({ start_min }) => ({ type: 'isf', start_min, value: action.recommended }));
}

const basalAction = source.actions.basal;
const acceptedBasal = basalItem(basalAction);
const basalRows = buildDeliverable({
  activeProfile: activeProfile('basal'), acceptedItems: [acceptedBasal],
});
const deliveredBasal = effectivePlanItems(basalRows)
  .filter(({ type }) => type === 'basal')
  .map(({ type, start_min, value }) => ({ type, start_min, value }));
assert.deepEqual(
  deliveredBasal,
  [{ type: acceptedBasal.type, start_min: acceptedBasal.start_min, value: acceptedBasal.value }],
  'the source-owned basal action must deliver its one accepted slot',
);
const basalEndRow = basalRows.find(({ start_min }) => start_min > deliveredBasal[0].start_min);
assert.equal(
  basalEndRow.start_min,
  basalAction.end_min,
  'the source-owned basal end must match the Plan reversion boundary',
);
assert.deepEqual(
  { value: basalEndRow.basal_rate.value, provenance: basalEndRow.basal_rate.provenance },
  { value: basalEndRow.basal_rate.current, provenance: 'current' },
  'the source-owned basal end must restore the active profile at its boundary',
);

const icAction = source.actions.ic;
const deliveredIc = effectivePlanItems(buildDeliverable({
  activeProfile: activeProfile('ic'), acceptedItems: icItems(icAction),
})).filter(({ type }) => type === 'ic');
assert.deepEqual(deliveredIc.map(({ start_min }) => start_min), icAction.member_start_mins,
  'the source-owned I:C members must all reach the Plan');
assert.ok(deliveredIc.every(({ value }) => value === icAction.recommended),
  'the source-owned I:C recommendation must reach every Plan member');
assert.ok(deliveredIc.every(({ ic_block_provenance }) =>
  ic_block_provenance && ic_block_provenance.block_start_min === icAction.start_min
  && ic_block_provenance.block_end_min === icAction.end_min
  && JSON.stringify(ic_block_provenance.block_member_start_mins)
    === JSON.stringify(icAction.member_start_mins)),
  'the complete source-owned I:C membership must retain Plan provenance');

const isfAction = source.actions.isf;
const expectedIsf = isfItems(isfAction, activeProfile('isf'));
const deliveredIsf = effectivePlanItems(buildDeliverable({
  activeProfile: activeProfile('isf'),
  acceptedItems: process.env.MUTATE_PLAN_ADAPTER ? expectedIsf.slice(0, -1) : expectedIsf,
})).filter(({ type }) => type === 'isf');
assert.deepEqual(
  deliveredIsf.map(({ start_min, value }) => ({ start_min, value })),
  expectedIsf.map(({ start_min, value }) => ({ start_min, value })),
  'the source-owned whole-day ISF action must fan out to every active profile boundary',
);

const cases = [];
const base = source.profiles.isf;
for (const [name, items] of [
  ['basal-split', [{ type: 'basal', start_min: 30, value: 0.7235 }]],
  ['whole-profile', base.map(({ start_min }) => ({ type: 'isf', start_min, value: 29.5 }))],
  ['captured-block', icItems(icAction)],
]) {
  const segments = name === 'captured-block' ? source.profiles.ic : base;
  const rows = buildDeliverable({ activeProfile: { segments }, acceptedItems: items });
  const actual = rows.map(row => Object.fromEntries([
    ['start_min', row.start_min], ...Object.keys(PARAM_PRECISION).map(param =>
      [param, roundToPrecision(row[param].value, PARAM_PRECISION[param])]),
  ]));
  const split = [...actual, { ...actual[0], start_min: 15 }].sort((a, b) => a.start_min - b.start_min);
  const mismatch = split.map(row => row.start_min === 15 ? { ...row, target_bg: 150 } : row);
  const merged = actual.filter((row, i) => i === 0 || Object.keys(PARAM_PRECISION)
    .some(param => row[param] !== actual[i - 1][param]));
  for (const [variant, detected] of [['exact', actual], ['split', split], ['merged', merged], ['mismatch', mismatch]]) {
    cases.push({ name: `${name}-${variant}`, segments, items, rows, actual: detected,
      matches: reconcileDeliverable(rows, detected).state === 'confirmed' });
  }
}
const backend = JSON.parse(execFileSync('uv', ['run', 'python', '-c', `
import json, sys
from ciq_autotune.guidance import plan_deliverable, schedule_matches
cases = json.load(sys.stdin)
print(json.dumps([{'rows': plan_deliverable(c['segments'], c['items']),
                   'matches': schedule_matches(c['rows'], c['actual'])} for c in cases]))
`], { encoding: 'utf8', input: JSON.stringify(cases) }));
for (let i = 0; i < cases.length; i++) {
  assert.deepEqual(backend[i].rows, cases[i].rows, `${cases[i].name}: backend deliverable drift`);
  assert.equal(backend[i].matches, cases[i].matches, `${cases[i].name}: schedule comparison drift`);
}
assert.ok(cases.some(c => !c.matches), 'negative schedule comparisons must execute');
console.log(`guidance Plan contract: PASS (${cases.length} backend schedule cases)`);
