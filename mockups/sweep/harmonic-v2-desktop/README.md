# Sweep evidence — harmonic-v2-desktop

Frozen observations behind `mockups/harmonic-v2-desktop.behavior.md`, produced by
`frontend/harmonic-v2-desktop-behavior.replay.mjs` against the ★ LOCKED
prototype at the lock's two target viewports.

**What these are, and what they are not.** Every file here records what the
**locked prototype** does. None of it is built-app fidelity evidence: `/v2/`
does not exist yet, so there is nothing to pair against. Paired
prototype/built-app renders, and the app-opener replay leg, belong to the build.
Nothing here is a regenerated fixture — the seven synthetic inputs were read, not
rewritten, and their bytes are pinned in `runs/retained-fixture-hashes.json`.

## `runs/` — raw command output, unmodified

Each `*.command.json` carries the exact command, environment, exit code and
captured streams as they were recorded; `*.stdout.txt` and `*.stderr.txt` are the
same streams as files. These bytes are not edited here.

| File | What it records |
|---|---|
| `sweep-1280x720.*` | the complete replay at 1280×720 — `executed 111 · failed 0 · deferred 18 · selected 129` |
| `sweep-1440x900.*` | the same at 1440×900 — identical totals |
| `negative-proof.*` | one feature-specific perturbation per mock-applicable story — `proved 111 · not proved 0 · selected 111 · owed 18`, exit 0 |
| `app-target-absent.*` | the app opener against the unbuilt `/v2/` — `executed 0 · failed 1`, exit 1. It fails closed rather than passing an absent surface |
| `capture-full.*`, `capture-changed.*` | the two capture commands whose successful outputs make up `captures/` |
| `retained-fixture-hashes.json` | SHA-256 and byte length of the seven synthetic inputs the sweep read |

The negative proof never edits the locked prototype: its perturbations are
transient and in-page, and the one story whose feature lives in module JS is
proved by serving that module through a route with a single line replaced, in
memory. `app-target-absent` is the standing proof that the 18 app-opener-only
obligations cannot be quietly satisfied by an unbuilt surface.

## `captures/` — 25 ids at both viewports

150 files (`.png`, `.html`, `.txt` per id per viewport) plus `manifest.json`,
which names for each id the story or checkpoint it came from, its source and
state, the DOM scope read, what it covers, per-file SHA-256, and the raw receipt
under `runs/` that produced it.

Each id either ran a story and captured where it **ends**, or drove the same
reader controls to an intermediate **checkpoint** and stopped — because the end
of a story is often not the state it tested: a failed save is retried, an answer
is undone, a logged entry is removed. Every id asserted its own caption against
the rendered text before any file was written.

Two ids scope to `.cockpit-shell` rather than the desk, because the claims they
carry — the destination switcher and the advisory line — are chrome that lives
outside `.gf`. Those two transcripts therefore also contain the prototype's
`.mockbar`, which is harness the ledger's S85 governs, present by construction.

The 50 captures came from **two** commands: the full run, then a second run for
the ids whose checkpoints were corrected. `manifest.json` combines their
successful outputs and says so; it is not a claim that one command wrote all 50.
