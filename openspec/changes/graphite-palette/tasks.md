# Tasks — the graphite palette, second lock (#317)

## 1. Settle the values at the running app and land them (attended)

- [ ] Look before asking: serve the ticket worktree through the declared
      safe entrypoint and inspect shell, Diagnose, Verify, Day and Plan in a
      real browser at 1440×900 and 390×844 yourself, noting where each
      collision the change names actually renders; no question goes to the
      operator that a look at the running app could have answered. Then record
      the base: the ticket branch's merge-base with `origin/main`; spin a
      second worktree at that commit and serve it on a distinct port with the
      revise database; replay `frontend/cockpit-shell.browser.test.mjs` and
      `frontend/diagnose-workstation-behavior.replay.mjs` against it and
      record their applicable story counts.
- [ ] Inventory every reader of `--high` (`frontend/index.html`,
      `frontend/nav-chart.js`, `frontend/diagnose-evidence-charts.js`,
      `frontend/scenario.css`) and every surface that renders one beside an
      action control; render two or three candidate hues for `--high` on Day
      (hero chart, navigator, highs count, legend), Diagnose and the scenario
      screen with the operator, checking each candidate at a glance against
      the tokens ADR 317 names; commit the chosen value in the `:root` block
      with its sanction appended to `design.md`.
- [ ] Render the Verify trial ribbon at 32%/18% and at 20%/20% side by side
      on the same Trial through the Verify gate's fixture payload
      (`mockups/verify-660-story.synthetic/payload.json`, stubbed the way
      `frontend/verify-660-story-behavior.replay.mjs` stubs it; the opener is
      session scratch and is never committed); commit the chosen percentages
      in `frontend/verify-workstation.js` with the sanction appended to
      `design.md`.
- [ ] Look at Plan and Day with the operator; move the chrome bar one step
      only on the operator's ruling, editing `--ck-ground` in
      `frontend/shell.css` and `frontend/theme.css` together; either way,
      append the ruling to `design.md` and amend the "three materials"
      paragraph in `frontend/theme.css` to match.
- [ ] Regenerate the two verbatim extracts
      (`uv run python mockups/diagnose-evidence-canvas.exploration/generate.py`
      and `node mockups/finding-evidence-routing.exploration/build.mjs`) so
      both `--check` steps pass, and re-point `DESIGN.md`'s palette swatches
      and Data Semantics prose at the committed values.
- [ ] Restore `mockups/revise-e2e.synthetic/harmonic.sqlite` to its committed
      bytes before every commit; stage by path; run the fast gate and require
      zero failures.

## 2. Re-base the gates and the audit

- [ ] Re-base every fast-gate and browser-gate pin that names a moved value
      (`frontend/index.test.js`, `frontend/cockpit-shell.browser.test.mjs`,
      `frontend/diagnose-workstation.browser.test.mjs`,
      `frontend/diagnose-canvas-composition.browser.test.mjs`) to the
      sanctioned value; keep every other assertion byte-for-byte; where the
      bar moved, amend cockpit S6 in `mockups/cockpit-shell.behavior.md` with
      the sanction quoted and re-base its gate in the same commit.
- [ ] Re-run `mockups/finding-evidence-routing.exploration/contrast-audit.mjs`
      against the regenerated extract and commit its regenerated
      `contrast-report.json`; any pair that fails a floor returns to the
      operator under ADR 317 (floor wins unless sanctioned).
- [ ] Run the fast gate and all ten browser legs locally against the no-fetch
      server; require zero failures and no skipped story; record each leg's
      applicable story count in the commit message.

## 3. Evidence of record

- [ ] Copy `openspec/changes/archive/2026-09-01-dark-only-theme/evidence/identity-diff.mjs`
      to `openspec/changes/graphite-palette/evidence/palette-diff.mjs` and
      replace its sanction rules with the palette rule: a difference is
      admitted only when it is a colour-valued property, or a custom property
      named in the moved-token list, whose revision value resolves from a
      moved token; any element added or removed, any layout or typographic
      property that differs, and any state comparing nothing fails the run.
      Serve base and revision from two worktrees on distinct ports with the
      same revise database and record the exact commands and complete output
      under that evidence directory.
- [ ] Capture before/after renders of shell, Diagnose, Verify, Day and Plan at
      1440×900, 1280×800 and 390×844 from both worktrees into the evidence
      directory, and write the evidence README naming provenance and the
      moved-token list.
- [ ] Update `mockups/INDEX.md` with the #317 revision, the rulings and the
      evidence path.
- [ ] Tick each task above only when implemented and verified; run `/review`
      at Full depth and resolve every blocking finding before opening one pull
      request. Do not merge.
