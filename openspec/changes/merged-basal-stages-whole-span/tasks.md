# Tasks — A merged basal finding stages the whole span it names (#372)

## 1. Fan basal staging out over the served members

- [ ] Fail first: extend `frontend/diagnose-workspaces.test.js` so a merged
      two-slot basal finding is expected to map to both member slots, and record
      that it fails against the current single-slot filter.
- [ ] Let `stageItemsFor` accept the finding's served member start-minutes and,
      when given, build one Plan row per member whose own `/api/analyze` slot
      carries `asserts_move === true` with both `current` and `recommended`
      present. That filter is the single definition of an ELIGIBLE member for
      this change; nothing else may compute a second one. Called without members
      it keeps today's exact single-slot behaviour.
- [ ] Keep the existing guards passing untouched: a non-asserting slot stages
      nothing, an unstamped verdict stages nothing, and the stale aggregate
      `basal_rate` key stages nothing.
- [ ] Cover a merged run whose members do not all assert, and prove only the
      asserting members map into the Plan.

## 2. Make the Diagnose surface act and speak for the whole run

- [ ] Resolve a basal lane cell's owning finding from the live findings rows —
      the asserting basal row whose served `members` contain that cell's start
      minute — and never from the cell's clock span or the row title. The
      workstation already holds that projection in its own `findings`.
- [ ] Compute the eligible member set ONCE from that owning row's served
      `members`, filtered by each member's own served `/api/analyze`
      `asserts_move === true` with `current` and `recommended` present — the same
      predicate task 1 puts in `stageItemsFor`, read from the backend and never
      re-derived. Carry that set through the `stage` callback: today the
      workstation hands `callbacks.stage` only
      `{ family: 'basal', key: cell.slot.__planKey }`, and `__planKey` is
      `` `basal:${slot.slot}` `` (`frontend/diagnose-workstation-data.js:60`),
      which carries no membership at all — so the payload must additionally
      carry the owning row's member start-minutes, and `diagnoseStage` /
      `diagnoseIsStaged` must pass them into `stageItemsFor`. Add and remove from
      the local `staged` Set exactly the lane cells for the items
      `stageItemsFor` returns for that payload, so the surface's staged tally,
      the Stage change / Staged · Undo state, the lane's staged marks, the dock
      line and the Plan badge describe the one set the Plan draft holds.
- [ ] State the finding's span in the panel's reserved scope line whenever the
      panel's slot is one member of several, saying that staging acts on the whole
      run, and leave the panel's own numbers as that member's.
- [ ] Print the dock's number pair only where every staged slot agrees on it, and
      keep the staged span named in every case. The committed fixture cannot
      reach the disagreeing branch — its two merged members both carry
      `current: 0.85, recommended: 1.02` — so drive it from a story option that
      deep-copies `twoFamilyInputs()` and varies one member's `current`. Varying
      a served number is permitted; hand-setting `asserts_move` is not.
- [ ] Leave a single-slot finding's panel, dock line and staged set byte-identical
      to today.

## 3. Record and prove the revision

- [ ] Satisfy this change's `surfaces` spec delta end to end — every scenario in
      `specs/surfaces/spec.md` — and leave `openspec/specs/surfaces/spec.md`
      untouched, because a delta applies to the baseline at archive time.
- [ ] Amend the frozen Diagnose behaviour ledger for the merged-run staging and
      member-panel copy, keeping its issued and active executable-ID inventories
      consistent with the replay registry.
- [ ] Add the replay story as **C61** in
      `frontend/diagnose-workstation-behavior.replay.mjs` — its `STORY:` tag, its
      exported `C61`, and its `STORIES` registration — driving a merged asserting
      basal run against the built app: stage from the row, assert every eligible
      member reaches the Plan draft and the dock names the whole span, then undo
      and assert the draft is empty again. Include one assertion that the
      surface's own staged tally and the `PUT /api/plan` body name the SAME
      members. C58–C60 are reserved by sibling tickets of this sweep (#364, #354,
      #363); do not take them. Registering C61 also requires updating the ledger's
      issued (`164` → `165`, `C41–C57` → `C41–C57, C61`) and active inventories
      AND the compact guard `initialIssued` at
      `frontend/diagnose-behavior-ledger-parity.test.js:88`, which pins the issued
      list literally and fails otherwise.
- [ ] Collect base and revision renders of the merged-row panel and dock at the
      ledger's current locked viewports, with an evidence README and the raw
      command output, under this change's `evidence/` directory.
- [ ] Run the full six-command fast gate and the two browser legs this change
      touches, exactly as the work order's `Verification:` block names them.
