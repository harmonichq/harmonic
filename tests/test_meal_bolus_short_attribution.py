"""Meal-bolus-fell-short at the attribution, exposure and projection layers (#63).

The classifier's own contract is `tests/test_classifier_meal_bolus_short.py`. This
file is about what the rest of the system does with it, and every case here is built
from EVENTS and read off ANALYZER OUTPUT — never a hand-set flag on a fixture. That
rule is in `CLAUDE.md` because the basal thin-slot bug survived four fixes behind
fixtures that hand-set the very verdict under test.

Four things are pinned:

* **Chronological preemption.** One driver per episode, earliest actionable anchor
  wins. A meal anchor precedes its high, so this lever drives only where every
  earlier anchor stayed silent; where one did not, the match narrates as a
  consequence and does not become a second driver.
* **The honest count is episode-level.** A high whose EPISODE drew a lever elsewhere
  is explained, even though that high is not itself the driver. This is the seven-way
  gap between `clean` (27 on the measured snapshot) and `uncaused` (20).
* **The count does not move with the clock.** It answers "in the findings window",
  which is why an empty scoped queue still reports it.
* **Nothing here can dose.** The lever is behavioral: it never stages into Plan and
  never reaches a pump-profile schedule.
"""

import tempfile
import unittest
from datetime import datetime, timedelta

from ciq_autotune.analyzers.scenario.anchors import collect_anchors
from ciq_autotune.analyzers.scenario.attribute import attribute
from ciq_autotune.analyzers.scenario.levers import (
    Exposure, Lever, exposure, outcome_kind, recommendation, title,
)
from ciq_autotune.analyzers.scenario.segment import (
    EpisodeAnchors, segment, split_double_humps,
)
from ciq_autotune.events import BolusEvent, CgmReading
from ciq_autotune.findings_projection import (
    UNCAUSED_HIGHS_COPY, FindingsProjection, WindowQuery,
)
from ciq_autotune.store import Store

DAY = datetime(2026, 6, 14)


def at(hh, mm=0):
    return DAY + timedelta(hours=hh, minutes=mm)


def trace(points):
    """5-min CGM readings interpolated through ``(hour, minute, bg)`` corners."""
    out = []
    for (h1, m1, b1), (h2, m2, b2) in zip(points, points[1:]):
        t1, t2 = at(h1, m1), at(h2, m2)
        steps = int((t2 - t1).total_seconds() // 300)
        for k in range(steps):
            out.append(CgmReading(t=t1 + timedelta(minutes=5 * k),
                                  bg=b1 + (b2 - b1) * k / steps, type="EGV"))
    h, m, b = points[-1]
    out.append(CgmReading(t=at(h, m), bg=b, type="EGV"))
    return out


# One evening: a generously counted meal at 12:00 that carb-undercount will NOT call
# short (85 g logged against a ~101 g implied excursion is inside counting range),
# glucose climbing anyway, and a correction at 13:40. This is the measured shape —
# the digestion-window bucket where missed-meal declines and the dose still failed.
UNDERDOSED_CGM = trace([(9, 0, 110), (12, 0, 112), (12, 20, 120),
                        (14, 0, 265), (16, 0, 150)])
UNDERDOSED_BOLUS = [
    BolusEvent(t=at(12), completion="Completed", insulin=5.0, carbs=85.0, carb_ratio=12.0),
    BolusEvent(t=at(13, 40), insulin=2.5, carbs=None),
]


# The same under-dosed high, followed hours later by a SEPARATE cluster of stacked
# corrections that carries glucose to 58. Two episodes, two levers, one shared story.
CHAINED_CGM = trace([(9, 0, 110), (12, 0, 112), (12, 20, 120), (14, 0, 265),
                     (16, 0, 150), (17, 0, 175), (19, 0, 190), (21, 30, 58),
                     (23, 0, 110)])
CHAINED_BOLUS = UNDERDOSED_BOLUS + [
    BolusEvent(t=at(19, 10), insulin=3.0, carbs=None),
    BolusEvent(t=at(19, 50), insulin=3.0, carbs=None),
]

# A late meal bolus drives its episode while a high sits inside that same episode —
# the shape that separates `clean` from `uncaused`. The 08:00 hump's high draws
# nothing at all and IS uncaused; the 11:50 hump's high is merely not the driver.
GAP_CGM = trace([(6, 0, 110), (8, 0, 112), (8, 20, 125), (9, 30, 255),
                 (11, 0, 118), (11, 30, 120), (13, 30, 265), (15, 30, 140)])
GAP_BOLUS = [BolusEvent(t=at(8), completion="Completed", insulin=6.0, carbs=85.0, carb_ratio=12.0),
             BolusEvent(t=at(11, 50), completion="Completed", insulin=5.0, carbs=70.0, carb_ratio=12.0),
             BolusEvent(t=at(13), insulin=2.5, carbs=None)]


def next_day(events):
    """The same day's events, 24 h later — a second occurrence of one behavior."""
    out = []
    for e in events:
        out.append(e.__class__(**{**e.__dict__, "t": e.t + timedelta(days=1)}))
    return out


# The same under-dosed evening on two consecutive days: enough for the lever to be a
# PATTERN rather than a one-off, which is what gives it a Wilson confidence to read.
RECURRING_CGM = UNDERDOSED_CGM + next_day(UNDERDOSED_CGM)
RECURRING_BOLUS = UNDERDOSED_BOLUS + next_day(UNDERDOSED_BOLUS)

# One eligible meal followed by two distinct highs. The first returns fully to range
# before the second starts, so segmentation emits two episodes; their different peaks
# make the representative choice observable instead of relying on input order.
DOUBLE_HIGH_CGM = trace([
    (9, 0, 110), (12, 0, 112), (12, 20, 120), (13, 0, 255),
    (13, 35, 120), (13, 50, 120), (14, 35, 305), (15, 30, 145),
])
DOUBLE_HIGH_BOLUS = [
    BolusEvent(t=at(12), completion="Completed", insulin=5.0, carbs=85.0,
               carb_ratio=12.0, seq_num=7001),
    BolusEvent(t=at(13, 20), insulin=2.5, carbs=None, seq_num=7002),
]


def episodes_of(bolus, cgm):
    return split_double_humps(segment(collect_anchors(bolus, cgm, [])), cgm)


def attributions(bolus, cgm, isf=45.0):
    return [attribute(ep, cgm, bolus, [], isf=isf) for ep in episodes_of(bolus, cgm)]


class AttributionTest(unittest.TestCase):
    def test_a_silent_carb_undercount_lets_the_high_anchor_drive(self):
        attrs = attributions(UNDERDOSED_BOLUS, UNDERDOSED_CGM)
        self.assertEqual([a.lever for a in attrs], [Lever.MEAL_BOLUS_SHORT])
        self.assertEqual(attrs[0].trigger, "high")
        self.assertIn("did not cover what followed", attrs[0].steps[0].text)

    def test_a_matching_carb_undercount_keeps_precedence(self):
        # Same evening, same correction — only the logged carbs change, so carb
        # undercount now fires on the EARLIER meal anchor and owns the episode.
        bolus = [BolusEvent(t=at(12), completion="Completed", insulin=5.0, carbs=60.0, carb_ratio=12.0),
                 BolusEvent(t=at(13, 40), insulin=2.5, carbs=None)]
        attrs = attributions(bolus, UNDERDOSED_CGM)
        self.assertEqual([a.lever for a in attrs], [Lever.CARB_UNDERCOUNT])
        self.assertEqual(attrs[0].trigger, "meal")

    def test_an_outranked_match_narrates_but_never_becomes_a_second_driver(self):
        # A late meal bolus at 11:50 drives on the earlier anchor while the high
        # anchor's own judgment still matches. One driver, the rest as consequence.
        cgm = trace([(6, 0, 110), (8, 0, 112), (8, 20, 125), (9, 30, 255),
                     (11, 0, 118), (11, 30, 120), (13, 30, 265), (15, 30, 140)])
        bolus = [BolusEvent(t=at(8), completion="Completed", insulin=6.0, carbs=85.0, carb_ratio=12.0),
                 BolusEvent(t=at(11, 50), completion="Completed", insulin=5.0, carbs=70.0, carb_ratio=12.0),
                 BolusEvent(t=at(13), insulin=2.5, carbs=None)]
        second = attributions(bolus, cgm)[1]
        self.assertEqual(second.lever, Lever.LATE_BOLUS)
        # The match is still told — as a later beat, not a second attribution.
        self.assertEqual(len(second.steps), 2)
        self.assertIn("did not cover what followed", second.steps[1].text)

    def test_it_drives_an_episode_that_holds_no_meal_occurrence(self):
        # The measured 4-of-10 shape: no meal anchor belongs to the episode, but the
        # counted meal bolus is still in the detector's digestion-window context.
        # Built through `attribute`'s own interface, with the high anchor alone.
        high = [a for a in collect_anchors(UNDERDOSED_BOLUS, UNDERDOSED_CGM, [])
                if a.kind.value == "high"]
        self.assertEqual(len(high), 1)
        attr = attribute(EpisodeAnchors(anchors=high), UNDERDOSED_CGM,
                         UNDERDOSED_BOLUS, [], isf=45.0)
        self.assertEqual(attr.lever, Lever.MEAL_BOLUS_SHORT)

    def test_a_high_nobody_corrected_draws_no_lever_at_all(self):
        # Drop the correction and the evidence is gone. Every episode goes silent
        # rather than reaching for the nearest plausible cause.
        levers = [a.lever for a in attributions([UNDERDOSED_BOLUS[0]], UNDERDOSED_CGM)]
        self.assertTrue(levers)
        self.assertEqual(set(levers), {None})

    def test_a_chained_high_then_low_stays_two_findings(self):
        # The under-dosed high, then corrections stacking into a low later the same
        # day. The low is a separate anchored story with its own lever; this one does
        # not absorb it, and the shared evidence does not merge them (#61 D9).
        levers = [a.lever for a in attributions(CHAINED_BOLUS, CHAINED_CGM)]
        self.assertEqual(levers, [Lever.MEAL_BOLUS_SHORT, Lever.CORRECTION_STACKING])


class TaxonomyMetadataTest(unittest.TestCase):
    def test_the_lever_is_completely_wired_into_the_closed_set(self):
        self.assertEqual(title(Lever.MEAL_BOLUS_SHORT), "Meal bolus fell short")
        self.assertEqual(exposure(Lever.MEAL_BOLUS_SHORT), Exposure.HIGHS)
        self.assertEqual(outcome_kind(Lever.MEAL_BOLUS_SHORT), "high")
        self.assertEqual(outcome_kind("meal_bolus_short"), "high")

    def test_its_copy_cannot_be_read_as_carb_undercount(self):
        from ciq_autotune.analyzers.scenario.levers import meaning
        self.assertNotEqual(title(Lever.MEAL_BOLUS_SHORT), title(Lever.CARB_UNDERCOUNT))
        for text in (recommendation(Lever.MEAL_BOLUS_SHORT),
                     meaning(Lever.MEAL_BOLUS_SHORT)):
            lowered = text.lower()
            for banned in ("undercount", "carb ratio", "i:c", "grams",
                           "estimate higher", "split the dose"):
                self.assertNotIn(banned, lowered, f"{banned!r} in {text!r}")

    def test_its_recommendation_asks_for_observation_not_a_pump_change(self):
        # Behavioral flavor: the fix is noticing, never editing a programmable value.
        text = recommendation(Lever.MEAL_BOLUS_SHORT).lower()
        self.assertIn("watching", text)
        for banned in ("basal", "isf", "correction factor", "carb ratio", "raise ",
                       "lower ", "increase", "decrease", "u/hr"):
            self.assertNotIn(banned, text)

    def test_it_is_in_the_catalog_the_guide_renders(self):
        from ciq_autotune.analyzers.scenario import build_catalog
        entry = [e for e in build_catalog()["levers"]
                 if e["value"] == "meal_bolus_short"]
        self.assertEqual(len(entry), 1)
        self.assertEqual(entry[0]["title"], "Meal bolus fell short")


class HighExposureRosterTest(unittest.TestCase):
    def test_the_high_anchored_levers_are_exactly_these_two(self):
        """The roster `frontend/diagnose-high-causes-have-no-alignment.test.js` pins.

        The event-comparison lens has no Highs view, so a HIGHS lever must stay out of
        its title-keyed allowlist — and absence is a silent contract that nothing
        fails when a third one is added. This is the tripwire: adding a high-anchored
        lever fails HERE, which names the JS guard that has to learn its title.
        """
        highs = {lever for lever in Lever if exposure(lever) is Exposure.HIGHS}
        self.assertEqual(highs, {Lever.MISSED_MEAL, Lever.MEAL_BOLUS_SHORT})
        self.assertEqual({title(lever) for lever in highs},
                         {"Missed / unannounced meal", "Meal bolus fell short"})


class NeverDosesTest(unittest.TestCase):
    """The lever is advisory. It must not reach anything that moves a pump number."""

    def test_it_never_appears_as_a_tunable_parameter(self):
        from ciq_autotune.analyzers.scenario.levers import LEVER_EXPOSURE
        # Every scenario lever counts against a behavioral exposure, not a parameter;
        # the pump-profile schedule is built from basal / I:C / ISF estimates, none of
        # which this lever can name.
        self.assertNotIn(Lever.MEAL_BOLUS_SHORT.value,
                         {"basal_rate", "carb_ratio", "isf"})
        self.assertEqual(LEVER_EXPOSURE[Lever.MEAL_BOLUS_SHORT], Exposure.HIGHS)

    def test_analyzing_an_under_dosed_meal_stages_nothing(self):
        with tempfile.NamedTemporaryFile(suffix=".db") as db:
            with Store.open(db.name) as store:
                _seed(store, UNDERDOSED_BOLUS, UNDERDOSED_CGM)
                projection = _projection(store)
        rows = projection.project(WindowQuery.whole_day())["rows"]
        for row in rows:
            if row["title"] == "Meal bolus fell short":
                # `assert` is the only stageable register (term 38).
                self.assertEqual(row["register"], "finding")
                self.assertIsNone(row["current"])
                self.assertIsNone(row["recommended"])


def _seed(store, bolus, cgm):
    store.upsert_cgm([
        {"EventDateTime": r.t.strftime("%Y-%m-%dT%H:%M:%S"),
         "Readings (CGM / BGM)": r.bg, "Description": "EGV"} for r in cgm])
    store.upsert_bolus([
        {"seq_num": i, "request_time": b.t.strftime("%Y-%m-%d %H:%M:%S"),
         "description": "Bolus", "completion": b.completion, "carbs": b.carbs, "insulin": b.insulin,
         "carb_ratio": b.carb_ratio} for i, b in enumerate(bolus, start=1)])


def _projection(store):
    from ciq_autotune.analyze import analyze
    from ciq_autotune.analyzers.scenario import build_scenarios
    from ciq_autotune.explore_exposures import build_exposures
    from ciq_autotune.findings_projection import prepare_findings_projection
    return prepare_findings_projection(
        analysis=analyze(
            store, pool_agreeing_basal_regimes=True,
            carb_entries=store.carb_entries(), prompt_responses=store.prompt_responses(),
        ).to_dict(),
        exposures=build_exposures(store), scenarios=build_scenarios(store).to_dict(),
    )


class WilsonSupportTest(unittest.TestCase):
    """The lever earns its confidence the way every scenario lever does (#58)."""

    def _assembled(self, bolus, cgm):
        from ciq_autotune.analyzers.scenario.engine import assemble
        return assemble(bolus, cgm, [], isf=45.0)

    def test_a_single_occurrence_never_surfaces_as_a_pattern(self):
        # One episode is not a pattern (`engine_min_occurrences`), and this lever
        # takes no exemption — over-treated low is the only lever that does. A cause
        # asserted off one instance is the plausible-but-wrong risk in miniature.
        report = self._assembled(UNDERDOSED_BOLUS, UNDERDOSED_CGM)
        surfaced = [p.lever for p in report.patterns]
        self.assertNotIn(Lever.MEAL_BOLUS_SHORT, surfaced)

    def test_its_confidence_is_denominated_on_completed_meals_in_the_window(self):
        # The recurrence population is eligible completed meals, not high outcomes.
        report = self._assembled(RECURRING_BOLUS, RECURRING_CGM)
        found = [p for p in list(report.patterns) + list(report.low_confidence)
                 if p.lever is Lever.MEAL_BOLUS_SHORT]
        self.assertEqual(len(found), 1)
        confidence = found[0].confidence
        self.assertEqual(confidence.k, 2)
        self.assertGreaterEqual(confidence.n, confidence.k)
        groups = found[0].to_dict()["occurrence_groups"]
        self.assertEqual(len(groups), confidence.k)
        for group in groups:
            self.assertEqual(group["hero_episode"], group["member_episode_ids"][0])
            self.assertIn("meal-", group["id"])

    def test_two_unequal_highs_from_one_meal_are_one_worst_episode_occurrence(self):
        from ciq_autotune.analyzers.scenario_config import ScenarioConfig
        from ciq_autotune.analyzers.scenario.engine import assemble
        report = assemble(
            DOUBLE_HIGH_BOLUS, DOUBLE_HIGH_CGM, [], isf=45.0,
            scenario_config=ScenarioConfig(engine_min_occurrences=1),
        )
        episodes = [episode for episode in report.episodes.values()
                    if episode.lever is Lever.MEAL_BOLUS_SHORT]
        self.assertEqual(len(episodes), 2)
        pattern = next(
            item for item in [*report.patterns, *report.low_confidence]
            if item.lever is Lever.MEAL_BOLUS_SHORT
        )
        self.assertEqual((pattern.confidence.k, pattern.confidence.n), (1, 1))
        self.assertEqual(len(pattern.occurrence_groups), 1)
        group = pattern.occurrence_groups[0]
        worst = max(episodes, key=lambda episode: episode.severity)
        self.assertEqual(group["id"], "meal-7001")
        self.assertEqual(set(group["member_episode_ids"]),
                         {episode.id for episode in episodes})
        self.assertEqual(group["severity"], worst.severity)
        self.assertEqual(group["hero_episode"], worst.id)
        self.assertEqual(pattern.hero_episode, worst.id)

    def test_it_uses_no_floor_of_its_own(self):
        # `safety.py` owns the basal and I:C support floors. A scenario lever that
        # invented a third one would be a second source of truth for support.
        import inspect
        from ciq_autotune.analyzers.classifiers import meal_bolus_short
        self.assertNotIn("safety", inspect.getsource(meal_bolus_short))


class UncausedHighsTest(unittest.TestCase):
    """The honest count is episode-level, whole-window, and server-authored."""

    def _exposures(self, bolus, cgm):
        from ciq_autotune.explore_exposures import build_exposures
        with tempfile.NamedTemporaryFile(suffix=".db") as db:
            with Store.open(db.name) as store:
                _seed(store, bolus, cgm)
                return build_exposures(store)["exposures"]

    def test_an_attributed_high_is_not_counted_as_uncaused(self):
        highs = self._exposures(UNDERDOSED_BOLUS, UNDERDOSED_CGM)["highs"]
        self.assertEqual(highs["n"], 1)
        self.assertEqual(highs["attributed"], 1)
        self.assertEqual(highs["uncaused"], 0)
        self.assertEqual(highs["occurrences"][0]["cause_occurrence_id"], "meal-1")

    def test_removing_the_evidence_makes_the_same_high_uncaused(self):
        # The identical high, minus the correction that evidenced the shortfall:
        # nothing is attributed, so it enters the honest count.
        highs = self._exposures([UNDERDOSED_BOLUS[0]], UNDERDOSED_CGM)["highs"]
        self.assertEqual(highs["n"], 1)
        self.assertEqual(highs["attributed"], 0)
        self.assertEqual(highs["uncaused"], 1)

    def test_uncaused_is_not_clean_when_the_episode_drew_a_lever_elsewhere(self):
        # THE SEVEN-WAY GAP, in miniature. Two highs, NEITHER of them a driver, so
        # `clean` counts both. Only one of them sits in an episode the app explained
        # nothing about, so `uncaused` counts one. Reading `clean` as "no cause
        # detected" is exactly the 27-vs-20 overstatement this value exists to fix.
        highs = self._exposures(GAP_BOLUS, GAP_CGM)["highs"]
        self.assertEqual(highs["n"], 2)
        self.assertEqual(highs["attributed"], 0)
        self.assertEqual(highs["clean"], 2)
        self.assertEqual(highs["uncaused"], 1)

    def test_the_published_line_is_whole_window_and_scope_invariant(self):
        with tempfile.NamedTemporaryFile(suffix=".db") as db:
            with Store.open(db.name) as store:
                _seed(store, [UNDERDOSED_BOLUS[0]], UNDERDOSED_CGM)
                projection = _projection(store)
        expected = {"count": 1,
                    "text": UNCAUSED_HIGHS_COPY.format(n=1, noun="high")}
        self.assertEqual(
            projection.project(WindowQuery.whole_day())["uncaused_highs"], expected)
        for start, end in ((0, 60), (720, 900), (1320, 120)):
            scoped = projection.project(WindowQuery.clock(start, end))
            self.assertEqual(scoped["uncaused_highs"], expected,
                             f"{start}-{end} must report the whole window")

    def test_the_sentence_names_highs_and_avoids_the_retired_noun(self):
        line = UNCAUSED_HIGHS_COPY.format(n=20, noun="highs")
        self.assertEqual(line, "20 highs had no cause detected by the app")
        # CONTEXT.md: the domain term is Occurrence; "event" is a listed synonym to
        # steer clear of.
        self.assertNotIn("event", line)

    def test_nothing_is_published_when_nothing_went_unexplained(self):
        empty = FindingsProjection(
            _analysis={"window_days": 30, "basal": [], "isf": [], "ic_blocks": []},
            _exposures={"window": {}, "exposures": {}},
            _scenarios={"patterns": [], "low_confidence": []})
        self.assertEqual(empty.project(WindowQuery.whole_day())["uncaused_highs"],
                         {"count": 0, "text": None})


if __name__ == "__main__":
    unittest.main()
