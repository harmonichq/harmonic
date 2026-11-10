# Design: the Queue offers Focus only where the engine admits one

## ADR 666 — Every Pattern and cause Focus button reads the Focus list's per-Pattern verdict

**Context.** `POST /api/focus` admits a Focus on a Pattern only when its
guidance row is ready, has an action, and the sent lever is one of its
pinnable habit members (`api.py` `_pinnable_pattern_members`). The Queue drew
Focus on a Pattern card from the global admission alone
(`admission.focus_pin.available`, ADR 594), and on a cause card from the
findings' cause `pinnable`, which is membership alone (ADR 593). On the
`basal-and-carb-ratio-lower`, `pattern-correction-collapse` and
`pattern-correction-fold` case stores every such Pattern is withheld, so every
Focus the Queue offered there was refused with 400. `GET /api/focus` already
served `pinnable_patterns` from the pin's own predicate, and the app ignored it.

**Decision.** Each `pinnable_patterns` entry also serves `levers`, the
Pattern's pinnable members from the same call the pin admits a sent lever by.
`queue-model.ts` `focusable(store, held, subject)` additionally requires a
Pattern subject to be listed there, and a cause card's `pinnable` is its lever's
presence in that entry's `levers`. The findings' cause `pinnable` stays served
as membership; the app reads neither it nor any readiness field for Focus. The
fixture generator's Queue store carries `pinnable_patterns` (`key`, `levers`),
and its Focus and drill-down states are picked by it.

**Consequences.** ADR 594's "a cause card draws its Focus button only when its
served cause is `pinnable`" now reads the Focus list's verdict. On
`pattern-correction-collapse` no cause card has a button, Correction on active
insulin's included, because its Pattern is withheld; the contract expectation
that pinned it focusable is corrected, and its drill-down story no longer
expects a focusable cause there. A standalone habit's card still follows
the global admission alone, as its pin does (ADR 528).

## ADR 666 — A write the engine refused outright is held only until a later write or a refused Retry

**Context.** ADR 629 holds a refused Queue write, with "Not saved" and Retry
outranking every bar, until it saves, its own Undo is made, or Retry is
answered 404. A Focus refused with 400 can never save, so the bar stayed for
the session and hid the Undo bar of every later Snooze or Done. The lock's
"Write failed" state is a *transient* bar with Retry (§1.2).

**Decision.** A refusal that is a 4xx other than 409 is refused outright: the
live adapter still holds it, so the control returns and "Not saved" with Retry
shows, but it is dropped when the person makes any later write, or when Retry
is refused outright again (the 404 case is one of these). A 409 conflict, and
any failure that is not a 4xx, is held as ADR 629 says.

**Consequences.** ADR 629 point 7's "a refused Focus shows Not saved with Retry
whatever follows it" now holds for a conflict only. A later write's own bar,
and its Undo, show once an outright refusal is dropped.

## ADR 667 — A follow-up write over a reconciled frontier reconciles nothing

**Context.** A snooze, a restore, a Focus and its End, and a Trial's End each
reconciled the whole history inside the request: the preference endpoints called
`reconcile_ingested_follow_up` after their write, and `lifecycle` read
`read_follow_up_history` and ran `reconcile_follow_up` before its own. On a copy
of a real history (72 thousand readings, 76 thousand deliveries, 2.5 thousand
boluses, 82 follow-up records) one reconcile took 45 s on a loaded machine, a
restore 18 to 38 s, and over half of a profiled reconcile was parsing the
stored timestamps of every delivery and reading (#667). A reload in that window
showed the state before the write, and an ended Trial as active again (#665).

**Decision.**

1. `watched_change.frontier_current(store)`: the frontier is reconciled at the
   store's current input revision. Only a reconcile, or a write that changes
   nothing a reconcile reads and carries a current frontier (#557), writes the
   frontier at a revision, so the follow-up state is then a reconcile's own
   result. On that copy a second reconcile changed no record and no frontier,
   advanced no revision, and returned the committed frontier's admission.
2. `lifecycle` reads no history when the frontier is current before its writer,
   and inside the writer takes the admission from `follow_up_admission` when it
   is still current; otherwise it reconciles as before. It still advances the
   frontier past its own write.
3. A guidance preference changes nothing a reconcile reads. Its set and restore
   run in one follow-up transaction (`write_unreconciled_state`) that carries a
   current frontier to the revision after the write; one already behind is
   reconciled after the write, as before.

**Not changed.** What a reconcile computes, what a Trial's ending assessment
computes, every write's cache invalidation (`follow_up_written()`), the two
revisions and the roster's `while_computing=False`. A write that ingests
recorded data, or finds the frontier behind, still reconciles in full.

**Consequences.** On a reconciled store a follow-up write's cost no longer
grows with the history: it is the write and, for a Trial's End, its ending
assessment.
