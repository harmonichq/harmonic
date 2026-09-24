# Generated preflight evidence

Collected from the selected worktree on 2026-09-06. Commands below produced the
output verbatim. Revision and live-issue results describe the capture time,
not a promise that branch HEAD or tracker state never changes. Empty production
diff is recorded as an empty output block.
The synthetic records exercise current producers and proposed prototype inputs;
they do not establish a shipped v2 backend or an approved selection policy.

## #393 calibration

This implementation replay used only generator-owned synthetic `QaCase` stores.
No patient records, snapshot rows, or per-day receipts enter the test or this
evidence. The #391 aggregate-only 90-day receipt supplied these inputs: highs
after meals 49/512 (0.095703), lows after meals 42/512 (0.082031), highs after
treating lows 20/101 (0.198020), and lows after correcting highs 4/215
(0.018605). Applying the receipt's Wilson positive-lower-bound calibration,
with its 12-opportunity minimum, yields gates **12, 12, 12, and 27** in that
order. Overnight has no aggregate rate: its denominator is the new
`harm_band_source_nights` producer and uses the same 12-opportunity floor.

The contention rule is exact: contention exists only when the admitted habit's
Confidence interval `[lo, hi]` intersects the staged setting owner's
recurrence-channel `[lo, hi]`. Inside that band the staged setting leads;
outside it the greatest existing Priority leads; an exact Priority tie retains
canonical-subject order; and withheld bounds mean no contention. The synthetic
`pattern-near-tie` receipt exercises the non-contention branch (the staged
overnight setting has withheld bounds), selecting
`pattern:highs_after_meals`; the non-overlapping variant in
`tests/test_pattern_policy.py` selects the greater-Priority habit. The overlap
variant there selects the staged setting. These cases retain the owner-produced
intervals and never derive an interval from a pattern rate.

The 12-night overnight floor is therefore an evidence-readiness floor, not a
basal classifier, staging, or support-floor change. The replay's synthetic thin
outcomes are literal QA expectations: the 6-meal carb-undercount case is
withheld; `pattern-near-tie` is withheld at 3 meals while preserving its
admitted action; `pattern-collapse` is withheld at 6 lows while preserving the
single admitted habit and backend collapse verdict; the 7-night basal case does
not stage; and the 30-source-night overnight cases are ready. These prove that
readiness neither erases readable evidence nor manufactures an action.

`tests/test_pattern_replay.py` materializes each of the 45 catalog cases once,
then reuses that store through `execute_case`, the prepared Findings projection,
`build_guidance`, and `follow_up_admission`. Its literal roster comparison fails
closed for a missing or changed member, rate/denominator, admission, action,
seriousness, fingerprint, near-tie, collapse, pattern readiness, Focus admission
shape, or Trial-XOR-Focus admission state. Migration is separately pinned through
the API-startup path in `tests/test_guidance_preferences.py` and
`tests/test_guidance_api.py`.

### #393 terminology inventory

At the c4 base, `git grep -i -n -P '\bpatterns?\b' -- ':!node_modules/**'
':!dist/**'` returned **915** tracked-file hits. Their disposition is closed:

| Hit class | Disposition |
| --- | --- |
| ADRs, OpenSpec, scope history, comments, labels, and glossary prose | terminology-only; retain historical or qualified lever-pattern sense |
| Scenario producer/API `patterns` and `low_confidence`, findings projection, case files, guidance, Store migration, and watched-change identities | payload compatibility; the existing serialized lever-pattern family remains intact beside `outcome_patterns` |
| Synthetic generators, fixtures, fixture-only mirror, frontend consumers, browser replays, and their tests | payload compatibility; ADR 735 mirror parity remains binding |
| `pattern_sweep.py` and candidate-sweep references | terminology-only public wording; the internal module name remains compatible |

No payload key was renamed by this inventory. The new cross-member unit is
published only as `outcome_patterns`; existing `patterns` and `low_confidence`
remain the serialized lever-pattern family.

## #391 snapshot pass (aggregates only)

The coordinator alone obtained each WAL-safe snapshot, opened it with
`Store.open_readonly`, ran the uncommitted program at 30 and 90 days, and
deleted the snapshot on both hosts. The worker received only the two aggregate
JSON objects. The program remains uncommitted in the coordinator's session
scratch and was returned verbatim in the worker handback.

Each requested trailing window ends inclusively at the latest basal or CGM
event. `analyze` supplies setting rows and the setting prices built from
`_impact_factor`; `build_exposures` and `build_scenarios` supply the exposure and
scenario inputs; `tally_attributions` supplies Exposure counts;
`build_opportunities` supplies the identity-bearing populations;
`compute_clean_rates` is a consistency check of a pure function over the tally
and cannot fire independently; the `recurrence_count` comparison is the
independent check that the ordinary `meal_over_delivery` recurrence population
equals the `MEALS` attribution tally. `guidance.candidates` with
`build_guidance` supplies Priority and admission.

A pattern numerator counts distinct `(driver family, recurrence identity)`
members drawn only from the pattern's `rate_levers` subset. It does not pool
member populations, clamp a numerator, or mix currencies; `k > n` exits
nonzero. `weighted` and `worst_member` use habit members only. Every setting
keeps its own owner-produced price and staging admission. Lows after meals uses
the ordinary `MEALS` recurrence population for `meal_over_delivery`, so its `n`
equals the meals tally by construction in both windows.

The closed schema has `additionalProperties: false` at every object level. Both
coordinator-returned objects passed the schema and relational checks. The
checker output was:

```text
valid sample: accepted
missing rate_levers: rejected
top-level ISO timestamp: rejected
per-day array: rejected
free-text note: rejected
nested member field: rejected
unknown source window: rejected
extra overlap field: rejected
free-text overlap reason: rejected
forced k > n: rejected
report CLI schema validation: accepted
Wilson lower bound zero clamp: -0.0 absent
rate_levers roster: accepted
QA parity behavioral-correction-on-iob: literal expectation k=2; owner-produced price=38 (QaExpectation has no Priority field)
90-day synthetic store window tally: 30d meals n=3; 90d meals n=4
habit-only alternatives: setting price 99 excluded; weighted=10; worst_member=10
```

These sixteen lines are literal output from the current checker. The
30-versus-90 tally comes from one manufactured Store.
`behavioral-correction-on-iob` contributes literal `k = 2` from
`QaExpectation`; its price 38 comes from the owner producer because
`QaExpectation` carries no Priority field. The setting-exclusion proof injects
a price of 99 and confirms that neither habit alternative consumes it.

### 30-day receipt

| Pattern | `rate_levers` | n / denominator / producer | Rate [Wilson lo, hi] | Settled / weighted / worst-member | Admission route | Collapse |
| --- | --- | --- | --- | --- | --- | --- |
| Highs after meals | `habit:carb_undercount`, `habit:late_bolus` | 181 / `meals` / `tally_attributions` | 0.099448 [0.074443, 0.131657] | 0 / 10 / 16 | `none` | `remain_pattern_by_rule` |
| Lows after meals | `habit:meal_over_delivery` | 181 / `meals` / `tally_attributions_meals_via_meal_over_delivery_ordinary_policy` | 0.055249 [0.037217, 0.08128] | 0 / 8 / 8 | `none` | `remain_pattern_by_rule` |
| Highs after treating lows | `habit:over_treated_low` | 27 / `lows` / `tally_attributions` | 0.185185 [0.108482, 0.297995] | 0 / 19 / 19 | `none` | `remain_pattern_observed` |
| Lows after correcting highs | `habit:correction_stacking` | 66 / `correction_clusters` / `tally_attributions` | 0.0 [0.0, 0.024282] | 0 / 6 / 12 | `none` | `remain_pattern_by_rule` |
| Overnight lows with no insulin on board | `setting:basal_rate` | 0 / `nights` / `basal_recurrence_channel` stand-in | null [null, null] | 0 / 0 / 0 | `none` | `remain_pattern_by_rule` |

| Pattern | Member subject / kind | k / denominator / source window / k producer | Price / price producer / admission / admission producer |
| --- | --- | --- | --- |
| Highs after meals | `habit:carb_undercount` / `habit` | 12 / `meals` / `scenario_request_window` / `tally_attributions.attributed_occurrences` | 16 / `guidance.candidates` / `not_admitted` / `build_guidance` |
| Highs after meals | `habit:late_bolus` / `habit` | 6 / `meals` / `scenario_request_window` / `tally_attributions.attributed_occurrences` | 5 / `guidance.candidates` / `not_admitted` / `build_guidance` |
| Highs after meals | `setting:carb_ratio` / `setting` | 0 / `unavailable` / `fixed_90_day_block_window` / `analyze.tuning_levers.recurrence_channel` | 0 / `analyze.tuning_levers._impact_factor` / `not_admitted` / `build_guidance` |
| Lows after meals | `habit:meal_over_delivery` / `habit` | 10 / `meals` / `scenario_request_window` / `tally_attributions.attributed_occurrences` | 8 / `guidance.candidates` / `not_admitted` / `build_guidance` |
| Lows after meals | `setting:carb_ratio` / `setting` | 0 / `unavailable` / `fixed_90_day_block_window` / `analyze.tuning_levers.recurrence_channel` | 0 / `analyze.tuning_levers._impact_factor` / `not_admitted` / `build_guidance` |
| Highs after treating lows | `habit:over_treated_low` / `habit` | 5 / `lows` / `scenario_request_window` / `tally_attributions.attributed_occurrences` | 19 / `guidance.candidates` / `not_admitted` / `build_guidance` |
| Lows after correcting highs | `habit:correction_stacking` / `habit` | 0 / `correction_clusters` / `scenario_request_window` / `tally_attributions.attributed_occurrences` | 0 / `guidance.candidates` / `not_admitted` / `build_guidance` |
| Lows after correcting highs | `habit:correction_on_iob` / `habit` | 2 / `lows` / `scenario_request_window` / `tally_attributions.attributed_occurrences` | 12 / `guidance.candidates` / `not_admitted` / `build_guidance` |
| Lows after correcting highs | `setting:isf` / `setting` | 5 / `days` / `analysis_request_window` / `analyze.tuning_levers.recurrence_channel` | 29 / `analyze.tuning_levers._impact_factor` / `not_admitted` / `build_guidance` |
| Overnight lows with no insulin on board | `setting:basal_rate` / `setting` | 0 / `nights` / `analysis_request_window` / `BasalHarm.nights` | 0 / `analyze.tuning_levers._impact_factor` / `not_admitted` / `build_guidance` |

### 90-day receipt

| Pattern | `rate_levers` | n / denominator / producer | Rate [Wilson lo, hi] | Settled / weighted / worst-member | Admission route | Collapse |
| --- | --- | --- | --- | --- | --- | --- |
| Highs after meals | `habit:carb_undercount`, `habit:late_bolus` | 512 / `meals` / `tally_attributions` | 0.095703 [0.08031, 0.113682] | 0 / 12 / 18 | `none` | `remain_pattern_by_rule` |
| Lows after meals | `habit:meal_over_delivery` | 512 / `meals` / `tally_attributions_meals_via_meal_over_delivery_ordinary_policy` | 0.082031 [0.067793, 0.098943] | 0 / 13 / 13 | `none` | `remain_pattern_by_rule` |
| Highs after treating lows | `habit:over_treated_low` | 101 / `lows` / `tally_attributions` | 0.19802 [0.15221, 0.253494] | 0 / 27 / 27 | `none` | `remain_pattern_observed` |
| Lows after correcting highs | `habit:correction_stacking` | 215 / `correction_clusters` / `tally_attributions` | 0.018605 [0.009936, 0.034573] | 0 / 10 / 11 | `none` | `remain_pattern_by_rule` |
| Overnight lows with no insulin on board | `setting:basal_rate` | 50 / `nights` / `basal_recurrence_channel` stand-in | null [null, null] | 37 / 0 / 0 | `setting_staging` | `remain_pattern_by_rule` |

| Pattern | Member subject / kind | k / denominator / source window / k producer | Price / price producer / admission / admission producer |
| --- | --- | --- | --- |
| Highs after meals | `habit:carb_undercount` / `habit` | 38 / `meals` / `scenario_request_window` / `tally_attributions.attributed_occurrences` | 18 / `guidance.candidates` / `not_admitted` / `build_guidance` |
| Highs after meals | `habit:late_bolus` / `habit` | 11 / `meals` / `scenario_request_window` / `tally_attributions.attributed_occurrences` | 5 / `guidance.candidates` / `not_admitted` / `build_guidance` |
| Highs after meals | `setting:carb_ratio` / `setting` | 0 / `unavailable` / `fixed_90_day_block_window` / `analyze.tuning_levers.recurrence_channel` | 0 / `analyze.tuning_levers._impact_factor` / `not_admitted` / `build_guidance` |
| Lows after meals | `habit:meal_over_delivery` / `habit` | 42 / `meals` / `scenario_request_window` / `tally_attributions.attributed_occurrences` | 13 / `guidance.candidates` / `not_admitted` / `build_guidance` |
| Lows after meals | `setting:carb_ratio` / `setting` | 0 / `unavailable` / `fixed_90_day_block_window` / `analyze.tuning_levers.recurrence_channel` | 0 / `analyze.tuning_levers._impact_factor` / `not_admitted` / `build_guidance` |
| Highs after treating lows | `habit:over_treated_low` / `habit` | 20 / `lows` / `scenario_request_window` / `tally_attributions.attributed_occurrences` | 27 / `guidance.candidates` / `not_admitted` / `build_guidance` |
| Lows after correcting highs | `habit:correction_stacking` / `habit` | 4 / `correction_clusters` / `scenario_request_window` / `tally_attributions.attributed_occurrences` | 9 / `guidance.candidates` / `not_admitted` / `build_guidance` |
| Lows after correcting highs | `habit:correction_on_iob` / `habit` | 4 / `lows` / `scenario_request_window` / `tally_attributions.attributed_occurrences` | 11 / `guidance.candidates` / `not_admitted` / `build_guidance` |
| Lows after correcting highs | `setting:isf` / `setting` | 16 / `days` / `analysis_request_window` / `analyze.tuning_levers.recurrence_channel` | 35 / `analyze.tuning_levers._impact_factor` / `not_admitted` / `build_guidance` |
| Overnight lows with no insulin on board | `setting:basal_rate` / `setting` | 7 / `nights` / `analysis_request_window` / `BasalHarm.nights` | 37 / `analyze.tuning_levers._impact_factor` / `admitted` / `build_guidance` |

### Identity overlap

| Window | Comparable pattern pair | Count | Reason |
| --- | --- | ---: | --- |
| 30 | Highs after meals / lows after meals | 0 | `shared_meals_exposure` |
| 30 | Highs after treating lows / lows after correcting highs | 0 | `shared_lows_exposure` |
| 90 | Highs after meals / lows after meals | 0 | `shared_meals_exposure` |
| 90 | Highs after treating lows / lows after correcting highs | 1 | `shared_lows_exposure` |

Every other cross-pattern pair is `not_comparable`: pairs between populated
families report `different_exposure_families`, and every pair with overnight
reports `no_habit_exposure_identity`.

| Window | Habit / setting harm-low pair | Count | Status / reason |
| --- | --- | ---: | --- |
| 30 | `habit:carb_undercount` / `setting:carb_ratio` | null | `not_comparable` / `different_identity_spaces` |
| 30 | `habit:late_bolus` / `setting:carb_ratio` | null | `not_comparable` / `different_identity_spaces` |
| 30 | `habit:meal_over_delivery` / `setting:carb_ratio` | 0 | `comparable` / `shared_low_episode_nadir` |
| 30 | `habit:correction_stacking` / `setting:isf` | null | `not_comparable` / `different_identity_spaces` |
| 30 | `habit:correction_on_iob` / `setting:isf` | 0 | `comparable` / `shared_low_episode_nadir` |
| 90 | `habit:carb_undercount` / `setting:carb_ratio` | null | `not_comparable` / `different_identity_spaces` |
| 90 | `habit:late_bolus` / `setting:carb_ratio` | null | `not_comparable` / `different_identity_spaces` |
| 90 | `habit:meal_over_delivery` / `setting:carb_ratio` | 0 | `comparable` / `shared_low_episode_nadir` |
| 90 | `habit:correction_stacking` / `setting:isf` | null | `not_comparable` / `different_identity_spaces` |
| 90 | `habit:correction_on_iob` / `setting:isf` | 0 | `comparable` / `shared_low_episode_nadir` |

Highs after treating lows has no setting member, and overnight has no habit
member, so neither emits a harm-low pair.

The overnight JSON records `rate`, `lo`, and `hi` as null. Its `n` is the basal
recurrence-window stand-in, not the ruled `harm_band_source_nights` population
that 2.5.2 owes; the receipt records that stand-in `n` and the
`BasalHarm.nights` `k` as counts only.

### Assessment against ADR 391

**ADR 391 — Membership roster and evidence boundaries.** The comparable meal
pair shares zero identities in both windows. Highs after treating lows and lows
after correcting highs share zero low identities at 30 days and one at 90 days.
The membership record puts `over_treated_low` and `correction_on_iob` in the
same low-episode identity space; the one shared occurrence is reported rather
than pooled into support. Comparable habit/setting harm-low pairs report zero;
the remaining pairs report `different_identity_spaces`.

**ADR 391 — Rate and denominator ownership.** Highs after meals measures
0.099448 over 181 at 30 days and 0.095703 over 512 at 90 days, against the
September 8 ledger's rough 1-in-8 grouping. Its `rate_levers` subset is
`habit:carb_undercount` and `habit:late_bolus`, and `tally_attributions` owns
both denominators. Lows after meals measures 0.055249 over 181 and 0.082031
over 512 against the ledger's rough 1 in 8. Its subset is
`habit:meal_over_delivery`; its named producer records that the ordinary
recurrence population coincides with the `MEALS` tally by construction, with
`recurrence_count` providing the independent check. Highs after treating lows
measures 0.185185 over 27 and 0.19802 over 101 against the ledger's rough 1 in
5. Its subset is `habit:over_treated_low`, and `tally_attributions` owns its
`lows` denominators. Lows after correcting highs measures 0.0 over 66 and
0.018605 over 215 against the ledger's rough 1 in 30. Its subset is only
`habit:correction_stacking`, and `tally_attributions` owns its
`correction_clusters` denominators. That is why the 30-day rate 0.0 sits beside
a `habit:correction_on_iob` member with `k = 2`: correction-on-IOB retains its
own `lows` population and is not in the pattern-rate numerator. Overnight's
subset is `setting:basal_rate`, but its rate and bounds are null because
`basal_recurrence_channel` supplies only the stand-in `n` until 2.5.2 adds the
ruled denominator. The receipts apply the ruled member and denominator
ownership; the ledger records the pre-ruling grouping.

**ADR 391 — Impact, admission and the staged-setting near-tie.** The threshold
is 30. The greatest habit member is highs after treating lows: 19 at 30 days
and 27 at 90 days, so no habit crosses the line. Carb ratio is 0 and not staged
in both windows. ISF is 29 at 30 days and 35 at 90 days but is not staged.
Basal is 0 and not staged at 30 days; it is 37 and staged at 90 days. The
settled rule therefore has no admitted leader at 30 days and selects overnight
at 37 at 90 days. Under both habit-only alternatives, highs after treating lows
is greatest at 19 and 27 respectively; no habit pattern crosses 30, including
under `worst_member`. The prior 27-versus-40 calibration is decided by the
settled rule; this snapshot supplies no habit price of 40 and does not mix a
setting price into either rejected alternative.

**ADR 391 — Collapse and rail behavior.** Every setting-bearing pattern reports
`remain_pattern_by_rule`, including overnight with zero habit members. Highs
after treating lows reports `remain_pattern_observed`. No single habit is
admitted in either window, so the single-admitted-member collapse branch is
vacuous here and 2.5.2 must test it.

No snapshot-testable titled ruling is contradicted. The existing 2.5.1 check
now stands on the corrected aggregate pass.

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
integrated guidance implementation. The first run demonstrated five stale,
generator-owned synthetic files; they were regenerated only through their
committed producers: the QA E2E database, I:C blocks, chart-builder analysis,
chart-builder episode inputs, and the findings projection. A final-tree replay
then exposed the same additive `guidance` serialization drift in the v2
exploration's generated `setting.json`, `focus.json`, `journey.json`,
`evidence.json`, and `workstation.json`; its committed generator regenerated
those five files and its `--check` passed. No clinical classifier, support
floor, score, Priority, or policy was changed.

The new `scripts/check_guidance_plan_contract.mjs` executes Python's public
accepted-pick rounding alongside the public Plan functions. Its verbatim stdout
was:

```text
guidance Plan contract: PASS
```

It obtains basal, I:C and ISF `guidance.action` values from their production
owners over manufactured QA cases. For basal it submits the one actual accepted
slot to the public Plan functions, then compares that delivered member and the
Plan-produced reversion boundary with the source action's span; it does not
expand the source span into accepted picks. It also checks I:C member
starts/provenance and whole-day ISF fan-out against public Plan functions and a
manufactured multi-boundary active profile. Positive-half rounding remains
supplemental coverage. Deliberate missing-ISF-member and extended-basal-end
mutations failed with their expected assertions before the unmodified guard
passed. The backend job runs the same driver after pytest.

The completed commands exited 0: `npm ci`; `npm run build`; `uv run python -m
pytest` (`2259 passed, 1 skipped, 185 warnings in 72.92s` on the final
verification run); `node --test
'frontend/**/*.test.js'` (623 passed);
strict OpenSpec validation (74 passed); all three repository policy guards; the
new Plan parity driver; all backend and frontend generator drift checks; the
materialized public-tree build, link check and contamination scan; and all ten
browser gates. The browser gates ran only through the permitted no-fetch server
against a temporary copy of `mockups/qa-e2e.synthetic/harmonic.sqlite`; no live
fetch or real database was opened.

The materialized public-tree scan reported 413 files scanned, 22 stamped, seven
pinned, and zero findings. Browser receipts include the Day, Diagnose
workstation/canvas, cockpit, runner lifecycle, first-plan reconciliation,
workstation behavior, event-comparison behavior/support, and Verify replay legs.

Limitation: the Docker runtime-image build and smoke check could not run locally:
`docker` is not installed on this host (`zsh:1: command not found: docker`). No
installation or substitute image build was attempted. CI remains the required
package-runtime proof for that leg.

The correction pass ran Node with the explicit required Node 22 prefix:
`PATH=/Users/connor/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin:$PATH`.
Raw unedited correction receipts are retained at
`/private/tmp/harmonic-384-c3-correction/parity-mutation.stdout`,
`/private/tmp/harmonic-384-c3-correction/parity-mutation.stderr`,
`/private/tmp/harmonic-384-c3-correction/parity.stdout`, and
`/private/tmp/harmonic-384-c3-correction/parity.stderr`. The mutation exited 1;
the unmodified parity command exited 0.

The final-tree replay retains complete, unedited stdout and stderr for every
successful required command under `/private/tmp/harmonic-384-c3-final/`, one
pair per command. That directory includes the second full pytest/frontend
passes, every drift check, the materialized-tree manifest/link/scan checks, all
ten browser legs, the no-fetch server and health receipts, and the Plan parity
pass and deliberate failure. `docker.stderr` contains the complete unmet
prerequisite output; `docker.stdout` is empty.

The bounded basal-span correction receipts are under
`/private/tmp/harmonic-384-c3-basal-span-correction/`. `pre-fix-mutant` records
the original false pass for a source end extended by 30 minutes; the final
`basal-span-mutant` pair records the corrected assertion failure, and `parity`
records the production-backed pass. Each stdout/stderr file is unedited; exit
outcomes are recorded in the adjacent `exit-statuses.txt` manifest.

### Coordinator integration status

Tasks 3.1.1 and 3.1.2 are implemented and independently reviewed. The
three serial chunks are integrated on the ticket branch. Task 3.1.3 and
aggregate 3.1 remain unchecked because the required Docker runtime-image
proof is unavailable locally. The execution lock permits a draft PR with this
limitation; the parent remains active. Chunk 3 Standards and Spec reviews
found no code defects and retained only that outstanding platform evidence.

Coordinator verification of the integrated branch retains complete command
stdout, stderr, arguments and exit statuses under
`/private/tmp/harmonic-384-merged-verification/`. Its results will be reported
in the implementation PR after the run completes.


The following ADR 386 investigation receipt is the historical review-ready
record, preserved verbatim. Its pending-review status is superseded by the
verified-completion record below; the raw outputs remain unchanged.

## ADR 386 investigation receipts

Captured on 2026-09-08 from source
`b9791d9b91e1897d8557c4f037538f9e82b8edd5` in the selected ticket worktree.
The installed GitHub binding located lock v2 386 1 at
https://github.com/harmonichq/harmonic/issues/386#issuecomment-5579015306.
The source commit resolves, is the ticket branch head before this investigation,
contains the active strictly valid change and every selected task/anchor, and has
no later source amendment. Session-local metadata admitted GPT-6 Astra / medium;
repository read/write capability and the installed adapter probe were verified.

The findings are review-ready, not independently reviewed or spike-completed.
Tasks 2.2–2.3 remain unchecked for the coordinator-owned review boundary.

### Executed inputs and limits

`production-*` cases execute existing Plan reconciliation, Store/watch/review,
scenario and trend producers. They materialize only committed generator-owned
synthetic recipes in temporary stores. The setting/focus captures call
`mockups/harmonic-v2.exploration/generate.py`; the correction recipe is
`behavioral-correction-on-iob` from `scripts/qa_e2e_cases.py` through
`scripts/gen_qa_e2e_db.py`. Block identity reuses the existing manufactured
builders in `tests/test_verify_trials.py`. Additional sequential switches are
explicitly manufactured scratch inputs, not new committed fixtures.
`_review_id`, `_profile_settings` and `_effective_isf` are inspected internal
helpers used only to identify the production values; this is not a new public API.

`simulation-*` cases execute the proposed in-memory contract. They do not test
an implemented Store migration, endpoint or transaction. Exact-period tests
exercise half-open ownership/clipping on manufactured anchor times; they do not
certify a new production exact-period classifier or #340's statistical method.
The fixed-context case reuses the actual unchanged-record production tallies.
No real patient records, credentials, normal server or vendor pull are involved.

The current source grounds the existing facts in `Store.apply_plan`,
`Store.plan_history`, `Store.pin_focus`, `Store.resolve_focus` and
`Store.list_focuses`; `watched_change.detect_trial`, `review_trials`,
`_review_candidates`, `_review_id`, `trial_is_active` and `active_watched_change`;
`outcomes_trend.summarize_trend`; scenario `build_scenarios` and
`tally_attributions`; and `frontend/plan.js::reconcileDeliverable`.
Graph coverage for these cited source files reported no recorded issue and
matching metadata, with its best-effort caveat; direct source was also inspected.

The retained comparison authority was read from
`1ee53b341192b0943c83aae94b47dc6b33c571e3:openspec/changes/verify-change-comparison/design.md`.
The #131 fixed-profile rationale is recorded in the current trend producer's
module contract and `_profile_settings`: one programmed ISF across windows,
never independently varying analyzer estimates. ADR 386 preserves that rationale
and names the retained pin-time context; it does not rewrite the statistical policy.

The chart handoff is source-grounded only. `renderEventSurface` owns interactions
but still accepts a diagnostic case-file shape and computes its own scale. The
option supplies an anchor label/grid, not a dedicated zero marker; its older
comment claiming a marker is not execution evidence. #340's already-approved
data/scale/zero-marker seams remain the bounded extension. No rendered UI proof
was attempted by this investigation.

### Exact verification command and unedited output

The command below ran from the ticket worktree with host cache permissions.
The first sandboxed attempts were unable to write the uv/npm caches; the same
operations succeeded outside the sandbox without credential or cache repair.
The final command exited **0**. All 21 cases assert literal expected outputs and
a closed required-case set; either mismatch or missing exercise exits nonzero.

```sh
uv run --extra api python /private/tmp/harmonic-348-completion/386-replay.py && npx --yes @fission-ai/openspec@1 validate harmonic-v2 --strict && python3 scripts/check_adr_numbers.py && python3 scripts/check_owned_identifiers.py && python3 scripts/check_public_allowlist.py
```

Stdout (unedited):

```text
{"actual": {"mismatch": [{"cells": [{"actual": 0.5, "label": "Basal (U/h)", "param": "basal_rate", "planned": 0.48}], "label": "03:00", "start_min": 180}], "states": {"confirmed": "confirmed", "draftMatch": "confirmed", "mismatch": "mismatch", "pending": "pending"}}, "asserted": {"mismatch": [{"cells": [{"actual": 0.5, "label": "Basal (U/h)", "param": "basal_rate", "planned": 0.48}], "label": "03:00", "start_min": 180}], "states": {"confirmed": "confirmed", "draftMatch": "confirmed", "mismatch": "mismatch", "pending": "pending"}}, "case": "production-plan-reconciliation", "inputs": {"accepted_items": [{"current": 0.6, "label": "03:00", "recommended": 0.48, "start_min": 180, "type": "basal", "value": 0.48}, {"current": 0.6, "label": "03:30", "recommended": 0.48, "start_min": 210, "type": "basal", "value": 0.48}], "detected": {"captured_at": "2024-06-13 00:00:00", "confirmed": {"carb_entry": true, "dia_min": 180, "idp": 1, "max_bolus": 10.0, "name": "QA synthetic profile", "segments": [{"basal_rate": 0.6, "carb_ratio": 10.0, "isf": 40, "start_min": 0, "target_bg": 110}, {"basal_rate": 0.48, "carb_ratio": 10.0, "isf": 40, "start_min": 180, "target_bg": 110}, {"basal_rate": 0.6, "carb_ratio": 10.0, "isf": 40, "start_min": 240, "target_bg": 110}]}, "mismatch": {"carb_entry": true, "dia_min": 180, "idp": 1, "max_bolus": 10.0, "name": "QA synthetic profile", "segments": [{"basal_rate": 0.6, "carb_ratio": 10.0, "isf": 40, "start_min": 0, "target_bg": 110}, {"basal_rate": 0.5, "carb_ratio": 10.0, "isf": 40, "start_min": 180, "target_bg": 110}, {"basal_rate": 0.6, "carb_ratio": 10.0, "isf": 40, "start_min": 240, "target_bg": 110}]}, "pending": null}, "fixture": "setting.json"}}
{"actual": {"active_guard": true, "detail_focus_available": true, "history_keys": ["applied_at", "items"], "id": "basal_rate-03-00-20240613030000", "maturing": false}, "asserted": {"active_guard": true, "detail_focus_available": true, "history_keys": ["applied_at", "items"], "id": "basal_rate-03-00-20240613030000", "maturing": false}, "case": "production-trial-readiness", "inputs": {"generator": "setting_capture", "now": "2024-06-28 12:00:00"}}
{"actual": [{"active": "isf-all-20240601120000", "roster": ["isf-all-20240601120000"]}, {"active": "isf-all-20240603120000", "roster": ["isf-all-20240601120000", "isf-all-20240603120000"]}], "asserted": [{"active": "isf-all-20240601120000", "roster": ["isf-all-20240601120000"]}, {"active": "isf-all-20240603120000", "roster": ["isf-all-20240601120000", "isf-all-20240603120000"]}], "case": "production-sequential-changes", "inputs": {"isf_changes": [["2024-06-01 12:00:00", 45], ["2024-06-03 12:00:00", 50]], "recipe": "behavioral-over-treated-low"}}
{"actual": {"manual": {"id": 1, "lever": "over_treated_low", "pinned_at": "2024-05-30 12:00:00", "status": "resolved"}, "preempted": {"id": 1, "lever": "over_treated_low", "pinned_at": "2024-05-30 12:00:00", "status": "dropped"}}, "asserted": {"manual": {"id": 1, "lever": "over_treated_low", "pinned_at": "2024-05-30 12:00:00", "status": "resolved"}, "preempted": {"id": 1, "lever": "over_treated_low", "pinned_at": "2024-05-30 12:00:00", "status": "dropped"}}, "case": "production-focus-endings", "inputs": {"generator": "focus_capture", "pin": "2024-05-30 12:00:00"}}
{"actual": {"resolver_write_rejected": true, "review_unchanged": true, "status": "active"}, "asserted": {"resolver_write_rejected": true, "review_unchanged": true, "status": "active"}, "case": "production-history-read", "inputs": {"read": "review_trials then forbidden active resolver on read-only store", "recipe": "sequence store with Store-level Focus pin"}}
{"actual": {"active_guard": false, "ids": ["carb_ratio-12-00-20260602090000-900"]}, "asserted": {"active_guard": false, "ids": ["carb_ratio-12-00-20260602090000-900"]}, "case": "production-block-identity", "inputs": {"block": [720, 900], "builder": "tests.test_verify_trials._apply_ic_block", "change": "2026-06-02 09:00:00", "values": [5.0, 4.6]}}
{"actual": {"profile_isf": 40.0, "same_records_tallies": [[2, 5], [0, 5], [0, 5]], "scenario": [2, 5], "scenario_isf": -0.0, "trend": [0, 5]}, "asserted": {"profile_isf": 40.0, "same_records_tallies": [[2, 5], [0, 5], [0, 5]], "scenario": [2, 5], "scenario_isf": 0.0, "trend": [0, 5]}, "case": "production-correction-context", "inputs": {"now": "2024-05-30 12:00:00", "raw_records_unchanged": true, "recipe": "behavioral-correction-on-iob"}}
{"actual": {"ending": {"conclusion": "continue current setting", "effective_at": "2024-06-18 12:00:00", "kind": "user_finished", "recorded_at": "2024-06-18 12:00:00"}, "ending_count": 2, "same": true}, "asserted": {"ending": {"conclusion": "continue current setting", "effective_at": "2024-06-18 12:00:00", "kind": "user_finished", "recorded_at": "2024-06-18 12:00:00"}, "ending_count": 2, "same": true}, "case": "simulation-finish-retry", "inputs": {"first_request": "2024-06-18 12:00:00", "retry": "2024-06-19 12:00:00", "trial": {"changed_at": "2024-06-03 12:00:00", "id": "isf-all-20240603120000", "ready": true}}}
{"actual": {"active_focus": null, "active_trial": null, "can_finish_trial": false, "can_pin_focus": true}, "asserted": {"active_focus": null, "active_trial": null, "can_finish_trial": false, "can_pin_focus": true}, "case": "simulation-no-old-promotion", "inputs": {"refresh_candidates": [{"changed_at": "2024-06-01 12:00:00", "id": "isf-all-20240601120000", "ready": true}, {"changed_at": "2024-06-03 12:00:00", "id": "isf-all-20240603120000", "ready": true}], "then_latest_absent": [{"changed_at": "2024-06-01 12:00:00", "id": "isf-all-20240601120000", "ready": true}]}}
{"actual": {"focus_ending": {"conclusion": null, "effective_at": "2024-06-20 12:00:00", "kind": "trial_preempted", "recorded_at": "2024-06-21 12:00:00"}, "immature_finish_rejected": true, "verdict": {"active_focus": null, "active_trial": "isf-all-20240620120000", "can_finish_trial": false, "can_pin_focus": false}}, "asserted": {"focus_ending": {"conclusion": null, "effective_at": "2024-06-20 12:00:00", "kind": "trial_preempted", "recorded_at": "2024-06-21 12:00:00"}, "immature_finish_rejected": true, "verdict": {"active_focus": null, "active_trial": "isf-all-20240620120000", "can_finish_trial": false, "can_pin_focus": false}}, "case": "simulation-new-trial-preemption", "inputs": {"candidate": {"changed_at": "2024-06-20 12:00:00", "id": "isf-all-20240620120000", "ready": false}, "observed_at": "2024-06-21 12:00:00"}}
{"actual": {"can_pin": true, "ending": {"conclusion": "stop for now", "effective_at": "2024-06-29 12:00:00", "kind": "manual", "recorded_at": "2024-06-29 12:00:00"}, "retry_same": true}, "asserted": {"can_pin": true, "ending": {"conclusion": "stop for now", "effective_at": "2024-06-29 12:00:00", "kind": "manual", "recorded_at": "2024-06-29 12:00:00"}, "retry_same": true}, "case": "simulation-manual-focus-ending", "inputs": {"pin": {"id": "focus:1", "pinned_at": "2024-05-30 12:00:00"}, "request": "stop for now"}}
{"actual": {"automatic": [{"active": null, "conclusion": null, "kind": "reverted"}, {"active": null, "conclusion": null, "kind": "expired_unreviewed"}], "supersession": "superseded"}, "asserted": {"automatic": [{"active": null, "conclusion": null, "kind": "reverted"}, {"active": null, "conclusion": null, "kind": "expired_unreviewed"}], "supersession": "superseded"}, "case": "simulation-observed-endings", "inputs": {"observed": ["reverted", "expired_unreviewed"], "superseding_candidate": {"changed_at": "2024-06-03 12:00:00", "id": "isf-all-20240603120000", "ready": true}}}
{"actual": {"legacy": {"context": {"reason": "not_recorded", "state": "unavailable"}, "ending": {"reason": "ending_time_not_recorded", "state": "unavailable"}, "id": 7, "lever": "over_treated_low", "pinned_at": "2024-05-30 12:00:00", "status": "resolved"}, "owner_unchanged": true}, "asserted": {"legacy": {"context": {"reason": "not_recorded", "state": "unavailable"}, "ending": {"reason": "ending_time_not_recorded", "state": "unavailable"}, "id": 7, "lever": "over_treated_low", "pinned_at": "2024-05-30 12:00:00", "status": "resolved"}, "owner_unchanged": true}, "case": "simulation-legacy-and-read-only", "inputs": {"legacy": {"id": 7, "lever": "over_treated_low", "pinned_at": "2024-05-30 12:00:00", "status": "resolved"}, "read": "history plus client modification"}}
{"actual": {"changed_at": "2024-06-01 12:00:00", "decision_context": null, "first_observed_at": "2024-06-02 12:00:00"}, "asserted": {"changed_at": "2024-06-01 12:00:00", "decision_context": null, "first_observed_at": "2024-06-02 12:00:00"}, "case": "simulation-first-observation", "inputs": {"candidate": {"changed_at": "2024-06-01 12:00:00", "id": "isf-all-20240601120000", "ready": true}, "first_seen": "2024-06-02 12:00:00"}}
{"actual": [null, null, "plan:1", null, null, null], "asserted": [null, null, "plan:1", null, null, null], "case": "simulation-plan-link", "inputs": {"columns": ["reconciliation", "applied", "observed_transition", "unique_match"], "rows": [["pending", true, true, true], ["mismatch", true, true, true], ["confirmed", true, true, true], ["confirmed", false, true, true], ["confirmed", true, false, true], ["confirmed", true, true, false]]}}
{"actual": {"after_trace_clipped": ["2024-05-30 12:00:00", "2024-05-30 12:30:00"], "capped_before": ["2024-03-01 12:00:00", "2024-05-30 12:00:00"], "legacy": {"reason": "ending_time_not_recorded", "state": "unavailable"}, "no_before": ["2024-05-30 12:00:00", "2024-05-30 12:00:00"], "owned": {"after": ["2024-05-30 12:00:00", "2024-06-29 11:59:59"], "before": ["2024-05-30 11:59:59"]}, "periods": {"after": ["2024-05-30 12:00:00", "2024-06-29 12:00:00"], "before": ["2024-05-01 00:00:00", "2024-05-30 12:00:00"]}}, "asserted": {"after_trace_clipped": ["2024-05-30 12:00:00", "2024-05-30 12:30:00"], "capped_before": ["2024-03-01 12:00:00", "2024-05-30 12:00:00"], "legacy": {"reason": "ending_time_not_recorded", "state": "unavailable"}, "no_before": ["2024-05-30 12:00:00", "2024-05-30 12:00:00"], "owned": {"after": ["2024-05-30 12:00:00", "2024-06-29 11:59:59"], "before": ["2024-05-30 11:59:59"]}, "periods": {"after": ["2024-05-30 12:00:00", "2024-06-29 12:00:00"], "before": ["2024-05-01 00:00:00", "2024-05-30 12:00:00"]}}, "case": "simulation-exact-periods", "inputs": {"anchors": ["2024-05-30 11:59:59", "2024-05-30 12:00:00", "2024-06-29 11:59:59", "2024-06-29 12:00:00"], "available_start": "2024-05-01 00:00:00", "ending": "2024-06-29 12:00:00", "pin": "2024-05-30 12:00:00"}}
{"actual": [{"denominator": 0, "numerator": 0, "rate": null, "state": "unavailable"}, {"denominator": 5, "numerator": 0, "rate": 0.0, "state": "available"}], "asserted": [{"denominator": 0, "numerator": 0, "rate": null, "state": "unavailable"}, {"denominator": 5, "numerator": 0, "rate": 0.0, "state": "available"}], "case": "simulation-zero-opportunities", "inputs": {"observed_zero": [0, 5], "unwanted_behavior": [0, 0]}}
{"actual": {"after_context": {"classifier": "source-pin", "profile_isf": 40.0, "source": "programmed_profile_at_pin", "version": "386:1"}, "before_context": {"classifier": "source-pin", "profile_isf": 40.0, "source": "programmed_profile_at_pin", "version": "386:1"}, "comparison_counts": [[0, 5], [0, 5]], "original_diagnosis_count": [2, 5], "outcome_claim": null}, "asserted": {"after_context": {"classifier": "source-pin", "profile_isf": 40.0, "source": "programmed_profile_at_pin", "version": "386:1"}, "before_context": {"classifier": "source-pin", "profile_isf": 40.0, "source": "programmed_profile_at_pin", "version": "386:1"}, "comparison_counts": [[0, 5], [0, 5]], "original_diagnosis_count": [2, 5], "outcome_claim": null}, "case": "simulation-fixed-context", "inputs": {"later_programmed_isf": 50.0, "production_same_records_tallies": [[2, 5], [0, 5], [0, 5]], "retained": {"classifier": "source-pin", "profile_isf": 40.0, "source": "programmed_profile_at_pin", "version": "386:1"}}}
{"actual": [{"can_pin_focus": false, "lead": "trial"}, {"can_pin_focus": false, "lead": "focus"}, {"can_pin_focus": false, "lead": "pending_plan"}, {"can_pin_focus": true, "lead": "draft"}, {"can_pin_focus": true, "lead": "guidance"}], "asserted": [{"can_pin_focus": false, "lead": "trial"}, {"can_pin_focus": false, "lead": "focus"}, {"can_pin_focus": false, "lead": "pending_plan"}, {"can_pin_focus": true, "lead": "draft"}, {"can_pin_focus": true, "lead": "guidance"}], "case": "simulation-precedence", "inputs": {"columns": ["watch", "pending_plan", "draft"], "rows": [["trial", true, true], ["focus", true, true], [null, true, true], [null, false, true], [null, false, false]]}}
{"actual": {"after_finish": null, "history_count": 2, "selected": "carb_ratio-12-00-20260602090000-900"}, "asserted": {"after_finish": null, "history_count": 2, "selected": "carb_ratio-12-00-20260602090000-900"}, "case": "simulation-same-instant-and-block", "inputs": {"candidates": [{"changed_at": "2026-06-02 09:00:00", "id": "carb_ratio-12-00-20260602090000-960", "ready": true}, {"changed_at": "2026-06-02 09:00:00", "id": "carb_ratio-12-00-20260602090000-900", "ready": true}], "order": "deliberately reversed"}}
{"actual": {"initial_can_pin": false, "kind": "intent_withdrawn", "later_active": "isf-all-20240601120000", "released_can_pin": true, "same_withdrawal": true}, "asserted": {"initial_can_pin": false, "kind": "intent_withdrawn", "later_active": "isf-all-20240601120000", "released_can_pin": true, "same_withdrawal": true}, "case": "simulation-plan-withdrawal", "inputs": {"later_observed_change": {"changed_at": "2024-06-01 12:00:00", "id": "isf-all-20240601120000", "ready": true}, "pending_plan": "plan:2024-06-01 10:00:00"}}
PASS: 21/21 required cases asserted; production observations and proposed simulations remain distinct.
Change 'harmonic-v2' is valid
check-adr: 150 ADRs in 83 design.md files, all identities unique and issue-keyed.
check-owned-identifiers: 30 owned-identifier rules passed.
check-public-allowlist: 413 tracked file(s) cleared to ship, 1745 excluded. Every tracked path dispositioned.
```

Stderr (unedited):

```text
(node:50090) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///Users/connor/worktrees/harmonic/386/frontend/plan.js is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /Users/connor/worktrees/harmonic/386/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
/Users/connor/worktrees/harmonic/386/.venv/lib/python3.12/site-packages/fastapi/testclient.py:1: StarletteDeprecationWarning: Using `httpx` with `starlette.testclient` is deprecated; install `httpx2` instead.
  from starlette.testclient import TestClient as TestClient  # noqa
```

The emitted Node module-type and Starlette deprecation warnings did not fail the
command. They are baseline runtime warnings; no dependency or production change
was made to suppress them. Full stdout/stderr, exit statuses and iteration
failures are retained in `/private/tmp/harmonic-348-completion/386-start/`.
The final positive receipts are `verification-complete.*`.

### Deliberate negative controls

Two scratch-only variants were executed against the same synthetic inputs.
One treats the finished latest Trial as active; the other omits one required
case from the exercise ledger. Both exited **1**, for the intended failures
below. These are controls of the replay, not failures of production behavior.

```sh
uv run --extra api python /private/tmp/harmonic-348-completion/386-start/mutant-reopen.py
```

Final error (excerpt; full stdout/stderr retained alongside the command):

```text
AssertionError: ('simulation-no-old-promotion', {'active_trial': 'isf-all-20240603120000', 'active_focus': None, 'can_pin_focus': False, 'can_finish_trial': True}, {'active_trial': None, 'active_focus': None, 'can_pin_focus': True, 'can_finish_trial': False})
```

```sh
uv run --extra api python /private/tmp/harmonic-348-completion/386-start/mutant-unexercised.py
```

Final error (excerpt; full stdout/stderr retained alongside the command):

```text
AssertionError: {'missing': ['simulation-first-observation'], 'unexpected': []}
```

The uncommitted replay is `/private/tmp/harmonic-348-completion/386-replay.py`.
Its SHA-256 at this capture is `54800861747140b80e22d34aaf8dc5285c224c9b8e78023241cb1195d2e56331`. It is deliberately not shipped as a
replay program or fixture; the recorded inputs/assertions/outputs above are the
committed investigation evidence.

### Prevented delivery and remaining proof

No selected ruling was prevented by an unavailable authority or evidence source.
The exact selected investigation command passed. Independent Standards/Spec review
remains outstanding by the mandatory handoff; no dependent production build is
admitted from this worker result alone. The coordinator must verify this commit
and the raw receipts, dispatch that review and resume the same worker for any
corrections or verified completion.

The unexecuted production and UI obligations are enumerated in contracts.md:
real migration/identity retention, write atomicity and restart/races, cache and
reconciliation integration, production exact-period/context serving, #340's
comparison assessments, both rendered journeys and shared-chart interactions,
and packaged v1/v2 coexistence. The replay's passing assertions do not discharge
those obligations or establish clinical/statistical validity.


## ADR 386 verified completion

The epic coordinator independently verified findings commit
`11610c0ae7c8fd3e1753d79d6e340a3977be5274`: the exact investigation command
passed 21/21 required replay cases, strict OpenSpec validation and all three
documentation guards. Mandatory full Standards/Spec review converged with zero
findings: all 18 Standards rules hold and all 17 Spec entries are met.

Review used operator-approved Luna/medium. The Full Codex-only route remains
**UNVALIDATED**; this completion does not promote its validation status. The
actual verdict is retained at
`/private/tmp/harmonic-348-completion/386-code-review-1/review.md`.
The coordinator accepted that qualified coverage and explicitly resumed the same
worker for verified completion.

Only tasks 2.2, 2.2.1, 2.2.2, 2.3, 2.3.1 and 2.3.2 are marked complete. ADR 386's
contract is settled and reviewed; the historical review-ready receipt above and
its raw outputs remain verbatim. This administrative completion changes no
ruling, context field, behavior or production scope. Required production/UI work
remains unchecked, and #384 task status is unchanged. Next child admission and
tracker close remain with the epic coordinator.


## ADR 384 post-merge finalization receipt

The previous #384 implementation receipt's pending runtime/finalization statements
are historical. PR [#385](https://github.com/harmonichq/harmonic/pull/385) merged
at `2026-09-08T03:22:40Z`, commit
`3ae1e25aa71207bdabddc2a195788898f80e4198`. Its required PR checks passed,
including the packaged Docker build and smoke checks. Post-merge run
[34183296538](https://github.com/harmonichq/harmonic/actions/runs/34183296538)
completed successfully at that same head, including image publication. The epic
coordinator reread the live merge and completed/success run before checking
parent tasks 3.1 and 3.1.3.

The [finalization result](https://github.com/harmonichq/harmonic/issues/384#issuecomment-5578705239)
records the closed ticket and clean worktree/index teardown. This discharges
#384's verification/finalization obligation, not the remaining v2 surface,
durable follow-up, or complete release acceptance.
