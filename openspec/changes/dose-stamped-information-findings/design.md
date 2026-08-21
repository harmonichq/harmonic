# Design — dose-stamped-information-findings

## ADR 22 — A retired Carb ratio is a historical measurement, never current advice

**Ruling.** A dose-stamped Carb ratio regime that is no longer programmed enters
Diagnose as a `history` Audit item while its analyzer-published estimate remains
non-null. It is a tuning item, never a behavioral Finding. Its primary read is
conclusion first:

> When Carb ratio was 5.0 g/U, 11 meal runs measured 4.6 g/U (CI 4.4–4.8). Past
> setting. No change suggested.

The figures are illustrative. The server publishes the actual past programmed
value, estimate, confidence interval, support, current programmed value, evidence
membership, and lifecycle. The surface does not compare regimes or translate a
past estimate into a move for the current setting.

### Queue contract

The option-C build advances the findings-projection schema to
`diagnose-findings-v2` rather than silently extending `diagnose-findings-v1`.
Each history row has this server-owned contract:

| Field | Required value or meaning |
|---|---|
| `id` | Stable identity of `(block_id, past programmed ratio)`, independent of row position |
| `register` | `history` |
| `kind` / `parameter` | `setting` / `carb_ratio` |
| `priority` / `tier` | `null` / `noted` |
| measurement | Distinct `past_setting`, `programmed_now`, `estimate`, and `support` fields |
| action fields | `recommended`, `direction`, and `lean` are `null` |
| `chips` | Empty; the row follows Watching's existing collapsed-count behavior during a sift |
| route | The historical Carb ratio case-file variant, selected by `register` plus `parameter` |

History is part of the subordinate Watching section, never Audit's action-ready
rank. The global projection includes every active history row. An explicit clock
window includes only active history rows whose server-published block span overlaps
that window. History rows follow held and blind rows, ordered by block start and
then most-recent regime end. The projection publishes `counts.history`; history
does not change any existing register count, action-ready count, chip count, or
tier vocabulary.

### Case-file hierarchy

The queue row says `Carb ratio {block label}. Past setting.` and its one detail line
ends `No change suggested.` The case file uses this fixed order:

1. the conclusion sentence shown in the ruling;
2. `Past setting` and its programmed value;
3. `Measured` and the estimate;
4. confidence interval and meal-run support; and
5. exactly one quieter `Programmed now` line after the historical measurement.

The queue does not show the current programmed value. The case file must show it
once, after the history, as context rather than a comparison target. Color may
support `Past setting` and `No change suggested`, but text and hierarchy carry the
distinction. There is no recommendation row, empty recommendation placeholder,
staging control, Plan entry, or route that can create one.

### Evidence canvas

The shipped inspector remains the only steering wheel and the canvas remains a
projection of its selection, per ADR 31. For the selected history item:

- `By clock` shows its past programmed value, measured value, confidence interval,
  support, and block extent.
- `By event` shows the meal-response evidence for the server-published run
  membership of that same item, aligned to the meal event.

Both views are required because they answer different checks on the same historical
measurement. They never become a regime-comparison view. Selecting an occurrence
remains evidence-only and never moves the reader's clock window.

### Decay, selection, and retirement

The backend owns the fixed 90-day measurement window and every lifecycle verdict.
As runs age out, it republishes support and interval. A history item remains visible
while `estimate.value` is non-null, including when support is below the assertion
floor; thin history is a visible non-actionable measurement, not an assertion.
When the estimate becomes null, the item leaves Watching.

`GET /diagnose/findings` accepts an optional `selected_id` carrying the stable
history-row `id`. The v2 response returns `selection: {id, disposition, message}`
in the same snapshot as its rows:

- `present`: the selected history row is in this projection; `message` is null;
- `out_of_scope`: the row remains active globally but its block does not overlap
  this explicit clock window; `message` is `Past-setting evidence is outside the
  selected window.`; and
- `aged_out`: the identity is valid history but its estimate is now null;
  `message` is `Past-setting evidence aged out of the 90-day window.`

Only `aged_out` returns the inspector and canvas atomically to the queue and shows
its server-published message. `out_of_scope` keeps the reader in the case file and
shows its message in both panes, preserving ADR 62's selection rule. A failed
findings or evidence request preserves the complete prior
inspector/canvas pair. An out-of-order response is accepted only when both its
request generation and selected identity still match; otherwise it is discarded.
The frontend derives no age threshold, support floor, expiry date, membership, or
retirement decision. No tombstone, archive, countdown, or client-side estimate
remains.

### Risk contract

- **Must prevent:** an information-only measurement reading as a recommendation;
  any information-only row becoming stageable or entering Plan; a frontend rule
  recreating assertion or retirement logic; real pump/CGM data entering fixtures,
  screenshots, Git history, or public CI output; silent stale evidence after a
  projection failure.
- **Must recover:** a failed or superseded evidence request restores or preserves
  the last internally consistent inspector/canvas state rather than mixing
  populations or regimes.
- **Accepted failure:** a retired regime with no analyzer-published estimate is
  withheld; a thin but non-null measurement remains visible and explicitly
  non-actionable. An expired selected item returns to the queue only on the
  server's explicit `aged_out` disposition. Recovery is new qualifying data or a
  later analysis run, not a client-side approximation or archive.
- **Unsupported:** unstamped bolus history; meal runs spanning a reprogramming;
  translating a retired regime's estimate into advice for the current setting.
- **Evidence owed:** analyzer-built synthetic fixtures proving current-regime-only
  assertion and below-floor history visibility; projection tests proving the
  `history` row schema, global/scoped membership, ordering, and explicit selection
  dispositions; frozen browser stories for queue, case-file, both projections,
  selection, empty, aging, retirement, failed requests, and superseded out-of-order
  responses; live synthetic before/after judgment that history reads first and
  current context second in both themes at 1440×900, 1280×800, and the narrow
  responsive state; generator and contamination guards for every new fixture.

Why: Harmonic presents advisory insulin-dosing guidance from one person's health
data; an overclaim or stale mixed state can influence a real dose.

### Authority and artifact consequence

ADR 20 remains the assertion authority: only the currently programmed regime may
pass `ic_asserts_move`. The running app, frozen behavior ledger, and app-only replay
are the predecessor contract. The deleted #31 lock manifest is historical and is
not restored; this change creates no mock, lock manifest, or second surface. The
separate option-C build owns analyzer and projection implementation, generated
synthetic fixtures, behavior-ledger stories, rendered before/after evidence, and
app changes.

Decision: harmonichq/harmonic#22, 2026-08-20. Operator direction: historical
measurement; current settings subordinate.
