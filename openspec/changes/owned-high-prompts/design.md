# Design — owned-high-prompts

## ADR 448 — A High an over-treated low owns raises no missed-meal prompt

**Ruling.** Coordinator ruling R448, made under Connor Griffin's 2026-09-23
delegation ("figure it out yourself from here"): a High that an over-treated low
owns raises no missed-meal prompt. Prompt candidates read the ownership the
Scenario evaluation already records (`Attribution.owned_highs`), never a second
judgment. Late bolus and carb undercount pass `scenario_config` to the context
gate. The two classifier comments are corrected. The unread reference tables and
the test that reads only them are deleted. Ownership is not narrowed for either
boundary case. This record settles how the ruling is carried out and why
ownership stays as ADR 422 drew it.

### Context

ADR 422 (#422) made a fired over-treated low own every real High whose run begins
after its nadir and at or before its guarded rebound terminal. The shared
evaluation walk (`evaluate`) records each owned High on its Episode's attribution
as `owned_highs`, and the Scenario no longer calls that High a missed meal.

The Carb-log prompt queue (`build_candidates` in `ciq_autotune/pending_prompts.py`)
never reads that record. It collects the window's anchors and runs
`classify_missed_meal` bare on each High's onset. The only check on that path that
knows about a preceding low is the context gate, which looks back 90 minutes for a
reading at or below 70 mg/dL. Measured on the base (evidence below):

* A sub-70 low whose rebound crosses 250 mg/dL about 110 or 150 minutes after the
  nadir raises "Did you treat this low?" at the nadir and "Did you eat here?" at
  the High onset. The evaluation records that High as owned.
* A 72 mg/dL near-low raises no low prompt (near-lows are not prompts, #128), but
  its rebound High raises "Did you eat here?" at both timings, including inside
  the low's own Episode. The evaluation records that High as owned too.
* The late-bolus and carb-undercount classifiers match under both the default
  gate and a configured one whose lookback (120 minutes) or low line (75 mg/dL)
  would explain the rise. Each classifier receives `scenario_config` and calls
  `upstream_cause` without it.

### Decision 1 — the queue reads the evaluation's ownership

`build_candidates` runs the shared evaluation walk once over the events it is
given, under the same scenario configuration and the low-prompt answers it is
handed. Every High anchor that any Episode's attribution lists in `owned_highs`
raises no missed-meal prompt, whatever the missed-meal classifier returns. That
is ADR 422's span membership read as recorded. Every other High keeps today's
classifier call and prompt. The queue judges no low and no rebound, and adds no
detector. The owned anchors are the same High-run anchors the queue already
walks: both come from `collect_anchors`, whose High runs do not depend on the low
line the queue passes.

The inputs that decide ownership are the Scenario's:

* **Low answers.** A `no` answer to "Did you treat this low?" refutes the low, so
  it owns nothing, and its rebound High is judged on its own. The store-facing
  `build_pending_prompts` therefore passes `low_prompt_answers(store, start, now)`,
  the helper `build_scenarios` uses. That helper applies #467's endpoint rule: an
  answer recorded after the data's latest event is not yet known. So a `no` given
  after the last fetch restores the High's question when the next fetch brings
  data past it. That is the same moment the Scenario stops calling the low
  over-treated. `not-sure` and `carbs` keep the low's ownership.
* **Scenario configuration.** The default, as in `build_scenarios`.
* **Classifier context.** The walk's default bounded context, as `assemble` uses.

Three inputs the Scenario reads do not bear on ownership, so the queue leaves
them as they are:

* **ISF.** Only carb undercount reads it. It can decide whether a
  correction-on-active-insulin low splits into two moments (#155), but the
  unsplit low and the split's High-moment own the same span, from the nadir to
  the guarded terminal. `owned_highs` is the same either way.
* **Carb entries.** Only the eating-sequence evaluation reads them.
* **False-low readings.** The Scenario drops a flagged false low's excursion
  readings. The queue does not: dropping them would also remove the flagged
  low's own answered prompt from the queue, which this ticket does not change.
  The excursion runs through the guarded
  rebound terminal. So a High inside it has no readings in the Scenario, and in
  the queue's walk its low owns it once the rebound fires. This change can only
  remove such a question, never add one.

The queue's window is its own 7 days; the Scenario's is 30. Ownership reaches at
most 180 minutes past a nadir, so the two agree except for a High within that
reach of the queue window's start, whose low the queue cannot see. That High is
judged as today.

A sub-70 low keeps its own "Did you treat this low?". So a slow rebound now
raises one question, at the low that owns it. A near-low's owned rebound raises
no question at all. The Scenario already attributes it Over-treated low, and the
manual quick-log still records a treatment.

The added walk costs little. On the throwaway prototype, the whole queue build
took 51 ms against the base's 48 ms on the committed showcase. Across the QA case
stores the difference ran from 15 ms faster to 12 ms slower, median 0.

### Decision 2 — late bolus and carb undercount read the configured gate

Both classifiers pass their `scenario_config` to `upstream_cause`, as missed
meal, meal bolus fell short, correction on active insulin, correction stacking
and user override already do. A Focus comparison replays its evaluation under the
configuration it retained (`follow_up_comparison.py`), so a retained non-default
gate setting would otherwise be silently ignored by these two. No output changes
today. Every retained configuration in committed output is the default (90
minutes, 70 mg/dL), and production builds the default everywhere else.

### Decision 3 — the comments and the unread tables

The correction-on-active-insulin and correction-stacking comments say
*upstream-cause* is reserved for the context gate. Since ADR 422 it also names an
over-treated low's rebound owning the rise. Both comments name both sources, in
missed meal's wording. Both still say why their own branch is `no_trigger`.

The Day chart module's `DETECTOR_REFERENCE`, `REASON_REFERENCE`, `DETECTOR_DEF` and
`REASON_DEF` have had no reader since the v1 retirement (#416). Their only
consumer was one test. Rewording copy nobody reads is pointless, so the tables and
that test go. A reader wanted back is a shipped-surface revision with its own
sanction. The same module's vocabulary header still names the deleted
`model-view-log.js` as its source. It is corrected in the same edit.

### Decision 4 — ownership is not narrowed

The #422 review raised two cases where ownership reaches a High a separate meal
may have caused:

* **An unannounced meal inside an unfinished rebound.** The rebound has not
  settled in range for 30 minutes, and a new rise crosses 250 mg/dL within 180
  minutes of the nadir. The scan has not ended, so the low owns that High.
* **A High after a 10–19 g meal bolus.** Missed meal and meal bolus fell short
  count that bolus as a meal (10 g floor). The rebound scan stops only at 20 g or
  more, so the low owns a High after it.

Neither is narrowed. One guarded scan decides the over-treated label, the #155
split, the scored span and ownership (ADR 422, D1). Narrowing ownership needs one
of two things. It could add a second judgment of where a rebound ends, which the
over-treated label would not share, and the two could disagree about one climb.
Or it could move the scan itself, for example by lowering its meal stop to 10 g
or ending it at a second rise. That changes which lows are over-treated, and how
far each is scored, far beyond these two cases. The prompt's answer is
exclusion-only (AGENTS.md: the manual Carb log is threaded through the analysis
purely as an exclusion signal). So the cost of leaving ownership as drawn is one
unasked question in the first case. In the second case the carbs are on the pump
feed, and missed meal already counts that bolus as a meal, so a High inside its
digestion lookback is not a missed meal whether or not the low owns it. No QA
coverage era is added and no budget is re-measured for this decision, because
nothing an analyzer produces changes.

### Not changed

The low prompt; the answered-match, anchor tolerance, coverage, expiry, grace and
display-cap rules; the `/api/prompts` payload shape; the context gate's defaults;
segmentation; the rebound horizon, bar and meal stop; every staging predicate, cap
and support floor. No rendered surface changes: the desk renders the served
prompts as before. `build_candidates` gains one keyword, `low_answers`, whose
empty default reproduces a store with no low answers.

### Evidence

Base reproduction on commit `b03431d2`, synthetic days, run from the worktree
root with `uv run python -`:

```python
from datetime import datetime, timedelta
from ciq_autotune.events import BolusEvent, CgmReading
from ciq_autotune.pending_prompts import build_candidates
from ciq_autotune.analyzers.scenario import evaluate
from ciq_autotune.analyzers.scenario_config import ScenarioConfig
from ciq_autotune.analyzers.classifiers import (classify_carb_undercount, classify_late_bolus,
                                                upstream_cause)

def seg(t0, off, start, slope, minutes):
    return {t0 + timedelta(minutes=off + 5 * k): start + slope * 5 * k for k in range(minutes // 5 + 1)}

def cgm_of(*parts):
    rows = {}
    for p in parts:
        for t, bg in p.items():
            rows.setdefault(t, bg)
    return [CgmReading(t=t, bg=rows[t], type="EGV") for t in sorted(rows)]

def rebound(nadir, rise_min, peak=270.0):
    t0 = datetime(2026, 6, 10, 13, 0)
    return cgm_of(seg(t0, 0, 110, 0.0, 30), seg(t0, 30, 110, -(110 - nadir) / 30.0, 30),
                  seg(t0, 60, nadir, (peak - nadir) / rise_min, rise_min),
                  seg(t0, 60 + rise_min, peak, -1.5, 60), seg(t0, 120 + rise_min, 180, -0.6, 60))

for nadir, rise_min in ((55.0, 120), (55.0, 165), (72.0, 70), (72.0, 120)):
    cgm = rebound(nadir, rise_min)
    owned = {h.reach_start: o for ep in evaluate([], cgm, []).episodes
             for h, o in ep.attribution.owned_highs}
    print(f"nadir {nadir:.0f}, rise {rise_min} min:",
          [(c.detector, f"{c.anchor_t:%H:%M}")
           + ((("owned" if c.anchor_t in owned else "unowned"),) if c.detector == "missed-meal" else ())
           for c in build_candidates([], cgm)])

day = datetime(2026, 6, 14)
climb = seg(day.replace(hour=10), 0, 110, 2.0, 40)
after = seg(day.replace(hour=10, minute=45), 0, 195, 1.5, 60)
shapes = {"gate_lookback_min=120": (cgm_of({day.replace(hour=9): 60.0},
                                           seg(day.replace(hour=9, minute=5), 0, 110, 0.0, 50), climb, after),
                                    ScenarioConfig(gate_lookback_min=120.0)),
          "gate_low_mgdl=75": (cgm_of({day.replace(hour=9, minute=40): 74.0},
                                      seg(day.replace(hour=9, minute=45), 0, 110, 0.0, 10), climb, after),
                               ScenarioConfig(gate_low_mgdl=75.0))}
meal = BolusEvent(t=day.replace(hour=10, minute=40), insulin=3.0, carbs=30.0, carb_ratio=10.0,
                  completion="Completed")
for label, (cgm, config) in shapes.items():
    print(f"context gate at the bolus, {label}: default explained="
          f"{upstream_cause(meal.t, cgm).explained}, configured explained="
          f"{upstream_cause(meal.t, cgm, scenario_config=config).explained}")
    for name, judge in (("late bolus", lambda c, **k: classify_late_bolus(meal, c, (), [meal], **k)),
                        ("carb undercount", lambda c, **k: classify_carb_undercount(meal, c, (), [meal], isf=40.0, **k))):
        print(f"{name}, {label}: default matched={judge(cgm).matched}, "
              f"configured matched={judge(cgm, scenario_config=config).matched}")
```

Output on the base:

```text
nadir 55, rise 120 min: [('low', '14:00'), ('missed-meal', '15:50', 'owned')]
nadir 55, rise 165 min: [('low', '14:00'), ('missed-meal', '16:30', 'owned')]
nadir 72, rise 70 min: [('missed-meal', '15:05', 'owned')]
nadir 72, rise 120 min: [('missed-meal', '15:50', 'owned')]
context gate at the bolus, gate_lookback_min=120: default explained=False, configured explained=True
late bolus, gate_lookback_min=120: default matched=True, configured matched=True
carb undercount, gate_lookback_min=120: default matched=True, configured matched=True
context gate at the bolus, gate_low_mgdl=75: default explained=False, configured explained=True
late bolus, gate_low_mgdl=75: default matched=True, configured matched=True
carb undercount, gate_low_mgdl=75: default matched=True, configured matched=True
```

A throwaway prototype of Decision 1 was discarded before this record was
committed. It removed exactly the four owned-High prompts above. It kept the
missed-meal prompt for an unbolused rise with no low before it. With a `no` answer
at the nadir it restored the High's prompt; with `not-sure` or `carbs` it did not.
On it, the 46 existing queue and `/api/prompts` tests passed. No QA case recipe's
served queue moved (71 recipes, showcase included). The #422 ownership case's
owned High sits outside its 7-day queue window. The design exploration's `pending`
rows were unchanged; only its analyzer `code_version` stamp and the context ids
derived from it moved. The QA harness (`execute_case`) does not read the queue, so
no QA case expectation can move. The late-bolus and carb-undercount change moves
no committed output, because every retained configuration is the default.
