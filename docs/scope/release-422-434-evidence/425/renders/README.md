# #425 before/after renders

Synthetic before/after renders for #425: Day counts each recorded day once.

- **Before**: base `a4d374a7` (origin/main before the release).
- **After**: release trunk `caaca050`.
- **Owed by**: the charter: a `revise` surface owes before/after renders of every affected state (CHARTER.md, ui-craft revise).
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
| 425-A1 | 1280x720 | Day rail count + month head, arrival month | `showcase` | Day → Month | [png](before/425-A1-1280x720.png) · [txt](before/425-A1-1280x720.txt) | [png](after/425-A1-1280x720.png) · [txt](after/425-A1-1280x720.txt) |
| 425-A1 | 1440x900 | Day rail count + month head, arrival month | `showcase` | Day → Month | [png](before/425-A1-1440x900.png) · [txt](before/425-A1-1440x900.txt) | [png](after/425-A1-1440x900.png) · [txt](after/425-A1-1440x900.txt) |
| 425-A2 | 1280x720 | same after paging to the earlier month | `showcase` | … → previous month | [png](before/425-A2-1280x720.png) · [txt](before/425-A2-1280x720.txt) | [png](after/425-A2-1280x720.png) · [txt](after/425-A2-1280x720.txt) |
| 425-A2 | 1440x900 | same after paging to the earlier month | `showcase` | … → previous month | [png](before/425-A2-1440x900.png) · [txt](before/425-A2-1440x900.txt) | [png](after/425-A2-1440x900.png) · [txt](after/425-A2-1440x900.txt) |
| 425-A3 | 1280x720 | same after paging back | `showcase` | … → next month | [png](before/425-A3-1280x720.png) · [txt](before/425-A3-1280x720.txt) | [png](after/425-A3-1280x720.png) · [txt](after/425-A3-1280x720.txt) |
| 425-A3 | 1440x900 | same after paging back | `showcase` | … → next month | [png](before/425-A3-1440x900.png) · [txt](before/425-A3-1440x900.txt) | [png](after/425-A3-1440x900.png) · [txt](after/425-A3-1440x900.txt) |

## What the pair shows

Before: the rail reads 30 recorded days on arrival and 42 after paging to May; on paging back it stays at 42 and June's head reads 37 instead of 30. After: the rail reads 35 recorded days throughout, the served count of days with glucose data. May's head reads 5, and June's head reads 30 both times.
