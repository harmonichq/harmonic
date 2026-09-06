# Tasks

- [ ] 1. Add a fail-first regression through `finding_case_file.wrap`'s public
      interface: build a prepared case whose projection row carries two
      appearance families in family-name order, with the case file's family
      second. Assert the rendered row keeps both families, that its first
      appearance is the case file's own with the case file's count,
      denominator and noun, that the other family keeps the projection's count
      and denominator, and that the row's `headline` states the first
      appearance's count, denominator and noun. Observe it fail against the
      pre-change wrapper for the right reason — the pre-change row publishes
      one appearance and a headline naming the other family.
- [ ] 2. In `wrap`, build the anchored appearance from the prepared case
      summary, publish it as `appearances[0]` followed by the projection's
      appearances for every other family in the order the projection published
      them, and recompose `headline` through
      `findings_projection._finding_headline` after that update. Do not
      re-sort the list, do not change the composer, the projection's family
      sort or the sanctioned template, and leave the preparation's `findings`
      payload untouched.
- [ ] 3. Add `headline` to the changed-field allowlist in
      `tests/test_finding_case_file.py::test_named_field_wrapper_preserves_unknown_row_and_top_level_selection`,
      the test that pins which fields the wrapper may move.
- [ ] 4. Regenerate the committed synthetic Diagnose capture with
      `uv run python .claude/qa/gen_synthetic_fixtures.py mockups/diagnose-workstation.synthetic`
      and commit only `mockups/diagnose-workstation.synthetic/finding-case-files.json`,
      whose eight finding rows each gain the headline the wrapper now composes.
      The generator's other outputs are byte-identical; do not commit them.
- [ ] 5. Export the mirror's existing `findingHeadline` from
      `mockups/findings-projection.mirror.mjs` and make
      `frontend/browser-fixture-population.js` mirror the wrapped row
      faithfully: publish the case file's family first with the capture's
      counts, then the freshly projected appearances of every other family,
      and set `headline` from that list through the exported composer. Add a
      fail-first regression to `frontend/browser-fixture-population.test.js`
      proving both on the committed capture's two-family row
      `finding:correction_on_iob`. Do not restate the sentence in JavaScript;
      the mirror keeps one transcription.
- [ ] 6. Repoint `servedRows` in
      `frontend/diagnose-workstation-behavior.replay.mjs` at the preparation
      endpoint's `rendered_rows` and correct its comment, so S130, S132 and
      S139 compare against the array the rail and the stage actually render
      rather than the separate `/api/diagnose/findings` payload.
- [ ] 7. Add executable `C62` to that replay — a two-family rendered row keeps
      both families, leads with the case file's own, and its stage headline is
      composed from that lead — and amend
      `mockups/finding-evidence-routing.behavior.md`: record the `servedRows`
      source correction against S130, S132 and S139, issue `C62`, and update
      the issued and active executable ID counts and ranges. Write the ranges
      to what THIS branch issues — `C41-C57` and `C62`, not a contiguous
      `C41-C62` — and say in the amendment that `C58`-`C61` are reserved by
      sibling children of sweep #350, which reconciles the range when it
      integrates them. Flag the whole amendment **pending operator sanction at
      the #350 sweep pull request**. Do not write a sanction line the operator
      has not given, and do not renumber or retire any existing executable.
- [ ] 8. Run the verification gate to the measured expectations in the order,
      with zero failures.
