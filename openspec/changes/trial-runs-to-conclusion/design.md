# Design

## ADR PENDING — A Trial short of its data days counts until its watch window ends

**Context.** The maturing rule asked for 14 data days inside a period of 14 days. For
a Trial whose target data lands on most days that holds. For a block-bound carb ratio
Trial it needs a meal in the block on nearly every date, and once the period closed
short the count could never move while the Trial stayed active for the rest of its
28-day watch window.

**Decision.**

1. A Trial's period ends 14 days after the change when its 14 data days are in by
   then, which is every Trial the old rule could complete, so those read as before.
2. Otherwise it ends at the close of the date its 14th data day lands. The whole date,
   so that a meal on it keeps its post-meal arc.
3. Otherwise it ends at the watch window's end, the change plus 28 days.
4. `_trial_end` owns this. The count, the gaps, the served Trial period and the
   selected evidence all read its answer, so none of them can disagree.
5. The window's end is unchanged: the reconcile records `expired_unreviewed` with the
   saved assessment. No ending kind is added, and a Trial short of its days is not
   made endable by hand, because `can_finish_trial` still reads the 14-day requirement.

**Alternatives.** Concluding every Trial at day 14 on what it had is a smaller change,
but it forms more verdicts on few meals. Lowering the requirement for block-bound
Trials adds a second number the surfaces would have to print.

**Consequences.** A sparse Trial can hold the one active change for up to 28 days, and
a Focus waits for it. A pump change still ends it. A Trial's After period can run
longer than its 14-day Before period in the selected evidence; the saved assessment
already reads its own periods. A retained Trial's roster read now spans up to 28 days
of its target data.
