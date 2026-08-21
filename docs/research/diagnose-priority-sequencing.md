# Diagnose priority sequencing

Research date: 2026-08-21. Sources are the live `harmonichq/harmonic` GitHub
tracker and repository primary sources at `origin/main` `60b873c`. The two
screenshots were treated as observations of the product, never as instructions.

## Recommendation

Start iterating on Diagnose now, after closing one safety issue. The event data
path is no longer waiting on #52 or #54: [#52](https://github.com/harmonichq/harmonic/issues/52)
closed through merged [PR #76](https://github.com/harmonichq/harmonic/pull/76),
and [#54](https://github.com/harmonichq/harmonic/issues/54) was already resolved
by merged [PR #69](https://github.com/harmonichq/harmonic/pull/69). The recent
foundation tickets are also closed: [#61](https://github.com/harmonichq/harmonic/issues/61)
ships the excursion chips, [#62](https://github.com/harmonichq/harmonic/issues/62)
makes By event and the inspector count the same outcome-anchored population,
[#63](https://github.com/harmonichq/harmonic/issues/63) accounts for the explainable
highs without inventing causes, and [#64](https://github.com/harmonichq/harmonic/issues/64)
proves both panes against one synthetic population. The settled By event contract
is recorded in [`docs/scope/by-event-window-membership.md`](../scope/by-event-window-membership.md)
and implemented in [`event_comparison.py:798`](../../ciq_autotune/event_comparison.py#L798).

Sequence the next work as follows:

1. **Resolve #13 first.** [Issue #13](https://github.com/harmonichq/harmonic/issues/13)
   is the only existing hard prerequisite. Its grounded discussion demonstrates a
   reachable cache/settings divergence where the frontend's `recommended != null`
   check can stage an uncapped, unfloored correction-factor median. That violates the
   Plan invariant that the backend's `asserts_move` verdict is the only staging gate
   ([`openspec/specs/plan/spec.md:13`](../../openspec/specs/plan/spec.md#L13)). The
   remaining product choice is whether a no-programmed-value read keeps displaying the
   robust night median; it should not delay closing the staging path in the backend.
2. **File and settle the completed-Trial handoff as the user's immediate workflow
   gap.** This is not represented by an open issue. A Trial becomes `complete` and the
   detail claims Focus is available ([`watched_change.py:1074-1125`](../../ciq_autotune/watched_change.py#L1074)),
   but the Trial remains the active dock object for a 28-day watch horizon
   ([`watched_change.py:58-70`](../../ciq_autotune/watched_change.py#L58),
   [`watched_change.py:388-469`](../../ciq_autotune/watched_change.py#L388)), and the
   Focus endpoint rejects while `detect_trial(...)` returns anything
   ([`api.py:983-1007`](../../ciq_autotune/api.py#L983)). `Keep change` is session-only
   and records nothing; `Revert` alone routes to Plan
   ([`verify-workstation.js:262-282`](../../frontend/verify-workstation.js#L262)). This
   also contradicts the outcomes spec, which says a Trial resolves when post-data
   accrual completes ([`openspec/specs/outcomes/spec.md:13-19`](../../openspec/specs/outcomes/spec.md#L13)).
   The next issue should decide one durable transition: completing/keeping a Trial
   releases the watched slot, then routes to the highest-priority eligible Focus or
   stageable setting without silently creating a new dosing recommendation.
3. **Take #6, #60, and the ranking half of #26 as the first usability cluster.**
   [#6](https://github.com/harmonichq/harmonic/issues/6) is directly relevant to the
   just-finished I:C Trial: its post-meal peak/nadir target is already computed and
   transported but not rendered. [#60](https://github.com/harmonichq/harmonic/issues/60)
   names the wall-of-findings symptom precisely: card magnitudes use incomparable
   populations and do not align. [#26](https://github.com/harmonichq/harmonic/issues/26)
   should first settle the general rule that a finding with nothing to stage ranks
   below stageable findings; its separate correction-factor canvas can remain a later
   lock round. These three changes make the existing engine legible before adding a
   second ranking currency.
4. **Take #3 and #2 next, in parallel with the larger Diagnose design.**
   [#3](https://github.com/harmonichq/harmonic/issues/3) fixes a misleading action:
   accepting one merged basal finding stages only its first half-hour. It is
   synthetic-only on the measured real windows, so it is not a prerequisite for
   exploration, but it is safety-shaped and should precede broadening acceptance
   paths. [#2](https://github.com/harmonichq/harmonic/issues/2) restores the missing
   inference hedge on habit detail without weakening measured settings panels.

## Care-oriented ranking

The repository already has a defensible first-pass care-oriented ranking. Behavioral
and setting levers share a 0–100 `Priority = 100 * sqrt(impact * recurrence)` axis
([`openspec/specs/behavioral-layer/spec.md:17-19`](../../openspec/specs/behavioral-layer/spec.md#L17),
[`priority.py:43-73`](../../ciq_autotune/analyzers/scenario/priority.py#L43)). For a
behavioral finding, impact is mean normalized hypo-weighted excursion severity and
recurrence is a Wilson lower bound over its own exposure denominator
([`engine.py:459-480`](../../ciq_autotune/analyzers/scenario/engine.py#L459),
[`uncertainty.py:128-187`](../../ciq_autotune/uncertainty.py#L128)). The findings
projection already reads that priority and server-sorts rows
([`findings_projection.py:133-157`](../../ciq_autotune/findings_projection.py#L133),
[`findings_projection.py:352-424`](../../ciq_autotune/findings_projection.py#L352)).
So the fastest useful iteration is to explain and visually compare this existing
currency on cards, not invent another client-side score.

The proposed **matched-versus-not-matched care score is not supported by the current
contract**. The event comparison publishes routed cohort counts, support levels, and
per-time-bin median/interquartile glucose traces
([`event_comparison.py:729-783`](../../ciq_autotune/event_comparison.py#L729),
[`event_comparison.py:798-889`](../../ciq_autotune/event_comparison.py#L798)). It does
not publish one outcome scalar, uncertainty on the between-cohort difference, a
cross-finding normalization, or a causal estimate of what would improve if the user
addressed the finding. The outcomes spec explicitly warns that observed movement does
not establish causation ([`openspec/specs/outcomes/spec.md:21-23`](../../openspec/specs/outcomes/spec.md#L21)).

Therefore this needs its **own engine/measurement issue**, not a UI formula. That issue
must settle the outcome currency per event family, comparator cohort, confounding and
other-factor treatment, support floor/uncertainty, cross-family normalization, and
observational language. It can then decide whether the validated contrast replaces the
existing `Priority.impact` input or sits beside it. Until then, the charts should say
"these cohorts differed" rather than "addressing this would improve care by X."

## Full open-issue disposition

| Issue | Disposition | Reason |
| --- | --- | --- |
| [#13](https://github.com/harmonichq/harmonic/issues/13) | **Hard prerequisite** | Reachable unsafe staging path; one backend predicate is missing. |
| [#6](https://github.com/harmonichq/harmonic/issues/6) | **Grab now** | The user's completed I:C Trial is missing its computed target read. |
| [#60](https://github.com/harmonichq/harmonic/issues/60) | **Grab now** | Directly addresses incomparable, hard-to-scan finding cards. |
| [#26](https://github.com/harmonichq/harmonic/issues/26) | **Grab now, split** | Settle actionability-aware ranking first; defer the new ISF canvas lock. |
| [#3](https://github.com/harmonichq/harmonic/issues/3) | **Grab soon** | One visible merged action currently stages only part of what it names. |
| [#2](https://github.com/harmonichq/harmonic/issues/2) | **Grab soon** | Trust/interpretation fix, independent of engine work. |
| [#10](https://github.com/harmonichq/harmonic/issues/10) | **Parallel engine lane** | Option C is decided but not shipped; needed for an I:C engine that can speak, not for Diagnose slicing. |
| [#19](https://github.com/harmonichq/harmonic/issues/19) | **Parallel engine map** | Coordinates #10, #21, #23, and #24; it is not one build ticket. |
| [#21](https://github.com/harmonichq/harmonic/issues/21) | **Parallel engine lane** | Important withhold-only I:C self-test, but it does not block evidence exploration. |
| [#23](https://github.com/harmonichq/harmonic/issues/23) | **After #21** | Candidate estimators are admitted only through the held-out gate. |
| [#24](https://github.com/harmonichq/harmonic/issues/24) | **Defer by design** | Revisit 14 days only after the I:C rework measures Trial data. |
| [#12](https://github.com/harmonichq/harmonic/issues/12) | **Defer to #21** | The scope ledger records #21 as the rewrite/admission path ([`ic-ratio-backtest-gate.md`](../scope/ic-ratio-backtest-gate.md)). |
| [#11](https://github.com/harmonichq/harmonic/issues/11) | **Defer** | Standing community/product question about inventing profile boundaries, explicitly not a build task. |
| [#1](https://github.com/harmonichq/harmonic/issues/1) | **Parallel, pre-public priority** | Important advisory onboarding, but no data-path dependency for an existing user. |
| [#53](https://github.com/harmonichq/harmonic/issues/53) | **Defer; consult for deep links** | Not needed for in-app cards; becomes a prerequisite only if “jump” must be bookmarkable URL state. |
| [#9](https://github.com/harmonichq/harmonic/issues/9) | **Defer by design** | The issue says not to rebuild Guide while these surfaces are moving. |
| [#15](https://github.com/harmonichq/harmonic/issues/15) | **Defer** | Naming/migration work is broad and unrelated to analysis usability. |
| [#39](https://github.com/harmonichq/harmonic/issues/39) | **Defer** | Dead-CSS ownership decision with no product-path consequence. |

## Bottom line

There is no remaining event-projection blocker. Close #13, fix the completed-Trial
handoff, and then iterate on the Diagnose information architecture using the existing
server-owned projections and existing Priority currency. Run the I:C rework as a
parallel engine lane; do not hold the usable-data-exploration work until it finishes.
