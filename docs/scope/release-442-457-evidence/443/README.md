# #443 synthetic evidence

Everything here is synthetic. Every capture and log comes from committed manufactured QA
recipes (`scripts/qa_e2e_cases.py`) or the committed showcase, served by the offline
no-fetch app (`--no-fetch --token ''`). No personal database, operator screenshot or
real-data payload is included. The release coordinator ran every port-bound leg serially;
the ticket worker bound no port. Absolute paths in the logs are replaced with
`<base worktree>`, `<ticket worktree>`, `<release worktree>`, `<scratch>` and `$TMPDIR`.

Change: `read-time-pump-zone` (OpenSpec), archived with the release. Ticket branch head at
integration: `44a0a332`, merged to the release trunk as `ffd9b49f`. The coordinator's legs
ran on `c76e9434`. The two commits after it reword one docstring in the store module and
regenerate the design exploration's code-version hashes (`8170abca`, the review's
non-blocking finding), and tick task 3.2 (`44a0a332`).

Stores: `basal-lower` serves S42, S145 and S146, and `c3-trial` serves S105. These are the
four replay stories that take a synthetic pump read (task 3.2), re-run as regression: #443
adds, amends and retires no story, as the ledger's release freeze block records. The
case-cache check wrote regenerated case stores beside reference copies in a working
directory, `443-casecache`; that directory is omitted as regenerable binary SQLite, and only
`logs/443-casecache.log` is kept.

The change also carries its own port-free evidence, committed in its `evidence/` folder and
archived with the change. These are worker-run records, not coordinator results:
`failfirst.txt` holds the new stamp, window and unloadable-zone tests run on the unfixed code;
`nonvacuity-floor.txt` holds the three backward-step tests run against a throwaway variant
without the floor; `nonvacuity-unset-zone.txt` holds the two unset-zone tests run against a
throwaway variant whose clock raises when the zone is unset; `clock-sites.txt` lists the 15
process-clock call sites left after the change.

## Requirement map

| Requirement (capability spec, delta) | Stories | Node and backend tests | Log | Captures |
| --- | --- | --- | --- | --- |
| A fetch window ends no earlier than the pump's current date (data-ingest, ADDED) | — | `tests/test_fetch_loop.py` `FetchOnThePumpClockTest.test_window_with_the_process_a_day_ahead`, `FetchOnThePumpClockTest.test_window_with_the_process_a_day_behind`; `tests/test_cli.py` `FetchWindowTest.test_days_window_ends_no_earlier_than_the_pump_day` | the change's `evidence/failfirst.txt` | — |
| A fetch refuses an unloadable time zone before any network call (data-ingest, ADDED) | — | `tests/test_fetch_loop.py` `FetchRefusesUnusableZoneTest.test_unloadable_zone_is_recorded_on_the_process_clock` | the change's `evidence/failfirst.txt` | — |
| The status read's fetch times are on the pump's wall clock (http-api, ADDED) | — | `tests/test_fetch_loop.py` `FetchOnThePumpClockTest.test_success_stamps_the_pump_clock`, `FetchOnThePumpClockTest.test_failed_attempt_stamps_the_pump_clock`, `FetchRefusesUnusableZoneTest.test_unset_zone_is_recorded_not_raised`, `FetchRefusesUnusableZoneTest.test_unloadable_zone_is_recorded_on_the_process_clock`; `tests/test_wall_clock.py` `UnusableZoneTest.test_unloadable_zone_still_takes_a_stamped_write` | the change's `evidence/failfirst.txt`, `evidence/nonvacuity-unset-zone.txt` | — |
| Every stamp the server writes is on the pump's wall clock (http-api, ADDED) | — | `tests/test_wall_clock.py` `StampsOnThePumpClockTest.test_pump_read_capture`, `StampsOnThePumpClockTest.test_focus_pin`, `StampsOnThePumpClockTest.test_plan_and_draft`, `StampsOnThePumpClockTest.test_guidance_set_aside`, `StampsOnThePumpClockTest.test_carb_log_entry`, `StampsOnThePumpClockTest.test_prompt_answer`, `StampsOnThePumpClockTest.test_analysis`, `StampsOnThePumpClockTest.test_reconcile_observes_a_trial`, `StampsOnThePumpClockTest.test_reassessment`, `UnusableZoneTest.test_unset_zone_pins_a_focus_on_the_process_clock` | the change's `evidence/failfirst.txt`, `evidence/clock-sites.txt`, `evidence/nonvacuity-unset-zone.txt`; `logs/443-casecache.log`, `logs/443-acceptance-test.log`; `logs/443-branch-1280x720.log`, `logs/443-branch-1440x900.log` (regression) | — |
| A floored stamp never sorts before the latest capture, Plan or Focus pin (http-api, ADDED) | — | `tests/test_wall_clock.py` `BackwardStepTest.test_a_switch_read_after_the_step_is_recorded_forward`, `BackwardStepTest.test_a_plan_recorded_after_the_step_is_the_pending_plan`, `BackwardStepTest.test_a_focus_ended_after_the_step_ends_after_its_pin` | the change's `evidence/nonvacuity-floor.txt`; `logs/443-branch-1280x720.log`, `logs/443-branch-1440x900.log` (regression) | — |

## Recorded results

Coordinator-run, 2026-09-24:

- **Ticket start** (coordinator log): the worker finished on `c76e9434` ("443 done
  c76e9434"). The coordinator log records no whole-pytest wall time for #443.
- **Full `acceptance.test.py` on `c76e9434`:** "Ran 41 tests in 2.833s", "OK"
  (`logs/443-acceptance-test.log`).
- **`acceptance.py case-cache --check` on `c76e9434`:** "case-cache: exit 0, 7.966 s"
  (`logs/443-casecache.log`). This is the check whose clock patch the change moves.
- **Replay `ONLY=S42,S105,S145,S146` on branch `c76e9434`:** all four pass at 1280x720 and at
  1440x900, `# executed 4 · failed 0 · deferred 0 · selected 4 · chromium launches 1`
  (`logs/443-branch-1280x720.log`, `logs/443-branch-1440x900.log`). The coordinator log
  agrees: "acceptance.test OK; case-cache --check OK; S42/S105/S145/S146 4/4 both sizes".
- **No base leg.** Task 3.2 expects the four stories to pass on base as well as on the
  branch. No base run of them was made for #443, and the coordinator log records none. They
  are regression stories, not fail-first stories.
- **Review** (coordinator log): the Full code review found one non-blocking docstring
  finding, and close-out followed with the legs done. The docstring fix is `8170abca`; no leg
  was re-run after it.
- **Release trunk:** `TRUNK ffd9b49f #443 merged (exploration regen; targeted pytest 276)`.
  No trunk leg re-ran S105, S145 or S146. S42 was re-run with the em-dash widening
  ("EMDASH legs 678fb544: S4,S42,S142,S153,S178 5/5 both sizes"), on the widening branch at
  `678fb544`, which later merged into the trunk as `9882bcfe`.
- The complete ledger at both sizes, the whole backend pytest and the full
  `acceptance.test.py` run once on the commit that is pushed; the pull request records the
  result.

## Renders

None owed. #443's only desk change is in `frontend/day.js`: Day's read time drops its
`|| status.last_written` fallback and reads `last_success_at` alone (`4f2c6e72`). The
coordinator's triage ruling named it a dead fallback to remove. The ADR 443 record says why the
branch cannot run: the store writes `last_success_at` and `last_written_json` in one statement
under the same success flag, so `last_written` is never set while `last_success_at` is empty
(and it is a record of counts, never a time). No rendered state changes. The served stamp's wall
clock is pinned by the backend tests in the requirement map above (`tests/test_fetch_loop.py`
and `tests/test_wall_clock.py`), and the render manifest records the lifecycle as `none`.

## Logs

Each leg's commit is the one its coordinator run transcript printed first (`prep <tree>
<oid>`, and `prep base-b03431d2 b03431d2` after the `overlay:` lines for a base leg); those
transcripts are not kept in this folder.

| File | Leg | Commit |
| --- | --- | --- |
| `logs/443-acceptance-test.log` | full `acceptance.test.py` | `c76e9434` |
| `logs/443-casecache.log` | `acceptance.py case-cache --check` | `c76e9434` |
| `logs/443-branch-1280x720.log` | branch replay `ONLY=S42,S105,S145,S146` at 1280x720 | `c76e9434` |
| `logs/443-branch-1440x900.log` | branch replay `ONLY=S42,S105,S145,S146` at 1440x900 | `c76e9434` |
| `443-casecache/` (omitted) | the case-cache check's working directory of regenerated SQLite case stores; regenerable binary, not kept | `c76e9434` |
