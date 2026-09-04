# Generated facts — #277 revised plan inputs

Regenerated on this checkout after the revised plan files. Commands below are the
source of these facts; rerun them after implementation, never edit their output.

## Current report comparison contracts

```sh
sed -n '133,188p' ciq_autotune/analyzers/eating_sequences.py
sed -n '326,368p' ciq_autotune/analyzers/eating_sequences.py
sed -n '375,390p' ciq_autotune/analyzers/eating_sequences.py
```

These definitions show that both comparison wrappers already retain the two
aggregates, while the public rows serialise differences only; `empty_report` builds
comparison rows from the insufficient aggregate.

## Fixture generator and current first comparison

```sh
sed -n '20,36p' scripts/gen_eating_sequence_fixtures.py
python3 -c 'import json; r=json.load(open("frontend/__fixtures__/eating-sequence-report.json")); print(r["high_carb_sequence"]["comparisons"][0])'
```

The generator's `payload()` runs the report builder over manufactured streams, and
the first frozen comparison currently has differences but no cohort aggregates.

## Frontend precedents

```sh
rg -n 'fetchExploreTimeOfDay' frontend/data.js
sed -n '15,36p' frontend/diagnose-workstation-data.js
sed -n '19,37p' frontend/diagnose-data-age.js
sed -n '5324,5350p' frontend/index.html
sed -n '33,42p' harness/stories.js
```

`fetchExploreTimeOfDay` appears in the helper, namespace, and default export.
`recordDiagnoseAge` returns fresh payloads unchanged after deleting their stored age.
The shell loader has six inputs, so no current consumer requests eating sequences.

## Expected-diff paths

```sh
for p in openspec/changes/eating-sequence-evidence-plumbing ciq_autotune/analyzers/eating_sequences.py tests/test_eating_sequences.py frontend/__fixtures__/eating-sequence-report.json frontend/data.js frontend/diagnose-eating-sequences.js frontend/diagnose-eating-sequences.test.js frontend/diagnose-data-age.test.js; do test -e "$p" && echo "present $p" || echo "absent $p"; done
```

```text
present openspec/changes/eating-sequence-evidence-plumbing
present ciq_autotune/analyzers/eating_sequences.py
present tests/test_eating_sequences.py
present frontend/__fixtures__/eating-sequence-report.json
present frontend/data.js
absent frontend/diagnose-eating-sequences.js
absent frontend/diagnose-eating-sequences.test.js
present frontend/diagnose-data-age.test.js
```
