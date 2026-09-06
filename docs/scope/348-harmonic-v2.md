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

## Open questions

- Q2: when a recurring problem is visible but no specific change has sufficient support, should the lead experience guide investigation or recommend waiting for more evidence?
- Validate the Overview / Explore / Changes / Day hypothesis against complete setting, habit, and Day investigation journeys.
- Settle durable review/history behavior, including a Focus that is resolved or preempted and a Trial no longer in the active roster.
- Distinguish retained #340 comparison rules from proposed v2 presentation and explicit changes to that work's history boundary.
- Select the first useful increment only after all journeys have been mapped; retain full-product coverage in the plan.
- Settle the bounded risk contract before any implementation admission. No build is admitted at this checkpoint.

## Spawned tasks

- Read-only guidance grounding: map existing ranking, behavioral levers, overlapping evidence, and episode links onto the operator's four recurring patterns. No production edits or new tracker tickets. Result pending.

## Remaining dispositions

- Product direction, synthetic walkthroughs, visual/interaction review, and final approval remain pending.
