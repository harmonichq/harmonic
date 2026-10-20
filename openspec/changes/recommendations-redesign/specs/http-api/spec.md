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
frontier, the Plan history — and advance the input revision but not the
recorded-data revision. Such a write SHALL keep every cached result whose builder
reads only recorded data (readings, deliveries, boluses, carbs, prompt answers,
settings captures and pump events): the analysis and the scenario report at
every window, the exposure feed, the time-of-day profile, the meal-size read, the
findings snapshot, outcomes, the day navigator, the model-view, the timeline, and the
static catalog (#522, #538, #501). The guidance read SHALL still compose the kept findings snapshot with the
follow-up state it reads at the new input revision, so its ranking reflects the
write. Every result that reads follow-up state — the Trial roster, the watched
change, the pattern sweep — and every case-file preparation SHALL be dropped or
miss on the new input revision. Saving credentials SHALL invalidate nothing: no
cached result reads them (#522).

#### Scenario: A snooze keeps every recorded-data result

- **GIVEN** the 14-day outcomes, a day's model-view, the analysis at 14 and 30
  days and the meal-size read are cached
- **WHEN** a candidate is snoozed
- **THEN** every one of them answers without recomputing
- **AND WHEN** carbs are logged
- **THEN** every one of them is computed again

#### Scenario: A snooze reranks the Queue without recomputing the findings

- **GIVEN** the guidance has been read and its findings snapshot derived
- **WHEN** its selected candidate is snoozed and the guidance read again — in the
  same process, and by a freshly started server over the same store
- **THEN** neither read computes the analysis, the scenario report, the exposure
  feed or the findings projection
- **AND** both serve the snoozed candidate set aside, no longer select it, and carry
  the advanced input revision and a new analysis generation

#### Scenario: A Focus pin refreshes what reads it

- **GIVEN** the watched change and the Trial roster have been read with nothing
  watched
- **WHEN** a Focus is pinned
- **THEN** the next watched-change read serves the Focus, and the Trial roster is
  computed again and lists it, while the 30-day analysis answers without
  recomputing

### Requirement: Derived results are keyed by the revision of what they read

The store SHALL keep two revisions, each advanced inside the transaction of the
write it counts. The input revision SHALL advance on every committed write,
recorded data and follow-up state alike, and SHALL remain the follow-up writes'
concurrency token: a durable request, a guidance preference and the follow-up
frontier name it, and a write naming an older one refuses. The recorded-data
revision SHALL advance on every write to recorded data — readings, deliveries,
boluses, insulin on board, pump events, settings captures, carbs and prompt
answers, and a schema migration — and on no other write. A follow-up transaction
that joins a recorded-data write SHALL advance each revision once at its commit,
and an aborted one neither (#538).

Every derived result SHALL be keyed by the recorded-data revision, in memory and
in the derived-results file, unless its builder reads follow-up state; such a
result SHALL be keyed by the input revision. The watched change is the one fixed
result keyed by the input revision, so it keeps its persisted answer and its
labelled predecessor during a rebuild. No builder keyed by the recorded-data
revision SHALL read follow-up state: the preferences, the Focus and follow-up
records, the frontier, the request receipts, the Plan draft and history, or the
pattern sign-offs.

#### Scenario: A recorded-data write advances both revisions, a follow-up write only one

- **WHEN** a CGM reading is stored, or a carb entry or prompt answer is recorded,
  edited or cleared
- **THEN** both revisions advance by one
- **AND WHEN** a preference is saved or restored, a Focus pinned or resolved, a
  pattern signed off, credentials saved or a fetch attempt recorded
- **THEN** the input revision advances by one and the recorded-data revision is
  unchanged

#### Scenario: No recorded-data result reads follow-up state

- **GIVEN** the synthetic showcase store and a server with a cold cache
- **WHEN** each recorded-data result is read
- **THEN** none of them calls a store read of follow-up state
- **AND** the Trial roster, the watched change and the pattern sweep each do

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

### Requirement: The meal-size read serves the climb after meals of each size

`GET /api/explore/meal-size?days=N` SHALL serve, over the last 14, 30 or 90
pump-local calendar days ending after the newest CGM day (`days`, refused otherwise), the engine's meals (`group_meals`, at least 10 g)
that began at or under 180 mg/dL, read from the last reading at or up to 15 minutes
before the first bolus, that the Late bolus classifier found flat before the bolus
(its `no_trigger` verdict), and that have an Arc peak. For each it SHALL read the
climb (the Arc peak less the start), the minutes to that peak, and the change at
three hours, only when no later meal began by then. It SHALL group them into four
sizes, under 25 g, 25–39, 40–59, and 60 and over, each served with how many meals it
counts, the median and 10th, 25th, 75th and 90th percentiles of their climbs, the
median minutes to peak, and the median change at three hours with how many meals it
was read from. It SHALL NOT serve the meals one by one (ADR 570). It SHALL serve
the window's days and the three hours (`horizon_hours`). Each window SHALL be its own
fixed result keyed by the recorded-data revision (ADR 501, ADR 565).

#### Scenario: The read serves the window asked for

- **GIVEN** meals in April and one on 1 June, in a history ending 8 June
- **WHEN** the meal-size read is requested for 14 days
- **THEN** it serves only the June meal, over 26 May to 9 June, and a request
  for 7 days is refused

#### Scenario: Each size serves its count and percentiles

- **GIVEN** a flat 120 mg/dL history with meals of 15, 20, 25, 39, 40, 45, 50
  (30 g and a top-up), 60 and 90 g
- **WHEN** the meal-size read is requested
- **THEN** each size serves how many meals it counts, the 30 g meal and its top-up
  as one 50 g meal, and the median and 10th, 25th, 75th and 90th percentiles of
  its meals' climbs, their median minutes to peak and change at three hours

#### Scenario: A meal bolused into a rise is left out

- **GIVEN** a meal bolused while glucose rose from 120 to 156 over the half hour
  before it, which then peaks at 175
- **WHEN** the meal-size read is requested
- **THEN** that meal is not served, though the Late bolus classifier did not call it
  late

#### Scenario: A meal that starts high, or has no start, is left out

- **WHEN** a meal is bolused at 200 mg/dL, or with no reading in the quarter hour
  before it
- **THEN** the meal-size read does not serve it

#### Scenario: A later meal cuts the climb and withholds the change at three hours

- **GIVEN** a 90 g meal and another meal two hours later
- **WHEN** the meal-size read is requested
- **THEN** the first meal's climb is read from its highest reading up to the second
  meal, and it serves no change at three hours

### Requirement: The findings answer carries one restart-safe generation

The system SHALL satisfy the following:

`GET /api/diagnose/findings` is a projection of one cached findings snapshot. Its
schema carries an opaque `analysis_generation`, formed from a collision-resistant
per-app incarnation plus the cache's monotonic data version. The stable read
returns the token and prepared value only when no cache bump crossed the
computation; it retries a bounded number of times and fails with a structured 409
rather than attaching a new token to crossed bytes. A restarted app always has a
different incarnation even when it opens unchanged database bytes.

The findings endpoint answers for the whole day only: it takes no clock window and
no history selection, and serves no past-setting row, selection disposition,
register tally or chip tally (ADR 531, ADR 547). Its answer is the window, the
findings window, the rows and the Pattern roster. No route serves a past
setting's event evidence (ADR 547). Bearer authentication is checked before any
data response. The endpoint does not change the Finding case-file contract, and
its projection may not infer schedule membership, lifecycle, support, or
actionability.

#### Scenario: A crossed computation is labelled with the version it read

- **GIVEN** a write that bumps the cache while the findings snapshot is computing
- **WHEN** the findings are served
- **THEN** the answer's `analysis_generation` names the data version its rows were
  computed at, never the one before

#### Scenario: The findings answer is the whole day

- **WHEN** the findings are requested
- **THEN** the answer's window is unscoped and its rows are the whole day's

## MODIFIED Requirements

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
the Overview's meal-size read for each window; the day navigator; and the model-view and timeline of the latest day with
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

### Requirement: Finding case files are bound to one snapshot preparation.

The system SHALL satisfy the following:

`GET /api/diagnose/finding-case-file-preparation` takes no parameters. It builds
the whole-day Findings queue and its case-file population inside one SQLite read
snapshot, and returns an opaque, versioned preparation identity with its
coordinates, the case header of each inspectable Finding and the Findings it
withholds; it serves no copy of the findings rows (ADR 547), which the Queue reads
from `/api/diagnose/findings`. `GET /api/diagnose/finding-case-file` requires that
preparation identity, the published lever-and-window Finding coordinate, an
alignment, and an optional Occurrence coordinate; it projects only from the
retained preparation rather than recomputing against a newer population.

The preparation registry is bounded, expiring, lock-coupled, and single-flight.
A data-version bump prevents an in-flight older preparation from becoming newly
addressable. An expired or unknown well-formed id returns `409 stale_projection`;
malformed coordinates, and any parameter on the preparation, return `400
invalid_request`; an unavailable Finding or Occurrence returns the contract's
explicit unavailable state. These routes do not widen or replace
`/api/diagnose/findings`, `/api/explore/exposures`, or the event-comparison
endpoint.

For the Missed / unannounced meal Finding's event projection, the server owns two
separate comparison cohorts: Highs attributed to Missed / unannounced meal and
all completed carb-bolus announced meals, regardless of outcome. It anchors the
first at detected rise onset and the second at completed carb-bolus time, using
the fixed `[-60, +300]` minute window, and publishes the missed and announced
counts and the count of Highs outside the comparison, including an explicit zero
state. This comparison account is independent of the Finding's five-way High
verdict denominator and does not replace the High roster or attribution account.

#### Scenario: Finding case files are bound to one snapshot preparation.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

#### Scenario: The preparation serves no copy of the rows

- **WHEN** the preparation is requested
- **THEN** it serves its schema, identity, coordinates, case headers and withheld
  Findings, and no findings rows
- **AND** a request carrying a clock window is refused with `400 invalid_request`

#### Scenario: Missed meal publishes the Highs outside its comparison

- **GIVEN** a synthetic store whose Missed / unannounced meal case file has six
  Highs, two attributed and one near miss
- **WHEN** its event case file is requested
- **THEN** the response serves missed 2, nearly matched 1, the announced count, and
  3 Highs outside the comparison
- **AND** it serves no not-comparable count

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

### Requirement: Historical findings and event evidence share one restart-safe generation

**Reason:** The past-setting event-evidence route it paired with the findings answer is removed (ADR 547): the five-tab app never reads it, and the findings snapshot no longer prepares its event series.

**Migration:** Read "The findings answer carries one restart-safe generation", ADDED in this change, which keeps the findings answer's generation contract.

