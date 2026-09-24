# #449 + #450 Focus behavior names and served reason words

## Status

**Triage source for #449, with #450 folded in.** An ordinary ticket change,
triaged on 2026-09-23 in the #442–#457 follow-up release. The inherited desk
revise contract (`mockups/harmonic-v2-desktop.behavior.md` and its replay
`frontend/desk-behavior.replay.mjs`) stays frozen; this change adds stories
S173–S176 and amends S46, S91, S92 and S93 in replay only, under the Q3
delegation (Connor Griffin, 2026-09-23) and coordinator rulings R449 and R450.
It retires nothing.

## Why

The Focus and change-record lines of Changes print names and codes the reader
cannot use:

- The Observed behavior row and the "What this Focus watches" fallback name the
  watched behavior from a nine-entry desk table. A Focus on High-carb sequence
  or Repeat eating prints its key (`high_carb_sequence`), and three names
  disagree with the Focus's own served name (Stacked corrections against
  Correction stacking, and two more).
- A closed Focus's ending prints `Unavailable · unavailable_adherence`; its
  behavior and harm cells print measurement codes such as
  `insufficient_measurement`; readiness prints `Not met — zero_opportunities.`
  and a bare `withheld`; an older record prints `legacy_not_recorded`.
- A refused finish or conclusion prints `stale_input_revision (409)`, and the
  same refusal on Plan or Focus pin prints "[object Object]".

Each was reproduced on the base (b03431d2) by `repro.mjs` and `premises.py` in
this change: node renders of hand-built synthetic payloads, and in-process reads
of the committed synthetic case stores.

## What changes

- The selected Focus read serves `lever_title`, the watched behavior's name from
  the one lever name source, or null for a lever outside the set.
- The Observed behavior row, the "What this Focus watches" fallback and a Focus
  record's "What changed" print that name; the desk's lever name table is
  deleted.
- The desk's one reason vocabulary gains words for every code the backend can
  serve on the ending, behavior, harm, readiness, admission and context lines,
  and those lines print through it. An unknown code still prints as served.
- Served states, opportunity verdicts, reassessment modes and the
  correction-clusters denominator on the same lines print as words.
- The Focus entry states why a Focus is not offered in words, including a
  pending Plan.
- A refused change write serves a sentence beside its code, and the desk's
  failure lines print that sentence.

## Not in this change

Which lever a Focus watches, pin eligibility, adherence measurement, readiness
criteria, ranking, staging, caps and floors. Codes in payloads, data attributes
and addresses. Changes' guidance disposition, set-aside rows that print subject
ids, and the Plan's "Priority" subject ids (offered to #451, coordinator
question Q2). Day links (#445), plain arrival to Changes (#446), later-conclusion
form state (#452), backfilled ending reasons (#442). Pump writes, real data
reads, vendor fetches.

## Impact

Backend: `ciq_autotune/watched_change.py` (the Focus read's name) and
`ciq_autotune/api.py` (the refusal sentence), with their tests. Desk:
`frontend/follow-up.js`, `frontend/history.js`, `frontend/focus-entry.js` and
`frontend/guidance.js`, with their node tests. Ledger and replay: the dated
amendment section, the c3 and c4 replays, the replay case map and registry, and
the acceptance inventory literals. No generator or committed fixture moves; the
exploration's `--check` is re-run because a backend module changed.
