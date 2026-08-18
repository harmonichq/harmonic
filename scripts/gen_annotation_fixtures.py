#!/usr/bin/env python3
"""Generate the frontend's engine-authored annotation fixtures (#536).

The Settings audit evidence pane prints the *engine's* annotation sentence verbatim
in its Limits row and in the basal reading line. The rendered copy-register gate is
therefore only honest if the sentences it renders are the ones the engine actually
emits — the #528 gate stayed green because its fixture hand-wrote a sanitized
stand-in for the real basal sentence, which is exactly the "fixture encodes the
assumption under test" trap `CLAUDE.md` records for the thin-slot hold.

So the annotations the browser suite renders are produced here, by asking the real
analyzers: every basal status goes through `analyzers.basal._annotation_for`, and
every reachable correction-strength branch goes through `analyzers.isf._recommend`
with inputs chosen to land on it. A copy regression in either analyzer changes this
file's output, and the rendered gate moves with it — which is the point.

Synthetic only: invented inputs on the real schema, no patient data anywhere near it.

    python3 scripts/gen_annotation_fixtures.py         # rewrites the fixture in place
    python3 scripts/gen_annotation_fixtures.py --check  # CI-style drift check
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
from datetime import date

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from ciq_autotune.analyzers.basal import _annotation_for  # noqa: E402
from ciq_autotune.analyzers.isf import (  # noqa: E402
    IsfChannels,
    IsfConfig,
    _recommend,
)
from ciq_autotune.safety import Status  # noqa: E402
from ciq_autotune.uncertainty import Estimate  # noqa: E402

OUT = (pathlib.Path(__file__).resolve().parents[1]
       / "frontend" / "__fixtures__" / "engine-annotations.json")

_CFG = IsfConfig()


def _est(value, lo, hi, n=200):
    return Estimate(value=value, lo=lo, hi=hi, n=n, method="bootstrap-ols-isf")


def _ch(*, night_median=None, fits=None, corr_low_days=0, rescue_days=0,
        covered_days=30, rescue_observed=True):
    pairs = [(date(2026, 6, i + 1), v) for i, v in enumerate(fits or [])]
    if night_median is None and pairs:
        vals = sorted(v for _, v in pairs)
        m = len(vals) // 2
        night_median = vals[m] if len(vals) % 2 else (vals[m - 1] + vals[m]) / 2
    return IsfChannels(night_fits=pairs, night_median=night_median,
                       corr_low_days=corr_low_days, rescue_days=rescue_days,
                       covered_days=covered_days, rescue_observed=rescue_observed)


def basal_annotations() -> dict:
    """Every basal status's sentence, keyed by the status string the API emits."""
    return {status.value: _annotation_for(status) for status in Status}


# One entry per reachable `_recommend` branch. The `direction` each case is expected
# to produce is asserted at generation time, so a case that quietly stops reaching
# its branch fails here instead of silently freezing yesterday's sentence.
_ISF_CASES = [
    ("no_baseline_no_data", None, _est(None, None, None, 0), _ch(), False, None),
    ("no_baseline_measured", None, _est(40.0, 32.0, 48.0), _ch(night_median=40.0),
     False, None),
    ("no_measurement", 36.0, _est(None, None, None, 0), _ch(), False, None),
    ("weaken_no_target", 36.0, _est(30.0, 26.0, 40.0),
     _ch(night_median=30.0, corr_low_days=4), False, "weaken"),
    ("weaken_easing", 36.0, _est(42.0, 36.5, 48.0),
     _ch(night_median=45.0, corr_low_days=4), False, "weaken"),
    ("weaken_easing_disagreeing_measurement", 36.0, _est(28.0, 24.0, 32.0),
     _ch(night_median=45.0, corr_low_days=4), False, "weaken"),
    ("confirmed", 36.0, _est(40.0, 32.0, 48.0),
     _ch(night_median=40.0, corr_low_days=1), False, None),
    ("held_after_a_low", 36.0, _est(24.0, 18.0, 30.0),
     _ch(fits=[24.0, 25.0, 23.0], corr_low_days=1), False, None),
    ("held_rescue_log_incomplete", 36.0, _est(24.0, 18.0, 30.0),
     _ch(fits=[24.0, 25.0, 23.0], rescue_observed=False), False, None),
    ("collecting_range_too_wide", 36.0, _est(60.0, 45.0, 110.0),
     _ch(fits=[60.0, 58.0, 62.0]), False, None),
    ("strengthen", 36.0, _est(28.0, 25.0, 31.0),
     _ch(fits=[28.0, 27.0, 29.0, 26.0, 28.5]), True, "strengthen"),
    ("watching_not_yet_held", 36.0, _est(28.0, 25.0, 31.0),
     _ch(fits=[28.0, 27.0, 29.0, 26.0, 28.5]), False, None),
]


def isf_annotations() -> dict:
    """Every correction-strength sentence `_recommend` can return, by branch."""
    out = {}
    for name, programmed, est, ch, prior, want_direction in _ISF_CASES:
        _rec, ann, direction, _priced = _recommend(
            programmed, est, ch, _CFG, prior_strengthen_signal=prior)
        if direction != want_direction:
            raise SystemExit(
                f"{name}: expected direction {want_direction!r}, got {direction!r} — "
                "the case no longer reaches the branch it was built for")
        out[name] = ann
    return out


def payload() -> dict:
    return {
        "_generated_by": "scripts/gen_annotation_fixtures.py",
        "_note": ("SYNTHETIC. The sentences the engine really emits, produced by "
                  "running the real analyzers — never hand-written or sanitized. "
                  "Regenerate with `python3 scripts/gen_annotation_fixtures.py`."),
        "basal": basal_annotations(),
        "isf": isf_annotations(),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="fail if the committed fixture is stale")
    args = ap.parse_args()
    text = json.dumps(payload(), indent=1, sort_keys=True, ensure_ascii=False) + "\n"
    if args.check:
        current = OUT.read_text() if OUT.exists() else ""
        if current != text:
            print(f"stale fixture: {OUT} — rerun scripts/gen_annotation_fixtures.py")
            return 1
        print(f"annotation fixtures current ({OUT})")
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text)
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
