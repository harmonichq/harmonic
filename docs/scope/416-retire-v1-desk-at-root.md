# Scope ledger: #416 retire v1, serve the desk at root

Routed by `/scope` to interview mode on 2026-09-21, during `/ticket triage 416`.

## Decisions

- v1 is killed completely, and every `/v2` path moves to root: the desk at `/`,
  its pages at `/diagnose`, `/changes` and `/day`, its assets under `/assets`.
  Why: Connor, 2026-09-21, in the triage request. Disposition: → ADR
- Q1. The desk is accepted, and this instruction is the cutover approval and the
  retirement approval in one. No v1 route stays served; the old app is
  recoverable from Git history only. This supersedes harmonic-v2 design step 5
  and closes its tasks 3.5 (acceptance), 4.2 and 4.3.
  Why: Connor, 2026-09-21: "V2's good." Disposition: → ADR
- Q2. No redirects. Every `/v2/...` path and every old v1 page path (`/verify`,
  `/plan`, `/settings`, `/guide`) is a 404 under the closed route set.
  Why: Connor: "No redirects, no nothing." Disposition: → ADR
- Q3. Nothing is ported. Fetch status with Fetch now, audit-item dismissal, the
  topbar range indicator and the four Day detail views drop with v1.
  Why: Connor: "If V2 hasn't implemented it, I don't need it." Disposition: → ADR
- Q4. Every v1 gate is deleted, including the ledgers and suites that guard
  Diagnose behavior the desk embeds. The desk's own ledger and suites are the
  only browser contract. Why: Connor: "Kill all the V1 stuff." Disposition: → ADR
- Q5. One `frontend/` source root. The v2 name leaves the living system: source
  paths, build config, CI, routes, scripts, living docs and baseline specs.
  Historical records keep their names (archived and completed OpenSpec changes,
  `docs/scope/`, locked prototype and ledger records under `mockups/`).
  Why: Connor: "just one front end. There's no V2 anywhere"; the historical
  carve-out is triage's call, since renaming a frozen record rewrites history.
  Disposition: → ADR
- Q6. The chart harness and the design explorations that read v1's page are
  deleted with their drift checks. Why: Connor delegated the harness call; the
  no-fetch QA serve of the built desk is the safe chart-revision surface now.
  Disposition: → ADR
- Q7. One order, four serial chunks: cutover to root; v1 deletion; single-root
  rename; live browser run and its corrections. No follow-on ticket.
  Why: delegated by Connor; four is the slicing ceiling, every decision is
  settled, and the live run is its own boundary here. Disposition: inline

- Q9. #416 lands before #413. #413 is triaged and unstarted; its desk-only path
  and its v1 ledger runs exist only to protect v1, so it is re-triaged against
  the single root after this merges. Why: triage's call under Connor's
  delegation; building v1 protection for an app that dies next is waste.
  Disposition: inline (design.md "Sequencing against #413")

### Risk contract

- **Must prevent:** secret exposure; any change to the store, analyzers, safety
  caps or advisory output; silent incorrect success, meaning a gate that passes
  while running zero assertions, or a page that answers 200 with a missing build
  or missing assets.
- **Must recover:** nothing automatically.
- **Accepted failure:** an old bookmark (`/v2/...`, `/plan`, `/verify`,
  `/settings`, `/guide`) answers 404. A missing build answers 503 naming the
  build command. v1-only features are gone with no replacement.
- **Unsupported:** any v1 page, any `/v2` path, restoring v1 other than from Git
  history.
- **Evidence owed:** the closed non-API route set through the HTTP interface,
  including the 404 list; the packaged-runtime proof at root; the complete desk
  ledger at both sizes against the built root-served app; the desk and follow-up
  browser suites; the fast gate; every surviving drift check; the fail-closed
  gate regression test.
- Why: delegated by Connor ("Just do what I asked"); defaults applied, priced for
  a one-operator self-hosted tool whose advisory engine this ticket never touches.
- Disposition: copied into the OpenSpec change `retire-v1` at admission.

## Open questions

None. Q10: Connor chose to spike the deletion first (2026-09-21, "A, spike it");
the result is `openspec/changes/retire-v1/spike.md`. Q11: Connor approved posting
the order after the post-spike review's findings were folded in ("A, post it").
Every `→ ADR` decision above is recorded as ADR 416 in the change's design.md.

## Spawned tasks

- After #416 merges: `/ticket triage 413` again, superseding its lock.
