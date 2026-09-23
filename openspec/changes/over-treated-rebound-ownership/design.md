# Design — over-treated-rebound-ownership

## ADR 422 — An over-treated low's rebound owns the High it reaches

**Ruling.** Operator decision D1, Connor Griffin, 2026-09-23: an over-treated low
whose rebound reaches a High owns that High, so the High is not also called a
missed meal (silence reason `upstream_cause`), and the rebound's out-of-range time
counts on the low's Episode. This record settles how that ruling is carried out.
It changes no segmentation rule, gate lookback, rebound horizon, rebound bar,
staging predicate, cap or support floor.

### Context

The missed-meal context gate (`upstream_cause`) looks back 90 minutes from where
a High run begins for a reading at or under 70 mg/dL, or a defensive suspend.
Segmentation separates anchors more than 90 minutes apart. So whenever the 250
mg/dL crossing comes more than 90 minutes after the low run ends, the High is its
own Episode and the gate cannot see the low. The low's guarded rebound scan
(`guarded_rebound`, #149) reaches up to 180 minutes past the nadir and finds the
same peak. Both claims fire on one climb. The only existing link from a rebound
High back to its Low is the #155 caused-low split, which runs only for a
correction-on-active-insulin low.

Measured in-process on the base (evidence below):

* With the crossing 100–150 minutes after a 55 mg/dL nadir, every day yields an
  Over-treated-low Episode and a separate Missed-meal Episode whose detail reads
  "no recent low or suspend to explain it". With the crossing at 60–80 minutes it
  is one Over-treated-low Episode.
* The split-off low's scored span stops at the Missed-meal Episode's start, so it
  scores lower than the same shape crossing sooner.
* With a 72 mg/dL near-low nadir, the gate never sees the low (it looks for 70 or
  below). Even at 60–90 minutes, inside one Episode, the High keeps a matched
  missed-meal verdict. It is retained as a candidate and priced into the
  missed-meal impact population.
* A rebound that climbs fast and then creeps across 250 mg/dL (under 1 mg/dL/min
  at the crossing) also splits off. Its High sits in its own silent Episode with
  both verdicts `no_trigger`, so the exposures producer counts it as a High with no
  cause detected.

### Decision 1 — ownership, not a re-anchored gate

The issue offered two mechanisms: judge the gate from where the climb begins, or
let a fired rebound own the High it reaches. D1 chose ownership. It reads the
one guarded rebound scan that already decides the over-treated-low label, the
#155 split and the scored span (#124). A second window for the same question
could disagree with that scan.

### Decision 2 — what "reaches" means

A fired over-treated-low judgment owns a High anchor when the High's run begins
after the low's nadir and at or before the guarded rebound's terminal. Ownership is
span membership. It is recorded for every High inside the span, whatever the High's
own classifiers return. "Fired"
means the judgment matched. A low refuted by a `no` answer, a low owned by an
announced meal (ADR 225), and a rebound under its bar own nothing. A #155
synthesized rebound High-moment owns through the span it already carries: from
the crash nadir to the guarded terminal.

A High whose run begins after the terminal is not owned and is judged on its own.
The terminal is where the scan ended: a settled in-range dwell, a re-dip, a CGM
gap, the next substantial meal bolus, or the 180-minute horizon. That includes a
continuous climb that first crosses 250 mg/dL after the horizon. Only real CGM
High runs are owned. The synthesized High-moment already attributes Over-treated
low.

### Decision 3 — ownership is read from the build, in one walk

Ownership is decided inside the shared evaluation walk (`evaluate`) that every
behavioral consumer already reads: scenario, tally, Explore, model view and case
files. It comes from the build's own fired judgment, never from a separate
re-judgment. That avoids the #155 failure, where a gate judged over a different
context than the build. Episodes are walked in order. A rebounding low heads its
Episode (`split_low_rebounds`) and is judged before any later anchor. So a fired
low's rebound span is known before every High it can own, whether that High is in
its own Episode or a later one. A synthesized High-moment's span is known from the
anchor itself before the walk starts. That covers the case where the High-moment's
real High sits in the earlier low-moment Episode.

Same-Episode ownership is required, not incidental: the near-low measurement shows
a matched missed-meal candidate inside the owning Episode today.

### Decision 4 — what an owned High yields

An owned High attributes no High lever: neither Missed / unannounced meal nor
Meal bolus fell short (the two split one rise population). Both classifiers
consult ownership after their rise checks and after the context gate, and before
any later check.

* A rise-check exit keeps its calm reason. Too sparse to judge stays
  `insufficient_data`, and a flat or slow rise stays `no_trigger`: no behavior was
  seen, so there is nothing for the low to explain away.
* A rise the context gate already explains keeps the gate's verdict byte-for-byte,
  because committed fixtures freeze that text.
* Every other outcome, including one that would have matched or been priced, is a
  non-match with silence reason `upstream_cause`, evidence tier Inferred, and a
  detail naming the owning low's nadir value and time.

So `upstream_cause` now also means an over-treated low's rebound owns the rise,
beside the context gate's recent low or defensive suspend. The silence-reason
docstrings and the glossary entry say so. An owned High contributes no candidate,
so no missed-meal or meal-bolus-short impact price counts it. An Episode holding
only owned Highs draws no Lever, and its silence reason is that missed-meal
verdict, as for every silent High today.

### Decision 5 — scoring

An Episode that draws no Lever does not bound an over-treated low (#124): the low
reaches through it to its guarded terminal. The owning Episode's scored span
reaches the later of that terminal and the end of every High run it owns, but
never past the scan's meal-bolus stop. The guarded scan already rules that
readings after the next substantial meal bolus belong to the meal
(`guarded_rebound`'s `stop_at`), so an owned High run that continues past that
bolus stops counting on the low there. That
matches a rebound whose High shares the low's Episode, whose span already covers
the High. The non-overlap rule (#80) stands: the span still stops at the next
lever-bearing Episode. The owned High's own silent Episode keeps its geometry, and
no Lever is charged for it.

### Decision 6 — an owned High is explained, not uncaused

ADR 63 Decision 6 counts a High as "no cause detected by the app" when its Episode
carries no driver Lever. That definition would now count an owned High whose own
Episode is silent. Such a High is explained, because its low owns it. So the
attribution records the Highs a rebound owns, and the exposures producer's
`uncaused` tally skips them, whatever their verdicts, including a flat-approach
High whose verdicts read `no_trigger`. This refines ADR 63 Decision 6; the count
stays Episode-wise for every other High. The findings-projection fixture
generator's hand-built roll-up holds no owned High, so its Episode-wise rule stays
complete for its data, and its prose says so. An owned High stays a non-driver Occurrence
with no attributed Lever. That matches a rebound High inside the low's Episode,
which also carries no cross-family Over-treated-low claim. No count, denominator
or appearance of any Finding row changes because of it.

### Decision 7 — the gate reads the scenario configuration

The missed-meal classifier passes its scenario configuration to the context gate
instead of the gate's defaults. Meal bolus fell short does the same, because the
two classifiers partition one rise population: gates judged under different
configurations would reopen a double claim under a tuned configuration. The
late-bolus classifier judges meals, not this population, and is left for the
follow-up issue.

### Not changed

The carb-log prompt queue still asks "Did you eat here?" from the bare
classifier, with no Episode context. Whether an owned High should still raise that
prompt beside the low's own prompt is a separate question and a drafted follow-up.
No rendered surface changes. The committed QA showcase and every existing QA case
expectation are unchanged: a throwaway prototype of this design moved none of them.

### Evidence

Base reproduction (commit `a4d374a7`, synthetic four-day window, no bolus; run
from the worktree root with `uv run python -`):

```python
from datetime import datetime, timedelta
from ciq_autotune.analyzers.scenario.evaluation import evaluate
from ciq_autotune.events import CgmReading

def seg(t0, off, start, slope, minutes):
    return [CgmReading(t=t0 + timedelta(minutes=off + 5 * k), bg=start + slope * 5 * k, type="EGV")
            for k in range(minutes // 5 + 1)]

def rebound(day, nadir, rise_min, peak=270.0):
    t0 = datetime(2026, 6, day, 13, 0)
    return (seg(t0, 0, 110, 0.0, 30) + seg(t0, 30, 110, -(110 - nadir) / 30.0, 30)
            + seg(t0, 60, nadir, (peak - nadir) / rise_min, rise_min)
            + seg(t0, 60 + rise_min, peak, -1.5, 60) + seg(t0, 120 + rise_min, 180, -0.6, 60))

for nadir, rise_min in ((55.0, 70), (55.0, 120), (55.0, 165), (72.0, 70)):
    cgm = [r for day in range(10, 14) for r in rebound(day, nadir, rise_min)]
    ev = evaluate([], cgm, [])
    day10 = [e for e in ev.episodes if e.start.day == 10]
    print(f"nadir {nadir:.0f}, rise {rise_min} min:", [
        (e.attribution.lever.value if e.attribution.lever else None,
         f"{e.start:%H:%M}-{e.end:%H:%M}", round(e.severity, 1),
         sorted(c.lever.value for c in e.candidates)) for e in day10])
```

Output on the base:

```text
nadir 55, rise 70 min: [('over_treated_low', '13:55-17:00', 5098.2, ['over_treated_low'])]
nadir 55, rise 120 min: [('over_treated_low', '13:55-15:50', 3157.3, ['over_treated_low']), ('missed_meal', '15:50-17:00', 4051.0, ['missed_meal'])]
nadir 55, rise 165 min: [('over_treated_low', '13:55-16:30', 3667.4, ['over_treated_low']), ('missed_meal', '16:30-17:45', 4431.8, ['missed_meal'])]
nadir 72, rise 70 min: [('over_treated_low', '14:00-17:00', 4140.0, ['missed_meal', 'over_treated_low'])]
```

The rise lengths put the 250 mg/dL crossing about 63, 109 and 150 minutes after
the nadir. A throwaway prototype of Decisions 2–7 was discarded before this record
was committed. It removed the split-off Missed-meal Episodes and the near-low
missed-meal candidate, and extended the low's scored span to the rebound terminal.
A climb crossing 250 mg/dL five minutes past the 180-minute horizon still read as a
missed meal (Decision 2's boundary). On that prototype the whole backend suite
passed (2,535 passed, 1 skipped), every committed QA case expectation held, and ten
of the eleven drift checks stayed current. Only the design exploration's
`focus.json` and `journey.json` moved, and only their analyzer `code_version` stamp
and the context id derived from it. A first prototype that put ownership before the
context gate failed one findings-projection test, whose committed fixture freezes
the gate's verdict text for a High that shares the low's Episode. That failure is
why Decision 4 consults ownership after the gate.
