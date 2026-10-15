## ADDED Requirements

### Requirement: The day timeline serves the day's insulin split

The timeline read SHALL serve `insulin_totals` for its window, in units, with
`basal` (delivered), `meal`, `correction`, `control_iq_bolus` and `total`, where
`basal + meal + correction + control_iq_bolus` equals `total` exactly as served.
Basal SHALL count each basal row's delivered rate over the part of its duration
inside the window. `control_iq_bolus` SHALL be the delivered insulin of the
boluses the pump tagged automatic. Every other bolus SHALL be split into meal and
correction in the proportion of its recorded food and correction sizes, or, with
no recorded split, be all meal when it carries carbs and all correction when it
does not. The read SHALL also serve `basal_programmed`, the programmed rate over
the same rows, outside `total`. A row reporting no programmed rate SHALL carry
the last one reported, and `basal_programmed` SHALL be `null` when no rate is
known. A window with no basal and no delivered bolus SHALL serve `null`.

#### Scenario: A day's parts add up to its total

- **WHEN** a day holds basal rows, a meal bolus, a correction bolus, a mixed bolus
  delivered short of its request, and Control-IQ automatic boluses
- **THEN** the day serves each part from those deliveries, the mixed bolus split
  in its recorded proportion, and the four parts add up to the total exactly

#### Scenario: A suspension keeps the programmed basal

- **WHEN** Control-IQ suspends delivery and delivers below the programmed rate
- **THEN** delivered basal is below `basal_programmed`, which counts the suspended
  rows at the last programmed rate reported, and `total` holds delivered basal

#### Scenario: An empty window serves no totals

- **WHEN** the window holds no basal row and no delivered bolus
- **THEN** `insulin_totals` is `null`

### Requirement: Every stamp the server writes reads the pump's wall clock

Every time the server stamps SHALL be read from one clock: the current instant
converted to `TIMEZONE_NAME` through the same conversion every stored record
takes, whatever zone the server process runs in. This covers:

- a pump read's capture time;
- a recorded Plan's decision and withdrawal times;
- a Focus pin;
- a change record's ending, observation and confirmation times;
- a reassessment time;
- a guidance set-aside time;
- a carb-log entry's and a prompt answer's recorded time;
- an analysis time.

When `TIMEZONE_NAME` is unset or loads no time zone, that clock SHALL be the
process clock. One zone loader SHALL decide whether the variable loads a zone,
for the clock and the fetch alike. A data-time anchor, the latest record instant, is not a stamp
and is unchanged.

#### Scenario: A pump read, a Plan and a Focus pin name the pump's time

- **GIVEN** the server process runs in a zone 25 hours ahead of `TIMEZONE_NAME`
- **WHEN** a pump read is captured, a Done is recorded and a Focus is pinned
- **THEN** `/api/pump-settings` serves `fetched_at`, the Plan history serves
  `applied_at`, and the Focus serves `pinned_at`, each equal to the pump's
  wall-clock time of that write, to the minute

#### Scenario: An unset zone uses the process clock

- **GIVEN** `TIMEZONE_NAME` is unset
- **WHEN** a Focus is pinned
- **THEN** the pin succeeds and `pinned_at` is the process clock's time

### Requirement: A floored stamp never sorts before the latest capture, Done or Focus pin

A pump read's capture time, a recorded Plan's time and every follow-up write's
time (a Focus pin, a withdrawal, an ending, a reconciliation) SHALL be later than
the latest capture, Plan or Focus pin already stored. When the clock reads no
later than that stamp, the new stamp SHALL be one second after it. Stored stamps
SHALL NOT be rewritten.

#### Scenario: A profile switch read after the clock steps back is recorded forward

- **GIVEN** a pump read stored with the server's clock 7 hours ahead of its
  current reading
- **WHEN** a later read shows a profile switch that moves correction factor from
  30 to 40, and the store is reconciled
- **THEN** the later read sorts after the earlier one and is served as the pump's
  current settings
- **AND** exactly one Trial is recorded, from 30 to 40, at the later read

#### Scenario: A Done recorded after the clock steps back is the waiting one

- **GIVEN** a Done recorded and withdrawn with the server's clock 7 hours ahead
  of its current reading
- **WHEN** a new Done is recorded on the same card
- **THEN** the Plan history lists the new Plan first
- **AND** guidance serves it as that card's waiting acknowledgment

#### Scenario: A Focus ended after the clock steps back ends after its pin

- **GIVEN** a Focus pinned with the server's clock 7 hours ahead of its current
  reading
- **WHEN** the Focus is resolved
- **THEN** its saved ending is effective after its pin

## MODIFIED Requirements

### Requirement: The heavy read endpoints answer from one per-process result cache

Recomputing the analysis from the store costs tens of seconds, so the expensive
reads — the analysis result, scenarios, outcomes, the outcomes trend, the per-day
model view, the day navigator, the pattern sweep, the time-of-day evidence feed,
and the lever catalog — answer through a cache keyed by endpoint name plus the parameters that change the
answer. Finding case-file preparation is cached once per data version and projects
each request's coordinates from that prepared source. Caching is opt-in per
endpoint: the cheap store reads (status, timeline, pump settings, carb entries,
prompts, the Plan history, Focus) read the store directly on every request and
are never cached.

The cache instance belongs to the app, not to the module, so two apps built in one
process (as tests do) never share state. It is bounded by a least-recently-used cap
so the date-, month-, and window-keyed entries cannot grow without limit. A miss
computes outside the lock, under a per-key single-flight lock so two concurrent
misses for the same key compute once. A compute whose data version advanced while
it ran still returns its own freshly computed value to its caller but MUST NOT be
stored — discard-on-store means "do not poison the cache," never "drop the
response."

#### Scenario: The heavy read endpoints answer from one per-process result cache

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: A scheduled fetch that wrote invalidates, then re-warms the landing set

The process runs a background fetch on startup and on a fixed hourly interval. A
fetch that committed nothing MUST NOT invalidate — there is nothing to invalidate
against, and a failure must never kill the loop. A fetch that wrote calls one
routine that invalidates first and only then re-warms, so no request can ever be
served results computed before the new data landed.

**What decides this is what the attempt committed, not whether it succeeded.** A
multi-window pull commits each window as it lands, so an attempt that failed
part-way — including one that failed on its very first window, after the settings
snapshot was already captured — leaves rows durably in the store. Such an attempt
MUST invalidate, even though it is recorded as a failure and even where the counts
of what it wrote are not recoverable. The signal is the store's own durable
input-data revision, which advances inside each write's transaction; it MUST be
compared across a window that closes before the attempt's outcome is recorded,
because recording the outcome advances that revision itself and would otherwise
report every failed fetch as a write.

The warm pass covers exactly one fixed roster: the analysis, live and pooled; the
outcomes trend; the scenarios; the outcomes and the glucose profile for each
window the Overview switches between; the exposures; the carb-ratio block, basal
night and ISF rest-window evidence; and the Finding case-file preparation.
Anything keyed on a date, a month, or any other window stays lazy, so an hourly warm cannot grow without bound; selected
case-file projections likewise stay lazy behind their warmed prepared source.
Warming runs in the fetch loop's worker thread rather than the event loop, and one
shape failing to warm is logged and skipped rather than aborting the pass or the
loop.

#### Scenario: A fetch that committed some windows and then failed still invalidates

- **GIVEN** cached results computed before the fetch
- **WHEN** a scheduled fetch commits some of its windows and a later window fails
- **THEN** the attempt is recorded as a failure, with the last known good counts
  standing and a summary of how far it got, **AND** the cache is invalidated and the
  landing set re-warmed exactly once, so no read is answered from data the store has
  already moved past

#### Scenario: A fetch that committed nothing leaves the cache alone

- **GIVEN** cached results computed before the fetch, and stored credentials
- **WHEN** a scheduled fetch fails before committing anything — a rejected login, or a
  network failure on the first request
- **THEN** the attempt is recorded as a failure, the loop continues, and the cache is
  neither invalidated nor re-warmed
- **AND** the one attempt that seeds the credential table for the first time is not
  this case: seeding is itself a committed write, so that attempt invalidates once.
  Over-invalidation costs one recompute and is accepted; under-invalidation serves
  numbers that no longer match the data

### Requirement: Every write endpoint MUST invalidate the cache

The system SHALL satisfy the following:

Invalidation is coarse and global: a single `bump` clears the whole map and advances
a monotonic version. There is no per-endpoint dependency tracking, because
over-invalidation costs at most one recompute while under-invalidation serves
numbers that no longer match the data. **Every endpoint that writes to the store —
saving credentials, creating, editing, or deleting a carb entry, answering or
clearing a prompt, signing off a swept pattern, recording or withdrawing a Done
(a Plan), pinning or resolving a Focus — invalidates the cache before
returning.** There is no exception (#518, ADR 518). A new write endpoint
that omits this is a defect, not an optimization: it leaves every cached read
answering from pre-write data. The live pull has no endpoint (ADR 417): the
scheduled fetch invalidates through the loop's own hook, specified below.

#### Scenario: A write endpoint invalidates what the reads depend on

- **GIVEN** the analysis result for a window has been computed and cached
- **WHEN** a client creates a carb entry, which the analysis reads as an exclusion signal
- **THEN** the write invalidates the cache before responding, and the next request for
  that analysis recomputes — exactly once for the new data version, with every later
  request for the same key served from the cache

#### Scenario: A Done invalidates the cache

- **GIVEN** the analysis result is cached
- **WHEN** a client records a Done on a Setting card
- **THEN** the next analysis read recomputes

#### Scenario: A write path that skips invalidation serves stale advice

- **GIVEN** a cached analysis result computed before a write
- **WHEN** a write endpoint changes state that a cached computation reads but does not
  invalidate the cache
- **THEN** every later read of that endpoint returns the pre-write numbers until some
  unrelated write or the next scheduled fetch happens to clear the cache — the surface
  presents advice derived from data the store no longer holds, with nothing in the
  response marking it stale

## REMOVED Requirements

### Requirement: Saving a Plan draft is the one deliberate exception, and a future exception must meet its standard

**Reason:** The app keeps no Plan draft, and the draft routes are removed (#518, ADR 518): a Done records the card's served action at once and invalidates like every other write. No write is excepted.

**Migration:** None; nothing read a saved draft. A future exception would need its own requirement, proving no cached computation reads the written state.

### Requirement: Every stamp the server writes is on the pump's wall clock

**Reason:** A Plan draft's saved time is no longer stamped: the draft routes are removed (#518, ADR 518). It is restated without it as "Every stamp the server writes reads the pump's wall clock".

**Migration:** None.

### Requirement: A floored stamp never sorts before the latest capture, Plan or Focus pin

**Reason:** There is no pending Plan any more; a recorded Plan is a Done that waits on its own card (#518, ADR 518). It is restated with that scenario as "A floored stamp never sorts before the latest capture, Done or Focus pin".

**Migration:** None.
