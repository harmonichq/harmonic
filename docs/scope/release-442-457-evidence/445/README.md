# #445 and #444 synthetic evidence

Everything here is synthetic. Every capture and replay log comes from committed manufactured QA
recipes (`scripts/qa_e2e_cases.py`) or the committed showcase, served by the offline
no-fetch app (`--no-fetch --token ''`). The desk-suite logs come from the desk suite's own
synthetic payloads (see Stores). No personal database, operator screenshot or
real-data payload is included. The release coordinator ran every port-bound leg serially;
the ticket worker bound no port. Absolute paths in the logs are replaced with
`<base worktree>`, `<ticket worktree>`, `<release worktree>`, `<scratch>` and `$TMPDIR`.

Change: `day-link-identities` (OpenSpec), archived with the release. Ticket branch head at integration:
`6c423bd4`, the second parent of the trunk merge `8073eb71`. The last leg commit, `e68bf5b3`,
differs from it only in `tasks.md` and the behavior ledger.

Stores: `c3-trial` serves S7, S142, S162 and S163 and renders 445-A1 to 445-B2 (its active Trial,
and that Trial's change record, list contributing dates); `c3-history` serves the preserved story
S54b; the committed showcase (`showcase`) serves S60, S61, S62, S72b, S76, S108, S133, S136, S137, S138, S164 and
S165 and renders 445-C1, 445-C2 and 445-D1 (a drilled Over-treated low case with an Occurrence held).
The desk-suite legs (`logs/445-named-*.log`, `logs/445-desk-whole.log`) use no case store: the suite
serves the built desk from disk and answers the API with synthetic payloads written in its driver.

## Requirement map

| Requirement (surfaces spec, ADDED/MODIFIED/REMOVED) | Stories | Node and backend tests | Log | Captures |
| --- | --- | --- | --- | --- |
| Changes and carb-utility Day links name their return target by identity (ADDED) | S162, S163, S164, S165 | `frontend/tab-routing.test.js` "an address that still carries a return-focus key is read and written without it", "a direct v2 entry carries no context and a contextual one round-trips all of it"; `frontend/follow-up-lifecycle.test.js` "a Day return to the active change asks for its date's control, then the heading, on its first content render only", "a Day return to a change record asks for its date's control, then the heading, on its first content render only", "an arrival that is not a Day return asks for nothing, and a malformed date only for the heading", "a supporting date in either Changes view opens Day with that date and no return-focus key"; `frontend/utility-day-links.test.js` "each carb utility's Open Day writes a Day address that names its item, prints its label and carries no selector", "a reopened utility holds its identity until its items load, then asks for that item's Open Day, then its heading, once", "an identity the utility does not serve, an old link's display text and a crafted value ask only for the heading, once"; `frontend/utilities.test.js` "every utility Open Day declares its origin, the label its return is named for, and its item by identity"; `frontend/day.test.js` "a Day address naming an unknown utility offers no utility return, and the next seat draws nothing"; `frontend/desk.browser.test.mjs` "a utility's own Day entry keeps the utility open and returns into it"; `frontend/c4.replay.test.js` "S162–S165 are unique app-only C4 Day-return stories on their manufactured cases" | `logs/445c-branch-*.log`, `logs/445c-base-*.log`, `logs/445-named-branch.log`, `logs/445-named-base.log` | `renders/after/445-A1-*.png`, `renders/after/445-A2-*.png`, `renders/after/445-B1-*.png`, `renders/after/445-B2-*.png`, `renders/after/445-C1-*.png`, `renders/after/445-C2-*.png`, `renders/after/445-D1-*.png` |
| A carb utility's Day return keeps the desk it returns to (ADDED) | S164, S165; S76 (preserved) | `frontend/day.test.js` "a utility entry's Return reopens the utility and returns plainly, naming nothing of the entry in the address", "a utility opened over Day returns into Day as a direct entry: the same day, no second return, the utility seated", "regression pin: a Changes entry's Return still hands back its date, occurrence and from"; `frontend/diagnose.test.js` "ADR 445 · a Diagnose rebuild under a seated utility sets no focus of its own", "regression pin: a Diagnose rebuild with no utility seated still lands on its crumb"; `frontend/desk.browser.test.mjs` "a utility's own Day entry keeps the utility open and returns into it"; `frontend/c4.replay.test.js` "S164 finds the moved return's re-read a round trip after its status read, then the retained return", "S164 fails at its re-read when the return after logging reads nothing but status", "S164 fails when the return after a reload re-reads once its status read is answered", "S165 reads the retained case from an address that still carried the Day entry's keys before the return", "S165 fails at its address when the return leaves a title or a from in it", "S165 fails when its return re-reads once its status read is answered" | `logs/445c-branch-*.log`, `logs/445c-base-*.log`, `logs/445-named-*.log`, `logs/445-desk-whole.log` | `renders/after/445-C1-*.png`, `renders/after/445-C2-*.png`, `renders/after/445-D1-*.png` |
| The Log carbs header names the reader's local date and time (ADDED) | — | `frontend/utility-day-links.test.js` "#444 · the Log carbs header names the reader's local date beside the local time" | — (fast gate; no replay or browser context sets a time zone, so no port-bound leg pins it) | — (none owed: the zoned Node test is its evidence) |
| Day names the subject it was opened from by its served name (MODIFIED) | S164; S61, S62 (preserved) | `frontend/day.test.js` "a contextual entry names the served title it was opened from and returns to what it left", "an entry whose address carries no title names the way back, never its subject", "a utility entry is named for the utility and returns over the destination it was opened on", "a `from` naming no destination returns plainly to Diagnose and prints no label the address made up"; `frontend/tab-routing.test.js` "a contextual entry carries its display title in the address beside its routing subject", "a direct v2 entry carries no context and a contextual one round-trips all of it" | `logs/445c-branch-*.log`, `logs/445c-base-*.log` | `renders/after/445-A1-*.png`, `renders/after/445-B1-*.png` |

No requirement is REMOVED.

## Recorded results

Coordinator-run, 2026-09-23 and 2026-09-24:

- **Triage, plan review and lock:** triage at `669327af` (stories S162–S165; inventory 175/156/19 on
  the branch). Plan review round 1 blocked on the moved-store return, a Log carbs Day test and
  unrecorded rulings. The coordinator's hybrid ruling was re-pinned at `949cd0cf`, round 2
  countersigned, and the execution lock was posted on #445 (issue comment 5809206777) with a
  pointer on #444.
- **Start on branch `d194bad4`:** the coordinator log records the fast gate at 1029 and the whole
  backend pytest at 1004 s wall time, under load, with the inert-click probe passing.
- **Widening on branch `0a43c77b`:** Day returns only into a utility the desk has. Code review
  round 1 found no spec gap and one pre-existing defect (F1, Day's return taking an inherited name
  as a destination), fixed in `aa7a2f24`.
- **Named desk test on branch `0a43c77b`:** "✔ a utility's own Day entry keeps the utility open and
  returns into it", `ℹ tests 1`, `ℹ pass 1`, `ℹ fail 0` (`logs/445-named-branch.log`).
  `frontend/desk.browser.test.mjs` is unchanged from `0a43c77b` to `e68bf5b3`.
- **Whole desk suite on branch `0a43c77b`:** `ℹ tests 43`, `ℹ pass 43`, `ℹ fail 0`
  (`logs/445-desk-whole.log`).
- **17-story replay on branch `0a43c77b` (superseded):** at 1280x720 and 1440x900,
  `# executed 15 · failed 2 · deferred 0 · selected 17 · chromium launches 1`. The two failures:
  "FAIL S164 — S164 the return after logging must re-read Diagnose: the store moved" and
  "FAIL S165 — Timed out after 30000 ms: S165 the retained return; saw [", whose observed values
  end at "S165 the address must name the retained case, with no title, from or focus"
  (`logs/445-branch-1280x720.log`, `logs/445-branch-1440x900.log`). The coordinator log records
  them as "S164 (no re-read after logging) + S165 (address fields)"; the story fix is `5d1319f7`.
- **Named desk test on base `b03431d2` with the `0a43c77b` harness laid over it** (the replay
  modules, the desk suite and the acceptance scripts): "✖ a utility's own Day entry keeps the
  utility open and returns into it", `ℹ tests 1`, `ℹ pass 0`, `ℹ fail 1`, at
  `the Day address names no prompt identity: {"date":"2024-06-26","subject":"Carb questions · Jun 26 13:55","title":"Carb questions · Jun 26 13:55","from":"diagnose.questions","focus":"[data-question-card='low|2024-06-26 13:55:00'] [data-action='day']"}`
  (`logs/445-named-base.log`).
- **S162–S165 on base `b03431d2` with the `0a43c77b` harness laid over it:** at both sizes,
  `# executed 0 · failed 4 · deferred 0 · selected 4 · chromium launches 1`, then
  "FATAL: zero stories executed — a run that asserts nothing is a failure, not a pass". Each fails
  at its feature assertion (`logs/445-base-1280x720.log`, `logs/445-base-1440x900.log`):
  - "FAIL S162 — S162 the Day address must carry no return-focus key"
  - "FAIL S163 — S163 the Day address must carry no return-focus key"
  - "FAIL S164 — S164 the Day address must name the entry by its id"
  - "FAIL S165 — S165 the Carb questions return must issue no request besides the held status check"
- **17-story replay on branch `5d1319f7` (story fix; superseded):** at both sizes,
  `# executed 17 · failed 0 · deferred 0 · selected 17 · chromium launches 1`
  (`logs/445b-branch-1280x720.log`, `logs/445b-branch-1440x900.log`). Code review round 2 was clean,
  with a note that the unmoved one-read check might be blind; the coordinator had it strengthened
  in `e68bf5b3` (`wholeReturn445`).
- **17-story replay on branch `e68bf5b3`:** at 1280x720 and 1440x900,
  `# executed 17 · failed 0 · deferred 0 · selected 17 · chromium launches 1`, with PASS S162, S163,
  S164 and S165 (`logs/445c-branch-1280x720.log`, `logs/445c-branch-1440x900.log`).
- **The same 17 stories on base `b03431d2` with the `e68bf5b3` harness laid over it:** at both sizes,
  `# executed 13 · failed 4 · deferred 0 · selected 17 · chromium launches 1`. The 13 preserved
  stories (S7, S54b, S60, S61, S62, S72b, S76, S108, S133, S136, S137, S138, S142) pass, and S162–S165
  fail with the same four FAIL lines as above (`logs/445c-base-1280x720.log`,
  `logs/445c-base-1440x900.log`). The coordinator log records "base 13/4 expected fails both sizes".
- **Release trunk:** `TRUNK 8073eb71 #445/#444 merged (186/167/19; fast 1106/1106; port-free OK)`.
  No trunk leg re-ran S162–S165. The em-dash sweep's legs on `678fb544`, a branch off trunk
  `25392ade` that contains this merge, passed the whole desk suite 43/43 (with "✔ a utility's own
  Day entry keeps the utility open and returns into it") and S142 among five stories, 5/5 at both
  sizes (`../451/logs/emdash-desk-whole.log`, `../451/logs/emdash-branch-*.log`).
- The complete ledger at both sizes, the whole backend pytest and the full
  `acceptance.test.py` run once on the commit that is pushed; the pull request records the result.

## Renders

- **Before**: base `b03431d2` (origin/main before the release).
- **After**: release trunk `9882bcfe`'s server, serving the desk shell last built at trunk
  `25392ade`. Every ticket's desk change had merged by then; the evidence record's root
  [README](../README.md) records what that shell lacks (the #451 prose em-dash sweep's
  desk strings).
- **Owed by**: the execution lock, through design.md's "Render matrix owed" (states a to d) in the
  change's Revise lifecycle record. The Log carbs header (#444) owes none; its evidence is the zoned
  Node test.
- **How**: both trees were served with AGENTS.md's QA copy-then-serve command
  (`uv run harmonic serve --no-fetch --token '' --db <scratch copy> --port 8791`) over the
  committed showcase or a named case store emitted by that tree's own
  `scripts/gen_qa_e2e_db.py --case <name>`, followed by the replay case server's
  `reconcile_ingested_follow_up` step. Chromium used the dark scheme, the desk's only theme.
  The same interaction path produced each before and after. In 445-C1 the logged entry's Open Day
  is found by its Remove control on both trees.
- **Files**: each `.png` is the render; each `.txt` beside it holds the page's visible text,
  the address, the focused element and the capture note.

| Shot | Size | State | Store | Route | Before | After |
|---|---|---|---|---|---|---|
| 445-A1 | 1280x720 | Day opened from the active Trial's first supporting date | `c3-trial` | topbar Changes → `.gf-reading [data-day-date]` first | [png](renders/before/445-A1-1280x720.png) · [txt](renders/before/445-A1-1280x720.txt) | [png](renders/after/445-A1-1280x720.png) · [txt](renders/after/445-A1-1280x720.txt) |
| 445-A1 | 1440x900 | Day opened from the active Trial's first supporting date | `c3-trial` | topbar Changes → `.gf-reading [data-day-date]` first | [png](renders/before/445-A1-1440x900.png) · [txt](renders/before/445-A1-1440x900.txt) | [png](renders/after/445-A1-1440x900.png) · [txt](renders/after/445-A1-1440x900.txt) |
| 445-A2 | 1280x720 | Changes after Return to Changes, focus on that date's control | `c3-trial` | as 445-A1 → `[data-day="return"]` | [png](renders/before/445-A2-1280x720.png) · [txt](renders/before/445-A2-1280x720.txt) | [png](renders/after/445-A2-1280x720.png) · [txt](renders/after/445-A2-1280x720.txt) |
| 445-A2 | 1440x900 | Changes after Return to Changes, focus on that date's control | `c3-trial` | as 445-A1 → `[data-day="return"]` | [png](renders/before/445-A2-1440x900.png) · [txt](renders/before/445-A2-1440x900.txt) | [png](renders/after/445-A2-1440x900.png) · [txt](renders/after/445-A2-1440x900.txt) |
| 445-B1 | 1280x720 | Day opened from the Trial change record's first supporting date | `c3-trial` | history roster → first still-open record → `[data-day-date]` first | [png](renders/before/445-B1-1280x720.png) · [txt](renders/before/445-B1-1280x720.txt) | [png](renders/after/445-B1-1280x720.png) · [txt](renders/after/445-B1-1280x720.txt) |
| 445-B1 | 1440x900 | Day opened from the Trial change record's first supporting date | `c3-trial` | history roster → first still-open record → `[data-day-date]` first | [png](renders/before/445-B1-1440x900.png) · [txt](renders/before/445-B1-1440x900.txt) | [png](renders/after/445-B1-1440x900.png) · [txt](renders/after/445-B1-1440x900.txt) |
| 445-B2 | 1280x720 | the record reopened after the return, focus on the date control | `c3-trial` | as 445-B1 → `[data-day="return"]` | [png](renders/before/445-B2-1280x720.png) · [txt](renders/before/445-B2-1280x720.txt) | [png](renders/after/445-B2-1280x720.png) · [txt](renders/after/445-B2-1280x720.txt) |
| 445-B2 | 1440x900 | the record reopened after the return, focus on the date control | `c3-trial` | as 445-B1 → `[data-day="return"]` | [png](renders/before/445-B2-1440x900.png) · [txt](renders/before/445-B2-1440x900.txt) | [png](renders/after/445-B2-1440x900.png) · [txt](renders/after/445-B2-1440x900.txt) |
| 445-C1 | 1280x720 | Log carbs over a drilled case after logging (store moved: re-read, case restored), focus on the entry's Open Day | `showcase` | Diagnose → Afternoon → Over-treated low → 1st Occurrence; Log carbs at `<latest> 12:07`, first exact chip; entry's Open Day → close utility → Return | [png](renders/before/445-C1-1280x720.png) · [txt](renders/before/445-C1-1280x720.txt) | [png](renders/after/445-C1-1280x720.png) · [txt](renders/after/445-C1-1280x720.txt) |
| 445-C1 | 1440x900 | Log carbs over a drilled case after logging (store moved: re-read, case restored), focus on the entry's Open Day | `showcase` | Diagnose → Afternoon → Over-treated low → 1st Occurrence; Log carbs at `<latest> 12:07`, first exact chip; entry's Open Day → close utility → Return | [png](renders/before/445-C1-1440x900.png) · [txt](renders/before/445-C1-1440x900.txt) | [png](renders/after/445-C1-1440x900.png) · [txt](renders/after/445-C1-1440x900.txt) |
| 445-C2 | 1280x720 | the same after a reload (drill kept), focus on the entry's Open Day | `showcase` | as 445-C1 → reload → Log carbs → the entry's Open Day → close → Return | [png](renders/before/445-C2-1280x720.png) · [txt](renders/before/445-C2-1280x720.txt) | [png](renders/after/445-C2-1280x720.png) · [txt](renders/after/445-C2-1280x720.txt) |
| 445-C2 | 1440x900 | the same after a reload (drill kept), focus on the entry's Open Day | `showcase` | as 445-C1 → reload → Log carbs → the entry's Open Day → close → Return | [png](renders/before/445-C2-1440x900.png) · [txt](renders/before/445-C2-1440x900.txt) | [png](renders/after/445-C2-1440x900.png) · [txt](renders/after/445-C2-1440x900.txt) |
| 445-D1 | 1280x720 | Carb questions over a drilled case: return keeps the drill, focus on the question's Open Day | `showcase` | Diagnose 24 h → Over-treated low → 1st Occurrence → Open in Day → Return; Questions → first Open Day → close → Return | [png](renders/before/445-D1-1280x720.png) · [txt](renders/before/445-D1-1280x720.txt) | [png](renders/after/445-D1-1280x720.png) · [txt](renders/after/445-D1-1280x720.txt) |
| 445-D1 | 1440x900 | Carb questions over a drilled case: return keeps the drill, focus on the question's Open Day | `showcase` | Diagnose 24 h → Over-treated low → 1st Occurrence → Open in Day → Return; Questions → first Open Day → close → Return | [png](renders/before/445-D1-1440x900.png) · [txt](renders/before/445-D1-1440x900.txt) | [png](renders/after/445-D1-1440x900.png) · [txt](renders/after/445-D1-1440x900.txt) |

### What the pair shows

At both sizes, 445-A1 and 445-B1 open the same Day (Fri, May 3, 2024) with "Opened from" printing
"Basal 03:00 · 0.6 U/h → 0.54 U/h", but the base address ends in
`&focus=%5Bdata-day-date%3D%222024-05-03%22%5D` and the trunk address ends at `from=changes`. After
Return to Changes from the active Trial (445-A2), the base note reads "focus on the 2024-05-03
control did not land within 8s" with focus on the "This trial" heading, while the trunk puts focus
on the "May 3" supporting-date button; from the change record (445-B2) both trees reopen the
"SETTING CHANGE · STILL OPEN" record with focus on "May 3", and only the base address carries the
selector. After the Log carbs round trip (445-C1, and 445-C2 after a reload) and the Carb questions
round trip (445-D1), the base address names the utility's title, `from=diagnose.carbs` or
`from=diagnose.questions` and a `focus` selector, the reading pane shows "BASAL 03:00 TO 04:00"
instead of the drilled case, and focus is on `body`. On the trunk the same returns keep
"OVER-TREATED LOW" in the reading pane under the reopened utility, the address is
`/diagnose?subject=finding%3Aover_treated_low&occurrence=o_28b23a9c1b6fa5ab54f21c4b88b26ea4` (with
`&window=720-1080` in 445-C1 and 445-C2), and focus is on the item's own Open Day button ("Open
Jun 30" with `data-subject="carb:1"`, or "Open Jun 26" with
`data-subject="question:low|2024-06-26 13:55:00"`). The other text differences in 445-A2 and 445-B2
(the observation table's first row, and "still collecting") are the states the release manifest
lists for 447-B2 and 449-D1.

## Logs

Each leg's commit is the one its coordinator batch printed first (`prep 445 <oid>`, and
`prep base-b03431d2 b03431d2` after the `overlay:` lines for a base leg); those batch outputs are
not kept in this folder.

| File | Leg | Commit |
| --- | --- | --- |
| `logs/445-named-branch.log` | desk suite, the named test "a utility's own Day entry keeps the utility open and returns into it", branch | `0a43c77b` |
| `logs/445-desk-whole.log` | whole desk suite, branch | `0a43c77b` |
| `logs/445-branch-1280x720.log` | branch replay, 17 stories, 1280x720 (superseded) | `0a43c77b` |
| `logs/445-branch-1440x900.log` | branch replay, 17 stories, 1440x900 (superseded) | `0a43c77b` |
| `logs/445-named-base.log` | the named desk test on base with the branch harness laid over it | base `b03431d2` with the `0a43c77b` harness |
| `logs/445-base-1280x720.log` | base replay of S162–S165, 1280x720 | base `b03431d2` with the `0a43c77b` harness |
| `logs/445-base-1440x900.log` | base replay of S162–S165, 1440x900 | base `b03431d2` with the `0a43c77b` harness |
| `logs/445b-branch-1280x720.log` | branch replay, 17 stories, 1280x720 (superseded) | `5d1319f7` |
| `logs/445b-branch-1440x900.log` | branch replay, 17 stories, 1440x900 (superseded) | `5d1319f7` |
| `logs/445c-branch-1280x720.log` | branch replay, 17 stories, 1280x720 | `e68bf5b3` |
| `logs/445c-branch-1440x900.log` | branch replay, 17 stories, 1440x900 | `e68bf5b3` |
| `logs/445c-base-1280x720.log` | base replay, the same 17 stories, 1280x720 | base `b03431d2` with the `e68bf5b3` harness |
| `logs/445c-base-1440x900.log` | base replay, the same 17 stories, 1440x900 | base `b03431d2` with the `e68bf5b3` harness |

The 17 stories are S7, S54b, S60, S61, S62, S72b, S76, S108, S133, S142, S136, S137, S138, S162,
S163, S164 and S165, in the order the logs run them.
