# Issue 93 — Keyboard and assistive interaction ledger

Pass type: cold exploratory QA, keyboard and assistive interaction lane

Surface: `http://127.0.0.1:8766/#diagnose`
Data boundary: Diagnose was loaded with the authorized synthetic non-secret token. No personal values, dates, times, settings, recommendations, payloads, database details, credentials, or screenshots were recorded.

## Interaction stories

1. **Synthetic setup and return to Diagnose — clean path.** I opened Settings by direct navigation, entered the authorized synthetic token in the visible token field, tabbed to Save, and pressed Enter. I then navigated to Diagnose. The token warning was gone and the Diagnose chart, Sift control, findings list, window controls, and trial rail were present.

2. **Shell focus order — clean path.** From the loaded Diagnose page, repeated Tab moved through the header in its left-to-right spatial order, then into the Diagnose window controls. Focus remained visibly indicated on the active control.

3. **Window control activation — clean path.** Tab reached the window choices in their visible left-to-right order. Tab moved from Overnight to Morning, and Enter activated Morning while staying on Diagnose. ArrowRight while Overnight was focused did not move focus to Morning; the neighboring choices remained individually tab-reachable.

4. **Sift open, arrow movement, Space, and Escape — clean path.** I tabbed to Filter and pressed Enter. The Sift menu opened with Highs focused. ArrowDown moved focus to Lows, Space activated that choice, and Escape closed Sift and returned focus to Filter. The interaction followed the visible vertical order of the Sift choices.

5. **Finding row with Enter — drill path.** From the findings list, I tabbed through the chart trace controls to the first finding row and pressed Enter. The detail surface opened in place with a breadcrumb, evidence summary, Align choices, trace links, verdict choices, and an Occurrences list.

6. **Finding row with Space — drill path.** In a separate fresh browser session, the same first finding row opened its detail surface when activated with Space. The result was the same detail view, confirming both Enter and Space activation for a finding row.

7. **Evidence and trace list traversal — clean path.** In finding detail, Tab reached View slot, View segment, the three verdict choices, the evidence verdict key, and the Occurrences row. Enter on the Occurrences row activated the occurrence path while remaining on the Diagnose hash and moved the active element to the document body.

8. **Finding back navigation — drill/back path.** From finding detail, Tab reached View slot and Shift+Tab returned to the Findings breadcrumb. Enter returned to the findings list. The list was visible again and the finding detail was gone.

9. **Direct Diagnose reload — clean path.** I directly navigated to the Diagnose hash after the synthetic setup and waited for the loaded surface. The window controls, Sift, findings rows, chart trace controls, and trial rail returned. The URL remained on Diagnose and no prior finding detail was shown.

10. **Narrow-viewport attempt and scope.** I attempted a keyboard-induced narrow-layout pass with Chromium zoom keys. The driver kept the same effective viewport and exposed no viewport-resize command, so I do not claim a narrow-viewport result. All other stories above used the normal loaded viewport.

### Operator hypothesis check — trace-list key direction

Starting from the loaded Diagnose surface, I entered a populated finding by keyboard, then tabbed through its detail controls to the vertical occurrence row. In two fresh sessions, the focused occurrence row remained visibly focused after ArrowDown, ArrowUp, ArrowRight, and ArrowLeft. No adjacent occurrence row was rendered, and no focus or selection movement occurred. There was no evidence that Left or Right was unexpectedly required; with no adjacent row available, the Up/Down spatial-order hypothesis was **Not observed** rather than confirmed or disproved.

## Bugs

### KBD-93-03 — Finding drill resets focus to the document body

- Starting state: Loaded Diagnose findings list with the synthetic data surface visible.
- Exact actions: Tab through the Diagnose chart trace controls to the first finding row; press Enter. Repeat the same path in a fresh browser session with Enter.
- Observation: The finding detail opened, but the active element was `BODY`. Focus was not on the detail breadcrumb, heading, Align group, evidence control, or first trace control.
- Expected user-facing behavior: After a finding row opens, keyboard focus is placed on the opened detail surface at its first meaningful control.
- Reproducibility: Reproduced twice in separate browser sessions.
- UI section: Diagnose findings drill-in and detail focus management.
- Severity: P2.
- Stable fingerprint: `kbd-diagnose-finding-open-body-focus`
- Interpretation (not observed): The visible transition into detail has no corresponding assistive focus transition, leaving a keyboard user without a reliable starting point for the newly displayed evidence.

### KBD-93-04 — Align choices are skipped by keyboard traversal in finding detail

- Starting state: Loaded Diagnose finding detail opened from a finding row.
- Exact actions: Traverse forward with Tab through the visible detail controls, then traverse backward with Shift+Tab through the visible detail and chart controls. Repeat in a second fresh browser session.
- Observation: Forward traversal reached View slot, View segment, verdict choices, the Occurrences row, and Open Verify. Reverse traversal reached the Findings breadcrumb and basal trace controls. The visible Align choices, By clock and By event, did not receive focus in either direction. Arrow keys, Enter, and Space therefore had no focused Align choice on which to act.
- Expected user-facing behavior: The visible Align segmented control participates in keyboard traversal, exposes a focused choice, and supports its documented arrow/activation behavior.
- Reproducibility: Reproduced twice across separate detail sessions.
- UI section: Diagnose finding detail, Align segmented control.
- Severity: P2.
- Stable fingerprint: `kbd-diagnose-detail-align-skipped`
- Interpretation (not observed): The detail surface presents Align as an interaction target while the keyboard focus sequence bypasses it, separating the assistive interaction model from the visible spatial model.

## Discarded observations — out of scope for issue 93

The earlier Log carbs overlay observations were global-shell behavior, not Diagnose behavior. They are excluded from the stories and bug count for this issue.

## YOLO feature vote

**Vote: a keyboard-accessible Diagnose walkthrough mode.** I would love a mode that exposes the whole evidence journey as one predictable sequence: enter Diagnose, move through Sift and window controls, enter a finding, traverse its evidence, use Align, and return with focus restored to the originating row. User-visible story: a user opens Diagnose, starts the walkthrough, and receives a concise focus-announced path through each available evidence surface without losing their place.
