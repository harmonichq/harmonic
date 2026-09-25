# Warn before a stage replaces the staged setting — triage and review ledger

Ticket: #459. Change: `openspec/changes/qa-round-2` (ADR 459; tasks 11–18;
plan requirement 1). Triage ran unattended (AFK run, 2026-09-24).

## Reproduction

`node docs/scope/459-repro.mjs`, on main at e4862000:

```text
stage carb ratio -> true
stage basal 02:00 -> true
carb ratio still staged? false
stage basal 03:00 -> true
draft saves: [["ic@360","ic@480"],["basal@120"],["basal@120","basal@180"]]
```

The second save held only the basal row and answered a bare `true`; nothing
reported the carb-ratio change it dropped. A second basal slot kept the first.

## Fixture measurement

`uv run python docs/scope/459-compose-case.py`:

```text
basal asserting: [('03:00', 0.6, 0.54)]
ic asserting: [(0, [10.0], 9.0, [0])]
queue: [('basal_rate', 'assert', 'Basal 03:00 · lower'), ('carb_ratio', 'assert', 'Carb ratio 00:00 to 24:00 · lower')]
```

The frozen desk-suite analysis cannot serve the replacement: its carb-ratio
blocks carry no served direction, and the findings mirror throws on an
asserting one. The composed manufactured case serves both rows from real
analyzer output.

## Decisions

- One setting per Plan stays; warn before the press, naming the change it will
  replace. Connor, 2026-09-24, on the ticket.
- The control's words, its box, the shared replacement predicate and the
  re-seed after a settled save. ADR 459. The words and geometry were decided
  autonomously during the AFK run.
- Surface lifecycle `revise`, as for #460; sweep deferred to start (sandbox).
- Flat order, for the same reason as #460.

## Review rounds

| Round | Blocking objections entering | Authoring change | Injected ground truth | Verdict |
|---|---|---|---|---|
| 1 | — | Initial flat draft pinned 961de781 | Blockers (`authoring`): the story's failing-first base run on e4862000 would stop at `gen_qa_e2e_db.py --case` argument parsing, because the new case did not exist yet; the lock named no QA budget baseline and no home for the measurements. Notes (`authoring`): the replay selection missed S97–S99 and #460's story; the three new interfaces were unshaped; the story-count documents were outside the allowlist. Fixed: the case became task 11, committed alone as the base for task 16's run, which must fail at the pre-press "Replace staged change" assertion; Context states the harmonic-v2 appendix limits (400 s pytest) and task 11 appends a dated #459 section there; the replay selects the touched stories plus both new stories; `replacesDraft`, `replacing` and `replaces` are shaped in tasks 13–15 and ADR 459 point 3; the old re-seed task moved to #460's task 6. | BLOCKED (2 block, 3 note) |
| 2 | 2 | Round-1 fixes pinned 66725ae2 | Blocker (`authoring`): no test protected same-setting staging through `stageEvidence`, whose filter task 13 rewrites, and task 12 demanded that a test of today's behavior fail first. Notes (`authoring`): Verification omitted CI's `case-cache --check`, which the new case enters; the sandbox could not re-run the fixture measurement or strict validation. Fixed: task 12 was rewritten clean, with failing-first limited to `replacesDraft` and the stage control, and two `stageEvidence` guards (cross-setting, and 02:00 then 03:00 keeping both rows); `case-cache --check` joined Verification. | BLOCKED (1 block, 2 note) |
| 3 | 1 | Round-2 fixes pinned c5323bea | Blocker (`authoring`): the warning read only the served draft, so an unsaved Changes pick that Diagnose marks as staged was replaced without notice, or the warning named a different change than the marks. Notes (`authoring`): an already-staged check that could not fail first; the pytest-generated case filed under the Node gate; no budget command; a prerequisite on the #460 clearing re-seed. At the panel cap the coordinator resolved the blocker under the AFK scope rule. Applied: the warning reads `draftItems()` through `replacedDraftItems` (ADR 459 point 1), task 12 gained both failure cases as tests, the plan delta gained a scenario, the already-staged check moved under guards, the Expectation says pytest reports, and `acceptance.py budget` joined Verification. | BLOCKED (1 block, 4 note), resolved by coordinator |
