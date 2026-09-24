# Generated facts — #464 (regenerate from the checked-out tree)

```
$ git diff --stat e4862000 59fa4737 -- frontend ciq_autotune scripts
```

```
$ node /Users/connor/.claude/skills/ui-craft/scripts/route.mjs --embodiment shipped --runnability runnable --declaration complete --data-source manufactured
{"mode":"revise","reason":"safe manufactured data source declared"}
```

```
$ grep -n 'issued.: 193' mockups/sweep/harmonic-v2-desktop/acceptance.py
1268:    require(counts == {"issued": 193, "active": 174, "retired": 19}
```

```
$ grep -n 'S98' frontend/replay-cases.mjs
14:  S7: 'c3-trial', S7b: 'basal-no-change', S9: 'basal-lower', S18: 'basal-no-change', S80b: 'basal-no-change', S97: 'basal-lower', S98: 'ic-lower', S99: 'basal-insufficient-seven-night',
```

```
$ grep -n "modes: \['event', 'clock'\]" frontend/diagnose-evidence-charts.js
1025:    modes: ['event', 'clock'],
1043:    modes: ['event', 'clock'],
```

```
$ grep -n 'SCHEMA = ' ciq_autotune/ic_block_evidence.py
14:SCHEMA = "diagnose-carb-ratio-block-evidence-v1"
```

```
$ grep -n 'feed-only forms do not invent' frontend/diagnose-evidence-charts.test.js
1147:test('feed-only forms do not invent unavailable fit or current-setting values', () => {
```

```
$ grep -n '"ic-raise",' scripts/qa_e2e_cases.py
2186:        "ic-raise",
```

```
$ ls tests/test_ic_block_evidence.py tests/test_ic_regression.py tests/test_ic_blocks.py tests/test_ic_meal_runs.py tests/test_synthetic_fixture_shapes.py tests/test_qa_e2e_cases.py tests/test_gen_qa_e2e_db.py frontend/diagnose-evidence-charts.test.js frontend/diagnose-workstation.test.js frontend/diagnose-canvas-layout.test.js frontend/diagnose-event-comparison.test.js frontend/occurrence-roster.test.js frontend/diagnose.test.js
frontend/diagnose-canvas-layout.test.js
frontend/diagnose-event-comparison.test.js
frontend/diagnose-evidence-charts.test.js
frontend/diagnose-workstation.test.js
frontend/diagnose.test.js
frontend/occurrence-roster.test.js
tests/test_gen_qa_e2e_db.py
tests/test_ic_block_evidence.py
tests/test_ic_blocks.py
tests/test_ic_meal_runs.py
tests/test_ic_regression.py
tests/test_qa_e2e_cases.py
tests/test_synthetic_fixture_shapes.py
```

```
$ grep -n 'def attributed_occurrences' ciq_autotune/analyzers/scenario/engine.py
106:def attributed_occurrences(bolus_events, cgm_readings, basal_events=(), *, isf=None,
```

```
$ grep -n 'def renderIcBlockLevel' frontend/diagnose-workstation.js
```

```
$ grep -n 'harm.: (guidance or {}).get(.seriousness.)' ciq_autotune/guidance.py
128:            "harm": (guidance or {}).get("seriousness")}
```

```
$ python3 scripts/check_adr_numbers.py
check-adr: 251 ADRs in 117 design.md files, all identities unique and issue-keyed.
```

```
$ npx --yes @fission-ai/openspec@1 validate --all --strict
- Validating...
✓ spec/backtest
✓ spec/basal-suggestion
✓ spec/behavioral-layer
✓ change/carb-ratio-block-evidence
✓ spec/credentials
✓ spec/data-ingest
✓ spec/durable-follow-up
✓ spec/eating-sequences
✓ spec/http-api
✓ spec/insulin-reconstruction
✓ spec/outcomes
✓ spec/parameter-analysis
✓ spec/plan
✓ spec/qa-e2e-database
✓ spec/safety
✓ spec/surfaces
Totals: 16 passed, 0 failed (16 items)
```

