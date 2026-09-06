"""Credential storage tests (needs the cryptography dependency, scoped to the
api/sync extras; skipped if it isn't installed).

No network involved: these cover Fernet round-tripping and the DB-first /
.env-fallback-and-seed resolution order, not the live t:connect login (see
CLAUDE.md - that's untestable without real credentials).
"""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

try:
    import cryptography  # noqa: F401
    _HAS_CRYPTOGRAPHY = True
except ImportError:  # pragma: no cover
    _HAS_CRYPTOGRAPHY = False

from ciq_autotune.store import Store


@unittest.skipUnless(_HAS_CRYPTOGRAPHY, "cryptography (api/sync extra) not installed")
class CredentialsTest(unittest.TestCase):
    def setUp(self):
        from ciq_autotune import credentials as creds_mod
        self.creds_mod = creds_mod
        self.store = Store.open(":memory:")
        self.tmpdir = tempfile.TemporaryDirectory()
        self.key_path = str(Path(self.tmpdir.name) / "secret.key")

    def tearDown(self):
        self.store.close()
        self.tmpdir.cleanup()

    def test_no_db_row_and_no_env_returns_none(self):
        with patch("tconnectsync.secret.TCONNECT_EMAIL", "email@email.com"), \
             patch("tconnectsync.secret.TCONNECT_PASSWORD", "password"):
            self.assertIsNone(self.creds_mod.load_credentials(self.store, key_path=self.key_path))

    def test_save_then_load_round_trips_password(self):
        self.creds_mod.save_credentials(self.store, "me@example.com", "hunter2", "US",
                                        key_path=self.key_path)
        creds = self.creds_mod.load_credentials(self.store, key_path=self.key_path)
        self.assertEqual(creds.email, "me@example.com")
        self.assertEqual(creds.password, "hunter2")
        self.assertEqual(creds.region, "US")

    def test_password_is_encrypted_at_rest(self):
        self.creds_mod.save_credentials(self.store, "me@example.com", "hunter2", "US",
                                        key_path=self.key_path)
        row = self.store.get_credentials()
        self.assertNotIn(b"hunter2", row["password_encrypted"])

    def test_key_file_is_created_on_first_use(self):
        self.assertFalse(Path(self.key_path).exists())
        self.creds_mod.save_credentials(self.store, "me@example.com", "hunter2", "US",
                                        key_path=self.key_path)
        self.assertTrue(Path(self.key_path).exists())

    def test_reusing_the_same_key_file_decrypts_across_calls(self):
        self.creds_mod.save_credentials(self.store, "me@example.com", "hunter2", "US",
                                        key_path=self.key_path)
        key_bytes = Path(self.key_path).read_bytes()
        # A second call must reuse the existing key file, not regenerate one.
        creds = self.creds_mod.load_credentials(self.store, key_path=self.key_path)
        self.assertEqual(Path(self.key_path).read_bytes(), key_bytes)
        self.assertEqual(creds.password, "hunter2")

    def test_env_fallback_used_when_db_empty(self):
        with patch("tconnectsync.secret.TCONNECT_EMAIL", "real@example.com"), \
             patch("tconnectsync.secret.TCONNECT_PASSWORD", "real-pass"), \
             patch("tconnectsync.secret.TCONNECT_REGION", "EU"):
            creds = self.creds_mod.load_credentials(self.store, key_path=self.key_path)
        self.assertEqual(creds.email, "real@example.com")
        self.assertEqual(creds.password, "real-pass")
        self.assertEqual(creds.region, "EU")

    def test_env_fallback_seeds_the_db(self):
        with patch("tconnectsync.secret.TCONNECT_EMAIL", "real@example.com"), \
             patch("tconnectsync.secret.TCONNECT_PASSWORD", "real-pass"), \
             patch("tconnectsync.secret.TCONNECT_REGION", "US"):
            self.creds_mod.load_credentials(self.store, key_path=self.key_path)
        self.assertIsNotNone(self.store.get_credentials())

    def test_missing_sync_extra_returns_none_instead_of_raising(self):
        # api-only install (no tconnectsync): no .env fallback is possible,
        # that must read as "not configured", not crash the /credentials route.
        with patch.dict("sys.modules", {"tconnectsync": None}):
            creds = self.creds_mod.load_credentials(self.store, key_path=self.key_path)
        self.assertIsNone(creds)

    def test_undecryptable_row_reads_as_unconfigured(self):
        # A snapshot moved to another machine, or a regenerated secret.key: the
        # row stays, the key no longer opens it. That is one more "no usable
        # credentials" case, not an exception out of the loader (#351).
        from cryptography.fernet import Fernet
        self.creds_mod.save_credentials(self.store, "me@example.com", "hunter2", "US",
                                        key_path=self.key_path)
        stored = self.store.get_credentials()["password_encrypted"]
        Path(self.key_path).write_bytes(Fernet.generate_key())

        with self.assertLogs("ciq_autotune.credentials", level="WARNING") as logged:
            creds = self.creds_mod.load_credentials(self.store, key_path=self.key_path)

        self.assertIsNone(creds)
        self.assertEqual(len(logged.records), 1)
        message = logged.records[0].getMessage()
        # The warning names the key file and the recovery, never the credential.
        self.assertIn(self.key_path, message)
        self.assertIn("/api/credentials", message)
        self.assertNotIn("me@example.com", message)
        self.assertNotIn("hunter2", message)
        self.assertNotIn(stored.decode("utf-8"), message)

    def test_undecryptable_row_is_not_reseeded_from_env(self):
        # The .env fallback is conditioned on an empty table, and an unreadable
        # row is not one: falling through would let a stale .env overwrite what
        # was set through the API, and re-entry there is the recovery (#351).
        from cryptography.fernet import Fernet
        self.creds_mod.save_credentials(self.store, "db@example.com", "db-pass", "US",
                                        key_path=self.key_path)
        stored = self.store.get_credentials()["password_encrypted"]
        Path(self.key_path).write_bytes(Fernet.generate_key())

        with patch("tconnectsync.secret.TCONNECT_EMAIL", "env@example.com"), \
             patch("tconnectsync.secret.TCONNECT_PASSWORD", "env-pass"), \
             patch("tconnectsync.secret.TCONNECT_REGION", "EU"), \
             self.assertLogs("ciq_autotune.credentials", level="WARNING"):
            creds = self.creds_mod.load_credentials(self.store, key_path=self.key_path)

        self.assertIsNone(creds)
        self.assertEqual(self.store.get_credentials()["password_encrypted"], stored)

    def test_db_credentials_take_priority_over_env(self):
        self.creds_mod.save_credentials(self.store, "db@example.com", "db-pass", "US",
                                        key_path=self.key_path)
        with patch("tconnectsync.secret.TCONNECT_EMAIL", "env@example.com"), \
             patch("tconnectsync.secret.TCONNECT_PASSWORD", "env-pass"):
            creds = self.creds_mod.load_credentials(self.store, key_path=self.key_path)
        self.assertEqual(creds.email, "db@example.com")


if __name__ == "__main__":
    unittest.main()
