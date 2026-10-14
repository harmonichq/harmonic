## ADR 500 — A change made on the pump is a Trial on its own, and ends what is active

**Context.** Connor decided on 2026-10-14: "Don't throw something away just
because it wasn't started in-app. User making profile changes on pump is
authoritative and ends any existing trial or focus." Before this change, a
switch that moved one carb-ratio block was dropped from the Trial candidates,
and was re-admitted only when an applied Plan's annotated block group matched
it uniquely within three days (ADR 581, which amended ADR 579 §5). The dose
stream's whole-parameter observation of the same move was then suppressed as
corroborating the dropped switch, so nothing was recorded. On the operator's
store, a carb-ratio block change read on 2026-10-12 with no applied carb-ratio
Plan left admission at `no_active_change`. An in-place edit of the active
profile was read from the settings reads only for carb ratio and only with a
matching Plan. For every other setting it was seen only through delivery
history, dated at its first observation.

**Decision.**

1. **A pump change is read off two consecutive settings reads.** When the
   active IDP differs, the change is the outgoing profile, as the later read
   holds it, against the incoming one, as before (#331). Otherwise, when the
   active profile's schedule of any segment setting differs across the two
   reads, the change is an in-place edit. An edit to an inactive profile is
   never delivered, and an in-place split or merge of segments that moves no
   value delivers nothing new, so neither is a pump change. Every pump change is dated at
   the later read and remembers the earlier read.
2. **One setting is targeted, per block; several are whole-profile.** Each
   changed setting's two schedules are compared piecewise over the union of
   their boundaries. Adjacent stretches that moved between the same two values
   are one block, across midnight too. When one setting moved, each block is
   its own Trial, slotted at the block's start, with that block's before and
   after. A block over the whole day carries no slot, as `diff_profiles`
   already did. A carb-ratio block owns its wrap-aware arc and member starts as
   its identity and cohort, exactly as an ADR 581 block did. Its members are
   the incoming schedule's starts inside the arc. When two or more settings
   moved, or the later read no longer holds the outgoing profile, the change is
   one whole-profile Trial.
3. **ADR 581 is revised: a Plan is never required.** ADR 581 admitted a block
   only through an applied Plan's provenance. It feared that an uncorroborated
   block change would surface general, non-isolated I:C evidence. But the two
   settings reads either side of the change record the full schedule before
   and after it. The block, its before and its after are observed, not
   inferred, so the evidence is as isolated as a Plan-matched block's. An
   applied Plan group that uniquely matches the change still annotates it: its
   member starts become the Trial's, and the Plan receipt still names the
   Trial's block. An ambiguous or non-matching Plan only stops annotating.
   ADR 581's fail-closed rule now governs the annotation, not the Trial.
4. **Endings reuse `superseded` and `trial_preempted`; no ending kind is added.**
   `superseded` already means a later detected change, outside the record's own
   Edit and inside its watch window, ended it. A Trial is only ever detected
   from what the pump ran, so every such change is a pump change. A new kind
   would name the same fact twice and split history readers. It would also
   break the outcomes requirement that the ending rule "SHALL NOT add an ending
   kind". A Focus already ends `trial_preempted` when a Trial takes the watch.
   Its served copy says a setting change took the active-change seat, which is
   the operator's "ends any existing … focus". What changes is that more pump
   changes are now detected, so they end what is active and the frontier
   advances to them.
5. **ADR 442's Edit rule is kept.** A pump change within a day of an open
   record joins that record's Edit and does not end it, because a delivery
   observation of one edit lands slot by slot across a day. The newest change
   still advances the frontier, so it is the active Trial either way.
6. **Corroboration counts from the earlier read, inside the block.** Reads are
   taken at fetch time, so the delivery feed and the dose stream can carry a
   new value before the read that first shows it. A dose or delivery candidate
   with the same setting, before and after, landing after the earlier read, is
   that pump change rather than a second Trial. Before, it counted only after
   the later read. A slotted delivery observation counts only inside the block
   the reads moved, so an unrelated slot moving by the same values stays its
   own Trial.
7. **A change is never recorded twice.** A retained record can hold a pump
   change under the delivery dating, for two reasons. An earlier build recorded
   it that way, or a fetch brought the delivery feed without its settings read.
   Such a record names the same setting, before and after, inside the block,
   dated after the earlier read and within a day of the later one. When one
   exists, the pump change adds no second record. The pump change's own record,
   dated at the read, never counts.
8. **The walk-back rule is unchanged in substance.** A pump change whose blocks
   exactly undo the preceding pump change's, inside the maturing window, closes
   both, for edits as for switches. It is now compared block by block rather
   than on `diff_profiles`' first-changed slot.

**Dosing.** No analyzer's staging predicate changes: `asserts_move`,
`ic_asserts_move`, `isf_asserts_move` and the basal eight-night floor are
untouched. Guidance already withholds its selected action while a watched change
is active (`active_change`, the one-watched-change rule of ADR 0029). More pump
changes are now Trials, so the Queue holds its next action back during more
stretches. That is existing admission gating, not a new recommendation.

**Consequences.** A Plan is still confirmed, now through the Trial-matched
receipt when its read shows the edit after the decision, as a switch already
was. The pump-read confirmation and its one-day Trial link (ADR 431, ADR 463
decision 7) still serve a change read before the decision was recorded. The
plan spec's two in-place-edit scenarios are rewritten to that reality. Read from
the code path, not run against the operator's store: the next reconcile of an
existing store records every past pump change the old rule dropped. Those beyond
their 28-day window end at once, so history gains records it should always have
had. The 2026-10-12 carb-ratio change should become the active Trial.

## ADR 506 — A basal pump change is measured across its whole block

**Context.** ADR 500 decision 2 made each block a targeted pump change moved
its own Trial, and gave a carb-ratio block its wrap-aware arc as identity and
cohort. A basal block got only its starting slot. The comparison then read every
basal outcome — time in range, time below range, time above range, Rest windows
with a low — and the readiness count of qualifying clean nights over that one
30-minute slot. A 02:00–05:00 basal change was judged on 02:00–02:30, before the
insulin acts; the lows it targets sit at 04:00–05:00 and were never counted.
Connor decided on 2026-10-14: "I do believe it is reasonable [for a trial to
cover more than a 30-minute block]... for example, I could change my insulin
to carb ratio from noon to seven, and that would cover more than just a
30-minute block."

**Decision.** This amends ADR 500 decision 2.

1. **A basal block owns its arc.** A targeted basal pump change carries the
   wrap-aware `[start, end)` block the two settings reads show moving, the same
   shape a carb-ratio block carries, and the retained record keeps it. A basal
   block carries no member starts; those stay a carb-ratio annotation.
2. **Every basal outcome and its readiness read the whole block.** The
   comparison's population is the coverage-qualified Rest windows clipped to the
   block on each date, across midnight when the block wraps. Readiness counts
   qualifying clean nights for every slot inside the block, and the setting
   history that bounds both periods is the block's. The served Trial evidence
   reads its time in range and time below range over the block's readings. A
   slotted basal Trial with no block still reads its one slot.
3. **Identity does not move.** A basal block Trial keeps the slotted id a basal
   pump change has always had. The block's end minute is not folded into it as a
   carb-ratio block's is, because one pump change never yields two basal blocks
   from one start, and folding it in would orphan every basal record already
   saved. `same_change` already matches on block, and a delivery-detected basal
   change still has none.
4. **A record saved without its block is read through its own reads.** No
   retained record is rewritten (outcomes requirement, ADR 463). A basal record
   saved at a pump change before this carries no block, so the comparison takes
   the block the two reads either side of its own change show moving from its
   slot, with its before and after. It never reads the current settings, so a
   later repartition cannot retarget it.
5. **What stays carb-ratio-only.** The meal cohort is a carb-ratio block's: a
   basal Trial's meals and post-meal arc stay period-wide context. A basal Trial
   matures on the clock, because a change read after its block's hours would
   otherwise count its own day as a data gap. The Plan-group annotation, the
   pump-read Plan link exclusion and the delivery-regime reversal skip stay keyed
   to a carb-ratio block, so a basal block Trial still links to a confirmed Plan,
   and its lead slot's delivery reversal is still read.
6. **Whole-day and whole-profile Trials are unchanged.** A whole-day basal change
   already read every slot and every Rest window, and a whole-profile Trial reads
   the whole period.

**Dosing.** No analyzer's staging predicate changes. This changes only what an
observational follow-up reads after a change has been made. A basal Trial's
verdict now counts the lows inside its block, so a change that worsened them
reads `concerning` where it read `unclear` before.

**Consequences.** Each basal Trial with a block longer than 30 minutes is
reassessed on its whole block at the next read; a saved ending's assessment
stays as it was captured. The synthetic QA cases' basal Trials move only
03:00–03:30, so their verdicts are unchanged. A basal change seen only in
delivery history is still one Trial per slot, measured over that slot: the feed
names no block, and grouping those slots would change the identity of records
already saved under it.
