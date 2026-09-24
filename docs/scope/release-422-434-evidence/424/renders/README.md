# #424 before/after renders

Synthetic before/after renders for #424: Highs after meals counts add up and name their cohorts.

- **Before**: base `a4d374a7` (origin/main before the release).
- **After**: release trunk `caaca050`.
- **Owed by**: the lock's revision evidence (f): three states, two sizes, base and branch.
- **How**: both trees were served with AGENTS.md's QA copy-then-serve command
  (`uv run harmonic serve --no-fetch --token '' --db <scratch copy> --port 8791`). The
  data is the committed showcase or a named case store emitted by that tree's own
  `scripts/gen_qa_e2e_db.py --case <name>`, followed by the replay case server's
  `reconcile_ingested_follow_up` step. Chromium used the dark scheme, the desk's only
  theme. The same interaction path produced each before and after.
- **Files**: each `.png` is the render. Each `.txt` beside it holds the page's visible
  text, the address, and the capture note.

The coordinator's replay captures of the same three states (`../app-S124-*`, `../app-S125-*`, `../app-S126-*`, branch 5b7a4bc6) stay alongside. These pairs come from one driver on base and on the final trunk.

| Shot | Size | State | Store | Route | Before | After |
|---|---|---|---|---|---|---|
| 424-A1 | 1280x720 | Highs after meals caption (S124 state) | `behavioral-carb-undercount` | Diagnose → 24 h → Highs after meals | [png](before/424-A1-1280x720.png) · [txt](before/424-A1-1280x720.txt) | [png](after/424-A1-1280x720.png) · [txt](after/424-A1-1280x720.txt) |
| 424-A1 | 1440x900 | Highs after meals caption (S124 state) | `behavioral-carb-undercount` | Diagnose → 24 h → Highs after meals | [png](before/424-A1-1440x900.png) · [txt](before/424-A1-1440x900.txt) | [png](after/424-A1-1440x900.png) · [txt](after/424-A1-1440x900.txt) |
| 424-B1 | 1280x720 | Missed / unannounced meal caption (S125 state) | `behavioral-missed-meal` | Diagnose → 24 h → Missed meal | [png](before/424-B1-1280x720.png) · [txt](before/424-B1-1280x720.txt) | [png](after/424-B1-1280x720.png) · [txt](after/424-B1-1280x720.txt) |
| 424-B1 | 1440x900 | Missed / unannounced meal caption (S125 state) | `behavioral-missed-meal` | Diagnose → 24 h → Missed meal | [png](before/424-B1-1440x900.png) · [txt](before/424-B1-1440x900.txt) | [png](after/424-B1-1440x900.png) · [txt](after/424-B1-1440x900.txt) |
| 424-C1 | 1280x720 | open Lows after correcting highs fold (S126 state) | `behavioral-correction-stacking` | Diagnose → 24 h → open the Pattern fold | [png](before/424-C1-1280x720.png) · [txt](before/424-C1-1280x720.txt) | [png](after/424-C1-1280x720.png) · [txt](after/424-C1-1280x720.txt) |
| 424-C1 | 1440x900 | open Lows after correcting highs fold (S126 state) | `behavioral-correction-stacking` | Diagnose → 24 h → open the Pattern fold | [png](before/424-C1-1440x900.png) · [txt](before/424-C1-1440x900.txt) | [png](after/424-C1-1440x900.png) · [txt](after/424-C1-1440x900.txt) |

## What the pair shows

Before: the captions read "3 matched · 1 nearly matched · 2 comparison · 2 not comparable", which counts the comparison group twice, and the fold shows only the cause's own count. After: "3 Matched (meets criteria) · 1 Nearly matched (borderline) · 2 Other meal opportunities"; the missed-meal case names "3 highs outside the comparison"; and Correction stacking's fold line leads with "2 of 2 lows", with its correction-cluster count set apart as outside the count.
