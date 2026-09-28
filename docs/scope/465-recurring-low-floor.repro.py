"""#465 reproduction: a recurring-lows basal cut below the noise floor.

Synthetic data only. Run from the repository root:

    uv run python docs/scope/465-recurring-low-floor.repro.py
    uv run python docs/scope/465-recurring-low-floor.repro.py --stores   # item 5 only
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "tests"))

from ciq_autotune.analyzers.basal import analyze_basal, consolidate_profile  # noqa: E402
from ciq_autotune.analyzers.tuning_priority import basal_lever  # noqa: E402
from ciq_autotune.events import BasalEvent, CgmReading  # noqa: E402
from ciq_autotune.harm import HarmConfig  # noqa: E402
from ciq_autotune.safety import SafetyConfig, Status, apply_harm  # noqa: E402
from test_harm_basal_arm import _build, _slot  # noqa: E402


def _slot_night(day, hour, minute, *, rate, programmed):
    t0 = datetime(2022, 6, day, hour, minute)
    basal = [BasalEvent(t=t0, delivery_type="algorithmDelivery", duration_mins=30,
                        basal_rate=rate, profile_basal_rate=programmed)]
    cgm = [CgmReading(t=t0 + timedelta(minutes=5 * k), bg=120.0, type="EGV")
           for k in range(7)]
    return basal, cgm


def _low(day, hour, minute):
    t0 = datetime(2022, 6, day, hour, minute)
    return [CgmReading(t=t0 + timedelta(minutes=5 * k), bg=50.0, type="EGV")
            for k in range(3)]


def _two_slot_lever(trivial_rate):
    """01:30 on 14 nights, 03:00 a sixth under on 9 nights, lows at both."""
    basal, cgm = [], []
    for day in range(1, 15):
        b, c = _slot_night(day, 1, 30, rate=trivial_rate, programmed=0.72)
        basal += b
        cgm += c
    for day in range(1, 10):
        b, c = _slot_night(day, 3, 0, rate=0.60, programmed=0.72)
        basal += b
        cgm += c
    for day in (20, 21):
        cgm += _low(day, 1, 30) + _low(day, 3, 0)
    slots = analyze_basal(basal, cgm, [], [], harm_config=HarmConfig())
    lever = basal_lever(slots, slot_minutes=30)
    return slots, lever


def committed_stores():
    """Every recurring-lows basal cut the committed synthetic stores serve."""
    import tempfile

    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
    from qa_e2e_cases import QA_CASES, WINDOW_DAYS, materialize_case
    from ciq_autotune.analyze import analyze
    from ciq_autotune.store import Store

    cfg = SafetyConfig()
    stores = [("showcase", Path(__file__).resolve().parents[2]
               / "mockups/qa-e2e.synthetic/harmonic.sqlite", None)]
    stores += [(case.name, None, case) for case in QA_CASES]
    from functools import partial
    from qa_e2e_cases import QaCase, _materialize_basal_coverage
    # The proposed `basal-recurring-low-within-floor` recipe, not yet committed.
    stores.append(("proposed basal-recurring-low-within-floor", None, QaCase.__new__(QaCase)))
    object.__setattr__(stores[-1][2], "recipe", partial(
        _materialize_basal_coverage, clean_rate=0.59, recurring_lows=True))
    cuts = []
    for name, path, case in stores:
        with tempfile.TemporaryDirectory() as scratch:
            db = Path(scratch) / "case.sqlite"
            if case is None:
                db.write_bytes(path.read_bytes())
            else:
                with Store.open(str(db)) as store:
                    materialize_case(store, case)
            with Store.open_readonly(str(db)) as store:
                analysis = analyze(store, window_days=WINDOW_DAYS,
                                   pool_agreeing_basal_regimes=True,
                                   carb_entries=store.carb_entries(),
                                   prompt_responses=store.prompt_responses())
        for slot in analysis.basal:
            if slot.status is Status.HARM_LOWER:
                threshold = min(cfg.noise_floor, slot.current * cfg.max_step_frac)
                move = slot.current - slot.recommended
                cuts.append((name, slot.label, slot.current, slot.recommended,
                             round(move, 3), move < threshold - 1e-9))
    print(f"   stores checked: {len(stores)} (the last is the proposed case)")
    for name, label, current, rec, move, held in cuts:
        print(f"   {name} {label}: {current} -> {rec}, step {move}, "
              f"{'within the threshold' if held else 'at or above the threshold'}")


def main():
    if "--stores" in sys.argv:
        print("5. Recurring-lows cuts on the committed synthetic stores")
        committed_stores()
        return
    cfg = SafetyConfig()
    print("1. analyze_basal on 12 in-range nights, programmed 0.72, delivered 0.71, lows at 03:00 on two nights")
    basal, cgm = _build(rate=0.71, programmed=0.72, low_nights=(20, 21))
    with_harm = analyze_basal(basal, cgm, [], [], harm_config=HarmConfig())
    s = _slot(with_harm, "03:00")
    print(f"   with harm: status {s.status.value!r}, recommended {s.recommended}, "
          f"asserts_move {s.asserts_move}, action "
          f"{(s.guidance['action'] or {}).get('direction')} "
          f"{(s.guidance['action'] or {}).get('recommended')}, "
          f"seriousness {s.guidance['seriousness']}")
    print(f"   annotation: {s.annotation!r}")
    s0 = _slot(analyze_basal(basal, cgm, [], []), "03:00")
    print(f"   without harm: status {s0.status.value!r}")

    print("2. consolidate_profile over that analysis")
    profile = consolidate_profile(with_harm)
    overnight = [seg for seg in profile.segments if seg.start_min < 360]
    for seg in overnight:
        print(f"   segment from {seg.start_min // 60:02d}:{seg.start_min % 60:02d} "
              f"basal {seg.basal_rate}")

    print("3. apply_harm with nudge=True")
    for current, median in ((0.72, 0.71), (0.72, 0.66), (0.20, 0.16),
                            (0.20, 0.19), (0.11, None), (0.10, None)):
        rec, status = apply_harm(current, None, Status.NO_CHANGE, cfg,
                                 nudge=True, median=median)
        print(f"   setting {current}, median {median}: {status.value!r} at {rec}")
    print("   float: 0.72 - round(0.72 * 0.8, 3) =", 0.72 - round(0.72 * 0.8, 3),
          "; 0.72 * 0.2 =", 0.72 * 0.2)

    print("4. basal_lever with two nudged slots")
    for label, rate in (("01:30 a hundredth under", 0.71), ("01:30 at programmed", 0.72)):
        slots, lever = _two_slot_lever(rate)
        s130, s300 = _slot(slots, "01:30"), _slot(slots, "03:00")
        print(f"   {label}: 01:30 {s130.status.value!r}, 03:00 {s300.status.value!r}; "
              f"priority {lever.priority}, recurrence channel {lever.recurrence_channel}")


if __name__ == "__main__":
    main()
