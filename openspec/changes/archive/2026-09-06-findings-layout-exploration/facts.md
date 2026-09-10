# Generated facts — preflight

Captured from actual commands in this checkout before review. Empty output is
left empty, not summarized. These are historical baseline facts, not live
assertions to regenerate after implementation changes the source.

## F1 — current base and production-source continuity

Command:

```sh
git rev-parse aeb37c6
git diff --name-only 0227dbff aeb37c6 -- frontend ciq_autotune scripts .github AGENTS.md
```

Output:

```text
aeb37c6a80d2bedb42bc585fa8db598cd06b80fc
```

## F2 — surface and queue ownership

Command:

```sh
rg -n 'const MARKUP|function drillFinding|function paintDock|function paintTiles|function mountRowMinis|function mountDescriptorChart|renderFindingsQueue\(host' frontend/diagnose-workstation.js
rg -n '^export function (queueRows|renderFindingsQueue)' frontend/diagnose-findings-queue.js
```

Output:

```text
84:const MARKUP = `
1466:  function mountDescriptorChart(host, descriptor, mini) {
1476:  function mountRowMinis(miniSlots) {
2166:  function drillFinding(row) {
2682:  function paintDock(view) {
2743:  function paintTiles() {
3558:      const queue = renderFindingsQueue(host, findings, drillFinding, {
164:export function queueRows(projection, selected = null) {
302:export function renderFindingsQueue(host, projection, onDrill, view = null) {
```

## F3 — existing mode and readability constants

Command:

```sh
rg -n '^export const (MIN_ROW_MINI_WIDTH|SPOTLIGHT_FLOOR|MINI_FLOOR|DOCK_FLOOR|DOCK_WANTS|DOCK_BOOT_WANT)' frontend/diagnose-findings-queue.js frontend/diagnose-canvas-state.js
```

Output:

```text
frontend/diagnose-findings-queue.js:50:export const MIN_ROW_MINI_WIDTH = 120;
frontend/diagnose-canvas-state.js:201:export const SPOTLIGHT_FLOOR = 220;
frontend/diagnose-canvas-state.js:202:export const MINI_FLOOR = 148;
frontend/diagnose-canvas-state.js:204:export const DOCK_FLOOR = SPOTLIGHT_FLOOR + MINI_FLOOR + FIELD_GAP;
frontend/diagnose-canvas-state.js:212:export const DOCK_WANTS = Object.freeze(['docked', 'hidden']);
frontend/diagnose-canvas-state.js:218:export const DOCK_BOOT_WANT = 'hidden';
```

## F4 — current spec sections affected

Command:

```sh
rg -n '^### Requirement: (The Diagnose stage|The charts drawer|The stage card|The Diagnose findings rail|A revision of the Diagnose findings rail|Every settings)' openspec/specs/surfaces/spec.md
```

Output:

```text
288:### Requirement: Every settings evidence chart opens the parameter panel its queue row opens
398:### Requirement: The Diagnose stage holds the active finding's chart
419:### Requirement: The charts drawer is a picker that opens minimized
464:### Requirement: The stage card's title is the headline's only home
505:### Requirement: The Diagnose findings rail is a tapered queue read off served order and tier
555:### Requirement: A revision of the Diagnose findings rail ships with its ledger amendments and evidence
```

## F5 — cross-tree mode consumers

Command:

```sh
rg -l 'dockWant|dockView|DOCK_FLOOR|DOCK_BOOT_WANT|data-dock|dock-handle|qrow\.hero|qrow\.compact|tapered queue|charts drawer|bottom-docked' frontend mockups harness openspec/specs DESIGN.md AGENTS.md .github | sort
```

Output:

```text
frontend/cockpit-shell.browser.test.mjs
frontend/diagnose-canvas-composition.browser.test.mjs
frontend/diagnose-canvas-state.js
frontend/diagnose-canvas-state.test.js
frontend/diagnose-event-comparison-behavior.replay.mjs
frontend/diagnose-workstation-behavior.replay.mjs
frontend/diagnose-workstation.browser.test.mjs
frontend/diagnose-workstation.css
frontend/diagnose-workstation.js
frontend/index.test.js
mockups/INDEX.md
mockups/finding-evidence-routing.behavior.md
openspec/specs/surfaces/spec.md
```

## F6 — synthetic provenance and safe server declaration

Command:

```sh
sed -n '179,193p' AGENTS.md
python3 - <<'EOF'
import json
for path in ['mockups/diagnose-workstation.synthetic/payload.json','frontend/__fixtures__/findings-projection.json']:
 p=json.load(open(path)); print(path); print(p['_generated_by']); print(p['_note'])
EOF
```

Output:

```text
  plain `Store.open` writes WAL sidecars and migration DDL into it.
- **Never run normal `harmonic serve` or any `harmonic fetch` in automated
  work.** Normal startup fires a live OAuth login against the vendor (possibly
  2FA) and pulls real data; it cannot be exercised headless. There is exactly
  one permitted offline serve: the QA copy-then-serve command below for UI
  design and replay. `--no-fetch` and the empty token are mandatory. The QA
  database is generated entirely by `scripts/gen_qa_e2e_db.py`:

  ```sh
  scratch="${TMPDIR:-/tmp}/harmonic-qa-e2e.sqlite"
  rm -f "$scratch" "$scratch-wal" "$scratch-shm" "$scratch.derived.sqlite"
  cp mockups/qa-e2e.synthetic/harmonic.sqlite "$scratch"
  uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8765
  ```

mockups/diagnose-workstation.synthetic/payload.json
.claude/qa/gen_synthetic_fixtures.py
SYNTHETIC. Manufactured for the CI behaviour-replay gate — no real CGM, pump or personal data, every number from a fixed seed. See the module docstring.
frontend/__fixtures__/findings-projection.json
scripts/gen_findings_projection_fixtures.py
SYNTHETIC. Every window below is the real projection's own output over invented inputs run through the real engines — never hand-assembled. Regenerate with `python3 scripts/gen_findings_projection_fixtures.py`.
```

## F7 — executed baseline and logic spike results

Command:

```sh
tail -3 openspec/changes/findings-layout-exploration/evidence/base-replay.txt
rg '^[ℹ#] (tests|pass|fail|cancelled|skipped)' openspec/changes/findings-layout-exploration/evidence/logic-spike.txt
```

Output:

```text
  ok D3

app: 163 of 163 stories passed
ℹ tests 81
ℹ pass 81
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
```

## F8 — delta requirement positions

Command:

```sh
python3 - <<'EOF'
from pathlib import Path
p=Path('openspec/changes/findings-layout-exploration/specs/surfaces/spec.md')
for i,line in enumerate([x for x in p.read_text().splitlines() if x.startswith('### Requirement:')],1): print(f'{i}. {line.removeprefix("### Requirement: ")}')
EOF
```

Output:

```text
1. The charts drawer is a picker that opens minimized
2. The Diagnose findings rail is a tapered queue read off served order and tier
3. The Diagnose stage holds the active finding's chart
4. The stage card's title is the headline's only home
5. A revision of the Diagnose findings rail ships with its ledger amendments and evidence
6. Diagnose places selected evidence before the clock overview
7. Ranked findings share one aligned row structure
8. All charts opens fullscreen without an intermediate dock
```

## F9 — generated extract outputs

Command:

```sh
rg -n "artifacts.set\(|args.out.write_text" mockups/finding-evidence-routing.exploration/build.mjs mockups/diagnose-evidence-canvas.exploration/generate.py
```

Output:

```text
mockups/diagnose-evidence-canvas.exploration/generate.py:338:    args.out.write_text(text)
mockups/finding-evidence-routing.exploration/build.mjs:1450:  artifacts.set('data.json', `${JSON.stringify(data, null, 1)}\n`);
mockups/finding-evidence-routing.exploration/build.mjs:1454:  artifacts.set('evidence-table.extracted.js', evidenceTable);
mockups/finding-evidence-routing.exploration/build.mjs:1484:  artifacts.set('app-base.extracted.css',
```

## F10 — closed existing-path inventory

Command:

```sh
python3 - <<'EOF'
from pathlib import Path
import re
p=Path('openspec/changes/findings-layout-exploration/behavior-map.md').read_text().split('## Closed consumer inventory for the implementation')[1]
for name in re.findall(r'^- `([^`]+)`',p,re.M):
 print(('exists ' if Path(name).is_file() else 'MISSING ')+name)
EOF
```

Output:

```text
exists frontend/diagnose-workstation.js
exists frontend/diagnose-workstation.css
exists frontend/diagnose-findings-queue.js
exists frontend/diagnose-canvas-state.js
exists frontend/diagnose-canvas-layout.js
exists frontend/diagnose-workstation-chart.js
exists frontend/theme.css
exists frontend/shell.css
exists frontend/diagnose-findings-queue.test.js
exists frontend/diagnose-canvas-state.test.js
exists frontend/diagnose-canvas-layout.test.js
exists frontend/diagnose-workstation.test.js
exists frontend/diagnose-workstation-chart.test.js
exists frontend/index.test.js
exists frontend/diagnose-workstation.browser.test.mjs
exists frontend/diagnose-canvas-composition.browser.test.mjs
exists frontend/cockpit-shell.browser.test.mjs
exists frontend/diagnose-workstation-behavior.replay.mjs
exists frontend/diagnose-event-comparison-behavior.replay.mjs
exists frontend/verify-660-story-behavior.replay.mjs
exists frontend/diagnose-behavior-ledger-parity.test.js
exists DESIGN.md
exists mockups/INDEX.md
exists mockups/finding-evidence-routing.behavior.md
exists mockups/finding-evidence-routing.exploration/data.json
exists mockups/finding-evidence-routing.exploration/evidence-table.extracted.js
exists mockups/finding-evidence-routing.exploration/app-base.extracted.css
exists mockups/diagnose-evidence-canvas.exploration/index.html
```

