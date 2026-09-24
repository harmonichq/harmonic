# Tasks

- [x] Add a fail-first public-endpoint regression for a Meal bolus fell short
  occurrence whose High outcome and episode end fall in adjacent clock windows.
- [x] Make the custom recurrence case-file path use the latest Finding-relative
  High across episodes representing one meal, falling back to the meal time.
- [x] Preserve genuine consistency failures and existing recurrence behavior.
- [x] Run the focused tests, fast gates, relevant Diagnose behavior replay, and the
  aggregate-only snapshot check; delete the snapshot before opening the PR.
