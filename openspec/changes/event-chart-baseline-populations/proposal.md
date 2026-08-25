# Event chart baseline populations (#180)

## Why

Every By-event comparison compares against verdict residue. The line a reader
reads as "the normal case" is the set of occurrences the factor did not claim —
`Does not meet` in the finding case files, `Comparable; no factor matched` in the
standalone feed. Neither names a population, so neither states what the
comparison's claim rests on. #178 fixed one family; the other seven, and the
second vocabulary, are still on the old footing, and #135's canvas is about to
bake event tiles against them.

## What changes

- Every factor's comparison draws three cohorts that partition its population:
  matched, nearly matched, and a named comparison population.
- The comparison population is the factor's declared population minus only the
  occurrences that factor matched. An occurrence another factor claimed stays in.
- The two Highs factors compare against completed carb-bolus meals; the six
  others compare within their own family.
- Occurrences too sparse to judge become a count, not a curve; a window too thin
  to compare says so rather than withholding the chart or falling back.
- Cohort naming is served, not derived in the browser.
- The standalone comparison feed retires. A case file becomes reachable by factor
  and window, and the By-event view asks for one like every other surface.

## Impact

- Decision 6 of the finding case-files design record is amended.
- One served comparison shape replaces two, with one validator and one fixture
  family; every retired artifact's drift check retires or moves with it.
- The Finding attribution account and the five-state verdict taxonomy are
  untouched on the verdict and accounting surfaces.
- #135's Explore mode is unblocked by the same generalization.

The decision is recorded in `design.md` as ADR 180.
