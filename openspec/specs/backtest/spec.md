# Backtest

## Purpose

Tests whether a suggested basal profile performs better than the current programmed profile when scored against held-out data. Backtest answers the question: "If I apply this suggestion, would it track delivered basal more accurately than what I'm running today?" It measures prediction error on days the suggestion has never seen, avoiding the false confidence of scoring a model on the data that produced it.

## Requirements

### Requirement: Score the shipped estimator against clean held-out delivered basal

Backtest reconstructs the per-slot suggested profile from training data using the exact same shipped estimator that appears in Diagnose — a per-day median collapse of delivered basal per time-of-day slot. It then scores both the suggestion and the current programmed profile against delivered basal on held-out test days, but only on minutes that pass the clean-window filter. The clean-window filter excludes meal/correction insulin, suspended delivery, excluded pump events, and out-of-range or non-flat glucose, so the score is measured against the true maintenance component only.

### Requirement: Hold out time-ordered data to prevent leakage

Training uses all days except the last N (default 2). Test uses the final N days, preserved in chronological order. This time-based split ensures the suggestion has never seen any test data. Scoring on data that shaped the estimate would be circular and misleading; held-out data tests whether the suggestion generalizes.

### Requirement: Acknowledge the fundamental caveat — no counterfactual replay

Backtest scores against what Control-IQ actually delivered with the current programmed profile, not a hypothetical replay of history with the suggested profile inserted. The system cannot re-run Control-IQ with a new basal profile to see what would have happened. The result is corroboration (the suggestion predicts held-out reality better than the current profile) but not proof (a true counterfactual would require replaying Control-IQ, which is impossible). The gap between them is real: a suggestion that predicts delivered basal well may still differ from what Control-IQ would have delivered if the suggestion were programmed.

### Requirement: Report both paired and independent error metrics

Backtest reports standalone MAE (mean absolute error, U/h) for the suggestion and current profile separately, scored against their own coverages. It also reports matched MAE, restricted to clean minutes where both profiles have a value for that slot. The matched comparison is fairer (both profiles scored on identical minutes) but may cover fewer minutes if the suggestion leaves some slots unmeasured. The standalone metrics show coverage: if the suggestion covers more slots than the current profile, that coverage gain is visible in the extra minutes scored.

### Requirement: Require both training and test data

Backtest returns an empty result if either the training set or test set is empty. A single-day dataset or a holdout larger than the available history cannot produce a meaningful backtest. The holdout must be smaller than the data span, and at least one training day must exist to estimate the profile.

### Requirement: Include prior-day boluses for test-day IOB decay tails

When computing clean samples on test days, boluses from the day before are included so that late boluses' decay tails are visible during early-morning test windows. This ensures the clean-window filter's IOB gate is accurate even when a previous-day bolus is still acting.

### Requirement: Apply per-slot epoch cuts from training only

The basal profile's epoch history is derived from the training data only — the time period during which each slot's programmed rate held constant. Test-day clean samples are trimmed to their slot's training-derived epoch, so that an old programmed rate that existed only in training does not leak into the test score. A slot's current estimate assumes its programmed rate was stable; test scoring respects that assumption by cutting minutes outside the measured epoch.
