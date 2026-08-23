# Scope ledger — Cohort evidence-state labels (#99)

Routed from `/ticket triage 99` to interview mode: the facts are grounded, the open
point is a product decision about how the By-event chart explains its own cohort
evidence states. Triage ran as a worker with no interviewee; the frontier questions
below carry recommendations and the work order builds on the recommended defaults
until Connor rules otherwise.

## Decisions

- Grounded, not a decision: `CONTEXT.md` already defines **Comparison support** as
  `Supported` / `Limited` / `Withheld`, the presentation authority of a cohort or a
  five-minute point by how many distinct usable Occurrences contribute, independent
  of classifier outcome and Evidence tier. The chart never surfaces that definition.
  `inline`
- Grounded, not a decision: the chart's only support copy is
  `frontend/diagnose-event-comparison.js` — `paintLegend` prints `<cohort label>
  <Support>` plus `N events · K supported · M limited · J withheld points` (or
  `aggregate withheld · n episodes shown individually`), `paintReadout` prints
  `Limited · n3` / `Episodes shown individually`, and `cohortReadout` is the
  screen-reader text. `COHORTS[].note` ("Comparable; no factor matched") exists but
  nothing renders it. Reproduced by reading the source against the #93 F1 story;
  the committed capture `mockups/diagnose-event-comparison.synthetic/capture.json`
  carries all three states (`fired` has supported, limited and withheld points;
  `near_rule` is Limited; `another_factor` is Withheld). `inline`
- Grounded, not a decision: the behaviour replay
  `frontend/diagnose-event-comparison-behavior.replay.mjs` pins the legend
  `data-support` / `data-selected-cohort` attributes, `/Supported|Limited|Withheld/`
  in `#ec-readout`, the valid-bin count in the readout, and that a Withheld cohort
  exposes no aggregate series. The fix keeps those tokens and attributes. `inline`
- Grounded, not a decision: ADR 62 amendment (Connor, 2026-08-20) retired the
  by-event rendered caption: "Drop all that shit. It's a chart." A new standing
  explanatory sentence beside the chart (the #93 feature vote) would re-litigate
  that ruling; rewording the labels already on the legend, lower key and hover
  readout does not. `inline`
- Assumed default pending Q1: the fix is labels-in-place. Each legend key item and
  readout value gains a short reading of its support state, drawn from one closed
  copy table keyed by `supported` / `limited` / `withheld` (cohort-level and
  point-level wording), and the aria description states the relationship between a
  cohort's aggregate state and its points. No new caption, panel, or interaction.
  `-> ADR` (recorded in the change's design.md when the order executes)
- Assumed default pending Q2: the wording. Supported reads as usable for the
  comparison; Limited reads as usable with caution because few episodes contribute;
  Withheld reads as not comparable as a line, only as individual episodes (or, at
  zero usable episodes, as nothing to draw). Point-level counts read as how much of
  the line is at each state. `inline`
- Mine, recorded not asked: the CONTEXT.md Comparison support entry is the source
  of the wording, and the executing agent extends that entry with the three
  readings so the glossary and the chart say one thing. `inline`

### Risk contract

Why: the lens is evidence-only and never enters Priority, Plan or a settings
action, so the exposure is a reader misjudging evidence, not a mis-issued dose.
Disposition: copied into the work order.

- **Must prevent:** a label that calls a Limited or Withheld line usable without
  qualification; any change to which support state a cohort or point receives (the
  server owns support facts); a Withheld cohort gaining an aggregate line; the
  retired window-membership caption returning under another name.
- **Must recover:** nothing automatically.
- **Accepted failure:** none new; the chart renders exactly as today except for the
  wording of its own labels.
- **Unsupported:** the #93 feature vote (a hover-position interpretation sentence);
  any change to cohort membership, support thresholds, or the projection payload.
- **Evidence owed:** a Node test through `paintLegend` / `paintReadout` output (or
  the module's public render entry) asserting each support state's reading appears
  for the committed capture; the behaviour replay still green; the support audit
  still green.

## Open questions

- **Q1. Fix shape.** A. reword the legend, lower key and hover readout in place
  (recommended: honours the 2026-08-20 caption ruling and fixes the F1 gap where
  the reader looks). B. add the #93 feature-vote sentence beside the chart (a new
  rendered caption; collides with ADR 62 amendment and needs Connor to reopen it).
  C. both (B's cost plus A).
- **Q2. Wording.** Owner's call on the three readings; the defaults above stand
  until replaced.

## Spawned tasks

- none

## Plan-review ledger

- Round 1 (cold pass, 2026-08-23): 2 blockers, both `authoring`. (1) the Node test
  in step 7 was not reachable: the painters are unexported and `data.test.js`'s fake
  Node discards `innerHTML`; fixed by naming the harness extension or accessor
  export. (3) the support audit pins `0 events · no usable episodes to draw`; fixed
  by adding that string to the keep-list and licensing audit story updates. Note
  (2): `another_factor` exists only via `project.mjs` `{ another: true }`; fixed in
  step 7. Reproduced all three before forwarding. 0 `injected`.
- Round 1 delta re-check (same reviewer): COUNTERSIGN. Two notes folded into step 7:
  no selection under the fake-Node path (insertAdjacentHTML absent), and the hover
  reading under the accessor path rests on screenshots. 0 blockers, 0 `injected`.
