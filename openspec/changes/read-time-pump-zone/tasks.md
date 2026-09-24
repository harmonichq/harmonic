# #443 implementation checklist

## 1. Tests first (tests/test_fetch_loop.py)

- [ ] 1.1 Add a test class that pins two zones apart and restores both in
  cleanup:
  - the process zone: set `os.environ["TZ"] = "Pacific/Kiritimati"` and call
    `time.tzset()`, then restore the previous value (or remove it) and call
    `time.tzset()` again;
  - `TIMEZONE_NAME = "Pacific/Pago_Pago"`, through `mock.patch.dict(os.environ, …)`.

  The two wall clocks are 25 h apart and neither zone observes daylight saving,
  so both the stamp and the calendar date differ at every instant. The class
  must not depend on the runner's zone or on `tests/conftest.py`'s `UTC`
  default. Every test drives `run_fetch_once` with
  `ciq_autotune.sync.pull_from_tconnect` patched, as the existing tests do, and
  reads the result through `Store.fetch_status()`. Compare each stamp with
  `datetime.now(ZoneInfo("Pacific/Pago_Pago"))`, made naive, within two minutes.
  - **Success stamp.** A successful attempt's `last_success_at` and
    `last_attempt_at` are both on the pump's wall clock.
  - **Failed-attempt stamp.** An attempt whose pull raises records
    `last_attempt_at` on the pump's wall clock, and `last_success_at` stays
    unset.
  - **Window end.** The pull is called with `end` equal to the pump's calendar
    date and `start` equal to that date minus `FETCH_WINDOW_DAYS`. Run it
    twice: once as pinned above (the process a day ahead of the pump), and
    once with the two zones swapped (the process a day behind).

  Record each test failing on the unfixed `fetch_loop.py` before task 2.1.
  `docs/scope/443-read-time-pump-zone.repro.py` shows the expected failures.
- [ ] 1.2 Unset-zone test. With `TIMEZONE_NAME` removed from the environment
  (`mock.patch.dict(os.environ, env, clear=True)`) and the pull **not** mocked,
  `run_fetch_once` returns without raising and records:
  - `last_error` naming `TIMEZONE_NAME`;
  - `last_attempt_at` set;
  - `last_success_at` unset.

  The real pull refuses before any network call, so nothing is fetched. This
  passes on base, and it pins the fallback. Show it is not vacuous: in a
  throwaway edit that drops the fallback, watch it fail, then revert.
- [ ] 1.3 Leave every existing test in `tests/test_fetch_loop.py` and the
  fetch-status tests in `tests/test_store.py` passing, and do not edit them.

## 2. The fetch loop (ciq_autotune/fetch_loop.py)

- [ ] 2.1 In `run_fetch_once`, replace `end = date.today()` and
  `attempted_at = datetime.now().strftime(...)` with one reading of the pump's
  wall clock:
  - the current UTC instant (`datetime.now(timezone.utc)`), passed through
    `store.normalize_time`;
  - on `TimezoneNotConfigured` only, the process clock in the same
    `YYYY-MM-DD HH:MM:SS` form.

  Take `attempted_at` from that text and `end` from its calendar date, and
  keep `start = end - timedelta(days=days)`. Keep the reading local to this
  module, because it has one caller. Add no second conversion: `normalize_time`
  is the one path. Delete any import this leaves unused. Change nothing else
  in `run_fetch_once` or `run_fetch_loop`, including:
  - the order of the revision baseline, `record_fetch_result` and reconcile;
  - the return values;
  - the `on_write` contract.

## 3. Verification

- [ ] 3.1 On the commit to be delivered, run each command below on its own and
  record its exit code. A failure in one does not skip the rest.
  1. `uv run python -m pytest tests/test_fetch_loop.py tests/test_store.py tests/test_sync_partial.py tests/test_api.py`
  2. `uv run python docs/scope/443-read-time-pump-zone.repro.py`
  3. `uv run python mockups/harmonic-v2.exploration/generate.py --check`
  4. `npx --yes @fission-ai/openspec@1 validate --all --strict`
  5. `python3 scripts/check_adr_numbers.py`
  6. `python3 scripts/check_owned_identifiers.py`
  7. `python3 scripts/check_public_allowlist.py`

  Every command must exit 0. Command 2 must report 3 tests OK, and command 3
  must print `harmonic-v2 design: current`. `tests/test_api.py` serves the
  built shell, so run `npm ci && npm run build` first. Run the whole backend
  suite (`uv run python -m pytest`) once, on the final commit, and record its
  wall time. A leg that cannot run is reported as not run, with its reason. It
  is never counted as a pass.
