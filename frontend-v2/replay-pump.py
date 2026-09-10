"""Advance only the replay's manufactured pump snapshot through Store producers."""
import argparse
import json
from dataclasses import replace
from datetime import datetime, timedelta

from ciq_autotune.settings import ProfileSegment
from ciq_autotune.store import Store
from ciq_autotune.watched_change import reconcile_ingested_follow_up


def capture(path, mode):
    with Store.open(path) as store:
        provenance = store.conn.execute(
            "SELECT synthetic FROM synthetic_fixture_provenance WHERE id=1"
        ).fetchone()
        if not provenance or provenance[0] != 1:
            raise ValueError("Replay pump capture requires a generated synthetic store")
        record = store.follow_up_records("plan")[-1]
        original = record["deliverable"]["source_profile"]
        settings = store.settings_snapshots()[-1].settings
        rows = record["deliverable"]["rows"]
        if mode == "mismatch":
            # The next capture still has the original schedule: the recorded
            # proposal was not programmed. No new dose or threshold is invented.
            segments = tuple(ProfileSegment(**row) for row in original["segments"])
        else:
            segments = tuple(ProfileSegment(start_min=row["start_min"],
                **{key: row[key]["value"] for key in ("basal_rate", "isf", "carb_ratio", "target_bg")})
                for row in rows)
        profile = replace(settings.active(), segments=segments)
        if mode == "match":
            # Duplicate-and-switch is the public snapshot-only transition owner;
            # editing an unchanged active IDP requires dose-stream evidence.
            profile = replace(profile, idp=max(row.idp for row in settings.profiles) + 1)
            settings = replace(settings, active_idp=profile.idp, profiles=(*settings.profiles, profile))
        else:
            settings = replace(settings, profiles=tuple(
                profile if row.idp == settings.active_idp else row for row in settings.profiles))
        at = max(datetime.fromisoformat(record["applied_at"]),
                 store.settings_snapshots()[-1].captured_at) + timedelta(minutes=1)
        store.upsert_settings_snapshot(at.isoformat(sep=" "), settings)
        reconcile_ingested_follow_up(store)
        print(json.dumps({"synthetic": True, "capture": mode, "at": str(at),
                          "record": store.follow_up_record("plan", record["applied_at"])}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("db")
    parser.add_argument("mode", choices=["mismatch", "match"])
    args = parser.parse_args()
    capture(args.db, args.mode)
