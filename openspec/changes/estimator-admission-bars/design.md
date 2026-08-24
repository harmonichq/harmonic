# Design — estimator admission bars (#109)

## ADR 109 — Admission bar pins

**Status:** accepted, 2026-08-23. Implements ADR 23; does not amend it.

ADR 23 ruled that a candidate estimator is admitted by synthetic ground truth
first and stable-era replay second. It left three things unpinned, and each one
decides whether the bar admits or rejects. They were settled at triage and are
recorded here because a later change that moves any of them changes what the
bars mean.

### Recovery tolerance

"Within the engine's tolerance" is pinned to both halves together: the block's
confidence interval covers the true ratio **and** the point estimate is within
0.1 g/u of it.

0.1 is the engine's own display step, so a point outside it is a difference the
wearer would see. Requiring only interval coverage would admit a candidate whose
interval is wide enough to cover anything — the confident-but-uninformative
failure the bar exists to catch. Requiring only the point would admit a
candidate that lands close by luck while claiming precision it does not have.

### Placebo silence is strict, and must be non-vacuous

A placebo verdict fails on **any** block whose engine-stamped
`evidence['eligibility']['band_excludes_programmed']` is true, or whose
`asserts_move` is true — information-only blocks included. The spanning-chain
candidate died on confident placebo *findings*, not on staged moves, so a bar
that only counted staged moves would have passed it.

Silence is only evidence when the block had something to say. A placebo block
that comes back collecting or unmeasured has asserted nothing, so the set is
reported vacuous rather than clean, and vacuous does not pass. A finding
anywhere in a set outranks vacuity in that set's verdict, so a non-scoreable
block can never mask a finding beside it.

### The real-snapshot calibration runs in-ticket, and reports a word

The calibration replay against the wearer's own history runs once inside this
ticket, read-only on a snapshot copy that lives outside the repo and is deleted
after the run. Exactly one of three phrases reaches the pull request — pass,
refused (precondition), or not run — and no number, count, or window date does.

The calibration acceptance is only meaningful on the one real floor-passing
window that exists, so it cannot be deferred to a synthetic stand-in. It equally
cannot be reported in detail: CI logs and pull requests are public, and this is
one person's glucose and insulin history.

### Consequences

- A future change to the 0.1 pin, to the strictness of placebo silence, or to
  the non-vacuity requirement re-opens every admission decision made under it.
- The bars judge a candidate through `analyze_ic_blocks` and read verdicts off
  engine-stamped output only. A bar that re-derives an eligibility condition is
  the #273/#465 defect and would let the bar and the engine disagree silently.
- These pins say nothing about which candidate is right. They say only what
  evidence is admissible.

## The settings leak, and why the fix is a precondition

`analyze(store, now=...)` assembles the event streams at the cutoff but reads
the programmed schedule from the **latest** snapshot at every cutoff, and hands
the entire snapshot list into the block analyzer, where it drives regime
recognition. A replay that walked cutoffs without accounting for this would
score early cutoffs against a schedule that was not in force then.

The change does not touch that behavior. Modifying `analyze()`'s settings
handling would alter the shipped analysis path for every caller in order to
serve an offline tool, and the shipped path is what the bars are meant to judge.
Instead the replay refuses any window where the leak could bite:

- the snapshot log must actually cover the window — a log with no snapshot at or
  before the window start, or none at all, is refused for coverage rather than
  assumed stable, because absence of evidence of a change is not evidence of
  stability;
- no I:C schedule change may appear anywhere from the window's start
  through the latest snapshot, checked pairwise across the whole tail rather
  than at the endpoints, because a change that reverted (5.6 → 4.0 → 5.6)
  satisfies endpoint equality while injecting an intermediate regime into every
  cutoff;
- the same whole-tail check covers the ISF schedule, because effective ISF falls
  back to the latest snapshot's programmed value and the verdicts are
  ISF-sensitive.

Each refusal names which precondition failed. A refusal is a legitimate
calibration outcome, not a failure to work around.

## Placebo construction, and why the obvious recipes are wrong

A placebo must contain no ratio signal. Two natural-looking constructions
contain one anyway, and both were measured before the generator was written:

- **Dose jitter** around the programmed ratio is not signal-free. Pooling is
  convex in `carbs / (dose + burden)`, so zero-mean jitter in the dose becomes a
  downward-biased confident estimate — a spiked run asserted 5.45 against a
  programmed 5.6.
- **Low ISF** amplifies the same bias by making glucose outcome noise read as
  dosing error.

The generator therefore doses placebo meals exactly at the programmed ratio and
puts the noise where it belongs: zero-mean, dose-independent glucose outcome
noise at a realistic ISF. A placebo the incumbent cannot pass is a defect in the
placebo, and the fix is the construction, never a loosened bar.

## What the bars deliberately do not do

- They do not decide truth on real data. A single held ratio offers no contrast,
  which is exactly why ADR 21 killed the backtest gate. The real-data bar
  measures *agreement with the incumbent ledger*, and the strictly-more-meals
  clause applies to candidates only — the incumbent replayed against itself is
  the calibration check and is expected to agree trivially.
- They add no live shadow-mode surface. The replay is offline tooling run
  against a local snapshot copy.
- They do not gate the exploratory synthetic sets. A boundary-spanning
  multi-block set is deliberately information-free to the engine, and an
  equal-to-programmed set is placebo-shaped by definition. Both are generated
  and reported, and neither decides admission; the engine-stamped reason a set
  is not recovered is recorded rather than tuned away.
