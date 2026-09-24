# Over-treated-low verdict band (#90)

## Why

The scenario model view currently publishes an Over-treated-low verdict only
when the rebound fires. A judged near rebound or judged below-band rebound has
no own verdict, so Findings cannot distinguish Borderline or Does not meet from
an unevaluated occurrence. Event comparison compensates by rerunning the scan
and thresholds, leaving two implementations of the same projection-facing
judgment.

The committed Findings fixture contains one near and one explicit no-data case,
but those verdict dictionaries are injected after analysis. They do not close
the production gap, and the current regression requires the Finding's clean
count to remain zero.

## What changes

- Deepen the existing Over-treated-low rebound decision into one complete,
  projection-facing judgment over fired, near, clean, and insufficient outcomes.
- Publish that judgment for every eligible low in model view while preserving
  refuted-low and split-off ownership behavior.
- Make Event comparison consume the shared judgment while preserving its
  existing cross-factor routing precedence and public schema.
- Prove all five Finding verdict-band states through analyzer-produced synthetic
  inputs in the legacy Findings response and canonical Finding case-file
  preparation/case endpoints.
- Replace the analyzer-bypassing fixture premise and the "never clean"
  regression, regenerate affected artifacts, and replay the shipped Diagnose
  surface with the declared no-fetch synthetic server.

## Risk contract

- **Must prevent:** an absent rebound reading as clean; any rebound-threshold
  change; a second projection threshold implementation; canonical case-file
  counts diverging from their roster or denominator; live or personal data.
- **Must recover:** nothing automatically.
- **Accepted failure:** no guarded peak is insufficient and projects as not
  comparable; malformed synthetic evidence fails verification loudly. A
  non-null peak below the near floor remains fully judged.
- **Unsupported:** new sufficiency thresholds, attribution precedence,
  segmentation, endpoint schemas, cache/lease behavior, visual design, staging,
  pump-profile behavior, or live fetching.
- **Evidence owed:** analyzer-produced fired, near, clean, insufficient, and
  competing-Lever cases through the shared judgment and public projections;
  count/roster/denominator reconciliation; drift checks; and nonzero browser
  replays.

## Impact

Scenario attribution/model-view code, Findings and Event-comparison projections,
canonical Finding case-file tests, synthetic generators and mirrors, and the
existing Diagnose behavior contract. The rendered vocabulary and visual design
do not change.
