# Design

## ADR 353 — The wrapped Finding row's headline is recomposed, not its counts left alone

**Context.** `finding_case_file.wrap` publishes `rendered_rows`, the array the
Diagnose queue and the evidence canvas both read. It replaces each finding
row's `appearances` and `episodes` with the prepared case file's summary and
keeps the findings projection's `headline`. The two numbers answer the same
question from two populations: the projection counts a family's in-window
occurrences from the exposures feed, while the case file counts its own
window-filtered roster, which `behavioral-layer`'s "One canonical opportunity
population owns every Finding case file" makes the owner of the denominator,
the attributed count and the roster.

**Decision.** The rendered row keeps the case file's counts, and its headline is
recomposed from those counts through the findings projection's own headline
composer. The alternative — stop replacing `appearances` and let the projection's
family counts stand on the rendered row — was rejected because it would move the
queue's detail line, the crumb meta and the drill statline off the population
that the behavioral-layer spec makes their owner, to fix a sentence. One row
publishes one denominator, and it is the case file's.

Recomposing through the projection's composer rather than restating the
sentence keeps one implementation of the sanctioned template
(`{verdict}. Showed up in {appearances[0].n} of {appearances[0].m}
{appearances[0].noun} in this window.`, sanctioned 2026-09-03 under
`## Headline templates` in the archived `2026-09-03-left-column-pattern` design
record). No new template is served and no new operator sanction is owed: the
same sentence is composed from the row the reader is actually shown.

**Consequences.** The preparation's `findings` payload is deliberately left as
the projection composed it, so `GET /api/diagnose/findings` and the rendered
rows can still report different denominators for the same finding. That is the
pre-existing two-population design, not a regression, and no surface renders
both: the queue and the canvas read `rendered_rows` alone. A future change that
renders the projection payload directly inherits that divergence.

The committed synthetic Diagnose capture's projection rows are hand-built and
never ran the projection's headline pass, so they carried no headline for the
wrapper to preserve; recomposing gives them one and the capture is regenerated.
The three fixture-driven browser gate legs and the behaviour replay were run
against the change and stay green.

## Measured before drafting

Every command below was run in a clean worktree at `origin/main` b8f4a71, with
the one-line recompose applied and the capture regenerated. No operator
snapshot was read; the reproduction is a hand-built synthetic preparation.

- Reproduction, no browser and no database: a `PreparedCases` whose projection
  row carries `appearances` `[{correction_clusters, 1 of 73}, {lows, 1 of 8}]`
  and a six-member lows roster with one claimed. Pre-change, `wrap` published
  `appearances [{lows, n 1, m 6}]` beside the headline
  `Ranks among this window's findings. Showed up in 1 of 73 correction clusters
  in this window.` Post-change the same row reads `... 1 of 6 lows in this
  window.`, and the preparation's `findings` payload keeps the projection's
  sentence.
- `uv run python -m pytest -q` on the clean branch, before any edit:
  `2227 passed, 1 skipped, 185 warnings, 120 subtests passed`. That is the
  baseline the verification expectation counts up from.
- `uv run python -m pytest -q` against the pre-regeneration tree: exactly two
  failures, `tests/test_check_demo_fixtures.py::RealEndToEndTest::test_real_check_passes_on_unmodified_tree`
  and `tests/test_finding_case_file.py::test_named_field_wrapper_preserves_unknown_row_and_top_level_selection`,
  the second reporting `Extra items in the left set: 'headline'`. Both are the
  tasks above; nothing else in 2225 tests moved.
- `uv run python scripts/check_demo_fixtures.py` named the regeneration
  command itself, and regenerating changed one file by eight added lines — one
  headline per finding row in
  `mockups/diagnose-workstation.synthetic/finding-case-files.json`. The
  generator's six other outputs were byte-identical.
- `node --test 'frontend/**/*.test.js'`: 589 pass, 0 fail, with the
  regenerated capture.
- Three browser gate legs on the regenerated capture, all green:
  `frontend/diagnose-workstation.browser.test.mjs` (60 pass),
  `frontend/diagnose-canvas-composition.browser.test.mjs` (14 pass), and
  `frontend/cockpit-shell.browser.test.mjs` (14 pass, 2 skipped).
- Both synthetic servers already agree headline-to-appearances on every window
  preset, so no served sentence moves on the QA showcase or the revise-e2e
  database and the behaviour replay's S132 — which compares the stage card
  against `GET /api/diagnose/findings` — sees identical strings either side of
  the change.
