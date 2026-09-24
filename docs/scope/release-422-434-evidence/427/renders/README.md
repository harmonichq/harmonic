# #427 before/after renders

Synthetic before/after renders for #427: the Day header's viewed time is the reader's own clock.

- **Before**: base `a4d374a7` (origin/main before the release).
- **After**: release trunk `caaca050`.
- **Owed by**: the lock's tasks.md 5.2 (the Day header, kicker and Episode Log meta, in a non-UTC browser zone). That task names the change's evidence folder; the coordinator notes this folder in the pull request.
- **How**: both trees were served with AGENTS.md's QA copy-then-serve command
  (`uv run harmonic serve --no-fetch --token '' --db <scratch copy> --port 8791`). The
  data is the committed showcase or a named case store emitted by that tree's own
  `scripts/gen_qa_e2e_db.py --case <name>`, followed by the replay case server's
  `reconcile_ingested_follow_up` step. Chromium used the dark scheme, the desk's only
  theme. The same interaction path produced each before and after.
- **Files**: each `.png` is the render. Each `.txt` beside it holds the page's visible
  text, the address, and the capture note.

Both sides were rendered with the browser zone set to America/Denver and the clock fixed at Sep 23, 2026 21:30 local time (03:30 UTC on Sep 24).

| Shot | Size | State | Store | Route | Before | After |
|---|---|---|---|---|---|---|
| 427-A1 | 1280x720 | Day header kicker + Episode Log meta, non-UTC zone | `showcase` | Day; zone America/Denver, clock 2026-09-23 21:30 local | [png](before/427-A1-1280x720.png) · [txt](before/427-A1-1280x720.txt) | [png](after/427-A1-1280x720.png) · [txt](after/427-A1-1280x720.txt) |
| 427-A1 | 1440x900 | Day header kicker + Episode Log meta, non-UTC zone | `showcase` | Day; zone America/Denver, clock 2026-09-23 21:30 local | [png](before/427-A1-1440x900.png) · [txt](before/427-A1-1440x900.txt) | [png](after/427-A1-1440x900.png) · [txt](after/427-A1-1440x900.txt) |

## What the pair shows

Before: the kicker and the Episode Log meta read "viewed Sep 24, 2026 · 03:30", the UTC time printed as if it were local. After: both read "viewed Sep 23, 2026 · 21:30".
