# #443 design record

## ADR 443 — The server stamps on the pump's wall clock, never behind the latest capture, Plan or Focus pin

### Authority

Coordinator rulings for #443, under Connor Griffin's Q3 delegation, 2026-09-23
("figure it out yourself from here"):

- **R443.** Fetch-loop bookkeeping stamps are written on `TIMEZONE_NAME`'s wall
  clock through the same normalization every record uses. No entrypoint or
  container change. Existing rows keep their stamps.
- **Scope, widened.** Every stamp the server writes that is printed beside, or
  compared with, a record time or another server stamp comes from one clock
  function on `TIMEZONE_NAME`'s wall clock. It is an explicit function called at
  each site, never a process-wide zone change. The unset-zone fallback to the
  process clock is kept.
- **Transition.** The hazard is settled by evidence. Where a one-time backward
  step can write a durable wrong state, the smallest change that makes it
  unreachable ships here with a failing-first test.
- **Window.** The fetch window's end is fixed here.
- **Day read.** The unreachable `|| status.last_written` fallback in
  `frontend/day.js` is removed.
- **Stakes.** Full review depth. No follow-up issue.
- **Plan-review round 1 rulings (same delegation, 2026-09-24):**
  - end the window on the later of the pump's date and the UTC date;
  - an unknown `TIMEZONE_NAME` never stops the loop, and its attempt is recorded
    on the process clock;
  - pin the clock-site grep output;
  - reassessment `computed_at` gets its own case;
  - the floor's claims are limited to the three tables it reads.
- **Plan-review round 2 ruling (same delegation, 2026-09-24):** one zone loader
  in `store.py` returns the zone or `None`, catching `ZoneInfoNotFoundError`,
  `ValueError` and `OSError`. The clock and the pull's refusal both call it, and
  nothing else checks whether a zone loads.

### Decision 1 — One clock: `store.wall_clock_now()`

`ciq_autotune/store.py` gains `wall_clock_now(after=None)`, beside
`normalize_time`. It takes the current UTC instant and converts it to
`TIMEZONE_NAME` with the same expression `normalize_time` applies to a tz-aware
record (`astimezone(ZoneInfo(TIMEZONE_NAME)).replace(tzinfo=None)`). It returns a
naive `datetime` to the microsecond, so the Plan draft's sub-second token keeps
its precision. Every site below calls it by the name its module imports. No site
reads `datetime.now()` or `date.today()` for a stamp any more.

| Site (base line) | Stamp | Where it is printed or compared |
|---|---|---|
| `fetch_loop.py:41,43` | `last_attempt_at`, `last_success_at`; window end | Day read and Episode Log; `/api/status` |
| `cli.py:216` | `harmonic fetch --days` window end | the pull's date window |
| `sync.py:271` | pump-read `captured_at` | `/api/pump-settings` `fetched_at` ("read …", "Captured …"); "On pump since"; change and epoch dating; Plan confirmation |
| `api.py:1513` | follow-up `recorded_at`: Plan `applied_at`, withdrawal `withdrawn_at`, Focus `pinned_at`, ending `recorded_at`/`effective_at`, decision-context `captured_at` | "Decision recorded", "Pinned", "Recorded"; Plan order and confirmation; Focus windows |
| `watched_change.py:1712` | reconcile `recorded_at`: ending times, Trial `first_observed_at`, Plan receipt `established_at` | History "Recorded"; ending windows |
| `watched_change.py:793` | reassessment `computed_at` | History "Computed" |
| `api.py:862` | guidance set-aside `decided_at` | served as the set-aside's `decision.decided_at` |
| `store.py:1842` | `record_pattern_review`'s sign-off `decided_at` (the pattern-sweep approve/dismiss fallback, reached from `api.py:1097`) | the sweep's per-era decision |
| `api.py:1577` | Plan draft `updated_at` | "Draft saved"; the apply request's draft token |
| `store.py:1104,1190` | carb-log `created_at` fallback | a manual carb's time, compared with glucose |
| `store.py:1172,1191` | prompt `answered_at` fallback | the answered-prompt grace; rescue and outcome cut-offs |
| `pending_prompts.py:348` | the grace's `wall_now` | compared with `answered_at` |
| `analyze.py:514` | analysis `generated_at` | Diagnose "basal N d to <date>" |
| `credentials.py:70`, `pattern_sweep.py:1320` | credentials `updated_at`; sweep `generated_at` | neither is printed or compared. Both move so one clock writes every stamp. |

**Not stamps, and not changed:** the data-time anchors of the form
`<latest record instant> or datetime.now()`. They stand for "the latest record",
and they read the clock only when the store holds no record to anchor on:
`analyze.py:208`, `outcomes.py:386`, `outcomes_trend.py:852`,
`analyzers/scenario/engine.py:549`, `analyzers/eating_sequences.py:525`,
`explore_exposures.py:86`, `event_comparison.py:506`, `pending_prompts.py:421`,
`watched_change.py:1710`, and `api.py:410,691,752,1421,1512`.

### Decision 2 — An unset or unloadable zone reads the process clock, and the fetch refuses it by name

`store.pump_zone()` is the one zone loader. It returns `ZoneInfo(TIMEZONE_NAME)`,
or `None` when the variable is unset or `zoneinfo` refuses the name. Measured on
this interpreter, `zoneinfo` refuses a name three ways:
- `ZoneInfoNotFoundError` for an unknown key (`Not/AZone`, `UTC `);
- `ValueError` for a malformed one (`America/`, `../x`, an absolute path, an
  embedded null);
- `OSError` from the file lookup: `IsADirectoryError` for a region name
  (`America`, `US`, `Etc`, `Pacific`), and `File name too long`.

`pump_zone` catches all three. `wall_clock_now` and the pull's refusal both call
it, and nothing else checks whether a zone loads. `normalize_time`'s record
conversion still calls `ZoneInfo` itself and raises, by design: a record is
never converted against a guessed zone.

When `pump_zone()` is `None`, `wall_clock_now` returns `datetime.now()`. That is
exactly what every site reads today. The unset state is reachable:

- a local `harmonic serve` does not require the variable, so its fetch loop,
  startup reconcile and API writes can run without it;
- the no-fetch serve that CI's browser gates and the replay start sets no
  `TIMEZONE_NAME`;
- the CLI reaches the same paths.

Each of those paths already runs on the process clock, so each tolerates the
fallback. The one path where the fallback cannot fire is the pump-read capture:
`sync.pull_from_tconnect` refuses before any network call when the variable is
unset (pinned by `tests/test_sync_partial.py`), so it never reaches the capture.
A refused fetch is still recorded, stamped with the process clock.

**An unloadable zone never stops the loop.** `sync.pull_from_tconnect` refuses
it when `pump_zone()` is `None`, the same way it refuses an unset one: before any
import, credential read or network call, with a `RuntimeError` naming
`TIMEZONE_NAME`.
`run_fetch_once` records that refusal like any other failed attempt, stamped
with the process clock, and nothing raises. On base, an unloadable zone passed the
check, logged in, captured a pump read on the process clock, and then failed on
the first record `normalize_time` could not convert. A region name raised
`IsADirectoryError` there.

The clock falls back rather than raise because a raising clock would also fail
every stamped API write. It would also fail serve startup's recovery reconcile
(`api.py`, when the follow-up frontier is behind), which would take the loop
down with the server. Both run on the process clock on base. `normalize_time`
still raises on an unknown zone, so no record is ever converted against a
guessed one.

### Decision 3 — A floored stamp is never earlier than the latest capture, Plan or Focus pin

At the three sites that write into a history the server orders by time, the
stamp is `wall_clock_now(after=store.latest_server_stamp())`:

- the pump-read capture (`sync.py`);
- the follow-up mutation path (`api.py`: Plan, withdrawal, Focus pin, ending);
- the ingestion reconcile (`watched_change.py`).

`Store.latest_server_stamp()` is the latest of `profile_settings.captured_at`,
`plan_history.applied_at` and `focus.pinned_at`. When the pump's clock reads no
later than that stamp (compared to the second), `wall_clock_now` returns one
second after it.

The floor reads exactly three tables. A floored stamp is therefore later than
every pump-read capture, recorded Plan and Focus pin already stored, and than
nothing else. It is not compared with other endings, receipts or reassessments.
That is enough to make each durable path below unreachable: each path is an
order or comparison among those three stamps, or between one of them and a
floored follow-up write (an ending against its Focus pin). Other designs were
weighed and rejected:

- **Reordering reads by insertion.** Every consumer that sorts or compares
  capture times (`settings.changelog`, `epochs`, `ic_history`,
  `follow_up_comparison`, `trial_evidence`, `replay`, `watched_change`) would
  change, and comparisons across tables (a capture against a Plan) would still
  break.
- **Rewriting old rows.** R443 forbids it.

The floor is not bounded. A host clock that runs ahead and is later corrected
steps back by any amount. Capping the floor would re-open the inverted-record
hazard for exactly that case, and a stamp that runs ahead for a while is the
lesser harm.

The fetch status is not floored. It orders nothing, and Day's read should be the
true time at once.

### Decision 4 — The fetch window ends no earlier than the pump's day or UTC's

`sync.window_end(pump_now)` returns the later of `pump_now`'s date and the
current UTC date. `run_fetch_once` passes its one `wall_clock_now()` reading per
attempt, the same reading that stamps the attempt. `harmonic fetch --days N`
passes a fresh reading. Each start stays the window length earlier.

**Why the later of two dates:** nothing in this repository records how the vendor
reads the end date. Upstream `tconnectsync` sends `'endDate': '%sT23:59:59Z'`
(`tconnectsync/api/tandemsource.py`, `get_pump_logs`), a UTC-labelled literal. If
the vendor reads it as UTC, the pump's date alone would cut the last hours of a
day east of UTC short, and the UTC date alone would do the same west of UTC. The
later of the two covers both readings. It is never earlier than what base sent in
either documented deploy: in a container the process date is UTC's, and in a
local serve it is the pump's. Only a process in a zone east of both could see an
earlier end than base sent, and that end still covers the pump's day and UTC's.
East of UTC, base's UTC container stopped at the pump's yesterday until UTC
midnight.

### Decision 5 — Day reads `last_success_at` alone

`frontend/day.js` reads `readAt: status.last_success_at || null`. The removed
`|| status.last_written` branch cannot run: `Store.record_fetch_result` writes
`last_success_at` and `last_written_json` in one statement, under the same `ok`
condition. `tests/test_store.py`'s fetch-status tests pin that both advance on
success and both hold on failure. The branch would print a count object as a
time if it ever ran.

### Decision 6 — Tests freeze the clock by its bound name

Seven places froze time by patching a module's `datetime`, and they now patch
that module's `wall_clock_now` instead:

- `tests/test_api.py`: two places (`api`, `analyze`);
- `tests/test_durable_follow_up.py`: four places (`api`);
- the case-cache check in `mockups/sweep/harmonic-v2-desktop/acceptance.py`
  (`watched_change`).

A patched name stands in for the whole function, floor included, so those tests
keep their fixed times. The case-cache check keeps its `datetime` patch as well,
for the data-time anchor at `watched_change.py:1710`. `ACCEPTANCE.md`'s sentence
on that check says it freezes `watched_change.datetime`. That sentence is
amended to name both freezes, and nothing else in the file changes.

### Clock sites after the change (generated)

Generated on the triage spike of Decisions 1–4. That spike was reverted; its
full diff was checked against the same command. The command strips line numbers
and leading space, so the output does not move when lines shift:

```sh
grep -rn "datetime.now()\|date.today()" ciq_autotune/ | sed -E 's/:[0-9]+:[[:space:]]*/: /' | LC_ALL=C sort
```

It must print exactly these 15 lines. Fourteen are the data-time anchors
Decision 1 leaves alone. The fifteenth, in `store.py`, is `wall_clock_now`'s own
process-clock fallback (Decision 2), so its text is the fallback expression's
line as written there.

```
ciq_autotune/analyze.py: now = now or span_end or datetime.now()
ciq_autotune/analyzers/eating_sequences.py: end = now or (max(times) if times else None) or datetime.now()
ciq_autotune/analyzers/scenario/engine.py: now = now or span_end or datetime.now()
ciq_autotune/api.py: "admission": follow_up_admission(store, now=_latest_instant(store) or datetime.now())}
ciq_autotune/api.py: now = _latest_instant(store) or datetime.now()
ciq_autotune/api.py: now = _latest_instant(store) or datetime.now()
ciq_autotune/api.py: now = _latest_instant(store) or datetime.now()
ciq_autotune/api.py: resolved = latest.strftime("%Y-%m") if latest else datetime.now().strftime("%Y-%m")
ciq_autotune/event_comparison.py: now = store.latest_cgm_or_basal_timestamp() or datetime.now()
ciq_autotune/explore_exposures.py: now = max(times) if times else datetime.now()
ciq_autotune/outcomes.py: now = now or span_end or datetime.now()
ciq_autotune/outcomes_trend.py: now = now or span_end or datetime.now()
ciq_autotune/pending_prompts.py: now = now or span_end or datetime.now()
ciq_autotune/store.py: if zone else datetime.now())
ciq_autotune/watched_change.py: now = max(times) if times else datetime.now()
```

### Transition evidence: a one-time backward step

A container west of UTC upgrades once: its stored stamps are UTC wall time, and
its new stamps are the pump's, |offset| hours earlier. East of UTC the step is
forward, and a server already running in the pump's zone takes no step.
`docs/scope/443-read-time-pump-zone.repro.py` reproduces each durable path on
b03431d2, stepping the stamping clock 7 h back between two writes. A triage spike
of Decisions 1–3 made the same cases pass through `TIMEZONE_NAME` (UTC, then
America/Phoenix). With the floor removed they failed again.

| Reader that orders or compares server stamps | Without the floor | With the floor |
|---|---|---|
| Pump-read order (`settings_snapshots` by `captured_at`) → switch changelog → reconcile's Trial records and `_reversal_at` endings | **Durable.** Reproduced: a switch from correction factor 30 to 40 read after the step was saved as a Trial 40 → 30, dated at the older read. Theory: interleaved reads close real switches as walk-backs. | Reads stay in write order; one Trial 30 → 40 at the newer read |
| Latest pump read (`snapshots[-1]`): `/api/pump-settings`, the Plan apply path's `source_profile` and deliverable | **Durable.** Theory, same order fault: a Plan recorded in the seam builds its deliverable from the older read | The newest read is last |
| Plan order (`plan_history` by `applied_at DESC`) → `pending_plan`, `with_plan_verdicts`, admission | **Durable and permanent.** Reproduced: the Plan recorded after the step is served `superseded` and no Plan is pending, so it never confirms and admission accepts another decision | The new Plan is newest and pending |
| Focus ending against its pin (`capture_ending` saves `effective_at` as given) | **Durable.** Reproduced: a Focus pinned before the step and resolved after it saved an ending effective 7 h before its pin | Ending ≥ pin + 1 s |
| Focus history order (`focus` by `pinned_at DESC`) | Display order inverted | Write order |
| Plan confirmation (`_confirm_from_read`: a read after `applied_at`) | Delay: reads after the step look earlier than a Plan recorded before it | No delay: floored reads follow the Plan |
| `_reconcile_plan` (`applied_at` ≤ a change's time) | Delay | Delay: a Plan recorded in the seam runs up to |offset| ahead, so a change keyed within that margin gets its receipt from `_confirm_from_read` on a later read |
| `with_plan_verdicts` `on_pump` (latest read against `applied_at`) | Read-time only | Read-time only |
| Answered-prompt grace (`answered_at` against `wall_now`) | A pre-step answer's grace lasts up to |offset| longer; read-time only | Same |
| Captures against record times (`follow_up_comparison`, `trial_evidence`, `epochs`, `ic_history`, `replay`) | Base already stamps every container capture |offset| ahead of the records | Only captures written in the seam run ahead, and by at most |offset| |
| Guidance-preference migration (`min(decided_at)`) | Runs once at startup, before any post-step stamp | Unaffected |
| Fetch status (one row) | Orders nothing | Not floored; correct at once |

### Consequences

- In the documented container, every stamp the desk prints and every server
  stamp compared with a record is on the pump's clock. Day's read folds with a
  view in the same minute again. The pump-settings utility's "read …", Changes'
  "Captured …" and "On pump since …", the History and Plan times, and Diagnose's
  window date all name the pump's time.
- The seam: for up to |offset| hours after a west-of-UTC container upgrades, the
  three floored sites stamp pump reads, Plans, Focus pins and follow-up writes
  just after the latest stored capture, Plan or Focus pin, ahead of the pump's
  clock. They converge once the
  clock passes it. A change observed in the seam is dated up to |offset| late.
  That is the error base makes on every container capture today, now bounded to
  the seam. Day's read time is right at once.
- A daylight-saving fall-back hour in `TIMEZONE_NAME` repeats the wall clock. The
  floor keeps an ordered stamp written in the repeat after the one before it.
- Stored stamps are not rewritten, so rows from before the upgrade keep their
  zone.
- The replay stories that take a synthetic pump read (S42, S105, S145, S146) date
  that read a minute past the Plan. Their reconcile times now follow it by a
  second instead of preceding it. What the stories assert does not change.

### Why no new replay story and no browser test

No rendered source changes behavior. The `day.js` edit removes a branch no
reachable state enters. The browser gates and the replay serve run without
`TIMEZONE_NAME`, on the process clock, where every stamp is what it was, so a
story cannot observe the zone. The backend tests pin both zones themselves: CI's
runner zone is UTC, and `tests/conftest.py` defaults `TIMEZONE_NAME` to UTC.
Under those defaults the old and new stamps agree.

### Document inventory

The repository was searched for the stamps' names, "read stamp", "served read",
"process zone", `TIMEZONE_NAME`'s described role, and the frozen clock names
(`watched_change.datetime`, `api.datetime`, `analyze.datetime`). The results:
- **Amended:** one live sentence in
  `mockups/sweep/harmonic-v2-desktop/ACCEPTANCE.md` (lines 331–334 on base) says
  the c3-history comparison freezes `watched_change.datetime`. It is amended by
  Decision 6.
- **Frozen, unchanged:** #427's archived design, the only prose that states a
  stamp's zone.
- **Still true:** README, `docker-compose.yml`, `.env.example`, AGENTS.md and
  CONTEXT.md describe `TIMEZONE_NAME` as the wall clock records are bucketed by.
- **Moved by Decision 6, not prose:** the remaining hits are the seven patches
  themselves.

### Risk contract

- **Must prevent:**
  - a durable record written out of order across a clock step: a Trial with its
    direction inverted, a Plan that sorts behind an older one, an ending before
    its own start;
  - any server stamp named in Decision 1 written on a clock other than
    `TIMEZONE_NAME`'s when that variable names a known zone;
  - a fetch attempt that raises out of the loop or goes unrecorded, with the zone
    unset, unloadable (an unknown name, a malformed name or a region name) or
    valid;
  - a window that ends before the pump's current date or the UTC date;
  - any change to an analyzer, classifier, staging predicate, cap or floor;
  - real data in a test, fixture or log;
  - a test that can resolve real credentials or contact the vendor. Every test
    that runs the real pull patches `ciq_autotune.credentials.load_credentials`.
- **Must recover:** none. The next write replaces a single-row stamp, and the
  seam converges on its own.
- **Accepted failure:**
  - rows stored before the upgrade keep their zone;
  - for up to |offset| hours after a west-of-UTC container upgrades, ordered
    stamps run ahead of the pump's clock (Consequences), which delays a verdict
    but writes nothing out of order;
  - a stamp stored ahead of the clock by any amount holds later floored stamps
    just after it until the clock passes it;
  - with an unloadable zone, every stamp reads the process clock, as on base. The
    fetch refuses, and names the zone in `/api/status`.
- **Unsupported:** a browser in a zone other than `TIMEZONE_NAME` (as #427
  records); a `TIMEZONE_NAME` changed between writes for any reason other than
  this upgrade.
- **Evidence owed:**
  - tests through public paths, with the process zone and `TIMEZONE_NAME` pinned
    apart, for each stamp family in the spec deltas, each seen failing on the
    unfixed code;
  - the three transition tests (pump read, Plan, Focus) through the capture,
    reconcile and API paths, each seen failing with the floor removed;
  - the unset-zone tests (fetch loop and API) with a broken variant;
  - the unloadable-zone case for an unknown name and a region name: the attempt
    is recorded, nothing raises, and a stamped API write still succeeds;
  - the fetch-window tests in both zone orders, and for the CLI;
  - the pinned clock-site grep output.

Why: the widened stamps feed durable change records and Plan admission on
advisory dosing guidance. Disposition: copied unchanged into this design.md, the
admitted artifact the lock pins.
