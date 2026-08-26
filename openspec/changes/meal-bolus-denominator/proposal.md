# Unify lever evidence-population policy (#202)

## Why

"Meal bolus fell short" reported recurrence as `k of n highs` while its By-event
comparison was already built from completed carb-bolus meals. The finding row and
the chart underneath it were counting two different things.

Nothing was broken in isolation. The recurrence denominator came from the lever's
declared `Exposure`, and the comparison population came from a separate table of
per-lever branches in the case-file builder. Two valid domain concepts — the
recurrence population a finding is denominated on, and the comparison population
its event chart baselines against — were implemented at two policy sites, so #181
could move one without anything forcing the other to be reconsidered.

That is the defect this change removes: not a wrong string, but a missing seam.

## What changes

- One backend module owns each behavioral lever's complete evidence-population
  policy: recurrence membership and its noun, comparison population and name,
  the occurrence-to-comparison anchor and comparison window, whether the
  comparison crosses populations, and the lever's unique-occurrence identity.
- "Meal bolus fell short" recurs over eligible completed carb-bolus meals. Its
  finding row, case header, confidence and support, verdict account and By-event
  comparison all speak about meals, and several highs implicating one meal count
  once everywhere — at the pattern gate, in the occurrence list, in k, and in
  ranking — with the worst episode as that occurrence's representative.
- Only eligible completed meals can implicate the lever at all. A high whose only
  candidate bolus was cancelled or insulin-free no longer attributes to it. This
  deliberately narrows what the lever catches, so its count can never claim a
  meal bolus that never happened.
- The three ordinary meal levers' comparison population is renamed **Other meal
  opportunities**. It is built from `Exposure.MEALS`, which admits any
  carb-tagged bolus over the carb minimum — cancelled and zero-insulin rows
  included — so the previous "completed carb-bolus meals" wording overstated what
  the reader was being compared against.
- The served case file carries `population` and `cross_population`, so the
  browser stops inferring cross-population behaviour from lever names.
- "Missed / unannounced meal" remains the only cross-population lever, and keeps
  its highs recurrence unchanged.

## Impact

- ADR 180's per-lever comparison table is superseded in part, and says so.
- The accounting denominator for one lever changes, which ADR 180 and the
  missed-meal comparison proposal had both pinned as untouched. ADR 202 records
  that supersession.
- Every committed fixture, the JS projection mirror, and the browser validator
  move to the served population fields in the same change as their generators.
