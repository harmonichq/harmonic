# Unified browser exposure population (#64)

## Why

The Diagnose workstation and its By event canvas are browser-tested with two
generated synthetic fixture sets, but those sets do not describe one exposure
population. Meals were partially re-keyed during #62 so one click-through could
be proven; lows remain wholly disjoint, and the event capture now mixes dates
that disagree with its own source window.

Each fixture's drift check passes on this state because each generator validates
only its own output. A green browser gate can therefore prove a meal path while
remaining unable to prove that the lows roster and canvas refer to the same
episodes.

## What changes

- The Diagnose workstation generator selects one manufactured meals-and-lows
  `{window, exposures}` object. Its fields populate the existing provenance-
  wrapped exposure capture and are also written as `payload.exposures`; neither
  file loses its required synthetic provenance. The event-comparison generator consumes
  `payload.exposures` instead of manufacturing a second population.
- The event capture's source window is an exact copy of
  `payload.exposures.window`, and every projected response republishes it, so
  occurrence dates and published coordinates agree by construction.
- The browser behavior ledger gains the lows counterpart to the existing meal
  roster-selection story, proving the visible row and selected By event trace
  resolve through the server-owned occurrence id.
- The downstream Python projection mirror is regenerated after the capture.
  Existing generator `--check` gates remain the drift boundary; no production
  endpoint, classifier, support floor, or visual design changes.

## Risk contract

- **Must prevent:** real pump or patient data entering a committed fixture; a
  green gate over unrelated roster and canvas populations; replacing the
  server's unique occurrence id with the episode-and-time join pair; changing
  production analysis, support, staging, Plan, or settings behavior.
- **Must recover:** nothing automatically.
- **Accepted failure:** a stale or inconsistent generated fixture stops locally
  and in CI with a named regeneration failure; recovery is to regenerate from
  the committed synthetic source and rerun the gate.
- **Unsupported:** verification against real pump data, live vendor fetches, or a
  fetch-enabled server run.
- **Evidence owed:** meals and lows in both fixture sets resolve to the same
  generated exposure identities; the workstation and event fixtures publish
  the exact same window and every event occurrence date falls inside it; invalid
  identity/window inputs fail generation; the visible lows roster selection
  draws its own By event trace after sending the opaque id; the repository's
  full fast gate, drift checks, and browser gates remain green.

## Impact

Generated synthetic fixtures, their generators, and the frozen browser behavior
ledger only. No baseline capability specification changes because shipped
behavior and public server contracts do not change.
