## Focused preview audit

Inspected all 8 attached renders. Verdict: **16/20 — good direction, not converged**.

The accepted grammar is working at desktop and tablet: full-width text remains readable, preview wells are approximately 92px, labels are separated, and previews retain meaningful marks/reference context:

- Desktop mixed and ISF previews: `preview-desktop-1440x900-mixed-top.png`, `mixed-lower.png`, `isf-chart.png`
- Wide short viewport: `preview-short-2084x742-mixed-top.png`
- Tablet: `preview-tablet-760x900-mixed-top.png`
- Phone event-response preview: `preview-narrow-390x844-mixed-lower.png`

Flat traces are honest synthetic data and do not need invented variation. Preview size is now useful enough; demanding full-size chart semantics in the queue would be preference, not a defect.

### Required fixes

1. **[P1] Phone spotlight chart collapses under long titles.**  
   `preview-narrow-390x844-mixed-top.png` and `mixed-lower.png`: the spotlight plot is roughly 20px high beneath the long Carb ratio title, with the y-axis labels, marks, and annotation piled together. The chart is technically present but not readable. Preserve the full-width title, then enforce the accepted dedicated chart-well minimum and reserve space for labels/legend.

2. **[P2] First phone queue preview is stranded under the watch dock.**  
   `preview-narrow-390x844-mixed-top.png`: the first `MEAL · RESPONSE` well begins below the Findings row but is cut off by the fixed “Nothing being watched” dock, so its chart mark cannot be inspected without an implicit scroll workaround. Add sufficient queue bottom padding/scroll clearance so a selected preview can be brought fully above the dock.

### Unverified

Keyboard focus, exact 44px hit-area geometry, and scroll behavior are not provable from these stills.

**Convergence:** keep the queue previews. Fix the phone spotlight height first, then ensure the queue can scroll each preview fully into view.
