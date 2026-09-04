# Tasks — the tapered urgency queue (#302)

## 1. Retune the alignment windows across every encoding

- [ ] In `ciq_autotune/analyzers/scenario/evidence_population.py` set
      `_WINDOWS[Exposure.LOWS] = (-60, 120)` and
      `_WINDOWS[Exposure.CORRECTION_CLUSTERS] = (-120, 180)`; leave `MEALS`,
      `HIGHS` and the two lever-specific policies untouched. Update the pinned
      literals in `tests/test_evidence_population_policy.py` (rows for
      `OVER_TREATED_LOW`, `CORRECTION_ON_IOB`, `CORRECTION_STACKING`),
      `tests/test_finding_case_file.py`
      (`test_factor_specific_event_horizons_and_far_pair_selected_evidence`) and
      `tests/test_finding_case_file_api.py` (the `[-300, 180]` far-pair
      assertion); each must fail first on the old value. Add one assertion
      through `prepare`'s public path that a lows case file's cohort traces
      cover exactly −60..+120 and a correction-cluster case file's exactly
      −120..+180 — no minute outside the served `window_min`. In
      `ciq_autotune/event_comparison.py`, `VIEW_CONFIG["meals"]["window"]` and
      `VIEW_CONFIG["lows"]["window"]` read `list(_WINDOWS[Exposure.MEALS])` and
      `list(_WINDOWS[Exposure.LOWS])` from
      `ciq_autotune.analyzers.scenario.evidence_population` instead of
      restating the tuples; add one test in `tests/test_event_comparison.py`
      asserting each view's served window equals the policy table's, shown
      failing first against the restated literal.
- [ ] Move the hand-coded mirrors of the same values:
      `mockups/diagnose-event-comparison.synthetic/generate.mjs` (the
      `[-300, 120]` view window and the `window: [-300, 120]` anchor literal
      become `[-60, 120]`) and its fixture-only projector
      `mockups/diagnose-event-comparison.synthetic/project.mjs` (the `lows`
      config's `window: [-300, 120]` becomes `[-60, 120]`, so the projected
      `alignment_window_min` and the minute walk agree with the capture), then
      regenerate `capture.json` so
      `node mockups/diagnose-event-comparison.synthetic/generate.mjs --check`
      passes; the S13 story in
      `frontend/diagnose-event-comparison-behavior.replay.mjs` (its prose and
      the `state.window[0] === -300 && state.window[1] === 120` assertion) to
      `-60`/`120`.
- [ ] Regenerate the generated consumers through their generators and run each
      `--check`: the seven files `.claude/qa/gen_synthetic_fixtures.py` writes
      into `mockups/diagnose-workstation.synthetic/` (`explore-day.capture.json`,
      `explore-exposures.capture.json`, `settings-audit.capture.json`,
      `ic-blocks.capture.json`, `ic-blocks-asserting.capture.json`,
      `payload.json`, `finding-case-files.json`; the other three captures there
      come from other generators and must not move) then
      `uv run python scripts/check_demo_fixtures.py`;
      `mockups/finding-evidence-routing.exploration/data.json` via
      `node mockups/finding-evidence-routing.exploration/build.mjs` (then
      `--check`); `mockups/diagnose-evidence-canvas.exploration/index.html` via
      `uv run python mockups/diagnose-evidence-canvas.exploration/generate.py`
      (then `--check`). Grep the whole tree (no extension filter, `.git`
      excluded) for `-300, 120`, `-300, 180`, `[-300, 120]` and `[-300, 180]`
      afterwards; the only permitted hits are under `openspec/changes/archive/`,
      under `docs/scope/`, and in this change's own `tasks.md` and `design.md`,
      which quote the old values as history. Any other hit is an encoding this
      task missed: report it, do not edit outside the Expected diff.
- [ ] Fast gate green (`uv run python -m pytest`, `node --test
      'frontend/**/*.test.js'`, every `--check` in `AGENTS.md`); stage by path.

## 2. The tapered rail in the shipped app

- [ ] In `frontend/diagnose-findings-queue.js`, `queueRows` stamps each row's
      `weight` — `hero` for the first shown priced ranked row, `compact` for
      every further shown priced ranked row, `tail` for a shown unpriced ranked
      row, unchanged `collapsed` for Watching — and `caption`, the served tier
      word (`Next in line` / `Worth a look` / `noted`) on the first shown
      ranked row whose `tier` differs from the previous shown ranked row's, else
      `null`. The hero's `headlineLead`/`headlineRest` are the served
      `headline` cut at its first `. ` exactly as `diagnose-workstation.js`
      cuts it for the stage card; a missing headline yields the title alone.
      Add a `TIER` map beside `FLAVOR` whose keys are exactly
      `next_in_line`, `worth_a_look`, `noted` and whose values are DESIGN.md
      rule 4's words `Next in line`, `Worth a look`, `noted`; a slug outside the
      map yields no caption and no kicker word. `caption` is set only on a
      shown **priced** ranked row whose `tier` differs from the previous shown
      priced ranked row's; tail rows never carry one. Nothing here reads
      `priority` as a number, orders by it, or consults `asserts_move`; the one
      permitted read is the existing `row.priority == null`. Node tests in
      `frontend/diagnose-findings-queue.test.js` against
      `frontend/__fixtures__/findings-projection.json` fail first: `global` has
      one hero (`ic:720`), four compact rows (two `next_in_line`, two
      `worth_a_look`) with exactly one caption, `Worth a look`, on
      `finding:over_treated_low`, two tail rows with no caption, one collapsed
      history read; `quiet` has no hero and no caption; a sift that hides the first
      shown priced row promotes the next shown priced row to hero (over a
      projection whose first priced row carries chips — a two-row literal is
      enough, since weight is display logic over served strings, not a safety
      verdict); the `morning`
      window's single priced row is a hero with no compact rows.
- [ ] `renderFindingsQueue` paints the three weights: the hero as a
      `button.qrow.hero` carrying kicker (flavor glyph+word, `TIER[row.tier]`),
      title, subtitle, detail line and drill glyph; a compact row as today's `qrow`
      plus an empty `.mini` host at the row's end; a tail row as a `qrow.tail`
      with numeral slot, title and drill glyph only; a caption as `p.qtier`
      before its row. The seam `tailnote`, the Watching `qcollapse`, every
      `data-state`/`data-tier`/`data-id` attribute, the `n` numeral rule (S118)
      and the `whole_day` scope note keep their bytes and positions. The painter
      returns the rows and a list of `{ host, row }` mini slots for the
      workstation to mount.
- [ ] In `frontend/diagnose-workstation.js`, the findings-level paint mounts
      each returned mini slot with the row's descriptor: resolve the descriptor
      by `chartId === row.id` (the same resolution the drawer's cells use),
      call the registry entry's `option(mode, { data: descriptor.data, range,
      mini: true, window: scopeWindow(), caseFile: descriptor.data, surface })`
      through the existing echarts mount path, render the drawer's pending or
      stale mark when the descriptor's runtime is pending or stale, and dispose
      every row chart before the level repaints. Declare a named constant
      `MIN_ROW_MINI_WIDTH = 120` (provisional; sub-order 3 rules the final
      value live) and, after the rail is painted, measure each mini host's
      `clientWidth`: below the constant, remove the host and set
      `data-mini="omitted"` on the row; re-measure on the existing resize
      observation, never on a hidden rail. Do not reuse `measureFieldNarrow`
      or its 280px, which measure the tile field for a full-width plot. No new
      fetch, no new endpoint, no series computed here.
- [ ] `frontend/diagnose-workstation.css` (layout, type ranks, spacing) and
      `frontend/theme.css` (ink — it already holds the six `.qrow` colour rules
      and is the sole colour source under dark-only): the hero card, the
      compact row's mini column, the tail row, the tier caption and the ≤760px
      stack, all under the 1.5rem no-hero cap and the existing Label/Title/Body
      ranks; every existing `.qrow` selector the replay reads still matches its
      element.
- [ ] Regenerate `mockups/finding-evidence-routing.exploration/data.json`
      (`build.mjs` runs `queueRows`) and adjust `surface.js` only where the
      painter's return shape requires; `node
      mockups/finding-evidence-routing.exploration/build.mjs --check` passes.
      Fast gate green; stage by path.

## 3. Live run, ledger and evidence

- [ ] Record the base: the ticket branch's merge-base with `origin/main`. Spin a
      second worktree at that commit, serve it and the revision on distinct
      ports from their own scratch copies of the showcase per the safe-start
      declaration, replay `frontend/diagnose-workstation-behavior.replay.mjs`
      against the base and record its applicable story count under `## Base
      story counts` in `design.md`.
- [ ] Amend the ledger's provenance: its head (and the #83 re-freeze entry)
      still name `mockups/revise-e2e.synthetic/harmonic.sqlite` and
      `scripts/gen_revise_e2e_db.py`, both retired onto the QA showcase by #319
      (`tests/test_revise_e2e_retired.py`). Add a dated provenance amendment
      stating that live renders and the no-fetch server now read a scratch
      copy of `mockups/qa-e2e.synthetic/harmonic.sqlite` generated by
      `scripts/gen_qa_e2e_db.py`, citing #319 and the operator delegation of
      2026-09-03; this amends a data declaration and retires no story.
- [ ] Amend `mockups/finding-evidence-routing.behavior.md` and the replay in
      one revision entry with base SHA and data provenance: new stories with
      replay functions for the hero (first priced row, served headline cut as
      the stage cuts it, no chart element inside the hero, its chart on the
      stage), a compact row's mini drawn from the same option the drawer cell
      draws (compare the two `getOption()` series ids for one row), the tail's
      title-only rows drilling, tier captions printed once per priced-tier change, each caption's text
      a value of the rail's `TIER` map and no other tier word (and no
      `Decide now`) anywhere in `#level`, the omitted mini below
      `MIN_ROW_MINI_WIDTH` (drive the inspector narrow), and the hero
      promotion under a sift over the fixture mirror's `global` window (its
      first priced row `ic:720` carries no chips, so the story sifts a
      chip-carrying window or asserts the hero is unchanged by a sift — pick
      whichever the mirror can express and say so in the story); re-read
      S29, S42, S74, S75, S118 and S121 against the new markup and amend where
      a locator or text moved, with each changed story's old replay shown
      failing before the new one passes; `frontend/diagnose-behavior-ledger-
      parity.test.js` green. Re-read `frontend/diagnose-workstation.browser.
      test.mjs`, `frontend/diagnose-canvas-composition.browser.test.mjs` and
      `frontend/cockpit-shell.browser.test.mjs` where they locate `.qrow`.
- [ ] Attended-free revise round on the hero's card treatment, type ranks,
      spacing and the final `MIN_ROW_MINI_WIDTH` at the running app (24 h
      window per `design.md`'s render matrix): record each choice as a dated
      entry under `## Live-round rulings` in `design.md`, land the CSS in
      `frontend/diagnose-workstation.css` / `frontend/theme.css`, and fold any
      correction the live run exposes back into
      `frontend/diagnose-findings-queue.js` or `frontend/diagnose-workstation.js`.
- [ ] Evidence under `openspec/changes/tapered-urgency-queue/evidence/`: the
      render matrix in `design.md` from both worktrees; the replay's complete
      output with its story count; a README naming provenance; the `#302`
      revision note on the Finding → evidence routing row in `mockups/INDEX.md`.
- [ ] Fast gate and all ten browser legs green locally against the declared
      no-fetch server; zero failures and no skipped story; each leg's
      applicable story count in the commit message.

## 4. Close (coordinator)

- [ ] Tick each task above only when implemented and verified; run `/review`
      at Full depth and resolve every blocking finding before opening one pull
      request. Do not merge.
