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
| `replay.revision.1280x720.txt` | the new stories on the revision, `VIEWPORT=1280x720` |
| `replay.revision.1440x900.txt` | the new stories on the revision, `VIEWPORT=1440x900` |
| `replay.base.1280x720.txt` | the base, with this branch's replay harness laid over it, `VIEWPORT=1280x720` (fail-first: each story fails at its feature assertion, not at setup) |
| `replay.base.1440x900.txt` | the same at `VIEWPORT=1440x900` |
| `replay.touched.<viewport>.txt` | the stories the amendment touched but did not add, on the revision (`ONLY=S98`), one file per viewport |

The complete ledger runs once per viewport on the pushed commit. That run's
output belongs to the release evidence, not to this directory.

## Renders

These are synthetic captures of the carb-ratio block, opened from its
whole-day queue row. They are taken after the console, request, accessibility
and overflow checks pass.

| File | State |
|---|---|
| `renders/base/block-panel.1280x720.png` | the block's panel on the base |
| `renders/base/block-panel.1440x900.png` | the same at 1440x900 |
| `renders/base/block-tile.1280x720.png` | the block's tile on the base, in its default view |
| `renders/base/block-tile.1440x900.png` | the same at 1440x900 |
| `renders/revision/block-panel.1280x720.png` | the block's panel on the revision: Why this move, The case against, and the lows |
| `renders/revision/block-panel.1440x900.png` | the same at 1440x900 |
| `renders/revision/block-tile.1280x720.png` | the block's tile on the revision: its one view, the ratio strip over the runs by date |
| `renders/revision/block-tile.1440x900.png` | the same at 1440x900 |
