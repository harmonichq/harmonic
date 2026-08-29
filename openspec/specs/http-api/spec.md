# HTTP API

## Purpose

Harmonic runs as a single local process that a person self-hosts: one command
binds a port, serves the single-page app, and answers the JSON endpoints that app
reads. This capability owns the *service* contract — how the app and its assets are
served, how requests are authenticated, and above all how the in-process result
cache is filled and invalidated. It owns none of the analysis behind those
endpoints: the analyzers, the Plan, Diagnose, Verify, and the store each specify
their own behavior, and the service is a thin renderer over their results.

## Requirements

### Requirement: The service is local, self-hosted, and serves the app and the API on one port

There is no central service and no separate frontend server. The app factory binds
a loopback address by default; the same process serves the single-page app at `/`,
its sibling ES-module and stylesheet assets, and every JSON endpoint. The frontend
assets are served as explicit per-file routes rather than a mounted static
directory, so a file on disk can never shadow an API route or the index. Any route
that reads a filename from the request path (the knowledge-base articles) MUST
restrict the slug to a fixed lowercase-and-hyphen charset so a request cannot
escape its directory.

#### Scenario: The service is local, self-hosted, and serves the app and the API on one port

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies
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
reads — the analysis result, scenarios, backtest, outcomes, the outcomes trend, the
per-day model view, the day navigator, the pattern sweep, the time-of-day evidence
feed, and the lever catalog — answer through a cache keyed by endpoint name plus
the parameters that change the answer. Finding case-file preparation is cached once
per data version and projects each request's coordinates from that prepared source.
Caching is opt-in per endpoint: the cheap store reads (status, timeline, pump
settings, carb entries, prompts, the Plan draft and its history, Focus, dismissals)
read the store directly on every request and are never cached.

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
the fixed `[-60, +300]` minute window, and publishes missed, announced, and
not-comparable counts, including an explicit zero state. This comparison account
is independent of the Finding's five-way High verdict denominator and does not
replace the High roster or attribution account.

#### Scenario: Finding case files are bound to one snapshot preparation.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies
### Requirement: Every write path MUST invalidate the cache

The system SHALL satisfy the following:

Invalidation is coarse and global: a single `bump` clears the whole map and advances
a monotonic version. There is no per-endpoint dependency tracking, because
over-invalidation costs at most one recompute while under-invalidation serves
numbers that no longer match the data. **Every endpoint that writes to the store —
recording a fetch, saving credentials, creating, editing, or deleting a carb entry,
answering or clearing a prompt, dismissing an audit item, signing off a swept
pattern, applying a Plan, pinning or resolving a Focus — invalidates the cache
before returning.** A new write endpoint that omits this is a defect, not an
optimization: it leaves every cached read answering from pre-write data.

#### Scenario: A write endpoint invalidates what the reads depend on

- **GIVEN** the analysis result for a window has been computed and cached
- **WHEN** a client creates a carb entry, which the analysis reads as an exclusion signal
- **THEN** the write invalidates the cache before responding, and the next request for
  that analysis recomputes — exactly once for the new data version, with every later
  request for the same key served from the cache

#### Scenario: A fetch endpoint that committed rows and then failed invalidates before returning its error

- **GIVEN** the analysis result for a window has been computed and cached
- **WHEN** a client triggers a fetch that commits rows and then fails part-way
- **THEN** the endpoint invalidates the cache before returning, and the client is
  still told the fetch failed — a partial fetch answers the same `503` a rejected
  pull does, carrying how far it got, rather than escaping the handler as an
  unexplained server error
- **AND** widening the handler far enough to invalidate MUST NOT widen that
  status. Every other failure keeps whatever it produced before, so a defect in
  reading the vendor's events still surfaces as the defect it is

#### Scenario: A write path that skips invalidation serves stale advice

- **GIVEN** a cached analysis result computed before a write
- **WHEN** a write endpoint changes state that a cached computation reads but does not
  invalidate the cache
- **THEN** every later read of that endpoint returns the pre-write numbers until some
  unrelated write or the next scheduled fetch happens to clear the cache — the surface
  presents advice derived from data the store no longer holds, with nothing in the
  response marking it stale

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
