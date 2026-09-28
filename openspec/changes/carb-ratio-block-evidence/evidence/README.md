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
ONLY=S186,S187,S188,S189,S190,S191,S192,S193,S194,S195,S196
```

Each file keeps the runner's summary line (`# executed … · failed … · selected
…`) and its PASS or FAIL line per story, unedited.

| File | Run |
|---|---|
| `replay-1280x720.txt` | the first run of all eleven stories, on bdc6de49, `VIEWPORT=1280x720`: 8 of 11 passed; S189, S192 and S193 failed |
| `replay-1440x900.txt` | the same run at `VIEWPORT=1440x900`: 9 of 11 passed; S192 and S193 failed |
| `replay-S189-1280x720.txt` | S189 after the tile's keyboard-readout fixes, `VIEWPORT=1280x720`: 1 of 1 passed |
| `replay-S189-1440x900.txt` | the same at `VIEWPORT=1440x900`: 1 of 1 passed |
| `replay-S192-S193-1280x720.txt` | S192 and S193 as amended, `VIEWPORT=1280x720`: 2 of 2 passed |
| `replay-S192-S193-1440x900.txt` | the same at `VIEWPORT=1440x900`: 2 of 2 passed |

Final outcome: all eleven stories pass at both viewports. S186–S188, S190,
S191 and S194–S196 pass in the first run. S189 passes in its own run.

S189's first-run failure at 1280x720 was a tile defect, and the tile was fixed.
The first ArrowRight read out 2024-05-07 while the cursor held 2024-05-03.

S192 and S193 pass in their own run. Their first-run failures were a replay
defect: the first version required a pressed Episode Log row, and Day lists
none for a harm-listed low. Both stories were amended, and the amended stories
pass. The ledger's status line on each story names the file that shows its
final result.

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
