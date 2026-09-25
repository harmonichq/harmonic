# An ended record answers a requested reassessment — triage and review ledger

Ticket: #462. Change: `openspec/changes/qa-round-2` (ADR 462; tasks 18–26;
outcomes requirements 1–2, surfaces requirements 3–4). Triage ran unattended
(AFK run, 2026-09-24).

## Reproduction

`uv run python docs/scope/462-record-comparison.repro.py`, at this change's base:

```text
1. c4-isf plus one unchanged pump read after the window
   record isf-all-20240601000000 ending expired_unreviewed at 2024-06-29 00:00:00; context pump read 2024-06-30 12:00:00
   Saved ending      same build: unavailable · context_after_ending, 0 periods, 0 outcomes, clock views no
                     after update: unavailable · context_after_ending, 0 periods, 0 outcomes, clock views no
   Retained context  same build: available, 2 periods, 4 outcomes, clock views yes, state unclear
                     after update: unavailable · unsupported_retained_execution, 0 periods, 0 outcomes, clock views no
   Current policy    same build: available, 2 periods, 4 outcomes, clock views yes, state context
                     after update: available, 2 periods, 4 outcomes, clock views yes, state context
2. c4-ic's superseded record: Trial period end against the ending instant
   record carb_ratio-all-20240601000000 superseded at 2024-06-10 09:00:00
   Saved ending      Trial period ends 2024-06-10 09:00:00
   Retained context  Trial period ends 2024-07-02 00:00:00 — after the ending
   Current policy    Trial period ends 2024-07-02 00:00:00 — after the ending
```

`node docs/scope/462-stage.repro.mjs` (record door over a fake transport):

```text
Original:  stage "Ending snapshot / as saved at the ending", figure unavailable, outcome row false, "No glucose outcome" true
current  : stage "Ending snapshot / as saved at the ending", figure unavailable, outcome row false, stage byte-identical to Original true
           Result: Context only · Context: Current policy: this is not a like-for-like comparison with the saved ending.
retained : stage "Ending snapshot / as saved at the ending", figure unavailable, outcome row false, stage byte-identical to Original true
           Result: Unavailable · the retained context was saved by a different version of the comparison · Context: Stored context 0123456789ab
```

## Decisions

- Draw a requested reassessment when the saved ending serves no periods; cut
  reassessment periods at the ending instant; drop or narrow the version gate,
  whichever is less code, with no migration. Connor, 2026-09-24.
- Issue option 1(a), not its recommended 1(b): no default open on Current policy.
  The dropped (not narrowed) gate, the Trial-only cut, the stage and Retained-line
  words, the one-rule move of `context_after_ending` into the comparison, and the
  `c4-isf-late-read` case. ADR 462, decided autonomously during the AFK run.
- Surface lifecycle `revise` (UI Craft router: shipped, runnable, complete
  declaration, manufactured data → `revise`). Contract:
  `mockups/harmonic-v2-desktop.behavior.md`, replayed by
  `frontend/desk-behavior.replay.mjs`. Sweep deferred to start: sandbox
  (Chromium dies at launch: `browserType.launch: Target page, context or browser
  has been closed`).
- Flat order although the rubric's multiple-artifacts, live-run and
  lifecycle-gated traits fire: the coordinator's slice plan fixes one lock per
  ticket and one start session, and it runs every browser leg itself. The nearby
  reviewer-memory anchors disagree (they split at the live run).
- Review depth Full: the change moves the retained-comparison contract and what
  every ended record serves.

## Review rounds

| Round | Blocking objections entering | Authoring change | Injected ground truth | Verdict |
|---|---|---|---|---|
| 1 | — | Initial flat draft pinned f985b3a6 | Note (`authoring`): Verification ran the whole pytest suite twice, once standalone and once inside the budget leg. Fixed: the standalone pytest line is dropped and the budget leg's pytest is the run of record. | CLEAN (0 block, 1 note) |
