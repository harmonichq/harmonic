# #423 Episode Log claimed anchors — design

## Sanction

Connor Griffin, 2026-09-23, in the release coordinator session, answered
"Q1 A, Q2 A, defaults all fine, go". Q2 asked: "Can your reply here count as
sign-off for the UI copy and tone changes? … Yes. I record your answer as the
approval for every change these 13 checklists call for, and write the wording in
CONTEXT.md terms." That answer is the dated sanction for this shipped-surface
revision and for the desk behavior-ledger amendment #423's checklist calls for.
It does not sanction anything outside #423's checklist.

## ADR 423 — A claimed anchor reads as part of the Finding that claimed it

### Decision

- **Word.** An anchor whose served state is `outranked` reads `claimed`. The
  five anchor-state words stay a closed presentation map in the desk, the same
  way ADR 41 has the frontend name the verdict band's categories from served
  counts: the backend serves the state, the desk words it. The map moves out of
  `frontend/day.js` (`STATE_WORD`) into `frontend/day-chart.js` as the export
  `ANCHOR_STATE_WORD`, beside `anchorStateColor`, the one state-to-hue map the
  rings and the hairline already share. Diagnose's `VERDICT_RESIDUE_KEY` builds
  its outranked label from that export's claimed word as
  `claimed by another finding`. *Factor* is retired: CONTEXT.md lists it as a
  synonym to avoid for Lever. *Finding* is the defined term.
- **Relationship.** A claimed row names the claiming Finding by the served
  episode cause title (#426) and each Lever the anchor matched on its own by its
  served verdict title. A matched title equal to the claiming Finding's is not
  repeated (two meals in one carb undercount episode, say).
- **Hue and size.** A claimed anchor paints in the fired anchor's hue on the tier
  word (`frontend/desk.css`), both rings and the focus hairline
  (`anchorStateColor`), and its resting marker is as large as a fired one
  (`buildAnchorOverlay`). The word, not the colour, tells it from the driver.
  This keeps colour semantics redundant (S82, HV2-32).
- **Count.** `buildEpisodeLedger` owns the Findings count, as it owns the band
  split: one Finding per distinct served episode id among the band's rows,
  plus the number of claimed rows. Its unused `fired` count goes. An episode
  attributed to a sequence Lever has no fired anchor (`model_view._is_driver`
  excludes `SEQUENCE_LEVERS`), so counting fired rows would miss that Finding.
  Rows keep chronological order. Episodes are disjoint clusters in time, so an
  episode's rows already stand together.
- **Explanation.** The Glossary gains an Episode Log group, CONTEXT.md gains
  Episode Log and Claimed under "Day surface", and the Guide's "Reading a Day"
  article describes the bands. Each band caption carries a Glossary control that
  opens the Glossary with that group in view. Closing returns focus to the
  control, the utility launcher contract of HV2-33.

### Why not the alternatives

- *Nest claimed rows under their driver.* A claimed anchor can precede its
  driver: a contested episode picks the largest-impact candidate, not the
  earliest. And a sequence episode has no driver row to nest under. Naming the
  Finding on the row holds in both cases.
- *Serve the state word from the backend.* The state set is closed and owned by
  `model_view._anchor_state`. Serving its word adds a payload field without
  moving any judgment out of the browser. Lever names are different: they come
  from a taxonomy the backend owns, so they are served.

### Consequences

`colors.warn` in `frontend/colors.js` `deskColors()` loses its only reader
(`anchorStateColor`) and is removed with its comment. `--mk-warn` keeps its other
users (the event-comparison nearly-matched ink, the verdict band's near-miss
segment, the insufficient-evidence ink). `frontend/theme.css` token values do not
change.

## ADR 423 — The model view serves each verdict's Lever title

### Decision

`_build_episode_view` in `ciq_autotune/analyzers/scenario/model_view.py` serves
a `title` beside `classifier` on every retained verdict of every anchor, from
`levers.title()`. That is the same one name source #426's served episode cause
title reads, so the two names always agree. Every classifier the evaluator
retains is a Lever value (`attribute.py` emits `carb_undercount`, `late_bolus`,
`meal_over_delivery`, `over_treated_low`, `correction_on_iob`, `missed_meal`,
`meal_bolus_short` and `correction_stacking`). The title is
`levers.title(Lever(classifier))` with no fallback name, so a classifier outside
`Lever` fails the read loudly instead of reaching the payload unnamed.

### Why here

`AnchorVerdict.to_dict` is the wire shape the findings-projection generator
documents, and the model view is the only reader that needs a name. The shared
episode view has two other consumers, and neither passes the new key through:
`explore_exposures._exposure_verdict` copies a closed set of five verdict keys,
and `finding_case_file` reads verdicts internally to compute row-relative
verdicts. So no served payload other than `/api/model-view` changes, and every
committed fixture and drift check stays byte-identical without regeneration.

A frontend Lever-name table is ruled out. #426 deletes Day's partial cause
tables, and a second name table would reintroduce the fact with two
implementations.

## ADR 423 — Browser evidence runs on the pattern-near-tie store

### Decision

S121 and S122 run on the committed synthetic case `pattern-near-tie`. Its Day
2024-05-25 shows episode `2024-05-25-ep13`, attributed to carb undercount: a
fired meal, a clean correction, and a low at 54.25 mg/dL whose own verdict
matched correction on IOB, so its state is `outranked`. It is the only committed
case serving a claimed low. The scan below covered all 70 cases at `a4d374a7`.
`pattern-near-tie` is already a replay case (S102, S106), so the fixed smoke
slice keeps covering every replay case without change.

The ticket's exact instance, a level-2 low claimed inside a meal over-delivery
episode, is proven twice below the browser:

- at the analyzer boundary, by a backend test on manufactured events through
  the evaluator (shape recorded below);
- at the render boundary, by node tests on the served model-view shape.

No new `QaCase` is added. That avoids a QA coverage era (literal expectations
and five re-measured budgets) and a change to the pinned smoke-slice hash.

### Open

The release coordinator may instead require a manufactured meal over-delivery
case store with a level-2 claimed low. The spike below shows the current
analyzer produces one. That would add the case, its `QaExpectation`, the
AGENTS.md budget re-measure and a smoke-slice entry.

## Safe start (revise lifecycle, step 0)

- Declaration: `AGENTS.md`, "The data boundary", the one permitted offline
  serve:
  `uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8765`,
  run over a scratch copy of a generated store.
- Named data source: the synthetic case store
  `uv run python scripts/gen_qa_e2e_db.py --case pattern-near-tie --out <scratch>`
  for S121 and S122. The replay's case server emits it itself through
  `frontend/replay-cases.mjs`.
- Provenance: every row comes from `scripts/qa_e2e_cases.py` through
  `scripts/gen_qa_e2e_db.py`, stamped `synthetic_fixture_provenance`.
- Base: the release integration trunk after #426 lands, which the coordinator
  merges into this branch before `start`. Grounding ran on `a4d374a7`.
- All port-bound execution (replays, browser suites, serves, captures) belongs
  to the release coordinator, run serially.

## Generated facts

Measured on `a4d374a7`, 2026-09-23.

1. Reproduction, node, manufactured model-view day (a meal over-delivery
   episode, fired meal, outranked 49 mg/dL low with `over_treated_low` matched):
   tier word `outranked`; low row text `▽ Low · 49 mg/dL · meal over-delivery`;
   `anchorStateColor('outranked')` returns `colors.warn`; `desk.css` has
   `.gf .gf-log-row .tier[data-state="outranked"] { color:var(--mk-warn); }`;
   caption `Findings · 2` with the ledger's `fired` count 1; glossary groups
   `Basal, ISF, I:C, General`, none naming a band.

2. The pattern-near-tie claimed low, regenerable from the tree:

   ```sh
   uv run python - <<'EOF'
   import sys, tempfile; from datetime import date; from pathlib import Path
   sys.path.insert(0, "scripts")
   from gen_qa_e2e_db import generate; from qa_e2e_cases import QA_CASES
   from ciq_autotune.store import Store
   from ciq_autotune.analyzers.scenario.model_view import build_model_view
   with tempfile.TemporaryDirectory() as tmp:
       p = Path(tmp) / "c.sqlite"; generate(p, next(c for c in QA_CASES if c.name == "pattern-near-tie"))
       with Store.open_readonly(str(p)) as s:
           for ep in build_model_view(s, date(2024, 5, 25))["episodes"]:
               for a in ep["anchors"]:
                   print(ep["id"], ep["lever"], a["t"], a["kind"], a["bg"], a["state"], [v["classifier"] for v in a["verdicts"] if v["matched"]])
   EOF
   ```

   Output:

   ```
   2024-05-25-ep13 carb_undercount 2024-05-24 19:00:00 meal None fired ['carb_undercount']
   2024-05-25-ep13 carb_undercount 2024-05-24 20:00:00 correction None clean []
   2024-05-25-ep13 carb_undercount 2024-05-24 22:00:00 low 54.25 outranked ['correction_on_iob']
   2024-05-25-ep14 None 2024-05-25 02:30:00 correction None clean []
   ```

   The episode resolves after midnight, so the model view assigns it to Day
   2024-05-25 although its anchors are stamped the evening before. A story
   looking for the claimed row opens Day 2024-05-25.

3. Scan of every committed case (70), each day's model view: claimed anchors
   appear in `behavioral-precedence` (1), `behavioral-preempted-detector` (1),
   `pattern-near-tie` (2), `high-carb-sequence-empty` (8),
   `high-carb-sequence-multiple` (16), `repeat-eating-empty` (8),
   `repeat-eating-thin-reference` (8) and `repeat-eating-multiple` (16). Only
   `pattern-near-tie`'s are lows. Every sequence-case claimed anchor sits in an
   episode with no fired anchor. No claimed anchor sits in an episode without a
   Lever. The showcase has none.

4. Manufactured level-2 claimed low inside a meal over-delivery episode, current
   analyzer. Recipe: the 30-day flat 120 mg/dL background of
   `_materialize_behavioral_background`; on three consecutive days (background
   offsets 23, 24, 25), CGM 180 mg/dL at 18:40–18:55, falling linearly from 180
   to 175 over 19:00–20:00, then from 175 at 20:05 down 5 mg/dL every 5 minutes
   to 60 at 22:00, then flat 48 mg/dL at 22:05–23:05. A 7.0 U / 50 g meal
   bolus at 19:00 (carb ratio 10, ISF 40, target 110). A 3.0 U correction at
   20:00. Twelve 5-minute Control-IQ suspension rows from 21:00. The model view
   of the middle day serves one `meal_over_delivery` episode: meal 19:00
   `fired` (`meal_over_delivery` matched), correction 20:00 `clean`, suspend
   21:00 `clean`, low 22:05 `outranked` with `correction_on_iob` matched. With
   the same shape flat at 55 mg/dL the result is identical. A rebounding low
   instead splits into its own over-treated-low episode (`split_low_rebounds`),
   so the claimed low must not rebound.
