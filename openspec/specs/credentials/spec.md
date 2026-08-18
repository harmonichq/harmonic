# Credentials

## Purpose

This capability manages Tandem Source login credentials — storing them encrypted in the local database and providing API endpoints to read and update them. It owns the encryption, key management, and the one-time fallback to environment-file configuration; the upstream `tconnectsync` library owns the actual OAuth login against Tandem Source.

## Requirements

### Requirement: Stored credentials take precedence; environment configuration is a one-time fallback

The capability checks the store's `credentials` table first. If a row exists, its encrypted password is decrypted and returned. Only if the table is empty does the capability consult the environment (via the `tconnectsync.secret` module's `TCONNECT_EMAIL`, `TCONNECT_PASSWORD`, and `TCONNECT_REGION`). If environment credentials are present and valid, they are encrypted and persisted to the table immediately, so all subsequent calls read from the store. After the first successful use of environment credentials, editing the `.env` file has no effect — credentials only change through the running service's `/credentials` API endpoint.

### Requirement: Credentials are encrypted at rest with Fernet; the key lives outside the database and is generated on first use

When credentials are saved, the password is encrypted using Fernet (the `cryptography` library) before being written to the store. The encryption key is generated on first use and written to a file outside the database (by default `tconnect-data/secret.key`), alongside but separate from the `.db` file. The key file is gitignored, like the database itself.

### Requirement: Losing the encryption key means re-entering credentials, not losing history

If the key file is lost or deleted, the encrypted password in the database becomes unrecoverable — the user must re-enter credentials via the API to decrypt and re-encrypt them with a new key. The historical event data in the database is not affected by key loss; only the credential row itself becomes inaccessible until new credentials are provided.

### Requirement: Credentials change through the API, not by editing configuration files after first use

Once credentials are stored in the database (either from a `.env` seed or direct API call), the only way to change them is through the `/credentials` POST endpoint. Editing or replacing the `.env` file has no effect; the capability ignores it as long as the store has an active credentials row. This prevents accidental override and stale-config confusion.

### Requirement: The `tconnectsync` library owns the OAuth login; this capability only stores and retrieves credentials

The actual login against Tandem Source is performed by the upstream `tconnectsync` library, which handles OAuth PKCE and possible 2FA prompts. This capability does not authenticate or validate credentials — it only encrypts them at the boundary (on save) and decrypts them (on load) to hand to `tconnectsync` for login.

