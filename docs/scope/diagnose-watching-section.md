# Diagnose Findings queue: an un-sifted Watching section

Ticket: harmonichq/harmonic#97.

## Decisions

- **The un-sifted queue renders one visible `Watching` section boundary before
  the first held, blind, or history row, with those rows expanded beneath it;
  the sift-time collapse toggle is unchanged.** `inline`

  Why: `CONTEXT.md` (Audit, Watching) and `openspec/specs/surfaces/spec.md:20`
  already require held, still-collecting, and historical reads to "stay visible
  in a separate Watching section below" the action-ready queue. Today
  `frontend/diagnose-findings-queue.js` (`queueRows`, `collapsed = watching &&
  sifting`) separates them only during a sift; un-sifted they paint as ordinary
  `.qrow` peers with a muted tag. A collapsed-by-default section would hide
  what the spec says stays visible, so it is rejected. The section covers all
  three Watching registers, not history alone, because the term is defined
  over all three.

- **Frontend-only.** `inline` The server already orders registers
  `assert/finding < held < blind < history`
  (`ciq_autotune/findings_projection.py` `_REGISTER_RANK`) and publishes
  `counts.history`; no projection, mirror, or fixture change is required.

- **Ledger stories S41, S42, S29 stay true and are not amended; one new story
  freezes the un-sifted section.** `inline` Those stories read `#level .qrow`
  order, tag text, `data-state`, and tag right-edge alignment, all of which the
  section boundary leaves unchanged.

### Risk contract

- **Must prevent:** secret or real-data exposure; any change to which rows the
  server publishes, their order, register, tier, or action fields; a history
  or held row becoming stageable or reachable to Plan; frontend re-derivation
  of register from ratios, nulls, or id syntax; silent incorrect success (a
  green gate that never rendered a Watching row).
- **Must recover:** none beyond existing queue behavior; the change is a pure
  render of already-published rows.
- **Accepted failure:** a window with no Watching rows renders no section
  boundary at all (nothing to separate).
- **Unsupported:** changing the sift-collapse behavior, the case file, the
  canvas, or the server projection.
- **Evidence owed:** node test through `renderQueue`/`queueRows` that an
  un-sifted projection containing held/blind/history rows paints exactly one
  Watching boundary immediately before the first Watching row and none when no
  such row exists; replay story in the frozen ledger asserting the same against
  the built app with the synthetic payload; fast gate and browser gate green.

Why: Diagnose influences advisory insulin-dosing decisions; retired evidence
mistaken for a current finding is a misread with dosing consequences.
Disposition: `inline` — applies ADR 22 and the surfaces spec; no new decision.

## Open questions

- Visual treatment of the boundary (heading text `Watching` with a count vs. a
  quiet rule plus label) is a shipped-surface design call; default is a
  heading-style divider reusing `.tailnote`'s quiet register. Flagged to the
  human in the triage report; not blocking.

## Spawned tasks

- None.

## Plan-review rounds

