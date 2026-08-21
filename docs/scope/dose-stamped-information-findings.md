# Scope ledger — dose-stamped information-only findings (#22)

## Decisions

- Treat the Carb ratio information-only destination as a revision of the shipped
  Diagnose finding-to-evidence surface, not as a greenfield mock lock. The one
  inspector and evidence canvas already ship, and `ui-craft` requires a new view
  inside a shipped shell to use its `revise` lane. `inline`
- The shipped surface is the predecessor and source of truth: frozen behavior
  ledger `mockups/finding-evidence-routing.behavior.md`, replay
  `frontend/diagnose-workstation-behavior.replay.mjs`, and the running app at the
  ticket branch's `origin/main` base. The deleted
  `mockups/finding-evidence-routing.lock.md` is historical only. `inline`
- Information-only authority stays server-owned. The analyzer and findings
  projection publish the Audit item, its evidence membership, its age/lifecycle,
  and its non-actionable status; the frontend renders those facts and never
  re-derives eligibility, direction, or retirement. `→ ADR`
- A dose-stamped history item must remain outside Plan and staging in every state.
  Only the currently programmed regime may pass `ic_asserts_move`; a retired
  regime can preserve measurement, never assertion authority. `→ ADR`
- The revision baseline is fresh `origin/main` `fdf6846`. The repository-declared
  `uv run harmonic serve --no-fetch --db
  mockups/revise-e2e.synthetic/harmonic.sqlite` entrypoint was verified against
  the generator, SQLite integrity check, and provenance table. The shipped
  Diagnose replay passed 42 of 42 stories, and the latest surface source and
  behavior-ledger change are the same tip commit. `inline`
- Visual review evidence stays external to Git during triage. The baseline
  synthetic Diagnose render is `/private/tmp/harmonic22-shots/base-diagnose-rendered.png`;
  it carries no personal health data. `inline`
- The destination's primary job is a **historical measurement**, not a
  comparison with today's program. Its conclusion-first read is: “When Carb
  ratio was 5.0 g/U, 11 meal runs measured 4.6 g/U (CI 4.4–4.8). Past
  setting. No change suggested.” The current programmed value is subordinate context,
  never the comparison target or a recommendation. This is the operator's
  selected direction. `→ ADR`
- Distinguish the row without a new ranking tier: the server publishes the new
  `history` register at the existing `noted` tier, and the surface says
  `Past setting` and `No change suggested` in text. It has no recommendation
  number, staging control, or Plan path; color remains supportive rather than
  the only distinction. `→ ADR`
- Preserve the shipped one-canvas grammar. `By clock` shows the selected retired
  regime's programmed value, measured value, interval, and support; `By event`
  shows the meal-response evidence for the server-published run membership of
  that same regime. Neither projection compares regimes or translates the past
  estimate into current advice. `→ ADR`
- The 90-day history event population gets its own read-only projection seam; it
  does not extend or truncate through the shipped behavioral event-comparison
  endpoint's fixed 30-day contract. The response echoes the history-row identity
  and carries exactly the analyzer-published run membership. `→ ADR`
- History is reachable in the subordinate Watching section both globally and
  under an explicit clock window. The global projection includes every active
  history row; an explicit window includes only rows whose server-published block
  span overlaps it. History has no chips, follows Watching's collapsed sift
  behavior, and sorts after held and blind rows. `→ ADR`
- Decay is the server-owned fixed 90-day measurement window: support and interval
  update as runs age out. A history item remains visible while the analyzer
  publishes a non-null estimate, including below the assertion support floor.
  Only an explicit server `aged_out` disposition returns an open case file to the
  queue; ordinary clock exclusion keeps the reader per ADR 62. No archive or
  countdown remains. `→ ADR`

### Risk contract

- **Must prevent:** an information-only measurement reading as a recommendation;
  any information-only row becoming stageable or entering Plan; a frontend rule
  recreating assertion or retirement logic; real pump/CGM data entering fixtures,
  screenshots, Git history, or public CI output; silent stale evidence after a
  projection failure.
- **Must recover:** a failed or superseded evidence request restores or preserves
  the last internally consistent inspector/canvas state rather than mixing
  populations or regimes.
- **Accepted failure:** a retired regime with no analyzer-published estimate is
  withheld; a thin but non-null measurement remains visible and explicitly
  non-actionable. An expired selected item returns to the queue only on the
  server's explicit `aged_out` disposition. Recovery is new qualifying data or a
  later analysis run, not a client-side approximation or archive.
- **Unsupported:** unstamped bolus history; meal runs spanning a reprogramming;
  translating a retired regime's estimate into advice for the current setting.
- **Evidence owed:** analyzer-built synthetic fixtures proving current-regime-only
  assertion and below-floor history visibility; projection tests proving the
  `history` row schema, global/scoped membership, ordering, no-selection and invalid
  selection behavior, and explicit selection dispositions; history-event
  projection tests proving exact 90-day analyzer-owned run membership without
  changing the behavioral event-comparison endpoint; frozen browser stories for
  queue, case-file, both projections,
  selection, empty, aging, retirement, failed requests, and superseded out-of-order
  responses; live synthetic before/after judgment that history reads first and
  current context second in both themes at 1440×900, 1280×800, and the narrow
  responsive state; generator and contamination guards for every new fixture.

Why: Harmonic presents advisory insulin-dosing guidance from one person's health
data; an overclaim or stale mixed state can influence a real dose.

Disposition: ADR 22 is the normative risk authority. The posted work order copies
it unchanged for execution; this ledger remains the non-normative session record.

## Open questions

- None. The operator selected the historical-measurement direction; the remaining
  presentation, projection, and lifecycle details follow the shipped Diagnose
  contract and its server-ownership safety rule.

### Generated facts appendix

- `git rev-parse HEAD` → `fdf6846c1ff6fb0b2f2c23d6fdc9445f546999b4`
- `rg -n "BLOCK_WINDOW_DAYS =" ciq_autotune/analyzers/ic.py` →
  `85:BLOCK_WINDOW_DAYS = 90`
- `rg -n 'row\["tier"\] =' ciq_autotune/findings_projection.py` → the projection
  assigns only `noted`, `next_in_line`, and `worth_a_look`; `noted` is the existing
  unpriced tier.
- Safe-start spike: the exact no-fetch server declared by `AGENTS.md` served the
  generated `mockups/revise-e2e.synthetic/harmonic.sqlite`; the frozen Diagnose
  app replay reported `app: 42 of 42 stories passed`, with no console errors.
- Exact fast gate after `uv sync --frozen --extra api --extra sync` → backend
  `1857 passed, 1 skipped`; frontend `365 passed, 0 failed`; ADR guard `12 ADRs
  in 10 design.md files`; owned-identifier `30` rules passed; public allowlist
  cleared the tree with every tracked path dispositioned.
- `find openspec/changes -maxdepth 2 -name design.md` confirms ADRs live in a
  change-local `design.md`; `openspec/changes/ic-dose-stamped-anchor/design.md`
  is the existing ADR 20 authority and
  `openspec/changes/finding-evidence-routing/design.md` is the ADR 31 authority.

## Spawned tasks

- `cold_executor_review` — cold executability and five-axis plan review; complete.
- `craft_review` — semantic hierarchy and rendered-evidence review; complete.
- `ceremony_review` — authority, scope, and cost review; complete.

## Review rounds

- Preflight: generated facts are command-backed above; the first-hour spike ran
  the safe app and frozen replay; the exact proposed verification command passed.
  No executable literal exists only in prose, and the normative surface contract
  lives once in ADR 22 with the work order pointing to it.
- Panel 1: 10 distinct blockers, all `authoring`, zero `injected`: inaccessible
  uncommitted inputs; unsettled queue visibility and row discriminator; ambiguous
  thin-evidence boundary; absence overloaded as retirement; preservation conflict
  with ADR 62; duplicated authority; bad base hash; optional current-context
  hierarchy; missing failure/supersession evidence; and em-dash copy conflicting
  with `DESIGN.md`. Every claim was reproduced against the ticket worktree before
  revision.
- Panel 2: 2 blockers: the missing 90-day history-event seam was `authoring`; the
  undefined omitted/invalid `selected_id` outcomes were `injected` by panel 1's
  interface fix. Both claims were reproduced against the fixed 30-day behavioral
  endpoint and the current findings schema before revision.
