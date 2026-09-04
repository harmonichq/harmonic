## MODIFIED Requirements

### Requirement: The heavy read endpoints answer from one per-process result cache

Recomputing the analysis from the store costs tens of seconds, so the expensive
reads — the analysis result, scenarios, backtest, outcomes, the outcomes trend, the
per-day model view, the day navigator, the pattern sweep, the time-of-day evidence
feed, the lever catalog, and the eating-sequence report — answer through a cache
keyed by endpoint name plus the parameters that change the answer. Finding case-file
preparation is cached once per data version and projects each request's coordinates
from that prepared source. Caching is opt-in per endpoint: the cheap store reads
(status, timeline, pump settings, carb entries, prompts, the Plan draft and its
history, Focus, dismissals) read the store directly on every request and are never
cached.

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

## ADDED Requirements

### Requirement: The eating-sequence report is a fixed-window cached Diagnose read

`GET /api/diagnose/eating-sequences` SHALL be a bearer-token-gated data endpoint.
Its `window` query parameter SHALL default to and accept only
`findings_projection.DIAGNOSE_SOURCE_WINDOW_DAYS`; any other value SHALL return 400
whose detail names that fixed window, matching basal-night evidence's refusal. It
SHALL return `fixed_response(...)` of the `eating-sequence-report-v1` dictionary with
backend-owned `input_data_age` attached, from cache key `("eating-sequences", window)`
with shape marker `"eating-sequences-v1"` and `serve_stale=False`. The fetch warm
roster SHALL pre-warm this product.

#### Scenario: A fixed-window request is served from the cache with input-data age

- **GIVEN** a request for the fixed Diagnose source window
- **WHEN** the endpoint answers the report
- **THEN** it returns the cache-backed report with backend-owned `input_data_age`

#### Scenario: A non-fixed window is refused

- **WHEN** a request names a window other than the fixed Diagnose source window
- **THEN** the endpoint returns 400 and its detail names the fixed window

#### Scenario: A request without the configured token is refused

- **GIVEN** the API has a bearer token configured
- **WHEN** a request omits that token
- **THEN** the endpoint refuses the request before serving report data
