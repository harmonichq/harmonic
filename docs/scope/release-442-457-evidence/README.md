# #442–#457 release: evidence record

This folder is the release's evidence record. It is a private design-evidence record, not
part of the public tree. Everything in it is synthetic. Every capture is the desk served by
AGENTS.md's QA copy-then-serve
(`uv run harmonic serve --no-fetch --token '' --db <scratch copy> --port 8791`) from the tree
being captured, over the committed showcase or a named QA case store emitted by that tree's
own `scripts/gen_qa_e2e_db.py --case <name>`. Each store also gets the replay case server's
completed-ingestion step (`reconcile_ingested_follow_up`), as `frontend/replay-cases.mjs`
does. Chromium used the dark colour scheme (the desk has one theme), and requests outside the
server were aborted. Every log comes from the release coordinator's port-bound legs, run
serially on synthetic case stores. No personal database, operator screenshot or real-data
payload is included.

## Layout

One folder per ticket unit. Each holds a `README.md` (requirement map, recorded results,
renders and logs), `renders/before/` and `renders/after/` where renders are owed, and `logs/`
with that ticket's raw leg logs. Absolute paths in the logs are replaced with
`<base worktree>`, `<ticket worktree>`, `<release worktree>`, `<scratch>` and `$TMPDIR`.

| Folder | Ticket(s) | OpenSpec change |
|---|---|---|
| [442](442/README.md) | #442 | `backfilled-record-endings` |
| [443](443/README.md) | #443 | `read-time-pump-zone` |
| [445](445/README.md) | #445, #444 | `day-link-identities` |
| [446](446/README.md) | #446 | `changes-arrival-leads-active` |
| [447](447/README.md) | #447 | `retire-verify-language` |
| [448](448/README.md) | #448 | `owned-high-prompts` |
| [449](449/README.md) | #449, #450 | `focus-served-words` |
| [451](451/README.md) | #451, with its prose em-dash widening | `setting-concern-labels` |
| [452](452/README.md) | #452 | `late-conclusion-record-reset` |
| [453](453/README.md) | #453 | `plan-cleanup-s89` |
| [454](454/README.md) | #454 | `fixture-meal-shapes` |
| [455](455/README.md) | #455 | `window-label-narrow` |
| [457](457/README.md) | #457 | `desk-press-wait` |

## Render trees

- **Before** = base `b03431d2` (origin/main before the release), from a clean detached
  worktree whose shell was built from that commit.
- **After** = the release trunk `9882bcfe`'s server (the Python process, and the Guide
  articles it reads from `docs/kb/` on each request) serving a desk shell last built at trunk
  `25392ade` (the #451 merge). The render driver serves the tree's `frontend/dist` as it
  finds it, and that build was not refreshed before the after batch. Every ticket's own desk
  change had merged by `25392ade`, so every ticket's after state below is its shipped state.
  What the after shell lacks is the #451 prose em-dash sweep's desk strings, merged later
  (`5cdc6457`, `9879f196`: the advisory line, the Glossary definitions, the dock's staged
  sentence, and the findings-queue, workstation, record and Plan copy). Every after-capture's
  footer therefore still reads "Advisory only — review with your clinician before changing
  pump settings.", and 451-C1 still reads "Staged, not applied — nothing has changed on the
  pump". The sweep's desk evidence is its replay legs, which build their own shell (see
  [451](451/README.md)). The one other shipping desk-module change after `25392ade` is a
  JSDoc comment in `frontend/plan.js` (`faaf1143`), which renders nothing.
- Driver: the coordinator's capture script, adapted from the first release's render driver,
  run one batch at a time under the coordinator's port lock. Stores were prebuilt outside the
  lock.
- Files: `<ticket>/renders/<before|after>/<shot>-<WxH>.png` and `.txt` (visible page text,
  URL, the focused element, and the shot's note). No failure-state capture was needed: the
  after batch took 99 captures with 0 failures, matching the 99 before captures.
- Pump reads (#446) use one producer for both trees: a copy of `b03431d2`'s
  `frontend/replay-pump.py`, which no ticket changes.

Owed-by column: **lock** = the ticket's pinned tasks.md or design.md names the capture;
**charter** = no lock names it, but the ticket revises a shipped desk surface and
CHARTER.md's ui-craft revise lifecycle requires before and after renders of the affected
state; **review ruling** = a review round added it.

53 shots, 99 captures per tree: #442 2 · #445 7 · #446 6 · #447 5 · #448 2 · #449 6 · #451 5 ·
#452 2 · #454 1 · #455 17.

| Ticket | Shot | Owed by | State | Store | Route / steps | Sizes | Note | Before | After |
|---|---|---|---|---|---|---|---|---|---|
| 442 | 442-A1 | lock (tasks 5.4) | Change records roster: the 06-01 row (base "Still open · Not watched"; branch "Superseded by a later change") | `c4-ic` | `/?to=changes&subject=history`; scroll to `[data-record="trial:<06-01 id>"]` | 1280x720, 1440x900 | id = the served Trial that is not `admission.active_id`, changed 2024-06-01 | [1280x720](442/renders/before/442-A1-1280x720.png) · [1440x900](442/renders/before/442-A1-1440x900.png) | [1280x720](442/renders/after/442-A1-1280x720.png) · [1440x900](442/renders/after/442-A1-1440x900.png) |
| 442 | 442-A2 | lock (tasks 5.4) | the 06-01 record opened (branch: "Superseded by a later change · Jun 10, 2024 · 09:00") | `c4-ic` | as 442-A1 → press the row | 1280x720, 1440x900 |  | [1280x720](442/renders/before/442-A2-1280x720.png) · [1440x900](442/renders/before/442-A2-1440x900.png) | [1280x720](442/renders/after/442-A2-1280x720.png) · [1440x900](442/renders/after/442-A2-1440x900.png) |
| 445 | 445-A1 | lock (design "Render matrix owed" a) | Day opened from the active Trial's first supporting date | `c3-trial` | topbar Changes → `.gf-reading [data-day-date]` first | 1280x720, 1440x900 | URL line carries the Day address (selector vs identity) | [1280x720](445/renders/before/445-A1-1280x720.png) · [1440x900](445/renders/before/445-A1-1440x900.png) | [1280x720](445/renders/after/445-A1-1280x720.png) · [1440x900](445/renders/after/445-A1-1440x900.png) |
| 445 | 445-A2 | lock (design a) | Changes after Return to Changes, focus on that date's control | `c3-trial` | as 445-A1 → `[data-day="return"]` | 1280x720, 1440x900 | .txt "Focused:" names the focused control | [1280x720](445/renders/before/445-A2-1280x720.png) · [1440x900](445/renders/before/445-A2-1440x900.png) | [1280x720](445/renders/after/445-A2-1280x720.png) · [1440x900](445/renders/after/445-A2-1440x900.png) |
| 445 | 445-B1 | lock (design b) | Day opened from the Trial change record's first supporting date | `c3-trial` | history roster → first still-open record → `[data-day-date]` first | 1280x720, 1440x900 |  | [1280x720](445/renders/before/445-B1-1280x720.png) · [1440x900](445/renders/before/445-B1-1440x900.png) | [1280x720](445/renders/after/445-B1-1280x720.png) · [1440x900](445/renders/after/445-B1-1440x900.png) |
| 445 | 445-B2 | lock (design b) | the record reopened after the return, focus on the date control | `c3-trial` | as 445-B1 → `[data-day="return"]` | 1280x720, 1440x900 |  | [1280x720](445/renders/before/445-B2-1280x720.png) · [1440x900](445/renders/before/445-B2-1440x900.png) | [1280x720](445/renders/after/445-B2-1280x720.png) · [1440x900](445/renders/after/445-B2-1440x900.png) |
| 445 | 445-C1 | lock (design c) | Log carbs over a drilled case after logging (store moved: re-read, case restored), focus on the entry's Open Day | `showcase` | Diagnose → Afternoon → Over-treated low → 1st Occurrence; Log carbs at `<latest> 12:07`, first exact chip; entry's Open Day → close utility → Return | 1280x720, 1440x900 | S164 path; the opener is found by its Remove control on both trees | [1280x720](445/renders/before/445-C1-1280x720.png) · [1440x900](445/renders/before/445-C1-1440x900.png) | [1280x720](445/renders/after/445-C1-1280x720.png) · [1440x900](445/renders/after/445-C1-1440x900.png) |
| 445 | 445-C2 | lock (design c) | the same after a reload (drill kept), focus on the entry's Open Day | `showcase` | as 445-C1 → reload → Log carbs → the entry's Open Day → close → Return | 1280x720, 1440x900 |  | [1280x720](445/renders/before/445-C2-1280x720.png) · [1440x900](445/renders/before/445-C2-1440x900.png) | [1280x720](445/renders/after/445-C2-1280x720.png) · [1440x900](445/renders/after/445-C2-1440x900.png) |
| 445 | 445-D1 | lock (design d) | Carb questions over a drilled case: return keeps the drill, focus on the question's Open Day | `showcase` | Diagnose 24 h → Over-treated low → 1st Occurrence → Open in Day → Return; Questions → first Open Day → close → Return | 1280x720, 1440x900 | S165 path | [1280x720](445/renders/before/445-D1-1280x720.png) · [1440x900](445/renders/before/445-D1-1440x900.png) | [1280x720](445/renders/after/445-D1-1280x720.png) · [1440x900](445/renders/after/445-D1-1440x900.png) |
| 446 | 446-B1 | lock (design 2) | Changes after a plain return, nothing watched (base: the Plan; branch: the concern with Staged, Undo, Open Plan) | `basal-lower` | topbar Changes → Stage (concern frame) → Open Plan → topbar Day → topbar Changes | 1280x720, 1440x900 | driven directly on both trees | [1280x720](446/renders/before/446-B1-1280x720.png) · [1440x900](446/renders/before/446-B1-1440x900.png) | [1280x720](446/renders/after/446-B1-1280x720.png) · [1440x900](446/renders/after/446-B1-1440x900.png) |
| 446 | 446-A1 | lock (design "Revision evidence" 1) | Changes after the topbar arrival once the Trial has begun (base: the Plan; branch: the Trial) | `basal-lower` | as 446-B1 → Open Plan if closed → Record decision → pump read `match` → draft saved while watched → topbar Diagnose → topbar Changes (no reload) | 1280x720, 1440x900 | driven directly on both trees: base S166 fails at its first step | [1280x720](446/renders/before/446-A1-1280x720.png) · [1440x900](446/renders/before/446-A1-1440x900.png) | [1280x720](446/renders/after/446-A1-1280x720.png) · [1440x900](446/renders/after/446-A1-1440x900.png) |
| 446 | 446-C1 | lock (design 3) | watched Trial with a saved draft: nameplate (branch: Open Plan beside View change record) | `basal-lower` | PUT+apply the served basal action → pump read `match` → draft PUT → `/?to=changes` | 1280x720, 1440x900 | S167 path | [1280x720](446/renders/before/446-C1-1280x720.png) · [1440x900](446/renders/before/446-C1-1440x900.png) | [1280x720](446/renders/after/446-C1-1280x720.png) · [1440x900](446/renders/after/446-C1-1440x900.png) |
| 446 | 446-C2 | lock (design 3) | the same, Revert to Plan in the reading pane (unchanged) | `basal-lower` | as 446-C1; scroll `[data-part="plan-route"]` | 1280x720, 1440x900 |  | [1280x720](446/renders/before/446-C2-1280x720.png) · [1440x900](446/renders/before/446-C2-1440x900.png) | [1280x720](446/renders/after/446-C2-1280x720.png) · [1440x900](446/renders/after/446-C2-1440x900.png) |
| 446 | 446-D1 | lock (design 4) | watched Focus's nameplate with a saved draft | `c3-focus` | draft PUT (first pump segment) → `/?to=changes` | 1280x720, 1440x900 | S168 path | [1280x720](446/renders/before/446-D1-1280x720.png) · [1440x900](446/renders/before/446-D1-1440x900.png) | [1280x720](446/renders/after/446-D1-1280x720.png) · [1440x900](446/renders/after/446-D1-1440x900.png) |
| 446 | 446-E1 | lock (design 5) | Diagnose opened from the watched Focus: the crumb's return (base "Return to Trial"; branch "Return to Focus") | `c3-focus` | as 446-D1 → `.gf-stage-focus [data-follow-up-inspect]` | 1280x720, 1440x900 |  | [1280x720](446/renders/before/446-E1-1280x720.png) · [1440x900](446/renders/before/446-E1-1440x900.png) | [1280x720](446/renders/after/446-E1-1280x720.png) · [1440x900](446/renders/after/446-E1-1440x900.png) |
| 447 | 447-A1 | lock (tasks 4.1) | the watch dock: ready line wraps inside its reserve, never ellipsized | `c3-trial` | topbar Diagnose; crop `.inspector > .watch` | 1280x720, 1440x900 |  | [1280x720](447/renders/before/447-A1-1280x720.png) · [1440x900](447/renders/before/447-A1-1440x900.png) | [1280x720](447/renders/after/447-A1-1280x720.png) · [1440x900](447/renders/after/447-A1-1440x900.png) |
| 447 | 447-B1 | lock (tasks 4.1) | Changes' Trial Watch maturity (unchanged: `15 days` / `14 required · 0 data gaps`, bar 14 of 14) | `c3-trial` | dock `.go` → scroll `[data-part="maturity"]` | 1280x720, 1440x900 |  | [1280x720](447/renders/before/447-B1-1280x720.png) · [1440x900](447/renders/before/447-B1-1440x900.png) | [1280x720](447/renders/after/447-B1-1280x720.png) · [1440x900](447/renders/after/447-B1-1440x900.png) |
| 447 | 447-B2 | review ruling RR1 (design decision 7), added by the coordinator | Changes' Trial outcome table: its served target row leads, marked as the target | `c3-trial` | as 447-B1; scroll `.gf-stage-trial [data-table="outcomes"]` | 1280x720, 1440x900 |  | [1280x720](447/renders/before/447-B2-1280x720.png) · [1440x900](447/renders/before/447-B2-1440x900.png) | [1280x720](447/renders/after/447-B2-1280x720.png) · [1440x900](447/renders/after/447-B2-1440x900.png) |
| 447 | 447-C1 | lock (tasks 4.1) | Guide article "Reading the Diagnose surface", top | `showcase` | Guide → `[data-utility-slug="reading-diagnose"]` | 1280x720, 1440x900 |  | [1280x720](447/renders/before/447-C1-1280x720.png) · [1440x900](447/renders/before/447-C1-1440x900.png) | [1280x720](447/renders/after/447-C1-1280x720.png) · [1440x900](447/renders/after/447-C1-1440x900.png) |
| 447 | 447-C2 | lock (tasks 4.1) | the same article at its ◈ Cause line (branch: "flow to a Focus, followed in Changes") | `showcase` | as 447-C1; scroll to the ◈ Cause line | 1280x720, 1440x900 | supplementary: the line the Verify wording moved in | [1280x720](447/renders/before/447-C2-1280x720.png) · [1440x900](447/renders/before/447-C2-1440x900.png) | [1280x720](447/renders/after/447-C2-1280x720.png) · [1440x900](447/renders/after/447-C2-1440x900.png) |
| 448 | 448-A1 | lock (tasks 3.4) | Guide silence article at its Upstream cause row (branch: ADR 448 Decision 3 sentence) | `showcase` | Guide → `[data-utility-slug="silence"]`; scroll to "Upstream cause" | 1280x720, 1440x900 |  | [1280x720](448/renders/before/448-A1-1280x720.png) · [1440x900](448/renders/before/448-A1-1440x900.png) | [1280x720](448/renders/after/448-A1-1280x720.png) · [1440x900](448/renders/after/448-A1-1440x900.png) |
| 448 | 448-B1 | lock (tasks 3.4) | Glossary Episode Log group at its Quiet entry ("explained" clause) | `showcase` | Glossary → scroll `[data-glossary-group="Episode Log"]` Quiet | 1280x720, 1440x900 |  | [1280x720](448/renders/before/448-B1-1280x720.png) · [1440x900](448/renders/before/448-B1-1440x900.png) | [1280x720](448/renders/after/448-B1-1280x720.png) · [1440x900](448/renders/after/448-B1-1440x900.png) |
| 449 | 449-A1 | lock (tasks 5.3) | c3-focus active Focus at rest: nameplate, What this Focus watches | `c3-focus` | `/?to=changes` | 1280x720, 1440x900 |  | [1280x720](449/renders/before/449-A1-1280x720.png) · [1440x900](449/renders/before/449-A1-1440x900.png) | [1280x720](449/renders/after/449-A1-1280x720.png) · [1440x900](449/renders/after/449-A1-1440x900.png) |
| 449 | 449-A2 | lock (tasks 5.3) | the same at Observed behavior (row "Late bolus") and its opportunity verdicts ("Ready") | `c3-focus` | as 449-A1; scroll `[data-table="adherence"]` | 1280x720, 1440x900 |  | [1280x720](449/renders/before/449-A2-1280x720.png) · [1440x900](449/renders/before/449-A2-1440x900.png) | [1280x720](449/renders/after/449-A2-1280x720.png) · [1440x900](449/renders/after/449-A2-1440x900.png) |
| 449 | 449-B1 | lock (tasks 5.3) | c3-preempted manual-ended Focus record: saved ending assessment in words | `c3-preempted` | `/?to=changes&subject=history&occurrence=record:focus:<id>`; scroll `[data-ending-assessment]` | 1280x720, 1440x900 | id = the Focus whose `ending.kind` is `manual` | [1280x720](449/renders/before/449-B1-1280x720.png) · [1440x900](449/renders/before/449-B1-1440x900.png) | [1280x720](449/renders/after/449-B1-1280x720.png) · [1440x900](449/renders/after/449-B1-1440x900.png) |
| 449 | 449-C1 | lock (tasks 5.3) | c3-preempted `overnight_drift` Focus record at rest: nameplate "Focus" | `c3-preempted` | same route, the `overnight_drift` Focus | 1280x720, 1440x900 |  | [1280x720](449/renders/before/449-C1-1280x720.png) · [1440x900](449/renders/before/449-C1-1440x900.png) | [1280x720](449/renders/after/449-C1-1280x720.png) · [1440x900](449/renders/after/449-C1-1440x900.png) |
| 449 | 449-C2 | lock (tasks 5.3) | the same at What changed (null-name sentence) | `c3-preempted` | as 449-C1; scroll `[data-record-part="change"]` | 1280x720, 1440x900 |  | [1280x720](449/renders/before/449-C2-1280x720.png) · [1440x900](449/renders/before/449-C2-1440x900.png) | [1280x720](449/renders/after/449-C2-1280x720.png) · [1440x900](449/renders/after/449-C2-1440x900.png) |
| 449 | 449-D1 | lock (tasks 5.3) | c4-history Focus record: behavior cell words, "0 of 4 measured", "Not met — still collecting." | `c4-history` | same route, the ended Focus; scroll `[data-adherence]` | 1280x720, 1440x900 |  | [1280x720](449/renders/before/449-D1-1280x720.png) · [1440x900](449/renders/before/449-D1-1440x900.png) | [1280x720](449/renders/after/449-D1-1280x720.png) · [1440x900](449/renders/after/449-D1-1440x900.png) |
| 451 | 451-A1 | lock (design "Renders owed") | Changes plain arrival: Action figure and status words | `isf-strengthen` | topbar Changes | 1280x720, 1440x900 | S177–S179 cover these states; this shot was specified from design.md before the stories were written | [1280x720](451/renders/before/451-A1-1280x720.png) · [1440x900](451/renders/before/451-A1-1440x900.png) | [1280x720](451/renders/after/451-A1-1280x720.png) · [1440x900](451/renders/after/451-A1-1440x900.png) |
| 451 | 451-B1 | lock (design) | Diagnose findings queue (correction-factor row title and numbers) | `isf-strengthen` | topbar Diagnose → 24 h | 1280x720, 1440x900 |  | [1280x720](451/renders/before/451-B1-1280x720.png) · [1440x900](451/renders/before/451-B1-1440x900.png) | [1280x720](451/renders/after/451-B1-1280x720.png) · [1440x900](451/renders/after/451-B1-1440x900.png) |
| 451 | 451-B2 | lock (design) | the correction-factor panel | `isf-strengthen` | as 451-B1 → the queue row whose id contains `isf` | 1280x720, 1440x900 |  | [1280x720](451/renders/before/451-B2-1280x720.png) · [1440x900](451/renders/before/451-B2-1440x900.png) | [1280x720](451/renders/after/451-B2-1280x720.png) · [1440x900](451/renders/after/451-B2-1440x900.png) |
| 451 | 451-C1 | lock (design) | the dock with the correction factor staged (title fit, values) | `isf-strengthen` | as 451-B2 → Stage change; crop `.inspector > .watch` | 1280x720, 1440x900 |  | [1280x720](451/renders/before/451-C1-1280x720.png) · [1440x900](451/renders/before/451-C1-1440x900.png) | [1280x720](451/renders/after/451-C1-1280x720.png) · [1440x900](451/renders/after/451-C1-1440x900.png) |
| 451 | 451-D1 | lock (design) | the recorded Plan's "What was known" | `isf-strengthen` | as 451-C1 → topbar Changes → Open Plan if closed → Record decision; scroll "What was known" | 1280x720, 1440x900 |  | [1280x720](451/renders/before/451-D1-1280x720.png) · [1440x900](451/renders/before/451-D1-1440x900.png) | [1280x720](451/renders/after/451-D1-1280x720.png) · [1440x900](451/renders/after/451-D1-1440x900.png) |
| 452 | 452-A1 | lock (tasks 5.3) | expired Trial with a later conclusion typed (context) | `c4-isf` | history roster → the `expired_unreviewed` Trial → type into `#late-conclusion-conclusion` | 1280x720, 1440x900 | supplementary: the state before leaving | [1280x720](452/renders/before/452-A1-1280x720.png) · [1440x900](452/renders/before/452-A1-1440x900.png) | [1280x720](452/renders/after/452-A1-1280x720.png) · [1440x900](452/renders/after/452-A1-1440x900.png) |
| 452 | 452-A2 | lock (tasks 5.3) | the same record reopened after Back to records (base: typed words; branch: empty form) | `c4-isf` | as 452-A1 → `[data-record-close]` → press the row again | 1280x720, 1440x900 |  | [1280x720](452/renders/before/452-A2-1280x720.png) · [1440x900](452/renders/before/452-A2-1440x900.png) | [1280x720](452/renders/after/452-A2-1280x720.png) · [1440x900](452/renders/after/452-A2-1440x900.png) |
| 454 | 454-A1 | charter (R454 shipped-desk revision, S182 state) | Highs after meals: a claimed Occurrence selected, its sentence printed once | `pattern-near-tie` | Diagnose 24 h → All charts → Highs after meals tile → first `[data-comparison-cohort="matched"]` Occurrence; scroll the reading pane to its end | 1280x720, 1440x900 | no lock names a render; the charter owes before/after of the revised state | [1280x720](454/renders/before/454-A1-1280x720.png) · [1440x900](454/renders/before/454-A1-1440x900.png) | [1280x720](454/renders/after/454-A1-1280x720.png) · [1440x900](454/renders/after/454-A1-1440x900.png) |
| 455 | 455-A1 | lock (design "Render matrix owed") | Overnight at the narrowest split | `basal-verdict-gallery` | Diagnose at rest → Overnight | 832x720, 832x560 |  | [832x720](455/renders/before/455-A1-832x720.png) · [832x560](455/renders/before/455-A1-832x560.png) | [832x720](455/renders/after/455-A1-832x720.png) · [832x560](455/renders/after/455-A1-832x560.png) |
| 455 | 455-A2 | lock (design) | Morning at the narrowest split | `basal-verdict-gallery` | → Morning | 832x720, 832x560 |  | [832x720](455/renders/before/455-A2-832x720.png) · [832x560](455/renders/before/455-A2-832x560.png) | [832x720](455/renders/after/455-A2-832x720.png) · [832x560](455/renders/after/455-A2-832x560.png) |
| 455 | 455-A3 | lock (design) | Afternoon at the narrowest split | `basal-verdict-gallery` | → Afternoon | 832x720, 832x560 |  | [832x720](455/renders/before/455-A3-832x720.png) · [832x560](455/renders/before/455-A3-832x560.png) | [832x720](455/renders/after/455-A3-832x720.png) · [832x560](455/renders/after/455-A3-832x560.png) |
| 455 | 455-A4 | lock (design) | Evening at the narrowest split | `basal-verdict-gallery` | → Evening | 832x720, 832x560 |  | [832x720](455/renders/before/455-A4-832x720.png) · [832x560](455/renders/before/455-A4-832x560.png) | [832x720](455/renders/after/455-A4-832x720.png) · [832x560](455/renders/after/455-A4-832x560.png) |
| 455 | 455-A5 | lock (design) | 24 h at the narrowest split | `basal-verdict-gallery` | → 24 h | 832x720, 832x560 | before: caption cut, Spotlight rate missing, header title absent, "60" under "70" | [832x720](455/renders/before/455-A5-832x720.png) · [832x560](455/renders/before/455-A5-832x560.png) | [832x720](455/renders/after/455-A5-832x720.png) · [832x560](455/renders/after/455-A5-832x560.png) |
| 455 | 455-B1 | lock (design) | 24 h at 1200×736: one caption line, Spotlight line on one line | `basal-verdict-gallery` | Diagnose at rest → 24 h | 1200x736 |  | [1200x736](455/renders/before/455-B1-1200x736.png) | [1200x736](455/renders/after/455-B1-1200x736.png) |
| 455 | 455-B2 | lock (design) | Afternoon at 1200×736: the caption stacks (after) / runs into the y-axis labels (before) | `basal-verdict-gallery` | → Afternoon | 1200x736 |  | [1200x736](455/renders/before/455-B2-1200x736.png) | [1200x736](455/renders/after/455-B2-1200x736.png) |
| 455 | 455-C1 | lock (design) | 24 h at 1024×768: header unchanged | `basal-verdict-gallery` | Diagnose at rest → 24 h | 1024x768 |  | [1024x768](455/renders/before/455-C1-1024x768.png) | [1024x768](455/renders/after/455-C1-1024x768.png) |
| 455 | 455-D1 | lock (design) | Overnight at the supported sizes (only the 60/180 labels and the rule stub move) | `basal-verdict-gallery` | Diagnose at rest → Overnight | 1280x720, 1440x900 |  | [1280x720](455/renders/before/455-D1-1280x720.png) · [1440x900](455/renders/before/455-D1-1440x900.png) | [1280x720](455/renders/after/455-D1-1280x720.png) · [1440x900](455/renders/after/455-D1-1440x900.png) |
| 455 | 455-D2 | lock (design) | Morning at the supported sizes | `basal-verdict-gallery` | → Morning | 1280x720, 1440x900 |  | [1280x720](455/renders/before/455-D2-1280x720.png) · [1440x900](455/renders/before/455-D2-1440x900.png) | [1280x720](455/renders/after/455-D2-1280x720.png) · [1440x900](455/renders/after/455-D2-1440x900.png) |
| 455 | 455-D3 | lock (design) | Afternoon at the supported sizes | `basal-verdict-gallery` | → Afternoon | 1280x720, 1440x900 |  | [1280x720](455/renders/before/455-D3-1280x720.png) · [1440x900](455/renders/before/455-D3-1440x900.png) | [1280x720](455/renders/after/455-D3-1280x720.png) · [1440x900](455/renders/after/455-D3-1440x900.png) |
| 455 | 455-D4 | lock (design) | Evening at the supported sizes | `basal-verdict-gallery` | → Evening | 1280x720, 1440x900 |  | [1280x720](455/renders/before/455-D4-1280x720.png) · [1440x900](455/renders/before/455-D4-1440x900.png) | [1280x720](455/renders/after/455-D4-1280x720.png) · [1440x900](455/renders/after/455-D4-1440x900.png) |
| 455 | 455-D5 | lock (design) | 24 h at the supported sizes | `basal-verdict-gallery` | → 24 h | 1280x720, 1440x900 |  | [1280x720](455/renders/before/455-D5-1280x720.png) · [1440x900](455/renders/before/455-D5-1440x900.png) | [1280x720](455/renders/after/455-D5-1280x720.png) · [1440x900](455/renders/after/455-D5-1440x900.png) |
| 455 | 455-E1 | lock (design) | crop of the glucose overview, Evening: the parked caption wrapped | `basal-verdict-gallery` | Diagnose at rest → Evening; clip `#chart` + 16 px | 832x720 |  | [832x720](455/renders/before/455-E1-832x720.png) | [832x720](455/renders/after/455-E1-832x720.png) |
| 455 | 455-E2 | lock (design) | crop of the glucose overview, Afternoon | `basal-verdict-gallery` | → Afternoon; clip `#chart` + 16 px | 832x720 |  | [832x720](455/renders/before/455-E2-832x720.png) | [832x720](455/renders/after/455-E2-832x720.png) |
| 455 | 455-F1 | lock (design) | Evening at 1280×720, then narrowed to 832×720 with nothing pressed | `basal-verdict-gallery` | context at 1280x720 → Evening → viewport 832x720 | 1280x720 → 832x720 | file named for its final size, 832x720; Evening serves no evidence chart on this store, so the Spotlight half of this state is 455-G1 | [832x720](455/renders/before/455-F1-832x720.png) | [832x720](455/renders/after/455-F1-832x720.png) |
| 455 | 455-G1 | lock (design, Spotlight half of 455-F1) | 24 h at 1280×720, then narrowed to 832×720 with nothing pressed: the Spotlight keeps its full layout (before) / is laid out for 832 (after) | `basal-verdict-gallery` | context at 1280x720 → 24 h → viewport 832x720 | 1280x720 → 832x720 | supplementary: 24 h is the preset whose Spotlight this store serves | [832x720](455/renders/before/455-G1-832x720.png) | [832x720](455/renders/after/455-G1-832x720.png) |

## What is owed but not produced, and why

- **#443, #453, #457**: none owed. #443's lifecycle is `none` (read-time stamps); #453
  deletes dead code and moves a replay read; #457 changes a browser-suite helper. None
  changes a rendered surface.
- **#444**: covered by #445 (one change, `day-link-identities`). Its Log carbs header needs
  no render: its evidence is the zoned Node test.
- **#450**: covered by #449 (one change, `focus-served-words`). 449-B1 and 449-D1 are the
  served-reason-in-words states.
- **#449 optional shot** (the Focus entry's withheld copy while a Plan is pending): not
  produced, because it is unreachable in the served desk on either tree. Changes seats the
  Plan for a `draft` or `pending_plan` disposition, and the follow-up for `active_change`,
  before it reaches the Focus entry (`frontend/changes.js` `mount`, at `b03431d2` and at
  integration `8073eb71`). A base attempt at
  `/?to=changes&subject=pattern:highs_after_meals` with a recorded Plan showed the pending
  Plan. The withheld words are covered by `frontend/focus-entry.test.js`.
- **#454**: no lock names a render. R454 records a shipped-desk revision (a claimed Pattern
  row prints each fact once, S182), so the charter owes one before and after of that state
  (454-A1).
- **#451's prose em-dash widening**: no after-capture shows its desk strings (see "Render
  trees" above). Its evidence is the S4, S42, S142, S153 and S178 replay legs and the base S4
  failure, in [451](451/README.md).
- Shots marked supplementary in their note (447-C2, 452-A1, 455-G1) are context beside the
  owed state, not owed themselves.

## Sizes outside the two supported ones

#455's matrix owes 832x720 and 832x560 (455-A), 1200x736 (455-B), 1024x768 (455-C), and the
1280x720 → 832x720 narrowing (455-F, 455-G), whose files are named for their final size.
