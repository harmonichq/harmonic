"""Reproduction for issue #351 — an undecryptable credentials row.

Entirely synthetic: a throwaway database in a temporary directory, a made-up
address and password, and two locally generated Fernet keys. It never opens a
real snapshot and prints no credential material — the stored password is
replaced on disk before anything is read back.

    uv run python docs/scope/351-credentials-repro.py

Before the fix this prints ``raised: InvalidToken`` and ``status: 500``. After
it, ``returned: None`` and ``status: 200 configured=False``.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

from ciq_autotune import credentials
from ciq_autotune.api import create_app
from ciq_autotune.store import Store


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        db = str(Path(tmp) / "harmonic.sqlite")
        key = str(Path(tmp) / "secret.key")

        with Store.open(db) as store:
            credentials.save_credentials(
                store, "nobody@example.invalid", "synthetic-password", "US",
                key_path=key,
            )

        # The reported state: a snapshot moved to another machine, or a
        # secret.key lost and regenerated. The row stays; the key no longer
        # opens it.
        Path(key).write_bytes(Fernet.generate_key())

        try:
            with Store.open(db) as store:
                print("returned:", credentials.load_credentials(store, key_path=key))
        except Exception as error:
            print("raised:", type(error).__name__)

        app = create_app(db_path=db, token=None, key_path=key, enable_fetch_loop=False)
        client = TestClient(app, raise_server_exceptions=False)
        response = client.get("/api/credentials")
        if response.status_code == 200:
            print("status:", response.status_code,
                  "configured=%s" % response.json()["configured"])
        else:
            print("status:", response.status_code,
                  "content-type=%s" % response.headers.get("content-type"),
                  "body=%r" % response.text[:64])


if __name__ == "__main__":
    main()
