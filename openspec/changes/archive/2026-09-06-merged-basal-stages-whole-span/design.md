# Design — A merged basal finding stages the whole span it names (#372)

## ADR 372 — A merged basal finding stages every member the server published

**Context.** `FindingsProjection._basal_rows` merges contiguous basal slots that
share a `(register, direction)` key into one row, publishes that row's `members`
list, and deliberately leaves `current` / `recommended` on the members rather than
inventing a span average. Its own docstring states the contract: a run of
asserting slots is one item that stages whole. The shipped surface broke it.
`stageItemsFor` filters `analyze.basal` for a single `basal:<slot>` key, so a
merged row's control could only ever write its first half-hour into the Plan
draft, and `renderSlotLevel` heads the panel with that one member's clock span
without naming the finding it belongs to.

The neighbouring carb-ratio branch of the same function already does the right
thing: it finds the published block and fans out over `block.member_start_mins`.
Basal simply never grew the equivalent.

**Decision.** Basal staging fans out over the **served** member list of the
finding that owns the cell, and each member is admitted on its own backend
`asserts_move` verdict read from `/api/analyze`.

Three properties make this the right shape rather than the convenient one:

1. **Membership is read, never derived.** The member start-minutes come from the
   projection row the reader clicked. The surface does not expand a span from the
   row id, the title, or the clock arithmetic `180-240` implies. Deriving
   membership from minutes would put the browser back in the business of deciding
   which slots a finding covers, which is precisely what the queue module refuses
   to do and what the `surfaces` capability forbids.
2. **Eligibility stays one predicate.** A member reaches the Plan only where its
   own slot carries `asserts_move === true` with a `current` and a `recommended`.
   Today the projection can only put asserting slots inside an `assert` row, so
   this filter drops nothing; it is kept because the frontend must never be the
   thing that decides a slot may move, and because `held` and `blind` rows publish
   members too.
3. **One set, everywhere.** Staging, un-staging, the staged tally, the dock line,
   the lane marks and the Plan badge all move over the same member set, so no
   surface can report a different basket than the draft holds.

**The panel names its span; it does not average one.** A member panel keeps its
own Current / Estimate / Recommended — those are that half hour's measured
numbers — and states in the panel's existing reserved scope line that it is one
member of a named run and that staging acts on the whole run. Printing span-level
numbers would be the invented average the projection already refused, and the
reader could not tell which half hour the figure described.

**The dock prints numbers only where they hold.** A merged run is merged on
register and direction, not on programmed rate, so two staged slots can carry
different `current` values. The dock keeps naming the staged span always and
prints the number pair only where every staged slot agrees on it — the same
refusal `assertDetail` already makes for a merged queue row. Without this, the
fan-out would newly let one member's numbers speak for a span that does not share
them.

**Rejected: encode the span in the plan key.** Passing the projection row id
(`basal:180-240`) as the staging key and expanding it in `stageItemsFor` would
re-derive membership from minutes, and it re-opens the aggregate-key failure the
`basal_rate` guard exists to prevent.

**Rejected: publish the run on `/api/analyze`.** Adding a server-side basal-span
grouping to the analyze payload would let `stageItemsFor` resolve members the way
the carb-ratio branch does, without a new argument. It is a larger, backend-shaped
change for a defect whose data is already published on the endpoint the surface
already reads, and the second consumer that would justify the new contract does
not exist.

**Ledger provenance.** This revision changes shipped Diagnose behaviour and adds
panel copy, so the frozen behaviour ledger takes an amendment and a new replay
story. Its authorization is issue #372 under the Diagnose QA sweep #350; there is
no separate operator ruling to quote. If the executor judges that this repository
requires an operator sanction quote for a copy change on this surface, it stops
and asks rather than authoring one.

### Risk contract

- **Must prevent:** staging a basal slot whose backend verdict does not assert a
  move; a Plan draft that holds a different set than the surface reports; a panel
  or dock number presented as describing a span it does not describe.
- **Must recover:** nothing automatically. Staging is a reversible local draft and
  Undo already removes it.
- **Accepted failure:** a finding whose members the projection did not publish
  stages as a single slot, exactly as today, rather than guessing a run.
- **Unsupported:** merged findings for parameters other than basal rate (carb
  ratio already fans out; ISF has no span), and rehydrating the surface's staged
  set from a saved Plan draft after reload, which is #354's subject.
- **Evidence owed:** the fan-out and its per-member verdict filter, through
  `stageItemsFor`'s public interface, with a test that fails first against the
  single-slot filter; the surface's staged/un-staged symmetry and the merged-run
  panel and dock copy, through one behaviour-ledger replay story against the built
  app.

**Why:** the surface advises insulin doses and a partial stage silently programmes
half of what the reader accepted. **Disposition:** inline in this change; the
requirement lands in the `surfaces` capability specification and the behaviour in
the frozen ledger.
