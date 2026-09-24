# S100 synthetic evidence

The scheduled nightly on main b03431d2 (run 36011270820) failed S100 once at
1280x720: "S100 / Event S8 cursor readout and accessible label; saw [ false ];
the keyboard cursor did not reveal its on-screen readout". The same commit's
push CI passed it, and 20 plain local runs (10 on base, 10 on the trunk) passed.

Cause: every Diagnose repaint disposes and rebuilds the tiles, the fullscreen
event chart included. The rebuild emptied the keyboard readout, reset the cursor
to minute 0 and dropped focus to the page. A background read landing after the
reader's arrow keys (the drill's case file, chart evidence, Diagnose's Focus and
Plan reads) did exactly that. A wearer could hit it; it is the #441 class.

Fix (s100-flake, merged into the release trunk): the chart hands its place (the
cursor minute while its readout shows, and whether it held focus) to its own
rebuild, for the same fullscreen chart only. The surfaces requirement that
fullscreen preserves focus now also holds across background repaints.

## Recorded results

Coordinator-run, 2026-09-24, at 1280x720, all synthetic (the showcase store):

| Proof | Base (release trunk c01bf2e9) | Fix (3a6a5301) |
| --- | --- | --- |
| Desk suite, "S100 · a background repaint keeps…" | fails: "the background repaint dropped the keyboard cursor and emptied its on-screen readout" | passes |
| Desk suite, "S100 · leaving and re-entering fullscreen carries no cursor…" | passes (guard) | passes |
| Forcing harness, drill case file held until after the third ArrowRight | 10 of 10 fail with the nightly's exact message | 10 of 10 pass |
| Forcing harness, Focus and guidance reads held | 10 of 10 VOID (no read in flight at the third key) | 10 of 10 VOID |

`force-s100.mjs` and `force-s100.sh` are the harness; `logs/` holds the runs.
