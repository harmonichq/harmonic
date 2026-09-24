# #448 synthetic evidence

Everything here is synthetic. Every capture comes from the committed showcase, served by
the offline no-fetch app (`--no-fetch --token ''`). No personal database, operator
screenshot or real-data payload is included. The release coordinator ran every port-bound
step, which for this ticket is the renders alone; the ticket worker bound no port. This
ticket keeps no leg log (see Logs).

Change: `owned-high-prompts` (OpenSpec), archived with the release. Ticket branch head at
integration: `24fd3202`, the second parent of the trunk merge `790e2ddb`. The coordinator
log records the gate and the code review on `4e73b4cd`; the one commit after it
(`24fd3202`) adds a note to design.md and to the ticket's scope record only.

Stores: the committed `showcase` serves both renders, the Guide's silence article
(448-A1) and the Glossary's Episode Log group (448-B1). No replay story covers this ticket,
so no case store was emitted for it. Its behavior is pinned by backend and node tests that
build synthetic days and a synthetic week in-process, and by the gate the coordinator log
records.

## Requirement map

| Requirement (<capability> spec, ADDED/MODIFIED/REMOVED) | Stories | Node and backend tests | Log | Captures |
| --- | --- | --- | --- | --- |
| A Carb-log prompt asks about eating only at a rise no over-treated low owns (behavioral-layer, ADDED) | — | `tests/test_pending_prompts.py` `OwnedHighTest.test_slow_rebound_after_a_sub70_low_raises_only_the_low_prompt`, `OwnedHighTest.test_near_low_rebound_raises_no_prompt`, `OwnedHighTest.test_a_refuted_low_owns_nothing_so_its_rebound_high_is_asked_about`, `OwnedHighTest.test_a_sequence_won_episode_keeps_its_owned_high`, `OwnedHighTest.test_rise_after_the_rebound_settles_in_range_still_raises_its_prompt`, `OwnedHighTest.test_unbolused_rise_with_no_low_still_raises_its_prompt`, `OwnedHighStoreTest.test_a_known_no_restores_the_rebound_high_question`, `OwnedHighStoreTest.test_a_no_recorded_after_the_latest_reading_does_not_restore_it` | — | — |
| Every classifier judges the context gate under its scenario configuration (behavioral-layer, ADDED) | — | `tests/test_classifier_late_bolus.py` `ConfiguredGateTest.test_a_configured_gate_explains_the_rise`; `tests/test_classifier_carb_undercount.py` `ConfiguredGateTest.test_a_configured_gate_explains_the_rise` | — | — |
| Every reader-facing definition of upstream cause names both of its sources (behavioral-layer, ADDED) | — | `tests/test_guide_catalog.py` `BuildCatalogTest.test_upstream_cause_names_both_of_its_sources`; `frontend/day.test.js` "#448 · the Glossary's Quiet \"explained\" count names both upstream-cause sources" | — | `renders/after/448-A1-*.png`, `renders/after/448-B1-*.png` |

## Recorded results

Coordinator-run, 2026-09-23 and 2026-09-24:

- **Plan:** triage at `064c081f`, with its defaults accepted (open the scope record on
  resume; fix the `day-chart.js:17` comment). Plan review r1, load-bearing, blocked: the
  Guide's served definition (`guide.py`) and the Glossary (`glossary.js`) still defined
  upstream cause by the context gate alone. The coordinator widened the change to both and
  had two ADR notes fixed. Re-pinned at `0d676061` and countersigned at r2. A fresh cold
  review by a second panel then blocked: the shared evaluation's eating-sequence rebuild
  lost `owned_highs`, and no task owned the renders. The coordinator widened the change to
  `evaluation.py` and added render task 3.4 in the desk's one theme. Re-pinned at
  `ccb30365` and countersigned at the second panel's r2. The execution lock is posted at
  https://github.com/harmonichq/harmonic/issues/448#issuecomment-5809417221.
- **Gate, recorded against branch `4e73b4cd`:** "448 START done 4e73b4cd (pytest 1058s;
  71 QA 0 moved; drift 12/12)": a backend pytest wall time of 1058 s, 71 QA cases measured
  with none moved, and all 12 drift checks current. The coordinator log adds a note: each
  `/api/prompts` request now runs one extra 7-day evaluation, uncached.
- **Code review on `4e73b4cd`:** clean at r1; the close-out preflight followed.
- **Release trunk:** `TRUNK 790e2ddb #448 merged; drift 12/12 clean.`
- **No replay leg:** #448 adds and changes no story. The ledger at `9882bcfe` holds no
  S171 and no S172. Its release freeze block lists the 22 added stories (S157, S162–S170,
  S173–S180, S182–S185), says "#443, #444, #448 and #457 change no story", and records the
  inventory as 193 issued · 174 active · 19 retired.
- **Renders:** the before pairs were captured on base `b03431d2` in render phase 1; the
  after pairs on trunk `9882bcfe` in phase 2, which finished with 99 after shots and 0
  failures across the release.
- The whole backend pytest and the complete ledger at both sizes run once on the commit
  that is pushed; the pull request records the result. The ledger holds no #448 story, so
  the pytest run is the one that carries this ticket's tests.

## Renders

- **Before**: base `b03431d2` (origin/main before the release).
- **After**: the release trunk `dd5a93bb`, served with a desk shell built fresh from that
  commit (`npm ci && npm run build`) before the after batch.
- **Owed by**: tasks.md 3.4 (the lock) names both views, the Guide's silence article at
  its Upstream cause row and the Glossary's Episode Log group, at 1280x720 and 1440x900 in
  the desk's one theme.
- **How**: both trees were served with AGENTS.md's QA copy-then-serve command
  (`uv run harmonic serve --no-fetch --token '' --db <scratch copy> --port 8791`) over the
  committed showcase, followed by the replay case server's `reconcile_ingested_follow_up`
  step. Chromium used the dark scheme, the desk's only theme. The same interaction path
  produced each before and after.
- **Files**: each `.png` is the render; each `.txt` beside it holds the page's visible text,
  the address, the focused element and the capture note.

| Shot | Size | State | Store | Route | Before | After |
|---|---|---|---|---|---|---|
| 448-A1 | 1280x720 | Guide silence article at its Upstream cause row (branch: ADR 448 Decision 3 sentence) | `showcase` | Guide → `[data-utility-slug="silence"]`; scroll to "Upstream cause" | [png](renders/before/448-A1-1280x720.png) · [txt](renders/before/448-A1-1280x720.txt) | [png](renders/after/448-A1-1280x720.png) · [txt](renders/after/448-A1-1280x720.txt) |
| 448-A1 | 1440x900 | as above | `showcase` | as above | [png](renders/before/448-A1-1440x900.png) · [txt](renders/before/448-A1-1440x900.txt) | [png](renders/after/448-A1-1440x900.png) · [txt](renders/after/448-A1-1440x900.txt) |
| 448-B1 | 1280x720 | Glossary Episode Log group at its Quiet entry ("explained" clause) | `showcase` | Glossary → scroll `[data-glossary-group="Episode Log"]` Quiet | [png](renders/before/448-B1-1280x720.png) · [txt](renders/before/448-B1-1280x720.txt) | [png](renders/after/448-B1-1280x720.png) · [txt](renders/after/448-B1-1280x720.txt) |
| 448-B1 | 1440x900 | as above | `showcase` | as above | [png](renders/before/448-B1-1440x900.png) · [txt](renders/before/448-B1-1440x900.txt) | [png](renders/after/448-B1-1440x900.png) · [txt](renders/after/448-B1-1440x900.txt) |

### What the pair shows

448-A1: before, the silence article's Upstream cause row reads "An observable recent low
and/or a defensive suspend explains the move. A recovery, not the behavior itself."; after,
it reads "An observable recent low and/or a defensive suspend explains the move, or the
rise is the rebound of an over-treated low, which owns it. A recovery, not the behavior
itself." No other line of the 448-A1 page text differs at either size. 448-B1: before, the
Quiet entry's clause reads "explained (a recent low or a defensive suspend already explains
the move)"; after, it reads "explained (a recent low or a defensive suspend already
explains the move, or the rise is the rebound of an over-treated low)". The one other
difference in 448-B1, the Setting epoch entry's "ISF/I:C measurements" becoming "correction
factor and carb ratio measurements", is #451's change, not this ticket's.

## Logs

No port-bound leg log exists for this ticket, and the coordinator's leg logs hold no file
for #448. It adds and changes no replay story, and its diff touches no browser suite,
replay driver, ledger or acceptance driver, so no replay or browser leg was owed. Its only
port-bound work was the task 3.4 renders above, whose files sit under `renders/`. Its gate
(backend pytest, the drift checks and the QA-case measurement) ran without binding a port
and is recorded above from the coordinator log, not kept as a log file here.
