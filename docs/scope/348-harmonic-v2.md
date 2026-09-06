# Harmonic v2 planning investigation (#348)

## Decisions

- Classify #348 as an attended investigation. Its output is an agreed product/design plan and findings, not an application build or a planning-only pull request. The issue explicitly withholds build authority. inline
- Use `openspec/changes/harmonic-v2/` as the planning authority. This scope ledger records the interview; proposal, design, and tasks own the resulting plan. inline
- Route scope to interview mode: the issue supplies a concrete navigation and delivery hypothesis, while the operator's primary unmet need and the first useful journey remain untested. Do not turn this intake into a second epic or a component backlog. inline
- Preserve the issue's agreed architecture: sibling `frontend-v2/`, Vue/Vite/TypeScript, `/v2/` and `/v2/assets/`, one Python API/database owner, Node for building only, and ordinary human-reviewed increments to main. V1 need not migrate to Vite first. Recorded as ADR 348 — A parallel v2 frontend with one Python data owner. → ADR (discharged)
- Preserve analyzer authority, existing clinical eligibility, manual pump entry, one active watched change, separate adherence/outcome, and non-causal before/after language. Use synthetic evidence only. inline
- Reconcile #347, #336, and #340 in this plan without modifying those tickets or their branches. #340's latest posted source is `1ee53b341192b0943c83aae94b47dc6b33c571e3`. inline
- Grounding base: `b8f4a71e89be1111b71439cea4b8761fbc95c46c`. The selected clean ticket branch was fast-forwarded from its original base; no production source was edited. inline

- Q1 settled: center v2 on one concrete, evidence-backed next action. Connor describes the current app as a list of loosely connected possible improvements and charts; the unmet need is prioritization and guidance. Recorded in ADR 348 — Guidance leads, findings explain. → ADR (discharged)
- Organize the product investigation around connected recurring glucose patterns: highs after meals, lows after meals, highs after treating lows, and lows after correcting highs. These are the operator's problem framing, not new causal classifications or approved engine rules. inline
- The guidance must identify where the relevant recurring evidence appears in the glucose chart. Secondary findings should explain the lead action rather than each competing for attention. inline

- Q2 settled: when a recurring problem is visible but no specific change is supported, lead with a guided look at relevant episodes to narrow down what to address. Record what remains uncertain and do not promote the investigation into treatment advice. Recorded in ADR 348 — Guidance leads, findings explain. → ADR (discharged)

- Q3 settled: among well-supported actions, prioritize the most consequential recurring glucose problem even when another change would be easier. Ease is not the primary ranking objective. Recorded in ADR 348 — Guidance leads, findings explain. → ADR (discharged)

- Q4 settled: let the user set aside the leading priority, optionally record why, and offer the next supported priority. This is a durable preference, not a refutation of the underlying observation or a change to clinical eligibility. Recorded in ADR 348 — Guidance leads, findings explain. → ADR (discharged)

- Q5 settled: keep a set-aside priority aside until its recommended action or seriousness meaningfully changes. Routine new data or a changed exact evidence fingerprint alone does not erase this preference. Recorded in ADR 348 — Guidance leads, findings explain. → ADR (discharged)

- Q6 settled: while following an active change, lead with that change and its current progress. Important worsening stays visible alongside it; it does not silently replace the active watch. Recorded in ADR 348 — Guidance leads, findings explain. → ADR (discharged)

- Q7 settled: history preserves a snapshot of what was known then and how the Trial ended. Updated evidence is separate from the original record. Apply the same honest historical account to the already-required Focus journey. Recorded in ADR 348 — Decisions retain their context and ending. → ADR (discharged)

- Q8 disposition: Connor challenged save-recovery design as over-engineering. Remove that question from the product frontier; use ordinary visible failure handling, with no dedicated automatic recovery capability. This is a scope reduction, not a claim that the user selected the offered recovery behavior. inline

- Q9 settled: once a Trial is ready to judge, let the user record a conclusion and finish it so they can choose the next change. This explicitly changes the current non-closing Keep behavior and active-watch admission, while preserving one active watch, maturity authority, and manual pump entry. Recorded in ADR 348 — Reviewing can finish a Trial. → ADR (discharged)

- Q10 settled: the first usable v2 release completes the full loop for settings and habits: one priority, a change, follow-up, and a saved conclusion. A guidance-only release that hands action and follow-up to v1 is insufficient. This milestone may span several ordinary reviewed PRs behind the preview route. Recorded in ADR 348 — A parallel v2 frontend with one Python data owner. → ADR (discharged)

### Risk contract

This contract uses the repository invariants and ordinary failure handling.
Connor rejected treating save recovery as a separate product-design project (Q8).

- **Must prevent:** secret or personal-data exposure; irreversible loss of authoritative data; silent incorrect success, including a failed save shown as saved; unsupported treatment advice or pump transmission implied by a recorded decision.
- **Must recover:** no new automatic-recovery capability is required.
- **Accepted failure:** a rare failed read or write may visibly stop the affected action and require a user retry. Preserve the current in-memory draft where it already exists; do not add an offline write queue, background retry engine, or crash-recovery subsystem.
- **Unsupported:** automated pump control, live vendor fetching in automated work, guaranteed operation while disconnected, and reconstructed historical facts that were never stored.
- **Evidence owed:** verify the selected guidance against backend eligibility and cited episodes; one active watch; Plan/actual pump-change distinction; adherence/outcome separation; set-aside persistence; ordinary failed actions never reported as successful; synthetic-only walkthroughs and v1/v2 coexistence.

Why: the advisory consequences require truthful state, while speculative recovery work does not serve the requested care-improvement journey.
Disposition: inline; governing plan contract, to be carried into any eventual implementation admission.

## Open questions

- Q11 pending: choose the leading visual hierarchy from the rendered Guided brief, Glucose first, and Change journal concepts. Parent recommends Guided brief; no default selection is recorded as approval.

- Validate the Overview / Explore / Changes / Day hypothesis against complete setting, habit, and Day investigation journeys.
- Specify the minimum snapshot and ending record that implements Q7 for a Trial and Focus, including unknown legacy facts, without building a general event archive.
- Distinguish retained #340 comparison rules from proposed v2 presentation and explicit changes to that work's history boundary.
- Review the proposed full-loop delivery sequence after the concrete journeys are rendered; its setting and habit preview increments together meet Q10, and cutover remains a separate explicit decision.
- Apply the recorded bounded risk contract to the selected implementation sequence; no build is admitted at this checkpoint.

## Spawned tasks

- Read-only guidance grounding: map existing ranking, behavioral levers, overlapping evidence, and episode links onto the operator's four recurring patterns. No production edits or new tracker tickets. Completed with source-cited findings; parent verified the ranking boundary, priority calculation, attribution examples, payload, and coverage. Folded into the active design.

- Read-only dismissal grounding completed: existing audit dismissal storage has an item ID, exact evidence fingerprint, and timestamp, but no reason or automatic return policy. Production findings do not consume it. The v2 guidance contract must own stable identity, preference consumption, optional reasons, and meaningful return; routine evidence refresh is insufficient.

- Read-only synthetic-coverage grounding completed. Individual analyzer states, Plan reconciliation, Trial views, and Focus invariants have reusable manufactured sources, but no continuous guided-priority or historical Focus walkthrough exists. Parent verified catalog composition and inspected rendered v1 Diagnose/Plan/Verify/Day against the generated showcase; findings are in the design.

- Read-only Trial-ending grounding completed. Current maturity, active selection, bounded review roster, and transient Keep behavior are separate; a mature Trial can still block Focus. Parent verified active detection and the pin-time guard. Q9 settles a new durable finish action; the implementation must reconcile those consumers around one backend verdict.

- UI Craft concept fan-out started after the empty-shell fidelity comparison passed. Three fresh bounded agents completed Guided brief, Glucose first, and Change journal HTML explorations. The parent rendered all six required states at desktop and narrow widths, walked primary prototype interactions, and verified the journal layout correction. The comparison and its limits are recorded in `mockups/harmonic-v2.exploration/REVIEW.md`. Q11 awaits direction selection. No production edits or visual lock are admitted.

## Remaining dispositions

- Product direction, synthetic walkthroughs, visual/interaction review, and final approval remain pending.
