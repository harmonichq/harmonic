# #434 before/after renders

Synthetic before/after renders for #434: a basal slot says why each excluded night was left out.

- **Before**: base `a4d374a7` (origin/main before the release).
- **After**: release trunk `caaca050`.
- **Owed by**: the lock's coordinator leg (e): the S154 slot's tile and panel, base and branch, both sizes.
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
| 434-A1 | 1280x720 | 12:30 slot: focal tile and panel | `showcase` | 24 h → 12:30 slot | [png](before/434-A1-1280x720.png) · [txt](before/434-A1-1280x720.txt) | [png](after/434-A1-1280x720.png) · [txt](after/434-A1-1280x720.txt) |
| 434-A1 | 1440x900 | 12:30 slot: focal tile and panel | `showcase` | 24 h → 12:30 slot | [png](before/434-A1-1440x900.png) · [txt](before/434-A1-1440x900.txt) | [png](after/434-A1-1440x900.png) · [txt](after/434-A1-1440x900.txt) |
| 434-A2 | 1280x720 | panel scrolled to the excluded-night line | `showcase` | as 434-A1; scroll the line into view | [png](before/434-A2-1280x720.png) · [txt](before/434-A2-1280x720.txt) | [png](after/434-A2-1280x720.png) · [txt](after/434-A2-1280x720.txt) |
| 434-A2 | 1440x900 | panel scrolled to the excluded-night line | `showcase` | as 434-A1; scroll the line into view | [png](before/434-A2-1440x900.png) · [txt](before/434-A2-1440x900.txt) | [png](after/434-A2-1440x900.png) · [txt](after/434-A2-1440x900.txt) |

## What the pair shows

Before: the 12:30 slot's tile reads "3 excluded — not steady" and its panel reads "3 excluded nights". After: the tile lists "3 excluded", then "1 insulin on board" and "2 other reasons" on their own rows, and the panel reads "3 excluded nights: 1 insulin on board, 2 other reasons".
