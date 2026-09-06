"""Encrypted Tandem credential storage — the plumbing the frontend's Settings
page (frontend phase 2) sits on (frontend phase 1).

Credentials live in the store's ``credentials`` table, the password encrypted
with Fernet (the ``api``/``sync`` extras' ``cryptography`` dependency). The
encryption key is generated on first use and written to a file *outside* the
DB (``tconnect-data/secret.key`` by default, gitignored alongside ``ciq.db``)
rather than a required env var, so there's no key to lose and get locked out
by. Lose or replace the key and the stored row simply stops being readable:
:func:`load_credentials` answers "no credentials configured" and logs one
warning, and re-entering them through ``POST /api/credentials`` re-encrypts
under the new key.

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

import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

from .store import Store

logger = logging.getLogger(__name__)

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

    ``None`` means "no usable credentials", which covers a stored row the key
    on disk can no longer decrypt as well as an empty table. The unreadable row
    is left in place and the ``.env`` fallback below is deliberately skipped:
    that fallback is for an empty table, and letting a stale ``.env`` re-seed
    over a row set through the API is the very thing it must not do.
    """
    row = store.get_credentials()
    if row is not None:
        # Deferred like every other cryptography import in this module, so core
        # stays importable without the api/sync extras.
        from cryptography.fernet import InvalidToken

        try:
            password = _fernet(key_path).decrypt(row["password_encrypted"]).decode("utf-8")
        except InvalidToken:
            logger.warning(
                "Stored credentials cannot be decrypted with the key at %s "
                "(lost or replaced); reading as not configured. Re-enter them "
                "via POST /api/credentials to re-encrypt under the current key.",
                key_path,
            )
            return None
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
