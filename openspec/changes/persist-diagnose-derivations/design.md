# Design — persist Diagnose derivations across restarts (#82)

## What was measured

**Snapshot.** A copy of the operator's own database, taken 2026-08-24 with
`sqlite3 <db> ".backup <dest>"` from the running home-lab container, opened with
`Store.open_readonly` and deleted after the run. Nothing from it is committed.
Scale: 51,490 CGM readings, 54,832 basal deliveries, 1,820 boluses, 520 pump
events, 1,472 IOB events, 81 manual carb entries, 57 prompt responses — about
179 days of history, 9.8 MB.

**Harness.** `scripts/profile_cold_shapes.py`, one shape at a time, each on its
own read-only connection, in the order the SPA requests them.

**Machine.** An Apple-silicon laptop. The home-lab container the symptom was
observed on is an Intel i5-7260U (2 cores / 4 threads, 2.2 GHz, 7.7 GB). The same
pure-Python loop takes 0.2s on the laptop and 0.6s on that host, so host-scaled
figures below multiply by **3.0**. That factor is a single-thread arithmetic
ratio, which is the right shape for this workload — it is pure-Python and holds
the GIL — but it is a scaling estimate, not a host measurement.

| Shape (cold arrival, in request order) | Laptop | Host-scaled |
|---|---|---|
| backtest (holdout 2) | 2.83s | ~8.5s |
| analyze (30, unpooled) | 1.62s | ~4.9s |
| analyze (30, pooled) | 1.55s | ~4.7s |
| scenarios (30) | 1.08s | ~3.2s |
| explore time-of-day | 0.28s | ~0.8s |
| **exposures / event-comparison preparation** | **98.20s** | **~4.9 min** |
| findings case preparation | 4.65s | ~14s |
| outcomes trend (30) | 3.11s | ~9.3s |
| **serialized cold arrival** | **113.32s** | **~5.7 min** |
| outcomes trend (14) — pre-warm only, not requested cold | 2.65s | ~8.0s |

Every shape in the ticket's list carries a measured time; none is missing.

### #120 bounded catalog-capture measurement

On the same read-only snapshot and cold `exposures` shape, bounding the
event-comparison catalog to its 30-day Diagnose source window plus the required
300-minute context lead-in reduced the aggregate exposure preparation time from
**98.20s** to **26.74s**. This records aggregate timing only; the separately
unbounded `build_exposures` reads and the per-meal suspend-ownership rescan
remain for #121.

### The ~5-minute observation versus the 20–40s in `api.py`

They are not in conflict once measured: **the operator's figure is the accurate
one, and the code comment no longer describes the set it sits above.** The
serialized cold arrival is 113.3s on the laptop, ~5.7 min host-scaled, which is
the "about five minutes" the ticket reports. The hourly pre-warm set is the same
shapes minus the 30-day trend and the findings preparation, plus the 14-day
trend: 108.2s, ~5.4 min host-scaled — so the post-fetch stall and the cold
arrival are the same cost, and the same one shape drives both.

This repository's history is squashed to a single commit, so the 20–40s figure
cannot be dated against the code around it. What can be said is that it does not
describe today's set on today's data volume, and that #122 replaces it with a
measured figure or drops it.

### The dominant scan

`prepare_event_comparisons` is 98.2s of the 113.3s. Under cProfile (which inflates
the shape to 123.6s), the leaders are unambiguous:

```
   ncalls  tottime  cumtime  function
        1    0.014  121.894  event_comparison.py:439(_build_catalog_capture)
      540    0.166  120.020  event_comparison.py:320(_route_meal)
     1063  102.457  108.947  analyzers/scenario/meal_suspend.py:15(classify_meal_owned_suspend)
 61407756    3.007    3.007  analyzers/classifiers/context_gate.py:84(_is_suspend)
```

Two compounding facts, both structural:

1. **The capture reads the whole history to build a 30-day product.**
   `_build_catalog_capture` calls `store.cgm_readings()`, `store.bolus_events()`
   and `store.basal_events()` unbounded, then hands those full sequences to the
   classifiers. Cost therefore grows with total history forever, while the
   product stays a fixed 30-day window.
2. **The suspend-ownership rule re-derives everything per meal.**
   `classify_meal_owned_suspend` is called once per meal and each call re-sorts
   and re-indexes the meals, re-collects every suspend anchor across the full
   basal series, and then scans every meal again per anchor. 61,407,756
   `_is_suspend` evaluations is 1,063 calls × 54,832 basal rows: a full-history
   rescan per meal. The ownership loop itself is meals × anchors × meals.

Neither is an I/O cost, and neither is fixed by persistence. **This is the
finding that reorders the map:** persisting the artifact would carry the same
98 seconds into every post-fetch recompute rather than removing it. The two scan
fixes (#120, #121) land first; the durable boundary is built around what is left.

### #121 exposure update — capture-scoped meal-suspend ownership

On the same profile shape, the branch baseline was **98.20s**. After #121,
the measured exposure preparation is **37.93s**. `classify_meal_owned_suspend`
is no longer the leader (**4.41s** cumulative); the remaining leaders are
`builtins.sorted`, `model.__init__`, `classify_carb_undercount`, and
`classify_late_bolus`.

### The duplication the ticket flagged is real and small

The findings case preparation rebuilds the analysis, the exposures and the
scenario report. Measured, the whole preparation is 4.65s, and under cProfile the
rebuild is 7.83s of that run's 10.17s — so about **3.4s** of the 4.65s is
analysis, scenario and exposure work the cold arrival already computed elsewhere,
and roughly 1.0s is the case population that only this shape builds. Three
percent of the cold path. Worth removing (#126), never the reason the surface is
slow.

### One of the ticket's three drift counts is the opposite of what it looked like

`/api/explore/exposures` returns `event_comparison_preparation().exposure_payload`.
The pre-warm's "event-comparison-source-catalog" entry and the exposures feed the
cold arrival requests are therefore **the same computation** — the single most
expensive one. It is not warm-set waste; it is the one entry that must stay. The
other two counts hold: the trend window is warmed at 14 while Diagnose asks 30,
and the findings case preparation is never warmed. #122 carries all three.

## #122 — Reconcile the Diagnose cold-arrival pre-warm

The hourly warm set now matches the fixed cacheable requests in `loadAll` and
`loadAudit`: the trend uses its 30-day cold-arrival window, the global findings
case preparation is warmed, and the event-comparison preparation remains because
the exposures request consumes its payload. Coordinate projections remain
visitor-lazy. The API and frontend source comments name the shared contract; the
cache regression test fixes its eight backend keys and consumes each through its
public request.

## ADR 82 — Durable derived-artifact boundary

**Status:** accepted, 2026-08-24. Extends ADR 0035 (the in-process result cache);
does not replace it.

Derived results persist in a **sidecar SQLite database beside the store**, not in
`ciq.db` and not in the process. `ciq.db` is the vendor's history, restorable only
by re-pulling; a derived artifact is disposable by definition. Keeping them in one
file makes a corrupt derivation a data-loss event and makes the migration story of
two very differently-shaped things one story. A deleted sidecar costs
recomputation and nothing else.

**The key is a triple, and every part is required:**

1. the **input-data revision** — an identity for the rows the artifact was derived
   from, advanced by any write, not a wall-clock time;
2. the **shape's own parameters** — the window, the pooling mode, the holdout, the
   query coordinates: whatever already forms that shape's `ResultCache` key;
3. the **model/schema version** — `result.SCHEMA_VERSION` together with an
   analysis-code version, so a changed analyzer cannot serve an artifact derived
   by the previous one.

A read either matches all three exactly or misses. There is no nearest match, no
partial-key fallback, and no "close enough" window: this store holds inputs to
advisory dosing guidance, and a stale artifact served as fresh is the failure mode
the whole ticket exists to avoid.

**Replacement is atomic.** An artifact is written whole and swapped in one
committed transaction, so a reader observes either the previous artifact or the
new one, never a partial. A crash mid-write leaves the previous artifact intact.

**The in-process cache stays in front.** ADR 0035's cache remains the hot path;
the sidecar is what survives a restart. Its own coarse `bump()` is unchanged.

**Why not the process, a file tree, or an external cache.** The process is what
today's problem is. A file tree per artifact gives no atomic multi-key swap and
invents a second consistency story. An external cache adds infrastructure to a
project whose whole posture is a single self-contained local process.

## ADR 82 — Stale-serve with visible age

**Status:** accepted, 2026-08-24.

While recomputation runs, Diagnose **serves the previous input revision's
artifacts, labeled with the input-data age they were derived from.** The
alternative — clearing and making everyone wait, which is today's behavior — is
what makes the app unusable after a fetch.

**The age is the data's, not the derivation's.** It names the instant the input
revision covers to (the newest reading in it), because that is what tells a wearer
whether the guidance accounts for the last hour. A "derived 30 seconds ago" label
on hour-old inputs would be true and useless.

**Serving hour-old derivations is not a new risk; serving them unlabeled would
be.** Between hourly fetches every reader is already looking at results derived
from the previous fetch. The rule this ADR adds is that whenever what is shown is
not derived from the newest input revision, its age is visible.

**The label rides on the payload the numbers ride on**, as a backend fact. Per the
repository's standing rule, the frontend re-derives no threshold and no verdict of
its own; it renders what the backend stamped. A payload and its age cannot become
separated, because they are one object.

## ADR 82 — Throttled in-process recompute

**Status:** accepted, 2026-08-24.

Recomputation after a fetch runs as **one paced, lowest-priority in-process
worker**, replacing today's back-to-back pre-warm pass.

**One process, not two.** A separate worker process would need its own store
handle, its own invalidation channel and its own failure mode, and would break the
single-process cache consistency ADR 0035 relies on. The measured problem does not
need it: the cost is one shape, and after #120 and #121 it is a much smaller one.

**Paced, not merely backgrounded.** The work is pure Python and holds the GIL for
long stretches, so "in a worker thread" — which is already true today — does not
keep the API responsive. The worker takes one shape at a time and yields between
units of work, so request handling interleaves instead of queueing behind the
whole set.

**One failure is skipped, never fatal.** Today's pass logs and continues past a
failing shape, and that behavior is kept: a single bad compute must not stop the
rest, or the hourly loop.

## Shared preparation is computed once per input revision and model version

The canonical analysis, scenario report and exposure feed are derived **once** per
(input revision, model version) and consumed by everything that needs them — the
analyze and scenarios endpoints, the event-comparison preparation, and the
findings projection, which today rebuilds its own copies of all three. The
artifact key from ADR 82 above is exactly the identity that makes this sharing
safe: two consumers may share a preparation only when all three key parts agree,
so a shared preparation can never outlive the data or the model version it was
derived from. #126 carries it.

## The implementation map

Filed on `harmonichq/harmonic`, each linking back to #82. Ordered: the two scan
fixes first, because they change what the durable store is built around.

1. **#120** — bound the event-comparison catalog capture to its source window
   (stop reading the whole history to build a 30-day product).
2. **#121** — hoist the per-meal suspend-ownership rescan out of
   `classify_meal_owned_suspend` (ADR 681's rule, computed once per capture).
3. **#122** — reconcile the hourly pre-warm set with the cold arrival: trend
   14 → 30, warm the findings case preparation, keep the event-comparison
   preparation and record why.
4. **#123** — the versioned sidecar artifact store (ADR 82, boundary).
5. **#124** — serve previous results with a visible input-data age (ADR 82,
   stale-serve).
6. **#125** — one throttled paced recompute worker (ADR 82, recompute).
7. **#126** — compute analysis, scenarios and exposures once and share them with
   the findings projection.
# Implementation note (#123)

Fixed reconstructible Diagnose artifacts are stored in a disposable adjacent
SQLite sidecar. Their primary revision is committed with Store mutations and
their automatic package-source fingerprint invalidates changed analysis code.

## ADR 124 — Exact-key stale serving carries the input horizon

**Status:** accepted, 2026-08-24.

The fixed-route boundary owns a bounded in-flight registry separate from
`ResultCache`. While one exact fixed key recomputes, another request for that
same key may read only the newest earlier-revision sidecar artifact with the
same coordinates and model marker. It must have a non-null `covers_to`; no
cross-key, schema, marker, or coordinate fallback exists. Builder failures
continue to propagate rather than turning an uncertain result into a stale one.

Each sidecar row stores `covers_to`, the maximum CGM/basal timestamp read from
the query-only snapshot before its computation starts. The schema version
advances with this column, so an older sidecar cannot masquerade as labeled.
The API projects fixed results through one adapter which appends optional
top-level `input_data_age` after the endpoint's normal projection. Its fields
are the sidecar schema version, old revision, `covers_to`, and optional newest
input horizon. Findings and history retain their generation-sensitive path and
do not stale-serve.

Diagnose records that backend fact per incoming shape before assignment. A
fresh replacement clears only its own age; a full reload resets all shape ages.
The cockpit banner selects the oldest rendered stale horizon and says exactly
`Showing results from data through <covers_to>.` This is visibility, not a
frontend inference about freshness or insulin guidance.
