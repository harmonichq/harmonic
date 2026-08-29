# Diagnose Dark retheme — synthetic rendered evidence

## Provenance and commands

All captures use the committed synthetic Diagnose payload
`mockups/diagnose-workstation.synthetic/payload.json` and the generated
synthetic database `mockups/revise-e2e.synthetic/harmonic.sqlite` (fixed seed
620 in `scripts/gen_revise_e2e_db.py`). No patient-derived material is present.

Base commit: `9564cd378dabb640a3f814115d9ab0131012910c` (detached,
`Triage dark Diagnose retheme`) in `/Users/connor/worktrees/harmonic/255-base`.
All `dark/base` and `light/base` PNGs were recaptured from this checkout.

Revision commit: `57738da73c5a6e5b9b2a8cb960003d0ddf44b923` in
`/Users/connor/worktrees/harmonic/255-c3`. Its shipped revision includes the
Dark expected-color correction in `frontend/diagnose-workstation.browser.test.mjs`.

Each safe server was started once and terminated after the runs:

```sh
uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite --port 31783
uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite --port 31782
```

The unchanged replay ran with `BASE_URL=http://127.0.0.1:31783` and `31782`,
respectively, plus `TARGET=app`, the payload above, the documented Playwright
module, and vendored Vue/ECharts directory. Both outputs ended
`app: 141 of 141 stories passed`; the app fixture opener made no unstubbed
request and browser console/request assertions were clean.

Dark captures used the same documented browser test invocation with
`DIAGNOSE_SCREENSHOT_VARIANT=base|revision` and the Dark root below. Light
captures first ran `eval "$(python3 scripts/ensure_browser_gate_env.py)"` in
each checkout, then used the exact documented command with the Light root
below. Base captures were written directly to this chunk's evidence roots from
the true-base checkout; the integrated ticket worktree was not used.

## Matrix roots and verdict

- `dark/base/` — the true base has the old green-field Dark surface and its
  heavier, less-separated material hierarchy.
- `dark/revision/` — the revision visibly replaces that field with distinct
  near-black/brown Dark material roles while retaining rails, vessel edges,
  dock states, and quieter carb-ratio strands.
- `light/base/` and `light/revision/` — the true-base and revision captures
  remain materially consistent; no Light design ruling changed.

The `build/typical` captures are present at 1440x900 and 1280x800 in both
themes. Every `fullscreen-*` family is present at 2084x450 and 2084x742 in
both themes. Direct image inspection covered the desktop pairs and each
fullscreen family across base/revision. The Dark 1440x900 pair visibly differs
as expected (base green field versus revision's separate Dark roles); Light
remains consistent. No rendered correction beyond the allowed expected-color
assertion was made.

The 30 leaf paths below occur beneath each of `dark/base`, `dark/revision`,
`light/base`, and `light/revision`, for 120 committed PNGs total:

```text
build/{base|revision}-1440x900-dark.png
build/{base|revision}-1440x900-light.png
build/{base|revision}-1280x800-dark.png
build/{base|revision}-1280x800-light.png
fullscreen-basal/{base|revision}-2084x450-dark.png
fullscreen-basal/{base|revision}-2084x450-light.png
fullscreen-basal/{base|revision}-2084x742-dark.png
fullscreen-basal/{base|revision}-2084x742-light.png
fullscreen-isf/{base|revision}-2084x450-dark.png
fullscreen-isf/{base|revision}-2084x450-light.png
fullscreen-isf/{base|revision}-2084x742-dark.png
fullscreen-isf/{base|revision}-2084x742-light.png
fullscreen-carb-ratio/{base|revision}-2084x450-dark.png
fullscreen-carb-ratio/{base|revision}-2084x450-light.png
fullscreen-carb-ratio/{base|revision}-2084x742-dark.png
fullscreen-carb-ratio/{base|revision}-2084x742-light.png
fullscreen-event-comparison/{base|revision}-2084x450-dark.png
fullscreen-event-comparison/{base|revision}-2084x450-light.png
fullscreen-event-comparison/{base|revision}-2084x742-dark.png
fullscreen-event-comparison/{base|revision}-2084x742-light.png
glucose-chart-legibility/revision-no-window-2084x742-dark.png
glucose-chart-legibility/revision-no-window-2084x742-light.png
glucose-chart-legibility/revision-morning-2084x742-dark.png
glucose-chart-legibility/revision-morning-2084x742-light.png
isf-verdict/false-drilled-1440x900-dark.png
isf-verdict/false-drilled-1440x900-light.png
isf-verdict/false-drilled-1280x800-dark.png
isf-verdict/false-drilled-1280x800-light.png
issue-130/wrapped-window-at-rest-1440x900-dark.png
issue-130/wrapped-window-at-rest-1440x900-light.png
```

`glucose-chart-legibility` retains its historical `revision-*` filenames in
both variants because that existing capture helper owns those labels.

## Verification result

The true-base Dark and Light runs each report 42/42. The Light revision retry
reports 42/43: `#215` clears on that run, and the sole failure is issue #258's
known 2.94:1 `__p75:4` boundary against its 3:1 floor. The deterministic
fullscreen containment sweep within every run is green. Issue #258 owns the
remaining hero-chart boundary defect, so this chunk deliberately does not
change hero-chart rendering, percentile bands, median, scrim, or legend
behavior.
