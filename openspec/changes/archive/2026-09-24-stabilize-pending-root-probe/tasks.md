# Tasks — stabilize the pending-root probe (#131)

## 1. Replace the timing race with a response barrier

- [x] Add one optional fixture-only asynchronous response-barrier callback to
      the Diagnose opener; await its returned promise and propagate callback
      failures.
- [x] Give the pending-root browser case a locally owned, idempotently released
      barrier scoped to the `720-1080` finding-case preparation request.
- [x] Assert the existing pending rendered state only after the request is held,
      then release it and assert the exact settled Afternoon projection through
      a bounded condition wait.
- [x] Remove the fixed pending-state sleep and case-wide response delay from this
      probe without changing unrelated timing stories.

## 2. Verify

- [x] Red-prove that bypassing the barrier fails the focused regression for the
      intended pending-state reason.
- [x] Run the Diagnose workstation browser suite and the dependency-free
      frontend suite with zero failures.
