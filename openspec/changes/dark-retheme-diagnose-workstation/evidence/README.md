# Diagnose Dark retheme — synthetic rendered evidence

## Provenance and commands

All captures use the committed synthetic Diagnose payload
`mockups/diagnose-workstation.synthetic/payload.json` and the generated
synthetic database `mockups/revise-e2e.synthetic/harmonic.sqlite` (fixed seed
620 in `scripts/gen_revise_e2e_db.py`). No patient-derived material is present.

Base commit: `9564cd378dabb640a3f814115d9ab0131012910c` (detached,
`Triage dark Diagnose retheme`) in `/Users/connor/worktrees/harmonic/255-base`.
All `dark/base` and `light/base` PNGs were recaptured from this checkout.

Revision capture source: `b47c2aeb2156098aaad5a4919877726242ed331c` in
`/Users/connor/worktrees/harmonic/255` (`Keep glucose scrim repair Dark-only`).
The following evidence-record-only commit changes no rendered source; it
records the captures produced from that reviewed state.

## Replayable commands

The captures and replays used these fixed local browser dependencies:

```sh
export PLAYWRIGHT_MODULE=/Users/connor/.cache/harmonic-browser-gate/pw/node_modules/playwright
export VENDOR_DIR=/Users/connor/.cache/harmonic-browser-gate/vendor
export PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json
```

In separate terminals, start only the exact no-fetch servers below:

```sh
cd /Users/connor/worktrees/harmonic/255-base
uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite --port 31783
```

```sh
cd /Users/connor/worktrees/harmonic/255
uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite --port 31782
```

Run the unchanged replays against those servers:

```sh
cd /Users/connor/worktrees/harmonic/255-base
PLAYWRIGHT_MODULE=/Users/connor/.cache/harmonic-browser-gate/pw/node_modules/playwright \
VENDOR_DIR=/Users/connor/.cache/harmonic-browser-gate/vendor \
PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json \
BASE_URL=http://127.0.0.1:31783 TARGET=app \
node frontend/diagnose-workstation-behavior.replay.mjs
```

```sh
cd /Users/connor/worktrees/harmonic/255
PLAYWRIGHT_MODULE=/Users/connor/.cache/harmonic-browser-gate/pw/node_modules/playwright \
VENDOR_DIR=/Users/connor/.cache/harmonic-browser-gate/vendor \
PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json \
BASE_URL=http://127.0.0.1:31782 TARGET=app \
node frontend/diagnose-workstation-behavior.replay.mjs
```

Both outputs ended `app: 141 of 141 stories passed`; the app fixture opener
made no unstubbed request and browser console/request assertions were clean.

Create every capture root with these exact commands. The environment helper
sets the same `PLAYWRIGHT_MODULE` and `VENDOR_DIR` values above before each
matrix run.

```sh
cd /Users/connor/worktrees/harmonic/255-base
eval "$(python3 scripts/ensure_browser_gate_env.py)"
PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json \
DIAGNOSE_SCREENSHOT_VARIANT=base \
DIAGNOSE_SCREENSHOT_DIR=/Users/connor/worktrees/harmonic/255/openspec/changes/dark-retheme-diagnose-workstation/evidence/dark/base \
node --test frontend/diagnose-workstation.browser.test.mjs
```

```sh
cd /Users/connor/worktrees/harmonic/255-base
eval "$(python3 scripts/ensure_browser_gate_env.py)"
PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json \
DIAGNOSE_SCREENSHOT_VARIANT=base \
DIAGNOSE_SCREENSHOT_DIR=/Users/connor/worktrees/harmonic/255/openspec/changes/dark-retheme-diagnose-workstation/evidence/light/base \
node --test frontend/diagnose-workstation.browser.test.mjs
```

```sh
cd /Users/connor/worktrees/harmonic/255
eval "$(python3 scripts/ensure_browser_gate_env.py)"
PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json \
DIAGNOSE_SCREENSHOT_VARIANT=revision \
DIAGNOSE_SCREENSHOT_DIR=/Users/connor/worktrees/harmonic/255/openspec/changes/dark-retheme-diagnose-workstation/evidence/dark/revision \
node --test frontend/diagnose-workstation.browser.test.mjs
```

```sh
cd /Users/connor/worktrees/harmonic/255
eval "$(python3 scripts/ensure_browser_gate_env.py)"
PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json \
DIAGNOSE_SCREENSHOT_VARIANT=revision \
DIAGNOSE_SCREENSHOT_DIR=/Users/connor/worktrees/harmonic/255/openspec/changes/dark-retheme-diagnose-workstation/evidence/light/revision \
node --test frontend/diagnose-workstation.browser.test.mjs
```

Base captures were written directly to this chunk's evidence roots from the
true-base checkout; the integrated ticket worktree was not used.

## Matrix roots and verdict

- `dark/base/` — the true base has the old green-field Dark surface and its
  heavier, less-separated material hierarchy.
- `dark/revision/` — the revision visibly replaces that field with distinct
  near-black/brown Dark material roles while retaining rails, vessel edges,
  dock states, and quieter carb-ratio strands. Its outside-window scrim is less
  washed out and its composited percentile boundaries clear the graphical
  contrast floor.
- `light/base/` and `light/revision/` — inspection confirms the restored
  fixed-point Light vessel cascade remains unchanged; no Light design ruling
  changed.

The `build/typical` captures are present at 1440x900 and 1280x800 in both
themes. Every `fullscreen-*` family is present at 2084x450 and 2084x742 in
both themes. Direct image inspection covered the desktop pairs and each
fullscreen family across base/revision. The Dark 1440x900 pair visibly differs
as expected (base green field versus revision's separate Dark roles), while
the Dark revision is unchanged by the Light restoration. Light remains
consistent with its base/fixed-point vessel treatment. No rendered correction
beyond the allowed expected-color assertion was made.

The 30 leaf paths below occur beneath each of `dark/base`, `dark/revision`,
`light/base`, and `light/revision`, for 120 committed PNGs total:

```text
build/typical-1440x900-dark.png
build/typical-1440x900-light.png
build/typical-1280x800-dark.png
build/typical-1280x800-light.png
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

The true-base Dark and Light runs each report 42/42. The final revision reports
44/44: `#215`, the Light fixed-point cascade, and the 3:1 composited boundary
contract are green. The deterministic fullscreen containment sweep is green.
Issue #258 continues to own removal of the unwanted percentile outlines,
median hierarchy, and legend artifacts; this CI repair only restores the
existing boundary contract and reduces the Dark outside-window scrim strength.
