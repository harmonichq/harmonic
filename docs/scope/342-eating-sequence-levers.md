# Scope ledger — eating-sequence levers (#342)

## Decisions

- Chart workspace (operator, 2026-09-05): build and mock the chart family using the frontend chart design harness (`harness/`). The operator permits real or synthetic data; triage selects manufactured synthetic fixtures under the automated UI revision rules. Exercise the real chart modules through the harness, then verify their integration in the shipped Diagnose tile. Disposition: inline.

- Classification: code. Add High-carb sequence and Repeat eating as behavioral levers, their Patterns in the existing server-ranked Diagnose queue, and a fifth chart kind in the shipped tile. Source: issue #342 read 2026-09-05. Disposition: inline.
- Reuse the merged eating-window/sequence construction, pooled empirical quintiles, cohort eligibility, eight-qualifying-sequences-per-cohort floor, headline selection, fixed source window, report endpoint and frontend adapter. Disposition: inline.
- One lever per episode remains required. Repeat eating wins a tie with High-carb sequence. Precedence against existing levers remains open. Disposition: inline.
- No new section, evidence band, rail entry, drawer behavior, stage layout, glucose strip or dock behavior. Supersede the separate aggregate-section requirement and finding/lever/Priority prohibitions while preserving all tuning and safety exclusions. Disposition: inline.
- UI Craft setup/router returned `revise` for a shipped, runnable surface with a complete synthetic safe-start declaration. Execution must freeze/replay existing Diagnose behavior and carry design-record updates and synthetic before/after evidence. Triage has not launched the app. Disposition: inline.
- Scope route: interview. Grounding found that the report serves supported aggregate associations, whereas existing attribution walks episode anchors and picks the earliest actionable driver. At a meal, carb undercount precedes late bolus. The new levers need an explicit collision rule before drafting their integration. Disposition: inline.

### Risk contract

- Must prevent: any pump-setting change or Plan staging from these levers; a frontend-derived verdict, median or difference; real data in fixtures, tests, prompts or logs; a finding that fires on fewer than eight qualifying sequences per cohort; secret exposure; irreversible loss of authoritative data; silent incorrect success.
- Must recover: no new automatic recovery requirement.
- Accepted failure: a window with no supported cohort shows no finding. Rare recoverable operational failures stop clearly for manual recovery.
- Unsupported: live pulls, real-data fixtures, new pump-setting levers, new Diagnose surfaces or altered stage/dock/drawer behavior.
- Evidence owed: a test through the analyzer interface showing each lever's Pattern appears in the projection from N synthetic sequences and is absent below the floor; the chart kind rendered in the shipped Diagnose tile with the existing browser gates green; a collision test for the settled one-lever rule.

Why: behavioral advice must preserve the report's evidence floors and the existing dosing boundary. Disposition: copy into the authoritative change before admission.

## Open questions

- When a sequence also supports an existing meal finding (carb undercount or late bolus), which advice owns that episode? Proposed conservative default: preserve the existing attribution, allowing the new sequence levers only when no existing lever wins. This may withhold a sequence finding despite a supported aggregate association.
- After attribution is settled, ground the sequence-to-episode membership and recurrence population, then specify the coherent analyzer/projection/chart ownership and verification. These are dependent work, not settled contracts.
- No execution lock has been drafted, reviewed or posted. No issue status has changed.

## Spawned tasks

- Selected ticket: https://github.com/harmonichq/harmonic/issues/342
- No additional tickets or agents spawned.

## Grounding

- Base: aeb37c6a (fresh origin/main on 2026-09-05); #274–#277 are merged and archived.
- `ciq_autotune/analyzers/eating_sequences.py`: aggregate report, existing sequence primitives and supported adverse cohort selection.
- `ciq_autotune/analyzers/scenario/attribute.py`: earliest actionable driver and meal classifier precedence.
- `ciq_autotune/analyzers/scenario/levers.py`: closed taxonomy and per-lever metadata.
- `ciq_autotune/analyzers/scenario/engine.py`: episode grouping, recurrence and Pattern scoring.
- `ciq_autotune/findings_projection.py`: reads served episode attribution and Pattern Priority; window membership is consequence-anchored.
- `frontend/diagnose-eating-sequences.js`: merged served-value adapter.
- `openspec/specs/eating-sequences/spec.md` and `openspec/specs/surfaces/spec.md`: existing prohibitions and aggregate-section placement that #342 explicitly supersedes.
