# Issue 93 — Diagnose drill-down and trace lane

Fresh exploratory QA pass against the live Diagnose surface. The server was
backed by an isolated byte-for-byte copy of the owner's real snapshot. No
personal values,
dates, times, counts, settings, recommendations, payloads, credentials, paths,
or screenshots are recorded here. No product data was entered, staged, saved,
fetched, or mutated; the token Save was harness setup only.

Day-centered navigation, Day episode-row selection, and Day history stories
were discarded as out of scope. The stories below stay inside Diagnose and its
finding viewer.

## Stories

### 1. Queue row to setting case file

- Start: Diagnose queue.
- Actions: Click a visible setting row; inspect the case file; use its local
  breadcrumb to return to the queue.
- Observation: The row opens an inline case file with a slot heading, current
  state, estimate interval, evidence language, and a staging affordance that was
  not activated. The breadcrumb returns to the queue and restores context.
- Expected: A queue item should open a focused case file and return without
  losing the Diagnose context.
- Result: Pass.
- UI section: Diagnose queue and basal case file.

### 2. Finding roster and evidence table

- Start: Diagnose queue.
- Actions: Click a behavioral finding; inspect the conclusion, evidence summary,
  outcome breakdown, and Occurrences roster.
- Observation: The viewer presents the finding summary first, then its evidence
  breakdown and occurrence roster. Outcome and evidence tier are presented as
  separate concepts. The roster exposes an occurrence as its own control.
- Expected: Evidence should disclose from conclusion to aggregate support to
  concrete occurrences without collapsing tier into outcome.
- Result: Pass.
- UI section: Diagnose finding viewer.

### 3. First occurrence trace selection

- Start: A Diagnose finding viewer with an occurrence roster.
- Actions: Click the occurrence row; inspect the expanded trace and evidence
  facts.
- Observation: The row expands in place into a server-owned trace with evidence
  markers and a clear active occurrence heading. The viewer remains inside
  Diagnose.
- Expected: An occurrence should be a real trace target, not a decorative row
  or an external-only link.
- Result: Pass.
- UI section: Diagnose occurrence trace.

### 4. Second occurrence trace selection

- Start: Return from the first trace to the Diagnose Findings list and open a
  different behavioral finding.
- Actions: Select its occurrence row and compare the expanded trace with the
  first finding.
- Observation: The second finding opens its own occurrence and trace facts. The
  first finding's trace is not left expanded underneath the second viewer.
- Expected: Changing findings should replace the active trace context cleanly.
- Result: Pass.
- UI section: Diagnose finding viewer and occurrence roster.

### 5. Evidence-row changes and cross-pane links

- Start: A Diagnose finding viewer with “View slot” and “View segment” links.
- Actions: Activate the slot link, use the slot breadcrumb, reopen the finding,
  then activate the segment link.
- Observation: The slot link opens the related basal case file. The breadcrumb
  returns to the selected finding. The segment link opens the related I:C case
  file. Both links stay within Diagnose and change the evidence context rather
  than staging a change.
- Expected: Evidence rows should correspond to the correct Diagnose case file
  and provide a reversible inspection path.
- Result: Pass.
- UI section: Finding evidence rows and Diagnose case files.

### 6. Breadcrumb and back continuity

- Start: Diagnose Findings list.
- Actions: Open a setting case file, return with its breadcrumb, open a finding,
  return with the Findings breadcrumb, open an occurrence trace, and return to
  the finding.
- Observation: Each local back path returns to its parent Diagnose surface. The
  selected finding remains the active context after returning from its trace.
- Expected: Back should unwind the Diagnose drill-down lane instead of resetting
  the queue or losing the selected finding.
- Result: Pass.
- UI section: Diagnose navigation and finding viewer.

### 7. Finding-window history/current transitions

- Start: Diagnose Findings list.
- Actions: Change the Diagnose window control from the default period to another
  available period, open a finding, return to the list, and switch back to the
  current default period.
- Observation: The finding rows and their evidence context refresh for the
  selected window. Returning to the current period restores the current queue
  without carrying the prior window's selected trace into it.
- Expected: Historical and current Diagnose views should be explicit and should
  not mix evidence from different windows.
- Result: Pass for the exercised windows.
- UI section: Diagnose window controls and finding viewer.

### 8. Selection continuity and safe empty recovery

- Start: Diagnose basal-slot rail.
- Actions: Select an insufficient-evidence slot, return to Findings, select a
  no-data slot, inspect its empty detail, then return to the queue.
- Observation: The selected slot changes the case-file context each time. The
  empty detail shows no estimate and no staged action, explains that evidence is
  absent, and returns to the queue without a write.
- Expected: Selection changes should be visible, and an empty or thin evidence
  state should be legible, safe, and recoverable without inventing a direction.
- Result: Pass functionally; copy defect recorded below.
- UI section: Diagnose basal-slot rail and case file.

## Bug

### BUG-93-DT-001 — retired “clean nights” wording remains in Diagnose drill-down

- Start: Diagnose Findings list.
- Exact actions: Select an insufficient-evidence basal slot and read the case
  file. Return to the queue, select a no-data basal slot, and read that case
  file. Repeat both selections in a fresh Diagnose browser pass.
- Observation: Both Diagnose case files use “clean nights” in evidence and
  safety copy, including the empty state. The same wording appeared in the
  fresh restored-server pass, and then appeared again when both states were
  revisited.
- Expected user-facing behavior: Use “nights of steady data” everywhere on
  this surface. An empty state should say that no nights of steady data are
  available, without calling absent evidence clean.
- Reproducibility: Reproduced twice across both Diagnose slot states during the
  fresh restored-server pass.
- UI section: Diagnose basal-slot case file.
- Priority: P2.
- Stable fingerprint: A Diagnose basal-slot case file contains the literal
  phrase “clean nights” in its evidence or safety explanation.
- Interpretation: This is a vocabulary and trust defect, not an analyzer
  finding. The phrase conflicts with the locked user-copy rule and makes an
  empty or thin evidence state sound like a positive cleanliness claim.

## YOLO feature vote

### Vote: persistent Diagnose trace handoff

Desired capability: Keep the selected occurrence, evidence tier, and active
Diagnose case file visibly linked while moving between the Findings list,
occurrence trace, basal case file, and I:C case file.

Why: The current Diagnose links work, but the user must infer correspondence
from the newly opened case file. A compact handoff rail would make the trace
relationship auditable without exposing raw internals by default.

User-visible interaction story: From a Diagnose occurrence, the user opens a
related case file and sees a quiet “Trace from Diagnose” rail naming the active
finding and occurrence. Selecting another evidence row updates the rail, and
returning to Findings keeps the original finding selected until the user
explicitly changes it.
