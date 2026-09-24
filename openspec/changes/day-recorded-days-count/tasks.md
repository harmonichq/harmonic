# #425 implementation checklist

## 1. The served count (backend)

- [x] 1.1 Add a `Store` method beside `cgm_day_bounds` that returns the number of
  distinct pump-local days (the date of the naive local `cgm_readings.t`, as
  `cgm_day_bounds` buckets it) holding at least one reading with a non-null
  `bg`; an empty table returns 0. Store test in `tests/test_store.py` next to
  `CgmDayBoundsTest`: an empty store counts 0; a store with glucose readings on
  three days (two on one of them), a gap day and a day holding only a
  null-`bg` reading counts 3.
- [x] 1.2 Serve it on `/api/status` as `data_day_count`, read inside the same
  `Store.open` block as `cgm_day_bounds`, beside `earliest_data_day` and
  `latest_data_day`. The status endpoint stays uncached. Failing-first API test in
  `tests/test_api.py` through `GET /api/status` on a store whose readings fall on
  a known set of days with a gap day and a glucose-less day; it fails today on
  the missing key.

## 2. The Day desk (frontend)

- [x] 2.1 Fail first, against today's input. Before any `frontend/day.js` change,
  add cases to `frontend/day.test.js` built from synthetic padded reads shaped as
  `build_day_navigator` serves them (the month plus seven days either side), fed
  through today's `rows` input exactly as `loadedDays()` joins them (the reads
  flattened, unmerged), with the served count on `bounds.dataDays`: (a) the rail
  prints the served count, the same with one read loaded as with two; (b) with
  two adjacent reads loaded, each month's head equals its own recorded days. Run
  them on the unchanged code and record that each fails on its assertion for the
  right reason — the rail printing the loaded-row count, a month head including
  its neighbour's week — never on a thrown error. With June 2024 missing one day
  and July 1–23 recorded (52 days), today's code prints 36 and then 66 in the
  rail, and heads of 30 for July (true 23) and 36 for June (true 29).
- [x] 2.2 Day's status read (`loadBounds`) keeps `data_day_count` as
  `bounds.dataDays` beside the first and last day, and the rail's
  "N recorded day(s) · <first> to <last>" prints it, keeping today's
  singular/plural wording. It never falls back to counting loaded rows.
- [x] 2.3 `dayFrame`'s state takes the loaded month reads, keyed by month as the
  desk holds them (`memory.months`), in place of the pre-joined `rows` list, and
  joins them to one row per day before the ribbon, the month grid or its head
  read them. When two reads carry the same day, the read of that day's own month
  supplies it; a padding row stands only while its own month is not loaded. The
  same join replaces `loadedDays()` for recorded-day stepping, so there is one
  join in the module. `dayState()` passes the reads.
- [x] 2.4 The month head counts the joined rows inside the shown month that have
  data.
- [x] 2.5 Move the `state()` helper and 2.1's cases to the month-keyed input (the
  same padded reads, keyed by month), add (b) in the other load order and that a
  shown month's cells come from its own read, and run the file green.

## 3. Desk browser coverage

- [x] 3.1 `frontend/desk.browser.test.mjs`: add `data_day_count` to the shared
  `STATUS` stub, equal to the days `daysFor` marks as recorded in its span. Add one
  test that, with per-test routes, serves a two-month status span with a
  `data_day_count` and navigator reads padded seven days either side, opens Day,
  opens the Month calendar and pages it forward and back; the rail's count stays
  equal to the served count throughout, and each month's head equals its own
  recorded days. The suite is already hand-listed in `.github/workflows/ci.yml`;
  no workflow change.

## 4. Behavior ledger and replay

- [x] 4.1 `frontend/c4.replay.mjs`: add `C4_STORIES.S127` on the showcase, its
  paging assertions before its served-count comparison so the base app fails on
  paging, not only on the missing field. Open Day through the nav (as S104 does)
  and read the rail's count. Open the Month calendar: the head count equals the
  number of enabled cells. Page to the previous month, then back: after each page
  lands, the rail's count equals the count read on arrival, the shown month's head
  equals its enabled cells, and June's head equals its first reading. Then read
  the served `/api/status` with the file's `read` helper: the rail's count equals
  `data_day_count`. Register it in `frontend/desk-behavior.replay.mjs`
  (`// STORY:harmonic-v2-desktop:S127`, `appOnly('HV2-13', '#425 …',
  C4_STORIES.S127)`, and `['S127', S127, J()]` in `REGISTRY`), and add a
  `frontend/c4.replay.test.js` case that S127 is registered once, carries term
  `HV2-13`, and runs on the `showcase` case.
- [x] 4.2 `mockups/harmonic-v2-desktop.behavior.md`: add a dated
  `## #425 amendment — 2026-09-23, issue #425` section holding story S127
  (element, source, lock, data, evidence, status) and the operator's sanction
  line quoted from the release brief; add S127 to the completeness table's
  `[data-day]` row; move the current freeze header's inventory line to
  148 issued · 129 active · 19 retired. S127's status records the coordinator's
  fail-first run on base `a4d374a7` and its pass on the branch, at both sizes;
  until the coordinator runs them it reads `pending coordinator run`.
- [x] 4.3 Move the ledger inventory literal with it:
  `mockups/sweep/harmonic-v2-desktop/acceptance.py` `inventory()` to
  `{"issued": 148, "active": 129, "retired": 19}`;
  `mockups/sweep/harmonic-v2-desktop/acceptance.test.py`'s full-plan count and
  the two inventory tests' ranges and total; and the count sentence in
  `mockups/sweep/harmonic-v2-desktop/ACCEPTANCE.md`. The smoke slice and its
  hash do not change.

## 5. Verification

- [x] 5.1 Run the fast gate, the backend tests that cover the status read and the
  store, the acceptance unit tests, the OpenSpec validation and the three guard
  scripts named in the lock, and report their output. The port-bound legs (the
  desk browser suite's new case and `ONLY=S127` at both sizes, on base and on the
  branch) are the coordinator's; hand back the exact commands.
