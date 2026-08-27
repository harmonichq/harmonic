# Scope ledger — Finding window membership (#224)

## Decisions

- **Treat the unavailable windows as a backend population-consistency defect, not
  a new UI state.** The existing surface correctly fails closed when preparation
  returns `inconsistent_projection`; the observed error originates before render.
  **Why:** the fresh read-only snapshot reproduces `InconsistentProjection` inside
  the case-file wrapper. **Disposition:** inline.
- **Reuse the existing Finding-relative outcome rule.** The queue already applies
  `outcome_kind` through `window_membership.outcome_minute`, and ordinary case-file
  associations apply the same rule locally; the custom recurrence branch alone
  substitutes `episode.end`. Repair that bypass without adding a new policy seam.
  **Why:** ADR 202 owns recurrence identity, while `outcome_kind` already owns the
  consequence anchor used for clock membership. **Disposition:** inline.
- **Keep unrelated ordinary-lever association gaps out of #224.** The aggregate
  probe found an Over-treated low row that is withheld rather than made
  inspectable in one scoped window; that does not cause the reported preparation
  failure and is recorded as #225. **Why:** repairing a second association path
  would broaden the regression and review surface beyond the custom recurrence
  defect. **Disposition:** → issue #225 (discharged).

### Risk contract

- **Must prevent:** private snapshot or event-level health data entering tracked
  files, logs, issue comments, or pull-request evidence; silent partial success
  from contradictory queue/case populations; any change to behavioral
  classification, recurrence denominator, priority, support, or dose-staging
  verdicts.
- **Must recover:** no new automatic recovery. Existing cache-generation and
  preparation recovery behavior remains authoritative.
- **Accepted failure:** a genuinely contradictory retained population continues
  to return the explicit `inconsistent_projection` failure and the shipped UI
  continues to show its unavailable state; recovery is a later user-driven window
  selection or code repair.
- **Unsupported:** repairing ordinary-lever association/withholding defects,
  changing the window control or failure copy, and deriving committed fixtures
  from the private snapshot.
- **Evidence owed:** a fail-first synthetic event arrangement through the public
  preparation endpoint; coherent whole-day and adjacent scoped membership for the
  same custom recurrence occurrence; preservation of the closed consistency
  equation; the complete repository gates and the frozen Diagnose behavior replay;
  an aggregate-only rerun of `docs/scope/224-findings-window-repro.py` against a
  fresh read-only snapshot followed by snapshot deletion.

Why: the endpoint gates high-stakes advisory evidence, while the failure is
recoverable and the product already has an explicit fail-closed state.

Disposition: inline.

## Open questions

None. ADR 202 and the behavioral-layer baseline settle the occurrence,
representative, and clock-membership semantics.

## Spawned tasks

- Mandatory cold plan review before the work order is posted.
- Follow-up issue #225 for the ordinary Over-treated low association gap found
  during aggregate-only grounding.

## Plan-review rounds

No rounds recorded yet.
