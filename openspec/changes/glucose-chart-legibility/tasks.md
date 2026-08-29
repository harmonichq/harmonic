# Tasks — Repair glucose chart legibility (#253)

## 1. Keep clock-window emphasis inside the glucose plot

- [x] Amend P14 and P43 in the frozen Diagnose behavior ledger and their replay
      coverage: gates stop at the plot x-axis and basal verdict paint is independent
      of window selection.
- [x] Replace P43's three dimming-dependent witnesses deliberately: S01 keeps
      preset/crumb scope and asserts basal paint invariance, S06 relies on its
      unchanged chip/preset identity, and S21 adds the second brace edge as its
      persisted-canvas witness. Map gate containment through S02–S05 and S17.
- [x] Run the amended geometry and paint assertions against the base and record the
      expected failure before production edits.
- [x] Restrict brace paint and hit testing to the plot while preserving draw,
      resize, slide, wrap, preset, and lane-click behavior.
- [x] Give held, insufficient-evidence, and no-data basal cells distinct
      theme-owned paint plus non-color structure in Light and Dark.

## 2. Repair the composited chart treatment

- [x] Add fail-first browser measurements for the populated chart with and without
      a window in Light and Dark, including final scrim-composited marks, labels,
      axes, endpoint values, legend, and passive basal states.
- [x] Execute those measurements at the locked 2084×742 viewport and apply the
      existing 4.5:1 text and 3:1 graphical-object floors to the final painted
      foreground/background relationships, not raw theme tokens.
- [x] Retune only the existing Diagnose chart and basal semantic roles until the
      rendered audit meets the repository's text and graphical-object floors and
      the three passive basal states remain distinguishable.
- [x] Keep orange reserved for interaction and preserve the shipped forest/bone
      measured-signal language; do not introduce a parallel palette.

## 3. Verify the shipped revision

- [x] Keep the change-local `surfaces` delta synchronized with the final rendered
      behavior and strict-valid throughout implementation.
- [x] Run the full Diagnose behavior replay against the exact no-fetch synthetic
      server with a nonzero story count.
- [x] Capture and inspect same-fixture base/revision Light/Dark screenshots at the
      reported wide desktop geometry.
- [x] Run the complete repository fast gate, drift checks, and affected browser
      gates declared in `AGENTS.md`; all must exit zero before one pull request is
      opened. Do not merge.
