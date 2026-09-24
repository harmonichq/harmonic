# #432 before/after renders

Synthetic before/after renders for #432: a meal Occurrence reads as its own facts and served reason.

- **Before**: base `a4d374a7` (origin/main before the release).
- **After**: release trunk `caaca050`.
- **Owed by**: the lock's design.md render matrix (the Meal bolus short roster, its selected matched meal, an Over-treated low selected detail, and the Highs after meals Pattern roster and selection on pattern-near-tie).
- **How**: both trees were served with AGENTS.md's QA copy-then-serve command
  (`uv run harmonic serve --no-fetch --token '' --db <scratch copy> --port 8791`). The
  data is the committed showcase or a named case store emitted by that tree's own
  `scripts/gen_qa_e2e_db.py --case <name>`, followed by the replay case server's
  `reconcile_ingested_follow_up` step. Chromium used the dark scheme, the desk's only
  theme. The same interaction path produced each before and after.
- **Files**: each `.png` is the render. Each `.txt` beside it holds the page's visible
  text, the address, and the capture note.

In the detail shots the reading pane is scrolled to its end, so the selected Occurrence's facts, reason and foot are all on screen. The after shots were re-taken, with that scroll added, once the trunk had moved to 9bf9d6e2; their `.txt` headers name that commit. caaca050..9bf9d6e2 changes only OpenSpec, docs, the desk ledger and its counts, and AGENTS.md, with no path under frontend/, ciq_autotune/ or scripts/. The served shell was the one built at caaca050, so the app shown is the one at caaca050.

| Shot | Size | State | Store | Route | Before | After |
|---|---|---|---|---|---|---|
| 432-A1 | 1280x720 | Meal bolus fell short roster | `showcase` | Diagnose → 24 h → Meal bolus fell short | [png](before/432-A1-1280x720.png) · [txt](before/432-A1-1280x720.txt) | [png](after/432-A1-1280x720.png) · [txt](after/432-A1-1280x720.txt) |
| 432-A1 | 1440x900 | Meal bolus fell short roster | `showcase` | Diagnose → 24 h → Meal bolus fell short | [png](before/432-A1-1440x900.png) · [txt](before/432-A1-1440x900.txt) | [png](after/432-A1-1440x900.png) · [txt](after/432-A1-1440x900.txt) |
| 432-B1 | 1280x720 | its matched meal selected (detail) | `showcase` | … → first (Matched) Occurrence | [png](before/432-B1-1280x720.png) · [txt](before/432-B1-1280x720.txt) | [png](after/432-B1-1280x720.png) · [txt](after/432-B1-1280x720.txt) |
| 432-B1 | 1440x900 | its matched meal selected (detail) | `showcase` | … → first (Matched) Occurrence | [png](before/432-B1-1440x900.png) · [txt](before/432-B1-1440x900.txt) | [png](after/432-B1-1440x900.png) · [txt](after/432-B1-1440x900.txt) |
| 432-C1 | 1280x720 | Over-treated low selected (detail) | `showcase` | Over-treated low → first Occurrence | [png](before/432-C1-1280x720.png) · [txt](before/432-C1-1280x720.txt) | [png](after/432-C1-1280x720.png) · [txt](after/432-C1-1280x720.txt) |
| 432-C1 | 1440x900 | Over-treated low selected (detail) | `showcase` | Over-treated low → first Occurrence | [png](before/432-C1-1440x900.png) · [txt](before/432-C1-1440x900.txt) | [png](after/432-C1-1440x900.png) · [txt](after/432-C1-1440x900.txt) |
| 432-D1 | 1280x720 | Highs after meals Pattern roster | `pattern-near-tie` | Diagnose → 24 h → Highs after meals | [png](before/432-D1-1280x720.png) · [txt](before/432-D1-1280x720.txt) | [png](after/432-D1-1280x720.png) · [txt](after/432-D1-1280x720.txt) |
| 432-D1 | 1440x900 | Highs after meals Pattern roster | `pattern-near-tie` | Diagnose → 24 h → Highs after meals | [png](before/432-D1-1440x900.png) · [txt](before/432-D1-1440x900.txt) | [png](after/432-D1-1440x900.png) · [txt](after/432-D1-1440x900.txt) |
| 432-E1 | 1280x720 | its first Occurrence selected (detail) | `pattern-near-tie` | … → first Occurrence | [png](before/432-E1-1280x720.png) · [txt](before/432-E1-1280x720.txt) | [png](after/432-E1-1280x720.png) · [txt](after/432-E1-1280x720.txt) |
| 432-E1 | 1440x900 | its first Occurrence selected (detail) | `pattern-near-tie` | … → first Occurrence | [png](before/432-E1-1440x900.png) · [txt](before/432-E1-1440x900.txt) | [png](after/432-E1-1440x900.png) · [txt](after/432-E1-1440x900.txt) |

## What the pair shows

Before: every meal row reads "— · Completed carb bolus". A selected meal shows a dash, "The canvas shows the selected glucose trace…", and "N glucose readings / N event markers". After: rows read their carbs, dose and peak ("60 g · 5 U · peak 265", "52 g · 7.4 U · peak 238"). A selected meal shows its peak and time after the bolus, the Finding that claims it with the analyzer's sentence, and each habit's verdict. The Over-treated low detail shows its attribution and verdict sentences.
