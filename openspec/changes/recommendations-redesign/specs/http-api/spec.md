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

### Requirement: Every pump-event read serves one site change per fill sequence

The store SHALL keep every cartridge, tubing and cannula fill row, and every
pump-event read SHALL serve one site change per fill sequence: fills within 30
minutes of the one before join one event at the first fill, lasting until the
last. The timeline, the clean-window exclusion and the pattern sweep SHALL all
read that series.

#### Scenario: Three fills seconds apart are one site change

- **WHEN** a cartridge, tubing and cannula fill are logged 4 seconds apart
- **THEN** the timeline serves one site change at the first fill, lasting until the
  last, and the store still holds all three rows

### Requirement: The status read labels a failed fetch

The status read SHALL serve `last_error_label` beside `last_error`: null when the
last attempt succeeded, else one short label for what stopped it — No connection,
Timed out, Sign-in refused, HTTP and the vendor's status code, Not set up, or
Unknown (also for a failure recorded before labels). A partial fetch SHALL be
labelled by what stopped its failed window.

#### Scenario: A network that is down is labelled

- **WHEN** a fetch fails because its connection never opened
- **THEN** the status read serves `last_error_label` "No connection" and the raw
  text as `last_error`

### Requirement: The per-day model read serves the day's findings

The per-day model read SHALL serve `findings`: every anchor whose time falls on
the requested calendar day and that the engine counted toward a Lever, in time
order, with its `t`, `kind`, `bg` and `levers`, each Lever's key and served
title. An anchor SHALL count toward its episode's Lever when it drove that
episode, toward each Lever whose classifier verdict on it matched, and toward
Correction stacking when it is the low a Correction stacking episode reached.
The findings SHALL be read from every episode with an anchor on that day,
whichever day the episode resolves on. A near-miss, clean or no-data anchor
SHALL count toward nothing. `episodes` SHALL keep their resolve-day assignment.

#### Scenario: An evening finding that resolves after midnight is its own day's

- **GIVEN** a 19:00 meal that drove a Meal over-delivery episode, and its 22:05
  low claimed as Correction on active insulin, in an episode resolving the next
  day
- **WHEN** the per-day model read is requested for the meal's day
- **THEN** it serves no episode, and serves both anchors as findings with their
  Levers
- **AND** the next day's read serves neither anchor as a finding

#### Scenario: The low a Correction stacking reached is a finding

- **WHEN** two stacked corrections drove a Correction stacking episode and
  glucose reached a low after the second
- **THEN** the second correction and that low are findings of Correction
  stacking, and the first correction is not

### Requirement: A write to follow-up state alone keeps the results that read only recorded data

A guidance preference (snooze, restore) and a Focus, Trial or Plan lifecycle step
(among them a Done on a Setting card and its Undo, #518) write only follow-up state — the preference, Focus and follow-up records, the
frontier, the Plan history — and advance the input revision. Such a write SHALL
keep the cached results whose builders read only recorded data (readings,
deliveries, boluses, carbs, prompt answers, settings captures and pump events):
outcomes, the day navigator, the model-view, the timeline, the analysis and
scenarios at a non-default window, and the static catalog. Every other cached
result and every case-file preparation SHALL be dropped, and results keyed by the
input revision SHALL miss on the new revision as before. Saving credentials SHALL
invalidate nothing: no cached result reads them (#522).

#### Scenario: A snooze keeps the Overview's results and reads the default analysis again

- **GIVEN** the 14-day outcomes, a day's model-view and the analysis at 14 and 30
  days are cached
- **WHEN** a candidate is snoozed
- **THEN** the outcomes, the model-view and the 14-day analysis answer without
  recomputing, and the 30-day analysis is computed again
- **AND WHEN** carbs are logged
- **THEN** every one of them is computed again

### Requirement: Every API request logs its duration and how its cached reads were answered

The server SHALL log one line per `/api/` request: method, path and query,
status, milliseconds, and how many of its cached reads were answered from memory,
computed, or answered from the derived-results file (#522).

#### Scenario: A repeated read logs a hit

- **WHEN** the 14-day outcomes are read twice
- **THEN** the first line logs one computed read and the second one hit from memory

### Requirement: A write that no cached result reads invalidates nothing, and each exception is proved

Saving credentials SHALL NOT invalidate the cache: only the fetch's login and the
uncached credentials read read them (#522). It is the one such write: the Plan
draft that was the first exception is gone with its routes (#518).

A future exception MUST clear the same bar: a demonstration that no cached
computation reads the written state, not an argument that the write feels minor or
that invalidating is expensive. Absent that proof, the write invalidates.

#### Scenario: Saving credentials keeps every cached result

- **GIVEN** the 14-day outcomes are cached
- **WHEN** credentials are saved and the outcomes read again
- **THEN** they answer without recomputing

### Requirement: A selected Trial's comparison serves what Changes draws

A selected Trial's reassessment comparison SHALL serve, for each arm, a glucose
`trace` binned from that arm's own population: a basal, ISF or whole-day Trial
aligned by clock time across its block (or the whole day), one episode a night,
from the readings its outcomes read; a carb ratio Trial aligned at each in-block
meal bolus from 30 minutes before it to 240 minutes after, one episode a meal,
leaving off a meal with no reading before its bolus. Each bin SHALL carry the
median and the 25th–75th percentiles of its readings; an arm with fewer than
three episodes SHALL serve each episode's readings instead of bins. Every
comparison SHALL serve Mean, GMI and CV beside the time-in-range rows, over the
same readings, as context rows that are not resampled for an interval. A basal
Trial's arms SHALL serve how active Control-IQ was over the same windows: the
time-weighted delivered and programmed rates and the share of the time delivered
above and below the programmed rate. The roster SHALL name the settings each
whole-profile switch moved.

#### Scenario: A basal Trial's trace follows its block's clock

- **WHEN** a basal Trial changed 02:00–05:00 and every night before it ran low
  from 04:00 to 05:00 while Control-IQ suspended
- **THEN** each arm's trace is aligned at 02:00 across 180 minutes, one episode a
  night, its 04:30 bin the low
- **AND** the before arm's Control-IQ delivery is below the programmed rate for
  a third of the block's time

#### Scenario: A meal with a CGM gap before its bolus is left off

- **WHEN** a carb ratio Trial's after arm holds six in-block lunches, one with no
  reading in the half hour before its bolus
- **THEN** the after trace has five episodes and counts one left off, while the
  arm's meal count stays six

#### Scenario: Two nights after a change are drawn one by one

- **WHEN** a basal Trial's after arm holds two nights
- **THEN** its trace serves no bins and serves each night's readings

### Requirement: Each Prompt serves when its reading was

The Prompts read SHALL serve, for each Prompt, `key_t`: the time its `key_bg` was
read, a missed-meal Prompt's peak and a low Prompt's nadir. A missed-meal Prompt's
readings SHALL run from two hours before its onset to two hours after it, or on to
its peak when that is later. The app SHALL find no peak and derive no time from
the readings.

#### Scenario: A rise is served at its peak

- **WHEN** glucose climbs from a flat 110 with no bolus, crossing 250 at 08:55 and
  reading 270 at 09:00
- **THEN** its missed-meal Prompt serves `anchor_t` 08:55, `key_t` 09:00 and
  `key_bg` 270, and its readings hold the 09:00 reading

#### Scenario: A long climb's readings reach its peak

- **WHEN** an unannounced rise peaks more than two hours after it crossed 250
- **THEN** its readings still run from two hours before the crossing on to the
  peak

## MODIFIED Requirements

### Requirement: Historical findings and event evidence share one restart-safe generation

The system SHALL satisfy the following:

`GET /api/diagnose/findings` and
`GET /api/diagnose/carb-ratio-history/events` are projections of one cached historical
snapshot: the analyzer-owned findings catalog and the exact event series prepared
from that catalog. Both schemas carry the same opaque `analysis_generation`, formed
from a collision-resistant per-app incarnation plus the cache's monotonic data
version. The stable read returns the token and prepared value only when no cache bump
crossed the computation; it retries a bounded number of times and fails with a
structured 409 rather than attaching a new token to crossed bytes. A restarted app
always has a different incarnation even when it opens unchanged database bytes.

The findings endpoint takes no history selection and serves no past-setting row,
selection disposition, register tally or chip tally (ADR 531): its answer is the
window, the findings window, the rows and the Pattern roster. The history-events
endpoint requires `history_id` and the findings generation, accepts an optional member
`selected_run_id`, and returns the complete analyzer-published 90-day roster and
series without recomputing membership. Missing or malformed inputs are structured
400 responses; canonical identities or runs absent from the catalog membership are
404; a stale generation is `analysis_generation_mismatch` at 409; and `aged_out`
versus `unavailable` are distinct structured 410 outcomes. Bearer authentication is
checked before any of those validation or data responses.

Neither endpoint changes the Finding case-file contract, and neither projection may
infer schedule membership, lifecycle, support, or actionability. Selecting a run
changes only the echoed selection; it does not filter `run_ids` or `series`.

#### Scenario: Historical findings and event evidence share one restart-safe generation

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: The heavy read endpoints answer from one per-process result cache

Recomputing the analysis from the store costs tens of seconds, so the expensive
reads — the analysis result, scenarios, outcomes, the outcomes trend, the per-day
model view, the day navigator, the day timeline, the pattern sweep, the
time-of-day evidence feed, and the lever catalog — answer through a cache keyed by
endpoint name plus the parameters that change the
answer. Finding case-file preparation is cached once per data version and projects
each request's coordinates from that prepared source. Caching is opt-in per
endpoint: the cheap store reads (status, pump settings, carb entries, prompts,
the Plan history, Focus) read the store directly on every request and are never
cached. A read that needs only the latest data instant SHALL find it with one
query, never by reading the history (#522).

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
fetch recorded as failed is tried again five minutes later instead, at most three
times in a row, before the loop falls back to hourly; the next success starts that
count again. A
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

The warm pass covers exactly what the app's five tabs read, in the order a visit
needs it (#522): the analysis, pooled and live; the findings and guidance
snapshot; the Finding case-file preparation; the Trial roster; the outcomes, the
glucose profile and the analysis for each window the Overview switches between;
the day navigator; and the model-view and timeline of the latest day with
readings and the day before it. Nothing the app does not read is warmed. Any
other date, month, or window stays lazy, so a warm cannot grow without bound;
selected case-file projections likewise stay lazy behind their warmed prepared
source. Every write the app makes runs the same pass after it invalidates, and
`serve` runs it once at start, so a restart is warm before its first fetch lands
or when that fetch commits nothing. Warming runs in a worker thread rather than
the event loop, a newer invalidation abandons an older pass at its next shape, and
one shape failing to warm is logged and skipped rather than aborting the pass or
the loop.

#### Scenario: A fetch that fails at startup is retried within minutes

- **GIVEN** the network is not yet up when the process starts
- **WHEN** the startup fetch fails
- **THEN** the loop fetches again five minutes later rather than an hour later, up
  to three times in a row, and then waits the hour

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

Invalidation is coarse: one `bump` drops the cached results and advances a
monotonic version. There is no per-endpoint dependency tracking, because
over-invalidation costs at most one recompute while under-invalidation serves
numbers that no longer match the data. **Every endpoint that writes to the store —
creating, editing, or deleting a carb entry, answering or clearing a prompt,
signing off a swept pattern, recording or withdrawing a Done (a Plan), snoozing
or restoring a candidate, pinning or resolving a Focus, ending a Trial —
invalidates the cache before returning.** A write to follow-up state alone (a
preference, a Done, a Focus or Trial step) keeps only the results that read
recorded data, as "A write to follow-up state alone keeps the results that read
only recorded data" states; the one write that invalidates nothing, saving
credentials, is proved in "A write that no cached result reads invalidates
nothing, and each exception is proved". A new write endpoint that omits this is a
defect, not an optimization: it leaves every cached read answering from
pre-write data. The live pull has no endpoint (ADR 417): the scheduled fetch
invalidates through the loop's own hook, specified below.

#### Scenario: A write endpoint invalidates what the reads depend on

- **GIVEN** the analysis result for a window has been computed and cached
- **WHEN** a client creates a carb entry, which the analysis reads as an exclusion signal
- **THEN** the write invalidates the cache before responding, and the next request for
  that analysis recomputes — exactly once for the new data version, with every later
  request for the same key served from the cache

#### Scenario: A Done drops the default analysis and keeps the recorded-data results

- **GIVEN** the 30-day default analysis and the 14-day outcomes are cached
- **WHEN** a client records a Done on a Setting card
- **THEN** the next default analysis read recomputes, and the outcomes answer
  without recomputing

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

**Reason:** The app keeps no Plan draft, and the draft routes are removed (#518, ADR 518): a Done records the card's served action at once, as a write to follow-up state. The credentials exception #522 added beside it is restated alone as "A write that no cached result reads invalidates nothing, and each exception is proved".

**Migration:** None; nothing read a saved draft.

### Requirement: Every stamp the server writes is on the pump's wall clock

**Reason:** A Plan draft's saved time is no longer stamped: the draft routes are removed (#518, ADR 518). It is restated without it as "Every stamp the server writes reads the pump's wall clock".

**Migration:** None.

### Requirement: A floored stamp never sorts before the latest capture, Plan or Focus pin

**Reason:** There is no pending Plan any more; a recorded Plan is a Done that waits on its own card (#518, ADR 518). It is restated with that scenario as "A floored stamp never sorts before the latest capture, Done or Focus pin".

**Migration:** None.
