# Design — Explore history range

The interview history and grounding for these records remain in the
[scope ledger](../../../docs/scope/explore-history-range.md). This design records
only the decisions that the ledger marks for an ADR.

## ADR 138 — Selection and chart-only re-scope

This record covers these ledger rulings:

- **Changing the history stretch re-scopes charts only.**
- **Selection is fixed choices plus a free start-and-end date pick**
- **"Since my last setting change" is deliberately deferred, and the picker is built to admit it.**
- **The picker appears only in Explore.**
- **The chosen stretch holds while the app stays open and resets to 30 days on reload.**
- **Explore applies no thin-data gate of its own; each chart states its own support.**

**Decision.** Explore offers a Grafana-shaped history-range selector: fixed quick
ranges beside a free start-and-end date pick. The selector appears only after the
reader enters Explore. Its value is session-scoped, begins at 30 days, survives
movement within the open app, and resets to 30 days on reload. The picker model
must admit a future anchored choice such as "since my last setting change," but
that choice is not part of the first release.

Changing the stretch re-scopes Explore charts and nothing else. Ranked Findings
and every suggested number continue to use their fixed 30-day inputs. Explore
does not impose a shared thin-data hold: it asserts no advice, so each chart must
state the support and limitations of the data it draws.

**Why.** A reader-picked stretch can be chosen because it looks favorable. If
that stretch could feed a recommendation, the reader could accidentally choose
the advice. Keeping the picker inside the advice-free Explore mode also avoids
placing differently scoped charts beside advice that appears to come from them.
Resetting on reload prevents an old choice from silently framing a later reading,
while keeping the choice for the open session makes comparison practical. Chart-
owned support preserves honest interpretation without importing dosing support
floors into a surface that makes no dosing assertion.

## ADR 138 — Warm bounded ranges and recompute by revision

This record covers these ledger rulings:

- **The quick ranges are pre-warmed; an absolute date pick takes its wait.**
- **60 and 90 days are the warmed stretches beside today's 30; all history is not warmed.**
- **Charts paint as each one is ready, never held for the slowest.**
- **Entering Explore computes all three warmed stretches (30, 60, 90) at once, through the existing cache-and-sidecar path.**
- **A previously viewed window recomputes after the hourly pull; every Explore result stays keyed on the store's global input-data revision, exactly as the #82 epic's sidecar shipped it (ADR 123, `ciq_autotune/derived_artifacts.py`).**
- **While a stretch recomputes after a pull, Explore serves the prior revision's chart labeled with its age, exactly as Diagnose stale-serves (ADR 124).**

**Decision.** Entering Explore triggers the 30-, 60-, and 90-day chart shapes
together through the cache and durable sidecar path already established by ADR
123. They are the complete warmed set. A pinned absolute range computes on demand
and states that it may take time. Each chart paints when its own result is ready;
the fastest chart never waits for the slowest one.

Every result retains ADR 123's exact key on the Store's global input-data
revision and complete shape coordinates. After an hourly pull, a previously
viewed range therefore misses and recomputes when it is requested again. During
that recompute, Explore follows ADR 124: it serves the newest prior-revision
chart with the age of its inputs visible.

**Why.** Warming three fixed-size ranges on mode entry makes switching among the
common comparisons instant without returning to the hourly pre-warm saturation
that epic #82 removed. Warming all history would grow without bound, while a
bounded absolute pick cannot be predicted. Independent paint lets the sub-second
glucose-by-clock view remain useful while event evidence finishes.

A past range is not immutable after a pull. Tandem Source can backfill CGM rows
after a sensor reconnect: rows marked `cgmDataType=[1]` can land inside a window
that appeared closed. Exempting past windows would therefore require new keying
machinery founded on a false premise. The existing global revision is the honest,
lighter contract. Labeled stale serving is acceptable while it recomputes because
Explore is advice-free and the label keeps the older input revision visible.

## ADR 138 — Bounded chart parameters cannot reach advice

This record covers these ledger rulings:

- **An absolute pick may reach arbitrarily far back, but the window length is capped at 90 days, with a stated wait rather than a refusal.**
- **The range rides only on the Explore chart feeds as an explicit request parameter, and the backend clamps and enforces the 90-day maximum window.**

**Decision.** An absolute range may start anywhere in the available history, but
its inclusive span is capped at 90 days. The interface states that an arbitrary
range may require a wait; it does not offer an all-history choice.

The range is an explicit parameter only on Explore chart feeds. The backend
validates it and clamps the requested span to the 90-day maximum. Findings and
advice endpoints expose no range parameter, so a reader-selected stretch is
unrepresentable on every advice path.

**Why.** A fixed maximum bounds the work for every request without forbidding an
older question. Enforcing that maximum at the backend makes the cost contract
hold independently of the client. More importantly, keeping the parameter off
advice endpoints makes charts-only re-scoping a backend invariant rather than a
frontend convention: no picker state can be forwarded into a suggested number.
