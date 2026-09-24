# #426 before/after renders

Synthetic before/after renders for #426: Day and Changes print served names instead of internal ids.

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

Not captured separately: the Changes-record and utility doors into Day, which print the same "Opened from" line as the two doors shown here.

| Shot | Size | State | Store | Route | Before | After |
|---|---|---|---|---|---|---|
| 426-A1 | 1280x720 | Day "Opened from" a Diagnose occurrence + Episode Log row endings | `showcase` | Over-treated low → 1st Occurrence → Open in Day | [png](before/426-A1-1280x720.png) · [txt](before/426-A1-1280x720.txt) | [png](after/426-A1-1280x720.png) · [txt](after/426-A1-1280x720.txt) |
| 426-A1 | 1440x900 | Day "Opened from" a Diagnose occurrence + Episode Log row endings | `showcase` | Over-treated low → 1st Occurrence → Open in Day | [png](before/426-A1-1440x900.png) · [txt](before/426-A1-1440x900.txt) | [png](after/426-A1-1440x900.png) · [txt](after/426-A1-1440x900.txt) |
| 426-B1 | 1280x720 | Day "Opened from" a basal slot with no case | `showcase` | 24 h → 12:30 slot → 1st night → Open in Day | [png](before/426-B1-1280x720.png) · [txt](before/426-B1-1280x720.txt) | [png](after/426-B1-1280x720.png) · [txt](after/426-B1-1280x720.txt) |
| 426-B1 | 1440x900 | Day "Opened from" a basal slot with no case | `showcase` | 24 h → 12:30 slot → 1st night → Open in Day | [png](before/426-B1-1440x900.png) · [txt](before/426-B1-1440x900.txt) | [png](after/426-B1-1440x900.png) · [txt](after/426-B1-1440x900.txt) |
| 426-C1 | 1280x720 | Focus record: What changed + unavailable-context reason | `c4-history` | /changes?subject=history&occurrence=record:focus:1 | [png](before/426-C1-1280x720.png) · [txt](before/426-C1-1280x720.txt) | [png](after/426-C1-1280x720.png) · [txt](after/426-C1-1280x720.txt) |
| 426-C1 | 1440x900 | Focus record: What changed + unavailable-context reason | `c4-history` | /changes?subject=history&occurrence=record:focus:1 | [png](before/426-C1-1440x900.png) · [txt](before/426-C1-1440x900.txt) | [png](after/426-C1-1440x900.png) · [txt](after/426-C1-1440x900.txt) |
| 426-D1 | 1280x720 | Pattern concern in Changes: member table, Action figure | `pattern-near-tie` | Changes (selected concern Highs after meals) | [png](before/426-D1-1280x720.png) · [txt](before/426-D1-1280x720.txt) | [png](after/426-D1-1280x720.png) · [txt](after/426-D1-1280x720.txt) |
| 426-D1 | 1440x900 | Pattern concern in Changes: member table, Action figure | `pattern-near-tie` | Changes (selected concern Highs after meals) | [png](before/426-D1-1440x900.png) · [txt](before/426-D1-1440x900.txt) | [png](after/426-D1-1440x900.png) · [txt](after/426-D1-1440x900.txt) |

## What the pair shows

Before: Opened from reads "finding:over_treated_low" and "basal:750". A Focus record reads "The intended behavior: late_bolus" and "unavailable: not_recorded". The Pattern concern's table and Action figure read "habit:carb_undercount" and "setting:carb_ratio". After: "Over-treated low" and "Basal · 12:30–13:00"; Episode Log rows end with the cause's name; the record reads "Highs after meals", "not recorded" and "Recorded by Harmonic"; and the table reads "Carb undercount" and "Carb ratio".
