"""Encrypted Tandem credential storage — the plumbing the frontend's Settings
page (frontend phase 2) sits on (frontend phase 1).

Credentials live in the store's ``credentials`` table, the password encrypted
with Fernet (the ``api``/``sync`` extras' ``cryptography`` dependency). The
encryption key is generated on first use and written to a file *outside* the
DB (``tconnect-data/secret.key`` by default, gitignored alongside ``ciq.db``)
rather than a required env var, so there's no key to lose and get locked out
by.

A ``.env`` (``TCONNECT_EMAIL``/``PASSWORD``/``REGION``, read via tconnectsync's
``secret`` module) is a one-time fallback: consulted only while the DB has no
stored credentials, and the first successful use seeds the encrypted store.
Once the DB has credentials, ``.env`` is never read again, so a stale ``.env``
left on disk can't silently override what was set through the API.

Imports of the ``cryptography``/``tconnectsync`` extras are deferred to call
time, exactly like :mod:`~ciq_autotune.sync`, so core stays importable without
either extra installed.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

from .store import Store

DEFAULT_KEY_PATH = "tconnect-data/secret.key"

# The placeholder values tconnectsync's secret module defaults to when no real
# .env is present — not usable credentials, so not a fallback hit.
_PLACEHOLDER_CREDS = {None, "", "email@email.com", "password"}


@dataclass(frozen=True)
class Credentials:
    email: str
    password: str
    region: str


def _fernet(key_path: str):
    from cryptography.fernet import Fernet

    path = Path(key_path)
    if path.exists():
        key = path.read_bytes()
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        key = Fernet.generate_key()
        path.write_bytes(key)
    return Fernet(key)


def save_credentials(store: Store, email: str, password: str, region: str,
                      key_path: str = DEFAULT_KEY_PATH) -> None:
    """Encrypt and persist credentials, replacing any previously stored row."""
    encrypted = _fernet(key_path).encrypt(password.encode("utf-8"))
    store.set_credentials(
        email=email, password_encrypted=encrypted, region=region,
        updated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    )


def load_credentials(store: Store, key_path: str = DEFAULT_KEY_PATH) -> Optional[Credentials]:
    """DB-stored credentials if present, else a one-time ``.env`` fallback.

    An ``.env`` hit seeds the encrypted store, so the fallback only ever fires
    once per deployment — every call after that reads the DB.
    """
    row = store.get_credentials()
    if row is not None:
        password = _fernet(key_path).decrypt(row["password_encrypted"]).decode("utf-8")
        return Credentials(email=row["email"], password=password, region=row["region"])

    try:
        from tconnectsync import secret
    except ImportError:
        # The 'sync' extra isn't installed (e.g. api-only deployment) — no
        # .env to fall back to, just no credentials configured yet.
        return None

    email = secret.TCONNECT_EMAIL
    password = secret.TCONNECT_PASSWORD
    region = secret.TCONNECT_REGION
    if email in _PLACEHOLDER_CREDS or password in _PLACEHOLDER_CREDS:
        return None
    save_credentials(store, email, password, region, key_path=key_path)
    return Credentials(email=email, password=password, region=region)
