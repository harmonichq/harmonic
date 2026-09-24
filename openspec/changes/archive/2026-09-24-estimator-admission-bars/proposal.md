# Estimator admission bars (#109)

## Why

No candidate I:C estimator may ship on plausibility. The spanning-chain
candidate produced confident findings on data that carried no ratio signal at
all, and nothing in the tree would have caught it: the held-out backtest that
was going to be the gate is dead (ADR 21), because a single held ratio gives a
backtest nothing to contrast against.

ADR 23 replaced that gate with two bars a candidate must clear before it is
allowed anywhere near a recommendation. Neither existed. Until they do, the
first queued candidate — fuzzy cross-block credit, aimed at the morning straddle
that drops most meal runs — cannot be tried, because there would be no way to
tell an improvement from a confident fabrication.

## What changes

- A committed generator invents fake meal histories whose correct ratio is known
  in advance, and placebo histories built to contain no ratio signal at all.
  Nothing it produces is committed as fixture bytes; tests import its functions.
- A synthetic bar runs a candidate over both kinds of set. It must recover the
  known ratios within the pinned tolerance, and stay silent on placebo. Silence
  only counts when the placebo block actually reached a scoreable state, so an
  estimator that never scores anything cannot pass by saying nothing.
- A replay harness takes a local snapshot and a stretch the operator names, and
  measures whether a candidate reaches the shipped ledger's own answer sooner,
  no less precisely, from strictly more meals. It refuses any stretch that fails
  the stable-era precondition, naming which one — so choosing a window is the
  operator's to propose and the harness's to reject, not a search the tool runs.
- Both bars reach a candidate only through the engine's own interface, and read
  every verdict off engine-stamped output. Neither re-derives an eligibility
  condition.
- Replay output carries counts, deltas, and verdicts. Never a meal, a glucose
  value, or a ratio — an estimate is a ratio.
- The shipped ledger is run through both bars as the calibration check. If the
  incumbent fails, the bar is wrong, not the incumbent.

## Impact

- `analyze()` gains one optional estimator parameter, defaulting to today's
  behavior at its existing call site. The replay is its second real caller.
- The known settings leak in `analyze()` — event streams are windowed at the
  cutoff while the programmed schedule is read from the latest snapshot — is
  left untouched and made inert by precondition instead. A window whose snapshot
  log does not cover it, or which contains any I:C or ISF schedule change
  through the latest snapshot, is refused rather than scored.
- No UI, no CI step, and no committed fixture bytes. The eight-run floor and the
  assertion predicate are unchanged.
- Fuzzy cross-block credit itself remains out of scope, and is what these bars
  exist to judge next.

The three pinned interview decisions are recorded in `design.md` as ADR 109.
