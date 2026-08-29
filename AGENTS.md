# AGENTS.md — Harmonic

Local, advisory tuning of basal, correction factor and carb ratio from a pump
wearer's own data. Self-contained: the data lands in a local SQLite file, the
model runs on that file, and nothing is sent anywhere. Harmonic works with
Tandem pumps using Control-IQ technology, reading from Tandem Source; it is an
independent project, not affiliated with Tandem Diabetes Care.

This file is the contributor and agent brief. `CLAUDE.md` is a symlink to it —
one document, whatever tool is reading.

## How work is merged

profile: reviewed

Every pull request is read and merged by a human. Nothing reaches `main`
unattended, and that is not a formality: Harmonic's output is **advisory
insulin-dosing guidance**, so a change that is plausible but wrong can
misadvise a real dose. Automated agents may open pull requests here; they do
not merge them.

The bare `profile:` line above is machine-read — keep it lowercase, at column
0, value unadorned.

Code contributions are not solicited (the licence is PolyForm Noncommercial
1.0.0 — source-available, and sole ownership is deliberate). Bug reports and
feature requests on the issue tracker are welcome, and are the point of a
public tracker.

## Install, test, run

**Install.** [uv](https://docs.astral.sh/uv/), then:

```sh
uv sync --frozen --extra api --extra sync
```

The core — store, model, CLI — is deliberately stdlib-only. The `sync` extra
adds the live pull; the `api` extra adds the HTTP API and the web UI.

**Run.** `uv run harmonic serve` starts the API and the web UI on one port.
`README.md` has the full command set and the Docker path.

**The fast gate — dependency-free, runs on every pull request:**

```sh
uv run python -m pytest                    # backend, stdlib unittest
node --test 'frontend/**/*.test.js'        # frontend, Node's built-in runner
python3 scripts/check_adr_numbers.py       # decision-record naming guard
python3 scripts/check_owned_identifiers.py # product-name guard
python3 scripts/check_public_allowlist.py  # publishable-tree guard
```

The backend job also runs twelve **drift checks**, so a committed
generator-authored artifact can never silently diverge from its generator.
Eleven are listed below; the twelfth is the evidence-canvas exploration's
generator — a private design artifact the public tree excludes, so its
`--check` command lives in `.github/workflows/ci.yml`:

```sh
uv run python scripts/gen_ic_block_fixtures.py --check
uv run python scripts/gen_annotation_fixtures.py --check
uv run python scripts/gen_chart_builder_fixtures.py --check
uv run python scripts/check_demo_fixtures.py   # the committed synthetic demo sets
uv run python scripts/gen_revise_e2e_db.py --check
uv run python scripts/gen_findings_projection_fixtures.py --check
uv run python scripts/gen_ic_history_event_fixtures.py --check
uv run python scripts/gen_ic_block_evidence_fixtures.py --check
uv run python scripts/gen_basal_night_evidence_fixtures.py --check
uv run python scripts/gen_isf_rest_window_evidence_fixtures.py --check
uv run python scripts/gen_missed_meal_comparison_fixtures.py --check
```

The frontend job runs two drift checks in Node: the event-comparison synthetic
capture and the design exploration's build script. The latter is the one
generator here that is not a fixture builder; its command lives in
`.github/workflows/ci.yml`, and the exploration itself is a private design
artifact that does not ship.

```sh
node mockups/diagnose-event-comparison.synthetic/generate.mjs --check
```

**A mockup that extracts from the app is a generated artifact, and the same
`--check` rule binds it.** Such a build typically commits a stylesheet lifted
verbatim out of `frontend/index.html`, a component lifted out of a shipped
module, and a data file run through the shipped producers — all three move when
the app moves. When the app's light theme was relit (decision record 37) one
such extract was not regenerated, and that exploration's own contrast guard went
on measuring the retired palette for an entire round, reporting zero failures
the whole time. The guard was sound; its input was stale, which is a failure no
amount of auditing the guard would have revealed. If you add a mockup that
extracts from shipped source, add its `--check` and its CI step in the same
change.

The findings-projection fixture also freezes the three payloads it projected
FROM. The browser gates have no Python, so they answer `/api/diagnose/findings` from
a fixture-only JS mirror of that projection, kept beside the synthetic fixture
sets, and `frontend/findings-projection-mirror.test.js` deep-compares the mirror
against those frozen answers window for window. The mirror is a transcription
held identical by a test, never a second source of truth — if that test ever goes,
so must the mirror (decision record 735).

Every committed fixture in this repository is synthetic, and the contamination
scan will not let one ship unless it carries a provenance stamp from that scan's
closed set. Most carry a `_generated_by` + `_note` pair; the Diagnose demo
captures instead carry an `authorized` + `synthetic` pair, which is honoured
only for the paths `scripts/public_scan_config.txt` names one by one. If you add
a fixture, add its generator and its `--check` step in the same change — a
fixture without a generator is how real data gets committed.

**This is not the whole merge bar.** A separate `browser gates` CI job runs the
browser-dependent work the fast gate cannot: the `*.browser.test.mjs` suites
(cockpit shell, Diagnose workstation, the shared browser-runner lifecycle
regression), the Day lifecycle and first-plan-reconcile drivers, three
behaviour-ledger replays against the built app, and the event-comparison
support audit. Reproduce it locally:

```sh
# One-time setup — an isolated Playwright + Chromium, and the two CDN modules
# the browser suites route through instead of the network. On a machine that
# runs the gates repeatedly, skip the mktemp lines and instead provision a
# persistent cache once with
#   eval "$(python3 scripts/ensure_browser_gate_env.py)"
# which sets PLAYWRIGHT_MODULE and VENDOR_DIR for the legs below and costs
# one stat per piece on reruns.
PW=$(mktemp -d) VENDOR=$(mktemp -d)
npm install --prefix "$PW" playwright@1.61.1
npx --prefix "$PW" playwright install --with-deps chromium
curl -fsSL https://unpkg.com/vue@3/dist/vue.esm-browser.js -o "$VENDOR/vue.esm-browser.js"
curl -fsSL https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js -o "$VENDOR/echarts.min.js"

# The ten gate legs, as CI runs them.
PLAYWRIGHT_MODULE="$PW/node_modules/playwright" node frontend/day-surface.browser.mjs
PLAYWRIGHT_MODULE="$PW/node_modules/playwright" VENDOR_DIR="$VENDOR" PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json node --test frontend/diagnose-workstation.browser.test.mjs
PLAYWRIGHT_MODULE="$PW/node_modules/playwright" VENDOR_DIR="$VENDOR" PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json node --test frontend/diagnose-canvas-composition.browser.test.mjs
PLAYWRIGHT_MODULE="$PW/node_modules/playwright" VENDOR_DIR="$VENDOR" node --test frontend/cockpit-shell.browser.test.mjs
PLAYWRIGHT_MODULE="$PW/node_modules/playwright" node --test frontend/browser-runner.browser.test.mjs
PLAYWRIGHT_MODULE="$PW/node_modules/playwright" node frontend/plan-first-match.browser.mjs
# In another terminal, first start the exact no-fetch server declared under
# "The data boundary" below.
PLAYWRIGHT_MODULE="$PW/node_modules/playwright" VENDOR_DIR="$VENDOR" BASE_URL=http://127.0.0.1:8765 TARGET=app PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json node frontend/diagnose-workstation-behavior.replay.mjs
PLAYWRIGHT_MODULE="$PW/node_modules/playwright" VENDOR_DIR="$VENDOR" TARGET=app node frontend/diagnose-event-comparison-behavior.replay.mjs
PLAYWRIGHT_MODULE="$PW/node_modules/playwright" VENDOR_DIR="$VENDOR" TARGET=app node mockups/diagnose-event-comparison-support-audit.mjs
PLAYWRIGHT_MODULE="$PW/node_modules/playwright" VENDOR_DIR="$VENDOR" TARGET=app PAYLOAD=mockups/verify-660-story.synthetic/payload.json node frontend/verify-660-story-behavior.replay.mjs
```

All ten **fail closed**: a missing driver, vendored asset or fixture exits
nonzero, naming what is absent, rather than skipping. A green step that
silently ran zero assertions is the exact failure mode that design guards
against, and `frontend/browser-gates-fail-closed.test.js` is a
dependency-free regression test for it.

**A sandboxed agent cannot launch Chromium — escalate, do not diagnose.** Under
a seatbelt sandbox (Codex `workspace-write`, and anything else built on
`sandbox-exec`), every browser leg above dies at launch with
`bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer.<pid>:
Permission denied (1100)`, surfacing as `browserType.launch: Target page,
context or browser has been closed`. That is the sandbox refusing Chromium's
Mach service registration, not a defect in the suite, the driver or the change
under test — the `ThermalStateObserverMac` and `DnsConfig` lines above it are
cosmetic and appear on passing runs too. Re-run the same command with escalated
permissions; it passes. There is no narrower fix: `--no-sandbox` and
`--single-process` are Chromium's own sandbox, not the outer one, and the
seatbelt profile exposes only disk roots and network. Never report a browser
gate as failing, and never edit code to chase one, from a sandboxed run.

## The data boundary

Harmonic is built and tested against **synthetic fixtures**. Where a change
genuinely needs real-shaped evidence, ground it against **a local snapshot of
your own database — never a published one, and never a live pull.**

- **Never commit `tconnect-data/` or `.env`.** Both are gitignored. They hold
  one person's glucose and insulin history, and their pump-vendor credentials.
  No real patient data is ever committed to this repository.
- **Open a snapshot read-only.** `Store.open_readonly` leaves the file alone;
  plain `Store.open` writes WAL sidecars and migration DDL into it.
- **Never run normal `harmonic serve` or any `harmonic fetch` in automated
  work.** Normal startup fires a live OAuth login against the vendor (possibly
  2FA) and pulls real data; it cannot be exercised headless. The sole offline
  UI-design/replay exception is this exact command, whose `--no-fetch` flag is
  mandatory and whose database is generated entirely by
  `scripts/gen_revise_e2e_db.py`:

  ```sh
  uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite
  ```

  Exercise every other model path through tests and fixtures instead.

  For chart-level UI revision rounds, the preferred safe surface is the
  component harness: `npm install && npm run dev` inside `harness/`, in
  manufactured mode (its default — served from committed synthetic fixtures,
  no app process needed). It opens one shipped chart at a time through the
  real Diagnose composition, so a chart revised there is the shipped chart.
  Live mode only forwards to a `serve` the operator already started, and is
  never used in automated work. One coupling to watch: the harness names app
  API paths as hand-written strings that no test checks, so an endpoint
  rename breaks a story silently in manufactured mode and loudly in live —
  when an `/api/...` path changes, grep `harness/` in the same change.
- **Committed fixtures come from a committed generator**, and carry a
  provenance stamp saying so. Do not hand-write a fixture out of real data, and
  do not paste real values into a test.
- CI logs are public. Anything a gate prints, it prints to the world.

## Layout

- `ciq_autotune/store.py` — the local SQLite store (idempotent upserts,
  wall-clock time model). The Python package path is unchanged from before the
  project was named Harmonic; it is an internal identifier, not a product name.
- `ciq_autotune/sync.py` — `pull_from_tconnect`, the live pull (it paginates
  windows longer than 31 days, which the vendor rejects).
- `ciq_autotune/tandemsource_map.py` — typed Tandem Source events to store
  rows. Deliberately **dependency-free** (dispatches on `type(ev).__name__`,
  reads raw attributes) so the core imports without the `sync` extra. Keep it
  that way.
- `ciq_autotune/insulin.py` — reconstructed bolus insulin-on-board.
- `ciq_autotune/model.py` — the clean-window filter every analyzer feeds on.
- `ciq_autotune/analyzers/` — basal, correction factor (ISF), carb ratio (I:C),
  and the behavioral detectors. One versioned `AnalysisResult` comes out.
- `ciq_autotune/safety.py` — the caps and the support floors. Read "Safety
  invariants" below before changing anything here.
- `ciq_autotune/credentials.py` — encrypted credential storage, DB-first with a
  one-time `.env` fallback that seeds the table.
- `ciq_autotune/fetch_loop.py` — the hourly background fetch loop `serve` runs.
- `ciq_autotune/result_cache.py` — the in-process cache the heavy read
  endpoints answer from.
- `ciq_autotune/api.py` — the HTTP API (`api` extra), which also serves
  `frontend/index.html` at `/`, on the same port.
- `frontend/` — a single-page Vue 3 app loaded from a CDN, no build step.
  ECharts renders the Day chart.
- `harness/` — a dev-only Vite page that opens one shipped chart at a time on
  manufactured data or a running `harmonic serve`. Node 22 is required but not
  enforced; the harness never enters the production app and never gates.
- `openspec/specs/` — twelve capability specifications: what each part of the
  system is required to do, and why. The public "why" lives here.

**The result cache is coarse, and every write path must bump it.** Any write
calls `cache.bump()`; the hourly fetch bumps through `run_fetch_loop`'s
`on_write`, which then re-warms the fixed initial Diagnose shapes in the loop's
worker thread, so the first visitor after a fetch lands warm. A new write
endpoint that does not bump leaves a stale cache. There is exactly one
proven-safe exception — saving a Plan draft does not bump, because the draft is
UX-only and no cached compute reads it. Applying the plan does bump. Do not add
a second exception without proving no cached compute reads the written state.
The cache is in-process and single-`serve`: an out-of-process CLI `fetch` while
`serve` is up will not invalidate the running server.

## Safety invariants

These are the rules a wrong change misadvises a dose through. Read them before
touching `safety.py` or an analyzer.

**Basal: one predicate decides staging, and its floor is enforced inside
`safety.py`.** A basal slot stages into the Plan, moves the deliverable
schedule, and feeds the priority tally only when `SlotEstimate.asserts_move` is
true — all three read that one predicate. The support floor is
`safety._MIN_SUPPORTED_NIGHTS = 8`, and it is enforced **inside `_sign_tails`**:
a slot with fewer than eight informative nights gets p = 1.0 on both tails, so
`basal_sign_directions` never returns a supported direction for it.
`analyzers/basal.py` passes that per-slot verdict into `cap()` as
`supported_direction=`, and a `0` verdict downgrades the slot to
`Status.INSUFFICIENT` — which keeps the number and its confidence interval
visible while asserting no direction.

`cap()`'s separate `min_directional_days` parameter (default
`_MIN_DIRECTIONAL_DAYS = 3`) belongs to the **estimate/CI** rule in
`_insufficient`, which basal does not use; the only non-default caller of it in
the tree is a test. Do not describe the eight-night floor as passed in through
`min_directional_days` — it is not, and a change made on that belief edits a
parameter basal never reads.

**Carb ratio: the same shape, one predicate.** `analyzers/ic.ic_asserts_move`
is it. `analyze_ic` stamps `SegmentEstimate.asserts_move` per segment, and the
lever, the pump-profile schedule and the frontend's staging list all read that
one flag. `ic.py` imports exactly one name from `safety.py`,
`_MIN_SUPPORTED_BLOCK_RUNS` — the same floor of eight, applied to closed meal
runs.

**ISF has the same one-predicate staging invariant, but not basal's
safety machinery.** `analyzers/isf.isf_asserts_move` is evaluated from the final
post-harm values and stamped onto the analyzer's `SegmentEstimate`. It is true
only when a current programmed value and a direction both exist and the
recommendation differs from current. A direction-only weakening, a missing
programmed value, a hold, and a rounded no-op all remain visible but cannot
stage. `isf.py` still imports nothing from `safety.py`: its caps are its own
(`IsfConfig.max_step_frac`, `_half_gap`), and its rows are deliberately not fed
into the consolidated pump-profile schedule. The shared invariant is one
backend staging verdict, not one universal classifier, cap, evidence floor, or
delivery path.

**Put any hold in the backend predicate, never in a frontend gate.** The
frontend re-derives no floor, no threshold and no direction for any parameter;
it reads the backend's `safety_status` / `asserts_move` verdicts. Both the
basal and the carb-ratio versions of this bug recurred repeatedly, because each
fix patched a frontend gate while the backend deliverable kept injecting the
move underneath.

**Test analyzer output, not a hand-set flag.** The tests that missed the basal
bug stayed green because their fixtures hand-set thin slots to
`asserts_move: false` — encoding the very assumption that was false. Assert on
analyzer output built from N nights.

## Tandem Source data facts

Hard-won, and expensive to re-derive.

- **Basal** is `LidBasalDelivery`, emitted every 5 minutes. It carries
  `commandedRate` (delivered), `profileBasalRate` (programmed), `algorithmRate`
  and `commandedRateSource` (Suspended / Profile / Temp / Algorithm). That last
  field is what makes it possible to separate the algorithm's activity from the
  programmed profile — the whole basis of the model.
- **CGM** is `LidCgmData{Gxb,G7,Fsl2}`, roughly 288 readings a day. Not
  `LidBgReadingTaken`, which fires about eight times a day and was an early
  mis-source.
- **Timestamp CGM by `egvTimestamp`, not `eventTimestamp`.** `eventTimestamp`
  is when the pump *stored* the reading; after a sensor reconnect the missed
  readings are backfilled in one dump sharing a single store time, so keying on
  it collapses the batch and re-opens the very gap it was meant to close.
  `egvTimestamp` is seconds since the 2008 Tandem epoch, and is the reading's
  true 5-minute-spaced time. Backfilled readings carry `cgmDataType=[1]` and a
  nonzero `interval`; live ones carry `cgmDataType=[0]`, `interval=0`.
- **`egvTimestamp` is pump-LOCAL, not UTC — do not "localize" it.** Decoded, it
  equals the vendor's `pumpDateTime` to the second and matches the vendor UI.
  Tagging it UTC makes the normalizer convert an already-local time a second
  time, landing every reading the pump timezone's offset early — seven hours
  for a pump in a UTC-7 zone, which slides a whole evening into the afternoon
  and hides it from the analyzers. **The two feeds live in different zones:**
  event `eventTimestamp` is UTC and tz-aware, so it is converted; CGM
  `egvTimestamp` is local and naive, so it passes through. Never hand
  `normalize_time` a local time tagged UTC.
- **The BFF `estimatedDateTime` field is genuinely UTC, and is a trap.** It is
  the correct instant, but the vendor UI labels it in a way that reads like
  local time, so eyeballing a capture makes CGM look hours later than it is.
  Reconcile CGM only by `egvTimestamp` / `pumpDateTime`.
- **Event tables are keyed on the pump's `seqNum`, not on a timestamp.** A
  delivery's `eventTimestamp` is not stable across pulls — the vendor re-decodes
  it a few seconds off from a prior generation — so keying on it lets a re-pull
  insert a jittered parallel copy instead of merging. That doubles every
  5-minute slot, roughly doubles reconstructed basal insulin, and collapses the
  fasting correction-factor estimate that reads it. `seqNum` is monotonic and
  identical across pulls of the same event, so re-pulls merge losslessly while
  two genuinely distinct deliveries never conflate. This applies to
  `basal_events`, `bolus_events`, `iob_events` and `pump_events`.
- **`TIMEZONE_NAME` must match the pump's timezone.** It sets the wall clock
  every record is bucketed by, and a basal profile is a wall-clock schedule. A
  fetch refuses to run without it, and `normalize_time` raises
  (`TimezoneNotConfigured`) rather than convert a tz-aware timestamp against a
  silent UTC default. That silent default once stored a whole history at UTC
  wall time and doubled it as phantoms.
- **No dense insulin-on-board feed exists.** IOB rides only on sparse events, so
  the model reconstructs **bolus-only** IOB from the bolus log. Bolus-only, not
  basal+bolus, is what gives a clean ~0 threshold for "no bolus still acting".
- **The suggestion uses the MEDIAN** of clean delivered basal per slot, not the
  mean. Clean delivery is right-skewed — the algorithm adds corrective basal
  when glucose runs high but in range — and the mean over-suggests. The
  backtest confirmed this.
- **A standalone carbs-entered event does not exist on this feed.** Carbs from
  the pump ride on the bolus-request event only
  (`LidBolusRequestedMsg1.carbAmount` into `bolus_events.carbs`). The separate
  **manual carb log** (`carb_entries`, `prompt_responses`) holds *user-entered*
  unbolused carbs, and is threaded through the analysis purely as an
  **exclusion** signal to de-bias the fasting window — never a modeling input,
  never a synthetic bolus, never sourced from the pump feed. The two streams are
  unrelated; do not conflate them.
- **Cancelled-bolus carbs are unrecoverable, and `eventIds` on the pump-logs
  endpoint is a no-op.** The endpoint ignores that query parameter entirely, so
  the codes it returns are the complete feed — there is nothing to fuzz for.
  Carbs persist only on a *confirmed* bolus. A bolus that was calculated and
  then backed out emits a BG-entry stamp with no carb field, and the vendor's
  own daily total excludes it too. Don't chase these.

## Dependency notes

- **Never re-vendor `tconnectsync`.** A local `tconnectsync/` directory shadows
  the installed package on `sys.path` and breaks the import. Harmonic depends on
  upstream `tconnectsync`, floored at `>=3.0.0` and pinned by `uv.lock`.
- **3.0.0 is a hard floor, and a stale virtualenv hides why.** When Tandem cut
  over from the old reports API to the BFF endpoints, upstream fixed it
  natively, and 3.0.0 was the first tagged release carrying that. It also
  renamed every event field to camelCase (`currentGlucoseDisplayValue`,
  `egvTimeStamp`, `insulinDelivered`, `carbAmount`, `carbRatioRaw`, and the
  rest), which `tandemsource_map.py` reads. Nothing pins the *installed* package
  to the lock, so a stale virtualenv can sit on the old lowercase names — and
  because the mapper reads fields through `getattr(...)` defaults, a stale name
  does not crash, it silently drops data. Run `uv sync --extra sync` so the
  environment matches the floor. `tests/test_tandemsource_map_real.py` builds
  events through the real classes as a contract guard, and breaks loudly if
  upstream renames again.
- **Credentials resolve DB-first, `.env` second.** A `.env` hit seeds the
  encrypted table, so the fallback fires only once; after that, editing `.env`
  has no effect and credentials change only through the API. The password is
  encrypted at rest with Fernet, and the key lives beside the database at
  `tconnect-data/secret.key`, outside it. Losing the key means re-entering
  credentials, not losing data.

## Conventions

- **Backend tests** use stdlib `unittest`, run under pytest.
- **Frontend tests** use Node's built-in runner: the fast gate and every
  frontend test take no npm dependency. Pure logic lives in **vue-free** `.js`
  modules so tests import them with no importmap and no DOM. Vue components
  import `vue` plus those modules and are not node-tested, because the bare
  `vue` specifier only resolves through the browser importmap. The dev-only
  `harness/` has its own manifest and lockfile; it is never a gate and never
  runs in CI.
- **Browser-driven suites are named `*.browser.test.mjs`**, never `*.test.js`,
  so the fast gate's glob can never discover them.
- **New behavior ships with a test through the public interface**, and — where
  it fits — one that failed first, for the right reason.
- **Match the surrounding code**: idiom, naming, comment density. No dead code
  and no speculative abstraction; build a seam when the second caller is real.
- **Domain terms come from `CONTEXT.md`.** It is the ubiquitous language: when
  an issue, test or report names a domain concept, use the term as defined there
  and steer clear of the listed synonyms. `DESIGN.md` is the visual system,
  `PRODUCT.md` the product frame.
- **Decision records live in an OpenSpec change's `design.md`**, because that is
  where this repository already records design — there is no `docs/adr/` tree,
  and a record written into one is a forked history, not a second home. A record
  is a section headed `## ADR <issue> — Title` in
  `openspec/changes/<change>/design.md`, where `<issue>` is the GitHub issue,
  ticket or pull request the decision came from; create the change directory if
  the work has none yet. Two records from one issue take distinct titles.
  `scripts/check_adr_numbers.py` enforces that identity in CI and fails on a
  reappearing `docs/adr/` record; an absent changes directory is a pass, so a
  repository with no recorded decisions yet is legal. Run it locally before
  pushing.
- **The product name is guarded.** `scripts/check_owned_identifiers.py` rejects
  the retired pre-Harmonic name in the identifiers Harmonic owns — the
  distribution and command names, the container image, the browser title, the
  page wordmark, the design-system and glossary titles. It is deliberately not a
  repository-wide word search: the internal Python package path, the local data
  directory, upstream dependency and environment names, and factual
  vendor-compatibility prose all keep their existing spellings. The local
  database file keeps its legacy name too (`tconnect-data/ciq.db`) — unlike
  those, that one is an inconsistency rather than a decision: renaming it is
  owed as a data migration for existing self-hosted installs, not a
  documentation change, so it is deferred rather than settled.
- **Branch off a freshly fetched `origin/main`** for each piece of work, never a
  leftover local branch. Merges are squashed, so a merged branch shows as "ahead
  of main" forever — commit counts cannot tell you what has landed.

ui-surfaces: frontend/
