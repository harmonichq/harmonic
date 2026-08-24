#!/usr/bin/env python3
"""Prototype: three crediting schemes for chained cross-block I:C ledgers.

Ledger-level Monte Carlo, synthetic only. A run's observed ledger is
(carbs, effective_insulin) where effective insulin converges to what was
truly needed: C_A/rA + C_B/rB, plus outcome noise. Lone runs have all
carbs in one block. Chained runs mix blocks at carb share s.

Estimators for block A (and symmetrically B):
  incumbent : pool lone-A runs only (today's engine)
  share     : pool lone-A runs at weight 1 + chained runs at weight s
  threshold : lone-A + chained runs with s >= 0.8 counted fully
  regress   : WLS fit of 1/ratio_i = s_i/rA + (1-s_i)/rB over ALL runs
"""

import random
import statistics

RA_TRUE, RB_TRUE = 5.0, 6.2
PROGRAMMED = 5.6           # both blocks dose at this; recovery target is truth
SIGMA_REL = 0.08           # relative outcome noise on effective insulin
REPS = 400
BOOT = 300
FLOOR = 8


def make_runs(rng, n_lone_a, n_chained, n_lone_b, ra, rb):
    """Return list of (carbs, insulin_obs, share_a)."""
    runs = []
    for _ in range(n_lone_a):
        c = rng.uniform(40, 80)
        need = c / ra
        runs.append((c, need * (1 + rng.gauss(0, SIGMA_REL)), 1.0))
    for _ in range(n_chained):
        c = rng.uniform(80, 140)
        s = rng.uniform(0.3, 0.8)
        need = c * s / ra + c * (1 - s) / rb
        runs.append((c, need * (1 + rng.gauss(0, SIGMA_REL)), s))
    for _ in range(n_lone_b):
        c = rng.uniform(40, 80)
        need = c / rb
        runs.append((c, need * (1 + rng.gauss(0, SIGMA_REL)), 0.0))
    return runs


def pooled(entries):
    """entries: (carbs, insulin, weight). Weighted pooled ratio."""
    num = sum(c * w for c, i, w in entries)
    den = sum(i * w for c, i, w in entries)
    return num / den if den > 0 else None


def boot_ci(rng, entries, est_fn, n=BOOT):
    vals = []
    for _ in range(n):
        sample = [entries[rng.randrange(len(entries))] for _ in entries]
        v = est_fn(sample)
        if v is not None:
            vals.append(v)
    if len(vals) < n * 0.8:
        return None, None
    vals.sort()
    return vals[int(0.10 * len(vals))], vals[int(0.90 * len(vals))]


def est_incumbent(runs):
    ent = [(c, i, 1.0) for c, i, s in runs if s == 1.0]
    return ent, (pooled(ent) if len(ent) >= 1 else None)


def est_share(runs):
    ent = [(c, i, s) for c, i, s in runs if s > 0.0]
    return ent, pooled(ent)


def est_threshold(runs):
    ent = [(c, i, 1.0) for c, i, s in runs if s >= 0.8]
    return ent, (pooled(ent) if ent else None)


def regress(runs):
    """WLS: 1/ratio_i = s_i * x + (1-s_i) * y, weights = carbs. Returns 1/x = rA."""
    sxx = sxy = syy = bx = by = 0.0
    for c, i, s in runs:
        inv = i / c            # observed 1/ratio
        w = c
        sxx += w * s * s
        sxy += w * s * (1 - s)
        syy += w * (1 - s) * (1 - s)
        bx += w * s * inv
        by += w * (1 - s) * inv
    det = sxx * syy - sxy * sxy
    if abs(det) < 1e-12:
        return None
    x = (bx * syy - by * sxy) / det   # 1/rA
    if x <= 0:
        return None
    return 1.0 / x


def est_regress(runs):
    return runs, regress(runs)


def run_scenario(name, n_lone_a, n_chained, n_lone_b, ra, rb):
    print(f"\n=== {name}: lone-A={n_lone_a} chained={n_chained} lone-B={n_lone_b} "
          f"trueA={ra} trueB={rb} programmed={PROGRAMMED} ===")
    schemes = {
        "incumbent": est_incumbent,
        "share": est_share,
        "threshold": est_threshold,
        "regress": est_regress,
    }
    for label, fn in schemes.items():
        rng = random.Random(hash((name, label)) & 0xFFFFFFFF)
        ests, widths, cover, excl_prog, n_pool = [], [], 0, 0, []
        usable = 0
        for _ in range(REPS):
            runs = make_runs(rng, n_lone_a, n_chained, n_lone_b, ra, rb)
            ent, val = fn(runs)
            if label == "regress":
                lo, hi = boot_ci(rng, runs, regress)
                n_contrib = sum(1 for c, i, s in runs if s > 0)
            else:
                lo, hi = boot_ci(rng, ent, pooled) if ent else (None, None)
                n_contrib = len(ent)
            if val is None or lo is None:
                continue
            usable += 1
            ests.append(val)
            widths.append(hi - lo)
            cover += int(lo <= ra <= hi)
            excl_prog += int(not (lo <= PROGRAMMED <= hi))
            n_pool.append(n_contrib)
        if not ests:
            print(f"  {label:10s}  no usable estimate ({usable}/{REPS})")
            continue
        med = statistics.median(ests)
        rmse = (sum((e - ra) ** 2 for e in ests) / len(ests)) ** 0.5
        print(f"  {label:10s}  medA={med:5.2f}  bias={med - ra:+5.2f}  "
              f"rmse={rmse:4.2f}  ci80w={statistics.median(widths):4.2f}  "
              f"cover80={cover / usable:4.0%}  bandExclProg={excl_prog / usable:4.0%}  "
              f"runs={statistics.median(n_pool):.0f}  usable={usable}/{REPS}")


# Scenario 1: the motivating starved morning — almost no lone-A runs.
run_scenario("starved-morning", 3, 30, 30, RA_TRUE, RB_TRUE)
# Scenario 2: balanced history.
run_scenario("balanced", 12, 15, 20, RA_TRUE, RB_TRUE)
# Scenario 3: placebo-shaped — truth equals programmed; bandExclProg is the
# false-finding rate that would fire ADR 23's permanent rejection.
run_scenario("placebo-shaped", 3, 30, 30, PROGRAMMED, PROGRAMMED)
