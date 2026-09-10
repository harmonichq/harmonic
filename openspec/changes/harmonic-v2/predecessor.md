# Existing jobs carried into v2

This is the initial investigation's historical inventory. Its pending desktop
journey and utility notes are superseded by the completed REVIEW.md rounds,
COLD-WALKTHROUGHS.md and OPUS-QA-REPAIRS.md adopted in design.md. The current
checked sequence is tasks.md; this inventory is not a second backlog.

This is a bounded planning inventory, not a behavior lock or a retirement
sanction. V2 is a separately requested frontend; v1 remains shipped. The
selected prototype must not become an accidental specification of everything
Harmonic will retain. The cutover rule in [design.md](design.md#proposed-delivery-sequence)
governs the eventual complete inventory and any proposed retirement.

Current source locations and routes are collected in [evidence.md](evidence.md).
The cockpit behavior ledger and existing browser drivers are the source for the
interaction obligations below. A source read establishes an existing behavior's
contract; it does not establish that the new prototype performs it.

| Existing job | Current source or behavior contract | Selected prototype checkpoint | Proof still needed before v1 retirement |
| --- | --- | --- | --- |
| Read a finding in its evidence context | `mockups/finding-evidence-routing.behavior.md`; Diagnose case-file, clock and event projections | Glucose-first comparison and occurrence investigation under development | All settings and behavioral families, held and historical findings, source-owned windows and correct return context |
| Compare matching events with eligible alternatives | `frontend/diagnose-event-comparison.js`; event-comparison behavior replay | Shipped renderer and generated cohort membership; matched, nearly matched and other opportunities remain distinct | Full filter/window/selection lifecycle and support states across the relevant families |
| Inspect a setting's supporting observations | Basal night, carb-ratio block and correction-factor rest-window evidence producers | Basal setting walkthrough is the representative path | Carb ratio and correction factor retain their own support, evidence and delivery paths |
| Review and enter a complete Plan | `frontend/plan.js`; `frontend/plan-first-match.browser.mjs` | Shared schedule construction and reconciliation in the setting walkthrough | Restored drafts, one-variable edits, all supported setting paths and pump-profile limitations |
| Follow a detected setting change | `frontend/verify-660-story-behavior.replay.mjs`; Trial review producer | Actual generated maturing/ready evidence; proposed finish and context held in page memory | Backend finish/admission, detected changes without a Plan, supersession, reversal and legacy history |
| Follow a behavioral Focus | Focus API and watched-change producer; outcomes trend tests | Continuous habit walkthrough is pending | Supported-action selection, adherence/outcome distinction, no-opportunity periods, resolution and setting-change preemption |
| Open a particular day directly | `frontend/tab-routing.js`; `frontend/day-surface.browser.mjs` | Current concept has a contextual full-day hero | Direct entry, date bounds/navigation, no invented prior concern, and complete desktop evidence tracks |
| Investigate chronology and reasoning | `frontend/index.html` Day surface; `frontend/day-chart.js` | Selected occurrence and its served steps | Chronological Episode Log, relevant source context, reasoning disclosures, highlights and selected-day fetch lifecycle |
| Move between days with data | Day navigator in `frontend/index.html`; Day browser driver | Not represented by the comparison's occurrence selector | Previous/next bounds, week/month selection, cold-route clamping and safe rapid navigation |
| Record or correct missing carb information | `mockups/cockpit-shell.behavior.md` S4/S5/S8 | Utility placement remains a design task | Log carbs, Carb questions, the existing prompts and counts; no invented pump-sourced carb stream |
| Reach settings and product explanations | Cockpit S2/S5; `frontend/tab-routing.js` | Utility access remains a design task | App settings, detected pump settings, Guide and Glossary with established accessible labels |
| Recover from an ordinary failed read | Cockpit S11; current evidence replays | Prototype load Retry exists | Failed replacement after a good result, unchanged subject ownership and honest stale-result labeling |
| Use the workstation by keyboard and at narrow width | Cockpit S6/S7/S9; occurrence roster keyboard behavior | Narrow figure switch and member sheet verified in round 3b | Each complete journey, visible focus, labels, escape/return focus and reachable controls |

No row here is marked retired. Missing prototype coverage is recorded as missing;
it is neither a sanctioned omission from v2 nor evidence that v1 lost the job.
The original comparison and selected direction remain in
[the rendered review](../../../mockups/harmonic-v2.exploration/REVIEW.md).


## Basal exploration clarification

Connor confirmed that basal slots asserting a change must remain discoverable
in Explore, with the same graphs available in the current app. (Explore collapsed
into Diagnose under ADR 397; the retention requirement is unchanged.) The single
leading priority does not remove access to those slots, their supporting
observations or contextual Day inspection. This is a retention requirement,
not a request for a separate manufactured increase example. The backend's
`asserts_move` verdict continues to own action eligibility.


## Historical investigation-name question — superseded by ADR 397

ADR 397 closes this question: v2 uses Diagnose, Changes and Day; Diagnose is
the default and retains the shipped Findings rail. The following account records
the September 6 state and is not current navigation authority.

The investigation job is established: findings, basal slots, comparisons and
individual episodes remain reachable beyond the single leading priority.
“Explore” is a proposed destination name, not an approved rename of Diagnose.
On September 6 Connor asked whether that distinction had been settled. The
coordinator recommended retaining Diagnose; no naming decision was recorded.
Do not read the prototype's navigation label as vocabulary approval.

### Basal views to retain

The shipped source inventory identifies these connected views:

- `buildSlotLane` in `frontend/diagnose-workstation-chart.js` supplies the
  48-cell basal lane; `renderLane` and `pickCell` in
  `frontend/diagnose-workstation.js` keep each slot selectable independently
  of the priority queue.
- When a finding case has clock alignment, `renderCaseClock` shows its 12
  grouped buckets and counts; `renderCaseHead` links the peak bucket into an
  existing basal slot. This is a route from finding investigation into basal,
  not a second clock chart to invent for a basal setting row. The grouped
  buckets are distinct from the 48 basal slots.
- `renderSlotLevel` preserves current, estimate, recommendation, interval,
  support, hold and staging state, plus the supporting-night distribution and
  roster. The backend continues to own every action verdict.
- `renderSlotNightSelection` retains delivered and programmed rates, the
  selected night's glucose, entry/exit and Open Day. The source loader uses
  `/api/diagnose/basal-night-evidence?slot=` and the supplied Day loader.

At this review, the prototype's setting journey has a two-row slot selector
and a reused chart option. That demonstrates the representative setting
journey, but does not prove retention of the complete lane or
supporting-night views, including links into them from finding investigation. The next desktop pass must close those specific gaps.
No extra increase scenario is requested.
