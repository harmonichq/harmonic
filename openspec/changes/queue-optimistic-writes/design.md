# Design: the Queue's writes draw at once

## ADR 629 — A held Queue write is drawn by the served fields it writes

**Context.** Since #610 the live adapter holds the Queue's writes: the
subjects in flight, and the refused writes until they save. The screen hides
an in-flight subject from its list and nothing more. The Snoozed list, the
Snoozed count and the Queue's order are read from the served guidance, whose
`queued` flag the live adapter composes (admitted, not snoozed, and not
waiting for the pump after a Done; `live.js` `guidance()`), as the fixture
generator does on its side (`gen_ui_fixtures._queue_store`). Reproduced with
the adapter's fake client: while a snooze is held, `held()` names only the
subject, and the served candidate is still unsnoozed and queued, so the
Snoozed count does not move until the answer lands.

**Decision.**

1. `held()` reports each in-flight Snooze, Restore, Done and Undo as
   `{ kind, at }` keyed by subject, where `at` is the browser's wall-clock time the write was made
   (`YYYY-MM-DD HH:MM:SS`, the adapter's existing `now()`). When a subject has more than one write in flight (a Restore pressed
   on a row whose snooze is still in flight), the newest made is reported, and
   an older write settling does not remove it. A Focus in flight is reported
   apart from that map, as `focus: { subject, lever? }`, so a later write on the
   same subject (a Snooze from the desktop card that kept its Snooze) never
   hides it.
2. The Queue's order rule moves into one plain-JS module that the live
   adapter's guidance composition and the Queue model both import. It is the
   rule today's composition applies, unchanged. The generator keeps its Python
   copy: it is the other adapter, and the live contract tests compare the two.
3. The Queue model's selectors (`ranking`, `snoozed`, `snoozedCount`,
   `queuedCount`, `focusable`) take the held writes. For each held subject they
   set the served fields its write writes: Snooze sets it snoozed with its
   decision time `at`; Restore (and Undo of a snooze) sets it not snoozed; Done
   sets its acknowledgment waiting; Undo of a Done clears it. They then apply
   the one order rule. A held Focus makes `focusable` false and draws its own
   card pinned. Rank stays the served priority; eligibility stays the served
   admission. The model derives neither.
4. A held snooze's Until is a `Sourced` value of its `at` in the `until` format.
   Its source names the held write, not a served field. The story check traces
   every number to a served field, so no story ends with a snooze still held:
   each optimistic story releases its fake before the play ends, and the check
   then reads the served decision time.
5. The bars rise when the write is made, not when it resolves: "Snoozed until
   <date>" (on the phone after the swipe's exit, as locked), "Waiting for pump",
   and "Focus started". Undo moves its item back and clears the bar at once. A
   refusal clears the write's own bar, and "Not saved" outranks every bar, as
   today.
6. Reconciling needs no new code. The adapter removes a write from `held()`
   only after the Queue's answers are read again (#610), and App redraws once,
   then. The served state equals the drawn one, apart from the date
   (Accepted failure).
7. A write can now be made on an item while an earlier one on it is in flight
   (Undo, or Restore from the Snoozed list, while a snooze or a Done is still
   unanswered). The newest write is the person's intent. A refused write is not
   held as refused when a newer write was made on its subject after it. A
   Restore or an Undo of a Done is not sent when its subject's earlier Snooze
   or Done was refused: the engine answers a restore of an unsnoozed subject 200
   and does nothing (`api.py` `restore_guidance_preference_endpoint`), and an
   Undo of an unsaved Done has no acknowledgment to withdraw. So Retry never
   re-sends a write the person has since undone. Each subject keeps a count of
   writes made, which the adapter compares when a write is answered.
8. A held count (the Snoozed count, the "N patterns" count) keeps its served
   formula and adds or takes away the held writes as a whole-number literal,
   which the provenance grammar admits after a field (`provenance.js`). Its
   source therefore names both the served field and the held change. A held
   Until's source names the held write (point 4).

**Consequences.** One order rule serves both the adapter and the model. A
held write never changes what the engine is asked: Retry, the write order and
the 409 handling are #610's. Changes still drops its answer on every Queue
write (ADR 610).

**Alternatives rejected.** The adapter could patch the served answers in
place at commit. The stories' fixtures are static, though, so the stories
could not draw the same state, and a refusal would have to un-patch them. A
date-less bar until the answer lands is a state the lock does not have, and it
visibly changes on reconcile. The coordinating session chose the browser's
now + 14 d (#628, Q2 A), which is the lock's own field definition (§4.2
TransientBar: "the snooze-until date (now + 14 d)").
