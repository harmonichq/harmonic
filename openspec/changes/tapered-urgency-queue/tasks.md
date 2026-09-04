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
      −120..+180 — no minute outside the served `window_min`. Leave `ciq_autotune/event_comparison.py`'s `VIEW_CONFIG[...]["window"]`
      literals alone: the standalone route is retired (404 pinned in
      `tests/test_findings_projection.py`) and nothing live reads that key
      (`design.md`, ADR 302 on the windows).
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
      (then `--check`). Sweep for every spelling the old values take afterwards, `.git` excluded:
      `grep -rn -e '-300, 120' -e '-300, 180' .` (source and prose);
      `grep -rn -A1 '"window_min": \[$' mockups frontend/__fixtures__ | grep -E -- '-\s*-300,'`
      (the indented JSON the generators write);
      `grep -n -E '^\s*-300,$|"minute": -300' mockups/finding-evidence-routing.exploration/data.json`;
      `grep -n -- '=== -300' frontend/diagnose-event-comparison-behavior.replay.mjs`.
      Every sweep must come back empty except that the first's only permitted hits are `ciq_autotune/event_comparison.py`
      (the dead `VIEW_CONFIG` window, sanctioned in `design.md`) and this
      change's own `tasks.md`, which quotes the old values as instructions.
      (The hand-drawn wireframes under
      `mockups/finding-evidence-routing.exploration/wireframes/` encode a
      −300 minute walk in other spellings; they are historical drawings, not
      generated, and outside this gate.) Any other hit is an encoding this task
      missed: report it, do not edit outside the Expected diff.
- [ ] Fast gate green (`uv run python -m pytest`, `node --test
      'frontend/**/*.test.js'`, every `--check` in `AGENTS.md`); stage by path.

## 2. The tapered rail in the shipped app

- [ ] In `frontend/diagnose-findings-queue.js`, `queueRows` stamps each row's
      `weight` — `hero` for the first shown priced ranked row, `compact` for
      every further shown priced ranked row, `tail` for a shown unpriced ranked
      row, unchanged `collapsed` for Watching — and `caption` (rule below, else `null`). The hero prints the row's served
      `title`, never its `headline` — the stage card is the headline's only
      home (ADR 306; the shipped requirement's scenario asserts the headline
      text appears nowhere else on the surface).
      Add a `TIER` map beside `FLAVOR` whose keys are exactly
      `next_in_line` and `worth_a_look` and whose values are DESIGN.md rule 4's
      words `Next in line` and `Worth a look` (`noted` is stamped only on
      unpriced rows, which never reach a caption or the kicker); a slug outside
      the map yields no caption and no kicker word. `caption` is set only on a
      shown **priced** ranked row whose `tier` differs from the previous shown
      priced ranked row's; tail rows never carry one. Nothing here reads
      `priority` as a number, orders by it, or consults `asserts_move`; the one
      permitted read is the existing `row.priority == null`. Node tests in
      `frontend/diagnose-findings-queue.test.js` against
      `frontend/__fixtures__/findings-projection.json` fail first: `global` has
      one hero (`ic:720`), four compact rows (two `next_in_line`, two
      `worth_a_look`) with exactly one caption, `Worth a look`, on
      `finding:over_treated_low`, two tail rows with no caption, one collapsed
      history read; `quiet` has no hero and no caption; a sift selecting only `meals` over `global` hides every other priced row
      and promotes `finding:carb_undercount` to hero with no caption (every
      priced row in the fixture carries a `highs` chip; `ic:720`'s chips are
      `["highs"]`); `frontend/browser-fixture-population.test.js` keeps passing
      unchanged — its `queueMeta` string and its `queueRows` shown-row filter
      are not disturbed by the added `weight`/`caption`/headline fields; the `morning`
      window's single priced row is a hero with no compact rows.
- [ ] `renderFindingsQueue` paints the three weights: the hero as a
      `button.qrow.hero` carrying kicker (flavor glyph+word, `TIER[row.tier]`),
      the served `title`, the detail line and the drill glyph — no headline,
      no chart; a compact row as today's `qrow`
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
      every row chart before the level repaints. Read the exported constant `MIN_ROW_MINI_WIDTH` from
      `frontend/diagnose-findings-queue.js` (declared there as `120`,
      provisional; sub-order 3 rules the final value live and lands it beside
      that declaration) and, after the rail is painted, measure each mini host's
      `clientWidth`: below the constant, remove the host and set
      `data-mini="omitted"` on the row; re-measure on the existing resize
      observation, never on a hidden rail. Do not reuse `measureFieldNarrow`
      or its 280px, which measure the tile field for a full-width plot. No new
      fetch, no new endpoint, no series computed here.
- [ ] `frontend/diagnose-workstation.css` carries the hero card, the compact
      row's mini column, the tail row, the tier caption and the ≤760px stack —
      layout and ink alike, on the existing `--mk-*` / `--primary` /
      `--ck-accent` tokens the file's `.qrow` rules already use — under the
      1.5rem no-hero cap and the existing Label/Title/Body ranks; every existing
      `.qrow` selector the replay reads still matches its element.
      `frontend/theme.css` is themed by ROLE (its header names five roles and
      forbids a theme rule wearing a surface's selector): touch it only for a genuine role-level override, report any such gap in
      the handback for the coordinator to record in `design.md` (sub-order 3
      owns that file), and if it changes at all regenerate
      `mockups/diagnose-evidence-canvas.exploration/index.html` (its generator
      bakes `theme.css` in whole) so `generate.py --check` passes.
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
- [ ] Append a ledger provenance amendment. The ledger's head and its #83
      re-freeze entry name `mockups/revise-e2e.synthetic/harmonic.sqlite` and
      `scripts/gen_revise_e2e_db.py`, both retired onto the QA showcase by #319
      (`tests/test_revise_e2e_retired.py`); those bytes are historical run
      records and keep their bytes. Append one new dated amendment stating that live renders and the no-fetch server now read a scratch
      copy of `mockups/qa-e2e.synthetic/harmonic.sqlite` generated by
      `scripts/gen_qa_e2e_db.py`, citing #319 and the operator delegation of
      2026-09-03; this amends a data declaration and retires no story.
- [ ] Amend `mockups/finding-evidence-routing.behavior.md` and the replay in
      one revision entry with base SHA and data provenance: new stories with
      replay functions for the hero (first priced row, the served `title` as its title, the served headline absent from
      `#level`, no chart element inside the hero, its chart on the stage), a compact row's mini drawn from the same option the drawer cell
      draws (compare the two `getOption()` series ids for one row), the tail's
      title-only rows drilling, tier captions printed once per priced-tier change, each caption's text
      a value of the rail's `TIER` map and no other tier word (and no
      `Decide now`) anywhere in `#level`, the omitted mini below
      `MIN_ROW_MINI_WIDTH` (drive the inspector narrow), and the hero promotion under a sift — every rail story that needs a priced
      row opens with the fixture inputs (`history: true`), whose `global` rows
      are pinned in `design.md` "Render matrix"; the default payload-derived
      queue has no priced row and is the no-hero state; the sift story selects
      only `meals` and asserts `finding:carb_undercount` is the hero; re-read
      S29, S42, S74, S75, S118 and S121 against the new markup and amend where
      a locator or text moved, with each changed story's old replay shown
      failing before the new one passes; `frontend/diagnose-behavior-ledger-
      parity.test.js` green. Re-read `frontend/diagnose-workstation.browser.
      test.mjs`, `frontend/diagnose-canvas-composition.browser.test.mjs` and
      `frontend/cockpit-shell.browser.test.mjs` where they locate `.qrow`.
- [ ] Attended-free revise round on the hero's card treatment, type ranks,
      spacing and the final `MIN_ROW_MINI_WIDTH` at the running app (24 h
      window per `design.md`'s render matrix): record each choice as a dated entry under `## Live-round rulings` in
      `design.md`, land the CSS in `frontend/diagnose-workstation.css`
      (`frontend/theme.css` only for a role-level override, regenerating
      `mockups/diagnose-evidence-canvas.exploration/index.html` if it moves),
      land the ruled `MIN_ROW_MINI_WIDTH` beside its declaration in
      `frontend/diagnose-findings-queue.js`, and fold any other correction the
      live run exposes back into `frontend/diagnose-findings-queue.js` or
      `frontend/diagnose-workstation.js`.
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
