# Proposal — retire the unreachable retired-tab-id migration (#352)

## Why

`frontend/tab-routing.js` maps seven retired page ids — `dashboard`, `pump`,
`review`, `patterns`, `daily`, `modelview` and `outcomes` — onto live pages, and
`frontend/index.html` restates that as a promise: a stale id in a shared link
still migrates, so the address alone decides the landing page. No address can
reach it. The server serves the shell at `/` and at exactly the six live page
paths, and `tests/test_frontend_asset_routes.py` enforces exactly that: the
server's page list must equal the browser router's page list, the non-API route
set is closed, and an unlisted path answers 404. `/patterns` therefore returns
the bare `{"detail":"Not Found"}` document before any script loads, on every
server, and the migration never runs.

The only address form that ever carried a retired id was the `#/<page>?...`
fragment grammar, and #94 retired it outright as a recorded operator decision:
saved hash links are no longer supported and get no rewrite. Path addressing
never served a retired id — the server's page list arrived whole with the live
ids and has never held another.

The migration is unreachable code, and the comment beside it promises behavior
the system does not have. It reads as a server bug, and was filed as one.

## What changes

- Page resolution keeps only the rule that still has inputs: a live page id
  resolves to itself, and anything else resolves to the default page.
- The shell's routing comments state the address grammar as it is — no retired
  id migrates, because no retired id is served.
- The retired ids join the existing not-served assertions, so the answer is
  pinned where the next reader will look for it.

## Boundaries

The server's page list does not change and no path gains a route: `/patterns`
and its siblings keep answering 404. Nothing gains a catch-all — an unknown
`/api` or `/assets` path must keep failing rather than being handed the shell.
No rendered surface, analyzer, projection, safety predicate or fixture changes.
The vestigial `resolveTab(parsed.page) !== parsed.page` branch in the shell's
`popstate` handler is already a no-op before this change and stays as it is;
removing it touches the shell's route re-entrancy path, which only the cockpit
browser gate proves.
