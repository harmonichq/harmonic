# Serve each cause's own trace, order causes by severity, and keep a cause's Focus (#593)

## Why

The drill-down (`docs/design/drill-down.md`, locked 2026-10-20) draws one card
per cause of a multi-cause Pattern: the cause's share of the Pattern's count,
its episodes' trace against Typical, and a Focus button for that cause, in the
engine's order, largest harm first. Four of the facts those cards print are not
served:

- **Each cause's trace.** A Pattern case file pools every claimed episode into
  `traces.pattern`. Each Occurrence already names the rate lever it is credited
  to (`occurrences[].member`), but no trace is drawn per cause.
- **The order.** A Pattern's shares are served in rate-lever roster order. The
  lock orders the cards by summed episode severity, the hypo-weighted
  mg/dL·min outside range the engine already scores per episode
  (`analyzers/scenario/severity.py`).
- **The causes of a Pattern that keeps its row.** Shares are served only on the
  row of a Pattern served as its one habit (`served_as.cause_counts`, ADR 520).
  A meal Pattern always has its carb-ratio setting member, so it never
  collapses, and its row serves no shares. The drill-down's own example, Highs
  after meals with Carb undercount and Late bolus, has nothing to read.
- **A cause's Focus.** `POST /api/focus` with a `pattern_key` replaces any sent
  `lever` with the Pattern's first pinnable habit member, so a Focus started on
  the second cause silently watches the first.

## What changes

- The exposures feed stamps, beside each Occurrence's `attributed_levers`, the
  severity of the episode each lever's claim came from (`claim_severity`), the
  number the scenario engine already computed for that episode.
- The Pattern producer owns one ordering rule beside the crediting rule: a
  Pattern's causes are its rate levers with a share, ordered by the summed
  claim severity of the Occurrences credited to each, largest first, ties in
  roster order. Crediting is unchanged.
- The findings projection serves the shares in that order: on a habit row's
  `served_as.cause_counts` as today, and on every Pattern row that serves a
  count sentence, as `cause_counts` in the same shape.
- A Pattern case file serves `traces.causes`, one trace per cause in the same
  order: that cause's credited Occurrences drawn as the Pattern's own episodes
  are drawn, against the Pattern's one Typical.
- `POST /api/focus` with a `pattern_key` and a `lever` pins that lever when it
  is one of the Pattern's pinnable habit members and refuses otherwise. With no
  `lever` it pins the first pinnable member, as today. A retried pin must name
  the lever it first pinned.
- Each served cause carries `pinnable`: whether it is one of the Pattern's
  pinnable habit members, decided by the one predicate the Focus endpoint
  admits a sent `lever` by. It says nothing about whether a change is already
  watched (`GET /api/focus` `admission.focus_pin.available` stays that gate) or
  whether the Pattern itself is ready.
- The live adapter and the component library's fixture generator pass the new
  fields through unchanged; no screen reads them yet (#594 does).
- A QA case, `pattern-meal-two-causes`, holds Highs after meals with two
  admitted causes whose roster order and severity order differ, and a contract
  test reads it through the live adapter.

## Not in this change

- Any screen: the drill-down, the Queue card without a Focus button, the
  "Focus started" bar and the Pin → Focus rename are #594.
- Fold sentences on a folded cause's own row keep their order and wording.
- No per-cause Typical: every cause is drawn against the Pattern's one Typical.

## Risk contract

- **Must prevent:** a Focus that watches a lever other than the one the request
  sent (silent incorrect success), including through a retried request; a
  change to crediting, to any Pattern's count, denominator or share, or to the
  published roster; a cause trace drawing an episode its share does not count,
  or a share whose episodes no trace draws; an order or a `pinnable` verdict the app derives rather than
  reads; a cause served `pinnable` that the Focus endpoint refuses as a
  non-member, or the reverse; a second implementation of the order (the projection and the case
  file read one rule); a fixture or QA expectation re-baselined without its
  generator or derived from output at assertion time; any real value committed.
- **Must recover:** nothing automatic. Every new field is derived from recorded
  data on the next read; no stored row changes shape, and a Focus record keeps
  its subject.
- **Accepted failure:** severity is the claiming episode's, over that episode's
  bounded span, so two Occurrences in one episode carry the same severity, and
  a cause whose claims share an episode with another's can be ordered by harm
  the other cause also saw. The scenario engine prices its own hero and
  Pattern rank the same way. A cause whose habit is credited but not a member
  of the Pattern (too few episodes for the engine to price) is served with its
  share, order and trace with `pinnable: false`, and a Focus on it is refused.
- **Unsupported:** ordering or regrouping fold rows; ordering a Pattern's
  members; a per-cause count sentence wording; a Focus on a lever outside the
  Pattern's habit members.
- **Evidence owed:** tests through `GET /api/diagnose/findings`,
  `GET /api/diagnose/finding-case-file` and `POST /api/focus` on the
  `pattern-meal-two-causes` and `pattern-correction-collapse` case stores that
  fail on the base commit for the right reason: the shares come severity-first
  where roster order differs; each cause's trace draws exactly its credited
  anchors and the causes' anchors together are the pooled trace's; a sent member lever
  is kept, a non-member lever is refused with no Focus written, no lever pins
  the first member, and a retried pin with another lever is refused; each served cause's
  `pinnable` agrees with what the endpoint does with that lever (Correction
  stacking on `pattern-correction-collapse` is the false case). A
  test through `build_exposures` that every lever in an Occurrence's
  `attributed_levers` has a `claim_severity`, with the literal values the
  scenario engine scores for those episodes on `pattern-correction-collapse`
  (720.0 and 3377.5). The new case's literal `QaExpectation` and its
  generated test; the contract test's literal assertions for that case; every
  drift check green with regenerated fixtures; the five QA budgets re-measured
  without raising a limit.
