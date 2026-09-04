# Design — eating-sequence evidence plumbing

## ADR 277 — Diagnose aggregate evidence stays outside Audit and Watching

The final decision in `docs/scope/carb-load-stability.md` settles the home: the
eating-sequence report belongs in a distinct, explicitly non-advisory
aggregate-evidence section on Diagnose, outside Audit and Watching. Audit is the
ranked decision queue and Watching contains held, still-collecting, and historical
tuning reads. The retired Explore mode is not revived. #277 defines the data
contract only; #278's ui-craft lock owns name, placement, wording, and charts.

`Surface lifecycle: none`. Comparison cohorts are owned by the report, not the
adapter: `_ComparedCohorts` and `_ComparedRepeatCohorts` already compute each pair,
so their aggregates are serialised beside their differences. This makes the chart
inputs field-for-field and pins the invariant that a served difference agrees with
the served cohort values. The adapter performs no arithmetic; insufficient is a
served `null` and status, never an absent point or zero.

The projections are bounded to per-scope Q1–Q5 trajectories over three periods;
pooled/evening high-carb Q5 versus Q1–Q4 pairs; and a selected-period matched-carb
repeat-eating matrix. Its `3+` cells retain served comparison status and differences.

No browser route stub is added: `index.html` has no report consumer, so an answer
would prove nothing. #278 adds route answers with the first consumer and story.

The harness declares no new path for the same reason; #278 adds the story/path
together. Targeted review is sufficient: no surface or analyzer judgment changes.
The one load-bearing boundary is no re-derivation, directly covered by frozen-
fixture, skeleton, and fetch-route tests and targeted review of adapter plus tests.
