# High-carb sequence chart — #410

## Decisions

- Connor confirmed the primary question: “How much worse is my glucose after higher-carb eating?” His answer was “yes exactly”. This settles the purpose, not a layout or behavior retirement. → issue #410

- Filed #410 for the High-carb sequence evidence chart. Related #404 owns other v2 desk findings. → issue #410
- Classification: code, pending attended scope. No execution lock or implementation authorized by triage. inline
- The current eating-sequences specification compares the highest-carb fifth with the remaining sequences using medians of per-sequence outcomes. Boundaries are user-relative, not treatment thresholds. inline
- The shipped surface is the revision target. Preserve backend-owned selection, support, periods, unavailable evidence and association-only interpretation. Layout is unsettled. inline
- Keep the supplied screenshot and personal health values local. Use generated synthetic evidence for any published reproduction. inline

## Open questions

- The existing Pattern response chart is the design precedent. Height and duration can be read together from glucose-over-time cohorts; do not repeat the abstract metric-choice question. Ground the sequence-specific trace contract before admitting implementation.
- Finish the surface-specific behavior inventory and any required ledger amendments after the metric scope is settled. No complete behavior freeze or execution lock is claimed yet.

## Spawned tasks

- https://github.com/harmonichq/harmonic/issues/410

Remaining dispositions: none. Triage remains in scope; no executable order has been drafted or posted.

## Grounding and baseline

- UI Craft route returned `{"mode":"revise","reason":"safe manufactured data source declared"}`. The declaration is AGENTS.md’s component harness in manufactured mode.
- Both shells built successfully from base `12388f58`. The harness used `high_carb_sequence_covered`, `source=manufactured`, `size=full`; the live page confirmed that story and displayed the detector summary in the detail pane. The local screenshot is `/private/tmp/harmonic-410-before.png`; it is synthetic and was visually inspected. The viewport was 1280 by 720. No browser console errors occurred.
- Existing focused browser verification: `PLAYWRIGHT_MODULE=/Users/connor/.codex/skills/drive-local-webapp/node_modules/playwright PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json node --test --test-name-pattern='eating-sequence' frontend/diagnose-canvas-composition.browser.test.mjs`. All ten tests passed, none skipped. This is scoped baseline evidence, not a full-ledger claim.
- Existing comparison shape: `frontend/diagnose-eating-sequences.js` renders separate time-in-range and glucose-SD rulers, all three periods, cohort counts, selected-period marker, missing evidence and item tooltips. `frontend/diagnose-evidence-charts.js` shares this implementation across sequence charts, minis and fullscreen. `frontend/diagnose-workstation.js` displays the existing summary in `.sequence-comparison`.
- `ciq_autotune/findings_projection.py` owns the generic served ranking headline. A meaningful stage-title change must honor that backend-owned headline contract instead of quietly overriding it in the browser.
- `openspec/specs/eating-sequences/spec.md` defines aggregate association only, with a producer-selected period that can be during the sequence. Never relabel an in-sequence comparison as after eating. Time outside range includes both low and high glucose; it cannot be relabeled as time high.
- Mandatory review has not started. The workflow’s read-only headroom probe completed successfully. It was not a plan review.

## Existing Pattern chart inspection

Connor directed: “view the other charts we have for patterns.” Opened the manufactured workstation, chose 24 h through the visible control, and opened Highs after meals, Lows after correcting highs, Late bolus and Over-treated low through their actual rows. Each reached an ok chart state; browser console errors were empty. All captures used the same 1280×720 viewport and remain local under /private/tmp/harmonic-410-*.png.

The two Pattern charts use an event-aligned glucose ruler, target range and cohort response curves. Meal and low-excursion anchors are visibly named. The Cause charts use the same response-comparison composition; the selected synthetic shapes are sparse, so they are not claimed as dense curve examples. The Pattern meal and correction captures were visually inspected alongside those two Cause captures.

Direction for continued triage: use the existing response-comparison visual language for highest-carb sequences versus other sequences, letting the reader see magnitude and duration together. Keep summary statistics as supporting evidence. This is a recommendation grounded in existing surfaces, not a frozen replacement design or an authorization to invent response data.

Transport finding: the current sequence case projection contains alignment, kind and the aggregate report, with no cohort glucose series. Its occurrence and selection records contain sequence metadata rather than glucose traces. Reusing the response-chart presentation requires a backend evidence extension. The existing aggregate-only detector report and its association judgments remain authoritative; do not draw interpolated curves through TIR/SD summary points. The sequence trace anchor, eligible population, observation window and support rules still need grounding before an execution lock.

## Accepted direction and risk

Connor confirmed the response-comparison direction and backend evidence extension with “yep”. Scope is now settled to that bounded revision; the remaining steps are source admission, independent review and execution-lock approval. The implementation does not select new outcome metrics. → ADR 410 in openspec/changes/high-carb-response/design.md


- **Must prevent:** secret exposure, irreversible loss of authoritative data, silent incorrect success; fabricated glucose curves; changed detector eligibility, ranking, ownership, support floor or dosing guidance; a caption describing a different population or period than its curve; false-low observations reappearing in the new evidence.
- **Must recover:** preserve the existing typed stale-generation refresh and retry behavior; add no new automatic recovery.
- **Accepted failure:** insufficient observations remain gaps or explicitly unavailable evidence. An inconsistent response stops at the existing visible error surface and can be retried manually. No interpolation substitutes for missing observations.
- **Unsupported:** causal estimates, carb limits, treatment advice, projected future glucose, a new recovery-time metric, re-ranking within a clock window, and redesign of Repeat eating or unrelated Pattern charts.
- **Evidence owed:** public case-file tests for population/period/trace coherence and unchanged analyzer output; generated synthetic parity; browser proof of actual cohort curves, readable units/names/period, retained navigation and selection, and failure states.

Why: this is descriptive evidence that must remain faithful to the user's observations.
Disposition: → issue #410 and ADR 410.
