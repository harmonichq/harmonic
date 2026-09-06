# Design — admit the all-day I:C block's exclusive end into plan validation (#357)

## ADR 357 — `block_end_min` is an exclusive end on `(0, 1440]`, matching `HistoryIdentity`

### Context

`ciq_autotune/store.py`'s `_validate_ic_block_groups` (#581) cross-checks every
staged I:C row that carries an `ic_block_provenance` claim. Its one bounds
predicate is applied to both ends of the arc:

```python
def _minute(value):
    return isinstance(value, int) and not isinstance(value, bool) and 0 <= value < 1440
...
if not _minute(start) or not _minute(end):
    raise ValueError(f"plan item {idx} has an invalid I:C block bounds {prov!r}")
```

Three facts, each checked against this tree, say that bound is wrong for the
end:

1. **The analyzer publishes 1440.** `ic_history.schedule_blocks` closes its last
   group at `_DAY_MINUTES` (`end = segs[index + 1][0] if index + 1 < len(segs)
   else _DAY_MINUTES`), and `analyzers/ic.ic_blocks_from_segments` documents the
   degenerate case in its own docstring: "A flat profile degenerates to a single
   24 h block (`start_min == 0`, `end_min == 1440`) — a safe no-op, not a
   special case."

2. **The same field is already validated correctly elsewhere.**
   `ic_history.HistoryIdentity.__post_init__` — in the module whose docstring
   calls it "the only authority for historical I:C and meal-run identifiers" —
   requires `block_start_min` in `[0, 1440)`, `block_end_min` in `(0, 1440]`,
   and the two unequal. Plan validation and history identity therefore disagree
   about the domain of one field, and the disagreeing one is the gate on the
   save path.

3. **The rest of the group check already handles 1440.** The arc is read
   wrap-aware as `wrap = end < start`; with `start = 0` and `end = 1440` that is
   `False`, and the member test `start <= m < end` admits every member of the
   all-day block. Only the bounds predicate rejects it.

### Decision

Give the exclusive end its own predicate, `0 < value <= 1440`, and keep
`block_start_min` and every member start on `[0, 1440)`. The comment beside it
names `ic_history.HistoryIdentity` as the domain being matched, so the next
reader finds the pairing rather than re-deriving it.

Two consequences are deliberate:

* **`block_end_min == 0` is no longer accepted.** Today it is, and it is
  unreachable: a wrapping block's end is `head.end_min`, which is `segs[1][0]`
  and therefore strictly greater than `segs[0][0] >= 0`. `schedule_blocks` can
  publish an end of 0 for no schedule, and `HistoryIdentity` already rejects it.
  It was only ever a second, ambiguous spelling of the arc that ends at
  midnight, which `1440` now expresses.
* **Store does not import `HistoryIdentity`.** The two validate different
  objects: `HistoryIdentity` is a frozen three-field identity that also requires
  a positive finite ratio, which a plan row's provenance does not carry, and it
  raises its own messages. Constructing one inside the plan validator to borrow
  a bound would put a ratio requirement on the save path to reuse two
  comparisons. The bound is single-sourced by the citation and by the spec
  requirement this change adds, not by an import.

### Consequences

An all-day I:C block that asserts a move can be staged, applied and read back
from plan history. Nothing else about the group check moves.

One downstream limitation is left standing and is **not** in this change's
scope: `watched_change._in_arc` computes `span = (end - start) % 1440` and
returns `False` for every minute when that span is 0, so a full-day block's arc
reads as empty there. `_ic_change_matches` would therefore find no interval
inside the arc and return `False`, and a block-scoped Trial for an all-day block
would fail closed — no roster entry rather than a wrong one. That is Verify's
evidence-admission path, not the plan save path this ticket reports, and it is
already fail-closed; changing it is separate work.

### Generated facts

Run in this worktree, against the unchanged tree:

```
$ uv run python -c "
from ciq_autotune.store import validate_plan_items
from ciq_autotune.analyzers.ic import ic_blocks_from_segments
print('blocks:', ic_blocks_from_segments([(0, 5.6), (420, 5.6), (660, 5.6), (1080, 5.6)]))
print('wrap  :', ic_blocks_from_segments([(0, 8.0), (420, 9.0), (1080, 8.0)]))
prov = {'block_start_min': 0, 'block_end_min': 1440, 'block_member_start_mins': [0, 420, 660, 1080]}
items = [{'type':'ic','key':s,'start_min':s,'value':5.7,'ic_block_provenance':prov} for s in (0,420,660,1080)]
try:
    validate_plan_items(items)
    print('validate: ACCEPTED')
except ValueError as e:
    print('validate: REJECTED ->', e)
"
blocks: [{'start_min': 0, 'end_min': 1440, 'value': 5.6, 'member_start_mins': [0, 420, 660, 1080]}]
wrap  : [{'start_min': 1080, 'end_min': 420, 'value': 8.0, 'member_start_mins': [1080, 0]}, {'start_min': 420, 'end_min': 1080, 'value': 9.0, 'member_start_mins': [420]}]
validate: REJECTED -> plan item 0 has an invalid I:C block bounds {'block_start_min': 0, 'block_end_min': 1440, 'block_member_start_mins': [0, 420, 660, 1080]}
```

The values above are synthetic, chosen to match the shape the ticket reports on
the `revise-e2e` synthetic server. No record from any real database appears here
or in the regression test.

With the exclusive-end predicate applied, the same snippet prints
`validate: ACCEPTED`, the draft save and apply round-trip, and
`uv run python -m pytest` reports `2227 passed, 1 skipped` — the same count as
the unchanged tree, so the loosened bound retires no existing assertion.
