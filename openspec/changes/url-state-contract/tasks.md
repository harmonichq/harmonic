# Tasks — One URL-state contract (#53)

## 1. Establish one route interface

- [ ] Add one Vue-free URL-state module whose interface accepts and returns a
      complete validated app route and owns canonical serialization and atomic
      `pushState`/`replaceState`/`popstate` behavior.
- [ ] Serve the SPA document at canonical `/app/` page paths without changing
      existing root-level JSON endpoints. Make relative frontend assets resolve
      from direct page loads.
- [ ] Replace hash parsing, writing, migration aliases, and `hashchange`
      handling in the cockpit shell with the shared route interface.
- [ ] Cover parsing, serialization, invalid-link failure, root/old-hash
      fallback, direct cold load, page navigation, and Back/Forward through the
      public route interface.

## 2. Address meaningful evidence state

- [ ] Route Day date, Guide article, Verify trial, and Diagnose finding,
      factor, window, projection, and occurrence through complete route state.
- [ ] Move the event-comparison lens from independent `location.search` and
      history ownership to the shared route interface while preserving P53's
      re-request and stale-response guard.
- [ ] Push one history entry per completed meaningful navigation; do not push
      entries for intermediate drag or resize motion.
- [ ] Reject unknown, incomplete, or inconsistent canonical state visibly and
      atomically; do not partially apply it.

## 3. Amend the shipped behavior contracts

- [ ] Re-inventory and replay the Cockpit and finding-evidence ledgers against
      exact base before production edits.
- [ ] Amend Cockpit S2 and R1 and finding-evidence P53 with the issue 53
      decision, exact base, current manufactured-data provenance, and public
      direct-load/history assertions.
- [ ] Amend the ALIGN story's superseded no-URL ruling. Add the eight shipped
      Verify stories to the umbrella ledger and retag its replay from legacy
      `LOCK:` tags to `STORY:` tags.
- [ ] Add stories for newly bookmarkable Diagnose and Verify evidence states,
      the invalid-link stop, and completed-change Back/Forward behavior. Prove
      changed stories fail against base before passing on the revision.
- [ ] Update every browser opener that currently manufactures a hash URL so
      the full gate exercises canonical public paths and fails closed when the
      SPA entry route or assets are absent.

## 4. Verify the built revision

- [ ] Run the fast gate, every drift check, and all nine browser-gate legs from
      `AGENTS.md`; every registry must run nonzero assertions and exit zero.
- [ ] Serve base and revision sequentially through the exact declared no-fetch
      command and manufactured database. Capture the finite E1–E8 matrix in ADR
      53, including the 390×844 mobile drawer row.
- [ ] Record raw replay output, red-before evidence, rendered comparisons, and
      final verification under this change; use no real patient data.
- [ ] Run Full-depth review over the entire diff and resolve every blocking
      finding before opening the pull request.
- [ ] Fold the settled route requirements into
      `openspec/specs/surfaces/spec.md` in the final pull request.
