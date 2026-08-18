"""Build the Verify workstation's replay fixtures through the model's own code.

Two outputs, both derived from one store so the mock side and the app side render
the SAME numbers (mock-to-app-process.md, R2):

* ``payload.json`` — API-shaped: the ``/verify/trials`` roster plus one
  ``?selected=`` response per Trial. The app opener's route stubs serve this, so
  the adapter under test is what consumes it.
* ``verify-trials.capture.json`` — capture-shaped: the same responses flattened
  into the top-level ``_changes`` / ``_envelopes`` / ``_mealarcs`` / ``_rescue``
  / ``_daydata`` maps the ★ LOCKED mock reads from disk.

Usage::

    # local, real data (PHI — output stays gitignored)
    python .claude/qa/gen_verify_payload.py --db tconnect-data/ciq.db --out tconnect-data/verify

    # the committed CI fixture set, manufactured (labelled in-band, no PHI)
    python .claude/qa/gen_verify_payload.py --synthetic --out mockups/verify-660-story.synthetic

The synthetic mode manufactures pump events and runs the real ``review_trials``
over them — it never hand-writes a payload. A fixture that skipped the engine
would drift from it silently, which is the failure this whole process exists to
prevent. The fixture obligations the lock names (both hero families, a maturing
and a complete Trial, a slot-scoped and an all-day I:C change, rescue deltas in
both directions, crossing medians, a full and a partial accrual) are asserted
before anything is written.
"""
from __future__ import annotations

import argparse
import json
import math
import pathlib
import sys
import tempfile
from datetime import datetime, timedelta

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))

from ciq_autotune.events import CarbEntry                       # noqa: E402
from ciq_autotune.settings import (                             # noqa: E402
    ProfileSegment, ProfileSettings, PumpSettings)
from ciq_autotune.store import Store                            # noqa: E402
from ciq_autotune.watched_change import review_trials           # noqa: E402

WINDOW = 14

_LABEL = ("MANUFACTURED FIXTURE — not real data. Built by "
          ".claude/qa/gen_verify_payload.py through review_trials(); safe to commit.")


# --- the manufactured store -------------------------------------------------

NOW = datetime(2026, 6, 30, 23, 30)
PROFILE_SWITCH = NOW - timedelta(days=7)          # maturing: 7 of 14
IC_SLOT_SWITCH = NOW - timedelta(days=21)         # complete: 14 of 14, block-scoped
IC_ALL_DAY = NOW - timedelta(days=24)             # complete: 14 of 14, all day


def _profile(idp, basal, isf, ic_morning, ic_midday, ic_evening):
    return ProfileSettings(
        idp=idp, name=str(idp), dia_min=300, carb_entry=True, max_bolus=15.0,
        segments=(ProfileSegment(0, basal, isf, ic_morning, 110),
                  ProfileSegment(720, basal, isf, ic_midday, 110),
                  ProfileSegment(900, basal, isf, ic_evening, 110)))


def _glucose(t, *, level, swing):
    """A plausible day curve: a dawn rise, a post-lunch peak, an evening settle.

    ``level`` shifts the whole day and ``swing`` scales its amplitude, which is
    how the Before and Trial periods are made to CROSS — the ribbon has to tint
    in both directions for the fixture to exercise term 5.
    """
    minutes = t.hour * 60 + t.minute
    day = math.sin((minutes - 300) / 1440 * 2 * math.pi)
    meal = math.exp(-(((minutes - 810) / 110) ** 2)) * 55
    return round(level + day * swing + meal)


def _annotated_items(block, members, current, value):
    """Mirror ``tests/test_verify_block_ic.py``'s helper of the same name.

    Stamps the ``ic_block_provenance`` slice 1 group applied-Plan history now
    requires (ADR 581) for a block-scoped I:C change to be admitted through
    ``_block_ic_candidates`` — a plain profile switch alone no longer qualifies.
    """
    provenance = {"block_start_min": block[0], "block_end_min": block[1],
                  "block_member_start_mins": list(members)}
    return [{"type": "ic", "start_min": start, "value": value, "current": current,
             "ic_block_provenance": provenance} for start in members]


def _apply_ic_block(store, applied_at, block, members, current, value):
    store.save_plan_draft(_annotated_items(block, members, current, value), applied_at)
    store.apply_plan(applied_at)


def _seed(path):
    old = _profile(1, 0.60, 40, 5.0, 5.0, 5.0)
    switched = _profile(2, 0.80, 36, 4.6, 4.6, 4.2)
    ic_block = _profile(3, 0.60, 40, 5.0, 4.4, 5.0)     # midday block only
    with Store.open(path) as store:
        # Settings history: three observed changes, oldest first.
        store.upsert_settings_snapshot(
            (IC_ALL_DAY - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S"),
            PumpSettings(1, (old, switched, ic_block)))
        store.upsert_settings_snapshot(
            IC_SLOT_SWITCH.strftime("%Y-%m-%d %H:%M:%S"),
            PumpSettings(3, (old, switched, ic_block)))
        store.upsert_settings_snapshot(
            PROFILE_SWITCH.strftime("%Y-%m-%d %H:%M:%S"),
            PumpSettings(2, (old, switched, ic_block)))

        # Block-scoped I:C admission (#660/ADR 581): the midday-only 5.0->4.4
        # move needs a matching complete annotated applied Plan group, or it
        # falls into the legacy general-arc fallback instead of the durable
        # block-owned Trial identity this fixture is meant to exercise.
        _apply_ic_block(
            store, (IC_SLOT_SWITCH - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S"),
            (720, 900), [720], 5.0, 4.4)

        cgm, boluses, basal = [], [], []
        start = NOW - timedelta(days=45)
        t, seq = start, 0
        while t < NOW:
            # Before the profile switch the day runs higher and flatter; after
            # it, lower with a wider swing, so the two medians cross.
            after = t >= PROFILE_SWITCH
            cgm.append({
                "EventDateTime": t.strftime("%Y-%m-%dT%H:%M:%S"),
                "Readings (CGM / BGM)": _glucose(t, level=155 if not after else 140,
                                                 swing=18 if not after else 34),
                "Description": "EGV",
            })
            t += timedelta(minutes=30)
        day = start
        while day < NOW:
            for hour, carbs in ((8, 45.0), (13, 60.0), (19, 50.0)):
                at = day.replace(hour=hour, minute=15)
                if at >= NOW:
                    continue
                seq += 1
                ratio = (5.0 if at < IC_ALL_DAY
                         else 4.4 if (at < PROFILE_SWITCH and 720 <= hour * 60 + 15 < 900)
                         else 4.6 if at >= PROFILE_SWITCH else 4.8)
                boluses.append({
                    "seq_num": seq,
                    "request_time": at.strftime("%Y-%m-%d %H:%M:%S"),
                    "completion_time": at.strftime("%Y-%m-%d %H:%M:%S"),
                    "description": "Bolus", "completion": "Completed",
                    "insulin": round(carbs / ratio, 2), "carbs": carbs,
                    "isf": 36 if at >= PROFILE_SWITCH else 40,
                    "carb_ratio": ratio, "target_bg": 110,
                })
            seq += 1
            basal.append({
                "seq_num": 100000 + seq,
                "time": day.strftime("%Y-%m-%d %H:%M:%S"),
                "delivery_type": "profileDelivery", "duration_mins": 5,
                "basal_rate": 0.80 if day >= PROFILE_SWITCH else 0.60,
                "profile_basal_rate": 0.80 if day >= PROFILE_SWITCH else 0.60,
            })
            day += timedelta(days=1)
        store.upsert_cgm(cgm)
        store.upsert_bolus(boluses)
        store.upsert_basal(basal)

        # Rescue carbs: denser before the profile switch than after (fewer
        # entries is the good direction), and more low-prompted ones after the
        # I:C changes, so the two movement chips point opposite ways.
        for i in range(14):
            store.upsert_carb_entry(CarbEntry(
                t=PROFILE_SWITCH - timedelta(days=i, hours=3), grams=18.0,
                certainty="estimate", source="low-prompt" if i % 3 else "manual"))
        for i in range(5):
            store.upsert_carb_entry(CarbEntry(
                t=PROFILE_SWITCH + timedelta(days=i, hours=4),
                grams=None if i == 0 else 12.0,
                certainty="unknown" if i == 0 else "exact", source="manual"))
        for i in range(9):
            store.upsert_carb_entry(CarbEntry(
                t=IC_SLOT_SWITCH + timedelta(days=i, hours=6), grams=20.0,
                certainty="estimate", source="low-prompt"))


# --- assembly ---------------------------------------------------------------

def _build(store, now):
    roster = review_trials(store, now=now, window_days=WINDOW)
    details = {t["id"]: review_trials(store, now=now, window_days=WINDOW,
                                      selected=t["id"])
               for t in roster["trials"]}
    return roster, details


def _capture_shape(roster, details, now):
    """The same responses in the ★ LOCKED mock's own capture layout."""
    selected = {tid: d["selected"] for tid, d in details.items()}
    return {
        "_source": _LABEL,
        "now": now.isoformat(),
        "window_days": WINDOW,
        "roster": roster,
        "details": {tid: {"selected": s} for tid, s in selected.items()},
        "_changes": {tid: s["changes"] for tid, s in selected.items()},
        "_envelopes": {tid: s["envelopes"] for tid, s in selected.items()},
        "_mealarcs": {tid: s["meal_arcs"] for tid, s in selected.items()
                      if s.get("meal_arcs")},
        "_rescue": {tid: s["rescue"] for tid, s in selected.items()},
        "_daydata": {tid: s["day_rows"] for tid, s in selected.items()},
    }


def _check_obligations(roster, details):
    """The lock's fixture obligations, asserted before anything is written."""
    trials = roster["trials"]
    selected = [d["selected"] for d in details.values()]
    problems = []
    states = {t["state"] for t in trials}
    if not {"maturing", "complete"} <= states:
        problems.append(f"needs a maturing AND a complete Trial; got {sorted(states)}")
    clock = [s for s in selected if "tir" in s["target_metrics"]]
    arc_only = [s for s in selected
                if "arc" in s["target_metrics"] and "tir" not in s["target_metrics"]]
    if not clock:
        problems.append("no glucose-by-clock Trial (needs a tir target)")
    if not arc_only:
        problems.append("no meal-anchored Trial (needs an arc-only target)")
    if not any(s.get("meal_arcs", {}).get("block") for s in selected):
        problems.append("no block-scoped Trial")
    if not any(s.get("meal_arcs") and not s["meal_arcs"].get("block") for s in selected):
        problems.append("no all-day arc Trial")
    accruals = {(s["maturing"]["days_elapsed"], s["maturing"]["days_required"])
                for s in selected}
    if not any(e >= r for e, r in accruals):
        problems.append(f"no fully accrued Trial; got {sorted(accruals)}")
    if not any(e < r for e, r in accruals):
        problems.append(f"no partially accrued Trial; got {sorted(accruals)}")
    deltas = [s["rescue"]["trial_period"]["n"] - s["rescue"]["before_period"]["n"]
              for s in selected]
    if not (any(d < 0 for d in deltas) and any(d > 0 for d in deltas)):
        problems.append(f"rescue deltas do not run both ways: {deltas}")
    crossings = 0
    for s in selected:
        before = {r["t"]: r.get("med") for r in s["envelopes"]["before_period"]}
        signs = {(r["med"] - before[r["t"]]) > 0
                 for r in s["envelopes"]["trial_period"]
                 if r.get("med") is not None and before.get(r["t"]) is not None}
        crossings += len(signs) > 1
    if not crossings:
        problems.append("no Trial whose medians cross — the ribbon renders one tint only")
    return problems


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", help="read an existing store (real data — output is PHI)")
    ap.add_argument("--synthetic", action="store_true",
                    help="manufacture a store instead (safe to commit)")
    ap.add_argument("--out", required=True, help="output directory")
    args = ap.parse_args()
    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    if args.synthetic:
        with tempfile.TemporaryDirectory() as tmp:
            path = str(pathlib.Path(tmp) / "synthetic.db")
            _seed(path)
            with Store.open(path) as store:
                roster, details = _build(store, NOW)
                now = NOW
    elif args.db:
        with Store.open_readonly(args.db) as store:
            now = max(r.t for r in store.cgm_readings())
            roster, details = _build(store, now)
    else:
        ap.error("one of --db or --synthetic is required")

    problems = _check_obligations(roster, details)
    if args.synthetic and problems:
        print("fixture obligations unmet:", *problems, sep="\n  ")
        raise SystemExit(1)
    for problem in problems:
        print(f"note: {problem}")

    payload = {"_source": _LABEL if args.synthetic else "real snapshot — PHI, never commit",
               "roster": roster,
               "details": details}
    (out / "payload.json").write_text(json.dumps(payload, indent=1, default=str))
    (out / "verify-trials.capture.json").write_text(
        json.dumps(_capture_shape(roster, details, now), indent=1, default=str))
    print("wrote", out / "payload.json", "and", out / "verify-trials.capture.json")
    print("trials:", [(t["id"], t["state"]) for t in roster["trials"]])


if __name__ == "__main__":
    main()
