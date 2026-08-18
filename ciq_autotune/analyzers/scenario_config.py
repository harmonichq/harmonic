"""ScenarioConfig — the single home for the scenario/detector-layer thresholds (#114).

The scenario engine (:mod:`.engine`) and its instance classifiers
(:mod:`...classifiers`) were tuned by scattering ~45 module-level constants across
~10 files. This dataclass consolidates every one of those detector thresholds into
one frozen record, threaded through the engine exactly the way
:class:`~ciq_autotune.model.ModelConfig` is already threaded — so the knobs have a
single, greppable home and can be read/edited in one place.

**This is deliberately separate from ``ModelConfig``.** ``ModelConfig`` governs the
clean-window filter / model brain (basal suggestion, confidence gating);
``ScenarioConfig`` governs the *detector layer* (anchors, segmentation, severity,
the per-lever classifiers). Keep them distinct — do not fold one into the other.

**Behavior-preserving.** Every field's default is the exact value the constant it
replaced carried; several near-identical numbers are deliberately distinct fields
(see the ``anchor_near_low_mgdl`` / ``gate_low_mgdl`` pair below), so a 70 and a 75
that happen to look alike are *not* merged. The defaults are not user-tweakable —
they are hand-tuned by agents as the algorithm developed and stay code-owned (#114).

**Why it lives at ``analyzers/`` and not inside the ``scenario`` package.** Roughly
half these knobs belong to the per-instance classifiers in the sibling
:mod:`ciq_autotune.analyzers.classifiers` package, which the ``scenario`` engine
*depends on*. Hosting the shared config inside ``scenario`` would make the lower
``classifiers`` layer import from the higher ``scenario`` package, and
``scenario/__init__`` eagerly pulls ``engine → classifiers`` — a circular import.
Living one level up (``analyzers``, whose ``__init__`` is inert) lets both layers
import it cleanly. See ADR 0023.
"""

from __future__ import annotations

from dataclasses import dataclass

@dataclass(frozen=True)
class ScenarioConfig:
    """Detector-layer thresholds for the scenario engine (#114).

    Fields are grouped by the detector/helper they belong to and named for it, so a
    threshold's purpose is legible from its field name and two same-valued knobs from
    different detectors never collide. Mirrors :class:`~ciq_autotune.model.ModelConfig`'s
    style: ``@dataclass(frozen=True)``, per-field defaults, doc comments carried over
    from the constants they replace.
    """

    # --- anchors (anchors.py) ---------------------------------------------------
    #: A carb-tagged bolus is a "meal"; below this, carbs are noise. Mirrors the
    #: classifiers' meal floor so the same boluses are meals everywhere.
    anchor_meal_min_carbs: float = 10.0
    #: The user-correction floor (U) for anchoring — the provenance-less fallback for a
    #: pure correction and the admission floor on a mixed bolus's correction component.
    anchor_user_correction_floor_u: float = 1.0
    #: Low-anchor threshold: any CGM run whose nadir reaches this is anchored. This is
    #: the near-low line (75), deliberately looser than the exposure/gate low line
    #: (``gate_low_mgdl`` = 70) — a dip to 71-75 is attributable but is not "a low you
    #: had", so it must not widen the LOWS denominator. **Distinct from gate_low_mgdl.**
    anchor_near_low_mgdl: float = 75.0
    #: A CGM run whose peak reaches this is a high; its peak is anchored.
    anchor_high_mgdl: float = 250.0
    #: Readings within this gap are one CGM run; a wider gap closes the run.
    anchor_run_gap_min: float = 30.0
    #: How far a meal anchor reaches forward for clustering/windowing (#78). Mirrors
    #: ``carb_undercount_peak_lookahead_min`` (the widest meal look-ahead), widened
    #: 180→300 with it (ADR 0030) so the meal anchor and its late peak still cluster
    #: into one episode.
    anchor_meal_reach_min: float = 300.0

    # --- context gate (classifiers/context_gate.py) -----------------------------
    #: A CGM reading at/under this is a "low" for gating/exposure — the ~70 mg/dL line.
    #: **Distinct from anchor_near_low_mgdl (75)**: there is an explicit code comment
    #: marking the divergence; do not merge them.
    gate_low_mgdl: float = 70.0
    #: How far back the context gate looks for an upstream cause (recovery rise).
    gate_lookback_min: float = 90.0
    #: Adjacent suspend rows within this gap are one episode (CIQ writes one per 5 min).
    gate_suspend_group_gap_min: float = 15.0

    # --- segmentation (segment.py) ----------------------------------------------
    #: Anchors more than this far apart are separate episodes (wide end of ~75-90).
    segment_max_gap_min: float = 90.0
    #: Hard cap on an episode's span; a longer cluster is split (dead-site safety net).
    segment_max_duration_min: float = 300.0
    #: In-range band low edge for the double-hump / recovery trough tests.
    segment_range_low_mgdl: float = 70.0
    #: In-range band high edge for the double-hump / recovery trough tests.
    segment_range_high_mgdl: float = 180.0
    #: Over-treated-low rebound bar (#104/ADR 0005): a low whose BG rebounds to this
    #: within the post-nadir scan was over-treated with fast carbs.
    segment_rebound_high_mgdl: float = 160.0
    #: The post-nadir peak scan's loose upper horizon (#149) — a wide ceiling; the
    #: settled-recovery guard does the real discrimination.
    segment_rebound_horizon_min: float = 180.0
    #: A carb-tagged bolus at/above this size is a new meal story that hard-caps the
    #: post-low rebound scan. Kept above the 15 g rescue-carb idiom so low treatment
    #: carbs do not erase an otherwise visible over-treated-low rebound.
    segment_rebound_stop_meal_min_carbs: float = 20.0
    #: A settled recovery must hold roughly level in range this long to cap the scan.
    segment_recovery_dwell_min: float = 30.0
    #: Levelness gate (#153): a dwell's least-squares slope magnitude at/below this
    #: (mg/dL per min) is "settled"; steeper is still moving.
    segment_recovery_max_slope: float = 0.2
    #: Detrended-noise band a dwell must stay within after removing its (near-zero) slope.
    segment_recovery_drift_mgdl: float = 20.0

    # --- severity (severity.py) -------------------------------------------------
    #: In-range band low edge for the hypo-weighted severity integral.
    severity_bg_low: float = 70.0
    #: In-range band high edge for the hypo-weighted severity integral.
    severity_bg_high: float = 180.0
    #: A hypo minute costs this many times a hyper minute of equal magnitude.
    severity_hypo_weight: float = 3.0
    #: Cap on the minutes any single CGM reading represents (so a gap doesn't inflate).
    severity_max_gap_min: float = 15.0
    #: Equivalent-minutes the nadir-depth term (#151) credits the deepest below-range point.
    severity_nadir_depth_min_equiv: float = 15.0
    #: The mg/dL·min score at which normalized severity reaches ~0.63 (1 - 1/e).
    severity_norm: float = 3000.0

    # --- attribution (attribute.py) ---------------------------------------------
    #: The context pad the #155 split gate attributes a candidate low-moment over. MUST
    #: match ``engine_context_pad_min`` so the gate's verdict reproduces the real build.
    attribute_split_context_pad_min: float = 300.0
    # --- engine aggregation (engine.py) -----------------------------------------
    #: How far past an episode's bounds to hand classifiers CGM/bolus/basal context.
    engine_context_pad_min: float = 300.0
    #: Lead-in / lead-out included in an episode's display ``window`` payload.
    engine_window_pad_min: float = 30.0
    #: Cut-off-at-peak resolution horizon (#80): how far forward to extend a truncated
    #: arc to its return-to-range so severity scores the whole excursion.
    engine_resolve_horizon_min: float = 180.0
    #: A pattern needs at least this many episodes to surface at all (a one-off is not a
    #: pattern). Over-treated lows are exempt.
    engine_min_occurrences: int = 2
    #: Score floor: a pattern scoring below this collapses behind the low-confidence expander.
    engine_score_floor: float = 0.04
    #: Strong-override occurrence count: a pattern recurring at least this often AND
    #: materially bad each time headlines regardless of the score floor.
    engine_strong_occurrences: int = 4
    #: Strong-override effect floor paired with ``engine_strong_occurrences``.
    engine_strong_effect: float = 0.5
    #: Trust floor on exposure ``n``: below this the sample is too thin — keep collapsed.
    engine_min_trust_n: int = 3

    # --- narration (narrate.py) -------------------------------------------------
    #: In-range band low edge for the narrative arc-bounding.
    narrate_range_low_mgdl: float = 70.0
    #: In-range band high edge for the narrative arc-bounding (also the peak-beat floor).
    narrate_range_high_mgdl: float = 180.0
    #: When the trigger text already carries a number within this of the arc peak, the
    #: peak beat is redundant.
    narrate_peak_stated_tol: float = 20.0
    #: Never let one episode become a wall of more than this many beats.
    narrate_max_beats: int = 6
    #: A low trigger's arc extends through a rebound that climbs back out of range within
    #: this horizon of the return-to-range trough (#81). 2 h.
    narrate_rebound_horizon_min: float = 120.0

    # --- pre-empted lows (preempted.py) -----------------------------------------
    #: A `source='manual'` entry is a pre-empted low only if the CGM never reached a
    #: printed (near-)low nadir within this window on each side of the entry.
    preempted_printed_low_window_min: float = 30.0
    #: Attributability floor on residual bolus IOB (U) at the rescue instant (ADR 0012 §3).
    preempted_attributability_floor_u: float = 0.3

    # --- suspend classifier (classifiers/suspend.py) ----------------------------
    #: A CGM nadir at/under this within the gate window signals a real/near low (#75).
    suspend_near_low_mgdl: float = 75.0
    #: How far after a suspend ends to look for a nadir (post-suspend recovery window).
    suspend_post_window_min: float = 45.0
    #: Minimum suspend duration (min) to count as a meaningful episode (≤10 min = trivial).
    suspend_min_duration_min: float = 10.0
    #: Inclusive Meal-to-suspend ownership horizon (ADR 681). 2 h.
    meal_suspend_ownership_min: float = 120.0

    # --- carb-undercount classifier (classifiers/carb_undercount.py) ------------
    #: Flag as undercount when the excursion implies at least this ratio of logged carbs.
    carb_undercount_ratio: float = 1.5
    #: ...OR when the absolute implied gap clears this many grams.
    carb_undercount_gap_g: float = 30.0
    #: A meal must peak above this to be a runaway candidate.
    carb_undercount_runaway_peak_mgdl: float = 200.0
    #: How long after the bolus to look for the excursion peak. Widened 180→300 (the
    #: ``ACCOUNTING_DIA_MIN`` "meal fully acted" horizon) to reclaim genuine late-peak
    #: undercounts; the read is capped at the next *separate* meal so a meal never
    #: claims the next meal's spike (ADR 0030).
    carb_undercount_peak_lookahead_min: int = 300
    #: Same-meal grace (min): a later carb bolus within this of the meal's OWN bolus
    #: time is a dose-split (pre-bolus + top-up, dual-wave), not a separate meal, so it
    #: does NOT cap the peak-search window. Measured from the meal's own bolus, never
    #: chained (ADR 0030). The separate-meal floor reuses ``anchor_meal_min_carbs``.
    carb_undercount_same_meal_grace_min: float = 30.0

    # --- correction-stacking classifier (classifiers/correction_stacking.py) ----
    #: The user-correction floor (U) for the stacking classifier's is-correction gate.
    stacking_user_correction_floor_u: float = 1.0
    #: Two user corrections within this gap are "stacked".
    stacking_window_min: float = 60.0
    #: BG at/above which, if still rising, a correction is chasing a rational runaway high.
    stacking_runaway_high_mgdl: float = 180.0
    #: Pre-dose CGM slope (mg/dL/min) above which BG is "still rising" for the runaway gate.
    stacking_runaway_rising_slope_mgdl_min: float = 0.5
    #: How far back to fit the pre-dose slope (~4 CGM points).
    stacking_slope_lookback_min: int = 20
    #: How long after the stacking correction to look for the low it may have driven.
    stacking_low_lookahead_min: float = 240.0
    #: A CGM reading at/under this is the "low that followed" a stack.
    stacking_low_mgdl: float = 70.0
    #: Reconstructed bolus IOB (U) at/above which the stack landed on meaningful insulin.
    stacking_iob_floor_u: float = 0.5
    #: Rapid-analog peak (min) for the reconstructed bolus-IOB curve in the stack judgment.
    stacking_iob_peak_min: float = 75.0

    # --- correction-on-IOB classifier (classifiers/correction_on_iob.py) --------
    #: Pre-dose slope (mg/dL/min) above which a lone correction was chasing a rise
    #: (stricter than stacking's runaway rule — any level disqualifies).
    correction_on_iob_rising_slope_mgdl_min: float = 0.5

    # --- late-bolus classifier (classifiers/late_bolus.py) ----------------------
    #: Pre-bolus CGM slope (mg/dL/min) above which a meal bolus is a "late" candidate.
    late_bolus_rising_slope_mgdl_min: float = 1.0
    #: How far back to fit the pre-bolus slope (~4 CGM points).
    late_bolus_slope_lookback_min: int = 20
    #: BG at bolus above this suppresses the late verdict (clearly-high baseline, #117).
    late_bolus_high_start_mgdl: float = 250.0
    #: How far back to look for a completed carb bolus that already owns the rise (#167).
    late_bolus_prior_carb_bolus_lookback_min: int = 60

    # --- missed-meal classifier (classifiers/missed_meal.py) --------------------
    #: CGM slope (mg/dL/min) at the anchor above which BG is "rising" for a missed-meal call.
    missed_meal_rise_slope_mgdl_min: float = 1.0
    #: How far back to fit the slope at the anchor (~4 CGM points).
    missed_meal_slope_lookback_min: int = 20
    #: How far back to scan for a prior carb-tagged bolus (digestion-tail suppression).
    missed_meal_digestion_lookback_min: int = 150
    #: Minimum carbs on a bolus to count as a "meal" for digestion-tail gating.
    missed_meal_min_carbs: float = 10.0

    # --- user-override provenance (classifiers/user_override.py) ------------------
    #: Smallest override gap (U) that counts as a real directional override (not rounding).
    user_override_gap_floor_u: float = 0.05
    #: Pump calculated correction (U) at/under which it effectively said "no correction needed".
    user_override_pump_zero_rec_u: float = 0.2
    #: Near-low line (mg/dL) an override-up must reach for the rate tile's HARM count.
    user_override_harm_low_mgdl: float = 80.0
    #: How long after an override-up to look for the low it may have driven.
    user_override_harm_lookahead_min: float = 300.0

    # --- unified Lever Priority index (priority.py / tuning_priority.py, ADR 0032) --
    #: Shared U/day scale for all tuning levers. One scale unit is the old 1.0 impact
    #: ceiling, but ADR 435 replaces the hard clamp with a monotone soft tail: currencies
    #: stay exactly linear through ``priority_impact_linear_u_day``, then approach 1.0
    #: without reaching it. Thus 0.23 U/day still reads 0.23 (preserving the established
    #: low-end/action-line meaning) while 1.1 and 3.6 U/day remain ordered instead of both
    #: pinning at 1.0. Identical U/day always maps to identical impact for basal/ISF/I:C.
    #: **These U/day numbers are calibrated at** ``priority_baseline_reference_u_day``
    #: **(#446):** the curve is fed a currency first *normalized to that reference dose
    #: scale* (``impact_u_day · reference / robust_daily_insulin_u``), so the knee is a
    #: fraction of the user's own total dose, not an absolute — a 20 U/day and a 100 U/day
    #: user with the same *relative* mis-dose read the same impact.
    priority_impact_unit_u_day: float = 1.0
    #: End of the exact-linear region. 0.7 U/day is the impact required to reach priority
    #: 30 at the established recurrent-harm case (7 of 30 days, Wilson lower bound ≈.127),
    #: so the soft tail fixes high-end saturation without mechanically demoting any
    #: previously actionable low-end currency. Grounded/forecast in ADR 435. At the
    #: reference dose below this 0.7 knee is ≈1.3% of TDD (#446); it scales with the user.
    priority_impact_linear_u_day: float = 0.7
    #: Robust user-level daily insulin (U/day) the two currency constants above are
    #: calibrated at, and the fallback when a caller doesn't thread a real baseline or the
    #: window is too thin to estimate one (#446). 50.0 is a generic adult reference dose,
    #: not a figure measured from any individual; it exists only to give the two currency
    #: constants above a fixed scale to be calibrated against. It is NOT a free knob —
    #: changing it re-scales every priority and moves where ``priority_active_threshold``
    #: falls, so the currency constants must be re-derived in the same change. One shared
    #: denominator for all three levers — never a per-lever one.
    priority_baseline_reference_u_day: float = 50.0
    #: Minimum days with delivery before the trailing-median baseline is trusted; below it
    #: the reference above stands in, so a thin/new account degrades sanely (#446).
    priority_baseline_min_days: int = 5
    #: Priority (0–100) at/above which a Lever is actionable now; below it collapses
    #: into the "why so few?" tail. Grounded on real-data review (see ADR 435). ADR 0032.
    #: The line stands under ADR 435's currency recalibration (#415 verified 30 is a line,
    #: the per-lever normalizers were the defect — the fix is the currency above, not this).
    priority_active_threshold: int = 30
    #: The clean-night denominator for the basal recurrence Wilson bound: k = clean
    #: nights the headline block ran on the suggested side, n = this window.
    priority_recurrence_window_days: int = 30
    #: ISF priority is computed in the shared insulin currency (see
    #: shared soft currency curve above) so it is comparable to basal. ISF's frequency +
    #: correction-size factors are read **from the window** by the analyzer (#413); these
    #: stay only as the fallback when the window carries no corrections.
    priority_isf_delta_bg_mgdl: float = 50.0        # FALLBACK representative correction size
    priority_isf_corrections_per_day: float = 3.0   # FALLBACK correction frequency
    #: The I:C currency is ``carbs/day · |1/current − 1/recommended|`` plus an arm-wide
    #: rescue surcharge (``rescue g/day ÷ measured``). Post-#518 every input is carried on
    #: the block itself — each block's own attributed carbs over its own 90-day span — so
    #: there is no fallback carb-load constant and no wholesale suppression flag here: a
    #: block is held by its own four-condition eligibility gate
    #: (:func:`~ciq_autotune.analyzers.ic.ic_asserts_move`) or not at all.

    # --- shared CGM staleness (all slope-reading classifiers) --------------------
    #: Staleness guard (min) for the ``_CgmSeries``: a gap wider than this leaves the
    #: slope undefined rather than interpolating across missing data. Shared by the
    #: late-bolus / missed-meal / carb-undercount / correction-stacking / correction-on-IOB
    #: classifiers (they all built ``timedelta(minutes=10)`` locally).
    cgm_max_stale_min: float = 10.0
