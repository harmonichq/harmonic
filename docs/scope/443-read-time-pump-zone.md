# #443 — The served read time is stamped in the container's zone, not the pump's

Scope ledger. Opened 2026-09-23 by delegated triage (release brief for #442–#455
and #457). Route: interview mode, answered by the release coordinator under
Connor Griffin's Q3 delegation. The direction is settled by coordinator ruling
R443. One scope question is returned to the coordinator with a recommended
default, and the change is drafted on that default.

## Decisions

- Classification: code. Why: a reproduced backend defect in one function, with
  a served value. `inline`
- Each scheduled fetch attempt reads the pump's wall clock once, through
  `store.normalize_time`, and derives its stamp and its window end from that
  reading. Why: R443, "through the same normalization every record uses".
  Reproduced: 25 h off, and the window a day off, under process zone UTC+14
  against `TIMEZONE_NAME` UTC−11. `→ ADR` (ADR 443)
- The window end moves with the stamp. Why: the same process-calendar read in
  the same function. East of UTC, a UTC container requests nothing from the
  pump's current day until UTC midnight. It is already inside this ticket's
  file. `→ ADR` (ADR 443)
- With `TIMEZONE_NAME` unset, the attempt reads the process clock. Why: a local
  serve reaches that state, and the pull's refusal must still be recorded
  without raising. The pull refuses before any network call, so
  `last_success_at` cannot take a process-zone stamp. `→ ADR` (ADR 443)
- Default, returned to the coordinator: the server's other stamps keep the
  process clock. These are pump-read capture times, Plan and Focus times,
  change-record times, and guidance and carb-log fallbacks. Why: they are
  compared with one another (Plan confirmation compares a capture time with
  `applied_at`), so they move together or not at all. Moving all of them moves
  analysis inputs, and has an upgrade-seam hazard west of UTC. `→ ADR`
  (ADR 443, "What stays on the process clock")
- Surface lifecycle `none`, no replay story, no browser test. Why: no rendered
  source changes. Replay serves run `--no-fetch`, and no store writes a
  fetch-status row, so no story can observe the stamp. S160–S161 stay unused.
  `inline`
- Flat order, Targeted review. Why: no slicing trait fires, and nothing
  reaches the sensitivity floor. No reviewer-memory slicing anchor matched.
  `inline`

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
  zone offset.
- **Unsupported:** a browser in a zone other than `TIMEZONE_NAME` (as #427
  records); a `TIMEZONE_NAME` changed between attempts.
- **Evidence owed:** tests through `run_fetch_once` with the process zone and
  `TIMEZONE_NAME` pinned apart, for the success stamp, the failed-attempt stamp,
  and the window end, each seen failing on the unfixed code; a test that an
  attempt with `TIMEZONE_NAME` unset records the pull's refusal without raising,
  with a broken variant showing it is not vacuous.

Why: the stamp is display bookkeeping with one browser reader, and the window end
only widens what is requested. Disposition: copied unchanged into
`openspec/changes/read-time-pump-zone/design.md`.

## Open questions

- Q1, for the coordinator: should #443 widen from the fetch-status row to every
  server-originated stamp? Default: no. The finding and the options are in the
  triage result.

## Spawned tasks

None. No follow-up issue is filed by this release.

## Review rounds

(Instrumented per round once the coordinator's plan review returns.)
