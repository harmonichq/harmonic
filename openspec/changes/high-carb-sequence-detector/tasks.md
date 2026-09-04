## 1. Eating-sequence primitives and the high-carb detector

- [ ] 1. Add `build_report` and the read-only `build_eating_sequence_report` wrapper in the eating-sequences module. The wrapper derives the window from basal-or-CGM exactly as Scenario does, then slices bolus, CGM, and Carb-log streams to `[start, now)`; basal is solely a span-end anchor, never a modeling input. `build_report` treats received lists as complete window content and constructs no sequence outside its explicit bounds.
- [ ] 2. Populate high-carb Q5-versus-Q1–Q4 comparison rows, status, fixed aggregate-only summary, and deterministic headline selection; retain the repeat-eating skeleton for #276.
- [ ] 3. Add the deterministic synthetic event-stream builder used by both detector tests and the later fixture generator.
- [ ] 4. Add public-interface tests through `build_report` covering every construction, eligibility, scope, support, comparison, headline, and empty-report evidence anchor in the proposal, plus a basal delivery later than the last CGM reading setting the wrapper window end and otherwise-qualifying builder-stream events before the source window producing no sequence.

## 2. Serve and freeze the report

- [ ] 5. Add `GET /api/diagnose/eating-sequences`: bearer-token-gated, fixed Diagnose-window-only, `fixed_response` delivery from `("eating-sequences", window)` / `"eating-sequences-v1"` with `serve_stale=False`, without a new invalidation path.
- [ ] 6. Add API coverage for fresh cached report delivery (no `input_data_age` on fresh data, per the shared fixed-response semantics), 400 rejection of another integer window whose detail names the fixed window, framework query-validation refusal of a non-integer window, and missing-token refusal when a token is configured.
- [ ] 7. Add the production-shaped fixture generator and parity/provenance test, then commit a synthetic populated report with a supported Q5 comparison and non-null finding.
- [ ] 8. Add the generator `--check` to CI and update the AGENTS.md backend drift-check count and command list from twelve to thirteen.
