# One hash-route contract (#53)

## Why

Harmonic currently splits one browser address between the shell's hash route
and P53's Diagnose coordinates in `location.search`. Page navigation and
page-local state can therefore be restored through different URL readers and
different history events.

## What changes

- The canonical browser form is `#/<page>?<existing-page-state>`, for example
  `#/diagnose?view=lows&factor=late_bolus`.
- The pages remain `day`, `diagnose`, `verify`, `plan`, `settings`, and `guide`.
- One Vue-free routing interface parses, serializes, and applies the page and
  its existing shareable state. The shell scope is the page plus its currently
  round-tripped Day `date` and Guide `article` state. P53's `view`, `factor`,
  `start_min`, `end_min`, `another`, and `occ` move from `location.search` into
  the Diagnose fragment query.
- Existing no-slash hashes and the old split form may be normalized at the
  routing boundary. This is a small migration, not a general compatibility
  layer.
- No additional UI state becomes bookmarkable.
- The shell's emitted-but-unparsed `modal`, `occt`, `occd`, and `occdet` keys
  remain unrestorable; fixing that existing behavior is out of scope.

Everything else stays as shipped: page behavior, request behavior, P53's
back/forward re-request and stale-response guard, server and API routes, UI,
data, authentication, analyzers, fixtures, and behavior ledgers apart from the
minimum P53 wording correction.

## Risk contract

- **Must prevent:** the fragment address names one page state while the app
  silently shows another.
- **Must recover:** Back and Forward reapply the addressed existing state, and
  P53 still rejects a response from an older request generation.
- **Accepted behavior:** existing defaults and invalid-value behavior remain
  unchanged; this change adds no invalid-link surface or identity-resolution
  model.
- **Ordinary safeguards:** secrets must not be exposed, authoritative data must
  not be irreversibly lost, and verification must not report silent success.
  This change introduces no data mutation, patient-data access, credential
  access, or server launch.
- **Evidence owed:** parse, serialize, normalization, and history behavior for
  the page, Day `date`, Guide `article`, and P53 keys through the routing
  interface, plus preservation of P53's re-request and stale-response behavior.
  No modal/highlight round trip is claimed.

## Impact

This changes only frontend URL routing and the wording that locates P53 state.
It does not change rendered content or layout.
