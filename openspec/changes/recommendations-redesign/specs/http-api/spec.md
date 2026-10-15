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
write only follow-up state — the preference, Focus and follow-up records, the
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
the Plan draft and its history, Focus) read the store directly on every request
and are never cached. A read that needs only the latest data instant SHALL find
it with one query, never by reading the history (#522).

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

### Requirement: A write that no cached result reads invalidates nothing, and each exception is proved

Saving the Plan draft does **not** invalidate the cache. The draft is a staging
convenience for the person using the app; no cached computation reads it, so
clearing the heavy results on every keystroke-scale save would only cold-start the
expensive surfaces for no correctness gain. **Applying** the Plan does invalidate,
because applying changes the state the analysis reads. Saving credentials does not
invalidate either: only the fetch's login and the uncached credentials read read
them (#522).

A future exception MUST clear the same bar: a demonstration that no cached
computation reads the written state, not an argument that the write feels minor or
that invalidating is expensive. Absent that proof, the write invalidates.

#### Scenario: The Plan draft round-trips without disturbing the cache

- **GIVEN** the analysis result is cached
- **WHEN** a client saves a Plan draft and then re-reads the analysis
- **THEN** the draft is persisted and returned, the cached analysis is served without
  recomputing, and the cache version is unchanged
- **AND WHEN** that Plan is subsequently applied
- **THEN** the cache is invalidated and the next analysis read recomputes

#### Scenario: Saving credentials keeps every cached result

- **GIVEN** the 14-day outcomes are cached
- **WHEN** credentials are saved and the outcomes read again
- **THEN** they answer without recomputing

## RENAMED Requirements

- FROM: `### Requirement: Saving a Plan draft is the one deliberate exception, and a future exception must meet its standard`
- TO: `### Requirement: A write that no cached result reads invalidates nothing, and each exception is proved`
