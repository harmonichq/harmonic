"""Exact comparison contracts exercised on synthetic Store inputs (#387)."""
import copy
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

from ciq_autotune.follow_up_comparison import capture_comparison_context, compare_follow_up
from ciq_autotune.store import Store
from ciq_autotune.events import CgmReading
from tests.test_outcomes_trend import _FakeStore, _snapshot_with_ic
from tests.test_trial_evidence import _seed_block_ic_switch, SWITCH, NOW
from tests.test_scenario_engine import cgm_ramp, meal


class FollowUpComparisonTest(unittest.TestCase):
    def focus(self, store, pin, *, lever="missed_meal", ending=None):
        return {"kind": "focus", "id": 1, "lever": lever, "pinned_at": str(pin),
                "status": "resolved" if ending else "active", "ending": ending,
                "comparison_context": capture_comparison_context(store, at=pin, input_revision=1)}

    def store(self, cgm=(), bolus=()):
        snap = _snapshot_with_ic(10)
        from dataclasses import replace
        snap = replace(snap, captured_at=datetime(2026, 1, 1))
        return _FakeStore(cgm=cgm, bolus=bolus, snaps=[snap])

    def compare(self, store, record, cutoff, **kwargs):
        return compare_follow_up(store, record=record, data_cutoff=cutoff,
                                 input_revision=2, **kwargs)["comparison"]

    def test_context_does_not_manufacture_missed_meal(self):
        cgm = cgm_ramp(11, 15, 40, 180, 1.4, 140)
        store = self.store(cgm, [meal(11, 15, 13, carbs=35, dose=7)])
        pin = datetime(2026, 6, 11, 16)
        result = self.compare(store, self.focus(store, pin), datetime(2026, 6, 11, 18, 5))
        arm = result["adherence"]["after"]
        self.assertEqual((arm["numerator"], arm["opportunities"], arm["rate"]), (0, 1, 0))
        self.assertEqual(arm["availability"]["state"], "available")
        self.assertEqual(result["adherence"]["before"]["availability"]["reason"], "zero_opportunities")

    def test_exact_start_and_end_anchors(self):
        cgm = cgm_ramp(10, 15, 40, 180, 1.4, 140) + cgm_ramp(11, 15, 40, 180, 1.4, 140)
        store = self.store(cgm)
        pin, end = datetime(2026, 6, 10, 18), datetime(2026, 6, 11, 18)
        result = self.compare(store, self.focus(store, pin, ending={"effective_at":str(end)}), end + timedelta(hours=1))
        arm = result["adherence"]["after"]
        self.assertEqual((arm["numerator"], arm["opportunities"]), (1, 1))
        self.assertEqual(result["periods"]["after"]["start"], str(pin))
        self.assertEqual(result["periods"]["after"]["end"], str(end))

    def test_available_focus_is_unclear_with_thin_dates(self):
        store = self.store(cgm_ramp(10, 15, 40, 180, 1.4, 140) + cgm_ramp(11, 15, 40, 180, 1.4, 140))
        record = self.focus(store, datetime(2026, 6, 11))
        result = self.compare(store, record, datetime(2026, 6, 12))
        self.assertEqual(result["availability"]["state"], "available")
        self.assertEqual(result["adherence"]["assessment"]["state"], "unclear")
        self.assertEqual(result["adherence"]["before"]["rate"], 1)

    def test_unavailable_context_and_legacy_endings_are_explicit(self):
        store = self.store(cgm_ramp(11, 15, 40, 180, 1.4, 140))
        record = self.focus(store, datetime(2026, 6, 11, 16))
        for change, reason in (({"comparison_context":None}, "missing_comparison_context"),
                               ({"status":"resolved"}, "missing_legacy_ending"),
                               ({"ending":{"effective_at":"2026-06-10 12:00:00"}}, "change_predates_pin")):
            with self.subTest(reason=reason):
                result = self.compare(store, {**record, **change}, datetime(2026, 6, 12))
                self.assertEqual(result["availability"]["reason"], reason)
                self.assertEqual(result["outcomes"], [])
        record["comparison_context"]["code_version"] = "retired"
        self.assertEqual(self.compare(store, record, datetime(2026, 6, 12))["availability"]["reason"], "unsupported_retained_execution")
        result = self.compare(store, record, datetime(2026, 6, 12), context_mode="current")
        self.assertEqual(result["context_mode"], "current")
        self.assertTrue(all(r["assessment"]["state"] == "context" for r in result["outcomes"]))

    def test_retained_context_survives_profile_change_and_record_is_unchanged(self):
        from ciq_autotune.settings import ProfileSegment, ProfileSettings, PumpSettings, Snapshot
        store = self.store(cgm_ramp(10, 15, 40, 180, 1.4, 140) + cgm_ramp(11, 15, 40, 180, 1.4, 140))
        record = self.focus(store, datetime(2026, 6, 11))
        original = copy.deepcopy(record)
        profile = ProfileSettings(2, "changed", 300, True, 15, (ProfileSegment(0, 1, 80, 10, 110),))
        store._snaps.append(Snapshot(datetime(2026, 6, 11, 12), PumpSettings(2, (profile,))))
        retained = compare_follow_up(store, record=record, data_cutoff=datetime(2026, 6, 12), input_revision=2)
        current = compare_follow_up(store, record=record, data_cutoff=datetime(2026, 6, 12), input_revision=2, context_mode="current")
        self.assertEqual(retained["comparison_context"]["programmed_isf"]["value"], 40)
        self.assertEqual(current["comparison_context"]["programmed_isf"]["value"], 80)
        self.assertEqual(record, original)
        self.assertEqual(store.dropped, [])

    def test_setting_comparison_is_available_and_readonly(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic.sqlite"
            _seed_block_ic_switch(path)
            before_bytes = path.read_bytes()
            with Store.open_readonly(path) as store:
                context = capture_comparison_context(store, at=SWITCH, input_revision=1)
                record = {"kind":"trial", "id":"synthetic", "parameter":"carb_ratio", "slot":"12:00",
                          "block":[720,900], "members":[720], "detected_at":str(SWITCH), "before":5.0, "after":4.4,
                          "comparison_context":context, "ending":{"effective_at":str(SWITCH + timedelta(days=1))}}
                original = copy.deepcopy(record)
                result = self.compare(store, record, NOW)
                self.assertEqual(result["availability"]["state"], "available")
                self.assertEqual(result["periods"]["after"]["end"], str(NOW))
                self.assertEqual(result["periods"]["before"]["start"], "2026-06-04 09:00:00")
                self.assertEqual(result["denominators"]["after"]["contributing_meals"], 4)
                self.assertTrue(all("13:00:00" in row["anchor_t"] for row in result["views"]["after"]["occurrences"]))
                self.assertEqual(record, original)
                with self.assertRaises(sqlite3.OperationalError):
                    with store.follow_up_transaction():
                        pass
            self.assertEqual(path.read_bytes(), before_bytes)

    def test_persisted_ic_members_constrain_real_analyzer_population(self):
        from ciq_autotune.watched_change import reconcile_ingested_follow_up
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic.sqlite"
            _seed_block_ic_switch(path)
            with Store.open(path) as store:
                reconcile_ingested_follow_up(store)
                recorded = next(r for r in store.follow_up_records("trial") if r.get("block"))
                self.assertEqual(recorded["members"], [720])
                self.assertNotIn("member_start_mins", recorded)
                different = {**recorded, "id": recorded["id"] + "-different-members", "members": [720, 780]}
                with store.follow_up_transaction():
                    store.save_follow_up_record(different)
            original_bytes = path.read_bytes()
            with Store.open_readonly(path) as store:
                matched = store.follow_up_record("trial", recorded["id"])
                mismatched = store.follow_up_record("trial", different["id"])
                self.assertEqual(matched["block"], mismatched["block"])
                original_records = copy.deepcopy((matched, mismatched))
                accepted = self.compare(store, matched, NOW)
                rejected = self.compare(store, mismatched, NOW)
                self.assertEqual(accepted["periods"], rejected["periods"])
                self.assertEqual(accepted["denominators"], rejected["denominators"])
                self.assertEqual(accepted["denominators"]["after"]["contributing_meals"], 4)
                self.assertGreater(accepted["denominators"]["after"]["readings"], 0)
                self.assertTrue(accepted["readiness"]["after"]["available"])
                self.assertEqual(accepted["readiness"]["after"]["captured_members"], [720])
                for arm in ("before", "after"):
                    self.assertFalse(rejected["readiness"][arm]["available"])
                    self.assertEqual(rejected["readiness"][arm]["reason"], "unmatchable_captured_membership")
                    self.assertEqual(rejected["readiness"][arm]["observed"], 0)
                    self.assertFalse(rejected["readiness"][arm]["criterion_met"])
                legacy = {k: v for k, v in matched.items() if k not in ("members", "comparison_context")}
                unavailable = self.compare(store, legacy, NOW)
                self.assertEqual(unavailable["availability"]["reason"], "missing_comparison_context")
                self.assertEqual(unavailable["periods"], {})
                self.assertEqual((matched, mismatched), original_records)
            self.assertEqual(path.read_bytes(), original_bytes)


class SupportedComparisonTest(unittest.TestCase):
    compare = FollowUpComparisonTest.compare
    store = FollowUpComparisonTest.store
    focus = FollowUpComparisonTest.focus

    def dense_profile(self, *, constant=False, days=16):
        from ciq_autotune.settings import ProfileSegment, ProfileSettings, PumpSettings, Snapshot
        start = datetime(2026,1,1)
        pin, end = start+timedelta(days=days), start+timedelta(days=2*days)
        cgm = []
        for day in range(2*days):
            high = 100 + day % 7 if day < days else 15 + day % 5
            low = 3 + day % 3 if day < days else 12 + day % 3
            for i in range(288):
                bg = 120 if constant else 60 if i < low else 220 if i < low+high else 120
                cgm.append(CgmReading(start+timedelta(days=day,minutes=5*i),bg=bg))
        old = ProfileSettings(1,"old",300,True,15,(ProfileSegment(0,.8,40,10,110),))
        new = ProfileSettings(2,"new",300,True,15,(ProfileSegment(0,1,40,10,110),))
        store = _FakeStore(cgm=cgm,snaps=[Snapshot(start,PumpSettings(1,(old,new))),
                                        Snapshot(pin,PumpSettings(2,(old,new)))])
        record = {"kind":"trial","id":"profile-test","parameter":"profile","detected_at":str(pin),
                  "comparison_context":capture_comparison_context(store,at=pin,input_revision=1)}
        return store,record,end

    def test_supported_opposite_outcomes_remain_mixed(self):
        store,record,end = self.dense_profile(days=30)
        result = self.compare(store,record,end)
        rows = {r["key"]:r for r in result["outcomes"]}
        self.assertEqual(result["availability"]["state"],"available")
        self.assertEqual(rows["tir"]["assessment"]["state"],"favorable")
        self.assertEqual(rows["tbr"]["assessment"]["state"],"concerning")
        self.assertTrue(result["assessment"]["mixed"])
        self.assertEqual(result["assessment"]["state"],"concerning")
        self.assertEqual(rows["tir"]["informative_dates"],{"before":30,"after":30})
        self.assertEqual(rows["mean"]["assessment"]["state"],"context")
        self.assertEqual(result,self.compare(store,record,end))

    def test_degenerate_interval_is_unclear_even_with_many_dates(self):
        store,record,end = self.dense_profile(constant=True)
        result = self.compare(store,record,end)
        row = next(r for r in result["outcomes"] if r["key"] == "tir")
        self.assertEqual(row["difference"],0)
        self.assertEqual(row["assessment"]["state"],"unclear")
        self.assertTrue(any("degenerate" in r for r in row["assessment"]["reasons"]))

    def test_missing_daily_coverage_cannot_clear_support(self):
        store,record,end = self.dense_profile()
        store._cgm = [r for r in store._cgm if r.t.minute == 0]
        result = self.compare(store,record,end)
        row = next(r for r in result["outcomes"] if r["key"] == "tir")
        self.assertEqual(row["informative_dates"],{"before":0,"after":0})
        self.assertEqual(row["assessment"]["state"],"unclear")
        self.assertIsNotNone(row["difference"])

    def test_whole_profile_constituents_and_next_change_bound(self):
        from dataclasses import replace
        from ciq_autotune.settings import PumpSettings, Snapshot
        store,record,end = self.dense_profile()
        next_change = datetime(2026,1,24,12,34,56)
        new = replace(store._snaps[-1].settings.profiles[-1],idp=3)
        store._snaps.append(Snapshot(next_change,PumpSettings(3,(new,))))
        result = self.compare(store,record,end)
        self.assertEqual(result["periods"]["after"]["end"],str(next_change))
        self.assertTrue(any(c["parameter"] == "basal_rate" for c in result["views"]["after"]["changes"]))

    def test_stored_context_is_accepted_by_store_without_provider_sql(self):
        from tests.test_trial_evidence import _seed_profile_switch
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/"context.sqlite"
            _seed_profile_switch(path)
            with Store.open(path) as store:
                focus = store.pin_focus("missed_meal",str(SWITCH))
                context = capture_comparison_context(store,at=SWITCH,input_revision=store.input_data_revision())
                with store.follow_up_transaction():
                    saved = store.save_follow_up_record({"kind":"focus","id":focus["id"],"version":"386:1",
                                                         "comparison_context":context})
                self.assertEqual(saved["comparison_context"],context)

    def test_focus_day_grouped_assessment_preserves_observed_zero_days(self):
        from dataclasses import replace
        cgm, bolus = [], []
        start = datetime(2026,1,1)
        for day in range(32):
            offset = start + timedelta(days=day) - datetime(2026,6,11)
            cgm += [replace(r,t=r.t+offset) for r in cgm_ramp(11,15,40,180,1.4,140)]
            # The preceding meal explains this high under the retained context.
            if (day < 16 and day >= 12) or (day >= 16 and day >= 19):
                bolus.append(replace(meal(11,15,13,35,7),t=datetime(2026,6,11,15,13)+offset,seq_num=day))
        store = self.store(cgm,bolus)
        record = self.focus(store,start+timedelta(days=16))
        result = self.compare(store,record,start+timedelta(days=32))
        self.assertEqual(result["availability"]["state"],"available")
        self.assertEqual(result["adherence"]["before"]["opportunities"],16)
        self.assertEqual(result["adherence"]["after"]["opportunities"],16)
        self.assertEqual(result["adherence"]["before"]["numerator"],12)
        self.assertEqual(result["adherence"]["after"]["numerator"],3)
        self.assertEqual(result["adherence"]["assessment"]["state"],"favorable")

    def test_fixed_context_changes_counts_only_on_explicit_current_reassessment(self):
        from scripts.qa_e2e_cases import _materialize_behavioral_correction_on_iob
        from ciq_autotune.settings import ProfileSegment, ProfileSettings, PumpSettings
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/"context-replay.sqlite"
            with Store.open(path) as store:
                _materialize_behavioral_correction_on_iob(store)
                tail=max(r.t for r in store.cgm_readings()) + timedelta(seconds=1)
                pin=tail-timedelta(days=7)
                zero=ProfileSettings(1,"context-zero",300,True,15,(ProfileSegment(0,.9,0,10,110),))
                forty=ProfileSettings(1,"context-forty",300,True,15,(ProfileSegment(0,.9,40,10,110),))
                store.upsert_settings_snapshot(str(pin),PumpSettings(1,(zero,)))
                record=self.focus(store,pin,lever="correction_on_iob")
                store.upsert_settings_snapshot(str(tail-timedelta(seconds=1)),PumpSettings(1,(forty,)))
                retained=self.compare(store,record,tail)
                current=self.compare(store,record,tail,context_mode="current")
                self.assertEqual(retained["adherence"]["after"]["opportunities"],5)
                self.assertEqual(retained["adherence"]["after"]["numerator"],2)
                self.assertEqual(current["adherence"]["after"]["numerator"],0)
                self.assertEqual(current["adherence"]["assessment"]["state"],"context")

    def test_disjoint_setting_changes_do_not_cut_captured_block_and_baseline_caps(self):
        from ciq_autotune.settings import ProfileSegment, ProfileSettings, PumpSettings, Snapshot
        start,pin,end=datetime(2026,1,1),datetime(2026,5,1,12),datetime(2026,6,1)
        def snapshot(at,lunch,dinner,isf=40):
            profile=ProfileSettings(1,"synthetic",300,True,15,(
                ProfileSegment(0,.8,isf,10,110),ProfileSegment(720,.8,isf,lunch,110),
                ProfileSegment(900,.8,isf,dinner,110)))
            return Snapshot(at,PumpSettings(1,(profile,)))
        store=_FakeStore(cgm=[CgmReading(start,120),CgmReading(pin-timedelta(hours=1),120),
                             CgmReading(pin+timedelta(hours=1),120)],
                         snaps=[snapshot(start,10,10),snapshot(pin,9,10),
                                snapshot(pin+timedelta(days=1),9,8),
                                snapshot(pin+timedelta(days=2),9,8,isf=50)])
        record={"kind":"trial","id":"block","parameter":"carb_ratio","slot":"12:00",
                "block":[720,900],"members":[720],"before":10,"after":9,"detected_at":str(pin),
                "comparison_context":capture_comparison_context(store,at=pin,input_revision=1)}
        result=self.compare(store,record,end)
        self.assertEqual(result["periods"]["before"]["start"],str(pin-timedelta(days=90)))
        self.assertEqual(result["periods"]["after"]["end"],str(end))
        store._snaps.append(snapshot(pin+timedelta(days=3),10,8,isf=50))
        store._snaps.append(snapshot(pin+timedelta(days=4),9,8,isf=50))
        result=self.compare(store,record,end)
        self.assertEqual(result["periods"]["after"]["end"],str(pin+timedelta(days=3)))
        # Reappearance of the changed value never bridges the intervening setting.
        later={**record,"detected_at":str(pin+timedelta(days=4))}
        self.assertEqual(self.compare(store,later,end)["periods"]["before"]["start"],str(pin+timedelta(days=3)))

    def test_empty_source_missing_isf_and_zero_length_period_are_unavailable(self):
        empty=_FakeStore()
        context=capture_comparison_context(empty,at=datetime(2026,1,1),input_revision=0)
        self.assertEqual(context["state"],"unavailable")
        self.assertEqual(context["reason"],"missing_programmed_isf")
        store=self.store(cgm_ramp(11,15,40,180,1.4,140))
        pin=datetime(2026,6,11,18)
        record=self.focus(store,pin,ending={"effective_at":str(pin)})
        result=self.compare(store,record,datetime(2026,6,12))
        self.assertEqual(result["adherence"]["after"]["availability"]["reason"],"zero_opportunities")
        self.assertIsNone(result["adherence"]["after"]["rate"])
        store._cgm=[]
        self.assertEqual(self.compare(store,record,datetime(2026,6,12))["availability"]["reason"],"no_source_evidence")

    def test_basal_and_isf_keep_rest_denominators_including_zero_low_nights(self):
        from dataclasses import replace
        from ciq_autotune.settings import PumpSettings
        for parameter in ("basal_rate","isf"):
            with self.subTest(parameter=parameter):
                store,record,end=self.dense_profile(constant=True)
                latest=store._snaps[-1]
                new=latest.settings.profiles[-1]
                new=replace(new,segments=(replace(new.segments[0],isf=45),))
                store._snaps[-1]=replace(latest,settings=PumpSettings(2,(latest.settings.profiles[0],new)))
                record.update(parameter=parameter,slot="22:00")
                record["comparison_context"]=capture_comparison_context(store,at=latest.captured_at,input_revision=1)
                result=self.compare(store,record,end)
                self.assertEqual(result["availability"]["state"],"available")
                night=next(row for row in result["outcomes"] if row["key"] == "nights_with_low")
                # The final tail ends before the detector's three-hour minimum.
                self.assertEqual(night["denominators"],{"before":16,"after":15})
                self.assertEqual((night["before"],night["after"]),(0,0))
                self.assertEqual(night["assessment"]["state"],"unclear")
                self.assertIsNotNone(night["assessment"]["interval"])
                if parameter == "isf":
                    self.assertGreater(result["denominators"]["after"]["qualifying_fasting_steps"],0)


class MeasurementComparisonTest(unittest.TestCase):
    store = FollowUpComparisonTest.store
    focus = FollowUpComparisonTest.focus
    compare = FollowUpComparisonTest.compare

    def test_missing_after_measurements_cannot_improve_adherence(self):
        from dataclasses import replace
        from tests.test_scenario_engine import cgm_flat
        start = datetime(2026, 1, 1)
        source = [CgmReading(datetime(2026, 6, 15, 12, 15) + timedelta(minutes=5*i), value)
                  for i, value in enumerate((100,110,120,130,140,150,160,170,180,175,165,150,135))]
        cgm, bolus = [], []
        for day in range(32):
            offset = start + timedelta(days=day) - datetime(2026, 6, 15)
            bolus.append(replace(meal(15,12,40,carbs=45,dose=10),
                                 t=datetime(2026,6,15,12,40)+offset, seq_num=day+1))
            if day < 16:
                trace = source if day < 12 else cgm_flat(15,11,40,120,240)
                cgm.extend(replace(r, t=r.t+offset) for r in trace)
        store = self.store(cgm, bolus)
        result = self.compare(store, self.focus(store, start+timedelta(days=16), lever="late_bolus"),
                              start+timedelta(days=32))
        self.assertEqual(result["adherence"]["before"]["rate"], .75)
        self.assertIsNone(result["adherence"]["after"]["rate"])
        self.assertEqual(result["adherence"]["after"]["opportunities"], 16)
        self.assertEqual(result["adherence"]["after"]["informative_dates"], 0)
        self.assertEqual(result["adherence"]["assessment"]["state"], "unclear")
        self.assertIsNone(result["adherence"]["assessment"]["interval"])

    def test_focus_identifies_mapped_outcomes_separately(self):
        from ciq_autotune.watched_change import focus_view
        for lever, target, keys in (("missed_meal", "tir", {"tir"}),
                                    ("over_treated_low", "tbr", {"tbr"}),
                                    ("late_bolus", "arc", {"peak", "nadir"})):
            with self.subTest(lever=lever):
                store = self.store(cgm_ramp(11,15,40,180,1.4,140))
                record = self.focus(store, datetime(2026,6,11,16), lever=lever)
                result = self.compare(store, record, datetime(2026,6,12))
                self.assertEqual(result["target_metric"], focus_view(record).target_metric)
                self.assertEqual(result["target_metric"], target)
                self.assertEqual({r["key"] for r in result["outcomes"] if r["role"] == "mapped_outcome"}, keys)
                self.assertTrue(all("assessment" in r for r in result["outcomes"]))
                self.assertIn("assessment", result["adherence"])
                self.assertTrue(any(r["role"] == "context" for r in result["outcomes"]))

    def test_focus_mapped_glucose_assessment_is_independent_of_habit_provenance(self):
        from ciq_autotune.events import BolusEvent
        outcomes = []
        for flag in (None, 0):
            with self.subTest(user_override=flag):
                store, _, end = SupportedComparisonTest().dense_profile()
                start = datetime(2026, 1, 1)
                pin = start + timedelta(days=16)
                store._bolus = [BolusEvent(t=start+timedelta(days=day, hours=12),
                                          insulin=1, carbs=0, user_override=flag, seq_num=day+1)
                                for day in (0, 16)]
                result = self.compare(store, self.focus(store, pin, lever="user_override"), end)
                row = next(r for r in result["outcomes"] if r["key"] == "tbr")
                outcomes.append(row)
                self.assertEqual([result["readiness"][arm]["criterion_met"]
                                  for arm in ("before", "after")], [flag is not None]*2)
                self.assertEqual(result["adherence"]["assessment"]["state"], "unclear")
                for arm in ("before", "after"):
                    self.assertEqual(result["adherence"][arm]["opportunities"], 1)
                    self.assertEqual(result["adherence"][arm]["rate"], None if flag is None else 0)
                self.assertEqual(row["role"], "mapped_outcome")
                self.assertEqual(row["availability"]["state"], "available")
                self.assertGreater(row["assessment"]["interval"]["low"], 0)
                self.assertEqual(row["assessment"]["state"], "concerning")
        self.assertEqual(outcomes[0]["assessment"]["interval"], outcomes[1]["assessment"]["interval"])
        self.assertEqual(outcomes[0]["before"], outcomes[1]["before"])
        self.assertEqual(outcomes[0]["after"], outcomes[1]["after"])

    def test_focus_mapped_glucose_still_requires_duration_coverage_and_uncertainty(self):
        for limitation in ("duration", "coverage", "degenerate"):
            with self.subTest(limitation=limitation):
                days = 13 if limitation == "duration" else 16
                store, _, end = SupportedComparisonTest().dense_profile(days=days, constant=limitation == "degenerate")
                if limitation == "coverage":
                    store._cgm = [r for r in store._cgm if r.t.minute == 0]
                pin = datetime(2026, 1, 1) + timedelta(days=days)
                result = self.compare(store, self.focus(store, pin, lever="user_override"), end)
                row = next(r for r in result["outcomes"] if r["key"] == "tbr")
                self.assertEqual(row["availability"]["state"], "available")
                self.assertEqual(row["assessment"]["state"], "unclear")
                if limitation == "coverage":
                    self.assertEqual(row["informative_dates"], {"before": 0, "after": 0})
                elif limitation == "degenerate":
                    self.assertTrue(any("degenerate" in reason for reason in row["assessment"]["reasons"]))
                else:
                    self.assertGreater(row["assessment"]["interval"]["low"], 0)


class PatternOpportunityComparisonTest(unittest.TestCase):
    def materialize(self, **kwargs):
        from scripts.qa_e2e_cases import _materialize_pattern_focus_meals
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "synthetic.sqlite"
        with Store.open(path) as store:
            _materialize_pattern_focus_meals(store, **kwargs)
        return path

    def comparison(self, store, *, pin=datetime(2024, 5, 5),
                   cutoff=datetime(2024, 5, 9), key="highs_after_meals",
                   lever="late_bolus", ending=None, outcome_window=None):
        record = FollowUpComparisonTest().focus(store, pin, lever=lever, ending=ending)
        record.update(pattern_key=key, subject=f"pattern:{key}")
        if outcome_window is not None:
            record['decision_context'] = {'outcome_window': outcome_window}
        original = copy.deepcopy(record)
        result = compare_follow_up(store, record=record, data_cutoff=cutoff, input_revision=2)
        self.assertEqual(record, original)
        return result["comparison"]

    def test_pattern_gate_can_be_met_before_fourteen_days_without_invented_direction(self):
        path = self.materialize()
        before = path.read_bytes()
        with Store.open_readonly(path) as store:
            result = self.comparison(store)
        self.assertEqual(path.read_bytes(), before)
        for arm in ("before", "after"):
            readiness = result["readiness"][arm]
            self.assertTrue(readiness["criterion_met"], readiness)
            self.assertEqual((readiness["count"], readiness["gate"], readiness["unit"],
                              readiness["verdict"]), (12, 12, "meals", "ready"))
            self.assertEqual(readiness["observed"], readiness["count"])
            self.assertEqual(readiness["required"], readiness["gate"])
            self.assertLessEqual({"unit", "observed", "measured", "unmeasured",
                "elapsed_days", "required_elapsed_days", "criterion_met",
                "contributing_dates", "reason", "count", "gate", "verdict"}, readiness.keys())
            self.assertIsNone(readiness["required_elapsed_days"])
            self.assertEqual((readiness["measured"], readiness["unmeasured"]), (12, 0))
            self.assertEqual(len(readiness["contributing_dates"]), 4)
            self.assertEqual(result["adherence"][arm]["rate"], 0)
        self.assertEqual(result["adherence"]["assessment"]["state"], "unclear")
        self.assertEqual(result["assessment"]["state"], "unclear")

    def test_saved_outcome_window_filters_each_calendar_arm_without_clipping_context(self):
        path = self.materialize()
        with Store.open_readonly(path) as store:
            unscoped = self.comparison(store)
            result = self.comparison(
                store, outcome_window={'start_min': 17 * 60, 'end_min': 19 * 60},
            )
        # The manufactured meals remain at 06:00, 12:00 and 18:00. The retained
        # evening outcome scope admits exactly the 18:00 outcome episode in each
        # arm. Its comparison population follows that producer-owned membership,
        # rather than merely changing the Pattern readiness tally.
        self.assertEqual([result['readiness'][arm]['count'] for arm in ('before', 'after')], [4, 4])
        self.assertEqual([result['denominators'][arm]['contributing_meals']
                          for arm in ('before', 'after')], [4, 4])
        self.assertTrue(all(result['denominators'][arm]['readings']
                            < unscoped['denominators'][arm]['readings']
                            for arm in ('before', 'after')))

    def test_saved_explicit_whole_day_scope_keeps_23_59_in_both_comparison_arms(self):
        from ciq_autotune.event_comparison import scoped_outcome_occurrences
        from ciq_autotune.window_membership import WindowQuery

        path = self.materialize()
        scope = {'start_min': 0, 'end_min': 1440}
        with Store.open_readonly(path) as store:
            unscoped = self.comparison(store)
            retained = self.comparison(store, outcome_window=scope)
        for arm in ('before', 'after'):
            self.assertEqual(retained['readiness'][arm]['count'], unscoped['readiness'][arm]['count'])
            self.assertEqual(retained['denominators'][arm]['contributing_meals'],
                             unscoped['denominators'][arm]['contributing_meals'])
        query = WindowQuery.clock(**scope)
        for start, end in ((datetime(2024, 5, 1), datetime(2024, 5, 2)),
                           (datetime(2024, 5, 5), datetime(2024, 5, 6))):
            included = scoped_outcome_occurrences([{
                'outcome_t': (end - timedelta(minutes=1)).strftime('%Y-%m-%d %H:%M:%S'),
                'outcome_min': 1439,
            }], start=start, end=end, query=query)
            self.assertEqual(len(included), 1, 'the saved whole-day scope includes 23:59 in each arm')

    def test_elapsed_time_and_other_arm_cannot_supply_missing_opportunities(self):
        path = self.materialize()
        with Store.open_readonly(path) as store:
            result = self.comparison(store, pin=datetime(2024, 5, 8), cutoff=datetime(2024, 6, 1))
        self.assertEqual(result["readiness"]["before"]["count"], 21)
        after = result["readiness"]["after"]
        self.assertEqual(after["count"], 3)
        self.assertGreater(after["elapsed_days"], 14)
        self.assertFalse(after["criterion_met"])
        self.assertEqual(after["verdict"], "withheld")

    def test_pin_and_ending_are_half_open_and_later_opportunities_stay_outside(self):
        path = self.materialize()
        with Store.open_readonly(path) as store:
            result = self.comparison(store, pin=datetime(2024, 5, 5, 6),
                                     ending={"effective_at": "2024-05-05 18:00:00"})
        self.assertEqual(result["readiness"]["before"]["count"], 12)
        self.assertEqual(result["readiness"]["after"]["count"], 2)
        self.assertFalse(result["readiness"]["after"]["criterion_met"])

    def test_missing_measurements_are_separate_from_opportunity_readiness(self):
        path = self.materialize(measured=False)
        with Store.open_readonly(path) as store:
            result = self.comparison(store)
        self.assertTrue(all(r["criterion_met"] for r in result["readiness"].values()))
        for arm in ("before", "after"):
            self.assertIsNone(result["adherence"][arm]["rate"])
            self.assertEqual(result["adherence"][arm]["measured_opportunities"], 0)
            self.assertEqual(result["readiness"][arm]["measured"], 0)
            self.assertEqual(result["readiness"][arm]["unmeasured"], 12)
        self.assertEqual(result["availability"]["state"], "unavailable")
        self.assertEqual(result["adherence"]["assessment"]["state"], "unclear")

    def test_zero_opportunities_are_not_observed_zero_behavior(self):
        path = self.materialize(meals_per_day=0)
        with Store.open_readonly(path) as store:
            result = self.comparison(store)
        for arm in ("before", "after"):
            self.assertEqual(result["readiness"][arm]["count"], 0)
            self.assertEqual(result["readiness"][arm]["reason"], "zero_opportunities")
            self.assertFalse(result["readiness"][arm]["criterion_met"])
            self.assertIsNone(result["adherence"][arm]["rate"])

    def test_published_gate_authority_controls_roster_and_comparison(self):
        from unittest.mock import patch
        from ciq_autotune.analyzers.scenario import outcome_patterns
        from ciq_autotune.explore_exposures import build_exposures
        path = self.materialize()
        with Store.open_readonly(path) as store, patch.dict(outcome_patterns._GATES, {"highs_after_meals": 25}):
            roster = outcome_patterns.build_outcome_patterns({}, build_exposures(store), {})
            result = self.comparison(store)
        self.assertEqual(roster[0]["readiness"], {"count": 24, "gate": 25, "verdict": "withheld"})
        for readiness in result["readiness"].values():
            self.assertEqual(readiness["gate"], 25)
            self.assertFalse(readiness["criterion_met"])

    def test_mapped_direction_waits_for_pattern_gate_and_keeps_glucose_checks(self):
        from unittest.mock import patch
        from ciq_autotune.analyzers.scenario import outcome_patterns
        # The existing dense known-signal producer yields a nondegenerate TBR
        # interval. It proves a direction is withheld by the gate, not by a
        # coincidentally uninformative glucose trace.
        store, _, end = SupportedComparisonTest().dense_profile()
        pin = datetime(2026, 1, 17)
        legacy = FollowUpComparisonTest().focus(store, pin, lever="correction_on_iob")
        old = FollowUpComparisonTest().compare(store, legacy, end)
        self.assertEqual(next(r for r in old["outcomes"] if r["key"] == "tbr")["assessment"]["state"], "concerning")
        for limitation in ("opportunities", "ready", "coverage", "duration_removed"):
            with self.subTest(limitation=limitation):
                source, _, cutoff = SupportedComparisonTest().dense_profile(
                    days=13 if limitation == "duration_removed" else 16)
                split = datetime(2026, 1, 1) + timedelta(days=13 if limitation == "duration_removed" else 16)
                if limitation == "coverage":
                    source._cgm = [r for r in source._cgm if r.t.minute == 0]
                # Moving the single policy gate exercises the real source count.
                gate = 100 if limitation == "opportunities" else 12
                with patch.dict(outcome_patterns._GATES, {"lows_after_correcting_highs": gate}):
                    result = self.comparison(source, pin=split, cutoff=cutoff,
                        key="lows_after_correcting_highs", lever="correction_on_iob")
                tbr = next(r for r in result["outcomes"] if r["key"] == "tbr")
                self.assertEqual(tbr["assessment"]["state"],
                    "unclear" if limitation in ("opportunities", "coverage") else "concerning")
                if limitation == "opportunities":
                    self.assertGreater(tbr["assessment"]["interval"]["low"], 0)
                    self.assertTrue(all(r["verdict"] == "withheld" for r in result["readiness"].values()))
                elif limitation in ("ready", "duration_removed"):
                    self.assertTrue(all(r["verdict"] == "ready" for r in result["readiness"].values()))

    def test_four_day_pattern_gate_only_publishes_mapped_glucose_direction(self):
        path = self.materialize(meals_per_day=0)
        start = datetime(2024, 5, 1)
        # Three distinct low episodes per date; longer lows and fewer highs
        # after pin produce supported glucose differences without any boluses
        # from which correction-stacking behavior could be measured.
        readings = []
        for day in range(8):
            for sample in range(288):
                low_samples = (3 if day < 4 else 12) + day % 3
                high_samples = (30 if day < 4 else 8) + day % 3
                phase = sample % 96
                bg = 60 if 12 <= phase < 12 + low_samples else 220 if 40 <= phase < 40 + high_samples else 120
                readings.append({"EventDateTime": str(start + timedelta(days=day, minutes=sample * 5)),
                                 "Readings (CGM / BGM)": bg, "Description": "Synthetic EGV"})
        with Store.open(path) as store:
            store.upsert_cgm(readings)
        with Store.open_readonly(path) as store:
            result = self.comparison(store, key="lows_after_correcting_highs", lever="correction_stacking")
        for arm in ("before", "after"):
            self.assertEqual(result["readiness"][arm]["count"], 12)
            self.assertEqual(result["readiness"][arm]["verdict"], "ready")
            self.assertEqual(result["readiness"][arm]["elapsed_days"], 4)
            self.assertEqual(result["adherence"][arm]["measured_opportunities"], 0)
        outcomes = {row["key"]: row for row in result["outcomes"]}
        self.assertEqual(outcomes["tbr"]["assessment"]["state"], "concerning")
        for key in ("tir", "tar"):
            interval = outcomes[key]["assessment"]["interval"]
            self.assertTrue(interval["low"] > 0 or interval["high"] < 0)
            self.assertEqual(outcomes[key]["assessment"]["state"], "unclear")
        self.assertEqual(result["adherence"]["assessment"]["state"], "unclear")

    def test_lows_and_collapsed_pattern_use_exposure_anchors_not_member_pairs(self):
        from ciq_autotune.explore_exposures import build_exposures
        from scripts.qa_e2e_cases import QA_CASES, materialize_case
        for case_name, key, lever in (
            ("pattern-collapse", "highs_after_treating_lows", "over_treated_low"),
            ("behavioral-correction-stacking", "lows_after_correcting_highs", "correction_stacking"),
        ):
            with self.subTest(case=case_name), tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "synthetic.sqlite"
                with Store.open(path) as store:
                    materialize_case(store, next(c for c in QA_CASES if c.name == case_name))
                with Store.open_readonly(path) as store:
                    exposures = build_exposures(store)
                    result = self.comparison(store, pin=datetime(2024, 5, 16),
                        cutoff=datetime(2024, 5, 31), key=key, lever=lever)
                    for arm, lo, hi in (("before", "2024-05-01", "2024-05-16"),
                                       ("after", "2024-05-16", "2024-05-31")):
                        owned = [r for r in exposures["exposures"]["lows"]["occurrences"] if lo <= r["t"] < hi]
                        self.assertEqual(result["readiness"][arm]["count"], len(owned))
                        self.assertEqual(result["readiness"][arm]["unit"], "lows")
                        self.assertEqual(result["readiness"][arm]["gate"], 12)
                    if lever == "correction_stacking":
                        self.assertNotEqual(sum(r["count"] for r in result["readiness"].values()),
                            sum(result["adherence"][arm]["opportunities"] for arm in ("before", "after")))


class PracticalComparisonTest(unittest.TestCase):
    store = FollowUpComparisonTest.store
    focus = FollowUpComparisonTest.focus
    compare = FollowUpComparisonTest.compare

    def test_wrapping_membership_ignores_outside_change_and_cuts_inside_change(self):
        from ciq_autotune.settings import ProfileSegment,ProfileSettings,PumpSettings,Snapshot
        start=datetime(2026,6,1)
        def snapshot(day, inside, outside):
            segments=(ProfileSegment(0,1,40,inside,110),ProfileSegment(120,1,40,outside,110),
                      ProfileSegment(1320,1,40,inside,110))
            return Snapshot(start+timedelta(days=day),PumpSettings(1,(ProfileSettings(1,'synthetic',300,True,15,segments),)))
        cgm=[CgmReading(start+timedelta(hours=i),120) for i in range(96)]
        store=self.store(cgm,[meal(2,23,0,carbs=40,dose=4)])
        store._snaps=[snapshot(0,10,12),snapshot(1,9,12),snapshot(2,9,13),snapshot(3,8,13)]
        pin=start+timedelta(days=1)
        record={'kind':'trial','parameter':'carb_ratio','block':[1320,120],'members':[1320,0],'detected_at':str(pin),
                'comparison_context':capture_comparison_context(store,at=pin,input_revision=1)}
        result=self.compare(store,record,start+timedelta(days=4))
        self.assertEqual(result['periods']['after']['end'],str(start+timedelta(days=3)))
        self.assertEqual(result['denominators']['after']['contributing_meals'],1)
        self.assertGreater(result['denominators']['after']['readings'],0)

    def test_profile_progress_withholds_direction_before_thirty_days(self):
        helper=SupportedComparisonTest()
        store,record,end=helper.dense_profile()
        result=self.compare(store,record,end)
        self.assertFalse(result['readiness']['after']['criterion_met'])
        self.assertEqual(result['readiness']['after']['required_elapsed_days'],30)
        self.assertEqual(result['readiness']['after']['elapsed_days'],16)
        tir=next(r for r in result['outcomes'] if r['key']=='tir')
        self.assertIsNotNone(tir['assessment']['interval'])
        self.assertEqual(tir['assessment']['state'],'unclear')

    def test_focus_known_override_remains_visible_without_harm_measurement(self):
        from tests.test_classifier_user_override import override_correction
        start=datetime(2026,5,1)
        bolus=[override_correction(start+timedelta(days=d,hours=12),requested=5) for d in range(40)]
        store=self.store([],bolus)
        record=self.focus(store,start+timedelta(days=20),lever='user_override')
        result=self.compare(store,record,start+timedelta(days=40))
        self.assertTrue(result['readiness']['after']['criterion_met'])
        arm=result['adherence']['after']
        self.assertEqual(arm['rate'],1)
        self.assertEqual(arm['measured_opportunities'],20)
        self.assertEqual(arm['harm_availability']['state'],'unavailable')
        self.assertIsNone(next(r for r in result['outcomes'] if r['role']=='mapped_outcome')['after'])
        self.assertEqual(result['periods']['after']['end'],str(start+timedelta(days=40)))

    def test_ic_eight_effective_runs_on_thirteen_dates_have_no_generic_floor(self):
        from dataclasses import replace
        from scripts.gen_estimator_truth import chained_run_sets
        from ciq_autotune.settings import Snapshot
        truth=chained_run_sets()[0]
        removed={datetime.fromisoformat(t).date() for t in
                 ('2026-01-31','2026-02-03','2026-02-06','2026-02-21','2026-02-24')}
        bolus=[b for b in truth['events'] if b.t.date() not in removed]
        pin=truth['analysis_end']
        shift=timedelta(days=90)
        cgm=truth['cgm_readings']
        snaps=truth['snapshots']
        settings=snaps[-1].settings
        changed=replace(settings,profiles=tuple(replace(p,segments=tuple(
            replace(s,carb_ratio=5.8) if s.start_min==0 else s for s in p.segments))
            for p in settings.profiles))
        store=_FakeStore(cgm=cgm+[replace(r,t=r.t+shift) for r in cgm],
            bolus=bolus+[replace(b,t=b.t+shift,seq_num=(b.seq_num or 0)+100000,
                                carb_ratio=5.8 if b.t.hour<12 else b.carb_ratio) for b in bolus],
            snaps=snaps+[Snapshot(pin,changed)])
        record={'kind':'trial','parameter':'carb_ratio','block':[0,720],'members':[0],'detected_at':str(pin),
                'comparison_context':capture_comparison_context(store,at=pin,input_revision=1)}
        result=self.compare(store,record,pin+shift)
        for arm in ('before','after'):
            self.assertAlmostEqual(result['readiness'][arm]['observed'],8)
            self.assertEqual(len(result['readiness'][arm]['contributing_dates']),13)
            self.assertTrue(result['readiness'][arm]['criterion_met'])
        self.assertTrue(all(r['assessment']['state'] in ('unclear','context') for r in result['outcomes']))
        self.assertFalse(any('14 informative' in reason for r in result['outcomes'] for reason in r['assessment']['reasons']))
        # A manufactured dense known-signal trace exercises the directional gate,
        # not just its progress label, with the same eight source-owned runs.
        dense={r.t:r for r in store._cgm}
        for b in store._bolus:
            if not b.carbs:
                continue
            for minute in range(-10, 556, 5):
                t=b.t+timedelta(minutes=minute)
                dense.setdefault(t,CgmReading(t,120))
        for b in store._bolus:
            if b.t < pin and b.t.hour < 12 and b.carbs:
                for minute in range(60,120+5*(b.t.day%3),5):
                    t=b.t+timedelta(minutes=minute)
                    dense[t]=CgmReading(t,220)
        store._cgm=sorted(dense.values(),key=lambda r:r.t)
        store._cgm=[replace(r,bg=r.bg-40) if r.t>=pin and r.bg is not None else r for r in store._cgm]
        signal=self.compare(store,record,pin+shift)
        self.assertTrue(all(r['criterion_met'] for r in signal['readiness'].values()))
        self.assertEqual(next(r for r in signal['outcomes'] if r['key']=='tir')['assessment']['state'],'favorable')
