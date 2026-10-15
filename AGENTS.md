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
npm ci && npm run build
```

The core — store, model, CLI — is deliberately stdlib-only. The `sync` extra
adds the live pull; the `api` extra adds the HTTP API and the web UI.

**Run.** `uv run harmonic serve` starts the API and the web UI on one port.
`README.md` has the full command set and the Docker path.

**The pull-request gate.** The backend runs over a built app, so build it first:

```sh
npm ci && npm run build                    # required before the backend and the smoke test
uv run python -m pytest                    # backend, stdlib unittest over the built app
node --test 'frontend/**/*.test.js'        # the dependency-free frontend tests
npm run test:ui                            # the component library's Storybook suite
uv run python scripts/smoke_app.py         # the server serves the built app and an API answer
# the app job: the live adapter's contract tests and the one browser smoke test
uv run python scripts/smoke_app.py --then node --test frontend/ui/app/live.contract.test.mjs frontend/app.browser.test.mjs
uv run python scripts/smoke_app.py --case isf-strengthen --then node --test frontend/ui/app/live.contract.test.mjs
uv run python scripts/smoke_app.py --case c3-trial --then node --test frontend/ui/app/live.contract.test.mjs
npx --yes @fission-ai/openspec@1.14.0 validate --all --strict # OpenSpec requirements and changes
python3 scripts/check_adr_numbers.py       # decision-record naming guard
python3 scripts/check_owned_identifiers.py # product-name guard
python3 scripts/check_public_allowlist.py  # publishable-tree guard
t=$(mktemp -d) && python3 scripts/build_public_tree.py "$t" && \
  python3 scripts/check_public_links.py "$t" && python3 scripts/scan_public_tree.py "$t"  # public-tree scan
```

**The Storybook suite is the frontend gate** (#495). `npm run test:ui`
type-checks `frontend/ui`, builds its Storybook and renders every story in
Chromium, after its play, against the prechecks in `frontend/ui/prechecks.js`:
no sentence, only allowed words, one size per control role, one primary, every
number traced to the served field it prints, and nothing scrolling but a page.
Its Playwright comes from `PLAYWRIGHT_MODULE`, or, unset, from
`scripts/ensure_browser_gate_env.py`, which provisions one cached copy. A missing
driver or build fails closed, naming what is missing.

**The smoke test** (`scripts/smoke_app.py`) boots the one permitted offline
serve below — the synthetic QA store, `--no-fetch`, an empty token — and asks it
for `/`, the app's script, a tab's page path and `/api/status`. The image's own
smoke step runs the same probe against the container with `--url`.

**The app against the engine: contract tests and one smoke, no ledgers** (#475,
ADR 475). The desk's frozen behaviour ledgers and browser replays are gone. In
their place, `smoke_app.py --then CMD` warms the scratch store's derived cache
through the server's own warm roster, boots the same serve and runs CMD against
it (`HARMONIC_URL`, `HARMONIC_CASE`); `--case NAME` serves a QA case store the
generator emits instead of the showcase.

- `frontend/ui/app/live.contract.test.mjs` reads the engine's real answers
  through the app's one client and the live adapter, in Node with no browser,
  and asserts each of the five tabs' screen models against literal values per
  store. The showcase covers every tab; `isf-strengthen` adds a queued
  correction factor, `c3-trial` an active Trial, `basal-and-carb-ratio-lower` a
  queued carb ratio, and `pattern-correction-collapse` a Pattern served as its
  one habit, with its case file. A new screen-model fact is asserted here.
- `frontend/app.browser.test.mjs` is the one browser smoke test: the built app
  opens each of its five tabs once at 1440×900, and each draws its primary
  content with no skeleton and no Unavailable. Its context sends
  `Connection: close` (#507). It is not where behaviour is tested; the Storybook
  suite and the contract tests are.

Both run in CI's `app` job, hand-listed. They fail closed without a serve, and
the browser smoke fails closed without a driver. Their files are deliberately
outside the fast gate's `*.test.js` glob, because they need a server.

The backend job also runs ten **drift checks**, so a committed
generator-authored artifact can never silently diverge from its generator. Nine
are listed below; the component library's fixture generator reads inputs the
public tree excludes (the redesign lock and the QA store), so its `--check`
command lives in `.github/workflows/ci.yml`:

```sh
uv run python scripts/gen_chart_builder_fixtures.py --check
uv run python scripts/check_demo_fixtures.py   # the Diagnose synthetic set the projection fixtures read
uv run python scripts/gen_qa_e2e_db.py --check
uv run python scripts/gen_findings_projection_fixtures.py --check
uv run python scripts/gen_ic_history_event_fixtures.py --check
uv run python scripts/gen_ic_block_evidence_fixtures.py --check
uv run python scripts/gen_basal_night_evidence_fixtures.py --check
uv run python scripts/gen_isf_rest_window_evidence_fixtures.py --check
uv run python scripts/gen_missed_meal_comparison_fixtures.py --check
```

The frontend job runs one drift check in Node: the event-comparison synthetic
capture, which the findings-projection generator reads.

```sh
node mockups/diagnose-event-comparison.synthetic/generate.mjs --check
```

Every committed fixture in this repository is synthetic, and the contamination
scan will not let one ship unless it carries a provenance stamp from that scan's
closed set. Most carry a `_generated_by` + `_note` pair; the Diagnose demo
captures instead carry an `authorized` + `synthetic` pair, which is honoured
only for the paths `scripts/public_scan_config.txt` names one by one. If you add
a fixture, add its generator and its `--check` step in the same change — a
fixture without a generator is how real data gets committed.

**Run only what a change touches; run each whole suite once, before the push.**
While iterating, run the stories a change touches (`UI_STORY=<id part>` narrows
`node scripts/ui-stories.mjs check` after `npm run build-storybook`) and the
backend test files it touches; one contract-test case is one `--case` run. Run
each complete suite exactly once per push, on the commit that will be pushed. Connor, 2026-09-10: "I spend all my life
waiting for replays and ledgers and CI to run" — this rule is the answer, not a
suggestion.

**A sandboxed agent cannot launch Chromium — escalate, do not diagnose.** Under
a seatbelt sandbox (Codex `workspace-write`, and anything else built on
`sandbox-exec`), the Storybook suite and the browser smoke die at launch with
`bootstrap_check_in org.chromium.Chromium.MachPortRendezvousServer.<pid>:
Permission denied (1100)`, surfacing as `browserType.launch: Target page,
context or browser has been closed`. That is the sandbox refusing Chromium's
Mach service registration, not a defect in the suite, the driver or the change
under test. Re-run the same command with escalated permissions; it passes.
There is no narrower fix: `--no-sandbox` and `--single-process` are Chromium's
own sandbox, not the outer one. Never report either as failing, and never
edit code to chase it, from a sandboxed run.

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
  2FA) and pulls real data; it cannot be exercised headless. There is exactly
  one permitted offline serve: the QA copy-then-serve command below for UI
  design and the smoke test. `--no-fetch` and the empty token are mandatory. The QA
  database is generated entirely by `scripts/gen_qa_e2e_db.py`:

  ```sh
  scratch="${TMPDIR:-/tmp}/harmonic-qa-e2e.sqlite"
  rm -f "$scratch" "$scratch-wal" "$scratch-shm" "$scratch.derived.sqlite"
  cp mockups/qa-e2e.synthetic/harmonic.sqlite "$scratch"
  npm ci && npm run build
  uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8765
  ```

  
  Exercise every other model path through tests and fixtures instead.

  For UI revision rounds, that same no-fetch serve of the built app is the
  safe surface for the live screens, beside the component library's Storybook
  for their locked states (#495).
- **Committed fixtures come from a committed generator**, and carry a
  provenance stamp saying so. Do not hand-write a fixture out of real data, and
  do not paste real values into a test.
- CI logs are public. Anything a gate prints, it prints to the world.

### Maintaining QA coverage eras

When an analyzer state or Finding changes:

1. Start with a manufactured `QaCase` recipe in `scripts/qa_e2e_cases.py`.
2. Materialize it and run `execute_case`; copy its complete serialized analyzer,
   queue, support, rest-window, history, behavioral, verdict-tally,
   finding-title, and uncaused-high row dump into literal `QaExpectation` values. Never derive an
   expected row or verdict from analyzer or projection output at assertion time.
3. Run the catalog-generated `test_case_<case name with hyphens replaced by
   underscores>` test.
4. Re-measure all five existing budgets without raising their limits: committed
   showcase size ≤25 MiB, showcase drift ≤30 s, focused QA suite ≤150 s,
   slowest generated case ≤30 s, and full pytest ≤2.5× the recorded chunk-1
   baseline (recorded in the active QA change's coverage appendix). A breach stops the work without changing the committed showcase.

To inspect one case through the production APIs, emit its uncommitted case store:

```sh
uv run python scripts/gen_qa_e2e_db.py --case <name> --out <scratch path>
```

Use that path as the `cp` source in the QA copy-then-serve command above; keep
`--no-fetch` and `--token ''`. Never commit an emitted case store. Use the
showcase for whole-app layout, dense chronology, navigation, and mixed-state
composition. Use a named case store for one exact analyzer or Finding state,
including for isolated chart layout or interaction.

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
- `ciq_autotune/model.py` — the clean-window filter used by basal, backtest,
  and report.
- `ciq_autotune/analyzers/` — basal, correction factor (ISF), carb ratio (I:C),
  and the behavioral detectors. One versioned `AnalysisResult` comes out.
- `ciq_autotune/safety.py` — the caps and the support floors. Read "Safety
  invariants" below before changing anything here.
- `ciq_autotune/credentials.py` — encrypted credential storage, DB-first with a
  one-time `.env` fallback that seeds the table.
- `ciq_autotune/fetch_loop.py` — the hourly background fetch loop `serve` runs.
- `ciq_autotune/result_cache.py` — the in-process cache the heavy read
  endpoints answer from.
- `ciq_autotune/api.py` — the HTTP API (`api` extra), which also serves the one
  built shell on the same port: `frontend/dist/index.html` at `/` (the Queue)
  and the other four tabs' page paths, with its fingerprinted assets under
  `/assets`. The non-API route
  set is closed — every served page path is named, and any other path is a 404.
- `frontend/` — the one Vite source root: the app, built with `base: '/'` and
  served by the Python process (ADR 416, #495). It is the component library in
  `frontend/ui/` — React components and the five screens locked in the
  redesign's lock doc, each with its Storybook stories —
  and the app that serves those screens (`frontend/ui/app/`). One
  authenticated client (`data.js`) and one router (`tab-routing.js`); a second
  client or router here is a duplicate implementation, not a convenience. Every
  model reads one seam (`frontend/ui/answers.ts`) with two adapters: the
  stories' generated answers (`fixtures.ts`) and the live engine's
  (`ui/app/live.js`). Only the stories import the fixtures, so the built app
  never carries them. The library's material is committed source
  (`material.css`, `fonts/`).
- `openspec/specs/` — fifteen capability specifications: what each part of the
  system is required to do, and why. The public "why" lives here.

**The result cache is coarse, and every write path must bump it.** Any write
calls `cache.bump()`; the hourly fetch bumps through `run_fetch_loop`'s
`on_write`, which then re-warms a fixed roster of read shapes — the analysis and
each of the Overview's windows among them — in the loop's worker thread, so the first visitor after a fetch lands warm. A new write
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

**Every setting kind also holds when its own range contains the current
value (ADR 489).** `Estimate.excludes(current)` — the served `lo`/`hi`, closed at
both ends — is one more condition inside each kind's one predicate: basal in
`cap()` beside the sign verdict and in `apply_harm` for a median-deferred
recurring-lows cut (a slot with no clean median has no range, so its full step
stands); carb ratio as `band_excludes_programmed`; ISF in `isf_asserts_move`.
Never re-check the range in a reader.

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
only when a current programmed value and a direction both exist, the
recommendation differs from current, and the fasting range excludes current; a
sized strengthen it refuses for its range is published as a hold, with no
direction and no recommendation. A direction-only weakening, a missing
programmed value, a hold, and a rounded no-op all remain visible but cannot
stage; the findings projection queue withholds their rank. `isf.py` still
imports nothing from `safety.py`: its caps are its own
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
- **The CGM feed can carry two records for one five-minute slot.** They sit
  seconds apart: either the same reading twice, or two disagreeing series side
  by side for hours. Each is a distinct vendor record, stable across re-pulls,
  so no key merges them. `Store.cgm_readings` collapses a slot to one reading
  and withholds the value where its records disagree (ADR 519). Read CGM only
  through it, never straight from the table.
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
- **Cancelled-bolus carbs are unrecoverable, and the pump-logs event filter
  never surfaced them.** The endpoint long ignored its event-code filter (then
  `eventIds`) and returned every code in the window, so there is nothing to
  fuzz for. Around 2026-09-30 the vendor began rejecting `eventIds` with HTTP
  400; it is now `eventCodes`, sent by `tconnectsync` ≥3.0.3 with the web app's
  own code list. Carbs persist only on a *confirmed* bolus. A bolus that was calculated and
  then backed out emits a BG-entry stamp with no carb field, and the vendor's
  own daily total excludes it too. Don't chase these.

## Dependency notes

- **Never re-vendor `tconnectsync`.** A local `tconnectsync/` directory shadows
  the installed package on `sys.path` and breaks the import. Harmonic depends on
  upstream `tconnectsync`, floored at `>=3.0.3` and pinned by `uv.lock`.
- **3.0.3 is the floor for fetching at all.** Below it every pump-logs request
  sends `eventIds`, which the vendor has rejected with HTTP 400 since about
  2026-09-30 — the hourly fetch fails and the store silently stops growing.
- **3.0.0 was the first hard floor, and a stale virtualenv hides why.** When Tandem cut
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
- **Read or validate YAML with `yq`** (mikefarah, v4), e.g.
  `yq '.jobs | keys' .github/workflows/ci.yml`, rather than ad-hoc PyYAML or uv
  installs.
- **Frontend tests** are the Storybook suite (`npm run test:ui`): every screen
  and component state is a story, and every behaviour a play, the live writes
  among them through fake writes that fail once. Pure logic in `.js` modules
  with no DOM dependency is tested with Node's built-in runner and no npm
  dependency (`node --test 'frontend/**/*.test.js'`). Backend pytest delivery
  tests need `npm ci && npm run build` first.
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
  rail wordmark, the design-system and glossary titles. It is deliberately not a
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

## Review lessons

Recurring findings from past review rounds, distilled from the retired
reviewer-memory digest. Check a change against these before asking for review.

- **Keep policy in its owner.** Analyzer output owns advisory meaning,
  eligibility, evidence membership and canonical identity. Server and frontend
  code project or render those facts; they never re-derive them from estimates,
  bounds, labels or IDs. A second copy of a safety-adjacent fact is a defect.
- **Population is part of the contract.** Every displayed count, chart and
  conclusion names the same population and source window.
- **Stale beats falsely current.** On a failed or mismatched fetch, keep the last
  coherent state, mark it stale visibly, bound retries, and offer an explicit
  retry. Cached multi-endpoint views read one server-owned generation atomically.
- **One fact crosses four boundaries:** analyzer → server projection → generated
  fixtures and JavaScript mirrors → shipped surface. Inventory every encoding and
  consumer before changing it, and split work at those boundaries.
- **`frontend/index.html` is a consumer.** It imports frontend modules directly
  and no node test loads it. A negative claim ("nothing imports this") needs an
  unfiltered whole-tree grep, not an `--include='*.js'` one.
- **Generated artifacts pin bytes.** A `--check` compares bytes, so an input
  edit must regenerate its output in the same change.
- **Synthetic state is fragile.** A serve over the committed synthetic
  database mutates it; restore it through the generator before committing, and stage by
  path, never `git add -A`.
- **Real data leaks through prose.** Never narrate the operator's own history in
  comments or pick test constants near a real reading; the contamination scan is
  the backstop, not the boundary.
- **Static presence is not runtime presence.** Selectors, series names and
  `getOption()` readbacks that look live in source can be absent when the page
  renders; only a live run proves them. An assertion that only ever ran under a
  retired theme or mode never proved the surviving one.
- **Review fixes as new attack surface.** When a narrow correction fails again,
  rewrite the step cleanly instead of patching it a second time.
