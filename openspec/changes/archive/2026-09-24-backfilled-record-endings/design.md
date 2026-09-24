# #442 design record

## ADR 442 — Every retained change record ends by one rule

### Context

Reconciliation (`reconcile_follow_up` in `ciq_autotune/watched_change.py`)
records a retained Trial record for every reviewable detected change in the
whole history, then considers an ending for two records only:

- the admission frontier record, which ends `reverted` at the detector's
  reversal, else `superseded` when the newest later detected change lands inside
  its 28-day watch window, else `expired_unreviewed` once that window has passed;
- the newest record, when it is later than the frontier, which ends
  `expired_unreviewed` only when its own window has already passed.

Every other retained record is never revisited. It keeps an ending with no
kind, and Changes reads it as "Still open" with the watch disposition "Not
watched". ADR 386 chose this on purpose for records found on first
reconciliation ("retain older records as history; do not auto-finish or date
them"). The operator saw its cost on their own history: changes superseded
months ago, or long past their window, read as open forever.

Three facts were measured in process on synthetic stores
(`premises.py` in this change, output below):

1. **The frontier's supersession reads any later detected change, of any
   setting.** A live correction-factor record ends `superseded` when a
   carb-ratio change lands ten days later. The desk's note for that ending
   ("A later change to the same setting took over") is therefore already false
   for the live watch.
2. **A Trial comparison ignores the ending's instant.** `compare_follow_up`
   bounds a Trial's After period at the next relevant setting change or its
   `data_cutoff`, and never reads `ending.effective_at`. A Focus comparison does
   read it. Every reconcile ending today passes `data_cutoff=now`, so an ending
   recorded after the fact reads evidence past its own instant. `c4-isf` and
   `c4-profile` save an expiry dated 06-29 with data read to 07-01.
3. **One comparison input cannot be bounded by the data cutoff.** A record's
   retained comparison context is captured once, at the reconcile that first
   records it, from the latest pump read at that time. For a record recorded
   after its ending, that pump read can post-date the ending.

### Decision

Settled by the coordinator's ruling R442 under the operator's delegation
(Connor Griffin, 2026-09-23, "figure it out yourself from here"). R442 was
corrected on 2026-09-23 after triage, and the coordinator's rulings on the three
triage questions settle the rest:

- any later detected change supersedes, whatever its setting, which is the
  frontier's actual rule. R442's earlier "same setting" wording was an error;
- one cut rule applies to every reconcile ending, the live frontier included;
- the superseded note is reworded, in this change;
- after plan review round 1: a change inside the record's own ADR 414 Edit never
  supersedes it, and `follow_up_comparison.py` gets exactly two touches, the
  period-end label and an exported unavailable envelope. Its periods and values
  are otherwise unchanged;
- after plan review round 2 (option a): the label line stays. A supersession by a
  dose-detected change of the same setting keeps `data_tail`, recorded as a
  consequence and pinned by a test.

1. **One rule for every open record.** After a reconcile has recorded its newly
   detected changes, reconciled Plan receipts and confirmed a pending Plan, it
   evaluates every retained Trial record whose ending has no kind. It goes oldest
   first, by detected change time, then record id. For each record:
   - `reverted` at the detector's reversal of the record's change, when one exists;
   - otherwise `superseded` at the earliest change this reconcile detects that is
     strictly later than the record's change, outside the record's own Edit, and
     earlier than the end of its watch window (the change plus 28 days);
   - otherwise `expired_unreviewed` at the end of the watch window, once the
     reconcile's data instant has reached it;
   - otherwise the record stays open.

   The frontier record is evaluated by the same rule. With one new detected
   change per reconcile, as in live use, the rule records the same ending kind
   and effective time the frontier branch records today, except when that change
   is in the frontier's own Edit. Then the frontier is not superseded (see the
   Edit rule below and Consequences). In both cases the saved assessment's
   cutoff moves (Decision 3). When several later changes arrive in one
   reconcile, the frontier now ends at the first of them, not the newest. The
   frontier's advance, the admission verdict and Focus preemption are
   unchanged. A record that ends is never promoted to the watch. The superseding
   change is read from this reconcile's detected changes, as the frontier's is,
   never from other retained records.

   **A change in the record's own Edit, as the recording reconcile reads it,
   never supersedes it.** An Edit is ADR 414's run of retained records within a
   day of each other. The pass reads it through the existing `_group_edits`,
   over the retained records of the reconcile that records the ending. That is
   the one grouping the roster already serves; no second grouping rule is
   added. A multi-slot basal edit is
   detected as one record per 30-minute slot, each at that slot's first
   observation on the day, so siblings land minutes or hours apart. Without the
   exclusion the first slot's record would be superseded by its own sibling
   (premises: `multi-slot-edit`). With it, an Edit's records end by the rule
   applied to the first detected change after that Edit, or expire at their own
   windows.

   A later reconcile can regroup. A change known only from dose-stamped boluses
   settles `_MIN_EPOCH_DAYS` observed days after it lands. It can then land
   between a record and the change that already superseded it, and chain the
   two into one Edit (premises: `late-settling-bridge`). The saved ending
   stands, because:
   - it was recorded against a separately detected change and was correct when
     written, and endings are first-wins;
   - the recording reconcile's Edit decides whether a later change supersedes
     a sibling; a later regrouping is display-only and never reopens a saved
     ending;
   - holding every supersession back for the settle window would add machinery
     and delay every live ending.

   This is an accepted failure in the risk contract, and task 1.4 case (m) pins
   it.
2. **First-wins and immutable.** A record whose ending has a kind is skipped.
   `capture_ending` already returns such a record unchanged, and Store refuses to
   replace a saved ending. No new ending kind, open state or "recorded
   retroactively" state is added.
3. **A saved assessment reads evidence only up to its ending instant.** Every
   Trial ending a reconcile records is captured with `data_cutoff` equal to the
   ending's effective instant. The ending's recorded time stays the reconcile's
   time, so a backfilled ending shows when Harmonic recorded it. Every evidence
   read in the comparison is already bounded by that cutoff. Glucose, bolus,
   basal, pump events, carb entries and prompt answers are read by the time of
   the event they describe. Pump reads are read by capture time. Low-prompt
   rescue answers are also bounded by when they were answered. A user's answer
   entered after the ending, about a reading before it (a false low, say), is
   read as every comparison read reads it: it corrects evidence from before the
   ending and adds none from after it. Excluding it would change the comparison
   engine, which this change does not touch. The one input the cutoff does not
   bound is the retained comparison context. When that context is
   available and its source pump read was captured after the data cutoff,
   `capture_ending` saves the assessment unavailable with reason
   `context_after_ending`, and computes no comparison for it. A context from a
   pump read at or before the ending instant is exactly what a capture at that
   instant would have read, so the comparison runs. The check lives in
   `capture_ending`, not in the comparison engine. A manual finish or a Focus
   ending passes the reconcile instant as its cutoff, so the check never fires
   for them.

   The unavailable assessment is built by the engine's own envelope builder, not
   a second copy of its shape. `follow_up_comparison.py` exports the envelope
   `compare_follow_up` starts from and returns when it cannot compare: context,
   blank periods, views, rows and denominators, context mode, the standing
   limitation, and an availability reason. `compare_follow_up` builds its result
   from it, byte-identically to today. `capture_ending` calls it with the
   record's own retained context and `context_after_ending`, then assembles the
   saved assessment exactly as for any other comparison.

   **The period-end label says when a period ends at the next relevant change.**
   With the cut at the ending instant, a record superseded by a later change of
   its own setting has its next relevant setting change exactly at the cutoff.
   `_setting_period` labels the After end `next_relevant_setting_change` only
   when `following < cutoff`, so that period read "data_tail". This is a label
   accuracy fix, not an engine change. The After period's bounds come from
   `min(cutoff, following)` and do not move. No value moves. The label differs
   from today only when a next relevant run starts exactly at the cutoff. The
   one changed line labels the end `next_relevant_setting_change` when a next
   relevant run exists (`index + 1 < len(runs)`). Every such run starts at or
   before the cutoff, because runs are read only up to it. The ruling's literal
   `following <= cutoff` cannot be used on its own. With no next run,
   `following` defaults to the cutoff itself (`following = runs[index + 1][0]
   if index + 1 < len(runs) else cutoff`), so every data-tail period would read
   as ending at a change. These are the only two touches in
   `follow_up_comparison.py`.

   The line labels only a next run the comparison can see at the cut. A pump
   read captured at the successor is such a run (premises: `pump-read-pair`).
   A successor known only from dose-stamped boluses is not yet a settled
   regime at the cut: a dose-stamped value must hold for `_MIN_EPOCH_DAYS`
   observed days (`ciq_autotune/epochs.py`). So the comparison reads no next
   run, and the period keeps `data_tail` (premises: `dose-pair` and `c4-ic`).
4. **The desk says it in words.** The words for `context_after_ending` belong
   to the desk's one word table for comparison reasons. The #449/#450 change owns
   that table and adds them; it integrates before this one. This change adds no
   table entry. The superseded note no longer claims the later change was to the
   same setting. The old note, "A later change to the same setting took over",
   was already false for the live watch, which the frontier's rule supersedes on
   a later change of any setting. Changes needs no other change: it already reads
   an ended record's saved ending, and a served ending kind replaces "Still open"
   in the roster.
5. **No migration step.** An existing install records these endings at its
   next reconcile: the next fetch that writes data, the startup recovery of a
   stale frontier, or the next follow-up write. Every one of those already runs
   inside one follow-up transaction and bumps the result cache after commit.

**This amends ADR 386.** Its legacy clause ("a derived legacy Trial may
acquire a first-observed record now … but no earlier decision or ending … do not
auto-finish or date them") no longer holds for Trial endings. A pointer beside
that clause in `openspec/changes/archive/2026-09-24-harmonic-v2/design.md` says so. The clause's
concern, not repairing history by silently rerunning today's model, is met in
three ways. The ending is dated from observed facts: the reversal, the detected
change or the fixed watch window. Its recorded time says when Harmonic recorded
it. Its assessment reads no evidence after the ending, or is unavailable with a
worded reason.

### Alternatives considered

- **Supersede only on a later change of the same setting.** This was R442's
  first wording, and the wording of the desk's old note. Rejected by the
  coordinator's ruling on triage question 1. The frontier's rule, which R442
  names as the rule to follow, reads any later detected change. Two rules would
  give one ending kind two meanings. It would also need a new "same setting"
  judgment: whole parameter, or the record's own slot and block, and how a
  whole-profile switch relates.
- **Bound only endings recorded after the fact.** This keeps the live frontier's
  `data_cutoff=now`. Rejected by the coordinator's ruling on triage question 2.
  The contract's "then-available evidence" is one rule, and the gap it keeps
  holds data recorded under the setting that superseded the watch.
- **Capture a context as of the ending instant.** The saved assessment would
  stay available on stores with later pump reads. Rejected: the contract keeps
  one retained context per record across both arms and later follow-up, and
  R442 prefers an unavailable assessment with a worded reason.
- **A "recorded retroactively" open state.** Rejected by R442.

### Consequences

- The committed `c4-ic` case's 06-01 record now ends `superseded` at 06-10
  09:00. Its saved assessment reads data to 06-10 09:00 and keeps its periods.
  It is unavailable only for `no_readable_period_evidence`. S157 proves this on
  the built desk.
- `c4-isf` and `c4-profile` save their expiry with data read to 06-29, not 07-01.
  S91's c4 readiness helper compared the page's readiness lines (the saved
  ending, for an ended record) with the retained read. They agreed only while
  the two cutoffs coincided. S91 is amended to compare the page with the
  comparison the page shows.
- `edit-chain`'s 05-01 record would expire at its data tail and break S111's
  four-open premise. The recipe moves its four hand-saved records 14 days later
  (05-15, 05-22, 05-23, 05-24). Their spacing holds, none is past its window,
  and S110, S111, S112 and S143 keep their premises unchanged.
- On a real store whose pump reads continue after its older changes, most
  backfilled endings save an unavailable assessment (`context_after_ending`).
  The record still opens on its saved ending, and the labelled Retained context
  and Current policy reassessments stay available.
- A record can read as superseded by a change the roster later shows in its
  own Edit. This is the late-settling bridge above: the ending stays as
  recorded.
- A multi-slot Edit's sibling records stay open, not watched, alongside the
  watched record until the first detected change after the Edit or their own
  windows. The live watch is no longer superseded by a slot of its own Edit that
  a later reconcile happens to detect.
- A record superseded by a later change of its own setting that a pump read
  captured at the change saves its After period with end reason
  `next_relevant_setting_change` (premises: `pump-read-pair`).
- A record superseded by a dose-detected change of its own setting saves "Data
  read through <the change>" (end reason `data_tail`), because the successor's
  regime is not settled at the cut (premises: `dose-pair`, and `c4-ic`'s 06-01
  record). Its ending line still reads "Superseded by a later change". This also
  applies to live frontier endings. It is a change sanctioned under R442 and the
  Q3 delegation, recorded here rather than hidden, and task 1.4 case (l) pins it
  so it cannot drift silently.
- A live frontier ending now saves an assessment cut at its own instant, not
  at the reconcile that noticed it. The days between the two are lost to the
  saved assessment: up to an hour of fetch interval for an expiry, and the
  detector's settling days for a dose-detected supersession or reversal. That
  data stays in the store, and a Retained context or Current policy
  reassessment still reads it, labelled as a reassessment.
- Each reconcile reads the detector's history (pump reads, basal rows,
  boluses) once and shares it across every open record's reversal check. It runs
  one comparison for each record it ends whose context is bounded. The first
  reconcile after upgrade ends every backfilled record in one pass; afterwards
  only records inside their window, and Edit siblings waiting on the first
  change after their Edit, stay open (Reconcile cost below).

### Reconcile cost

Recorded on the coordinator's rulings after code review (Q3 delegation, Connor
Griffin, 2026-09-23; coordinator ruling R442).

**The bound.** Each reconcile runs the detector's reversal check
(`_reversal_at`) for every retained Trial record whose ending has no kind. A
record that has ended costs one record read and is skipped. The check reads the
pump reads, and a basal-slot record reads the basal rows (every slot's regimes);
a dose-detected correction-factor or carb-ratio record reads the boluses. The
pass reads each of those histories at most once and shares it across every open
record (`_ReversalHistory`). One reconcile therefore costs at most one scan of
each history, however many records are open. The frontier-only rule it replaces
also ran at most one check per reconcile. Reading the history afresh for each
open record, as this change first did, cost one full scan per open record.

**Same endings.** Sharing the reads changes no saved row. A reconcile with the
shared history saves follow-up rows byte-identical to one that reads the
history afresh for each record. This holds on every store `premises.py` covers:
its seven in-memory stores, its nine QA case stores, and the synthetic year
below, 17 stores in all, compared in one process. A backend test pins the
same equivalence through the public reconcile path on five stores. It also
pins one basal read for three open basal-slot records.

**Measured** in process on synthetic stores, each timing from a fresh copy of a
store built and reconciled by base b03431d2, one version after another in one
session. Each figure is the median of the runs shown, for the first and then a
second reconcile.

| Store | Base | Read per record | Shared read (this change) |
|---|---|---|---|
| `showcase` QA case, the largest QA case store with a retained record (18,754 rows, 1 record, still open) | 49 ms / 49 ms (5 runs) | 51 ms / 52 ms (5 runs) | 48 ms / 51 ms (5 runs) |
| `c4-ic` QA case (17,904 rows, 2 records; this change ends the older one) | 42 ms / 41 ms (5 runs) | 45 ms / 41 ms (5 runs) | 46 ms / 41 ms (5 runs) |
| A synthetic year of five-minute basal rows (105,120 rows), with eight slots raised together every 30 days: 96 records, all open after base; the first reconcile ends 88 and leaves 8 open | 0.70 s / 0.71 s (3 runs) | 54 s / 6.6 s (3 runs) | 1.09 s / 1.11 s (3 runs) |

At QA scale the three are inside the noise. On a year of basal history the
shared read keeps the steady-state reconcile, with eight records open, at about
1.1 s against base's 0.7 s. It keeps the first reconcile after upgrade, which ends
88 records, at about 1.1 s. Read per record, the same store took 6.6 s and
54 s. The fetch loop's hourly reconcile, startup recovery and each follow-up
write pay the steady-state figure.

### Risk contract

Copied from the scope ledger (`docs/scope/backfilled-record-endings.md`). Two
accepted-failure items are amended here on the coordinator's rulings after code
review: the reconcile cost (Reconcile cost above), and the Edit's role in the
late-settling bridge (Decision 1). The ledger keeps its triage wording.

- **Must prevent:** rewriting a saved ending or reopening an ended record; a
  saved ending assessment that reads evidence after its ending instant
  (silent incorrect success); a record superseded by a change inside its own
  ADR 414 Edit, as read by the reconcile that records the ending; any change to a Plan receipt, the admission frontier, a Focus
  preemption, a staging predicate, cap or floor; any change to a comparison's
  periods or values; real data in any fixture, test or log; a retained Trial
  record other than one inside its watch window left open after a reconcile,
  except an Edit sibling waiting on the first change after its Edit.
- **Must recover:** nothing new. A reconcile that fails mid-pass commits no
  ending, as today (one follow-up transaction).
- **Accepted failure:** each reconcile reads the detector's pump reads, basal
  rows and boluses once, shared by every open record, inside the reconcile
  transaction. Its steady-state cost does not grow with the number of open
  records. On a synthetic year of basal history with eight records open it is
  about 1.1 s against base's 0.7 s. The first reconcile after upgrade ends every
  backfilled record in that same single read, and also computes one comparison
  for each ended record whose context is bounded. It loses nothing. A backfilled record whose retained context
  came from a later pump read saves an unavailable assessment; the reader still
  has the labelled reassessment. A record superseded by a dose-detected change
  of its own setting saves "Data read through <the change>" (`data_tail`),
  because the successor's regime is not settled at the cut. Its ending still
  reads "Superseded by a later change", and live frontier endings do the same.
  A dose-stamped change that settles after an ending was saved can chain the
  record and its superseder into one Edit (the late-settling bridge). The
  ending stands: it was recorded against a separately detected change and was
  correct when written, the recording reconcile's Edit decides whether a later
  change supersedes a sibling while a later regrouping is display-only and never
  reopens a saved ending, and holding every supersession back for the settle
  window would add machinery and delay every live ending.
- **Unsupported:** hand-edited follow-up rows; a retained context that claims
  available with no source pump read (read as "cannot bound").
- **Evidence owed:** reconcile-path backend tests. They cover the issue's
  failing-first case, same-setting supersession by a pump-read change with its
  saved end reason `next_relevant_setting_change`, same-setting supersession by
  a dose-detected change with its saved end reason pinned as `data_tail`,
  cross-setting supersession, a detected
  multi-slot Edit whose siblings never supersede each other, the late-settling
  bridge pinned as accepted (ending unchanged, one later Edit), reversal
  precedence, expiry, first-wins across a second reconcile, the bounded cutoff,
  `context_after_ending`, and an unchanged Plan receipt. Also owed: the exported
  envelope byte-identical to `compare_follow_up`'s early return; the superseded
  note through the public renderer; S157 and amended S91 in the replay. The
  words for `context_after_ending` are evidenced by the #449/#450 change's
  `frontend/history.test.js` case for that code, not by this change.
- Why: endings are durable, first-wins and read as advisory history about
  dosing changes, so a wrong ending cannot be corrected later.
- Disposition: copied unchanged into this design record.

### Surface revision record

- Lifecycle: UI Craft `revise` (route: shipped, runnable, complete declaration,
  manufactured data source).
- Safe start: `AGENTS.md` "The data boundary" declares the one permitted offline
  serve. Its named data source is `mockups/qa-e2e.synthetic/harmonic.sqlite`
  (generated by `scripts/gen_qa_e2e_db.py`), or a case store emitted by
  `scripts/gen_qa_e2e_db.py --case <name>`. Both are synthetic and
  generator-owned. The declared command is `uv run harmonic serve --no-fetch
  --token '' --db "$scratch" --port 8765`. The coordinator runs every
  port-bound leg.
- Contract: the frozen behavior ledger `mockups/harmonic-v2-desktop.behavior.md`
  and its replay under `mockups/sweep/harmonic-v2-desktop/`. No sweep is re-run.
- Sanction: Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself
  from here"); coordinator ruling R442.
- DESIGN.md is unchanged; no visual term moves.

### Premises

`PYTHONPATH=. uv run python openspec/changes/backfilled-record-endings/premises.py 2>/dev/null`,
on base b03431d2 (in process, scratch copies, no server):

```
multi-slot-edit: data tail 2026-06-30 00:00:00, 3 retained, frontier basal_rate-05-00-20260521050000, 3 detected
  2026-05-11 01:00:00 history OPEN today -> ADR 442: superseded at 2026-05-21 05:00:00; context unavailable (missing_programmed_isf); without the Edit exclusion: superseded at 2026-05-11 03:00:00
  2026-05-11 03:00:00 history OPEN today -> ADR 442: superseded at 2026-05-21 05:00:00; context unavailable (missing_programmed_isf)
  2026-05-21 05:00:00 frontier ended expired_unreviewed at 2026-06-18 05:00:00; saved cutoff 2026-06-30 00:00:00 (ADR 442 cutoff 2026-06-18 05:00:00); saved After end None; context unavailable (missing_programmed_isf)
pump-read-pair: data tail 2026-06-30 00:00:00, 2 retained, frontier isf-all-20260520060000, 2 detected
  2026-05-11 06:00:00 history OPEN today -> ADR 442: superseded at 2026-05-20 06:00:00; context bounded; saved assessment unavailable/no_readable_period_evidence, After ends 2026-05-20 06:00:00 (data_tail), read to 2026-05-20 06:00:00
  2026-05-20 06:00:00 frontier ended expired_unreviewed at 2026-06-17 06:00:00; saved cutoff 2026-06-30 00:00:00 (ADR 442 cutoff 2026-06-17 06:00:00); saved After end data_tail; context bounded
  label pump-read-pair 2026-05-11 06:00:00 superseded cut 2026-05-20 06:00:00: After ends 2026-05-20 06:00:00; base data_tail | patched next_relevant_setting_change
  label pump-read-pair 2026-05-20 06:00:00 expired_unreviewed cut 2026-06-17 06:00:00: After ends 2026-06-17 06:00:00; base data_tail | patched data_tail
dose-pair: data tail 2026-06-30 00:00:00, 2 retained, frontier carb_ratio-all-20260520080000, 2 detected
  2026-05-11 08:00:00 history OPEN today -> ADR 442: superseded at 2026-05-20 08:00:00; context bounded; saved assessment unavailable/no_readable_period_evidence, After ends 2026-05-20 08:00:00 (data_tail), read to 2026-05-20 08:00:00
  2026-05-20 08:00:00 frontier ended expired_unreviewed at 2026-06-17 08:00:00; saved cutoff 2026-06-30 00:00:00 (ADR 442 cutoff 2026-06-17 08:00:00); saved After end data_tail; context bounded
  label dose-pair 2026-05-11 08:00:00 superseded cut 2026-05-20 08:00:00: After ends 2026-05-20 08:00:00; base data_tail | patched data_tail
  label dose-pair 2026-05-20 08:00:00 expired_unreviewed cut 2026-06-17 08:00:00: After ends 2026-06-17 08:00:00; base data_tail | patched data_tail
issue-store: data tail 2026-10-18 00:00:00, 4 retained, frontier isf-all-20260908080000, 4 detected
  2026-05-11 08:00:00 history OPEN today -> ADR 442: expired_unreviewed at 2026-06-08 08:00:00; context unavailable (missing_programmed_isf)
  2026-06-20 08:00:00 history OPEN today -> ADR 442: expired_unreviewed at 2026-07-18 08:00:00; context unavailable (missing_programmed_isf)
  2026-07-30 08:00:00 history OPEN today -> ADR 442: expired_unreviewed at 2026-08-27 08:00:00; context unavailable (missing_programmed_isf)
  2026-09-08 08:00:00 frontier ended expired_unreviewed at 2026-10-06 08:00:00; saved cutoff 2026-10-18 00:00:00 (ADR 442 cutoff 2026-10-06 08:00:00); saved After end None; context unavailable (missing_programmed_isf)
issue-store+later-read: data tail 2026-10-18 00:00:00, 4 retained, frontier isf-all-20260908080000, 4 detected
  2026-05-11 08:00:00 history OPEN today -> ADR 442: expired_unreviewed at 2026-06-08 08:00:00; context context_after_ending
  2026-06-20 08:00:00 history OPEN today -> ADR 442: expired_unreviewed at 2026-07-18 08:00:00; context context_after_ending
  2026-07-30 08:00:00 history OPEN today -> ADR 442: expired_unreviewed at 2026-08-27 08:00:00; context context_after_ending
  2026-09-08 08:00:00 frontier ended expired_unreviewed at 2026-10-06 08:00:00; saved cutoff 2026-10-18 00:00:00 (ADR 442 cutoff 2026-10-06 08:00:00); saved After end data_tail; context context_after_ending
late-settling-bridge after the reconcile at 2026-05-13 07:00:00: 2 Edit(s) [1, 1]
  2026-05-11 20:00:00 isf: superseded at 2026-05-13 06:00:00
  2026-05-13 06:00:00 target_bg: open
late-settling-bridge after the reconcile at 2026-05-13 19:00:00: 1 Edit(s) [3]
  2026-05-11 20:00:00 isf: superseded at 2026-05-13 06:00:00
  2026-05-12 08:00:00 carb_ratio: open
  2026-05-13 06:00:00 target_bg: open
live-cross-setting: data tail 2026-05-26 00:00:00, 2 retained, frontier carb_ratio-all-20260521080000, 2 detected
  2026-05-11 08:00:00 history ended superseded at 2026-05-21 08:00:00; saved cutoff 2026-05-26 00:00:00 (ADR 442 cutoff 2026-05-21 08:00:00); saved After end None; context unavailable (missing_programmed_isf)
  2026-05-21 08:00:00 frontier OPEN today -> ADR 442: stays open
c3-trial: data tail 2024-06-01 23:59:00, 1 retained, frontier basal_rate-03-00-20240515000000, 1 detected
  2024-05-15 00:00:00 frontier OPEN today -> ADR 442: stays open
c3-history: data tail 2024-06-01 23:59:00, 2 retained, frontier basal_rate-03-00-20240520000000, 2 detected
  2024-05-15 00:00:00 history ended user_finished at 2024-05-18 00:00:00; saved cutoff 2024-05-18 00:00:00 (ADR 442 cutoff 2024-05-18 00:00:00); saved After end data_tail; context bounded
  2024-05-20 00:00:00 frontier OPEN today -> ADR 442: stays open
c3-preempted: data tail 2024-06-01 23:59:00, 1 retained, frontier basal_rate-03-00-20240515000000, 1 detected
  2024-05-15 00:00:00 frontier OPEN today -> ADR 442: stays open
c4-missing: data tail 2024-06-01 23:59:00, 1 retained, frontier basal_rate-03-00-20240515000000, 1 detected
  2024-05-15 00:00:00 frontier OPEN today -> ADR 442: stays open
c4-history: data tail 2024-06-01 23:59:00, 1 retained, frontier carb_ratio-all-20240512090000, 1 detected
  2024-05-12 09:00:00 frontier OPEN today -> ADR 442: stays open
c4-ic: data tail 2024-07-01 23:55:00, 2 retained, frontier carb_ratio-all-20240610090000, 2 detected
  2024-06-01 00:00:00 history OPEN today -> ADR 442: superseded at 2024-06-10 09:00:00; context bounded; saved assessment unavailable/no_readable_period_evidence, After ends 2024-06-10 09:00:00 (data_tail), read to 2024-06-10 09:00:00
  2024-06-10 09:00:00 frontier OPEN today -> ADR 442: stays open
  label c4-ic 2024-06-01 00:00:00 superseded cut 2024-06-10 09:00:00: After ends 2024-06-10 09:00:00; base data_tail | patched data_tail
c4-isf: data tail 2024-07-01 23:55:00, 1 retained, frontier isf-all-20240601000000, 1 detected
  2024-06-01 00:00:00 frontier ended expired_unreviewed at 2024-06-29 00:00:00; saved cutoff 2024-07-01 23:55:00 (ADR 442 cutoff 2024-06-29 00:00:00); saved After end data_tail; context bounded
c4-profile: data tail 2024-07-01 23:55:00, 1 retained, frontier profile-all-20240601000000, 1 detected
  2024-06-01 00:00:00 frontier ended expired_unreviewed at 2024-06-29 00:00:00; saved cutoff 2024-07-01 23:55:00 (ADR 442 cutoff 2024-06-29 00:00:00); saved After end data_tail; context bounded
edit-chain: data tail 2024-06-01 23:59:00, 4 retained, frontier None, 0 detected
  2024-05-01 00:00:00 history OPEN today -> ADR 442: expired_unreviewed at 2024-05-29 00:00:00; context unavailable (not_recorded)
  2024-05-08 00:00:00 history OPEN today -> ADR 442: stays open
  2024-05-09 00:00:00 history OPEN today -> ADR 442: stays open
  2024-05-10 00:00:00 history OPEN today -> ADR 442: stays open
edit-chain with its four records 14 days later: 05-15 window ends 06-12, 05-22 window ends 06-19, 05-23 window ends 06-20, 05-24 window ends 06-21; open at tail 2024-06-01 23:59:00: True
```

`live-cross-setting` is the frontier's own cross-setting supersession, recorded
by today's code across two reconciles. Every other "ended" line was recorded by
today's code. Every "ADR 442:" line is `premises.py`'s read-only `rule()`,
the spike of Decisions 1 and 3. A "without the Edit exclusion" suffix is what
the round-1 rule would have recorded. `late-settling-bridge` records ADR 442's
endings on its in-memory store through `capture_ending` (`apply_rule()`) after
each of its two reconciles. It then prints the Edits the roster would serve.
Each "label" line runs
`follow_up_comparison._setting_period` on that store at the record's ADR 442
cut, twice: once with the label line as at base, and once as patched. The
"saved assessment" previews run the pinned, unpatched engine.
