# Generated facts — Star means keep (#226)

Captured from base `4141df32178b72bff4638fa9fad773242a296292` before triage writes.

## F1 — Named source and contract paths are tracked

Command:

```sh
git ls-files AGENTS.md CONTEXT.md DESIGN.md PRODUCT.md frontend/diagnose-canvas-layout.js frontend/diagnose-canvas-state.js frontend/diagnose-workstation.js frontend/diagnose-canvas-layout.test.js frontend/diagnose-canvas-state.test.js frontend/diagnose-canvas-composition.browser.test.mjs frontend/diagnose-workstation-behavior.replay.mjs frontend/diagnose-behavior-ledger-parity.test.js mockups/finding-evidence-routing.behavior.md mockups/INDEX.md openspec/changes/canvas-tile-controls/design.md openspec/specs/surfaces/spec.md scripts/gen_revise_e2e_db.py mockups/revise-e2e.synthetic/harmonic.sqlite
```

Output:

```text
AGENTS.md
CONTEXT.md
DESIGN.md
PRODUCT.md
frontend/diagnose-behavior-ledger-parity.test.js
frontend/diagnose-canvas-composition.browser.test.mjs
frontend/diagnose-canvas-layout.js
frontend/diagnose-canvas-layout.test.js
frontend/diagnose-canvas-state.js
frontend/diagnose-canvas-state.test.js
frontend/diagnose-workstation-behavior.replay.mjs
frontend/diagnose-workstation.js
mockups/INDEX.md
mockups/finding-evidence-routing.behavior.md
mockups/revise-e2e.synthetic/harmonic.sqlite
openspec/changes/canvas-tile-controls/design.md
openspec/specs/surfaces/spec.md
scripts/gen_revise_e2e_db.py
```

## F2 — Current ordering and retention behavior

Command:

```sh
node --input-type=module -e "import { createCanvasLayout, dockOrder, pinChart, placeSeats } from './frontend/diagnose-canvas-layout.js'; import { seatableChartIds } from './frontend/diagnose-canvas-state.js'; const pinned = pinChart(createCanvasLayout('first'), 'third'); const findings={rows:[{id:'first',register:'finding'}]}; const descriptors=[{chartId:'first'},{chartId:'second'},{chartId:'third'}]; console.log(JSON.stringify({seats:placeSeats(['first','second','third'],pinned).map(x=>x.chartId),dock:dockOrder(['first','second','third'],pinned),retention:seatableChartIds(findings,descriptors,['third'])}));"
```

Output:

```text
{"seats":["first","third","second"],"dock":["third","first","second"],"retention":["first","third"]}
```

## F3 — No hardening profile is declared

Command:

```sh
if rg -n '^Harden:' AGENTS.md; then true; else echo 'Harden: absent'; fi
```

Output:

```text
Harden: absent
```

## F4 — Exact safe-start declaration

Command:

```sh
rg -n --fixed-strings 'uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite' AGENTS.md
```

Output:

```text
187:  uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite
```
