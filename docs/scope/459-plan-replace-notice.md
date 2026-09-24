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
