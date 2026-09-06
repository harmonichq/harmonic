# One denominator per rendered Finding row (#353)

## Why

The Diagnose findings queue and the evidence canvas read the same array. The
Finding case-file preparation wraps every finding row it publishes: it replaces
the row's `appearances` and `episodes` with the prepared case file's own
counts — the population that owns the denominator — and leaves `headline`
exactly as the findings projection composed it, from the appearances that were
just replaced.

The two counts come from two different populations, so one row publishes two
answers to the same question. The queue prints the case file's `1 of 6 lows`
while the canvas nameplate, a few hundred pixels away, prints the projection's
`1 of 8 lows`. Where a finding appears in more than one family the sentence is
wrong in kind as well as degree: the projection sorts appearances by family
name, so the headline can name a family the case file was not built from at
all, understating a fifteen-occurrence habit as one.

The served sentence is a sanctioned template over `appearances[0]`, recorded
under `## Headline templates` in the archived `2026-09-03-left-column-pattern`
design record. A row whose `appearances[0]` no longer matches its own headline
breaks that template on the surface whose job is to say how often a habit
recurs. The frontend is not at fault: the queue prints `row.appearances`
verbatim and the focal seat prints `descriptor.headline` verbatim, which is
what both modules' contracts require.

## What Changes

- The case-file wrapper recomposes each rendered finding row's `headline` from
  that row's own post-wrap fields, through the findings projection's existing
  headline composer, so the queue row, the case header summary and the served
  sentence are three printings of one fact.
- The findings projection payload the preparation carries alongside the
  rendered rows is untouched; it stays internally consistent on its own terms.
- The wrap field-preservation test gains `headline` in its allowlist of fields
  the wrapper may change, and a new regression proves a wrapped row's headline
  states the case file's own count, denominator and family noun.
- The committed synthetic Diagnose capture is regenerated, because its
  hand-built projection rows never ran the projection's headline pass and so
  carried no headline for the wrapper to preserve.

## Impact

Affected specs: `surfaces`.

Affected code: `ciq_autotune/finding_case_file.py`,
`tests/test_finding_case_file.py`, and the regenerated
`mockups/diagnose-workstation.synthetic/finding-case-files.json`.

No analyzer output, staging verdict, safety floor, cap, priority, rank,
denominator or population changes. No frontend module changes: the surface
renders the served sentence verbatim before and after. No dose advice changes.
