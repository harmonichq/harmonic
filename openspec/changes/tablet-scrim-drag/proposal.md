# Enable tablet clock-window dragging (#257)

## Why

The Diagnose glucose-by-time-of-day chart already lets a mouse user drag either
clock gate to resize the selected window and drag inside the window to move it
whole. At a 1024×768 tablet viewport, Chromium touch drags on both the scrim and
a gate leave the window unchanged because the shipped coordinator listens only
to mouse events.

That makes the visible tablet affordances inert precisely where direct touch is
the expected input. The existing window model and visual treatment are sound;
the missing capability is one input path into that model.

## What changes

- Implement the tablet gesture requirement defined once in
  `specs/surfaces/spec.md` through the existing chart drag coordinator.
- Amend the shipped-surface inventory and its app-only replay so that contract has
  executable primary-touch regression evidence at 1024×768.
- Preserve the mouse and non-window behavior already owned by that inventory.

## Risk contract

- **Must prevent:** touch gestures that move the wrong edge, change window width
  during a slide, strand a live drag, start from outside the glucose plot, move
  the window during vertical touch movement, obstruct an already-scrollable
  ancestor, regress the shell's no-page-scroll contract or mouse/keyboard
  behavior, alter advisory data or staging, or expose real health data in evidence.
- **Must recover:** pointer cancellation or loss of capture ends the active gesture,
  clears transient drag state, and leaves the last committed window coherent.
- **Accepted failure:** missing browser prerequisites, vendored assets, or the
  synthetic no-fetch app source fail loudly and require manual environment repair.
- **Unsupported:** multi-touch window manipulation, stylus-specific pressure or
  tilt semantics, redesigning the clock-window visuals, changing snap/wrap/scope
  semantics, or changing chart data, backend analysis, safety, or staging.
- **Evidence owed:** fail-first tablet scrim and both-gate drag stories at 1024×768;
  cancellation and click/tap-without-movement behavior; the existing mouse window
  stories; full Diagnose replay; repository fast gate, drift checks, and affected
  browser gates; inspected synthetic tablet evidence in Light and Dark.

## Impact

The shipped Diagnose drag coordinator, its frozen behavior ledger and replay,
the affected browser coverage, the `surfaces` capability specification, and this
change record only. No backend, analyzer, recommendation, API, fixture value,
theme, stored data, or pump-setting behavior changes.
