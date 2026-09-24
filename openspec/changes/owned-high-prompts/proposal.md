# #448 owned-High prompts

## Status

**Triage source for #448.** An ordinary ticket change. It ships in the
coordinator's single release pull request for #442–#455 and #457, whose
coordinator archives it there.

## Why

Since #422 (ADR 422), an over-treated low owns every High its guarded rebound
reaches. The Scenario engine no longer calls that High a missed meal. The Carb-log
prompt queue does not read that ownership. It runs the missed-meal classifier
directly on each High's onset, with no Episode context and no owning rebound. So
"Did you eat here?" still appears at a High the Scenario already explains:

- A slow rebound whose High starts more than 90 minutes after a sub-70 low. The
  context gate looks back 90 minutes, so it misses the low. The question sits
  beside that low's own "Did you treat this low?".
- A rebound from a near-low (71–75 mg/dL), at any timing. The gate looks only for
  70 mg/dL or below.

Two classifiers also drop their gate settings. Late bolus and carb undercount
each receive a scenario configuration but call the context gate without it, so a
changed gate low line or lookback never reaches their verdicts. #422 fixed this
for missed meal and meal bolus fell short only. Every production configuration is
the default today, so no current output differs.

Two classifier comments still define the *upstream-cause* silence reason as the
context gate alone. The desk carries four reference tables that nothing reads.

## What changes

- Coordinator ruling R448 (under the operator's 2026-09-23 delegation): a High
  that an over-treated low owns raises no missed-meal prompt. The queue reads the
  ownership the shared evaluation already records (`Attribution.owned_highs`),
  over its own window and with the same low-prompt answers the Scenario reads.
  It makes no second judgment. The low keeps its own prompt. A High no low owns is
  judged exactly as today.
- Late bolus and carb undercount judge the context gate under the scenario
  configuration they are given.
- The correction-on-active-insulin and correction-stacking comments name both
  upstream-cause sources: the context gate and an over-treated low's rebound.
- The unread detector and silence-reason reference tables in the Day chart module
  are deleted, with the one test that reads only them.
- Ownership is not narrowed for either boundary case the #422 review raised. ADR
  448 records why.

## Out of scope

- Episode segmentation, the gate's defaults, the rebound horizon, bar and meal
  stop, every staging predicate, cap and support floor.
- The low prompt, the answered-match, coverage, expiry and display-cap rules of
  the queue.
- Every rendered surface. The desk renders the served prompts unchanged.

## Impact

`ciq_autotune/pending_prompts.py`, the `/api/prompts` route comment in
`ciq_autotune/api.py`, `ciq_autotune/analyzers/classifiers/late_bolus.py`,
`ciq_autotune/analyzers/classifiers/carb_undercount.py`,
`ciq_autotune/analyzers/classifiers/correction_on_iob.py` and
`ciq_autotune/analyzers/classifiers/correction_stacking.py` (comments),
`frontend/day-chart.js` and its test, their tests, `CONTEXT.md`, the
behavioral-layer spec (two ADDED requirements), and the design exploration's
generated `code_version` stamps.
