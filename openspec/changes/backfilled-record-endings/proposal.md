# #442 Every retained change record ends

## Status

**Triage source for #442.** An ordinary ticket change in the #442–#457
follow-up release. Its decisions are the coordinator's ruling R442, made under
the operator's delegation (Connor Griffin, 2026-09-23, "figure it out yourself
from here"). The inherited desk revise contract
(`mockups/harmonic-v2-desktop.behavior.md` and its replay) stays frozen. A
dated `#442 amendment` section in that ledger adds S157 and amends S91 in
prose. The header's inventory line and the release freeze block are the
coordinator's.

## Why

Changes → View change record lists every setting change Harmonic has detected
on the pump. After the first reconcile of an existing history, most older
changes read "Still open · Not watched" and never change. Some were followed by
a later change inside their 28-day watch window. Others passed that window
months ago. None of them ever gains an ending.

Reconciliation records a Trial record for every detected change in the whole
history, but it considers an ending for only two of them: the admission
frontier record and the newest record. Every record between them keeps an
ending with no kind for good, so the roster reads it as open.

Reproduced in process on a synthetic store through the public reconcile path:
four detected correction-factor changes, each more than one watch window apart,
reconciled once. The newest ends `expired_unreviewed`; the three older records
stay open with no ending. The committed `c4-ic` case carries the same defect:
its 06-01 carb-ratio record is past its window, was followed by the 06-10
change, and is still open.

## What changes

- **One ending rule for every open record.** At every reconcile, each retained
  Trial record with no ending is evaluated, oldest change first, by the rule the
  frontier already uses. It ends `reverted` at the detector's reversal of its
  change. Otherwise it ends `superseded` at the earliest later detected change,
  outside its own Edit, that lands before its watch window closes. A multi-slot
  edit's records therefore never supersede each other. Otherwise, once the window has
  passed, it ends `expired_unreviewed` at the window's end. A record that meets
  none of these stays open. Endings stay first-wins and immutable. No new ending
  kind or open state is added.
- **A saved assessment reads only what was known at the ending.** Every Trial
  ending a reconcile records saves its assessment with the data read through
  the ending's own instant, not the reconcile time. One input cannot be bounded
  that way: the record's retained comparison context, captured when the record
  was first recorded. When that context comes from a pump read after the ending,
  the saved assessment is unavailable, with reason `context_after_ending`. Its
  words come from the desk's one word table, which the #449/#450 change owns and
  extends; that change integrates before this one. The unavailable assessment is
  built by the comparison's own exported envelope. The comparison's period-end
  label now says a period ends at the next relevant setting change even when
  that change is the ending instant. Periods and values do not move.
- **The superseded note stops naming "the same setting".** A later change of
  any setting ends a watch; the old note was already false for the live watch.
  The desk's note for a superseded ending no longer says the later change was to
  the same setting.
- **Proof.** Backend tests through the reconcile path, one new desk story
  (S157) on `c4-ic`, an amended S91, and the `edit-chain` case's four open
  records kept open by moving them inside their watch window.

## Not in this change

- Words for any comparison reason, including `context_after_ending`, and
  printing a saved ending's unavailable reason through the desk's word table.
  The #449/#450 change owns that table and its routing; this change adds no
  table entry.
- The comparison's periods, values and readiness criteria. The comparison
  module's only touches are the exported unavailable envelope and the one
  period-end label line.
- Caps, floors, staging predicates, admission, the admission frontier, Focus
  endings and Plan receipts.
- Pump writes, real-data reads and vendor fetches.
