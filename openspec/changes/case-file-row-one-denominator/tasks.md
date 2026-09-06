# Tasks

- [ ] 1. Add a fail-first regression through `finding_case_file.wrap`'s public
      interface: build a prepared case whose projection row carries two
      appearance families whose first family and denominator are not the case
      file's, and assert the rendered row's `headline` states the same count,
      denominator and noun as its own `appearances[0]` and `case_header.summary`.
      Observe it fail against the pre-change wrapper for the right reason.
- [ ] 2. Recompose the rendered row's `headline` inside `wrap`, after the row's
      `appearances` and `episodes` are replaced, through the findings
      projection's existing headline composer rather than a second copy of the
      sentence. Leave the preparation's `findings` payload untouched.
- [ ] 3. Add `headline` to the changed-field allowlist in
      `tests/test_finding_case_file.py::test_named_field_wrapper_preserves_unknown_row_and_top_level_selection`,
      the test that pins which fields the wrapper may move.
- [ ] 4. Regenerate the committed synthetic Diagnose capture with
      `uv run python .claude/qa/gen_synthetic_fixtures.py mockups/diagnose-workstation.synthetic`
      and commit only `mockups/diagnose-workstation.synthetic/finding-case-files.json`,
      whose eight finding rows each gain the headline the wrapper now composes.
- [ ] 5. Run the fast gate's backend and frontend legs plus the demo-fixture
      drift check with zero failures.
