# Design — one occurrence roster for both Finding lists

## ADR 298 — Converge the two Finding rosters, not the two panel families

#298 was filed to extract a cross-family drill-down panel shared by the settings
and behavioral inspectors. Grounding contradicted its premise: the settings levels
render only numbers-and-staging — no roster, no selection, no trace — so no
behavior is written twice across the families. The real duplication is the two
occurrence rosters inside the Finding case file, which build the same grouped
list idiom twice.

Decision (operator, 2026-08-31 scoping session): #298 delivers the intra-family
extraction — one roster mechanism with its two real callers today — and refuses
the cross-family panel until its second caller exists. #291's settings-side
roster becomes the mechanism's third caller when that redesign lands. This is the
charter's seam rule applied: two callers make a real seam; the cross-family
component had none.

The mechanism's front door is deliberately narrow: callers hand it groups (a
header with counts and its occurrence rows) plus row text and selection
callbacks; the mechanism owns pressed state, single selection, and the show-more
cap. Grouping policy — verdict bands versus server-named cohorts — stays with
each caller, because it is served projection shape, not presentation.
