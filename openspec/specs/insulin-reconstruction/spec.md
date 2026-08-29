# Insulin Reconstruction

## Purpose

Reconstructs bolus insulin on board from the pump's bolus delivery log and an exponential insulin-activity curve. Tandem Source does not expose a dense IOB series (the prior t:connect feed had one every ~5 minutes); IOB only rides on sparse per-bolus and per-glucose-reading events. This reconstruction feeds the clean-window filter that identifies maintenance minutes free of meal and correction insulin, and is reused by parameter estimators that quantify ISF and I:C.

## Requirements

### Requirement: Bolus-only IOB, not total IOB

The system SHALL satisfy the following:

IOB is reconstructed from boluses alone, excluding basal. This is a deliberate modeling choice, not an omission. The clean-window filter asks "has the meal/correction insulin cleared?" — a bolus-specific question — while basal is the quantity the model is trying to measure and exclude, not a confounder. Total IOB never returns to zero because basal leaves a floating equilibrium that drifts with the time of day, which forced past models to use an arbitrary threshold. Bolus-only IOB decays cleanly to approximately zero, so the gate is an absolute threshold with no fudge factor.

#### Scenario: Bolus-only IOB, not total IOB

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies
### Requirement: Exponential decay model with two calibration parameters

The system SHALL satisfy the following:

The reconstruction uses a single-exponential insulin-activity model parameterized by peak (time to peak activity, in minutes) and DIA (duration of insulin action, in minutes). The curve is applied to each bolus independently; the IOB at any instant is the sum of each prior bolus's remaining fraction, evaluated via the exponential formula. Standard boluses are point masses at delivery time; extended (square/dual-wave) boluses are spread across their delivery window as discrete sub-doses at 5-minute intervals to model the absorption tail correctly.

#### Scenario: Exponential decay model with two calibration parameters

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies
### Requirement: Two calibrated DIA/peak pairs serve distinct consumers

The system SHALL satisfy the following:

The model maintains two curves with the same exponential shape but different durations. The accounting curve (DIA = 300 min, peak = 75 min) matches the pump's programmed insulin duration and is used by ISF/IC estimation and behavioral classifiers that need a real IOB quantity. The gate curve (DIA = 180 min by default, peak = 75 min) is shorter to maximize clean-window coverage and is used only by the clean-window filter to decide when a minute is free of meal/correction insulin. The shorter gate curve is validated against estimate drift via the DIA-sweep tool, which reports coverage gained versus contamination of robustly-measured slots.

#### Scenario: Two calibrated DIA/peak pairs serve distinct consumers

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies
### Requirement: The reconstruction is the sole IOB primitive

The system SHALL satisfy the following:

Both the `BolusIob` class (which evaluates IOB at an instant) and the `InsulinActivity` class (which integrates activity over an interval) use the same exponential model. This ensures a single source of truth: they cannot drift out of sync, and a future DIA refinement updates all downstream consumers at once.

#### Scenario: The reconstruction is the sole IOB primitive

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies
### Requirement: Boundary — this capability produces the series, not the decision

The system SHALL satisfy the following:

This capability reconstructs bolus IOB and makes it available to callers. Deciding whether a minute is "clean" (free of meal/correction insulin) is the clean-window filter's job. Deciding what clean minutes imply about basal requirements belongs to the basal-estimation capability.

#### Scenario: Boundary — this capability produces the series, not the decision

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies
