# Diagnose case files after I:C history

## Decisions

- **Adapt the case-file behavior ledger to the rows published by the current
  server-owned preparation; do not restore eight behavioral rows in the backend
  projection merely to satisfy the old replay fixture. Retain case-file support
  for every Lever through analyzer-built/public-interface cases, and exercise a
  row-specific browser story only when that row is present in the preparation
  used by that story.** `inline`

  Issue 79 makes `GET /diagnose/findings` authoritative and unchanged, requires
  the preparation wrapper to preserve that projection's row policy and order,
  and explicitly withholds rather than invents a behavioral row whose attribution
  is not inspectable
  (`openspec/changes/diagnose-finding-case-files/proposal.md@71cf4aa:17-31`;
  `openspec/changes/diagnose-finding-case-files/design.md@71cf4aa:20-29,48-55,103-118,143-156`;
  `openspec/changes/diagnose-finding-case-files/tasks.md@71cf4aa:15-27`). The
  implementation enforces the same boundary: a case is unavailable unless its id
  occurs in the retained authoritative rows, and the wrapper starts from those
  rows rather than adding Findings
  (`ciq_autotune/finding_case_file.py@71cf4aa:92-105,320-340`). The current
  baseline therefore tells the browser to render the preparation's exact rows and
  to open any *visible* behavioral Finding; it does not require a fixed count of
  eight (`openspec/specs/surfaces/spec.md@71cf4aa:39-55`;
  `openspec/specs/http-api/spec.md@71cf4aa:83-98`).

  The eight-row expectation is fixture inventory, not queue policy. At `622c578`
  the synthetic capture generator iterated over all `Lever` values and directly
  constructed eight Finding rows before running them through the case-file module
  (`.claude/qa/gen_synthetic_fixtures.py@622c578:424-486`), and the replay served
  that capture from intercepted preparation and case routes
  (`frontend/diagnose-workstation-behavior.replay.mjs@622c578:475-579`). After the
  I:C-history merge, `C42` still asserted exactly eight generated rows
  (`frontend/diagnose-workstation-behavior.replay.mjs@71cf4aa:2906-2916`) even
  though the integration commit had removed the independent case-route handlers,
  leaving those API paths unhandled by the replay router
  (`frontend/diagnose-workstation-behavior.replay.mjs@71cf4aa:524-625`). That is a
  stale ledger/harness assumption, not authority to alter analysis.

  Issue 88 advances the Findings schema for a nonbehavioral `history` register,
  keeps history distinct from behavioral Findings, and says the global projection
  contains the analyzer-published active history rows without changing existing
  register or chip counts
  (`openspec/changes/dose-stamped-information-findings/design.md@f0ce009:3-16,18-41`).
  Its fixture generator also deliberately changed the no-fetch database from 30
  to 100 days and introduced a proved I:C setting transition
  (`scripts/gen_revise_e2e_db.py@f0ce009:38-43,97-168`). Nothing in that authority
  authorizes fabricating behavioral Patterns to preserve a prior fixture count;
  issue 79's risk contract expressly forbids changing analyzer verdicts or
  Priority (`openspec/changes/diagnose-finding-case-files/proposal.md@71cf4aa:33-65`).

  Coverage for the full publishable domain remains independent of whichever
  Findings happen to recur in one committed no-fetch database: the deep contract
  parametrizes every one of the eight Levers
  (`tests/test_finding_case_file.py@71cf4aa:71-88`), and analyzer-built HTTP tests
  reach Low, correction-cluster, High, carb-undercount, meal-over-delivery,
  correction-on-active-insulin, meal-bolus-short, and late-bolus cases
  (`tests/test_finding_case_file_api.py@71cf4aa:598-668,683-770`). The served
  preparation contract separately proves that `rendered_rows` has exactly the
  authoritative projection's identities, whatever that roster is
  (`tests/test_finding_case_file_api.py@71cf4aa:485-500`). Thus C41-C55 and the
  affected S32-S40 stories should be roster-relative, moved to a compatible
  published row, or retained against independently generated production-shaped
  responses where the story is specifically about a Lever absent from the
  current served roster; they must not cause the backend to publish unsupported
  Findings.

  Evidence v2 pointers are not emitted: this scope ledger is a scratchpad and is
  not itself an eligible durable issue, ADR, review, or immutable document
  authority. The citations above are ordinary primary-source citations, not an
  evidence envelope.

### Risk contract

- **Must prevent:** a browser story or backend change inventing a Finding that the
  authoritative projection did not publish; a visible Finding whose counts,
  roster, or event chart come from different populations; silent event-to-clock
  fallback; frontend re-derivation of Exposure, membership, verdict, support, or
  inspectability; real patient data or secrets in fixtures, evidence, Git, or CI;
  any change to analyzer verdicts, Priority, staging, Plan, or pump-setting advice.
- **Must recover:** an active failed or stale case-file request preserves the last
  coherent queue/Inspector/canvas generation and reports the failure; superseded
  responses are discarded without changing state or raising a stale error.
- **Accepted failure:** when a currently served synthetic roster does not publish
  a Lever needed by a row-specific browser story, that story is adapted to a
  compatible published row or exercised through the independent generated
  production-shaped case contract; the system does not synthesize a successful
  live Finding. A genuinely uninspectable case fails clearly and preserves the
  prior state until a later valid projection.
- **Unsupported:** live vendor fetches; real-data browser evidence; changing
  classifier thresholds, recurrence policy, comparison-support floors,
  event-alignment semantics, or ADR 22's historical I:C contract to make a test
  fixture publish a preferred roster.
- **Evidence owed:** exact equality between preparation `rendered_rows` and the
  authoritative server roster apart from ADR 79's named case-header fields;
  public-interface coverage for all eight Levers and all four Exposure families;
  roster-relative visible-row opening; selected Occurrence alignment; High and
  correction-pair projections; structured failure preservation; independent
  preparation/case serialization; full fast, drift, and no-fetch browser gates.

Why: Diagnose evidence can influence advisory insulin-dosing decisions, so a
plausible but invented Finding or mismatched roster/chart is silent incorrect
success.

Disposition: `inline` — this applies ADR 79 and ADR 22 to the rebased replay; it
does not create a new domain or architectural decision.

## Open questions

- None. The authority question is resolved; the exact story-to-published-row
  mapping is implementation work governed by the decision and evidence owed
  above.

## Spawned tasks

- Research the issue 79 and issue 88 primary repository authorities, named commits, generators and mirrors, baseline specs, and current served replay/test contracts to resolve the authoritative integration behavior. (research worker; completed)
