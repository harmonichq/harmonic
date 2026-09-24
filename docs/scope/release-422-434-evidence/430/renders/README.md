# #430 before/after renders

Synthetic before/after renders for #430: an open change record loads its comparison.

- **Before**: base `a4d374a7` (origin/main before the release).
- **After**: release trunk `caaca050`.
- **Owed by**: the lock's tasks.md 5.3 (the open c3-trial record, the unavailable edit-chain record, the ended c3-history record).
- **How**: both trees were served with AGENTS.md's QA copy-then-serve command
  (`uv run harmonic serve --no-fetch --token '' --db <scratch copy> --port 8791`). The
  data is the committed showcase or a named case store emitted by that tree's own
  `scripts/gen_qa_e2e_db.py --case <name>`, followed by the replay case server's
  `reconcile_ingested_follow_up` step. Chromium used the dark scheme, the desk's only
  theme. The same interaction path produced each before and after.
- **Files**: each `.png` is the render. Each `.txt` beside it holds the page's visible
  text, the address, and the capture note.

In the after shot of the open c3-trial record, the chart shows Retained context pressed and the chart mounted in its paired state. That store serves one half-hour per period, so no line is visible; the periods and outcome tables carry the comparison.

| Shot | Size | State | Store | Route | Before | After |
|---|---|---|---|---|---|---|
| 430-A1 | 1280x720 | the open c3-trial record | `c3-trial` | Changes history → first open record | [png](before/430-A1-1280x720.png) · [txt](before/430-A1-1280x720.txt) | [png](after/430-A1-1280x720.png) · [txt](after/430-A1-1280x720.txt) |
| 430-A1 | 1440x900 | the open c3-trial record | `c3-trial` | Changes history → first open record | [png](before/430-A1-1440x900.png) · [txt](before/430-A1-1440x900.txt) | [png](after/430-A1-1440x900.png) · [txt](after/430-A1-1440x900.txt) |
| 430-B1 | 1280x720 | the unavailable edit-chain record | `edit-chain` | Changes history → first open record | [png](before/430-B1-1280x720.png) · [txt](before/430-B1-1280x720.txt) | [png](after/430-B1-1280x720.png) · [txt](after/430-B1-1280x720.txt) |
| 430-B1 | 1440x900 | the unavailable edit-chain record | `edit-chain` | Changes history → first open record | [png](before/430-B1-1440x900.png) · [txt](before/430-B1-1440x900.txt) | [png](after/430-B1-1440x900.png) · [txt](after/430-B1-1440x900.txt) |
| 430-C1 | 1280x720 | the ended c3-history record | `c3-history` | Changes history → the user-finished record | [png](before/430-C1-1280x720.png) · [txt](before/430-C1-1280x720.txt) | [png](after/430-C1-1280x720.png) · [txt](after/430-C1-1280x720.txt) |
| 430-C1 | 1440x900 | the ended c3-history record | `c3-history` | Changes history → the user-finished record | [png](before/430-C1-1440x900.png) · [txt](before/430-C1-1440x900.txt) | [png](after/430-C1-1440x900.png) · [txt](after/430-C1-1440x900.txt) |

## What the pair shows

Before: an open record opens on its Original read: an empty chart reading "no clock envelope is retained for this record · 0 → 0 half-hours read" and "No glucose outcome is served", even where a comparison exists. After: the open c3-trial record opens on its retained comparison, with Before and Trial periods and outcome tables. The edit-chain record names why its comparison is unavailable, in words, and mounts no chart. The "First seen" row reads "Recorded by Harmonic".
