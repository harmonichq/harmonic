Implemented and committed Opus design-critique corrections.

Commit: `29f808eafd76ebfab5f6fd30b3e2caf0f8f27f35` (`fix: apply #404 design critique`)

Disposition:

1. Filter: restored v1 styling; v2 Filter now matches Window in resting, expanded, and loading states, with active-Sift weight. No caret added—the corrected visual review found no remaining resting affordance issue.
2. Markers: removed fabricated 120 fallback; markers use supplied/real trace glucose or remain absent.
3. Focus states: visible reason row, described actions, warning retry state, non-routed status text, and no stale failure copy.
4. Day: retained frame visibly marks loading without unmounting.
5. Rosters: grouped comparisons own cohort labels in headings; case rows retain per-row tiers.
6. Trial: field is explicitly “Later conclusion”; saved ending remains immutable.
7. Header: compact controls/actions preserve readable layout at both widths.

Verification passed:

- `npm run build`
- Scoped Node contracts: 124 passed, 0 failed.
- Built v2 synthetic browser states: 14 passed, 0 failed.
- v1 Filter menu/Escape/drawn-window contract: 1 passed, 0 failed.

Synthetic captures:

- [Capture directory](manifest.json)
- Filter resting/expanded/loading: both `1280x720` and `1440x900`
- Retry, pending Plan, no-route status: both sizes
- Grouped comparison and Later conclusion: both sizes
- Retained Day loading: both sizes
- [v1 resting Filter](v1-filter-resting-1440x900.png)

No full ledgers were run; task 3.5 remains open for coordinator-owned delivery verification.
