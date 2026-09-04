# Verification

The repository's `AGENTS.md` and `.github/workflows/ci.yml` own the merge bar and
safe-start procedure. This page assigns those existing checks to the two phases
and adds the rendered evidence required by this revision. It introduces no new
runner, fixture format, test-count quota, or looser gate.

## Phase 1 — public logic and consumer checks

Run the complete frontend suite:

```sh
node --test 'frontend/**/*.test.js'
```

Validate this change and the existing repository guards:

```sh
npx --yes @fission-ai/openspec@1 validate findings-layout-exploration --strict
python3 scripts/check_adr_numbers.py
python3 scripts/check_owned_identifiers.py
python3 scripts/check_public_allowlist.py
```

Regenerate only source-coupled outputs that drift, using their existing producers:

```sh
node mockups/finding-evidence-routing.exploration/build.mjs --check
uv run python mockups/diagnose-evidence-canvas.exploration/generate.py --check
```

All commands must exit successfully. A changed output must come from its existing
generator, not a manual fixture edit. The suite must discover and execute its
assertions. Phase 1 supplies amended browser witnesses but phase 2 owns their
live execution and corrections.

## Phase 2 — built app, rendered evidence and merge checks

Use the exact safe copy-then-serve protocol in the checked-out AGENTS.md. It owns
the source QA database, generator, mandatory no-fetch flag and empty token.
Use separate scratch copies for base and revision, and separate ports when both
are running. Confirm port ownership before starting; retain a stop method. The
app is served by its own checkout. Never redirect a base replay to revision code.

Use the reusable browser-gate environment documented there. Its producer yields
PLAYWRIGHT_MODULE and VENDOR_DIR, consumed by the listed browser legs. BASE_URL
points at the corresponding no-fetch app. PAYLOAD points at the committed
synthetic input named by each existing replay command. Capture process exit
status and complete stdout/stderr with the evidence.

The principal revision replay is the repository's existing command:

```sh
PLAYWRIGHT_MODULE="$PW/node_modules/playwright" VENDOR_DIR="$VENDOR" BASE_URL=http://127.0.0.1:8765 TARGET=app PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json node frontend/diagnose-workstation-behavior.replay.mjs
```

Here PW and VENDOR are the explicitly provisioned directories from AGENTS.md's
recipe. If using its reusable cache, use the equivalent exported
PLAYWRIGHT_MODULE and VENDOR_DIR directly rather than setting PW to a module
file. The target checkout and port must match the server started for this run.

Run every remaining browser-gate leg in AGENTS.md, including the workstation,
composition, shell, runner, Day, Plan, event-comparison, support-audit and Verify
checks. Chromium requires an unsandboxed launch on this Mac: use the approved
escalation mechanism, not browser flags or a test bypass. Execute the full
aggregate amended replay, not only the affected IDs. Every new or amended story
must run in that aggregate; retired behaviors retain attributed absence checks.

Finish with all fast, drift, public-tree and browser gates declared by the
repository, including:

```sh
uv run python -m pytest
node --test 'frontend/**/*.test.js'
npx --yes @fission-ai/openspec@1 validate --all --strict
```

The CI workflow owns the complete generator and public-tree command lists; no
step is waived by this page. PR checks must be green. No workflow definition,
fixture generator or advisory backend change is part of this ticket.

## Rendered evidence

Use the committed QA showcase for the real app and the existing generated
projection fixture for deterministic mixed-rank/browser probes. Name the actual
source in each evidence record; do not claim the two data sets are identical.
Base/revision pairs within a data source use identical bytes. Reuse the existing
opener's fixture-population mechanisms, not hand-set analyzer outcomes.

Capture the desktop arrangement at 1440×900 and 2084×742, its compressed layout
at 1024×768 and 760×900, and phone width at 390×844. Only the shipped dark theme
exists. For each size cover: root queue, lower-ranked immediate drill and return,
All charts open and dismissed, and selected-chart Expand and return. At the
widths relevant to the interaction, additionally exercise:

- a drawn/wrapped window, edge resizing, body sliding, touch and basal-lane click
  with the overview below the spotlight;
- Sift promotion, long mixed-family rows, empty/no-ranked findings, Watching
  expansion and All charts selection of a Watching chart;
- pending, failed and stale chart evidence with the existing state presentation;
- preservation of the inspector's scroll/focus and current window on browser
  dismissal, and visibility of the watched-change floor at short heights;
- unchanged chart controls, occurrence focus, setting verdict/support display,
  permitted staging controls and existing per-parameter window release on drill.

Measure preview-host widths against the existing floor, type/preview column
alignment, visible plot bounds and document overflow. Inspect the screenshots;
file existence and green logic tests are not visual evidence. Keep the existing
chart options, theme tokens and clinical text. No diagram placeholder or wireframe
styling becomes production chart code.

Store synthetic renders and logs under this change's evidence directory, with a
compact manifest that identifies source, checkout, viewport, state and verdict.
Retain screenshots of the selected wireframe as decision context, then delete
wireframes.html before opening the PR. The wireframe is never a fidelity oracle.
