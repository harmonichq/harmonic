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
