# #433 before/after renders

Synthetic before/after renders for #433: the Basal slots strip stays reachable on short desktop windows, and a recurring-lows lower has its own word.

- **Before**: base `a4d374a7` (origin/main before the release).
- **After**: release trunk `caaca050`.
- **Owed by**: the lock's design.md render matrix (the canvas pane at 1200×560, 832×560, 1280×720 and 1440×900, and the recurring-lows lane key at 1280×720). Task 6.2 names this ticket's own evidence folder; the coordinator notes this folder in the pull request.
- **How**: both trees were served with AGENTS.md's QA copy-then-serve command
  (`uv run harmonic serve --no-fetch --token '' --db <scratch copy> --port 8791`). The
  data is the committed showcase or a named case store emitted by that tree's own
  `scripts/gen_qa_e2e_db.py --case <name>`, followed by the replay case server's
  `reconcile_ingested_follow_up` step. Chromium used the dark scheme, the desk's only
  theme. The same interaction path produced each before and after.
- **Files**: each `.png` is the render. Each `.txt` beside it holds the page's visible
  text, the address, and the capture note.

433-A2 is the canvas pane scrolled to its end, at the two short sizes only. 832×720 is a supplementary size: at 832×560 the base strip is clipped away vertically, which hides the key running past the pane's right edge.

| Shot | Size | State | Store | Route | Before | After |
|---|---|---|---|---|---|---|
| 433-A1 | 1200x560 | canvas pane at rest | `basal-verdict-gallery` | Diagnose → 24 h | [png](before/433-A1-1200x560.png) · [txt](before/433-A1-1200x560.txt) | [png](after/433-A1-1200x560.png) · [txt](after/433-A1-1200x560.txt) |
| 433-A1 | 832x560 | canvas pane at rest | `basal-verdict-gallery` | Diagnose → 24 h | [png](before/433-A1-832x560.png) · [txt](before/433-A1-832x560.txt) | [png](after/433-A1-832x560.png) · [txt](after/433-A1-832x560.txt) |
| 433-A1 | 832x720 | canvas pane at rest | `basal-verdict-gallery` | Diagnose → 24 h | [png](before/433-A1-832x720.png) · [txt](before/433-A1-832x720.txt) | [png](after/433-A1-832x720.png) · [txt](after/433-A1-832x720.txt) |
| 433-A1 | 1280x720 | canvas pane at rest | `basal-verdict-gallery` | Diagnose → 24 h | [png](before/433-A1-1280x720.png) · [txt](before/433-A1-1280x720.txt) | [png](after/433-A1-1280x720.png) · [txt](after/433-A1-1280x720.txt) |
| 433-A1 | 1440x900 | canvas pane at rest | `basal-verdict-gallery` | Diagnose → 24 h | [png](before/433-A1-1440x900.png) · [txt](before/433-A1-1440x900.txt) | [png](after/433-A1-1440x900.png) · [txt](after/433-A1-1440x900.txt) |
| 433-A2 | 1200x560 | canvas pane scrolled to its end (short sizes only) | `basal-verdict-gallery` | as 433-A1; scroll `.canvas-pane` | [png](before/433-A2-1200x560.png) · [txt](before/433-A2-1200x560.txt) | [png](after/433-A2-1200x560.png) · [txt](after/433-A2-1200x560.txt) |
| 433-A2 | 832x560 | canvas pane scrolled to its end (short sizes only) | `basal-verdict-gallery` | as 433-A1; scroll `.canvas-pane` | [png](before/433-A2-832x560.png) · [txt](before/433-A2-832x560.txt) | [png](after/433-A2-832x560.png) · [txt](after/433-A2-832x560.txt) |
| 433-B1 | 1280x720 | recurring-lows lane at rest | `basal-recurring-low-no-clean-median` | Diagnose → 24 h | [png](before/433-B1-1280x720.png) · [txt](before/433-B1-1280x720.txt) | [png](after/433-B1-1280x720.png) · [txt](after/433-B1-1280x720.txt) |
| 433-B2 | 1280x720 | Basal slots strip key crop | `basal-recurring-low-no-clean-median` | as 433-B1; crop `#lane-wrap` | [png](before/433-B2-1280x720.png) · [txt](before/433-B2-1280x720.txt) | [png](after/433-B2-1280x720.png) · [txt](after/433-B2-1280x720.txt) |

## What the pair shows

Before: at 1200×560 and 832×560 the strip is cut off, and the pane cannot scroll to it. At 832 wide the key runs one line past the pane's right edge. After: the pane scrolls, so the strip and every slot are reachable. At 832 wide the key wraps between whole entries, and the key, the cells and the chart canvas all lie inside the pane. 1280×720 and 1440×900 are unchanged. The recurring-lows key reads "lower · recurring lows 1" instead of "lower 1". Still true on both sides: at 832 wide, the glucose chart's window caption ("24 H 00:00–24:00 · …") is cut off at the chart's right edge.
