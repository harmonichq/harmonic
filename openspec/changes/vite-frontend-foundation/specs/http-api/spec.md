## MODIFIED Requirements

### Requirement: The service is local, self-hosted, and serves the app and the API on one port

There is no central service and no separate frontend server. The app factory binds
a loopback address by default; the same process serves the built single-page app
at `/` and its explicit page paths, the built assets below `/assets`, and every
JSON endpoint. The shell and page paths SHALL answer the built
`frontend/dist/index.html` with `Cache-Control: no-cache`; `/assets` SHALL be one
prefix-scoped directory route over `frontend/dist/assets` whose hashed files MAY
carry an immutable cache header. The page routes and every `/api` route are
declared outside that prefix, so a file on disk can never shadow an API route or
the index. When `frontend/dist/index.html` is absent the app factory SHALL log the
documented rebuild instruction once and the shell routes SHALL answer 503 naming
it; the service SHALL NOT serve `frontend/index.html` or any raw sibling source in
its place, and the API SHALL keep answering. Any route that reads a filename from
the request path (the knowledge-base articles) MUST restrict the slug to a fixed
lowercase-and-hyphen charset so a request cannot escape its directory.

#### Scenario: The service is local, self-hosted, and serves the app and the API on one port

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

#### Scenario: Built shell, built assets and the API stay distinct

- **GIVEN** a completed production build and a TestClient application
- **WHEN** a client requests `/`, every page path, every asset the built shell
  references, and API routes
- **THEN** the shell and assets answer from the build output with their expected
  content types and bytes
- **AND** `/api` routes keep their API behaviour and are not claimed by asset delivery
- **AND** no file under the build output names `unpkg.com` or `jsdelivr.net`
- **AND** an unknown `/assets` path, a non-page path and an unknown `/api` path
  answer 404

#### Scenario: A missing build fails closed

- **GIVEN** an application whose build output directory has no `index.html`
- **WHEN** a client requests `/` or a page path
- **THEN** the response is 503 and names the documented build command
- **AND** neither `frontend/index.html` nor any raw sibling asset is served
- **AND** `/api/health` still answers 200
