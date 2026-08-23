# Scope — Over-treated-low verdict band

## Decisions

- One projection-facing backend judgment owns the guarded rebound scan, the
  existing tiered firing bar, the existing 20 mg/dL near floor, and the
  machine-readable result consumed by model view and Event comparison. The
  earlier episode-segmentation split gate remains unchanged because it has
  different semantics and ownership. → ADR
- A guarded scan with no peak is `insufficient_data`. Any non-null peak below
  the near floor is fully judged `no_trigger`, even when only one reading
  contributed it. This ticket adds no reading-count, duration, continuity, or
  other data-sufficiency threshold. → ADR
- Every eligible low publishes an Over-treated-low verdict in model view:
  matched above the firing bar, `under_threshold` in the near band,
  `no_trigger` below the band, or `insufficient_data` without an observed peak.
  Refuted lows and lows whose rebound was split off remain ineligible. → ADR
- Findings preserves ADR 41's row-relative mapping. Event comparison consumes
  the same judgment, then preserves its cross-factor routing precedence. A
  competing factor can therefore intentionally produce `near_miss` in Findings
  and `another_factor` in Event comparison; agreement is on the shared
  judgment, not identical public labels. → ADR
- Diagnose's canonical Finding case-file preparation and case endpoints are in
  scope alongside the legacy Findings and Event-comparison endpoints. The
  canonical row counts, cohort roster, evidence roster, and denominator must
  reconcile from analyzer-produced synthetic Occurrences. → ADR
- Python classifier, model-view, and API regression evidence must flow through
  real producers. The existing generated Diagnose case-file population remains
  a UI-only shape fixture and proves shipped-surface consumption, not backend
  classification. inline
- This is a shipped Diagnose revision with no intended layout or copy change.
  Execution replays `mockups/finding-evidence-routing.behavior.md` through
  `frontend/diagnose-workstation-behavior.replay.mjs` using only the repository's
  declared no-fetch synthetic server. inline

### Risk contract

- **Must prevent:** an unobserved rebound reading as clean; a threshold retune;
  a consumer reimplementing the projection-facing judgment; stale or divergent
  canonical case-file counts; a verdict-band total differing from its Finding
  denominator; any live vendor fetch or personal-data use.
- **Must recover:** no automatic recovery is required; this changes
  deterministic read projections and writes no authoritative pump data.
- **Accepted failure:** `GuardedRebound.peak is None` fails closed as
  `insufficient_data`; malformed synthetic evidence may stop verification
  loudly. A non-null peak below the near floor is a judged clean result.
- **Unsupported:** new clinical or data-sufficiency thresholds, attribution or
  Lever precedence changes, low-prompt or split-off semantics, segmentation,
  endpoint schemas, cache/lease behavior, frontend layout/copy, staging,
  pump-profile behavior, and live data.
- **Evidence owed:** analyzer-produced fired, near, clean, insufficient, and
  competing-Lever cases; legacy and canonical public responses; the explicit
  cross-projection precedence crosswalk; roster/cohort/denominator
  reconciliation; generator parity; and nonzero shipped-surface replays.

Why: Harmonic displays this evidence under advisory insulin-dosing stakes, and
the missing classifier verdict currently turns judged non-firing lows into an
unknown state.

Disposition: → ADR 90

## Open questions

- None.

## Review ledger

### Round 1 — persona panel

All objections were classified as **authoring** defects in the draft; none were
injected requirements. The order was revised to:

- give the backend-only first chunk no UI lifecycle;
- define insufficiency exactly as `GuardedRebound.peak is None`;
- exempt the distinct pre-attribution segmentation gate;
- assign the behavior ledger/replay to the UI revision chunk;
- exempt the UI-only shape fixture from analyzer-backed proof;
- state the Findings/Event-comparison precedence crosswalk;
- name `openspec/changes/over-treated-low-verdict-band/` as ADR 90's home; and
- enumerate the affected drift, browser, replay, and audit gates.

### Round 2 — fresh cold review

All three objections were **authoring** defects. The order was revised to:

- cover the canonical Finding case-file preparation/case endpoints;
- assign the baseline requirement to `openspec/specs/behavioral-layer/spec.md`;
  and
- require the complete gate matrix after all chunks and records merge.

The same reviewer confirmed all three deltas resolved. A separate fresh cold
review then returned no blockers or notes and countersigned the work order.

## Spawned tasks

- None. The approved execution workflow will coordinate the two serial
  sub-orders recorded in the issue work order.
