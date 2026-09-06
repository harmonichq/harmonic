# Harmonic v2 journey proposal

This is a reviewable product proposal under #348, not a shipped walkthrough or
an execution lock. The decisions and risk contract in `design.md` govern it.
The manufactured cases below are inputs for the subsequent walkthrough; no
end-to-end v2 pass is claimed before that surface exists.

## The complete loop

Open Harmonic → understand the next useful step → inspect the relevant evidence
→ choose one change or investigate an uncertainty → follow what actually happens
→ record the conclusion → revisit the decision and its ending.

During follow-up, the current change and its progress lead. When that work is
finished, the next supported priority can take its place. The same loop must
serve settings and habits; their action and evidence semantics remain distinct.

## Proposed destinations

| Destination | The user's question | Content and onward path |
| --- | --- | --- |
| Overview | What is most worth my attention now? | One lead concern or the active change, current progress and freshness, a concise reason, and a clear next action. Evidence starts here; detailed investigation opens the same subject in Explore |
| Explore | Where does this show up, and what supports changing it? | The connected glucose problem, representative episode, recurring occurrences, supporting settings or behavioral evidence, and explicit uncertainty. Other concerns remain reachable without competing as parallel advice |
| Changes | What am I trying, how is it going, and how did it end? | The current Plan or Focus; manual-entry and reconciliation where relevant; Trial or Focus follow-up; a recorded conclusion; past decisions with original and ending snapshots |
| Day | What happened around this particular moment? | The existing chronological glucose and treatment evidence, selected occurrence and reasoning, plus an explicit route back to the same concern and selection |

App settings remain a utility accessible from every destination. Detected pump
settings are inspectable from Changes, clearly distinct from proposed settings
in Plan. They do not need another top-level destination. Log carbs remains
reachable at the point an existing prompt asks for that information and through
a global utility.

These names remain a hypothesis until the walkthrough is reviewed. V2 Explore
would be a different destination from the current glossary's Diagnose/Explore
mode; its name must be recorded as an explicit terminology change on approval,
without rewriting v1's still-shipped navigation as if it had changed.

## 1. A supported setting change

Manufactured starting material: the QA `setting-recommendation` case and the
existing Plan reconciliation tests. Later walks include the other setting
families and captured block-I:C path, whose active/review split is documented
in `design.md`.

1. Overview identifies the recurring concern and the eligible setting change.
   The explanation names why the concern leads, using the backend's evidence.
2. Explore opens that same subject. Show its current setting, eligible action,
   reason and uncertainty together. Representative episodes lead to Day;
   aggregated observations do not masquerade as one event.
3. Choosing the change opens Changes with one tuning variable in Plan. Review
   the complete pump-entry schedule and the distinction between the detected
   schedule and the proposed schedule.
4. Saving the draft preserves consideration. Recording the decision preserves
   what was known then. The wearer enters the setting on the pump manually.
5. Pending pump data is shown as pending. A mismatch shows what differs. A
   detected match is reported only by the existing reconciliation logic.
6. Follow the actual detected Trial. Its current progress leads Overview;
   Changes shows before/after evidence, available days, gaps and limits.
7. Once the backend says it is ready to judge, record a conclusion and finish.
   Reverting still requires Plan and a real pump change. The final record keeps
   original context, the observed change, and the ending distinct.
8. Returning later opens that record even after the live Trial roster moves on.
   A current recalculation is labeled separately from what was known then.

A setting changed outside Harmonic enters at detection. It receives no invented
Plan or earlier decision snapshot. Show which context was available when
Harmonic first observed it.

## 2. A behavioral change

Manufactured starting material: behavioral QA cases and existing Focus API,
adherence and preemption tests. Their separate coverage does not yet prove this
continuous journey.

1. Overview identifies the recurring problem and one eligible behavioral action.
   Different detectors that illuminate the same problem remain distinct claims.
2. Explore shows the relevant sequence and occurrences. An inferred over-treated
   low is not described as an observed treatment; a user's contrary answer stays
   a refutation. Observation-only advice does not acquire a dose recommendation.
3. Choosing the behavior opens Changes and starts a Focus through the existing
   backend eligibility and one-active-watch authority. Explain what the user
   intends to do and what evidence can observe it.
4. Follow the Focus. Adherence answers whether the behavior changed at observed
   opportunities. Outcomes answer what happened to glucose. Show them separately;
   neither an empty denominator nor missing observations become success.
5. Resolution records the ending and its final available assessment. A detected
   setting Trial preempts the Focus and records that reason; it does not quietly
   pause it for automatic resumption.
6. History preserves the original decision context and ending even though the
   active Focus view is gone.

## 3. A recurring concern without a supported action

Manufactured starting material: `ic-collecting`, `ic-held`, insufficient basal
cases, and relevant behavioral evidence with its real qualifiers.

1. Lead with a guided look at the concern, explicitly saying a specific change
   is not yet supported.
2. Open a representative episode and the other supporting occurrences. Identify
   the observed fact, the plausible interpretation, and what the data cannot say.
3. Offer a useful next investigative step grounded in those facts. An existing
   carb-log prompt can request missing information when it actually applies.
   Do not fabricate a treatment suggestion merely to provide a button.
4. End with a clearer account of what to watch or with the user's set-aside
   choice. Evidence can become eligible later only through the engine's rules.

## 4. Choosing not to work on the lead concern

1. Set it aside, optionally recording why.
2. Offer the next supported priority, or explain that none remains.
3. Keep the skipped concern and its evidence accessible. Routine new data does
   not erase the preference.
4. When its recommended action or seriousness meaningfully changes, explain the
   change when it returns. A numerical implementation of this rule remains an
   evidence-policy design task; a changed raw fingerprint is insufficient.

## 5. Investigating a particular day

1. Open Day directly or through a real occurrence. A contextual entry carries
   its day, moment, evidence subject and relevant lever when one exists.
2. Inspect the glucose trace and episode reasoning. Time context stays visible;
   interaction does not convert an inferred step into an observation.
3. Return to the prior concern with its selected occurrence and window intact.
   Direct Day entry does not invent a prior concern or start a watched change.

## 6. Routine return and ordinary failures

| Arrival state | What the user sees and can do |
| --- | --- |
| Active change | Current change and progress lead; meaningful worsening remains visible alongside it |
| Saved draft | Resume the draft with current evidence and detected settings available before deciding |
| Recorded intent awaiting pump evidence | Reconciliation is the next step; there is no claim that Harmonic sent a setting |
| Ready to judge | Review the available result, record a conclusion, and finish under ADR 348's finish rule |
| Quiet | Explain that no supported priority currently needs action; retain Day and history access |
| Thin or missing data | Identify what cannot yet be concluded; use guided investigation when there is a real recurring concern |
| Failed read or save | Show ordinary failure and permit retry; never label old evidence as a new result or a failed save as saved |
| Past work | Show the original snapshot and ending; missing legacy facts remain unavailable |

The quiet, thin, pending and failed states must be walked separately. Their
visual similarity must never become a shared claim that nothing needs attention.

## Shared interface proposal

- **Guidance read:** one backend-owned result selects the next step from current
  evidence, active-change state and recorded choices. It includes the subject,
  action or investigation disposition, reason, evidence window/revision, cited
  occurrences and available onward actions. Selection belongs here, not in
  separate Overview and Explore ranking implementations.
- **Evidence detail:** reuse existing source-owned evidence and chart producers.
  The caller supplies the selected subject/window; the result keeps membership,
  denominators, comparison bounds and availability together. Rendering does not
  reconstruct clinical eligibility or causal links.
- **Decision and ending:** extend the existing Plan/Focus actions only where
  their contemporaneous snapshot is needed. Add the Trial-finish action with
  one backend authority for admission and history. Persist the bounded summary
  and existing identities, not a parallel clinical datastore.
- **Journey navigation:** one route-state owner retains the selected concern,
  window and occurrence across Explore, Changes and Day. Detail fetching follows
  that selection; late responses cannot move the user to a different subject.

These are capability interfaces for the selected journeys. Exact endpoint and
storage shapes follow the grounded identity/admission design; v1 continues to
use the same API/database, and no second analysis engine is proposed.

## Walkthrough completion

For each journey, render its representative and limiting states, perform its
transitions, and review the result at desktop and narrow widths. Reuse the
manufactured sources listed in `design.md`; any additional committed fixture
must have a generator and drift check. The v2 walkthrough is complete only when
its observed behavior and unresolved gaps are recorded. This document alone is
not that evidence and is not a visual lock.
