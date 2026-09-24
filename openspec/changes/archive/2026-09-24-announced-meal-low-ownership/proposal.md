# Respect announced-meal ownership at a low (#225)

## Why

Over-treated low infers that rescue carbs caused a low-to-high rebound. The guarded
scan already stops when a substantial meal is announced after the nadir, but a meal
announced at the low can still be detached by rebound splitting and leave its later
rise looking like rescue-carb over-treatment. The feed cannot separate those two
food effects, so publishing the low-treatment claim overstates the evidence.

## What changes

- Treat a substantial carb-tagged bolus at or immediately around a low run as an
  announced-meal ownership boundary for Over-treated-low judgment and splitting.
- Keep the decision in one backend predicate consumed by every scenario projection.
- Publish the meal-confounded rebound as no fired Over-treated-low claim while
  retaining a canonical sub-70 Low as a non-firing comparison and leaving meal-owned
  and independently evidenced correction levers eligible.
- Preserve isolated near-low rebounds, the existing tiered rebound bars, Low
  opportunity membership, and the existing boundary at a meal after the nadir.

## Impact

Diagnose no longer presents a meal-associated rise as evidence that low-treatment
carbs caused the high. No dosing threshold, denominator, pump setting, frontend
policy, or meal/correction classifier changes.
