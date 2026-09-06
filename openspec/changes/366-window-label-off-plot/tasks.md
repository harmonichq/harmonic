# Tasks — Anchor the Diagnose window label inside the glucose strip's own ruler (#366)

## 1. Pin the defect with a failing test

- [ ] Add one test to `frontend/diagnose-workstation-chart.test.js`, named for
      issue 366 in the file's existing `#<issue> · <sentence>` style, that calls
      `renderCanvas` and reads the emitted option's `__context` series.
- [ ] Derive the injected `range` inside the test by calling the shipped
      `stripGlucoseRange` on the test's own envelope. Do not write a range
      literal: ten of the twelve `range:` injections in that file are
      `[40, 300]`, the one ruler in the tree tall enough to hide this defect,
      and that is why the suite was green. The other two are `:266`, which
      injects `[60, 220]`, and `:325`, which already derives
      `stripGlucoseRange(envelope)` (resolving to `[60, 200]`) — and both stay
      green, because neither asserts anything about the label. A derived ruler
      is necessary here and not sufficient; the assertions below are what close
      the hole.
- [ ] Cover three cases in that test: a window too narrow for its name at a
      narrow element width; a window whose thinnest bin is below the support
      floor, whose parked label must still carry the
      `INSUFFICIENT SAMPLE — thinnest bin holds` text; and a window that wraps
      midnight, whose `CONTINUES` marker rides the same anchor.
- [ ] In each case assert that every `markPoint` datum's anchor value equals
      `option.yAxis[0].max`, read back from the emitted option rather than from
      the injected literal, so the test reads the axis the chart actually drew.
      Assert equality, not a `<=` bound: the ceiling is the one value that seats
      a label on the inside placement's line, and a bound admits every value
      beneath it as well.
- [ ] Assert the placement fields that put the two labels on that line: the
      parked datum keeps `position: labelSide` and `distance: 6` and carries
      `verticalAlign: 'top'` with `offset: [0, 5]`; the `CONTINUES` datum keeps
      `position: 'insideTop'` and `distance: 5`.
- [ ] Run the test against the unchanged module and record that it fails on the
      anchor assertion — not on a missing property, a thrown error, or a
      formatter mismatch.

## 2. Anchor the parked label on the plot

- [ ] Replace the `LABEL_Y` constant in
      `frontend/diagnose-workstation-chart.js` with the resolved field range's
      upper bound — `range[1]`, the value `renderCanvas` already sets as
      `option.yAxis[0].max` — so the reserved band tracks the ruler instead of
      assuming one, and retire the constant.
- [ ] Apply the same anchor to the wrapped window's `CONTINUES` marker, which
      shares the constant. It keeps `position: 'insideTop', distance: 5`, which
      is the inside placement's own placement statement over a `markArea` that
      carries no `yAxis` bound and so spans the full axis — at the ceiling the
      two texts therefore share a top edge by construction.
- [ ] Seat the parked label on that same line. `position: labelSide` centres the
      text vertically on its anchor, so at the ceiling it would straddle the
      plot's top edge rather than sit under it; give its label
      `verticalAlign: 'top'` and `offset: [0, 5]` — the inside placement's own
      distance — so the two text tops land on one line and the resize grips stay
      seated below the label's line, as the predecessor inventory's P02 row
      records.
- [ ] Leave the fit/no-fit decision, the tail-shedding order, the chosen side,
      the label wording, the rich-text tags and the order of the `markPoint`
      data entries exactly as they are. The exploration harness reads the parked
      label at data index 0.
- [ ] Update the reserved-band comment so it describes the anchor the module now
      uses.

## 3. Verify

- [ ] Run the repository's six-command fast gate and confirm each tail:
      `uv run python -m pytest` (after `uv sync --frozen --extra api --extra
      sync`); `node --test 'frontend/**/*.test.js'` →
      `ℹ tests 590` / `ℹ pass 590` / `ℹ fail 0`;
      `npx --yes @fission-ai/openspec@1 validate --all --strict`;
      `python3 scripts/check_adr_numbers.py`;
      `python3 scripts/check_owned_identifiers.py`;
      `python3 scripts/check_public_allowlist.py`.
- [ ] Confirm the new test now passes for the same reason it failed.
- [ ] Commit on the ticket branch and stop. Do not open a pull request; the sweep
      in issue 350 lands one pull request for every child.
