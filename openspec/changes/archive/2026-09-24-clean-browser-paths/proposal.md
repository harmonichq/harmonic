# Clean browser paths and namespaced HTTP interfaces (#94)

## Why

Harmonic's newest canonical address exposes its hash router as
`/#/diagnose`. The hash form keeps page state coherent, but it makes an internal
routing choice visible in every copied address. The same origin also mixes SPA
entry, local frontend assets, and most programmatic HTTP interfaces at the top
level; `/plan` consequently cannot be both the clean Plan page and the existing
Plan-draft API.

## What changes

- Supported app pages use clean top-level paths with their existing shareable
  state in the ordinary query string.
- Every programmatic HTTP interface, including OpenAPI and its documentation UIs,
  lives under `/api`.
- Every reachable local JavaScript, stylesheet, and image served by Harmonic lives
  under `/assets`; test and support files outside the app's reachable graph remain
  unserved.
- The retired `#/<page>?...` grammar is unsupported outright: a fragment carries
  no route, is never migrated, and a saved hash link opens the default page.
- One Vue-free routing interface still owns browser parse, serialize, navigation,
  canonicalization, and Back/Forward restoration.
- Existing API payloads, methods, authorization, page behavior, and page-local
  state remain unchanged apart from their namespace.

No obsolete top-level API or asset aliases remain after migration. Unsupported
paths keep the server's clear 404 behavior.

## Risk contract

- **Must prevent:** API or frontend-asset routes being shadowed; a fragment being
  routed on or left in the address; Back/Forward or a stale Diagnose response
  silently showing state different from the address; secret exposure,
  irreversible loss of authoritative data, or silent incorrect success.
- **Must recover:** a supported direct page load or refresh serves the SPA; a bare
  arrival canonicalizes in place to the default page without adding a history
  step, dropping any stale fragment it carried.
- **Accepted failure:** an unsupported path receives the server's existing clear
  404 and requires manual navigation to a supported page.
- **Unsupported:** new bookmarkable UI state, new page-state value validation,
  every historical pre-#53 URL grammar, and compatibility aliases for obsolete
  top-level API or asset paths.
- **Evidence owed:** public-interface checks for every supported page path,
  route/API precedence, frontend asset reachability, canonicalization, direct load
  and refresh, Back/Forward restoration, existing page-local state, authorization,
  and stale-response rejection.

## Impact

Rendered content, analysis, advisory dosing guidance, local data, authentication
rules, and request/response schemas do not change. Integrations using the current
top-level API paths must adopt the `/api` namespace.
