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

### Requirement: Data endpoints are gated by one optional static bearer token; the app shell is not

There is no login screen and no session. The app shell and its assets load
unauthenticated; every data endpoint depends on a token check that compares the
request's `Authorization` header against `Bearer <token>` exactly. The liveness
endpoint is also ungated. **If no token is configured the API is open** — acceptable
on a loopback bind, and a real exposure the moment the port is reachable from
elsewhere, so a deployment that publishes the port MUST set one. The token is a
single shared secret for a single user; there are no accounts, roles, or scopes.

### Requirement: The heavy read endpoints answer from one per-process result cache

Recomputing the analysis from the store costs tens of seconds, so the expensive
reads — the analysis result, scenarios, backtest, outcomes, the outcomes trend, the
per-day model view, the day navigator, the pattern sweep, the time-of-day evidence
feed, and the lever catalog — answer through a cache keyed by endpoint name plus
the parameters that change the answer. The event-comparison endpoints share one
cached preparation and project each request's coordinates from it, so the shared
source is computed once per data version while the projections stay per-request.
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

### Requirement: Every write path MUST invalidate the cache

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
fetch that fails or writes nothing MUST NOT invalidate — there is nothing to
invalidate against, and a failure must never kill the loop. A fetch that wrote calls
one routine that invalidates first and only then re-warms, so no request can ever be
served results computed before the new data landed.

The warm pass covers exactly the fixed shapes the initial Diagnose load requests,
plus the shared event-comparison preparation. Anything keyed on a date, a month, or
a user-chosen window stays lazy, so an hourly warm cannot grow without bound; the
event-comparison projections likewise stay lazy behind their warmed shared source.
Warming runs in the fetch loop's worker thread rather than the event loop, and one
shape failing to warm is logged and skipped rather than aborting the pass or the
loop.

### Requirement: Invalidation is process-local, and an out-of-process write does not reach a running server

The cache lives in the serving process's memory. This is a deliberate consequence of
the single-user, single-process design — it needs no external cache infrastructure
and is trivially consistent for the one process that owns both the API and the fetch
loop — and it has one real constraint: running a fetch from the command line while a
server is running writes to the same database but **cannot** invalidate that server's
cache. The running server keeps serving its cached results until its own next write
or its next scheduled fetch. Anything that must be reflected immediately goes through
the API rather than a second process.

### Requirement: Configuration resolves in the app factory, so every entry path gets the same defaults

The database path, the bearer token, the path to the credential-encryption key, and
whether the scheduled fetch runs each resolve from an explicit argument first and an
environment variable second (`HARMONIC_DB`, `HARMONIC_API_TOKEN`,
`HARMONIC_SECRET_KEY`, `HARMONIC_NO_FETCH`), and that resolution lives in one seam
the app factory consumes — not in the command-line front end. A caller that
constructs the app directly, without going through the command line, therefore gets
exactly the same configuration as one that does.

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
