# Scope ledger — #204, glucose-by-clock strip review

Opened during `/ticket triage 204`. Branch `204-review-glucose-clock-strip`.
Parent #203 (not an epic label; ordinary ticket). Harness merged (#252); the
`strip` story renders the shipped strip standalone.

## Decisions

- Grounded this session: the strip renders from shipped code
  (`frontend/chart-builders.js` envelope/strip path, mounted by
  `frontend/diagnose-workstation.js`; registry `frontend/diagnose-evidence-charts.js`
  is imported by the shipped workstation). Harness story `strip` ("Glucose by
  clock", range switch, no modes/sizes). ADR (#240): no chart settled until seen
  on the operator's real history. `inline`

- **Q1 = B: agent pre-audits first, then the attended pass.** Agent audits the
  strip against the ticket checklist (code + harness screenshots on manufactured
  data, both themes), posts findings; operator then drives the harness and his
  real history. Operator's attended time is the scarce input. `inline`
- **#258 rolls into this ticket and closes.** Operator ruled it. Its four open
  Dark defects (outside-window scrim wash, unapproved percentile-band outlines,
  median lowest-contrast, top-right legend artifacts) join the checklist as
  known-bad items — corrections, not review questions. #260 already landed the
  minimum Dark contrast repair; the design correction remains. Close #258 with a
  pointer when the order posts. `→ issue`
- **Q2 = A: corrections implemented under this ticket** — one PR on this branch,
  scoped to the strip's owner modules (`frontend/diagnose-workstation-chart.js`,
  `frontend/chart-builders.js`) and their public tests. Behavior-ledger
  amendment stays deferred to #214 per parent plan unless the replay itself
  breaks. `inline`
- **Q3 = A: a manufactured state the review needs may be added in this ticket**,
  with its generator and `--check` in the same change, per repo rule. `inline`

### Risk contract

- **Must prevent:** any real glucose/insulin/dose/timestamp or credential value
  reaching a commit, screenshot, CI log, or PR body; a correction that changes
  percentile data, band membership, slicing, or any analyzer-owned verdict while
  claiming to be visual; silent incorrect success (a green replay that asserted
  nothing).
- **Must recover:** nothing; no unattended process.
- **Accepted failure:** the attended real-history pass finds states the
  manufactured set cannot show — noted on the ticket, chart not settled, no
  automatic recovery.
- **Unsupported:** running the harness against a live vendor pull; settling the
  chart without the operator's real-history pass (ADR #240).
- **Evidence owed:** same-fixture before/after renders in both themes for any
  visual correction; public option/browser assertions for each corrected defect;
  fast gate + affected browser gates green.

Why: shipped advisory-dosing surface, one operator; exposure is real-data leakage
and semantic drift disguised as styling. Disposition: copied into the #204 work
order at admission.

- **Surface lifecycle: revise.** UI Craft router run this session
  (`{"mode":"revise","reason":"safe synthetic data source declared"}`). Safe
  start: the sanctioned `uv run harmonic serve --no-fetch --db
  mockups/revise-e2e.synthetic/harmonic.sqlite` plus the harness's manufactured
  switch. Frozen behavior ledger and replay:
  `frontend/diagnose-workstation-behavior.replay.mjs` (its header declares it
  the frozen ledger for the shipped Diagnose workstation; TARGET=app) with
  `PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json`. Ledger
  amendment deferred to #214 per parent #203 unless a correction changes a
  frozen story. `inline`

## Open questions

None. Frontier empty after round 1.

## Spawned tasks

None yet.

## Review rounds

- Panel 1 (Terra, 3 rounds): 6 authoring blockers R1, 2 authoring blockers R2
  (one injected-adjacent: the R1 legend fix left the contract vague), 1 injected
  blocker R3 (aria-label on a generic div, introduced by the R2 fix).
  Countersigned on rev4.
