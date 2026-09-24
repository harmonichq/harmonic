# Evidence — basal-slot case-file head names its own state

All renders use committed or explicitly-scratch synthetic inputs. No personal or
production health data appears here.

## Provenance

- Before: base `f9d2562` (integration tip after #102 merged), served with
  `uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite --port 8877`
  from a temporary detached worktree at that commit.
- After: this change's built revision (tip `c33459c`), served the same way on
  `--port 8878` from this worktree.
- Both halves opened through the replay driver's own `openApp`
  (`frontend/diagnose-workstation-behavior.replay.mjs`, `appSource: 'server'`),
  so before/after framing is identical: same viewport, same lane navigation,
  same click sequence. Each half used its own copy of the driver (the base
  worktree's pre-#103 module for "before", this worktree's module for
  "after"), matching the code each tip actually ships.
- Deterministic API reads: the committed
  `mockups/diagnose-workstation.synthetic/payload.json` for the `hold` and
  `insufficient` states, which already exist in that fixture.
- The `nodata` state does not exist in the committed payload (0 of 48 slots),
  so it was posed through `openApp`'s `analysisInputs` callback — never a
  scratch payload file — setting the whole field set the engine publishes for
  `Status.NO_DATA` on the first basal slot: `safety_status: 'no data'`,
  `days: 0`, `recommended: null`, `asserts_move: false`, `direction: null`,
  `estimate: {value: null, lo: null, hi: null, n: 0, wide: false}`,
  `annotation: 'no nights of steady data at this time yet'`. This override is
  defined inline in the capture script and was never written to disk as a
  fixture file.

## Matrix

Three non-asserting basal case-file states, each at 1440×900, in Light and
Dark, before and after (12 renders total):

- `basal-slot-nodata-<before|after>-1440x900-<light|dark>.png` — the posed
  no-data basal slot's case file, with its lane tile visible behind it.
- `basal-slot-hold-<before|after>-1440x900-<light|dark>.png` — a committed
  no-change ("hold") basal slot's case file.
- `basal-slot-insufficient-<before|after>-1440x900-<light|dark>.png` — a
  committed insufficient-evidence basal slot's case file, proving this state
  did NOT move.

## Review observations

- Before: the `nodata` and `hold` case-file heads both print "INSUFFICIENT
  EVIDENCE" — the same hardcoded fallback string — contradicting their own
  lane tile and sentence. The `insufficient` head already reads "insufficient
  evidence" correctly.
- After: the `nodata` head reads "no nights of steady data" (its lane tile's
  accessible name ends with that text) and the `hold` head reads "holds at
  current", both now matching their own lane tile. The `insufficient` head is
  unchanged — its before/after renders are byte-identical in both themes,
  confirming this state did not move.
- The asserting (`up`, "raise") head is unchanged and out of scope for this
  change; it is not rendered here because it carries no pixel difference to
  show — evidence for it is byte-identity against the base, per the work
  order.
