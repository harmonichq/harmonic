# Diagnose behavior-ledger parity (#188)

## Why

The Diagnose workstation's frozen behavior ledger and replay can drift while
both still look plausible. The ledger previously carried only a numeric count,
and the frontend fast gate compared replay registrations with tags from that
same replay file. Neither check proved that the frozen contract and executable
registry named the same stories.

## What changes

- Record the compact issued story-ID namespace separately from its active and
  permanently retired partitions.
- Compare the ledger inventories, replay registry, and unique STORY tags by ID
  in the dependency-free frontend gate.
- Anchor the initial issued namespace so coordinated deletion or renumbering
  cannot erase an existing story identity.
- Exercise missing inventory, replay removal, ledger orphan, sanctioned
  retirement, coordinated deletion, and coordinated renumbering against the
  committed sources in memory.

## Boundaries

No Diagnose behavior, rendered surface, replay semantics, synthetic fixture,
API, dosing advice, analyzer, staging verdict, or safety rule changes. A future
story may extend the compact issued-ID guard explicitly; an existing ID may
leave the replay only through a permanent retirement record.
