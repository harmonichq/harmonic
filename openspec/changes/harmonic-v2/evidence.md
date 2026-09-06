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
