# Proposal — missed-meal comparison redesign

## Why

The missed-meal Finding's event lens used a High-peak anchor and a union axis,
which mixed classifier matches with attributed evidence and left the comparison
baseline conditioned on highs. The resulting chart could compare the wrong
populations while still looking complete.

## What changes

- Serve two server-owned cohorts: Highs attributed to Missed / unannounced meal,
  and every completed carb-bolus meal regardless of its later outcome.
- Anchor the missed cohort at detected rise onset and the announced cohort at
  completed carb-bolus time. Both use the fixed `[-60, +300]` minute axis.
- Publish independent missed, announced, and not-comparable counts, including an
  explicit zero state for no attributed missed meals. Announced meals remain
  ordinary selectable Occurrences with opaque server-owned identities.
- Keep the attribution account and five-way High verdict accounting independent:
  the comparison cohorts do not change the High roster, its denominator, or its
  verdict counts.

Synthetic fixture and public API coverage exercise the cohort populations,
anchors, fixed window, zero state, and selection. The completed browser evidence
records C44, C56, and C57, including the preserved verdict band and announced and
attributed-missed traces.

## Boundaries

No staging verdicts, attribution rules, High denominator, five-state verdict
taxonomy, arbitrary history ranges, legacy standalone event-comparison support,
or real-data fixtures change. The comparison is evidence only and does not
create a second attribution or roster authority.
