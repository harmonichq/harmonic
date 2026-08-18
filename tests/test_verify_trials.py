"""Public contract tests for the bounded derived Verify Trial roster (#587)."""

import tempfile
import unittest
from datetime import datetime, timedelta

try:
    from fastapi.testclient import TestClient
except ImportError:  # pragma: no cover - the core package stays stdlib-only
    TestClient = None

from ciq_autotune.api import create_app
from ciq_autotune.settings import ProfileSegment, ProfileSettings, PumpSettings
from ciq_autotune.store import Store


BASE = datetime(2026, 6, 1)


def _profile(idp, midday_ic):
    return ProfileSettings(
        idp=idp,
        name=str(idp),
        dia_min=300,
        carb_entry=True,
        max_bolus=15.0,
        segments=(
            ProfileSegment(0, 0.6, 40, 5.0, 110),
            ProfileSegment(720, 0.6, 40, midday_ic, 110),
            ProfileSegment(900, 0.6, 40, 5.0, 110),
        ),
    )


def _block_ic_settings(idp):
    return PumpSettings(
        active_idp=idp,
        profiles=(_profile(1, 5.0), _profile(2, 4.6)),
    )


def _apply_ic_block(store, applied_at, *, block, members, current, value):
    """Apply one complete annotated I:C block group to plan_history (#581).

    Mirrors the Diagnose-staged shape slice 1 stamps: every member row carries the
    identical ``ic_block_provenance`` and proposed value. This is the only thing
    that upgrades an observed block-scoped I:C change to a corroborated Trial.
    """
    provenance = {
        "block_start_min": block[0],
        "block_end_min": block[1],
        "block_member_start_mins": list(members),
    }
    items = [{
        "type": "ic", "start_min": start, "value": value, "current": current,
        "ic_block_provenance": provenance,
    } for start in members]
    store.save_plan_draft(items, applied_at)
    store.apply_plan(applied_at)


def _seed_maturing_block_ic_trial(path):
    """A PHI-safe, one-gap trial fixture with a block-scoped I:C change."""
    with Store.open(path) as store:
        store.upsert_settings_snapshot("2026-06-04 09:00:00", _block_ic_settings(1))
        store.upsert_settings_snapshot("2026-06-05 09:00:00", _block_ic_settings(2))
        # A complete annotated block group applied the day before the snapshot
        # boundary corroborates the observed 12:00–15:00 I:C move (#581). Apply time
        # only corroborates intent; the snapshot instant stays the Trial boundary.
        _apply_ic_block(store, "2026-06-04 08:00:00",
                        block=(720, 900), members=[720], current=5.0, value=4.6)
        boluses = []
        # Two pre-switch in-block meals dose-stamped at the old I:C (5.0), followed by
        # the post-switch meals stamped at the new value (4.6): the same 5.0→4.6 move
        # the block switch itself carries. This gives `dose_regimes` a real transition
        # to match against the (slot-scoped) switch candidate — without it, finding 1's
        # suppression-ordering bug (#463) is untestable, because a constant dose stream
        # never produces a raw candidate for the switch to wrongly fail to suppress.
        for day in (3, 4):
            at = BASE + timedelta(days=day - 1, hours=12)
            boluses.append({
                "seq_num": day,
                "request_time": at.strftime("%Y-%m-%d %H:%M:%S"),
                "completion_time": at.strftime("%Y-%m-%d %H:%M:%S"),
                "description": "Bolus",
                "completion": "Completed",
                "insulin": 4.0,
                "carbs": 40.0,
                "carb_ratio": 5.0,
            })
        for day in range(5, 13):
            at = BASE + timedelta(days=day - 1, hours=12)
            boluses.append({
                "seq_num": day,
                "request_time": at.strftime("%Y-%m-%d %H:%M:%S"),
                "completion_time": at.strftime("%Y-%m-%d %H:%M:%S"),
                "description": "Bolus",
                "completion": "Completed",
                "insulin": 4.0,
                "carbs": 40.0,
                "carb_ratio": 4.6,
            })
        store.upsert_bolus(boluses)
        # Advance the read to a ninth calendar day after the change without a meal,
        # making the missing day an honest gap rather than an invented zero.
        latest = BASE + timedelta(days=12)
        store.upsert_basal([{
            "seq_num": 100,
            "time": latest.strftime("%Y-%m-%d %H:%M:%S"),
            "delivery_type": "profileDelivery",
            "duration_mins": 5,
            "basal_rate": 0.6,
            "profile_basal_rate": 0.6,
        }])
        return store.pin_focus("late_bolus", "2026-06-13 00:00:00")


def _seed_evidence_after_trial_period(path):
    """A Trial with sufficient later meals but none in its own evidence period."""
    with Store.open(path) as store:
        store.upsert_settings_snapshot("2026-06-04 06:00:00", _block_ic_settings(1))
        store.upsert_settings_snapshot("2026-06-05 06:00:00", _block_ic_settings(2))
        _apply_ic_block(store, "2026-06-04 06:00:00",
                        block=(720, 900), members=[720], current=5.0, value=4.6)
        store.upsert_bolus([{
            "seq_num": day,
            "request_time": (BASE + timedelta(days=day - 1, hours=7)).strftime(
                "%Y-%m-%d %H:%M:%S"
            ),
            "completion_time": (BASE + timedelta(days=day - 1, hours=7)).strftime(
                "%Y-%m-%d %H:%M:%S"
            ),
            "description": "Bolus",
            "completion": "Completed",
            "insulin": 4.0,
            "carbs": 40.0,
        } for day in range(12, 19)])


def _seed_raw_candidates(path, *, revert=False):
    """Manufactured dose-stamped histories for roster ordering and loop closure."""
    with Store.open(path) as store:
        boluses, cgm = [], []
        for day in range(1, 18 if not revert else 11):
            at = BASE + timedelta(days=day - 1, hours=12)
            if revert:
                isf = 40 if day <= 3 or day >= 7 else 36
                carb_ratio = 5.0
            else:
                isf = 40 if day <= 3 else 36 if day <= 10 else 34
                carb_ratio = 5.0 if day <= 12 else 4.6
            boluses.append({
                "seq_num": day,
                "request_time": at.strftime("%Y-%m-%d %H:%M:%S"),
                "completion_time": at.strftime("%Y-%m-%d %H:%M:%S"),
                "description": "Bolus",
                "completion": "Completed",
                "insulin": 4.0,
                "carbs": 40.0,
                "isf": isf,
                "carb_ratio": carb_ratio,
                "target_bg": 110,
            })
            later = at + timedelta(hours=6)
            cgm.append({
                "EventDateTime": later.strftime("%Y-%m-%dT%H:%M:%S"),
                "Readings (CGM / BGM)": 120,
                "Description": "EGV",
            })
        store.upsert_bolus(boluses)
        store.upsert_cgm(cgm)


def _seed_raw_whole_profile_candidate(path):
    with Store.open(path) as store:
        boluses, cgm = [], []
        for day in range(1, 11):
            at = BASE + timedelta(days=day - 1, hours=12)
            boluses.append({
                "seq_num": day,
                "request_time": at.strftime("%Y-%m-%d %H:%M:%S"),
                "completion_time": at.strftime("%Y-%m-%d %H:%M:%S"),
                "description": "Bolus",
                "completion": "Completed",
                "insulin": 4.0,
                "carbs": 40.0,
                "isf": 40 if day <= 3 else 36,
                "carb_ratio": 5.0 if day <= 3 else 4.6,
                "target_bg": 110,
            })
            cgm.append({
                "EventDateTime": (at + timedelta(hours=6)).strftime("%Y-%m-%dT%H:%M:%S"),
                "Readings (CGM / BGM)": 120,
                "Description": "EGV",
            })
        store.upsert_bolus(boluses)
        store.upsert_cgm(cgm)


def _seed_whole_profile_trial(path):
    with Store.open(path) as store:
        old = _profile(1, 5.0)
        new = ProfileSettings(
            idp=2,
            name="2",
            dia_min=300,
            carb_entry=True,
            max_bolus=15.0,
            segments=(
                ProfileSegment(0, 0.8, 36, 4.6, 110),
                ProfileSegment(720, 0.8, 36, 4.6, 110),
            ),
        )
        store.upsert_settings_snapshot(
            "2026-06-04 09:00:00", PumpSettings(1, (old, new)),
        )
        store.upsert_settings_snapshot(
            "2026-06-05 09:00:00", PumpSettings(2, (old, new)),
        )
        store.upsert_basal([{
            "seq_num": 200,
            "time": "2026-06-06 00:00:00",
            "delivery_type": "profileDelivery",
            "duration_mins": 5,
            "basal_rate": 0.8,
            "profile_basal_rate": 0.8,
        }])


def _seed_missing_baseline_trial(path):
    with Store.open(path) as store:
        old = _profile(1, 5.0)
        new = ProfileSettings(
            idp=2,
            name="2",
            dia_min=300,
            carb_entry=True,
            max_bolus=15.0,
            segments=(
                ProfileSegment(0, 0.6, 40, 5.0, 110),
                ProfileSegment(720, 0.6, 40, 4.6, 110),
                ProfileSegment(900, 0.6, 40, 4.4, 110),
            ),
        )
        store.upsert_settings_snapshot(
            "2026-06-04 09:00:00", PumpSettings(1, (old, new)),
        )
        store.upsert_settings_snapshot(
            "2026-06-05 09:00:00", PumpSettings(2, (old, new)),
        )
        store.upsert_basal([{
            "seq_num": 300,
            "time": "2026-06-06 00:00:00",
            "delivery_type": "profileDelivery",
            "duration_mins": 5,
            "basal_rate": 0.6,
            "profile_basal_rate": 0.6,
        }])


def _seed_missing_prior_basal_trial(path):
    """A slot-present, non-uniform basal switch — ``before``/``after`` come back
    ``None`` from ``diff_profiles`` because the changed slots moved to different
    values, so no single prior setting exists to prefill. Unlike a slot-scoped I:C
    move, a basal switch candidate isn't dropped by the block-I:C carve-out, so it
    reaches the roster and exercises ``_prior_plan_route``'s slot-present,
    before-is-``None`` branch (finding 4 — the block-ic rewrite repurposed the
    original carb_ratio fixture for this branch, dropping the coverage).
    """
    with Store.open(path) as store:
        old = ProfileSettings(
            idp=1, name="1", dia_min=300, carb_entry=True, max_bolus=15.0,
            segments=(
                ProfileSegment(0, 0.6, 40, 5.0, 110),
                ProfileSegment(720, 0.6, 40, 5.0, 110),
            ),
        )
        new = ProfileSettings(
            idp=2, name="2", dia_min=300, carb_entry=True, max_bolus=15.0,
            segments=(
                ProfileSegment(0, 0.8, 40, 5.0, 110),
                ProfileSegment(720, 0.9, 40, 5.0, 110),
            ),
        )
        store.upsert_settings_snapshot(
            "2026-06-04 09:00:00", PumpSettings(1, (old, new)),
        )
        store.upsert_settings_snapshot(
            "2026-06-05 09:00:00", PumpSettings(2, (old, new)),
        )
        store.upsert_basal([{
            "seq_num": 400,
            "time": "2026-06-06 00:00:00",
            "delivery_type": "profileDelivery",
            "duration_mins": 5,
            "basal_rate": 0.8,
            "profile_basal_rate": 0.8,
        }])


@unittest.skipUnless(TestClient is not None, "api extra not installed")
class VerifyTrialsApiTest(unittest.TestCase):
    """The endpoint reads derived Trials from manufactured local fixture data."""

    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        with Store.open(self.tmp.name):
            pass
        self.client = TestClient(create_app(
            db_path=self.tmp.name, token=None, enable_fetch_loop=False,
        ))

    def tearDown(self):
        self.tmp.close()

    def test_empty_store_returns_an_empty_roster(self):
        response = self.client.get("/verify/trials", params={"window": 14})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"trials": [], "selected": None})

    def test_selected_block_ic_trial_keeps_focus_and_binds_block_evidence(self):
        # #581 amends ADR 579 §5: uniquely corroborated by a complete annotated
        # applied group, the block-scoped I:C Trial now binds isolated block
        # evidence — no general "not isolated" caveat, and the captured arc drives
        # the meal cohort. Focus is still preserved (the read is side-effect free).
        focus = _seed_maturing_block_ic_trial(self.tmp.name)

        roster = self.client.get("/verify/trials", params={"window": 14})
        self.assertEqual(roster.status_code, 200)
        # Exactly one entry, not two: the fixture's post-switch in-block meals are
        # dose-stamped at the same 5.0→4.6 the block switch itself carries, so this
        # also guards #463's suppression-ordering rule (finding 1) — a late dose
        # observation of the value a block switch established must corroborate that
        # switch, not resurrect it as a second, whole-parameter Trial.
        self.assertEqual(len(roster.json()["trials"]), 1)
        trial_id = roster.json()["trials"][0]["id"]

        selected = self.client.get(
            "/verify/trials", params={"window": 14, "selected": trial_id},
        )
        self.assertEqual(selected.status_code, 200)
        detail = selected.json()["selected"]
        self.assertEqual(detail["id"], trial_id)
        self.assertEqual(detail["parameter"], "carb_ratio")
        self.assertEqual(detail["slot"], "12:00")
        self.assertEqual(detail["before"], 5.0)
        self.assertEqual(detail["after"], 4.6)
        self.assertEqual(detail["state"], "maturing")
        self.assertEqual(detail["maturing"], {
            "days_elapsed": 8, "days_required": 14, "gap_count": 1,
        })
        # The evidence is block-isolated now, so the general caveat is gone and the
        # captured arc [720, 900) drives the meal envelope.
        self.assertNotIn("limitation", detail)
        self.assertNotIn(
            "This is general I:C evidence. It is not isolated to the block that changed.",
            detail["limits"],
        )
        self.assertEqual(detail["meal_arcs"]["block"], [720, 900])
        self.assertEqual(detail["focus"], {
            "available": False,
            "message": "Focus is unavailable while a Trial is live. It will not queue behind this change.",
        })
        with Store.open(self.tmp.name) as store:
            self.assertEqual(store.active_focus(), focus)

    def test_later_data_cannot_complete_a_trial_with_no_owned_evidence(self):
        _seed_evidence_after_trial_period(self.tmp.name)

        trial = self.client.get("/verify/trials", params={"window": 7}).json()["trials"][0]
        detail = self.client.get(
            "/verify/trials", params={"window": 7, "selected": trial["id"]},
        ).json()["selected"]

        self.assertEqual(detail["state"], "maturing")
        self.assertEqual(detail["maturing"]["days_elapsed"], 0)
        self.assertEqual(detail["readiness"], {
            "label": "Maturing",
            "message": "No verdict is ready while evidence accrues.",
        })

    def test_roster_orders_live_then_newest_completed_trials_and_rejects_unknown_id(self):
        _seed_raw_candidates(self.tmp.name)

        response = self.client.get("/verify/trials", params={"window": 7})
        self.assertEqual(response.status_code, 200)
        trials = response.json()["trials"]
        self.assertEqual(len(trials), 3)
        self.assertEqual(
            [(trial["parameter"], trial["state"]) for trial in trials],
            [("carb_ratio", "maturing"), ("isf", "complete"), ("isf", "complete")],
        )
        self.assertEqual(len({trial["id"] for trial in trials}), 3)
        self.assertGreater(trials[1]["changed_at"], trials[2]["changed_at"])

        complete = self.client.get(
            "/verify/trials", params={"window": 7, "selected": trials[1]["id"]},
        ).json()["selected"]
        self.assertEqual(complete["readiness"], {
            "label": "Ready to judge",
            "message": "This Trial is ready for a before-and-Trial read.",
        })

        unknown = self.client.get(
            "/verify/trials", params={"window": 7, "selected": "expired-trial"},
        )
        self.assertEqual(unknown.status_code, 404)
        aged = self.client.get(
            "/verify/trials", params={"window": 7, "selected": "isf-all-20260501080000"},
        )
        self.assertEqual(aged.status_code, 404)

    def test_selected_trial_owns_its_periods_evidence_and_maturing_readiness(self):
        _seed_maturing_block_ic_trial(self.tmp.name)
        trial_id = self.client.get("/verify/trials", params={"window": 14}).json()["trials"][0]["id"]

        detail = self.client.get(
            "/verify/trials", params={"window": 14, "selected": trial_id},
        ).json()["selected"]

        self.assertEqual(detail["before_period"], {
            "start": "2026-05-22 09:00:00", "end": "2026-06-05 09:00:00",
        })
        self.assertEqual(detail["trial_period"], {
            "start": "2026-06-05 09:00:00", "end": "2026-06-13 00:00:00",
        })
        self.assertEqual(detail["readiness"], {
            "label": "Maturing",
            "message": "No verdict is ready while evidence accrues.",
        })
        evidence = {item["key"]: item for item in detail["evidence"]}
        self.assertEqual(evidence["arc"]["role"], "target")
        self.assertEqual(evidence["tir"]["role"], "guardrail")
        self.assertEqual(evidence["tbr"]["role"], "guardrail")
        self.assertEqual(evidence["arc"]["rescue_context"], {
            "count": 0, "grams": 0.0, "unknown_count": 0,
        })
        self.assertEqual(detail["limits"], [
            "The evidence is limited to the selected Before and Trial periods.",
            "Observed movement does not establish that the setting caused it.",
            "1 data gap remains in the post-change period.",
        ])

    def test_revert_route_only_prefills_a_reconstructible_single_setting(self):
        _seed_maturing_block_ic_trial(self.tmp.name)
        trial_id = self.client.get("/verify/trials", params={"window": 14}).json()["trials"][0]["id"]
        block_ic = self.client.get(
            "/verify/trials", params={"window": 14, "selected": trial_id},
        ).json()["selected"]
        self.assertEqual(block_ic["plan_route"], {
            "mode": "stage-prior",
            "label": "Prior setting ready for Plan",
            "draft": {"items": [{"type": "ic", "start_min": 720, "value": 5.0}]},
            "message": (
                "The prior setting is staged for manual pump programming. After programming, "
                "confirm it with a fresh pump snapshot in Plan."
            ),
        })
        with Store.open(self.tmp.name) as store:
            self.assertIsNone(store.get_plan_draft())

    def test_whole_profile_trial_routes_to_manual_plan_review_without_a_prefill(self):
        _seed_whole_profile_trial(self.tmp.name)
        trial_id = self.client.get("/verify/trials", params={"window": 14}).json()["trials"][0]["id"]

        detail = self.client.get(
            "/verify/trials", params={"window": 14, "selected": trial_id},
        ).json()["selected"]

        self.assertEqual(detail["parameter"], "profile")
        self.assertEqual(detail["plan_route"], {
            "mode": "manual-review",
            "label": "Review this change in Plan",
            "message": (
                "This Trial does not have one prior setting that can be staged. Review the "
                "change in Plan, program the pump manually, then confirm it with a fresh pump snapshot."
            ),
        })
        self.assertNotIn("draft", detail["plan_route"])

    def test_missing_prior_setting_routes_to_manual_plan_review_without_a_prefill(self):
        # A slot-present but non-uniform switch (a partial-day basal move to two
        # different values) carries no single prior setting `diff_profiles` can name,
        # so `_prior_plan_route`'s `before is None` branch must fall back to
        # manual-review rather than inventing a value to stage (finding 4).
        _seed_missing_prior_basal_trial(self.tmp.name)
        trial_id = self.client.get("/verify/trials", params={"window": 14}).json()["trials"][0]["id"]

        detail = self.client.get(
            "/verify/trials", params={"window": 14, "selected": trial_id},
        ).json()["selected"]

        self.assertEqual(detail["parameter"], "basal_rate")
        self.assertIsNone(detail["before"])
        self.assertEqual(detail["plan_route"]["mode"], "manual-review")
        self.assertNotIn("draft", detail["plan_route"])

    def test_uncorroborated_block_ic_change_is_not_admitted(self):
        # A slot-scoped I:C switch (here a non-uniform multi-block move) with no
        # corroborating annotated Plan group fails closed under #581: it no longer
        # surfaces general, non-isolated evidence — it produces no roster entry.
        _seed_missing_baseline_trial(self.tmp.name)

        response = self.client.get("/verify/trials", params={"window": 14})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"trials": [], "selected": None})

    def test_exact_baseline_revert_does_not_become_a_roster_record(self):
        _seed_raw_candidates(self.tmp.name, revert=True)

        response = self.client.get("/verify/trials", params={"window": 7})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"trials": [], "selected": None})

    def test_raw_multi_parameter_change_is_one_whole_profile_trial(self):
        _seed_raw_whole_profile_candidate(self.tmp.name)

        response = self.client.get("/verify/trials", params={"window": 7})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["trials"], [{
            "id": "profile-all-20260604120000",
            "parameter": "profile",
            "slot": None,
            "changed_at": "2026-06-04 12:00:00",
            "before": None,
            "after": None,
            "target_metrics": ["tir", "arc"],
            "state": "complete",
            "maturing": {"days_elapsed": 7, "days_required": 7, "gap_count": 0},
        }])


if __name__ == "__main__":
    unittest.main()
