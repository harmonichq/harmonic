# Design — Pane header single seam (#59)

## Existing ruling

No new visual decision is made here. `frontend/theme.css` already defines the
pane-header role and states that the canvas and inspector headers share one
height so their divider reads as a single seam. This change makes the rendered
surface satisfy that existing rule.

## Revision provenance

- **Base:** `812fb19`, the `origin/main` tip from which
  `codex/59-header-seam` was cut.
- **Safe-start declaration:** `AGENTS.md`, “The data boundary”.
- **Command:** `uv run harmonic serve --no-fetch --db
  mockups/revise-e2e.synthetic/harmonic.sqlite`.
- **Data source:** `mockups/revise-e2e.synthetic/harmonic.sqlite`, a committed
  database generated entirely by `scripts/gen_revise_e2e_db.py`; no live fetch
  and no real pump data.

## Reproduction

Measured in headless Chromium against the safe running app at 1280×720:

- populated Diagnose: the canvas and inspector headers start at the same y
  coordinate, but render 30 px and 31 px tall respectively;
- the shipped Verify workstation skeleton renders the same 30 px / 31 px pair;
- both therefore place the canvas header's bottom rule one CSS pixel above the
  inspector header's rule.

The source matches the measurement: the role has a shared minimum height, while
Diagnose's `.canvas-pane` override and Verify's distinct `.hero-head` override
both give their canvas headers 4 px vertical padding; the inspector keeps the
base 8 px padding and its natural content box lands one pixel taller. The
implementation should normalize both consumers through the shared role without
disturbing their distinct horizontal padding and readout anatomy, not add
surface-specific offsets.

## Verification evidence

The rendered Cockpit regression failed before the shared-role correction in all
eight populated surface/viewport/theme entries. The canvas and inspector tops
matched; the canvas bottom was 115 px at 1440×900 and 111 px at 1280×800, while
the corresponding inspector bottom was one pixel lower. The same eight entries
passed after the correction.

Four representative synthetic renders are preserved beside this record under
`evidence/`: populated Diagnose in the light theme and populated Verify in the
dark theme, each before and after the shared-role correction. The complete
eight-entry matrix remains local review evidence:

- before: `/tmp/harmonic-59-before.4DQbP1/`;
- after: `/tmp/harmonic-59-after.VrHcOq/`.

The post-fix safe running app also measured 30 px / 30 px at 1280×720 in light
and dark themes. The frozen behavior replays passed unchanged: Verify 8/8 and
Diagnose 42/42 stories.
