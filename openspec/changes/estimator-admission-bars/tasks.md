# Tasks — estimator admission bars (#109)

## 1. Synthetic ground truth and the entry bar

- [x] Add a seeded, deterministic generator of known-ratio meal histories whose
      true ratio sits above and below the programmed value, plus multi-block and
      equal-to-programmed sets held exploratory rather than gating.
- [x] Add at least two placebo seeds dosed exactly at programmed, with zero-mean
      dose-independent glucose outcome noise at a realistic ISF, and neither dose
      jitter nor low ISF, both of which fake a finding.
- [x] Commit no fixture bytes: tests import the generator's functions, so no
      drift check and no CI step is owed.
- [x] Add an adapter that writes a truth set into a Store through its public
      write API, including every settings snapshot the set declares.
- [x] Add the synthetic bar: recovery requires the block's interval to cover the
      true ratio and its point to sit within 0.1 g/u; placebo silence is strict
      and a finding anywhere in a set outranks vacuity.
- [x] Read every verdict component off engine-stamped output — state,
      `asserts_move`, `evidence['eligibility']` — and recompute none of them.
- [x] Enforce the estimator contract structurally: the candidate must populate
      the caller-owned history catalog in place and return a run count that can
      be a whole-day count, without pinning either to the incumbent's own values.
- [x] Fail the bar loudly when it scored nothing, so an empty inventory cannot
      report a pass.

## 2. Stable-era replay

- [x] Add one optional estimator parameter to `analyze`, defaulting to today's
      behavior at its existing call site, with the replay as its second caller.
- [x] Refuse a window whose snapshot log does not cover it, rather than reading
      an uncovered log as stable.
- [x] Refuse a window with any carb-ratio or ISF schedule change from the
      window's start through the latest snapshot, checked pairwise across the
      whole tail so a reverted change cannot pass endpoint equality.
- [x] Refuse a window whose incumbent final block fails the engine-stamped runs
      floor, read from `evidence['eligibility']`, never recomputed.
- [x] Replay both estimators at successive cutoffs and report first convergence,
      final interval widths, meal counts, their deltas, and the verdicts —
      requiring a candidate to converge no later, no less precisely, and from
      strictly more meals, while the incumbent self-run is exempt from the
      meal-count clause.
- [x] Report the incumbent's own self-agreement from its own convergence,
      independent of which candidate is under test.
- [x] Keep rendered output to counts, deltas, and verdicts; suppress candidate
      output during replay and sanitize CLI failures, so neither a printing nor
      a raising candidate can leak a meal, a glucose value, or a ratio.
- [x] Add a stdlib front end that opens the snapshot read-only, prints the
      report, and exits nonzero on refusal with the reason on stderr.

## 3. Calibrate against the wearer's own history

- [ ] Fetch a WAL-safe read-only copy of the live snapshot, run the replay
      against it with the default incumbent self-run, delete the copy, and record
      exactly one verdict phrase — pass, refused (precondition), or not run — in
      the pull request body, with no numbers, counts, or window dates.

## 4. Record and verify

- [x] Record the three pinned interview decisions as ADR 109 in `design.md`.
- [x] Fold the admission requirements into the parameter-analysis baseline
      specification.
- [x] Remove the triage spike file and update the scope ledger's citation.
- [x] Run the fast gate: backend suite, frontend suite, and the decision-record,
      product-name, and publishable-tree guards.
