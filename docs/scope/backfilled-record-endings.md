# Scope ledger: #442 backfilled change records end

Ticket: harmonichq/harmonic#442. Change: `openspec/changes/backfilled-record-endings/`.
Base: origin/main b03431d2. Mode: delegated triage under the operator's Q3
delegation (Connor Griffin, 2026-09-23, "figure it out yourself from here").
Settled rulings come from the coordinator (R442); open decisions go to the
coordinator, never to the operator.

## Decisions

- **Every open retained Trial record ends by one rule, oldest first.** R442,
  settled. Kinds and order are the frontier's: `reverted`, then `superseded`,
  then `expired_unreviewed`; otherwise the record stays open. → ADR (ADR 442)
- **Endings stay first-wins and immutable; no new "recorded retroactively"
  state.** R442, settled. Store already refuses to replace a saved ending. inline
- **Plan receipts and `_reconcile_plan` output unchanged.** R442, settled. inline
- **A backfilled ending's saved assessment reads evidence only up to its ending
  instant; unavailable with a worded reason where that cannot be bounded.**
  R442, settled. The one comparison input the data cutoff cannot bound is the
  record's retained comparison context, captured at the reconcile that first
  recorded the record. When its source pump read is later than the ending
  instant, the assessment is saved unavailable with reason
  `context_after_ending`. → ADR (ADR 442)
- **R442 reverses ADR 386's "do not auto-finish or date them" clause for older
  records.** Recorded in ADR 442. A one-line supersession pointer goes beside
  the clause in `openspec/changes/harmonic-v2/design.md`, following the
  existing ADR 397 pointer. → ADR (ADR 442)
- **Any later detected change supersedes, whatever its setting.** Coordinator
  ruling on Q1, 2026-09-23 (R442 corrected): the frontier's actual rule. R442's
  "same setting" wording was an error; the old desk note was already false for
  the live watch. → ADR (ADR 442)
- **One cut rule for every reconcile ending, live frontier included.**
  Coordinator ruling on Q2, 2026-09-23. The live frontier's lost detection-lag
  days are recorded as a consequence. → ADR (ADR 442)
- **The superseded note is reworded in this change.** Coordinator ruling on Q3,
  2026-09-23 (fence widened). inline
- **This change adds no word-table entry.** Coordinator ruling, 2026-09-23: the
  #449/#450 change owns `comparisonReasonWords` and adds words for
  `context_after_ending`, the one reason code this change introduces. It
  integrates before this one. S157 asserts no reason-line words. → ADR (ADR 442)
- **A change inside the record's own ADR 414 Edit never supersedes it.**
  Coordinator ruling after plan review round 1, 2026-09-23 (R442 amended). It
  reuses the existing `_group_edits` grouping; the Edit's records end by the
  rule applied to the first change after that Edit, or expire at their own
  windows. → ADR (ADR 442)
- **The period-end label reads a next relevant run at the cutoff.** Coordinator
  ruling after round 1: one line in `follow_up_comparison.py`. Implemented as
  "a next relevant run exists" (`index + 1 < len(runs)`), because the literal
  `following <= cutoff` mislabels every period with no next run (`following`
  defaults to the cutoff); `premises.py` tabulates it. → ADR (ADR 442)
- **The unavailable assessment reuses the engine's exported envelope.**
  Coordinator ruling after round 1: the second and last touch in
  `follow_up_comparison.py`. → ADR (ADR 442)
- **Grounded default: supersession is read from this reconcile's detected
  changes, not from retained records.** The frontier rule reads its successor
  from the detected candidates. A hand-saved or vanished record never
  supersedes another. inline
- **Grounded default: the `edit-chain` case keeps four open records.** Its
  four hand-saved records move 14 days later (05-15, 05-22, 05-23, 05-24), so
  none is past its window at the case's data tail (06-01 23:59). The spacing
  and the ledger prose ("three records within a day … a fourth a week earlier")
  hold, and so do S110, S111, S112 and S143. inline
- **Grounded default: S91's readiness helper compares the page against the
  comparison the page shows.** An ended record shows its saved ending, not the
  retained read. Bounding c4-isf's and c4-profile's saved ending at 06-29 ends
  the coincidence S91 relied on. The amendment goes in the #442 ledger section. inline
- **Grounded default: one new story, S157, on c4-ic.** Its older record (06-01)
  is superseded at 06-10 09:00 by the same reconcile's later change. c4-ic is
  already inside S91's smoke closure, so the smoke slice does not move. inline
- **Shape: flat.** One slicing trait fired, a live run inside the ticket (the
  coordinator runs every port-bound leg under this release). A nearby
  reviewer-memory anchor disagreed; reconciled in the order. inline
- **Review depth: full.** The sensitivity floor applies: first-wins endings are
  irreversible durable writes. inline

### Risk contract

- **Must prevent:** rewriting a saved ending or reopening an ended record; a
  saved ending assessment that reads evidence after its ending instant
  (silent incorrect success); a record superseded by a change inside its own
  ADR 414 Edit; any change to a Plan receipt, the admission frontier, a Focus
  preemption, a staging predicate, cap or floor; any change to a comparison's
  periods or values; real data in any fixture, test or log; a retained Trial
  record other than one inside its watch window left open after a reconcile,
  except an Edit sibling waiting on the first change after its Edit.
- **Must recover:** nothing new. A reconcile that fails mid-pass commits no
  ending, as today (one follow-up transaction).
- **Accepted failure:** the first reconcile after upgrade on a long history runs
  one reversal scan per open record inside the reconcile transaction. It is
  slower once and loses nothing. A backfilled record whose retained context
  came from a later pump read saves an unavailable assessment; the reader still
  has the labelled reassessment.
- **Unsupported:** hand-edited follow-up rows; a retained context that claims
  available with no source pump read (read as "cannot bound").
- **Evidence owed:** reconcile-path backend tests. They cover the issue's
  failing-first case, same-setting supersession with its saved end reason
  `next_relevant_setting_change`, cross-setting supersession, a detected
  multi-slot Edit whose siblings never supersede each other, reversal
  precedence, expiry, first-wins across a second reconcile, the bounded cutoff,
  `context_after_ending`, and an unchanged Plan receipt. Also owed: the exported
  envelope byte-identical to `compare_follow_up`'s early return; the superseded
  note through the public renderer; S157 and amended S91 in the replay. The
  words for `context_after_ending` are evidenced by the #449/#450 change's
  `frontend/history.test.js` case for that code, not by this change.
- Why: endings are durable, first-wins and read as advisory history about
  dosing changes, so a wrong ending cannot be corrected later.
- Disposition: copied unchanged into the change's design.md (ADR 442).

## Open questions

None. Q1 (which later change supersedes), Q2 (cut rule for live endings) and Q3
(reword the superseded note) were answered by the coordinator on 2026-09-23 and
are recorded under Decisions.

## Spawned tasks

None. The release forbids follow-up issues; adjacent defects are fixed here or
handed to the coordinator.

## Review rounds

| Round | Blockers | Authoring | Injected | Notes |
|---|---|---|---|---|
| 1 | 3 | 3 | 0 | Multi-slot Edit self-supersession; same-setting ending loses its period-end reason; edit-chain's moved record missing from the premises expectation. Notes: name the unavailable-envelope route; point the words evidence at #449/#450. |
