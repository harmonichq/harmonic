# Cold desktop walkthroughs — Harmonic v2

Method: independent CLI workers (Sol medium A: 01a07986-63d7-77b2-8434-69ebb80c490f · B: 01a07986-583c-7c50-bfc5-300c26f33199 · C: 01a07986-5cab-7b40-a7d6-1a99768de144).

7 September 2026 UTC · #348 · baseline efabb5a7 · desktop, synthetic data.

Each persona chose interactions from actual screenshots and visible controls in its own persistent Chromium page. The coordinator relayed commands and returned the resulting DOM and screenshots before the next choice. Initial impressions were recorded before the user's specific navigation concerns were supplied. The same sessions then verified the repairs; that follow-up was no longer cold. These scores are simulated persona judgments, not human usability-study measurements.

Opus 5 at medium effort led the design repairs, using UI Craft, PRODUCT.md, DESIGN.md and CONTEXT.md. The coordinator accepted changes against the existing brief and verified the rendered result. Fable led the preceding design direction. Exact visual approval remains open.

## Flow ratings

1 = poor; 5 = excellent. Each cell is cold walkthrough → follow-up.

| Persona | Flow | Navigation | Evidence | Recovery |
|---|---:|---:|---:|---:|
| Jordan · first-time user | 4 → 5 | 3 → 4 | 4 → 4 | 3 → 5 |
| Alex · experienced analytical user | 4 → 4 | 3 → 4 | 4 → 5 | 4 → 5 |
| Sam · keyboard and recovery | 4 → 5 | 3 → 4 | 4 → 5 | 4 → 5 |

All three independently found Overview and Explore too similar. Jordan reproduced the full basal-lane exit problem: other findings were below the long night list and no visible parent led back. After repair, Jordan still calls the distinction visually subtle because both destinations retain the evidence canvas; the action pane versus findings roster is now sufficient for the tested workflow.

## Decisions and observed result

| Problem | Accepted repair | Verification |
|---|---|---|
| Overview / Explore overlap | Overview keeps the action or current progress beside the charts; Explore owns the roster and detailed evidence. | Ordinary first entry passed all three follow-ups. |
| Trapped in All basal slots | Persistent Findings parent, global Explore reset and Escape exit. | All three exits passed; 48 rendered cells remain. |
| Set aside silently changes subject | Keep the same subject, Restore, optional reason and next named ranked finding visible. | Both setting and habit paths passed at 1280×720 without scrolling; Restore worked. |
| Trial finish immediately replaces the subject | Open its completed record in Changes, with the conclusion and a Findings route onward. | Saved conclusion, ending comparison, timestamps and original context were visible; Changes reopened the same record. |
| Inspect nights from a finished Trial opened the next behavioral finding | Contextual route opens the Trial's original basal slot rather than the current ranked row. | Final fresh-load check passed for ready and finished Trials: cell 7 / 03:30–04:00, original June 1 read and June 18 viewed time, exact Day return, saved record intact. |
| Evidence / Day entry loses focus | Focus the relevant pane or selected slot; preserve the precise return target. | Changes → evidence → Day → exact selected night passed. |
| Questions-origin Day says Return to Explore | Name the originating question and return to Carb questions. | May 26 at 12:10 reopened on the same question and focused its Open May 26 action. |
| Escape inside Settings is inconsistent | Close the utility in one press and restore its launcher; retain the existing unsaved draft. | Fake unsaved email remained on reopening; No credentials saved remained true. |
| Ambiguous progress, capacity and retry labels | Name the failed save; show elapsed/required days and segments used accurately. | Draft and decision failures each recovered; ready Trial reads 15 days / 14 required; Plan reads 3 of 16 segments used. |

The failed Inspect nights route was discovered during follow-up, returned to the same Opus designer, and corrected before the final route check. The final correction did not change the already-passed Overview, set-aside, utilities or chart modules.

## Interaction coverage

| Area | Observed coverage |
|---|---|
| Destinations | Overview, Explore, Changes, Day; initial action versus evidence browser; global and contextual navigation. |
| Basal evidence | Full 48-slot lane, source verdicts, 03:00 and 03:30 slots, multiple nights, parent/reset/Escape, exact Day return and focus. |
| Event comparison | Matched, Nearly matched and eligible other cohorts, support limitations, selected occurrence, previous/next, Episode/Day; separate Late bolus story also exercised. |
| Priority decisions | Optional aside reason, visible acknowledgment and next concern, set-aside collection, Restore for setting and habit. |
| Setting change | Stage, capacity/schedule, failed draft save and retry, failed decision save and retry, recorded decision, detected pump match, maturing and ready Trial, conclusion, saved record, original evidence and current findings. |
| Focus | Start, pinned context, five-window follow-up, conclusion, resolution, saved record. July 4 pump-change preemption showed one active Trial and ended the Focus. The coordinator additionally opened the dropped Focus record and verified the ending reason and What was known. |
| Day | Contextual dates, previous/next recorded day, week/month, month navigation, selected event and exact return. |
| Utilities | Carb questions open, No, Undo, counts and focus; empty/negative/valid carb entry and failed-save Retry; Settings open/Escape/draft retention; Pump settings, Guide and Glossary. |
| Read recovery | A clock-driven analysis read consumed the failure toggle; Explore disclosed the last successful read and retained the recorded decision. Retry recovered. |

The final Trial-route batch completed with zero FAIL lines and no browser console errors. The six edited JavaScript modules passed node --check; git diff --check passed. The synthetic generator check completed with “harmonic-v2 design: current.” Production modules, generated inputs and dosing rules were unchanged.

## Recommendations not adopted

Approved tiers such as Next in line stay. Nearly matched is established cohort language, not a new term. No chart cohort, thin/held basal slot or source verdict was hidden. No persistence subsystem, extra Start Focus confirmation, clinical ranking rule, automatic draft discard or dirty-form prompt was added.

Moving cohort controls into the shared chart legend remains deferred. The existing controls passed cohort selection and occurrence checks; this repair preserves the shipped comparison renderer. The standalone Late bolus source still shares its Overview/Explore frame because that isolated story supplies neither the full roster nor an action.

The detector's two Inter-related warnings were false positives against the approved design system. They do not justify a font change.

## Limits and execution notes

- Synthetic source=journey was the full-workflow surface; the private-data preview was not used. Decisions remain in page memory. The capture supports alternative first changes, not a second sequential change.
- Desktop only. No mobile design, real screen-reader, accessibility-tree, computed-contrast, clinical-validity or refresh-persistence claim.
- Settings Clear with saved credentials was unverified because the tested state had none. No credential save, connect or live fetch was attempted.
- Early cold-pass selector errors targeted hidden responsive copies or nonexistent link roles; visible controls worked. Native DOM queries were corrected to use geometry filtering rather than Playwright's :visible syntax. These were transport mistakes, not product findings.
- In follow-up, the coordinator prevented a known unavailable second-change click and explicitly selected the next habit after set aside. The remaining Focus commands were the reviewer's choices. One malformed worker response was decoded from its valid leading JSON while preserving the original raw response.
- Actual screenshots and raw command logs are held in the task's local cold-qa scratch directory. Selected synthetic before/after renders are included alongside this report.

## Provenance

- A / Jordan: 01a07986-63d7-77b2-8434-69ebb80c490f.
- B / Alex: 01a07986-583c-7c50-bfc5-300c26f33199.
- C / Sam: 01a07986-5cab-7b40-a7d6-1a99768de144.
- Opus designer: 3f3d9da4-9513-460d-8706-610b6110f6f0, claude-opus-5, medium.
- Baseline entry-markup SHA-256: e2e70aa514c1a0b94e67f5079c3c7514917782d00dd7a529372eb73bcc58e00d. The entry markup was unchanged by this repair.

## Synthetic render evidence

All captures use the generated shared-history story at 1280×720. These are screenshots of manufactured evidence, not patient-data fixtures.

| State | Render |
|---|---|
| Baseline Overview | [Before](cold-qa/before-overview.png) |
| Repaired Overview | [After](cold-qa/after-overview.png) |
| Repaired Explore | [After](cold-qa/after-explore.png) |
| Full basal lane and parent | [After](cold-qa/after-all-basal-slots.png) |
| Finished Trial record | [After](cold-qa/after-trial-record.png) |
| Trial's original basal evidence | [After](cold-qa/after-trial-nights.png) |
