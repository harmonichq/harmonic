# Scope — URL-state contract re-triage

Ticket: [harmonichq/harmonic#53](https://github.com/harmonichq/harmonic/issues/53)

Classification: code. Work shape: flat, single agent. Review: Targeted.
Surface lifecycle: none.

## Re-triage disposition

This record supersedes the prior issue-53 path-routing and chunked work order.
That direction mistook a request for a conventional hash-router shape for a
server-path migration, then expanded it into new routing, validation, error-UI,
provenance, fixture, screenshot, and coordination contracts. Those additions
do not serve the requested URL cleanup and increase risk in unrelated parts of
the app.

The existing implementation commits remain in branch history. A later flat
implementation must correct their shipped effect with ordinary new commits;
this documentation-only re-triage does not rewrite or remove them.

## Settled scope

- Canonical form: `#/<page>?<existing-page-state>`.
- Existing pages only: `day`, `diagnose`, `verify`, `plan`, `settings`, and
  `guide`.
- Existing shell URL state remains in the fragment. P53's existing `view`,
  `factor`, `start_min`, `end_min`, `another`, and `occ` keys move from
  `location.search` to the Diagnose fragment query.
- A Vue-free routing interface owns parse, serialize, normalization, and
  history notification for the complete hash route.
- Existing no-slash hashes and the old split form may be normalized narrowly.
- Page behavior, requests, P53's popstate re-request and stale-response guard,
  server/API routes, UI, data, authentication, analyzers, fixtures, and behavior
  ledgers remain unchanged except for the minimum P53 URL wording correction.

## Explicitly out of scope

- `/app/...` paths or server routing changes.
- New bookmarkable state or a closed URL-value grammar.
- Async identity validation, invalid-link UI, or new failure states.
- Screenshot or evidence matrices, server launches, credential checks,
  patient-data or Python-provenance harnesses, new fixtures, and behavior-ledger
  expansion.
- Chunking, coordinator mode, and a UI Craft surface revision.

## Risk contract

- **Must prevent:** the hash address and shown state silently disagree.
- **Must recover:** Back and Forward restore the addressed existing state; a
  restored P53 route re-requests and cannot be overwritten by an older response.
- **Accepted behavior:** current defaults and invalid-value handling remain as
  they are; no new invalid-link model is introduced.
- **Ordinary safeguards:** do not expose secrets, irreversibly lose
  authoritative data, or claim success without exercised evidence. The scoped
  change introduces no data mutation, patient-data access, credential access,
  or server launch.
- **Evidence owed:** parse, serialize, limited normalization, and history
  behavior through the routing interface, plus P53 re-request and stale-response
  preservation in the relevant existing checks.

## Grounding

- Original main's `frontend/tab-routing.js` defines the six current page IDs
  and the existing page fallback.
- Original main's `frontend/index.html` separately parses and writes the shell
  hash, including existing Day and Guide state, and listens for `hashchange`.
- Original main's `frontend/diagnose-event-comparison.js` reads P53 coordinates
  from `location.search`, re-requests on `popstate`, and drops out-of-generation
  responses.
- ADR 31 says the current hash/query split retires but does not require server
  path routing.
- P53 names the six event-comparison coordinates and preserves the re-request
  and stale-response behavior.

## Execution shape and evidence

One frontend routing capability, one agent, no serial chunks. The implementation
should deepen the existing Vue-free routing seam, connect the shell and P53 to
it, and adjust only directly contradictory wording/checks. Verification is the
focused route test plus the existing relevant Cockpit and Diagnose
event-comparison frontend/browser routing checks. Review is Targeted because
the address contract changes but rendered content, data, and dosing logic do
not.

Open questions: none. Review rounds performed during this re-triage: none.
