# Tasks — persist Diagnose derivations across restarts (#82)

## 1. Measure the cold path

- [x] Add `scripts/profile_cold_shapes.py`: one shape at a time, each on its own
      `Store.open_readonly` connection, in the order the SPA requests them.
- [x] Cover every shape the cold arrival runs, plus the trend window only the
      hourly pre-warm computes, so the drift is measurable rather than argued.
- [x] Print wall time and, on request, the cProfile leaders that name the
      dominant scan — never a record, because CI logs are public.
- [x] Run it against a `.backup` copy of the operator's database, taken from the
      running container and deleted after the run. Nothing from it is committed.
- [x] Record per-shape seconds, the snapshot's date and row-count scale, and the
      dominant scans in the design record.
- [x] Reconcile the ~5-minute observation with the 20–40s figure in `api.py`.

## 2. Record the design

- [x] ADR 82 — Durable derived-artifact boundary: a versioned sidecar keyed by
      input revision, parameters, and model/schema version, atomically replaced.
- [x] ADR 82 — Stale-serve with visible age: previous results keep serving,
      labeled with the input-data age, backend-stamped.
- [x] ADR 82 — Throttled in-process recompute: one paced low-priority worker
      replaces the all-at-once pre-warm.
- [x] State how the canonical analysis, scenarios and exposures are computed once
      per input/model version and shared with the findings projection.

## 3. Lay out the implementation

- [x] File the map as seven one-context issues (#120–#126), ordered so the two
      scan fixes precede the durable store built around them.
- [x] File the warm-set reconciliation as its own issue (#122), including the
      count that measurement reversed.
- [x] Post the findings summary on #82.

## Not in this change

- [ ] Any production behavior change. `ciq_autotune/` and `frontend/` are
      untouched here; the map's issues carry the implementation.
