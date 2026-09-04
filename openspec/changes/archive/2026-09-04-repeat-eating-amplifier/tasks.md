## 1. Repeat-eating amplifier detector

- [x] 1. Populate `repeat_eating_amplifier` in `build_report` through the shared
  quintile assignment and eligibility pass, carrying the same exclusions as the
  high-carb detector.
- [x] 2. Add the adverse finding condition, two-tier headline selection, and fixed
  TIR and glucose-spread templates for matched `3+`-versus-`1` comparisons.
- [x] 3. Extend the synthetic stream builder for multi-window sequences and
  regenerate the fixture through the existing generator, freezing both a populated
  high-carb finding and a populated repeat-eating finding.
- [x] 4. Add public-interface tests for every evidence anchor in the proposal.
- [ ] 5. Run the fast gate and `uv run python scripts/gen_eating_sequence_fixtures.py --check`.
