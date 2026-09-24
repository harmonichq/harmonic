# #455 synthetic evidence

Everything here is synthetic. Every capture and log comes from committed manufactured QA
recipes (`scripts/qa_e2e_cases.py`) or the committed showcase, served by the offline
no-fetch app (`--no-fetch --token ''`). No personal database, operator screenshot or
real-data payload is included. The release coordinator ran every port-bound leg serially;
the ticket worker bound no port. Absolute paths in the logs are replaced with
`<base worktree>`, `<ticket worktree>`, `<release worktree>`, `<scratch>` and `$TMPDIR`.

Change: `window-label-narrow` (OpenSpec), archived with the release. Ticket branch head at
integration: `575464e7`, the final harness the coordinator log names and the second parent
of the trunk merge `20b87241`. It adds only the ledger's and tasks.md's record of the
`c13c6f7a` legs, so its replay harness is `c13c6f7a`'s.

Stores: `basal-verdict-gallery` serves all three stories (S183, S184 and S185, each on a
fresh copy) and every render. Its 24 h window is thin, so the insufficient-sample notice
prints, and at rest the Spotlight opens the next-in-line basal slot, 00:00.

## Requirement map

| Requirement (surfaces spec, ADDED) | Stories | Node and backend tests | Log | Captures |
| --- | --- | --- | --- | --- |
| The glucose overview's window caption stays whole inside the chart | S183 | `frontend/diagnose-workstation-chart.test.js` "#455 · a thin 24 h caption at the narrowest split wraps inside its window on padded tokens", "#455 · a thin quarter-day caption at the narrowest split wraps in its roomier margin", "#455 · a wrapped caption breaks its own lines between whole words, no line ending in a space", "#455 · a window that is not thin, narrower than its head, wraps its head alone", "#455 · at 1280's chart every thin preset keeps today's one-line caption exactly", "#455 · observeResize re-lays out after a size change, never on its first report", "#455 · observeResize resizes to the latest of two reports that land before one frame"; `frontend/c4.replay.test.js` "S183–S185 are unique app-only C4 stories under HV2-11, served from the verdict gallery" (registers all three stories), "S183 passes a caption wholly inside the chart, stacked on its pads", "S183 reads a caption parked left in reading order, though its tail paints first", "S183 fails a caption parked past the chart's right edge", "S183 fails a caption parked past the chart's left edge after a narrowing", "S183 fails a word split across two spans", "S183 fails a notice missing its count", "S183 fails when the thin-path premise does not hold", "S183 fails two overlapping spans anywhere in the chart", "S183 fails a two-line caption at the run's own size", "S183 fails a pad box inside the text's bounds that reaches into the y-axis label column", "S183 fails a pad box straddling a gate", "S183 fails once, naming failures at two sizes", "readSettled judges the first reading its check passes", "readSettled keeps the last reading when the check never passes within its bound", "readSettled rethrows a page error rather than judging it" | branch `logs/455c-branch-*.log`; base `logs/455e-base-*.log` | `renders/after/455-A1-*.png` to `455-A5-*.png`, `455-B2-1200x736.png`, `455-D1-*.png` to `455-D5-*.png`, `455-E1-832x720.png`, `455-E2-832x720.png`, `455-F1-832x720.png` |
| The Spotlight's middle-rank verdict line keeps every fact inside the chart | S184 | `frontend/diagnose-evidence-charts.test.js` "the middle-rank verdict line breaks between facts at the narrowest split"; `frontend/diagnose-workstation-chart.test.js` "#455 · observeResize re-lays out after a size change, never on its first report", "#455 · observeResize resizes to the latest of two reports that land before one frame"; `frontend/c4.replay.test.js` "S184 passes a verdict broken between facts, inside the chart, with the tally below it", "S184 fails the rate past the chart's edge and under the Keep control", "S184 fails the rate under the Keep control inside the chart", "S184 fails a line break inside a fact", "S184 fails a tally overlapping the verdict", "S184 fails a missing verdict group, and a wrapped verdict where one line must hold", "S184 fails once, naming failures at two sizes", and the three "readSettled …" tests above | branch `logs/455c-branch-*.log`; base `logs/455e-base-*.log` | `renders/after/455-A1-*.png`, `455-A5-*.png`, `455-B1-1200x736.png`, `455-G1-832x720.png` |
| The glucose overview's header keeps its title at the narrowest split | S185 | `frontend/c4.replay.test.js` "S185 passes an 832 header with a truncated title, a whole provenance and a named icon-only control", "S185 fails a zero-width title at the narrowest split", "S185 fails a cut provenance", "S185 fails a wide header whose control hides its word", "S185 fails a header on two lines, and a control that loses its name", "S185 passes a control whose box overhangs the rail while its icon and word sit inside it", "S185 fails a control whose icon runs outside the header, or which draws no icon or word", "S185 fails once, naming failures at two sizes". No node test reads the stylesheet's 832–1023 px rule; S185 measures it in the browser | branch `logs/455c-branch-*.log`; base `logs/455e-base-*.log` | `renders/after/455-A1-*.png` to `455-A5-*.png`, `455-C1-1024x768.png`, `455-D1-*.png` to `455-D5-*.png` |
| Chart furniture never strikes an axis label | S183 (its overlap check reads the y-axis labels and the target numerals; no story measures the Spotlight's programmed rule, which is a line, not text) | `frontend/diagnose-workstation-chart.test.js` "#455 · the y-axis labels a target numeral would strike print nothing"; `frontend/diagnose-evidence-charts.test.js` "the programmed rule ends at the axis tick, above the tick labels, at both ranks"; `frontend/c4.replay.test.js` "S183 fails two overlapping spans anywhere in the chart" | branch `logs/455c-branch-*.log`; base `logs/455e-base-*.log` | `renders/after/455-D1-*.png` to `455-D5-*.png` (the 60 and 180 tick labels; the programmed rule in D1 and D5), `455-A1-*.png`, `455-A5-*.png` |

## Recorded results

Coordinator-run, 2026-09-24. Every replay leg selected `ONLY=S183,S184,S185` (S183 and S184
only in the 455d leg) at 1280x720 and at 1440x900. Each story visits its own sizes inside
the run (832×720, 832×560, 1024×768, 1200×736 and the run's size), so a failure line names
the size it was measured at.

- **S183–S185 on base `b03431d2` with the `d3e276ed` harness laid over it:** all three fail
  at both sizes, `# executed 0 · failed 3 · deferred 0 · selected 3`, and the run ends
  "FATAL: zero stories executed — a run that asserts nothing is a failure, not a pass". The
  coordinator log records the premises as holding. Verbatim:
  - "FAIL S183 — S183 the glucose overview's text must stay whole, inside the chart and
    unstruck at every size; 65 failures:" at each size. Among them: at 832×720 and 832×560
    the 24 h caption span "  ·  INSUFFICIENT SAMPLE — thinnest bin holds 0" "lies 269.38px
    outside #chart's 402×153 box"; at every size the painted text "60" and "70" overlap, and
    "180" and "180" overlap; and, at the run's size and at 832, "0 painted captions begin
    with "AFTERNOON 12:00–18:00"" and likewise for EVENING.
  - "FAIL S184 — S184 the Spotlight's verdict line must keep every fact whole inside the
    chart; 6 failures:" at 1280x720, where at 1200×736, 832×720 and 832×560 "the verdict line
    reads ["SUPPORTED"]". At 1440x900 it reads "…; 4 failures:": at 832×720 and 832×560 the
    verdict span "SUPPORTED · 0.70 U/h · (0.70–0.70) · programmed now 0.60" lies 26.86px
    outside the Spotlight chart and "runs 20px under the Keep control".
  - "FAIL S185 — S185 the canvas header must keep its title, provenance and All charts
    control on one line; 6 failures:" at each size: at 832×720 and 832×560 "the title's box
    is 0px wide, under twice its 11px type, so it cannot show a letter and an ellipsis", and
    at every size "the control lies 3.5px outside the header's box". The widths line reads
    "title 0px box, clientWidth 0, scrollWidth 144" at 832 and "title 143.94px box" at
    1024×768 and the run's size.

  (`logs/455-base-1280x720.log`, `logs/455-base-1440x900.log`)
- **S183–S185 on branch `d3e276ed` (superseded):** S184 passes at both sizes;
  `# executed 1 · failed 2 · deferred 0 · selected 3`. "FAIL S183 — …; 2 failures:" names
  only "0 painted captions begin with "AFTERNOON 12:00–18:00"; exactly one must" and the
  same for "EVENING 18:00–24:00", at the run's own size (1280×720 in one log, 1440×900 in the
  other). "FAIL S185 — …; 4 failures:" names only "the control lies 3.5px outside the
  header's box" at 832×720, 832×560, 1024×768 and the run's size. S185 prints a 41.86px
  title box at 832 beside a 21px control. The coordinator log sends both failures back
  ("worker diagnosing with rulings") and notes that the control overhang also fired on base
  at desktop sizes. The next commit, `a9a2b56a`, is "Correct S183's reading order and S185's
  control bounds (#455)". (`logs/455-branch-1280x720.log`, `logs/455-branch-1440x900.log`)
- **S183–S185 on branch `a9a2b56a` (superseded):** S185 passes at both sizes;
  `# executed 1 · failed 2 · deferred 0 · selected 3`. Every S183 and S184 failure is at
  832×720 after the window was narrowed with nothing pressed. "FAIL S183 — …; 4 failures:"
  names the Evening caption span straddling "the window's 18:00 gate by 1.61px" and its
  notice "205.03px past #chart's right edge" in the 1280x720 run, and the Evening caption
  lying "101.06px outside #chart's 402×153 box" in the 1440x900 run. "FAIL S184 — …; 2
  failures:" names the one-line verdict span 26.86px outside the chart and "20px under the
  Keep control". The node tests for the two story fixes pass, `ℹ tests 3`, `ℹ pass 3`: "S183
  reads a caption parked left in reading order, though its tail paints first", "S185 passes
  a control whose box overhangs the rail while its icon and word sit inside it" and "S185
  fails a control whose icon runs outside the header, or which draws no icon or word". The
  coordinator log calls this a race at 832 after the narrowing and sends a fix; the next
  commit, `c13c6f7a`, is "Resize to the latest box and let S183–S184 wait for the relayout
  (#455)". (`logs/455b-branch-1280x720.log`, `logs/455b-branch-1440x900.log`,
  `logs/455b-node.log`)
- **Branch `c13c6f7a`:** three runs at each size, each "PASS S183", "PASS S184", "PASS
  S185" and `# executed 3 · failed 0 · deferred 0 · selected 3 · chromium launches 1`. S185
  prints the same widths as `d3e276ed`. The six node tests the coordinator filtered by name
  pass, 3 of 3 in each file: the three `frontend/diagnose-workstation-chart.test.js` tests
  "#455 · a wrapped caption breaks its own lines…", "#455 · a window that is not thin,
  narrower than its head…" and "#455 · observeResize resizes to the latest of two
  reports…", and the three `frontend/c4.replay.test.js` "readSettled …" tests. Those node
  lines are printed in the coordinator's run output for this leg; no separate log file is
  kept. The coordinator log records "node 6/6 ✔; branch S183-S185 3/3 ×3 runs both sizes".
  (`logs/455c-branch-r1-1280x720.log` to `logs/455c-branch-r3-1440x900.log`)
- **S183 and S184 on base `b03431d2` with the branch harness laid over it (455d):** both
  fail at both sizes, `# executed 0 · failed 2 · deferred 0 · selected 2`: "FAIL S183 — …;
  72 failures:" and "FAIL S184 — …; 6 failures:". The run output prints no harness commit;
  the coordinator log calls it the new harness, queued after `c13c6f7a`. S185 was not
  selected in this leg. (`logs/455d-base-1280x720.log`, `logs/455d-base-1440x900.log`)
- **S183–S185 on base `b03431d2` with the final harness `575464e7` laid over it (455e, run
  after the trunk merge):** all three fail at both sizes,
  `# executed 0 · failed 3 · deferred 0 · selected 3`, the coordinator's final base proof
  ("S183/S184/S185 FAIL at feature assertions both sizes"). Verbatim:
  - "FAIL S183 — S183 the glucose overview's text must stay whole, inside the chart and
    unstruck at every size; 72 failures:". Among them: at 832×720 and 832×560 the 24 h
    caption span "  ·  INSUFFICIENT SAMPLE — thinnest bin holds 0" "lies 269.38px outside
    #chart's 402×153 box"; the Afternoon caption "reaches 197.33px left of the plot's left
    edge, into the y-axis label column"; the Evening caption after the narrowing "lies
    67.65px outside #chart's 402×153 box"; and at every size the "60"/"70" and "180"/"180"
    overlaps.
  - "FAIL S184 — S184 the Spotlight's verdict line must keep every fact whole inside the
    chart; 6 failures:": at 1200×736, 832×720 and 832×560 "the verdict line reads
    ["SUPPORTED"]" and "0 painted lines begin with "30 steady nights"; exactly one tally
    must".
  - "FAIL S185 — S185 the canvas header must keep its title, provenance and All charts
    control on one line; 2 failures:": at 832×720 and 832×560 "the title's box is 0px wide,
    under twice its 11px type, so it cannot show a letter and an ellipsis". Nothing fails at
    1024×768 or the run's size.

  (`logs/455e-base-1280x720.log`, `logs/455e-base-1440x900.log`)
- **Release trunk:** `TRUNK 20b87241 #455 merged (182/163/19; closer-joined c4 blocks; fast
  1083/1083; c4 test 169).` No trunk leg in the coordinator log re-ran S183–S185; the after
  renders below were taken on the final trunk `9882bcfe`.
- The complete ledger at both sizes, the whole backend pytest and the full
  `acceptance.test.py` run once on the commit that is pushed; the pull request records the
  result.

## Renders

- **Before**: base `b03431d2` (origin/main before the release).
- **After**: release trunk `9882bcfe`'s server, serving the desk shell last built at trunk
  `25392ade`. Every ticket's desk change had merged by then; the evidence record's root
  [README](../README.md) records what that shell lacks (the #451 prose em-dash sweep's
  desk strings).
- **Owed by**: the ticket's lock. Design.md's "Render matrix owed" names every shot; 455-G1
  is the supplementary Spotlight half of 455-F1, because Evening serves no evidence chart on
  this store.
- **How**: both trees were served with AGENTS.md's QA copy-then-serve command
  (`uv run harmonic serve --no-fetch --token '' --db <scratch copy> --port 8791`) over a
  named case store emitted by that tree's own `scripts/gen_qa_e2e_db.py --case
  basal-verdict-gallery`, followed by the replay case server's `reconcile_ingested_follow_up`
  step. Chromium used the dark scheme, the desk's only theme. The same interaction path
  produced each before and after.
- **Files**: each `.png` is the render; each `.txt` beside it holds the page's visible text,
  the address, the focused element and the capture note.

| Shot | Size | State | Store | Route | Before | After |
|---|---|---|---|---|---|---|
| 455-A1 | 832x720 | Overnight at the narrowest split | `basal-verdict-gallery` | Diagnose at rest → Overnight | [png](renders/before/455-A1-832x720.png) · [txt](renders/before/455-A1-832x720.txt) | [png](renders/after/455-A1-832x720.png) · [txt](renders/after/455-A1-832x720.txt) |
| 455-A1 | 832x560 | Overnight at the narrowest split | `basal-verdict-gallery` | Diagnose at rest → Overnight | [png](renders/before/455-A1-832x560.png) · [txt](renders/before/455-A1-832x560.txt) | [png](renders/after/455-A1-832x560.png) · [txt](renders/after/455-A1-832x560.txt) |
| 455-A2 | 832x720 | Morning at the narrowest split | `basal-verdict-gallery` | Diagnose at rest → Morning | [png](renders/before/455-A2-832x720.png) · [txt](renders/before/455-A2-832x720.txt) | [png](renders/after/455-A2-832x720.png) · [txt](renders/after/455-A2-832x720.txt) |
| 455-A2 | 832x560 | Morning at the narrowest split | `basal-verdict-gallery` | Diagnose at rest → Morning | [png](renders/before/455-A2-832x560.png) · [txt](renders/before/455-A2-832x560.txt) | [png](renders/after/455-A2-832x560.png) · [txt](renders/after/455-A2-832x560.txt) |
| 455-A3 | 832x720 | Afternoon at the narrowest split | `basal-verdict-gallery` | Diagnose at rest → Afternoon | [png](renders/before/455-A3-832x720.png) · [txt](renders/before/455-A3-832x720.txt) | [png](renders/after/455-A3-832x720.png) · [txt](renders/after/455-A3-832x720.txt) |
| 455-A3 | 832x560 | Afternoon at the narrowest split | `basal-verdict-gallery` | Diagnose at rest → Afternoon | [png](renders/before/455-A3-832x560.png) · [txt](renders/before/455-A3-832x560.txt) | [png](renders/after/455-A3-832x560.png) · [txt](renders/after/455-A3-832x560.txt) |
| 455-A4 | 832x720 | Evening at the narrowest split | `basal-verdict-gallery` | Diagnose at rest → Evening | [png](renders/before/455-A4-832x720.png) · [txt](renders/before/455-A4-832x720.txt) | [png](renders/after/455-A4-832x720.png) · [txt](renders/after/455-A4-832x720.txt) |
| 455-A4 | 832x560 | Evening at the narrowest split | `basal-verdict-gallery` | Diagnose at rest → Evening | [png](renders/before/455-A4-832x560.png) · [txt](renders/before/455-A4-832x560.txt) | [png](renders/after/455-A4-832x560.png) · [txt](renders/after/455-A4-832x560.txt) |
| 455-A5 | 832x720 | 24 h at the narrowest split | `basal-verdict-gallery` | Diagnose at rest → 24 h | [png](renders/before/455-A5-832x720.png) · [txt](renders/before/455-A5-832x720.txt) | [png](renders/after/455-A5-832x720.png) · [txt](renders/after/455-A5-832x720.txt) |
| 455-A5 | 832x560 | 24 h at the narrowest split | `basal-verdict-gallery` | Diagnose at rest → 24 h | [png](renders/before/455-A5-832x560.png) · [txt](renders/before/455-A5-832x560.txt) | [png](renders/after/455-A5-832x560.png) · [txt](renders/after/455-A5-832x560.txt) |
| 455-B1 | 1200x736 | 24 h at 1200×736: one caption line; the Spotlight's verdict line on one line | `basal-verdict-gallery` | Diagnose at rest → 24 h | [png](renders/before/455-B1-1200x736.png) · [txt](renders/before/455-B1-1200x736.txt) | [png](renders/after/455-B1-1200x736.png) · [txt](renders/after/455-B1-1200x736.txt) |
| 455-B2 | 1200x736 | Afternoon at 1200×736: the caption against the y-axis labels | `basal-verdict-gallery` | Diagnose at rest → Afternoon | [png](renders/before/455-B2-1200x736.png) · [txt](renders/before/455-B2-1200x736.txt) | [png](renders/after/455-B2-1200x736.png) · [txt](renders/after/455-B2-1200x736.txt) |
| 455-C1 | 1024x768 | 24 h at 1024×768: the canvas header (title and All charts control) | `basal-verdict-gallery` | Diagnose at rest → 24 h | [png](renders/before/455-C1-1024x768.png) · [txt](renders/before/455-C1-1024x768.txt) | [png](renders/after/455-C1-1024x768.png) · [txt](renders/after/455-C1-1024x768.txt) |
| 455-D1 | 1280x720 | Overnight at a supported size: the 60 and 180 tick labels and the Spotlight's programmed rule | `basal-verdict-gallery` | Diagnose at rest → Overnight | [png](renders/before/455-D1-1280x720.png) · [txt](renders/before/455-D1-1280x720.txt) | [png](renders/after/455-D1-1280x720.png) · [txt](renders/after/455-D1-1280x720.txt) |
| 455-D1 | 1440x900 | Overnight at a supported size: the 60 and 180 tick labels and the Spotlight's programmed rule | `basal-verdict-gallery` | Diagnose at rest → Overnight | [png](renders/before/455-D1-1440x900.png) · [txt](renders/before/455-D1-1440x900.txt) | [png](renders/after/455-D1-1440x900.png) · [txt](renders/after/455-D1-1440x900.txt) |
| 455-D2 | 1280x720 | Morning at a supported size: the 60 and 180 tick labels (this window serves no evidence chart) | `basal-verdict-gallery` | Diagnose at rest → Morning | [png](renders/before/455-D2-1280x720.png) · [txt](renders/before/455-D2-1280x720.txt) | [png](renders/after/455-D2-1280x720.png) · [txt](renders/after/455-D2-1280x720.txt) |
| 455-D2 | 1440x900 | Morning at a supported size: the 60 and 180 tick labels (this window serves no evidence chart) | `basal-verdict-gallery` | Diagnose at rest → Morning | [png](renders/before/455-D2-1440x900.png) · [txt](renders/before/455-D2-1440x900.txt) | [png](renders/after/455-D2-1440x900.png) · [txt](renders/after/455-D2-1440x900.txt) |
| 455-D3 | 1280x720 | Afternoon at a supported size: the 60 and 180 tick labels (this window serves no evidence chart) | `basal-verdict-gallery` | Diagnose at rest → Afternoon | [png](renders/before/455-D3-1280x720.png) · [txt](renders/before/455-D3-1280x720.txt) | [png](renders/after/455-D3-1280x720.png) · [txt](renders/after/455-D3-1280x720.txt) |
| 455-D3 | 1440x900 | Afternoon at a supported size: the 60 and 180 tick labels (this window serves no evidence chart) | `basal-verdict-gallery` | Diagnose at rest → Afternoon | [png](renders/before/455-D3-1440x900.png) · [txt](renders/before/455-D3-1440x900.txt) | [png](renders/after/455-D3-1440x900.png) · [txt](renders/after/455-D3-1440x900.txt) |
| 455-D4 | 1280x720 | Evening at a supported size: the 60 and 180 tick labels (this window serves no evidence chart) | `basal-verdict-gallery` | Diagnose at rest → Evening | [png](renders/before/455-D4-1280x720.png) · [txt](renders/before/455-D4-1280x720.txt) | [png](renders/after/455-D4-1280x720.png) · [txt](renders/after/455-D4-1280x720.txt) |
| 455-D4 | 1440x900 | Evening at a supported size: the 60 and 180 tick labels (this window serves no evidence chart) | `basal-verdict-gallery` | Diagnose at rest → Evening | [png](renders/before/455-D4-1440x900.png) · [txt](renders/before/455-D4-1440x900.txt) | [png](renders/after/455-D4-1440x900.png) · [txt](renders/after/455-D4-1440x900.txt) |
| 455-D5 | 1280x720 | 24 h at a supported size: the 60 and 180 tick labels and the Spotlight's programmed rule | `basal-verdict-gallery` | Diagnose at rest → 24 h | [png](renders/before/455-D5-1280x720.png) · [txt](renders/before/455-D5-1280x720.txt) | [png](renders/after/455-D5-1280x720.png) · [txt](renders/after/455-D5-1280x720.txt) |
| 455-D5 | 1440x900 | 24 h at a supported size: the 60 and 180 tick labels and the Spotlight's programmed rule | `basal-verdict-gallery` | Diagnose at rest → 24 h | [png](renders/before/455-D5-1440x900.png) · [txt](renders/before/455-D5-1440x900.txt) | [png](renders/after/455-D5-1440x900.png) · [txt](renders/after/455-D5-1440x900.txt) |
| 455-E1 | 832x720 | crop of the glucose overview, Evening | `basal-verdict-gallery` | Diagnose at rest → Evening; clip `#chart` + 16 px | [png](renders/before/455-E1-832x720.png) · [txt](renders/before/455-E1-832x720.txt) | [png](renders/after/455-E1-832x720.png) · [txt](renders/after/455-E1-832x720.txt) |
| 455-E2 | 832x720 | crop of the glucose overview, Afternoon | `basal-verdict-gallery` | Diagnose at rest → Afternoon; clip `#chart` + 16 px | [png](renders/before/455-E2-832x720.png) · [txt](renders/before/455-E2-832x720.txt) | [png](renders/after/455-E2-832x720.png) · [txt](renders/after/455-E2-832x720.txt) |
| 455-F1 | 832x720 | Evening at 1280×720, then the window narrowed to 832×720 with nothing pressed | `basal-verdict-gallery` | context at 1280x720 → Evening → viewport 832x720 | [png](renders/before/455-F1-832x720.png) · [txt](renders/before/455-F1-832x720.txt) | [png](renders/after/455-F1-832x720.png) · [txt](renders/after/455-F1-832x720.txt) |
| 455-G1 | 832x720 | 24 h at 1280×720, then the window narrowed to 832×720 with nothing pressed (the Spotlight half of 455-F1) | `basal-verdict-gallery` | context at 1280x720 → 24 h → viewport 832x720 | [png](renders/before/455-G1-832x720.png) · [txt](renders/before/455-G1-832x720.txt) | [png](renders/after/455-G1-832x720.png) · [txt](renders/after/455-G1-832x720.txt) |

### What the pair shows

Every capture is Diagnose at `/diagnose` on `basal-verdict-gallery`, with the pressed Window
preset focused. In every 832-wide capture (455-A, 455-E, 455-F and 455-G) the before text
lists the "All charts" word after the provenance "pooled from 30 captured CGM days · ±45
min", and the after text does not; at 1024×768, 1200×736, 1280×720 and 1440×900 the before
and after visible text is identical, "All charts" included. Both trees list the header
title "GLUCOSE BY TIME OF DAY" at every size, because the text dump does not show how wide
it draws (S185 measures that: a 0px box at 832 on base, 41.86px on the branch). The
Spotlight ("BASAL 00:00", "Delivered 0.70 U/h across 30 steady nights against 0.60
programmed.") shows on Overnight and 24 h in both trees, while Morning, Afternoon and
Evening read "No evidence charts in this window." in both, which is why 455-F1 has no
Spotlight and 455-G1 carries that half. The window caption, the target caption, the y-axis
labels, the Spotlight's verdict line and its programmed rule are painted on the chart
canvas, so no `.txt` carries them; the `.png` files are the evidence for those.

## Logs

Each leg's commit is the one its coordinator run transcript printed first (`prep <tree>
<oid>`, and `prep base-b03431d2 b03431d2` after the `overlay:` lines for a base leg); those
transcripts are not kept in this folder.

| File | Leg | Commit |
| --- | --- | --- |
| `logs/455-base-1280x720.log` | base replay `ONLY=S183,S184,S185` at 1280x720, branch harness laid over base | `b03431d2` (harness `d3e276ed`) |
| `logs/455-base-1440x900.log` | base replay `ONLY=S183,S184,S185` at 1440x900, branch harness laid over base | `b03431d2` (harness `d3e276ed`) |
| `logs/455-branch-1280x720.log` | branch replay `ONLY=S183,S184,S185` at 1280x720 (superseded) | `d3e276ed` |
| `logs/455-branch-1440x900.log` | branch replay `ONLY=S183,S184,S185` at 1440x900 (superseded) | `d3e276ed` |
| `logs/455b-branch-1280x720.log` | branch replay `ONLY=S183,S184,S185` at 1280x720 (superseded) | `a9a2b56a` |
| `logs/455b-branch-1440x900.log` | branch replay `ONLY=S183,S184,S185` at 1440x900 (superseded) | `a9a2b56a` |
| `logs/455b-node.log` | `node --test` on `frontend/c4.replay.test.js`, the three story-fix tests by name | `a9a2b56a` |
| `logs/455c-branch-r1-1280x720.log` | branch replay `ONLY=S183,S184,S185` at 1280x720, run 1 of 3 | `c13c6f7a` |
| `logs/455c-branch-r1-1440x900.log` | branch replay `ONLY=S183,S184,S185` at 1440x900, run 1 of 3 | `c13c6f7a` |
| `logs/455c-branch-r2-1280x720.log` | branch replay `ONLY=S183,S184,S185` at 1280x720, run 2 of 3 | `c13c6f7a` |
| `logs/455c-branch-r2-1440x900.log` | branch replay `ONLY=S183,S184,S185` at 1440x900, run 2 of 3 | `c13c6f7a` |
| `logs/455c-branch-r3-1280x720.log` | branch replay `ONLY=S183,S184,S185` at 1280x720, run 3 of 3 | `c13c6f7a` |
| `logs/455c-branch-r3-1440x900.log` | branch replay `ONLY=S183,S184,S185` at 1440x900, run 3 of 3 | `c13c6f7a` |
| `logs/455d-base-1280x720.log` | base replay `ONLY=S183,S184` at 1280x720, branch harness laid over base | `b03431d2` (harness commit not printed) |
| `logs/455d-base-1440x900.log` | base replay `ONLY=S183,S184` at 1440x900, branch harness laid over base | `b03431d2` (harness commit not printed) |
| `logs/455e-base-1280x720.log` | base replay `ONLY=S183,S184,S185` at 1280x720, final harness laid over base | `b03431d2` (harness `575464e7`) |
| `logs/455e-base-1440x900.log` | base replay `ONLY=S183,S184,S185` at 1440x900, final harness laid over base | `b03431d2` (harness `575464e7`) |
