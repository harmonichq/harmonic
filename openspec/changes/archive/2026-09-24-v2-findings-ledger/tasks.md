# #404 implementation checklist

**Review-ready plan.** These positional slices are the source for the
coordinator-pinned execution envelope; they are not themselves a posted lock.

## 1. Scoped Pattern population, projection and API

- [x] 1.1 Implement the single producer-owned outcome-window Pattern population
  required by behavioral-layer **Habit associations preserve bounded episode
  ownership**, using the existing per-family outcome rule without changing
  classifier thresholds, identity, or bounded episode context.
- [x] 1.2 Serve scoped Pattern rows and case files from that same population,
  including count, denominator, readiness, roster, selected occurrence and
  evidence, served labels, glucose and markers through the existing case-file
  response; do not derive membership or policy in the browser.
- [x] 1.3 Add public-interface synthetic coverage for named, drawn and circular
  half-open windows, outcome/antecedent boundary pairs, zero/thin denominators,
  and the over-treated-low Low-identity/High-landing rule.

## 2. Durable Focus scope and Trial history lifecycle

- [x] 2.1 Implement durable saved scope for a new Focus as required by
  durable-follow-up **New Focus records retain the selected outcome window**;
  validate it at admission and apply it inside both existing calendar comparison
  arms without clipping contributing episodes.
- [x] 2.2 Preserve old Focus computation semantics when scope is absent, reject
  stale admission, and prevent later Diagnose navigation from mutating saved
  scope.
- [x] 2.3 Implement the additive late-conclusion operation required by
  durable-follow-up **A late Trial conclusion is additive to an immutable
  ending**, preserving expiry and original ending across conflict, retry,
  restart, and cache invalidation.
- [x] 2.4 Add named on-demand reassessment loading with no prewarm, preserving
  read-only history and the distinction between reassessment and conclusion.

## 3. Shipped desk, generated evidence and runtime integration

- [x] 3.1 Implement surfaces **The desk renders served Pattern evidence and
  preserves selection** by consuming the existing case-file response, with
  per-family selected handoff, served short labels/markers, honest missing
  values, and stale selection/window response rejection; do not redefine its
  producer-owned payload or add an API.
- [x] 3.2 Make the retained C4 selected-trace/marker and geometry regressions pass,
  supplementing focused option coverage for changed evidence families; retain
  the existing working low-comparison selected-trace story as its control.
- [x] 3.3 Implement surfaces **The v2 desk preserves readable
  cross-destination evidence chrome**: parent-owned expandable members/minis,
  long-label safety, label-before-icon/top-right tall headers, compact existing
  density tokens, Diagnose/Changes/Day rail parity in loaded/loading/settings
  table states, basal legend/verdict/accent, skeleton and named reassessment
  loading.
- [x] 3.4 Implement surfaces **Diagnose and Day keep the reader's navigation
  context** and **Changes keeps completed and expired Trial records reachable**.
  Make the existing S101–S105 regressions pass at their feature assertions,
  repairing the intermittent drawn-window setup without weakening expectations.
  Preserve S100 timing and merged keyboard regressions.
- [x] 3.5 Generate only synthetic fixture/case evidence through listed
  producers, run their drift checks, then obtain the coordinator's serial
  public-interface runtime proof at both supported desktop widths. Do not claim
  a freeze or screenshot proof before that admission.

## Document ownership

The backend scope chunk updates this change's behavioral-layer delta and
generated projection contract. The follow-up chunk updates CONTEXT.md and this
change's additive contract record. The surface/integration chunk reconciles
DESIGN.md, PRODUCT.md, and this change's source, evidence ledger and INDEX
updates. #404 supersession statements that were briefly placed in inherited
`harmonic-v2` and `diagnose-finding-case-files` active records are owned solely
by `v2-findings-ledger/design.md`'s **Documentation placement — #404 active
record** section; those inherited records are restored exactly to
`12388f584fe11b2da7077d0ad5381f6c1af7d6ac`. Base capability specs fold from
these deltas during the established post-merge archive; do not rewrite them
early. Historical decisions retain their original text.

- [x] 3.6 Apply the operator-requested Opus 5 high design critique, preserve inherited behavior, and verify the revised states with synthetic captures and public-interface checks.
