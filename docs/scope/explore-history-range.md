# Scope ledger — Explore history-range selection (#138)

Map: #133. Sibling decision tickets: #134 (settled), #136 (settled), #137 (open).
Canvas lock that consumes this: #135 (triaged; its #188 blocker closed —
verified live 2026-08-25).

## Grounding (verified live, 2026-08-25)

- The map's block is **lifted**. #82 closed 2026-08-24; the scan fixes #120 and
  #121, the pre-warm reconciliation #122 and the shared-preparation fix #126 are
  all closed; the durable sidecar artifact store ships as
  `ciq_autotune/derived_artifacts.py`.
- The sidecar is **exact-match and fixed-coordinate**: a hit requires the Store
  input revision, the complete ResultCache coordinates and the package source
  fingerprint to match. There is no nearest match and no partial-key fallback
  (ADR 82, `openspec/changes/persist-diagnose-derivations/design.md`) — with one
  deliberate, labeled exception: while an exact key recomputes, the newest
  prior-revision artifact with identical coordinates and marker may be served
  carrying its visible age (ADR 124, `derived_artifacts.load_latest_prior`).
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
  (I:C).

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

- **The picker appears only in Explore.** Switching to the advice-off mode is what
  unlocks a different stretch. Why: while advice is on screen, the numbers beside it
  came from the same stretch, so there is nothing to explain away. `-> ADR`
- **The chosen stretch holds while the app stays open and resets to 30 days on
  reload.** Why: matches the picker shape without a stretch chosen weeks ago
  silently framing today's reading. `-> ADR`
- **Explore applies no thin-data gate of its own; each chart states its own
  support.** The operator's ruling: "Explore just draws charts, it's up to those
  charts to make sure they're honest about their usefulness." Why: Explore asserts
  nothing, so thinness is a fact about the data rather than a hold on advice.
  `-> ADR`
- **The quick ranges are pre-warmed; an absolute date pick takes its wait.** Why:
  warming shrinks the cold set but cannot cover an unbounded absolute pick. `-> ADR`
- **60 and 90 days are the warmed stretches beside today's 30; all history is not
  warmed.** Why: all history grows without bound and re-earns its full cost every
  pull, while 60 and 90 stay fixed-size forever. `-> ADR`
- **Charts paint as each one is ready, never held for the slowest.** Why: the
  glucose-by-clock strip is a fraction of a second while the event evidence is the
  slow part. `-> ADR`
- **An absolute pick may reach arbitrarily far back, but the window length is
  capped at 90 days, with a stated wait rather than a refusal.** Consequence, stated
  to the operator and open to correction: "all history" is therefore not an offered
  stretch, and every request's compute cost is bounded by a 90-day window. `-> ADR`

- **Entering Explore computes all three warmed stretches (30, 60, 90) at once,
  through the existing cache-and-sidecar path.** Why: the operator's ruling —
  switching between stretches is instant afterwards, and the cost is one trigger
  on mode entry rather than hourly pre-warm burn (#82's saturation problem).
  `-> ADR`
- **A previously viewed window recomputes after the hourly pull; every Explore
  result stays keyed on the store's global input-data revision, exactly as the
  #82 epic's sidecar shipped it (ADR 123, `ciq_autotune/derived_artifacts.py`).** Why: the operator's ruling, "keep it light." A per-window exemption
  would be new keying machinery built on a premise the CGM feed violates — a
  sensor reconnect backfills `cgmDataType=[1]` rows into closed past windows, so
  "rows the pull cannot touch" does not hold. The cost is bounded by the 90-day
  window cap and paid only when a past stretch is re-picked across a pull.
  `-> ADR`
- **The range rides only on the Explore chart feeds as an explicit request
  parameter, and the backend clamps and enforces the 90-day maximum window.**
  Advice and findings endpoints accept no range parameter at all, so a
  reader-picked stretch is unrepresentable on the advice path — this is the risk
  contract, and it keeps the hold in the backend per the repo's no-frontend-gate
  invariant. Defaulted under the operator's "keep it light" delegation, not
  asked. `-> ADR`
- **While a stretch recomputes after a pull, Explore serves the prior
  revision's chart labeled with its age, exactly as Diagnose stale-serves
  (ADR 124).** Why: defaulted under the same delegation, open to correction —
  the labeled stale-serve path already exists, Explore is advice-free, and
  waiting instead would need a new per-surface hold. `-> ADR`

## Open questions

- Round 1 settled: what re-scopes (Q1 = charts only), how the range is chosen
  (Q2 = quick ranges + absolute date pick, anchored ranges deferred).
- Round 2 settled: picker in Explore only (Q3), pre-warm the quick ranges (Q4),
  session-scoped stretch (Q5), charts own their own honesty (Q6).
- Round 3 settled: warm 60 and 90 (Q7), paint chart by chart (Q8), no ceiling on
  how far back but a 90-day maximum window length (Q9).
- Round 4 settled: compute all three stretches on entering Explore (Q10 = B);
  a past window recomputes after the pull, revision-keyed as #82 shipped
  (Q11 = A, re-put with the corrected backfill premise after the operator's
  over-engineering flag; the original round's rec A — survive the pull — was
  withdrawn as new keying machinery on a false premise).
- The interface shape and the risk contract were defaulted, not asked, under
  the operator's "keep it light" delegation: range parameter on the chart feeds
  only, backend-enforced 90-day cap, no range parameter on advice endpoints,
  and recompute-in-progress served as ADR 124 labeled stale rather than a wait.
- Nothing remains open. The interview is complete.

## Spawned tasks

(none yet)
