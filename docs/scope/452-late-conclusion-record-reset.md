# #452 scope ledger — a later conclusion stays with its record

Triage worker ledger for the OpenSpec change `late-conclusion-record-reset`.
The coordinator decides under the Q3 delegation (Connor Griffin, 2026-09-23,
"figure it out yourself from here").

## Decisions

- **One place clears everything held for the open record** (coordinator ruling
  R452). Why: the three later-conclusion fields were cleared only on success
  and in `mount`'s different-record branch, which a roster press never reaches.
  → ADR (ADR 452, `openspec/changes/late-conclusion-record-reset/design.md`).
- **Add replay story S180 on c4-isf** (coordinator ruling Q1, 2026-09-23). Why:
  closes the ledger gap the later-conclusion form has carried since #411, in the
  built app. The two-record path stays at node level, because no case store
  serves two expired Trials. → ADR (ADR 452's Ledger section).
- **Reopening the same record from the roster starts empty** (coordinator ruling
  Q2, 2026-09-23). Why: going to the roster changes the open record to none, as
  the address door already does. → ADR (ADR 452, Decision 3).
- **Flat, targeted, surface lifecycle revise.** Why: the replay run is the only
  trait, and every port-bound leg is the coordinator's in this release. →
  inline (the lock).

## Open questions

None.

## Spawned tasks

None. This release files no follow-up issues.

## Review rounds

| Round | Verdict | Blocking | Notes | Tags |
|---|---|---|---|---|
| Plan review r1 (on `55b47258`) | Blocked | 1 | 2 | all authoring |

Round 1, each finding verified against the tree before it was fixed:

1. Blocking, authoring. The regression list missed six stories that reach
   `openRecord`. S54b presses a roster row. S92 and S94 finish through c3's
   `ending()`, which lands on the finished record. S53 and S57 retry a refused
   save into that landing. R17 runs C3's S52. Each has a live C3/C4 app body in
   the registry. Widened to twelve stories.
2. Note, authoring. `scripts/check_public_links.py` scans comments in shipping
   `.js`/`.mjs` files (`frontend/**` ships) for paths to tracked files the
   public tree excludes. A comment citing the spike or the change directory
   would fail CI. Added a rule to tasks.md and a trap to the lock.
3. Note, authoring. `selectedRecord` (the export and its header line) has no
   importer anywhere in the tree. Its deletion was added to task 1.1.
