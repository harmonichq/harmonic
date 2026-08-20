"""The Diagnose findings queue's server-owned window projection (#730).

Everything here goes through the public interface — ``FindingsProjection.project``
and ``GET /diagnose/findings`` — over the committed generator's own inputs, so a test
can never encode a verdict the engines did not produce (the #273/#465 lesson: the
fixture that hand-sets the predicate under test stays green while the product is
wrong).
"""

import importlib.util
import pathlib
import tempfile
import unittest

try:
    from fastapi.testclient import TestClient
    _HAS_FASTAPI = True
except ImportError:  # pragma: no cover
    _HAS_FASTAPI = False

from ciq_autotune.analyzers.scenario.levers import Lever, outcome_kind
from ciq_autotune.findings_projection import (
    FindingsProjection,
    WindowQuery,
    prepare_findings_projection,
)
from ciq_autotune.safety import Status

_GEN_PATH = (pathlib.Path(__file__).resolve().parents[1]
             / "scripts" / "gen_findings_projection_fixtures.py")
_spec = importlib.util.spec_from_file_location("gen_findings_projection_fixtures",
                                               _GEN_PATH)
gen = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gen)

LOW_BLOCK = (12 * 60, 14 * 60)
REBOUND = (14 * 60, 16 * 60)
MORNING = (4 * 60 + 30, 8 * 60)
AFTERNOON = (14 * 60, 21 * 60)


def _titles(rows, register):
    return [row["title"] for row in rows if row["register"] == register]


def _row(rows, title):
    return next(row for row in rows if row["title"] == title)


class OutcomeAnchoredMembershipTest(unittest.TestCase):
    """Term 39 / D34: a finding sits where its consequence landed, never where its
    trigger crossed a threshold."""

    def setUp(self):
        self.projection = gen.projection()
        self.exposures = gen.exposures()["exposures"]

    def _lows_occurrence(self):
        return next(o for o in self.exposures["lows"]["occurrences"]
                    if o["cause_lever"] == Lever.OVER_TREATED_LOW.value)

    def test_the_trigger_really_does_sit_inside_the_low_window(self):
        # The premise of the next test: anchoring on the stored occurrence time —
        # what the frontend used to do — WOULD put this finding in the low window.
        stamp = self._lows_occurrence()["t"]
        trigger = int(stamp[11:13]) * 60 + int(stamp[14:16])
        self.assertTrue(LOW_BLOCK[0] <= trigger < LOW_BLOCK[1],
                        f"the low fires at {stamp}, inside the drawn low block")

    def test_a_window_over_the_low_block_excludes_over_treated_low(self):
        rows = self.projection.project(WindowQuery.clock(*LOW_BLOCK))["rows"]
        self.assertNotIn("Over-treated low", _titles(rows, "finding"))

    def test_the_window_over_the_rebound_includes_it(self):
        rows = self.projection.project(WindowQuery.clock(*REBOUND))["rows"]
        self.assertIn("Over-treated low", _titles(rows, "finding"))

    def test_trigger_anchoring_would_fail_this(self):
        # The falsification: strip the per-lever outcome declaration and the
        # projection falls back to each occurrence's own instant — trigger
        # anchoring — which puts the finding right back in the low block. This test
        # is what stops the anchoring rule from being quietly removed.
        from unittest.mock import patch

        import ciq_autotune.findings_projection as module

        with patch.object(module, "outcome_kind", lambda lever: None):
            rows = self.projection.project(WindowQuery.clock(*LOW_BLOCK))["rows"]
        self.assertIn("Over-treated low", _titles(rows, "finding"))

    def test_the_rebound_is_where_the_high_anchor_sits_not_the_low(self):
        rebound = next(o for o in self.exposures["highs"]["occurrences"]
                       if o["cause_lever"] == Lever.OVER_TREATED_LOW.value)
        self.assertEqual(rebound["ep_id"], self._lows_occurrence()["ep_id"])
        minute = int(rebound["t"][11:13]) * 60 + int(rebound["t"][14:16])
        self.assertTrue(REBOUND[0] <= minute < REBOUND[1])

    def test_every_lever_declares_where_its_consequence_lands(self):
        # The closed set stays closed: a new lever has to answer the anchoring
        # question rather than silently falling back to its trigger.
        for lever in Lever:
            self.assertIn(outcome_kind(lever), {"low", "high", "meal", "correction"},
                          f"{lever.value} declares no outcome anchor")

    def test_a_family_denominator_never_undercounts_what_it_denominates(self):
        for bounds in (None, LOW_BLOCK, REBOUND, MORNING, AFTERNOON, (22 * 60, 2 * 60)):
            query = (WindowQuery.whole_day() if bounds is None
                     else WindowQuery.clock(*bounds))
            for row in self.projection.project(query)["rows"]:
                for appearance in row["appearances"] or []:
                    self.assertLessEqual(appearance["n"], appearance["m"],
                                         f"{row['title']} in {bounds}")


class GroundedWindowTest(unittest.TestCase):
    """The 2026-08-17-shaped reading, window by window."""

    def setUp(self):
        self.projection = gen.projection()

    def test_the_morning_window_asserts_one_slot_and_holds_the_next(self):
        rows = self.projection.project(WindowQuery.clock(*MORNING))["rows"]
        self.assertEqual(_titles(rows, "assert"), ["Basal 05:30 · raise"])
        held = _row(rows, "Basal 06:30 · leaning raise")
        self.assertEqual(held["register"], "held")
        self.assertEqual(held["reason"], str(Status.INSUFFICIENT))
        self.assertEqual(held["reason"], "insufficient evidence")

    def test_the_afternoon_window_shows_the_blind_stretch_and_a_held_isf(self):
        rows = self.projection.project(WindowQuery.clock(*AFTERNOON))["rows"]
        blind = _row(rows, "Basal 19:30 to 21:00")
        self.assertEqual(blind["register"], "blind")
        self.assertEqual(blind["reason"], str(Status.NO_DATA))
        self.assertEqual(blind["support"]["n"], 0)
        isf = _row(rows, "ISF")
        self.assertEqual(isf["register"], "held")
        self.assertIsNone(isf["direction"])

    def test_a_held_reason_is_the_analyzers_own_string(self):
        # Byte-identical, both flavors: the queue transcribes, it never rewords.
        analysis = self.projection._analysis
        rows = self.projection.project(WindowQuery.clock(*AFTERNOON))["rows"]
        self.assertEqual(_row(rows, "ISF")["reason"], analysis["isf"][0]["annotation"])
        blind_slot = next(s for s in analysis["basal"] if s["slot"] == 39)
        self.assertEqual(_row(rows, "Basal 19:30 to 21:00")["reason"],
                         blind_slot["safety_status"])

    def test_a_window_can_hold_nothing_at_all(self):
        empty = gen.empty_projection().project(WindowQuery.clock(*MORNING))
        self.assertEqual(empty["rows"], [])
        self.assertEqual(empty["counts"],
                         {"assert": 0, "held": 0, "blind": 0, "finding": 0})

    def test_a_window_wrapping_midnight_reaches_both_sides_of_it(self):
        rows = self.projection.project(WindowQuery.clock(22 * 60, 2 * 60))["rows"]
        self.assertIn("Basal 00:30 to 01:30 · raise", _titles(rows, "assert"))
        self.assertIn("I:C 12:00 to 24:00 · lower", _titles(rows, "assert"))


class SpanMergingTest(unittest.TestCase):
    def setUp(self):
        self.projection = gen.projection()

    def test_contiguous_asserting_slots_are_one_span(self):
        rows = self.projection.project(WindowQuery.whole_day())["rows"]
        self.assertIn("Basal 00:30 to 01:30 · raise", _titles(rows, "assert"))
        span = _row(rows, "Basal 00:30 to 01:30 · raise")["span"]
        self.assertEqual((span["start_min"], span["end_min"]), (30, 90))

    def test_contiguous_held_slots_with_one_lean_are_one_span(self):
        rows = self.projection.project(WindowQuery.clock(*LOW_BLOCK))["rows"]
        held = _titles(rows, "held")
        self.assertIn("Basal 12:30 to 14:00 · leaning lower", held)
        self.assertEqual(len([t for t in held if t.startswith("Basal")]), 1)

    def test_a_span_never_mixes_directions(self):
        # Two adjacent held slots leaning opposite ways stay two rows.
        analysis = dict(gen.analysis())
        slots = {row["slot"]: row for row in analysis["basal"]}
        slots[20] = gen._slot(20, current=1.10, value=0.95, lo=0.80, hi=1.15,
                              n=18, supported=0).to_dict()
        slots[21] = gen._slot(21, current=0.90, value=1.15, lo=0.85, hi=1.40,
                              n=18, supported=0).to_dict()
        analysis["basal"] = [slots[index] for index in sorted(slots)]
        rows = FindingsProjection(
            _analysis=analysis, _exposures=gen.exposures(), _scenarios=gen.scenarios(),
        ).project(WindowQuery.clock(10 * 60, 11 * 60))["rows"]
        self.assertEqual(
            [row["lean"] for row in rows if row["title"].startswith("Basal")],
            ["lower", "raise"])

    def test_the_span_a_row_names_is_the_whole_run_not_the_visible_part(self):
        # A run is one item that stages whole (term 13), so a window that clips it
        # still names the run it really is.
        rows = self.projection.project(WindowQuery.clock(60, 75))["rows"]
        self.assertIn("Basal 00:30 to 01:30 · raise", _titles(rows, "assert"))


class QueueOrderTest(unittest.TestCase):
    def setUp(self):
        self.projection = gen.projection()
        self.global_rows = self.projection.project(WindowQuery.whole_day())["rows"]

    def test_the_global_queue_is_asserting_only(self):
        self.assertEqual(
            {row["register"] for row in self.global_rows}, {"assert", "finding"})
        quiet = [row for row in self.global_rows if row["register"] in ("held", "blind")]
        self.assertEqual(quiet, [])

    def test_priced_rows_lead_in_server_priority_order_then_counted_rows(self):
        priced = [row["priority"] for row in self.global_rows
                  if row["priority"] is not None]
        self.assertEqual(priced, sorted(priced, reverse=True))
        tail = self.global_rows[len(priced):]
        self.assertTrue(all(row["priority"] is None for row in tail))
        counts = [row["episodes"] for row in tail]
        self.assertEqual(counts, sorted(counts, reverse=True))

    def test_the_sorted_queue_publishes_its_three_closed_ranking_tiers(self):
        """The public projection names rank without inventing a headline (#41).

        Tiers are assigned only after this queue's server-owned sort: priorities
        decide which rows lead, but no first asserting row receives a stronger
        claim than the rest.
        """
        scoped_rows = self.projection.project(WindowQuery.clock(*AFTERNOON))["rows"]
        rows = self.global_rows + scoped_rows
        allowed = {"next_in_line", "worth_a_look", "noted"}
        self.assertEqual({row["tier"] for row in rows}, allowed)
        self.assertEqual(
            [row["tier"] for row in self.global_rows],
            ["next_in_line", "next_in_line", "next_in_line",
             "worth_a_look", "worth_a_look", "noted"],
        )
        self.assertEqual(
            {row["tier"] for row in rows if row["register"] == "assert"},
            {"next_in_line"},
        )
        self.assertTrue(all(
            row["tier"] == "noted" if row["priority"] is None
            else (row["tier"] == "next_in_line" if row["register"] == "assert"
                  else row["tier"] == "worth_a_look")
            for row in rows
        ))

    def test_the_order_is_the_servers_own_priorities_not_a_re_derivation(self):
        levers = {lever["parameter"]: lever["priority"]
                  for lever in self.projection._analysis["tuning_levers"]}
        patterns = {p["lever"]: p["priority"]
                    for p in self.projection._scenarios["patterns"]}
        for row in self.global_rows:
            if row["register"] == "assert":
                self.assertEqual(row["priority"], levers[row["parameter"]])
            elif row["priority"] is not None:
                self.assertEqual(row["priority"], patterns[row["lever"]])

    def test_held_and_blind_follow_the_ranked_head(self):
        rows = self.projection.project(WindowQuery.clock(*AFTERNOON))["rows"]
        order = {"assert": 0, "finding": 0, "held": 1, "blind": 2}
        ranks = [order[row["register"]] for row in rows]
        self.assertEqual(ranks, sorted(ranks))


class WindowQueryTest(unittest.TestCase):
    def test_a_window_must_span_some_part_of_the_day(self):
        with self.assertRaises(ValueError):
            WindowQuery.clock(600, 600)

    def test_bounds_are_minutes_on_the_clock(self):
        with self.assertRaises(ValueError):
            WindowQuery.clock(-30, 600)
        with self.assertRaises(ValueError):
            WindowQuery.clock(0, 1441)

    def test_the_whole_day_is_not_a_window(self):
        self.assertFalse(WindowQuery.whole_day().scoped)
        self.assertIsNone(WindowQuery.whole_day().to_dict()["label"])
        self.assertEqual(WindowQuery.clock(270, 480).to_dict()["label"], "04:30–08:00")


class PreparedFromStoreTest(unittest.TestCase):
    def test_an_empty_store_projects_an_empty_queue(self):
        from ciq_autotune.store import Store

        with tempfile.NamedTemporaryFile(suffix=".db") as db:
            with Store.open(db.name) as store:
                projection = prepare_findings_projection(store)
        result = projection.project(WindowQuery.whole_day())
        self.assertEqual(result["rows"], [])
        self.assertEqual(result["window"]["scoped"], False)
        self.assertEqual(result["findings_window"]["days"], 30)


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class FindingsEndpointTest(unittest.TestCase):
    def setUp(self):
        from ciq_autotune.api import create_app
        from tests.test_api import _seed

        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        _seed(self.tmp.name)
        self.client = TestClient(create_app(db_path=self.tmp.name, token=None,
                                            enable_fetch_loop=False))

    def tearDown(self):
        self.tmp.close()

    def test_the_global_queue_answers_without_a_window(self):
        r = self.client.get("/diagnose/findings")
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["schema"], "diagnose-findings-v1")
        self.assertFalse(body["window"]["scoped"])

    def test_a_clock_window_scopes_it(self):
        r = self.client.get("/diagnose/findings",
                            params={"start_min": 270, "end_min": 480})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["window"]["label"], "04:30–08:00")

    def test_half_a_window_is_a_bad_request(self):
        r = self.client.get("/diagnose/findings", params={"start_min": 270})
        self.assertEqual(r.status_code, 400)

    def test_a_zero_width_window_is_a_bad_request(self):
        r = self.client.get("/diagnose/findings",
                            params={"start_min": 600, "end_min": 600})
        self.assertEqual(r.status_code, 400)

    def test_it_answers_from_the_cache_and_a_write_invalidates_it(self):
        import ciq_autotune.api as api_mod
        from unittest.mock import patch

        real = api_mod.prepare_findings_projection
        calls = []

        def counting(*args, **kwargs):
            calls.append(1)
            return real(*args, **kwargs)

        with patch.object(api_mod, "prepare_findings_projection", counting):
            self.client.get("/diagnose/findings")                       # miss
            self.client.get("/diagnose/findings",
                            params={"start_min": 270, "end_min": 480})  # same read
            self.assertEqual(len(calls), 1)

            r = self.client.post("/carbs", json={
                "t": "2026-06-03 10:05:00", "grams": 8, "certainty": "exact"})
            self.assertEqual(r.status_code, 200)

            self.client.get("/diagnose/findings")                       # bumped
            self.assertEqual(len(calls), 2)


class FindingEvidenceBlockTest(unittest.TestCase):
    """ADR 41: the verdict band's split is the engine's own closed five-state
    taxonomy, published per finding row so the frontend composes nothing."""

    def setUp(self):
        self.exposures = gen.exposures()["exposures"]
        self.projection = gen.projection()
        self.rows = self.projection.project(WindowQuery.whole_day())["rows"]
        self.row = _row(self.rows, "Over-treated low")

    def test_a_near_miss_or_outranked_occurrence_carries_its_category_and_event_id(self):
        outranked = [e for e in self.row["evidence"] if e["verdict"] == "outranked"]
        self.assertTrue(outranked, "the fixture's over-treated low claims a family "
                                    "another episode also fired in")
        entry = outranked[0]
        self.assertIn("ep_id", entry)
        self.assertIsNotNone(entry["ep_id"])
        self.assertIn("t", entry)
        self.assertIn("date", entry)

    def test_verdict_counts_carries_all_five_categories_zeros_included(self):
        self.assertEqual(set(self.row["verdict_counts"]),
                         {"fired", "outranked", "near_miss", "no_data", "clean"})

    def test_verdict_counts_sums_to_the_appearances_denominator(self):
        total_m = sum(a["m"] for a in self.row["appearances"])
        self.assertEqual(sum(self.row["verdict_counts"].values()), total_m)
        self.assertEqual(len(self.row["evidence"]), total_m)

    def test_fired_count_is_at_least_the_appearances_numerator(self):
        # `appearances.n` counts only occurrences this row's lever WON
        # attribution on; `verdict_counts["fired"]` (finding 2) is broader —
        # row-relative, it also counts an occurrence where this lever's own
        # classifier matched but a DIFFERENT, earlier lever drove the episode
        # (ep11 below), so `fired >= n`, not `fired == n`. Equality is exactly
        # the pre-fix invariant this row-relative rule deliberately breaks.
        total_n = sum(a["n"] for a in self.row["appearances"])
        self.assertGreaterEqual(self.row["verdict_counts"]["fired"], total_n)

    def test_a_lever_that_matched_but_did_not_drive_still_reads_fired(self):
        # The distinguishing case (finding 2): this lever's own classifier
        # matched on an anchor another lever actually drove. The owner ruling
        # (ADR 41) — "the server has rule fired" — makes this row-relative `fired`
        # (Meets criteria), never `outranked`, even though the episode's
        # attribution credited someone else.
        matched_but_not_driver = [
            o for family in self.exposures.values() for o in family["occurrences"]
            if o.get("cause_lever") not in (None, "over_treated_low")
            and any(v["classifier"] == "over_treated_low" and v["matched"]
                    for v in o["verdicts"])
        ]
        self.assertTrue(matched_but_not_driver)
        for occ in matched_but_not_driver:
            entry = next(e for e in self.row["evidence"] if e["ep_id"] == occ["ep_id"]
                         and e["t"] == occ["t"])
            self.assertEqual(entry["verdict"], "fired")

    def test_an_occurrence_another_lever_actually_fired_is_outranked_here_not_fired(self):
        # An anchor that IS an episode's own driver reads "fired" at the anchor
        # level (ADR 0019 §2) — but if that lever isn't THIS row's lever, this
        # row must not claim it: it is claimed by another factor.
        other_fired = [e for e in self.row["evidence"]
                       if e["verdict"] == "outranked"
                       and any(o.get("ep_id") == e["ep_id"] and o.get("state") == "fired"
                               for family in self.exposures.values()
                               for o in family["occurrences"])]
        self.assertTrue(other_fired)

    def test_this_levers_own_classifier_matching_reads_fired_row_relative(self):
        # Finding 2: a row's own lever matching its own classifier is `fired`
        # (Meets criteria) whether or not it also drove the episode's
        # attribution — never re-derived from the anchor-level `state`.
        own_matches = [
            o for family in self.exposures.values() for o in family["occurrences"]
            if any(v["classifier"] == "over_treated_low" and v["matched"]
                   for v in o["verdicts"])
        ]
        self.assertTrue(own_matches)
        for occ in own_matches:
            entry = next(e for e in self.row["evidence"] if e["ep_id"] == occ["ep_id"]
                         and e["t"] == occ["t"])
            self.assertEqual(entry["verdict"], "fired")

    def test_all_five_verdict_categories_are_exercised_somewhere_nonzero(self):
        # Finding 3: the synthetic population must exercise every row-relative
        # category, not just fired/outranked/clean. `over_treated_low` is
        # inline attribution logic (model_view._low_verdicts) — it never
        # emits an explicit non-match verdict, so its row can never itself
        # read `clean` (finding 2 follow-up); `carb_undercount` DOES always
        # emit an explicit matched/not-matched verdict (`_meal_verdicts`), so
        # its row is where a genuine `clean` is exercised.
        counts = _row(self.rows, "Carb undercount")["verdict_counts"]
        for category in ("fired", "outranked", "near_miss", "no_data", "clean"):
            self.assertGreater(counts[category], 0, category)

    def test_no_verdict_entry_at_all_reads_no_data_never_clean(self):
        # Finding 2 follow-up: an occurrence this lever's classifier never
        # evaluated (no entry in `verdicts[]`) is not evidence of a calm
        # read — `clean` would assert a criterion failed that nothing ever
        # judged. `over_treated_low` is inline logic that never emits an
        # explicit non-match, so EVERY one of its non-driving, unattributed
        # occurrences must read `no_data`, never `clean`.
        no_verdict_entry = [
            o for o in self.exposures["lows"]["occurrences"] + self.exposures["highs"]["occurrences"]
            if o.get("cause_lever") is None
            and not any(v["classifier"] == "over_treated_low" for v in o["verdicts"])
        ]
        self.assertTrue(no_verdict_entry)
        for occ in no_verdict_entry:
            entry = next(e for e in self.row["evidence"] if e["ep_id"] == occ["ep_id"]
                         and e["t"] == occ["t"])
            self.assertEqual(entry["verdict"], "no_data")
        self.assertEqual(self.row["verdict_counts"]["clean"], 0,
                          "over_treated_low's row can never read clean: its classifier "
                          "never emits an explicit non-match verdict")

    def test_an_explicit_calm_verdict_reads_clean(self):
        # The mirror image of the above: a lever whose classifier DOES emit
        # an explicit non-match (a real matched=False verdict with a calm
        # silence reason) reads `clean`, not `no_data`.
        row = _row(self.rows, "Carb undercount")
        calm_occ = next(
            o for o in self.exposures["meals"]["occurrences"]
            if any(v["classifier"] == "carb_undercount" and not v["matched"]
                   and v["silence_reason"] in (None, "no_trigger") for v in o["verdicts"])
        )
        entry = next(e for e in row["evidence"] if e["ep_id"] == calm_occ["ep_id"]
                     and e["t"] == calm_occ["t"])
        self.assertEqual(entry["verdict"], "clean")

    def test_verdict_counts_by_family_shares_a_denominator_with_the_roster(self):
        # Finding 1: the band and the roster it scopes must agree on "N of M"
        # for the SAME family, not the row's cross-family total.
        by_family = self.row["verdict_counts_by_family"]
        self.assertEqual(set(by_family), {"lows", "highs"})
        for family, counts in by_family.items():
            family_m = sum(1 for e in self.row["evidence"] if e["family"] == family)
            self.assertEqual(sum(counts.values()), family_m)
        total = self.row["verdict_counts"]
        summed = {category: sum(counts[category] for counts in by_family.values())
                  for category in total}
        self.assertEqual(summed, total)

    def test_two_occurrences_sharing_an_ep_id_are_disambiguated_by_t(self):
        # Finding 4: `ep1` anchors twice (the low and its rebound high) and the
        # evidence rows must carry distinct clock keys so a `(family, ep_id)`
        # join can never silently collapse them onto one verdict.
        ep1_rows = [e for e in self.row["evidence"] if e["ep_id"] == "ep1"]
        self.assertEqual(len(ep1_rows), 2)
        self.assertEqual(len({e["t"] for e in ep1_rows}), 2)


if __name__ == "__main__":
    unittest.main()
