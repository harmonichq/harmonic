# Design — announced-meal ownership at a low (#225)

## ADR 225 — Announced meals bound low-rebound attribution

An Over-treated-low Finding claims that low-treatment carbs explain a later high.
A substantial carb-tagged bolus announced at or immediately around the low run
creates a different, observable food story whose effect cannot be separated from
any simultaneous rescue treatment. In that state Harmonic withholds the
Over-treated-low judgment, even when a low-prompt answer confirms that treatment
also occurred.

This is a causal-ownership boundary, not a digestion-window exclusion. A meal well
before the low does not suppress an otherwise qualifying rebound, and a meal after
the nadir continues to cap the guarded scan at its own timestamp. Near-lows keep
their existing stricter rebound bar and remain outside the canonical sub-70 Low
opportunity population.

The boundary applies only to Over-treated low and the already-contradicted Missed /
unannounced meal claim. It does not suppress Carb undercount, Late bolus, Meal
over-delivery, or Meal bolus fell short, because those are meal-owned explanations.
It does not suppress Correction stacking or Correction on active insulin, because
those require independently observed correction behavior. Attribution still chooses
one earliest actionable lever per episode.

One backend ownership decision must govern both the shared rebound judgment and the
pre-attribution low-rebound split. Every pipeline that consumes those pieces must
receive the same bolus context, so scenario output, tally output, model view, Explore,
and Finding preparation cannot mint different occurrence sets.

For a canonical sub-70 Low, ownership is a calm non-match named
`owned_by_announced_meal`; the opportunity remains in the Low case population. This
is distinct from `owned_by_prior_bolus`, whose closed meaning belongs to the
late-bolus classifier. Near-lows remain outside the canonical Low population.

## Revision evidence

The surface lifecycle is **revise**. The safe data source is the committed
`mockups/revise-e2e.synthetic/harmonic.sqlite` database served with the mandatory
`--no-fetch` flag; no private data or live pull is used. The before replay ran at
base `16cfbda` and passed all 138 issued app stories. This change amends S118 with
a behavior-only proof: the visible Finding case retains the server-owned clean Low
in its comparison cohort and does not promote it to matched. No new clinical copy,
layout, or visual styling is introduced.

Before implementation, the focused test stopped during collection because
`announced_meal_owns_low` did not yet exist. The same synthetic 48 to 189 mg/dL
shape, executed directly against untouched base `16cfbda` with a completed 20 g
meal bolus at the nadir, produced `over_treated_low`; that is the old wrong output
the tests close. After implementation, the complete gate passed 2,101 backend
tests with one skip, 522 dependency-free frontend tests,
all 138 replay stories, the three static guards, and every documented synthetic
and private design-artifact drift check. Review then exposed an unobserved no-peak
edge; its regression now pins `insufficient_data` before ownership is considered.
