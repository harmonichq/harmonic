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
