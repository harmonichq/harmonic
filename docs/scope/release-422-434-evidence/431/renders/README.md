# #431 before/after renders

Synthetic before/after renders for #431: the server confirms a pending Plan once the pump holds it, and every surface reads that one verdict.

- **Before**: base `a4d374a7` (origin/main before the release).
- **After**: release trunk `caaca050`.
- **Owed by**: the lock (Changes at Pending, Mismatch with its rows, "On pump since", Confirmed with on_pump false, Draft saved with the previous-Plan line, the next-change line, the watch panel's Plan states, and the case-file header without the note; dark only).
- **How**: both trees were served with AGENTS.md's QA copy-then-serve command
  (`uv run harmonic serve --no-fetch --token '' --db <scratch copy> --port 8791`). The
  data is the committed showcase or a named case store emitted by that tree's own
  `scripts/gen_qa_e2e_db.py --case <name>`, followed by the replay case server's
  `reconcile_ingested_follow_up` step. Chromium used the dark scheme, the desk's only
  theme. The same interaction path produced each before and after.
- **Files**: each `.png` is the render. Each `.txt` beside it holds the page's visible
  text, the address, and the capture note.

The pump reads in these flows are the replay's own synthetic pump producer (`frontend/replay-pump.py`), from trunk commit 087a1450, run the same way against both trees. The base copy has no `in-place` mode, so base runs use the branch's producer, as the lock's base proof does.

| Shot | Size | State | Store | Route | Before | After |
|---|---|---|---|---|---|---|
| 431-A1 | 1280x720 | Changes: Plan at Pending | `basal-lower` | Stage → Open Plan → Record decision | [png](before/431-A1-1280x720.png) · [txt](before/431-A1-1280x720.txt) | [png](after/431-A1-1280x720.png) · [txt](after/431-A1-1280x720.txt) |
| 431-A1 | 1440x900 | Changes: Plan at Pending | `basal-lower` | Stage → Open Plan → Record decision | [png](before/431-A1-1440x900.png) · [txt](before/431-A1-1440x900.txt) | [png](after/431-A1-1440x900.png) · [txt](after/431-A1-1440x900.txt) |
| 431-G1 | 1280x720 | watch dock: Plan waiting for the pump | `basal-lower` | as 431-A1 → Diagnose; crop dock | [png](before/431-G1-1280x720.png) · [txt](before/431-G1-1280x720.txt) | [png](after/431-G1-1280x720.png) · [txt](after/431-G1-1280x720.txt) |
| 431-G1 | 1440x900 | watch dock: Plan waiting for the pump | `basal-lower` | as 431-A1 → Diagnose; crop dock | [png](before/431-G1-1440x900.png) · [txt](before/431-G1-1440x900.txt) | [png](after/431-G1-1440x900.png) · [txt](after/431-G1-1440x900.txt) |
| 431-B1 | 1280x720 | Changes: Mismatch with its rows | `basal-lower` | as 431-A1 → pump read `mismatch` → Changes Plan | [png](before/431-B1-1280x720.png) · [txt](before/431-B1-1280x720.txt) | [png](after/431-B1-1280x720.png) · [txt](after/431-B1-1280x720.txt) |
| 431-B1 | 1440x900 | Changes: Mismatch with its rows | `basal-lower` | as 431-A1 → pump read `mismatch` → Changes Plan | [png](before/431-B1-1440x900.png) · [txt](before/431-B1-1440x900.txt) | [png](after/431-B1-1440x900.png) · [txt](after/431-B1-1440x900.txt) |
| 431-G2 | 1280x720 | watch dock: Plan the pump doesn't match | `basal-lower` | as 431-B1 → Diagnose; crop dock | [png](before/431-G2-1280x720.png) · [txt](before/431-G2-1280x720.txt) | [png](after/431-G2-1280x720.png) · [txt](after/431-G2-1280x720.txt) |
| 431-G2 | 1440x900 | watch dock: Plan the pump doesn't match | `basal-lower` | as 431-B1 → Diagnose; crop dock | [png](before/431-G2-1440x900.png) · [txt](before/431-G2-1440x900.txt) | [png](after/431-G2-1440x900.png) · [txt](after/431-G2-1440x900.txt) |
| 431-C1 | 1280x720 | Changes: "On pump since" (in-place read, S145 path) | `basal-lower` | Record → pump read `in-place` → Changes Plan | [png](before/431-C1-1280x720.png) · [txt](before/431-C1-1280x720.txt) | [png](after/431-C1-1280x720.png) · [txt](after/431-C1-1280x720.txt) |
| 431-C1 | 1440x900 | Changes: "On pump since" (in-place read, S145 path) | `basal-lower` | Record → pump read `in-place` → Changes Plan | [png](before/431-C1-1440x900.png) · [txt](before/431-C1-1440x900.txt) | [png](after/431-C1-1440x900.png) · [txt](after/431-C1-1440x900.txt) |
| 431-D1 | 1280x720 | Changes: confirmed, on_pump false | `basal-lower` | as 431-C1 → pump read `mismatch` | [png](before/431-D1-1280x720.png) · [txt](before/431-D1-1280x720.txt) | [png](after/431-D1-1280x720.png) · [txt](after/431-D1-1280x720.txt) |
| 431-D1 | 1440x900 | Changes: confirmed, on_pump false | `basal-lower` | as 431-C1 → pump read `mismatch` | [png](before/431-D1-1440x900.png) · [txt](before/431-D1-1440x900.txt) | [png](after/431-D1-1440x900.png) · [txt](after/431-D1-1440x900.txt) |
| 431-C2 | 1280x720 | Changes: on-pump line after a profile switch (S42 path) | `basal-lower` | Record → pump read `match` | [png](before/431-C2-1280x720.png) · [txt](before/431-C2-1280x720.txt) | [png](after/431-C2-1280x720.png) · [txt](after/431-C2-1280x720.txt) |
| 431-C2 | 1440x900 | Changes: on-pump line after a profile switch (S42 path) | `basal-lower` | Record → pump read `match` | [png](before/431-C2-1440x900.png) · [txt](before/431-C2-1440x900.txt) | [png](after/431-C2-1440x900.png) · [txt](after/431-C2-1440x900.txt) |
| 431-E1 | 1280x720 | Changes: Draft saved + previous-Plan line (S146 path) | `basal-lower` | Record → `in-place` → PUT next draft | [png](before/431-E1-1280x720.png) · [txt](before/431-E1-1280x720.txt) | [png](after/431-E1-1280x720.png) · [txt](after/431-E1-1280x720.txt) |
| 431-E1 | 1440x900 | Changes: Draft saved + previous-Plan line (S146 path) | `basal-lower` | Record → `in-place` → PUT next draft | [png](before/431-E1-1440x900.png) · [txt](before/431-E1-1440x900.txt) | [png](after/431-E1-1440x900.png) · [txt](after/431-E1-1440x900.txt) |
| 431-F1 | 1280x720 | Changes: pending Plan + next-change line | `basal-lower` | Record → PUT next draft | [png](before/431-F1-1280x720.png) · [txt](before/431-F1-1280x720.txt) | [png](after/431-F1-1280x720.png) · [txt](after/431-F1-1280x720.txt) |
| 431-F1 | 1440x900 | Changes: pending Plan + next-change line | `basal-lower` | Record → PUT next draft | [png](before/431-F1-1440x900.png) · [txt](before/431-F1-1440x900.txt) | [png](after/431-F1-1440x900.png) · [txt](after/431-F1-1440x900.txt) |
| 431-H1 | 1280x720 | Pattern case-file header with a Plan pending (S147 path) | `pattern-near-tie` | record Plan via routes → Highs after meals | [png](before/431-H1-1280x720.png) · [txt](before/431-H1-1280x720.txt) | [png](after/431-H1-1280x720.png) · [txt](after/431-H1-1280x720.txt) |
| 431-H1 | 1440x900 | Pattern case-file header with a Plan pending (S147 path) | `pattern-near-tie` | record Plan via routes → Highs after meals | [png](before/431-H1-1440x900.png) · [txt](before/431-H1-1440x900.txt) | [png](after/431-H1-1440x900.png) · [txt](after/431-H1-1440x900.txt) |

## What the pair shows

Before: an in-place pump read shows "On pump as of <latest read>", a time that moves with every fetch. A later read that no longer holds the Plan flips it back to Mismatch. A draft saved after that has no frame of its own and no next-change line. The watch panel reads "Nothing being watched" while a Plan waits for the pump. The Highs after meals case-file header carries "View Plan" and "A Plan is awaiting confirmation". After: Pending reads "Awaiting pump evidence". Mismatch reads "The latest pump read doesn't match". "On pump since" names the confirming read. A later non-matching read shows "Confirmed on the pump … The latest pump read no longer matches this Plan". A draft after a confirmed Plan reads Draft saved, with "Previous Plan: recorded …, confirmed on the pump …". A draft during a pending Plan adds "Next change: draft saved …". The watch panel shows "Plan · awaiting pump" with "Open Changes ›". The case-file header carries no Plan note.
