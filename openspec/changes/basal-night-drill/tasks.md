# Tasks — the basal slot panel drills into its nights (#291)

- [x] Render a night roster on the basal slot panel, beneath its existing
  numbers-and-staging block, through the shared occurrence-roster mechanism
  (`frontend/occurrence-roster.js`): groups keyed on the served per-night facts —
  ran above (`sign` 1), ran below (`sign` -1), ran as set (`sign` null with a
  served `programmed_rate`), and, only when such nights exist, no programmed
  rate on file (`programmed_rate` null, whatever its `sign`), the same
  distinction the basal tile's verdict rail draws — each header carrying that
  group's served count, one button row per steady night printing the night's
  date, delivered against programmed rate in U/h, and its in-slot glucose mean
  (a null served value prints as `—`, the Finding block's convention), and one
  count line for `excluded_night_count` beneath the groups. The mechanism's
  five-row cap is honoured: the panel passes `shownCount` and `onMore` with an
  expand state kept on the slot frame, exactly as the Finding rosters do. The
  payload is the served night-evidence body for that slot: the slot's `basal`
  tile descriptor's `data` when the findings publish such a tile (looked up by
  kind and `coordinates.slot`, never by a chart id the lane click does not
  carry), otherwise requested once per slot frame through the same fetch the
  tile uses (`fetchDiagnoseBasalNightEvidence({ slot })`) and kept on the frame
  — one fetch function, no parallel client. While the payload is pending the
  roster area prints one `.empty` line, "Loading nights…", and when the request
  fails or the payload is stale, one `.empty` line, "Night evidence
  unavailable." — the inspector's shipped empty-state element, the one the
  Finding case file uses for "Opening case file…" and "Case file unavailable."
  — and it never prints a roster it did not receive. The panel
  derives no direction, floor, threshold or verdict; the numbers-and-staging
  block above the roster is byte-identical to today's rendering. The roster and
  the detail block use the shipped design system only — `DESIGN.md` tokens, the
  Finding roster's row geometry and type hierarchy, no new colour, no new
  component — and every row and control is a touch target the tablet width can
  hit (the shipped `.ev-row` button is the sibling to match exactly).
- [x] Wire night selection as select-in-place on the standing slot frame: a
  row click presses that row alone, pushes no level and moves neither the
  breadcrumb nor the clock window; Up/Down step within the selected night's
  group and keep focus on the newly selected row; "Clear trace" releases the
  selection. Selection state lives on the slot frame the way `selectedId` lives
  on the factor frame. Add the clearing: the in-place swap in `pickCell` today
  overwrites only `cell` and `rowId`, so it must also clear the night selection,
  its trace and its detail block, and so must popping the frame.
- [x] Paint the selected night's served `glucose_trace` over the pooled envelope
  on Glucose by time of day through the existing trace-over-envelope path
  (`envelope.labels` mapped by clock label), exactly as a selected Finding
  occurrence is painted, and remove it when the selection clears or the frame
  pops.
- [x] Render the selected night's detail block in the Finding selection
  block's shape and classes: the date and slot span, delivered against
  programmed rate, that night's in-slot mean against the roster mean
  (`roster_glucose_mean`), entering to leaving glucose, `n of N` within its
  group with the Up/Down hint, "Clear trace", and "Open <date> in Day" routing
  through the existing Day callback with the night's `t`. A null served mean,
  entry or exit prints as `—`, never as a number or an empty slot.
- [x] Cover the new behaviour in Node through the public interface —
  `renderSlotLevel` in `frontend/diagnose-workstation.test.js` for the groups,
  counts, row text, excluded count line, pressed state and detail block, each
  test failing first against pre-change behaviour, plus cases for the in-place
  slot swap clearing the selection, trace and detail block, for the pending
  payload printing "Loading nights…", and for a failed or stale payload printing
  "Night evidence unavailable." with no roster — and in the route-stubbed
  browser suite `frontend/diagnose-workstation.browser.test.mjs` for one
  selection painting a trace series on the canvas and one clear removing it —
  one of the two entered from a lane cell click, the other from the findings
  row, so both entries prove the roster renders — plus Node cases for the
  capped roster and its expansion, and for a lane slot with no published tile
  rendering the roster from the fetched payload,
  against the generated stub `frontend/__fixtures__/basal-night-evidence.json`.
- [x] Replay the frozen finding-evidence-routing ledger, unchanged, against the
  exact merge-base with `origin/main` and again against the revision, each
  served through the declared no-fetch command on a scratch copy of the QA
  showcase, and record both counts and the printed retirement sanctions in the
  ledger's new revision entry. Both runs must report the same full count with
  zero failures: this revision adds behaviour and moves none, so a frozen story
  that fails against the revision is a moved behaviour and blocks.
- [x] Amend `mockups/finding-evidence-routing.behavior.md` with one dated
  revision entry for #291: new executable stories, numbered from the next
  unissued ID, for the roster's four groups and their served counts (the stub
  fixture holds no ran-below night and no night without a programmed rate, so
  those two groups' stories supply their own body through the replay's
  `evidenceScenario` hook, as S104 does), the no-programmed-rate night never
  reading as ran-as-set, the excluded count line, night selection pressing one row without moving the
  breadcrumb or the clock window, the trace appearing on Glucose by time of day
  and clearing, the detail block's facts, Up/Down stepping within a group, and
  one story that runs the selection at the 1024×768 tablet viewport and asserts
  the roster, the detail block and the canvas stay inside their panes without
  horizontal overflow; update the issued and active ID inventory lines so
  `frontend/diagnose-behavior-ledger-parity.test.js` passes; retire nothing.
- [x] Add the same stories to `frontend/diagnose-workstation-behavior.replay.mjs`
  against the route stubs it already serves for `/api/diagnose/basal-night-evidence`;
  run the amended replay first against the merge-base and record that every new
  story fails there for the right reason (no night roster exists), then against
  the revision, and iterate until it reports its full applicable count with zero
  failures and no skipped story.
- [x] Capture before/after renders of the basal drill — the roster at rest, one
  night selected with its trace, and the detail block — from the merge-base and
  the revision served on the same scratch copy of the QA showcase, at 1440×900,
  1280×800, 1024×768 (tablet, landscape) and 390×844, into `openspec/changes/basal-night-drill/evidence/`,
  alongside the base, fail-first and final replay outputs; and add the #291
  revision clause to the Finding → evidence routing row of `mockups/INDEX.md`.
- [x] Fast gate, every generator drift check, and every app-targeted browser
  gate that loads the workstation module green on the merged ticket branch:
  `diagnose-workstation.browser.test.mjs`,
  `diagnose-canvas-composition.browser.test.mjs`, `cockpit-shell.browser.test.mjs`,
  `diagnose-event-comparison-behavior.replay.mjs`,
  `mockups/diagnose-event-comparison-support-audit.mjs` and
  `verify-660-story-behavior.replay.mjs`, each run as `AGENTS.md` lists it.
