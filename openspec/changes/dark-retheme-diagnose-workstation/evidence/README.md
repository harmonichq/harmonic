# Diagnose Dark retheme — synthetic rendered evidence

## Provenance and commands

All captures use the committed synthetic Diagnose payload
`mockups/diagnose-workstation.synthetic/payload.json` and the generated
synthetic database `mockups/revise-e2e.synthetic/harmonic.sqlite` (fixed seed
620 in `scripts/gen_revise_e2e_db.py`). No patient-derived material is present.

Base commit: `0a667f552a136caa43019d4750940a6599f310ad` in
`/Users/connor/worktrees/harmonic/255`.

Revision commit before this evidence-only correction:
`0a667f552a136caa43019d4750940a6599f310ad` in
`/Users/connor/worktrees/harmonic/255-c3`; the committed revision also changes
the stale Dark expected-color assertion in
`frontend/diagnose-workstation.browser.test.mjs`.

Each safe server was started once and terminated after the runs:

```sh
uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite --port 31781
uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite --port 31782
```

The unchanged replay ran with `BASE_URL=http://127.0.0.1:31781` and `31782`,
respectively, plus `TARGET=app`, the payload above, the documented Playwright
module, and vendored Vue/ECharts directory. Both outputs ended
`app: 141 of 141 stories passed`; the app fixture opener made no unstubbed
request and browser console/request assertions were clean.

Dark captures used the same documented browser test invocation with
`DIAGNOSE_SCREENSHOT_VARIANT=base|revision` and the Dark root below. Light
captures first ran `eval "$(python3 scripts/ensure_browser_gate_env.py)"` in
each checkout, then used the exact documented command with the Light root
below. The original Light base command wrote to the mandated ticket-worktree
path and its resulting synthetic PNGs were copied here for this chunk commit.

## Matrix roots and verdict

- `dark/base/` — base reproduces the collapsed old Dark hierarchy.
- `dark/revision/` — Dark revision has separate material roles, rail targets,
  visible vessel edges, dock states, and quieter carb-ratio strands.
- `light/base/` and `light/revision/` — inspected unchanged image by image;
  Light has no new design ruling.

The `build/typical` captures are present at 1440x900 and 1280x800 in both
themes. Every `fullscreen-*` family is present at 2084x450 and 2084x742 in
both themes. Direct image inspection covered the desktop pairs and each
fullscreen family across base/revision; no rendered correction beyond the
allowed expected-color assertion was made.

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

The base Dark and Light capture runs each report 41/43 passing, with the
pre-revision Dark palette assertion and the known issue-258 2.94:1 `__p75:4`
boundary result. Dark revision reports 42/43, removing the stale palette
expectation; Light revision reports 41/43 when an existing `#215` docked-tile
timeout recurs alongside the same issue-258 result. The deterministic
fullscreen containment sweep within every run is green. Issue #258 owns the
remaining hero-chart boundary defect, so this chunk deliberately does not
change percentile bands, median, scrim, or legend behavior.
