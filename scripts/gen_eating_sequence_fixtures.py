"""Generate the synthetic aggregate eating-sequence report fixture (#275)."""

import argparse
import json
import sys
from datetime import timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ciq_autotune.analyzers.eating_sequence_config import EatingSequenceConfig
from ciq_autotune.analyzers.eating_sequences import build_report, report_dict
from tests.eating_sequence_streams import repeat_eating_stream


OUT = ROOT / "frontend/__fixtures__/eating-sequence-report.json"


def payload() -> dict:
    """Build a populated report from the shared manufactured stream."""
    boluses, cgm, carb_log, _ = repeat_eating_stream()
    end = cgm[-1].t
    report = build_report(
        boluses, cgm, carb_log,
        window_start=end - timedelta(days=30), window_end=end,
        config=EatingSequenceConfig(),
    )
    return {
        "_generated_by": "scripts/gen_eating_sequence_fixtures.py",
        "_note": "SYNTHETIC. Fixed invented eating sequences; no personal data.",
        **report_dict(report),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rendered = json.dumps(payload(), indent=1, sort_keys=True) + "\n"
    if args.check:
        if (OUT.read_text() if OUT.exists() else "") != rendered:
            print(f"stale fixture: {OUT} — rerun scripts/gen_eating_sequence_fixtures.py")
            return 1
        print(f"eating-sequence report fixture current ({OUT})")
        return 0
    OUT.write_text(rendered)
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
