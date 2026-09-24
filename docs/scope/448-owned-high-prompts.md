# #448 scope ledger — owned-High prompts

Start-worker ledger for #448 (change `owned-high-prompts`), opened at start at the
release coordinator's direction. It executes `EXECUTION LOCK v2 448 1`, pinned to
`ccb30365` over `origin/main` b03431d2. Every shape here is synthetic.

## Decisions

- **R448, coordinator ruling under Connor Griffin's 2026-09-23 delegation.** A High an
  over-treated low owns raises no missed-meal prompt, and the queue reads
  `Attribution.owned_highs` rather than making a second judgment. Late bolus and carb
  undercount pass `scenario_config` to the context gate. Ownership is not narrowed.
  The ruling was widened twice: to the Guide and Glossary definitions, then to the
  sequence-winner rebuild. Settled; not re-litigated. → ADR (ADR 448 in
  `openspec/changes/owned-high-prompts/design.md`).
- **Owned Highs match the queue's own High anchors by value.** Why: `owned_highs`
  lists only real High-run anchors (`rebound_nadir_bg` is None). No segmentation pass
  rewrites one: the only new `Anchor` is the synthesized #155 High-moment, and it
  never enters `owned_highs`. The exposures producer's uncaused tally already matches
  this way. inline.
- **The two classifier comments name their own branch**, ending "which a
  spike-chase is not" and "which chasing a runaway high is not". The old ending was
  "which a rise is not". Why: an over-treated low's rebound is a rise, so that ending
  would contradict the two-source definition the comments now give. inline.
- **The sequence-won test finds the High's Episode with a half-open interval.**
  Why: on that week the low's Episode (ep-033) ends at 12:55, the same instant the
  High's Episode (ep-034) starts. inline.

## Fail-first record

| Task | Test | Base | Task 2.1 alone | Final |
|------|------|------|----------------|-------|
| 1.1 (a) | slow rebound after a sub-70 low | missed-meal asks at 15:50 and 16:30 beside the 14:00 low | pass | pass |
| 1.1 (b) | near-low rebound | missed-meal asks at 15:05 and 15:50 | pass | pass |
| 1.2 (a) | unbolused rise, no low | pass (control) | pass | pass |
| 1.2 (b) | rise after the rebound settles | pass (control) | pass | pass |
| 1.2 (c) | a refuted low frees its High | `TypeError`: no `low_answers` keyword | pass | pass |
| 1.3 | store: a known `no` restores the question | missed-meal already served before the `no` | pass | pass |
| 1.3 | store: a late `no` does not restore it | missed-meal already served | pass | pass |
| 1.4 | late bolus, configured gate | configured verdict still matched (both cases) | — | pass |
| 1.4 | carb undercount, configured gate | configured verdict still matched (both cases) | — | pass |
| 1.5 | catalog `upstream_cause` body | gate-only wording served | — | pass |
| 1.5 | Glossary Quiet "explained" clause | gate-only wording served | — | pass |
| 1.6 | sequence-won week | queue asks at 06-06 12:55 | queue still asks at 12:55 | pass |

## Review rounds

- Triage: plan review countersigned the lock (panel 1 round 2; a fresh cold panel 2
  round 2), as relayed by the coordinator.
- Start review round 1 (Full depth, on `4e73b4cd`): converged clean, as relayed by
  the coordinator. No finding; no fix round.
- Task 3.4 (renders) stays unticked: the coordinator captures it in the release's
  integration render batch.
