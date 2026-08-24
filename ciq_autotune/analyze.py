"""The orchestration facade: ``analyze(store) -> AnalysisResult`` (F3b).

One entry point funnels the whole model into the single result object the CLI and
HTTP API render. It is where the foundation and the analyzers meet:

1. load every stream and the latest settings snapshot from the store;
2. compute basal and ISF/I:C setting epochs (basal from the dense feed; ISF/I:C from the
   snapshot diff). Basal cuts each slot's window to its own basal setting epoch; ISF/I:C are
   setting-independent physiology measurements and measure over the **full**
   requested window (ADR 0039 measure/compare split) — ISF/I:C setting epochs still drive
   the settling detector and the "verified only since" caveat, and the
   recommendation still compares to the current programmed value;
3. run the four analyzers over their windows;
4. assemble span, setting-epoch info, data-quality notes, and the estimates
   into a versioned :class:`~ciq_autotune.result.AnalysisResult`.

Pure orchestration over already-built pieces — no new analysis lives here.

Window default (``window_days=30``)
------------------------------------
30 days is the recommended default tradeoff:

* Too short (< ~21 d): overnight slots often stay below n≥5 clean days,
  producing wide CIs and no directional recommendation for exactly the slots
  where CIQ is most active.
* 30 d: fills overnight to n≥5 on typical Control-IQ data (verified: ~28/30
  nights have clean fasting steps) while tracking current physiology more
  closely than a 60-day window. 60 days buries the current month when ISF is
  drifting.
* Too long (> ~75 d for the reference dataset): pools pre- and post-edit delivery
  for slots whose programmed rate changed mid-window. Per-slot basal setting-epoch
  measurement cuts (``slot_cuts`` in ``analyze()``) mitigate this, but a raw long
  window still under-cuts slots that CIQ's correction basal crossed a recent
  programmed-rate boundary. Caller can always pass ``window_days=N`` explicitly.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Optional

from .analyzers.basal import analyze_basal, consolidate_profile
from .analyzers.ic import BLOCK_WINDOW_DAYS, analyze_ic, analyze_ic_blocks
from .analyzers.ic_regression import analyze_ic_blocks_fuzzy
from .analyzers.isf import analyze_isf
from .epochs import (
    Epoch,
    basal_epoch,
    basal_slot_epochs,
    dose_setting_epoch,
    reconcile_epoch,
    setting_epoch,
)
from .analyzers.ic import IcConfig
from .analyzers.isf import IsfConfig
from .analyzers.scenario_config import ScenarioConfig
from .analyzers.scenario.preempted import preempted_low_entries
from .analyzers.tuning_priority import (
    build_tuning_levers,
    ic_headline_block,
    price_ic_blocks,
    robust_daily_insulin,
)
from .harm import HarmConfig, find_printed_lows
from .false_low import drop_readings, false_low_spans
from .model import ModelConfig
from .rescue_evidence import (
    RescueObservation,
    eligible_carb_entries,
    first_observation,
    observe,
)
from .result import (
    SCHEMA_VERSION,
    AnalysisResult,
    DataQuality,
    EpochInfo,
    Settling,
    SlotEstimate,
    Span,
)
from .events import CarbEntry
from . import settings
from .settings import Snapshot
from .store import Store

# Boluses delivered before a basal window still leave decaying IOB inside it, so
# the basal clean-window filter must see a day of lead-in (cf. backtest).
_BOLUS_LEADIN = timedelta(days=1)
_ISF_DECISION_INTERVAL = timedelta(days=7)

_FMT = "%Y-%m-%d %H:%M:%S"


def _fmt(dt: Optional[datetime]) -> Optional[str]:
    return dt.strftime(_FMT) if dt else None


def _between(events, start: datetime, end: datetime):
    return [e for e in events if start <= e.t <= end]


def _epoch_info(epoch: Epoch, start: datetime, end: datetime) -> EpochInfo:
    return EpochInfo(
        parameter=epoch.parameter,
        start=_fmt(epoch.start),
        unverified_before=_fmt(epoch.unverified_before),
        effective_days=(end - start).total_seconds() / 86400.0,
    )


def analyze(
    store: Store,
    *,
    window_days: int = 30,
    now: Optional[datetime] = None,
    config: ModelConfig = ModelConfig(),
    ignore_setting_changes: bool = False,
    pool_agreeing_basal_regimes: bool = False,
    carb_entries: Optional[List[CarbEntry]] = None,
    harm_config: Optional[HarmConfig] = HarmConfig(),
    prompt_responses: Optional[List[dict]] = None,
    ic_estimator=analyze_ic_blocks_fuzzy,
) -> AnalysisResult:
    """Run the whole model over ``store`` and return one AnalysisResult.

    ``carb_entries`` (#125) is the unbolused-carb log — a manual **exclusion**
    signal (never a modeling input) that de-biases the analyzers (#127): it drops
    fasting-ISF steps, isolates I:C meals, and bars basal clean minutes around each
    entry. Threaded (windowed) to all three analyzers below. Callers pass
    ``store.carb_entries()`` (explicitly, unlike the other streams this facade
    reads from ``store`` itself).

    ``ignore_setting_changes`` is a **preview** switch: it nulls detected
    setting-epoch metadata as if the pump had never been re-programmed. It alters
    no data and defaults off. Since ADR 0039 the ISF/I:C *measurements* are
    full-window by default (they're setting-independent physiology), so this
    switch is a no-op for those measurements. It now only governs **basal**
    measurement: it drops the per-slot basal setting-epoch measurement cuts so the basal
    suggestion pools delivery from before and after a real profile edit. Read
    that as "average maintenance need over the window", not a live recommendation.
    Use it to see how the UI reads once you've been on one profile for months.

    ``pool_agreeing_basal_regimes`` (#85) is passed to
    :func:`~ciq_autotune.analyzers.basal.analyze_basal`: with the per-slot basal
    setting-epoch measurement cut still in force, it pools a slot's pre-edit clean
    samples back in *only when* they agree with the post-edit data (overlapping 80%
    CIs and a testable post subset), recovering the full-window n for edits that
    merely fixed the profile to match need. Diverging slots keep post-edit-only
    behavior and surface a note.
    Defaults off (see #56 for the original hard cut).

    ``harm_config`` (ADR 0038) enables the harm layer: printed lows are attributed
    to basal / ISF / I:C, gate a move toward more insulin, and on recurrence nudge
    the owning setting one capped step toward less insulin. Enabled by default
    (:class:`~ciq_autotune.harm.HarmConfig`); pass ``None`` to disable.

    ``prompt_responses`` (#381) are ``store.prompt_responses()`` rows; the
    ``false-low`` answers among them each invalidate a whole flagged excursion (a
    sensor-artifact / compression low). Their spans (:func:`false_low_spans`) drop the
    in-span CGM readings *before* the harm layer's printed-low detection (basal + ISF
    arms) and the fasting-ISF regression + rest-window ever see them — reading
    invalidation, not the carb *mask*. ``None`` (the default) means no false-low
    suppression, so the CLI/back-compat callers are unaffected.

    Both manual streams are read **observation-aware** (#467): the rescue evidence a
    window may use is only what had been recorded by that window's endpoint, and how
    much of the window the log was recording at all rides on the ISF row and the data
    quality notes. Callers pass the *full* streams (as they already do) so coverage can
    be measured from the log's first-ever entry.
    """
    basal = store.basal_events()
    cgm = store.cgm_readings()
    bolus = store.bolus_events()
    pump = store.pump_events()
    snaps = store.settings_snapshots()
    # The exclusion stream (#125), windowed per-analyzer below like every other
    # feed. Ignored downstream until slice 3, so an empty default is harmless.
    carb_entries = carb_entries or []
    prompt_rows = prompt_responses or []
    # When the rescue log first recorded anything (#467). Resolved once here off the
    # full streams, then handed to each window's coverage read below: a window reaching
    # back before this instant has no rescue rows because the log did not exist yet, so
    # its quiet is *unknown* and cannot license a stronger correction. The endpoint
    # eligibility boundary applies to the rescue-carb exclusion + attribution stream too
    # (`current_carbs` below, and every replayed endpoint): a carb recorded after a read
    # closed did not exist when it closed, so it may not retroactively mask that read's
    # fasting/basal minutes or shift its attribution. The one retroactive exception is
    # `false-low` reading invalidation (`fl_spans` below) — a CGM correction, not rescue
    # evidence, so by adr-381 it applies to every read of the excursion however late.
    rescue_from = first_observation(carb_entries, prompt_rows)
    # False-low excursion spans (#381): the CGM the harm layer and the fasting-ISF
    # path read has these readings removed entirely (reading invalidation). Computed
    # once here off the full CGM so the anchor's whole excursion resolves, then applied
    # at each read boundary below. The Day chart still draws them (greyed) — that
    # display path (/api/timeline) keeps the readings and only surfaces the span.
    fl_spans = false_low_spans(cgm, prompt_rows)

    times = [e.t for e in basal] + [r.t for r in cgm]
    span_start = min(times) if times else None
    span_end = max(times) if times else None
    insulin_history_start = min(
        [event.t for event in bolus]
        + ([span_start] if span_start is not None else []),
        default=None,
    )
    now = now or span_end or datetime.now()

    # Basal and ISF/I:C setting epochs plus measurement windows. target_bg is parsed and diffed by
    # F1, but has no analyzer in v0.1: the setpoint is CIQ's built-in 110, reached
    # via the ISF lever (ROADMAP §3), not a tuned output — so no target_bg setting epoch is
    # surfaced.
    b_ep = basal_epoch(basal, config.slot_minutes)
    # ISF/I:C setting epochs reconcile the forward-only snapshot log with the retroactive
    # dose-stamped series the pump writes on every bolus (#159): a change either
    # source saw carries the caveat/settling signal (most-recent wins), and a dose
    # series that shows the setting constant back before the first snapshot pushes
    # the "verified only since" caveat back to the earliest dose — clearing it
    # entirely when the dose data covers the full requested window. The dose-derived setting epoch
    # reads the *whole* bolus history (unwindowed) so constancy can be verified earlier
    # than `window_days`. target_bg is dose-stamped too but has no analyzer (CIQ's
    # built-in 110), so no target_bg setting epoch is surfaced.
    window_start = now - timedelta(days=window_days)
    isf_ep = reconcile_epoch(setting_epoch(snaps, "isf"),
                             dose_setting_epoch(bolus, "isf"), window_start)
    ic_ep = reconcile_epoch(setting_epoch(snaps, "carb_ratio"),
                            dose_setting_epoch(bolus, "carb_ratio"), window_start)
    if ignore_setting_changes:
        # Preview mode: forget every setting-epoch boundary. No data is touched. Since
        # ISF/I:C measurements are already full-window below, this now affects
        # basal's slot cuts and the ISF/I:C setting-epoch caveats/settling signals.
        b_ep = Epoch(b_ep.parameter, None, None)
        isf_ep = Epoch(isf_ep.parameter, None, None)
        ic_ep = Epoch(ic_ep.parameter, None, None)
    # ADR 0039 — measure/compare split. ISF and I:C are setting-independent
    # *physiology* measurements: a setting edit doesn't change the body's
    # response, only which number we compare against. So they measure over the
    # full requested window and are NEVER clamped to an ISF/I:C setting epoch
    # (clamping starves the estimate right after an edit — the degenerate
    # "ISF 58 · n=77 · CI[58,58]" that flipped the advice direction, #288).
    # `isf_ep`/`ic_ep` are still computed above: ISF/I:C setting epochs drive
    # the settling detector (a fresh edit still gets
    # flagged when its analyzer gate is unmet) and the "verified only since"
    # caveat, and the recommendation still compares to the *current* programmed
    # value (`settings.active_schedule` below). Only the measurement window is
    # decoupled from the setting-edit boundary. Basal keeps its per-slot basal setting-epoch
    # cuts (for basal the setting *is* the delivered quantity — ADR 0035 / #85).
    isf_start, isf_end = window_start, now
    ic_start, ic_end = window_start, now

    # Basal runs over the full requested window; each slot is then cut to its own
    # basal setting epoch, so a one-segment edit only shortens the slots it actually moved
    # (overnight slots keep the full window). Clean-window filter needs a day of
    # bolus lead-in for decaying IOB.
    b_start = window_start
    harm_lows = None
    if harm_config is not None:
        # ADR 0038: low-inside, insulin-lookback. The nadir must be inside the
        # requested analysis window, but attribution may read insulin and CGM shape
        # from the preceding Accounting-DIA/lead-in context.
        harm_lows = [
            low for low in find_printed_lows(
                drop_readings(_between(cgm, window_start - _BOLUS_LEADIN, now), fl_spans),
                _between(bolus, window_start - _BOLUS_LEADIN, now),
                harm_config,
            )
            if window_start <= low.t <= now
        ]
    slot_cuts = ({} if ignore_setting_changes else
                 {s: max(b_start, t) for s, t in
                  basal_slot_epochs(basal, config.slot_minutes).items() if t is not None})
    # Today's endpoint is a replay boundary too (#467): a carb whose physiological time
    # lands inside the current window but whose `created_at` is after `now` was not yet
    # recorded when this read closed, so it must not retroactively change basal clean
    # minutes, the fasting-ISF steps, or I:C meal exclusion. Filter the whole current
    # carb stream at `now` ONCE and feed that single eligible stream to all three, so no
    # analyzer reads an entry the endpoint could not have seen. (With a live `now` this is
    # a no-op — every recorded row is already eligible — it only bites a past-dated replay.)
    current_carbs = eligible_carb_entries(carb_entries, now)
    basal_rows = analyze_basal(
        _between(basal, b_start, now),
        _between(cgm, b_start, now),
        _between(bolus, b_start - _BOLUS_LEADIN, now),
        _between(pump, b_start, now),
        config=config,
        slot_starts=slot_cuts,
        active_basal=settings.active_schedule(snaps, "basal_rate"),
        pool_agreeing_regimes=pool_agreeing_basal_regimes,
        carb_entries=_between(current_carbs, b_start, now),
        harm_config=harm_config,
        harm_lows=harm_lows,
    )
    # Correction-attributed rescue-log days (#413 §4): manual carb entries the
    # pre-empted-low gate buckets to ISF — the masked-rescue channel that catches a
    # future correction-masker even when the CGM never printed the low. A days count
    # (never a rate/grams surcharge — nothing to price yet, ADR 0012 under-logging).
    isf_cgm = drop_readings(_between(cgm, isf_start, isf_end), fl_spans)
    # Two predicates, not one (#467): the usual event-time slice says the rescue
    # happened in this window, and the eligibility filter (already baked into
    # `current_carbs`, whose endpoint is this same `now`) says it was recorded by the
    # window's endpoint. Applied in the caller so the pre-empted-low gate stays a pure,
    # dependency-blind event function (ADR 0012); once eligible, its own `t` still drives
    # attribution and the per-day tally.
    isf_rescue_days = len({
        e.entry.t.date()
        for e in preempted_low_entries(
            _between(current_carbs, isf_start, isf_end),
            _between(bolus, isf_start, isf_end),
            isf_cgm,
        )
        if e.bucket == "isf"
    })
    isf_rescue_observation = observe(
        carb_entries, prompt_rows,
        start=isf_start, end=isf_end, observed_from=rescue_from,
    )
    # A stronger-ISF recommendation needs two actual weekly decision windows, not two
    # halves of today's data. Analyze the preceding endpoint through the same read-only
    # path, then pass only its independently qualifying signal into today's decision.
    prior_isf_end = isf_end - _ISF_DECISION_INTERVAL
    prior_isf_start = isf_start - _ISF_DECISION_INTERVAL
    prior_cgm = drop_readings(_between(cgm, prior_isf_start, prior_isf_end), fl_spans)
    prior_harm_lows = None
    if harm_config is not None:
        prior_harm_lows = [
            low for low in find_printed_lows(
                drop_readings(_between(cgm, prior_isf_start - _BOLUS_LEADIN,
                                       prior_isf_end), fl_spans),
                _between(bolus, prior_isf_start - _BOLUS_LEADIN, prior_isf_end),
                harm_config,
            )
            if prior_isf_start <= low.t <= prior_isf_end
        ]
    # The prior endpoint is a *second* replay boundary and needs the same eligibility
    # filter — at its own, earlier endpoint. Fixing only today's path would leave the
    # strengthen gate leaky, since a rescue logged after that endpoint would still count
    # itself out of a week-old window it was never part of.
    prior_rescue_days = len({
        e.entry.t.date()
        for e in preempted_low_entries(
            eligible_carb_entries(
                _between(carb_entries, prior_isf_start, prior_isf_end), prior_isf_end),
            _between(bolus, prior_isf_start, prior_isf_end),
            prior_cgm,
        )
        if e.bucket == "isf"
    })
    prior_rescue_observation = observe(
        carb_entries, prompt_rows,
        start=prior_isf_start, end=prior_isf_end, observed_from=rescue_from,
    )
    prior_isf = analyze_isf(
        _between(bolus, prior_isf_start, prior_isf_end),
        _between(basal, prior_isf_start, prior_isf_end),
        prior_cgm,
        settings.active_schedule(snaps, "isf"),
        # The eligibility boundary belongs on the stream the analyzer itself reads, not
        # only on `prior_rescue_days` above (#467): the fasting-exclusion mask and the
        # prior strengthen signal are computed inside `analyze_isf` off this stream, so a
        # rescue backfilled after this closed endpoint could still shift a fasting step
        # or the prior signal if it leaked in by event time alone.
        carb_entries=eligible_carb_entries(
            _between(carb_entries, prior_isf_start, prior_isf_end), prior_isf_end),
        harm_config=harm_config,
        harm_lows=prior_harm_lows,
        window_days=window_days,
        correction_rescue_days=prior_rescue_days,
        rescue_observation=prior_rescue_observation,
    )
    prior_strengthen_signal = bool(
        prior_isf and prior_isf[0].evidence.get("strengthen_signal"))
    isf_rows = analyze_isf(
        _between(bolus, isf_start, isf_end),
        _between(basal, isf_start, isf_end),
        # False-low excursions drop from the fasting-ISF regression + rest-window: the
        # readings are gone, so no fasting step (nor rest-window coverage) can form
        # across the flagged drop→rejoin — including the fake rebound above 70 (#381).
        isf_cgm,
        settings.active_schedule(snaps, "isf"),
        carb_entries=_between(current_carbs, isf_start, isf_end),
        harm_config=harm_config,
        harm_lows=harm_lows,
        window_days=window_days,
        correction_rescue_days=isf_rescue_days,
        prior_strengthen_signal=prior_strengthen_signal,
        rescue_observation=isf_rescue_observation,
    )
    ic_rows, ic_findings = analyze_ic(
        # At least one Accounting-DIA of bolus lead-in certifies whether each in-window
        # meal began clean, with correction-only prehistory, or with residual
        # insulin still coupled to an earlier meal (#481). `analysis_start`
        # prevents lead-in meals themselves from entering the 30-day estimate.
        _between(bolus, ic_start - _BOLUS_LEADIN, ic_end),
        settings.active_schedule(snaps, "carb_ratio"),
        cgm_readings=_between(cgm, ic_start, ic_end),
        isf_effective=settings.effective_isf(isf_rows, snaps),
        carb_entries=_between(current_carbs, ic_start, ic_end),
        basal_events=_between(basal, ic_start, ic_end),
        harm_config=harm_config,
        harm_lows=harm_lows,
        analysis_start=ic_start,
        prior_action_observed_from=max(
            ic_start - _BOLUS_LEADIN,
            insulin_history_start or ic_start,
        ),
    )

    # --- carb-ratio BLOCKS: a second, deliberately different window (#518) ----------
    # The segment rows above are the pump lane — what the profile says, read over the
    # REQUESTED window. The blocks below are what decides, and they measure over a
    # FIXED trailing 90 days regardless of `window_days` (adr-518-ic-meal-run-ledger, decision 10):
    # the meal-run ledger needs that depth or most blocks' pools starve. This is a new
    # convention in this codebase and it is labelled as such on screen; the cost is
    # compute, not I/O, because the streams above are already loaded unwindowed.
    #
    # EVERYTHING the block decision reads follows the same 90-day span, including its
    # own harm lows. `harm_lows` above stays exactly as it was — the basal (:284) and
    # ISF (:375) arms must see the identical request-windowed list they saw before this
    # change, and a test pins their rows byte-identical across the split.
    block_start = now - timedelta(days=BLOCK_WINDOW_DAYS)
    ic_harm_lows = None
    retained_ic_harm_lows = None
    if harm_config is not None:
        retained_ic_harm_lows = [
            low for low in find_printed_lows(
                drop_readings([reading for reading in cgm if reading.t <= now], fl_spans),
                [event for event in bolus if event.t <= now],
                harm_config,
            )
            if low.t <= now
        ]
        ic_harm_lows = [low for low in retained_ic_harm_lows
                        if block_start <= low.t <= now]
    # How much history actually exists, capped at the block window. A pool that has not
    # had 90 days to fill is `collecting`, never "short" — the state machine reads this.
    observed_days = min(
        BLOCK_WINDOW_DAYS,
        int((now - (insulin_history_start or now)).total_seconds() // 86400),
    )
    ic_history = []
    ic_blocks, ic_runs = ic_estimator(
        [event for event in bolus if event.t <= now],
        settings.active_schedule(snaps, "carb_ratio"),
        config=IcConfig(),
        cgm_readings=[reading for reading in cgm if reading.t <= now],
        isf_effective=settings.effective_isf(isf_rows, snaps),
        carb_entries=[entry for entry in current_carbs if entry.t <= now],
        basal_events=[event for event in basal if event.t <= now],
        harm_config=harm_config,
        harm_lows=ic_harm_lows,
        history_harm_lows=retained_ic_harm_lows,
        analysis_start=block_start,
        analysis_end=now,
        prior_action_observed_from=insulin_history_start or block_start,
        observed_days=observed_days,
        snapshots=snaps,
        history_catalog=ic_history,
    )

    # Behavioral aggregate-detector output was removed with the scenario-engine
    # cut-over (#70): the episode-level scenario payload (see
    # :mod:`~ciq_autotune.analyzers.scenario`, served at ``/api/scenarios``) replaces it.
    # The one behavioral-shaped signal that is *not* an ex-detector — the I:C
    # carb-counting Finding — is the I:C analyzer's own output and stays here.
    findings = list(ic_findings)

    # #95: per-parameter settling — a recently changed parameter whose post-change
    # data hasn't yet cleared its analyzer's own sufficiency gate. Off setting-epoch start
    # (nulled in preview mode, so preview reveals the suppressed recommendation)
    # + post-change progress vs. each config's describe_gate().
    settling = _settling(
        b_ep, isf_ep, ic_ep,
        basal_rows=basal_rows, isf_rows=isf_rows, ic_runs=ic_runs,
        slot_cuts=slot_cuts, config=config,
    )

    # The unified per-flavor tuning Lever priorities (ADR 0032): basal / ISF / I:C each
    # roll up into one Lever scored in insulin currency, on the same 0–100 axis the
    # /api/scenarios behavioral Levers carry, so the Diagnose queue interleaves them.
    scenario_config = ScenarioConfig()
    # One robust user-level insulin baseline (#446), computed once over the window's total
    # delivered insulin (basal + bolus) and shared by all three levers, so the currency is
    # scale-invariant: the soft-curve knee becomes a fraction of *this* user's total dose.
    robust_daily_insulin_u = robust_daily_insulin(
        _between(basal, window_start, now), _between(bolus, window_start, now),
        scenario_config,
    )
    # Each I:C block is priced in the shared insulin currency by its OWN 90-day carb
    # load (#518), then the Lever and the consolidated profile both read the SAME
    # priced list — so the block the surface flags and the block whose value lands in
    # the deliverable profile can never be two different blocks.
    ic_blocks = price_ic_blocks(
        ic_blocks, scenario_config=scenario_config,
        robust_daily_insulin_u=robust_daily_insulin_u,
    )
    tuning_levers = build_tuning_levers(
        basal_rows, isf_rows, ic_blocks,
        slot_minutes=config.slot_minutes, scenario_config=scenario_config,
        robust_daily_insulin_u=robust_daily_insulin_u,
    )

    # Basal setting epoch is reported as a summary: the most-recently-changed slot's
    # boundary (individual slots may keep the full window — see slot_cuts).
    b_eff_start = max(b_start, b_ep.start) if b_ep.start else b_start
    epochs = [
        _epoch_info(b_ep, b_eff_start, now),
        _epoch_info(isf_ep, isf_start, isf_end),
        _epoch_info(ic_ep, ic_start, ic_end),
    ]
    return AnalysisResult(
        schema_version=SCHEMA_VERSION,
        generated_at=datetime.now().strftime(_FMT),
        window_days=window_days,
        span=Span(start=_fmt(span_start), end=_fmt(span_end)),
        epochs=epochs,
        data_quality=DataQuality(
            counts=store.counts(),
            notes=_quality_notes(epochs, snaps, basal_rows,
                                 rescue_observation=isf_rescue_observation),
        ),
        basal=basal_rows,
        # #98: build the unified four-parameter ≤16-segment pump profile once, here.
        # Boundaries are the union of basal/ISF/I:C/target change points; unchanged
        # params carry forward from the current programmed profile via the #105
        # effective-settings seam (settings.active_schedule). target has no analyzer,
        # so it is pure carry-forward. render.py/report.py read this off the result;
        # their derive-on-read fallback (basal-only) covers older stored JSON.
        consolidated_basal=consolidate_profile(
            basal_rows,
            isf=isf_rows,
            # #518: the deliverable carb-ratio schedule is written by the HEADLINE block
            # and no other — machine-initiated advice is one change at a time. A user
            # who wants a second block programmed stages it through the Plan path.
            carb_ratio=ic_headline_block(ic_blocks),
            programmed_isf=settings.active_schedule(snaps, "isf"),
            programmed_ic=settings.active_schedule(snaps, "carb_ratio"),
            programmed_target=settings.active_schedule(snaps, "target_bg"),
        ),
        isf=isf_rows,
        ic=ic_rows,
        behavioral=findings,
        settling=settling,
        tuning_levers=tuning_levers,
        priority_active_threshold=scenario_config.priority_active_threshold,
        ic_blocks=ic_blocks,
        ic_runs=ic_runs,
        ic_history=ic_history,
    )


def _settling(
    b_ep: Epoch,
    isf_ep: Epoch,
    ic_ep: Epoch,
    *,
    basal_rows: List[SlotEstimate],
    isf_rows: List,
    ic_runs: int,
    slot_cuts: dict,
    config: ModelConfig,
) -> List[Settling]:
    """Per-parameter settling states (#95).

    A parameter settles when its setting-epoch ``start`` exists (a recent detected
    change; ``None`` in preview mode, which is why preview reveals the
    recommendation) AND its post-change data hasn't cleared its analyzer's *own*
    sufficiency gate. The countdown unit and the "enough data" criteria come from each config's
    :func:`describe_gate`, so the explanatory text is entirely code-driven.
    """
    out: List[Settling] = []

    # Basal: gate is HIGH-confidence clean days (ModelConfig.high_min_days). Only
    # the slots the basal setting epoch actually cut are "post-change"; a change is still settling
    # while the best-covered cut slot hasn't reached the day count. `have` is the
    # max clean-day count over those slots.
    if b_ep.start is not None and slot_cuts:
        gate = config.describe_gate()
        cut_slots = set(slot_cuts)
        have = max((r.days for r in basal_rows if r.slot in cut_slots), default=0)
        if have < gate["needed"]:
            out.append(Settling("basal_rate", _fmt(b_ep.start), gate, have))

    # ISF: soft gate — a fasting regression that yields a number only once enough
    # clean fasting steps accrue (ADR 0001: no per-day breakdown). Settling while
    # the change is recent and no estimate has been produced yet; no fabricated
    # countdown (have/needed both None).
    if isf_ep.start is not None:
        isf_measured = isf_rows and isf_rows[0].estimate.value is not None
        if not isf_measured:
            out.append(Settling("isf", _fmt(isf_ep.start), IsfConfig().describe_gate(), None))

    # I:C: gate is IcConfig.min_runs qualifying MEAL RUNS (#518). `have` is the one
    # whole-day run total `analyze_ic_blocks` returned — never a sum across rows or
    # blocks, because a run that spans a block boundary belongs to both and summing
    # would count it twice. This countdown speaks only to the whole-day gate; a block's
    # own "N of 8 meal runs" countdown is a different denominator and the two never
    # share a screen line.
    if ic_ep.start is not None:
        gate = IcConfig().describe_gate()
        if ic_runs < gate["needed"]:
            out.append(Settling("carb_ratio", _fmt(ic_ep.start), gate, ic_runs))

    return out


def _quality_notes(
    epochs: List[EpochInfo],
    snaps: List[Snapshot],
    basal_rows: Optional[List[SlotEstimate]] = None,
    rescue_observation: Optional[RescueObservation] = None,
) -> List[str]:
    notes: List[str] = []
    # #467: how much of the ISF decision window the rescue log was recording. An
    # under-covered window is *unknown*, not rescue-free, so say so wherever the result
    # is read — the same span also blocks a stronger-correction move.
    ro = rescue_observation
    if ro is not None and not ro.fully_observed:
        if ro.observed_from is None:
            notes.append(
                "No rescue carbs have ever been logged, so none of the last "
                f"{ro.window_days} day(s) can be read as rescue-free — corrections "
                "will not be recommended stronger until that log has some history.")
        else:
            notes.append(
                f"The rescue-carb log covers {ro.observed_days} of the last "
                f"{ro.window_days} day(s) (it starts "
                f"{ro.observed_from.strftime(_FMT)}); the earlier day(s) are unknown, "
                "not rescue-free, so corrections will not be recommended stronger off "
                "them.")
    # #85: per-slot pooling decisions the basal analyzer recorded on each row.
    # `pooled` slots recovered their pre-edit samples (regimes agreed); `diverged`
    # ones kept post-edit-only data and each carry a specific divergence note.
    pooled = diverged = 0
    diverge_notes: List[str] = []
    for row in (basal_rows or []):
        p = row.evidence.get("pooling") if isinstance(row.evidence, dict) else None
        if not p:
            continue
        if p.get("pooled"):
            pooled += 1
        else:
            diverged += 1
            if p.get("note"):
                diverge_notes.append(p["note"])
    if not snaps:
        notes.append("No settings snapshot yet — ISF/I:C compared to nothing until "
                     "the first fetch records one. Programmed values fill in over time.")
    for e in epochs:
        # ADR 0039: only basal setting changes cut basal measurement. ISF/I:C measure
        # over the full window (setting-independent physiology), so a recent ISF/I:C
        # setting change emits NO "window cut" note — the settling detector surfaces a
        # still-thin fresh edit, and the recommendation always compares to the current
        # programmed value. The "verified only since" caveat below still applies.
        if e.start is not None and e.parameter == "basal_rate":
            if pooled or diverged:
                # Pooling was on: the cut is now data-driven, not blanket.
                note = ("Some basal slots were recently edited. "
                        f"{pooled} edited slot(s) pooled pre- and post-edit "
                        "data (the two agreed) and keep the full window; ")
                if diverged:
                    note += (f"{diverged} kept post-edit-only data (~"
                             f"{e.effective_days:.1f}d) because pre- and "
                             "post-edit delivery disagreed.")
                else:
                    note += "no edited slot's pre/post data disagreed."
                notes.append(note)
                notes.extend(diverge_notes)
            else:
                notes.append("Some basal slots were recently edited; those slots are "
                             f"cut to ~{e.effective_days:.1f}d while unchanged slots keep "
                             "the full window.")
        if e.unverified_before is not None:
            notes.append(f"{e.parameter} history is verified only since "
                         f"{e.unverified_before}; in-place edits before then are invisible.")
    # #106: the one-sided / dawn-band lean verdict the basal analyzer now records
    # on each row (evidence["onesided"]), collected off the rows in slot order —
    # the same pattern as the pooling verdict above.
    for row in (basal_rows or []):
        o = row.evidence.get("onesided") if isinstance(row.evidence, dict) else None
        if o and o.get("note"):
            notes.append(o["note"])
    return notes
