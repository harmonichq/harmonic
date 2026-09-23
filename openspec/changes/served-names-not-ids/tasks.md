# #426 implementation checklist

## 1. Served names (backend)

- [x] 1.1 Serve `lever_title` on every episode of the per-day model read
  (`ciq_autotune/analyzers/scenario/model_view.py`, `_build_episode_view`):
  `levers.title(lever)` for an attributed episode, null for an unattributed one.
  Tests in `tests/test_scenario_model_view.py` through `assemble_model_view` on
  synthetic days: an attributed episode's `lever_title` equals its Lever's
  title, an unattributed episode's is null, and every member of the closed
  Lever set has a non-empty title with no underscore. Fails first on the base
  (the key is absent).
- [x] 1.2 Serve names on guidance's Pattern candidates
  (`ciq_autotune/guidance.py`, `_pattern_candidate`): `title` on each member,
  `action_title` on each member whose `action` is non-null, and `title` on the
  Pattern's `action` when it is an identified action, per ADR 426. Habit
  members are named by `levers.title`; setting members by a closed label table
  beside `_SETTING_UNITS` (Basal, Correction factor, Carb ratio). Tests in
  `tests/test_guidance.py` from the existing synthetic producer: every Pattern
  member carries a non-empty `title` with no `habit:`, `setting:` or underscore
  token and no member is named "ISF"; the correction-factor setting member is
  named "Correction factor"; every member with an action carries
  `action_title`; a Pattern whose action is identified carries its `title`; and
  a named Pattern candidate's set-aside baseline equals the baseline of the same
  candidate with every served name removed. Fails first on the base.
  `tests/test_pattern_replay.py` keeps the literal roster as its oracle: it
  compares guidance's members to the roster's with the name keys removed and
  asserts the served names separately.
- [x] 1.3 Emit `browser_guidance_patterns` from
  `scripts/gen_findings_projection_fixtures.py`: the Pattern candidates
  `guidance.candidates` serves for the same browser-gate inputs that produce
  `browser_outcome_patterns`. Regenerate
  `frontend/__fixtures__/findings-projection.json`; its `--check`, the
  event-comparison capture's `--check` and
  `frontend/findings-projection-mirror.test.js` stay green.

## 2. Changes names what it prints

- [x] 2.1 A Pattern concern in Changes (`frontend/changes.js`) prints each
  member's served `title`, each member's served `action_title` or "No action",
  and the Pattern action's served `title` as its Action figure. Test in
  `frontend/changes.test.js` that mounts Changes on a Pattern concern built
  from the committed fixture's `browser_guidance_patterns`: every member title
  appears and the markup contains no `habit:` or `setting:` text. Fails first on
  the base.
- [x] 2.2 A Focus record's "What changed" (`frontend/history.js`,
  `changeSection`) names the intended behavior by the record's served `title`.
  Test in `frontend/history.test.js`: the Focus variant contains the served
  title and no underscore token. Fails first on the base.
- [x] 2.3 A record whose original context is unavailable (`originalSection`)
  states its served reason through a word table keyed by served reason
  (`not_recorded` → "not recorded"), printing an unknown served reason
  verbatim, as the desk's other word tables do. The existing test that expects
  `unavailable: not_recorded` is reworded to expect prose.

## 3. Day names its origin and its causes

- [x] 3.1 `title` joins the address keys (`frontend/tab-routing.js`
  `CONTEXT_KEYS`). Every Day door passes it per ADR 426: the Diagnose door
  (`frontend/diagnose-context.js` `evidenceDayContext`, called from
  `frontend/diagnose.js`), the active-change door (`frontend/follow-up.js`), the
  record door (`frontend/history.js`) and the utility door
  (`frontend/utilities.js`). `evidenceDayContext` composes a basal slot's words
  (`Basal · 03:00–03:30`) from `SETTING_NAME` (`frontend/plan-view.js`) and
  `formatStartMin` (`frontend/plan.js`). Tests: `frontend/diagnose-context.test.js`
  (a served finding's title and a basal slot's words; the return context still
  round-trips through the router) and `frontend/tab-routing.test.js` (`title`
  survives serialize and parse).
- [x] 3.2 Day's "Opened from" (`frontend/day.js`) prints the entry's `title`,
  never its `subject`; an entry without a title names its return destination.
  Test in `frontend/day.test.js`: a Day frame whose entry comes from
  `evidenceDayContext` with a served finding shows that finding's title and no
  `pattern:`, `finding:` or `basal:` text; a basal-slot entry shows its words;
  an entry without a title shows the return label. The existing contextual-entry
  test stops feeding prose as the subject. Fails first on the base.
- [x] 3.3 Episode Log rows (`frontend/day.js`, with `frontend/day-chart.js`
  where the row is built) end with the episode's served `lever_title`. Delete
  `LEVER_WORD` from `frontend/day.js` and `CLS_NAME`, `clsName` and `humanize`
  from `frontend/day-chart.js`. Tests in `frontend/day.test.js` (and
  `frontend/day-chart.test.js` if the row builder carries the name): rows for
  missed-meal, meal-bolus-short, high-carb-sequence and repeat-eating episodes
  end with their served titles and contain no underscore token; an unattributed
  row names no Lever. Fails first on the base. The `/api/model-view` stub in
  `frontend/desk.browser.test.mjs` gains `lever_title`.
- [x] 3.4 Amend the S61 replay body in `frontend/c2.replay.mjs`: after the
  selected occurrence opens Day, "Opened from" equals the case file's served
  `finding.title` and contains no `finding:`, `pattern:` or `basal:` text; and,
  given the Day's served `/api/model-view` carries at least one attributed
  episode (a premise that fails loudly), each row of an attributed episode ends
  with that episode's served `lever_title` and no row's text contains an
  underscore token. Prove it fail-first in `frontend/replay-cases.test.js` with
  a fake page, following that file's S37b and S56 cases: the amended S61
  rejects an "Opened from" equal to the subject id, a row carrying a raw Lever
  key, and a row lacking its episode's `lever_title`, and passes on served
  names.
- [x] 3.5 Record the S61 and S62 amendments in a new section,
  `## #426 amendment — 2026-09-23, issue #426`, appended to
  `mockups/harmonic-v2-desktop.behavior.md` after the existing dated sections,
  quoting the Q2 sanction (design.md, Revise preparation): S61 names its origin
  by the served title and its Day names each attributed episode's Lever by its
  served name; S62's "names that same subject verbatim" becomes "names that
  subject by its served title". Edit no `★ FROZEN` block, header inventory line
  or story body above the new section. No story is added, so the inventory
  literals in `mockups/sweep/harmonic-v2-desktop/acceptance.py` and
  `acceptance.test.py` do not change.
