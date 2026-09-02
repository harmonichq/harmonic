# Component harness

Vite-served stories for the Diagnose chart families, rendering the shipped
modules with hot reload. Stories take `?story=`, `?source=manufactured|live`,
and (for basal) `?slot=` — index or start-minute.

## The chart-review stack

Reviewing or revising a chart runs on three processes, started in this order:

1. **A local snapshot of your own database** — take it with the harmonic-db-fetch
   procedure (WAL-safe `.backup`, copy lives in session scratch, deleted after).
   Never the live file, never committed.
2. **A tokenless serve on port 8765**, which the harness's live source proxies:
   `TIMEZONE_NAME=<pump tz> uv run harmonic serve --no-fetch --db <snapshot copy> --port 8765 --token ''`.
   The `--no-fetch` flag is mandatory; the db argument is always a scratch copy.
   For a no-real-data live source, start the `harmonic-nofetch` launch entry; it
   copies the committed QA database to scratch before serving. Regenerate that
   source with `uv run python scripts/gen_qa_e2e_db.py` if it ever needs restoring.
3. **The harness itself**: `npm run dev` in this directory. The source dropdown
   switches manufactured fixtures against your real history; behavior questions
   read the fixtures, accuracy questions read the snapshot.

The full app (`harmonic serve` + the workstation) is a later verification rung,
not the review surface.

For text-heavy charts, sweep before shipping: render every real slot plus the
manufactured edge payloads and run the committed text-collision audit at each
rank (the basal suite's audit test is the pattern). One bespoke slot proving a
design is how a collapse hides.
