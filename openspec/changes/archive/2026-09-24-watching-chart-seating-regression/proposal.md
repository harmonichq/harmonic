# Guard ranked Finding chart seating (#221)

## Why

Before the fixed Diagnose canvas landed in #229, the chart field ordered most
tiles by chart kind. A top-ranked behavioral Finding could take the focal seat
while Watching parameter charts filled the remaining visible seats ahead of a
second ranked Finding. The ranked queue and its seated evidence therefore told
different stories.

The production fix now derives self-seating candidates only from the backend's
ordered `assert` and `finding` rows. That exact mixed-register regression is not
covered directly through the seating helper's public interface.

## What changes

- Add a dependency-free frontend regression with multiple ranked Findings and
  multiple held/blind Watching charts in an adversarial chart-kind order.
- Assert that every ranked Finding remains in backend order and no Watching chart
  self-seats.
- Preserve the explicit paths that may still promote or retain a Watching chart:
  reader focus and pinning.

## Impact

No shipped Diagnose behavior, rendered surface, backend rank, analyzer output,
staging verdict, fixture, replay, or dose advice changes. This change records and
guards the behavior already shipped by #229.
