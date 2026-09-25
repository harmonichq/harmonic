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

## Start evidence (2026-09-24)

Worker-run, sandboxed; every browser leg coordinator-run, unsandboxed, on
synthetic case stores.

- **Revise pre-work (task 18).** #462's touched stories (S49, S54, S54b, S91,
  S92, S94, S95, S96, S105, S110, S111, S112, S142, S143, S157, S180, R18) on the
  unchanged base 9648cdcb: `# executed 17 · failed 0` at 1280x720 and at
  1440x900. **Deviation:** task 18 asks for this pre-work before any design
  change; it ran after the implementation. It replayed the unchanged base, so
  what it recorded is the base's behavior, but the order cannot be recovered
  (code review round 1, note 3). It found no observed behavior without a story. S188's base run on 578ec3c7 is
  the inventory of the ended record's stage: "Ending snapshot / as saved at the
  ending", an unavailable figure naming the late-context reason, and a stage
  that stays the same after either reassessment is pressed.
- **Failing first.** Backend, on 578ec3c7: the retained-context version test
  `2 failed, 3 passed`; the ending-cut tests `3 failed, 2 passed` (Trial periods
  ending 07-02, after the 06-10 and 06-29 endings). Frontend: the reason words
  and the Retained line `ℹ pass 81 / ℹ fail 2`; the lifecycle stage test
  `ℹ pass 28 / ℹ fail 1`. S188 fails on 578ec3c7 at both sizes at its Current
  policy stage assertion.
- **Branch.** S188 passes at both sizes; the budgets are in
  `openspec/changes/qa-round-2/coverage-appendix.md`.
- **Renders (task 26).** The c4-isf-late-read record on Original and after
  Current policy, at both sizes, before on 578ec3c7 and after on a700330b,
  are handed to the coordinator uncommitted.
