# Restore scoped Finding occurrence membership (#224)

## Why

`GET /api/diagnose/finding-case-file-preparation` can reject an otherwise valid
clock window as `inconsistent_projection`. A fresh read-only snapshot reproduced
the failure for 16:00–20:00 and 12:00–16:00 while adjacent four-hour windows
prepared successfully.

The queue and retained case population agree on the eligible-meal occurrence
identity for Meal bolus fell short, but they currently assign that occurrence to
a clock window using two different times. The queue uses the Finding-relative High
outcome anchor. The case population uses the episode boundary. When those times
fall on opposite sides of a selected-window boundary, the closed count equation
fails and the whole preparation is withheld.

## What changes

- Make the custom-recurrence case-file path use the existing Finding-relative
  `outcome_kind` rule before applying scoped clock membership, matching the queue
  and the ordinary case-file association path.
- Keep that derivation local to the case-file module unless the fail-first
  regression proves the existing authority cannot express the observed shape;
  do not add a second cross-module policy for the same consequence anchor.
- Add a synthetic, event-built regression through the public preparation endpoint
  whose representative High and episode boundary land in different clock windows.
- Preserve the deliberate `inconsistent_projection` failure for genuinely
  contradictory populations and preserve every existing classifier, recurrence
  denominator, support floor, priority, and staging verdict.

## Impact

Affected Diagnose windows return their coherent Findings and case coordinates
instead of the generic unavailable state. No pump setting, advisory threshold,
behavioral classification, or user-facing failure copy changes.
