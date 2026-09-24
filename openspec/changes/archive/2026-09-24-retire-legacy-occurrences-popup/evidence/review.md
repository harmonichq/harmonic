# Review evidence — Retire the legacy occurrences popup (#52)

## Provenance

- Ticket base: `b075c715a497b55e684f966cf046dc9179f428ab`.
- Base app worktree: `/Users/connor/worktrees/harmonic/52-base` on temporary local branch `codex/52-base-evidence`.
- Revision app worktree: `/Users/connor/worktrees/harmonic/52` on `codex/52-retire-legacy-occurrences-popup`.
- Both app openers used the exact generated synthetic inputs pinned in
  `mockups/cockpit-shell.behavior.md`. No server, fetch, credentials, personal
  database, or network response participated.

## Source retirement proof

The closed inventory is `occurrenceModal`, `openOccurrences`,
`closeOccurrences`, `formatOccurrenceTime`, `goToOccurrence`, and
`modal=occurrences`, scoped only to shipping `frontend/index.html`.

Base RED:

```text
frontend/index.html still carries retired occurrence-route source: occurrenceModal, openOccurrences, closeOccurrences, formatOccurrenceTime, goToOccurrence, modal=occurrences
tests 1 · pass 0 · fail 1
```

Revision GREEN:

```text
the retired occurrence route has no production source
tests 1 · pass 1 · fail 0
```

Direct revision inventory returned no match. The surviving Data quality branch,
`goToMoment` Day handoff, and occurrence-highlight pseudo-modal remain in the
same production source.

## Retirement replay

R1 cold-opens the fixture-derived stale URL, reaches exact `#diagnose`, finds no
accessible occurrences dialog or roster outside the Inspector, and clicks a
public finding row. The populated Inspector then contains an episode count and
at least one occurrence row.

Both the canonical-hash assertion and the no-duplicate-route assertion were
mutated independently through `proveRedOnce`; each assertion rejected its
mutation, restored the page, and passed again. A failure to reject or restore
would fail the Cockpit gate.

Raw replay output:

```text
cockpit-shell retirement R1: Connor · 2026-08-18 · "the dead `occurrenceModal` hash machinery goes with them."
cockpit-shell applicable stories: 11
cockpit shell behavior ledger replays every registered story
tests 14 · pass 12 · fail 0 · skipped 2
```

## Before/after matrix

The same stale-link and visible-Inspector state was captured from separate base
and revision worktrees:

| Viewport | Theme | Base | Revision |
| --- | --- | --- | --- |
| 1440×900 | Light | `occurrence-retirement-base-1440x900-light.png` | `occurrence-retirement-revision-1440x900-light.png` |
| 1440×900 | Dark | `occurrence-retirement-base-1440x900-dark.png` | `occurrence-retirement-revision-1440x900-dark.png` |
| 1280×800 | Light | `occurrence-retirement-base-1280x800-light.png` | `occurrence-retirement-revision-1280x800-light.png` |
| 1280×800 | Dark | `occurrence-retirement-base-1280x800-dark.png` | `occurrence-retirement-revision-1280x800-dark.png` |

All four before/after pairs are pixel-identical. Visual inspection confirmed the
same populated Inspector, one occurrence roster, and no unintended rendered
change in either theme.

## Verification

The complete documented gate passed on the revision:

- Backend: `1857 passed, 1 skipped`.
- Frontend dependency-free gate: `374 passed`.
- ADR numbering, owned identifiers, public allowlist, and all current Python
  and Node drift checks exited 0.
- Diagnose workstation browser leg: `14 passed`.
- Cockpit shell browser leg: `12 passed, 2 screenshot-only tests skipped`, with
  11 applicable stories and the full R1 sanction printed above.
- `git diff --check` returned no error.

Full review round 1 checked 18 repository standards, 14 work-order criteria,
and all eight risk entries. It found incomplete change-record endings and two
uncontrolled copies in R1's fail-closed proof. The revision now requires the
ledger's retired count to equal its record count, exactly one R1 record, the
source-adjacent tag to equal the ledger owner/date, and captures the real
sanction log call.

Round 2 converged: all 18 standards hold, all 14 work-order criteria are met,
and all eight risk entries hold. It found no new violation, no unverified item,
and no scope to reopen.
