# Proposal — eating-sequence evidence plumbing

## Why

The served comparison rows expose differences but not the two cohorts that produced
them. A chart cannot show Q5 and Q1–Q4 (or `3+` and `1`) values without calculating
them in the browser. #277 first extends the report contract, then projects it.

## What changes

- Add both served cohort aggregates to every high-carb and repeat-eating comparison
  row, regenerate the frozen report through its existing generator, and amend the
  complete eating-sequences requirement as a MODIFIED delta.
- Add `fetchEatingSequences()` to the frontend data-access namespace for
  `GET /api/diagnose/eating-sequences`, with no browser-owned window parameter.
- Pin fresh-response age handling: no `input_data_age` returns the payload unchanged
  and clears only that shape's recorded age.
- Add the Vue-free `frontend/diagnose-eating-sequences.js` adapter and Node tests.
  It field-for-field reshapes the per-scope quintile trajectory, evening-versus-
  pooled high-carb comparison, and matched-carb repeat-eating matrix.
- Add the non-advisory aggregate-evidence boundary to the surfaces specification.

## Risk contract

Must prevent a served comparison-row difference disagreeing with its served cohort
aggregates; frontend re-derivation of a served verdict, median, difference, or
status; an insufficient cell becoming a value; secret exposure; and real data.
The adapter only renames, groups, and selects served fields. It keeps insufficient
cells as `null` plus served status, and passes detector `status`, `finding`, and
`exclusions` through verbatim.

Recovery: none automatic. Accepted failure: none new. Unsupported: rendering (#278).
Evidence owed: report serialisation and supported-row difference-equality tests,
fixture parity and drift tests, adapter fixture/skeleton tests, and a fetch-route test.

## Boundaries

No API route, findings projection, safety, Plan, Priority, rendered component, chart
registration, harness story, or UI lock. Browser route answers are deferred to #278,
with the first consumer and story.
