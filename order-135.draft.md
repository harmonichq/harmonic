> Written by an AI agent operating for Connor Griffin. Verify before relying on it.

## Summary

Diagnose gets an evidence canvas: the glucose-by-clock chart condenses to a slim strip that keeps every slicing control, and the space beneath becomes a field of evidence charts the reader can swap, pin and compare against the slice.

* The glucose chart stops owning the screen. It becomes a strip along the top, keeping its clock presets, draggable windows and the midnight unroll gesture exactly as they work today.
* Beneath it, the charts behind each recommendation — the nights behind a basal slot, the fasting windows behind a correction factor, the meal runs behind a carb ratio — become a field the reader can work in. Clicking one brings it forward; the one it replaces goes back where it came from.
* Pinning holds a chart against the slicer, so the reader can drag the time window and watch that chart re-read live. Up to four can be held at once, and the layout is always a consequence of how many are held — never something the reader has to arrange.
* The app puts the most relevant chart in front of the reader when they change the slice, using the same ranking the findings queue already uses, and never displaces a chart the reader deliberately pinned.
* A new Explore mode lets the reader work the same evidence with all advice switched off — no ranking, no staging, no recommendation wording — without leaving Diagnose.
* The single global by-clock/by-event switch is retired: alignment becomes a property of each chart, so two charts held side by side can legitimately sit in different alignments.
* A live defect ships fixed as part of this: once a reader drills into a trace today there is no way back to the untraced view of the chart.
* Charts drawn in glucose all share one vertical scale within an arrangement, so two of them side by side can never look comparable while being drawn to different scales.
* The work is split four ways because the composition, the charts themselves, the modes layered over them, and the recorded evidence each fill a session on their own.
* Not in this ticket: how a findings card is priced and how rank is explained (#139); the "meal starts vs target" and "correction burden" charts, which have no data feed yet (follow-on); mobile-specific behavior, which is its own effort once this settles.

## Work order


```
WORK ORDER 135: Lock the Diagnose evidence canvas (focus-swap slots, Explore mode)
Open as: opus / high.
Execution: chunked, 4 sub-orders (0 parallel, 4 serial).
Launch: open a session at the model above and run `/ticket start 135`.
        It loads /orchestrate and coordinates the sub-orders itself.

Classification: code
Surface lifecycle: revise
Repo(s): harmonichq/harmonic (one ticket branch, one pull request)
Verification: uv run python -m pytest && node --test 'frontend/**/*.test.js' &&
              python3 scripts/check_adr_numbers.py && python3 scripts/check_owned_identifiers.py &&
              python3 scripts/check_public_allowlist.py && every generator --check step declared
              in AGENTS.md and CI, including the ones this ticket adds, then ALL NINE browser
              gate legs exactly as AGENTS.md lists them under "This is not the whole merge bar"
              — provision the environment with `eval "$(python3 scripts/ensure_browser_gate_env.py)"`
              and start the no-fetch server for the leg that needs it. Do not hand-copy a subset:
              CI runs nine (.github/workflows/ci.yml, the browser-gates matrix), and the bare
              commands fail closed without PLAYWRIGHT_MODULE, VENDOR_DIR, BASE_URL, TARGET and
              PAYLOAD.
Expectation: every command exits zero; the behavior replay reports every frozen story either
             replayed green or named in the amendment as a sanctioned retirement, and zero
             stories silently absent.
Review depth (whole diff): full (wide revision of the shipped advisory-evidence surface; every
             chunk is stamped full individually)
Profile: none

Blocked by
* #188 — the frozen behavior ledger is stale against its own replay (header claims 99
  executable entries; `frontend/diagnose-workstation-behavior.replay.mjs` exports 108), and
  `/ui-craft revise` requires the base inventory reconciled BEFORE a surface revision is
  designed. #188 reconciles it and adds the ledger-to-replay parity check. Do not dispatch
  chunk 1 until #188 has merged; building on a stale baseline lets this revision overwrite
  behavior that was already missing from the contract and then certify only its own state.

Dispatch preconditions — the coordinator confirms both before chunk 1
1. #188 merged, and the ledger/replay parity check green on this branch.
2. `mockups/diagnose-evidence-canvas.exploration/` committed, with its generator and `--check`
   step. It is derived from the operator's approved glass-cockpit v7 packet, which renders REAL
   PATIENT DATA. The coordinator prepares it WITH THE OPERATOR PRESENT and the operator confirms
   it is data-free before it is committed — a machine does not unilaterally certify that a file
   no longer contains someone's health data. No chunk agent may open the source packet.

Why sliced
* Multiple deliverable artifacts: app modules, the workstation stylesheet, generated synthetic
  fixtures with their --check steps, the frozen behavior ledger and its replay.
* Live run inside the ticket: acceptance needs the offline server plus Playwright browser legs
  replayed against the built app, not a unit suite.
* Lockstep copies of one fact: the synthetic Diagnose payload, the evidence captures and their
  generators are held identical only by their --check steps.
* Lifecycle-gated surface revision: a shipped surface whose behavior ledger must be honoured,
  amended and re-replayed.
* Anchor row: 79 (harmonic) — the four-way slice its trait combination mandates (feed/form
  semantics, the shipped consumer's composition, the mode layer, then generated evidence and
  live replay).

Wiring table — every value below has one producer and one named consumer
| Value | Produced by | Consumed by |
|---|---|---|
| `frontend/diagnose-evidence-charts.js` registry entries `{id, name, modes, coordinates, meta, option, thumbnail}` | chunk 1 | chunk 2 mounts them into tiles; chunk 3 lists thumbnails in the drawer |
| `coordinates` — the request coordinates a chart's feed needs (`view`/`factor`/`window` for event comparison, a slot for basal, `block_id` + generation for I:C) | chunk 1 declares them per entry | chunk 2 reads them to call the right client with the right arguments |
| the runtime tile descriptor `{chartId, mode, coordinates, data, state}` — distinct from a registry entry, one per mounted tile | chunk 2 | chunk 2 renders from it; chunk 3 reads `chartId` and `mode` for drill provenance |
| `renderCanvas(el, echarts, opts)` accepting an injected y-range instead of its hard-coded 40-300 | chunk 2 | chunk 2's strip, and any glucose-valued tile drawn through it |
| `option(mode, {data, range, explore, mini, window})` | chunk 1 | chunk 2 calls it per tile with the data and range it supplies |
| `thumbnail(data)` | chunk 1 | chunk 3 renders it in the explorer drawer |
| `glucoseRange(values)`, `GLUCOSE_STEP`, `GLUCOSE_ENVELOPE` | chunk 1 | chunk 2 calls `glucoseRange` ONCE per arrangement and passes the result as `range` to every glucose-valued `option` call |
| the four feed clients in `frontend/data.js`, including `fetchDiagnoseCarbRatioBlockEvidence` | chunk 1 | chunk 2 calls them and owns their loading/empty/error tile rendering |
| `{stale: true, message}`, the typed 409 result from `fetchDiagnoseCarbRatioBlockEvidence` | chunk 1 returns it instead of throwing | chunk 2 turns it into the `stale-generation` tile state and runs the recovery |
| the per-request tile state (`ok` / `empty` / `error` / `stale-generation`) | chunk 2 derives it per fetch | chunk 2 renders it; chunk 4 replays each of the four states |
| `PIN_CAP`, `arrangementFor(pinCount)`, `placeSeats(...)` in `frontend/diagnose-canvas-layout.js` | chunk 2 | chunk 3 calls `placeSeats` to apply seating policy |
| the canvas layout state `{focalId, pins, arrangement}` | chunk 2 | chunk 3 reads it for Explore, fullscreen and drill provenance |
| `docs/scope/135-behavior-retirements.md` | chunks 1, 2 and 3 append to it | chunk 4 reads it and folds every entry into the ledger amendment |
| the arrangement renders and replay output | chunk 4 | the coordinator, for the pull-request body |
| `mockups/diagnose-evidence-canvas.exploration/` | the coordinator, before chunk 1 | chunks 1, 2 and 3 build against it as the visual reference |

Context
* The Diagnose workstation is a SHIPPED surface. `node scripts/route.mjs --embodiment shipped
  --runnability runnable --declaration complete --data-source synthetic` returns
  `{"mode":"revise"}`. There is no lock manifest for it and none may be created; the contract
  is the frozen behavior ledger `mockups/finding-evidence-routing.behavior.md` (2289 lines)
  plus its replay `frontend/diagnose-workstation-behavior.replay.mjs` (4120 lines).
* Safe start, and the ONLY sanctioned way to run the app:
  `uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite`
  (database generated by `scripts/gen_revise_e2e_db.py`). Never run plain `harmonic serve` or
  any `harmonic fetch`.
* The binding spec is issue 135's prose. The operator-approved reference packet (glass-cockpit
  v7) renders REAL PATIENT DATA, lives only in a local session scratchpad, and can never be
  committed, attached to a pull request, or handed to a chunk agent. Every term the build must
  honour is transcribed into these sub-orders.
* BEFORE dispatching chunk 1, the coordinator derives a data-free version of that packet —
  same markup, stylesheet and geometry, every real value replaced by the committed synthetic
  captures — and commits it as `mockups/diagnose-evidence-canvas.exploration/` with its
  generator and a `--check` step in `.github/workflows/ci.yml`, exactly as AGENTS.md requires
  of any mockup that extracts from shipped source. That derivative is the VISUAL reference
  chunks 1-3 build against; the ledger governs behavior, the derivative governs geometry, and
  issue 135's prose wins over both. The coordinator does this itself because the source file
  holds real patient data and no chunk agent may open it.
* THE FRONTEND MODULE GRAPH IS SERVED BY EXPLICIT PER-FILE ROUTES. Every `frontend/*.js` and
  `*.css` the app reaches has its own `@app.get("/assets/<name>")` in `ciq_autotune/api.py`
  (see the block from line 448), and
  `tests/test_frontend_asset_routes.py::test_every_reachable_local_asset_has_a_route` asserts
  the served routes EQUAL the reachable module graph — missing or extra both fail. A new module
  with no route 404s in the browser and reddens the fast gate. Each chunk therefore adds the
  asset route for every module it creates. This is the ONE permitted exception to the
  do-not-touch-`api.py` boundary and it is limited to `/assets/*` routes; no chunk touches an
  API endpoint, a projection or a cache key.
* Today the canvas has ONE main chart host (`el('chart')`, glucose by clock with the drag
  window, brace grips and clock pan, handlers around lines 2337-2640) plus one
  `el('align-canvas')` host (declared at `frontend/diagnose-workstation.js:124`) switched by a
  single GLOBAL alignment control (`renderAlign` / `seg-align`, line 354). `.dw` is a two-row
  grid whose panes are `.canvas` and a 430px `.inspector`
  (`frontend/diagnose-workstation.css:140,181`).
* The three evidence feeds this canvas exists to show already ship and have NO frontend
  consumer: `/api/diagnose/basal-night-evidence` (#143),
  `/api/diagnose/isf-rest-window-evidence` (#144),
  `/api/diagnose/carb-ratio-block-evidence` (#145). All three tickets deliberately left chart
  axes and alignment to this one.
* `frontend/diagnose-workstation.css` is a VERBATIM port from an archived locked mock (see its
  header comment); any deviation is a behavior-ledger amendment, never a quiet edit.
* Decisions settled with the operator during triage, binding on every chunk:
  - Pin-count map: 0 focal+slots, 1 fifty-fifty with the strip, 2 stacked pair, 3 ONE-PLUS-TWO,
    4 quad. Issue 135's required-set sentence "three or four give the quad" is STRUCK as stale;
    the mock's STATE D and the evidence obligations win.
  - Glucose-valued charts in one arrangement share ONE computed y-range: fitted to the data,
    snapped outward to 20 mg/dL steps, always containing the 60-200 mg/dL envelope.
  - Ship the registry with the three landed evidence feeds plus the existing meals/lows event
    comparison. "Meal starts vs target" and "Correction burden" are follow-on.
  - Seating uses the existing server-published per-finding `event_chart` coordinate
    (`ciq_autotune/findings_projection.py:505`, null default at 685), falling back to registry
    order when null. Seats fill unpinned positions only, in order; surplus seats are DROPPED,
    never evicting a pin.
  - Global ALIGN is retired; alignment becomes per-chart.
  - Explore is entered from a two-position control in the canvas head.
  - Narrow viewport gets CSS linearization only. No mobile-specific tuning.
* The two derivations are spiked, executed and committed at
  `docs/scope/135-canvas-derivations.spike.mjs` (4 passing node tests). Port those literals; do
  not re-derive them from prose.
* Full decision trail: `docs/scope/135-evidence-canvas-build.md` on this branch.

Risk contract
* Must prevent: advisory content surviving in Explore (rank filament, rank chips, tallies,
  staging, recommendation copy); two glucose-valued charts in one arrangement drawn to
  different scales; a pinned chart evicted or re-seated by the app; one chart's alignment
  toggle changing another chart's alignment.
* Must recover: a feed that errors, returns empty, or answers 409
  `analysis_generation_mismatch` leaves its tile legible and NAMED — never a blank tile, and
  never a tile that reads as data. The 409 path refetches findings, acquires the current
  generation and redraws the affected tile with the shipped "Evidence changed. Refresh
  findings." wording, including for a chart the reader has pinned.
* Accepted failure: a single chart, the drawer or fullscreen failing renders a visible named
  state in that tile alone while the rest of the arrangement stays usable; the reader recovers
  by reselecting or reloading. Pins and focus are session-scoped by design, so losing them on
  reload is accepted, not a defect.
* Unsupported: more than four pinned charts; any arrangement persisting across sessions or
  across leaving Diagnose; viewports below the shipped breakpoint beyond linearized geometry.
* Evidence owed: the pin-count derivation and the shared glucose range (node tests); Explore's
  advisory extinguishment; the cap refused at the control; seats never evicting a pin; two
  pinned charts held in different alignments; the 409 recovery path; un-trace returning to the
  untraced view; the behavior replay green against the built app; renders of all five
  arrangements and both pin-transition directions at target width from synthetic fixtures.

Done when (whole ticket)
* The verification command above passes end to end on the merged branch.
* The behavior ledger carries this revision's amendment with its base SHA, every retirement
  from `docs/scope/135-behavior-retirements.md` recorded permanently (in the manner of the
  existing P44 entry), and the replay exercises every new story against the built app.
* All five derived arrangements plus both pin-transition end states are rendered from synthetic
  fixtures at the target width and attached to the pull request.
* `mockups/diagnose-evidence-canvas.exploration/` is committed, carries a provenance stamp,
  contains no real patient data, and its `--check` step passes in CI.
* No lock manifest exists for this surface.

Boundaries
* One ticket branch, one pull request. Chunks land on per-chunk branches cut from it and merge
  back.
* Only the coordinator records the change: the OpenSpec change folder, the ADR
  (`## ADR 135 — <title>` in `openspec/changes/<change>/design.md`), and the `mockups/INDEX.md`
  surface-ledger row.
* No chunk touches the analyzers, `safety.py`, any staging predicate, any API endpoint, any
  backend projection or any cache key. The single `api.py` exception is `/assets/*` routes.
* Never commit the reference mock, its renders, or any render of real patient data.
* Stop at the pull request. Do not merge.
```

```
SUB-ORDER 1/4 135: The evidence feeds and the chart forms
Mode: serial (first)
Agent: opus
Surface lifecycle: revise
Review depth: full (decides how the evidence behind an advisory number is fetched and drawn;
              a wrong axis, a per-chart scale or a swallowed stale generation misrepresents
              the evidence itself)
Capability owned: the evidence feeds and every registered chart's visual form — the feed
                  clients, the registry entries, their option builders and thumbnails, the
                  shared glucose range, the shared optical spine, and each entry's declared
                  request coordinates. MOUNTING these into the canvas, and all per-tile runtime
                  state, is chunk 2's.
Shared contracts owned: the chart registry entry shape
                  `{id, name, modes, meta(mode), option(mode, {data, range, explore, mini,
                  window}), thumbnail(data)}`, and the four feed clients including the typed
                  409 result shape `{stale: true, message}`.

Context
* Repo: harmonichq/harmonic, branch is the ticket branch. The Diagnose workstation is a SHIPPED
  surface; its contract is `mockups/finding-evidence-routing.behavior.md` plus
  `frontend/diagnose-workstation-behavior.replay.mjs`. Do not create a lock manifest and do not
  mock this surface from scratch.
* Safe start, the only sanctioned way to run the app:
  `uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite`. Never
  run plain `harmonic serve` or any `harmonic fetch`.
* You are FIRST on this branch. This chunk ships as tested, vue-free modules plus their
  fixtures; it MOUNTS NOTHING into the running surface and renders no tile. Chunk 2 builds the
  canvas that mounts your entries and renders their states.
* Your registry entries are PURE PRESENTATION over data handed in. `option` receives its
  chart's `data` and, for a glucose-valued chart, the already-computed arrangement `range`. Do
  not fetch inside an option builder and do not compute a range inside one: chunk 2 calls
  `glucoseRange` once per arrangement and passes the same result to every glucose-valued chart,
  which is what stops two charts in one quad sitting on different scales.
* Three evidence feeds already ship and have no frontend consumer yet. Each deliberately left
  its chart's axes and alignment to this ticket:
  - `/api/diagnose/basal-night-evidence` (#143): per basal slot, the roster of nights of steady
    data behind the estimate, each with delivered-vs-programmed evidence, plus the staging
    verdict and the directional-support count. Roster count and support count are DIFFERENT
    numbers by construction; the payload carries both and nothing downstream derives one from
    the other.
  - `/api/diagnose/isf-rest-window-evidence` (#144): analyzer-owned rest windows and the
    qualifying fasting steps, each step carrying its rest-window identity. Detected windows,
    qualifying windows and qualifying steps are three different counts; never infer support
    from window count. Correction-episode alignment is explicitly NOT available and must not be
    shown.
  - `/api/diagnose/carb-ratio-block-evidence` (#145): per carb-ratio block, the published
    meal-run roster with member rosters and CGM display bounds. The roster includes
    `in_pool: false` (directional-only) members while support counts only `in_pool` runs; both
    are carried and flagged per run. A block spanning midnight serves its runs like any other
    and the wrap is rendered, never dropped or truncated.
* `/api/diagnose/event-comparison` already ships the meals and lows cohorts and is the fourth
  registry member.
* THE BLOCK-EVIDENCE FEED HAS NO CLIENT YET, and its contract is stricter than its neighbours.
  It requires TWO parameters — `block_id` (a decimal minute) and `analysis_generation` — and
  answers 409 `analysis_generation_mismatch` with "Evidence changed. Refresh findings." when
  the generation has moved (`ciq_autotune/api.py:888-919`). `frontend/data.js` has no function
  for it; the nearest prior art is `fetchDiagnoseCarbRatioHistoryEvents` (`frontend/data.js:266`),
  which passes `analysis_generation` to a DIFFERENT endpoint
  (`/api/diagnose/carb-ratio-history/events`). YOUR JOB STOPS AT THE TRANSPORT. The shared
  `_send` helper (`frontend/data.js:48`) throws on every non-2xx, so your client must catch the
  409 specifically and return the typed result `{stale: true, message}` instead of throwing.
  You do NOT implement recovery: the stateful retry-and-refetch machinery is `refreshHistoryPair`
  at `frontend/diagnose-workstation.js:1223`, in a file chunk 2 owns and you may not edit, and
  chunk 2 extends it. Do not write a second, parallel generation check anywhere.
* DO NOT ADD AN ASSET ROUTE. The frontend module graph is served by explicit per-file routes
  in `ciq_autotune/api.py`, and
  `tests/test_frontend_asset_routes.py::test_every_reachable_local_asset_has_a_route` asserts
  routes EQUAL the reachable graph — failing on EXTRA routes as well as missing ones. Your module
  is not imported by anything until chunk 2 mounts it, so a route added here would be extra and
  would redden your own fast gate. Chunk 2 adds it in the commit that makes the module
  reachable. You do not touch `api.py` at all.
* Alignment today is a single GLOBAL control (`renderAlign` / `seg-align`,
  `frontend/diagnose-workstation.js:354`). Issue 135 retires it in favour of per-chart
  alignment. You supply each chart's supported alignments and its per-mode option builder;
  chunk 2 mounts the toggle and performs the retirement. Do not touch `renderAlign` here.
* `frontend/diagnose-workstation-chart.js` (1092 lines) holds the historical I:C meal-run event
  renderer. #145 named it prior art this work may reuse or replace and took no position; decide
  on the merits and say which you did.
* Every committed fixture is synthetic and generator-authored, carrying a provenance stamp, and
  ships its generator plus a `--check` drift step in the SAME change. A fixture without a
  generator is how real data gets committed.
* Frontend convention: pure logic in vue-free `.js` modules tested by
  `node --test 'frontend/**/*.test.js'`. Browser suites are `*.browser.test.mjs` and are not
  this chunk's job.
* Your VISUAL reference for every chart's form — axes, series, plot furniture, thumbnail
  treatment — is `mockups/diagnose-evidence-canvas.exploration/`, committed on this branch by
  the coordinator over synthetic data. Where it and issue 135's prose disagree, the prose wins
  and you report the disagreement rather than choosing in private.

Do
1. Add the four feed clients to `frontend/data.js`: basal night evidence, ISF rest-window
   evidence, carb-ratio block evidence, and the existing event comparison if it needs no
   change. The block-evidence client takes `block_id` and `analysis_generation`, catches the
   409 that `_send` would otherwise throw, and returns `{stale: true, message}` carrying the
   server's own "Evidence changed. Refresh findings." wording rather than a new string. It
   performs no retry and holds no state.
2. Create `frontend/diagnose-evidence-charts.js` exporting the chart registry. Each entry:
   `{id, name, modes, coordinates, meta(mode), option(mode, {data, range, explore, mini,
   window}), thumbnail(data)}`. `modes` is the ordered list of alignments that chart supports,
   or null when no alignment choice exists for it. `coordinates` declares what its feed needs to
   be requested — THE FOUR FEEDS ARE NOT UNIFORM: event comparison takes `view`, `factor` and a
   window (`frontend/data.js:233`), basal takes a slot, and I:C takes `block_id` plus the
   analysis generation. Without this, chunk 2 would have to hard-code a chart-to-client mapping
   the registry never declared. Entries carry NO fetch state: tile state is per-request and
   belongs to chunk 2.
3. Register: basal clean nights (#143), ISF rest windows (#144), one entry PER carb-ratio block
   (#145 — two blocks means two entries), and the existing meals/lows event comparison.
   Register nothing else; "meal starts vs target" and "correction burden" have no feed and are
   follow-on work.
4. Port the shared glucose range from `docs/scope/135-canvas-derivations.spike.mjs` verbatim:
   `GLUCOSE_STEP = 20`, `GLUCOSE_ENVELOPE = [60, 200]`, `glucoseRange(values)`. Export it for
   chunk 2 to call once per arrangement. Never call it inside an option builder.
5. Draw traces as continuous lines joined across gaps, never as sparse dashes. At narrow widths
   the cohort key sits BELOW the plot as a two-column list and never overpaints it. This closes
   the defect measured in #98, where the axis spanned 40-300 while every cohort sat between 100
   and 160.
6. Make alignment a per-chart property of the registry entry: `modes` lists the alignments a
   chart supports and `option(mode, ...)` builds for whichever is asked. Two charts must build
   in DIFFERENT alignments at the same time — no module-level current-alignment state anywhere.
7. Enforce the shared optical spine: charts sharing a row align on plot-area top and x-axis
   baseline regardless of title or legend height. Titles at label weight, values at data weight.
8. Render each entry's `thumbnail(data)` as a miniature instrument: engraved name, mono count,
   no axis furniture. Chunk 3 mounts these in the drawer; you produce them.
9. Add synthetic, generator-authored fixtures for every feed you consume that has none, each
   with its generator and a `--check` step added to `.github/workflows/ci.yml` in this same
   chunk, matching the eight that already exist.
10. Export, for each glucose-valued entry, the projection that yields its glucose values, so
   chunk 2 can compute one arrangement-wide range without knowing any payload's schema.
11. Append every frozen behavior-ledger story id this chunk retires or changes to
   `docs/scope/135-behavior-retirements.md`, creating the file if absent, one entry per line as
   `<story id> — <what changed> — chunk 1`. Chunk 4 folds this file into the ledger amendment;
   a retirement that exists only in your session report is lost.

Done when
* The full fast gate passes: `uv run python -m pytest`, `node --test 'frontend/**/*.test.js'`,
  the three guard scripts, and every generator `--check` step including the ones you add.
* `tests/test_frontend_asset_routes.py` is untouched and still passes; you added no route.
* Node tests prove: `glucoseRange` contains the 60-200 envelope and expands outward in 20 mg/dL
  steps; two entries build in different alignments simultaneously; roster counts and support
  counts are read from the payload and never derived from each other; the block-evidence client
  returns `{stale: true, message}` on a 409 rather than throwing or returning empty data.
* No option builder fetches, and no option builder computes a range.
* `docs/scope/135-behavior-retirements.md` carries this chunk's entries.
* You state whether `frontend/diagnose-workstation-chart.js` was reused or replaced.

Boundaries
* Touch only `frontend/diagnose-evidence-charts.js` and its test, `frontend/data.js`,
  the I:C meal-run event renderer in `frontend/diagnose-workstation-chart.js`, the fixtures and
  generators you add, their CI steps, and `docs/scope/135-behavior-retirements.md`. Do NOT touch
  `renderCanvas` in that same file — that is the glucose strip renderer and chunk 2 owns its
  range injection. Do not edit `frontend/diagnose-workstation.js`,
  `frontend/diagnose-workstation.css` or `ciq_autotune/api.py`.
* Chunk 2 owns the canvas composition, mounting these entries into tiles, all per-tile runtime
  state, computing the arrangement range, the per-chart alignment toggle and the
  global-ALIGN retirement. Chunk 3 owns Explore, seating policy, the drawer, fullscreen, drill
  provenance and un-trace. Chunk 4 owns the ledger, the replay and all browser evidence.
* Do not touch the analyzers, `safety.py`, any staging predicate, any API endpoint, any backend
  projection or any cache key. Consume the feeds as published; never recompute runs, windows,
  rosters or counts downstream.
* Never open, read, copy from, or commit the operator's local reference packet or any file
  holding real patient data. Your visual reference is the committed synthetic derivative and
  nothing else.
* Do not record the change; the coordinator owns that.
* Commit on this chunk's branch. Do not open a pull request, do not merge.
```

```
SUB-ORDER 2/4 135: The composition — strip, tile field, pin state, derived arrangements
Mode: serial after 1
Agent: opus
Surface lifecycle: revise
Review depth: full (rewires the shipped canvas and retires the global alignment control, a
              permanent behavior-ledger retirement on the advisory-evidence surface)
Capability owned: the canvas composition and how charts are mounted in it — strip condensation,
                  the tile field, focus-swap, pin state to a cap of four, the derived
                  arrangements, the pin-cap indicator, narrow-viewport linearization, the
                  per-chart alignment toggle, the retirement of the global alignment control,
                  MECHANICAL seat placement, each tile's per-request state, and the
                  stale-generation recovery.
Shared contracts owned: the canvas layout state `{focalId, pins: [chartId], arrangement}`,
                  `PIN_CAP`, `arrangementFor(pinCount)`, `placeSeats(...)`, the per-request tile
                  state (`ok` / `empty` / `error` / `stale-generation`), and the workstation
                  stylesheet's tile-field grid and depth tokens.

Context
* Repo: harmonichq/harmonic, branch is the ticket branch. The Diagnose workstation is a SHIPPED
  surface; its contract is `mockups/finding-evidence-routing.behavior.md` plus
  `frontend/diagnose-workstation-behavior.replay.mjs`. Do not create a lock manifest and do not
  mock this surface from scratch.
* Safe start, the only sanctioned way to run the app:
  `uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite`. Never
  run plain `harmonic serve` or any `harmonic fetch`.
* Today the canvas has ONE main chart host, `el('chart')` in
  `frontend/diagnose-workstation.js`, carrying the glucose-by-clock plot with its drag window,
  brace grips and clock pan (handlers around lines 2337-2640), plus one `el('align-canvas')`
  host (declared at line 124) switched by a single GLOBAL alignment control (`renderAlign` /
  `seg-align`, line 354). `.dw` is a two-row grid whose panes are `.canvas` and a 430px
  `.inspector` (`frontend/diagnose-workstation.css:140,181`).
* Chunk 1 has landed `frontend/diagnose-evidence-charts.js` and the feed clients in
  `frontend/data.js`. Registry entries are shaped
  `{id, name, modes, coordinates, meta(mode), option(mode, {data, range, explore, mini,
  window}), thumbnail(data)}`, where `modes` lists a chart's supported alignments and
  `coordinates` declares what that chart's feed needs to be requested — the four feeds are NOT
  uniform. Chunk 1 also exports, per glucose-valued entry, the projection yielding its glucose
  values. Its option builders are
  PURE: they neither fetch nor compute a range. You supply both. Do not change a chart's form,
  its option builder, its thumbnail or the `glucoseRange` function.
* YOU OWN THE STALE-GENERATION RECOVERY. Chunk 1's block-evidence client is transport only: it
  catches the 409 `analysis_generation_mismatch` that the shared `_send` helper
  (`frontend/data.js:48`) would otherwise throw, and returns `{stale: true, message}`. The
  stateful retry-and-refetch machinery already exists as `refreshHistoryPair`
  (`frontend/diagnose-workstation.js:1223`), in a file you own. EXTRACT or EXTEND that
  primitive; do not write a second, parallel generation check. One fact with two
  implementations diverges.
* YOU ADD EVERY ASSET ROUTE THIS TICKET NEEDS — chunk 1's module as well as your own. The
  frontend module graph is served by explicit per-file routes in `ciq_autotune/api.py` (block
  from line 448), and
  `tests/test_frontend_asset_routes.py::test_every_reachable_local_asset_has_a_route` asserts
  routes EQUAL the reachable graph, failing on EXTRA routes as well as missing ones. Chunk 1
  deliberately added none, because its module was not yet imported by anything. Your commit is
  the one that makes both reachable, so it is the one that adds both routes. That is your ONLY
  permitted edit to `api.py`.
* THE SHARED RANGE CANNOT REACH THE CHARTS UNTIL YOU REFACTOR TWO SHIPPED RENDERERS. The glucose
  strip's `renderCanvas` accepts no range and hard-codes `min: 40, max: 300, interval: 60`
  (`frontend/diagnose-workstation-chart.js:833`), and the meals/lows comparison builder
  hard-codes the same (`frontend/diagnose-event-comparison.js:565`). Both must accept an injected
  range. You own that refactor in both files — it is the only way the one-range decision holds,
  and duplicating either renderer instead would violate the repo's one-implementation rule.
* `frontend/diagnose-workstation.css` is a VERBATIM port from an archived locked mock (its
  header comment says so). Structural deviation is sanctioned here by issue 135, and you record
  the retirements it causes.
* `frontend/diagnose-high-causes-have-no-alignment.test.js` asserts on LITERAL SOURCE. YOU own
  its alignment assertions only — the `caseAlignmentIn` / `availableAlignment` pair at lines
  92-96, which retiring the global control will break. Chunk 3 separately owns the
  finding-entry assertion at lines 84-86 (`entryAlignment = eventChartsOnly &&
  eventChartCoordinate(row)`), which its seating change will break. Update YOUR assertions to
  the per-chart shape and leave chunk 3's alone. Do not delete the test or weaken either
  assertion into a tautology.
* ADR 130 governs the clock window: it is a scope on a circular day, unrolled only while a hand
  is on it. The strip inherits that gesture unchanged — there is no standing axis-origin
  toggle, and a gate crossing midnight renders contiguously.
* Frontend convention: pure logic lives in vue-free `.js` modules tested by
  `node --test 'frontend/**/*.test.js'`. Browser-driven suites are named `*.browser.test.mjs`
  and are NOT this chunk's job.
* Your VISUAL reference is `mockups/diagnose-evidence-canvas.exploration/`, committed on this
  branch by the coordinator: it carries the approved composition's geometry, gutters, edge
  treatment and arrangement states over synthetic data. Build the strip, tile field and depth
  idiom to match it. Where it and issue 135's prose disagree, the prose wins and you report the
  disagreement rather than choosing in private.

Do
1. Create `frontend/diagnose-canvas-layout.js`, a vue-free module owning canvas layout state.
   Port the literals from `docs/scope/135-canvas-derivations.spike.mjs` verbatim: `PIN_CAP = 4`
   and `arrangementFor(pinCount)` mapping 0→focal, 1→split, 2→pair, 3→onetwo, 4→quad. Add
   `placeSeats(...)`, the MECHANICAL placement function: given a list of candidate chart ids and
   the current pin state, it returns where each lands, filling unpinned positions in order and
   DROPPING surplus candidates rather than evicting a pin. It decides placement only; WHICH
   charts are candidates is chunk 3's policy and is passed in.
2. Add `frontend/diagnose-canvas-layout.test.js` covering: each pin count deriving its
   arrangement; a fifth pin refused rather than evicting the oldest; a demoted chart returning
   to the slot it came from; `placeSeats` filling only unpinned positions; surplus candidates
   dropped with every pin intact.
3. Condense the glucose-by-clock chart into a full-width strip of about 240px at the top of the
   canvas, retaining every slicing control it has today — clock presets, the draggable window
   with its brace grips, and ADR 130's midnight unroll. Slicing behavior must be unchanged; only
   its height and position move.
4. Build the tile field beneath the strip. Define the runtime TILE DESCRIPTOR
   `{chartId, mode, coordinates, data, state}` — one per mounted tile, distinct from a registry
   entry, which is stable and stateless. For each tile: read its entry's `coordinates`, call the
   matching chunk-1 feed client with them, then compute the arrangement's glucose range ONCE by
   calling `glucoseRange` over the values chunk 1's per-entry projection yields for every
   glucose-valued chart currently displayed, and pass both into `option(mode, {data, range, ...})`.
   Every glucose-valued chart in one arrangement receives the identical `range` — two charts side
   by side must never sit on different scales.
5. Refactor `renderCanvas` (`frontend/diagnose-workstation-chart.js`) and the meals/lows option
   builder (`frontend/diagnose-event-comparison.js`) to accept that injected range in place of
   their hard-coded 40-300, and pass the computed range to the strip too. Do not duplicate either
   renderer.
6. Derive each tile's state per fetch — `ok`, `empty`, `error`, `stale-generation` — and render
   a NAMED state for each. A blank tile, or a tile that reads as data when it has none, is a
   defect. On `{stale: true}` from the block-evidence client, run the recovery through the
   extended `refreshHistoryPair` primitive: refetch findings, acquire the current generation,
   redraw, and surface the server's "Evidence changed. Refresh findings." wording — including
   for a chart the reader has pinned.
7. One click on a slot chart swaps it into the focal position and the demoted chart returns to
   the slot it came from. No modifier-click, no long-press, no hidden layout verb.
8. Implement pinning with one verb that both holds a chart against the slicer and layers it into
   view. Layout is DERIVED from pin count via `arrangementFor`; there are no drag handles, no
   resize gutters and no layout preset picker anywhere in the chrome.
9. Render the pin-cap indicator in the window bar as a live schematic of the tile field in the
   current arrangement's geometry: filled cells occupied (accent pinned, neutral seated),
   exactly one dashed hollow cell marking where the next chart lands, and NO hollow cell at the
   cap. Machined, not glossy.
10. In `frontend/diagnose-workstation.css`, implement the depth idiom: every pane carries a 1px
   inset edge ring with a faint top-edge highlight and a 1-2px radius (the inspector stays
   flush, no radius), over a soft pooled shadow in the gutters. Gutters are a uniform 8px token
   on both axes including outer. The trench substrate is the darkest value on screen, below tile
   ground, below app ground. Held state is a WARMED EDGE: a pinned tile's edge ring tints to the
   accent with a stronger top highlight, and ground never changes — no grey lift anywhere.
11. At the stylesheet's existing narrow breakpoint, linearize the tile field by CSS alone: strip
   on top, then the focal chart, then each pinned chart in pin order, one per row, vertically
   scrolled. Pin state and the pin-cap indicator are retained; only geometry goes linear. Add no
   mobile-specific tuning.
12. Mount each chart's own alignment toggle on the tile itself, reading the registry entry's
   `modes`. Two pinned charts sitting in different alignments is a legitimate comparison and
   must work. Then retire the global control: `renderAlign`, `seg-align` and the single
   `el('align-canvas')` host all come out.
13. Add the `/assets/*` route in `ciq_autotune/api.py` for BOTH chunk 1's module and every
   module you create — your commit is the one that makes them reachable — and keep
   `tests/test_frontend_asset_routes.py` green.
14. Arrangements must not survive the session: pins and focus reset on leaving Diagnose and are
   never persisted.
15. Append every frozen behavior-ledger story id this chunk retires or changes to
   `docs/scope/135-behavior-retirements.md`, one entry per line as
   `<story id> — <what changed> — chunk 2`. The global-ALIGN retirement is the largest and must
   appear there; a retirement that exists only in your session report is lost.

Done when
* The full fast gate passes: `uv run python -m pytest`, `node --test 'frontend/**/*.test.js'`,
  the three guard scripts and every generator `--check` step.
* `tests/test_frontend_asset_routes.py` passes with a route for chunk 1's module and every
  module you created — no missing routes and no extra ones.
* A test proves the strip and the meals/lows comparison both draw on the injected range rather
  than a hard-coded 40-300.
* `frontend/diagnose-canvas-layout.test.js` covers every case in step 2 and passes.
* The five arrangements are reachable by pinning alone, each tiling real registry charts, and a
  fifth pin is refused at the control.
* A test proves every glucose-valued chart in one arrangement receives the identical `range`.
* Each of the four tile states renders its own named state, and a test drives the 409 path end
  to end: typed result in, recovery run, tile redrawn, pin intact.
* No global alignment control remains anywhere in the surface, and two tiles can hold different
  alignments at once.
* No drag handle, resize gutter or layout preset picker exists anywhere in the chrome.
* `docs/scope/135-behavior-retirements.md` carries this chunk's entries.

Boundaries
* Touch only `frontend/diagnose-canvas-layout.js`, `frontend/diagnose-canvas-layout.test.js`,
  `frontend/diagnose-workstation.css` (tile-field grid and depth tokens), the composition,
  mounting and alignment wiring in `frontend/diagnose-workstation.js`, `renderCanvas` in
  `frontend/diagnose-workstation-chart.js` and the option builder in
  `frontend/diagnose-event-comparison.js` (range injection ONLY — do not restyle either), the
  alignment assertions at lines 92-96 of
  `frontend/diagnose-high-causes-have-no-alignment.test.js`, the `/assets/*` routes in
  `ciq_autotune/api.py`, and `docs/scope/135-behavior-retirements.md`.
* Chunk 1 owns the registry entry shape, every chart's form, the feed clients and
  `glucoseRange` — call them, do not redefine them. Chunk 3 owns Explore, all seating POLICY,
  the explorer drawer, fullscreen, drill provenance, un-trace, and the finding-entry assertion
  at lines 84-86 of that test file. Chunk 4 owns the behavior ledger, the replay and all browser
  evidence. Do not implement any of those here.
* Do not touch the analyzers, `safety.py`, any staging predicate, any API endpoint, any backend
  projection or any cache key. The single `api.py` exception is `/assets/*` routes.
* Never open, read, copy from, or commit the operator's local reference packet or any file
  holding real patient data. Your visual reference is the committed synthetic derivative and
  nothing else.
* Do not record the change; the coordinator owns that.
* Commit on this chunk's branch. Do not open a pull request, do not merge.
```

```
SUB-ORDER 3/4 135: Explore mode, seating policy, the explorer drawer, fullscreen, un-trace
Mode: serial after 2
Agent: opus
Surface lifecycle: revise
Review depth: full (Explore must extinguish every advisory mark; advice surviving into an
              advice-free mode misleads a reader about what the app is claiming)
Capability owned: the mode layer over the canvas — Explore entry and exit, all seating POLICY
                  (which charts are candidates and in what order), the explorer drawer,
                  temporary fullscreen, drill provenance and un-trace.
Shared contracts owned: none.

Context
* Repo: harmonichq/harmonic, branch is the ticket branch. The Diagnose workstation is a SHIPPED
  surface; its contract is `mockups/finding-evidence-routing.behavior.md` plus
  `frontend/diagnose-workstation-behavior.replay.mjs`. Do not create a lock manifest and do not
  mock this surface from scratch.
* Safe start, the only sanctioned way to run the app:
  `uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite`. Never
  run plain `harmonic serve` or any `harmonic fetch`.
* Chunks 1 and 2 have landed. Chunk 1 owns the chart registry entry shape
  `{id, name, modes, coordinates, meta, option, thumbnail}` and every chart's `thumbnail(data)`.
  Chunk 2 owns the canvas layout state `{focalId, pins, arrangement}`, `PIN_CAP`,
  `arrangementFor(pinCount)`, the MECHANICAL placement function `placeSeats(...)`, the
  per-chart alignment toggle and the runtime tile descriptor `{chartId, mode, coordinates, data,
  state}`. Read both; reimplement neither.
* THE SEATING SEAM IS MECHANISM VERSUS POLICY. `placeSeats` (chunk 2) decides WHERE a list of
  candidate charts lands: it fills unpinned positions in order and drops surplus candidates
  rather than evicting a pin. YOU decide WHICH charts are candidates and in what order, and you
  call `placeSeats` with that list. Never re-derive placement, and never place a chart yourself.
* Findings carry a server-published per-finding chart coordinate: `event_chart` on each
  projected row (`ciq_autotune/findings_projection.py:505`, null default at line 685), read in
  the frontend by `eventChartCoordinate` (`frontend/diagnose-findings-queue.js:60`). That
  coordinate is your seating source in findings mode. Widening it into an ordered multi-chart
  `seats` list is filed as follow-on work and is NOT in this chunk.
* `frontend/diagnose-high-causes-have-no-alignment.test.js` asserts on LITERAL SOURCE. YOU own
  its finding-entry assertion only — lines 84-86,
  `entryAlignment = eventChartsOnly && eventChartCoordinate(row)`, which your seating change
  rewrites. Chunk 2 separately owns the alignment assertions at lines 92-96. Update YOUR
  assertion to the seating shape and leave chunk 2's alone. Do not delete the test or weaken
  either assertion into a tautology.
* THE INSPECTOR HAS TWO FAMILIES, AND BOTH ALREADY SHIP. Do not build a chart-keyed case file;
  route each chart to the content its own family already has.
  - BEHAVIORAL charts (the meals/lows event comparison) map to a behavioral finding, whose row
    is `id: "finding:<lever>"`, `register: "finding"`, `kind: "habit"`
    (`ciq_autotune/findings_projection.py:484`). That row's case file is the when-it-lands
    histogram, cohort counts, occurrence roster and day traces, served by
    `/api/diagnose/finding-case-file` and addressed by `finding_id`. `Lever` is the closed
    eight-member behavioral taxonomy (`ciq_autotune/analyzers/scenario/levers.py:47`).
  - PARAMETER charts (basal nights, ISF rest windows, I:C block runs) are NOT findings. Their
    rows are `id: "basal:<start>-<end>"`, `kind: "setting"`
    (`ciq_autotune/findings_projection.py:314`), and they never had a case file. Their evidence
    detail comes from the same evidence endpoint the chart itself draws from — which is exactly
    what #143/#144/#145 built. Those endpoints take a slot, window or `block_id` coordinate, NOT
    a finding id, so they serve a chart whether or not a finding exists for it.
  The only chart that can legitimately have no inspector content is a behavioral one whose lever
  is withheld; that case renders a named placeholder. The day-trace feed is REUSED, never
  re-derived, and no new backend projection is in scope.
* Live defect shipping fixed here by operator ruling: once a reader drills into a trace in the
  inspector today, there is no way back to the untraced view of the selected chart.
* THE FRONTEND MODULE GRAPH IS SERVED BY EXPLICIT PER-FILE ROUTES in `ciq_autotune/api.py`
  (block from line 448), and
  `tests/test_frontend_asset_routes.py::test_every_reachable_local_asset_has_a_route` asserts
  routes EQUAL the reachable graph. Add the `/assets/*` route for every module you create, in
  the same commit. That is your ONLY permitted edit to `api.py`.
* Frontend convention: pure logic in vue-free `.js` modules tested by
  `node --test 'frontend/**/*.test.js'`. Browser suites are `*.browser.test.mjs` and are not
  this chunk's job.
* Your VISUAL reference for the drawer, the Explore treatment and fullscreen is
  `mockups/diagnose-evidence-canvas.exploration/`, committed on this branch by the coordinator
  over synthetic data. Where it and issue 135's prose disagree, the prose wins and you report
  the disagreement rather than choosing in private.

Do
1. Add a two-position control in the canvas head, Findings | Explore, entering and leaving
   Explore without leaving Diagnose.
2. In Explore, extinguish the entire advisory layer: the rank filament, rank chips, tallies,
   staging and all recommendation copy. Pins KEEP their accent — a pin is the reader's own
   selection, not advice — and the measured signal keeps its own colour. The strip margin
   states that advice is off.
3. Implement seating POLICY for findings mode: changing the time slice, or entering findings
   mode, seats the chart belonging to the top-ranked finding in the current slice with zero
   interaction, using that row's `event_chart` coordinate and falling back to registry order
   when it is null. Build the candidate list, pass it to chunk 2's `placeSeats`, and let that
   function place them. A pin outranks any recommendation and is never evicted.
4. In Explore, the candidate list is the explorer's natural registry order instead.
5. Build the explorer drawer as a summonable bottom drawer of every registered chart's
   `thumbnail(data)`. It claims a row of its own and NEVER occludes a plot. It sits in the tile
   field's trench rhythm with no per-cell boxes; seated cells speak the same warmed edge as a
   pinned tile; per-cell ordinals sit at low contrast with one quiet ESC. No keycap boxes, no
   status-line legend.
6. Add temporary fullscreen for any chart, completely hiding the glucose strip. One dismiss
   restores the exact prior arrangement with every pin intact.
7. Route each selected chart to its family's existing inspector content per the two-family rule
   above: a behavioral chart to its `finding:<lever>` case file, a parameter chart to its own
   evidence endpoint's detail, and a withheld behavioral lever to a named placeholder. Build no
   chart-keyed case file and add no backend projection.
8. Implement drill provenance: the inspector always names which chart it is drilled into, and
   that chart carries a visible mark while it owns the inspector. The pairing must be legible
   from a still frame in BOTH modes.
9. Fix un-trace: a drawn trace, day or occurrence, gets an explicit dismiss returning the chart
   to its untraced view without leaving the chart or leaving the drill-down.
10. Keep the slice gate rendering honest: in-gate band emphasis clips exactly at the gate's edge
   rules so shading never overruns the selectors, and the gate edges carry visible drag handles
   inheriting the shipped clock-window brace grips.
11. Add the `/assets/*` route in `ciq_autotune/api.py` for every module you create, and keep
   `tests/test_frontend_asset_routes.py` green.
12. Nice-to-have, cut either if it costs correctness: a light hover preview of what focusing a
   slot chart would give (cut it if it flickers), and keyboard 1-4 to focus a slot with Esc
   leaving fullscreen.
13. Append every frozen behavior-ledger story id this chunk retires or changes to
   `docs/scope/135-behavior-retirements.md`, one entry per line as
   `<story id> — <what changed> — chunk 3`. A retirement that exists only in your session
   report is lost.

Done when
* The full fast gate passes: `uv run python -m pytest`, `node --test 'frontend/**/*.test.js'`,
  the three guard scripts and every generator `--check` step.
* `tests/test_frontend_asset_routes.py` passes with a route for every module you created.
* Node tests prove: Explore extinguishes every advisory mark while pins keep their accent; the
  findings candidate list comes from the top-ranked row's `event_chart` and falls back to
  registry order when null; seating goes through `placeSeats` and never evicts a pin; fullscreen
  dismissal restores the exact prior arrangement with pins intact; un-trace returns the chart to
  its untraced view while the drill-down stays open.
* The inspector names its drilled chart, and that chart is marked, in both modes.
* No arrangement persists across leaving Diagnose.
* `docs/scope/135-behavior-retirements.md` carries this chunk's entries.

Boundaries
* Touch only the mode, seating-policy, drawer, fullscreen, inspector-provenance and un-trace
  wiring in `frontend/diagnose-workstation.js`, any new vue-free module you add for that logic
  with its test, the drawer and fullscreen rule blocks you add to
  `frontend/diagnose-workstation.css`, the finding-entry assertion at lines 84-86 of
  `frontend/diagnose-high-causes-have-no-alignment.test.js`, the `/assets/*` routes you add in
  `ciq_autotune/api.py`, and `docs/scope/135-behavior-retirements.md`.
* Do not redefine chunk 2's layout derivation, `placeSeats`, tile-field grid, depth tokens,
  alignment toggle or tile-state rendering. Do not redefine chunk 1's registry entry shape, chart
  forms, feed clients or `glucoseRange`. Chunk 4 owns the ledger, the replay and all browser
  evidence.
* Do not widen the `event_chart` coordinate into a multi-chart seats list; that is filed
  follow-on work.
* Do not touch the analyzers, `safety.py`, any staging predicate, any API endpoint, any backend
  projection or any cache key. The single `api.py` exception is `/assets/*` routes. Reuse the
  shipped day-trace feed; never re-derive it.
* Never open, read, copy from, or commit the operator's local reference packet or any file
  holding real patient data. Your visual reference is the committed synthetic derivative and
  nothing else.
* Do not record the change; the coordinator owns that.
* Commit on this chunk's branch. Do not open a pull request, do not merge.
```

```
SUB-ORDER 4/4 135: The behavior ledger amendment, the replay, and the browser evidence
Mode: serial after 3
Agent: opus
Surface lifecycle: revise
Review depth: full (this chunk is the proof the other three are correct; a false green here
              certifies a surface that misreads evidence)
Capability owned: the surface's frozen contract and its rendered evidence — the behavior ledger
                  amendment, the replay stories, the browser suites, the synthetic captures and
                  the arrangement renders.
Shared contracts owned: the frozen behavior ledger and its replay script.

Context
* Repo: harmonichq/harmonic, branch is the ticket branch. The Diagnose workstation is a SHIPPED
  surface. The contract is `mockups/finding-evidence-routing.behavior.md` (2289 lines) plus
  `frontend/diagnose-workstation-behavior.replay.mjs` (4120 lines). No lock manifest may be
  created for this surface, and none may be created by this chunk.
* Safe start, the only sanctioned way to run the app, and the server the replay runs against:
  `uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite`. Never
  run plain `harmonic serve` or any `harmonic fetch`.
* THE COCKPIT BROWSER GATE WILL BREAK WITHOUT YOU. `frontend/cockpit-shell.browser.test.mjs`
  routes the app through a synthetic table that stubs only four Diagnose endpoints —
  `finding-case-file-preparation` (line 322), `finding-case-file` (367), `event-comparison` (380)
  and `findings` (408) — and any other `/api/*` path falls through to its file-serving branch
  (line 431) and fails. Once the default Diagnose surface fetches evidence tiles, that gate goes
  red. You own that file: add synthetic stubs for `basal-night-evidence`,
  `isf-rest-window-evidence` and `carb-ratio-block-evidence`, including one that returns 409 so
  the stale-generation state is exercised.
* Chunks 1-3 have landed the feeds and chart forms, the composition, and the mode layer on this
  branch. EVERY story id they retired or changed is written to
  `docs/scope/135-behavior-retirements.md`, one entry per line as
  `<story id> — <what changed> — chunk <n>`. That committed file is your input; read it from
  the branch. Do not rely on any list handed to you in conversation.
* The ledger's own conventions: a revision is a `## Revision — <date>, base <sha> (issue N:
  <what>)` section; a retirement is a PERMANENT entry, in the manner of the existing
  `### RETIRED — rendered window-membership caption (2026-08-20)` entry and the P44 lane
  retirement recorded at line 1164. A retired behavior never simply disappears from the ledger.
* Browser suites are named `*.browser.test.mjs` so the fast gate's glob can never discover them.
  All browser legs FAIL CLOSED: a missing driver, vendored asset or fixture exits nonzero naming
  what is absent, rather than skipping. `frontend/browser-gates-fail-closed.test.js` is the
  dependency-free regression test for that property; keep it true.
* A sandboxed agent CANNOT launch Chromium. Under a seatbelt sandbox every browser leg dies at
  launch with `bootstrap_check_in ... Permission denied (1100)`, surfacing as
  `browserType.launch: Target page, context or browser has been closed`. That is the sandbox,
  not a defect in the suite or the change. Re-run with escalated permissions. NEVER report a
  browser gate as failing, and never edit code to chase one, from a sandboxed run.
* Local browser setup is the one-time Playwright + Chromium + vendored-module provisioning in
  AGENTS.md; `eval "$(python3 scripts/ensure_browser_gate_env.py)"` sets PLAYWRIGHT_MODULE and
  VENDOR_DIR on a machine that runs the gates repeatedly.
* Every committed fixture is synthetic and generator-authored with a provenance stamp, and ships
  its generator and `--check` step in the same change.

Do
1. Write this revision's amendment into `mockups/finding-evidence-routing.behavior.md`: a
   `## Revision — <date>, base <sha> (issue 135: the evidence canvas)` section recording the
   safe-start declaration, its quoted command and its synthetic data source.
2. Read `docs/scope/135-behavior-retirements.md` and record EVERY entry in it as a permanent
   ledger retirement, each naming what was retired and why. Global ALIGN and the single
   `align-canvas` host are the largest. A story that simply vanishes from the ledger is a
   defect, and an entry in that file with no matching ledger entry is an incomplete amendment.
3. Write the new stories into the ledger and into
   `frontend/diagnose-workstation-behavior.replay.mjs`, one per behavior this revision adds:
   focus-swap and the demoted chart's destination; each of the five pin-count arrangements; the
   cap refused at the control; seating into unpinned positions; a surplus candidate dropped with
   pins intact; two charts held in different alignments; one shared glucose range across an
   arrangement; each of the four tile states including the 409 stale-generation recovery;
   THE LIVE RE-READ DURING A SLICER DRAG — hold a chart, drag the window through an intermediate
   position, and assert its data or its request CHANGED BEFORE the drag was released, then repeat
   across the midnight-unroll path. This is the gesture pinning exists for, and an endpoint-only
   screenshot passes while mid-drag is broken, flickering, or dead;
   fullscreen dismissal restoring the exact prior arrangement; Explore extinguishing every
   advisory mark while pins keep their accent; drill provenance naming and marking the chart in
   both modes; un-trace returning to the untraced view; the narrow linearization.
4. Add the three missing evidence stubs, plus a 409 stub, to
   `frontend/cockpit-shell.browser.test.mjs`'s synthetic route table so that gate stays green.
   Then extend `frontend/diagnose-workstation.browser.test.mjs` to cover the canvas states the
   replay does not, and regenerate `mockups/diagnose-workstation.synthetic/payload.json` and any capture
   the new charts need, through their committed generators with `--check` steps.
5. Render all five derived arrangements (focal + strip, fifty-fifty, stacked pair, one plus two,
   quad) at the real target width from synthetic fixtures. The quad is the densest and the most
   likely to fail, so it is NOT optional. Render both pin-transition end states in both
   directions; the demoted chart's destination must be obvious from a still frame.
6. Run ALL NINE browser gate legs, exactly as AGENTS.md lists them under "This is not the whole
   merge bar" and as `.github/workflows/ci.yml`'s browser-gates matrix runs them — Day lifecycle,
   Diagnose workstation, Cockpit shell, browser-runner lifecycle, first-plan reconcile, the
   Diagnose behaviour replay, the event-comparison replay, the event-comparison support audit,
   and the Verify 660 story replay. Provision with
   `eval "$(python3 scripts/ensure_browser_gate_env.py)"` and start the no-fetch server for the
   leg that needs it. Every leg fails closed without its PLAYWRIGHT_MODULE, VENDOR_DIR, BASE_URL,
   TARGET and PAYLOAD, so run the full documented command, not a shortened one. Attach the output.
7. Hand the coordinator the render set and the replay output for the pull request body. Never
   commit or attach any render of real patient data; every render here comes from synthetic
   fixtures.

Done when
* The whole-ticket verification passes end to end, ALL NINE browser legs included, from a
  NON-sandboxed run.
* A replay story proves a pinned chart re-reads DURING a slicer drag, not only after release,
  including across the midnight unroll.
* Every line in `docs/scope/135-behavior-retirements.md` has a matching permanent retirement
  entry in the ledger.
* Every frozen story either replays green against the built app or appears in the amendment as a
  sanctioned, permanently recorded retirement. Zero stories are silently absent.
* Every behavior in step 3 has a replay story that exercises it against the built app.
* All five arrangement renders and both pin-transition end states exist, from synthetic
  fixtures, at the target width.
* `frontend/cockpit-shell.browser.test.mjs` passes with stubs for all three new evidence
  endpoints and its 409 case.
* `frontend/browser-gates-fail-closed.test.js` still passes, and no new browser leg can pass
  while silently running zero assertions.
* No lock manifest exists for this surface.

Boundaries
* Touch only `mockups/finding-evidence-routing.behavior.md`,
  `frontend/diagnose-workstation-behavior.replay.mjs`,
  `frontend/diagnose-workstation.browser.test.mjs`, `frontend/cockpit-shell.browser.test.mjs`
  (its synthetic route table only), and the synthetic captures and payload under
  `mockups/diagnose-workstation.synthetic/` with their generators and CI steps.
* Do not change app behavior to make a story pass. A story that fails is a finding you return to
  the coordinator, not a licence to edit chunks 1-3's code. The coordinator dispatches the fix
  to the chunk that owns the code, and you re-run this chunk's verification afterwards; you
  never edit another chunk's files to turn a story green.
* Do not create a lock manifest, and do not pin a fidelity ledger to this app template; neither
  exists for a shipped surface under `revise`.
* Do not touch the analyzers, `safety.py`, any staging predicate, any API endpoint, any backend
  projection or any cache key.
* Never open, read, copy from, or commit the operator's local reference packet or any file
  holding real patient data.
* Do not record the change; the coordinator owns the OpenSpec change, the ADR and the
  surface-ledger row.
* Commit on this chunk's branch. Do not open a pull request, do not merge.
```
