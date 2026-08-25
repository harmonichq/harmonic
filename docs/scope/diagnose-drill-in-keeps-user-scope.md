# Scope ledger — Drill-in keeps the user's scope (#179)

Ticket: [harmonichq/harmonic#179](https://github.com/harmonichq/harmonic/issues/179)

Base: `0a2d115` (`origin/main`)

Classification: code. UI Craft lifecycle: revise. Review depth: Targeted.

## Decisions

- **The defect is a precedence-chain ordering bug, not a missing guard.**
  `paintChart`'s factor branch (`frontend/diagnose-workstation.js:1706`) runs
  BEFORE the `canvasDrawn` (`:1726`) and `explicitPreset` (`:1735`) branches, and
  its only user-scope guard is `!(f.eventDiscovery && (drawn || explicitPreset))`.
  `eventDiscovery` is true only when `eventChartsOnly` is set and the row carries
  an event-chart coordinate (`:1577`), so an ordinary clock drill never reaches
  the guard and the factor's peak bucket seizes the window.
  **Why:** read at those lines. **Disposition:** inline.
- **Only the whole-day choice is affected, and that is why it looked
  intermittent.** A sub-day window reaches the server through `findingsWindow()`
  (`:1141`) and comes back as `caseWindow.scoped`, taking the `Window` branch at
  `:1711` — preserved. `findingsWindow()` returns `null` for `[0, 1440]`, so the
  24 h choice arrives at the factor branch unscoped and falls to the peak branch.
  The user's choice IS recorded (`explicitPreset = true` at `:1057` for a preset
  press, `:2556` for a whole-day drag commit); it is simply never consulted.
  **Why:** read at those lines; `WINDOWS.all` is literally the `24 h` preset
  (`:236`). **Disposition:** → work order.
- **The behavior is PINNED, so this is a recorded retirement, not a plain
  regression.** Frozen story P20 (`mockups/finding-evidence-routing.behavior.md:573`,
  verdict `kept`, operator-ruled 2026-08-19) pins exactly the seizure.
  **Disposition:** → work order.
- **P20 and P17 contradict each other, and P17 wins.** P17 (`:495`, verdict
  `kept`, the same operator ruling date) says an explicit preset press or drag
  "outranks the window a frame would derive… A user window is a workspace: it
  survives drilling and popping." The code satisfies P20 and violates P17. P20 is
  retired outright, the way P21 was retired for occurrence selection; P17 becomes
  the single precedence rule. **Disposition:** → ADR.
- **The factor frame derives NO canvas window.** It takes ISF's treatment
  (term 31, `:1759-1762`): whatever window stands, stands. No peak chip, no
  `PEAK` label, no `n of N` canvas note tail, no shading, no replacement label of
  any kind. **Why:** operator ruling 2026-08-25, verbatim — "it just keeps my
  selector. The selection is a slicing method that lets me then dig into
  findings. Those findings will show up as dots on the chart anyway that I can
  then trace into." **Disposition:** → work order.
- **Nothing is lost by the retirement, and that is checkable.** The peak keeps
  two permanent homes this change does not touch: the inspector's "When it lands"
  histogram, captioned `peak HH:MM–HH:MM · n of N` (`:512-527`, ADR 79's
  server-owned 12-bucket clock), and the coincidence links "Peak hour falls in
  the … basal slot / … I:C block" with their View slot / View segment routes
  (`:542-556`, P37/P38). The occurrence dots already render on the standing
  window whatever set it (`:1766-1770`). **Disposition:** → work order.
- **The crumb meta count is a different number and stays.** S09 asserts both a
  canvas chip (`/^Factor peak …/`) and a crumb meta (`/^\d+ of \d+ · /`); only
  the canvas chip assertion is retired. Deleting the crumb meta would be a
  second, unsanctioned retirement. **Why:**
  `frontend/diagnose-workstation-behavior.replay.mjs:1037-1038`.
  **Disposition:** → work order.
- **Closed inventory of everything that pins the seizure** (grepped repo-wide for
  `Factor peak` / `PEAK ` / `peak_bucket_index`, not sampled): the factor branch
  `frontend/diagnose-workstation.js:1706-1725`; its two prose comments at `:376`
  and `:1105`; the replay assertion at
  `frontend/diagnose-workstation-behavior.replay.mjs:1037`; ledger P20 (`:573-577`)
  and P21's back-reference (`:585`). No OpenSpec spec pins it. The server payload
  field `clock.peak_bucket_index` and its validator
  (`frontend/finding-case-file-validation.js:49`) feed the inspector histogram and
  are untouched. **Disposition:** → work order.
- **The ledger's own header count is already stale, and this change must not
  paper over it.** Header `:11-13` reads "**99 executable entries** (S01–S81,
  C41–C55, and D1–D3)" while the replay exports 90 S stories (S01–S90), 15 C and
  3 D — 108, matching the last revision's "app: 108 of 108 stories passed". The
  drift predates this ticket. Next free story id is **S91**, and the header
  becomes 109 (S01–S91, C41–C55, D1–D3). **Why:** counted from
  `grep -c '^export const S[0-9]'` and the max exported ids. **Disposition:**
  → work order.
- **Post-freeze changes add a dated revision section; they never edit the P
  inventory.** Five precedents plus the 2026-08-24 §132 revision at the file tail.
  P20's verdict line flips to `retired` with a `sanction:` line carrying the
  operator's own words, exactly as P21's does. **Disposition:** → work order.
- **UI Craft route is revise, confirmed live this session.**
  `routeSurface({embodiment:'shipped', runnability:'runnable',
  declaration:'complete', dataSource:'synthetic'})` returns
  `{"mode":"revise","reason":"safe synthetic data source declared"}`. Safe start is
  AGENTS.md's exact `--no-fetch` entrypoint against
  `mockups/revise-e2e.synthetic/harmonic.sqlite`; frozen ledger
  `mockups/finding-evidence-routing.behavior.md`; replay
  `frontend/diagnose-workstation-behavior.replay.mjs`. **Disposition:** → work order.
- **ADR home is the existing surface change folder.**
  `openspec/changes/finding-evidence-routing/design.md` already holds ADRs 96, 31,
  42, 97, 100 and 41 for this surface, under `## ADR <issue> — Title`. ADR 179
  joins it; no new change folder, no `docs/adr/` tree. **Disposition:** → ADR.
- **Slicing stays flat.** No rubric trait fires: one deliverable surface, one
  module, the browser harness already exists and is not built here, no live
  resource, no trust boundary, no lock phase (revise, not build). Anchor row A,
  the same call #100 made for the same surface and lifecycle.
  **Disposition:** one work order, one pull request.

### Risk contract

- **Must prevent:** secret exposure; irreversible loss of authoritative data;
  silent incorrect success — here specifically a green replay that never presses
  a preset before drilling, which would pass on the defective base. A drill must
  never move the canvas window, and the canvas window must never disagree with
  the window `findingsWindow()` sent to the server.
- **Must recover:** none. Pure view state; nothing is written.
- **Accepted failure:** a factor whose case file has no clock projection now
  leaves the standing window untouched instead of forcing 24 h. The reader sees
  their own window with no occurrence dots rather than a whole-day jump.
- **Unsupported:** the peak's discoverability for a reader who never opens the
  inspector panel; narrow-viewport behavior; assistive-technology announcement of
  the removed chip.
- **Evidence owed:** a browser-gate assertion that fails on this base and passes
  after — press `24 h`, drill a finding, assert the canvas window and the pressed
  preset are byte-identical to before the drill and no `Factor peak` chip exists;
  the same assertion for a drawn window; a guard that the inspector's "When it
  lands" caption and the coincidence links still print after the drill; the
  amended S09; a new frozen story with its replay leg.
- **Why:** advisory dosing tool, one reader at a time, no data written by this
  change; the failure mode is a reader losing the slice they chose.
- **Disposition:** copied into the work order.

## Open questions

- none. The dominant uncertainty (what replaces the seizure) was ruled by the
  operator on 2026-08-25; the two residual code branches have obvious defaults
  recorded above.

## Spawned tasks

- none. #178 was considered and kept separate: it changes the missed-meal
  comparison's cohorts, anchors and relative axis inside the event lens
  (a server projection concern), and decides nothing about the clock scope
  window this ticket fixes.
