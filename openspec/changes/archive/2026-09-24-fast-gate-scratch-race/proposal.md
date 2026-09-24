# Keep fast-gate scratch outside the stylesheet inventory (#231)

## Why

The dependency-free frontend gate runs test files concurrently. Its fail-closed
browser preflight regression creates and removes empty vendor directories under
`frontend/`, while the compact evidence-row regression recursively inventories
every stylesheet below that same directory. If deletion lands during the walk,
the row-box test dies at import with `ENOENT`, obscuring the owning subtest and
making a correct branch look intermittently broken.

## What changes

- Create the fail-closed suite's temporary vendor directories under the
  operating-system temporary root instead of the frontend source tree.
- Pin that filesystem boundary with a deterministic fail-first assertion.
- Preserve the complete stylesheet inventory, every fail-closed prerequisite
  assertion, and all shipped Harmonic behavior.

## Risk contract

- **Must prevent:** creating fail-closed scratch directories under frontend;
  weakening the fail-closed prerequisite assertions or ADR 39's complete
  stylesheet inventory; silent incorrect success; secret exposure; irreversible
  loss of authoritative data.
- **Must recover:** nothing automatically.
- **Accepted failure:** if the operating-system temporary root is unavailable or
  unwritable, the test may stop clearly and leave manual environment repair.
- **Unsupported:** Node versions outside the repository's Node 22 CI contract;
  arbitrary concurrent mutation of other source-tree paths.
- **Evidence owed:** the boundary assertion fails on the ticket base before the
  scratch-root change; the focused fail-closed and stylesheet-inventory tests
  pass together afterwards; the complete frontend CI job passes.

Why: a misleading intermittent red trains contributors to ignore the fast gate,
while a careless fix could weaken a deliberately closed source inventory.

Disposition: inline in this proposal and unchanged in the locked work order.

## Impact

One dependency-free frontend test harness and its change record only. No rendered
surface, production stylesheet, browser gate, API, model, fixture, stored data,
or advisory guidance changes.
