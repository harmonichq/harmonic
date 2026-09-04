# The tapered urgency queue: the Diagnose findings rail commits to one thing (#302)

## Why

#305 settled one cohesive Diagnose composition; this ticket is its fifth step,
the un-drilled rail. Today the rail lists every ranked finding with identical
weight — a numeral, a title, a count — so a reader who opens Diagnose sees nine
equally-sized habits and no answer to "which one is costing me". The operator's
verdict on the shipped surface (2026-08-31): the little comparison charts in the
drawer are "more insightful than anything on that right panel", and the flat list
gives no urgency — "I have charts. Lucky me."

The ranking the rail needs already exists: the findings projection orders every
row and stamps each with a served tier, and since #306 every row carries a served
headline sentence. The stage already holds the rank-1 finding's chart. What is
missing is a rail whose shape spends the reader's attention the way the engine's
order does.

The event-aligned comparison charts also open five hours before a low, which
flattens the drop and the divergent recovery that are the whole story. The
alignment window is already per exposure family; two families' lead-ins move.

## What changes

- The rail becomes a tapered queue read entirely off the served order and
  tiers. The first priced ranked row is the hero: a card leading with its served
  headline (first sentence as title, the rest as subtitle), its facts line and
  its flavor and tier words — no chart of its own, because the stage at left
  already holds that finding's chart (ADR 306). Every further priced row is a
  compact row: numeral, title, one facts line, and the same small chart the
  drawer's cell draws for it, from data the page already fetched. Unpriced
  `noted` rows are title-only lines under the existing seam sentence. Watching
  is unchanged. Tier captions print the served words verbatim where the tier
  changes; no invented "Decide now", no 0–100 number.
- The frontend introduces no rank, tier, floor, direction or threshold of its
  own; it reads served position and served tier.
- Lows align at −60/+120 minutes and correction clusters at −120/+180; meals
  and highs are unchanged. Every committed encoding of those values moves with
  the table (the retired standalone comparison route's dead literals excepted,
  as its design record explains).
- Below a measured row width the compact row omits its mini and keeps its facts,
  so the rail holds on a tablet without a re-layout.
- The revision is proven the revise way: the frozen behavior ledger and app-only
  replay are amended for every changed rail behavior, and before/after renders
  are stored at 1440×900, 1280×800, 1024×768, 768×1024 and 390×844 from the base
  and the revision served on the same synthetic database.

## Risk contract

Inherited unchanged from #305.

- **Must prevent:** a frontend-derived staging verdict (floors, directions,
  thresholds stay backend-owned per AGENTS.md safety invariants); a frontend-
  invented ranking word or tier; real data in fixtures, screenshots committed
  to the repo, or CI logs; silent incorrect success (a green replay that
  asserted nothing).
- **Must recover:** nothing automatically.
- **Accepted failure:** a composition change ships broken (a mini fails to
  render, a drill dead-ends) — fails visibly, operator repairs through normal
  ticket flow.
- **Unsupported:** light theme (retired, #304); per-night exclusion reasons
  (deferred); multi-user or non-operator audiences; the price statement
  (deferred on #302).
- **Evidence owed:** behavior-ledger replay amendments through the ui-craft
  revise lifecycle for every rail behavior this change moves; the existing
  `asserts_move`/`safety_status` read-only contract stays pinned by existing
  tests.
- **Why:** one operator, advisory surface, all dose-safety logic already
  contract-pinned backend-side.

## Impact

- `ciq_autotune/analyzers/scenario/evidence_population.py` (`_WINDOWS`), the
  three tests that pin its values, the event-comparison synthetic capture and
  its generator, the Diagnose synthetic fixture set, the finding→evidence
  exploration's generated data, and the event-comparison replay's S13.
- `frontend/diagnose-findings-queue.js`, `frontend/diagnose-workstation.js`,
  `frontend/diagnose-workstation.css` and their node tests; the exploration
  that imports the queue module.
- `mockups/finding-evidence-routing.behavior.md`,
  `frontend/diagnose-workstation-behavior.replay.mjs`, the two Diagnose browser
  suites where they read rail markup, `mockups/INDEX.md`, and
  `openspec/changes/tapered-urgency-queue/evidence/`.
- `docs/scope/findings-consequence-visual.md`: the scope ledger.
