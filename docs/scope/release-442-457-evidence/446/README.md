# #446 synthetic evidence

Everything here is synthetic. Every capture and log comes from committed manufactured QA
recipes (`scripts/qa_e2e_cases.py`) or the committed showcase, served by the offline
no-fetch app (`--no-fetch --token ''`). No personal database, operator screenshot or
real-data payload is included. The release coordinator ran every port-bound leg serially;
the ticket worker bound no port. Absolute paths in the logs are replaced with
`<base worktree>`, `<ticket worktree>`, `<release worktree>`, `<scratch>` and `$TMPDIR`.

Change: `changes-arrival-leads-active` (OpenSpec), archived with the release. Ticket branch head at
integration: `a25efdc4`, the second parent of the trunk merge `ca966ce6`. The last leg commit,
`08d3b78e`, differs from it only in `design.md`, `tasks.md` and the behavior ledger; the coordinator
log records it as "code = head".

Stores: `basal-lower` serves S38, S39, S90, S166 and S167 and renders 446-A1, 446-B1, 446-C1 and
446-C2 (its served basal concern stages, and a synthetic `match` pump read begins a Trial);
`c3-trial` serves the preserved stories S45, S45b and S139; `c3-pin` serves S56; `c3-focus` serves
S57, S140 and S168 and renders 446-D1 and 446-E1 (an active Focus beside a saved Plan draft).

## Requirement map

| Requirement (surfaces spec, ADDED/MODIFIED/REMOVED) | Stories | Node and backend tests | Log | Captures |
| --- | --- | --- | --- | --- |
| The watch dock opens Changes on the watched Trial or Focus (MODIFIED) | S139, S140 (preserved) | `frontend/changes-watch-arrival.test.js` "a Plan opened earlier does not take the watched record's seat from the dock's arrival", "once no change is watched, the dock's arrival renders what an arrival with no context renders"; `frontend/diagnose.test.js` "the watch dock's route tokens become Changes arrivals: `changes` names the watch, `plan` the Plan" | `logs/446b-branch-*.log` | — |
| The served active change leads every plain arrival to Changes (ADDED) | S166, S167, S168 | `frontend/changes-watch-arrival.test.js` "after Open Plan, a plain arrival while a change is watched opens the watched record, not the Plan", "on the desk, navigate('changes') after Open Plan lands on the watched record, not the Plan", "a new arrival re-reads guidance, so a stale cached Plan cannot take the seat of a change the server now watches", "each arrival re-reads guidance once, and a re-render within the visit reads none", "while a change is watched, an explicit Plan arrival still opens the Plan"; `frontend/c4.replay.test.js` "S166–S168 are unique app-only #446 arrival stories on their watched cases" | `logs/446b-branch-*.log`, `logs/446-base-*.log` | `renders/after/446-A1-*.png` |
| Open Plan holds for the visit in which it was pressed (ADDED) | S166 | `frontend/changes-watch-arrival.test.js` "after Open Plan, a plain return with nothing watched shows the staged concern, not the Plan", "Open Plan holds for the rest of its visit: a re-render keeps the Plan", "Stage in the Plan's own frame keeps the reader on the Plan with Save draft in hand" | `logs/446b-branch-*.log`, `logs/446-base-*.log` | `renders/after/446-B1-*.png` |
| A Plan draft stays reachable while a change is watched (ADDED) | S166, S167, S168 | `frontend/changes-watch-arrival.test.js` "a watched Trial offers Open Plan while a Plan draft exists, and it opens the Plan by an explicit arrival"; `frontend/c4.replay.test.js` "S168 names the Focus in its return and opens its draft on a branch-shaped page" | `logs/446b-branch-*.log`, `logs/446-base-*.log` | `renders/after/446-C1-*.png`, `renders/after/446-C2-*.png`, `renders/after/446-D1-*.png` |
| Diagnose's return names the watched change (ADDED) | S168, S166 | `frontend/diagnose.test.js` "Diagnose opened from the watched change names that change in its return (ADR 446)"; `frontend/c4.replay.test.js` "S168 reaches its feature assertion on the base shape, never a premise", "S168 names the Focus in its return and opens its draft on a branch-shaped page" | `logs/446b-branch-*.log`, `logs/446-base-*.log` | `renders/after/446-E1-*.png` |

No requirement is REMOVED.

## Recorded results

Coordinator-run, 2026-09-23 and 2026-09-24:

- **Triage, plan review and lock:** triage at `39544368` (stories S166–S168; inventory 174/155/19 on
  the branch), with the coordinator's rulings: Q1, Open Plan on the watched Trial's and Focus's
  nameplate while a draft exists, re-pinned at `a36cc438` through the explicit `?subject=plan`
  arrival; Q2, "Return to Focus". Plan review round 1 blocked on probe evidence, fail-first wording,
  the S167 and S168 reloads and the base renders; round 2 on `916f1dfd` countersigned, and the
  execution lock was posted on #446 (issue comment 5809187377).
- **Start on branch `a0f5a8d7`:** the coordinator log records the fast gate at 1025, S166–S168 and
  inventory 174/155/19. The widening (Diagnose's return named in a tab-routing comment, and the
  replay runner's current name in `ACCEPTANCE.md`) landed in `8bbc728e`.
- **Code review round 1 on `8bbc728e`:** F1, a stale cached disposition on arrival. The coordinator
  widened the change so each arrival re-reads guidance, fixed in `08d3b78e`.
- **12-story replay on branch `8bbc728e` (before the F1 fix; superseded):** S38, S39, S45, S45b, S56,
  S57, S90, S139, S140, S166, S167 and S168 at 1280x720 and 1440x900,
  `# executed 12 · failed 0 · deferred 0 · selected 12 · chromium launches 1`
  (`logs/446-branch-1280x720.log`, `logs/446-branch-1440x900.log`).
- **S166–S168 on base `b03431d2` with the branch harness laid over it** (the replay modules and the
  acceptance scripts from `8bbc728e`, whose harness files are identical at `a0f5a8d7` and
  `08d3b78e`; the coordinator log names the harness "a0f5a8d7/8bbc"): at both sizes,
  `# executed 0 · failed 3 · deferred 0 · selected 3 · chromium launches 1`, then
  "FATAL: zero stories executed — a run that asserts nothing is a failure, not a pass". Each fails at
  its feature assertion (`logs/446-base-1280x720.log`, `logs/446-base-1440x900.log`):
  - `FAIL S166 — Timed out after 30000 ms: S166 the Plan's own Stage keeps the Plan; saw [ 'http://127.0.0.1:8765/changes' ]; S166 Stage in the Plan's own frame must keep the Plan's address`
  - `FAIL S167 — Timed out after 30000 ms: S167 the Trial offers its draft; saw [ [ 'inspect', 'history', '' ] ]; S167 the Trial's nameplate must offer Open Plan beside View change record`
  - `FAIL S168 — Timed out after 30000 ms: S168 Diagnose names the Focus in its return; saw [ [ 'Return to Trial' ] ]; S168 Diagnose opened from the watched Focus must offer "Return to Focus" and no "Return to Trial"`
- **12-story replay on branch `08d3b78e`:** the same 12 stories at 1280x720 and 1440x900,
  `# executed 12 · failed 0 · deferred 0 · selected 12 · chromium launches 1`
  (`logs/446b-branch-1280x720.log`, `logs/446b-branch-1440x900.log`). The coordinator log records
  "446 LEGS on 08d3b78e (code = head): 12/12 both sizes."
- **Review rounds 2 and 3:** doc only. F2 (the ADR over-claimed a shared request) was narrowed in
  `ad1dfcda`; round 3 found it partly fixed, and the coordinator verified the mechanical wording fix
  `29d15ee6` and closed the review. The branch head `a25efdc4` records the replays in task 5.4 and
  the ledger's S166–S168 status lines.
- **Release trunk:** `TRUNK ca966ce6 #446 merged (174/155/19)`. No trunk leg re-ran S166–S168. The
  trunk leg on `25392ade` re-ran the preserved dock stories S139 and S140 among 15 stories,
  `# executed 15 · failed 0 · deferred 0 · selected 15 · chromium launches 1` at both sizes
  (`../447/logs/trunkA-1280x720.log`, `../447/logs/trunkA-1440x900.log`).
- The complete ledger at both sizes, the whole backend pytest and the full
  `acceptance.test.py` run once on the commit that is pushed; the pull request records the result.
  The coordinator log records no backend pytest run for this ticket.

## Renders

- **Before**: base `b03431d2` (origin/main before the release).
- **After**: the release trunk `dd5a93bb`, served with a desk shell built fresh from that
  commit (`npm ci && npm run build`) before the after batch.
- **Owed by**: the execution lock, through design.md's "Revision evidence (coordinator, port-bound)"
  items 1 to 5 (task 5.5).
- **How**: both trees were served with AGENTS.md's QA copy-then-serve command
  (`uv run harmonic serve --no-fetch --token '' --db <scratch copy> --port 8791`) over the
  committed showcase or a named case store emitted by that tree's own
  `scripts/gen_qa_e2e_db.py --case <name>`, followed by the replay case server's
  `reconcile_ingested_follow_up` step. Chromium used the dark scheme, the desk's only theme.
  The same interaction path produced each before and after. Pump reads on both trees came from one
  producer, the base's `frontend/replay-pump.py`, which no ticket changes. 446-A1 and 446-B1 were
  driven directly on both trees, because base S166 fails at its first step, before it reaches
  either state.
- **Files**: each `.png` is the render; each `.txt` beside it holds the page's visible text,
  the address, the focused element and the capture note.

| Shot | Size | State | Store | Route | Before | After |
|---|---|---|---|---|---|---|
| 446-A1 | 1280x720 | Changes after the topbar arrival once the Trial has begun (base: the Plan; branch: the Trial) | `basal-lower` | as 446-B1 → Open Plan if closed → Record decision → pump read `match` → draft saved while watched → topbar Diagnose → topbar Changes (no reload) | [png](renders/before/446-A1-1280x720.png) · [txt](renders/before/446-A1-1280x720.txt) | [png](renders/after/446-A1-1280x720.png) · [txt](renders/after/446-A1-1280x720.txt) |
| 446-A1 | 1440x900 | Changes after the topbar arrival once the Trial has begun (base: the Plan; branch: the Trial) | `basal-lower` | as 446-B1 → Open Plan if closed → Record decision → pump read `match` → draft saved while watched → topbar Diagnose → topbar Changes (no reload) | [png](renders/before/446-A1-1440x900.png) · [txt](renders/before/446-A1-1440x900.txt) | [png](renders/after/446-A1-1440x900.png) · [txt](renders/after/446-A1-1440x900.txt) |
| 446-B1 | 1280x720 | Changes after a plain return, nothing watched (base: the Plan; branch: the concern with Staged, Undo, Open Plan) | `basal-lower` | topbar Changes → Stage (concern frame) → Open Plan → topbar Day → topbar Changes | [png](renders/before/446-B1-1280x720.png) · [txt](renders/before/446-B1-1280x720.txt) | [png](renders/after/446-B1-1280x720.png) · [txt](renders/after/446-B1-1280x720.txt) |
| 446-B1 | 1440x900 | Changes after a plain return, nothing watched (base: the Plan; branch: the concern with Staged, Undo, Open Plan) | `basal-lower` | topbar Changes → Stage (concern frame) → Open Plan → topbar Day → topbar Changes | [png](renders/before/446-B1-1440x900.png) · [txt](renders/before/446-B1-1440x900.txt) | [png](renders/after/446-B1-1440x900.png) · [txt](renders/after/446-B1-1440x900.txt) |
| 446-C1 | 1280x720 | watched Trial with a saved draft: nameplate (branch: Open Plan beside View change record) | `basal-lower` | PUT+apply the served basal action → pump read `match` → draft PUT → `/?to=changes` | [png](renders/before/446-C1-1280x720.png) · [txt](renders/before/446-C1-1280x720.txt) | [png](renders/after/446-C1-1280x720.png) · [txt](renders/after/446-C1-1280x720.txt) |
| 446-C1 | 1440x900 | watched Trial with a saved draft: nameplate (branch: Open Plan beside View change record) | `basal-lower` | PUT+apply the served basal action → pump read `match` → draft PUT → `/?to=changes` | [png](renders/before/446-C1-1440x900.png) · [txt](renders/before/446-C1-1440x900.txt) | [png](renders/after/446-C1-1440x900.png) · [txt](renders/after/446-C1-1440x900.txt) |
| 446-C2 | 1280x720 | the same, Revert to Plan in the reading pane (unchanged) | `basal-lower` | as 446-C1; scroll `[data-part="plan-route"]` | [png](renders/before/446-C2-1280x720.png) · [txt](renders/before/446-C2-1280x720.txt) | [png](renders/after/446-C2-1280x720.png) · [txt](renders/after/446-C2-1280x720.txt) |
| 446-C2 | 1440x900 | the same, Revert to Plan in the reading pane (unchanged) | `basal-lower` | as 446-C1; scroll `[data-part="plan-route"]` | [png](renders/before/446-C2-1440x900.png) · [txt](renders/before/446-C2-1440x900.txt) | [png](renders/after/446-C2-1440x900.png) · [txt](renders/after/446-C2-1440x900.txt) |
| 446-D1 | 1280x720 | watched Focus's nameplate with a saved draft | `c3-focus` | draft PUT (first pump segment) → `/?to=changes` | [png](renders/before/446-D1-1280x720.png) · [txt](renders/before/446-D1-1280x720.txt) | [png](renders/after/446-D1-1280x720.png) · [txt](renders/after/446-D1-1280x720.txt) |
| 446-D1 | 1440x900 | watched Focus's nameplate with a saved draft | `c3-focus` | draft PUT (first pump segment) → `/?to=changes` | [png](renders/before/446-D1-1440x900.png) · [txt](renders/before/446-D1-1440x900.txt) | [png](renders/after/446-D1-1440x900.png) · [txt](renders/after/446-D1-1440x900.txt) |
| 446-E1 | 1280x720 | Diagnose opened from the watched Focus: the crumb's return (base "Return to Trial"; branch "Return to Focus") | `c3-focus` | as 446-D1 → `.gf-stage-focus [data-follow-up-inspect]` | [png](renders/before/446-E1-1280x720.png) · [txt](renders/before/446-E1-1280x720.txt) | [png](renders/after/446-E1-1280x720.png) · [txt](renders/after/446-E1-1280x720.txt) |
| 446-E1 | 1440x900 | Diagnose opened from the watched Focus: the crumb's return (base "Return to Trial"; branch "Return to Focus") | `c3-focus` | as 446-D1 → `.gf-stage-focus [data-follow-up-inspect]` | [png](renders/before/446-E1-1440x900.png) · [txt](renders/before/446-E1-1440x900.txt) | [png](renders/after/446-E1-1440x900.png) · [txt](renders/after/446-E1-1440x900.txt) |

### What the pair shows

At both sizes, after the topbar arrival once the Trial has begun (446-A1), the base shows the Plan
("PLAN · DRAFT SAVED", focus on the "This change" heading) and the trunk shows the Trial ("TRIAL ·
MATURING", "Basal 03:00 · 0.6 U/h → 0.54 U/h") with Open Plan in its nameplate. After a plain return
with nothing watched (446-B1), the base shows "PLAN · STAGED" with Save draft and Record decision,
and the trunk shows the concern "Overnight lows with no insulin on board" with "Staged · Undo" and
Open Plan, focus on its "Action" heading. With a draft saved beside the watched Trial (446-C1), both
trees show "TRIAL · MATURING", and only the trunk's nameplate adds Open Plan after View change
record; in 446-C2 the Revert to Plan section reads the same on both ("Prior setting ready for Plan",
with its own Open Plan), and its other text differences (the observation table's first row, "still
collecting") are the states the release manifest lists for 447-B2 and 449-D1. The watched Focus's
nameplate (446-D1, "FOCUS · ACTIVE", "Highs after meals") gains the same Open Plan on the trunk.
Diagnose opened from the Focus's Inspect evidence (446-E1) offers "Return to Trial" on the base and
"Return to Focus" on the trunk, at the same address and with focus on the "Findings›Highs after
meals" crumb on both.

## Logs

Each leg's commit is the one its coordinator batch printed first (`prep 446 <oid>`, and
`prep base-b03431d2 b03431d2` after the `overlay:` lines for a base leg); those batch outputs are
not kept in this folder.

| File | Leg | Commit |
| --- | --- | --- |
| `logs/446-branch-1280x720.log` | branch replay, 12 stories, 1280x720 (before the F1 fix; superseded) | `8bbc728e` |
| `logs/446-branch-1440x900.log` | branch replay, 12 stories, 1440x900 (before the F1 fix; superseded) | `8bbc728e` |
| `logs/446-base-1280x720.log` | base replay of S166–S168, 1280x720 | base `b03431d2` with the `8bbc728e` harness |
| `logs/446-base-1440x900.log` | base replay of S166–S168, 1440x900 | base `b03431d2` with the `8bbc728e` harness |
| `logs/446b-branch-1280x720.log` | branch replay, 12 stories, 1280x720 | `08d3b78e` |
| `logs/446b-branch-1440x900.log` | branch replay, 12 stories, 1440x900 | `08d3b78e` |
