# Design — retire the retired-tab-id migration (#352)

## ADR 352 — Retire the tab-id migration rather than serving retired paths

### Context

Page resolution in `frontend/tab-routing.js` maps seven retired page ids onto
live pages: `dashboard`, `pump`, `review` and `patterns` to Diagnose, `daily`
and `modelview` to Day, `outcomes` to Verify. A comment block in
`frontend/index.html` presents that mapping as a standing promise about shared
links.

Three facts, each checked against the tree, say no address can reach the
mapping:

1. The server serves the shell at `/` and at exactly the live page ids
   (`ciq_autotune/api.py`, the `SPA_PAGES` tuple and the loop that adds a route
   per entry). Every other path answers FastAPI's 404, so a retired id's address
   never reaches the shell. Reproduced against both synthetic servers: each
   retired id answers 404 with `{"detail":"Not Found"}` while `/diagnose`
   answers the shell.
2. `tests/test_frontend_asset_routes.py` enforces that shape rather than merely
   describing it. One test asserts the server's page list equals the browser
   router's page list exactly; one asserts the whole non-API route set equals the
   page paths plus the asset paths; one asserts an unlisted path answers 404.
   Serving a retired id would have to move all three.
3. The one address form that could carry a retired id was the `#/<page>?...`
   fragment grammar, and #94 retired it as a recorded operator decision — saved
   hash links get no rewrite. The server's page list was introduced whole, with
   the live ids, by that same change and has never held a retired id, so no
   version of this app has ever emitted or honoured a path-form retired address.

Inside the running app the mapping has no current input either. Page resolution
is reached from the parsed address, whose id the server has already restricted to
a live page; from the change dock's route control, which passes live pages; and
from the Guide's `app:<id>` handoff, which is the one channel that could still
name a retired id, because it renders whatever word an article author writes. No
shipped article does: `docs/kb` names only `app:day`, `app:diagnose` and
`app:plan`. The unrecognized-id fallback to the default page is a different rule
and does have inputs, from that same handoff.

### Decision

Delete the retired-id mapping and keep the unrecognized-id fallback. Correct the
prose that promises the mapping, and pin the retired ids as not served beside the
existing unknown-path assertion.

### Alternatives considered

**Serve the shell for the retired ids.** Rejected. It would move three enforced
assertions in order to honour addresses no version of this app has ever emitted,
and would re-introduce into the path grammar the migration #94 deliberately
retired from the fragment grammar. It adds a capability under the description of
fixing a defect.

**Add a catch-all route so any unknown path falls back to the shell.** Rejected,
and worse than the first: the route table has no static mount, so a catch-all
registered last also swallows unknown `/api` and `/assets` paths. A missing
module would answer 200 with an HTML document instead of 404, turning a loud
failure into a silent one — and the closed-route-set assertion exists to prevent
exactly that.

### Consequences

Page resolution for every input the shipped app can produce is unchanged: live
ids resolve to themselves before and after, and unrecognized ids resolve to the
default page before and after. Only the seven retired ids change what they
return, and no current caller supplies one. Four of them (`dashboard`, `pump`,
`review`, `patterns`) return Diagnose either way, because Diagnose is also the
default page; `daily`, `modelview` and `outcomes` are the three whose return
value changes, and they are what a fail-first test asserts against. Reaching one
takes authoring that id into a Guide article, which no shipped article does.

Retired ids stay 404 at the server, which is the honest answer for an address the
app does not have and never issued.
