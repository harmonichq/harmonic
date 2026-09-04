# Evidence — tapered urgency queue (#302)

Every artifact here is synthetic. No real patient data was read or rendered.

## Provenance

The before/after render matrix reads the live 24-hour showcase queue from two
separate scratch copies of `mockups/qa-e2e.synthetic/harmonic.sqlite`, generated
in full by `scripts/gen_qa_e2e_db.py`. The exact base
`ee1d46f0a309b38625c2f4eee0956f8d480468c3` ran from the detached
`/Users/connor/worktrees/harmonic/302-base` checkout on port 8873; the revision
ran from the ticket checkout on port 8874. Both used:

```
uv run harmonic serve --no-fetch --token '' --db <scratch copy> --port <port>
```

The replay uses a separate deterministic source. Static app bytes come from
the no-fetch localhost server, while `/api/diagnose/findings` is answered by
ADR 735's fixture-only mirror over the committed Diagnose payload or
`frontend/__fixtures__/findings-projection.json`'s inputs. The latter supplies
the priced queue used by S118 and S133–S138. The renderer does not use this
mirror: all localhost API requests continue to the served showcase.

## Replays

- `replay.base.stdout.txt` — frozen base replay: `app: 151 of 151 stories passed`.
- `replay.pre.stdout.txt` — unamended replay against the revised rail:
  `app: 149 of 151 stories passed`; S118 and S121 are the expected fail-first
  amendments.
- `replay.stdout.txt` — amended revision replay:
  `app: 157 of 157 stories passed`.
  That capture is this revision round against its own base. After merging
  `origin/main`, which issued its own S133-S138 for the basal night drill,
  this change's six stories were renumbered S139-S144 and the merged
  registry replays `app: 163 of 163 stories passed`.

All three are complete stdout captures. The final run has zero failures, zero
opener problems and no skipped story. The deliberate-red first execution of
S133–S138 reached each real browser state and failed six sentinels; S138 also
found the live Sift/stage mismatch that was folded back through the rail's
existing `queueRows` authority before the final replay.

## Renders

`render-states.mjs` opens one named state against one localhost server and first
byte-compares that server's queue module with `CHECKOUT_ROOT`, preventing a
base/revision frontend mix. Only the two shipping CDN modules are replaced by
the repository's persistent browser-gate copies; API requests reach the live
synthetic server.

The matrix contains 40 files under `renders/`:

- sides: `before`, `after`;
- states: `queue-root`, `watching-expanded`, `drill-compact`, `drill-tail`;
- viewports: 1440×900, 1280×800, 1024×768, 768×1024, 390×844;
- theme: Dark only.

Names are exactly `<side>-<state>-<width>x<height>.png`. At 390×844 the stage
is collapsed on both sides; the queue and its drilled/expanded state remain the
subject. The live round kept the one raised hero card, the settled type ladder
and spacing, and `MIN_ROW_MINI_WIDTH = 120`; those dated rulings are recorded in
`../design.md`.
