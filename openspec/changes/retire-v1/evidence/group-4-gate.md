# Group 4 gate — live browser run and complete pull-request gate (#416)

Run on a343203454efeb525a42e315a7a63854c5395643 in a non-sandboxed shell (a seatbelt sandbox cannot launch Chromium; AGENTS.md).

## Browser legs
```
browser-runner.browser.test.mjs   pass 1  fail 0
frontend/desk.browser.test.mjs    pass 40 fail 0   (35.5 s)
frontend/follow-up.browser.test.mjs pass 2 fail 0  (291.9 s)
```

## Complete desk ledger, both accepted sizes
```
1280x720: ledger inventory: {'issued': 142, 'active': 123, 'retired': 19}
1280x720: ledger=142 registry=142 missing=[] extra=[]
1280x720: RUN complete-replay: node frontend/desk-behavior.replay.mjs
1280x720: complete-replay: exit 0, 771.114 s
1280x720: # executed 142 · failed 0 · deferred 0 · selected 142

1440x900: ledger inventory: {'issued': 142, 'active': 123, 'retired': 19}
1440x900: ledger=142 registry=142 missing=[] extra=[]
1440x900: RUN complete-replay: node frontend/desk-behavior.replay.mjs
1440x900: complete-replay: exit 0, 769.011 s
1440x900: # executed 142 · failed 0 · deferred 0 · selected 142
```

## Complete pull-request gate (AGENTS.md)
```
$ npm ci && npm run build
frontend/dist/assets/index-D4jJEDnC.css      492.43 kB │ gzip: 277.40 kB
frontend/dist/assets/index-CTsC7-sj.js     2,949.58 kB │ gzip: 719.64 kB
✓ built in 153ms

$ node --test 'frontend/**/*.test.js'
✔ fails closed when the built document is absent (0.57625ms)
✔ fails closed when selected missed-meal marker families are malformed (0.108625ms)
✔ failed pin preserves identity for retry and never publishes success (0.194334ms)
ℹ tests 780
ℹ pass 780
ℹ fail 0

$ uv run python -m pytest
========== 2544 passed, 1 skipped, 399 warnings in 308.02s (0:05:08) ===========

$ npx --yes @fission-ai/openspec@1 validate --all --strict
Totals: 78 passed, 0 failed (78 items)

$ python3 scripts/check_adr_numbers.py / check_owned_identifiers.py / check_public_allowlist.py
check_adr_numbers: exit 0
check_owned_identifiers: exit 0
check_public_allowlist: exit 0
```

## Drift checks
```
gen_chart_builder_fixtures --check: exit 0
check_demo_fixtures --check: exit 0
gen_qa_e2e_db --check: exit 0
gen_findings_projection_fixtures --check: exit 0
gen_ic_history_event_fixtures --check: exit 0
gen_ic_block_evidence_fixtures --check: exit 0
gen_basal_night_evidence_fixtures --check: exit 0
gen_isf_rest_window_evidence_fixtures --check: exit 0
gen_missed_meal_comparison_fixtures --check: exit 0
gen_eating_sequence_fixtures --check: exit 0
harmonic-v2.exploration --check: exit 0
diagnose-event-comparison --check: exit 0
```

## Naming boundary
```
name-boundary.sh: exit 0
```

The image package proof is not run locally; it is CI's image job on the pull request (design.md "Verification design").
