# Generated facts — tablet clock-window dragging (#257)

Every output below is copied byte-for-byte from the named command in the ticket
worktree. Re-run the command after changing anything it describes.

## F1 — Shipped drag-input listeners

Command:

```sh
rg -n "addEventListener\\('(mouse|pointer|touch|lostpointercapture)|removeEventListener\\('(mouse|pointer|touch|lostpointercapture)" frontend/diagnose-workstation.js
```

Output:

```text
3757:    chartEl.addEventListener('pointerdown', (ev) => begin('draw', ev), { signal });
3758:    chartEl.addEventListener('pointermove', move, { signal });
3759:    chartEl.addEventListener('pointerup', finish, { signal });
3760:    chartEl.addEventListener('pointercancel', finish, { signal });
3761:    chartEl.addEventListener('lostpointercapture', finish, { signal });
3763:    chartEl.addEventListener('pointermove', (ev) => {
3770:    el('grip-a').addEventListener('pointerdown', (ev) => { ev.stopPropagation(); begin('a', ev); }, { signal });
3771:    el('grip-b').addEventListener('pointerdown', (ev) => { ev.stopPropagation(); begin('b', ev); }, { signal });
3931:  document.addEventListener('pointerdown', (ev) => {
```

## F2 — Living resize and whole-window ledger rows

Command:

```sh
rg -n "^P(0[3-5]|122) ·|evidence: replay S0[3-5]" mockups/finding-evidence-routing.behavior.md
```

Output:

```text
258:  evidence: replay S05 (app, pass) · probe (grips: title="Drag to resize",
264:P03 · A resize grows away from the edge the reader is NOT dragging. Grabbing
270:  evidence: replay S05 (app, pass)
279:P04 · The dashed edge is grabbable down its WHOLE height, ±5px — not only at
285:  evidence: replay S03 (app, pass)
293:P05 · Dragging INSIDE the window slides it whole — width preserved, both edges
298:  evidence: replay S04 (app, pass)
312:P122 · The primary pointer owns one clock-window gesture. A primary touch can
```

## F3 — Frozen shipped-surface contract files

Command:

```sh
rg --files mockups frontend | rg 'finding-evidence-routing\.behavior\.md|diagnose-workstation-behavior\.replay\.mjs'
```

Output:

```text
mockups/finding-evidence-routing.behavior.md
frontend/diagnose-workstation-behavior.replay.mjs
```

## F4 — Declared safe app command

Command:

```sh
rg -n "uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite" AGENTS.md
```

Output:

```text
188:  uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite
```

## F5 — UI Craft route

Command:

```sh
node /Users/connor/.codex/skills/ui-craft/scripts/route.mjs --embodiment shipped --runnability runnable --declaration complete --data-source synthetic
```

Output:

```text
{"mode":"revise","reason":"safe synthetic data source declared"}
```

## F6 — Declared affected browser legs

Command:

```sh
rg -n "diagnose-workstation\.browser|diagnose-canvas-composition|diagnose-workstation-behavior" AGENTS.md
```

Output:

```text
136:PLAYWRIGHT_MODULE="$PW/node_modules/playwright" VENDOR_DIR="$VENDOR" PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json node --test frontend/diagnose-workstation.browser.test.mjs
137:PLAYWRIGHT_MODULE="$PW/node_modules/playwright" VENDOR_DIR="$VENDOR" PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json node --test frontend/diagnose-canvas-composition.browser.test.mjs
143:PLAYWRIGHT_MODULE="$PW/node_modules/playwright" VENDOR_DIR="$VENDOR" BASE_URL=http://127.0.0.1:8765 TARGET=app PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json node frontend/diagnose-workstation-behavior.replay.mjs
```

## F7 — Existing mouse whole-window behavior at tablet width

Command:

```sh
PLAYWRIGHT_MODULE=/Users/connor/.cache/harmonic-browser-gate/pw/node_modules/playwright VENDOR_DIR=/Users/connor/.cache/harmonic-browser-gate/vendor BASE_URL=http://127.0.0.1:18765 TARGET=app PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json VIEWPORT=1024x768 ONLY=S04 node frontend/diagnose-workstation-behavior.replay.mjs
```

Output:

```text
  ok S04

app: 1 of 1 stories passed
```

## First-hour spike

The same no-fetch app was opened in a Chromium context with touch enabled. A
120-pixel primary-touch drag from the scrim interior and a 90-pixel drag from the
right gate each left both gate coordinates unchanged. The scratch driver lived
outside the repository and is not a shipping artifact. Together with F1 and F7,
the run narrows the defect to input transport rather than the window model.
