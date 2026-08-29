# Design — isf-direction-only-ranking

## ADR 223 — An unstageable ISF direction keeps evidence, not queue rank

**Context.** ISF has two independent evidence channels. Recurring correction-linked
lows may own a `weaken` direction even when the fasting-window measurement is flat or
points the other way. That harm evidence is enough to warn against stronger
corrections, but it may not identify a trustworthy new ISF; in that state
`recommended` stays empty and `asserts_move` is false.

The analyzer deliberately keeps a pricing-only capped target so the ISF tuning Lever
can express the consequence and recurrence of those lows on the shared Priority axis.
The findings projection currently copies that Priority onto the direction-only row,
puts it in the priced queue head, and gives it a visible rank numeral. After the live
canvas began printing both the numeral and the analyzer sentence, a row with nothing
to stage could read as the reader's first action while the flat trend beside it looked
like the evidence for a direction it did not establish.

This is the unresolved half of issue 26. ADR 25 correctly made the detail read the
analyzer's direction, ADR 13 correctly separated stageability from direction, and ADR
42 correctly refused to name one cross-parameter headline. None decided that an
unstageable setting should keep its full queue rank.

**Decision.** A setting finding receives a Findings queue rank only when the setting
change it represents can be staged. The projection reads the analyzer-owned staging
verdict; it does not derive a new evidence floor, recommendation rule, or safety gate.
The rule is parameter-general:

- a merged Basal finding remains stageable when its represented member time slots can
  stage, even though the merged row prints no invented headline number;
- an I:C finding ranks when its block's backend verdict admits the move; and
- an ISF finding ranks only when `asserts_move` is exactly true.

A direction-only ISF warning remains visible in the asserted register, keeps its
direction and evidence, and remains impossible to stage. Its Findings row carries no
queue Priority and therefore follows every priced setting or behavioral finding
through the projection's existing unranked path. The row has no rank numeral. It does
not move into Watching.

The underlying ISF tuning Lever and its Priority are unchanged. Analysis, reporting,
and future consumers may still read how consequential and recurrent the harm signal
is; only the Findings projection withholds that value as a queue-placement claim.
The existing projection interface already represents this distinction: analysis keeps
the tuning Lever Priority while the projected row carries `priority: null`. No second
score or new wire field is introduced, and the browser never re-ranks the server's
rows.

PR 229 already owns Findings seating: automatic candidates are the backend-ordered
`assert` and `finding` rows, while only an explicitly pinned live chart may promote
Watching evidence. This decision does not reopen that rule. It changes the backend
rank input for an unstageable setting row and leaves the frontend as an order
consumer; the row remains asserted, and no automatic or implicit Watching promotion
is introduced.

When the fasting-window trend is flat or disagrees with recurring correction-linked
lows, the rendered explanation names both signals and states that the lows own the
weaker direction. The chart remains visible as measurement evidence, but neither its
shape nor its interval is presented as the source of the warning. Exact copy remains
subject to `DESIGN.md`'s voice register.

Legacy or hand-authored findings payloads are outside this decision. The live route
builds from the current analyzer, and the durable artifact marker includes a source
fingerprint, so pre-verdict payload bytes cannot survive a code upgrade into the
current front page.

The rendered change follows UI Craft's `revise` route. `AGENTS.md` declares the exact
safe start command as:

```sh
uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite
```

The named database is manufactured by the committed
`scripts/gen_revise_e2e_db.py` generator; the mandatory `--no-fetch` boundary prevents
vendor access. The frozen shipped-behavior contract is
`mockups/finding-evidence-routing.behavior.md`, replayed against the built app by
`frontend/diagnose-workstation-behavior.replay.mjs`. Implementation begins by
replaying and re-inventorying that contract on base
`16cfbda7ca4bf6ce2a26441e44ea60169bcd15fa`. This is convergent work in the existing
Diagnose surface, so no duplicate route, mock rebuild, or divergent wireframe is
authorized.

**Consequences.** The server-owned findings projection remains the one queue-ordering
module and the existing browser remains a renderer. Projection fixtures and their
fixture-only JavaScript mirror change in lockstep. Public-interface coverage must
prove the unstageable warning follows every stageable finding while the analysis
Priority remains unchanged, and shipped-surface evidence must prove the warning has
no rank numeral or stage affordance and explains which evidence owns the direction.
The canonical Surfaces specification is the only baseline specification amended;
the Safety baseline's analyzer/staging and analysis-Priority contract is unchanged.

**Evidence inventory.** The reviewed synthetic evidence is committed under
`evidence/issue-223/`: `base/` and `revision/` each contain queue and Correction
factor detail captures at 1440×900 and 390×844 in both light and dark themes;
`replay.txt` records the complete shipped-surface replay ending with 141 of 141
stories passed; and `manifest.txt` records the source revisions, manufactured data
boundary, affected states, and every capture path. After fresh-main integration,
ticket 223's replay contract is issued as S121 so main's S118 Low-cohort, S119
fullscreen, and S120 star-retention contracts remain unchanged.

Decision: ConnorGriffin, 2026-08-28.
