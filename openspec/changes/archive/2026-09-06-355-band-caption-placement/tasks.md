# Tasks

- [x] Add a fail-first Node regression through `eventComparisonChartOption`
      (`frontend/diagnose-event-comparison.test.js`, built from the committed
      synthetic case files at
      `mockups/diagnose-workstation.synthetic/finding-case-files.json`): the
      stage option's `Target range` series carries a `markArea` label that is
      shown, is placed at `insideStartTop` with `distance: 10` rather than at
      ECharts' default centred top edge, and has an opaque plate colour; the
      mini option carries no label at all. Stub
      `globalThis.getComputedStyle` the way
      `frontend/diagnose-evidence-charts.test.js:840-898` already does, so the
      token-resolved ink and plate are assertable with no DOM. Run it against
      the unchanged builder and watch it fail because the label is absent.
- [x] Place the caption in the option builder
      (`frontend/diagnose-event-comparison.js:109`, the target-range series),
      inside the existing `mini ? {} : { … }` spread so a mini stays
      caption-free. Take the rank the app already ships for this exact problem
      at `frontend/diagnose-workstation-chart.js:1033-1037`, with these values
      settled here and not at build time: `position: 'insideStartTop'`,
      `distance: 10`, furniture ink from `--mk-muted`
      (`frontend/diagnose-workstation.css:31`, defined on `:root`), and an
      opaque plate from `--ck-rail` — the panel ground token, defined on
      `:is(.dw, .vw)` at `frontend/theme.css:291-292`. Every mount this chart
      is handed sits inside `.dw`, so the token resolves on all of them; do not
      substitute another ground token. The plate value is a plain resolved
      colour: never a `color-mix()` string, which zrender drops silently on
      this path (`frontend/diagnose-workstation.js:331`). Leave the caption
      copy, the band fill, the axes, the legend and the readout unchanged.
- [x] Render the By-event chart fullscreen against the repo's declared safe
      start — the one permitted offline serve, transcribed from
      `AGENTS.md:188-191`:

      ```sh
      scratch="${TMPDIR:-/tmp}/harmonic-qa-e2e.sqlite"
      rm -f "$scratch" "$scratch-wal" "$scratch-shm" "$scratch.derived.sqlite"
      cp mockups/qa-e2e.synthetic/harmonic.sqlite "$scratch"
      uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8765
      ```

      Confirm the caption reads clear of the y = 180 boundary, of the centre
      gridline and of the median traces, with the plate breaking the lines
      behind it rather than reading as a coloured patch. If the pinned
      treatment demonstrably fails in that host, stop and ask; do not
      substitute a token or a position at build time. Save the before and after
      renders under `openspec/changes/355-band-caption-placement/evidence/`. A
      sandbox that refuses to launch Chromium is escalated and reported per
      `AGENTS.md`, never worked around in code and never reported as passing.
- [x] Run the dependency-free frontend fast gate with zero failures.
