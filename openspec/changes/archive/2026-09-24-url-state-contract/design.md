# Design — One hash-route contract (#53)

## ADR 53 — Page and existing shareable state live in one hash route

**Ruling.** Harmonic's canonical browser route is
`#/<page>?<existing-page-state>`. The page is one of `day`, `diagnose`,
`verify`, `plan`, `settings`, or `guide`. For example:

```text
#/diagnose?view=lows&factor=late_bolus
```

The hash route carries only state that already round-trips: the selected page,
Day `date`, Guide `article`, and P53's existing `view`, `factor`,
`start_min`, `end_min`, `another`, and `occ` coordinates. The P53 coordinates
move from `location.search` into the Diagnose hash route. No other UI state
becomes bookmarkable.

**Context.** The shell currently parses and writes page state after `#`, while
the event-comparison reader independently parses and writes P53 coordinates in
`location.search`. A single address therefore has two URL-state owners. The
change is to adopt the conventional hash-router shape and put the existing
page-local coordinates behind the same routing boundary.

### Routing interface

The existing Vue-free routing seam is responsible for three operations:

1. Parse the current address into one page plus that page's existing URL state.
2. Serialize that state as `#/<page>` with an optional fragment query.
3. Apply route transitions and history restoration through one notification
   path so the address and shown state cannot diverge silently.

Pages retain their current defaults, value handling, request timing, and state
ownership. The router transports existing state; it does not introduce a
closed value grammar, asynchronously validate runtime identities, or decide
new product behavior.

A no-slash hash such as `#diagnose?...` may be replaced with its slash form.
The old split form may move the recognized P53 keys from `location.search` into
the Diagnose fragment query. Normalization uses replacement rather than adding
a navigation step. No broader legacy-URL promise is made.

Back and Forward reapply one parsed route for this in-scope state. A restored
P53 route still re-requests its projection, and its existing generation check
still prevents an older response from replacing the restored state. Existing
choices about when an interaction pushes or replaces history remain unchanged.

### Supersession

This ADR supersedes only:

- ADR 31's hash/query-split statement, by specifying that the split retires
  into the fragment query of a hash route rather than into server paths; and
- P53's wording that locates its coordinates in `location.search`, replacing
  it with the Diagnose hash route's query portion.

All other ADR 31 and P53 rulings remain in force. In particular, P53 still
requires a history restoration to re-request the projection and requires stale
responses to be dropped by generation.

### Consequences

- Server and API paths do not change; direct `/app/...` routing is not part of
  this decision.
- The existing UI, data flows, authorization, analyzers, fixtures, and rendered
  layout do not change.
- There is no invalid-link UI, new bookmarkable state, screenshot obligation,
  identity-resolution transaction, or new provenance harness.
- The shell currently emits `modal`, `occt`, `occd`, and `occdet` but does not
  parse them. Their unrestorable behavior remains unchanged and earns no
  round-trip acceptance in issue 53.
- Evidence is limited to route-interface behavior and the relevant existing
  shell/P53 browser checks.

Decision: harmonichq/harmonic#53, 2026-08-22.
