# By-event window membership

## ADR 62 — The by-event canvas and the findings queue answer one membership rule

**Context.** The Diagnose canvas and the inspector beside it counted two different
populations and printed the same caption over both. The inspector answers from the
findings queue, which takes arbitrary clock bounds and re-anchors every occurrence to
where its consequence landed. The event-comparison lens answers from its own
projection, whose only time coordinate is a fixed six-hour anchor-time block matched
on the raw anchor hour, so `ALIGN`'s `By event` mode approximated a drawn brace to the
standing preset's block and dropped the brace. Underneath, both read the same
`/explore/exposures` population. A reader saw the inspector count ten meal responses
that met criteria while the canvas drew none, with `14:00–24:00` written over both.

Two further facts made the disagreement invisible rather than merely wrong. The
canvas withholds an aggregate built from one occurrence, correctly, so a starved
cohort renders as an empty canvas that reads as a broken chart. And the clock
canvas's own header stayed mounted under the event-aligned canvas, which is what
printed the wrong window.

Harmonic's output is advisory insulin-dosing guidance. A reader who cannot tell what
population a number is over cannot judge the number, and ADR 31 part 6 already makes
scope membership server-owned for that reason. Choosing a block coordinate in
`paintAlign` is the browser composing membership.

**Decision.**

1. **One rule, one owner.** The event-comparison projection takes clock bounds —
   half-open, wrapping past midnight — and drops the anchor-time block coordinate.
   The bounds are the reader's standing window, drawn brace included, so the canvas
   and the inspector cannot disagree by construction.
2. **Membership is outcome-anchored**, by the same rule the findings queue applies:
   an occurrence attributed to a lever sits in the window its episode's outcome
   landed in, and an unattributed occurrence is its own outcome. The rule is
   implemented once and shared, never transcribed.
3. **The outcome minute is stamped at catalog-build time**, so a projection filters
   on a field rather than re-deriving an anchor. The fixture-only replay mirror then
   transcribes the filter instead of re-implementing the anchoring, and a parity test
   holds it to the Python projection the way decision record 735 holds the findings
   mirror.
4. **A cohort too thin for an aggregate draws its own episodes**, faint and named as
   episodes rather than as a typical response. The comparison-support floor is
   unchanged: one occurrence never becomes a median.
5. **The canvas states both facts it is standing on** — the window it counted in, and
   that an episode joins that window by where its consequence landed rather than by
   when its meal was. A pooled meal's bolus may sit outside the drawn window; that is
   the rule working, and it is said out loud.

**Consequences.**

- The six-hour anchor-time block leaves the wire contract, the lens's own retained
  read path, and the fixture-only mirror together.
- `paintAlign` stops choosing a coordinate and passes the window it already has,
  which returns this surface to ADR 31 part 6.
- Selecting an occurrence and the duplicated canvas header
  ([#57](https://github.com/harmonichq/harmonic/issues/57),
  [#58](https://github.com/harmonichq/harmonic/issues/58)) are the same request and
  the same mount, and close with this change.
- ADR 31 part 3 kept `WINDOW` on the grounds that a reader viewing by clock can also
  filter by clock. This settles the half it left open: the window filters under both
  projections, and only the alignment changes.

**Amendments — cold review, 2026-08-19.** Three cold panels against the work order
turned up four decisions the record above did not settle. They are settled here rather
than in a second record, because they are the same decision seen further down.

6. **The browser stops re-deriving membership entirely, not just on the canvas.**
   `inWindow` keeps an occurrence whose own clock minute falls in the window and feeds
   that list to the factor header, the clock canvas and the roster, which is a third
   rule disagreeing with the other two. The roster reads the keys the findings row
   already publishes instead.
7. **A finding the lens can re-project frames on the family its event view names.** A
   finding can hold episodes of two kinds — the meal, and the high the meal ran into —
   and framing on whichever holds more put a list of one kind beside a chart of the
   other. The panel and the chart show the same episodes.
8. **Selection keeps the server's unique occurrence id.** The episode-and-time pair is
   published beside it for joining only: two completed boluses can share an episode and
   an instant, distinguished solely by pump sequence number, and a pinned test says so.
9. **A finding that leaves the window keeps the reader.** Narrowing the window until
   the open finding has no row leaves the reader on it, both panes stating that no
   findings match the selected window. The alternative was a browser-side fallback
   filter, which is the thing part 6 retires.
