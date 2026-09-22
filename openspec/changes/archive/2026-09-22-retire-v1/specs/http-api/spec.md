## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: The eating-sequence report is a fixed-window cached Diagnose read

**Reason:** The route's only caller was v1's Diagnose data helper, retired with v1
(ADR 416, ADR 417). The report itself is unchanged and still cached under the same
key: the finding case files carry it as their `projection.report`, which is where
the desk reads it.

### Requirement: Every write path MUST invalidate the cache

**Reason:** Its fetch-endpoint scenario specified `POST /api/fetch`, retired with
v1's "fetch now" control (ADR 417). The rule and its other scenarios continue as
"Every write endpoint MUST invalidate the cache"; the scheduled fetch's
invalidation is specified by "A scheduled fetch that wrote invalidates, then
re-warms the landing set".

## ADDED Requirements

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
