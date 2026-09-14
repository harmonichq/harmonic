# #414 design record

## ADR 414 — Diagnose stays alive across destination changes

### Decision

The Diagnose destination keeps its mounted workstation across navigation to
Changes and Day. A repeated press of Diagnose while already on Diagnose is
not a return (nothing parked the root) and re-reads as it always has,
restoring the shipped Findings index (S3). A press that lands while a return's
status check is still open joins that return: the check answers and the
retained desk re-seats, with no second read started for the press. Leaving parks the root hidden at the end of the document; returning re-seats it and resizes
its charts. The only request a return issues is one status read; no guidance
or evidence read runs. The reader's window and drilled subject are retained
as a consequence of the node surviving, not as a second state store; the
reading scroll is the one offset carried explicitly (see Consequences). A read is re-issued only on Retry, on a contextual
entry naming a different subject, or when the server's last written instant
differs from the one read at the last Diagnose read. The scalar compared is the
store's input data revision, served on `/api/status` as `input_revision`: the
Diagnose read records it with one status read issued first, alongside its
payload reads (no payload carries it; `input_data_age` is attached only to a
labelled stale predecessor; a write racing the reads either shows in the
payload too or moves the revision the next return compares, so the race errs
toward a re-read), and one status read on return is the only request a retained
return makes. Until that read answers the return shows the loading frame, never
the retained desk (Connor, Q4, 2026-09-14: the freshness check is visible, so a
write that landed while away is never shown as current, not even for one round
trip). The
fetch-status write counts are not an instant and do not move on in-app writes,
so they are not the signal. Leaving to another destination parks the root, keeps the workstation's
reading-pane stack, drilled chart and case context (they are the drill the
return preserves), and still disconnects the entry-restoration observer, which
is restoration machinery rather than retained state. The workstation stays
seated while parked; a read that completes off-screen is recorded but not applied
until the next return seats the root, which applies it with its restoration
(the one read that starts seated, the workstation's own Retry, applies in its
completion behind a seated-and-attached gate);
while any guidance read is pending every render shows the loading frame, never
the retained payload (HV2-29), so pre-write data is never presented as current, and the re-read path renders
immediately after leaving so no blank desk stands in between. The
pagehide arm keeps today's full teardown (S84). A retained return runs only the focus-action
repaint; entry restoration runs only after a read. A contextual entry whose subject, occurrence or window differs
from the retained entry is a different subject.

### Authority

Connor Griffin, 2026-09-14, answered triage Q1: "Exactly where you left it:
same window, same drilled finding, same scroll, no requests fired."

### Consequences

The desk's render lifecycle (routes.js: one teardown per render, HV2-34) gains
one destination that opts out of teardown, the way Day already retains its
frame across a selected-day read. One offset is carried explicitly: a browser
resets a removed element's scroll offset on re-insertion, so the reading
pane's scroll is captured when the root is parked and reapplied on the retained re-seat
(S109 found this against the built app; the surviving node alone lost it).
The root is parked in the document rather than removed because the
workstation resolves its elements by document id and a rail read that
completes after the reader has left paints into them: hidden but present,
that paint lands harmlessly; removed, it threw (S83 in the complete ledger).
Parking at the end of the body keeps any on-screen element that shares an id
first for a lookup; no v2 module shares one today. The failed-read frames (S19, S20) and the
no-stale-result rule (HV2-29) are unchanged: a failed re-read still replaces
the retained desk with the error frame. No served contract changes.

## ADR 414 — The record roster groups retained trials into edits

### Decision

The trials roster serves one edit key per retained trial record. Retained
records are chained in time order when each `changed_at` lies within the
detector's existing one-day profile tolerance of the previous retained record;
a chain is one edit. Detected-but-unretained trial candidates and Focus records
carry no key and do not chain. The roster response carries an `edits` summary
whose `parameters` is an ordered list of `{parameter, count}`. Changes lists
one entry per edit of two or more members, titled by its member count, with
member rows beneath; a one-member edit stays a flat row. The edit is a
grouping of retained records for reading; it is not a trial identity, an
ending, a watch, an admission input, or a Plan (the Plan's one-variable rule
is about what may be staged, not about how detected history is read). "Edit"
enters `CONTEXT.md` with this change; "Episode" is not used because the
glossary reserves it for a cluster of glucose anchors.

### Authority

Connor Griffin, 2026-09-14, answered triage Q2: fold per-slot rows from one
editing pass on the pump into one entry, in this ticket.

### Grounding

On a read-only snapshot of the operator's own store, 79 retained records
reconcile to no plan application, so the plan is not a usable key; their change
instants chain into 8 edits at the one-day tolerance, none spanning more than
two days. Counts only; no record-level value was read out.

### Consequences

The frontend reads the served key and never re-derives grouping from times.
Each member keeps its exact record route, its own ending and its own late
conclusion. A future change that reconciles records to plan applications may
serve a stronger key; this rule is the fallback when none exists.

## Risk contract

- **Must prevent:** a retained Diagnose presenting a stale result as current
  after the server wrote or a re-read failed; grouping altering any record's
  identity, ending, admission or watch; real data entering fixtures, stories,
  logs or comments.
- **Must recover:** a failed re-read on return shows the error frame with Retry
  (S19/S20); a roster read that crosses a write retries within its existing
  three snapshots.
- **Accepted failure:** every return to Diagnose shows the loading frame for
  one status round trip before the retained desk re-seats; a cold roster read on a slow host still takes seconds;
  the named loading text stands until it answers. The 503 after three crossed
  writes remains a clear stop with Retry.
- **Unsupported:** grouping records across more than the one-day tolerance;
  inferring an edit for records with no `changed_at`.
- **Evidence owed:** bounded-read equivalence of maturity and gap facts,
  including a reading at exactly the window end (the store read is half-open);
  edit chaining at the boundary (exactly one day apart chains, one day plus
  one minute does not); zero guidance or evidence reads on a tab round trip (the one status read is the only request); an in-app write on Changes followed by a return triggers one re-read; window, drill
  and scroll retention; failed re-read frames; the roster entry title and member
  rows; one-member edits and unkeyed rows staying flat; the disposition word; the named loading text.

Why: the roster read and retention are state-machine changes whose failure
mode is silent staleness. Disposition: copied into the #414 execution lock.
