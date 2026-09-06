# An undecryptable credential row reads as unconfigured (#351)

## Why

The Fernet key that encrypts the stored t:connect password lives in a file
outside the database, and five places in this repository promise what happens
when that file is lost or replaced: the module docstring
(`ciq_autotune/credentials.py:8`, "there's no key to lose and get locked out
by"), `README.md:190`, `AGENTS.md:431`, a `docker-compose.yml:69` comment, and
the credentials specification's own requirement, *Losing the encryption key
means re-entering credentials, not losing history* — "only the credential row
itself becomes inaccessible until new credentials are provided".

The code does not honour that promise. `load_credentials` decrypts the stored
row with no handler, so a row that the on-disk key cannot open raises
`cryptography.fernet.InvalidToken` out of the function. Reproduced on a
throwaway database with two locally generated keys: `GET /api/credentials`
answers `500` with a bare `text/plain` body of `Internal Server Error` — not
even the API's own JSON `detail` shape — and the server logs a full traceback.
That is the state of any database snapshot moved to another machine, and of any
install whose `tconnect-data/secret.key` was lost or regenerated.

The cost is not confined to that endpoint. The app shell's cold load fires
`GET /api/credentials` first, so every visit to any screen ships a console error
and a server traceback, and the shell's `catch` turns the failure into "no
credentials configured" anyway — the same answer a correct degradation would
give, arrived at through a 500.

## What changes

- `load_credentials` catches `InvalidToken` around its one `decrypt` call and
  returns `None`: an unreadable row is no usable credentials, which is what this
  function already answers for every other unavailable case.
- It returns immediately rather than falling through to the `.env` fallback. An
  undecryptable row is still a row, and the specification's *Credentials change
  through the API, not by editing configuration files after first use*
  requirement means a stale `.env` must not silently replace it.
- One `logger.warning` marks the degradation for the operator, naming the key
  path and the recovery. It carries no email, no password and no ciphertext.
  Without it the only remaining signal would be silence.
- Both callers are already correct once `None` comes back, and neither moves:
  `GET /api/credentials` answers `200 {"configured": false, "email": null,
  "region": null}`, and a live pull raises its existing not-configured
  `RuntimeError` — which `POST /api/fetch` already maps to a typed `503` whose
  text names `/api/credentials` as the fix, and which the hourly loop already
  records as a failed attempt without dying.
- The credentials specification says what "inaccessible" means at the read
  boundary, so the requirement can be checked rather than interpreted.

## Risk contract

- **Must prevent:** an unreadable credential row crashing a read of
  `/api/credentials`; the stored password, its ciphertext, or the account email
  reaching a log line; a stale `.env` replacing a stored row that merely cannot
  be decrypted.
- **Must recover:** nothing automatically. Recovery stays what the specification
  already says it is — the operator re-enters credentials through
  `POST /api/credentials`, which replaces the row and re-encrypts it under the
  current key.
- **Accepted behavior:** an operator whose key is lost is told the same
  "not configured" as one who never configured credentials. That distinction
  lives in the server log, not in the API shape and not on any screen; drawing
  it in the interface is separate work.
- **Unsupported:** recovering the stored password without its key.
