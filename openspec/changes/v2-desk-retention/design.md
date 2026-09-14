# #414 design record

## ADR 414 — Diagnose stays alive across destination changes

### Decision

The Diagnose destination keeps its mounted workstation across navigation to
Changes and Day. Leaving detaches the root; returning re-seats it and resizes
its charts. No served read is issued on return. The reader's window, drilled
subject and reading scroll are retained as a consequence of the node surviving,
not as a second state store. A read is re-issued only on Retry, on a contextual
entry naming a different subject, or when the server's last written instant
differs from the one read at the last Diagnose read.

### Authority

Connor Griffin, 2026-09-14, answered triage Q1: "Exactly where you left it:
same window, same drilled finding, same scroll, no requests fired."

### Consequences

The desk's render lifecycle (routes.js: one teardown per render, HV2-34) gains
one destination that opts out of teardown, the way Day already retains its
frame across a selected-day read. The failed-read frames (S19, S20) and the
no-stale-result rule (HV2-29) are unchanged: a failed re-read still replaces
the retained desk with the error frame. No served contract changes.

## ADR 414 — The record roster groups retained trials into episodes

### Decision

The trials roster serves one episode key per retained trial record. Records are
chained in time order when each `changed_at` lies within the detector's existing
one-day profile tolerance of the previous record; a chain is one episode. The
roster response carries an `episodes` summary. Changes lists one entry per
episode with member rows beneath. The episode is a grouping of retained records
for reading; it is not a trial identity, an ending, a watch, or an admission
input.

### Authority

Connor Griffin, 2026-09-14, answered triage Q2: fold per-slot rows from one
editing episode into one entry, in this ticket.

### Grounding

On a read-only snapshot of the operator's own store, 79 retained records
reconcile to no plan application, so the plan is not a usable key; their change
instants chain into 8 episodes at the one-day tolerance, none spanning more than
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
- **Accepted failure:** a cold roster read on a slow host still takes seconds;
  the named loading text stands until it answers. The 503 after three crossed
  writes remains a clear stop with Retry.
- **Unsupported:** grouping records across more than the one-day tolerance;
  inferring an episode for records with no `changed_at`.
- **Evidence owed:** bounded-read equivalence of maturity and gap facts;
  episode chaining at the boundary (exactly one day apart chains, one day plus
  one minute does not); zero served reads on a tab round trip; window, drill
  and scroll retention; failed re-read frames; the roster entry and member
  rows; the disposition word; the named loading text.

Why: the roster read and retention are state-machine changes whose failure
mode is silent staleness. Disposition: copied into the #414 execution lock.
