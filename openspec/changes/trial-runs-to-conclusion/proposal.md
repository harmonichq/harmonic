# A Trial runs to its conclusion

## Why

A Trial needs 14 days carrying its target data, and only days inside the 14 days
after the change counted. A carb ratio Trial bound to a block counts only meals
inside that block, so two days with no such meal left it unable ever to reach 14.
Its count froze, the app read "Maturing" for two more weeks, the operator could not
end it, no Focus could be pinned, and it ended unreviewed.

## What changes

- A Trial short of its data days keeps counting after the 14th day, through the day
  its 14th data day lands, and at the end of its 28-day watch window stops with what
  it has.
- That one period end bounds the count, the gaps, the Trial period and the evidence.
- A Trial whose data days fill on schedule reads exactly as it did.
- The watch window, the ending kinds and the comparison's own readiness floors do
  not change. A Trial that reaches the window's end short of its days still ends
  `expired_unreviewed` with its saved assessment, which reads unclear below those
  floors.

## Impact

- `ciq_autotune/watched_change.py`, the Trial roster and detail it serves.
- The `outcomes` capability and the glossary's Maturing entry.
