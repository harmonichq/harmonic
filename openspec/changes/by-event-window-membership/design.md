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
5. **The projection retains both membership facts** — its outcome-anchored window
   and the consequence-landed rule — without re-deriving either in the browser.

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

## Safe-start provenance — the `/ui-craft` revise lane (#62)

Recorded by the coordinator before the revise lane ran, per `/ui-craft`'s
"Prove the app is safe to start" precondition, which requires the declaration
path, the quoted command, the named data source and that source's provenance to
be written into the change's decision record.

- **Declaration path.** `AGENTS.md`, section "The data boundary", line 159. That
  section is the repository's own statement of what may be started and against
  what; nothing here improvises an entrypoint.
- **Quoted command**, verbatim and the only sanctioned one:

  ```sh
  uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite
  ```

  `--no-fetch` is mandatory. `AGENTS.md` states that normal startup fires a live
  OAuth login against the pump vendor, possibly with 2FA, and pulls real data, so
  plain `harmonic serve` and every `harmonic fetch` are forbidden in automated
  work and were not run.
- **Named data source.** `mockups/revise-e2e.synthetic/harmonic.sqlite`, passed
  explicitly on the command line. The database is never selected implicitly, so
  the source is unambiguous.
- **Source provenance.** The file is generated in full by the committed
  `scripts/gen_revise_e2e_db.py`, whose own docstring records that every reading,
  delivery and dose is manufactured from a fixed seed and that the database
  "contains no account, credential, vendor, pump, or patient source data". The
  generator carries a `--check` mode, so the committed database cannot silently
  diverge from it.

This satisfies the revise lane's stricter risk contract: the entrypoint is
declared rather than discovered, the source is a synthetic database rather than a
manufactured-looking snapshot, and no path in the command can reach real pump
data. No trial run was used to establish any of the above.

## Rendered-header regression correction — #58, 2026-08-20

The original S33 replay read only `#canvas-head.hidden`. The mount set that
property correctly, but the shipped `.canvas-pane > header.canvas-head` rule
still computed to `display: grid`, so the clock header occupied a full row above
the event header while the story reported success. The strengthened story reads
computed display and layout presence for both headers after driving the visible
ALIGN buttons in both directions.

Against base `f50055c`, that story produced the required red result: 41 of 42
stories passed, with S33 alone reporting `expected "none", got "grid"`. The
correction keeps the existing `hidden` state owner and gives that state its
missing rendered effect in the workstation stylesheet. S33 and the failed-fetch
recovery story S34 then passed together, and the full built-app replay passed all
42 stories. No membership, selection, support, chart, inspector, or advisory
behavior changed.

The paired review evidence is committed under
`docs/screenshots/issue-58/f6717d1/`: base and corrected **By clock** / **By
event** states in light and dark at 1440×900 desktop and 1024×900 tablet widths,
16 renders in all. Every render used the declared no-fetch server, generated
SQLite database, committed Diagnose payload, and the same `Late bolus` public
interaction path as S33. The corrected By event renders show one chart-header
band with no duplicate, overlap, or wrapped header at either width; the By clock
renders retain the clock header.

## Amendment — shared chart header and caption retirement (#58, 2026-08-20)

ADR 62 amendment 5 is superseded only in its rendered-caption requirement. Both
public callers retain projection and population membership behavior, but no longer
render the `Window episodes` explanation. The standalone lens owns one
self-contained header. The embedded lens receives the workstation's existing
`canvas-head`, replaces its contents while `By event` is active, and restores the
clock title and readout on every exit path.

Sanction: Connor Griffin · 2026-08-20 · "Drop all that shit. It's a chart."

## Accepted shared-header evidence — #58, 2026-08-20

Connor Griffin accepted Candidate 1 on 2026-08-20. The accepted visual evidence
lives in `docs/screenshots/issue-58/shared-header/`. It is a deterministic
32-render matrix: the pre-revision base worktree at
`dd1dace59b44e060e34732f90a480791176c44b6` and the accepted candidate, each at
1440×900 and 1024×900, light and dark, By clock and By event, at rest and while
hovering the chart. `base-measurements.json` and `accepted-measurements.json`
record the accompanying geometry observations.

Every render used the repository's Diagnose replay opener against the declared
offline command and generated synthetic database:

```sh
uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite
```

The captured public interaction selects the visible `Over-treated low` finding
and drives the visible ALIGN buttons. In all accepted renders the shared header
occupies the same 85–115 px band (30 px) under both alignments. By event renders
`LOW RESPONSE COMPARISON` with the `Over-treated low` label in that rail; hover
uses the same rail. No accepted event render has a second header or the retired
window-membership caption, and the pane retains its 85–874 px bounds. The base
evidence visibly retains the rejected lower event header (38 px at 1440 px and
54 px at 1024 px) and its caption.

The prior after-renders under `docs/screenshots/issue-58/f6717d1/` are
superseded as acceptance evidence by this matrix. They remain in the repository
as historical correction evidence.
