# A scoped window serves a Pattern when its outcomes land in it — triage and review ledger

Ticket: #467. Change: `openspec/changes/qa-round-2` (ADR 467; tasks 58–63;
behavioral-layer requirement 1). Triage ran unattended (AFK run, 2026-09-25).

## Reproduction

`uv run python docs/scope/467-scoped-pattern-membership.repro.py`, at this
change's base (9c41e67e):

```text
1. QA case basal-recurring-low-lower
  whole day
    roster (remain_pattern): ['highs_after_meals', 'lows_after_meals', 'highs_after_treating_lows', 'lows_after_correcting_highs', 'overnight_lows_no_iob']
    served pattern:overnight_lows_no_iob: k 2 n 30, route setting_staging, priority 97, scope whole_day, chart False
    served pattern:highs_after_meals: k 0 n 0, route none, priority None, scope whole_day, chart False
    served pattern:highs_after_treating_lows: k 0 n 2, route none, priority None, scope whole_day, chart False
    served pattern:lows_after_correcting_highs: k 0 n 2, route none, priority None, scope whole_day, chart False
    served pattern:lows_after_meals: k 0 n 0, route none, priority None, scope whole_day, chart False
    in roster, not served: []
  00:00-06:00
    roster (remain_pattern): ['highs_after_meals', 'lows_after_meals', 'highs_after_treating_lows', 'lows_after_correcting_highs', 'overnight_lows_no_iob']
    in roster, not served: ['highs_after_meals', 'lows_after_meals', 'highs_after_treating_lows', 'lows_after_correcting_highs', 'overnight_lows_no_iob']
  02:00-05:00
    in roster, not served: ['highs_after_meals', 'lows_after_meals', 'highs_after_treating_lows', 'lows_after_correcting_highs', 'overnight_lows_no_iob']
  03:00-04:00
    in roster, not served: ['highs_after_meals', 'lows_after_meals', 'highs_after_treating_lows', 'lows_after_correcting_highs', 'overnight_lows_no_iob']
  14:00-21:00
    in roster, not served: ['highs_after_meals', 'lows_after_meals', 'highs_after_treating_lows', 'lows_after_correcting_highs', 'overnight_lows_no_iob']
  00:00-24:00
    in roster, not served: ['highs_after_meals', 'lows_after_meals', 'highs_after_treating_lows', 'lows_after_correcting_highs', 'overnight_lows_no_iob']
2. The findings-projection fixture generator's projection
  whole day
    served pattern:highs_after_meals: k 1 n 3, route setting_staging, priority 66, scope whole_day, chart True
    served pattern:lows_after_meals: k 0 n 3, route setting_staging, priority 66, scope whole_day, chart False
    served pattern:overnight_lows_no_iob: k 0 n 0, route setting_staging, priority 39, scope whole_day, chart False
    served pattern:lows_after_correcting_highs: k 1 n 5, route none, priority None, scope whole_day, chart False
  00:00-24:00
    served pattern:highs_after_meals: k 1 n 3, route setting_staging, priority 66, scope window, chart True
    in roster, not served: ['lows_after_meals', 'lows_after_correcting_highs', 'overnight_lows_no_iob']
      rate lever finding:correction_stacking served unfolded, claimed_by None
      rate lever finding:correction_on_iob served unfolded, claimed_by None
  00:00-06:00
    in roster, not served: ['highs_after_meals', 'lows_after_meals', 'lows_after_correcting_highs', 'overnight_lows_no_iob']
  14:00-21:00
    served pattern:highs_after_meals: k 0 n 1, route setting_staging, priority 66, scope window, chart True
    in roster, not served: ['lows_after_meals', 'lows_after_correcting_highs', 'overnight_lows_no_iob']
      rate lever finding:correction_stacking served unfolded, claimed_by None
```

(Unchanged roster lines trimmed; the script prints them all.) The overnight
Pattern is dropped from every scoped window, including the explicit 00:00–24:00
scope, while the roster beside the rows carries it with its whole-day counts.

## Spike

`uv run python docs/scope/467-scoped-pattern-membership.spike.py` applies ADR
467's rule by patching the two functions it changes. On
`basal-recurring-low-lower` the overnight Pattern is served in 00:00–06:00,
02:00–05:00, 03:00–04:00 and 00:00–24:00 with k 2, n 30, `setting_staging`,
Priority 97, `window_scope: "window"` and no chart, and in no row at 14:00–21:00.
On the fixture projection, 00:00–24:00 serves the whole day's four Patterns, and
`correction_stacking` and `correction_on_iob` fold under Lows after correcting
highs again.

`... spike.py --qa` runs every QA case under the rule:

```text
QA cases: 75; scoped windows now serving a Pattern: 34
...
QA expectations that move: 0
```

`QaExpectation` keys queue rows by parameter only and freezes the whole-day
roster, so no literal expectation moves and "Maintaining QA coverage eras" has
nothing to regenerate.

## Grounding notes

- `outcome_window_population` is the scoped roster's one producer. Its callers
  are the projection, the Pattern case file (which reads only the population, not
  the roster), the fixture generator and `tests/test_outcome_patterns.py`.
  Scoped Pattern Focus admission (`api.py`) reads the scoped roster's readiness;
  a Pattern with no outcome in the window reads `withheld` there today, so
  filtering the roster by membership changes no Focus answer.
- The JS mirror reads the server's frozen per-window roster, so a roster already
  filtered by membership needs no membership code in JS: the mirror drops its
  gate. Its chart predicate becomes the chartability predicate over the scoped
  `n`, replacing the `pattern.n > 0` stand-in.
- The fixture's overnight Pattern has n 0 (its hand-composed 03:00 harm evidence
  carries no band counts), so no frozen window would exercise the band sentence
  in the mirror. The generator gives that evidence a band count and source nights,
  as the analyzer publishes them.
- The issue's "record in `v2-findings-ledger`" step is stale: that change is
  archived (`openspec/changes/archive/2026-09-24-v2-findings-ledger`), and the
  live `behavioral-layer` spec no longer says scoped queries omit the Pattern
  (`openspec/specs/behavioral-layer/spec.md:301` now carries ADR 404's scoped
  population sentence). The rule is recorded in this change.
- `tests/test_findings_projection.py` pins that every scoped Pattern row carries a
  chart; that pin is amended to chartable rows only.
- Would have checked live: nothing; this ticket depends on no deployed state.

## Decisions

- Option A (Connor, 2026-09-24): the harm-band Pattern joins any window
  overlapping 00:00–06:00 with its band counts and a sentence naming the band.
- Decided autonomously during the AFK run (ADR 467): membership is decided where
  the scoped roster is built; a Pattern with no population (n 0) joins no scoped
  window; the band sentence's words; the fixture's band evidence.
- Surface lifecycle `revise`; the behavior sweep is deferred to start (Chromium
  cannot launch in the triage sandbox).
- Flat order: the coordinator's slice plan fixes one lock per ticket and one start
  session. The nearby reviewer-memory anchors disagree with flat.
- Review depth Full: the change moves the findings projection's served Patterns
  and a Pattern priced through the basal setting, on the queue that leads to
  staging an advisory dose change.

## Review rounds

| Round | Blocking objections entering | Authoring change | Injected ground truth | Verdict |
|---|---|---|---|---|
