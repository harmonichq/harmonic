"""#447 spike: the watched change's anchor excludes settings snapshots.

`summarize_trend` anchors `now` at the latest basal, CGM or bolus instant.
`api._latest_instant` also counts settings snapshots. On the manufactured
`c3-trial` case (switch 2024-05-15 00:00, data through 2024-06-01 23:59), an
unchanged settings snapshot captured 2024-06-15 lies past the Trial's 28-day
watch horizon (2024-06-12). Reconciled at the data anchor, the Trial stays live
under the data anchor and reads as no active change under a snapshot-inclusive
anchor. Task 1.2's anchor test pins the first result, so an anchor that counts
snapshots fails it.

Run from the repository root (synthetic only; no port):
  PYTHONPATH=. uv run python docs/scope/447-trend-anchor.spike.py
"""
import json
import tempfile

from ciq_autotune.outcomes_trend import summarize_trend
from ciq_autotune.store import Store
from ciq_autotune.watched_change import active_watched_change, reconcile_follow_up
from scripts.qa_e2e_cases import QA_CASES, materialize_case

LATE_SNAPSHOT = "2024-06-15 00:00:00"


def main():
    path = tempfile.mkdtemp() + "/synthetic.sqlite"
    with Store.open(path) as store:
        materialize_case(store, next(c for c in QA_CASES if c.name == "c3-trial"))
        data = ([e.t for e in store.basal_events()] + [r.t for r in store.cgm_readings()]
                + [b.t for b in store.bolus_events()])
        anchor = max(data)
        store.upsert_settings_snapshot(LATE_SNAPSHOT, store.settings_snapshots()[-1].settings)
        with store.follow_up_transaction():
            reconcile_follow_up(store, now=anchor, recorded_at=anchor)
        with_snapshots = max(data + [s.captured_at for s in store.settings_snapshots()])
        served = summarize_trend(store, window_days=30).to_dict()["watched_change"]
        wrong = active_watched_change(store, None, None, None, now=with_snapshots)
    print(json.dumps({"data_anchor": str(anchor), "snapshot_anchor": str(with_snapshots),
                      "watched_change_at_data_anchor": served,
                      "watched_change_at_snapshot_anchor": wrong and wrong.to_dict()}, indent=1))
    assert served is not None and served["kind"] == "trial"
    assert wrong is None


if __name__ == "__main__":
    main()
