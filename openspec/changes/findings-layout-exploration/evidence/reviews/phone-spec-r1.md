# Phone correction spec-r1

Reviewed implementation: a3b46ca. Final documentation clarification: cd25af5.

Spec review: 6/7 PASS, 1 documentation failure. The correction is not converged until item 1 is reconciled.

1. FAIL — `mockups/finding-evidence-routing.behavior.md:36-38` still states that #341 “adds the Adjust window shortcut.” This is an active amendment, not marked historical, and contradicts the removed markup/handler and current surface spec. Remove or explicitly supersede that stale normative sentence.

2. PASS — phone CSS creates one shell-owned vertical flow; focused Chromium cases verify complete Spotlight, overview, queue previews, Watching, no nested scrollports, and no horizontal overflow at 360/390.

3. PASS — preset/drag behavior remains covered; Filter placement is tested adjacent and bounded at root and after scrolling, with 44px targets.

4. PASS — focused touch coverage verifies selection, drag windowing, catalog dismissal, lower-ranked drill/return, Watching, fullscreen, and immediate detail access.

5. PASS — catalog dismissal restores nonzero reading position, window, finding, previews, and opener focus after settled repaint; the focused restoration case passes.

6. PASS — desktop/tablet arrangement remains unchanged in the correction; phone-specific rules are scoped to narrow widths and exclude full-canvas states.

7. PASS — same-synthetic-source preview evidence, fail-first witnesses, 8 focused browser cases, 40 Node cases, source-coupled artifact check, and no-error server smoke are recorded. The full 163-story replay and broad integration gates remain explicit coordinator-owned validation, not yet claimed.

Finding: one actionable stale normative reference at `mockups/finding-evidence-routing.behavior.md:36-38`. No new #345 regression; that pre-existing fullscreen stale-ID issue remains out of scope.

Convergence: Not converged pending item 1 documentation reconciliation. No PR has been opened and no merge is authorized.
