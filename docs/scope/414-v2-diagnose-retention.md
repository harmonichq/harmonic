# #414 — v2 desk: retain Diagnose across tab returns, record-open cost and loading, roster cleanup

Scope ledger. Opened 2026-09-14 by triage; route: interview mode.

## Decisions

- Split from #413 so the design round there stays small; #413 keeps the rail fold, lane key and paint, 24 h default, mini parity and the loading skeleton. Why: backend-adjacent, testable without a design round. `inline`
- Q1 Retention: Diagnose stays alive off-screen across navigation (mounted-but-detached workstation, no requests on return; window, drill and scroll retained). Why: the only shape that keeps the reader's window and drill without a rebuild; Day already retains its desk. Connor 2026-09-14. `inline`
- Q2 Roster grouping: in this ticket. The backend serves one group key per detected pump settings switch; the record list shows one entry per switch with its slot rows beneath. Why: 79 per-slot rows from a handful of decisions read as unrelated changes. Connor 2026-09-14. `→ ADR`
- Q3 Record-open loading: named text in the existing loading frame now ("Reading change records", "Computing reassessment"); the #413 skeleton replaces it later. Why: default taken on "I don't know"; the bounded read removes most of the wait. `inline`

## Open questions

- none

## Spikes

- `docs/scope/414-episode-chain.spike.py`: the ADR 414 chaining rule as a table test (six cases, passing).
- Local only (snapshot, counts only): a bounded per-record CGM read returns identical roster rows to the unbounded read for 79 records and is about ten times faster. Not committed.

## Review rounds

- Round 1 (cold Opus, read-only): BLOCKED, 7 blocking, all `authoring`, all reproduced against the tree. (1) last_written is fetch upsert counts, not a write signal → status serves input_revision; (2) "episode" collides with the glossary → "edit"; (3) disposition word needs no served key → STATUS_WORD entry; (4) retained return must not run restoreEntry; occurrence/window count as a different subject; (5) unretained candidates and Focus rows carry no key; (6) the edit entry's title was unspecified → "<count> setting changes"; (7) the candidate-detection CGM read stays, the test asserts per-record reads only. Fixed in the pinned source and the order; same reviewer re-checks the deltas.
- Round 2 (same reviewer, delta re-check): BLOCKED, 7 blocking: 3 `injected` (sub-order 2's Context still named last_written and the old subject rule; "editing edit" find-replace residue and a wrong glossary attribution; the spike path renamed in the citation but not on disk) and 4 `authoring` (Diagnose payloads carry input_data_age.revision, so the compare's left operand is that, not a guidance field; one-member edits must stay flat; parameters needs a {parameter, count} shape; S108's allowlist missed four reads → invert: only one status read allowed). Rewrite-clean signal fired: the affected sections were rewritten, not patched. Add Edit to CONTEXT.md (sub-order 1). Same reviewer re-checked: 2 mechanical residues in sub-order 3 and one note, fixed in place, COUNTERSIGNED.
- Round 3 (fresh cold Opus, no context): BLOCKED, 3 blocking + 2 notes, all `authoring`, all reproduced: the retained leave must be root.remove() only (leaveSurface resets the reading stack); the store read is half-open so the bound is [changed_at, end + 1 s) with an exact-end fixture reading; S112 needs a case with retained records (edit-chain); the pagehide arm keeps the full teardown (S84); the seated-navigation branch at diagnose.js:324 is dead and is deleted. Fixed in the pinned source and the order; same reviewer re-checks.

## Spawned tasks

- none yet
