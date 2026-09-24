# Restore scoped Finding occurrence membership (#224)

## Why

The queue assigns a Meal bolus fell short occurrence to a clock window by its High
outcome. The case-file path assigns the same occurrence by the episode end. When
those times cross a window boundary, preparation fails with
`inconsistent_projection` and Diagnose reports Findings unavailable.

## What changes

- Use the latest Finding-relative High outcome across episodes representing the
  same eligible meal, with the meal time as fallback.
- Add a synthetic public-endpoint regression for the boundary case.
- Preserve genuine `inconsistent_projection` failures and all classifier and
  recurrence behavior.

## Impact

Affected windows return their Findings. No user-facing copy, threshold, classifier,
recurrence denominator, or dose advice changes.
