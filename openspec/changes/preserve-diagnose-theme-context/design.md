# Design — Preserve Diagnose context across theme changes (#230)

## ADR 230 — Theme repaint preserves the mounted Diagnose workspace

**Decision.** A theme change repaints the existing Diagnose mount in place. It
must not call the full render path that tears down and boots the workstation.
The existing public `refresh()` seam remains the shell's theme-change interface.
The boot instance exposes one private, generally named repaint capability backed
by its existing `paint()` operation; both the theme-facing `refresh()` and the
existing Day-facing `repaintDay()` wrapper delegate to it. CSS-token-derived
chart ink is therefore recomputed while boot-owned reader state remains intact.
Fresh payloads, explicit mock state changes, and errors keep their existing
reconstruction paths.

**Why.** The clock window and spotlight are the reader's place in the evidence.
They are local to the mounted workstation and intentionally are not durable
navigation state. Serializing and restoring them around a remount would create a
second state-transfer contract for a display-only action. Reusing the existing
in-place paint path keeps one mounted state owner and the smallest interface.

**Boundaries.** This does not make window, spotlight, pins, drill depth, or dock
state survive navigation or reload. It does not change theme tokens, chart
semantics, findings membership, request payloads, or any advisory result.

## Revision provenance

- **Base:** `16cfbda7ca4bf6ce2a26441e44ea60169bcd15fa`, the `origin/main`
  tip from which issue 230's worktree was cut.
- **Safe-start declaration:** `AGENTS.md`, “The data boundary”.
- **Command:** `uv run harmonic serve --no-fetch --db
  mockups/revise-e2e.synthetic/harmonic.sqlite`.
- **Data source:** `mockups/revise-e2e.synthetic/harmonic.sqlite`, a committed
  synthetic database generated entirely by `scripts/gen_revise_e2e_db.py`; no
  live fetch and no real pump data.
- **Surface contract:** `mockups/finding-evidence-routing.behavior.md` with the
  app-only replay at `frontend/diagnose-workstation-behavior.replay.mjs`.

## Reproduction

Measured in headless Chromium against the safe running app on fresh
`origin/main`, with no console errors:

- before switching Dark to Light: the 24-hour window was pressed, the spotlight
  was `finding:late_bolus`, and the dock order was `ic:0`,
  `finding:late_bolus`;
- after the switch settled: Overnight was pressed, the spotlight was `ic:0`,
  and the dock order was `ic:0`, `basal:120-180`, `isf`.

Source inspection matches the rendered failure. The shell's theme watcher calls
`diagnoseView.refresh()`. On the base SHA, that method called the full `render()`
path, which tore down the boot instance and reconstructed `presetKey`, `drawn`,
and `canvasLayout` from opening configuration. The same boot instance already
exposed an in-place paint operation for a resolved Day trace.

## Verification contract

The behavior-ledger amendment strengthens S117 rather than creating a second
test story. It must read the selected window, spotlight, and ordered dock chart
ids immediately before and after the theme action; it must not call `openCanvas`
or another helper after the switch. The same story continues to prove that the
event chart's palette ink changes. The full app-only replay and the repository's
fast gate remain the verification backstop.

## Built-app replay and render evidence

The strengthened S117 failed against the base app with the expected identity
change: after Dark → Light, `pressedWindow` changed from `["24 h"]` to
`["Overnight"]` and `spotlightId` changed from
`finding:correction_on_iob` to `finding:over_treated_low`. Against the revision,
focused S117 passed and the aggregate app-only replay reported
`app: 138 of 138 stories passed`, with no `FAIL` or `OPENER` output.

The separate installed-driver capture used the built app and the safe-start
command above. In each worktree it dynamically selected the first docked Finding
chart that differed from the opening focal chart. Both base and revision selected
the same identities before each theme action:

- pressed window: `["24 h"]`;
- spotlight: `finding:late_bolus` (non-default; opening spotlight `ic:0`);
- ordered dock chart ids: `["ic:0", "finding:late_bolus"]`.

Immediately after each base theme action, those identities reset in both
directions to `["Overnight"]`, `ic:0`, and
`["ic:0", "basal:120-180", "isf"]`. The paired reset renders are
`evidence/base-dark-to-light-reset.png` and
`evidence/base-light-to-dark-reset.png`.

Immediately after each revision theme action, all three identities remained
byte-for-byte equal to the staged values above. The focal Event chart's target
range ink was `color-mix(in srgb, #347354 7%, transparent)` in Light and
`color-mix(in srgb, #a89a85 7%, transparent)` in Dark. The paired preserved
renders are `evidence/revision-dark-to-light-preserved.png` and
`evidence/revision-light-to-dark-preserved.png`. Both driver runs reported an
empty browser-console error list.

**Visual verdict.** Inspection of all four 1280 × 720 synthetic renders confirms
the DOM record. The base pair visibly returns to the Overnight I:C workspace and
shows the remount's loading states. The revision pair keeps the 24-hour brace,
Late bolus spotlight, and two-chart dock. Light uses the shipped bone grounds and
green/terracotta marks; Dark uses the shipped near-black grounds and brighter
olive/orange marks. Chart geometry, labels, ordering, and clinical meaning do not
change. The visible difference is palette-only.

`openspec/specs/surfaces/spec.md` remains unchanged. The implementation corrects
the shipped interaction to satisfy the existing surface capability; it does not
add or alter a baseline capability requirement.
