# #443 implementation checklist

`design.md` ADR 443 is the authority for every decision named here.

## 1. Tests first

Pinned zones, used throughout. Set the process zone with
`os.environ["TZ"] = …; time.tzset()`, and restore it in cleanup (the previous
value, or removed) with `time.tzset()` again. Set `TIMEZONE_NAME` with
`mock.patch.dict(os.environ, …)`.

- **Apart:** the process is on Pacific/Kiritimati (UTC+14) and `TIMEZONE_NAME` is
  Pacific/Pago_Pago (UTC−11). The wall clocks are 25 h apart and neither observes
  daylight saving, so a stamp and its date differ at every instant.
- **Swapped:** the two zones exchanged, so the process is a day behind the pump.
- **Stamp check:** a stamp is on the pump's clock when it lies within two minutes
  of `datetime.now(ZoneInfo(<pump zone>))`, made naive.
- **Window check:** a window end is right when it equals the later of
  `datetime.now(ZoneInfo(<pump zone>)).date()` and
  `datetime.now(timezone.utc).date()`, and is no earlier than the first.
- **Runner-independent:** no test may depend on the runner's zone or on
  `tests/conftest.py`'s `UTC` default.

Seed stores only from committed synthetic sources:
- `scripts/qa_e2e_cases.materialize_case`, as `tests/test_api.py`
  `_guidance_client` and `tests/test_durable_follow_up.py` `seed_case` do;
- vendor-shaped pump reads, as `tests/test_sync_partial.py` `_details_blob` does,
  or `docs/scope/443-read-time-pump-zone.repro.py` `_pump_read`.

**Base fail-first.** Run the following on the unfixed code before task 2.1, and
save the raw failing output as
`openspec/changes/read-time-pump-zone/evidence/failfirst.txt`:
- the 1.1 stamp cases and the 1.1 window case in the swapped order;
- the fetch-loop half of the 1.2 unloadable-zone case, for both names;
- 1.3;
- every 1.4 case.

On base the window end is the process date. In the swapped order that date is
always a day before the pump's, so the case fails deterministically. The pinned
order's base result depends on the hour, so it is not a fail-first case. 1.5's
fail-first evidence is its broken-variant run, not a base run.
`docs/scope/443-read-time-pump-zone.repro.py` shows the base failures.

- [ ] 1.1 `tests/test_fetch_loop.py`: a new class, pull patched, results read
  through `Store.fetch_status()`. Cases, zones apart:
  - **Success.** `last_success_at` and `last_attempt_at` are on the pump's clock.
  - **Failed attempt.** An attempt whose pull raises records `last_attempt_at` on
    the pump's clock, and `last_success_at` stays unset.
  - **Window.** The pull is called with an `end` that passes the window check,
    and a `start` of `end` minus `FETCH_WINDOW_DAYS`. Run it both apart and
    swapped.
- [ ] 1.2 `tests/test_fetch_loop.py`, zones the fetch cannot use. Do **not** mock
  the pull, and call `run_fetch_once` with a temporary `key_path`. Build the
  environment with `mock.patch.dict(os.environ, env, clear=True)`, leaving out
  every `TCONNECT_*` variable. A base run then refuses at the credential check,
  before any login. Run from the ticket worktree, which has no `.env`.
  - **Unset.** With `TIMEZONE_NAME` also left out, `run_fetch_once` returns
    without raising and records `last_error` naming `TIMEZONE_NAME`,
    `last_attempt_at` set, and `last_success_at` unset.
  - **Unloadable.** Run it for `TIMEZONE_NAME="Not/AZone"` and for the region name
    `"America"` (a subtest each), with the process pinned to UTC.
    `run_fetch_once` returns without raising and records:
    - `last_error` naming `TIMEZONE_NAME`;
    - `last_attempt_at` within two minutes of the process clock (`datetime.now()`);
    - `last_success_at` unset.

    In `tests/test_wall_clock.py`, for the same two names, a stamped API write still
    succeeds: `POST /api/carbs` with `{"t": "2024-05-01 12:00:00", "grams": 30,
    "certainty": "exact"}` on a fresh store returns 200. Its `created_at` lies
    within two minutes of the process clock. That write also runs the floored
    ingestion reconcile. The fetch-loop half is base fail-first (base refuses at
    the credential check and never names the zone). The API half passes on base,
    where every stamp is the process clock.
- [ ] 1.3 `tests/test_cli.py`, zones swapped, `ciq_autotune.sync.pull_from_tconnect`
  patched. `main(["fetch", "--days", "3", "--db", <temp path>])` calls the pull
  with an `end` that passes the window check and a `start` three days before it.
- [ ] 1.4 `tests/test_wall_clock.py` (new), zones apart. Each case checks one
  stamp family through its public path:
  1. **Pump read.** Capture a vendor-shaped read with
     `sync._capture_settings_snapshot`, the capture writer. `/api/pump-settings`
     serves `fetched_at` on the pump's clock.
  2. **Focus pin.** A Focus pinned through `POST /api/focus` (the durable
     missed-meal body `tests/test_durable_follow_up.py` uses) serves `pinned_at`
     on the pump's clock.
  3. **Plan and draft.** A Plan recorded through `PUT /api/plan` then
     `POST /api/plan/apply` (the `basal-raise` case, as `tests/test_api.py` does)
     serves `applied_at` on the pump's clock. The draft's `updated_at` from
     `PUT /api/plan` is on the pump's clock and keeps its `.%f` microseconds.
  4. **Set-aside.** A set-aside through `PUT /api/guidance/preferences/{subject}`
     is served on `/api/guidance` with `decision.decided_at` on the pump's clock.
  5. **Carb log.** An entry through `POST /api/carbs` serves `created_at` on the
     pump's clock.
  6. **Prompt answer.** An answer through `POST /api/prompts/answer` is stored,
     read back by `Store.prompt_responses()`, with `answered_at` on the pump's
     clock.
  7. **Analysis.** `GET /api/analyze` serves `generated_at` on the pump's clock.
  8. **Reconcile.** After a switch read is captured, `reconcile_ingested_follow_up`
     saves a Trial whose `first_observed_at` is on the pump's clock.
  9. **Reassessment.** From case 8's store, `GET /api/verify/trials` lists the
     Trial under `trials`. `GET /api/verify/trials?selected=<its id>&assessment=current`
     serves `selected.reassessment.computed_at` (`watched_change.py:793`) on the
     pump's clock.
- [ ] 1.5 `tests/test_wall_clock.py`, the step. Pin the process to UTC. Make one
  write with `TIMEZONE_NAME` = `UTC` (the container's stamps before this change),
  then the next with `America/Phoenix` (after it, 7 h back). Cases:
  1. **Pump read.** Capture a read with profile 1 active, then a read that
     switches to profile 2, differing only in correction factor 30 → 40 (the
     repro's `_pump_read`). After `reconcile_ingested_follow_up`:
     - `store.settings_snapshots()` is in write order;
     - `/api/pump-settings` serves the second read;
     - exactly one Trial record reads before 30, after 40, dated at the second
       read.
  2. **Plan.** Record a Plan, withdraw it (`POST /api/plan/history/withdraw`,
     durable), step, record a second Plan. `/api/plan/history` lists the second
     first, and `/api/guidance` serves it as `pending_plan`.
  3. **Focus.** Pin a Focus, step, resolve it
     (`POST /api/focus/{id}/resolve`). The saved ending's `effective_at` is later
     than `pinned_at`.

  Fail-first here is the broken variant. In a throwaway edit that drops the
  `after` argument at the three floored sites, watch all three fail, then revert.
  Save that run as
  `openspec/changes/read-time-pump-zone/evidence/nonvacuity-floor.txt`.
- [ ] 1.6 `tests/test_wall_clock.py`, unset zone through the API. With
  `TIMEZONE_NAME` removed, a Focus pin through `POST /api/focus` succeeds, and its
  `pinned_at` lies within two minutes of the process clock (`datetime.now()`).
  Show 1.2's unset case and 1.6 are not vacuous: in a throwaway edit where
  `wall_clock_now` raises when the zone is unset, watch both fail, then revert.
  Save that run as
  `openspec/changes/read-time-pump-zone/evidence/nonvacuity-unset-zone.txt`.

## 2. One clock (ADR 443, Decisions 1–6)

- [ ] 2.1 `ciq_autotune/store.py`:
  - Add `pump_zone()` beside `normalize_time`, the one zone loader (Decision 2).
    It returns `ZoneInfo(TIMEZONE_NAME)`, or `None` when the variable is unset or
    `ZoneInfo` raises `ZoneInfoNotFoundError`, `ValueError` or `OSError`.
  - Add `wall_clock_now(after=None)` beside it. It returns the
    current UTC instant converted to `TIMEZONE_NAME` with `normalize_time`'s
    expression, naive, to the microsecond. When the variable is unset, or
    `pump_zone()` returns `None`, it returns `datetime.now()`. When `after` is given and the result, truncated to the
    second, is not later than `after`, it returns `after + 1 s`. The floor has no
    bound (Decision 3).
  - Add `Store.latest_server_stamp()`: the latest of
    `profile_settings.captured_at`, `plan_history.applied_at` and
    `focus.pinned_at`, parsed with `datetime.fromisoformat`, or `None`.
  - Replace three fallbacks (`or datetime.now()`) with `wall_clock_now()`: the
    carb-log `created_at`, the prompt `answered_at`, and `record_pattern_review`'s
    sign-off `decided_at` (`store.py:1842`).
- [ ] 2.2 `ciq_autotune/sync.py`:
  - Add `window_end(pump_now)`, returning the later of `pump_now.date()` and the
    current UTC date (Decision 4).
  - In `pull_from_tconnect`, directly after the unset-zone refusal, refuse when
    `store.pump_zone()` is `None`. Raise a `RuntimeError` naming `TIMEZONE_NAME`,
    before the sync-extra import, the credential read or any network call
    (Decision 2). Add no other loadable-zone check anywhere; `normalize_time`
    stays as it is.
- [ ] 2.3 Call `wall_clock_now()` at every other site in the Decision 1 table,
  imported by name into each module:
  - `fetch_loop.py`: one reading per attempt supplies both `attempted_at` and
    `end = sync_mod.window_end(reading)`;
  - `cli.py`: `end = sync_mod.window_end(wall_clock_now())`;
  - `watched_change.py:793` `computed_at`;
  - `pending_prompts.py:348` `wall_now`;
  - `api.py:862` `decided_at`;
  - `api.py:1577` draft `updated_at` (keep `.%f`);
  - `analyze.py:514` `generated_at`;
  - `credentials.py:70` `updated_at`;
  - `pattern_sweep.py:1320` `generated_at`.

  At the three floored sites pass `after=store.latest_server_stamp()`:
  - `sync.py:271` `captured_at`;
  - `api.py:1513` `recorded_at`;
  - `watched_change.py:1712` `recorded_at`.

  Point the two `pending_prompts.py` docstrings that name `datetime.now` as the
  grace's clock (lines 329–331 and 405 on base) at
  `~ciq_autotune.store.wall_clock_now`. Leave every data-time anchor Decision 1
  lists untouched, and delete any import this leaves unused.

  Run the command in design.md's "Clock sites after the change". Save its output
  as `openspec/changes/read-time-pump-zone/evidence/clock-sites.txt`. It must
  equal the 15 pinned lines, except that the one `store.py` line is whichever
  line holds `wall_clock_now`'s process-clock fallback.
- [ ] 2.4 `frontend/day.js`: `readAt: status.last_success_at || null` (Decision 5).
  The commit message names the invariant: `Store.record_fetch_result` advances
  `last_success_at` and `last_written_json` in one statement under the same `ok`
  condition. Change no other line of `day.js`.
- [ ] 2.5 Re-point the seven clock patches (Decision 6), and change nothing else
  around them:
  - `tests/test_api.py`: `patch("ciq_autotune.api.datetime")` becomes
    `patch("ciq_autotune.api.wall_clock_now", return_value=…)`, and
    `patch("ciq_autotune.analyze.datetime")` becomes
    `patch("ciq_autotune.analyze.wall_clock_now", return_value=…)`;
  - `tests/test_durable_follow_up.py`: its four `ciq_autotune.api.datetime`
    patches become `ciq_autotune.api.wall_clock_now` patches;
  - `mockups/sweep/harmonic-v2-desktop/acceptance.py`: the case-cache check keeps
    its `patch.object(watched_change, 'datetime', Clock)` and adds
    `patch.object(watched_change, 'wall_clock_now', lambda after=None: clock)`.
- [ ] 2.6 Regenerate the design exploration with
  `uv run python mockups/harmonic-v2.exploration/generate.py`. A triage spike
  moved only the `code_version` hashes and the ids derived from them in
  `focus.json` and `journey.json`. Any other change there is a finding to report,
  not to commit.

## 3. Verification

- [ ] 3.1 On the commit to be delivered, run each command on its own and record
  its exit code. A failure in one does not skip the rest.
  1. `npm ci && npm run build`
  2. `uv run python -m pytest tests/test_fetch_loop.py tests/test_cli.py tests/test_wall_clock.py tests/test_store.py tests/test_sync_partial.py tests/test_api.py tests/test_durable_follow_up.py tests/test_plan_verdict.py tests/test_follow_up_store.py tests/test_watched_change.py tests/test_pending_prompts.py tests/test_pattern_sweep.py tests/test_credentials.py tests/test_guidance_preferences.py tests/test_carbs.py`
  3. `uv run python -m pytest tests/test_qa_e2e_cases.py tests/test_gen_qa_e2e_db.py`
  4. `uv run python docs/scope/443-read-time-pump-zone.repro.py`
  5. `node --test 'frontend/**/*.test.js'`
  6. Every drift check AGENTS.md lists: the ten Python `--check` commands,
     `uv run python mockups/harmonic-v2.exploration/generate.py --check`, and
     `node mockups/diagnose-event-comparison.synthetic/generate.mjs --check`.
  7. `npx --yes @fission-ai/openspec@1 validate --all --strict`
  8. `python3 scripts/check_adr_numbers.py`
  9. `python3 scripts/check_owned_identifiers.py`
  10. `python3 scripts/check_public_allowlist.py`
  11. `uv run python mockups/sweep/harmonic-v2-desktop/acceptance.test.py ReplayPlanTest InventoryProofTest SmokeSelectionTest`

  Expectations:
  - every command exits 0;
  - command 3 keeps the QA catalog green with no expectation edited;
  - command 4 reports 6 tests OK;
  - command 5 reports fail 0;
  - every drift check prints current.

  Run the whole backend suite (`uv run python -m pytest`) once, on the final
  commit, and record its wall time. A leg that cannot run is reported as not run,
  with its reason. It is never counted as a pass.
- [ ] 3.2 Port-bound, run by whoever can bind a port (in this release, the
  coordinator), never by a sandboxed worker:
  - the full `acceptance.test.py`;
  - `acceptance.py case-cache --check`, since its clock patch moves;
  - the replay stories that take a synthetic pump read, `ONLY=S42,S105,S145,S146`,
    at 1280×720 and 1440×900. Each is expected to pass on base and on the branch.
