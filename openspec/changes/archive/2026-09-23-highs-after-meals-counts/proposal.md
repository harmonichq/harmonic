# #424 Highs after meals counts

## Status

**Triage source for #424.** An ordinary ticket change, triaged on 2026-09-23 on
origin/main a4d374a7 as one of the thirteen issues of the #422–#434 desk bug
release. The desk's frozen behavior ledger
(`mockups/harmonic-v2-desktop.behavior.md`) and its replay
(`frontend/desk-behavior.replay.mjs`) stay the revise contract; this change adds
stories S124–S126 beside them and amends S115.

Sanction: Connor Griffin, 2026-09-23, in the release coordinator session, answered
"Q1 A, Q2 A, defaults all fine, go" to: "Can your reply here count as sign-off for
the UI copy and tone changes? … Yes. I record your answer as the approval for every
change these 13 checklists call for, and write the wording in CONTEXT.md terms."
That is the dated sanction for every shipped-surface revision and ledger amendment
below, and for nothing outside #424's checklist.

## Why

On a Pattern case file the header, the verdict band, the Response comparison
caption, the cohort sections and the folded cause lines each count the same
Occurrences, and a reader cannot make them agree. Reproduced in-process on
synthetic data (see `design.md`, "Reproduction"):

- The caption's "not comparable" count is the roster minus Matched and Nearly
  matched. When the comparison is drawn from the case file's own population, that
  is exactly the comparison cohort again, so the caption counts it twice and sums
  past the denominator. It also reuses the band's word for no data (ADR 41) for a
  different number on the same screen.
- The caption hard-codes "comparison" while the section heading uses the served
  cohort name ("Other meal opportunities").
- The band says Meets criteria and Borderline; the cohorts say Matched and Nearly
  matched; nothing says they are the same Occurrences.
- A folded cause prints only its own count sentences, so a Pattern's causes never
  show a count on the Pattern's own population: Lows after correcting highs reads
  2 of 2 lows while its one cause, Correction stacking, reads 2 of 8 correction
  clusters.

## What changes

- The case file serves the count of roster Occurrences in none of the three event
  cohorts (`outside_comparison`) in place of the roster leftover. It is zero for
  every comparison drawn from the case file's own population and non-zero only for
  Missed / unannounced meal, whose comparison cohort is announced meals.
- Each event cohort serves the verdict-band state it holds exactly, when it holds
  one, so the desk can link Matched to Meets criteria and Nearly matched to
  Borderline once without deriving the link.
- The caption names every served cohort by its served name and count, links the
  band's words once, and prints "outside the comparison" only when that served
  count is non-zero. The band's "not comparable" keeps ADR 41's meaning.
- A cause folded under a Pattern serves a count on the Pattern's own population:
  the Pattern's claimed Occurrences, each credited once to the first of its rate
  levers that claims it, so the folded counts add up to the Pattern's count. Its
  counts on any other population are served as outside the Pattern's count, and
  the fold sets them apart. Under a Pattern that serves no count of its own, no
  share is served and all of a cause's counts are outside it.
- The "claimed by another factor" meals of a Pattern case file are confirmed by
  code to sit outside the Pattern's claimed count, so the header's "not
  attributed" is right; a test pins it. The words for that state belong to #423.

## Not in this change

Any classifier, cap, support floor, admission, attribution, staging, tier, rank or
Pattern rate change. The comparison populations settled by ADR 180 and ADR 202.
The cohort names themselves, which the desktop lock (HV2-18) freezes. The words
"claimed by another factor" and any shared claimed word (#423). Meal facts on
Occurrence rows and the selected Occurrence's reason (#432). The Pattern chart's
key, readout and inks (#437). Pump writes, real data reads, vendor fetches.
