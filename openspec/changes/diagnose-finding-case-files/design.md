# Design — Diagnose Finding case files

## ADR 79 — A Finding case file is one server-owned population

**Context.** `FindingsProjection` builds an Exposure population and publishes a
row's counts plus identity keys. The workstation separately fetches the Exposure
feed prepared for event comparison, chooses a family through
`ALIGN_FACTOR_BY_CAUSE`, and intersects `(family, ep_id, t)`. The map contains
only Meals and Lows. It forces aligned Findings onto that view even when the row
published no evidence in the family, and the shipped code explicitly treats an
empty `0 of 0` frame as preferable to falling back. This contradicts the visible
Finding's own denominator for correction clusters and cannot represent Highs.

Issue 64 unified the two browser fixture populations only and explicitly left
production endpoints unchanged. That made the replay capable of proving a good
join while leaving the production browser composition intact.

**Decision.**

1. A behavioral Finding preparation is built inside one SQLite read transaction,
   materializing the Exposure population and every CGM, bolus, basal, and rescue-
   carb row needed for traces before the transaction closes. It publishes an
   opaque `projection_id`. A new, independently named preparation schema returns
   that id beside the case-file-ready ranked queue; the case-file endpoint projects
   from the same retained preparation and requires the id. `GET /diagnose/findings`
   remains authoritative and unchanged by this ticket. Matching
   cache keys, separately rebuilt payloads, or a client retry are not an atomicity
   guarantee.
2. A case file accepts the projection id, stable Finding id, alignment (`clock`
   or `event`), and optional opaque Occurrence selection; the preparation id owns
   the clock window. Its
   implementation owns the declared-Exposure population, attributed summary,
   denominator, verdict band, complete Occurrence roster, selection disposition,
   and chart projection. Trace rows may enrich those same roster members from the
   preparation snapshot; they cannot add or drop members. The browser renders the
   result and never joins it to a second population.
3. The Lever's declared `Exposure` selects one canonical identity-bearing
   opportunity builder in `ciq_autotune/analyzers/scenario/opportunities.py`, not
   the broader Explore anchor feed. Both the case-file preparation and
   `engine._exposure_counts` call this same builder; `_exposure_counts` becomes
   only `{family: len(opportunities)}` and retains no parallel predicates.
   Browser-visible ids are opaque `o_` plus 32 lowercase hexadecimal characters,
   derived from the immutable source keys below; the browser never parses them.

   | Exposure | Canonical opportunities and stable source key | Anchor |
   | --- | --- | --- |
   | Meals | Every `_is_meal` bolus; bolus `seq_num`. | Completed carb-bolus time. |
   | Lows | Every sub-70 run returned by `collect_anchors(..., low_mgdl=gate_low_mgdl)`; run boundary plus nadir timestamp. | Nadir. A 71–75 near-low is not silently renamed a Low. |
   | correction clusters | Every adjacent pair in all `_is_user_correction` boluses sorted by `(t, seq_num)`; both `seq_num` values. Three corrections therefore produce two opportunities, including at equal timestamps. | Second dose in the pair. Each pair is classified independently with its complete CGM/basal context. Classifier sorting uses the same `(t, seq_num)` order. |
   | Highs | Every >250 run from the same canonical anchor collector; run boundary plus peak timestamp. | Peak, retaining `reach_start`. |

   The whole-day roster length must equal `_exposure_counts()[Exposure]`. A
   successful whole-day case also equals the Pattern's published recurrence `n`
   and its `claimed` equals published `k`. If any attributed instance has no
   canonical opportunity (including any attributed 71–75 near-low), that Finding
   is `uninspectable_attribution`; `_score_pattern`'s `max(k, n)` safeguard is not
   treated as permission to invent an identity. The preparation reports it under
   `withheld_findings` and excludes it from
   `rendered_rows`, so it is not presented as a supported/openable Finding. The
   ticket does not change recurrence scoring or relabel a near-low as a Low.
4. During preparation, every attributed Lever instance is associated with one
   opportunity in its declared Exposure. Normally the association is the driver
   opportunity. The one closed cross-family case is the caused-low split: its
   synthesized Over-treated-low rebound High associates to the canonical source
   Low identified by retained `rebound_nadir_t`. The association carries the
   Finding-relative outcome minute: that source Low inherits the linked rebound
   High's outcome minute, so a rebound window includes it and the crash window does
   not. The same outcome-link rule applies when another Lever's consequence lands
   on a different anchor. Association is private projection provenance; it changes
   neither attribution nor stored facts. Any other cross-family, ambiguous, or
   noncanonical association withholds that Finding.
   Correction stacking is not resolved by timestamp: the classifier retains the
   selected last adjacent pair's `(previous.seq_num, second.seq_num)` in its
   internal verdict/attribution provenance, and that exact tuple is the association
   key. Correction driver matching uses the second `seq_num`, not `stack_t` alone.
5. For the declared family and clock window, the roster contains every canonical
   opportunity whose own or associated Finding-relative outcome minute is in the
   window. Therefore `denominator == len(roster) == sum(verdict_counts)`.
   `claimed` is the number of this Lever's distinct associations into the roster.
   An associated roster member is row-relative `fired`, even when the matched
   classifier ran on a linked synthesized anchor; otherwise the existing direct
   opportunity-verdict rule applies. Thus attribution selects one winner while
   matched-but-outranked classifiers remain fired, `claimed <= fired`, and the
   inequality may be strict. A successful projection violating an equation or
   association invariant fails closed.
6. Event alignment reprojects that exact roster. It uses the Finding band's five
   cohorts (`fired`, `outranked`, `near_miss`, `no_data`, `clean`) directly, not
   the legacy event comparison's differently named routing taxonomy. No new near-
   rule is computed. The existing finite-sample support algorithm and floors apply
   unchanged to each cohort curve.

   | Declared Exposure | Finding(s) | Event anchor and trace horizon |
   | --- | --- | --- |
   | Meals | Carb undercount; Late bolus; Meal over-delivery | Existing completed carb-bolus anchor and `[-60, +300]` minute trace. |
   | Lows | Over-treated low; Correction on active insulin | Existing excursion-nadir anchor and `[-300, +120]` minute trace. |
   | correction clusters | Correction stacking | Minute zero is the pair's second dose. Every aggregate uses one bounded common frame: start at the second dose minus `max(stacking_window_min, stacking_slope_lookback_min, gate_lookback_min)` and end at the second dose plus `stacking_low_lookahead_min`. `source_corrections` always carries both doses' sequence number, time, and insulin; both become chart markers when they fall inside the common frame, while a far-separated first dose remains an explicit selected-evidence fact without widening the CGM frame. |
   | Highs | Missed / unannounced meal | This is the one cross-family comparison, not a verdict-band replot. The missed cohort contains only Highs whose attribution winner is Missed / unannounced meal (`fired` in the retained High roster), anchored at each source anchor's `reach_start`. The announced cohort contains every completed carb-bolus in the analysis window (completed, insulin > 0, and carbs at or above `anchor_meal_min_carbs`), regardless of its subsequent outcome, anchored at bolus time. Both use the fixed `[-60, +300]` minute axis. The announced cohort is not a High roster member: ADR 79's roster/episode/verdict equations and the five-state verdict band continue to range only over Highs; the payload declares missed, announced, and not-comparable counts independently. |
   | Highs | Meal bolus fell short | Minute zero remains the published high peak. Start at `reach_start` minus the largest applicable slope, digestion, and upstream-cause lookback; end at the later of the peak or `reach_start + meal_bolus_short_correction_horizon_min`. Plot minutes relative to the peak. |

   The values come from `ScenarioConfig`; changing a classifier horizon moves the
   projection with it. Correction/Highs response keys belong only to the case-file
   schema, not a new public variant of the legacy comparison route.
7. A successful visible Finding is inspectable. Construction cannot return a
   nonzero summary with an empty successful population. Active failure preserves
   the complete prior inspector/canvas state and names the failure; a superseded
   browser response is silently discarded; event alignment never flips to clock.
8. `GET /diagnose/findings` and its active schema remain authoritative. The
   new `GET /diagnose/finding-case-file-preparation` route with schema
   `diagnose-finding-case-file-preparation-v1` atomically wraps the exact active
   Findings projection and its selection, then server-merges behavioral case
   headers into `rendered_rows`. Nonbehavioral rows and selection pass through
   unchanged. When ADR 22 advances the authoritative projection to v2, this wrapper
   must accept/forward its `selected_id`, history rows, and lifecycle selection in
   the same change; ADR 22's tests must run through both routes. The wrapper does
   not claim the v2 name or become a second queue-policy owner. Existing
   Findings/Explore/event-comparison contracts stay available and are not widened.
9. The production-shaped browser replay serves preparation and case-file responses as
   independent HTTP shapes generated from the same server contract. Its setup may
   not hand both handlers one already-shared JavaScript object; that is the exact
   false-negative mechanism issue 79 closes.

### Public interface contract

Both new routes receive the raw FastAPI `Request` and parse `query_params` inside
the route; none of their domain coordinates are typed FastAPI parameters. The
parser rejects unknown or repeated keys and maps missing, non-string, non-decimal,
out-of-range, or malformed values to ADR 79's structured HTTP 400 envelope, so
FastAPI cannot emit its default 422 list-shaped error for these routes.

`GET /diagnose/finding-case-file-preparation` accepts only the same paired optional
`start_min` / `end_min` coordinates as `GET /diagnose/findings`; its source window
is the fixed 30-day Diagnose calibration window. Its response is:

```json
{
  "schema": "diagnose-finding-case-file-preparation-v1",
  "projection_id": "fp_0123456789abcdef0123456789abcdef",
  "coordinates": {"source_window_days": 30, "window": {"start_min": null, "end_min": null, "scoped": false, "label": null}},
  "findings": {"schema": "diagnose-findings-v1", "window": {"start_min": null, "end_min": null, "scoped": false, "label": null}, "findings_window": {}, "rows": [], "counts": {}, "chip_counts": {}, "uncaused_highs": {}},
  "rendered_rows": [],
  "behavioral_case_headers": {},
  "withheld_findings": []
}
```

`findings` is the complete authoritative projection. `rendered_rows` preserves
every nonbehavioral row byte-for-byte. For a ready behavioral row the server starts
with a deep copy, replaces only `appearances`, `episodes`, `evidence`,
`verdict_counts`, and `verdict_counts_by_family` as shown below, and adds
`event_chart` and `case_header`; every other key and the authoritative row order
remain byte-equal. `event_chart` is the server-owned, opaque coordinate
`{view, factor}`: the browser validates its two non-empty string fields and uses
the published value, but does not infer eligible Findings or maintain a family or
factor allowlist. It is present on every ready behavioral rendered row and its
`case_header`, so every inspectable family — including Highs — can open its
server-selected event chart. A header is keyed by the closed
`finding:<Lever.value>` identity and has `{finding_id, lever, title, family,
event_chart: {view, factor}, summary: {claimed, denominator, noun},
verdict_counts: {fired, outranked, near_miss, no_data, clean},
inspectability: "ready"}`. The row's `event_chart` and its header's
`event_chart` are the same coordinate. A withheld entry has `{finding_id, code,
message}` and its id is absent from `rendered_rows`.

```json
{
  "id": "finding:meal_over_delivery", "register": "finding", "kind": "habit",
  "title": "Meal over-delivery", "priority": 42, "tier": "worth_a_look",
  "parameter": null, "label": null, "span": null, "direction": null,
  "lean": null, "current": null, "recommended": null, "estimate": null,
  "support": null, "reason": null, "annotation": null, "members": null,
  "lever": "meal_over_delivery",
  "appearances": [{"family": "meals", "noun": "meals", "n": 5, "m": 68}],
  "episodes": 5, "evidence": null,
  "verdict_counts": {"fired": 6, "outranked": 4, "near_miss": 3, "no_data": 2, "clean": 53},
  "verdict_counts_by_family": {"meals": {"fired": 6, "outranked": 4, "near_miss": 3, "no_data": 2, "clean": 53}},
  "chips": ["lows", "meals"], "window_scope": "window",
  "event_chart": {"view": "meals", "factor": "meal_over_delivery"},
  "case_header": {"finding_id": "finding:meal_over_delivery", "lever": "meal_over_delivery", "title": "Meal over-delivery", "family": "meals", "event_chart": {"view": "meals", "factor": "meal_over_delivery"}, "summary": {"claimed": 5, "denominator": 68, "noun": "meals"}, "verdict_counts": {"fired": 6, "outranked": 4, "near_miss": 3, "no_data": 2, "clean": 53}, "inspectability": "ready"}
}
```

This ticket tests generic lossless wrapper behavior by passing through an unknown
nonbehavioral row plus a top-level selection sentinel unchanged. It does not accept
ADR 22's future `selected_id` yet; the ADR 22 implementation adds that query key and
its specific v2 tests to both authoritative and wrapper routes.

`GET /diagnose/finding-case-file` accepts required `projection_id`, required
`finding_id`, required `alignment=clock|event`, and optional `occ`. It does not
accept a second window; the preparation id owns it. `projection_id` is `fp_` plus
32 lowercase hex characters. `finding_id` is exactly `finding:<Lever.value>`.
`occ` is either an `o_` High-roster identity or an `m_` announced-meal identity,
followed by 32 lowercase hex characters. Other prefixes and malformed identities
are rejected. The missed-meal event projection carries its exact
`attributed_occurrence_ids`; those IDs, not every classifier-fired High, form the
missed cohort and selected missed details use the same rise-onset `[-60, +300]`
frame as its aggregate. Its response is:

```json
{
  "schema": "diagnose-finding-case-file-v1",
  "projection_id": "fp_0123456789abcdef0123456789abcdef",
  "finding": {"id": "finding:meal_over_delivery", "lever": "meal_over_delivery", "title": "Meal over-delivery"},
  "window": {"start_min": null, "end_min": null, "scoped": false, "label": null},
  "family": "meals",
  "summary": {"claimed": 5, "denominator": 68, "noun": "meals"},
  "verdict_counts": {"fired": 6, "outranked": 4, "near_miss": 3, "no_data": 2, "clean": 53},
  "occurrences": [{"id": "o_0123456789abcdef0123456789abcdef", "date": "2026-08-01", "anchor": {"t": "2026-08-01 12:00:00", "kind": "meal", "label": "Completed carb bolus", "bg": 120}, "verdict": "fired"}],
  "projection": {"alignment": "event", "anchor": {"kind": "completed_carb_bolus", "label": "Completed carb bolus"}, "window_min": [-60, 300], "cohorts": [], "clock": null},
  "selection": {"state": "none", "requested_id": null, "detail": null}
}
```

`occurrences` is complete and has exactly `summary.denominator` members.
`projection.cohorts` has one entry per displayed verdict cohort with `{key,
routed_count, usable_count, support, occurrence_ids, points}`; points retain the
existing event-comparison `{minute, n, support, median, p25, p75}` shape. Event
alignment sets `clock: null`. Clock alignment sets `anchor: null`,
`window_min: null`, `cohorts: []`, and
`clock: {bucket_hours: 2, total, peak_bucket_index, buckets}`. `buckets` is exactly
12 entries of `{start_min, end_min, n, occurrence_ids}` over this Finding's
associated/claimed opportunities, binned by their Finding-relative outcome minute;
their `n` values sum to `clock.total == summary.claimed`, and
`peak_bucket_index` is the first maximum. Selection states are
exactly `none`, `selected`, or `unavailable`; selected `detail` contains the same
occurrence summary plus `{glucose, markers, source_corrections, day_target}`;
`source_corrections` is empty outside correction pairs.

Every non-2xx response from either new route has the exact JSON envelope
`{"detail": {"code": "<matrix code>", "message": "<human-readable text>"}}`.

### Preparation lifetime

Preparations are keyed by cache version plus request coordinates. The registry
retains at most 64 current-version preparations. Every HTTP 200 preparation has a
60-second lease during which it cannot be evicted except by `cache.bump()`; after
the lease it is LRU-evictable. If all 64 entries are leased, a new coordinate
returns `503 preparation_capacity` instead of evicting a live id. A bump invalidates
every prior id. Construction reads the version before and after its SQLite
snapshot. `ResultCache` exposes one lock-coupled registry commit used here: under
the same lock as `bump()`, it rechecks the version, resolves per-coordinate
single-flight/deduplication, applies capacity/lease policy, and installs exactly
one id. A mismatch discards the object and retries once; a second mismatch returns
`503 preparation_changed`. A bump cannot land between the final version check and
registration. Two concurrent identical coordinates receive the same retained id.
No unregistered old snapshot may return HTTP 200.

The case route acquires and pins the preparation under that lock before projecting;
LRU eviction skips pinned objects, and a concurrent bump removes future
addressability but releases the acquired object only after the response dictionary
has been serialized to the `JSONResponse` body bytes inside the pin. Capacity,
deduplication, registration, acquire,
release, eviction, and bump therefore share one synchronization boundary. Public
race tests force identical-coordinate concurrency, a bump at the pre-commit hook,
and eviction/bump during an acquired case projection.

### Request and recovery contract

| Condition | HTTP/body | Browser behavior |
| --- | --- | --- |
| Malformed projection id, Finding id, window pair, alignment, or Occurrence id | `400`, `invalid_request` | Active request preserves the previous pair and shows the error. |
| Well-formed but expired/unknown projection id | `409`, `stale_projection` | Keep the old queue/inspector/canvas visible. Build the refreshed preparation and replacement case file in shadow state; swap all three only when both succeed. If either fails, keep all old state and show the active error. |
| Preparation changes twice during construction | `503`, `preparation_changed` | Preserve the old queue/inspector/canvas and show the active error; a later explicit/user-driven retry may recover. |
| All 64 preparation leases are occupied | `503`, `preparation_capacity` | Preserve the old queue/inspector/canvas and show the active error; do not evict a live case. |
| Unknown Finding, or a valid Finding with no attributed member in this projection/window | `404`, `finding_unavailable` | Preserve the previous pair, show the active-request error, and refresh the queue. |
| Valid case file without an Occurrence coordinate | `200`, `selection.state = none` | Replace inspector and canvas atomically. |
| Valid case file with a selectable Occurrence | `200`, `selection.state = selected` | Replace inspector and canvas atomically. |
| Valid case file with a well-formed but absent/unselectable Occurrence | `200`, `selection.state = unavailable` | Replace the internally consistent case file and visibly report only selection unavailability. |
| Internal population/count/trace inconsistency | `500`, `inconsistent_projection`, no case-file payload | Preserve the previous pair and show the error. |
| Network/server failure for the currently active generation | No usable case-file payload | Preserve the previous pair and show the error. |
| Response from a browser request superseded by newer coordinates | Ignored regardless of status | Silently discard it; preserve current state and do not show a stale error. |

The shadow recovery is generation-guarded as one operation. A response
superseded during either leg is discarded; it cannot swap a refreshed queue under
an old case file. Initial load follows the same handshake but shows loading/error
in place of prior state when no prior generation exists.

### Safe-start declaration

- Declaration path: `AGENTS.md`, under **The data boundary**.
- Exact command: `uv run harmonic serve --no-fetch --db
  mockups/revise-e2e.synthetic/harmonic.sqlite`.
- Named source: `mockups/revise-e2e.synthetic/harmonic.sqlite`.
- Provenance: committed synthetic database generated only by
  `scripts/gen_revise_e2e_db.py`; CI runs
  `uv run python scripts/gen_revise_e2e_db.py --check`. It contains no real pump
  or patient data and the mandatory `--no-fetch` prevents vendor access.

### Required render evidence

The manifest closes this exact state × viewport × theme set. Capture base and
revision for the first five states; capture revision for the three recovery states
(the base has no request seam capable of reaching them). An attempted click that
does nothing or opens `0 of 0` is the required base image, not a skip.

| State id | Required state |
| --- | --- |
| `meal-clock-claimed-less-than-fired` | Meal over-delivery case, showing the intentional `claimed < fired` band and a nonempty roster. |
| `meal-event-selected` | The same case in By event with one selected Occurrence on the chart. |
| `correction-pair-event` | Correction stacking over the canonical adjacent-pair roster, with both source doses visible. |
| `missed-meal-high-event` | Missed / unannounced meal in By event with onset-complete evidence. |
| `meal-short-high-selected` | Meal bolus fell short in By event with its selected trace and correction marker. |
| `active-failure-preserved` | An active case request error while the prior queue/inspector/canvas remain together. |
| `stale-shadow-refresh` | A stale id while the replacement preparation + case remain in shadow and the old generation stays together. |
| `unavailable-occurrence` | A consistent case file with selection unavailability visibly reported. |

For every required state, capture light and dark at `1440×900` and `390×844`.
Images/logs live under `/private/tmp/harmonic-79-evidence/{base,revision}/`; the
single root manifest has exactly 64 rows keyed by
`{state_id, phase, viewport, theme}`: eight states × base/revision × two
viewports × two themes. The 12 base rows for the three recovery-only states are
`not_applicable` with the reason above; the other 52 rows name an image path.

**Superseded decisions.** This record supersedes ADR 62 part 7 only where it
forces a Finding onto an event-view family that is not the Finding's declared
Exposure, including the intentional empty `0 of 0` frame. It supersedes ADR 63
decision 8's conclusion that a Highs Lever offers no event comparison. ADR 62's
server-owned outcome-window membership and opaque event-selection identity stay
in force; ADR 63's classifier, Highs denominator, and evidence-only constraints
stay in force.

**Consequences.** The title-keyed alignment allowlist and browser-side
`(family, ep_id, t)` membership join retire. The server module earns its seam by
concentrating four-family routing, atomic population construction, selection,
and projection behavior that otherwise spreads across the API and browser. No
new adapter abstraction is introduced: the HTTP route and public tests use the
same module interface.

### Risk contract

- **Must prevent:** a visible Finding reporting counts from one population while
  its roster or chart shows another; a visible Finding row swallowing a click;
  silent fallback from event to clock alignment; frontend re-derivation of
  Exposure family, membership, verdict, support, or inspectability; real pump or
  patient data entering fixtures, screenshots, Git history, or public CI output;
  any change to analyzer verdicts, Priority, staging, Plan, or pump-setting
  advice.
- **Must recover:** an active failed or stale case-file request preserves the last
  internally consistent queue/inspector/canvas generation and reports the failure; a browser
  response superseded by newer coordinates is discarded without changing state or
  raising a false error. Neither path mixes populations or silently changes
  alignment.
- **Accepted failure:** if the server cannot construct an inspectable case file,
  it fails that projection clearly and the browser preserves the prior state; it
  does not publish a successful Finding with invented or empty supporting
  Occurrences. Recovery is a later successful projection after the underlying
  data/cache version changes.
- **Unsupported:** live vendor fetches; real-data browser evidence; changing
  classifier thresholds, comparison-support floors, event-alignment support
  semantics, or the planned historical Carb-ratio contract from ADR 22.
- **Evidence owed:** public endpoint tests proving one case-file population owns
  every displayed count and Occurrence; analyzer-built synthetic cases for Meals,
  Lows, correction clusters, and Highs; browser replay using independently served
  production-shaped responses (not one shared injected object); visible-row open,
  roster selection, event persistence, high case-file, failure-preservation, and
  no-silent-no-op stories; full fast, drift, and browser gates through the declared
  no-fetch synthetic server.

Why: Diagnose evidence can influence advisory insulin-dosing decisions; a
plausible count paired with empty or unrelated Occurrences is silent incorrect
success.
