# Scope ledger — missed-meal comparison redesign (#178)

Session origin: #135 triage session, 2026-08-24/25. Predecessor grounding: the
missed-meal handoff (local, ephemeral) whose citations were re-verified against
current origin/main this session; verification report restated in #178's body.

## Decisions

- **Missed-meal cohort = highs attributed to Missed / unannounced meal**, not
  classifier matches. Why: attribution winners are the Finding's claimed
  evidence; matches include highs another factor owned. `inline` (issue body)
- **Baseline = all completed carb-bolus meals regardless of outcome.** Why:
  conditioning on a subsequent high recreates the rejected selection bias.
  `inline` (issue body)
- **Anchors: missed meals on detected rise onset (Anchor.reach_start),
  announced meals on completed carb-bolus time; fixed [-60, +300] window, no
  union axis.** Why: both cohorts align on meal-start moments; the fixed window
  kills the sparse lead-in at the root. `inline` (issue body)
- **Attribution account and five-state verdict taxonomy untouched; decision 6
  in diagnose-finding-case-files amended explicitly, not contradicted.**
  `inline` (issue body)
- **Surface lifecycle: revise.** Frozen ledger
  `mockups/finding-evidence-routing.behavior.md`; replays
  `frontend/diagnose-workstation-behavior.replay.mjs` (C44 family, S32–S39) and
  `frontend/diagnose-event-comparison-behavior.replay.mjs` (S3, S7–S9, S13).
  missed_meal has no event lens today, so the event view is new coverage plus
  amendments where cohort labels/axis semantics move. `inline`

### Risk contract

- Must prevent: implying the comparison's populations are other than declared
  (baseline conditioned on highs, matches served as attribution); any change to
  staging verdicts or the attribution account; real data in committed fixtures;
  silent empty cohorts served as inspected evidence.
- Must recover: none automatic.
- Accepted failure: a window with zero attributed missed meals renders an
  explicit empty state; no automatic fallback to classifier matches.
- Unsupported: arbitrary history ranges (#138's question); Highs support in the
  legacy standalone event-comparison endpoint beyond what this ticket adds.
- Evidence owed: public-API tests on synthetic fixtures for both cohort
  populations, anchor timestamps, and the fixed window; ledger amendment +
  replay green; drift --check for any new/changed fixture generator.
- Why: this chart is evidence in a dosing conversation; a wrong population under
  a right chart is the failure that matters. Disposition: #178 (authority).

- **Roster/selection semantics: the shared cohort/occurrence taxonomy, unchanged.**
  Announced meals are a cohort whose members are ordinary occurrences —
  selectable rows, server-owned traces — exactly as the meals family already
  renders completed carb boluses today. No bespoke selection semantics; the
  baseline cohort does not join the High roster, it stands beside it as its own
  cohort. Why: user ruling 2026-08-25 — the taxonomy already answers this;
  inventing a variant was the wrong question. `inline` (work order)

## Open questions

(none — frontier emptied)

## Spawned tasks

- (none yet)
