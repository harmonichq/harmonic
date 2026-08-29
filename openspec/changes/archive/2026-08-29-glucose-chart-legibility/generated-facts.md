# Generated facts — Repair glucose chart legibility (#253)

Every output below is copied verbatim from the command shown, run in the issue
worktree before plan review.

## F1 — base revision

```sh
git rev-parse HEAD
```

```text
ed404e62f5d2ec972d23c9b0e2de79e73f287f3f
```

## F2 — declared safe app source

```sh
rg -n -B 5 -A 3 "uv run harmonic serve --no-fetch" AGENTS.md
```

```text
183-  UI-design/replay exception is this exact command, whose `--no-fetch` flag is
184-  mandatory and whose database is generated entirely by
185-  `scripts/gen_revise_e2e_db.py`:
186-
187-  ```sh
188:  uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite
189-  ```
190-
191-  Exercise every other model path through tests and fixtures instead.
```

## F3 — existing surface contract and implementation/test paths

```sh
for p in mockups/finding-evidence-routing.behavior.md frontend/diagnose-workstation-behavior.replay.mjs frontend/diagnose-workstation.js frontend/diagnose-workstation.css frontend/diagnose-workstation-chart.js frontend/diagnose-workstation.browser.test.mjs frontend/diagnose-workstation-chart.test.js frontend/theme.css; do test -f "$p" && echo "$p"; done
```

```text
mockups/finding-evidence-routing.behavior.md
frontend/diagnose-workstation-behavior.replay.mjs
frontend/diagnose-workstation.js
frontend/diagnose-workstation.css
frontend/diagnose-workstation-chart.js
frontend/diagnose-workstation.browser.test.mjs
frontend/diagnose-workstation-chart.test.js
frontend/theme.css
```

```sh
sed -n '469,477p;895,903p' mockups/finding-evidence-routing.behavior.md
```

```text
P14 · The basal lane carries NO drag listener and stays click-only, while the
      window's dashed edges project down THROUGH it on the plot's own spine —
      measured: the edge runs from the plot's top edge to the lane stack's
      bottom (845px), 26px past the chart's own box, and no further.
  source:   frontend/diagnose-workstation.js:1481-1560 (paintBrace), and the
            absence of any listener in renderLane at 464-479
  mock:     no edges to project; the lane is a read-only strip
  evidence: probe (edgeSpan: edgeBottom 845 == laneBottom 845, chartBottom 819)
  verdict:  kept          operator-ruled: Connor Griffin · 2026-08-19
P43 · Lane cells outside the window are DIMMED to opacity .38 — de-emphasised,
      never removed, because the verdict is still true, it is just not what the
      canvas is scoped to. Both lanes, and a wrapping block piece by piece: one
      piece inside the window and one outside are both true.
  source:   frontend/diagnose-workstation.js:1538-1559; [data-outside="true"],
            diagnose-workstation.css:307-308
  mock:     0 of 48 cells carry data-outside in any state
  evidence: probe (app, drawn state: 42 of 48 dimmed at opacity .38) ·
            probe-mock (mock: laneOutside=0)
```

## F4 — UI Craft route

```sh
node /Users/connor/.codex/skills/ui-craft/scripts/route.mjs --embodiment shipped --runnability runnable --declaration complete --data-source synthetic
```

```text
{"mode":"revise","reason":"safe synthetic data source declared"}
```

## F5 — hardening profile

```sh
if rg -q '^Harden:' AGENTS.md; then rg '^Harden:' AGENTS.md; else echo 'Harden: absent'; fi
```

```text
Harden: absent
```

## F6 — strict OpenSpec validation

```sh
npx --yes @fission-ai/openspec@1 validate glucose-chart-legibility --strict
```

```text
Change 'glucose-chart-legibility' is valid
```

## F7 — repository-locked wide browser viewport

The issue evidence uses the repository's existing wide Diagnose browser
viewport rather than inferring a browser viewport from a cropped report image.

```sh
sed -n '4232,4238p' frontend/diagnose-workstation-behavior.replay.mjs
```

```text
  ['S115', S115, 'typical'], ['S116', S116, 'typical'],
  ['S117', S117, 'typical'], ['S118', S118, 'typical'],
  ['S119', S119, 'typical', { viewport: { width: 2084, height: 742 } }],
  ['S120', S120, 'typical', { findingsInputs: FINDINGS_PROJECTION.inputs,
    findingsProjectionInputs: withStarBecomingWatching }],
  ['S121', S121, 'typical', {
```
