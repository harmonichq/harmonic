# Tasks — one drill-down for every settings chart

- [ ] Route every settings evidence chart to the panel its findings-queue row opens, by looking the row up on the chart's own identity and taking the existing row route, for basal, correction factor and carb ratio alike.
- [ ] Keep a settings-chart click one level deep: a click while another parameter's panel stands replaces that level rather than deepening the breadcrumb.
- [ ] Retire the thin chart evidence readout and only what becomes unreachable with it — its styles and its level-metadata entries — keeping the generic chart level the behavioral placeholder still uses.
- [ ] Cover the routing and the one-level rule with tests through the public module interface, each failing first against the pre-change behavior.
- [ ] Replay the frozen finding-evidence-routing ledger against the base app, inventory the base source and live surface again, and diff the observed inventory against the ledger.
- [ ] Amend and re-freeze the ledger for the unified routing: new stories for basal, correction factor and carb ratio each reaching their parameter panel by chart click, and for a cross-parameter chart click that does not deepen the breadcrumb.
- [ ] Capture before/after evidence for the affected states and record the revision in the surface ledger.
- [ ] Fast gate, drift checks and the workstation browser gates green.
