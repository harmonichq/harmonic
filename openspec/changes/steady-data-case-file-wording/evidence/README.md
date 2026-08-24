# Evidence — basal-slot case file names "nights of steady data"

All renders use committed or explicitly-scratch synthetic inputs. No personal or
production health data appears here.

## Provenance

- Before: base `605c529` (integration tip `codex/diagnose-cold-qa-batch`), served with
  `harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite`.
- After: this change's built revision (tip `9141bcd`), served with the same
  no-fetch command and generated SQLite bytes.
- Deterministic app opening and API reads: `frontend/diagnose-workstation-behavior.replay.mjs`
  `openApp`, `appSource: 'server'`.
- `*-case-insufficient-*` renders use the committed
  `mockups/diagnose-workstation.synthetic/payload.json` (an insufficient-evidence
  basal slot already exists in that fixture).
- `*-case-nodata-*` renders use an **uncommitted scratch copy** of that payload
  with the first insufficient-evidence basal slot (00:00) overwritten to the full
  `safety_status: 'no data'` field set the engine would produce for that status
  (`days: 0`, `recommended: null`, `asserts_move: false`,
  `estimate: {value: null, lo: null, hi: null, n: 0, wide: false}`,
  `annotation: 'no nights of steady data at this time yet'`). The scratch payload
  was never committed and no longer exists on disk after this evidence was captured.

## Matrix

Both surfaces at 1440×900, in Light and Dark, before and after:

- `basal-case-insufficient-<before|after>-1440x900-<light|dark>.png` — the
  insufficient-evidence basal slot's case file.
- `basal-case-nodata-<before|after>-1440x900-<light|dark>.png` — the no-data
  basal slot's case file (slot tile behind it carries the accessible name below).

## Review observations

- Before: the case file's support line and footnote read "N clean nights …",
  the sentence reads "too few clean nights to assert a direction here", and the
  no-data slot tile's accessible name is `"00:00 basal slot, no clean data"`.
- After: the case file's support line and footnote read "N nights of steady data
  …", the sentence reads "not enough nights of steady data yet to point one way"
  (insufficient) or "no nights of steady data at this time yet" (no data), and the
  no-data slot tile's accessible name is
  `"00:00 basal slot, no nights of steady data"`. No occurrence of "clean" in
  either case file.
