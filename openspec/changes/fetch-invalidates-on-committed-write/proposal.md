# A fetch invalidates on a committed write (#146)

## Why

A pull longer than 31 days runs in windows, and each window's rows are upserted
and committed as it lands. When a later window fails, the completed windows stay
in the store — but nothing tells the result cache. The hourly loop returns `None`
on any failure, so `on_write` never fires; the manual endpoint catches only
`RuntimeError`, and the partial-fetch error is not one, so it escapes the handler
before `cache.bump()` runs. Either way rows are durably in the store while every
cached shape keeps answering from the pre-fetch data, unmarked. On an advisory
dosing surface that is stale serving.

The same gap opens on a failure in the very *first* window, which is not reported
as a partial fetch at all: the settings snapshot is captured and committed before
any window is fetched, and the upserts inside a window commit one at a time.

## What changes

- Invalidation follows what an attempt **committed**, not whether it returned.
  The store's durable input-data revision is the signal: it advances inside each
  upsert's own transaction, and declines to advance for a zero-row upsert.
- `run_fetch_once` returns the committed counts on a failed attempt that wrote —
  an empty summary where the failure carries no counts — and `None` only when
  nothing was committed. The loop's guard becomes an explicit `is not None`, so
  an empty summary still invalidates.
- `POST /api/fetch` reads the same revision comparison in one `except` branch,
  bumps the cache when it advanced, and then maps the status exactly as it does
  today: `RuntimeError` and a partial fetch answer 503, and anything else keeps
  propagating rather than being flattened into a vendor-outage status.
- The revision comparison is read as the first statement of each failure branch,
  before the outcome is recorded. Recording an outcome advances the revision
  itself, so a reading taken after it would be true on every failed fetch.

Everything else stays as shipped: a partial fetch is still not a success,
`/api/status` still reports the last known good counts with the window summary in
`last_error`, the loop still survives every failure, the warm set is unchanged,
and the command-line `fetch` still cannot reach a running server's cache.

## Risk contract

- **Must prevent:** serving advisory numbers derived from data the store no
  longer holds, with nothing marking them stale; and reporting a partial fetch as
  a success.
- **Must recover:** nothing new automatically. Surviving a failed fetch is
  existing loop behavior and stays.
- **Accepted behavior:** a partial fetch stays a failure to the person using the
  app, with no automatic retry. Over-invalidation costs one recompute and is
  accepted — a successful fetch that changed nothing still invalidates, and a
  first-ever credential seeding inside a failed pull counts as a commit and
  invalidates once.
- **Unsupported:** an out-of-process `harmonic fetch` reaching a running server's
  cache.
