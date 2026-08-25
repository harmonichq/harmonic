# Scope ledger — Explore history-range selection (#138)

Map: #133. Sibling decision tickets: #134 (settled), #136 (settled), #137 (open).
Canvas lock that consumes this: #135 (triaged, blocked on #188).

## Grounding (verified live, 2026-08-25)

- The map's block is **lifted**. #82 closed 2026-08-24; the scan fixes #120 and
  #121, the pre-warm reconciliation #122 and the shared-preparation fix #126 are
  all closed; the durable sidecar artifact store ships as
  `ciq_autotune/derived_artifacts.py`.
- The sidecar is **exact-match and fixed-coordinate**: a hit requires the Store
  input revision, the complete ResultCache coordinates and the package source
  fingerprint to match. There is no nearest match and no partial-key fallback
  (ADR 82, `openspec/changes/persist-diagnose-derivations/design.md`).
- **No user-facing range control exists today.** Diagnose is fixed at
  `findings_projection.DIAGNOSE_SOURCE_WINDOW_DAYS = 30`;
  `/api/explore/time-of-day` and `/api/explore/exposures` take no window
  parameter at all; `explore_time_of_day._DATA_DAYS = 30` and
  `explore_exposures.build_exposures(window_days=30)` are internal constants.
  The frontend requests `window: 30` as a literal (`frontend/index.html:5368`).
- Measured cold cost of the dominant shape (ADR 82, operator snapshot, ~179 days
  of history): exposures 98.20s before the scan fixes, 37.93s after #121, on an
  Apple-silicon laptop; the home-lab host scales by about 3.0x.
- Explore is a **mode inside Diagnose**, not a route
  (`openspec/specs/surfaces/spec.md:23`), and #135 specifies it as advice-free:
  no ranking, no staging, no recommendation wording.
- Support floors that a shortened range would collide with:
  `safety._MIN_SUPPORTED_NIGHTS = 8` (basal) and `_MIN_SUPPORTED_BLOCK_RUNS = 8`
  (carb ratio).

## Decisions

- **The #82 block is lifted and this ticket is unblocked.** Verified live rather
  than read from the map body, which still records the block. Why: the map's
  dependency note predates #82 closing. `inline`

- **Changing the history stretch re-scopes charts only.** The ranked findings and
  every recommended number stay on their fixed 30 days no matter what stretch the
  reader is looking at. Why: the operator's ruling, "we should not present findings
  on untested time slices" — a reader-picked stretch feeding a dose recommendation
  lets a flattering stretch pick the advice. `-> ADR`
- **Selection is fixed choices plus a free start-and-end date pick**, in the shape
  of a Grafana time picker (quick ranges beside an absolute range). Why: the
  operator's ruling. `-> ADR`
- **"Since my last setting change" is deliberately deferred, and the picker is
  built to admit it.** Why: the operator expects to want it for Verify later, but
  it is not MVP; designing the mechanism around a closed set of quick ranges only
  would make the anchored range a rewrite rather than an addition. `-> ADR`
- **Quick ranges are relative to now and the absolute range is pinned**, per the
  Grafana model the operator named. Defaulted, not asked. `inline`

## Open questions

- Round 1 settled: what re-scopes (Q1 = charts only), how the range is chosen
  (Q2 = quick ranges + absolute date pick, anchored ranges deferred).
- Round 2 asks: where the picker is available (Q3), what a not-yet-computed
  stretch does (Q4), whether the stretch persists (Q5), how a thin stretch renders
  (Q6).

## Spawned tasks

(none yet)
