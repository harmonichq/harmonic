#!/usr/bin/env python3
"""Freeze the Diagnose findings projection by RUNNING it (#730).

Lock term 40: the window-scoped row set is a server-owned projection, and its
fixtures are frozen "through the real public interface — never hand-assembled JSON".
So every row in the committed fixture comes out of
:meth:`~ciq_autotune.findings_projection.FindingsProjection.project`, and the payload
it projects from comes out of the real engines: basal verdicts through
:func:`~ciq_autotune.safety.cap`, their sentences through
``analyzers.basal._annotation_for``, the ISF read through ``analyzers.isf._recommend``
and ``analyzers.isf.isf_asserts_move``,
the I:C blocks through the shipped block estimator + ``price_ic_blocks``, the
priorities through ``build_tuning_levers`` and ``behavioral_priority``. Nothing here
hand-sets ``asserts_move``, a status, a hold reason or a score — that is the exact trap
`CLAUDE.md` records for the thin-slot hold, and a queue fixture is where it would do
the most damage, because the queue IS the verdict.

The inputs are invented on the real schema and shaped like the 2026-08-17 reading
(basal 05:30 asserting a capped raise, 06:30 held for want of a supported direction,
the early afternoon leaning lower and held, the 19:30–21:00 stretch with no clean day,
ISF's band spanning the programmed value). Synthetic only: no patient data anywhere
near it.

    python3 scripts/gen_findings_projection_fixtures.py         # rewrite in place
    python3 scripts/gen_findings_projection_fixtures.py --check  # CI-style drift check
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
from datetime import date, datetime, timedelta
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from ciq_autotune.analyzers.basal import _annotation_for  # noqa: E402
from ciq_autotune.analyzers.classifiers.evidence import (  # noqa: E402
    EvidenceTier,
    SilenceReason,
)
from ciq_autotune.analyzers.ic import (  # noqa: E402
    IcConfig,
)
from ciq_autotune.analyzers.isf import (  # noqa: E402
    IsfChannels,
    IsfConfig,
    _recommend,
    isf_asserts_move,
)
from ciq_autotune.analyzers.scenario.payload import (  # noqa: E402
    SCENARIO_SCHEMA_VERSION,
    Pattern,
    PreemptedLows,
    ScenarioReport,
)
from ciq_autotune.analyzers.scenario.levers import Lever, recommendation, title  # noqa: E402
from ciq_autotune.analyzers.ic_regression import analyze_ic_blocks_fuzzy  # noqa: E402
from ciq_autotune.analyzers.tuning_priority import (  # noqa: E402
    build_tuning_levers,
    price_ic_blocks,
)
from ciq_autotune.events import BolusEvent, CgmReading  # noqa: E402
from ciq_autotune.findings_projection import (  # noqa: E402
    FindingsProjection,
    WindowQuery,
    prepare_findings_projection,
)
from ciq_autotune.model import _slot_label  # noqa: E402
from ciq_autotune.result import (  # noqa: E402
    SCHEMA_VERSION,
    AnalysisResult,
    DataQuality,
    SegmentEstimate,
    SlotEstimate,
    Span,
)
from ciq_autotune.settings import Snapshot, parse_pump_settings  # noqa: E402
from ciq_autotune.safety import SafetyConfig, cap  # noqa: E402
from ciq_autotune.uncertainty import Confidence, Estimate  # noqa: E402

OUT = (pathlib.Path(__file__).resolve().parents[1]
       / "frontend" / "__fixtures__" / "findings-projection.json")

WINDOW_DAYS = 30
SLOT_MINUTES = 30
DAY = date(2026, 8, 17)
BASE = datetime(2026, 5, 19)      # the I:C block ledger's own 90-day run
_SAFETY = SafetyConfig()
_ISF_CFG = IsfConfig()
ANALYSIS_GENERATION = "findings-fixture-process:0"

# The windows frozen here: the global queue, the two D34 anchoring windows, the
# grounded morning and afternoon reads, a window that wraps midnight, and a stretch
# where nothing speaks.
WINDOWS = {
    "global": None,
    "morning": (4 * 60 + 30, 8 * 60),
    "low_block": (12 * 60, 14 * 60),
    "rebound": (14 * 60, 16 * 60),
    "afternoon": (14 * 60, 21 * 60),
    "overnight": (22 * 60, 2 * 60),
    "quiet": (3 * 60, 4 * 60),
}


# --- basal: 48 slots, every verdict from the real cap() ------------------------

def _slot(index, *, current, value=None, lo=None, hi=None, n=0, supported=0):
    """One slot, with its verdict and sentence produced exactly as the analyzer does.

    The clean-night points are the same shelf the priority builder counts its
    on-suggested-side nights from, so the Lever score this fixture freezes is the one
    the real builder computes rather than a floor of 0.
    """
    estimate = Estimate(value=value, lo=lo, hi=hi, n=n, method="bootstrap-median")
    recommended, status = cap(current, value, _SAFETY, estimate,
                              supported_direction=supported)
    points = [{"date": (DAY - timedelta(days=back)).isoformat(),
               "t": f"{(DAY - timedelta(days=back)).isoformat()}"
                    f"T{_slot_label(index, SLOT_MINUTES)}:00",
               "rate": value}
              for back in range(n)]
    return SlotEstimate(
        slot=index, label=_slot_label(index, SLOT_MINUTES), current=current,
        estimate=estimate, recommended=recommended,
        annotation=_annotation_for(status), days=n,
        evidence={"points": points}, status=status,
    )


def basal_rows():
    """The 2026-08-17-shaped profile: what asserts, what is held, what is blind."""
    rows = []
    for index in range(48):
        if index in (1, 2):
            # A contiguous pair leaning the same way and supported — one merged span.
            rows.append(_slot(index, current=0.85, value=1.05, lo=0.98, hi=1.12,
                              n=19, supported=1))
        elif index == 11:
            # 05:30 — the grounded raise, big enough that the step cap trims it.
            rows.append(_slot(index, current=0.80, value=0.998, lo=0.816, hi=1.259,
                              n=22, supported=1))
        elif index == 13:
            # 06:30 — a number, no supported direction: held.
            rows.append(_slot(index, current=1.00, value=1.261, lo=0.98, hi=1.54,
                              n=21, supported=0))
        elif index in (25, 26, 27):
            # 12:30–14:00 — three slots leaning lower, none of them supported.
            rows.append(_slot(index, current=1.10, value=0.95, lo=0.80, hi=1.15,
                              n=18, supported=0))
        elif index in (39, 40, 41):
            # 19:30–21:00 — no clean day at all.
            rows.append(_slot(index, current=1.00, value=None, lo=None, hi=None, n=0))
        else:
            rows.append(_slot(index, current=1.00, value=1.00, lo=0.96, hi=1.04, n=20))
    return rows


# --- ISF: the real correction-strength read ------------------------------------

def isf_rows():
    """One fasting row whose band spans the programmed value, so nothing asserts."""
    fits = [(DAY - timedelta(days=offset), value)
            for offset, value in enumerate((31.0, 27.5, 34.0, 29.0, 33.5))]
    channels = IsfChannels(night_fits=fits, night_median=31.0, corr_low_days=0,
                           rescue_days=0, covered_days=WINDOW_DAYS,
                           rescue_observed=True)
    estimate = Estimate(value=29.4, lo=16.8, hi=43.6, n=5, method="bootstrap-ols-isf")
    recommended, annotation, direction, priced_target = _recommend(
        36.0, estimate, channels, _ISF_CFG, prior_strengthen_signal=False)
    if direction is not None:
        raise SystemExit("the ISF case no longer lands on the held branch it was "
                         f"built for (direction {direction!r})")
    return [SegmentEstimate(
        start_min=0, label="Fasting", parameter="isf", current=36.0,
        estimate=estimate, recommended=recommended, annotation=annotation,
        evidence={
            "direction": direction,
            "night_median": 31.0,
            "night_fits": [{"date": d.isoformat(), "isf": v} for d, v in fits],
            "recurrence_channels": {
                "corr_low_days": 0, "rescue_days": 0, "covered_days": WINDOW_DAYS,
                "rescue_observed_days": WINDOW_DAYS, "rescue_observed": True,
                "side_k": 0, "side_n": len(fits), "measurement_asserts": False,
            },
            "impact_inputs": {"corrections_per_day": 2.4,
                              "median_mgdl_over_target": 48.0,
                              "covered_days": WINDOW_DAYS,
                              "priced_target": priced_target},
        },
        asserts_move=isf_asserts_move(36.0, direction, recommended),
    )]


# --- I:C: the real block ledger -------------------------------------------------

def _meal(day, hour, carbs, dose, ratio, minute=0):
    return BolusEvent(t=BASE + timedelta(days=day, hours=hour, minutes=minute),
                      insulin=dose, carbs=carbs, carb_ratio=ratio,
                      completion="Completed")


def _snapshot(at, schedule):
    rows = [{"startTime": start, "basalRate": 600, "isf": 30,
             "carbRatio": int(ratio * 1000), "targetBg": 110}
            for start, ratio in schedule]
    rows += [{"startTime": 0, "basalRate": 0, "isf": 0,
              "carbRatio": 0, "targetBg": 0}] * (16 - len(rows))
    return Snapshot(at, parse_pump_settings({
        "profiles": {"activeIdp": 4, "profile": [{
            "name": "4", "idp": 4, "insulinDuration": 300,
            "carbEntry": 1, "maxBolus": 15000, "tDependentSegs": rows,
        }]}, "cgmSettings": {},
    }))


def history_catalogs():
    """Active, aged and unmappable catalogs, all produced by the real analyzer."""
    first = datetime(2026, 5, 20)
    changed = datetime(2026, 7, 1)
    old_schedule = [(0, 6.0), (720, 5.7)]
    current_schedule = [(0, 5.0), (720, 5.7)]
    snapshots = [_snapshot(first, old_schedule), _snapshot(changed, current_schedule)]
    events = [
        BolusEvent(t=first + timedelta(days=day, hours=hour), insulin=5.0,
                   carbs=30.0, carb_ratio=6.0, completion="Completed")
        for day in (2, 6, 10, 14) for hour in (9, 11)
    ]

    def catalog(now, schedule, snaps=snapshots):
        answer = []
        analyze_ic_blocks_fuzzy(
            events, schedule, config=IcConfig(), observed_days=90,
            analysis_start=now - timedelta(days=90), analysis_end=now,
            snapshots=snaps, history_catalog=answer,
        )
        return answer

    active = catalog(datetime(2026, 8, 17), current_schedule)
    aged = catalog(datetime(2026, 12, 17), current_schedule)
    split_schedule = [(0, 5.0), (360, 7.0), (720, 5.7)]
    split_snapshots = snapshots + [_snapshot(datetime(2026, 8, 1), split_schedule)]
    unavailable = catalog(datetime(2026, 8, 17), split_schedule, split_snapshots)
    if not (active and aged and unavailable):
        raise SystemExit("synthetic history cases no longer produce a catalog")
    return active, aged, unavailable


def density_history_catalog():
    """Seven active past-setting blocks, all produced by the real analyzer.

    Each block receives five isolated invented meals before one snapshot-observed
    schedule change.  Meals land on separate days so the analyzer, rather than
    fixture code, owns every run boundary, estimate, lifecycle, and identity.
    """
    first = datetime(2026, 5, 20)
    changed = datetime(2026, 7, 1)
    starts = list(range(0, 7 * 180, 180))
    old_schedule = [(start, 6.0 + index * 0.2)
                    for index, start in enumerate(starts)]
    current_schedule = [(start, ratio - 0.5)
                        for start, ratio in old_schedule]
    snapshots = [_snapshot(first, old_schedule), _snapshot(changed, current_schedule)]
    events = []
    for index, (start, ratio) in enumerate(old_schedule):
        hour = (start + 60) // 60
        for sample in range(5):
            events.append(BolusEvent(
                t=first + timedelta(days=1 + index * 5 + sample, hours=hour),
                insulin=30.0 / ratio, carbs=30.0, carb_ratio=ratio,
                completion="Completed",
            ))
    answer = []
    analyze_ic_blocks_fuzzy(
        events, current_schedule, config=IcConfig(), observed_days=90,
        analysis_start=datetime(2026, 8, 17) - timedelta(days=90),
        analysis_end=datetime(2026, 8, 17), snapshots=snapshots,
        history_catalog=answer,
    )
    active = [row for row in answer if row.lifecycle == "active"]
    if len(active) != 7:
        raise SystemExit("synthetic density history no longer produces seven active "
                         f"rows (got {len(active)})")
    return active


def ic_blocks():
    """A morning block that agrees with its setting and an evening block that does not."""
    segments = [(0, 5.0), (720, 5.7)]
    events = ([_meal(d, 9, 60, 12.0, 5.0) for d in range(1, 25)]
              + [_meal(d, 19, 60, 14.0, 5.7) for d in range(1, 25)])
    blocks, _runs = analyze_ic_blocks_fuzzy(events, segments, config=IcConfig(),
                                      observed_days=90)
    return price_ic_blocks(blocks)


def ic_raise_blocks():
    """A real analyzer-built I:C raise, kept beside the primary fixture case."""
    segments = [(0, 5.0), (720, 5.7)]
    events = ([_meal(d, 9, 60, 10.0, 5.0) for d in range(1, 25)]
              + [_meal(d, 19, 60, 14.0, 5.7) for d in range(1, 25)])
    blocks, _runs = analyze_ic_blocks_fuzzy(events, segments, config=IcConfig(),
                                      observed_days=90)
    return price_ic_blocks(blocks)


# --- exposures: invented occurrences on the real feed's schema ------------------

def _verdict(classifier, *, matched, detail="", silence_reason=None):
    """One classifier's read of one anchor, on the wire shape ``AnchorVerdict``
    publishes (``model_view.AnchorVerdict.to_dict``). ``findings_projection``'s
    row-relative verdict (finding 2) is read straight off this list, keyed by
    ``classifier`` — so an occurrence that is meant to drive its lever's row must
    carry a matched verdict for that lever, not just a bare ``cause_lever``.
    """
    return {
        "classifier": classifier,
        "matched": matched,
        "detail": detail,
        "evidence_tier": (EvidenceTier.OBSERVED if matched else EvidenceTier.INFERRED).value,
        "silence_reason": None if silence_reason is None else silence_reason.value,
    }


def _occurrence(ep_id, kind, at, *, lever=None, worst_bg=None, bg=None, text="",
                 verdicts=None):
    """One exposures occurrence. A driving ``lever`` gets a matched verdict for its
    own classifier by default (so ``findings_projection`` reads it as ``fired``,
    not the ``verdicts=[]`` gap that let this row's own driver misread as
    ``outranked``); pass ``verdicts`` explicitly to exercise the other four
    row-relative categories (finding 3) instead.
    """
    if verdicts is None:
        verdicts = ([_verdict(lever.value, matched=True, detail=text)]
                    if lever is not None else [])
    state = "fired" if lever is not None else "clean"
    stamp = f"{DAY.isoformat()} {at}:00"
    return {
        "t": stamp, "date": DAY.isoformat(), "bg": bg, "worst_bg": worst_bg,
        "kind": kind, "label": kind.title(), "state": state,
        "attributed": lever is not None,
        "cause_lever": None if lever is None else lever.value,
        "cause_title": None if lever is None else title(lever),
        "text": text, "verdicts": verdicts, "ep_id": ep_id,
    }


class _ScenarioFixtureStore:
    """The real exposure producer's narrow, typed store interface."""

    def __init__(self, cgm, bolus):
        self._cgm = cgm
        self._bolus = bolus

    def cgm_readings(self, start=None, end=None):
        return self._cgm

    def bolus_events(self, start=None, end=None):
        return self._bolus

    def basal_events(self, start=None, end=None):
        return []

    def carb_entries(self, start=None, end=None):
        return []

    def latest_cgm_or_basal_timestamp(self):
        times = [row.t for row in self._cgm]
        return max(times) if times else None

    def prompt_responses(self):
        return []

    def settings_snapshots(self):
        return []


def _rebound_trace(day, hour, minute, *, nadir, rebound, tail=True):
    """The real low-anchor shape used by the public HTTP regression helpers."""
    start = datetime.combine(day, datetime.min.time()).replace(hour=hour, minute=minute)

    def segment(offset, bg, slope, duration):
        return [CgmReading(start + timedelta(minutes=offset + step), bg + slope * step)
                for step in range(0, duration + 1, 5)]

    rows = (segment(0, 100, 0, 20)
            + segment(20, 100, -(100 - nadir) / 20, 20)
            + segment(40, nadir, (rebound - nadir) / 40, 40))
    return rows + (segment(80, rebound, -1.5, 60) if tail else [])


def _low_without_rebound(day, hour, minute, *, nadir):
    start = datetime.combine(day, datetime.min.time()).replace(hour=hour, minute=minute)
    return ([CgmReading(start + timedelta(minutes=step), 100)
             for step in range(0, 21, 5)]
            + [CgmReading(start + timedelta(minutes=20 + step),
                          100 - (100 - nadir) / 20 * step)
               for step in range(0, 21, 5)])


def _ramp(day, hour, minute, start_bg, slope, duration):
    start = datetime.combine(day, datetime.min.time()).replace(hour=hour, minute=minute)
    return [CgmReading(start + timedelta(minutes=offset), start_bg + slope * offset)
            for offset in range(0, duration + 1, 5)]


def _over_treated_fixture_events():
    """Invent the typed event population for the public five-state regression."""
    cgm = []
    bolus = []
    fired_day, near_day, calm_day, competing_day = (
        DAY - timedelta(days=4), DAY - timedelta(days=3),
        DAY - timedelta(days=2), DAY - timedelta(days=1),
    )
    cgm.extend(_rebound_trace(fired_day, 13, 15, nadir=48, rebound=260))
    cgm.extend(_rebound_trace(near_day, 11, 30, nadir=60, rebound=150, tail=False))
    cgm.extend(_rebound_trace(calm_day, 11, 30, nadir=60, rebound=130, tail=False))
    cgm.extend(_low_without_rebound(calm_day, 15, 30, nadir=60))

    cgm.extend(_ramp(competing_day, 18, 40, 120, 0, 20))
    cgm.extend(_ramp(competing_day, 19, 0, 120, 1.75, 40))
    cgm.extend(_ramp(competing_day, 19, 40, 190, -1.0, 140))
    cgm.extend([
        CgmReading(datetime.combine(competing_day, datetime.min.time()).replace(hour=22, minute=5), 100),
        CgmReading(datetime.combine(competing_day, datetime.min.time()).replace(hour=22, minute=10), 130),
    ])
    bolus.extend([
        BolusEvent(datetime.combine(competing_day, datetime.min.time()).replace(hour=19),
                   completion="Completed", insulin=6.0, carbs=40.0, carb_ratio=10.0,
                   seq_num=910),
        BolusEvent(datetime.combine(competing_day, datetime.min.time()).replace(hour=20),
                   completion="Completed", insulin=4.0, seq_num=911),
    ])
    return cgm, bolus


def _real_over_treated_low_occurrences():
    """The five frozen production-shaped occurrences in this synthetic input.

    The fixture freezes its three projection inputs alongside its outputs. Re-reading
    this closed synthetic exposure slice keeps regeneration on the projection seam;
    it must never invoke a production builder while checking those frozen bytes.
    """
    produced = json.loads(OUT.read_text())['inputs']['exposures']
    lows = produced["exposures"]["lows"]["occurrences"]

    def own(item):
        return next(v for v in item["verdicts"]
                    if v["classifier"] == "over_treated_low")

    fired = next(item for item in lows if own(item)["matched"])
    selected = {
        "fired": fired,
        "rebound": next(item for item in produced["exposures"]["highs"]["occurrences"]
                        if item["ep_id"] == fired["ep_id"]),
        "near_miss": next(item for item in lows
                          if own(item)["silence_reason"] == "under_threshold"),
        "clean": next(item for item in lows
                      if own(item)["silence_reason"] == "no_trigger"
                      and item["cause_lever"] is None),
        "no_data": next(item for item in lows
                        if own(item)["silence_reason"] == "insufficient_data"
                        and item["cause_lever"] is None),
        "outranked": next(item for item in lows
                          if own(item)["silence_reason"] == "no_trigger"
                          and item["cause_lever"] == Lever.CORRECTION_ON_IOB.value),
    }
    return selected


def exposures():
    """Four families of anchors, including the trigger/outcome split D34 names.

    The grounded over-treated Low and its rebound High are one producer-built Episode.
    Anchoring is what the projection is being frozen on, so the feed stores both
    occurrences unchanged and the projection decides which one a window reads.
    """
    over_treated = _real_over_treated_low_occurrences()
    families = {
        "lows": [
            over_treated["fired"], over_treated["near_miss"],
            over_treated["clean"], over_treated["no_data"],
            over_treated["outranked"],
        ],
        "highs": [
            over_treated["rebound"],
            _occurrence("ep2", "high", "09:05", lever=Lever.CARB_UNDERCOUNT,
                        bg=243.0, worst_bg=243.0,
                        text="Bolused 45 g at 07:10 and glucose still ran to 243."),
            _occurrence("ep6", "high", "21:40", bg=201.0, worst_bg=201.0),
            _occurrence("ep11", "high", "10:15", lever=Lever.CARB_UNDERCOUNT,
                        bg=210.0, worst_bg=245.0,
                        text="A late meal bolus at 10:15 still ran high.",
                        verdicts=[
                            _verdict("carb_undercount", matched=True,
                                     detail="A late meal bolus at 10:15 still ran high."),
                        ]),
        ],
        "meals": [
            _occurrence("ep2", "meal", "07:10", lever=Lever.CARB_UNDERCOUNT,
                        bg=112.0, worst_bg=243.0,
                        text="Bolused 45 g at 07:10 and glucose still ran to 243."),
            # Finding 2 follow-up: `carb_undercount`'s own classifier always
            # emits an explicit verdict (matched or not, `_meal_verdicts`), so
            # unlike `over_treated_low` its row CAN read a genuine `clean` —
            # ep8 carries the explicit calm verdict that proves it, where ep7's
            # verdicts stays empty (`no_data`: this lever never evaluated it).
            _occurrence("ep7", "meal", "12:40",
                        bg=118.0, worst_bg=155.0,
                        verdicts=[_verdict(
                            "carb_undercount", matched=False,
                            detail="The dose landed within the digestion window.",
                            silence_reason=SilenceReason.UNDER_THRESHOLD)]),
            _occurrence("ep8", "meal", "18:50",
                        bg=104.0, worst_bg=149.0,
                        verdicts=[_verdict(
                            "carb_undercount", matched=False,
                            detail="Bolus covered the meal; glucose stayed in range.",
                            silence_reason=SilenceReason.NO_TRIGGER)]),
        ],
        "correction_clusters": [
            _occurrence("ep3", "correction", "15:10", lever=Lever.CORRECTION_STACKING,
                        bg=214.0, worst_bg=61.0,
                        text="Corrections stacked and carried glucose to 61."),
        ],
    }
    # CROSS-FAMILY, and it has to be (#63). An episode's driver anchor lives in
    # whichever family its kind belongs to, so `cause_lever` on a high says only
    # "this high is the driver" — ep11's high drives its episode, while ep1's high
    # carries the lever its LOW drove. Deriving `uncaused` from a single family's
    # `cause_lever` would therefore count every non-driver high, which is exactly
    # the 27-vs-20 error the honest count exists to avoid. Build the driven-episode
    # set over ALL families first, then roll each family up against it.
    driven = {item["ep_id"] for occurrences in families.values()
              for item in occurrences if item["cause_lever"] is not None}
    return {
        "window": {"start": (DAY - timedelta(days=WINDOW_DAYS)).isoformat(),
                   "end": DAY.isoformat()},
        "exposures": {name: _rollup(occurrences, driven)
                      for name, occurrences in families.items()},
    }


def _rollup(occurrences, driven):
    """The family rollup ``build_exposures`` emits around its occurrence list.

    ``driven`` is every episode id that drew a lever anywhere in the window; an
    occurrence outside it is one the engine found no cause for at all. On this
    fixture ep6 is the single such high, so the highs rollup carries
    ``uncaused: 1`` — a non-zero value, because a rollup frozen at zero would let
    the whole count regress to nothing without failing anything.
    """
    by_cause = {}
    for item in occurrences:
        if item["cause_title"] is not None:
            by_cause[item["cause_title"]] = by_cause.get(item["cause_title"], 0) + 1
    attributed = sum(item["attributed"] for item in occurrences)
    return {
        "n": len(occurrences),
        "attributed": attributed,
        "clean": len(occurrences) - attributed,
        "uncaused": sum(1 for item in occurrences if item["ep_id"] not in driven),
        "levers": list(dict.fromkeys(item["cause_lever"] for item in occurrences
                                     if item["cause_lever"] is not None)),
        "by_cause": by_cause,
        "occurrences": occurrences,
    }


# --- scenarios: real Patterns, so priority is the engine's own ------------------

def scenarios():
    """Two priced levers and one that never made it into the ranked payload.

    ``correction_stacking`` has occurrences but no Pattern, which is what an unpriced
    row is: it can be counted but not ranked, and the queue's tail order is its count.
    """
    fired = _real_over_treated_low_occurrences()["fired"]
    patterns = [
        Pattern(lever=Lever.OVER_TREATED_LOW,
                confidence=Confidence(n=43, k=8, effect=0.62), rank=1,
                recommendation=recommendation(Lever.OVER_TREATED_LOW),
                hero_episode=fired["ep_id"], occurrences=[fired["ep_id"]]),
        Pattern(lever=Lever.CARB_UNDERCOUNT,
                confidence=Confidence(n=60, k=9, effect=0.44), rank=2,
                recommendation=recommendation(Lever.CARB_UNDERCOUNT),
                hero_episode="ep2", occurrences=["ep2"]),
    ]
    return ScenarioReport(
        schema_version=SCENARIO_SCHEMA_VERSION,
        window={"start": (DAY - timedelta(days=WINDOW_DAYS)).isoformat(),
                "end": DAY.isoformat()},
        patterns=patterns, low_confidence=[], episodes={},
        preempted_lows=PreemptedLows(total=0, ic=0, isf=0, unattributed=0,
                                     floor_u=0.2),
    ).to_dict()


def analysis(*, blocks=None):
    """The ``/analyze`` payload the projection reads, serialized by the real result."""
    basal = basal_rows()
    isf = isf_rows()
    blocks = ic_blocks() if blocks is None else blocks
    active_history, _aged_history, _unavailable_history = history_catalogs()
    return AnalysisResult(
        schema_version=SCHEMA_VERSION,
        generated_at=f"{DAY.isoformat()} 09:00:00",
        window_days=WINDOW_DAYS,
        span=Span(start=(DAY - timedelta(days=WINDOW_DAYS)).isoformat(),
                  end=DAY.isoformat()),
        epochs=[],
        data_quality=DataQuality(counts={}, notes=[]),
        basal=basal, isf=isf, ic=[], behavioral=[],
        tuning_levers=build_tuning_levers(
            basal, isf, blocks, slot_minutes=SLOT_MINUTES,
            robust_daily_insulin_u=42.0),
        ic_blocks=blocks, ic_runs=24, ic_history=active_history,
    ).to_dict()


def projection() -> FindingsProjection:
    return prepare_findings_projection(
        analysis=analysis(), exposures=exposures(), scenarios=scenarios(),
    )


def empty_projection() -> FindingsProjection:
    """A store with nothing in it — the state term 41's one calm line renders."""
    return prepare_findings_projection(
        analysis=AnalysisResult(
            schema_version=SCHEMA_VERSION,
            generated_at=f"{DAY.isoformat()} 09:00:00", window_days=WINDOW_DAYS,
            span=Span(start=None, end=None), epochs=[],
            data_quality=DataQuality(counts={}, notes=[]),
            basal=[], isf=[], ic=[], behavioral=[],
        ).to_dict(),
        exposures={"window": {"start": None, "end": None}, "exposures": {}},
        scenarios={"patterns": [], "low_confidence": []},
    )


def payload() -> dict:
    prepared = projection()
    active_history, aged_history, unavailable_history = history_catalogs()
    density_history = density_history_catalog()
    selected_id = active_history[0].history_id

    def with_catalog(catalog):
        analysis_payload = dict(prepared._analysis)
        analysis_payload["ic_history"] = [row.to_dict() for row in catalog]
        return prepare_findings_projection(
            analysis=analysis_payload, exposures=prepared._exposures,
            scenarios=prepared._scenarios,
        )

    return {
        "_generated_by": "scripts/gen_findings_projection_fixtures.py",
        "_note": ("SYNTHETIC. Every window below is the real projection's own output "
                  "over invented inputs run through the real engines — never "
                  "hand-assembled. Regenerate with "
                  "`python3 scripts/gen_findings_projection_fixtures.py`."),
        # The three published payloads `windows` was projected FROM (#735). The
        # browser gates have no Python, so they answer `/diagnose/findings` from a
        # fixture-only JS mirror of this projection; freezing the inputs beside the
        # outputs is what lets `frontend/findings-projection-mirror.test.js` run that
        # mirror over these exact dicts and byte-compare it against the server's own
        # answers. Without them the mirror could drift in silence, which is the
        # #273/#465 failure class this projection exists to close.
        "inputs": {
            "analysis": prepared._analysis,
            "exposures": prepared._exposures,
            "scenarios": prepared._scenarios,
            "analysis_generation": ANALYSIS_GENERATION,
        },
        # The browser derives its density input from `inputs` by replacing only
        # this generator-authored analyzer catalog.  Freezing the whole input a
        # second time would duplicate the unrelated exposures and scenarios.
        "density_history": [row.to_dict() for row in density_history],
        "windows": {
            name: prepared.project(
                WindowQuery.whole_day() if bounds is None
                else WindowQuery.clock(*bounds),
                analysis_generation=ANALYSIS_GENERATION)
            for name, bounds in WINDOWS.items()
        },
        "settings_cases": {
            "carb_ratio_raise": prepare_findings_projection(
                analysis=analysis(blocks=ic_raise_blocks()), exposures=exposures(),
                scenarios=scenarios(),
            ).project(WindowQuery.whole_day(),
                      analysis_generation=ANALYSIS_GENERATION),
        },
        "selection_cases": {
            "present": prepared.project(
                WindowQuery.whole_day(), selected_id,
                analysis_generation=ANALYSIS_GENERATION),
            "out_of_scope": prepared.project(
                WindowQuery.clock(720, 900), selected_id,
                analysis_generation=ANALYSIS_GENERATION),
            "aged_out": with_catalog(aged_history).project(
                WindowQuery.whole_day(), aged_history[0].history_id,
                analysis_generation=ANALYSIS_GENERATION),
            "unavailable": with_catalog(unavailable_history).project(
                WindowQuery.whole_day(), unavailable_history[0].history_id,
                analysis_generation=ANALYSIS_GENERATION),
        },
        "selection_inputs": {
            "present": prepared._analysis,
            "out_of_scope": prepared._analysis,
            "aged_out": with_catalog(aged_history)._analysis,
            "unavailable": with_catalog(unavailable_history)._analysis,
        },
        "no_data": {
            name: empty_projection().project(
                WindowQuery.whole_day() if bounds is None
                else WindowQuery.clock(*bounds),
                analysis_generation=ANALYSIS_GENERATION)
            for name, bounds in (("global", None), ("morning", WINDOWS["morning"]))
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="fail if the committed fixture is stale")
    args = ap.parse_args()
    def forbidden(*_args, **_kwargs):
        raise AssertionError("fixture generation must not invoke a production builder")

    with patch("ciq_autotune.analyze.analyze", forbidden), \
         patch("ciq_autotune.analyzers.scenario.build_scenarios", forbidden), \
         patch("ciq_autotune.explore_exposures.build_exposures", forbidden):
        text = json.dumps(payload(), indent=1, sort_keys=True, ensure_ascii=False) + "\n"
    if args.check:
        current = OUT.read_text() if OUT.exists() else ""
        if current != text:
            print(f"stale fixture: {OUT} — "
                  "rerun scripts/gen_findings_projection_fixtures.py")
            return 1
        print(f"findings-projection fixtures current ({OUT})")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text)
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
