# Proposal — A selected occurrence's trace is drawn inside its own axis

## Why

In the Diagnose response comparison, a reader picks one occurrence out of the
list to look at it. The chart draws that occurrence's glucose trace, but sizes
its y-axis from the cohort averages alone — the selected trace is deliberately
excluded from the range, and then drawn against it anyway.

So the trace leaves the top of the plot and comes back later, and the rebound
high that made the occurrence worth opening is the part that is missing. Nothing
marks the excursion, so it reads as absent CGM rather than an off-scale value.

Measured on the synthetic QA showcase, the single matched occurrence of
`over_treated_low` runs to 260 against a `[40, 200]` axis; on the revise-e2e
database four of eight `late_bolus` occurrences clip. The frozen behaviour
ledger already promises the opposite: `C57` says the exact selected trace
remains visible.

## What changes

- The chart that draws a selected occurrence's trace widens its own y-axis to
  contain it, in the same 20 mg/dL steps the resting envelope already widens by.
- The shared field range is untouched: a selection still cannot rescale the
  neighbouring evidence tiles, which is the reason the exclusion exists.
- Nothing changes at the mini rank, which never drew a selected trace.

## Boundaries

This changes no finding population, case-file content, cohort membership,
support grade, verdict, window, advice, or pump-facing behaviour. No screen
other than Diagnose is touched, and no threshold or direction is re-derived in
the frontend.
