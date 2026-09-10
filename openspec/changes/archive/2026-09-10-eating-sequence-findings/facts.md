# Implementation facts — lock 2 reconciliation

Captured from the completed c1–c4 checkout on 2026-09-10. This inventory supersedes
the preimplementation line numbers; historical baseline evidence is unchanged.
Output blocks below are complete output from the stated commands.

## Source entry points

```sh
rg -n '^def (build_report|evaluate_sequences|build_sequences|evaluate|assemble|build_scenarios|tally_attributions|prepare|wrap)|^class (Exposure|Lever)' ciq_autotune/analyzers/eating_sequences.py ciq_autotune/analyzers/scenario/{evaluation,engine,levers}.py ciq_autotune/finding_case_file.py
```

```text
ciq_autotune/analyzers/scenario/levers.py:32:class Exposure(str, Enum):
ciq_autotune/analyzers/scenario/levers.py:41:class Lever(str, Enum):
ciq_autotune/analyzers/scenario/evaluation.py:206:def evaluate(bolus, cgm, basal=(), *, isf=None, scenario_config=ScenarioConfig(),
ciq_autotune/analyzers/eating_sequences.py:439:def evaluate_sequences(
ciq_autotune/analyzers/eating_sequences.py:508:def build_report(
ciq_autotune/analyzers/eating_sequences.py:537:def build_sequences(
ciq_autotune/analyzers/scenario/engine.py:114:def tally_attributions(
ciq_autotune/analyzers/scenario/engine.py:312:def assemble(
ciq_autotune/analyzers/scenario/engine.py:523:def build_scenarios(
ciq_autotune/finding_case_file.py:308:def prepare(store, *, query, version, analysis, exposures, scenarios, selected_id=None,
ciq_autotune/finding_case_file.py:502:def wrap(prepared):
```

## Chart registry and shared controls

```sh
rg -n "kind: '(basal|isf|carb-ratio|event-comparison|eating-sequence|pattern-case-file)'|function renderClearTrace|sequences: 'sequences'" frontend/diagnose-evidence-charts.js frontend/diagnose-workstation.js
```

```text
frontend/diagnose-evidence-charts.js:947:    kind: 'basal',
frontend/diagnose-evidence-charts.js:971:    kind: 'isf',
frontend/diagnose-evidence-charts.js:988:    kind: 'carb-ratio',
frontend/diagnose-evidence-charts.js:1009:    kind: 'eating-sequence',
frontend/diagnose-evidence-charts.js:1027:    kind: 'event-comparison',
frontend/diagnose-evidence-charts.js:1067:    kind: 'pattern-case-file',
frontend/diagnose-workstation.js:237:  highs: 'high episodes', correction_clusters: 'correction clusters', sequences: 'sequences',
frontend/diagnose-workstation.js:243:  lows: 'lows', meals: 'meals', highs: 'highs', correction_clusters: 'clusters', sequences: 'sequences',
frontend/diagnose-workstation.js:632:function renderClearTrace(host, onClearTrace) {
```

## Producer and transport facts

- Both sequence levers are habit members of Highs after meals, outside rate_levers.
  No new Exposure, outcome Pattern, Pattern copy key or Verify trend is introduced.
- Scenario evaluation owns candidate prices, bounded episode winners, sequence
  identities and outcome witnesses. Exposures maps emitted meal opportunities
  inside winning bounded episodes; member_associations do not charge the meal rate.
- The shared fixture decoder in `frontend/eating-sequence-fixture.js` expands
  `$ref` values from `shared`; it does not rebuild findings.rows. The generator
  retains the producer's original preparation rows and rendered rows.
- Fifteen dedicated states retain two windows each: global and 0-360. Event and
  clock cases plus every sequence selection are retained. Unrelated shell context
  continues to come from the existing synthetic shell feeds.
- Fifty-seven QA recipes include twelve new sequence recipes. Projection fixtures
  add eighteen sequence cases, including missing/null/midnight witness variants,
  compared across seven windows by the Python/JS parity tests.
- Summary-sentence percentages use one decimal; numeric report fields retain
  precision. Both sequence family names are explicitly sequences.
- The ledger has 183 issued / 182 active stories; S117 remains retired. S151–S158
  cover nesting, charts, canonical drill, scoped membership and truthful cells.

## Measured facts and authority

See [coverage-appendix.md](coverage-appendix.md) for all five QA budgets and the
coordinator's contention ruling. See [verification.md](verification.md) and
[evidence/verification-lock-2.md](evidence/verification-lock-2.md) for measured
checks and outstanding whole-ticket acceptance. Browser capture counts establish
executed states, not final human visual approval. No new browser run or full pytest
run was performed for Amendment 2.
