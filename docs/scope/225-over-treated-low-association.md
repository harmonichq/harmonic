# Scope ledger — Announced-meal ownership at a low (#225)

## Decisions

- Reframe #225 from an occurrence-association repair to an attribution repair. The
  canonical Low association path already associates ordinary Over-treated-low
  occurrences; the defect is minting that lever when an announced meal at the low
  makes the later rise non-attributable. `inline`
- Treat an announced meal as a causal-ownership boundary, not a blanket suppressor.
  It suppresses Missed / unannounced meal by definition and may withhold
  Over-treated low when it lands at the low. Meal-owned levers and independently
  evidenced correction levers remain eligible. `user`
- Do not use the whole meal-digestion lookback as the new guard. A substantially
  earlier meal can coexist with a genuine rescued-low rebound; only a substantial
  carb-tagged bolus at or immediately around the low run creates the ambiguous
  meal-plus-treatment story. `inline`
- Keep near-lows distinct from canonical sub-70 Low opportunities. This change
  neither widens the Low denominator nor removes an isolated near-low rebound that
  clears its existing stricter bar. `inline`
- Preserve every canonical sub-70 Low in the case denominator. Announced-meal
  ownership changes that opportunity from a fired claim to a calm, non-firing
  comparison; it does not erase the opportunity. A near-low remains outside that
  population. `inline`
- Apply the ownership decision before rebound splitting as well as in the shared
  rebound judgment, so the scenario, tally, model-view, Explore, and Finding
  preparation paths cannot disagree about whether an Over-treated-low occurrence
  exists. `inline`
- A low-prompt answer confirming treatment does not overcome announced-meal
  ownership. It proves treatment happened, but cannot separate the meal's
  contribution to the later rise. `user`

## Risk contract

- **Must prevent:** an announced meal at a low being published as evidence that
  rescue carbs caused the later high.
- **Must preserve:** isolated sub-70 and near-low rebounds; later meals that already
  cap the guarded rebound scan; meal-owned levers; correction stacking and
  Correction on active insulin; canonical opportunity denominators and thresholds.
- **Accepted failure:** a genuinely excessive rescue treatment taken together with
  a meal is withheld because the feed cannot apportion the later rise between them.
- **Unsupported:** inferring which food grams were meal versus rescue treatment, or
  estimating how many rescue carbs were needed.
- **Evidence obligation:** analyzer-produced synthetic tests must exercise the
  confounded case and the preserved controls through the public Finding preparation
  path; the shipped Diagnose behavior replay must remain closed and nonzero.

## Review rounds

- Preflight completed against a synthetic spike: current main attributes the
  meal-confounded shape to Over-treated low, while the proposed at-low ownership
  boundary preserves an earlier meal and rescue-sized carbs.
- Cold review round 1 ran read-only on GPT-5.6 Sol at the user's explicit direction
  despite the installed routing table's unvalidated Codex-only load-bearing route.
  It found three in-scope blockers: exact-nadir equality was implicit, the work order
  lacked its required closed expected-diff allowlist, and its branch instruction did
  not say freshly fetched `origin/main`. The draft now states all three directly.
  No reviewer suggestion widened the causal-ownership rule, Low population, rebound
  bars, denominators, other lever classifiers, fixtures, or frontend policy.
- Fresh cold round 2 found two drafting blockers: a generated-facts command had
  nondeterministic output order, and the acceptance tests did not name equality at
  both inclusive lower bounds. The regenerated appendix sorts its output, and the
  draft now pins equality at the pre-nadir tolerance and substantial-meal floor.
- Re-reading the ledger against the public projection exposed an over-hardening in
  the draft itself: “no inspectable occurrence” conflicted with the promise to keep
  canonical Low denominators. The order now preserves canonical lows as calm,
  non-firing comparisons and keeps near-lows outside that population. It uses a new
  precise silence reason rather than changing the existing late-bolus reason's
  meaning. No new detector or frontend policy is introduced.
- The dependency-safe predicate owner, precise silence reason, and denominator
  preservation are explicit. UI proof is limited to one derived replay story with
  no fixture or visual expansion. Final fresh cold round 3 returned `PASS` against
  work-order SHA-256
  `cfaf12347b44adfe2cd1945b84ebf433644ffba43b72f8289394df6ea6abf424`.
  The same reviewer passed the posting-only replacement of a session-local facts
  reference with its verified caller list and the correction from “absence” to
  “non-firing comparison.”

## Spawned tasks

- Mandatory Full plan review complete: two blocking rounds were revised and the
  third, fresh cold pass countersigned the bounded order.
