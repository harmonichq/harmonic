# #414 — v2 desk: retain Diagnose across tab returns, record-open cost and loading, roster cleanup

Scope ledger. Opened 2026-09-14 by triage; route: interview mode.

## Decisions

- Split from #413 so the design round there stays small; #413 keeps the rail fold, lane key and paint, 24 h default, mini parity and the loading skeleton. Why: backend-adjacent, testable without a design round. `inline`
- Q1 Retention: Diagnose stays alive off-screen across navigation (mounted-but-detached workstation, no requests on return; window, drill and scroll retained). Why: the only shape that keeps the reader's window and drill without a rebuild; Day already retains its desk. Connor 2026-09-14. `inline`
- Q2 Roster grouping: in this ticket. The backend serves one group key per detected pump settings switch; the record list shows one entry per switch with its slot rows beneath. Why: 79 per-slot rows from a handful of decisions read as unrelated changes. Connor 2026-09-14. `→ ADR`
- Q3 Record-open loading: named text in the existing loading frame now ("Reading change records", "Computing reassessment"); the #413 skeleton replaces it later. Why: default taken on "I don't know"; the bounded read removes most of the wait. `inline`

## Open questions

- none

## Spawned tasks

- none yet
