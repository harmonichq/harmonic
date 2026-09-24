# Explore history-range selection (#138)

## Why

Explore needs to let a reader compare bounded stretches of their own history
without letting a reader-selected stretch influence Harmonic's advisory dosing
guidance. The current fixed 30-day view cannot answer longer-term or pinned-date
questions, while an unbounded range would make the already-expensive Explore
derivations grow without limit.

## What changes

- Explore gets 30-, 60-, and 90-day quick ranges plus a pinned absolute date
  range whose length is capped at 90 days.
- Changing the range re-scopes Explore charts only. Findings, suggested numbers,
  and every advice endpoint stay on their fixed input window.
- The quick ranges use the existing cache and durable sidecar path; arbitrary
  absolute ranges compute on demand.
- This change records the settled contract only. The picker, warm trigger, and
  range parameter are implemented by later tickets.

## Boundaries

The range control exists only in Explore, which remains advice-free. This change
does not alter a rendered surface, an endpoint, a derivation, or a support floor.
