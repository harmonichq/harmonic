# Tasks

- [ ] Add an event-built, fail-first public-endpoint regression for a scoped Meal
  bolus fell short occurrence whose High outcome and episode boundary straddle the
  requested clock-window edge.
- [ ] Make the custom recurrence case-file path select its clock coordinate from
  the existing Finding-relative `outcome_kind` authority, sharing a local helper
  with the ordinary association path where that keeps the rule single-sourced.
- [ ] Keep recurrence identity/population in the existing evidence-population
  policy and keep the closed consistency equation fail-closed.
- [ ] Pin whole-day and adjacent scoped behavior so the occurrence is counted once,
  appears in exactly one intended clock window, and no valid window returns
  `inconsistent_projection`.
- [ ] Amend the behavioral-layer baseline to state that custom recurrence
  occurrences apply one representative Finding-relative outcome coordinate before
  clock-window filtering.
- [ ] Replay `mockups/finding-evidence-routing.behavior.md` through
  `frontend/diagnose-workstation-behavior.replay.mjs` against the declared synthetic
  no-fetch app; preserve the existing genuine-failure story and story count.
- [ ] Run the repository's complete backend, frontend, guard, drift, and browser
  gates. Re-run the aggregate-only private-snapshot reproduction locally, record no
  event-level values, and delete the snapshot before opening the pull request.
