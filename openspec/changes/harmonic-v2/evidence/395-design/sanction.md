# #395 design record — sanctions

Design round for the Pattern row and per-pattern chart on the shipped Diagnose
rail (`/ui-craft revise`, divergent-interactive rounds per `revise.md` §3).
Variants were DOM mocks injected into the served rail (QA copy-then-serve on
8765, ticket base `2e7f5a0c` + `d018affd` + `130c137e`) using the rail's own
classes; every variant carried `WIREFRAME — NO FIDELITY CLAIM — NOT LOCKABLE`.
Only the sanctioned render survives here; unsanctioned variants were deleted.

## Round 1 — row anatomy (2026-09-09)

Question: how does a Pattern row carry its members on the rail? Options:
A one Pattern row with its habits nested beneath as quiet one-line rows;
B one flat Pattern row naming its habits in the summary, members on drill only;
C a caption over full member rows with no Pattern row.

Sanction: Connor Griffin · 2026-09-09 · "A, definitely is the preferred."
Same message on the placeholder chart in the mock: "this graph tells me
absolutely nothing. If 7 of 32 meals ran high, that chart isn't showing me
anything. […] That's a useless chart. So we would need to improve that."

Settled for c3: one Pattern row in the ranked run (rail geometry of a priced
row: numeral, title, `◇ Pattern` flavor chip, summary line, denominator line
reading "k of n <noun> ran high/low", readiness note after the separator, mini
well), with each served `claimed_by` member painted directly beneath it as a
quiet one-line row (tail geometry, member hue tick, title, "· k of n <noun>",
drill chevron), outside the ranked numerals and the count line. Render:
`round1/sanctioned-A.png`. The chart in that render is a placeholder and is
not sanctioned; round 2 owns the chart.

## Round 2 — the per-pattern chart (2026-09-09)

Question: what does the mini show? Options rendered as DOM mocks in the
sanctioned row: 1 response vs typical meals (served cohort medians); 2 peak
after the meal; 3 time of day. Grounded first on the synthetic capture, then
re-rendered on the operator's own 30-day snapshot (read-only, local, deleted
after; no real-data render is committed here). On real data, concept 2 did not
separate misses from typical meals and concept 3 said when but not how high.

Sanction: Connor Griffin · 2026-09-09 · "1." Shown a variant with one line per
member: "I want a per member picture but not if the shape doesn't hold, and not
with leaking individual meal traces onto the chart." Shown a server-side
agreement gate: "I think we just drop the per-member traces. […] I don't want
the backend to try to guess if the data fits a preferred shape. That feels like
manipulating the stats to fit our narrative which isn't right." Shown the final
candidate: "bless it, record it and move on to round 3".

Settled for c2 and c3: the mini draws the Pattern case file exactly as served:
the comparison cohort as a median line with its p25–p75 band (legend "TYPICAL
MEALS · n"), the matched cohort (all misses together) as one trace in the accent
hue (legend "RAN HIGH · k", or the Pattern's outcome word), the 180 mg/dL line,
and the meal marker with a small "MEAL" label at the axis. No per-member cohort
is published or drawn, and no readiness or agreement rule is added to gate a
trace. Members appear only as the nested rows beneath the Pattern row, each with
its own count. The idiom is the shipped EVENT · RESPONSE mini's, applied to the
Pattern's own population.

## Round 3 — the whole rail, on the operator's own data (2026-09-09)

The rail was rendered as c3 would paint the operator's real 30-day window
(local snapshot, read-only, deleted after; renders stayed local) with every
ruling so far applied, and reviewed row by row in conversation. Rulings given
during the round, each with the operator's words:

- No summary line on a Pattern row ("we don't need the 'carb undercount and
  xyz explain the misses', isn't that carried by the drills beneath?"). The row
  is numeral, title, `◇ Pattern` chip, one denominator line "k of n <noun>
  <outcome>", the mini, and the nested member rows.
- No readiness note on the row ("drop the 'enough meals to focus'. That should
  be obvious based on where in the UI this gets shown"). Readiness renders
  where Focus is entered, not on the rail.
- Nested member rows carry one tick in the misses hue, the same orange as the
  Pattern's trace ("grey individual drill icons makes it look like they are
  part of the 'typical' band"), the member's title, and the member's own count
  in the Pattern's family.
- The mini uses the shipped glucose range rule (the 60–200 envelope widened in
  20 mg/dL steps to what is drawn), the MEAL/LOW marker label rides the marker
  inside the plot under the legend row with no gutter ("getting its own gutter
  is a waste of space"), and the x-axis is the served window of the case file.
- Two roster rulings moved to the backend (ADR 395 — Two Patterns count what
  the reader sees): meal bolus fell short counts in Highs after meals and nests
  under it; Lows after correcting highs counts over lows and its chart anchors
  on the low ("It should anchor on the low, right?").
- The flavor chip word changes from Habit to Cause on the rail ("nah do it now
  while we're still building this shit"); the glyph and the `habit:` identifiers
  stay. The glossary's lever-flavor entry names the new word.

Coordinator defaults not yet ruled on, applied by c3 unless the operator says
otherwise: a Pattern with zero misses in its window draws no chart well (its
denominator line already says it); a `count_status` Pattern renders its title
and "counts under review" with no rate and no chart; the chartless overnight
Pattern and every unadmitted Pattern render as title-only rows in the unranked
tail, as the shipped tail idiom already does.
