# Persist Diagnose derivations across restarts (#82)

## Why

Every expensive Diagnose result lives only in the API process's in-memory
`ResultCache`, so a restart makes all of them cold even when the database has
not changed, and the hourly fetch clears the whole cache and recomputes seven
shapes at once. On the operator's home-lab container both are visible as the
same symptom: Diagnose takes about five minutes to render, and the app is
effectively unavailable for that stretch after every fetch.

Ticket 82 is the research spike for that map. It measures the cold path against
a real-shaped snapshot, records the durable-artifact design, and files the
implementation as follow-on issues. It changes no production behavior.

The measurement moved the problem. A durable store was the assumed fix; it is
not where the time is. One shape — the event-comparison catalog capture behind
the exposures feed — is 98 of the 113 seconds a cold arrival costs, because it
reads the whole stored history and then rescans it once per meal. Persisting
that result would carry the same 98 seconds into every post-fetch recompute
instead of removing it.

## What changes

- A profiling harness (`scripts/profile_cold_shapes.py`) times each cold-arrival
  shape against a read-only snapshot copy and, on request, prints the cProfile
  leaders that name the dominant scan. It writes nothing, fetches nothing, and
  prints no record.
- The design record pins three decisions: where derived artifacts live and what
  invalidates them, that previously derived results keep serving with a visible
  data age while recomputation runs, and that recomputation is one throttled
  in-process worker rather than today's all-at-once pre-warm.
- The implementation map is filed as follow-on issues, ordered so the two scan
  fixes that remove most of the cost land before the durable store that would
  otherwise be built around it.
- The warm-set drift the ticket reported is corrected by measurement: two of its
  three counts hold, and the third is the opposite of what it looked like — the
  event-comparison catalog warm is the one shape the cold arrival most needs.

## Impact

- No production code changes here. `ciq_autotune/` and `frontend/` are untouched.
- One new development script under `scripts/`, run by hand against a snapshot
  copy. It is not wired into CI: it needs a real-shaped database, and the
  repository has none by design.
- The follow-on issues carry the behavior changes, including the warm-set
  reconciliation.
