# Retire the v1 app: the desk is the only shell, served at root (#416)

## Why

One `harmonic serve` process serves two shells: the v1 app at `/` and its page
paths, and the desk at `/v2/`. Connor accepted the desk on 2026-09-21 and ordered
v1 killed completely, with every `/v2` path moved to root. v1 development had
already stopped (#413), so every day v1 stays served costs its gates, its second
build, and a second path through shared rail and lane code that exists only
because v1 is still there.

The desk is not independent of v1's source. It shares v1's authenticated client
and router, embeds the Diagnose workstation, imports v1's chart and utility
modules, and its build lifts its material, chart key and glossary out of v1's
page. Retirement therefore keeps what the desk uses, rehomes what it lifts, and
deletes the rest.

## What changes

- The desk is served at `/`, with its pages at `/diagnose`, `/changes` and `/day`
  and its built assets under `/assets`. Every other non-API path answers 404,
  including every `/v2/...` path and the old v1 pages `/verify`, `/plan`,
  `/settings` and `/guide`. There are no redirects.
- The v1 shell, every module, stylesheet, test, fixture, browser suite, replay
  and behavior ledger that only v1 used, the v1 Vite build, and the Vue
  dependencies are deleted. Nothing v1-only is ported to the desk.
- The material, chart key and glossary the desk's build lifted from v1's page
  become ordinary desk source, and the build-time lift is deleted.
- The chart harness and the design explorations that read v1's page are deleted
  with their drift checks, except the one exploration whose fixtures the desk
  ledger reads; its generator re-points at the rehomed desk source.
- The two source roots become one `frontend/` root. The v2 name leaves the living
  system: source paths, build configuration, routes, CI, scripts, living
  documents and baseline specifications. Historical records keep their names.
- The desk's frozen behavior ledger is amended where a story asserted the `/v2/`
  address or v1 coexistence, under Connor's 2026-09-21 sanction.
- The `harmonic-v2` plan's serving requirement and its tasks 3.5, 4.2 and 4.3 are
  reconciled to this decision.

## What does not change

The store, the analyzers, the safety caps, the HTTP API's JSON endpoints, the
result cache, authentication, and every advisory output. The desk's rendered
surface does not change; only its address does.

## Impact

- Capabilities: `surfaces`, `http-api`.
- Decision: ADR 416 in `design.md` supersedes `harmonic-v2` design step 5.
- Gates: eight v1-only browser legs leave CI; the desk suite, the follow-up suite,
  the desk ledger, the shared browser-runner regression and the fail-closed
  regression remain.
