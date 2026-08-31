# Tasks — one drill-down for every settings chart

- [x] Route every settings evidence chart to the panel its findings-queue row opens, by looking the row up on the chart's own identity and taking the existing row route, for basal, correction factor and carb ratio alike.
- [x] Keep a settings-chart click one level deep: a click while another parameter's panel stands replaces that level rather than deepening the breadcrumb.
- [x] Retire the thin chart evidence readout and only what becomes unreachable with it — its styles and its level-metadata entries — keeping the generic chart level the behavioral placeholder still uses.
- [x] Cover the routing and the one-level rule with tests through the public module interface, each failing first against the pre-change behavior.
- [x] Replay the frozen finding-evidence-routing ledger against the base app, inventory the base source and live surface again, and diff the observed inventory against the ledger.
- [x] Amend and re-freeze the ledger for the unified routing: new stories for basal, correction factor and carb ratio each reaching their parameter panel by chart click, for a cross-parameter chart click that does not deepen the breadcrumb, and for the drawn clock window being released on the chart route for basal and carb ratio while standing for correction factor; and reconcile frozen story S21's lane-click exclusivity with the drills that actually release, under its attributed ruling.
- [x] Capture before/after evidence for the affected states and record the revision in the surface ledger.
- [x] Fast gate, drift checks and the workstation browser gates green.
