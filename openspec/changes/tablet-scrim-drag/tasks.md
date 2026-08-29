# Tasks — Enable tablet clock-window dragging (#257)

## 1. Unify the clock-window drag contract under Pointer Events

- [ ] Amend the frozen Diagnose behavior ledger and existing replay stories so
      whole-window and both-gate drags explicitly cover primary touch at 1024×768.
- [ ] Prove the new touch stories fail on the base because neither gesture moves.
- [ ] Route mouse and touch through the existing draw/resize/slide state machine,
      with one active pointer, pointer capture, and shared completion/cancellation.
- [ ] Preserve gate-over-scrim hit precedence, plot-only containment, snap/wrap/
      edge-pan semantics, click/tap-without-movement, hover, Escape, and lane input.
- [ ] Add dependency-free coverage for any extracted input-independent transition
      only if the production interface genuinely exposes one; do not duplicate the
      drag state machine solely to make it unit-testable.

## 2. Prove the tablet interaction in the built app

- [ ] Run the exact synthetic no-fetch app and the amended replay at 1024×768 with
      real Chromium touch input for scrim, left-gate, right-gate, and cancellation.
- [ ] Verify vertical touch movement does not alter the clock window or obstruct
      an already-scrollable ancestor, while horizontal drags that begin in the
      glucose plot or on a gate move the window. Preserve the shell's existing
      no-page-scroll contract.
- [ ] Re-run the existing mouse window stories, full Diagnose replay, and affected
      workstation/cockpit browser gates with nonzero assertions and no browser
      errors or unstubbed requests.
- [ ] Capture and inspect synthetic 1024×768 Light/Dark evidence, keeping real
      health data out of the repository and logs.
- [ ] Run the complete fast gate, drift checks, strict OpenSpec validation, and
      affected browser legs declared in `AGENTS.md`; every command must exit zero.
