# Evidence — Diagnose ALIGN returns to the inspector edge

All renders use committed synthetic inputs. No personal or production health
data appears here.

## Provenance

- Base: integration base `261d972`, served with `uv run harmonic serve
  --no-fetch --port 8876 --db mockups/revise-e2e.synthetic/harmonic.sqlite`.
- Revision: this change, served with the same no-fetch command and generated
  SQLite source.
- Capture: the replay's exported `openApp` booted the served app, then selected
  `24 h` and the **Over-treated low** factor case before Playwright captured the
  viewport.
- Deterministic API reads: `mockups/diagnose-workstation.synthetic/payload.json`
  and the generated findings-projection mirror.

## Matrix

`base/` and `revision/` contain identically framed `align-shown` pairs at:

- 1440×900 in Light and Dark;
- 1024×900 in Light and Dark; and
- 390×844 in Light and Dark.

## Review observations

- At 1440×900 and 1024×900, base ALIGN ends at the inspector edge; revision
  ALIGN begins at that edge.
- At 1024×900, the base WINDOW group is clipped and the revision WINDOW group
  is not.
- At 390×844, the narrow flex rail makes the track change inert, so the paired
  renders match as expected.
