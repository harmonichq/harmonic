# Fable design partnership — round 1

Requested by Connor; Claude Fable 5.1, high effort, via the orchestrate
Claude worker adapter. Read-only review, completed 2026-09-06. The same
session continues as a design partner for this redesign. This is design
feedback, not a visual lock or a final plan-review verdict.

The final pass inspected all eight supplied synthetic screenshots. An earlier
source-only pass could not read the external screenshot paths; temporary
ignored input copies inside the worktree resolved that limitation. The parent
verified the comparison schema, support and Day-scale corrections.

## Critique — Glucose first, round one (#348), final

**Evidence basis.** Inspected all eight supplied synthetic images: `glucose-investigate-desktop`, `glucose-active-desktop`, `glucose-investigate-narrow-final`, `glucose-ready-narrow-final`, `glucose-finished-checked`, `v1-diagnose`, `guided-evidence-desktop`, `journal-active-desktop-final`. Source read: the concept, `_shell.js`, REVIEW.md, `frontend/diagnose-event-comparison.js`, `diagnose-workstation.js` roster/selection, `finding_case_file.py::_event`, `evidence_population.py`, `event_comparison.project_cohort`. The code graph was not consulted; the named files answered the structural questions.

### What the render gets wrong (verified)

* The desktop investigate view is a document. At 1280×720 the episode chart owns the viewport and the moment strip sits exactly at the fold; nothing about the next step is visible without scrolling. `navigate()` resets `main.scrollTop` on every move, so each state is a new page rather than a changed region.
* The chart spends most of its width on nothing. The captured window runs 11:30–22:35 and the synthetic trace is flat at 120 from 13:00 on, so the one meaningful hour occupies the left tenth of the stage.
* The user's valued comparison is absent. The occurrence buttons list only the two flagged episodes; the six eligible meals exist as text ("2 of 6 meals flagged"), nearly matched events have no representation, and no aggregate is drawn.
* Narrow spends the first 470px of a 624px viewport on chrome, the mock bar and the lead. The glucose appears as a 40px sliver above the footer.
* "Day" re-renders the same episode chart under a date heading. The Trial toggle is labelled "Comparison", which now collides with the comparison the user named.
* v1 (`v1-diagnose.png`) already had the workstation frame this direction needs: a window strip, a stage card, a findings rail and a watching dock, all fixed, only the rail body scrolling. The concept regressed from that frame to a column.

### What to retain

The lead sentence with its state tag, the observed/inferred moment strip, the copy that refuses to promote late-bolus advice, the inline set-aside form, the honest history record with "Not recorded" rows, and the Trial progress line. The `guided-evidence` concept's "Occurrence 2 of 2" position line and the journal's collapsed "What remains" disclosure are worth borrowing.

### Contract facts the arrangement must honour

The shipped renderer requires `diagnose-finding-case-file-v1` with `matched` / `nearly_matched` / `comparison` cohorts. The older synthetic `project.mjs` emits `finding-case-file-event-capture-v1` with fired / near_rule / neutral verdicts; it is not a drop-in input and renaming it would misrepresent the contract. For a same-population lever, matched is the `fired` verdict, nearly matched is `near_miss` minus matched, and the comparator is the policy's eligible population minus both. Cross-population levers use a distinct comparison population and per-cohort anchors ("Detected rise onset" for matched, "Completed carb bolus" for the comparator). `not_comparable` is `len(roster) − matched − near`, a served residue to print, never a figure the UI may invert into comparator membership. Support is per cohort and per point. `project_cohort` defaults `include_withheld_episodes=False` and `_event` does not opt in, so a withheld cohort arrives without raw episodes; the renderer can draw supplied episodes, but the producer does not deliver them today. Member inspection stays available through selection detail (`comparison_cohort`, markers, `day_target.date`). The fixed glucose scale invariant belongs to the comparison field only; Day keeps its own scale so a day's extremes stay visible.

### Recommended arrangement (proposal)

```
┌ chrome bar ────────────────────────────────────────────────────────────────┐
├ concern bar · fixed ───────────────────────────────────────────────────────┤
│ Guided investigation · thin evidence                     [Set aside]      │
│ Glucose was rising when the bolus arrived     [Compare occurrences →]     │
│ 2 of 6 meals flagged · Apr 30–May 30, 2024 · a specific change is not supported │
├ cohort rail · scrolls ┬ stage · fixed ─────────────────┬ reading · scrolls ┤
│ Matched  (served n)   │ Comparison › May 24 12:05 › Day│ Moment 1 of 3     │
│  ▸ members…           │                                │ Inferred · Rising │
│ Nearly matched (n)    │  event-aligned cohort medians  │ at bolus …        │
│  ▸ members…           │  + spread + selected trace     │ Known / missing   │
│ Other meal opportunities (n) · support state           │ Open in Day →     │
│ n not comparable      │ anchor: served label(s)        │                   │
├ dock floor: advisory · utilities ──────────────────────────────────────────┤
```

Counts above reuse the render's own "2 of 6"; the rest are labels, not values. Two regions scroll independently, the rail and the reading pane; the concern bar and stage never move, and the document never scrolls. Cohort headers are sticky inside the rail, and selecting a member scrolls its row into view so position is never lost.

**Stage modes and renderer roles.** The stage is one element with three modes and a crumb. *Comparison* uses the shipped adapter and is the entry view for a behavioral concern; it draws the aggregate and, on selection, the member's focus trace. *Episode* keeps the scenario renderer with the numbered moments for the selected member; that renderer serves the guided look and is retained, with its window narrowed toward the anchor (a tuning question for the prototype). *Day* is the full-day chart with its own scale and the anchor minute marked. Each mode keeps its own axis; sharing the stage is presentation, not one renderer.

**The route and its return.** Arrival shows the aggregate with no selection. Choosing a rail member sets `occ`; the stage dims other cohorts and overlays the trace, the rail shows "k of n ↑↓" within the cohort, and the reading pane switches to that member's moments. Episode and Day are crumb segments on the same case file and the same id. Returning by crumb or Escape restores the prior mode with the member still selected. The concern is the case-file key, so no route drops it.

**One priority with rich evidence.** The case file is finding-keyed, so every cohort is evidence for the leading concern; no second concern gets a chart. The next supported priority appears in the concern bar only after set-aside.

**Thin, limited, near miss.** The bar reads "Guided investigation" for a thin concern. Each rail cohort prints its served support state; a withheld aggregate draws no median and says so, and its members remain selectable individually. Nearly matched stays dashed, listed second, and carries no action copy. The residue count prints under the cohorts.

**Trial.** The concern bar becomes the change bar (detected change, days, readiness, and a served worsening chip when present). The stage defaults to the before/after read with its existing semantics; the rail lists Before / Trial periods and available days; the finish form lives in the reading pane. Rename the toggle "Before / Trial". The event comparison stays reachable through Explore in the same frame, with the bar still leading with the Trial and the shipped refusal line.

**Focus.** The bar names the pinned habit and shows adherence and outcome as two separate served reads, never a before/after. The stage shows those reads; the lever's event comparison remains the Explore evidence. No new chart is proposed here.

**Narrow (390×624).** The concern bar stays fixed at two lines (state tag + title, then the meta line). A segmented control beneath it switches bounded views: Evidence, Cohorts, Reading. Evidence gives the stage the remaining height; Cohorts is the rail as a list; Reading holds moments, known/missing and, in the ready state, the conclusion form. A fixed action bar above the footer carries Set aside and the primary action (Compare, Open in Day, or Record conclusion). Selection persists across views. The mock bar is design furniture and should be excluded from the narrow budget.

### Suggestions, ranked

1. Make the shipped event comparison the entry stage for a behavioral concern, fed by a case file generated through the current Python producer with its `--check` gate.
2. Build the cohort rail from `projection.cohorts` and `counts` verbatim; member selection is a case-file `occ`.
3. Fix the frame (bar, stage, rail, reading pane) with two independent scroll regions and a crumb.
4. Keep the episode renderer as the guided-look mode; do not delete it.
5. Rename the Trial toggle and give Trial and Focus their own stage reads.

### Smallest next revision

Generate a `diagnose-finding-case-file-v1` synthetic case file through the Python producer under the existing drift gate, mount `renderEventSurface` as the investigate stage inside the fixed frame, wire the rail to selection and the crumb to Episode and Day, and render investigate at 1280×720 and 390×624. That one change tests suggestion 1 and the arrangement together.
