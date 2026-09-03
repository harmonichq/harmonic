# Tasks — the left-column pattern (#306)

## 1. Author the headlines with the operator (attended)

- [ ] Serve the ticket worktree through the declared QA copy-then-serve
      command (`AGENTS.md` "The data boundary") and look at every chart family
      on the Diagnose stage yourself at 1440×900 and 390×844 — basal,
      correction factor, carb ratio, event comparison, and a promoted Watching
      read — before asking the operator anything. Record the base: the ticket
      branch's merge-base with `origin/main`; spin a second worktree at that
      commit, serve it on a distinct port from its own scratch copy of the same
      showcase, replay `frontend/diagnose-workstation-behavior.replay.mjs`
      against it, and record its applicable story count under `## Base story
      counts` in `design.md`.
- [ ] Write `openspec/changes/left-column-pattern/evidence/headline-facts.py`,
      a generator that reads the served showcase through the production API
      (the findings projection for every window preset the app offers plus the
      whole-day read, and for each row the evidence endpoint its chart reads:
      basal night evidence, ISF rest-window evidence, I:C block evidence, the
      Finding case file) and emits `evidence/headline-facts.csv` with one row
      per findings row and every fact the engine publishes for it: id, family,
      register, tier, priority, direction, `asserts_move`, support, span,
      window, annotation or hold reason, the tile's direction counts and
      exclusions, and — marked reference-only, never a template slot — the
      case file's claimed-of-denominator and consequence facts. Stamp it `_generated_by` + `_note` as synthetic provenance; hand
      the operator the same rows as a spreadsheet outside the repo (never
      committed).
- [ ] The operator writes an example headline per row in the sheet; commit the
      returned sheet as `evidence/headlines.authored.csv`, and from it record
      under `## Headline templates` in `design.md` one dated sanction per
      family and register (`Connor Griffin · <date> · "<example>"`), each
      naming its template with slots that name only row fields or the three
      analyzer-payload evidence modules (basal night, ISF rest-window, I:C
      block); tell the operator before they write that a Finding case-file
      fact cannot be a slot. Iterate
      until basal, correction factor, carb ratio and event comparison each
      have a ruled template for every register they publish (`assert`,
      `finding`, `held`, `blind`, `history` — history sentences are consumed
      by #302's queue rows, never by the stage), and the shape rule in ADR 306
      (headlines) holds for each.

## 2. Serve the headline

- [ ] `FindingsProjection.project` stamps `headline` on every row from the
      templates recorded under `## Headline templates` in `design.md`,
      composed only from the row's own fields or from the evidence its
      chart's endpoint serves, read through the same functions those endpoints
      call in `ciq_autotune/basal_night_evidence.py`,
      `ciq_autotune/isf_rest_window_evidence.py` and
      `ciq_autotune/ic_block_evidence.py`, inside the cached projection
      (`/api/diagnose/findings`, `ciq_autotune/api.py:854`) with no second
      cache — never `ciq_autotune/finding_case_file.py`, which is prepared
      from the projection; nothing here recounts raw records or re-derives a
      direction, floor or threshold. Add `headline` to `ExpectedQueueRow` in
      `scripts/qa_e2e_cases.py` and dump the literal per case per
      `AGENTS.md` "Maintaining QA coverage eras"; the catalog-generated tests
      must fail first on the missing field.
- [ ] Tests in `tests/test_findings_projection.py` through `project()`: every
      register of every family carries a non-empty headline; a held or blind
      row's sentence names the withheld move and its reason; a rerun of the
      same window yields the same sentence; no headline contains a value
      absent from the row or its evidence.
- [ ] Regenerate `frontend/__fixtures__/findings-projection.json` with
      `scripts/gen_findings_projection_fixtures.py`, transcribe the field into
      `mockups/findings-projection.mirror.mjs` so
      `frontend/findings-projection-mirror.test.js` deep-compares clean,
      regenerate `mockups/diagnose-workstation.synthetic/` through
      `.claude/qa/gen_synthetic_fixtures.py` so `scripts/check_demo_fixtures.py`
      passes, regenerate the two explorations that read those fixtures
      (`node mockups/finding-evidence-routing.exploration/build.mjs` for its
      `data.json`; `uv run python mockups/diagnose-evidence-canvas.exploration/generate.py`
      for its `index.html`) and run both `--check`s.
- [ ] Re-measure the five QA budgets per `AGENTS.md` "Maintaining QA coverage
      eras" step 4 without raising a limit and record the figures under
      `## QA budgets` in `design.md`; a breach stops the work. Fast gate and
      every `--check` green on the chunk branch; stage by path.

## 3. The left-column pattern in the shipped app

- [ ] Stage rule: leaving a drill for the findings queue re-seats the rank-1
      chart (`popTo` seats through the same resolution the reconcile uses —
      the rank-1 event chart, else the first ranked candidate). An explorer
      pick already drills through `showChartInspector`; its redundant
      `focusChart` goes. Node tests in `frontend/diagnose-canvas-state.test.js`
      fail first on today's behavior (stage keeps the drilled chart after pop).
- [ ] Drawer as picker: `dockWant` boots `'hidden'`; the resize crossing rule
      only hides (shrinking past `DOCK_FLOOR` hides, growing back never
      re-docks); every pick from the drawer — cell click or Enter, a Watching
      tail cell, an explorer pick — seats and drills, then sets the want to
      hidden; "Bring the charts up", "show every chart" and fullscreen are
      unchanged. Node tests for the resolved transitions fail first.
- [ ] Stage nameplate: the focal tile's `.tile-head h3` renders the row's
      served `headline` verbatim (drawer and explorer cells keep `nameFor`'s
      short title); delete the basal option builder's local headline
      composition and the deck graphic that drew it, reclaiming the deck's
      vertical budget for the plot, and keep the middle rank's compact verdict
      and tally lines; `frontend/diagnose-evidence-charts.test.js` pins the
      deck without a headline. No drill level renders the headline.
- [ ] Fast gate green; `node mockups/finding-evidence-routing.exploration/build.mjs --check`
      and `uv run python mockups/diagnose-evidence-canvas.exploration/generate.py --check`
      still pass.

## 4. Attended revise round, ledger and evidence

- [ ] Serve the revision and the base side by side on the same showcase copy;
      run UI Craft revise rounds on the stage nameplate's editorial treatment
      (the bar it lives in, its height, type size under the 1.5rem no-hero
      cap, wrapping, the meta caption's place) per
      `~/.claude/skills/ui-craft/reference/revise.md` §3–4, one question per
      round, every option rendered live with a stated cost; record each ruling
      as a dated sanction under `## Nameplate rulings` in `design.md` and land
      the CSS in `frontend/diagnose-workstation.css`. Fold any correction the
      live run exposes back into `frontend/diagnose-workstation.js`.
- [ ] Amend `mockups/finding-evidence-routing.behavior.md` and
      `frontend/diagnose-workstation-behavior.replay.mjs` in one revision entry
      with base SHA and data provenance: new stories with replay functions for
      the stage returning to rank-1 on leaving a drill, the explorer pick
      drilling, the drawer opening hidden, a drawer pick putting it away, a
      resize never re-docking, the stage title carrying the served headline
      for every family with no drill level repeating it; S114 and S115 amended
      to add the put-away; the grow-back re-dock clause retired with the
      sanction `Connor Griffin · 2026-09-02 · "It opens minimized. It never
      comes back up on its own. That path is archived. It's gone."` and a
      never-silent retired replay function; every `#tile-row` locator
      re-read for the hidden default and the #215 fullscreen-from-dock test
      re-based; each changed story's old replay shown failing before the new
      one passes; `frontend/diagnose-behavior-ledger-parity.test.js` green.
- [ ] Evidence under `openspec/changes/left-column-pattern/evidence/`:
      before/after renders from both worktrees at 1440×900, 1280×800 and
      390×844 of the queue root, each family drilled, a promoted Watching read,
      the drawer hidden, brought up, and the explorer; the replay's complete
      output with its story count; a README naming provenance; the `#306` row
      in `mockups/INDEX.md`.
- [ ] Fast gate and all ten browser legs green locally against the declared
      no-fetch server; zero failures and no skipped story; each leg's
      applicable story count in the commit message.

## 5. Close (coordinator)

- [ ] Tick each task above only when implemented and verified; run `/review`
      at Full depth and resolve every blocking finding before opening one pull
      request. Do not merge.
