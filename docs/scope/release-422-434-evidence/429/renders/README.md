# #429 before/after renders

Synthetic before/after renders for #429: the watch dock names Changes and opens the watched record.

- **Before**: base `a4d374a7` (origin/main before the release).
- **After**: release trunk `caaca050`.
- **Owed by**: the lock (the dock, `.inspector > .watch`, on c3-trial and c3-focus, base and branch, both sizes).
- **How**: both trees were served with AGENTS.md's QA copy-then-serve command
  (`uv run harmonic serve --no-fetch --token '' --db <scratch copy> --port 8791`). The
  data is the committed showcase or a named case store emitted by that tree's own
  `scripts/gen_qa_e2e_db.py --case <name>`, followed by the replay case server's
  `reconcile_ingested_follow_up` step. Chromium used the dark scheme, the desk's only
  theme. The same interaction path produced each before and after.
- **Files**: each `.png` is the render. Each `.txt` beside it holds the page's visible
  text, the address, and the capture note.

| Shot | Size | State | Store | Route | Before | After |
|---|---|---|---|---|---|---|
| 429-A1 | 1280x720 | watch dock, watched Trial | `c3-trial` | Diagnose; crop `.inspector > .watch` | [png](before/429-A1-1280x720.png) · [txt](before/429-A1-1280x720.txt) | [png](after/429-A1-1280x720.png) · [txt](after/429-A1-1280x720.txt) |
| 429-A1 | 1440x900 | watch dock, watched Trial | `c3-trial` | Diagnose; crop `.inspector > .watch` | [png](before/429-A1-1440x900.png) · [txt](before/429-A1-1440x900.txt) | [png](after/429-A1-1440x900.png) · [txt](after/429-A1-1440x900.txt) |
| 429-B1 | 1280x720 | watch dock, watched Focus | `c3-focus` | Diagnose; crop `.inspector > .watch` | [png](before/429-B1-1280x720.png) · [txt](before/429-B1-1280x720.txt) | [png](after/429-B1-1280x720.png) · [txt](after/429-B1-1280x720.txt) |
| 429-B1 | 1440x900 | watch dock, watched Focus | `c3-focus` | Diagnose; crop `.inspector > .watch` | [png](before/429-B1-1440x900.png) · [txt](before/429-B1-1440x900.txt) | [png](after/429-B1-1440x900.png) · [txt](after/429-B1-1440x900.txt) |

## What the pair shows

Before: both docks offer "Open Verify ›", and the Focus line says outcomes "are read on Verify". After: both offer "Open Changes ›". The Focus line reads "adherence and outcome are read in Changes" and wraps inside the dock, never ellipsized.
