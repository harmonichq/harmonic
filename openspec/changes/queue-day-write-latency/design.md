# Design — Queue and Day writes (#610)

## ADR 610 — A Queue write keeps the Queue's roster and leaves Changes to read its own

**Context.** The Queue reads the Trial roster for one fact: whether a queued
basal block lies in a complete Trial (`queue-model.ts`, the setting detail's
`trial`). The engine keys the roster on the input revision, so after any
follow-up write it recomputes on demand, and on a long history that takes tens
of seconds on a server that answers one request at a time. On the synthetic QA
store, after a snooze, the guidance and the findings answered from the engine's
cache and the roster missed it.

**Decision.** A Queue write re-reads the Queue's own answers and composes the
Queue with the roster it already holds. It forgets the roster and Changes'
answer without reading them. Changes draws its loading state until its own
read after the write lands, so a Focus or Done shows on Changes only once the
engine serves it.

**Why the held roster is safe for the Queue.** A Snooze, Restore, Done, Undo or
Focus writes follow-up state only. A Trial's state and its window, the facts
the Queue's `trial` reads, are not written by any of them.

**Consequence.** Opening Changes right after a Queue write shows its skeleton
while the roster recomputes, where it used to show the roster at once after a
slow write. Changes' own End keeps reading the roster before it resolves.

**Rejected.** Reading the roster behind the Queue's re-read: on the one-request
server it sits in front of the next snooze's guidance read, which is the delay
this ticket removes.
