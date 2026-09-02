# Design — the graphite palette, second lock (#317)

## ADR 317 — Palette values are settled at the running app, with the operator

**Decision.** No palette value in this change is chosen headless. The
executing session serves the app through the declared safe entrypoint and
iterates it with the operator in UI Craft revise rounds; each ruling is
recorded below as a dated sanction (`Connor Griffin · <date> · "<quoted
reason>"`) before the value is committed. A value without its sanction entry is
a defect, not a draft. The executing session looks first and asks second: it
serves the app and inspects every surface itself before its first question,
and every question it does ask is rendered live as options with stated costs.

**Why.** #304's triage settled (Q1) that the finished palette is the operator's
call on the running app: the prototype was flagged as far from finished
design, and a worker cannot see what the eye rejects.

**Sanctions.** Appended by the executing session, one entry per ruling:

- High-glucose hue: `--high` `#e07f3f` → `#e2be4c` (gold). Connor Griffin ·
  2026-09-02 · "Lavender looks good but I hear you on the cool tones thing. I
  guess gold then." Rendered live on Day (1440×900, 390×844), the Diagnose
  chart strip and the Guide worked-example peak against gold `#e2be4c`,
  lavender `#b4a1e0` and straw `#e4cf8e`; gold follows the CGM convention
  (yellow high, red low) and is tellable at a glance from the action orange,
  low, in-range and every amber; its nearest neighbour is the chrome's
  `--ck-manual` `#d9b568`, which never shares a surface with a high mark.
- Verify ribbon tints: hold at 20%/20%; `frontend/verify-workstation.js` is
  unchanged. Connor Griffin · 2026-09-02 · "Why are we bothering to spend
  tokens and energy on a change that doesn't actually change anything?" Both
  settings were rendered on the fixture's profile Trial through
  `evidence/verify-trial-opener.mjs` (as-is, and with Before/Trial mirrored
  via `SWAP=1` so the Trial band has area); 32/18 versus 20/20 differs by one
  or two units per channel on the Before band and is visible only on the
  mirrored Trial band, so the documented 32/18 step-up is retired as intent
  rather than adopted. The Trial band mixes `--mk-primary`, the chart's data
  green, not the action orange. The lock's "once per worktree root" for chunk
  3 resolves to this run set, each run one invocation of
  `openspec/changes/graphite-palette/evidence/verify-trial-opener.mjs` with
  `FRONTEND_ROOT=<root>`, `OUT=<png>`, `TRIAL=Profile` and the `RIBBON` named
  (`FRONTEND_ROOT`, `OUT`, `RIBBON`, `PLAYWRIGHT_MODULE` and `VENDOR_DIR` are
  required and the opener exits 1 without one; `TRIAL` and `SWAP` are
  optional, and a run without `TRIAL=Profile` renders the default Trial, whose
  ribbon has no area, so every run here names it): on the base root,
  `RIBBON=20/20` and `RIBBON=32/18`, each as-is and again with `SWAP=1`
  (four renders); on the revision root, `RIBBON=20/20` as-is and with
  `SWAP=1` (two renders). Mirrored renders are labelled as such.
- Chrome bar on Plan and Day: moves one step up, from the desk `#0f0d0b` to
  the well `#14120f` (`--ck-ground` re-declared inside `frontend/theme.css`'s
  chrome-bar role block as `var(--wk-surface-sunken)`; `:root`'s desk is
  untouched). Connor Griffin · 2026-09-02 · "The slightly lighter one looks
  better I guess", judged in the running app with the base and the revision
  open side by side on Day. Re-measured on the moved ground (WCAG 2.x
  relative luminance, the one formula this record names): `--ck-bar-signal`
  `#dc7b42` reads 5.48:1 on `--ck-panel`, 6.19:1 on the well (6.42:1 on the
  desk), `--ck-bar-on-signal` is the well and reads the same 6.19:1 on the
  signal, and `--ck-bar-signal-well` holds `--ck-body` at 6.06:1. The three
  figures previously beside those tokens (5.05, 6.08, 6.03) were measured by a
  method the file never named and do not reproduce under WCAG on the desk
  either; under the named formula the moved ground clears the recorded 6.08,
  so the ruling was not returned. Cockpit S6 and its gate amend together in
  the gate re-base commit (sub-order 2 owns every ledger and suite), quoting
  this sanction; the value commit above carries no ledger edit by that
  ownership, which is what "in the same commit" under Rulings that stay
  narrow refers to.

## ADR 317 — Clinical attention and tappable affordance do not share a hue

**Decision.** `--high` leaves burnt orange for a hue of its own, chosen at the
app so that it is tellable at a glance from the action orange (`--primary`,
`--accent`, `--wk-signal`, `--ck-bar-signal`, `--manual-carb`), from low
(`--low`), from in-range (`--in-range`), and from the ambers already spent on
non-clinical meaning (`--warn`, `--wk-status-incomplete`, `--ck-manual`,
`--ck-meal`, `--inferred`). Orange stays the action and signal colour
everywhere. Every consumer that reads `--high` follows the token; no consumer
is re-pointed at a literal.

**Why.** Operator ruling, triage of #317, 2026-09-02: the high-glucose marks
move, not the controls; DESIGN.md and the prototype direction make burnt
orange the brand's one recurring action colour, and a high reading must never
look tappable.

## ADR 317 — The operator's eye outranks a pinned contrast floor, by sanction

**Decision.** Pinned colour literals in gates and tests re-base to the
sanctioned values freely. A pinned contrast floor (a minimum ratio a gate or
audit asserts) may move only with the operator's dated sanction recorded in
this file naming the floor, the pair it measures, the old and new bound, and
the reason the ratio measured the wrong thing. Absent that entry the floor
wins and the value is re-derived until it clears.

**Why.** Operator ruling, triage of #317, 2026-09-02 ("my eyeballs win"). UI
Craft revise already lets the eye outrank an area-blind ratio; #304's risk
contract forbids weakening a gate, and the sanction entry is what separates a
ruled re-settlement from a quiet weakening.

**Sanctioned floor changes.** None yet; appended by the executing session if
any.

## Moved tokens

The closed list of custom properties whose computed value differs between
base and revision. Filled by the executing session as each ruling lands and
extended by the evidence chunk only for a refusal a moved token explains at
runtime (an inline custom property, an alpha wash), each addition quoting the
ruling. Every entry names a custom property whose computed value differs between
base and revision, including tokens derived through `var()` from a moved one
(`--ck-bar-on-signal` follows `--ck-ground`, for instance); before and after
are the computed hexes. Filled by
the executing session as each ruling lands and read by the gate re-base and the
palette-only diff as their only authority. A token not listed here may not
differ between base and revision.

- `--high` · before `#e07f3f` · after `#e2be4c` · high-glucose hue ruling,
  2026-09-02 (above).
- `--ck-ground` on `.cockpit-topbar`, `.cockpit-footer` and their descendants
  · before `#0f0d0b` · after `#14120f` · chrome bar ruling, 2026-09-02
  (above). `:root`'s `--ck-ground` (the desk) does not move.
- `--ck-bar-on-signal` on the same elements · before `#0f0d0b` · after
  `#14120f` · follows `--ck-ground` through `var()`; chrome bar ruling.

### Derived colour pairs

Colours that are not a moved token's own computed value but follow from one
(a `color-mix()` of `--high`, an alpha wash of it), listed as explicit
before → after pairs with the rule that derives each. The palette-only diff
admits a colour change only when its before → after pair is a moved token's
own pair or a pair listed here; a colour pair that appears in neither is an
unexplained difference and fails the run.

- _none yet_ (each entry: `before rgb(…) → after rgb(…) · derived by … · ruling`)

## Base story counts

Recorded by the executing session before the first value moves, read by the
gate re-base as the counts every leg must still report.

- `frontend/cockpit-shell.browser.test.mjs` on the base: 16 tests, 14 pass,
  0 fail, 2 skipped (the two `COCKPIT_SHOTS`-gated render tests, skipped
  whenever that variable is unset, as in CI). Run 2026-09-02 from the base
  worktree at 34264622 with `COCKPIT_APP_ROOT` defaulting to that checkout.
- `frontend/diagnose-workstation-behavior.replay.mjs` on the base: `app: 145
  of 145 stories passed` (TARGET=app against the base worktree at 34264622
  served with `--no-fetch` on the revise database, port 8318, 2026-09-02).

## Rulings that stay narrow

- The chrome bar: on Diagnose and Verify the workstation's panes cover the
  page, so the bar already reads as its own material there. The round looks at
  Plan and Day, where cards sit on the page directly and the bar is flush with
  it, and moves the bar one step only if that reads wrong to the operator. If
  it moves, cockpit S6 amends with the sanction in the same commit; if it does
  not, S6, its gate and `frontend/theme.css`'s chrome-bar role block stay
  byte-identical. The bar's ground is the `--ck-ground` re-declaration inside
  that role block; `:root`'s `--ck-ground` in `frontend/shell.css` is the desk
  and never moves. If the bar moves, the cockpit gate's chrome-surface check
  (`assertChromeSurfaces` in `frontend/cockpit-shell.browser.test.mjs`)
  keeps `shell === desk`, `footer === bar` and `control !== desk` unchanged,
  replaces `bar === desk` with `bar` pinned to the sanctioned literal and
  `bar !== desk`, raises its distinct-grounds count from 2 to 3 naming them
  (desk, bar, control), and re-points its deliberate "two grounds" mutation to
  a value that still drives that pair red; its two hairline pins stay
  byte-for-byte. That is the one structural re-base this change authorises,
  and it is the whole of it. In the same commit, S6 amends both its opening
  "exactly the desk/control ground vocabulary" phrase and its "the shell,
  stage, top bar and footer on one desk" clause quoting the sanction, and the
  gate's own rationale comment ("there are TWO grounds, not three") is swept
  to describe the ruled state.
- The Verify ribbon: 32%/18% and 20%/20% are rendered side by side on the
  same Trial and the operator picks; 32/18 is shown first as the documented
  intent. Neither committed synthetic database carries a Trial, so the render
  uses the Verify gate's fixture payload through the replay's request stub,
  from the committed opener `evidence/verify-trial-opener.mjs`, so the
  ribbon's before/after renders are evidence of record like every other
  ruling's. The ribbon fills are canvas, so the computed-style diff cannot see
  them; the renders and the Verify replay leg are their evidence.

## Safe start (UI Craft revise)

Declaration: `AGENTS.md` "The data boundary". Two permitted offline serves:
`uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite`
(the browser-gate database, `scripts/gen_revise_e2e_db.py`) and the QA
copy-then-serve block (`scripts/gen_qa_e2e_db.py`, served from a scratch
copy). A serve mutates the database it opens: the revise database is restored
from its committed bytes before any commit, and the QA database is only ever
served from a scratch copy. Base for the before/after evidence: the ticket
branch's merge-base with `origin/main`, served from a second worktree on a
distinct port.
