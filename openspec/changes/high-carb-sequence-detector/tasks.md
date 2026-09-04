## 1. Eating-sequence primitives and the high-carb detector

- [ ] 1. Add `build_report` and the read-only `build_eating_sequence_report` wrapper in the eating-sequences module, using the Scenario source-window derivation and the pinned event construction, eligibility, scope, and aggregate rules.
- [ ] 2. Populate high-carb Q5-versus-Q1–Q4 comparison rows, status, fixed aggregate-only summary, and deterministic headline selection; retain the repeat-eating skeleton for #276.
- [ ] 3. Add the deterministic synthetic event-stream builder used by both detector tests and the later fixture generator.
- [ ] 4. Add public-interface tests through `build_report` covering every construction, eligibility, scope, support, comparison, headline, and empty-report evidence anchor in the proposal.

## 2. Serve and freeze the report

- [ ] 5. Add the fixed cached eating-sequences producer, token-gated fixed-window Diagnose endpoint, and fetch warm-roster entry without a new invalidation path.
- [ ] 6. Add API coverage for cached report delivery with `input_data_age` and rejection of a non-fixed source window.
- [ ] 7. Add the production-shaped fixture generator and parity/provenance test, then commit a synthetic populated report with a supported Q5 comparison and non-null finding.
- [ ] 8. Add the generator `--check` to CI and update the AGENTS.md backend drift-check count and command list from twelve to thirteen.
