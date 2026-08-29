# Design — Repair glucose chart legibility (#253)

## ADR 253 — Clock-window emphasis belongs to the glucose plot, not the basal verdict strip

**Decision.** The clock window remains the scope for Diagnose findings and the
glucose chart, but its visual gates, hit zones, and emphasis end at the glucose
plot's x-axis. The basal verdict strip remains aligned to the same clock without
participating in the selection treatment. Its cells always render their backend
verdict at full state strength.

Basal verdicts use the existing Harmonic theme roles, not a new palette. Held,
insufficient-evidence, and no-data states each keep a distinct painted treatment
and a structural tell so their meaning does not depend on hue alone. The chart's
Light and Dark treatments are judged on the final composited result, including the
window scrim, rather than on source tokens measured alone.

**Why.** The running synthetic app reproduces the reported ambiguity: each brace
edge ends at the basal lane's bottom rather than the glucose chart's bottom, and
the selection applies reduced opacity to basal cells outside the window. Those are
frozen behaviors P14 and P43, so correcting them requires an explicit ledger
amendment. The existing browser contrast test measures raw marks against the panel
surface; it does not measure the marks after the selection scrim is composited and
does not establish that the basal verdicts are distinguishable from one another.

**Boundaries.** Window creation, resize, slide, wrap, preset precedence, scope
requests, and lane click navigation remain unchanged. The basal strip remains
clock-aligned and clickable. No visual change may alter `safety_status`,
`asserts_move`, findings membership, recommendation values, or staging.

## UI Craft revision provenance

- **Base:** generated fact F1.
- **Safe-start declaration:** `AGENTS.md`, “The data boundary”; generated fact F2.
- **Command:** the declared `uv run harmonic serve --no-fetch --db
  mockups/revise-e2e.synthetic/harmonic.sqlite`, with an isolated port and local
  static token added only for the reproduction.
- **Data source:** `mockups/revise-e2e.synthetic/harmonic.sqlite`, generated
  entirely by `scripts/gen_revise_e2e_db.py`; synthetic, no live fetch.
- **Surface contract:** `mockups/finding-evidence-routing.behavior.md` with
  `frontend/diagnose-workstation-behavior.replay.mjs`; generated fact F3.
- **Route:** UI Craft `revise` (`shipped`, `runnable`, complete declaration,
  synthetic data source).

## Reproduction

Headless Chromium against the safe synthetic app confirmed:

- both window edges finish at the basal strip's bottom while the glucose chart
  ends above it;
- the Overnight selection marks thirty-six basal cells outside the window and
  renders two cell opacity levels;
- Dark paints the unselected chart behind a strong neutral scrim while the basal
  strip's held and no-data cells converge into low-contrast neutrals;
- the browser console had only the expected pre-token unauthorized request from
  the normal Settings flow, followed by a populated Diagnose render.

The supplied screenshots show the same behavior at the user's wide desktop
geometry, including an insufficient-evidence slot absent from the current
synthetic database. Execution must cover all three passive basal states through
the existing fixture-driven browser opener rather than altering the generated
database by hand.

## Verification contract

1. Amend the existing behavior stories that own gate extent and basal selection
   dimming. Prove the old replay assertion fails before accepting the new one.
2. Assert rendered geometry: gate paint and hit testing end at the glucose plot,
   and no gate element intersects the basal strip.
3. Snapshot each basal cell's computed paint before and after moving a window;
   the paint for a given verdict is unchanged. Assert held,
   insufficient-evidence, and no-data remain mutually distinguishable through
   their final painted treatment and structural tells in both themes.
4. Extend the populated Diagnose browser audit to sample the actual chart state
   with and without a clock window. Measure final composited text and graphical
   relationships, including the scrim, instead of treating raw token-to-surface
   ratios as sufficient.
5. Capture and inspect same-fixture base/revision screenshots at the reported wide
   desktop geometry in Light and Dark. The revision must show unchanged window
   scope and dragging, gates ending at the x-axis, an untinted basal strip, clear
   passive basal states, and readable glucose evidence on both sides of the gates.

## Slicing

Two rubric traits fire: lifecycle-gated surface revision and live run inside the
ticket. The closest conservative anchor is Harmonic #10, but this ticket has one
frontend surface and no server or generated projection contract. It is split into
two serial chunks: (1) the behavior contract, gate containment, and basal verdict
independence; (2) the composited Dark/Light legibility audit, palette correction,
and rendered evidence. Each remains a coherent pull-request-sized capability.
