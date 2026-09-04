# Design — eating-sequence primitives and high-carb detector

## ADR 275 — Pure event report with a fixed-window cached projection

- `build_report(boluses, cgm, carb_log, *, window_start, window_end, config)` is
  the analyzer's pure public entry. `build_eating_sequence_report(store, *,
  window_days=30, now=None)` is its thin read-only adapter: it reads the three
  modeling streams plus `store.basal_events()` solely to derive `span_end`, `now`,
  and `start` exactly as `build_scenarios` does. Basal is never a modeling input.
  It then slices all three modeling streams to `[start, now)` exactly as
  `build_scenarios` does; `build_report` treats its lists as complete window content
  and constructs no sequence outside its explicit bounds. Event lists make
  construction and evidence testable without a store while the shared window
  derivation keeps report bounds aligned with Diagnose.
- The detector assigns pooled quintiles before eligibility, then filters that single
  assignment and its boundaries for evening. It never re-ranks evening sequences.
  This preserves one user-relative population across both scopes.
- A comparison is supported only when Q5 and Q1–Q4 are both supported for its scope
  and period. It concludes only when Q5 median TIR is lower or Q5 median glucose SD
  is higher. A fixed summary template uses only the served scope, period label,
  medians, and cohort count and says association, never cause, carb advice, or a
  setting change. The headline chooses the supported clinically legible contrast
  with the largest absolute Q5 TIR drop; ties choose the shorter period, then pooled
  before evening. An evening headline additionally requires its pooled counterpart
  to clear the floor. Otherwise the detector is insufficient with `finding: null`.
- `repeat_eating_amplifier` stays exactly `empty_report`'s all-insufficient complete
  skeleton. #276 owns its population and conclusion; serving a complete shape now
  avoids a second temporary schema.
- The cached API uses key `("eating-sequences", window)` and marker
  `"eating-sequences-v1"`, accepts only Diagnose's fixed source window, requires the
  bearer token, and is read-only, so it adds no cache bump path. The product joins
  the warm roster when a Diagnose surface first requests it on initial load (#277),
  because the roster's contract is the initial-load shape set.
- `scripts/gen_eating_sequence_fixtures.py` consumes the shared synthetic stream
  builder and calls `build_report`, then writes the report fixture with provenance
  and byte-comparing `--check`. This production-shaped path prevents a hand-authored
  JSON encoding from drifting from analyzer output.
