# Tasks — A merged basal finding stages the whole span it names (#372)

## 1. Fan basal staging out over the served members

- [ ] Fail first: extend `frontend/diagnose-workspaces.test.js` so a merged
      two-slot basal finding is expected to map to both member slots, and record
      that it fails against the current single-slot filter.
- [ ] Let `stageItemsFor` accept the finding's served member start-minutes and,
      when given, build one Plan row per member whose own `/api/analyze` slot
      carries `asserts_move === true` with both `current` and `recommended`
      present. Called without members it keeps today's exact single-slot
      behaviour.
- [ ] Keep the existing guards passing untouched: a non-asserting slot stages
      nothing, an unstamped verdict stages nothing, and the stale aggregate
      `basal_rate` key stages nothing.
- [ ] Cover a merged run whose members do not all assert, and prove only the
      asserting members map into the Plan.

## 2. Make the Diagnose surface act and speak for the whole run

- [ ] Resolve a basal lane cell's owning finding from the live findings rows —
      the asserting basal row whose served `members` contain that cell's start
      minute — and never from the cell's clock span or the row title.
- [ ] Stage and un-stage every member cell of that finding together, so the
      surface's staged tally, the Stage change / Staged · Undo state, the lane's
      staged marks, the dock line and the Plan badge all describe one set.
- [ ] State the finding's span in the panel's reserved scope line whenever the
      panel's slot is one member of several, saying that staging acts on the whole
      run, and leave the panel's own numbers as that member's.
- [ ] Print the dock's number pair only where every staged slot agrees on it, and
      keep the staged span named in every case.
- [ ] Leave a single-slot finding's panel, dock line and staged set byte-identical
      to today.

## 3. Record and prove the revision

- [ ] Satisfy this change's `surfaces` spec delta end to end — every scenario in
      `specs/surfaces/spec.md` — and leave `openspec/specs/surfaces/spec.md`
      untouched, because a delta applies to the baseline at archive time.
- [ ] Amend the frozen Diagnose behaviour ledger for the merged-run staging and
      member-panel copy, keeping its issued and active executable-ID inventories
      consistent with the replay registry.
- [ ] Add the replay story that drives a merged asserting basal run against the
      built app: stage from the row, assert every member reaches the Plan draft
      and the dock names the whole span, then undo and assert the draft is empty
      again.
- [ ] Collect base and revision renders of the merged-row panel and dock at the
      ledger's current locked viewports, with an evidence README and the raw
      command output, under this change's `evidence/` directory.
- [ ] Run the fast gate's frontend suite, the OpenSpec strict validation, the
      decision-record guard, and the Diagnose behaviour-ledger browser leg against
      the declared no-fetch QA server.
