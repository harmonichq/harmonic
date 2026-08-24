# Scope — Clean browser paths

Ticket: [harmonichq/harmonic#94](https://github.com/harmonichq/harmonic/issues/94)

## Decisions

- Replace the canonical `#/<page>` grammar with clean browser paths while preserving one Vue-free routing owner and the state-restoration guarantees landed in #53. The visible address is product behavior, and `/#/diagnose` is the observed regression. → ADR
- Preserve direct loads, refreshes, Back/Forward restoration, narrow migration of saved hash links, and stale Diagnose response rejection. These are the existing routing guarantees that the clean-path change must not trade away. inline
- Treat this as routing behavior with `Surface lifecycle: none`: browser addressing changes, but the rendered app surface does not. inline
- Use one conventional, non-versioned origin layout: `/<page>` for browser navigation, `/api/...` for every programmatic HTTP interface (including OpenAPI and its documentation UIs), and `/assets/...` for every reachable local JavaScript, stylesheet, and image the app serves. This resolves the `/plan` collision without content negotiation. Do not retain obsolete top-level API or asset aliases; #94 is the migration point, and `/api/v1` would claim a public versioning contract the project does not have. → ADR
- Keep `frontend/tab-routing.js` as the page-identity authority and authorize one server-side mirror solely to register explicit SPA routes; an exact cross-language test binds the two sets. This avoids a catch-all while making drift fail closed. inline

### Risk contract

- **Must prevent:** API or frontend-asset routes being shadowed; saved hash links stranding the user; Back/Forward or a stale Diagnose response silently showing state different from the address; secret exposure, irreversible loss of authoritative data, or silent incorrect success.
- **Must recover:** a supported direct page load or refresh serves the SPA; an existing canonical hash link is normalized to the clean equivalent without adding a history step.
- **Accepted failure:** an unsupported path receives the server's existing clear 404 and requires manual navigation to a supported page.
- **Unsupported:** inventing new bookmarkable UI state, changing existing page-state value validation, or preserving every historical pre-#53 URL grammar.
- **Evidence owed:** public-interface checks for every supported page path, route/API precedence, frontend asset reachability, canonicalization, direct load and refresh, Back/Forward restoration, existing page-local state, and stale-response rejection.

Why: clean paths cross the frontend router and the FastAPI route table, so the contract must protect both navigation state and existing server interfaces.
Disposition: → ADR

## Open questions

- None.

## Spawned tasks

- None.

## Grounding

### Reproduction

The current route contract is green only in hash form:

```text
node --test frontend/tab-routing.test.js
→ 6 passed, including exact `#/<page>` serialization and stale-response rejection
```

The server currently serves only `/` as HTML, returns JSON 404s for five requested
clean page paths, and resolves `/plan` to the Plan-draft API:

```text
PYTHONPATH=/Users/connor/worktrees/harmonic/94 /Users/connor/Code/harmonichq/harmonic/.venv/bin/python -c 'import tempfile; from fastapi.testclient import TestClient; from ciq_autotune.api import create_app; f=tempfile.NamedTemporaryFile(suffix=".db"); c=TestClient(create_app(db_path=f.name, token=None, enable_fetch_loop=False)); print({p:(c.get(p).status_code,c.get(p).headers.get("content-type")) for p in ["/", "/diagnose", "/day", "/verify", "/plan", "/settings", "/guide"]})'
→ {'/': (200, 'text/html; charset=utf-8'), '/diagnose': (404, 'application/json'),
   '/day': (404, 'application/json'), '/verify': (404, 'application/json'),
   '/plan': (200, 'application/json'), '/settings': (404, 'application/json'),
   '/guide': (404, 'application/json')}
```

### Generated facts appendix

```text
git rev-parse HEAD
→ 9ae8172618304b1f0cb5893f957df1fb72c036ff

awk '/@app\.(get|post|put|patch|delete)\(/{ if (NR == 224) pages++; else if (NR >= 235 && NR <= 416) assets++; else if (NR >= 421) api++; } END { print "page_operations=" pages; print "asset_operations=" assets; print "api_operations=" api }' ciq_autotune/api.py
→ page_operations=1
  asset_operations=37
  api_operations=44

node --test frontend/tab-routing.test.js frontend/data.test.js
→ 42 passed, 0 failed

HARMONIC_SECRET_KEY=/private/tmp/harmonic-ticket-94-secret.key PYTHONPATH=/Users/connor/worktrees/harmonic/94 /Users/connor/Code/harmonichq/harmonic/.venv/bin/python -m pytest tests/test_api.py tests/test_frontend_asset_routes.py -q -p no:cacheprovider
→ 118 passed and 5 subtests passed, exit 0
```

`frontend/data.js` is already the sole browser transport and endpoint-path owner.
`frontend/tab-routing.js` already owns parse, serialize, write, and history
notification. `ciq_autotune/api.py` owns the FastAPI route table and explicit local
asset allowlist. These are the three implementation seams.

The closed current-document inventory is `AGENTS.md`, `README.md`,
`openspec/specs/http-api/spec.md`, `openspec/specs/credentials/spec.md`,
`openspec/specs/surfaces/spec.md`, `mockups/cockpit-shell.behavior.md`, and
`mockups/finding-evidence-routing.behavior.md`. Older OpenSpec change records and
scope ledgers remain historical; ADR 94 supersedes their route grammar without
rewriting their record of what shipped at the time.

The non-browser public-endpoint consumers are `.github/workflows/ci.yml`,
`Dockerfile`, `docker-compose.yml`, and `ciq_autotune/sync.py`: their health probes
and credential guidance must move to `/api/health` and `/api/credentials` with the
route table. The complete CI contract also materializes the publishable tree, checks
its links, and runs its contamination scan; those three operations belong in the
work order's local verification bundle.

### First-hour spike

- A real `TestClient` probe established the page/API collision and direct-load
  behavior above without starting a server or touching patient data.
- FastAPI officially supports one router prefix for a route group and configurable
  `openapi_url`, `docs_url`, and `redoc_url`; ADR 94 pins those interfaces to
  `/api/openapi.json`, `/api/docs`, and `/api/redoc`, so the namespace does not
  require a catch-all route or content negotiation.
- The browser History API supports same-origin clean URLs with `pushState`,
  `replaceState`, and `popstate`; `pushState` does not emit `hashchange`, so the
  post-migration subscription must be path/search based and `popstate` driven.

## Triage

Classification: code. Surface lifecycle: none.

Shape: flat. The work changes one application and one routing capability, imports
no live resource, crosses no account or trust boundary, requires no live run, and
has no split implementation path. The browser-owned page set has one tested
server-side mirror, not the more-than-two unchecked encodings that fire the lockstep
trait. Only the multiple-artifact trait is arguable (server, browser, and current
documentation), so the slicing rubric does not reach its two-trait threshold; this
is closest to anchor A, not B or F.

Review depth: full. The namespace move includes authenticated credential and write
endpoints, so the review-depth sensitivity floor overrides the otherwise bounded
routing change.

## Adversarial review

Round 1 found eleven authoring blockers and no injected blockers. The draft was
revised to make its executable evidence copy-runnable; name the complete merge bar;
inventory the contributor brief; pin generated API-document paths; bind the one
server page-set mirror exactly to the browser authority; define assets as the
reachable served graph and require exact equality; assign the routing lifecycle
matrix to one browser harness; include the local screenshot wrapper; constrain the
workstation changes to the existing marked route adapters; and replace subjective
stale-reference classification with executable route, transport, and exact-set
predicates. A fresh cold pass is required before the work order is locked.

Round 2 found two authoring blockers and no injected blockers: omitted deployment
and user-facing consumers of `/health` and `/credentials`, and an incomplete claim
to the CI merge bar that omitted materialized-public-tree verification. The work
order now names those consumers and the three public-tree operations explicitly.
A fresh cold pass remains required before lock.

Round 3 countersigned the revised work order with no blocking objections. The
adversarial review is complete.
