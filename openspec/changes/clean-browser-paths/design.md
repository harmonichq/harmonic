# Design — Clean browser paths and HTTP namespaces (#94)

## ADR 94 — Separate page, API, and asset namespaces

**Ruling.** Harmonic divides its origin into three non-overlapping namespaces:

- `/<page>?<existing-page-state>` for the supported SPA pages;
- `/api/...` for every programmatic HTTP interface, including OpenAPI, Swagger
  UI, and ReDoc; and
- `/assets/...` for every reachable local JavaScript, stylesheet, and image the
  app serves.

The supported page identities remain the ones owned by the cockpit router. The
server carries one explicit mirror of that closed set solely to register SPA entry
routes, and a cross-language contract test requires exact set equality; no third or
untested page registry is allowed. `/`
continues to serve the SPA as the migration/default entry and normalizes in place
to the default page. Direct loads and refreshes of every supported page path serve
the same index document. Unsupported top-level paths return 404; no catch-all may
swallow an API or asset miss.

The browser route query carries only state that already round-trips. The router
continues to transport values without taking over each page's defaults or value
handling. A saved `#/<page>?...` link is parsed on arrival and replaced with its
clean path/query equivalent without adding a history entry. After migration,
navigation writes clean same-origin URLs and Back/Forward restoration listens to
`popstate`; hash state is no longer produced.

The FastAPI route table groups programmatic operations under one `/api` prefix.
The generated schema is `/api/openapi.json`, Swagger UI is `/api/docs`, and ReDoc
is `/api/redoc`; their supporting redirect/configuration paths remain beneath
`/api` too. Local asset serving remains fail-closed to the frontend's reachable
asset graph: the served `/assets` file-route set must equal the reachable local
asset set, not merely contain it, and representative obsolete/unknown paths must
404.

There are no compatibility aliases for obsolete top-level API or asset routes.
Aliases would preserve the mixed namespace this decision retires and would leave
future page names vulnerable to another `/plan` collision. API methods, payloads,
authorization, and error behavior otherwise remain identical.

This ADR supersedes ADR 53's `#/<page>` canonical grammar and its decision to leave
server/API paths unchanged. It supersedes route literals in older decisions only
as addresses; their behavioral and data-contract rulings remain in force.

Decision: harmonichq/harmonic#94, 2026-08-23.
