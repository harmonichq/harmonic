"""Warm one generated replay store's derived sidecar before any story serves it.

A running install keeps ``<db>.derived.sqlite`` across restarts and re-warms it
after every fetch, so its first visitor arrives warm. A ``--no-fetch`` replay
server never warms, and a fresh copy carries no sidecar, so without this every
story's arrival computed the whole fixed Diagnose roster cold — on a slow runner
past the opener's bound (#507). This runs the server's own warm roster once per
generated case, against that case's pristine source; each story then copies the
sidecar beside its own fresh store. Hits are exact on the store revision, so a
story's first write misses it exactly as a production write would.
"""
import sys

from ciq_autotune.api import create_app
from ciq_autotune.store import Store


def warm(path):
    with Store.open_readonly(path) as store:
        stamped = store.conn.execute(
            "SELECT 1 FROM sqlite_master WHERE name='synthetic_fixture_provenance'"
        ).fetchone()
        provenance = stamped and store.conn.execute(
            "SELECT synthetic FROM synthetic_fixture_provenance WHERE id=1"
        ).fetchone()
    if not provenance or provenance[0] != 1:
        raise ValueError("Replay warming requires a generated synthetic store")
    app = create_app(db_path=path, token="", enable_fetch_loop=False)
    for label, compute in app.state.recompute_roster():
        compute()
        print(f"warmed {label}")


if __name__ == "__main__":
    warm(sys.argv[1])
