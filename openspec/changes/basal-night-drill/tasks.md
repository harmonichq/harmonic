# Tasks — the basal slot panel drills into its nights (#291)

- [ ] Render a night roster on the basal slot panel, beneath its existing
  numbers-and-staging block, through the shared occurrence-roster mechanism
  (`frontend/occurrence-roster.js`): three groups keyed on the served per-night
  `sign` — ran above (`1`), ran below (`-1`), ran as set (`null`) — each header
  carrying that group's served count, one button row per steady night printing
  the night's date, delivered against programmed rate in U/h, and its in-slot
  glucose mean (a null served value prints as `—`, the Finding block's
  convention), and one count line for `excluded_night_count` beneath the groups.
  The roster reads the same served night-evidence payload the basal tile holds
  for that slot (`descriptor.data` for the slot's `basal` tile), never a second
  request path; while that payload is absent or stale the roster prints the
  panel's existing loading or unavailable state and nothing else. The panel
  derives no direction, floor, threshold or verdict; the numbers-and-staging
  block above the roster is byte-identical to today's rendering.
- [ ] Wire night selection as select-in-place on the standing slot frame: a
  row click presses that row alone, pushes no level and moves neither the
  breadcrumb nor the clock window; Up/Down step within the selected night's
  group and keep focus on the newly selected row; "Clear trace" releases the
  selection. Selection state lives on the slot frame the way `selectedId` lives
  on the factor frame, and a lane click or a chart click that swaps the slot in
  place clears it.
- [ ] Paint the selected night's served `glucose_trace` over the pooled envelope
  on Glucose by time of day through the existing trace-over-envelope path
  (`envelope.labels` mapped by clock label), exactly as a selected Finding
  occurrence is painted, and remove it when the selection clears or the frame
  pops.
- [ ] Render the selected night's detail block in the Finding selection
  block's shape and classes: the date and slot span, delivered against
  programmed rate, that night's in-slot mean against the roster mean
  (`roster_glucose_mean`), entering to leaving glucose, `n of N` within its
  group with the Up/Down hint, "Clear trace", and "Open <date> in Day" routing
  through the existing Day callback with the night's `t`. A null served mean,
  entry or exit prints as `—`, never as a number or an empty slot.
- [ ] Cover the new behaviour in Node through the public interface —
  `renderSlotLevel` in `frontend/diagnose-workstation.test.js` for the groups,
  counts, row text, excluded count line, pressed state and detail block, each
  test failing first against pre-change behaviour — and in the route-stubbed
  browser suite `frontend/diagnose-workstation.browser.test.mjs` for one
  selection painting a trace series on the canvas and one clear removing it,
  against the generated stub `frontend/__fixtures__/basal-night-evidence.json`.
- [ ] Replay the frozen finding-evidence-routing ledger, unchanged, against the
  exact merge-base with `origin/main` and again against the revision, each
  served through the declared no-fetch command on a scratch copy of the QA
  showcase, and record both counts and the printed retirement sanctions in the
  ledger's new revision entry. Both runs must report the same full count with
  zero failures: this revision adds behaviour and moves none, so a frozen story
  that fails against the revision is a moved behaviour and blocks.
- [ ] Amend `mockups/finding-evidence-routing.behavior.md` with one dated
  revision entry for #291: new executable stories, numbered from the next
  unissued ID, for the roster's three groups and their served counts, the
  excluded count line, night selection pressing one row without moving the
  breadcrumb or the clock window, the trace appearing on Glucose by time of day
  and clearing, the detail block's facts, and Up/Down stepping within a group;
  update the issued and active ID inventory lines so
  `frontend/diagnose-behavior-ledger-parity.test.js` passes; retire nothing.
- [ ] Add the same stories to `frontend/diagnose-workstation-behavior.replay.mjs`
  against the route stubs it already serves for `/api/diagnose/basal-night-evidence`;
  run the amended replay first against the merge-base and record that every new
  story fails there for the right reason (no night roster exists), then against
  the revision, and iterate until it reports its full applicable count with zero
  failures and no skipped story.
- [ ] Capture before/after renders of the basal drill — the roster at rest, one
  night selected with its trace, and the detail block — from the merge-base and
  the revision served on the same scratch copy of the QA showcase, at 1440×900,
  1280×800 and 390×844, into `openspec/changes/basal-night-drill/evidence/`,
  alongside the base, fail-first and final replay outputs; and add the #291
  revision clause to the Finding → evidence routing row of `mockups/INDEX.md`.
- [ ] Fast gate, every generator drift check, and the Diagnose browser gates
  (`diagnose-workstation.browser.test.mjs`,
  `diagnose-canvas-composition.browser.test.mjs`, `cockpit-shell.browser.test.mjs`)
  green on the merged ticket branch.
