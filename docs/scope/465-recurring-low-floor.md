# A recurring-lows basal cut within the threshold holds — triage and review ledger

Ticket: #465. Change: `openspec/changes/qa-round-2` (ADR 465; tasks 37–46;
safety requirement 2, surfaces requirement 9). Triage ran unattended (AFK run,
2026-09-24).

## Reproduction

`uv run python docs/scope/465-recurring-low-floor.repro.py`, at this change's
base:

```text
1. analyze_basal on 12 in-range nights, programmed 0.72, delivered 0.71, lows at 03:00 on two nights
   with harm: status 'lower (recurring lows)', recommended 0.71, asserts_move True, action lower 0.71, seriousness recurring_low
   annotation: 'lows keep happening at this hour, so the rate steps down toward the measured rate (20% at most)'
   without harm: status 'no change'
2. consolidate_profile over that analysis
   segment from 00:00 basal 0.719
3. apply_harm with nudge=True
   setting 0.72, median 0.71: 'lower (recurring lows)' at 0.71
   setting 0.72, median 0.66: 'lower (recurring lows)' at 0.66
   setting 0.2, median 0.16: 'lower (recurring lows)' at 0.16
   setting 0.2, median 0.19: 'lower (recurring lows)' at 0.19
   setting 0.11, median None: 'lower (recurring lows)' at 0.1
   setting 0.1, median None: 'lower (recurring lows)' at 0.1
   float: 0.72 - round(0.72 * 0.8, 3) = 0.14400000000000002 ; 0.72 * 0.2 = 0.144
4. basal_lever with two nudged slots
   01:30 a hundredth under: 01:30 'lower (recurring lows)', 03:00 'lower (recurring lows)'; priority 15, recurrence channel {'kind': 'basal_lower', 'k': 14, 'n': 14}
   01:30 at programmed: 01:30 'held (recurring-low gate)', 03:00 'lower (recurring lows)'; priority 11, recurrence channel {'kind': 'basal_lower', 'k': 9, 'n': 9}
```

`uv run python docs/scope/465-recurring-low-floor.repro.py --stores` (every
committed synthetic store, then the proposed case's recipe):

```text
5. Recurring-lows cuts on the committed synthetic stores
   stores checked: 75 (the last is the proposed case)
   basal-recurring-low-lower 03:00: 0.6 -> 0.54, step 0.06, at or above the threshold
   basal-recurring-low-no-clean-median 05:00: 0.6 -> 0.48, step 0.12, at or above the threshold
   proposed basal-recurring-low-within-floor 03:00: 0.6 -> 0.59, step 0.01, within the threshold
```

## Grounding notes

- `apply_harm` (`ciq_autotune/safety.py`) is the one place the nudge sets a
  target; `cap()` runs before it and its `NO_CHANGE` is overwritten. The
  threshold therefore goes in `apply_harm`, on both nudge branches.
- `Status` maps one-to-one to its sentence through `_annotation_for`, and
  `HARM_GATED` already serves the raise-gate sentence. Keeping the status and
  choosing the sentence in the analyzer leaves every downstream reader of the
  status (staging, deliverable, consolidation, lever, lane, queue register)
  unchanged. `_annotation_for` has a second caller,
  `scripts/gen_findings_projection_fixtures.py`, so the new input defaults.
- The held-row title comes from `_lean` in `ciq_autotune/findings_projection.py`,
  which would title the hold "Basal 03:00 · leaning lower". Its JS mirror is
  `mockups/findings-projection.mirror.mjs`, deep-compared against the
  generator's frozen answers, so the rule moves in both and the generator gains
  one nudged 03:00 slot for the comparison to reach it. The desk's browser
  inputs take their basal rows from `mockups/diagnose-workstation.synthetic/payload.json`,
  not from that generator, and a held slot does not move the lever the browser
  inputs borrow, so no browser leg moves.
- No QA case pins a held basal title: held rows live in clock windows, and the
  finding-title literals are whole-day only.
- #435's text was not available in this sandbox (no `gh`). At plan review the
  coordinator read its guard register from the issue (a plain verdict, the value
  against the bar, what would change it); ADR 465 decision 5 applies it.
- OpenSpec validates a second `## ADDED Requirements` section in one delta file
  but silently drops it (probed on a scratch copy), so #465's projection rule is
  a MODIFIED requirement appended after #463's.

## Decisions

- Option 1, no invented minimum step, never "leaning lower" (Connor,
  2026-09-24).
- The threshold check's tolerance, the kept `HARM_GATED` status with its own
  sentence and its words, the held row with no lower lean, and the generator
  slot that exercises the mirror. ADR 465, decided autonomously during the AFK
  run.
- Surface lifecycle `revise` (UI Craft router: shipped, runnable, complete
  declaration, manufactured data → `revise`). Contract:
  `mockups/harmonic-v2-desktop.behavior.md`, replayed by
  `frontend/desk-behavior.replay.mjs`. Sweep deferred to start: sandbox.
- Flat order although the multiple-artifacts, live-run, lockstep-copies and
  lifecycle-gated traits fire: the coordinator's slice plan fixes one lock per
  ticket and one start session, and it runs every browser leg itself. The
  nearby reviewer-memory anchors disagree (they split at the live run).
- Review depth Full: the change moves a harm verdict, the staging predicate's
  input, the deliverable schedule and the Plan.

## Review rounds

| Round | Blocking objections entering | Authoring change | Injected ground truth | Verdict |
|---|---|---|---|---|
| 1 | — | Initial flat draft pinned 2988a569 | Blockers (`authoring`): the threshold check did not say it reads the target before rounding, so settings such as 0.137 U/h would hold instead of taking their full step (reproduced: 0.137 steps to 0.11, 0.027 against 0.0274); Verification ran the complete ledger through `replay --base` on a commit that is not pushed; Verification omitted `acceptance.test.py` and `case-cache --check`. Note (`authoring`): the new sentence escaped the register guard. Coordinator ruling: #435's guard register (verdict, value against the bar). Fixed: ADR 465 decisions 1, 2 and 5 and task 41 compare before rounding, task 39 adds the 0.137 guards and safety 2 its scenario; the sentence now reads as a measured verdict; task 41 adds it to `basal_annotations()`; Verification names an ONLY= replay and both acceptance checks, and leaves the complete ledger to the coordinator's final commit. | BLOCKED (3 block, 1 note); fixed, no further panel by operator instruction |

## Start (AFK run, 2026-09-24)

- Revise pre-work (task 37), coordinator-run on #465's base 718fcf77: S113,
  S151, S152, S153, S183, S184 and S185 passed at 1280x720 and 1440x900. Renders
  of `basal-recurring-low-lower` (lane `down`/`recurring-lows`, panel "lower
  (recurring lows)", one Stage change) and `basal-recurring-low-gate` (lane
  `hold`, "holds at current", no Stage change), with their queue rows, showed no
  behavior without a story.
- Failing-first: tasks 39, 40 and 42's tests failed at their assertions on
  cc87c41c (task 38) and pass on the branch; S190 failed on cc87c41c with the
  branch harness at "S190 the 03:00 lane cell must read a hold, not a
  recurring-lows lower" and passes at both sizes on the branch.
- One autonomous decision beyond the lock's expected diff: the regenerated
  findings fixture's held 03:00 slot sits in the `quiet` window, so the Node
  queue test's pinned count moves from one collapsed row to two (ADR 465 — The
  fixture's held 03:00 slot moves one Node count).
- Budgets: the #465 section of `openspec/changes/qa-round-2/coverage-appendix.md`.
