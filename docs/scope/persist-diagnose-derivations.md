# Scope ledger — persist Diagnose derivations (ticket 82)

## Decisions

- Ticket 82 is the research spike of a larger map: deliverable is measured per-shape cold times plus a persistence/freshness design record; implementation lands as follow-on tickets from that map. Why: design needs profiling first; full build too big for one context. `inline`
- Stale-serve during recompute: after a fetch, Diagnose serves the previous fetch's results labeled with their data age; fresh results swap in when ready. Why: hour-stale guidance is already the steady state between fetches. `→ ADR` (write in the design record this spike produces)
- Recompute resource bound: simplest option — throttled in-process (single low-priority paced worker), no separate process. Why: user chose simplest; keeps one-process cache consistency. `inline`
- Profiling grounds against a read-only local snapshot of the user's own database; results summarized in the design record, never committed raw. Why: synthetic fixtures too small to reveal dominant scans. `inline`

- Warm-set drift fix (trend 14→30, warm findings projection) is not fixed in 82: the map the spike produces carries it as its own issue. Why: user decision; keeps 82 research-only. `→ issue` (discharged by the spike's map deliverable, required in the work order)

### Risk contract

- Must prevent: real patient data committed or published (CI logs are public); silently stale dosing guidance served unlabeled; writes to the real snapshot (open read-only).
- Must recover: none — investigation work, no production behavior changes.
- Accepted failure: profiling run fails or snapshot unavailable → clear stop, findings marked incomplete.
- Unsupported: live vendor fetch during investigation; any non-read-only DB access.
- Evidence owed: design record cites measured numbers with their snapshot date and shape list.
- Why: investigation-only spike touching real health data read-only. Disposition: copy into the work order.

## Open questions

- Persistence boundary: where derived artifacts live (SQLite sidecar table vs files) and what keys/invalidates them.
- Recompute scheduling: how the hourly fetch's warm pass stops saturating a small host (resource-bounded worker, niceness, staging).
- Staleness contract: what may be served while recomputation runs, and how freshness is exposed.
- Profiling: per-shape cold time on a real snapshot — not yet measured.

## Review rounds

- Round 1 (cold panel, opus): 3 blockers + 2 notes, all tagged `authoring`, all reproduced against source before fixing — (1) cold-shape list had event-comparison instead of exposures/findings case prep; (2) warm-set drift is three defects, not two; (3) open_readonly's immutable=1 forbids the live DB — profile a copy. Notes: reconcile ~5-min observation vs 20–40s code comment; Done-when lacked a falsifiable measurement criterion. All five applied to the draft.

- Round 2 (same reviewer, deltas only): 0 blockers, 2 notes tagged `injected`/`authoring` — WAL-safe snapshot copy (`.backup`), and a leftover unqualified ~5-min clause. Both applied. Order countersigned.

## Spawned tasks
