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
4. **A correction-factor edit on the pump is still a Trial.** A change made on
   the pump is a Trial whether or not Harmonic proposed it (pump-changes
   ADR), and target already shows that Harmonic watches a setting it never
   tunes. An ISF-only edit is therefore still detected as a Trial. It is judged
   on its target metrics as a target edit is, through the generic readiness,
   with no fasting-step population and no fasting-window readiness. A
   whole-profile edit stays a profile Trial. *(Operator decision pending at
   triage. If the operator chooses that an ISF-only edit opens no Trial, this
   rule becomes "an ISF-only edit opens no Trial; a retained one still reads",
   and the `c4-isf` cases are rebuilt on another setting.)*
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
8. **The Overview's estimates grid.** Removing the ISF card leaves the basal
   estimate alone in a two-column row. The new layout is the operator's call
   under the redesign lock. *(Pending at triage. Recommended: Basal estimate
   spans the first row and Meal size the second, every row one height.)*
9. **One record across the active changes.** `recommendations-redesign`
   restates the two ISF staging-predicate requirements (MODIFIED) and adds
   Queue, Overview, Plan and QA requirements that name ISF. This change removes
   those predicates from the base specs. To let the two changes archive in
   either order, the same pull request deletes the redesign's two MODIFIED
   blocks and edits the ISF out of its ADDED requirement text. *(Operator
   approval pending at triage: it edits another active change.)*

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
