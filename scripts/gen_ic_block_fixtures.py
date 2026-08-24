#!/usr/bin/env python3
"""Generate the frontend's I:C block fixtures by RUNNING the real analyzer (#518).

The frontend tests must never hand-set `asserts_move`. That is the exact trap #273's
suite fell into: its fixtures encoded the very assumption that was false against real
data, so the tests stayed green while the product shipped a hold that did not hold.

So the block payloads the JS tests read are produced here, by feeding synthetic meals
through the shipped I:C block estimator + `price_ic_blocks` and serialising whatever
the analyzer decided. If a gate changes, this file's output changes, and the frontend
tests move with it — which is the point.

Synthetic only: invented meals on the real schema, no patient data anywhere near it.

    python3 scripts/gen_ic_block_fixtures.py        # rewrites the fixture in place
    python3 scripts/gen_ic_block_fixtures.py --check  # CI-style drift check
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
from datetime import datetime, timedelta

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from ciq_autotune.analyzers.ic import (  # noqa: E402
    BLOCK_WINDOW_DAYS,
    IcConfig,
    analyze_ic,
)
from ciq_autotune.analyzers.ic_regression import analyze_ic_blocks_fuzzy  # noqa: E402
from ciq_autotune.analyzers.tuning_priority import (  # noqa: E402
    ic_headline_block,
    ic_lever,
    price_ic_blocks,
)
from ciq_autotune.events import BolusEvent  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[1] / "frontend" / "__fixtures__" / "ic-blocks.json"
BASE = datetime(2026, 3, 1)


def meal(day, hour, carbs, dose, ratio=None, minute=0):
    return BolusEvent(t=BASE + timedelta(days=day, hours=hour, minutes=minute),
                      insulin=dose, carbs=carbs, carb_ratio=ratio,
                      completion="Completed")


def build(segments, events, *, observed_days=BLOCK_WINDOW_DAYS):
    blocks, runs = analyze_ic_blocks_fuzzy(
        events, segments, config=IcConfig(), observed_days=observed_days)
    priced = price_ic_blocks(blocks)
    lever = ic_lever(priced)
    head = ic_headline_block(priced)
    # The per-programmed-SEGMENT rows (`analyze_ic`) are the pump-lane display
    # `analyze_ic_blocks` doesn't emit — the block is the eligibility unit, but the
    # spine still draws one hit target per programmed segment. Generated off the SAME
    # segments/events as the blocks above, so a browser fixture that wants segment rows
    # to go with a block scenario never hand-sets them (the #273/#465 trap, extended to
    # segment fixtures by #523's review).
    segment_rows, _findings = analyze_ic(events, segments, config=IcConfig())
    return {
        "ic": [s.to_dict() for s in segment_rows],
        "ic_blocks": [b.to_dict() for b in priced],
        "ic_runs": runs,
        "tuning_levers": ([lever.to_dict()] if lever is not None else []),
        "headline_block_id": None if head is None else head.block_id,
    }


def scenarios() -> dict:
    out: dict = {}

    # --- one block per state, on one profile -------------------------------------
    # overnight: 4 runs -> below-floor · morning: a full asserting pool ·
    # midday: meals that always chain out -> unmeasured-alone · evening: 2 runs.
    segs = [(0, 5.1), (180, 5.1), (420, 4.0), (570, 4.0), (660, 5.4), (720, 5.7)]
    # 00:30 is more than post_meal_min before 06:00, so these four stay their own runs.
    events = [meal(d, 0, 60, 12.0, ratio=5.1, minute=30) for d in range(4)]
    events += [meal(d, 8, 60, 20.0, ratio=4.0) for d in range(1, 25)]
    # 06:00 chains into 11:00 (5 h apart), so every midday meal runs into the overnight
    # block and none of them ever sits wholly inside midday. The evening block is left
    # with no meals at all, so it stays `collecting`.
    for d in range(8):
        events += [meal(d, 6, 60, 12.0, ratio=5.1), meal(d, 11, 60, 12.0, ratio=5.4)]
    out["states"] = build(segs, events)

    # --- two blocks asserting at once ---------------------------------------------
    segs2 = [(0, 5.1), (420, 4.0), (570, 4.0), (720, 5.7)]
    ev2 = ([meal(d, 0, 60, 14.0, ratio=5.1) for d in range(1, 25)]
           + [meal(d, 8, 60, 20.0, ratio=4.0) for d in range(1, 25)])
    out["two_asserting"] = build(segs2, ev2)

    # --- nothing separable yet: every block collecting -----------------------------
    out["collecting"] = build(segs2, ev2, observed_days=34)

    # --- no meals at all: the cold-start surface --------------------------------
    out["empty"] = build(segs2, [], observed_days=3)

    # --- everything measured and in agreement --------------------------------------
    segs3 = [(0, 5.0), (720, 6.0)]
    ev3 = ([meal(d, 9, 60, 12.0, ratio=5.0) for d in range(1, 25)]
           + [meal(d, 19, 60, 10.0, ratio=6.0) for d in range(1, 25)])
    out["confirmed"] = build(segs3, ev3)

    # --- #523: a numeric block whose measured band EXCLUDES its programmed value but
    # does not assert a move — the regime bracket (gate 3) is correctly holding it,
    # because most of the pool was dosed under a previous ratio. Evening (12:00–24:00)
    # is programmed at 5.7; 20 runs were dosed under the old 5.0 (true_ic 5.0, pulling
    # the full-window estimate down to ~5.12, band ~5.05–5.17 — clearly excluding 5.7)
    # while 5 runs were dosed at the current 5.7 (true_ic 5.7 exactly, so the on-regime
    # sub-pool sits AT programmed) — 5.12 and 5.7 bracket 5.7, so the bracket straddles
    # and the tighten is held, not asserted. Morning is a plain agreeing block for
    # contrast. Through the real analyzer only — asserts_move/held_reason are read off
    # the output, never hand-set (the #273/#465 trap).
    segs_held = [(0, 5.0), (720, 5.7)]
    ev_held = ([meal(d, 9, 60, 12.0, ratio=5.0) for d in range(1, 25)]
               + [meal(d, 19, 60, 12.0, ratio=5.0) for d in range(1, 21)]
               + [meal(d, 20, 57, 10.0, ratio=5.7) for d in range(21, 26)])
    out["held"] = build(segs_held, ev_held)

    # --- re-partition: the headline's recommendation EQUALS its neighbour's current,
    # so applying it merges the two blocks into one. Both sides are generated, so the
    # frontend can prove its disposition key fails OPEN across the merge.
    before_segs = [(0, 5.0), (720, 4.5)]
    ev4 = ([meal(d, 9, 60, 15.0, ratio=5.0) for d in range(1, 25)]
           + [meal(d, 19, 45, 10.0, ratio=4.5) for d in range(1, 25)])
    before = build(before_segs, ev4)
    head_id = before["headline_block_id"]
    head = next(b for b in before["ic_blocks"] if b["block_id"] == head_id)
    # apply it: every member boundary takes the recommended value
    applied = dict(before_segs)
    for start in head["member_start_mins"]:
        applied[start] = head["recommended"]
    after_segs = sorted(applied.items())
    after = build(after_segs, ev4)
    out["repartition"] = {
        "before": before,
        "after": after,
        "applied_schedule": [list(x) for x in after_segs],
    }
    return out


def payload() -> dict:
    return {
        "_generated_by": "scripts/gen_ic_block_fixtures.py",
        "_note": ("SYNTHETIC. Produced by running the real analyzer — never hand-set. "
                  "Regenerate with `python3 scripts/gen_ic_block_fixtures.py`."),
        "block_window_days": BLOCK_WINDOW_DAYS,
        "min_runs": IcConfig().min_runs,
        "scenarios": scenarios(),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="fail if the committed fixture is stale")
    args = ap.parse_args()
    text = json.dumps(payload(), indent=1, sort_keys=True) + "\n"
    if args.check:
        current = OUT.read_text() if OUT.exists() else ""
        if current != text:
            print(f"stale fixture: {OUT} — rerun scripts/gen_ic_block_fixtures.py")
            return 1
        print(f"ic-block fixtures current ({OUT})")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text)
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
