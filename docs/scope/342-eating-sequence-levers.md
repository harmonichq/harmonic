# Scope ledger — eating-sequence levers (#342)

## Decisions

- Operator approval (2026-09-05): “ok go for it” accepts observed-burden impact pricing, impact-based outranking with retained evidence, and recurrence-based Priority. Continue triage without another precedence interview. The concrete source/ownership proposal is in `openspec/changes/eating-sequence-findings/design.md`; it still requires mandatory review and baseline UI admission. Disposition: → ADR (recorded as ADR 342 in that change).

- Real-data investigation completed (2026-09-05): candidate overlap is substantial, but the tested held-out regressions and more closely matched cohorts do not establish a reliable intervention-impact winner. Retain observed-burden pricing as the grounded proposal; do not ship these exploratory regressions as a causal chooser. Details and limitations: `docs/scope/342-impact-research.md`. This is a research conclusion, not admission of an attribution design. Disposition: inline.

- Operator direction (2026-09-05): competing findings should be outranked by impact, using comparable pricing. Ground the choice in existing code and, where needed, the operator's real events; do not ask the operator to invent a precedence list. Research may prototype forecasting/model comparisons before the execution lock. Disposition: inline.

- Comparable pricing (operator, 2026-09-05): price both new findings on the existing shared Priority axis. Do not assign blanket queue precedence to existing meal advice. Grounded formula: `priority_score(impact, recurrence)` uses `round(100 * sqrt(impact * recurrence))`; behavioral inputs are normalized hypo-weighted outcome severity and Wilson lower-bound recurrence. Sequence occurrence identity and eligible recurrence population must be specified before pricing is admitted. Disposition: inline.

- Chart workspace (operator, 2026-09-05): build and mock the chart family using the frontend chart design harness (`harness/`). The operator permits real or synthetic data; triage selects manufactured synthetic fixtures under the automated UI revision rules. Exercise the real chart modules through the harness, then verify their integration in the shipped Diagnose tile. Disposition: inline.

- Classification: code. Add High-carb sequence and Repeat eating as behavioral levers, their Patterns in the existing server-ranked Diagnose queue, and a fifth chart kind in the shipped tile. Source: issue #342 read 2026-09-05. Disposition: inline.
- Reuse the merged eating-window/sequence construction, pooled empirical quintiles, cohort eligibility, eight-qualifying-sequences-per-cohort floor, headline selection, fixed source window, report endpoint and frontend adapter. Disposition: inline.
- One lever per episode remains required. Repeat eating wins a tie with High-carb sequence. Larger observed candidate impact now decides competition with existing levers; no blanket old-advice precedence. Disposition: inline.
- No new section, evidence band, rail entry, drawer behavior, stage layout, glucose strip or dock behavior. Supersede the separate aggregate-section requirement and finding/lever/Priority prohibitions while preserving all tuning and safety exclusions. Disposition: inline.
- UI Craft setup/router returned `revise` for a shipped, runnable surface with a complete synthetic safe-start declaration. Execution must freeze/replay existing Diagnose behavior and carry design-record updates and synthetic before/after evidence. Triage subsequently ran the documented synthetic safe-start and preserved the existing contract; evidence is in the active change. Disposition: inline.
- Scope route: interview. Grounding found that the report serves supported aggregate associations, whereas existing attribution walks episode anchors and picks the earliest actionable driver. At a meal, carb undercount precedes late bolus. The new levers need an explicit collision rule before drafting their integration. Disposition: inline.

### Risk contract

- Must prevent: any pump-setting change or Plan staging from these levers; a frontend-derived verdict, median or difference; real data in fixtures, tests, prompts or logs; a finding that fires on fewer than eight qualifying sequences per cohort; secret exposure; irreversible loss of authoritative data; silent incorrect success.
- Must recover: no new automatic recovery requirement.
- Accepted failure: a window with no supported cohort shows no finding. Rare recoverable operational failures stop clearly for manual recovery.
- Unsupported: live pulls, real-data fixtures, new pump-setting levers, new Diagnose surfaces or altered stage/dock/drawer behavior.
- Evidence owed: a test through the analyzer interface showing each lever's Pattern appears in the projection from N synthetic sequences and is absent below the floor; the chart kind rendered in the shipped Diagnose tile with the existing browser gates green; a collision test for the settled one-lever rule.

Why: behavioral advice must preserve the report's evidence floors and the existing dosing boundary. Disposition: copy into the authoritative change before admission.

## Open questions

- Resolve comparable impact empirically. The operator has directed impact-based outranking; the question is the supported measurement, not a preference poll. Current `attribute()` chooses the earliest driver, `model_view._anchor_state()` marks other matched anchors outranked, and `findings_projection._occurrence_verdict()` retains row-relative matches as fired even when another lever owns the episode. Preserve those evidence distinctions when specifying any change. The earlier blanket existing-advice-first proposal is withdrawn.
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

## Impact research preparation

- Initial snapshot transfer was rejected before execution. The operator then explicitly approved the full source/destination transfer on 2026-09-05. The WAL-safe snapshot was taken, read only, and the remote temporary copy immediately removed. Research findings: `docs/scope/342-impact-research.md`. Local snapshot and private row dataset were deleted after the study; the remote temporary copy had already been deleted.
- Inventory all classifier matches before attribution, and map them to eating sequences using the existing sequence construction. Summarize overlap and eligible counts without exporting event-level records.
- Reuse the shared hypo-weighted outcome severity as the comparison target. Giving each competing explanation the entire same episode severity cannot distinguish their contributions; do not call that an estimated incremental benefit.
- Compare simple matched-cohort estimates for high-carb and repeat eating against existing meal explanations, adjusting for the other behavior, time of day, baseline state and available treatment context where support permits. Preserve current coverage, overlap and carb-log exclusions and the eight-per-cohort floor.
- Evaluate predictive candidates on later held-out time blocks, with training-only cohort boundaries and separated overlapping outcome horizons. Compare against the existing outcome baseline, inspect support and winner stability, and report absence of a reliable distinction explicitly. Observational prediction does not establish the effect of changing a behavior.
- Keep exploratory scripts and event-level outputs in session scratch. Publish only aggregate findings and the eventual decision; build final chart evidence through the frontend harness using independently generated synthetic fixtures.
- Findings determine whether an implementation lock is supportable or whether further investigation is required. No forecasting model, ranking amendment or new precedence rule has been implemented or admitted.


## Plan review — round 1

Opus returned two authoring blockers and two authoring notes; no injected blockers.
Verified both blockers against the closed-set transcription test and the Python/JS
window-membership implementations. Expanded the allowed mirror/Guide paths and
specified explicit witness-minute precedence for both glucose directions. Clarified
Meals display affinity versus sequence recurrence, excluded sequence counts from
legacy clean-rate accounts and existing Verify trend tiles, and regenerated the
complete document inventory. These implement the settled impact and surface scope;
no precedence or risk decision was reopened. Same-reviewer delta check: COUNTERSIGNED at ffb50efb81f17629333d7f5b77c493f94716eba3; no remaining blockers. Two nonblocking implementation notes remain within task 2.1 and its existing ownership: case-file landing resolution also consumes the explicit witness; retain the existing outcome_minute return contract and withhold missing-witness sequence membership at projection admission.
