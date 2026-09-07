# Generated preflight evidence

Collected from the selected worktree on 2026-09-06. Commands below produced the
output verbatim. Revision and live-issue results describe the capture time,
not a promise that branch HEAD or tracker state never changes. Empty production
diff is recorded as an empty output block.
The synthetic records exercise current producers and proposed prototype inputs;
they do not establish a shipped v2 backend or an approved selection policy.

## Source revision

```sh
git rev-parse HEAD origin/main
```

```text
e9f29fb8b9e54ce96e0c1d508fbc0fe8f5937d23
b8f4a71e89be1111b71439cea4b8761fbc95c46c
```

## Plan source base

```sh
git merge-base HEAD origin/main
```

```text
b8f4a71e89be1111b71439cea4b8761fbc95c46c
```

## Production diff

```sh
git diff --stat origin/main -- ciq_autotune frontend pyproject.toml uv.lock
```

```text
```

## Live selected issue

```sh
gh issue view 348 --repo harmonichq/harmonic --json number,title,state --jq '{number,title,state}'
```

```text
{"number":348,"state":"OPEN","title":"Define Harmonic v2 product plan and end-to-end experience"}
```

## Current API routes

```sh
rg -n '@app\.(get|post)\("/api/(status|pump-settings|outcomes|verify/trials|plan|focus|diagnose/findings|timeline)' ciq_autotune/api.py
```

```text
781:    @app.get("/api/outcomes")
795:    @app.get("/api/outcomes/trend")
812:    @app.get("/api/verify/trials")
857:    @app.get("/api/diagnose/findings")
1241:    @app.get("/api/status")
1250:    @app.get("/api/pump-settings")
1286:    @app.get("/api/timeline")
1501:    @app.get("/api/plan")
1520:    @app.post("/api/plan/apply")
1535:    @app.get("/api/plan/history")
1542:    @app.get("/api/focus")
1551:    @app.post("/api/focus")
1579:    @app.post("/api/focus/{focus_id}/resolve")
```

## Declared product words

```sh
rg --sort path -n '^\*\*(Comparison support|Occurrence|Evidence tier|Plan|Trial|Focus|Maturing)|ranking-tier vocabulary' CONTEXT.md DESIGN.md
```

```text
CONTEXT.md:289:**Comparison support**:
CONTEXT.md:299:**Occurrence**:
CONTEXT.md:312:**Evidence tier**:
CONTEXT.md:616:**Trial**:
CONTEXT.md:639:**Focus**:
CONTEXT.md:653:**Focus** is pinned by hand.
CONTEXT.md:655:**Plan**:
CONTEXT.md:662:**Maturing**:
DESIGN.md:153:   look**, and **noted** are the complete ranking-tier vocabulary. **Flagged**,
```

## Executed Plan and Trial journey

```sh
node --input-type=module -e 'import fs from '"'"'node:fs'"'"';
import assert from '"'"'node:assert/strict'"'"';
import {buildDeliverable,reconcileDeliverable} from '"'"'./frontend/plan.js'"'"';
const x=JSON.parse(fs.readFileSync('"'"'mockups/harmonic-v2.exploration/setting.json'"'"','"'"'utf8'"'"'));
const plan=buildDeliverable({activeProfile:x.active_profile,acceptedItems:x.accepted_items});
for(const state of ['"'"'pending'"'"','"'"'mismatch'"'"','"'"'confirmed'"'"']){
 const result=reconcileDeliverable(plan,x.detected[state]?.segments,x.detected.captured_at,true);
 assert.equal(result.state,state);console.log(state+'"'"': '"'"'+JSON.stringify(result));
}
assert.equal(x.trials.active.selected.id,x.trials.ready.selected.id);
for(const state of ['"'"'active'"'"','"'"'ready'"'"']){
 const t=x.trials[state].selected;
 console.log(state+'"'"': '"'"'+JSON.stringify({id:t.id,readiness:t.readiness,maturing:t.maturing}));
}
'
```

```text
pending: {"state":"pending","matchedAt":null,"groups":[]}
mismatch: {"state":"mismatch","matchedAt":null,"groups":[{"start_min":180,"label":"03:00","cells":[{"param":"basal_rate","label":"Basal (U/h)","planned":0.48,"actual":0.5}]}]}
confirmed: {"state":"confirmed","matchedAt":"2024-06-13 00:00:00","groups":[]}
active: {"id":"basal_rate-03-00-20240613030000","readiness":{"label":"Maturing","message":"No verdict is ready while evidence accrues."},"maturing":{"days_elapsed":6,"days_required":14,"gap_count":0}}
ready: {"id":"basal_rate-03-00-20240613030000","readiness":{"label":"Ready to judge","message":"This Trial is ready for a before-and-Trial read."},"maturing":{"days_elapsed":15,"days_required":14,"gap_count":0}}
```

## Generated Focus periods and persisted fields

```sh
python3 -c 'import json
from pathlib import Path
x=json.loads(Path("mockups/harmonic-v2.exploration/focus.json").read_text())
print("initial action:", json.dumps({k:x["action"][k] for k in ("lever","priority","confidence")},sort_keys=True))
for name in ("before","following"):
 y=x[name];b=next(v for v in y["behaviors"] if v["lever"]==x["focus"]["lever"])
 print(name+":", json.dumps([[w["start"],w["end"],v["attributed"],v["exposure_n"]] for w,v in zip(y["windows"],b["series"])]))
print("started:",json.dumps(x["focus"],sort_keys=True))
print("resolved:",json.dumps(x["resolved_record"],sort_keys=True))
'
```

```text
initial action: {"confidence": {"confidence": 0.8, "effect": 0.5499, "hi": 0.5906, "k": 2, "lo": 0.1477, "n": 6, "rate": 0.3333, "score": 0.0812, "wide": true}, "lever": "over_treated_low", "priority": 28}
before: [["2024-04-18", "2024-05-02", 0, 0], ["2024-05-02", "2024-05-16", 0, 0], ["2024-05-16", "2024-05-30", 2, 6]]
following: [["2024-04-20", "2024-05-04", 0, 0], ["2024-05-04", "2024-05-18", 0, 0], ["2024-05-18", "2024-06-01", 2, 6], ["2024-06-01", "2024-06-15", 0, 0], ["2024-06-15", "2024-06-29", 2, 6]]
started: {"id": 1, "lever": "over_treated_low", "pinned_at": "2024-05-30 12:00:00", "status": "active"}
resolved: {"id": 1, "lever": "over_treated_low", "pinned_at": "2024-05-30 12:00:00", "status": "resolved"}
```

## Source references named by the plan

```sh
python3 -c 'from pathlib import Path
import re,subprocess
root=Path.cwd(); files=subprocess.check_output(["rg","--files","ciq_autotune","frontend","scripts","openspec"],text=True).splitlines()
by_name={}
for file in files:by_name.setdefault(Path(file).name,[]).append(file)
refs=set()
for name in ("proposal.md","design.md","journeys.md","contracts.md","predecessor.md"):
 text=(root/"openspec/changes/harmonic-v2"/name).read_text()
 for ref in re.findall(r"`([^`]+)`",text):
  first=ref.split(":")[0]
  if first.endswith((".py",".js",".html",".md")):
   found=([first] if (root/first).exists() else by_name.get(first,[]))
   refs.add((first,tuple(found)))
for ref,found in sorted(refs):print(ref+" => "+(", ".join(found) if found else "proposed or document-local reference"))
'
```

```text
CONTEXT.md => CONTEXT.md
PRODUCT.md => PRODUCT.md
analyzers/scenario/attribute.py => proposed or document-local reference
analyzers/scenario/evidence_population.py => proposed or document-local reference
analyzers/scenario/levers.py => proposed or document-local reference
analyzers/scenario/payload.py => proposed or document-local reference
analyzers/scenario/priority.py => proposed or document-local reference
api.py => ciq_autotune/api.py
ciq_autotune/api.py => ciq_autotune/api.py
ciq_autotune/event_comparison.py => ciq_autotune/event_comparison.py
ciq_autotune/finding_case_file.py => ciq_autotune/finding_case_file.py
design.md => design.md
findings_projection.py => ciq_autotune/findings_projection.py
frontend/data.js => frontend/data.js
frontend/day-chart.js => frontend/day-chart.js
frontend/diagnose-event-comparison.js => frontend/diagnose-event-comparison.js
frontend/index.html => frontend/index.html
frontend/plan.js => frontend/plan.js
frontend/tab-routing.js => frontend/tab-routing.js
mockups/cockpit-shell.behavior.md => mockups/cockpit-shell.behavior.md
mockups/finding-evidence-routing.behavior.md => mockups/finding-evidence-routing.behavior.md
mockups/harmonic-v2-review.html => mockups/harmonic-v2-review.html
mockups/harmonic-v2.exploration/BRIEF.md => mockups/harmonic-v2.exploration/BRIEF.md
mockups/harmonic-v2.exploration/REVIEW.md => mockups/harmonic-v2.exploration/REVIEW.md
scripts/gen_qa_e2e_db.py => scripts/gen_qa_e2e_db.py
scripts/qa_e2e_cases.py => scripts/qa_e2e_cases.py
store.py => ciq_autotune/store.py
tests/test_api.py => tests/test_api.py
tests/test_outcomes_trend.py => tests/test_outcomes_trend.py
tests/test_watched_change.py => tests/test_watched_change.py
watched_change.py => ciq_autotune/watched_change.py
```

## Exact review clocks and alternative Focus preemption

```sh
python3 -c 'import json
s=json.load(open("mockups/harmonic-v2.exploration/setting.json")); f=json.load(open("mockups/harmonic-v2.exploration/focus.json"))
print("setting review clocks:",json.dumps(s["reviewed_at"],sort_keys=True))
print("Focus review clocks:",json.dumps(f["reviewed_at"],sort_keys=True))
p=f["preempted"]
assert p["active"]["kind"]=="trial" and p["focus_record"]["status"]=="dropped"
assert p["focus_record"]["id"]==f["focus"]["id"]
print("alternative preemption:",json.dumps({"reviewed_at":p["reviewed_at"],"focus":p["focus_record"],"active":p["active"],"selected_id":p["review"]["selected"]["id"]},sort_keys=True))
'
```

```text
setting review clocks: {"active": "2024-06-18 12:00:00", "ready": "2024-06-28 12:00:00"}
Focus review clocks: {"before": "2024-05-30 12:00:00", "following": "2024-06-29 12:00:00"}
alternative preemption: {"active": {"after": 45.0, "before": 40.0, "changed_at": "2024-06-30 12:00:00", "deliberate": false, "kind": "trial", "maturing": {"days_elapsed": 0, "days_required": 14, "is_maturing": true}, "parameter": "isf", "slot": null, "target_metrics": ["tir"]}, "focus": {"id": 1, "lever": "over_treated_low", "pinned_at": "2024-05-30 12:00:00", "status": "dropped"}, "reviewed_at": "2024-07-01 12:00:00", "selected_id": "isf-all-20240630120000"}
```


## ADR 383 policy replay

Executed September 7, 2026 at source
`cfc3e9e36ca3ad17c2318051ab643c34469b26a7` on
`codex/383-v2-priority-selection`. The exact worktree's Codebase Memory project
`cbm-onboard-v1-c095617f2652fba5263860fb54abb5f03b6bb2f8801c9b99f04bc7f7df494f61`
was ready. Graph discovery and source snippets preceded manual source reading;
coverage explicitly excluded `scripts/`. A create/remove probe confirmed write
access in this worktree. Worker telemetry claim
`01a07a69-0c33-76a3-8ed6-c55e8825898a`, start/worker/codex, persisted after the
sandboxed claims-file write was denied.

All instruments, complete producer JSON, and untouched stdout/stderr receipts
remain in `/private/tmp/harmonic-383-start-20260907/worker/`. No program, database,
fixture or generator was committed. No server or vendor fetch ran.

### Executed path and scope

Each committed case was materialized through `materialize_case` into its own
fresh throwaway Store, closed, reopened with `Store.open_readonly`, and executed
through `execute_case`. The complete `assert_expectation` ran for each of the
15 selected committed cases. This covers analyzer, support, queue, history,
behavioral and verdict expectations, not just the displayed row. Temporary
stores were removed; all five serialized result sections were retained locally.

The first 12 cases cover the supported setting, overlapping findings, thin and
held settings, quiet, direction-only ISF, changed setting action, recurring-low
seriousness and observation-only advice. The next three locate a supported
habit under its actual admission rules: over-treated-low at 28 and carb-undercount
at 22 do not clear the existing active threshold; correction-on-active-insulin
at 38 does. Stacking stays low-confidence. No entire-catalog pass was run.

Two bounded source variants supply missing simultaneous candidates. Each
materializes the named basal recipe and then `behavioral-correction-on-iob` into
one synthetic Store and executes the same full producer path. These are fresh
analyzer outputs, not copied queue rows or pooled counts. `mixed-supported`
produces basal 97 and habit 38; `mixed-held` produces seven-night unstaged basal
and habit 38. They have no committed combined expectation and are checked by
explicit policy-result assertions instead. Their overlapping populations retain
the producer's ownership and verdicts.

The disposable policy interpreter consumes those producer results. Only its
preference, active-watch and tie inputs are deliberately varied. The two active
objects are illustrative existing-owner inputs, not a claim of exercising Trial
detection, Focus persistence or the future finished-watch authority. The tie
changes candidate Priority to 38 explicitly; it is not represented as a newly
analyzed clinical result. No committed case supplies v2 preference persistence,
so routine refresh, Set aside and Restore exercise an in-memory preference.

This is a scoped policy replay, not production API or durable-storage proof. Its
setting samples use basal instructions with exact delivered values; full schedule
canonicalization, I:C block regrouping and delivered-precision boundary tests
remain obligations of the eventual implementation. Habit seriousness uses the
existing `finding_severity` on the captured score, away from its cutoffs; the
production contract requires the owner's pre-rounding `Confidence.severity`.
The replay neither implements nor validates a new clinical classifier.

### Exact commands

Run from `/Users/connor/worktrees/harmonic/383` with the preserved scratch files:

```sh
/opt/homebrew/bin/python3.14 /private/tmp/harmonic-383-start-20260907/worker/capture.py > /private/tmp/harmonic-383-start-20260907/worker/capture.stdout 2> /private/tmp/harmonic-383-start-20260907/worker/capture.stderr
/opt/homebrew/bin/python3.14 /private/tmp/harmonic-383-start-20260907/worker/capture-habits.py > /private/tmp/harmonic-383-start-20260907/worker/capture-habits.stdout 2> /private/tmp/harmonic-383-start-20260907/worker/capture-habits.stderr
/opt/homebrew/bin/python3.14 /private/tmp/harmonic-383-start-20260907/worker/capture-mixed.py > /private/tmp/harmonic-383-start-20260907/worker/capture-mixed.stdout 2> /private/tmp/harmonic-383-start-20260907/worker/capture-mixed.stderr
/opt/homebrew/bin/python3.14 /private/tmp/harmonic-383-start-20260907/worker/replay.py > /private/tmp/harmonic-383-start-20260907/worker/replay.stdout 2> /private/tmp/harmonic-383-start-20260907/worker/replay.stderr
/opt/homebrew/bin/python3.14 /private/tmp/harmonic-383-start-20260907/worker/summary.py > /private/tmp/harmonic-383-start-20260907/worker/summary.stdout 2> /private/tmp/harmonic-383-start-20260907/worker/summary.stderr
```

All five commands exited 0. Their stderr files are empty. The byte-complete
summary stdout follows; it is a deterministic rendering of the complete replay
receipt, whose per-case entries also retain action signatures, source evidence,
separate population verdicts, preference baselines, active inputs and reasons.

```text
CASE setting-recommendation PASS
CASE behavioral-over-treated-low PASS
CASE behavioral-late-bolus PASS
CASE behavioral-precedence PASS
CASE basal-insufficient-seven-night PASS
CASE basal-no-change PASS
CASE ic-held PASS
CASE isf-direction-only-weaken PASS
CASE basal-raise PASS
CASE basal-lower PASS
CASE basal-recurring-low-lower PASS
CASE behavioral-meal-bolus-short PASS
CASE behavioral-correction-on-iob PASS
CASE behavioral-correction-stacking PASS
CASE behavioral-carb-undercount PASS
VARIANT mixed-supported recipes=basal-lower,behavioral-correction-on-iob
VARIANT mixed-held recipes=basal-insufficient-seven-night,behavioral-correction-on-iob
setting-recommendation | setting:basal_rate priority=54 admitted=True seriousness=ordinary | eligible_action | setting:basal_rate
behavioral-over-treated-low | habit:over_treated_low priority=28 admitted=False seriousness=low; habit:correction_on_iob priority=None admitted=False seriousness=info | guided_investigation | habit:over_treated_low
behavioral-late-bolus | habit:late_bolus priority=0 admitted=False seriousness=info; habit:carb_undercount priority=None admitted=False seriousness=info | guided_investigation | habit:late_bolus
behavioral-precedence | habit:over_treated_low priority=22 admitted=False seriousness=low; habit:carb_undercount priority=None admitted=False seriousness=info; habit:correction_on_iob priority=None admitted=False seriousness=info | guided_investigation | habit:over_treated_low
basal-insufficient-seven-night | setting:basal_rate priority=0 admitted=False seriousness=ordinary | guided_investigation | setting:basal_rate
basal-no-change |  | quiet | None
ic-held | setting:carb_ratio priority=0 admitted=False seriousness=ordinary | guided_investigation | setting:carb_ratio
isf-direction-only-weaken | setting:isf priority=0 admitted=False seriousness=ordinary | guided_investigation | setting:isf
basal-raise | setting:basal_rate priority=96 admitted=True seriousness=ordinary | eligible_action | setting:basal_rate
basal-lower | setting:basal_rate priority=97 admitted=True seriousness=ordinary | eligible_action | setting:basal_rate
basal-recurring-low-lower | setting:basal_rate priority=97 admitted=True seriousness=recurring-low | eligible_action | setting:basal_rate
behavioral-meal-bolus-short | habit:meal_bolus_short priority=47 admitted=False seriousness=medium; habit:missed_meal priority=None admitted=False seriousness=info | guided_investigation | habit:meal_bolus_short
behavioral-correction-on-iob | habit:correction_on_iob priority=38 admitted=True seriousness=medium; habit:over_treated_low priority=15 admitted=False seriousness=info | eligible_action | habit:correction_on_iob
behavioral-correction-stacking | habit:correction_stacking priority=16 admitted=False seriousness=info; habit:missed_meal priority=None admitted=False seriousness=info | guided_investigation | habit:correction_stacking
behavioral-carb-undercount | habit:carb_undercount priority=22 admitted=False seriousness=low; habit:late_bolus priority=None admitted=False seriousness=info | guided_investigation | habit:carb_undercount
mixed-supported | setting:basal_rate priority=97 admitted=True seriousness=ordinary; habit:correction_on_iob priority=38 admitted=True seriousness=medium; habit:over_treated_low priority=15 admitted=False seriousness=info | eligible_action | setting:basal_rate
mixed-held | setting:basal_rate priority=0 admitted=False seriousness=ordinary; habit:correction_on_iob priority=38 admitted=True seriousness=medium; habit:over_treated_low priority=15 admitted=False seriousness=info | eligible_action | habit:correction_on_iob
set-aside-setting-next-habit | setting:basal_rate priority=97 admitted=True seriousness=ordinary; habit:correction_on_iob priority=38 admitted=True seriousness=medium; habit:over_treated_low priority=15 admitted=False seriousness=info | eligible_action | habit:correction_on_iob
restore-setting | setting:basal_rate priority=97 admitted=True seriousness=ordinary; habit:correction_on_iob priority=38 admitted=True seriousness=medium; habit:over_treated_low priority=15 admitted=False seriousness=info | eligible_action | setting:basal_rate
routine-refresh-setting-recommendation | setting:basal_rate priority=54 admitted=True seriousness=ordinary | quiet | None
restore-setting-recommendation | setting:basal_rate priority=54 admitted=True seriousness=ordinary | eligible_action | setting:basal_rate
routine-refresh-behavioral-correction-on-iob | habit:correction_on_iob priority=38 admitted=True seriousness=medium; habit:over_treated_low priority=15 admitted=False seriousness=info | quiet | None
restore-behavioral-correction-on-iob | habit:correction_on_iob priority=38 admitted=True seriousness=medium; habit:over_treated_low priority=15 admitted=False seriousness=info | eligible_action | habit:correction_on_iob
routine-refresh-behavioral-late-bolus | habit:late_bolus priority=0 admitted=False seriousness=info; habit:carb_undercount priority=None admitted=False seriousness=info | quiet | None
restore-behavioral-late-bolus | habit:late_bolus priority=0 admitted=False seriousness=info; habit:carb_undercount priority=None admitted=False seriousness=info | guided_investigation | habit:late_bolus
action-return | setting:basal_rate priority=96 admitted=True seriousness=ordinary | eligible_action | setting:basal_rate
RETURN {"setting:basal_rate": [{"action_changed": {"before": {"180": {"direction": "lower", "end_min": 210, "recommended": 0.54}}, "now": {"180": {"direction": "raise", "end_min": 210, "recommended": 0.66}}}}]}
seriousness-return | setting:basal_rate priority=97 admitted=True seriousness=recurring-low | eligible_action | setting:basal_rate
RETURN {"setting:basal_rate": [{"seriousness_changed": ["ordinary", "recurring-low"]}]}
investigation-to-action | setting:basal_rate priority=97 admitted=True seriousness=ordinary | eligible_action | setting:basal_rate
RETURN {"setting:basal_rate": [{"action_changed": {"before": {}, "now": {"180": {"direction": "lower", "end_min": 210, "recommended": 0.54}}}}]}
active-trial | setting:basal_rate priority=97 admitted=True seriousness=ordinary; habit:correction_on_iob priority=38 admitted=True seriousness=medium; habit:over_treated_low priority=15 admitted=False seriousness=info | active_change | scratch-trial
active-focus | setting:basal_rate priority=97 admitted=True seriousness=ordinary; habit:correction_on_iob priority=38 admitted=True seriousness=medium; habit:over_treated_low priority=15 admitted=False seriousness=info | active_change | scratch-focus
explicit-priority-tie | setting:basal_rate priority=38 admitted=True seriousness=ordinary; habit:correction_on_iob priority=38 admitted=True seriousness=medium; habit:over_treated_low priority=15 admitted=False seriousness=info | eligible_action | habit:correction_on_iob
PASS: 31 policy replays; every selection repeated with reversed candidate order.
```

The first interpreter run failed the direction-only ISF assertion: it looked for
direction at the segment root instead of the analyzer's `evidence.direction`.
The corrected interpreter passed all 31 selections, each also repeated with the
candidate list reversed. The initial failed stdout/stderr are preserved as
`replay-first.stdout` and `replay-first.stderr`; no production code was changed.

### Actual evidence and reasoning

* `setting-recommendation` stages two basal members, 03:00 and 03:30, from 0.60
  to 0.48 U/h, each with 12 steady nights. Its variable Priority is 54.
* `basal-insufficient-seven-night` reports seven nights, recommendation 0.48,
  `asserts_move: false`, and `insufficient evidence`. Its empty global queue is
  not proof of quiet. `ic-held` retains eight runs, current/recommended 10,
  measured 8 and `pre-empted low; held at current`. Both lead only investigation.
* `isf-direction-only-weaken` reports current 40, no recommendation and
  `asserts_move: false`, with `evidence.direction: weaken`. Its 29 fasting nights
  and asserting queue register cannot supply a stageable dose.
* `behavioral-correction-on-iob` has a surfaced Pattern, Priority 38 and its own
  2-of-5 low recurrence. Its verdict band retains 2 fired, 1 outranked, 1 near
  miss, 0 no-data and 1 clean. The other over-treated-low claim remains separate.
  Its `wide: true` stays visible; the engine's surfaced/low-confidence admission
  is not replaced by a new wide gate.
* `behavioral-meal-bolus-short` is Priority 47 with 2-of-4 policy meal recurrence,
  while its high-event verdict denominator is six. It remains observation-only.
  Neither these denominators nor those of overlapping findings were combined.

The late-bolus result is low-confidence at Priority 0 and remains investigation,
with no recommendation string copied into the returned action. Quiet is exercised
by `basal-no-change`, whose 30-night target estimate equals current 0.60 and does
not stage; absent evidence elsewhere remains unknown. The whole-day projection's
asserting-only filter is confirmed by `FindingsProjection._parameter_rows`.

The isolated seriousness return changes basal's existing safety status from
`lower` to `lower (recurring lows)` while Priority (97), recommendation (0.54),
direction and 30-night support remain identical. The actual analyzer harm verdict
changes. The action-return pair changes the same basal subject from lower 0.54
to raise 0.66. These are separate generated cases used as before/after inputs,
not a claim of observing longitudinal treatment response.

### Documentation checks

The required `npx --yes @fission-ai/openspec@1 validate --all --strict` first
failed on sandboxed npm-cache access. The same command ran successfully with
escalation; the alternate global OpenSpec command was not used. The modern
runtime substitution is explicit: every `python3` leg ran as
`/opt/homebrew/bin/python3.14` (no dependency installation was needed).

```sh
npx --yes @fission-ai/openspec@1 validate --all --strict
/opt/homebrew/bin/python3.14 scripts/check_adr_numbers.py
/opt/homebrew/bin/python3.14 scripts/check_owned_identifiers.py
/opt/homebrew/bin/python3.14 scripts/check_public_allowlist.py
```

OpenSpec retry stdout, verbatim:

```text
✓ change/adopt-frontend-build-tooling
✓ change/announced-meal-low-ownership
✓ spec/backtest
✓ change/basal-night-drill
✓ change/basal-slot-head-state
✓ spec/basal-suggestion
✓ spec/behavioral-layer
✓ change/by-event-window-membership
✓ change/canvas-anchor-depth
✓ change/canvas-tile-controls
✓ change/chrome-bar-signal
✓ change/chrome-bar-surface-states
✓ change/clean-browser-paths
✓ change/clock-window-crosses-midnight
✓ spec/credentials
✓ spec/data-ingest
✓ change/decision-record-home
✓ change/diagnose-align-hidden-render
✓ change/diagnose-align-inspector-edge
✓ change/diagnose-behavior-ledger-parity
✓ change/diagnose-evidence-canvas
✓ change/diagnose-finding-case-files
✓ change/diagnose-history-event-internals
✓ change/diagnose-occurrence-roster-keys
✓ change/diagnose-occurrence-selection-focus
✓ change/dose-stamped-information-findings
✓ change/durable-diagnose-artifact-store
✓ spec/eating-sequences
✓ change/estimator-admission-bars
✓ change/event-chart-baseline-populations
✓ change/event-chart-discovery
✓ change/explore-history-range
✓ change/fast-gate-scratch-race
✓ change/fetch-invalidates-on-committed-write
✓ change/filter-unrelated-basal-findings
✓ change/finding-chip-sift
✓ change/finding-evidence-routing
✓ change/fullscreen-chart-containment
✓ change/fuzzy-cross-block-credit
✓ change/harmonic-v2
✓ change/highs-attribution-account
✓ change/hoist-meal-suspend-ownership
✓ spec/http-api
✓ change/ic-dose-stamped-anchor
✓ change/ic-trial-acceptance
✓ spec/insulin-reconstruction
✓ change/isf-detail-verdict
✓ change/isf-direction-only-ranking
✓ change/isf-staging-predicate
✓ change/light-ground-bone
✓ change/meal-bolus-denominator
✓ change/missed-meal-comparison
✓ spec/outcomes
✓ change/over-treated-low-verdict-band
✓ change/pane-header-single-seam
✓ spec/parameter-analysis
✓ change/persist-diagnose-derivations
✓ spec/plan
✓ change/preserve-diagnose-theme-context
✓ spec/qa-e2e-database
✓ change/retire-legacy-basal-ribbon
✓ change/retire-legacy-occurrences-popup
✓ change/retire-staging-entry-rule
✓ spec/safety
✓ change/scoped-finding-occurrence-membership
✓ change/simplify-event-comparison-support-copy
✓ change/stabilize-pending-root-probe
✓ change/steady-data-case-file-wording
✓ spec/surfaces
✓ change/unified-browser-exposure-population
✓ change/url-state-contract
✓ change/verify-attribution-uncertainty
✓ change/vite-frontend-foundation
✓ change/watching-chart-seating-regression
Totals: 74 passed, 0 failed (74 items)
```

OpenSpec retry stderr, verbatim:

```text
- Validating...
```

The three guard stdout streams, in command order, verbatim:

```text
check-adr: 147 ADRs in 83 design.md files, all identities unique and issue-keyed.
check-owned-identifiers: 30 owned-identifier rules passed.
check-public-allowlist: 407 tracked file(s) cleared to ship, 1744 excluded. Every tracked path dispositioned.
```

Their stderr streams are empty. Each command exited 0. The final worker checks
repeat these same commands after this evidence text is written, with receipts
named `final-*.stdout` and `final-*.stderr` in the scratch directory. Independent
review and the parent task's completion remain coordinator-owned.

### Untouched receipt manifest

SHA-256 values below identify the complete local raw receipts, including the
failed first replay and initial sandbox failures. These files are not excerpts.

```text
8c3b4791d62b3322d50e52c879b0eb8b30d9e817778636dfd8d2e7523e35aaf5  capture.stdout
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  capture.stderr
8d62f21f87a4a7c27e5d5b330023ca488e77019c0a36c3ee9142bbe8f74e2b0e  capture-habits.stdout
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  capture-habits.stderr
b2e924792b9e122833a93c026395161e8e3fc53913b2bd5b7ec5d26daf887673  capture-mixed.stdout
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  capture-mixed.stderr
6d9323faae10a8d1293fa2c5894de090cc61ea8d66b841a1bc763ce5145b82cd  replay.stdout
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  replay.stderr
3f1012fa8021b7f4e6e41a21526d0eb6221987a987d0a937428af7beb7291e5c  replay-first.stdout
280275a6c28d3945dc015293421d0ceeaa51aa847d04728704e73d53717277fd  replay-first.stderr
a5926760d988983e512674d3655dac25c1956406778d9f9a2551af740388badf  summary.stdout
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  summary.stderr
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  openspec.stdout
6425870737ae44f95ad74fa885f9576f3c981074d7180f148d46d6d59c3a7e05  openspec.stderr
20f5ac57e6f5385d59edeba46df9928ab7e80468741aabbc2a95ee27ef10d246  openspec-retry.stdout
5bc31df123a2e521acdd2c0d9477b367feec506471a91065d0a6b32c09089ed5  openspec-retry.stderr
d94a9f0ecb8c41da74e11fd0fb537427faa4a446a99c47f2b48f6a0ab8ce79e9  adr.stdout
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  adr.stderr
58a8b6e496e8fc442a317c3a1abd7c26cfbbcf4a0f3e2cf52a486792e44a4b4f  identifiers.stdout
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  identifiers.stderr
407e17c9aed4faec1cd169165ba5b60be6204a22a2eb26ea6bcbddf026b983c9  allowlist.stdout
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  allowlist.stderr
2b90f77e85e7765b00331a4ba372d86c7b85a3e1e64217376f71b6993062e316  claim.stdout
3a63d8839b9e8374d29eb0c7ca1b80ab7b0ce623c28a6829c3783b46151d8496  claim.stderr
5558bdabcf0884db69f9385f17609a2df644c11d6e29a678506cf6541dfd1074  claim-retry.stdout
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  claim-retry.stderr
```


## ADR 383 verified completion

Independent full-depth Standards and Spec reviews converged with zero findings
on `a6ea888f8f9d51e4707f85847fc76acdc3c5a1c9`. Coverage comprised 17 Standards
rules, six selected tasks, four Requirements and ten scenarios, with applicable
risk entries satisfied at investigation scope. Both reviews used the
operator-selected `gpt-6-astra` at medium effort; the coordinator verified the
actual routing. This is not a benchmark ranking claim.

The coordinator independently reproduced the replay and summary byte-for-byte,
passed the four locked documentation gates, and posted and read back the
[verified tracker result](https://github.com/harmonichq/harmonic/issues/383#issuecomment-5565889507).
The verified verdict remains at
`/private/tmp/harmonic-383-start-20260907/review/round-1/verified-verdict.json`.
That result authorizes ticking parent task 2.1.

The final bookkeeping diff changes only ADR 383's status, that checkbox and this
receipt. Policy version `383:1`, substantive policy and all earlier receipts are
unchanged. No synthetic replay rerun is required for these bookkeeping edits;
no implementation, production assurance or downstream admission is claimed.

Verification of this bookkeeping diff uses the four locked documentation gates:
`npx --yes @fission-ai/openspec@1 validate --all --strict` and the ADR, owned
identifier and public allowlist scripts, each run with
`/opt/homebrew/bin/python3.14`. Full stdout/stderr and exact argv/exit records
are preserved separately in
`/private/tmp/harmonic-383-start-20260907/worker/completion/`. The worker leaves
the completion diff uncommitted for the coordinator's mechanical commit.

## ADR 384 integration verification

The final serial chunk ran the complete repository verification against the
integrated guidance implementation. The first run demonstrated four stale,
generator-owned synthetic artifacts; they were regenerated only through their
committed producers: the QA E2E database, I:C blocks, chart-builder analysis and
episode inputs, and the findings projection. Each corresponding `--check` then
passed. No clinical classifier, support floor, score, Priority, or policy was
changed.

The new `scripts/check_guidance_plan_contract.mjs` executes Python's public
accepted-pick rounding alongside the public Plan functions. Its verbatim stdout
was:

```text
guidance Plan contract: PASS
```

It covers basal-rate, ISF and carb-ratio positive-half rounding, a one-slot
basal instruction that restores at the next 30-minute boundary, and a complete
I:C block that retains every member and its Plan provenance. The backend job
runs the same driver after pytest.

The completed commands exited 0: `npm ci`; `npm run build`; `uv run python -m
pytest` (2,260 collected); `node --test 'frontend/**/*.test.js'` (623 passed);
strict OpenSpec validation (74 passed); all three repository policy guards; the
new Plan parity driver; all backend and frontend generator drift checks; the
materialized public-tree build, link check and contamination scan; and all ten
browser gates. The browser gates ran only through the permitted no-fetch server
against a temporary copy of `mockups/qa-e2e.synthetic/harmonic.sqlite`; no live
fetch or real database was opened.

The materialized public-tree scan reported 412 files scanned, 22 stamped, seven
pinned, and zero findings. Browser receipts include the Day, Diagnose
workstation/canvas, cockpit, runner lifecycle, first-plan reconciliation,
workstation behavior, event-comparison behavior/support, and Verify replay legs.

Limitation: the Docker runtime-image build and smoke check could not run locally:
`docker` is not installed on this host (`zsh:1: command not found: docker`). No
installation or substitute image build was attempted. CI remains the required
package-runtime proof for that leg.
