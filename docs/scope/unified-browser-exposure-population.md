# Scope ledger — Unified browser exposure population (#64)

## Decisions

- **One browser exposure object.** The workstation generator selects one
  `browser_exposures` `{window, exposures}` value. Those fields populate the
  existing provenance-wrapped exposure capture and `payload.exposures`; the
  event generator consumes the latter. This keeps the public replay's actual
  input canonical without removing either fixture's required provenance.
  **Why:** the two workstation outputs currently hold identical population rows
  but different start dates.
  **Disposition:** → ADR 64.
- **Exact closed source window.** `capture.source_window` equals
  `payload.exposures.window`, every occurrence date lies in the inclusive
  interval, and projected responses republish the same object. **Why:** a merely
  containing or independently derived window can still describe a different
  population. **Disposition:** → ADR 64.
- **One import-safe generator interface.** The event generator's CLI and its
  negative tests call the same build/validation operation. Each family supplies
  the comparison plan's full twenty-row cardinality by index, with no modulo
  fallback; removing a row is a named incomplete-population failure. **Why:**
  malformed identities and windows must be exercised without extracting a
  validator-only mirror. **Disposition:** → ADR 64.
- **Closed downstream pipeline.** Regenerate workstation fixtures, event capture,
  then the Python projection mirror; keep all three existing checks. **Why:** the
  mirror is generated from the capture and otherwise goes stale independently.
  **Disposition:** → ADR 64.
- **Stable public proof.** S40 is the lows click-through, both it and S32 observe
  the actual request URL's opaque `occ`, and the ledger count/inventory update
  together. **Why:** echoing `requested_id` from the stub does not observe what
  the browser sent. **Disposition:** → ADR 64.

### Risk contract

- **Must prevent:** real pump or patient data entering committed fixtures; a
  green gate over unrelated roster and canvas populations; replacing the opaque
  occurrence id with the episode-and-time join key; production analysis,
  staging, Plan, settings, support, or classifier behavior changing.
- **Must recover:** nothing automatically.
- **Accepted failure:** stale or inconsistent fixtures stop with a named
  regeneration/test failure; recovery is manual regeneration and rerun.
- **Unsupported:** real pump data, live vendor fetches, and fetch-enabled server
  startup.
- **Evidence owed:** exact cross-fixture population/window agreement, negative
  identity/window validation, S32 and S40 through the visible app request and
  drawn trace, and every existing fast/drift/browser gate.

Why: this is fixture-only but guards a dosing-evidence surface against silent
false-green coverage.

Disposition: inline in the proposal and locked work order.

### Review rounds

- **Round 1:** three parallel cold lenses returned nine reports, consolidated to
  six verified blockers. All six were `authoring`; zero were `injected`.
  Canonical source/window, generated mirror, negative validation, reproducible
  red proof, closed S40 inventory, and actual request observation were revised.
- **Round 2:** the same lenses returned three verified blockers, all `injected`
  by the first fix round: cardinality for the negative identity case, provenance
  wrapper wording, and an explicit mirror check. Injected blockers rose from
  zero to three, so the clean-rewrite signal fired; the work order was rewritten
  rather than patched again.
- **Round 3:** all three lenses read the clean rewrite from scratch and returned
  no blockers. The order is countersigned across grounding, acceptance,
  interface shape, scope/risk, and cost.

## Open questions

None. ADR 62 already settles selection semantics; no product or visual ruling is
needed.

## Spawned tasks

- `fixture_machinery_review` — complete, three blocking reports.
- `cold_executor_review` — complete, three blocking reports.
- `scope_domain_review` — complete, three blocking reports.

## Remaining dispositions

None. ADR 64, the proposal risk contract, tasks, and the work-order draft carry
every settled decision.
