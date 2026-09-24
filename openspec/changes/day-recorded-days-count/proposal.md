# #425 Day counts each recorded day once

## Status

**Triage source for #425.** An ordinary ticket change. The desk's frozen behavior
ledger (`mockups/harmonic-v2-desktop.behavior.md`) and its replay stay the revise
contract; this change adds one app-only story (S127) beside them, under the
operator's 2026-09-23 sanction for the #422–#434 checklists.

## Why

Day's "Recorded days" rail reads "N recorded days · <first day> to <last day>",
and a reader takes N as the whole history's count. It is not: N is the number of
days with data in whichever month reads the desk happens to have loaded, so paging
the Month calendar makes it grow while the served span beside it stays put. Each
month read also carries a week of the neighbouring months, and the desk joins the
reads without merging them, so a month's own "N recorded days" counts the
neighbour's overlapping week a second time once that neighbour has been read.

Reproduced in-process against `dayFrame` with synthetic padded reads (June 2024
missing one day, July 1–23; 52 days with data in all): the rail read 36 with June
loaded and 66 after paging to July over the same span; July's head read 30 instead
of 23, and June re-read as 36 instead of 29.

## What changes

- `/api/status` serves the number of days with data beside the first and last
  day, from the same read.
- The rail prints that served number, so it no longer depends on which months are
  loaded.
- The desk merges its loaded month reads to one row per day before anything reads
  them, so a month's head counts each of its own days once, and the week ribbon,
  the month cells and recorded-day stepping all read one row per day.
- One new desk story (S127) pins the count across month paging on the showcase,
  and the desk browser suite gains the issue's paging case.

## Not in this change

Any analyzer, classifier, cap, floor or staging rule. The first and last day on
`/api/status` keep their current meaning. The result cache (the status read is
not cached). Refreshing Day's status read after a fetch lands. Real-data reads and
vendor fetches.
