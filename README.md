# Harmonic

Local, **advisory** tuning from your own pump data. No Tidepool, no Nightscout,
no central service — a self-hostable pipeline that pulls your pump history into a
local SQLite file and analyzes **basal, ISF, and I:C** and surfaces **behavioral
coaching** from it.

**Current compatibility:** Harmonic imports data from Tandem Source™ for Tandem
pumps using Control-IQ® technology. Harmonic may support other pump systems in
the future.

Harmonic is an independent project. It is not affiliated with, endorsed by,
sponsored by, or supported by Tandem Diabetes Care, Inc. Control-IQ® and Tandem
Source™ are trademarks of Tandem Diabetes Care, Inc.

> ⚠️ **Not medical advice.** This is a personal analysis tool. It only ever
> *suggests* numbers and never changes anything on your pump. Every estimate is
> shown with its uncertainty and the evidence behind it, gated by nothing but
> your and your clinician's judgment. Talk to your clinician before changing any
> pump setting. The responsibility for any change is yours.

Design decisions and planning live in [GitHub issues](https://github.com/harmonichq/harmonic/issues), not a static roadmap doc.

## How it works

Control-IQ already adjusts your basal every 5 minutes. The trick this tool uses
is to **read off what it actually delivered** during *clean windows* — stretches
where no meal/correction bolus is still acting, glucose is in range and flat,
basal isn't suspended, and you're clear of site changes, suspensions, and
exercise. Over enough clean windows, the **median** delivered basal by
time-of-day approximates your true basal need. (Median, not mean: its clean
delivery is right-skewed — it adds corrective basal when glucose runs
high-but-in-range, a tail from its activity, not baseline need.) Each half-hour
slot is confidence-gated: thin slots get no suggestion rather than a guess.

"No bolus still acting" needs insulin-on-board, but Tandem Source has no dense
IOB feed — so the tool reconstructs **bolus** IOB from the bolus log with a
standard exponential insulin-activity curve (tunable peak / DIA). The same curve
is the groundwork for later ICR/ISF tuning.

Tandem Source tags every basal record with its source (`Profile` vs `Algorithm`
vs `Temp` vs `Suspended`), which is what makes it possible to separate Control-IQ's
algorithm activity from your programmed profile.

**The wider model (v0.1).** Every analyzer funnels into one versioned
`AnalysisResult`; the CLI prints it and the HTTP API serves it as JSON (same
contract, two renderers). On top of basal:

- **ISF** is measured from clean correction→response windows (including Control-IQ's
  automatic corrections) and compared to your programmed value, with an
  aggressiveness knob — ISF, not basal, is the lever that pulls your setpoint
  toward Control-IQ's built-in 110 target.
- **I:C + carb counting** is one engine over post-meal correction burden: a
  *systematic* excess implies a tighter ratio, while a *high-variance* burden
  flags inconsistent carb counting instead.
- **Behavioral detectors** flag not-pre-bolusing, correction-stacking, and
  unannounced meals — an extensible registry contributors can add to.

Nothing is blanked: thin data shows a **wide confidence interval and its `n`**,
not a gap. ISF/I:C measurements use the full requested analysis window; setting
epochs for ISF/I:C now drive caveats and settling, while basal setting epochs keep
per-slot basal measurement cuts so a basal edit does not starve unrelated slots. ISF/I:C
history is reconstructed forward-only by snapshotting and diffing pump settings
each fetch (Tandem emits no settings-change event).

## Install

Uses [uv](https://docs.astral.sh/uv/). The core (store + model + CLI) is
stdlib-only; live `fetch` needs the optional `sync` extra and the HTTP API needs
the `api` extra.

```sh
uv sync --extra sync --extra api
```

## Configure

Live fetch authenticates against Tandem Source. Copy the example env file and
fill in your credentials:

```sh
cp .env.example .env
$EDITOR .env   # TCONNECT_EMAIL, TCONNECT_PASSWORD, TCONNECT_REGION, TIMEZONE_NAME
```

`.env` is gitignored — credentials never get committed. `TIMEZONE_NAME` must
match the timezone your **pump** is set to; it defines the wall clock every
record is bucketed by (a basal profile is a wall-clock schedule).

## Workflow

```sh
# 1. Pull pump history into the local store (also snapshots current settings).
uv run harmonic fetch --days 120

# 2. Run the full model — basal, ISF, I:C, and behavioral — over one result.
uv run harmonic analyze                 # human-readable text
uv run harmonic analyze --json          # the AnalysisResult as JSON
uv run harmonic analyze --aggressiveness 0.5   # tighter ISF (with hypo framing)

# 3. Serve the same result over HTTP and the web UI (localhost; set
#    HARMONIC_API_TOKEN to gate it — the UI then expects that token pasted into
#    its Settings page). Starts an hourly background fetch loop too.
uv run harmonic serve                   # web UI at http://127.0.0.1:8765/
uv run harmonic serve --host 0.0.0.0 --port 8765 --token secret

# Basal-only views are still here:
uv run harmonic basal                   # just the basal suggestion table
uv run harmonic backtest                # score basal on held-out days
uv run harmonic report --plot           # markdown advisory + why-plot
```

The most-used routes are GET `/api/analyze`, POST `/api/fetch`, GET/POST
`/api/credentials`, GET `/api/status`, GET `/api/pump-settings`, GET
`/api/report`, and GET `/api/health`, plus the UI at `/diagnose`.
They are a small sample. The server registers roughly seventy routes, about half
of them data endpoints — the Diagnose findings queue, event comparisons,
scenarios, the Plan draft and its history, Verify trials, outcomes and their
trend, the carb log, prompts, focus, the timeline, backtests, the model view and
more — and the rest the static files the UI loads. The complete list is
browsable at `/api/docs` (FastAPI's Swagger UI) once `serve` is running.

`fetch` is idempotent: re-pulling an overlapping window merges rather than
duplicates, so you can run it repeatedly. Windows longer than 31 days are split
into 31-day requests automatically (t:connect rejects longer ones). Each fetch
also appends a settings snapshot, which is how ISF/I:C history accumulates over
time.

The database defaults to `tconnect-data/ciq.db`, inside the gitignored data
folder. The pump serial number in the raw CGM feed is intentionally **not**
stored.

## Deployment (Docker)

Run the server (API + web UI on one port) as a container, for single-user
self-hosting. The image is a pinned `python:3.12-slim-bookworm` (not Alpine —
musl makes `cryptography` painful to build) and carries no Node, because the SPA
has no build step. One volume at `/app/tconnect-data/` holds the SQLite database
and the Fernet key together, and the entrypoint refuses to start without
`TIMEZONE_NAME`.

```sh
# Set your pump's timezone in docker-compose.yml (TIMEZONE_NAME), then:
docker compose up -d            # pull the published image + start in background
docker compose logs -f          # watch startup / the hourly fetch loop
```

The web UI is then at `http://localhost:8765/`. By default compose runs the
image CI publishes to `ghcr.io/harmonichq/harmonic:latest` on every merge
to `main`, so updating is just `docker compose pull && docker compose up -d`. To
build from a local checkout instead, uncomment `build: .` in the compose file.

**`TIMEZONE_NAME` is required** and must match your pump's timezone — it sets
the wall clock every record is bucketed by. The container exits immediately if
it is unset (fail-fast beats a silent "data won't update").

**Credentials.** Two ways to seed your Tandem login:

- Set `TCONNECT_EMAIL` / `TCONNECT_PASSWORD` / `TCONNECT_REGION` in the compose
  file. On first run they seed the encrypted credentials table; after that,
  editing them has no effect (credentials resolve DB-first).
- Or leave them unset and POST to `/api/credentials` once the server is up. The
  fetch loop records an error to `/api/status` and keeps serving until credentials
  exist — no restart needed.

**The API is open unless you set a token.** `HARMONIC_API_TOKEN` gates all three
dozen or so data endpoints — not just the handful listed above, but everything
the UI reads: your glucose history, your insulin delivery, your pump settings
and every suggestion derived from them. `docker-compose.yml` publishes port
8765, so **set a token** unless the host is truly private — an unset token
leaves all of it readable by anyone who can reach the port.

**One volume holds the DB and the encryption key together.**
`tconnect-data/` (mounted as the `harmonic-data` named volume) contains both
`ciq.db` and `secret.key`, the Fernet key that decrypts your stored password.
**Losing `secret.key` means re-entering credentials** (not losing data), so it
must live on the volume — never bake it into an image.

**One-time migration for existing Compose installs.** The service and named
volume were renamed for Harmonic. Before the first start after upgrading, stop
the old container and copy both files into the new volume (including
`secret.key`):

```sh
# Compose lowercases the project name and removes characters outside
# [a-z0-9_-]. If COMPOSE_PROJECT_NAME is set in .env, export it in this shell
# too; Compose reads .env, but this shell expansion does not.
PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}"
PROJECT="$(printf '%s' "$PROJECT" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')"
SOURCE_VOLUME="${PROJECT}_ciq-autotune-data"
TARGET_VOLUME="${PROJECT}_harmonic-data"
docker compose down --remove-orphans
docker volume inspect "$SOURCE_VOLUME" >/dev/null 2>&1 || {
  echo "source volume not found — run: docker volume ls | grep ciq-autotune-data, then use that exact name" >&2
  exit 1
}
docker volume create "$TARGET_VOLUME" >/dev/null
docker run --rm \
  -v "$SOURCE_VOLUME:/from:ro" \
  -v "$TARGET_VOLUME:/to" \
  alpine sh -c '[ -z "$(ls -A /to)" ] || { echo "harmonic-data not empty — already migrated" >&2; exit 1; }; cp -a /from/. /to/'
docker compose up -d --remove-orphans
```

Compose names each volume `<project>_<volume-key>`; the commands above use the
configured project name (or this directory's name), matching the old
`ciq-autotune-data` and new `harmonic-data` keys in `docker-compose.yml`. This
guard refuses a missing source volume and refuses to overwrite a populated
destination. A raw `docker run` install may instead have the unprefixed
`ciq-autotune-data` volume; stop that container manually and use its exact
volume name. This is a one-time migration; subsequent updates can use `docker
compose pull && docker compose up -d` normally.

**First run / smoke-test without a live login.** Set `HARMONIC_NO_FETCH=1` to skip
the startup Tandem login (OAuth PKCE, may prompt 2FA). Useful to bring the
server up against an empty DB before credentials exist. Leave it unset for
normal operation.

## Status

**v0.1**: the full model (basal hardened, ISF, I:C + carb counting, behavioral
detectors) over one `AnalysisResult`, rendered by both the CLI and a localhost
HTTP API. First real fetch run validates the Tandem Source login on your account.

**Web UI**: built. Four working surfaces, each covered by browser gates in CI:

- **Day** — one day at a time: the glucose trace against what insulin actually
  ran, and the model's own account of what it saw.
- **Diagnose** — the ranked findings queue and the settings audit. Each
  suggested basal, ISF or I:C change is read beside the evidence behind it, and
  a suggestion the data cannot support is held rather than offered.
- **Plan** — stage the changes you accept into a draft profile, read the whole
  schedule as your pump would run it, then apply it.
- **Verify** — after a change, the before-and-after comparison that says whether
  it did what it was meant to.

Alongside them: App settings (encrypted credential storage, the hourly fetch
loop), Pump settings, the detailed report, and a Guide. Harmonic still only
**advises** — it never writes to your pump.

Still future work: scheduled auto-fetch beyond the hourly loop, change-triggered
notifications, and mmol/L display — tracked as [GitHub issues](https://github.com/harmonichq/harmonic/issues).

## Licence

Harmonic is **source-available**, licensed under [PolyForm Noncommercial
1.0.0](LICENSE). You may read, run, modify, and share it for any noncommercial
purpose — self-hosting your own instance included. Commercial use, including
running Harmonic as a service for paying users or using it inside a for-profit
practice, needs a separate licence from the author. Code contributions are not
solicited; bug reports are, on the issue tracker.
