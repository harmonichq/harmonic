## MODIFIED Requirements

### Requirement: Data endpoints are gated by one optional static bearer token; the app shell is not

There is no login screen and no session. The app shell and its assets load
unauthenticated; every data endpoint depends on a token check that compares the
request's `Authorization` header against `Bearer <token>` exactly, in constant time.
The liveness endpoint is also ungated. **If no token is configured the API is open**,
which the server SHALL allow only on a loopback bind: `serve` SHALL refuse to start on
any other address with no token, from its flag or the environment. A server with a
token SHALL publish no generated API schema or documentation pages, because a page load
cannot carry the token. The token is a single shared secret for a single user; there
are no accounts, roles, or scopes.

#### Scenario: Data endpoints are gated by one optional static bearer token; the app shell is not

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

#### Scenario: A non-loopback bind with no token is refused

- **WHEN** `serve` is started on a non-loopback address with no token
- **THEN** it exits with an error naming `HARMONIC_API_TOKEN` and never binds

#### Scenario: A loopback bind may run open

- **WHEN** `serve` is started on a loopback address with no token
- **THEN** it binds, and the data endpoints and generated documentation answer without a token

#### Scenario: A token gates the data and removes the generated documentation

- **WHEN** a server with a token receives a data request without that exact token
- **THEN** it answers 401, and its schema and documentation paths answer 404
