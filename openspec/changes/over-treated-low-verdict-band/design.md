# Design — Over-treated-low verdict band (#90)

## ADR 90 — Publish one complete projection-facing rebound judgment

**Context.** `attribute.over_treated_rebound` owns the tiered firing decision
used by Over-treated-low attribution, but its optional return collapses every
non-firing result to `None`. `model_view._low_verdicts` therefore omits the
Finding's own verdict for near, clean, and unobserved rebound windows. Event
comparison recovers those distinctions with another guarded scan and a second
copy of the firing and near boundaries.

Findings is row-relative: its own matched verdict is fired, under-threshold is
near, insufficient is no-data, and a calm verdict becomes clean or outranked
according to whether another Lever drove the Occurrence. Event comparison is a
cross-factor router: after the selected factor, another matched factor outranks
near and neutral cohorts. These public labels need not be identical to consume
one judgment.

**Decision.**

1. Deepen the existing projection-facing rebound decision in
   `analyzers/scenario/attribute.py`. One small frozen result runs the guarded
   scan once and carries its boundary facts plus the existing classifier-shaped
   `Verdict` vocabulary.
2. Preserve the current tiered firing bar and set the near floor exactly 20
   mg/dL below it. A peak at or above the bar is matched; a non-null peak from
   the near floor up to the bar is `under_threshold`; a non-null peak below the
   near floor is `no_trigger`; and `peak is None` is `insufficient_data`. No new
   reading-count, duration, or continuity floor is introduced.
3. Fired-only attribution and split callers may retain a thin compatibility
   adapter, but it consumes the complete judgment and owns no scan, threshold,
   or classification logic.
4. Model view publishes the complete judgment for every eligible low. A
   refuted low and a low whose rebound ownership was split off remain
   ineligible and continue to omit it.
5. Event comparison consumes the judgment and then applies its unchanged
   routing precedence. Findings keeps ADR 41's unchanged row-relative mapping.
   Tests assert the explicit crosswalk, including intentional differences when
   another factor matched.
6. The earlier `segment.py::_rebounds` episode-split gate remains outside this
   decision. It has different pre-attribution semantics and is not a consumer
   projection.
7. Public regression evidence covers the legacy Findings/Event-comparison
   projections and the canonical Finding case-file preparation/case endpoints.
   Canonical counts, cohort/evidence rosters, and denominators must reconcile.
8. Classifier, model-view, and API tests build invented inputs through the real
   producers. The existing Diagnose case-file generator remains an explicitly
   UI-only shape fixture and is not evidence for backend classification.

**Consequences.**

- Borderline and Does not meet become reachable honest Finding states for
  analyzer-produced Over-treated-low opportunities; truly unobserved windows
  remain not comparable.
- The existing rebound bars, attribution order, segmentation, endpoint schemas,
  and rendered vocabulary do not change.
- Browser replay remains proof that the shipped surface consumes the five-state
  response; Python endpoint tests prove the server classification.
