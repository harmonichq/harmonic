# #430 design record

## ADR 430 — An open change record opens on its retained-context reassessment

### Context

A change record has four parts that the desk keeps apart (HV2-28):

- the original or first-observed context;
- the observed change;
- the immutable saved ending;
- a retained or current reassessment, computed now.

The selected record read (`GET /api/verify/trials?selected=…`, default
`assessment=original`) returns `reassessment: null`. On a record with no saved
ending, `original.assessment` is `{state: "unavailable", reason: "not_recorded"}`.
The comparison exists only under `assessment=retained` or `assessment=current`,
which is a second request (the harmonic-v2 contracts' "Pre-ready values need a
SECOND request"). The record destination sent that request only when the reader
pressed a mode control. Every open record's stage was therefore empty, and it
was still labelled "recomputed now". The active-Trial arm of the same Changes
destination (`follow-up.js` `loadActive`) has always requested the retained
read, so the same change looked different depending on which door opened it.

### Decision

1. **The served ending decides the default read.** When a record is opened by a
   roster press, by its address or on reload, the desk makes the record read
   first. If the served `selected.original.ending` carries no `kind`, the desk
   then requests `assessment=retained` for the same selection and renders the
   record with that reassessment, with Retained context shown as selected. If
   the ending has a kind, the record renders its Original read, as today, and
   nothing more is requested. The roster row is not consulted for this: the
   selected read is the served fact.
2. **The reassessment keeps its own identity.** It is rendered as the
   Reassessment part, with its mode, computed time and stored context, beside
   the original. The saved-ending part still reads "Not recorded — this change is
   still open". Original and Current policy remain choosable. A reader's choice
   holds until another record is opened.
3. **Each read keeps its named loading text.** The existing loading frame
   reads "Reading change records" while the record read is pending. It reads
   "Computing reassessment" while the retained read is pending. This follows the
   loading decision recorded in `docs/scope/414-v2-diagnose-retention.md` (Q3)
   and the `v2-desk-retention` requirement that the loading frame names each
   read.
4. **Opening the record is the demand.** The `v2-findings-ledger` durable
   follow-up requirement says a requested reassessment is "named and loaded on
   demand, not prewarmed". Opening an open record is now that demand. Nothing is
   prewarmed: the fetch loop, the cache warmer and the roster read are
   unchanged. The server already caches the selected read by kind, identity,
   assessment mode, input revision and context, so reopening at the same revision
   is warm.

### Alternatives considered

- **Show the record at once and load the comparison inside the stage.** This
  was rejected for this change. It adds a partially rendered record, with a new
  in-stage pending state and a re-render when the second read lands, beside a
  loading frame the operator already settled. It can come later with the
  skeleton if the cold read proves slow enough to matter.
- **Decide the default from the roster row's ending.** This was rejected. The
  roster is the lazy summary; the selected read is the record. Reading one
  served fact keeps the two from disagreeing.
- **Keep Original as the default and add a hint to press Retained context.**
  This was rejected. It leaves the record's one question unanswered by default,
  and it disagrees with the active-Trial arm for the same change.

### Consequences

- An open record's stage now shows its evidence periods, clock figure and
  outcome rows when the backend can compute them. When it cannot, it shows the
  served unavailable reason. Examples: a record with no retained comparison
  context, a candidate Harmonic never recorded, or a change with no continuous
  setting history.
- The lock's Trial-history acceptance case (reopen the original and the saved
  ending; request a reassessment) concerns an ended record and is unchanged. The
  Trial/readiness case (an accumulating Trial shows its live chart) is now met
  through the record door as well as the active arm. HV2-28 is preserved: no
  reassessment replaces the original.
- Desk ledger story S112 held the record read and then pressed Retained
  context. The retained read now follows the record read without a press, so
  S112 is amended under the operator's standing sanction for #430's checklist
  (Connor Griffin, 2026-09-23). S142 and S143 prove the default read and the
  unavailable figure. S49's c4 replay asserted the raw unavailable code in the
  reading pane. It now expects the same reason in words, because this change
  owns the desk's single vocabulary for comparison reasons (coordinator ruling
  in #430 triage review, 2026-09-23). #426's `not_recorded` wording folds into
  that vocabulary at integration.
- `premises.py` in this change prints what the record door's two reads serve
  on the committed synthetic cases. It runs in process on scratch copies, with
  no server.
- Records that reconciliation never ends stay open, so they too open on a live
  reassessment. Whether they should end is a separate issue (D4).
