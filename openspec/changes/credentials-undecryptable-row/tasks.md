# Tasks — An undecryptable credential row reads as unconfigured (#351)

## 1. Degrade an unreadable row to "no usable credentials"

- [ ] In `ciq_autotune/credentials.py`, wrap the single `decrypt` call in
      `load_credentials` in a `try`/`except` for `cryptography.fernet.InvalidToken`
      and return `None` from that handler. Import `InvalidToken` **inside** the
      function: this module defers every `cryptography`/`tconnectsync` import to
      call time so the stdlib-only core imports without the extras, and a
      module-level import would break that.
- [ ] Return from the handler immediately. Do not fall through to the `.env`
      fallback below it: that fallback is conditioned on an empty table, and an
      undecryptable row is not one.
- [ ] Emit exactly one `logger.warning` from that handler, through a module-level
      `logger = logging.getLogger(__name__)` (stdlib `logging`, matching
      `fetch_loop.py` and `config.py`). It names the key path and the recovery —
      re-entering credentials through `POST /api/credentials` — and must not
      include the stored email, the password, or the row's ciphertext.
- [ ] Say what the code now does in the module docstring, at the sentence that
      already promises the key can be lost without a lockout.
- [ ] Leave `save_credentials`, `_fernet`, the `.env` fallback's own logic, and
      both callers (`ciq_autotune/api.py`, `ciq_autotune/sync.py`) unchanged.

## 2. Pin the behavior through the public interface

- [ ] `tests/test_credentials.py`: a row saved under one key and read after the
      key file is replaced with a freshly generated one returns `None` rather
      than raising, and emits exactly one `WARNING` on the
      `ciq_autotune.credentials` logger whose text contains none of the email,
      the password, or the stored ciphertext. This test fails first, as an
      uncaught `InvalidToken`.
- [ ] `tests/test_credentials.py`: with usable `tconnectsync.secret` values
      patched in, that same undecryptable row is still not replaced — the call
      returns `None` and `store.get_credentials()["password_encrypted"]` is
      byte-identical to what it was before the call.
- [ ] `tests/test_api.py`: `GET /api/credentials`, on an app whose `key_path`
      cannot decrypt the stored row, answers `200` with `configured` false and a
      null `email`. This test fails first, as a `500`.
- [ ] Build every fixture from the module's own `save_credentials` and a locally
      generated `Fernet` key. No real address, password or database goes into a
      test.

## 3. State the read-boundary behavior in the specification

- [ ] In `openspec/specs/credentials/spec.md`, under the existing requirement
      *Losing the encryption key means re-entering credentials, not losing
      history*, say what "inaccessible" means where it is read: the capability
      answers no usable credentials, so `GET /api/credentials` reports
      `configured: false`, a live pull raises its not-configured error, `.env` is
      still not consulted, and the stored row is left in place for the operator's
      re-entry to replace.
- [ ] Rewrite that requirement's existing `#### Scenario: Losing the encryption
      key means re-entering credentials, not losing history` in place: replace its
      placeholder body (`WHEN the capability evaluates the behavior described by
      this requirement` / `THEN the stated behavior applies`) with the
      read-boundary behavior stated above. Keep the scenario's heading as it
      stands, and add no second scenario.
- [ ] Change no other requirement, and no other specification.

## 4. Leave the already-correct documents alone

- [ ] `README.md`, `AGENTS.md`, `docker-compose.yml` and
      `ciq_autotune/api.py` already describe the behavior this change delivers.
      They are the closed inventory for this promise and none of them moves.
