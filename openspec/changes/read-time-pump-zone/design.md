# #443 design record

## ADR 443 — The scheduled fetch stamps its attempt on the pump's wall clock

### Decision

`run_fetch_once` (`ciq_autotune/fetch_loop.py`) takes the current time once per
attempt, on the pump's wall clock. It hands the current UTC instant to
`store.normalize_time`, the conversion every tz-aware record takes on its way
into the store. That function converts to `TIMEZONE_NAME` and returns
`YYYY-MM-DD HH:MM:SS` wall-clock text, whatever zone the server process runs in.
The attempt derives both of its times from that one reading:

- the stamp recorded by `Store.record_fetch_result`: `last_attempt_at` on every
  attempt, and `last_success_at` on success;
- the window end, which is the reading's calendar date, the pump's day. The
  window start stays `days` (120) before it.

When `TIMEZONE_NAME` is unset, `normalize_time` raises `TimezoneNotConfigured`.
In that case, and only then, the attempt reads the process clock, exactly as it
does today. The fallback is kept because the state is reachable: a local
`harmonic serve` starts the fetch loop without requiring the variable (only the
container entrypoint requires it). The fetch loop must never die on one attempt,
and `/api/status` must always show the last attempt. With the variable unset, the
pull refuses before any network call (`sync.pull_from_tconnect`, pinned by
`tests/test_sync_partial.py`). So the only stamp the fallback can write is a
refused attempt's `last_attempt_at`. `last_success_at` cannot advance on it.

Stored stamps are not rewritten. `fetch_status` is a single row: the next
attempt replaces `last_attempt_at`, and the next success replaces
`last_success_at`.

### Authority

Coordinator ruling R443 under Connor Griffin's Q3 delegation, 2026-09-23
("figure it out yourself from here"): fetch-loop bookkeeping stamps are written
in `TIMEZONE_NAME`'s wall clock through the same normalization every record uses;
no entrypoint or container change; existing rows keep their stamps.

### Context

- `run_fetch_once` sets `attempted_at` with `datetime.now()` and `end` with
  `date.today()`. Both read the process zone. The Dockerfile, `docker-compose.yml`
  and `docker-entrypoint.sh` set no `TZ`, so the shipped container's process zone
  is UTC. `TIMEZONE_NAME` sets only the record wall clock.
- `/api/status` serves `fetch_status` unchanged (`api.py` `status_endpoint`).
  The Day desk reads `last_success_at` as its read time (`frontend/day.js`
  `readAt`), prints it in the header kicker and the Episode Log meta, and folds
  it with the viewed stamp when both strings share a minute. Since #427 the
  viewed stamp is the reader's local clock. #427 records a browser in a zone
  other than `TIMEZONE_NAME` as unsupported. Once the read is on the pump's wall
  clock, the fold works with no frontend change.
- Nothing on the server compares `last_attempt_at` or `last_success_at` with
  another time. `record_fetch_result` writes them. The one reader is the
  browser.
- The window end is an inclusive date (`sync._date_windows`). East of UTC, a UTC
  process's `date.today()` trails the pump's date after local midnight, so the
  attempt requests nothing from the pump's current day until UTC midnight. West
  of UTC it runs a day ahead, which requests an empty future day.

### Reproduction

`docs/scope/443-read-time-pump-zone.repro.py` pins the process zone to
Pacific/Kiritimati (UTC+14) and `TIMEZONE_NAME` to Pacific/Pago_Pago (UTC−11). The
wall clocks are 25 h apart, and neither zone observes daylight saving. With the
pull mocked, on b03431d2:

- `last_success_at=2026-09-24 20:05:57`, equal to the process clock, while the
  pump's wall clock read `2026-09-23 19:05:57`: 25 h off;
- window end `2026-09-24`, with the pump's day `2026-09-23`;
- with `TIMEZONE_NAME` unset, the real pull's refusal is recorded without
  raising. This passes on base, and the fallback preserves it.

A triage spike of the decision passed all three, and the existing
`tests/test_fetch_loop.py` and fetch-status store tests stayed green. It was
reverted before this change was committed.

### What stays on the process clock

The server stamps other times with its process clock. All of them stay as they
are:

- a pump read's capture time (`sync._capture_settings_snapshot`), served as
  `/api/pump-settings` `fetched_at`;
- change-record reconciliation times (`watched_change.reconcile_ingested_follow_up`);
- a recorded Plan's `applied_at` and a pinned Focus's `pinned_at` (the follow-up
  mutation path in `api.py`);
- guidance set-aside `decided_at`, and the carb-log and prompt-answer fallbacks
  in `store.py`.

They are left alone because they are compared with one another. Plan
confirmation compares a capture time with a Plan's `applied_at`
(`_confirm_from_read`, `with_plan_verdicts`, `_reconcile_plan`). Moving only the
fetch-written half would put the two sides of that comparison in different
zones in a container. West of UTC, a recorded Plan would confirm hours late.
East of UTC, a read taken before the decision could count as one after it.
Whether they all move together is a separate decision, returned to the release
coordinator with this change. This change touches none of them.

**Accepted with this decision:** in a container, Day's read time and the pump
settings utility's "read …" or Changes' "Captured …" can name different times
for the same fetch, by the zone offset. The utility and Changes print a pump
read's capture time, which keeps the process clock.

### Why no replay story and no browser test

No rendered source changes. Every replay serve runs `--no-fetch`, and no case
store or generator writes a `fetch_status` row, so a replayed Day desk never
has a read time and always shows "viewed". A story could not observe this
change. The backend tests pin both zones themselves, since CI's runner zone is
UTC and `tests/conftest.py` defaults `TIMEZONE_NAME` to UTC. Under those
defaults the old and new stamps are identical.

### Document inventory

The repository was searched for the stamps' names, "read stamp", "served read",
"process zone" and `TIMEZONE_NAME`'s described role. The only prose that states
the read stamp's zone is #427's archived design, which is frozen and stays as
written. README, `docker-compose.yml`, `.env.example`, AGENTS.md and CONTEXT.md
describe `TIMEZONE_NAME` as the wall clock records are bucketed by, and that
stays true. No live document needs amending.

### Risk contract

- **Must prevent:** a fetch attempt that raises out of the loop, or that goes
  unrecorded in `/api/status`, whatever the zone configuration; a
  `last_success_at` written on any clock other than `TIMEZONE_NAME`'s when that
  variable is set; a window that stops before the pump's current day; any change
  to a pump read's capture time, a Plan's or Focus's recorded time, a change
  record's times, or any analyzer, classifier, staging predicate, cap or floor;
  real data in a test, fixture or log.
- **Must recover:** none. The next attempt replaces the stamp.
- **Accepted failure:** a stamp stored before this change keeps its old zone
  until the next attempt (`last_attempt_at`) or success (`last_success_at`). In
  a container, Day's read time and a pump read's capture time can differ by the
  zone offset (above).
- **Unsupported:** a browser in a zone other than `TIMEZONE_NAME` (as #427
  records); a `TIMEZONE_NAME` changed between attempts.
- **Evidence owed:** tests through `run_fetch_once` with the process zone and
  `TIMEZONE_NAME` pinned apart, for the success stamp, the failed-attempt stamp,
  and the window end, each seen failing on the unfixed code; a test that an
  attempt with `TIMEZONE_NAME` unset records the pull's refusal without raising,
  with a broken variant showing it is not vacuous.

Why: the stamp is display bookkeeping with one browser reader, and the window end
only widens what is requested. Disposition: copied unchanged into this design.md,
the admitted artifact the lock pins.
