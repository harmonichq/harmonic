# Tasks — Enable tablet clock-window dragging (#257)

## 1. Unify the clock-window drag contract under Pointer Events

- [x] Implement the requirement in `specs/surfaces/spec.md` through ADR 257's one
      pointer coordinator.
- [x] Amend living ledger rows P03–P05/P122 and app-only replay S03–S05; record the
      base failure before the production edit.
- [x] Confirm the existing mouse/non-window inventory remains green without a
      second gesture implementation or extracted test seam.

## 2. Prove the tablet interaction in the built app

- [x] Execute the requirement and recovery cases through the exact synthetic
      no-fetch app at 1024×768.
- [x] Capture and inspect the required synthetic Light/Dark Base/Revision matrix.
- [x] Run the existing app replay, affected browser gates, complete fast gate,
      drift checks, and strict OpenSpec validation.
