# Tasks — Clean browser paths and HTTP namespaces (#94)

## 1. Lock the namespace contract in public-interface tests

- [x] Add failing route-table coverage proving supported pages serve HTML, every
      programmatic operation lives under `/api`, every reachable served local asset
      lives under `/assets`, and unsupported or obsolete top-level paths are not
      swallowed.
- [x] Bind the browser-owned page identities to the server's explicit SPA-route
      mirror with exact set equality, and bind reachable local assets to served
      `/assets` file routes with exact set equality plus HTTP reachability checks.
- [x] Replace hash-router expectations with clean path/query expectations while
      preserving Back/Forward, request regeneration, and stale-response rejection
      coverage. Hash addresses are unsupported, so no migration is asserted.

## 2. Separate the server namespaces

- [x] Serve the SPA index at `/` and every supported page path without shadowing
      API or asset routes.
- [x] Prefix every programmatic operation with `/api`; serve the generated schema
      at `/api/openapi.json`, Swagger UI at `/api/docs`, and ReDoc at `/api/redoc`
      without changing methods, payloads, authorization, or error behavior.
- [x] Move the explicit reachable-asset allowlist beneath `/assets` without exposing
      additional frontend files.

## 3. Move browser routing and transport

- [x] Make the Vue-free router parse and serialize clean pathname/query state from
      the pathname and query alone, read no fragment, and restore solely through
      the clean History API path.
- [x] Move the browser transport's endpoint paths beneath `/api` and all local HTML
      asset references beneath `/assets`.
- [x] Move CI and container health probes to `/api/health`; move container and
      runtime credential guidance to `/api/credentials`.
- [x] Update Diagnose, Verify, cockpit, replay, and screenshot consumers so their
      route observations and intercepted requests exercise the shipped namespaces.

## 4. Fold the public contract and verify

- [x] Update current README, baseline OpenSpec specs, and live behavior ledgers;
      leave historical scope and change records intact under ADR 94's supersession.
- [x] Run the complete fast gate and the existing browser gates that exercise direct
      app navigation, route restoration, API interception, and asset loading.
- [x] Materialize the public tree, check its links, and run its contamination scan.
