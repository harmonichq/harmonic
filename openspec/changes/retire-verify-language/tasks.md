# #447 implementation checklist

A checked item means implemented and verified. Every test below is synthetic.
None reads real data, and nothing here starts a server or binds a port. The work
runs as three serial sub-orders (1 → 2 → 3); group 4 is the release
coordinator's. design.md is the authority for every wording and deletion task:
its "Closed inventory at the base" table, and the ADR 447 sections on the
outcomes-trend route and the legacy Trial detector.

## 1. Backend contract (sub-order 1)

- [x] 1.1 Delete `detect_trial` and `_profile_switch_diff` from
  `ciq_autotune/watched_change.py`. In `tests/test_watched_change.py`, delete the
  five classes that exist only to test `detect_trial` (`TrialDetectionTest`,
  `MaturingTest`, `RevertRuleTest`, `ProfileSwitchAttributionTest` and
  `SwitchStartsTrialImmediatelyTest`, which is 31 tests plus that class's three
  private builders), then every module-level helper and import the file no
  longer uses. The enforced fact is that no production module imports or calls
  either function. Afterwards `git grep -n -w -E "detect_trial|_profile_switch_diff"
  -- ciq_autotune scripts frontend tests .claude
  mockups/harmonic-v2.exploration/generate.py` prints nothing, and
  `uv run python -m pytest tests/test_watched_change.py` passes.
- [x] 1.2 Write the failing tests first in `tests/test_outcomes_trend.py`.
  Replace `test_trend_endpoint_returns_versioned_payload` and
  `test_window_param_flows_through` with route tests over manufactured stores:
  `c3-trial` and `c3-focus`, built with `scripts.qa_e2e_cases.materialize_case`,
  and a store with nothing watched. For each, the route body's fields are only
  `watched_change` and, when served, `input_data_age`. Its `watched_change`
  equals `summarize_trend(store, window_days=30).to_dict()["watched_change"]`,
  computed on a separate copy of the same store. A supplied `window` changes
  nothing. Add an anchor test, the one `docs/scope/447-trend-anchor.spike.py`
  runs. Materialise `c3-trial`, add an unchanged settings snapshot captured
  `2024-06-15 00:00:00`, which lies past the Trial's 28-day watch horizon, and
  reconcile at the latest basal, CGM or bolus instant (`2024-06-01 23:59:00`).
  Pin, for both the route and `summarize_trend`, the literal `watched_change`
  `{"kind": "trial", "parameter": "basal_rate", "slot": "03:00",
  "changed_at": "2024-05-15 00:00:00", "before": 0.6, "after": 0.54,
  "target_metrics": ["tbr"], "maturing": {"is_maturing": false,
  "days_elapsed": 15, "days_required": 14}, "deliberate": false}`. An
  anchor that counts settings snapshots reads `null` there and fails. Add a
  CLI test: `outcomes-trend --json` over a synthetic store still
  prints `schema_version`, `windows`, `behaviors`, `metrics`, `arc`,
  `pre_meal`, `overnight_lows` and `watched_change`. Watch the route tests fail
  on the base, where the body carries every series.
- [x] 1.3 Implement http-api **The outcomes-trend route serves only the watched
  change** and the modified outcomes requirement.
  - `ciq_autotune/outcomes_trend.py` gains one function that returns the watched
    change with `summarize_trend`'s anchor (the latest basal, CGM or bolus
    instant, else now). `summarize_trend` uses it for its own `watched_change`.
  - `ciq_autotune/api.py`'s route answers `{"watched_change": …}` through that
    function, imported at call time as today. It takes no `window` parameter,
    uses the key `("outcomes-trend",)` and a shape marker other than
    `outcomes-trend-v1`, and loses its unused local `compute()`. `warm_roster`
    calls it with no window.
  - `frontend/data.js` `fetchOutcomesTrend()` takes no argument, and its doc
    comment says it reads the one watched change. `frontend/diagnose.js` calls
    it with none.
  - In `tests/test_api.py`'s landing-warm tests, the `outcomes-trend` builder
    names the new function, the expected key becomes `("outcomes-trend",)`, the
    landing GET sends no window, and the failure test patches the new function.
  - `scripts/profile_cold_shapes.py` profiles the route's one window-free shape
    through the new function.
  - The CLI's `outcomes-trend` output does not change.
- [x] 1.4 Re-point the docstrings and comments that describe the route as
  serving series. That is `ciq_autotune/outcomes_trend.py`'s module docstring,
  `summarize_trend`'s docstring and the route's docstring, plus
  `ciq_autotune/watched_change.py`'s module docstring and its line-43 comment.
  The series are the CLI trend's, and the route serves only the watched change.
- [x] 1.5 Re-point the backend, test, script, generator and CI lines the
  inventory lists, and `frontend/data.js:190, 400, 419`. The line-400 comment
  names `focus-entry.js` as `fetchFocuses`' only caller. `watched_change.py:507`
  goes with 1.1. Reword
  `tests/test_scenario_engine.py:1151–1152` in place with the same line count. In
  `tests/test_outcomes_trend.py`
  `TrialWindowInvarianceTest.test_trend_and_roster_count_the_same_bounded_days`,
  add `self.assertEqual(roster[0]["state"], "complete")`, and reword that file's
  lines 1292, 1349 and 1375.
- [x] 1.6 Run `uv run python mockups/harmonic-v2.exploration/generate.py`, then
  run it with `--check`. Exactly `focus.json` and `journey.json` move, because
  their `code_version` hashes `ciq_autotune/*.py`. Any other moved file is
  reported, not committed.
- [x] 1.7 After `uv sync --frozen --extra api --extra sync` and
  `npm ci && npm run build`, every one of these exits 0:
  `uv run python -m pytest tests/test_watched_change.py tests/test_outcomes_trend.py tests/test_api.py tests/test_scenario_engine.py tests/test_trial_evidence.py tests/test_verify_trials.py tests/test_verify_block_ic.py tests/test_gen_verify_payload_block_ic.py`;
  `node --test 'frontend/**/*.test.js'`;
  `uv run python mockups/harmonic-v2.exploration/generate.py --check`;
  `uv run python scripts/check_demo_fixtures.py`;
  `npx --yes @fission-ai/openspec@1 validate --all --strict`; and the three
  `scripts/check_*.py` guards.

Coordinator-authorized with sub-order 1 (`Q3 delegation, Connor Griffin,
2026-09-23 ("figure it out yourself from here"); coordinator ruling R447`, and the
coordinator's rulings on sub-order 1's findings), each implemented and verified:

- `_candidate` is deleted with `detect_trial`, its only caller.
- design.md decision 2 confines the anchor divergence to a store reconciled at
  the data anchor, and the F3 wording matches "Changes states a Plan's phase from
  its served verdict".
- The surfaces delta's "Changes' Plan asks…" decides no Plan phase from a pump
  comparison of its own (#453's finding).
- F-a: `api._latest_instant`'s docstring says it counts settings snapshots and is
  not the trend's anchor.
- F-b: the http-api delta says `input_data_age` is carried only while a prior
  answer is served during a rebuild, with a scenario matching
  `test_a_labelled_predecessor_keeps_its_input_data_age`.
- F-c: six unused imports go from files this change touches: `Union`
  (`watched_change.py`), `ArcTrend` and `PreMealTrend` (`test_outcomes_trend.py`),
  `DERIVED_ARTIFACT_STORE_SCHEMA_VERSION`, `_digest` and `source_fingerprint`
  (`test_api.py`).
- `scripts/profile_cold_shapes.py` drops its emptied warm-only stage and flag.

## 2. Shipped surfaces (sub-order 2)

- [ ] 2.1 Write the failing tests first in `frontend/watched-change-dock.test.js`.
  (a) Rewrite the two tests that pin "14 of 14" for a ready Trial. The served
  14/14 case flattens to exactly
  `Ready to judge — 14 days since 08-11 · 14 required`. The served 15/14 case
  flattens to exactly `Ready to judge — 15 days since 08-11 · 14 required`, and
  its emphasised part is `15`. (b) Add a test that renders one served Trial
  through both printers, `watchDockView` and `follow-up.js` `maturitySection`,
  for three served pairs: maturing 6/14 (`is_maturing: true` /
  `state: 'maturing'`), ready 14/14 and ready 15/14 (`is_maturing: false` /
  `state: 'complete'`). Both print the same count and the same requirement, and
  neither prints `‹N› of ‹R›` with ‹N› > ‹R›. Watch both fail on the base, where
  the dock prints `14 of 14 days`. The maturing test
  (`Maturing — 6 of 14 days since 08-11`) stays unchanged and green.
- [ ] 2.2 Implement surfaces **The watch dock and Changes print one Trial day
  count**.
  - `frontend/follow-up.js` exports one function that returns the count words
    from a served `maturing` object and a served ready verdict: "‹n› of ‹R›
    days" while maturing, and "‹N› days" plus "‹R› required" once ready.
  - `maturitySection` prints through it, reads `detail.state === 'complete'`,
    and drops its `days_elapsed >= days_required` comparison.
  - `watchDockView` prints through it with `!maturing.is_maturing`, drops its
    `Math.min` clamp, and emphasises the numeral part (`‹n› of ‹R›` or `‹N›`).
    Its ready line reads `Ready to judge — ‹N› days since ‹MM-DD› · ‹R›
    required`. Rewrite the dock comment above the old clamp: the dock prints the
    served count, and only Changes' progress bar clamps.
  - Changes' locked strings stay as they are:
    `15 days<small>14 required · 1 data gap</small>`,
    `6 of 14 days<small>2 data gaps</small>`, and `<progress value="14" max="14"`.
  - In `frontend/follow-up.test.js`, give the two maturity tests the served shape
    (add `state`), and pin the exported function's two forms.
  - No other dock state, kind label, Trial title or route changes.
- [ ] 2.3 Run `PYTHONPATH=. uv run python docs/scope/447-day-count.repro.py
  <scratch>/served.json`, then `node docs/scope/447-day-count.repro.mjs
  <scratch>/served.json`. The node half exits 0 and prints
  `Ready to judge — 15 days since 05-15 · 14 required` and
  `15 days · 14 required · 0 data gaps`. On the base it exits 1.
- [ ] 2.4 Write the failing test first in `tests/test_api.py`, beside the
  existing `/api/kb/<slug>` tests. The served markdown of every authored slug
  (`start-here`, `reading-diagnose`, `reading-day`, `the-plan-tab`) contains no
  `Verify`. The whitespace-normalised `reading-diagnose` markdown contains
  `flow to a Focus, followed in Changes, because no pump setting fixes them.`
  Watch it fail on the base. Then edit `docs/kb/reading-diagnose.md:20–21` to
  `- **◈ Cause** levers (late bolus, over-treated low) flow to a Focus,
  followed in` / `  Changes, because no pump setting fixes them.` It stays two
  lines.
- [ ] 2.5 Re-point the frontend lines the inventory lists:
  `frontend/diagnose-workspaces.js:43`, `frontend/follow-up.js:119, 368`,
  `frontend/verify-workstation-chart.js:1, 13`, and the assertion message at
  `frontend/desk-behavior.replay.mjs:1404`. They are comments and a message;
  no executable statement changes.
- [ ] 2.6 Append `## #447 amendment — 2026-09-23, issue #447` to
  `mockups/harmonic-v2-desktop.behavior.md`. It quotes the sanction line from
  design.md and says that no existing story is amended or retired. It adds these
  stories in the ledger's STORY format:
  - **S169**: a watched Trial's dock and Changes print one day count, the served
    `days_elapsed`. On `c3-trial` the dock reads `Ready to judge — ‹N› days since
    ‹MM-DD› · ‹R› required`, and Changes' Watch maturity figure reads `‹N› days`
    with `‹R› required`. Neither the dock's detail nor the Watch maturity
    figure prints `‹N› of ‹R›` past its requirement.
    `lock: HV2-24, HV2-12`.
  - **S170**: the Guide's "Reading the Diagnose surface" article names no Verify.
    Its Cause-lever line says those levers flow to a Focus, followed in Changes.
    `lock: HV2-33`.

  The ledger's frozen header, its inventory line and ACCEPTANCE.md's count
  sentence stay as they are; the release coordinator owns them.
- [ ] 2.7 Add `C4_STORIES.S169` and `C4_STORIES.S170` to `frontend/c4.replay.mjs`.
  - S169 reads the served admission and the selected Trial from
    `/api/verify/trials`. Its premises are an active Trial whose served `state`
    is `complete` and whose `days_elapsed` exceeds `days_required`. It opens
    Diagnose and requires `.inspector > .watch .how` to read exactly
    `Ready to judge — ${N} days since ${MM-DD} · ${R} required`, built from the
    served values. It activates the dock's link, requires `.gf-stage-trial`
    visible, requires `[data-part="maturity"] .gf-figure` to start with
    `${N} days` and carry `${R} required`, and requires
    `progress[aria-label="Trial progress"]` at value `R` of max `R`.
  - S170 reads the served `/api/kb/reading-diagnose` markdown. Its premise is a
    `◈ Cause` line. It opens `[data-utility="guide"]` and
    `[data-utility-slug="reading-diagnose"]`, then requires the
    whitespace-normalised `.gf-article` text to contain no `Verify` and to carry
    `flow to a Focus, followed in Changes`.

  Register each exactly once in `frontend/desk-behavior.replay.mjs`, behind a
  `// STORY:harmonic-v2-desktop:S169` / `S170` marker, as `appOnly('HV2-24', …)`
  / `appOnly('HV2-33', …)`, and in `REGISTRY` as `['S169', S169, J()]` and
  `['S170', S170, J()]`. Map `S169: 'c3-trial'` and `S170: 'showcase'` in
  `frontend/replay-cases.mjs`. Smoke stories S7 and S13 already cover both case
  stores, so `SMOKE_STORIES` and its digest stay as they are. In
  `frontend/c4.replay.test.js`, pin each story's single registration, case and
  term. Run each body against a fake page carrying the branch's text and require
  it to pass. Run each body against a fake page carrying the base's text and
  require it to reject at its content assertion, not at a premise: for S169 the
  dock reads `Ready to judge — 14 of 14 days since 05-15`; for S170 the article
  reads `flow to Focus / Verify`.
- [ ] 2.8 Move the pinned literal in
  `mockups/sweep/harmonic-v2-desktop/acceptance.py` `inventory()` to
  `{"issued": 173, "active": 154, "retired": 19}`. In
  `mockups/sweep/harmonic-v2-desktop/acceptance.test.py`:
  - the full replay-plan count becomes 173;
  - the stated inventory becomes S1–S154 plus R1–R19;
  - the same-total guard becomes S1–S155 plus R1–R18, which is 173 with a split
    different from the real one.

  `python3 mockups/sweep/harmonic-v2-desktop/acceptance.py inventory --out
  <scratch>` reports `{'issued': 173, 'active': 154, 'retired': 19}` with
  `missing=[] extra=[]`.
- [ ] 2.9 Run `uv run python mockups/harmonic-v2.exploration/generate.py`, then
  run it with `--check`. Exactly `utilities.json` moves, because it embeds the
  Guide article.
- [ ] 2.10 These all exit 0: `node --test 'frontend/**/*.test.js'`;
  `uv run python -m pytest tests/test_api.py`;
  `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py
  ReplayPlanTest InventoryProofTest SmokeSelectionTest`;
  `uv run python mockups/harmonic-v2.exploration/generate.py --check`; and
  `npx --yes @fission-ai/openspec@1 validate --all --strict`.

## 3. Language and records (sub-order 3)

- [ ] 3.1 Rewrite `CONTEXT.md` as the inventory and the Q4 ruling say.
  - Delete the **Digest** entry; nothing serves a Digest.
  - Keep **Localized outcome**, **Confound triage**, **Tracked candidate** and
    **Candidate sweep**. The backend still serves the sweep at
    `/api/pattern-sweep`. Each entry says the desk does not show it, and loses
    its Verify card, display and footnote wording.
  - Re-point the Post-meal arc's "Outcomes trend card" (line 545) to the CLI's
    outcomes trend.
  - Rewrite the Verify lines in the Trial, Focus, Plan and Maturing entries.

  Keep every edit below line 501, so the scan pins at 77, 99 and 501 do not
  move. Afterwards `git grep -n -w -E "Verify|Digest" -- CONTEXT.md` prints
  nothing.
- [ ] 3.2 Re-ground `README.md`: the "Web UI" paragraph, and the line-119 route
  sample ("the Trial roster (`/api/verify/trials`), outcomes, the watched
  change"). Re-point `PRODUCT.md` lines 13 and 62. Rewrite `DESIGN.md` lines 280
  (the Navigation bullet, on `frontend/chrome.css` `.v2-nav`) and 302 (the
  left-tab clause). Leave `DESIGN.md:117` alone.
- [ ] 3.3 Edit two Purpose paragraphs in place. `openspec/specs/http-api/spec.md`
  reads "the analyzers, the Plan, Diagnose, Changes, and the store".
  `openspec/specs/surfaces/spec.md` names three destinations (Diagnose, Changes
  and Day, ADR 397) in place of "four distinct surfaces". No requirement in any
  `openspec/specs/` file is edited; the deltas carry those.
- [ ] 3.4 In `mockups/sweep/harmonic-v2-desktop/ACCEPTANCE.md`'s "Fast-gates
  measurements and ceilings (#406)" table, delete the nine rows for legs #416
  deleted: Day lifecycle, Diagnose workstation, Diagnose canvas composition,
  Cockpit shell, First-plan reconcile, Diagnose workstation behaviour ledger,
  Diagnose event comparisons, Diagnose comparison support audit, and Verify
  behaviour ledger. Keep the five rows whose legs `.github/workflows/ci.yml`
  still runs, and drop the retired "V2" prefix from their names: Browser runner
  lifecycle, Desk, Trial and Pattern Focus, and the desk ledger's full-shard and
  PR-smoke rows. Add
  and change no number. The table's prose and the shard table stay as they are.
- [ ] 3.5 Run the residue command from design.md over the whole change, and
  classify every printed line in the execution receipt. Only these are
  permitted: the keep lines, the delta-superseded spec lines, at most the two
  `verify-workstation-chart.js` retirement-pointer lines, and this change's new
  negative-assertion lines.
- [ ] 3.6 After `uv sync --frozen --extra api --extra sync` and
  `npm ci && npm run build`, every one of these exits 0, on the committed head:
  - `node --test 'frontend/**/*.test.js'`;
  - the whole backend `uv run python -m pytest`, run once, with its wall time
    stated;
  - `npx --yes @fission-ai/openspec@1 validate --all --strict`;
  - `python3 scripts/check_adr_numbers.py`,
    `python3 scripts/check_owned_identifiers.py` and
    `python3 scripts/check_public_allowlist.py`;
  - every drift check AGENTS.md lists;
  - `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py
    ReplayPlanTest InventoryProofTest SmokeSelectionTest`;
  - `python3 scripts/build_public_tree.py <scratch>/public-tree`, followed by
    `check_public_links.py` and `scan_public_tree.py` on that tree.

## 4. Port-bound legs (release coordinator)

- [ ] 4.1 Replay `ONLY=S169,S170` on the base with this branch's harness laid
  over it: S169 fails at its dock-count assertion, and S170 at its no-Verify
  assertion. Replay the same two on the branch, where both pass. Replay
  `ONLY=S46,S73,S139,S140` on the branch, where all pass. Run everything at
  `VIEWPORT=1280x720` and at `1440x900`. Then capture three renders from base
  and branch at both sizes: the dock (`.inspector > .watch`) on `c3-trial`,
  whose branch ready line wraps inside the dock's reserve and is never
  ellipsized; Changes' Trial Watch maturity on `c3-trial`, unchanged; and the
  Guide's "Reading the Diagnose surface" article on `showcase`. Record the
  results in S169's and S170's status lines.
