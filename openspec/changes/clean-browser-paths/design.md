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

## ADR 94 — A bare arrival names no page, and the shell answers for it

**Ruling.** The browser router reports whether an address *named* a page,
separately from which page it resolves to. Every address under the clean
grammar resolves to a page — a bare `/` resolves to the default — so the parsed
route carries `pageNamed` beside `page`. A page path, the retired canonical
hash on the arrival that migrates it, and the narrow Diagnose split form all
name a page; a bare `/` does not.

This preserves a behavior the hash grammar expressed as a null page: on an
arrival that names nothing, the shell may choose a destination for the wearer.
The one such choice is the maturing-Trial promotion — a bare arrival whose
roster holds a maturing Trial lands on Verify instead of the default. An
arrival that names a page is never promoted away from. Reporting the fact as a
flag beside a resolved page, rather than as a null page, keeps the default in
one place: no caller re-derives it, and no second page registry appears.

The remembered-tab fallback that sat behind the same null page is retired. ADR
94 rules that `/` normalizes in place to the default page, so restoring a
remembered pane would leave the address naming one page while the shell showed
another — the divergence this change exists to remove. Nothing in the app had
written that value for some time; only a retired version's leftover could still
have fired it.

`serializeRoute` is unchanged: a bare `/` still canonicalizes in place to
`/diagnose`, and the promotion afterwards moves the address with the page.

Decision: harmonichq/harmonic#94, 2026-08-23.
