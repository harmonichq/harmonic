# Proposal — admit the all-day I:C block's exclusive end into plan validation (#357)

## Why

`_validate_ic_block_groups` in `ciq_autotune/store.py` guards every staged I:C
row that carries an `ic_block_provenance` claim. It checks the claimed block's
bounds with one predicate:

```python
def _minute(value):
    return isinstance(value, int) and not isinstance(value, bool) and 0 <= value < 1440
```

and applies it to `block_start_min` and `block_end_min` alike. But the two
fields do not share a domain. `block_start_min` is the arc's inclusive start, so
`[0, 1440)` is right for it. `block_end_min` is the arc's **exclusive** end, and
the I:C analyzer publishes `end_min: 1440` for a block that runs to midnight.
`ic_history.schedule_blocks` closes its last group at `_DAY_MINUTES`, and
`ic_blocks_from_segments` documents the degenerate case in its own docstring: a
flat profile is "a single 24 h block (`start_min == 0`, `end_min == 1440`)".

So the whole-day block — the shape a wearer with one carb ratio all day has —
is rejected by construction. `PUT /api/plan` answers 400 with `plan item 0 has
an invalid I:C block bounds`, and the change can never be staged or applied.
Expressing the same arc as `0 → 0` does not work either: the validator rejects
`end == start` as an empty arc, correctly.

The bound is an oversight, not an exclusion. The function's own docstring asks
only for "valid integer minute-of-day bounds", and `ic_history.HistoryIdentity`
— the module that is the stated authority for historical I:C block identity —
already validates the same field correctly, requiring `block_start_min` in
`[0, 1440)` and `block_end_min` in `(0, 1440]`. Two validators of one field
disagree, and the wrong one is the gate on the plan save path.

## What changes

- Plan validation checks the exclusive end against its own domain, `(0, 1440]`,
  so a block whose arc closes at midnight is accepted, and keeps the inclusive
  start and every member start on `[0, 1440)`.
- An all-day I:C block group round-trips through draft save, apply and plan
  history, pinned by a regression test that fails against the unchanged
  validator.
- The `plan` capability states the domain of a staged block's bounds, so the
  next reader finds the answer in the specification rather than in a predicate.

## Boundaries

Nothing else about the group check moves: an empty arc, a wrapping arc, member
containment, group completeness, duplicate members, value consistency and the
unannotated-row carve-out all keep their present behavior. No analyzer, safety
predicate, staging verdict, projection or fixture changes, and no rendered
surface changes — the frontend already forwards the analyzer's published bounds
faithfully. The panel head and watch dock printing that same block's span as
`00:00–00:00` is a separate defect (#356), and Diagnose reporting "staged"
after a rejected save is another (#358); neither is touched here.
