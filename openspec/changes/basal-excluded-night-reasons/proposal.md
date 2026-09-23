# Proposal — basal excluded-night reasons (#434)

## Why

Opening a basal slot in Diagnose shows how many nights were excluded from the
estimate, never why. The reader's first question is whether their bad nights are
the excluded ones, and often they are: a night spent low, suspended or high has
no clean window in the slot, so it never reaches the estimate. The one reason the
desk prints today, the full-size rail's "excluded — not steady", is wrong for
nights cut only because they predate the slot's current programmed rate, which
can be perfectly steady.

The analyzer is the only place that knows why a night fell out, and the
night-evidence projection is forbidden to re-run the classifier. So the reason
has to be stamped by the analyzer and carried, not derived downstream.

## What changes

- The basal analyzer stamps `excluded_night_reasons` on every slot: six closed
  buckets, each excluded night counted once by fixed precedence, summing to the
  existing `excluded_night_count`.
- The night-evidence payload copies the breakdown verbatim and refuses a payload
  without it.
- The committed artifacts generated from analyzer output are regenerated.
- The basal evidence tile (full rail, middle-rank tally, accessible description)
  and the basal slot panel's excluded-night line name each nonzero reason in
  reader words. The retired label "excluded — not steady" goes.
- The desk behavior ledger gains a story, with its replay, for the new served
  behavior.
- `CONTEXT.md` defines the excluded night and its reasons.

## Boundaries

This change explains exclusions only. It does not change which minutes are
clean, the estimate or its interval, the night roster, `excluded_night_count`,
`directional_support_count`, pooling decisions, the eight-night support floor,
`asserts_move`, statuses, caps, or the Harm signal. Low nights stay out of the
basal estimate; whether they should weigh on it belongs to "Lows under-ranked /
low nights excluded from basal evidence". The roster's unlabelled numbers belong
to "Basal nights list has no column headers". Guidance support fields, ISF and
carb-ratio exclusions, and the chart miniature are untouched. No pump write, no
real-data read, no vendor fetch.
