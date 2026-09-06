# Tasks

- [x] Seed the Diagnose workstation's staged basal, I:C and ISF marks from the shell's `callbacks.isStaged` verdict when the surface boots, so the dock, the lane and the parameter panel report the persisted Plan draft.
- [x] Give the app-only opener an opt-in stateful Plan-draft stub, leaving its default stateless empty draft unchanged for every existing story.
- [x] Register story `C59` in the behaviour ledger, marked pending operator sanction at the #350 sweep PR, and update the ledger's issued and active ID inventory lines to match.
- [x] Add `C59`'s replay function and register it in the replay's `STORIES` table: a change staged in Diagnose still reads as staged after a reload, and can still be un-staged from Diagnose.
