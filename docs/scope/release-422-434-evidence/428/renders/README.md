# #428 before/after renders

Synthetic before/after renders for #428: the Diagnose address names the case on screen.

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

The address each shot was taken at is on the `URL:` line of its `.txt`.

| Shot | Size | State | Store | Route | Before | After |
|---|---|---|---|---|---|---|
| 428-A1 | 1280x720 | drilled case with an Occurrence held (URL in .txt) | `showcase` | Over-treated low → 2nd Occurrence | [png](before/428-A1-1280x720.png) · [txt](before/428-A1-1280x720.txt) | [png](after/428-A1-1280x720.png) · [txt](after/428-A1-1280x720.txt) |
| 428-A1 | 1440x900 | drilled case with an Occurrence held (URL in .txt) | `showcase` | Over-treated low → 2nd Occurrence | [png](before/428-A1-1440x900.png) · [txt](before/428-A1-1440x900.txt) | [png](after/428-A1-1440x900.png) · [txt](after/428-A1-1440x900.txt) |
| 428-A2 | 1280x720 | the same address after a reload | `showcase` | reload | [png](before/428-A2-1280x720.png) · [txt](before/428-A2-1280x720.txt) | [png](after/428-A2-1280x720.png) · [txt](after/428-A2-1280x720.txt) |
| 428-A2 | 1440x900 | the same address after a reload | `showcase` | reload | [png](before/428-A2-1440x900.png) · [txt](before/428-A2-1440x900.txt) | [png](after/428-A2-1440x900.png) · [txt](after/428-A2-1440x900.txt) |

## What the pair shows

Before: with Over-treated low drilled and an Occurrence held, the address stays `/diagnose`, and a reload lands on the Findings rail. After: the address names the Finding and the held Occurrence (`/diagnose?subject=finding:over_treated_low&occurrence=…`), and a reload reopens that case with the Occurrence held.
