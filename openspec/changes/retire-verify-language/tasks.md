# #447 implementation checklist

A checked item means implemented and verified. Every test below is synthetic.
None reads real data, and nothing here starts a server or binds a port. The
decision record's "Closed inventory at the base" table in design.md is the
authority for every wording task.

## 1. One Trial day count

- [ ] 1.1 Write the failing tests first in `frontend/watched-change-dock.test.js`.
  (a) Retitle and rewrite the two tests that pin "14 of 14" for a ready Trial.
  The served 14/14 case flattens to exactly
  `Ready to judge — 14 days since 08-11 · 14 required`. The served 15/14 case
  flattens to exactly `Ready to judge — 15 days since 08-11 · 14 required`, and
  its emphasised part is `15`. (b) Add a test that renders one served Trial
  through both printers, the dock's `watchDockView` and `follow-up.js`
  `maturitySection`, for three served pairs: maturing 6/14 (`is_maturing: true` /
  `state: 'maturing'`), ready 14/14 and ready 15/14 (`is_maturing: false` /
  `state: 'complete'`). Assert that both print the same count and the same
  requirement, and that neither prints `‹N› of ‹R›` with ‹N› > ‹R›. Run both on
  the base and watch them fail for the right reason: the dock prints
  `14 of 14 days`. The existing maturing test
  (`Maturing — 6 of 14 days since 08-11`) stays unchanged and green.
- [ ] 1.2 Implement surfaces **The watch dock and Changes print one Trial day
  count**. `frontend/follow-up.js` exports one function that returns the count
  words from a served `maturing` object and a served ready verdict: while
  maturing, "‹n› of ‹R› days"; once ready, "‹N› days" plus "‹R› required".
  `maturitySection` prints through it, reads the served `detail.state ===
  'complete'`, and drops its `days_elapsed >= days_required` comparison.
  `watchDockView` prints through it with `!maturing.is_maturing`. It drops its
  `Math.min` clamp and emphasises the numeral part (`‹n› of ‹R›` or `‹N›`). The
  ready line reads `Ready to judge — ‹N› days since ‹MM-DD› · ‹R› required`.
  Rewrite the dock comment above the old clamp: the dock prints the served count,
  and only Changes' progress bar clamps. Changes' locked strings do not move:
  `15 days<small>14 required · 1 data gap</small>`,
  `6 of 14 days<small>2 data gaps</small>`, and `<progress value="14" max="14"`.
  In `frontend/follow-up.test.js`, give the two maturity tests the served shape
  (add `state`), and pin the exported function's output for the maturing and
  ready forms. No other dock state, kind label, Trial title or route changes.
- [ ] 1.3 In `tests/test_outcomes_trend.py`
  `TrialWindowInvarianceTest.test_trend_and_roster_count_the_same_bounded_days`,
  add `self.assertEqual(roster[0]["state"], "complete")`, the served verdict
  Changes now reads. Reword that file's lines 1292, 1349 and 1375 as the
  inventory says.
- [ ] 1.4 Run `PYTHONPATH=. uv run python docs/scope/447-day-count.repro.py
  <scratch>/served.json` and then `node docs/scope/447-day-count.repro.mjs
  <scratch>/served.json`. On the branch the node half exits 0, printing the dock
  line `Ready to judge — 15 days since 05-15 · 14 required` and the Changes line
  `15 days · 14 required · 0 data gaps`. On the base it exits 1, as design.md
  records.

## 2. Verify leaves the live language

- [ ] 2.1 Rewrite the eleven `CONTEXT.md` lines as the inventory says. Keep
  every edit below line 501; the scan pins at 77, 99 and 501 must not move.
  Afterwards `git grep -n -w Verify -- CONTEXT.md` prints nothing.
- [ ] 2.2 Re-ground `README.md` lines 119 and 234: the whole "Web UI"
  paragraph, on the desk's three destinations and utility strip. Re-point
  `PRODUCT.md` lines 13 and 62. Rewrite `DESIGN.md` lines 280 (the Navigation
  bullet, on `frontend/chrome.css` `.v2-nav`) and 302 (the left-tab clause). Do
  not edit `DESIGN.md:117`, because the scan pins at 163, 181 and 183 sit below
  it.
- [ ] 2.3 Write the failing test first in `tests/test_api.py`, beside the
  existing `/api/kb/<slug>` tests. For each authored slug (`start-here`,
  `reading-diagnose`, `reading-day`, `the-plan-tab`), the served markdown
  contains no `Verify`. The whitespace-normalised `reading-diagnose` markdown
  contains `flow to a Focus, followed in Changes, because no pump setting fixes
  them.` Watch it fail on the base. Then edit `docs/kb/reading-diagnose.md:20–21`
  to `- **◈ Cause** levers (late bolus, over-treated low) flow to a Focus,
  followed in` / `  Changes, because no pump setting fixes them.` It stays two
  lines.
- [ ] 2.4 Re-point every code, test, script, generator and CI comment the
  inventory lists under `ciq_autotune/`, `frontend/`, `scripts/`, `tests/`,
  `.claude/qa/` and `.github/workflows/ci.yml`. Each is a comment or docstring,
  plus the one assertion message in `frontend/desk-behavior.replay.mjs:1404`; no
  executable statement changes. Reword `tests/test_scenario_engine.py:1151–1152`
  in place with the same line count.
- [ ] 2.5 Edit the Purpose paragraph of `openspec/specs/http-api/spec.md` in
  place: "the Plan, Diagnose, Changes, and the store". Edit no requirement in
  any `openspec/specs/` file; the surfaces and behavioral-layer changes travel as
  this change's deltas.
- [ ] 2.6 Regenerate the design exploration with `uv run python
  mockups/harmonic-v2.exploration/generate.py`, then run it with `--check`.
  Exactly `utilities.json` (it embeds the Guide article), `focus.json` and
  `journey.json` move: the last two carry a `code_version` hashed over
  `ciq_autotune/*.py`. Any other file that moves is reported, not committed.
- [ ] 2.7 Run the residue command from design.md and classify every printed line
  in the execution receipt. Only these are permitted: the 51 keep lines, the five
  delta-superseded spec lines, at most the two `verify-workstation-chart.js`
  retirement-pointer lines, and this change's new negative-assertion lines.

## 3. Behavior ledger and replay

- [ ] 3.1 Append `## #447 amendment — 2026-09-23, issue #447` to
  `mockups/harmonic-v2-desktop.behavior.md`. It quotes the sanction line from
  design.md and says that no existing story is amended or retired. It adds these
  stories in the ledger's STORY format (element, source, lock, data, evidence,
  status):
  - **S169**: a watched Trial's dock and Changes print one day count, the served
    `days_elapsed`. On `c3-trial` the dock reads `Ready to judge — ‹N› days since
    ‹MM-DD› · ‹R› required`, and Changes' Watch maturity figure reads `‹N› days`
    with `‹R› required`. Neither prints a count past its requirement as
    `‹N› of ‹R›`. `lock: HV2-24, HV2-12`.
  - **S170**: the Guide's "Reading the Diagnose surface" article names no Verify.
    Its Cause-lever line says those levers flow to a Focus, followed in Changes.
    `lock: HV2-33`.

  Leave the ledger's frozen header, its inventory line and ACCEPTANCE.md's count
  sentence alone. The release coordinator owns them.
- [ ] 3.2 Add both story bodies as `C4_STORIES.S169` and `C4_STORIES.S170` in
  `frontend/c4.replay.mjs`.
  - S169 reads the served admission and the selected Trial from
    `/api/verify/trials`. Its premises are an active Trial whose served `state`
    is `complete` and whose `days_elapsed` exceeds `days_required`. It opens
    Diagnose and requires `.inspector > .watch .how` to read exactly
    `Ready to judge — ${N} days since ${MM-DD} · ${R} required`, built from the
    served values and change date. It activates the dock's link, requires
    `.gf-stage-trial` visible, requires `[data-part="maturity"] .gf-figure` to
    start with `${N} days` and carry `${R} required`, and requires
    `progress[aria-label="Trial progress"]` at value `R` of max `R`.
  - S170 reads the served `/api/kb/reading-diagnose` markdown. Its premise is
    that the markdown carries a `◈ Cause` line. It opens `[data-utility="guide"]`
    and `[data-utility-slug="reading-diagnose"]`, then requires the
    whitespace-normalised `.gf-article` text to contain no `Verify` and to carry
    `flow to a Focus, followed in Changes`.

  Register each exactly once in `frontend/desk-behavior.replay.mjs` behind a
  `// STORY:harmonic-v2-desktop:S169` / `S170` marker, as
  `appOnly('HV2-24', …)` / `appOnly('HV2-33', …)` exports, and in `REGISTRY` as
  `['S169', S169, J()]` and `['S170', S170, J()]`, the way S139 and S140 are
  registered. Map `S169: 'c3-trial'` and `S170: 'showcase'` in
  `frontend/replay-cases.mjs` `STORY_CASES`. `c3-trial` (S7) and `showcase` are
  already smoke-covered, so `SMOKE_STORIES` and its digest do not move.
  In `frontend/c4.replay.test.js`, pin that each story is registered once on its
  case and term. Run each body against a fake page carrying the branch's text
  and require it to pass. Run each body against a fake page carrying the base's
  text and require it to reject at its content assertion, not at a premise: for
  S169 the dock reads `Ready to judge — 14 of 14 days since 05-15`; for S170 the
  article reads `flow to Focus / Verify`.
- [ ] 3.3 Move the pinned literal in
  `mockups/sweep/harmonic-v2-desktop/acceptance.py` `inventory()` to
  `{"issued": 173, "active": 154, "retired": 19}`. In
  `mockups/sweep/harmonic-v2-desktop/acceptance.test.py`, move the full
  replay-plan count to 173 and the stated inventory to S1–S154 plus R1–R19. Move
  the same-total guard to S1–S155 plus R1–R18: that is still 173, with a split
  that differs from the real one. Then run
  `python3 mockups/sweep/harmonic-v2-desktop/acceptance.py inventory --out
  <scratch>` and see `{'issued': 173, 'active': 154, 'retired': 19}` with
  `missing=[] extra=[]`.
- [ ] 3.4 Coordinator, port-bound. Replay `ONLY=S169,S170` on the base with this
  branch's harness laid over it: S169 fails at its dock-count assertion and S170
  at its no-Verify assertion. Replay the same two on the branch, where both pass.
  Replay `ONLY=S46,S73,S139,S140` on the branch, where all pass. Run everything
  at `VIEWPORT=1280x720` and at `1440x900`. Then capture, from base and branch
  at both sizes, three renders: the dock (`.inspector > .watch`) on `c3-trial`,
  whose branch ready line wraps inside the dock's reserve and is never
  ellipsized; Changes' Trial Watch maturity on `c3-trial`, unchanged; and the
  Guide's "Reading the Diagnose surface" article on `showcase`. Record the
  results in S169's and S170's status lines. The coordinator ticks this task.

## 4. Verification

- [ ] 4.1 After `uv sync --frozen --extra api --extra sync` and
  `npm ci && npm run build`, every one of these exits 0:
  `node --test 'frontend/**/*.test.js'`;
  `uv run python -m pytest tests/test_outcomes_trend.py tests/test_api.py`, then
  the whole backend `uv run python -m pytest` once, with its wall time stated;
  `npx --yes @fission-ai/openspec@1 validate --all --strict`;
  `python3 scripts/check_adr_numbers.py`;
  `python3 scripts/check_owned_identifiers.py`;
  `python3 scripts/check_public_allowlist.py`;
  `uv run python mockups/harmonic-v2.exploration/generate.py --check`;
  `uv run python scripts/check_demo_fixtures.py`;
  `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py
  ReplayPlanTest InventoryProofTest SmokeSelectionTest`; and
  `python3 scripts/build_public_tree.py <scratch>/public-tree`, followed by
  `python3 scripts/check_public_links.py <scratch>/public-tree` and
  `python3 scripts/scan_public_tree.py <scratch>/public-tree`.
