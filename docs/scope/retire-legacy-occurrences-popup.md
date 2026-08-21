# Scope ledger — Retire the legacy occurrences popup (#52)

Ticket: [harmonichq/harmonic#52](https://github.com/harmonichq/harmonic/issues/52)

Base: `b075c715a497b55e684f966cf046dc9179f428ab` (`origin/main`)

Classification: code. UI Craft lifecycle: revise. Review depth: Full.

## Decisions

- **Retire the closed legacy source inventory.** Remove `occurrenceModal`, its
  open/close/format/select helpers, `modal=occurrences` serialization and
  restoration, its analysis retry, watcher, Escape branch, setup exposure, and
  obsolete comments from `frontend/index.html`. Connor's settled #31 sanction
  is exact: “the dead `occurrenceModal` hash machinery goes with them.”
  **Why:** ADR 31 already makes the Inspector the sole evidence route.
  **Disposition:** → work order.
- **Prove source removal separately from URL normalization.** The current
  `parseHash()` reads `modal` but never publishes it in the parsed result, so a
  stale occurrences URL already normalizes to Diagnose on the ticket base. A
  direct source-inventory assertion is therefore the natural red-before / green-
  after proof; the public browser replay prevents the route from returning.
  **Why:** a replay that passes before deletion cannot prove deletion.
  **Disposition:** → work order.
- **Freeze a loud permanent retirement.** Add R1 to the existing Cockpit shell
  ledger and explicit story registry. Load and validate the ledger's owner,
  settlement date, and sanction; require the adjacent
  `RETIRED:Connor:2026-08-18` tag; print the validated sanction on every run;
  retain the existing nonzero-registry failure.
  **Why:** a retired route needs a durable sanction and a fail-closed tripwire.
  **Disposition:** → work order.
- **Use an existing generated population.** R1 alone opts the Cockpit adapter
  into `frontend/__fixtures__/findings-projection.json`'s matching inputs for
  `/diagnose/findings` and `/explore/exposures`. Existing stories keep their
  current stubs. The stale query identifier comes from the fixture's first
  scenario lever, and a public finding-row click must render its episode count
  and roster in the Inspector.
  **Why:** the default Cockpit exposure stub is empty; the committed generated
  fixture supplies an executable public proof without a new fixture.
  **Disposition:** → work order.
- **Keep adjacent work out.** Preserve `goToMoment`, the shared hash mechanism,
  and all non-occurrence branches. Do not repair the broader direct-link state,
  Data quality restoration, or Day restoration; those belong to #53. Do not
  change findings, event comparison, analyzers, safety, Plan, APIs, or stored
  data.
  **Why:** #52 is the already-settled dead-route deletion, not URL redesign.
  **Disposition:** → work order.
- **UI Craft route is revise.** The safe source is the generated
  `mockups/revise-e2e.synthetic/harmonic.sqlite`; no normal server or live fetch
  is allowed. Capture base and revision at 1440×900 and 1280×800 in Light and
  Dark.
  **Why:** this is a shipped surface with a declared synthetic source.
  **Disposition:** → design and work order.
- **Slicing stays flat.** Only the multiple-artifact trait fires. The browser
  harness and synthetic inputs already exist, no live resource is operated, and
  no trust boundary is crossed; the rubric requires two traits before chunking.
  This is closest to anchor A, not the multi-path anchor F.
  **Disposition:** one work order, one pull request.

### Risk contract

- **Must prevent:** removing or changing the current finding inspector or Day
  handoff, changing any advisory/safety/Plan behavior, or letting a browser gate
  pass with zero applicable stories; publishing real health data is prohibited.
- **Must recover:** nothing automatically.
- **Accepted failure:** a bookmark carrying the retired occurrence-list
  parameter lands on the current Diagnose surface with the obsolete parameter
  discarded; the old popup/list state is not recovered.
- **Unsupported:** preserving legacy `modal=occurrences` bookmarks; repairing
  or standardizing the currently untested direct-link restoration for Data
  quality or Day; redesigning URL state; and verification with real pump data
  or a fetch-enabled server.
- **Evidence owed:** a current-base shell inventory; the permanent, loud
  retirement story with its named/date/quoted sanction; a public stale-link
  assertion that reaches canonical `#diagnose`; deliberate red mutations
  restored before commit; a source-inventory assertion that fails naturally
  before the dead source is removed; the closed production-source inventory;
  the existing public gates for the inspector, Day handoff, and shell remaining
  green; green fast, Diagnose workstation, and Cockpit browser gates.

Why: this is a recoverable stale-link cleanup, but it sits beside the evidence
a wearer uses to judge advisory dosing guidance.

Disposition: copied unchanged into the proposal and locked work order.

## Review rounds

- **Grounding pass:** Codebase Memory plus direct source/config reads closed the
  production inventory, located ADR 31 and Connor's exact sanction, identified
  the inert `parseHash()` behavior, measured the shell fixture hashes, and
  classified the surface as revise. No live app was started.
- **Cold round 1:** three parallel lenses returned four consolidated authoring
  blockers: production scope, exact canonical-hash acceptance, unsupported
  adjacent-surface claims, and an incomplete visual evidence matrix. All were
  corrected; zero injected blockers were present.
- **Cold round 2:** the same panel found two injected seams (the wrong fixture
  identifier source and underspecified sanction validation) plus remaining
  authoring gaps in source-removal proof and concrete Inspector evidence. The
