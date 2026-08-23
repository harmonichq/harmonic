"""Spike for #109 order: incumbent recovers a known synthetic ratio within 0.1,
and a no-signal placebo yields no band-excluding numeric block. Throwaway."""
import pathlib
import random
import sys
from datetime import datetime, timedelta

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from ciq_autotune.analyzers.ic import IcConfig, analyze_ic_blocks, ic_band_excludes_programmed
from ciq_autotune.events import BolusEvent

BASE = datetime(2026, 3, 1)


def meal(day, hour, carbs, dose, ratio=None):
    return BolusEvent(t=BASE + timedelta(days=day, hours=hour), insulin=dose,
                      carbs=carbs, carb_ratio=ratio, completion="Completed")


# --- known-ratio recovery: programmed 5.6, true ratio 5.0 --------------------
TRUE = 5.0
segs = [(0, 5.6)]
events = [meal(d, 9, 60, round(60 / TRUE, 2), ratio=5.6) for d in range(1, 25)]
blocks, runs = analyze_ic_blocks(events, segs, config=IcConfig(), observed_days=90)
b = blocks[0]
est = b.estimate
print("recovery:", b.state, "n_runs=", (b.evidence or {}).get("eligibility", {}).get("n_runs"),
      "value=", est.value, "lo=", est.lo, "hi=", est.hi, "asserts=", b.asserts_move)
assert b.state == "numeric"
assert est.value is not None and abs(est.value - TRUE) <= 0.1, est.value
assert est.lo <= TRUE <= est.hi, (est.lo, est.hi)

# --- placebo: dose-independent outcomes (dose jittered around programmed) ----
rng = random.Random(7)
pl_events = []
for d in range(1, 25):
    carbs = 60
    # doses scattered so carbs/dose has no consistent direction vs programmed 5.6
    dose = round(carbs / (5.6 * rng.uniform(0.85, 1.18)), 2)
    pl_events.append(meal(d, 9, carbs, dose, ratio=5.6))
pblocks, _ = analyze_ic_blocks(pl_events, segs, config=IcConfig(), observed_days=90)
pb = pblocks[0]
pest = pb.estimate
excludes = (pb.state == "numeric" and pest.value is not None and pest.lo is not None
            and pb.current is not None and not (pest.lo <= pb.current <= pest.hi))
print("placebo:", pb.state, "value=", pest.value, "lo=", pest.lo, "hi=", pest.hi,
      "asserts=", pb.asserts_move, "band_excludes=", excludes)
assert not pb.asserts_move
print("SPIKE OK")
"""Spike variant: placebo = dosed AT programmed, zero-mean CGM outcome noise."""
import pathlib, random, sys
from datetime import datetime, timedelta
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from ciq_autotune.analyzers.ic import IcConfig, analyze_ic_blocks
from ciq_autotune.events import BolusEvent, CgmReading

BASE = datetime(2026, 3, 1)
segs = [(0, 5.6)]
rng = random.Random(3)
events, cgm = [], []
for d in range(1, 25):
    t0 = BASE + timedelta(days=d, hours=9)
    events.append(BolusEvent(t=t0, insulin=round(60/5.6, 2), carbs=60,
                             carb_ratio=5.6, completion="Completed"))
    start = 120.0
    drift = rng.uniform(-25, 25)  # zero-mean outcome move, dose-independent
    for m in range(0, 331, 5):
        frac = min(m / 300.0, 1.0)
        cgm.append(CgmReading(t=t0 + timedelta(minutes=m), bg=start + drift * frac))
blocks, _ = analyze_ic_blocks(events, segs, config=IcConfig(),
                              cgm_readings=cgm, isf_effective=50.0, observed_days=90)
b = blocks[0]
e = b.estimate
print("placebo2:", b.state, "value=", e.value, "lo=", e.lo, "hi=", e.hi,
      "asserts=", b.asserts_move,
      "covers_programmed=", (e.lo is not None and e.lo <= 5.6 <= e.hi))
