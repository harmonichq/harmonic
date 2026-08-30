# Design — Enable tablet clock-window dragging (#257)

## ADR 257 — One pointer coordinator owns mouse and touch window gestures

**Decision.** Replace the mouse-only event plumbing around the existing Diagnose
window drag state machine with one primary-pointer coordinator. The coordinator
keeps the current `draw`, `a`, `b`, and `slide` modes and their snapping, wrap,
edge-pan, live repaint, and commit functions. It captures the accepted pointer,
tracks only that pointer until `pointerup` or `pointercancel`, and releases all
transient state through one end path.

The glucose plot continues to own hit testing. Gate edges outrank the scrim
interior, the scrim interior outranks drawing a new window, and the x-axis and
basal strip remain outside the gesture region. The existing chart and gate
elements declare a touch-action policy before the browser arbitrates movement:
vertical touch movement does not alter the clock window or obstruct an
already-scrollable ancestor, while horizontal drags that begin in the glucose
plot or on a gate belong to the chart. The shell's existing no-page-scroll
contract remains unchanged. Mouse hover cursor feedback remains a mouse-only
affordance, while keyboard Escape keeps clearing a drawn window.

**Why.** The live synthetic app at 1024×768 moves the whole window under the
existing mouse replay but moves neither the scrim nor a gate under Chromium's
touch input. The implementation listens only to `mousedown`, document
`mousemove`, and document `mouseup`. Adding a separate touch state machine would
duplicate the ordering, snapping, cancellation, and cleanup rules most likely to
drift; Pointer Events carry mouse, touch, cancellation, and capture identity into
the one coordinator browsers already support.

**Boundaries.** This decision changes input transport, not clock-window meaning.
It does not change the scrim or gate visuals, the selected-window data contract,
scope requests, basal verdict rendering, ECharts hover reporting, presets, lane
navigation, analyzer output, or staging.

## UI Craft revision provenance

- **Safe-start declaration:** `AGENTS.md`, “The data boundary”.
- **Command:** `uv run harmonic serve --no-fetch --db
  mockups/revise-e2e.synthetic/harmonic.sqlite` on an isolated localhost port.
- **Data source:** generated synthetic database plus
  `mockups/diagnose-workstation.synthetic/payload.json`; no live fetch or real
  patient data.
- **Surface contract:** `mockups/finding-evidence-routing.behavior.md` with
  `frontend/diagnose-workstation-behavior.replay.mjs`.
- **Route:** UI Craft `revise` (`shipped`, `runnable`, complete declaration,
  synthetic data source).

## Reproduction

At 1024×768 against the exact no-fetch app, replay S04 passes with mouse input.
A Chromium touch drag of 120 pixels inside the scrim leaves both gate positions
unchanged, and a 90-pixel touch drag on the right gate also leaves both positions
unchanged. Source inspection matches the observation: the drag coordinator has no
pointer or touch listeners.

## Verification contract

1. Amend the living window stories rather than creating a second ledger or
   disconnected touch harness. Prove tablet stories fail on the base for no
   movement before production edits.
2. Exercise primary touch on the scrim interior and on both gates at 1024×768.
   Sliding preserves width; resizing anchors the far edge; every path keeps the
   gesture above the glucose x-axis.
3. Exercise `pointercancel` or lost capture and prove transient live state clears
   without committing an incoherent window.
4. Re-run the existing mouse draw, full-height gate resize, grip resize, whole
   slide, wrap/edge-pan, click-without-movement, preset, Escape, hover, and lane
   stories to prove the input migration preserved their public behavior.
5. Capture and inspect the synthetic tablet result in Light and Dark, with no
   console errors, unstubbed requests, overflow, or native-scroll conflict.

## Revision evidence

The Base checkout is `c77af0b5`. The Revision checkout carries the two pointer
contract commits `b14be684` and `712f6806`. Both were served through the declared
no-fetch command over `mockups/revise-e2e.synthetic/harmonic.sqlite`; the replay
used `mockups/diagnose-workstation.synthetic/payload.json` and the repository's
cached Playwright, Vue, and ECharts browser-gate assets. No live fetch or real
patient data was used.

The tablet matrix used a 1024×768 viewport and the same 120-pixel horizontal touch
displacement in Light and Dark:

| Gesture | Base gate positions | Revision gate positions | Verdict |
| --- | --- | --- | --- |
| Scrim slide | 82.1, 135.6 | 199.8, 253.2 | Both gates moved together; width preserved. |
| Left-gate resize | 82.1, 135.6 | 135.6, 199.8 | Only the left gate moved; the right stayed fixed. |
| Right-gate resize | 82.1, 135.6 | 82.1, 253.2 | Only the right gate moved; the left stayed fixed. |

The 18 synthetic PNGs live outside the repository at
`/private/tmp/harmonic-257-c2-evidence/`: six Base captures, six matching Revision
captures, and six S03–S05 assertion captures. Every image is 1024×768. Inspection
confirmed unchanged gate and chart treatment, gate containment above the glucose
x-axis, no panel or page overflow, and the same geometry in Light and Dark. The
Base gestures left the 02:15–04:45 window unchanged. Revision moved the scrim to
07:45–10:15, the left gate to 04:45 with 07:45 anchored, and the right gate to
10:15 with 02:15 anchored.

## Verification result

- The Base touch replay failed S03–S05 for no movement: 0 of 3 stories passed.
- The Revision touch replay passed S03–S05 in both themes: 3 of 3 stories passed.
- A deliberate pointer-entry break returned S03–S05 to 0 of 3 before restoration.
- The full built-app replay passed 141 of 141 stories.
- Browser gates passed: workstation 42 of 42, canvas composition 13 of 13,
  cockpit shell 14 of 14 with its two declared skips, and browser runner 1 of 1.
- The backend fast gate passed 2,104 tests with one declared skip; the frontend
  fast gate passed 527 tests; strict OpenSpec validation passed 71 changes; every
  declared drift check exited zero.
- Chunk 2 exposed no browser-specific conflict, so it made no corrective source
  change. The reviewed chunk-1 pointer implementation is the complete code delta.

## Slicing

Two rubric traits fire: lifecycle-gated surface revision and live run inside the
ticket. The closest measured anchor is Harmonic #253/#256, narrowed to two serial
chunks: (1) pointer-contract implementation plus fail-first ledger/replay coverage;
(2) live tablet browser evidence and corrective fixes. Reviewer memory independently
records this same split for bounded shipped Diagnose revisions.
