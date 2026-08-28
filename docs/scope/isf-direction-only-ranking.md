# Direction-only correction-factor ranking

## Decisions

- Preserve the analyzer's harm-owned `weaken` direction when recurring correction-caused lows clear its recurrence bar; a flat or disagreeing fasting-window fit does not overrule that direction. This is existing safety behavior, not the queue-policy defect. `inline`
- Treat issue 223 as a code change to the server-owned findings contract, with any rendered change following the shipped-surface revision lifecycle. The reproduced behavior is specified and implemented, so fixing it requires re-settling policy rather than correcting an accidental frontend derivation. `→ ADR`
- Keep a direction-only Correction factor warning visible, but place it below every finding that offers a settings change to stage. Recurring lows remain important evidence without presenting an unusable finding as the reader's next action. `→ ADR`
- Apply the queue rule to every setting finding that has nothing to stage, not only Correction factor. A merged Basal finding whose member time slots can still stage remains actionable; the rule follows actual stageability rather than whether the row prints one headline number. `→ ADR`
- Keep the Correction factor's underlying Priority calculation unchanged for analysis and future consumers; only the Findings queue withholds rank from an unstageable row. Recurring correction-linked lows remain consequential evidence even when the row is not the next action. `→ ADR`
- When the fasting trend is flat or disagrees with recurring correction-linked lows, show both signals and state that the lows own the weaker direction. The explanation must not let the chart appear to be the source of a conclusion it did not establish. `→ ADR`
- Keep the existing projection interface: analysis continues to publish the underlying Priority, while the backend Findings projection emits `priority: null` for a setting row with nothing to stage and sorts it through the existing unranked path. The browser renders that server-owned placement and annotation without a second score, actionability rule, or new wire field. `→ ADR`
- Do not add issue-223 behavior for legacy or hand-authored findings payloads. The live route builds from the current analyzer and source-fingerprints durable artifacts, so pre-`asserts_move` bytes cannot survive a code upgrade into the current front page; compatibility-only fixtures do not establish a product case. `inline`
- Connor confirmed the complete shared understanding on 2026-08-28: visible but unranked warning, general stageability rule, unchanged underlying Priority, explicit two-signal explanation, and no legacy-payload work. `inline`
- Route the rendered portion through UI Craft `revise`: this is a convergent change to the shipped Diagnose information model, not a new surface or divergent wireframe. `inline`
- Freeze shipped behavior through `mockups/finding-evidence-routing.behavior.md` and `frontend/diagnose-workstation-behavior.replay.mjs`. Before implementation, replay and re-inventory the base at `16cfbda7ca4bf6ce2a26441e44ea60169bcd15fa`; amend the ledger only for the sanctioned queue-placement and evidence-attribution changes. `inline`
- Honor PR 229's settled seating contract: automatic candidates come from backend-ordered `assert` and `finding` rows, only explicit live-chart pins promote Watching evidence, and the frontend creates no second ranking authority. Issue 223 changes the backend rank input and the explanation, not seating or promotion. `inline`
- Amend only the canonical Surfaces baseline. The Safety baseline continues to describe the analyzer and analysis-Priority invariant; queue placement is a surface contract and does not require a Safety-spec change. `inline`

### Risk contract

- **Must prevent:** changing any analyzer recommendation, `asserts_move` verdict, Plan entry, consolidated schedule, or underlying Correction factor Priority; ranking a setting finding with nothing to stage above any stageable finding; copy that presents a flat or disagreeing fasting trend as the source of the weaker direction; drift between the Python projection, its fixture-only JavaScript mirror, and the rendered queue; secret exposure, irreversible authoritative-data loss, or silent incorrect success.
- **Must recover:** none; this is a deterministic read projection and copy change with no new state transition.
- **Accepted failure:** a failed findings refresh keeps the existing structured visible error and coherent prior frame under the shipped Diagnose recovery contract; issue 223 adds no new recovery path.
- **Unsupported:** hand-edited or foreign findings payloads, legacy payload shapes that the current source-fingerprinted server cannot publish, and patient-derived test or fixture data.
- **Evidence owed:** analyzer-output tests for flat and disagreeing fasting trends under recurring correction-linked lows; a public findings-projection test proving all stageable findings precede the visible unranked warning while its analysis Priority remains unchanged; regenerated projection fixtures and mirror parity; the shipped Diagnose behavior replay and browser evidence proving the warning has no rank numeral or stage affordance and names which evidence owns the direction.
- **Why:** advisory insulin-setting guidance makes wrong actionability or evidence attribution harmful, while the projection is read-only and failures are recoverable by an explicit refresh.
- **Disposition:** `→ ADR`

## Open questions

- None.

## Spawned tasks

- None.

## Review rounds

- Preflight completed on 2026-08-28 against base `16cfbda7ca4bf6ce2a26441e44ea60169bcd15fa`: the bounded analyzer/projection suites, frontend queue/workstation/mirror suites, findings-fixture drift check, and ADR-number guard pass on the ticket base; the safe-start declaration and shipped ledger/replay registration are present. Triage did not start the app, as required by the ticket/UI Craft boundary.
- Mandatory plan-review round 1 did not dispatch. This Full-depth order requires a load-bearing cold reviewer, while the Codex UI dispatch policy declares Codex-only load-bearing review `NO_VALIDATED_ROUTE` and forbids substituting native agent dispatch. This is a workflow-availability blocker, not an `authoring` or `injected` plan objection. The unreviewed draft remains in session scratch and must not be shown or posted.
- Connor explicitly selected GPT-5.6 Sol for the cold review. The required external dispatch was rejected before launch because that instruction did not explicitly authorize sending the work order plus necessary private repository code/documentation to OpenAI's Codex model service. No reviewer received the draft. Resume only after that bounded transfer is explicitly authorized; credentials, secrets, patient data, `.env`, and database contents remain excluded.
- Sol round 1 returned four verified blocking objections, all tagged `authoring`: (1) sub-order 1 could not read uncommitted ADR/spec prerequisites from a chunk branch; (2) verification named categories instead of transcribing the repository's exact fast, drift, and browser commands; (3) the whole-ticket criterion accidentally moved every unstageable setting out of Watching instead of narrowing that promise to the direction-bearing asserted ISF row; and (4) sub-order 2 owned browser evidence without an allowed output path or coordinator handoff. The corrected draft now commits triage records before chunking, carries the exact command inventory, preserves held/blind/history Watching behavior, and routes raw synthetic evidence through `/private/tmp/harmonic-223-evidence/` for coordinator-owned consolidation.
- Sol's same-session re-check cleared those four corrections and found one `injected` blocker in the newly expanded verification block: the long-running no-fetch server was also covered by the finite exit-zero expectation, with no readiness or shutdown lifecycle. The draft now treats it as managed setup, gates app legs on `/api/health`, and requires Ctrl-C cleanup after the four finite app checks.
- Sol's second same-session re-check cleared the managed-server correction and returned `COUNTERSIGNED`. Because this is a load-bearing plan, termination still requires a new context-free cold reviewer to return no blocking objections.
- Fresh context-free Sol round 2 returned no blocking objections and `COUNTERSIGNED`. Review terminated cleanly: round 1 found four `authoring` blockers, its first correction introduced one `injected` blocker, both same-session re-checks converged, and the required fresh pass was clean.
