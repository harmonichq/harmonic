## 1. Eating-sequence primitives and the high-carb detector

- [ ] 1. Add `build_report` and the read-only `build_eating_sequence_report` wrapper in the eating-sequences module. The wrapper reads bolus, CGM, Carb-log, and basal streams, using basal solely to derive the Scenario source window and never as a modeling input.
- [ ] 2. Populate high-carb Q5-versus-Q1–Q4 comparison rows, status, fixed aggregate-only summary, and deterministic headline selection; retain the repeat-eating skeleton for #276.
- [ ] 3. Add the deterministic synthetic event-stream builder used by both detector tests and the later fixture generator.
- [ ] 4. Add public-interface tests through `build_report` covering every construction, eligibility, scope, support, comparison, headline, and empty-report evidence anchor in the proposal, plus a basal delivery later than the last CGM reading setting the wrapper window end.

## 2. Serve and freeze the report

- [ ] 5. Add `GET /api/diagnose/eating-sequences`: bearer-token-gated, fixed Diagnose-window-only, `fixed_response` delivery from `("eating-sequences", window)` / `"eating-sequences-v1"` with `serve_stale=False`, and fetch warm-roster entry without a new invalidation path.
- [ ] 6. Add API coverage for cached report delivery with backend-owned `input_data_age`, 400 rejection whose detail names the fixed window, and missing-token refusal when a token is configured.
- [ ] 7. Add the production-shaped fixture generator and parity/provenance test, then commit a synthetic populated report with a supported Q5 comparison and non-null finding.
- [ ] 8. Add the generator `--check` to CI and update the AGENTS.md backend drift-check count and command list from twelve to thirteen.
