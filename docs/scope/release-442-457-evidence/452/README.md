# #452 synthetic evidence

Everything here is synthetic. Every capture and replay log comes from committed manufactured
QA recipes (`scripts/qa_e2e_cases.py`) or the committed showcase, served by the offline
no-fetch app (`--no-fetch --token ''`); the desk browser suite answers from synthetic payloads
written in its own driver. No personal database, operator screenshot or real-data payload is
included. The release coordinator ran every port-bound leg serially; the ticket worker bound
no port. Absolute paths in the logs are replaced with `<base worktree>`, `<ticket worktree>`,
`<release worktree>`, `<scratch>` and `$TMPDIR`.

Change: `late-conclusion-record-reset` (OpenSpec), archived with the release. Ticket branch
head at integration: `62c361b5`, the second parent of trunk merge `1f963a18`. The last legs
ran on `cd392553`; `62c361b5` adds only the ledger's recorded results and the tasks.md ticks
on top of it, and changes no harness or shipping file.

Stores: `c4-isf` serves S180 and 452-A1/452-A2 (its one retained Trial, a correction factor
change from 1 U : 40 mg/dL to 1 U : 44 mg/dL, ended expired unreviewed with no later
conclusion saved). `c3-trial` serves the regression stories S52, S53, S92, S94, S105, S142 and
R17. `c3-history` serves S54b. `c3-focus` serves S57. `edit-chain` serves S110, S112 and S143.
No committed case store serves two expired Trials, so the carry into a different record is
proved at node level only.

## Requirement map

| Requirement (surfaces spec, ADDED) | Stories | Node and backend tests | Log | Captures |
| --- | --- | --- | --- | --- |
| A later conclusion stays with the change record it was typed on | S180; regression S52, S53, S54b, S57, S92, S94, S105, S110, S112, S142, S143, R17 | `frontend/follow-up-lifecycle.test.js` "a later conclusion typed on one expired Trial does not follow into the next record opened from the roster", "reopening the same expired Trial from the roster starts its later conclusion empty", "a Retry still in flight when the reader leaves writes nothing into the next record", "a first save that fails after the reader left does not follow into the next record", "a first save that succeeds after the reader left keeps the next record’s draft", "an exact expired Trial records a later conclusion through the public client, retries, and reloads its immutable record", "a Day return to the same expired Trial keeps its later conclusion, its failure and its request id for Retry" (added at integration, `4b70a7f2`); `frontend/c4.replay.test.js` "S180 is a unique app-only C4 record story on the manufactured case serving one expired Trial", "S180 passes when a reopened record starts empty with a request id of its own", "S180 fails at its feature assertion when a reopened record keeps the typed words", "S180 fails when a reopened record keeps only the failed save", "S180 fails when the next save reuses the refused request id"; `frontend/desk.browser.test.mjs` "an expired Trial distinguishes its Later conclusion input…" (unchanged; it opens the record by address) | `logs/452b-branch-*.log`, `logs/452-base-*.log`, `logs/452b-desk-named.log`; superseded `logs/452-branch-*.log`, `logs/452-desk-named.log` | `renders/after/452-A2-*.png` (context: `renders/after/452-A1-*.png`) |

The requirement's Day-return clause (a return from Day to the same record keeps the typed text,
the failure and the request identity) is pinned at node level by "a Day return to the same
expired Trial keeps its later conclusion, its failure and its request id for Retry", added at
integration (`4b70a7f2`). It presses the record's own Day door, returns through the record's
address, and requires the words, the failure and a Retry that resends the failed request id. It
fails when a Day return drops the form or only the request id (shown on a scratch copy). No
story covers the clause.

## Recorded results

Coordinator-run, 2026-09-23 and 2026-09-24:

- **Worker gate on `a55fe730`, as the coordinator log records it:** whole backend pytest
  415 s under load, fast gate 1021. The coordinator then authorized a router reset in #430's
  roster-press test, committed as `560098de`.
- **First leg set on branch `560098de`, superseded by the review fix below:** S52, S54b, S57,
  S92, S94, S105, S110, S112, S142, S143, S180, S53 and R17 each `PASS` at 1280x720 and
  1440x900, `# executed 13 · failed 0 · deferred 0 · selected 13 · chromium launches 1` at
  each size (`logs/452-branch-1280x720.log`, `logs/452-branch-1440x900.log`). The desk
  browser test "an expired Trial distinguishes its Later conclusion input from the immutable
  ending" passed at 1280x720 and 1440x900, the runner totals tests 2, pass 2, fail 0
  (`logs/452-desk-named.log`).
- **The same 13 stories on base `b03431d2` with the branch harness from `560098de` laid over
  it** (`frontend/c4.replay.mjs`, `frontend/c4.replay.test.js`,
  `frontend/desk-behavior.replay.mjs`, `frontend/replay-cases.mjs`,
  `mockups/sweep/harmonic-v2-desktop/acceptance.py`,
  `mockups/sweep/harmonic-v2-desktop/acceptance.test.py`): S180 fails at both sizes at its
  feature assertion, `FAIL S180 — S180 reopening the record from the roster must start its
  later conclusion empty`, with `+ 'Synthetic observation typed before leaving'` as actual and
  `- ''` as expected. The other 12 pass: `# executed 12 · failed 1 · deferred 0 · selected 13
  · chromium launches 1` at each size (`logs/452-base-1280x720.log`,
  `logs/452-base-1440x900.log`). This is the only base run. `cd392553` changes no replay
  harness file, so it stands for the fix.
- **Code review round 1** found F1: a later-conclusion save still in flight landed on the next
  record. The coordinator widened the change to cover it, and the fix is `cd392553`. Round 2
  of the review was clean on `cd392553`.
- **Re-run on branch `cd392553`:** the same 13 stories each `PASS` at 1280x720 and 1440x900,
  `# executed 13 · failed 0 · deferred 0 · selected 13 · chromium launches 1` at each size
  (`logs/452b-branch-1280x720.log`, `logs/452b-branch-1440x900.log`), and the desk browser
  test passed at both sizes, the runner totals tests 2, pass 2, fail 0
  (`logs/452b-desk-named.log`). The runner's lock line records load averages 43.48 31.74
  21.03 for this set, and the coordinator log notes load 43 during it.
- **Release trunk:** `TRUNK 1f963a18 #452 merged (175/156/19; resolve-merge.py concat+ours;
  fast 1008/1008; port-free acceptance OK)`.
- **Trunk re-run:** `TRUNK LEGS 25392ade` re-ran S180 with 14 other stories, 15/15 at both
  sizes. The #451 em-dash sweep's legs on `678fb544` re-ran S142, one of this change's
  regression stories, with S4, S42, S153 and S178, 5/5 at both sizes.
- The complete ledger at both sizes runs once on the commit that is pushed; the pull request
  records the result.

## Renders

- **Before**: base `b03431d2` (origin/main before the release).
- **After**: release trunk `9882bcfe`'s server, serving the desk shell last built at trunk
  `25392ade`. Every ticket's desk change had merged by then; the evidence record's root
  [README](../README.md) records what that shell lacks (the #451 prose em-dash sweep's
  desk strings).
- **Owed by**: the lock (tasks.md 5.3): on `c4-isf`, the expired Trial opened from the
  roster, a later conclusion typed, Back to records, and the record reopened, at both sizes
  (452-A2). 452-A1 is supplementary context, the state before leaving.
- **How**: both trees were served with AGENTS.md's QA copy-then-serve command
  (`uv run harmonic serve --no-fetch --token '' --db <scratch copy> --port 8791`) over a named
  case store emitted by that tree's own `scripts/gen_qa_e2e_db.py --case <name>`, followed by
  the replay case server's `reconcile_ingested_follow_up` step. Chromium used the dark scheme,
  the desk's only theme. The same interaction path produced each before and after.
- **Files**: each `.png` is the render; each `.txt` beside it holds the page's visible text,
  the address, the focused element and the capture note.

| Shot | Size | State | Store | Route | Before | After |
|---|---|---|---|---|---|---|
| 452-A1 | 1280x720 | expired Trial with a later conclusion typed, not saved (supplementary) | `c4-isf` | Changes roster → the expired unreviewed Trial → type into `#late-conclusion-conclusion` | [png](renders/before/452-A1-1280x720.png) · [txt](renders/before/452-A1-1280x720.txt) | [png](renders/after/452-A1-1280x720.png) · [txt](renders/after/452-A1-1280x720.txt) |
| 452-A1 | 1440x900 | expired Trial with a later conclusion typed, not saved (supplementary) | `c4-isf` | as above | [png](renders/before/452-A1-1440x900.png) · [txt](renders/before/452-A1-1440x900.txt) | [png](renders/after/452-A1-1440x900.png) · [txt](renders/after/452-A1-1440x900.txt) |
| 452-A2 | 1280x720 | the same record reopened from the roster after Back to records | `c4-isf` | as 452-A1 → `[data-record-close]` → press the row again | [png](renders/before/452-A2-1280x720.png) · [txt](renders/before/452-A2-1280x720.txt) | [png](renders/after/452-A2-1280x720.png) · [txt](renders/after/452-A2-1280x720.txt) |
| 452-A2 | 1440x900 | the same record reopened from the roster after Back to records | `c4-isf` | as 452-A1 → `[data-record-close]` → press the row again | [png](renders/before/452-A2-1440x900.png) · [txt](renders/before/452-A2-1440x900.txt) | [png](renders/after/452-A2-1440x900.png) · [txt](renders/after/452-A2-1440x900.txt) |

### What the pair shows

Both trees open the same record, `record:trial:isf-all-20240601000000` ("Correction factor · 1
U : 40 mg/dL → 1 U : 44 mg/dL", expired unreviewed), with its Later conclusion form. In 452-A1
the Later conclusion field is focused with a conclusion typed and not saved. The `.txt` does
not carry a field's value, and the render shows "Synthetic observation typed before leaving"
in the form on both trees. After Back to records and a second press of the row (452-A2), the
base capture note records the form holding "Synthetic observation typed before leaving" and
the trunk note records it holding "" (empty). The other lines that differ between the trees
come from other release changes, not this one (this change touches no case recipe and no
served word): the trunk store reads data to Jun 29, 2024 · 00:00 where base reads to Jul 1,
2024 · 23:55, so its Trial-period counts, its readiness line ("27 of 30 …", "Not met — still
collecting.") and its Recorded stamps differ, and trunk prints "Recorded · Unclear" where base
prints "Recorded · unclear". Each tree's text is the same at both sizes apart from the header
line.

## Logs

Each leg's commit is the one its coordinator run transcript printed first (`prep <tree>
<oid>`, and `prep base-b03431d2 b03431d2` after the `overlay:` lines for a base leg); those
transcripts are not kept in this folder.

| File | Leg | Commit |
| --- | --- | --- |
| `logs/452-branch-1280x720.log` | branch replay of S52, S54b, S57, S92, S94, S105, S110, S112, S142, S143, S180, S53 and R17 at 1280x720 (superseded by `452b`) | `560098de` |
| `logs/452-branch-1440x900.log` | the same at 1440x900 (superseded by `452b`) | `560098de` |
| `logs/452-desk-named.log` | desk browser test "an expired Trial distinguishes its Later conclusion input…" at both sizes (superseded by `452b`) | `560098de` |
| `logs/452-base-1280x720.log` | the same 13 stories on base with the branch harness laid over it, 1280x720 | `b03431d2` |
| `logs/452-base-1440x900.log` | the same at 1440x900 | `b03431d2` |
| `logs/452b-branch-1280x720.log` | branch replay of the same 13 stories at 1280x720, after the review fix | `cd392553` |
| `logs/452b-branch-1440x900.log` | the same at 1440x900 | `cd392553` |
| `logs/452b-desk-named.log` | desk browser test "an expired Trial distinguishes its Later conclusion input…" at both sizes | `cd392553` |
