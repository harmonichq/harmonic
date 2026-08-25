# Design — missed-meal comparison (#178)

## ADR 178 — Missed-meal comparison populations and anchors

### Context

The historical missed-meal exception in ADR 79 Decision 6 used the High
roster's peak-oriented event lens and a union axis. That rule predates #178; it
did not settle this ticket's comparison. This ADR amends and supersedes that
historical rule for `missed_meal` only.

### Decision

The event comparison has two server-owned populations:

- **Attributed missed:** Highs whose attribution winner is Missed / unannounced
  meal, not every High that the classifier matched.
- **Announced baseline:** every completed carb-bolus meal in the analysis window,
  regardless of its later outcome.

Attributed missed rows anchor at detected rise onset (`reach_start`); announced
rows anchor at completed carb-bolus time. Both use the fixed `[-60, +300]`
minute axis. The server publishes exact missed, announced, and not-comparable
counts, including an explicit zero state when no attributed missed rows exist;
the browser does not fall back to classifier matches or High verdict membership.

The comparison account is independent of the five-way High verdict account. The
High roster, attribution winner, verdict counts, and High denominator remain
High-only; the announced cohort is a comparison population outside that roster.

The cross-process validation boundary is explicit: server support classifications
are an opaque closed enum, and the frontend derives no support floor. The client
checks only threshold-free schema coherence: a point's `n` cannot exceed its
cohort `usable_count`; `n = 0` has null aggregates; finite ordered aggregates
require `n > 0`; withheld aggregates are null; and an exact zero cohort has no
drawable evidence or episodes.

### Alternatives rejected

- A High-only clean baseline was rejected because conditioning the baseline on a
  subsequent High recreates selection bias.
- A union axis was rejected because it mixes different anchor moments and leaves
  a sparse, misleading lead-in.
- Frontend-derived cohort membership was rejected because the server must own
  populations, counts, anchors, and opaque Occurrence selection.

### Consequences and evidence

The case-file contract and Diagnose surface carry one authoritative comparison
account, an explicit empty state, and server-owned selection; no staging,
attribution, verdict taxonomy, or legacy standalone endpoint changes. Synthetic
fixture generation and public API coverage exercise both populations, anchors,
the fixed window, zero state, and selection. Browser replay stories C44, C56,
and C57 cover the populated, empty, and selected states with recorded synthetic
evidence.
