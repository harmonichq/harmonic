# Event chart baseline populations (#180)

## Why

Every By-event comparison compares against verdict residue. The line a reader
reads as "the normal case" is the set of Occurrences the lever did not claim —
`Does not meet` in the Finding case files, `Comparable; no factor matched` in the
standalone feed. Neither names a population, so neither states what the
comparison's claim rests on. #178 fixed one Exposure; the other seven levers, and
the second vocabulary, are still on the old footing, and #135's canvas is about
to bake event tiles against them.

## What changes

- Every lever's comparison draws three cohorts that partition its Exposure
  population: matched, nearly matched, and a named comparison population.
- The comparison population is the lever's Exposure population minus only the
  Occurrences that lever matched. An Occurrence another lever claimed stays in.
- The two `HIGHS` levers compare against completed carb-bolus meals; the six
  others compare within their own Exposure.
- Comparison support is unchanged: Occurrences with too few usable readings are
  counted, not drawn. A window whose comparison population is Withheld draws the
  matched line and says so rather than withholding the chart or falling back.
- Cohort naming is served, not derived in the browser.
- The standalone comparison feed retires. A case file becomes reachable by lever
  and window, and the By-event view asks for one like every other surface.

## Impact

- Decision 6 of the Finding case-files design record is amended.
- One served comparison shape replaces two, with one validator and one fixture
  family; every retired artifact's drift check retires or moves with it.
- The Finding attribution account and the five-state verdict taxonomy are
  untouched on the verdict and accounting surfaces.
- Two capability statements assert the five cohorts and fold in the build's pull
  request, when they become false, not in this record's.
- #135's Explore mode is unblocked by the same generalization.

The decision is recorded in `design.md` as ADR 180. The build is #181.
