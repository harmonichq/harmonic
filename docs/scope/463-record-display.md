# What a change record prints, draws, and knows about its Plan — triage and review ledger

Ticket: #463. Change: `openspec/changes/qa-round-2` (ADR 463; tasks 27–36;
outcomes requirements 3–6, surfaces requirements 5–7, plan requirement 2).
Triage ran unattended (AFK run, 2026-09-24).

## Reproduction

`uv run python docs/scope/463-record-display.repro.py`, at this change's base:

```text
1. Served differences with a float tail, a reconciled scratch copy of the committed showcase
   carb_ratio-all-20240616080000 retained: tir before 100.0 after 96.1 difference -3.9000000000000057
2. c4-profile: clock views on the saved ending and on the retained read
   profile-all-20240601000000 ended expired_unreviewed: saved assessment available, views saved False; retained read clock bins before 48 after 48
3. A Trial matched to a Plan by `_reconcile_plan`
   isf-all-20260511060000: receipt available naming Plan 2026-05-06 00:00:00; served original context action None, explanation 'Observed programmed setting transition; original decision is not recorded.'
4. A dose-detected Trial and a Plan confirmed from a pump read
   Trial basal_rate-03-00-20260925030200 changed_at 2026-09-25 03:02:00; Plan recorded 2026-09-24 17:09:05, confirmed from read 2026-09-27 01:00:00 with trial_id None; Trial receipt unavailable; served original context action None
5. Dating a mid-morning edit the dose stream detects
   isf regime starts 2024-03-10 08:00
   carb_ratio regime starts 2024-03-10 08:00
   Trial candidate profile dated 2024-03-10 08:00: edit at 10:00, first bolus carrying the new values 12:30; dated 2.0 h before the edit
```

Item 4's Plan time is the wall clock of the run (the Plan routes stamp it), so
it differs between runs.

`node docs/scope/463-figure.repro.mjs`:

```text
tir: 100% (10 observed CGM readings in eligible windows) | 96.1% (10 observed CGM readings in eligible windows) | Unclear (difference -3.9000000000000057)
nights_with_low: 33.333333333333336% (3 coverage-qualified Rest windows in affected hours) | 0% (3 coverage-qualified Rest windows in affected hours) | Unclear (difference -33.333333333333336)
saved: data-figure-state="saved", chart seat true, role="img" true
unavailable: data-figure-state="unavailable", chart seat true, role="img" true
no-readings: data-figure-state="no-readings", chart seat true, role="img" true
not-requested: data-figure-state="not-requested", chart seat true, role="img" true
```

`uv run python docs/scope/463-redate.spike.py` (the dating rule, spiked):

```text
1. The mid-morning probe
   isf: day rule 2024-03-10 08:00, first-new-value rule 2024-03-10 12:30
   carb_ratio: day rule 2024-03-10 08:00, first-new-value rule 2024-03-10 12:30
2-3. Committed case stores
   stores checked: 73; same-day, never-earlier violations: 0
   no regime start and no derived Trial id moved on any committed case store
```

## Grounding notes

- `_setting_period` and `_reversal_at` join a record to its regime by exact start
  instant, so re-dating alone would break every existing delivery-detected
  record's comparison and reversal as well as its id; ADR 463 decision 5 covers
  all three.
- The design exploration's `focus.json` and `journey.json` embed the package
  hash, so any Python edit moves them until #462 drops it.
- The operator could not check a fresh snapshot (the issue's "Ground first"):
  ADR 463 records the premise and handles both explanations.

## Decisions

- If re-dating moves Trial ids, keep existing records as they are. Connor,
  2026-09-24.
- Option 1 for an ended record's curve (the issue's recommendation); one-decimal
  printing in the desk only; no-curve figures take no chart space; a matched
  Trial serves its Plan's decision; the link rule (ADR 431 addendum); first-new-
  value dating with the same-day rule for existing records. ADR 463, decided
  autonomously during the AFK run.
- Surface lifecycle `revise`, as for #462; sweep deferred to start (sandbox).
- Flat order, for the same reason as #462; the nearby reviewer-memory anchors
  disagree.
- Review depth Full: the change moves Plan reconciliation and Trial identity.

## Review rounds

| Round | Blocking objections entering | Authoring change | Injected ground truth | Verdict |
|---|---|---|---|---|
| 1 | — | Initial flat draft | pending the coordinator's cold plan review | pending |
