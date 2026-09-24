# HTTP API

## Purpose

Harmonic runs as a single local process that a person self-hosts: one command
binds a port, serves the single-page app, and answers the JSON endpoints that app
reads. This capability owns the *service* contract — how the app and its assets are
served, how requests are authenticated, and above all how the in-process result
cache is filled and invalidated. It owns none of the analysis behind those
endpoints: the analyzers, the Plan, Diagnose, Changes, and the store each specify
their own behavior, and the service is a thin renderer over their results.

## Requirements

### Requirement: The service is local, self-hosted, and serves the app and the API on one port

There is no central service and no separate frontend server. The app factory binds
a loopback address by default; the same process serves the one built browser shell
at `/` and its named page paths, that shell's built assets beneath `/assets/`, and
every JSON endpoint. The non-API route set is closed: each page path is a named
route, the built assets are the only mounted directory, and any other path answers
404, so a file on disk can never shadow an API route or the shell. Any route
that reads a filename from the request path (the knowledge-base articles) MUST
restrict the slug to a fixed lowercase-and-hyphen charset so a request cannot
escape its directory.

#### Scenario: The service is local, self-hosted, and serves the app and the API on one port

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

#### Scenario: One process answers the shell, its assets and the API

- **WHEN** the service is started
- **THEN** the same port answers the shell at `/`, a built asset beneath `/assets/`, and `/api/health`
- **AND** a path outside the named page set, the asset prefix and `/api` answers 404

### Requirement: Data endpoints are gated by one optional static bearer token; the app shell is not

There is no login screen and no session. The app shell and its assets load
unauthenticated; every data endpoint depends on a token check that compares the
request's `Authorization` header against `Bearer <token>` exactly. The liveness
endpoint is also ungated. **If no token is configured the API is open** — acceptable
on a loopback bind, and a real exposure the moment the port is reachable from
elsewhere, so a deployment that publishes the port MUST set one. The token is a
single shared secret for a single user; there are no accounts, roles, or scopes.

#### Scenario: Data endpoints are gated by one optional static bearer token; the app shell is not

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: The heavy read endpoints answer from one per-process result cache

Recomputing the analysis from the store costs tens of seconds, so the expensive
reads — the analysis result, scenarios, outcomes, the outcomes trend, the per-day
model view, the day navigator, the pattern sweep, the time-of-day evidence feed,
the lever catalog, and the eating-sequence report the finding case files carry —
answer through a cache keyed by endpoint name plus the parameters that change the
answer. Finding case-file preparation is cached once per data version and projects
each request's coordinates from that prepared source. Caching is opt-in per
endpoint: the cheap store reads (status, timeline, pump settings, carb entries,
prompts, the Plan draft and its history, Focus) read the store directly on every
request and are never cached.

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

The findings endpoint accepts an optional canonical `selected_id` and returns its
selection disposition in the same snapshot as the rows. The history-events endpoint
requires `history_id` and the findings generation, accepts an optional member
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

### Requirement: Finding case files are bound to one snapshot preparation.

The system SHALL satisfy the following:

`GET /api/diagnose/finding-case-file-preparation` builds the active Findings queue and
its case-file population inside one SQLite read snapshot. It returns an opaque,
versioned preparation identity beside server-rendered rows. `GET
/api/diagnose/finding-case-file` requires that preparation identity, the published
lever-and-window Finding coordinate, an alignment, and an optional Occurrence
coordinate; it projects only from the retained preparation rather than recomputing
against a newer population.

The preparation registry is bounded, expiring, lock-coupled, and single-flight.
A data-version bump prevents an in-flight older preparation from becoming newly
addressable. An expired or unknown well-formed id returns `409 stale_projection`;
malformed coordinates return `400 invalid_request`; an unavailable Finding or
Occurrence returns the contract's explicit unavailable state. These routes do not
widen or replace `/api/diagnose/findings`, `/api/explore/exposures`, or the event-
comparison endpoint.

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

#### Scenario: Missed meal publishes the Highs outside its comparison

- **GIVEN** a synthetic store whose Missed / unannounced meal case file has six
  Highs, two attributed and one near miss
- **WHEN** its event case file is requested
- **THEN** the response serves missed 2, nearly matched 1, the announced count, and
  3 Highs outside the comparison
- **AND** it serves no not-comparable count

### Requirement: Saving a Plan draft is the one deliberate exception, and a future exception must meet its standard

Saving the Plan draft does **not** invalidate the cache. The draft is a staging
convenience for the person using the app; no cached computation reads it, so
clearing the heavy results on every keystroke-scale save would only cold-start the
expensive surfaces for no correctness gain. **Applying** the Plan does invalidate,
because applying changes the state the analysis reads.

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

The warm pass covers exactly the fixed shapes the initial Diagnose load requests,
plus the Finding case-file preparation. Anything keyed on a date, a month, or a
user-chosen window stays lazy, so an hourly warm cannot grow without bound; selected
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

### Requirement: Invalidation is process-local, and an out-of-process write does not reach a running server

The system SHALL satisfy the following:

The cache lives in the serving process's memory. This is a deliberate consequence of
the single-user, single-process design — it needs no external cache infrastructure
and is trivially consistent for the one process that owns both the API and the fetch
loop — and it has one real constraint: running a fetch from the command line while a
server is running writes to the same database but **cannot** invalidate that server's
cache. The running server keeps serving its cached results until its own next write
or its next scheduled fetch. Anything that must be reflected immediately goes through
the API rather than a second process.

#### Scenario: Invalidation is process-local, and an out-of-process write does not reach a running server

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Configuration resolves in the app factory, so every entry path gets the same defaults

The database path, the bearer token, the path to the credential-encryption key, and
whether the scheduled fetch runs each resolve from an explicit argument first and an
environment variable second (`HARMONIC_DB`, `HARMONIC_API_TOKEN`,
`HARMONIC_SECRET_KEY`, `HARMONIC_NO_FETCH`), and that resolution lives in one seam
that both the app factory and the command-line front end consume. The front end
resolves the database path once, after parsing — a typed `--db` is the explicit
argument, the environment is the fallback — so every subcommand crosses the same
resolution rather than re-declaring the default. A caller that constructs the app
directly, without going through the command line, therefore gets exactly the same
configuration as one that does.

Each of those variables has a superseded spelling that is still honoured so an
existing deployment keeps starting, and reading one logs a deprecation naming its
replacement. The canonical name wins whenever both are present, decided by whether
the canonical name is set at all — so deliberately setting it empty still beats a
stale value left under the old spelling. The pump's timezone (`TIMEZONE_NAME`) is not part of
this resolution: it is read where records are timestamped and is required — a fetch
refuses to run without it.

Loading a `.env` file into the process environment is a separate step performed by
the command-line front end before anything else runs, and it never overwrites a
variable the environment already set. A caller that constructs the app directly does
not get that step and MUST supply configuration through the environment or explicit
arguments.

#### Scenario: Configuration resolves in the app factory, so every entry path gets the same defaults

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

### Requirement: Every write endpoint MUST invalidate the cache

The system SHALL satisfy the following:

Invalidation is coarse and global: a single `bump` clears the whole map and advances
a monotonic version. There is no per-endpoint dependency tracking, because
over-invalidation costs at most one recompute while under-invalidation serves
numbers that no longer match the data. **Every endpoint that writes to the store —
saving credentials, creating, editing, or deleting a carb entry, answering or
clearing a prompt, signing off a swept pattern, applying a Plan, pinning or
resolving a Focus — invalidates the cache before returning.** A new write endpoint
that omits this is a defect, not an optimization: it leaves every cached read
answering from pre-write data. The live pull has no endpoint (ADR 417): the
scheduled fetch invalidates through the loop's own hook, specified below.

#### Scenario: A write endpoint invalidates what the reads depend on

- **GIVEN** the analysis result for a window has been computed and cached
- **WHEN** a client creates a carb entry, which the analysis reads as an exclusion signal
- **THEN** the write invalidates the cache before responding, and the next request for
  that analysis recomputes — exactly once for the new data version, with every later
  request for the same key served from the cache

#### Scenario: A write path that skips invalidation serves stale advice

- **GIVEN** a cached analysis result computed before a write
- **WHEN** a write endpoint changes state that a cached computation reads but does not
  invalidate the cache
- **THEN** every later read of that endpoint returns the pre-write numbers until some
  unrelated write or the next scheduled fetch happens to clear the cache — the surface
  presents advice derived from data the store no longer holds, with nothing in the
  response marking it stale

### Requirement: The status read serves how many days carry data

The status endpoint SHALL serve `data_day_count`: the number of distinct
pump-local wall-clock days — each reading bucketed by the date of its naive local
time, as the first and last data day are — on which at least one CGM reading
carries a glucose value. A day whose readings all lack a glucose value (a sensor
HIGH or LOW) SHALL NOT be counted, and a day with no reading SHALL NOT be counted.
An empty store SHALL serve `0`. The count SHALL be read in the same store read as
`earliest_data_day` and `latest_data_day`, and the status endpoint SHALL remain
an uncached cheap read.

#### Scenario: A gap day and a glucose-less day are not counted

- **GIVEN** a store with glucose readings on three days, no reading on a day
  between them, and only a HIGH/LOW reading on another day
- **WHEN** the status endpoint is read
- **THEN** `data_day_count` is 3
- **AND** `earliest_data_day` and `latest_data_day` are unchanged by the count

#### Scenario: An empty store counts no days

- **GIVEN** a store with no CGM reading
- **WHEN** the status endpoint is read
- **THEN** `data_day_count` is 0

### Requirement: The status read's fetch times are on the pump's wall clock

The scheduled fetch SHALL stamp `last_attempt_at` on every attempt, and
`last_success_at` on a successful one, with the server's clock of record: the
current instant on `TIMEZONE_NAME`'s wall clock, whatever zone the server process
runs in. When `TIMEZONE_NAME` is unset, an attempt SHALL still be recorded
without raising. The pull refuses there, so `last_success_at` SHALL NOT advance.
A stamp stored earlier SHALL NOT be rewritten; the next attempt or success
replaces it.

#### Scenario: A server running in another zone stamps the pump's time

- **GIVEN** the server process runs in a zone 25 hours ahead of `TIMEZONE_NAME`
- **WHEN** a scheduled fetch attempt succeeds
- **THEN** `/api/status` serves `last_success_at` and `last_attempt_at` equal to
  the pump's wall-clock time of the attempt, to the minute

#### Scenario: A failed attempt stamps the pump's time and keeps the last success

- **GIVEN** the server process runs in a zone other than `TIMEZONE_NAME`
- **WHEN** a scheduled fetch attempt fails
- **THEN** `last_attempt_at` is the pump's wall-clock time of the attempt
- **AND** `last_success_at` keeps its earlier value

#### Scenario: An unset zone is recorded, not raised

- **GIVEN** `TIMEZONE_NAME` is unset
- **WHEN** a scheduled fetch attempt runs
- **THEN** the attempt is recorded with an error naming `TIMEZONE_NAME`
- **AND** the fetch loop keeps running
- **AND** `last_success_at` does not advance

#### Scenario: An unloadable zone is recorded on the process clock, not raised

- **GIVEN** `TIMEZONE_NAME` loads no time zone: an unknown name, or a region name
  such as `America`
- **WHEN** a scheduled fetch attempt runs
- **THEN** the attempt is recorded with an error naming `TIMEZONE_NAME`, and
  `last_attempt_at` is the process clock's time
- **AND** the fetch loop keeps running
- **AND** `last_success_at` does not advance
- **AND** a stamped write, such as a carb-log entry, still succeeds on the
  process clock

### Requirement: Every stamp the server writes is on the pump's wall clock

Every time the server stamps SHALL be read from one clock: the current instant
converted to `TIMEZONE_NAME` through the same conversion every stored record
takes, whatever zone the server process runs in. This covers:

- a pump read's capture time;
- a recorded Plan's decision and withdrawal times;
- a Focus pin;
- a change record's ending, observation and confirmation times;
- a reassessment time;
- a guidance set-aside time;
- a Plan draft's saved time, which keeps its sub-second precision;
- a carb-log entry's and a prompt answer's recorded time;
- an analysis time.

When `TIMEZONE_NAME` is unset or loads no time zone, that clock SHALL be the
process clock. One zone loader SHALL decide whether the variable loads a zone,
for the clock and the fetch alike. A data-time anchor, the latest record instant, is not a stamp
and is unchanged.

#### Scenario: A pump read, a Plan and a Focus pin name the pump's time

- **GIVEN** the server process runs in a zone 25 hours ahead of `TIMEZONE_NAME`
- **WHEN** a pump read is captured, a Plan is recorded and a Focus is pinned
- **THEN** `/api/pump-settings` serves `fetched_at`, the Plan history serves
  `applied_at`, and the Focus serves `pinned_at`, each equal to the pump's
  wall-clock time of that write, to the minute

#### Scenario: A saved draft keeps its sub-second time on the pump's clock

- **GIVEN** the server process runs in a zone other than `TIMEZONE_NAME`
- **WHEN** a Plan draft is saved
- **THEN** its `updated_at` is the pump's wall-clock time, to the microsecond

#### Scenario: An unset zone uses the process clock

- **GIVEN** `TIMEZONE_NAME` is unset
- **WHEN** a Focus is pinned
- **THEN** the pin succeeds and `pinned_at` is the process clock's time

### Requirement: A floored stamp never sorts before the latest capture, Plan or Focus pin

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

#### Scenario: A Plan recorded after the clock steps back is the pending Plan

- **GIVEN** a Plan recorded and withdrawn with the server's clock 7 hours ahead
  of its current reading
- **WHEN** a new Plan is recorded
- **THEN** the Plan history lists the new Plan first
- **AND** guidance serves it as the pending Plan

#### Scenario: A Focus ended after the clock steps back ends after its pin

- **GIVEN** a Focus pinned with the server's clock 7 hours ahead of its current
  reading
- **WHEN** the Focus is resolved
- **THEN** its saved ending is effective after its pin

### Requirement: The outcomes-trend route serves only the watched change

`GET /api/outcomes/trend` SHALL answer `{"watched_change": …}` with the one active
Trial or Focus view, or `null` when nothing is watched. It SHALL add no other
field, except the backend-owned `input_data_age`, which a fixed read carries only
while it serves the prior revision's answer during a rebuild: no schema version,
window tiling, profile, behavior, metric, arc, pre-meal or overnight-low series. Its `watched_change` SHALL equal what `summarize_trend`
resolves for the same store, anchored at the latest basal, CGM or bolus instant.
The route SHALL take no window parameter, so a supplied one changes nothing. It
SHALL be cached and warmed under one window-free key. It SHALL persist its result
under a shape marker distinct from the full-trend payload it served before. The
rolling-window series stay available through the CLI's `outcomes-trend` command.

#### Scenario: A watched Trial is served alone

- **GIVEN** the synthetic `c3-trial` case store
- **WHEN** `/api/outcomes/trend` is read
- **THEN** the body's only fields are `watched_change` and, when served,
  `input_data_age`
- **AND** `watched_change` equals `summarize_trend(store, window_days=30)`'s
  `watched_change` for the same store

#### Scenario: A watched Focus, and no watched change, are served alone

- **GIVEN** the synthetic `c3-focus` case store, and then a synthetic store with
  nothing watched
- **WHEN** `/api/outcomes/trend` is read
- **THEN** `watched_change` is the Focus's view in the first case and `null` in
  the second, and neither body carries any other series

#### Scenario: A prior answer served during a rebuild keeps its input-data age

- **GIVEN** the synthetic `c3-trial` case store, read once through
  `/api/outcomes/trend`, and then given a new synthetic CGM reading
- **WHEN** the route is read again while its rebuild is still in flight
- **THEN** the body carries the prior answer's `watched_change` and its
  `input_data_age`, and no other field

#### Scenario: A settings read after the last data point does not move the anchor

- **GIVEN** the synthetic `c3-trial` case store with an unchanged settings
  snapshot captured `2024-06-15 00:00:00`, past the Trial's 28-day watch horizon,
  reconciled at its latest basal, CGM or bolus instant
- **WHEN** `/api/outcomes/trend` is read and `summarize_trend` runs over the same
  store
- **THEN** both give the live basal 03:00 Trial changed `2024-05-15 00:00:00`,
  with `days_elapsed` 15 of 14 required, not `null`

#### Scenario: The command line keeps the rolling-window series

- **WHEN** `harmonic outcomes-trend --json` runs over a synthetic store
- **THEN** its output still carries `schema_version`, `windows`, `behaviors`,
  `metrics`, `arc`, `pre_meal`, `overnight_lows` and `watched_change`

### Requirement: A refused change write serves a sentence beside its code

When a durable Plan, Trial, Focus or later-conclusion write is refused with 409,
the response detail SHALL carry `message` beside `code`, as every other coded
refusal the API serves already does. Every refusal code the lifecycle writes can
raise SHALL have a non-empty message with no underscore token; an unknown code's
message SHALL be the code itself. The detail's `code`, `input_revision` and
`admission` SHALL be unchanged, and a non-durable refusal SHALL keep its plain
string detail.

#### Scenario: A stale Focus resolve names its refusal

- **GIVEN** an active synthetic Focus and a durable resolve request carrying an
  input revision older than the store's
- **WHEN** the resolve is posted
- **THEN** the response is 409 with `detail.code` `stale_input_revision`
- **AND** `detail.message` is that code's sentence, with no underscore
- **AND** `detail.admission` and `detail.input_revision` are still served

#### Scenario: Every lifecycle refusal code has a sentence

- **GIVEN** every refusal code enumerated from the modules that raise lifecycle
  refusals, together with the handler's default
- **WHEN** its message is looked up
- **THEN** it is non-empty and contains no underscore
- **AND** every raise in those modules passes its code as a literal, so none
  escapes the enumeration
