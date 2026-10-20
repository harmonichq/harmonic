## ADR 564 — Harmonic does not estimate or tune the correction factor

**Context.** Harmonic reads ISF from fasting nights (`analyzers/isf.py`), the
slope of glucose change against insulin that acted. It derives advice from that
reading, and the advice reaches four places:

- the analysis's `isf` rows and an ISF tuning lever, settling gate and epoch
  caveat;
- a findings row and a guidance concern (`setting:isf`);
- a Queue card and the Done that records its Plan;
- an Overview card that draws the estimate.

Harm evidence decides a weakening, and the measurement may license a
strengthening.

An investigation for #563 tested six independent angles against a real-shaped
history: correction doses, fasting-night pooling, whole-day system
identification, schedule-based instruments, suspensions, and several
unconventional methods. None identifies ISF under Control-IQ. Control-IQ
delivers insulin in response to glucose, so insulin and glucose movement are
confounded, and placebo tests failed in two angles. The pooled estimate rests
on a few high-leverage nights. Carb-free evidence reads weaker than the pooled
estimate, so the estimate leans toward stronger corrections. The repository
records no personal number from that investigation, and none is to be added.

The weakening channel is a different failure. Recurring correction lows cluster
on corrections given over the calculator's insulin-on-board credit. The
`correction_stacking`, `correction_on_iob` and `user_override` detectors
already attribute that pattern to behaviour. A setting move for it blames the
setting for a habit.

Since ADR 563, nothing converts glucose to insulin with the estimate. Every
conversion reads the meal's dose-stamped ISF.

**Decision.**

1. **No estimate and no advice.** The analysis does not run the fasting ISF
   regression and serves no ISF estimate. No surface offers a correction-factor
   recommendation, direction, Plan move or Queue card. This covers the analyzer
   module, its rows, its tuning lever, its settling gate, its setting-epoch
   caveat, its findings row, its guidance concern and the Overview's ISF card.
2. **No experiment-based replacement.** Harmonic stays as passive as possible.
   It will not identify ISF by assigning the wearer an experiment, such as an
   engine-assigned basal Trial, a correction challenge or a fasting protocol,
   and it will not reintroduce a passive estimator without new evidence that
   one identifies ISF under Control-IQ. Do not re-propose either from the old
   analyzer's history. This rule closes the question, so a proposal to revisit
   it starts from new identification evidence, not from this record.
3. **The programmed ISF stays.** The dose-stamped ISF stays the conversion input
   (ADR 563). The pump's programmed ISF stays a fact Harmonic reads and shows:
   the Settings pump-profile column, the deliverable profile's ISF column (a
   Plan carries the current value forward), settings snapshots and dose stamps,
   and the Glossary's "ISF" term.
4. **A correction-factor edit on the pump is still a Trial, and Harmonic only
   shows what followed it.** A change made on the pump is a Trial whether or not
   Harmonic proposed it (pump-changes ADR), and target is already a setting
   Harmonic watches but never tunes. An ISF-only edit is therefore still
   detected as a Trial. Harmonic serves exactly what a target Trial serves, and
   nothing that advises the correction factor. The operator, 2026-10-20: "I
   don't think we can weigh in other than just showing whether numbers look
   better or not … user has to decide what to do with that information."

   Concretely, an ISF Trial's target metric is In range (`tir`), as a target
   edit's is (`watched_change._TARGET_METRIC`, watched_change.py:47-52).
   Without the ISF branch (trial_evidence.py:608-612), its readiness is the
   generic branch: 30 coverage-qualified informative dates
   (trial_evidence.py:613-617). Its comparison serves each outcome's before,
   after, difference interval and assessment state (`favorable`,
   `concerning` or `unclear`, follow_up_comparison.py:240-245). It also serves
   the comparison summary, which is `concerning` or `unclear` with `mixed` and
   the fixed reason "Read each outcome separately…" (follow_up_comparison.py:
   603-611). Changes draws the target metric's state as the result pill:
   Better, Worse or Unclear (frontend/ui/changes-model.ts:154, :334). Its only
   action is End once matured (lock §1.1).

   None of these is a recommendation. At triage no Trial readout served
   keep, revert or change advice for any setting: a grep of
   `follow_up_comparison.py`, `watched_change.py`, `trial_evidence.py` and
   `outcomes_trend.py` finds no such string. No ISF Trial may add one, and
   no Queue card or guidance concern may follow from a Trial's result. An ISF
   Trial serves no fasting-step population and no fasting-window readiness.
   A whole-profile edit stays a profile Trial.
5. **Correction attribution stays.** A printed low or a pre-empted low that
   follows a correction keeps its correction attribution: `HarmArm.ISF`, and the
   pre-empted `"isf"` bucket and its count. That attribution keeps the low out
   of the carb-ratio arm. It is a fact about which dose ran the drop, not
   advice. The labels are internal identifiers and are not renamed.
6. **Durable state reads unchanged.** Stored rows are not migrated. A set-aside
   `setting:isf` preference becomes an absent row, still titled "Correction
   factor" by the closed setting-label table, and the wearer can restore it. A
   recorded ISF Plan keeps its subject name in Plan history. A retained
   `isf-all-*` Trial reads through the same parameter tables
   (`_TARGET_METRIC`, `_PLAN_PARAMETER`, the precision and unit maps), which
   keep their `isf` entries. The Plan item family `isf` stays valid on write,
   because a Plan's deliverable carries the programmed ISF column.
7. **Rest windows belong to the rest-window detector.** The detector
   (`rest_window.detect_rest_windows`) stays: basal Trial evidence, the outcomes
   trend and the timeline read it. The QA expectation's `rest_windows` are
   re-sourced from it over the analysis window, with every literal value
   unchanged (triage spike: every case's pinned windows are a subset of the
   detector's output over its store, equal where the case spans the window).
8. **The Overview's estimates grid.** Removing the ISF card would leave the
   basal estimate alone in a two-column row. The operator chose (2026-10-20,
   "5. A") that the basal estimate spans the cards' first row and Meal size the
   second, with every row one height, and on the phone one column in proportion.
   The proposed revision of `docs/design/recommendations-redesign.md` (§2.5
   2026-10-20 #564) carries the layout and its must-survive list. Slice A builds
   it once the operator says "locked". A correction factor snoozed before this
   change is no Queue row, so the Snoozed footer counts only the rows its list
   draws.
9. **One record across the active changes.** `recommendations-redesign`
   restates the two ISF staging-predicate requirements (MODIFIED) and adds
   Queue, Overview, Plan and QA requirements that name ISF. This change removes
   those predicates from the base specs. To let the two changes archive in
   either order, the same pull request deletes the redesign's two MODIFIED
   blocks and edits the ISF out of its ADDED requirement text. The operator
   approved this on 2026-10-20 ("yes").

**Consequences.**

- The result schema version moves, because `isf`, its lever, its settling gate
  and its epoch entry leave the analysis.
- Guidance no longer requires an `isf` key in the analysis.
- Trial evidence no longer imports the ISF analyzer.
- The ISF lever leaves the shared Priority ranking, so a basal or carb-ratio
  rank can move. Its count, with no values, is recorded here when slice B1 is
  built.
- `IsfConfig`'s constants that other code borrowed become local to their
  readers: the QA lane's peak and duration, and `carbs.py`'s flat lookback.
- `uncertainty.estimate_slope_clustered`, which only the analyzer called, goes
  with it.
- The parameter-analysis spec's Purpose still names ISF estimation. A delta
  cannot edit a Purpose, so the archive that folds this change in rewrites that
  paragraph by hand.
