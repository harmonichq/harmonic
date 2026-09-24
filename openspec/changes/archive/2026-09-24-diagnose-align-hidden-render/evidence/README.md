# Evidence — Diagnose header ALIGN hidden rendering

All renders use committed synthetic inputs. No personal or production health data appears here.

## Provenance

- Base: `22660ad64fe2ebca7e62e8ff304b9de438150954`, served with `harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite --port 8871`.
- Revision: this change, served with the same no-fetch command and generated SQLite bytes.
- Deterministic app opening and API reads: `frontend/diagnose-workstation-behavior.replay.mjs` `openApp` with `mockups/diagnose-workstation.synthetic/payload.json`.

## Matrix

`base/` and `revision/` contain exact root pairs at 1440×900, 1024×900, and 390×844 in Light and Dark.

## Review observations

- At 1440×900 and 1024×900, base renders show ALIGN and its empty pill; revision renders show neither.
- At 390×844, the instrument rail may place ALIGN outside the viewport in both halves; the pair records the actual narrow framing without changing that pre-existing layout.
