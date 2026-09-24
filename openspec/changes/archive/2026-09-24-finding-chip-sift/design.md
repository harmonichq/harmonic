# Design — finding-chip-sift

## ADR 61 — Chipping a finding by its result, not by the event it is counted over

**Ruling.** The findings sift has four chips, but they are not one taxonomy. A
finding earns its `highs` or `lows` chip from the consequence it produces, and
its `meals` or `corrections` chip from the context in which it is counted. A
finding may therefore carry more than one chip. The backend stamps this
membership and the frontend only uses the published chips to sift the queue.

**Context.** The queue answers two different questions. The excursion chips
answer which side of the glucose outcome the reader is trying to understand:
an over-treated low chips as a **HIGH** because the visible consequence is its
rebound, while a correction stack chips as a **LOW** because its visible
consequence is the overshoot. Both findings can come from the same day and
land under opposite excursion chips. The result-time anchor also means each
finding is scoped to the clock span containing that consequence, not merely to
the event that was counted.

The context chips answer a different question: what kind of exposure was this
finding counted over? `meals` and `corrections` are read from the finding's
`appearances[].family`. This asymmetry is deliberate. Result is the useful
answer to “why was I high or low here?”, while family is the useful answer to
“what was this finding counted over?” Treating both pairs as family labels
would make the first question unanswerable.

The measured shape in the scope ledger establishes why the asymmetry exists at
all. A pure family reading left the `highs` chip empty in every drawn span on
the grounded 30-day data, while consequence membership populated all four
chips. The result-based excursion side is therefore not an alternate spelling
of family; it is the part that makes the sift answer the excursion question.

**Settings direction.** Settings rows join the same excursion chips on the
side their change would address, using insulin direction rather than the
number's surface movement. The closed mapping is:

| parameter direction | chip |
| --- | --- |
| `basal_rate` raise | `highs` |
| `basal_rate` lower | `lows` |
| `carb_ratio` raise | `lows` |
| `carb_ratio` lower | `highs` |
| `isf` strengthen | `highs` |
| `isf` weaken | `lows` |

This is not “raise means high.” Basal `raise` adds insulin and addresses a
high, but carb ratio is grams per unit, so raising it removes insulin and
answers a low. Correction-factor `weaken` is owned by recurring
correction-caused lows, so it answers a low as well. The row belongs on the
side its change would fix, not the side suggested by the verb alone.

The mapping is indexed directly. Under the enforced analyzer invariants, a
directionless asserting settings row is unreachable, so a missing direction is
not an ordinary display case. A defensive `.get(..., [])` fallback was
rejected: it would turn a future invariant break into a silently unchipped row,
the silent-incorrect-success that this advisory surface's risk contract
forbids. A direct lookup fails at the boundary where the invariant was broken
and keeps that failure visible.

**Server ownership.** The whole sift is server-side. The projection owns result
and context membership, result-time window membership, and the settings
direction mapping. The frontend re-derives no membership, threshold, floor or
direction; it renders the server's chips and applies the user's selected chips
to the already-published rows. This extends ADR 730 and the repository's
recurring defect lesson: a frontend gate that re-derives a verdict can hide a
finding the backend asserted.

**The `/ui-craft` revise-lane safety record.** This shipped surface was revised
through `/ui-craft`'s revise lane. Its dev-server declaration path is
`AGENTS.md`, section “The data boundary” (`CLAUDE.md` is a symlink to it),
which names the following as the sole sanctioned offline exception. The exact
command run was:

```sh
uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite
```

The named data source was
`mockups/revise-e2e.synthetic/harmonic.sqlite`. It was generated in full by
`scripts/gen_revise_e2e_db.py`, is synthetic, and is drift-checked in CI by
`scripts/gen_revise_e2e_db.py --check`.

For a shipped surface, the revise lane's contract is the frozen behavior
ledger plus its replay script run against the built app. There is no lock
manifest and no fidelity ledger pinned to an app template, because this surface
ships.

**Consequences.** The queue can show a rebound under `highs` and an overshoot
under `lows` even when both findings belong to one day, while preserving the
meal and correction context that explains what was counted. Chips are
multi-membership and start all active, with nothing sifted and every row shown,
until the user deselects one; deselecting is what begins a sift. Choosing them
sifts only the list. The
chart remains the pooled time-of-day shape. Rows without an asserting
direction remain outside the chip system and retain the queue's existing
collapsed reachability while a sift is active.

**Explicitly not built.** The good-day/bad-day cohort split was dropped. The
window axis is time-of-day pooled across 30 days, so a day cohort would be a
second axis for which there is no machinery. Severity is not a filter axis:
no queue row has a severity field. Correction factor is not scoped to a clock
window in this change; that is its own ticket, so the row is marked
`window_scope: "whole_day"`.

Decision: harmonichq/harmonic#61, 2026-08-20.
