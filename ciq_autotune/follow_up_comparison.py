"""Read-only, exact-period setting and Focus comparisons (#340, #386, #387).

Ending capture and selected reassessment share periods, retained execution
context, populations and day-grouped assessments. This module never resolves a
watch or persists its result. All times are naive pump-local instants.
"""
from __future__ import annotations

import hashlib
import json
import random
import statistics
from bisect import bisect_right
from copy import deepcopy
from dataclasses import asdict
from datetime import datetime, timedelta
from pathlib import Path

from .analyzers.scenario import low_prompt_answers
from .analyzers.scenario.anchors import _is_meal
from .analyzers.scenario_config import ScenarioConfig
from .false_low import drop_readings, false_low_spans
from .outcomes import CGM_CADENCE_MIN, CONSENSUS_MIN_COVERAGE, _pct, compute_metrics
from .outcomes_trend import (
    _profile_settings, behavior_observations, meal_measurements,
    glycemic_rate_counts, day_rate_clears, newcombe_diff_interval,
    post_meal_rescue_context,
)
from .rescue_evidence import eligible_carb_entries, first_observation, observe
from .trial_evidence import comparison_evidence, _in_block

_VERSION = "386:1"
_FMT = "%Y-%m-%d %H:%M:%S"
_RESAMPLES = 2000


def _time(value):
    result = value if isinstance(value, datetime) else datetime.fromisoformat(value)
    if result.tzinfo is not None:
        raise ValueError("comparison timestamps must be pump-local and timezone-naive")
    return result


def _availability(reason=None):
    return {"state": "unavailable" if reason else "available", "reason": reason}


def _execution():
    # Installed Python sources identify the executable, including transitive
    # classifier/metric defaults. A changed executable cannot impersonate a saved
    # computation. No historical executable archive is maintained.
    root = Path(__file__).parent
    digest = hashlib.sha256()
    for path in sorted(root.rglob("*.py")):
        digest.update(str(path.relative_to(root)).encode())
        digest.update(path.read_bytes())
    return {"code_version": digest.hexdigest(), "policy": "340:1/386:1/387:1",
            "configuration": asdict(ScenarioConfig())}


def capture_comparison_context(store, *, at, input_revision):
    """Capture the existing active-profile median ISF as of the supplied instant."""
    at = _time(at)
    snaps = sorted((s for s in store.settings_snapshots() if s.captured_at <= at),
                   key=lambda s: s.captured_at)
    isf, _ = _profile_settings(snaps)
    context = {"version": _VERSION, **_availability(None if isf is not None else "missing_programmed_isf"),
               "captured_at": at.strftime(_FMT), "input_revision": input_revision,
               **_execution(), "programmed_isf": None, "source_snapshot": None}
    if isf is not None:
        snapshot = snaps[-1]
        context["source_snapshot"] = {"captured_at": snapshot.captured_at.strftime(_FMT),
                                      "active_idp": snapshot.settings.active_idp}
        context["programmed_isf"] = {
            "value": isf, "unit": "mg/dL/U",
        }
    context["id"] = hashlib.sha256(json.dumps(context, sort_keys=True).encode()).hexdigest()
    return context


def _block(record):
    block = record.get("block")
    if block is not None:
        return tuple(block)
    if record.get("block_start_min") is not None and record.get("block_end_min") is not None:
        return record["block_start_min"], record["block_end_min"]
    return None


def _setting_period(store, record, cutoff, earliest):
    from .watched_change import basal_slot_regimes, dose_regimes

    changed = _time(record.get("detected_at") or record["changed_at"])
    parameter, slot = record["parameter"], record.get("slot")
    block = _block(record)
    minutes = None
    if block:
        minutes = [m for m in range(1440) if _in_block(datetime(2000, 1, 1) + timedelta(minutes=m), block)]
    elif slot:
        lo = int(slot[:2]) * 60 + int(slot[3:5])
        minutes = list(range(lo, lo + 30))

    def state(snapshot):
        params = ("basal_rate", "isf", "carb_ratio", "target_bg") if parameter == "profile" else (parameter,)
        values = []
        for name in params:
            schedule = snapshot.settings.active_schedule(name)
            if not schedule:
                return None
            schedule = sorted(schedule)
            starts = [m for m, _ in schedule]
            values.append(tuple(schedule[bisect_right(starts, m) - 1][1]
                                for m in (minutes if minutes is not None else range(1440))))
        if parameter == "profile":
            values.append(snapshot.settings.active_idp)
        return tuple(values)

    runs = []
    for snap in sorted(store.settings_snapshots(), key=lambda s: s.captured_at):
        if snap.captured_at > cutoff:
            continue
        value = state(snap)
        if not runs or runs[-1][1] != value:
            runs.append((snap.captured_at, value))
    # Dose/basal histories remain the existing detector's source when snapshots
    # do not bracket the retained change. They are never joined across gaps in a
    # different value, nor used to reconstruct a missing captured I:C block.
    prior = [i for i, (at, _) in enumerate(runs) if at <= changed]
    index = prior[-1] if prior else None
    if index is None or runs[index][0] != changed:
        regimes = []
        if parameter == "basal_rate" and slot:
            slot_index = (int(slot[:2]) * 60 + int(slot[3:5])) // 30
            regimes = basal_slot_regimes([e for e in store.basal_events() if e.t <= cutoff]).get(slot_index, [])
        elif parameter in ("isf", "carb_ratio") and block is None and slot is None:
            regimes = dose_regimes([b for b in store.bolus_events() if b.t <= cutoff], parameter)
        matching = next((i for i, run in enumerate(regimes) if run.start == changed), None)
        if matching is not None:
            runs = [(r.start, r.value) for r in regimes]
            index = matching
    if (index is None or index == 0 or runs[index][0] != changed
            or runs[index][1] is None or runs[index - 1][1] is None):
        return changed, changed, min(cutoff, changed), "missing_continuous_setting_history", "data_tail"
    before = max(runs[index - 1][0], changed - timedelta(days=90), min(earliest, changed))
    following = runs[index + 1][0] if index + 1 < len(runs) else cutoff
    after = min(cutoff, following)
    before_reason = ("90_day_cap" if before == changed - timedelta(days=90)
                     else "available_history" if before == earliest else "previous_relevant_setting_change")
    return before, changed, max(changed, after), before_reason, (
        "next_relevant_setting_change" if following < cutoff else "data_tail")


def _period(start, end, start_reason, end_reason, cutoff, revision):
    return {"start": start.strftime(_FMT), "end": end.strftime(_FMT),
            "boundary_reasons": {"start": start_reason, "end": end_reason},
            "semantics": "[start,end)", "data_cutoff": cutoff.strftime(_FMT),
            "source_revision": revision}


def _glycemic(population, start, end):
    by_day = {}
    for reading in population["readings"]:
        by_day.setdefault(reading.t.date().isoformat(), []).append(reading)
    return by_day, population["coverage"]


def _quantile(values, fraction):
    position = (len(values) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(values) - 1)
    return values[lower] + (values[upper] - values[lower]) * (position - lower)


def _assess(before, after, groups, statistic, polarity, ready=True):
    assessment = {"state": "context" if polarity is None else "unclear",
                  "interval": None, "confidence": 0.95,
                  "method": "independent pump-date percentile bootstrap; 2000 resamples",
                  "reasons": ["Observational, approximate, per-outcome; no causal or simultaneous guarantee."]}
    if before is None or after is None:
        assessment["reasons"].append("No readable observations or opportunities in one period.")
        return assessment
    if not ready:
        assessment["reasons"].append("Type-specific follow-up readiness is not met in both arms.")
    if min(len(g) for g in groups) < 2:
        assessment["reasons"].append("Fewer than two contributing dates; the interval is not estimable.")
        return assessment
    rng = random.Random(387)
    samples = []
    arms = [list(g.values()) for g in groups]
    for _ in range(_RESAMPLES):
        values = [statistic([item for day in rng.choices(arm, k=len(arm)) for item in day])
                  for arm in arms]
        if None in values:
            assessment["reasons"].append("The interval is not estimable.")
            return assessment
        samples.append(values[1] - values[0])
    samples.sort()
    low, high = _quantile(samples, .025), _quantile(samples, .975)
    assessment["interval"] = {"low": low, "high": high, "unit": "difference"}
    if low == high:
        assessment["reasons"].append("The interval is degenerate; direction is unclear.")
    elif low <= 0 <= high:
        assessment["reasons"].append("The interval includes zero; direction is unclear.")
    elif polarity is not None and ready:
        assessment["state"] = "favorable" if (low > 0) == (polarity == "up") else "concerning"
    return assessment


def _row(key, label, unit, values, counts, groups, statistic, polarity, noun, informative=None, ready=True):
    before, after = values
    assessment = _assess(before, after, groups, statistic, polarity, ready)
    if polarity is not None and informative is not None and min(informative) < 2:
        assessment["state"] = "unclear"
        assessment["reasons"].append("Fewer than two coverage-qualified contributing dates; no directional glucose claim.")
    return {"key": key, "label": label, "unit": unit, "before": before, "after": after,
            "denominator": noun, "denominators": dict(zip(("before", "after"), counts)),
            "informative_dates": dict(zip(("before", "after"), informative if informative is not None else map(len, groups))),
            "difference": after - before if before is not None and after is not None else None,
            "availability": _availability("no_readable_outcome" if before is None or after is None else None),
            "assessment": assessment}


def compare_follow_up(store, *, record, data_cutoff, input_revision, context_mode="retained"):
    """Return ``{comparison_context, comparison}`` without changing Store or record."""
    if context_mode not in ("retained", "current"):
        raise ValueError("context_mode must be retained or current")
    if record.get("kind") not in ("trial", "focus"):
        raise ValueError("comparison record must be a trial or focus")
    cutoff = _time(data_cutoff)
    context = (capture_comparison_context(store, at=cutoff, input_revision=input_revision)
               if context_mode == "current" else deepcopy(record.get("comparison_context")))
    comparison = {"periods": {}, "views": {}, "outcomes": [], "denominators": {},
                  "availability": _availability(), "context_mode": context_mode,
                  "limitations": ["Observed differences do not establish causation."]}
    if context is None:
        context = {"version": _VERSION, **_availability("not_recorded")}
    result = {"comparison_context": context, "comparison": comparison}

    def unavailable(reason):
        comparison["availability"] = _availability(reason)
        return result

    if not context or context.get("state") != "available":
        return unavailable("missing_comparison_context")
    if context.get("version") != _VERSION or any(context.get(key) != value for key, value in _execution().items()):
        return unavailable("unsupported_retained_execution")
    programmed = context.get("programmed_isf")
    if not programmed or programmed.get("value") is None or programmed.get("unit") != "mg/dL/U":
        return unavailable("missing_programmed_isf")
    if context_mode == "current":
        comparison["limitations"].append("Current-policy reassessment is not a like-for-like improvement claim.")
    cgm = sorted((r for r in store.cgm_readings() if r.t < cutoff), key=lambda r: r.t)
    bolus = sorted((b for b in store.bolus_events() if b.t < cutoff), key=lambda b: b.t)
    basal = sorted((b for b in store.basal_events() if b.t < cutoff), key=lambda b: b.t)
    times = [x.t for x in cgm + bolus + basal]
    if not times:
        return unavailable("no_source_evidence")
    earliest = min(times)
    responses = store.prompt_responses()
    cgm = drop_readings(cgm, false_low_spans(cgm, responses))
    carbs = store.carb_entries()
    snapshots = [s for s in store.settings_snapshots() if s.captured_at <= cutoff]
    kind = record["kind"]
    if kind == "focus":
        changed = _time(record["pinned_at"])
        start = min(changed, max(earliest, changed - timedelta(days=90)))
        before_reason = "90_day_cap" if start == changed - timedelta(days=90) else "available_history"
        ending = record.get("ending") or {}
        if ending.get("effective_at") is not None:
            effective = _time(ending["effective_at"])
            if effective < changed:
                return unavailable("change_predates_pin")
            end = min(cutoff, effective)
            end_reason = "effective_ending" if effective <= cutoff else "data_cutoff"
        elif record.get("status", "active") != "active":
            return unavailable("missing_legacy_ending")
        else:
            end, end_reason = cutoff, "data_tail"
        if end < changed:
            return unavailable("data_not_yet_arrived")
        from .watched_change import focus_view
        try:
            target = focus_view({"status": "active", **record}).target_metric
        except ValueError:
            return unavailable("lever_unavailable")
        comparison["target_metric"] = target
        parameter = "carb_ratio" if target == "arc" else "profile"
        block, slot = None, None
    else:
        start, changed, end, before_reason, end_reason = _setting_period(store, record, cutoff, earliest)
        if before_reason == "missing_continuous_setting_history":
            return unavailable(before_reason)
        parameter, block, slot = record["parameter"], _block(record), record.get("slot")
    from .settings import changelog
    comparison["context_changes"] = [
        {"at": change.at.strftime(_FMT), "parameter": change.parameter,
         "old_schedule": change.old_schedule, "new_schedule": change.new_schedule}
        for change in changelog(snapshots) if start <= change.at < end and change.at != changed
    ]
    periods = comparison["periods"] = {
        "before": _period(start, changed, before_reason, "pin" if kind == "focus" else "setting_change", cutoff, input_revision),
        "after": _period(changed, end, "pin" if kind == "focus" else "setting_change", end_reason, cutoff, input_revision),
    }
    populations, groups, coverages, observations = [], [], [], []
    for name, lo, hi in (("before", start, changed), ("after", changed, end)):
        eligible_carbs = [c for c in eligible_carb_entries(carbs, hi) if c.t < cutoff]
        population = comparison_evidence(
            parameter=parameter, slot=slot, block=block, changed_at=changed,
            before=record.get("before"), after=record.get("after"), start=lo, end=hi,
            cgm=cgm, bolus=bolus, basal=basal, carbs=eligible_carbs, snapshots=snapshots,
            pump_events=[e for e in store.pump_events() if e.t < cutoff] if hasattr(store, "pump_events") else (),
            isf=programmed["value"], captured_members=record.get("member_start_mins"), focus=kind == "focus",
        )
        populations.append(population)
        day_groups, coverage = _glycemic(population, lo, hi)
        groups.append(day_groups)
        coverages.append(coverage)
        owned_cgm = [r for r in cgm if lo <= r.t < hi]
        ctx_meals = [b for b in bolus if _is_meal(b)]
        measurements = meal_measurements(population["meals"], owned_cgm, ctx_meals=ctx_meals)
        observations.append(measurements)
        comparison["views"][name] = {**population["view"], "period": periods[name]}
        comparison["denominators"][name] = {
            "readings": len(population["readings"]), "contributing_meals": len(population["meals"]),
            "informative_dates": sum(row["coverage"] >= CONSENSUS_MIN_COVERAGE for row in coverage), "coverage": coverage,
            "detected_rest_windows": len(population["view"]["rest_windows"]),
            "qualifying_fasting_steps": len(population["view"]["fasting_steps"]),
        }
        observed = observe(carbs, [r for r in responses
                           if r.get("anchor_t") and lo <= _time(r["anchor_t"]) < hi], start=lo, end=hi,
                           observed_from=first_observation(carbs, responses))
        comparison["views"][name]["rescue"] = {
            "observation": observed.to_dict(),
            "meal_tail": post_meal_rescue_context(
                population["meals"], [c for c in eligible_carbs if lo <= c.t < hi],
                owned_cgm, ctx_meals=ctx_meals,
            ).to_dict(),
        }
    comparison["readiness"] = dict(zip(("before", "after"), [p["readiness"] for p in populations]))
    if kind == "focus":
        for name, lo, hi in (("before", start, changed), ("after", changed, end)):
            observed = behavior_observations(
                bolus, cgm, basal, lever=record["lever"], start=lo, end=hi,
                isf=programmed["value"], scenario_config=ScenarioConfig(**context["configuration"]),
                low_answers=[a for a in low_prompt_answers(store, earliest, cutoff)
                             if a.answer == "false-low" or (a.answered_at or a.anchor_t) <= hi],
            )
            populations[0 if name == "before" else 1]["behavior"] = observed
            n = sum(r["n"] for r in observed["rows"])
            measured = sum(r["n"] for r in observed["rows"] if r["measured"])
            elapsed = max(0., (hi-lo).total_seconds()/86400)
            comparison["readiness"][name] = {
                "unit": observed["denominator"], "observed": n,
                "measured": measured, "unmeasured": n-measured, "elapsed_days": elapsed,
                "required_elapsed_days": 14, "criterion_met": elapsed>=14 and n>0 and measured==n,
                "contributing_dates": sorted({r["t"].date().isoformat() for r in observed["rows"] if r["measured"]}),
                "reason": observed["reason"] or ("zero_opportunities" if not n else "collecting" if elapsed<14 else None),
            }
    ready = all(r["criterion_met"] for r in comparison["readiness"].values())
    metrics = [compute_metrics(p["readings"]) for p in populations]
    specs = [("tir", "Time in range", "tir", "up"),
             ("tbr", "Time below range", "tbr_lvl1", "down"),
             ("tar", "Time above range", "tar_lvl1", "down")]
    if parameter == "profile":
        specs += [("mean", "Mean glucose", "mean_glucose", None),
                  ("cv", "Glucose variability", "cv", None)]
    for key, label, attr, polarity in specs:
        if polarity is not None:
            rate_groups = [{day: [glycemic_rate_counts(readings, attr)]
                            for day, readings in arm.items()} for arm in groups]
            statistic = lambda counts: _pct(sum(k for k, n in counts), sum(n for k, n in counts)) if counts else None
        else:
            rate_groups = groups
            statistic = lambda readings, attr=attr: getattr(compute_metrics(readings), attr)
        comparison["outcomes"].append(_row(
            key, label, "mg/dL" if key == "mean" else "%", [getattr(m, attr) for m in metrics],
            [m.n_readings for m in metrics], rate_groups, statistic, polarity, "observed CGM readings in eligible windows",
            [sum(row["coverage"] >= CONSENSUS_MIN_COVERAGE for row in coverage) for coverage in coverages], ready=ready,
        ))
    if parameter in ("basal_rate", "isf"):
        arms = []
        for population in populations:
            counts = []
            for window in population["view"]["rest_windows"]:
                lo, hi = _time(window["start"]), _time(window["end"])
                intervals = [(max(lo, a), min(hi, b)) for a, b in population["intervals"]
                             if max(lo, a) < min(hi, b)]
                minutes = sum((b - a).total_seconds() / 60 for a, b in intervals)
                readings = [r for r in population["readings"] if lo <= r.t < hi]
                if minutes and len(readings) / (minutes / CGM_CADENCE_MIN) >= CONSENSUS_MIN_COVERAGE:
                    counts.append(int(compute_metrics(readings).tbr_lvl1 > 0))
            arms.append(counts)
        ns, ks = list(map(len, arms)), list(map(sum, arms))
        values = [100 * k / n if n else None for k, n in zip(ks, ns)]
        assessment = {"state": "unclear", "interval": None, "confidence": .95,
                      "method": "Newcombe score interval and two-sided Fisher exact clearance",
                      "reasons": ["Coverage-qualified Rest windows, including windows without lows; observational and approximate."]}
        if all(ns):
            low, high = newcombe_diff_interval(ks[1], ns[1], ks[0], ns[0])
            assessment["interval"] = {"low": 100 * low, "high": 100 * high, "unit": "percentage points"}
            if ready and day_rate_clears(ks[1], ns[1], ks[0], ns[0]):
                assessment["state"] = "favorable" if high < 0 else "concerning"
            else:
                assessment["reasons"].append("Type-specific readiness or day-rate clearance is not met.")
        comparison["outcomes"].append({
            "key": "nights_with_low", "label": "Rest windows with a low", "unit": "%",
            "before": values[0], "after": values[1],
            "difference": values[1] - values[0] if all(ns) else None,
            "denominator": "coverage-qualified Rest windows in affected hours",
            "denominators": dict(zip(("before", "after"), ns)),
            "assessment": assessment,
        })
    if parameter == "carb_ratio":
        for key, label in (("peak", "Post-meal peak (up to 3 hours)"),
                           ("nadir", "Subsequent nadir (up to 6 hours)"), ("bg0", "Starting glucose")):
            arms, day_groups = [], []
            for measurements in observations:
                values, by_day = [], {}
                for row in measurements:
                    if row[key] is not None:
                        values.append(row[key])
                        by_day.setdefault(row["t"].date().isoformat(), []).append(row[key])
                arms.append(values)
                day_groups.append(by_day)
            statistic = lambda values: statistics.median(values) if values else None
            comparison["outcomes"].append(_row(
                key, label, "mg/dL", [statistic(a) for a in arms], list(map(len, arms)), day_groups,
                statistic, None, f"meals with readable {key}", ready=ready,
            ))
    if kind == "focus":
        day_groups, adherence = [], {}
        for name, lo, hi in (("before", start, changed), ("after", changed, end)):
            observed = populations[0 if name == "before" else 1]["behavior"]
            rows, reason = observed["rows"], observed["reason"]
            n, k = sum(r["n"] for r in rows), sum(r["k"] for r in rows)
            by_day = {}
            for row in rows:
                if not row.get("measured", True):
                    continue
                by_day.setdefault(row["t"].date().isoformat(), []).append(row)
            day_groups.append(by_day)
            adherence[name] = {"lever": record["lever"], "numerator": k, "denominator": observed["denominator"],
                               "opportunities": n, "unit": "proportion", "rate": k / n if n and not reason else None,
                               "harm": sum(r["harm"] for r in rows),
                               "measured_opportunities": sum(r["n"] for r in rows if r["measured"]),
                               "unmeasured_opportunities": sum(r["n"] for r in rows if not r["measured"]),
                               "harm_availability": _availability(next((r["harm_measurement_reason"] for r in rows if not r["harm_measured"]), None) or ("zero_opportunities" if not n else None)),
                               "informative_dates": len(by_day),
                               "availability": _availability(reason or ("zero_opportunities" if not n else None))}
            if reason:
                comparison["availability"] = _availability(reason)
        statistic = lambda rows: sum(r["k"] for r in rows) / sum(r["n"] for r in rows) if rows else None
        adherence["assessment"] = {
            **_assess(adherence["before"]["rate"], adherence["after"]["rate"], day_groups, statistic, "down", ready),
            "unit": "proportion", "denominator": adherence["before"]["denominator"],
        }
        comparison["adherence"] = adherence
        if any(adherence[name]["availability"]["state"] == "unavailable" for name in ("before", "after")):
            comparison["availability"] = _availability("unavailable_adherence")
    elif any(not p["readings"] for p in populations):
        comparison["availability"] = _availability("no_readable_period_evidence")
    if kind == "focus":
        mapped_keys = {"peak", "nadir"} if target == "arc" else {target}
        for row in comparison["outcomes"]:
            row["role"] = "mapped_outcome" if row["key"] in mapped_keys else "context"
    states = {row["assessment"]["state"] for row in comparison["outcomes"]}
    low_worsening = any(row["key"] in ("tbr", "nights_with_low")
                        and row["difference"] is not None and row["difference"] > 0
                        for row in comparison["outcomes"])
    comparison["assessment"] = {
        "state": "concerning" if "concerning" in states else "unclear",
        "mixed": "favorable" in states and ("concerning" in states or low_worsening),
        "low_exposure_worsened": low_worsening,
        "reason": "Read each outcome separately; an uncertain low-exposure worsening still limits favorable interpretation.",
    }
    if context_mode == "current":
        for row in comparison["outcomes"]:
            row["assessment"]["state"] = "context"
        if "adherence" in comparison:
            comparison["adherence"]["assessment"]["state"] = "context"
        comparison["assessment"]["state"] = "context"
    return result
