# #423 before/after renders

Synthetic before/after renders for #423: a claimed low reads as part of the Finding that claimed it.

- **Before**: base `a4d374a7` (origin/main before the release).
- **After**: release trunk `caaca050`.
- **Owed by**: the lock's tasks.md 2.3 (the Episode Log at rest and pressed, the Glossary opened from a caption, and Diagnose's claimed label).
- **How**: both trees were served with AGENTS.md's QA copy-then-serve command
  (`uv run harmonic serve --no-fetch --token '' --db <scratch copy> --port 8791`). The
  data is the committed showcase or a named case store emitted by that tree's own
  `scripts/gen_qa_e2e_db.py --case <name>`, followed by the replay case server's
  `reconcile_ingested_follow_up` step. Chromium used the dark scheme, the desk's only
  theme. The same interaction path produced each before and after.
- **Files**: each `.png` is the render. Each `.txt` beside it holds the page's visible
  text, the address, and the capture note.

No ring or hairline capture is taken, as the lock requires: on this store those marks sit before the Day axis. The pressed-row captures are cropped to the reading pane. Before has no Glossary control on the caption, so its 423-C1 shows the Glossary opened from the footer, the nearest equivalent.

| Shot | Size | State | Store | Route | Before | After |
|---|---|---|---|---|---|---|
| 423-A1 | 1280x720 | Day Episode Log at rest: claimed row, tier word, Findings caption | `pattern-near-tie` | Day → Month → pick 2024-05-25 | [png](before/423-A1-1280x720.png) · [txt](before/423-A1-1280x720.txt) | [png](after/423-A1-1280x720.png) · [txt](after/423-A1-1280x720.txt) |
| 423-A1 | 1440x900 | Day Episode Log at rest: claimed row, tier word, Findings caption | `pattern-near-tie` | Day → Month → pick 2024-05-25 | [png](before/423-A1-1440x900.png) · [txt](before/423-A1-1440x900.txt) | [png](after/423-A1-1440x900.png) · [txt](after/423-A1-1440x900.txt) |
| 423-A2 | 1280x720 | same, reading pane crop | `pattern-near-tie` | as 423-A1; crop `.gf-reading` | [png](before/423-A2-1280x720.png) · [txt](before/423-A2-1280x720.txt) | [png](after/423-A2-1280x720.png) · [txt](after/423-A2-1280x720.txt) |
| 423-A2 | 1440x900 | same, reading pane crop | `pattern-near-tie` | as 423-A1; crop `.gf-reading` | [png](before/423-A2-1440x900.png) · [txt](before/423-A2-1440x900.txt) | [png](after/423-A2-1440x900.png) · [txt](after/423-A2-1440x900.txt) |
| 423-B1 | 1280x720 | claimed row pressed, cropped to the reading pane | `pattern-near-tie` | as 423-A1; press the outranked row; crop `.gf-reading` | [png](before/423-B1-1280x720.png) · [txt](before/423-B1-1280x720.txt) | [png](after/423-B1-1280x720.png) · [txt](after/423-B1-1280x720.txt) |
| 423-B1 | 1440x900 | claimed row pressed, cropped to the reading pane | `pattern-near-tie` | as 423-A1; press the outranked row; crop `.gf-reading` | [png](before/423-B1-1440x900.png) · [txt](before/423-B1-1440x900.txt) | [png](after/423-B1-1440x900.png) · [txt](after/423-B1-1440x900.txt) |
| 423-C1 | 1280x720 | Glossary opened from the Findings caption | `pattern-near-tie` | as 423-A1; press `[data-log-glossary]` (base: none — footer Glossary, nearest equivalent) | [png](before/423-C1-1280x720.png) · [txt](before/423-C1-1280x720.txt) | [png](after/423-C1-1280x720.png) · [txt](after/423-C1-1280x720.txt) |
| 423-C1 | 1440x900 | Glossary opened from the Findings caption | `pattern-near-tie` | as 423-A1; press `[data-log-glossary]` (base: none — footer Glossary, nearest equivalent) | [png](before/423-C1-1440x900.png) · [txt](before/423-C1-1440x900.txt) | [png](after/423-C1-1440x900.png) · [txt](after/423-C1-1440x900.txt) |
| 423-D1 | 1280x720 | Diagnose Meal over-delivery case file: claimed count label | `behavioral-meal-over-delivery` | Diagnose → 24 h → Meal over-delivery | [png](before/423-D1-1280x720.png) · [txt](before/423-D1-1280x720.txt) | [png](after/423-D1-1280x720.png) · [txt](after/423-D1-1280x720.txt) |
| 423-D1 | 1440x900 | Diagnose Meal over-delivery case file: claimed count label | `behavioral-meal-over-delivery` | Diagnose → 24 h → Meal over-delivery | [png](before/423-D1-1440x900.png) · [txt](before/423-D1-1440x900.txt) | [png](after/423-D1-1440x900.png) · [txt](after/423-D1-1440x900.txt) |

## What the pair shows

Before: the 22:00 low reads OUTRANKED in the warning colour, its row names only the episode's cause, and the caption reads "Findings · 2" (it counts rows). After: the low reads CLAIMED in the Finding's colour, the row names what the low matched (correction on active insulin) and ends with Carb undercount, and the caption reads "Findings · 1 · 1 claimed". Each band caption carries a Glossary control, which opens the Glossary at its new Episode Log group. On Diagnose, "1 claimed by another factor" becomes "1 claimed by another finding".
