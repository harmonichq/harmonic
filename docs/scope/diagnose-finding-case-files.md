# Scope ledger — Diagnose Finding case files (#79)

## Decisions

- **Treat the defect as one population-composition failure, not a Highs-only
  exception.** Correction stacking, Meal over-delivery, Carb undercount, Late
  bolus, and Meal bolus fell short all cross the same browser join between a
  Findings projection and a separately prepared Exposure feed. **Why:** the
  browser currently chooses a Meals or Lows family by Finding title and then
  intersects three identity fields; a valid Finding can therefore be reframed
  onto a family it never counted. **Disposition:** → ADR 79.
- **Make a Finding case file one server-owned projection.** Its summary,
  denominator, verdict band, Occurrence roster, selection, and clock/event chart
  projection come from one prepared Exposure population behind one small
  interface. **Why:** sharing helpers or cache keys across separate browser
  requests cannot guarantee an atomic population when data changes between
  responses. **Disposition:** → ADR 79.
- **Bind the rendered queue and case file to one new preparation contract.** A
  dedicated, separately named schema returns a case-file-ready ranked queue plus
  an opaque `projection_id`; the case-file request returns evidence only from that
  retained preparation. The legacy `/diagnose/findings` route and
  `diagnose-findings-v1` schema remain unchanged for independent callers. The
  preparation materializes its Exposure population and trace rows inside one
  SQLite read snapshot. **Why:**
  one immutable case-file object is insufficient if the visible queue came from
  another generation, while changing v1 would collide with ADR
  22's reserved v2 evolution. **Disposition:** → ADR 79.
- **Keep attribution and classifier firing distinct.** For the declared Exposure,
  the roster size equals the denominator and the sum of the five verdict counts.
  `claimed` counts roster members attributed to the Lever; `fired` counts members
  whose row-relative classifier matched, so `claimed <= fired` and may be strict.
  The observed `5 of 68` beside `6 meet criteria` is not itself a defect. **Why:**
  attribution picks one winning Lever while the verdict band preserves classifiers
  that matched but were outranked. **Disposition:** → ADR 79.
- **Associate attribution to its declared Exposure opportunity.** A private,
  closed association links each attributed Lever instance to one occurrence in
  the Lever's declared family. Normally that is the driver anchor; the intentional
  caused-low split links the synthesized Over-treated-low rebound High back to the
  source Low through its retained `rebound_nadir_t`. **Why:** requiring
  `cause_lever` on the declared-family anchor would silently drop a valid
  analyzer-produced Finding. **Disposition:** → ADR 79.
- **Route by the Lever's declared Exposure.** The closed Lever metadata already
  owns whether a denominator is Meals, Lows, correction clusters, or Highs; the
  browser's title-keyed alignment map is retired. **Why:** `Correction stacking`
  is denominated by correction clusters even though the current map forces its
  case file onto Lows, producing the observed `0 of 0`. **Disposition:** → ADR
  79.
- **Build canonical opportunities, not Explore anchors.** Meals are `_is_meal`
  boluses, Lows are sub-70 runs, correction clusters are adjacent user-correction
  pairs, and Highs are >250 runs—the exact recurrence definitions. A 71–75
  near-low attribution that cannot map to a canonical Low is explicitly withheld
  rather than relabelled or shown with an invented roster. **Why:** Explore emits
  individual correction anchors and near-low anchors, so using it directly can
  reconcile internally while disagreeing with the Pattern's clinical denominator.
  **Disposition:** → ADR 79.
- **Wrap the authoritative queue; do not fork it.** The preparation carries the
  active Findings projection and server-merges only case-ready behavioral headers.
  ADR 22's later v2 history rows and lifecycle selection must pass through this
  wrapper in the same change that introduces them. **Why:** preserving the v2 name
  is insufficient if the shipped browser stops consuming its policy.
  **Disposition:** → ADR 79.
- **Complete event alignment over the four Exposure families.** Meals and Lows
  keep their existing behavior. Correction stacking aligns its correction-
  cluster population, and high-denominated Findings gain a Highs projection.
  **Why:** every inspectable Finding needs an event path over the same population
  it counts; high-only rows and correction-cluster rows cannot honestly borrow a
  different family's lens. **Disposition:** → ADR 79.
- **Revise the shipped Diagnose surface in place.** The safe entrypoint is
  `uv run harmonic serve --no-fetch --db
  mockups/revise-e2e.synthetic/harmonic.sqlite`; the source is the committed,
  generated synthetic database. The contract is
  `mockups/finding-evidence-routing.behavior.md` plus
  `frontend/diagnose-workstation-behavior.replay.mjs`, with the event-comparison
  replay as the chart projection guard. **Why:** the surface ships and is safely
  runnable; no mock or lock manifest is permitted. **Disposition:** inline.
- **Slice at the server/surface seam.** First build and test the atomic case-file
  projection; then move the shipped browser, mirrors, generated fixtures, and
  live synthetic replay onto it. **Why:** the slicing rubric fires on multiple
  deliverable artifacts and a live run inside the ticket, matching anchor B/F.
  **Disposition:** inline.

### Risk contract

- **Must prevent:** a visible Finding reporting counts from one population while
  its roster or chart shows another; a visible Finding row swallowing a click;
  silent fallback from event to clock alignment; frontend re-derivation of
  Exposure family, membership, verdict, support, or inspectability; real pump or
  patient data entering fixtures, screenshots, Git history, or public CI output;
  any change to analyzer verdicts, Priority, staging, Plan, or pump-setting
  advice.
- **Must recover:** an active failed or stale case-file request preserves the last
  internally consistent queue/inspector/canvas generation and reports the failure; a browser
  response superseded by newer coordinates is discarded without changing state or
  raising a false error. Neither path mixes populations or silently changes
  alignment.
- **Accepted failure:** if the server cannot construct an inspectable case file,
  it fails that projection clearly and the browser preserves the prior state; it
  does not publish a successful Finding with invented or empty supporting
  Occurrences. Recovery is a later successful projection after the underlying
  data/cache version changes.
- **Unsupported:** live vendor fetches; real-data browser evidence; changing
  classifier thresholds, comparison-support floors, event-alignment support
  semantics, or the planned historical Carb-ratio contract from ADR 22.
- **Evidence owed:** public endpoint tests proving one case-file population owns
  every displayed count and Occurrence; analyzer-built synthetic cases for Meals,
  Lows, correction clusters, and Highs; browser replay using independently served
  production-shaped responses (not one shared injected object); visible-row open,
  roster selection, event persistence, high case-file, failure-preservation, and
  no-silent-no-op stories; full fast, drift, and browser gates through the declared
  no-fetch synthetic server.

Why: Diagnose evidence can influence advisory insulin-dosing decisions; a
plausible count paired with empty or unrelated Occurrences is silent incorrect
success.

Disposition: copied unchanged into ADR 79 and the issue work order.

### Review rounds

- Round 1 (full, authoring): refused. The panel required exact count algebra, a
  queue/case snapshot identity, a closed failure matrix, fixed correction/Highs
  event semantics, and distinct active-failure versus superseded-response
  behavior. All five blockers are folded into ADR 79 and the revised work order;
  a cold recheck is pending.
- Round 2 (full, authoring): refused. The earlier blockers closed; the panel then
  found the split Over-treated-low cross-family attribution, Highs classifiers'
  onset-relative evidence horizon, and ADR 22's reservation against extending
  `diagnose-findings-v1`. The preparation endpoint, association rule, and Highs
  event bounds now make those facts explicit; a cold recheck is pending.
- Round 3 (fresh, full, authoring): initially refused. It found that Explore families are
  not canonical recurrence populations, correction-pair identity was unsettled,
  the Findings wrapper had to preserve ADR 22's future authority, preparation
  lifetime/races were open, stale recovery could mix queue generations, and UI
  Craft's safe-start/evidence records were incomplete. ADR 79 now fixes the
  opportunity table, public schemas, cache lifecycle, atomic shadow recovery,
  safe-start declaration, and closed render matrix. The same fresh panel's final
  delta review approved the contract, domain semantics, and execution plan with
  no remaining blockers; the work order is countersigned.

## Open questions

None. Existing Lever metadata settles Exposure ownership, and the shipped
surface settles the interaction model. Per-view chart spans remain server-owned
configuration and must cover the existing classifier evidence without changing
classifier or support semantics.

## Spawned tasks

None during grounding. The mandatory cold plan review runs after the work-order
draft exists.

## Remaining dispositions

- Post the countersigned work order to issue 79 after operator approval.
