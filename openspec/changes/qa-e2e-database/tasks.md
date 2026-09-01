# Tasks

- [x] Record the QA E2E database decision and delivery reorder.
- [x] Inventory the current revise-E2E executable consumers and correct the
      existing-fixture premise.
- [x] Build the generator and shared case catalog in #191.
- [ ] Give the showcase era a dense 30-day background as a catalog primitive
      (5-minute CGM and delivered basal every day, daily carb-entered meal
      boluses, an overnight fasting stretch, and an earlier carb-ratio setting
      snapshot inside the window), composed with the two existing coverage
      recipes; regenerate the showcase expectation from analyzer output, never
      by hand, and keep both isolated coverage cases byte-for-byte unchanged.
- [ ] Commit `mockups/qa-e2e.synthetic/harmonic.sqlite` from the generator;
      turn the bare `--check` test from "fails closed while absent" into
      "accepts the committed artifact"; add the CI drift step for the QA
      generator with a three-minute step timeout; record the measured budgets
      for the dense store in the coverage appendix.
- [ ] Migrate the offline entrypoints to the QA store: the
      `.claude/launch.json` `harmonic-nofetch` entry and the AGENTS.md
      permitted no-fetch command serve a scratch copy of the committed store so
      the tracked file never changes; the AGENTS.md drift-check list and the
      harness README name the QA generator; the public-link pin and its test
      move to the QA path; sidecar and derived-store patterns are gitignored.
- [ ] After #192 and #193 add coverage eras, complete the remaining migration
      (CI browser-gates server, case-file route test, allowlist pin) and the
      evidence-based retirement of revise-e2e.
