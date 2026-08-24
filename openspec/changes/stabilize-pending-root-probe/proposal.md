# Stabilize the pending-root probe (#131)

## Why

The Diagnose browser gate's pending-root probe reads the loading state after a
fixed 250 ms wait while its synthetic preparation response is delayed by 900
ms. Under enough scheduler load, the response can settle before the assertion,
so the gate fails even though the shipped pending-state behavior is unchanged.

A pending-state test must control the response boundary it is asserting across.
Repeating the timing race more often cannot make that contract deterministic.

## What changes

- The fixture-backed Diagnose opener gains one optional asynchronous response
  barrier. Its route awaits the callback before applying the existing response
  behavior; callback errors fail the request and test loudly.
- The pending-root browser case owns a barrier for the Afternoon preparation
  request, waits until that exact request is held, asserts the pending rendered
  state, releases the response, and asserts the settled rendered state.
- The probe no longer uses its fixed pending-state sleep or a case-wide response
  delay. Other browser stories and their timing controls remain unchanged.

## Risk contract

- **Must prevent:** a silent false-green pending-state test; any change to the
  production UI, server behavior, clinical advice, staging, or safety gates.
- **Must recover:** nothing automatically; the fixture response is hermetic.
- **Accepted failure:** missing browser prerequisites stop the suite loudly and
  require manual environment repair, matching the existing fail-closed gate.
- **Unsupported:** proving arbitrary scheduler behavior by repetition, or using
  wall-clock sleeps as the synchronization contract.
- **Evidence owed:** the rendered loading, row, metadata, and Filter state while
  the response is held; the exact settled Afternoon projection after release;
  the existing Diagnose browser and dependency-free frontend suites.

## Impact

Test harness and browser assertions only. No rendered surface, fixture payload,
generated artifact, behavior ledger, production module, API, analyzer, staging
predicate, or safety floor changes.
