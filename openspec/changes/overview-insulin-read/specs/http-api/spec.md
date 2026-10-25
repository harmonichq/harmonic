## ADDED Requirements

### Requirement: The Overview's insulin figures are one fixed read per window

`GET /api/explore/insulin?days=N`, for N in 14, 30 and 90, SHALL serve that
window's daily averages of delivered insulin: the daily dose, basal and bolus
units each with its share, boluses per day with manual and Control-IQ counts
and shares, carbs per day from bolus carbs and the manual carb log, bolus units
and share by type (Food, Correction, Override, Control-IQ) and by delivery
method (Standard, Extended, Quick, Control-IQ). The three windows SHALL be one fixed result keyed by
the recorded-data revision, warmed by the roster, computed in one pass, each
read serving its own window. Every average SHALL divide by the window's days
that hold any delivery, served as `delivery_days` beside the window's length.
Every unit of a bolus SHALL count in exactly one type row, a bolus with a
requested food and correction split dividing its delivered units in that
proportion, and each bolus SHALL count in at most one method row, a bolus with
no provenance code counting in the totals only. A store with no readings SHALL serve a null window
and null figures. Any other `days` SHALL be refused with 400.

#### Scenario: Each window's figures are its own

- **GIVEN** a store of 40 days of delivery whose last 14 days deliver more basal than the 26 before
- **WHEN** the read is asked at 14 and at 30 days
- **THEN** the basal units per day differ, and each equals the sum of delivered rate times duration over that window's days with delivery

#### Scenario: A bolus is in one type row

- **GIVEN** a Control-IQ automatic bolus, an overridden meal bolus, a meal bolus with a food and correction split, a meal bolus with no split, and a correction with no split
- **WHEN** the read is asked
- **THEN** Control-IQ holds the first, Override the second, Food the third's delivered units in its food proportion and the fourth, Correction the rest of the third and the fifth, and the four type rows' units sum to the bolus units

#### Scenario: A codeless bolus is in the totals only

- **GIVEN** a bolus with no provenance code beside a Standard one
- **WHEN** the read is asked
- **THEN** the bolus units and count include both, Standard holds only the second, and the method shares sum below one

#### Scenario: A write answers the predecessor, a restart computes nothing

- **GIVEN** the read served at every window
- **WHEN** a carb entry is written, and later the server restarts
- **THEN** the next read at each window answers at once with `input_data_age` until the worker has recomputed it, and after the restart every window answers from the derived-results file without computing
