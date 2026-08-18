"""Block-scoped I:C Trial identity, matching, and cohort binding (#581).

ADR 581 amends ADR 579 §5: a block-scoped I:C change is admitted to the Verify
roster only when the pump-observed schedule change *uniquely* matches one complete
annotated applied Plan group (the ``ic_block_provenance`` slice 1 stamps onto every
staged member). These tests drive the one public interface — ``review_trials`` /
``GET /verify/trials`` — on fixtures built to the real event and provenance shapes.
Nothing hand-sets a Trial: admission, rejection, and cohort all fall out of a real
observed change matched against a real applied group.
"""

import tempfile
import unittest
from datetime import datetime, timedelta

try:
    from fastapi.testclient import TestClient
except ImportError:  # pragma: no cover
    TestClient = None

from ciq_autotune.api import create_app
from ciq_autotune.settings import ProfileSegment, ProfileSettings, PumpSettings
from ciq_autotune.store import Store
from ciq_autotune.watched_change import review_trials

BASE = datetime(2026, 6, 1)
SWITCH = datetime(2026, 6, 5, 9)
NOW = datetime(2026, 6, 12, 23, 30)


def _meal_at(day_offset, hour):
    """A wall-clock instant ``hour`` on the day ``day_offset`` days after the switch.

    Anchored at midnight so ``hour`` is a real clock hour (13:00 lands in the
    12:00–15:00 block), not an offset from the 09:00 switch instant.
    """
    day = (SWITCH + timedelta(days=day_offset)).date()
    return datetime(day.year, day.month, day.day) + timedelta(hours=hour)


def _profile(idp, ic_segments):
    """A profile whose carb-ratio schedule is ``[(start_min, ic), ...]``.

    Basal/ISF/target are held constant so the only observable move is I:C.
    """
    segments = tuple(ProfileSegment(start, 0.6, 40, ic, 110) for start, ic in ic_segments)
    return ProfileSettings(idp=idp, name=str(idp), dia_min=300, carb_entry=True,
                           max_bolus=15.0, segments=segments)


def _annotated_items(block, members, current, value):
    provenance = {"block_start_min": block[0], "block_end_min": block[1],
                  "block_member_start_mins": list(members)}
    return [{"type": "ic", "start_min": start, "value": value, "current": current,
             "ic_block_provenance": provenance} for start in members]


def _apply(store, applied_at, block, members, current, value):
    store.save_plan_draft(_annotated_items(block, members, current, value), applied_at)
    store.apply_plan(applied_at)


def _meals(store, when_iter, seq_base, *, carb_ratio=5.0):
    """Dose-stamped meals, each carrying the I:C the pump would actually report.

    ``carb_ratio`` defaults to the pre-switch value (5.0) for out-of-block or
    pre-switch callers, but a post-switch in-block meal reports the pump's *current*
    ratio, not a frozen 5.0 — stamping every row at 5.0 regardless of the switch made
    `dose_regimes` see a constant series and never form a candidate, leaving finding
    1's suppression-ordering rule (#463) untestable through these fixtures.
    """
    rows = []
    for i, at in enumerate(when_iter):
        rows.append({
            "seq_num": seq_base + i,
            "request_time": at.strftime("%Y-%m-%d %H:%M:%S"),
            "completion_time": at.strftime("%Y-%m-%d %H:%M:%S"),
            "description": "Bolus", "completion": "Completed",
            "insulin": 4.0, "carbs": 45.0, "isf": 40, "carb_ratio": carb_ratio,
            "target_bg": 110,
        })
    store.upsert_bolus(rows)


def _cgm_span(store, start, end):
    rows, t = [], start
    while t < end:
        rows.append({"EventDateTime": t.strftime("%Y-%m-%dT%H:%M:%S"),
                     "Readings (CGM / BGM)": 120, "Description": "EGV"})
        t += timedelta(minutes=30)
    store.upsert_cgm(rows)


# Two profiles that split the 12:00–15:00 block at 13:00 (a redundant internal
# member boundary: the value is identical on both halves), the pinned #581 shape.
_OLD_IC = ((0, 5.0),)
_NEW_IC = ((0, 5.0), (720, 4.4), (780, 4.4), (900, 5.0))
_BLOCK = (720, 900)
_MEMBERS = [720, 780]


class BlockIcAdmissionTest(unittest.TestCase):
    @unittest.skipUnless(TestClient is not None, "api extra not installed")
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        with Store.open(self.tmp.name):
            pass
        self.client = TestClient(create_app(
            db_path=self.tmp.name, token=None, enable_fetch_loop=False))

    def tearDown(self):
        self.tmp.close()

    def _roster(self):
        return self.client.get("/verify/trials", params={"window": 14}).json()

    def _detail(self, trial_id):
        return self.client.get(
            "/verify/trials", params={"window": 14, "selected": trial_id},
        ).json()["selected"]

    def test_duplicate_and_switch_admits_one_block_trial(self):
        old, new = _profile(1, _OLD_IC), _profile(2, _NEW_IC)
        with Store.open(self.tmp.name) as store:
            store.upsert_settings_snapshot("2026-06-04 09:00:00", PumpSettings(1, (old, new)))
            store.upsert_settings_snapshot(
                SWITCH.strftime("%Y-%m-%d %H:%M:%S"), PumpSettings(2, (old, new)))
            _apply(store, "2026-06-04 08:00:00", _BLOCK, _MEMBERS, 5.0, 4.4)
            _cgm_span(store, SWITCH - timedelta(days=14), NOW)
            # In-block, post-switch: the pump is already on the new ratio (#581
            # finding 2 — stamping these at the pre-switch 5.0 made `dose_regimes`
            # see a constant series and left finding 1's suppression rule untested).
            _meals(store, [_meal_at(d, 13) for d in range(1, 6)], 3000, carb_ratio=4.4)

        self._assert_one_block_trial()

    def test_active_in_place_edit_admits_the_same_block_contract(self):
        # A single active profile whose midday I:C block is edited in place. The
        # changelog emits an in-place carb_ratio SettingChange on the active IDP.
        before, after = _profile(1, _OLD_IC), _profile(1, _NEW_IC)
        with Store.open(self.tmp.name) as store:
            store.upsert_settings_snapshot("2026-06-04 09:00:00", PumpSettings(1, (before,)))
            store.upsert_settings_snapshot(
                SWITCH.strftime("%Y-%m-%d %H:%M:%S"), PumpSettings(1, (after,)))
            _apply(store, "2026-06-04 08:00:00", _BLOCK, _MEMBERS, 5.0, 4.4)
            _cgm_span(store, SWITCH - timedelta(days=14), NOW)
            _meals(store, [_meal_at(d, 13) for d in range(1, 6)], 3000, carb_ratio=4.4)

        self._assert_one_block_trial()

    def _assert_one_block_trial(self):
        roster = self._roster()
        self.assertEqual(len(roster["trials"]), 1)
        summary = roster["trials"][0]
        self.assertEqual(summary["parameter"], "carb_ratio")
        self.assertEqual(summary["slot"], "12:00")
        self.assertEqual((summary["before"], summary["after"]), (5.0, 4.4))
        # The Before/Trial boundary is the snapshot instant, not the apply time.
        self.assertEqual(summary["changed_at"], "2026-06-05 09:00:00")

        detail = self._detail(summary["id"])
        self.assertEqual(detail["meal_arcs"]["block"], [720, 900])
        self.assertNotIn("limitation", detail)

    def test_late_dose_observation_of_switch_value_does_not_spawn_a_second_trial(self):
        # #463 / finding 1: `_review_candidates` must match a raw dose-observed
        # candidate against the block switch BEFORE dropping the slot-scoped I:C
        # switch from the roster, or a late in-block meal reporting the switch's own
        # new value resurrects it as a second, whole-parameter Trial instead of being
        # recognised as corroborating evidence for the one block-scoped Trial.
        old, new = _profile(1, _OLD_IC), _profile(2, _NEW_IC)
        with Store.open(self.tmp.name) as store:
            store.upsert_settings_snapshot("2026-06-04 09:00:00", PumpSettings(1, (old, new)))
            store.upsert_settings_snapshot(
                SWITCH.strftime("%Y-%m-%d %H:%M:%S"), PumpSettings(2, (old, new)))
            _apply(store, "2026-06-04 08:00:00", _BLOCK, _MEMBERS, 5.0, 4.4)
            _cgm_span(store, SWITCH - timedelta(days=14), NOW)
            # Two settled pre-switch days at the old ratio, then a settled post-switch
            # run at the new one — the exact 5.0→4.4 move the block switch carries —
            # so `dose_regimes` forms a real raw candidate for the switch to suppress.
            _meals(store, [_meal_at(d, 13) for d in range(-2, 0)], 2000, carb_ratio=5.0)
            _meals(store, [_meal_at(d, 13) for d in range(1, 6)], 3000, carb_ratio=4.4)

        roster = self._roster()
        self.assertEqual(len(roster["trials"]), 1)
        self.assertEqual(roster["trials"][0]["slot"], "12:00")

    def test_revert_stages_every_member_of_a_two_member_block(self):
        # Finding 3: `_prior_plan_route` must consume the Trial's captured member
        # starts, not just its lead slot label — reverting the pinned two-member
        # 720/780 block must stage BOTH boundaries at the prior value, or a Revert
        # leaves the pump split between the old and new I:C mid-block.
        old, new = _profile(1, _OLD_IC), _profile(2, _NEW_IC)
        with Store.open(self.tmp.name) as store:
            store.upsert_settings_snapshot("2026-06-04 09:00:00", PumpSettings(1, (old, new)))
            store.upsert_settings_snapshot(
                SWITCH.strftime("%Y-%m-%d %H:%M:%S"), PumpSettings(2, (old, new)))
            _apply(store, "2026-06-04 08:00:00", _BLOCK, _MEMBERS, 5.0, 4.4)
            _cgm_span(store, SWITCH - timedelta(days=14), NOW)

        roster = self._roster()
        self.assertEqual(len(roster["trials"]), 1)
        detail = self._detail(roster["trials"][0]["id"])
        self.assertEqual(detail["plan_route"], {
            "mode": "stage-prior",
            "label": "Prior setting ready for Plan",
            "draft": {
                "items": [
                    {"type": "ic", "start_min": 720, "value": 5.0},
                    {"type": "ic", "start_min": 780, "value": 5.0},
                ],
            },
            "message": (
                "The prior setting is staged for manual pump programming. After programming, "
                "confirm it with a fresh pump snapshot in Plan."
            ),
        })

    def test_only_inactive_profile_change_admits_no_block_trial(self):
        # snap2 edits the INACTIVE idp2; the active idp1 is unchanged. Even with a
        # seemingly matching applied group, no block-scoped roster entry appears.
        active = _profile(1, _OLD_IC)
        inactive_old, inactive_new = _profile(2, _OLD_IC), _profile(2, _NEW_IC)
        with Store.open(self.tmp.name) as store:
            store.upsert_settings_snapshot(
                "2026-06-04 09:00:00", PumpSettings(1, (active, inactive_old)))
            store.upsert_settings_snapshot(
                SWITCH.strftime("%Y-%m-%d %H:%M:%S"), PumpSettings(1, (active, inactive_new)))
            _apply(store, "2026-06-04 08:00:00", _BLOCK, _MEMBERS, 5.0, 4.4)
            _cgm_span(store, SWITCH - timedelta(days=14), NOW)

        self.assertEqual(self._roster(), {"trials": [], "selected": None})

    def test_change_that_misses_a_member_is_rejected(self):
        # The observed change moves only the first half of the arc, leaving the
        # 13:00–15:00 member's interval unchanged, so no group matches (fail closed).
        old = _profile(1, _OLD_IC)
        partial = _profile(2, ((0, 5.0), (720, 4.4), (780, 5.0), (900, 5.0)))
        with Store.open(self.tmp.name) as store:
            store.upsert_settings_snapshot("2026-06-04 09:00:00", PumpSettings(1, (old, partial)))
            store.upsert_settings_snapshot(
                SWITCH.strftime("%Y-%m-%d %H:%M:%S"), PumpSettings(2, (old, partial)))
            _apply(store, "2026-06-04 08:00:00", _BLOCK, _MEMBERS, 5.0, 4.4)
            _cgm_span(store, SWITCH - timedelta(days=14), NOW)

        self.assertEqual(self._roster(), {"trials": [], "selected": None})

    def test_change_matched_by_two_annotated_groups_is_rejected(self):
        # Two distinct complete annotated applied groups — same bounds, members,
        # and values, applied at two different instants within the 3-day
        # tolerance of the snapshot — both match the one observed change. The
        # match is ambiguous, so it fails closed (no block-scoped roster entry),
        # exercising the len(matches) == 1 branch in _match_unique_group.
        old, new = _profile(1, _OLD_IC), _profile(2, _NEW_IC)
        with Store.open(self.tmp.name) as store:
            store.upsert_settings_snapshot("2026-06-04 09:00:00", PumpSettings(1, (old, new)))
            store.upsert_settings_snapshot(
                SWITCH.strftime("%Y-%m-%d %H:%M:%S"), PumpSettings(2, (old, new)))
            _apply(store, "2026-06-04 08:00:00", _BLOCK, _MEMBERS, 5.0, 4.4)
            _apply(store, "2026-06-04 08:30:00", _BLOCK, _MEMBERS, 5.0, 4.4)
            _cgm_span(store, SWITCH - timedelta(days=14), NOW)

        self.assertEqual(self._roster(), {"trials": [], "selected": None})

    def test_change_that_also_moves_ic_outside_the_arc_is_rejected(self):
        # The whole arc moves 5.0→4.4 (a match on its own) but the evening block
        # 15:00–18:00 also moves, so an out-of-arc interval changed → rejected.
        old = _profile(1, _OLD_IC)
        spilled = _profile(2, ((0, 5.0), (720, 4.4), (780, 4.4), (900, 4.4), (1080, 5.0)))
        with Store.open(self.tmp.name) as store:
            store.upsert_settings_snapshot("2026-06-04 09:00:00", PumpSettings(1, (old, spilled)))
            store.upsert_settings_snapshot(
                SWITCH.strftime("%Y-%m-%d %H:%M:%S"), PumpSettings(2, (old, spilled)))
            _apply(store, "2026-06-04 08:00:00", _BLOCK, _MEMBERS, 5.0, 4.4)
            _cgm_span(store, SWITCH - timedelta(days=14), NOW)

        self.assertEqual(self._roster(), {"trials": [], "selected": None})


class BlockIcIdentityAndCohortTest(unittest.TestCase):
    """Trial-owned captured identity/cohort, driven through ``review_trials``."""

    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        with Store.open(self.tmp.name):
            pass

    def tearDown(self):
        self.tmp.close()

    def _selected(self, store):
        roster = review_trials(store, now=NOW, window_days=14)
        block = next(t for t in roster["trials"] if t["slot"] is not None)
        detail = review_trials(store, now=NOW, window_days=14,
                               selected=block["id"])["selected"]
        return block, detail

    def test_later_repartition_without_a_group_cannot_retarget_the_trial(self):
        # T1 is corroborated at the 2026-06-05 snapshot. A later snapshot moves the
        # I:C segment (a repartition) but no new group corroborates it — T1's ID,
        # arc, and before/after stay pinned to its captured provenance.
        old, new = _profile(1, _OLD_IC), _profile(2, _NEW_IC)
        moved = _profile(3, ((0, 5.0), (600, 4.4), (900, 5.0)))  # block now 10:00–15:00
        with Store.open(self.tmp.name) as store:
            store.upsert_settings_snapshot("2026-06-04 09:00:00", PumpSettings(1, (old, new, moved)))
            store.upsert_settings_snapshot(
                SWITCH.strftime("%Y-%m-%d %H:%M:%S"), PumpSettings(2, (old, new, moved)))
            _apply(store, "2026-06-04 08:00:00", _BLOCK, _MEMBERS, 5.0, 4.4)
            _cgm_span(store, SWITCH - timedelta(days=14), NOW)
            _meals(store, [_meal_at(d, 13) for d in range(1, 5)], 3000, carb_ratio=4.4)
            before_block, before_detail = self._selected(store)

            # A later repartition snapshot on 2026-06-09 with no corroborating group.
            store.upsert_settings_snapshot(
                "2026-06-09 09:00:00", PumpSettings(3, (old, new, moved)))
            after_block, after_detail = self._selected(store)
            # Still exactly one block-scoped Trial — the repartition spawned none.
            after_roster = review_trials(store, now=NOW, window_days=14)

        self.assertEqual(after_block["id"], before_block["id"])
        self.assertEqual(after_block["changed_at"], "2026-06-05 09:00:00")
        self.assertEqual(after_detail["meal_arcs"]["block"], [720, 900])
        self.assertEqual((after_block["before"], after_block["after"]), (5.0, 4.4))
        self.assertEqual(
            sum(1 for t in after_roster["trials"] if t["slot"] is not None), 1)

    def test_later_repartition_matching_a_different_group_creates_its_own_trial(self):
        # Acceptance criterion 16's untested half: a later repartition may create
        # its OWN Trial when it uniquely matches a DIFFERENT complete annotated
        # applied group. Unlike the "no group" sibling above, T2 here IS uniquely
        # corroborated — a distinct 05:00-07:00 block, disjoint from T1's
        # 12:00-15:00 — so it must be admitted as its own Trial with its own id and
        # bounds, while T1's id and bounds stay exactly what its own group captured.
        old = _profile(1, _OLD_IC)
        mid = _profile(2, _NEW_IC)  # T1: 12:00-15:00 moves 5.0->4.4
        later = _profile(3, (
            (0, 5.0), (300, 4.0), (420, 5.0), (720, 4.4), (780, 4.4), (900, 5.0),
        ))  # T2 on top of T1: 05:00-07:00 also moves 5.0->4.0
        second_switch = SWITCH + timedelta(days=4)
        second_block, second_members = (300, 420), [300]
        with Store.open(self.tmp.name) as store:
            store.upsert_settings_snapshot(
                "2026-06-04 09:00:00", PumpSettings(1, (old, mid, later)))
            store.upsert_settings_snapshot(
                SWITCH.strftime("%Y-%m-%d %H:%M:%S"), PumpSettings(2, (old, mid, later)))
            _apply(store, "2026-06-04 08:00:00", _BLOCK, _MEMBERS, 5.0, 4.4)
            store.upsert_settings_snapshot(
                second_switch.strftime("%Y-%m-%d %H:%M:%S"), PumpSettings(3, (old, mid, later)))
            _apply(store, (second_switch - timedelta(hours=1)).strftime("%Y-%m-%d %H:%M:%S"),
                  second_block, second_members, 5.0, 4.0)
            _cgm_span(store, SWITCH - timedelta(days=14), NOW)

            roster = review_trials(store, now=NOW, window_days=14)

        block_trials = sorted(
            (t for t in roster["trials"] if t["slot"] is not None),
            key=lambda t: t["changed_at"],
        )
        self.assertEqual(len(block_trials), 2)
        first, second = block_trials
        self.assertEqual(first["slot"], "12:00")
        self.assertEqual((first["before"], first["after"]), (5.0, 4.4))
        self.assertEqual(first["changed_at"], "2026-06-05 09:00:00")
        self.assertEqual(second["slot"], "05:00")
        self.assertEqual((second["before"], second["after"]), (5.0, 4.0))
        self.assertEqual(second["changed_at"], second_switch.strftime("%Y-%m-%d %H:%M:%S"))
        self.assertNotEqual(first["id"], second["id"])

    def _seed_cohort(self, meal_hours):
        old, new = _profile(1, _OLD_IC), _profile(2, _NEW_IC)
        with Store.open(self.tmp.name) as store:
            store.upsert_settings_snapshot("2026-06-04 09:00:00", PumpSettings(1, (old, new)))
            store.upsert_settings_snapshot(
                SWITCH.strftime("%Y-%m-%d %H:%M:%S"), PumpSettings(2, (old, new)))
            _apply(store, "2026-06-04 08:00:00", _BLOCK, _MEMBERS, 5.0, 4.4)
            _cgm_span(store, SWITCH - timedelta(days=14), NOW)
            meals = [_meal_at(d, h) for d in range(1, 5) for h in meal_hours]
            _meals(store, meals, 3000)

    def test_out_of_block_meals_accrue_nothing_and_one_in_block_meal_advances_all(self):
        # Only 08:00 meals — outside the 12:00–15:00 arc.
        self._seed_cohort(meal_hours=[8])
        with Store.open(self.tmp.name) as store:
            block, detail = self._selected(store)
            self.assertEqual(block["maturing"]["days_elapsed"], 0)
            self.assertGreater(block["maturing"]["gap_count"], 0)
            self.assertEqual(detail["meal_arcs"]["trial_period"]["n_meals"], 0)
            arc = next(e for e in detail["evidence"] if e["key"] == "arc")
            self.assertEqual(arc["trial"]["n_peak"], 0)
            self.assertEqual(arc["rescue_context"]["count"], 0)
            baseline_gap = block["maturing"]["gap_count"]

        # Add one in-block (13:00) meal on the first post-change day.
        with Store.open(self.tmp.name) as store:
            _meals(store, [_meal_at(1, 13)], 9000, carb_ratio=4.4)
            block, detail = self._selected(store)
            self.assertEqual(block["maturing"]["days_elapsed"], 1)
            self.assertEqual(block["maturing"]["gap_count"], baseline_gap - 1)
            self.assertEqual(detail["meal_arcs"]["trial_period"]["n_meals"], 1)


class RevertDraftStaysValidTest(unittest.TestCase):
    """The Revert route's unannotated single-row draft still saves and applies."""

    @unittest.skipUnless(TestClient is not None, "api extra not installed")
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        with Store.open(self.tmp.name):
            pass
        self.client = TestClient(create_app(
            db_path=self.tmp.name, token=None, enable_fetch_loop=False))

    def tearDown(self):
        self.tmp.close()

    def test_prior_plan_route_revert_draft_saves_and_applies(self):
        # The unannotated single-row Revert draft _prior_plan_route emits (#581 keeps
        # it valid and unannotated) round-trips through save → apply → history.
        draft = {"items": [{"type": "ic", "start_min": 720, "value": 5.0}]}
        save = self.client.put("/plan", json=draft)
        self.assertEqual(save.status_code, 200)
        apply = self.client.post("/plan/apply")
        self.assertEqual(apply.status_code, 200)
        with Store.open(self.tmp.name) as store:
            history = store.plan_history()
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["items"], draft["items"])
        self.assertNotIn("ic_block_provenance", history[0]["items"][0])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
