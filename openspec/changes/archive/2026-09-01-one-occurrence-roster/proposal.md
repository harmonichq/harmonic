# Proposal — one occurrence roster for both Finding lists

## Why

The Finding case file renders occurrence lists two ways: the verdict-band roster
(occurrences grouped under the finding's verdict bands) and the response-comparison
roster (occurrences grouped under the server's named cohorts). Both build the same
presentation — a grouped header with counts, a button row per occurrence carrying
pressed state, one selection at a time, and an over-cap show-more control — as two
separate implementations that can drift apart. Ticket #298 arrived believing the
settings panels duplicated this too; they do not — the settings levels render only
numbers and staging. The duplication that is real is these two lists, and #291's
coming settings-side roster would have written the idiom a third time.

## What changes

- One occurrence-roster mechanism presents both lists. Grouping — verdict bands
  for one, server-named cohorts for the other — and each list's own row text stay
  where they are; the shared mechanism owns the grouped headers, the row buttons
  and their pressed state, single selection, and the show-more cap.
- No visual or behavioral change: both lists render exactly what they render
  today, proven by replaying the frozen finding-evidence-routing ledger with zero
  story amendments.
- The mechanism lives where node tests can reach it, so its selection and cap
  behavior are covered without a browser.

## Boundaries

Frontend only, plus the one static asset route the API must register for any
new frontend module: the server hands out frontend files through an explicit
per-file whitelist, and its route guard fails the fast gate (and the built app
404s the module) until the new module has its entry. No analyzer, projection,
API endpoint or payload change. The frontend
re-derives no floor, threshold, direction or safety verdict. The settings panels
(basal, correction factor, carb ratio) are untouched; #291 makes them the third
caller of this mechanism, and the cross-family panel #298's original text
described is refused until that caller exists.
