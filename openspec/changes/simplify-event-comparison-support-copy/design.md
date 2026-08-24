# Design — simplify By-event comparison support copy

## Safe-start provenance

`AGENTS.md` declares the sole safe revise entrypoint:

```sh
uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite
```

The revision and browser evidence use the generated synthetic database and the
committed synthetic event-comparison capture. No fetch path or real health data is
involved. The frozen behavior contract is
`mockups/finding-evidence-routing.behavior.md`, replayed by
`frontend/diagnose-event-comparison-behavior.replay.mjs`; its 13 stories passed at
base `983c48effc39fb069c4453b478da2d61b667d55e` before production code changed.

## ADR 99 — The By-event legend says less

Connor Griffin sanctioned dropping the point tally on 2026-08-24 after reviewing
rendered specimens. A cohort's key mark remains the visible carrier of its
server-owned Comparison support: solid is readable straight, thin with a dot is
thin, and crossed is too sparse to average or has nothing to draw. The detail line
keeps the event count and adds words only when the line must not be read straight.

A withheld five-minute point states its own absence. It names a cohort-level reason
only when the cohort itself is Withheld. The chart's standing accessible description
keeps only the chart title; the keyboard path continues to narrate inspected values.

The frozen behavior ledger is unchanged because none of its stories promises the
retired detail strings. Its replay remains the regression contract for the surface.
