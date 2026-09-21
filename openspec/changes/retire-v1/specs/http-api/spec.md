## MODIFIED Requirements

### Requirement: The service is local, self-hosted, and serves the app and the API on one port

There is no central service and no separate frontend server. The app factory binds
a loopback address by default; the same process serves the one built browser shell
at `/` and its named page paths, that shell's built assets beneath `/assets/`, and
every JSON endpoint. The non-API route set is closed: each page path is a named
route, the built assets are the only mounted directory, and any other path answers
404, so a file on disk can never shadow an API route or the shell. Any route
that reads a filename from the request path (the knowledge-base articles) MUST
restrict the slug to a fixed lowercase-and-hyphen charset so a request cannot
escape its directory.

#### Scenario: The service is local, self-hosted, and serves the app and the API on one port

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

#### Scenario: One process answers the shell, its assets and the API

- **WHEN** the service is started
- **THEN** the same port answers the shell at `/`, a built asset beneath `/assets/`, and `/api/health`
- **AND** a path outside the named page set, the asset prefix and `/api` answers 404
