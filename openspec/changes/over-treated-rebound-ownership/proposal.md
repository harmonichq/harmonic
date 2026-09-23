# #422 over-treated-low rebound ownership

## Status

**Triage source for #422.** An ordinary ticket change. It ships in the
coordinator's single release pull request for #422–#434, whose coordinator
archives it there (release decision D8).

## Why

One unbolused climb out of a low can be claimed twice. The low is attributed
**Over-treated low**, and the High it rebounds into is attributed **Missed /
unannounced meal**, both resting on the same peak. Carbs eaten to treat a low are
unbolused by design, so the missed-meal claim is wrong advice about meal
announcing.

It happens when the climb is slow. A High's Episode starts where glucose crosses
250 mg/dL, and anchors more than 90 minutes apart form separate Episodes. The
missed-meal context gate looks back 90 minutes from that crossing for a low, so
once the High has split off, the low is always outside the gate. The low's own
guarded rebound scan runs up to 180 minutes past the nadir and finds the same
peak. Only the #155 caused-low split links a rebound High back to its Low, and it
runs only for correction-on-active-insulin lows.

Two more defects come from the same gap. The over-treated low's scored span stops
where the missed-meal Episode starts, so the low is under-scored. A near-low
nadir (71–75 mg/dL) is never seen by the 70 mg/dL gate, so even a rebound High
that shares the low's Episode keeps a matched missed-meal verdict as a priced,
outranked candidate.

## What changes

- Operator decision D1 (Connor Griffin, 2026-09-23): an over-treated low whose
  rebound reaches a High owns that High, so the High is not also called a missed
  meal (silence reason `upstream_cause`), and the rebound's out-of-range time
  counts on the low's Episode.
- A fired over-treated-low judgment owns every High run that begins after the
  nadir and at or before its guarded rebound terminal, in the low's Episode or a
  later one. The ownership reads the build's own fired judgment; nothing re-judges
  the low.
- An owned High attributes neither Missed / unannounced meal nor Meal bolus fell
  short. Both retained verdicts are non-matches with silence reason
  `upstream_cause`. The context gate's verdict is kept when the gate already
  explains the rise; otherwise the detail names the owning low.
- The owning Episode's scored span reaches the later of the guarded terminal and
  the end of every High run it owns, and still stops at the next lever-bearing
  Episode.
- The highs "no cause detected" count no longer counts an owned High.
- The missed-meal and meal-bolus-short classifiers pass the scenario
  configuration to the context gate instead of its defaults.
- One new QA coverage era covers the new state through the production
  composition.

## Out of scope

- Episode segmentation, the gate's lookback, the rebound horizon and bar, every
  staging predicate, cap and support floor.
- The carb-log prompt queue, which still judges a High with the bare classifier,
  and the late-bolus classifier's gate configuration. Both are drafted as a
  follow-up issue.
- Every rendered surface. The desk reads the served attribution only.

## Impact

`ciq_autotune/analyzers/classifiers/missed_meal.py`,
`ciq_autotune/analyzers/classifiers/meal_bolus_short.py`,
`ciq_autotune/analyzers/scenario/attribute.py`,
`ciq_autotune/analyzers/scenario/evaluation.py`,
`ciq_autotune/explore_exposures.py`, their tests, one QA case, `CONTEXT.md`, the
behavioral-layer spec (one ADDED requirement), and the design exploration's
generated `code_version` stamps.
