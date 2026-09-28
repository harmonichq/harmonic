# #464 evidence

This directory holds the replay output and renders for tasks 17 and 18. The
coordinator captures all of it, because the worker sandbox cannot launch a
browser. Every input is synthetic: the `ic-block-evidence` case store, served
through AGENTS.md's QA copy-then-serve command with `--no-fetch` and
`--token ''`. It is emitted by:

```sh
uv run python scripts/gen_qa_e2e_db.py --case ic-block-evidence --out <scratch path>
```

No snapshot-derived value appears in any file here.

"Base" means the ticket's base on main (the merge base of this branch with
`origin/main`, 59fa4737 when this README was written); whoever captures a base
file records the exact SHA they used in its first line. "Revision" means the
branch commit that will be pushed.

## Replay output

This is raw stdout of `node frontend/desk-behavior.replay.mjs` with
`TARGET=app`, `CASE_STORE_DIR` set, and:

```sh
ONLY=S197,S198,S199,S200,S201,S202,S203,S204,S205,S206,S207
```

Each file keeps the runner's summary line (`# executed … · failed … · selected
…`) and its PASS or FAIL line per story, unedited.

The raw replay outputs recorded before this branch merged `origin/main` print
the pre-merge ids S186–S196, which are S197–S207 after it (S186 is S197, and so
on in order, which is why the `replay-S189-*` and `replay-S192-S193-*` files
hold S200 and S203–S204), and the final run on the merged tree prints the new
ids.

| File | Run |
|---|---|
| `replay-1280x720.txt` | the first run of all eleven stories, on bdc6de49, `VIEWPORT=1280x720`: 8 of 11 passed; S200, S203 and S204 failed |
| `replay-1440x900.txt` | the same run at `VIEWPORT=1440x900`: 9 of 11 passed; S203 and S204 failed |
| `replay-S189-1280x720.txt` | S200 after the tile's keyboard-readout fixes, `VIEWPORT=1280x720`: 1 of 1 passed |
| `replay-S189-1440x900.txt` | the same at `VIEWPORT=1440x900`: 1 of 1 passed |
| `replay-S192-S193-1280x720.txt` | S203 and S204 as amended, `VIEWPORT=1280x720`: 2 of 2 passed |
| `replay-S192-S193-1440x900.txt` | the same at `VIEWPORT=1440x900`: 2 of 2 passed |
| `replay-final-1280x720.txt` | all eleven stories on the final code commit 8ccd68cf, after the whole-diff review's fixes, `VIEWPORT=1280x720`: 11 of 11 passed |
| `replay-final-1440x900.txt` | the same at `VIEWPORT=1440x900`: 11 of 11 passed |

Final outcome: all eleven stories pass at both viewports. S197–S199, S201,
S202 and S205–S207 pass in the first run. S200 passes in its own run.

S200's first-run failure at 1280x720 was a tile defect, and the tile was fixed.
The first ArrowRight read out 2024-05-07 while the cursor held 2024-05-03.

S203 and S204 pass in their own run. Their first-run failures were a replay
defect: the first version required a pressed Episode Log row, and Day lists
none for a harm-listed low. Both stories were amended, and the amended stories
pass. The ledger's status line on each story names the file that shows its
final result.

## Full verification

`verification/` holds the work order's Verification block run once, serially,
on the commit named in its `summary.txt`: one file per leg with the raw output,
and `summary.txt` with each leg's exit code and wall time. The whole pytest ran
with `--durations=5` and the focused QA suite with `--durations=3`, which is
where `coverage-appendix.md`'s final budget column reads from.

## Browser suites

These are the two hand-listed suites, run exactly as CI runs them, with the
raw output unedited.

| File | Suite | Result |
|---|---|---|
| `browser-runner.browser.txt` | `frontend/browser-runner.browser.test.mjs` | 1 of 1 passed |
| `desk.browser.txt` | `frontend/desk.browser.test.mjs` | 46 of 46 passed |

The complete ledger runs once per viewport on the pushed commit. That run's
output belongs to the release evidence, not to this directory.

## Renders

These are synthetic captures of the `ic-block-evidence` case at both locked
viewports. The base is the tree before the settled design; the revision is the
branch. Each `checks-<viewport>.txt` holds that capture's console/page-error and
horizontal-overflow checks (0 errors; the page scroll width equals the
viewport width).

| File | State |
|---|---|
| `renders/{base,revision}/desk-<viewport>.png` | the whole-day Diagnose desk: the block's queue row with its mini, and the block's tile on stage |
| `renders/{base,revision}/block-<viewport>.png` | the block opened from its queue row: its tile, and the panel below the numbers block |
| `renders/{base,revision}/tile-<viewport>.png` | the block's tile alone. On the base, this is its default Event view of per-run glucose traces. On the revision, it is the one view: the ratio strip over the runs by date |
| `renders/{base,revision}/panel-<viewport>.png` | the block's panel alone. On the revision, it shows Why this move, The case against and the lows |
| `renders/{base,revision}/checks-<viewport>.txt` | the checks taken with that viewport's captures |

`<viewport>` is `1280x720` or `1440x900`, so each directory holds eight PNGs
and two checks files.
