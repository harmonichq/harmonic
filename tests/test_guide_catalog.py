"""#157 Guide catalog — the type-level ``/api/catalog`` payload builder.

``build_catalog`` is pure (no store, no FastAPI): it generates the positive
lever catalog from :data:`~ciq_autotune.analyzers.scenario.levers._META` and
enumerates the closed :class:`SilenceReason` / :class:`EvidenceTier` taxonomies
(ADR 0009). These tests pin that generation so the Guide can never silently
drift from the taxonomy the engine actually attributes.
"""

import unittest

from ciq_autotune.analyzers.classifiers import EvidenceTier, SilenceReason
from ciq_autotune.analyzers.scenario import build_catalog, levers
from ciq_autotune.analyzers.scenario.levers import Exposure, Lever


class MeaningAccessorTest(unittest.TestCase):
    def test_every_lever_has_a_distinct_meaning(self):
        # #157 added `meaning` to _META (index 3); the accessor exposes it and it
        # reads differently from the action `recommendation`.
        for lever in Lever:
            self.assertTrue(levers.meaning(lever))
            self.assertNotEqual(levers.meaning(lever), levers.recommendation(lever))

    def test_existing_accessors_are_unshifted(self):
        # appending `meaning` at index 3 must not move title/exposure/recommendation.
        self.assertEqual(levers.title(Lever.CARB_UNDERCOUNT), "Carb undercount")
        self.assertEqual(levers.exposure(Lever.CARB_UNDERCOUNT), Exposure.MEALS)
        self.assertIn("undercounted", levers.recommendation(Lever.CARB_UNDERCOUNT))
        self.assertEqual(levers.LEVER_EXPOSURE[Lever.OVER_TREATED_LOW], Exposure.LOWS)


class BuildCatalogTest(unittest.TestCase):
    def setUp(self):
        self.cat = build_catalog()

    def test_the_catalog_joins_no_clauses_with_an_em_dash(self):
        # ADR 451: the Guide prints this payload's strings (every lever's meaning
        # and recommendation, the pipeline, the silence reasons, the worked
        # example), so none joins its clauses with an em dash (DESIGN.md, Voice
        # and user-copy register, rule 1).
        def strings(node):
            if isinstance(node, str):
                yield node
            elif isinstance(node, dict):
                for value in node.values():
                    yield from strings(value)
            elif isinstance(node, (list, tuple)):
                for value in node:
                    yield from strings(value)

        served = list(strings(self.cat))
        self.assertTrue(any(text == levers.recommendation(Lever.LATE_BOLUS)
                            for text in served))
        for text in served:
            self.assertNotIn("—", text)

    def test_top_level_shape(self):
        for key in ("engine", "pipeline", "exposures", "levers",
                    "silence_reasons", "tiers", "worked"):
            self.assertIn(key, self.cat)

    def test_levers_are_generated_from_meta_in_enum_order(self):
        self.assertEqual([l["value"] for l in self.cat["levers"]],
                         [l.value for l in Lever])
        first = self.cat["levers"][0]
        self.assertEqual(first["title"], levers.title(Lever.CARB_UNDERCOUNT))
        self.assertEqual(first["meaning"], levers.meaning(Lever.CARB_UNDERCOUNT))
        self.assertEqual(first["recommendation"], levers.recommendation(Lever.CARB_UNDERCOUNT))
        self.assertEqual(first["exposure"], Exposure.MEALS.value)

    def test_silence_reasons_enumerate_the_closed_taxonomy(self):
        self.assertEqual([s["value"] for s in self.cat["silence_reasons"]],
                         [s.value for s in SilenceReason])
        values = {s["value"] for s in self.cat["silence_reasons"]}
        self.assertIn(SilenceReason.OWNED_BY_PRIOR_BOLUS.value, values)
        self.assertIn(SilenceReason.OWNED_BY_ANNOUNCED_MEAL.value, values)
        # each carries a real evidence tier.
        tiers = {t.value for t in EvidenceTier}
        for s in self.cat["silence_reasons"]:
            self.assertIn(s["tier"], tiers)
            self.assertTrue(s["body"])

    def test_stayed_in_range_is_the_ninth_calm_reason(self):
        # ADR 461: a late meal that never went above the range line is calm.
        self.assertEqual(len(self.cat["silence_reasons"]), 9)
        stayed = next(s for s in self.cat["silence_reasons"] if s["value"] == "stayed_in_range")
        self.assertEqual((stayed["label"], stayed["tier"]), ("Stayed in range", "observed"))
        self.assertEqual(
            stayed["body"],
            "Glucose rose before the bolus but never went above the range line afterwards, "
            "so there was no spike for an earlier bolus to blunt.")

    def test_upstream_cause_names_both_of_its_sources(self):
        # ADR 448: the context gate's recent low or suspend, and an
        # over-treated low's rebound that owns the rise (ADR 422).
        upstream = next(s for s in self.cat["silence_reasons"]
                        if s["value"] == SilenceReason.UPSTREAM_CAUSE.value)
        self.assertEqual(
            upstream["body"],
            "An observable recent low and/or a defensive suspend explains the move, or "
            "the rise is the rebound of an over-treated low, which owns it. A recovery, "
            "not the behavior itself.")

    def test_tiers_and_exposures_enumerate_their_enums(self):
        self.assertEqual([t["value"] for t in self.cat["tiers"]],
                         [t.value for t in EvidenceTier])
        self.assertEqual([e["value"] for e in self.cat["exposures"]],
                         [e.value for e in Exposure])

    def test_every_lever_exposure_resolves_to_a_denominator(self):
        exp_values = {e["value"] for e in self.cat["exposures"]}
        for l in self.cat["levers"]:
            self.assertIn(l["exposure"], exp_values)

    def test_worked_example_walks_the_pipeline(self):
        worked = self.cat["worked"]
        for key in ("episode", "steps", "verdict", "pattern"):
            self.assertIn(key, worked)
        # the verdict resolves on the Lever stage; the pattern is its own stage.
        self.assertEqual(worked["verdict"]["stage"], "Lever")
        self.assertEqual(worked["pattern"]["stage"], "Pattern")
        stages = [s["stage"] for s in worked["steps"]]
        self.assertEqual(stages, ["Anchor", "Episode", "Lever"])


if __name__ == "__main__":
    unittest.main()


class SequenceCatalogContractTest(unittest.TestCase):
    def test_sequence_habits_keep_meals_affinity_and_sequence_recurrence(self):
        from ciq_autotune.analyzers.scenario.evidence_population import policy_for
        catalog = {row["value"]: row for row in build_catalog()["levers"]}
        for value, expected_title in (("high_carb_sequence", "High-carb sequence"),
                                      ("repeat_eating", "Repeat eating")):
            lever = Lever(value)
            self.assertEqual(catalog[value]["title"], expected_title)
            self.assertEqual(catalog[value]["exposure"], "meals")
            self.assertEqual(levers.outcome_kind(lever), "sequence")
            self.assertEqual(policy_for(lever).recurrence_noun, "sequences")
            self.assertIsNone(policy_for(lever).recurrence_family)
