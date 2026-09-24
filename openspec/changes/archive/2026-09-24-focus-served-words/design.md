# #449 + #450 design

## Lifecycle record

- **Surface:** the shipped desk's Changes destination — the active Trial and
  Focus, the change records, and the Focus entry page. Lifecycle `revise`
  (`/ui-craft` route: shipped, runnable, declaration complete, manufactured data
  → `revise`). No surface is mocked; the app branch is the visual artifact.
- **Safe start:** `AGENTS.md`, "The data boundary": the QA copy-then-serve
  command `uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8765`
  over a copy of a committed synthetic `scripts/qa_e2e_cases.py` case store
  (c3-focus, c3-preempted, c4-history, c3-trial and c4-ic here), reached through
  `CASE_STORE_DIR`. Manufactured data only; no real data is read and nothing is
  fetched.
- **Contract:** the frozen behavior ledger `mockups/harmonic-v2-desktop.behavior.md`
  and its replay `frontend/desk-behavior.replay.mjs`, inherited unchanged. This
  release does not re-run a sweep. Every change to the ledger goes in one dated
  `## #449 amendment — 2026-09-23` section.
- **Sanction:** Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out
  yourself from here"); coordinator rulings R449 and R450. It covers the
  shipped-surface revisions and ledger amendments below and nothing else.
- **Base:** origin/main b03431d2.

## ADR 449 — The watched behavior is named by one served `lever_title`

**Decision.** The selected Focus read (`/api/verify/trials?kind=focus&selected=…`,
built in `watched_change.review_trials`) serves `lever_title` beside `lever`:
`_focus_meta(lever)[0]`, which is `levers.title` for a Lever and
`OVERRIDE_TITLE` for the override, or null when the stored lever is outside
that set. The desk prints that one served name wherever it names the watched
behavior:

- the Observed behavior row of the active Focus and of a Focus record
  (`adherenceTable` / `comparisonTables`, which take the name from their
  caller);
- the "What this Focus watches" fallback, used when the retained context carries
  no explanation;
- a Focus record's "What changed" line (Q1 default, below).

The desk's `LEVER_NAME` table is deleted. A null name prints "Watched behavior"
in the row, omits the "What this Focus watches" fallback paragraph, and reads
"The behavior this Focus watched is no longer an offered lever." in "What
changed". The lever key never prints.

**Why this carrier.** Both the active Focus and a closed record read their
detail from this one endpoint, so one field reaches every line. A Pattern
Focus's served `title` is its Pattern's title (`_review_focus_title`: a Focus on
High-carb sequence is titled "Highs after meals"), so `title` cannot name the
behavior. A field on the comparison's adherence arm would be missing from every
saved ending captured before this change, because saved endings are immutable.
The name is derived at read time from the lever, as `title` and `target_metric`
already are (`FocusView`'s docstring), and nothing new is stored.

**Why this source.** `_focus_meta` is the title source of a lever Focus's own
nameplate (`FocusView.title`), and `levers.title` is the one lever name source
#426 made the Episode Log read (ADR 426). So a legacy Focus's behavior row equals
its nameplate, and a Pattern Focus's behavior row equals the Episode Log's name
for the same Lever. For all eleven pinnable levers the three names disagreeing
today (Correction stacking, Missed / unannounced meal, Doses above pump
calculation) become the served ones, and High-carb sequence and Repeat eating
stop printing their keys.

**Null.** A stored Focus can outlive the lever vocabulary: c3-preempted's
`overnight_drift` Focus is one (`_focus_meta` raises for it). That is durable
state, a trust boundary, so the read serves null and the desk words it rather
than printing the key.

**Invariant.** Names only. Which lever a Focus watches, pin eligibility,
adherence measurement, readiness, ranking and staging are unchanged. `lever`
stays in the payload, in `data-day-lever` and in every address. The roster rows
(`focuses`) are unchanged, so the committed `verify-660-story` fixture does not
move.

**"What changed" (Q1, coordinator decision pending; default applied).** #426
made a Focus record's "What changed" name the intended behavior "by the
record's served title", when no behavior name was served. For a Pattern Focus
that is the Pattern's title, so the same record would name its intended
behavior two ways — "Late bolus · the intended behavior" in the table and "The
intended behavior: Highs after meals" in the reading pane — which is #449's own
defect. The default moves "What changed" to `lever_title` and modifies that
requirement. If the coordinator rules against it, task 2.3, the MODIFIED
requirement and story S176 are dropped and nothing else moves.

## ADR 450 — Every served code on a watched-change line prints in words

**Decision.** On the active Trial and Focus, the change records and the Focus
entry, a served code never prints as its code. Each line prints the words of
the desk's table for its family; a code the table does not know prints as
served, with one stated exception, the Focus entry (below). That fallback keeps
the lock's binding note that `availability.reason` is an open provider-owned
field the UI renders whatever arrives, and it is ADR 430's existing rule. Codes
stay unchanged in payloads and data attributes (`data-adherence-state`,
`data-harm-state`, `data-opportunity-verdict`, `data-ending-assessment`,
`data-reassessment-state`, `data-reassessment-context`,
`data-finish-unavailable`).

**One reason vocabulary.** `comparisonReasonWords` (`COMPARISON_REASON`,
`frontend/follow-up.js`) stays the desk's one vocabulary for reasons (ADR 430).
It gains words for every code the backend can serve on these lines, enumerated
from the producers below, not from the issue text:

| Code | Words | Producer |
|---|---|---|
| `collecting` | still collecting | trial_evidence.py:436; follow_up_comparison.py:405; outcome_patterns.py:66 |
| `zero_opportunities` | no opportunities in this period | follow_up_comparison.py:405, :524, :526; outcome_patterns.py:66 |
| `insufficient_measurement` | too little glucose data to judge every opportunity | analyzers/scenario/engine.py:762 |
| `candidate_high_without_closed_attribution` | a high after a meal has not been attributed yet | engine.py:760 |
| `attribution_exceeds_owned_population` | more episodes were attributed than opportunities were counted | engine.py:746 |
| `unassociated_recurrence_anchor` | an attributed episode could not be matched to an opportunity | analyzers/scenario/evaluation.py:353, forwarded at engine.py:739 |
| `missing_override_provenance` | some boluses do not record their override gap | analyzers/classifiers/user_override.py:78, forwarded at engine.py:669–675 |
| `unreadable_harm_interval` | the glucose after some opportunities could not be read | engine.py:677 |
| `unmatchable_captured_membership` | the carb-ratio block recorded with this change cannot be matched in this period | trial_evidence.py:477 |
| `reconciliation_required` | the latest pump and sensor data have not been reconciled yet | watched_change.py:1515, :1521, :1530 |
| `legacy_not_recorded` | this earlier record was kept before Harmonic saved its context | store.py:1604 |
| `no_readable_outcome` | a period has no readable value for this outcome | follow_up_comparison.py:221 |
| `context_after_ending` | this change's context was recorded after it ended | #442's backfilled ending (saved unavailable when the retained context postdates the ending); no producer on this branch |

The twelve comparison availability codes already worded (ADR 430) are
unchanged; the served ending-assessment reason is one of them or `not_recorded`
(`capture_ending` spreads the comparison's availability into the saved
assessment, watched_change.py:1549). `no_readable_outcome` is named by R450; no
desk line prints an outcome row's availability today, so its entry keeps the
comparison family complete rather than serving a line. `context_after_ending`
is a coordinator addition (2026-09-23, Q3 delegation): #442 saves a backfilled
ending's assessment unavailable with that code when the record's retained
context postdates the ending. #442 adds no entry of its own, and the
integration merges this change before #442, so the saved ending line prints it
in words from the moment #442 lands. Any further #442 code reaches this table
through the coordinator.

**Lines routed through the vocabulary** (each printed its code on the base):

| Line | Served field | Codes it can serve |
|---|---|---|
| Saved ending, "Ending assessment · Unavailable" (history.js `endingSection`) | `original.ending.assessment.reason` | the twelve comparison codes, `not_recorded`, and #442's `context_after_ending` once it lands |
| Observed behavior cell (follow-up.js `adherenceTable`) | `adherence.<side>.availability.reason` | the five measurement codes (`zero_opportunities` takes the zero-opportunity branch first) |
| Attributed harm cell (`adherenceTable`) | `adherence.<side>.harm_availability.reason` | `unreadable_harm_interval`, `zero_opportunities` |
| "Not met — …" (follow-up.js `readinessArm`, every arm shape) | `readiness.<side>.reason` | `collecting`, `zero_opportunities`, the five measurement codes, `unmatchable_captured_membership` |
| "This period's evidence is unavailable: …" (`readinessArm`, setting arm) | `readiness.<side>.reason` | `unmatchable_captured_membership` |
| Pattern opportunity line, reason part (`readinessArm`) | `readiness.<side>.reason` | `collecting`, `zero_opportunities` |
| "The backend cannot answer for this store yet: …" (follow-up.js `mount`) | `roster.admission.reason` | `reconciliation_required` |
| "This record's original context is unavailable: …" (history.js `originalSection`, already routed) | `original.context.reason` | `not_recorded`, `legacy_not_recorded` |

**States, verdicts, modes and denominators on the same lines** print through
closed word tables beside the code they word, each printing an unknown value as
served:

- the saved ending's "Recorded · <state>" and the reassessment result's state
  print through the existing `STATE_WORD` (`concerning` → Concerning, `unclear`
  → Unclear, `context` → Context only); history.js reads it from follow-up.js,
  which owns it;
- the reassessment heading's mode prints as its segment's own label (`retained`
  → Retained context, `current` → Current policy);
- the Pattern opportunity verdict prints `ready` → Ready, `withheld` → Withheld
  (outcome_patterns.py:65);
- the behavior denominator `correction_clusters` (the Correction stacking
  Lever's Exposure, levers.py:37) prints as "correction clusters" wherever the
  Focus prints a denominator or an arm unit; the other served denominators are
  already words.

**The Focus entry's withheld copy** (focus-entry.js `mount`) prints its served
`admission.focus_pin.reason` through guidance.js's existing `admissionReason`
words rather than a second table (charter reuse rule). That table gains
`pending_plan`: "A recorded Plan is still pending, so Harmonic is not offering a
Focus from this read." The entry mounts only when Changes holds a `pattern:`
subject and no active change (changes.js), so `pending_plan` and
`reconciliation_required` are the codes that reach it. An absent reason keeps
today's sentence.

**The one exception to "an unknown code prints as served."** A
`focus_pin.reason` that `admissionReason` has no words for reads as its existing
generic sentence, "Harmonic is not offering a Focus from this read.", not as the
code. That sentence is what `admissionReason` already returns for every unknown
reason, and Diagnose's Focus context already prints it from the same function;
the entry reuses that function whole rather than adding a second rule for one
caller. Every other line in this ADR prints an unknown code as served.

**A refused change write names its reason in a sentence (Q3, coordinator
decision pending; default applied).** Every coded refusal the API serves carries
`code` and `message`, except the durable lifecycle 409 (api.py, the
`FollowUpConflict` / `FocusAlreadyActive` / `IntegrityError` handler), whose
detail is `{code, input_revision, admission}`. So the desk's Trial finish, Focus
resolve and later-conclusion failure lines print `<code> (409)`, and the Plan and
Focus-pin failure lines print "[object Object]" (data.js `ApiTransportError`
hands the object detail to `Error`). The handler serves `message` beside `code`
from a closed module-level table in api.py; the desk's failure lines print the
served message (`error.message`), never the code. The code stays in
`detail.code` for tests. A line that appends its own full stop after the message
(the Focus pin line, focus-entry.js: "Starting the Focus failed: <message>. No
successful pin was confirmed.") strips one trailing full stop from the message
first, so it never prints two.

The table covers every code the handler can serve, enumerated from the
producers rather than from this ADR: `refusals.py` in this change scans every
module under `ciq_autotune/` for `FollowUpConflict` raises in either quote
style, adds the handler's default, and fails when a raise passes a code that is
not a string literal. On the base it finds 32 raise sites, all literal, and 22
codes: the twenty-one below plus `lifecycle_conflict`. The shipped completeness
test (task 1.2) carries its own copy of the scan; `refusals.py` is triage
evidence and nothing imports it, because the public tree excludes this
directory.

| Code | Message | Raised at |
|---|---|---|
| `request_identity_mismatch` | This request was already recorded for a different change. | api.py `retry` |
| `late_conclusion_mismatch` | A different later conclusion is already recorded for this Trial. | api.py `terminal` |
| `stale_input_revision` | New pump or sensor data arrived since this page was read. | api.py; store.py `follow_up_transaction` |
| `stale_source` | The findings changed since this page was read. | api.py; `selected_source` |
| `ineligible_source` | This finding is not offering an action from the current read. | `selected_source`; Focus `pin` |
| `stale_draft` | The Plan draft changed since this page was read. | Plan apply |
| `occupied_admission` | Another change is already being watched, or a recorded Plan is still pending. | Plan apply; Focus `pin` |
| `missing_source_profile` | No pump profile has been read to record this Plan against. | Plan apply |
| `ineligible_draft` | The Plan draft no longer matches the action this read offers. | Plan apply |
| `nonpending_plan` | This Plan is no longer pending. | Plan `withdraw` |
| `nonactive_subject` | This change is no longer the one being watched. | finish / resolve |
| `immature_trial` | This Trial is still maturing. | Trial finish |
| `trial_not_expired` | This Trial did not expire unreviewed, so it takes no later conclusion. | `conclude` |
| `transaction_aborted` | The save stopped partway, so nothing was recorded. | store.py |
| `legacy_ending_unavailable` | This earlier Focus ended before Harmonic saved endings, so no ending can be recorded for it now. | store.py:1709 |
| `unknown_request_subject` | This change has no record to save against, so nothing was recorded. | store.py:1823 |
| `transaction_required`, `orphan_base_record`, `base_record_mismatch`, `invalid_reconciliation_identity`, `invalid_frontier_trial` | Harmonic's change records could not be reconciled, so nothing was recorded. | store.py (`invalid_frontier_trial` at :1772) |
| `lifecycle_conflict` | Another change was recorded at the same time, so nothing was saved. | the handler's default (`FocusAlreadyActive`, `IntegrityError`) |

An unknown code's message is the code itself. If the coordinator rules this out,
tasks 1.2 and 3.5 and the refusal requirement are dropped; the failure lines
would then need their own desk-side words.

**Enumerated and unchanged, with the reason:**

- the Trial finish line's `admission.reason` fallback (follow-up.js `mount`):
  unreachable, because `can_finish_trial` is set to `not is_maturing` in the same
  statement that sets the maturity (watched_change.py:1523–1525), so a Trial
  that cannot finish is always maturing and prints "the watch is still
  maturing";
- the Focus entry's `offered.subject` fallback: the entry compares the `/api/focus`
  and guidance reads by `input_revision`, and `/api/focus` cuts its
  `pinnable_patterns` from that same guidance read, so the candidate is present;
- `comparison.assessment.reason`, `limitations` and outcome-row cells: served
  prose, or no reason printed at all;
- Changes' guidance disposition (changes.js), set-aside rows whose subject the
  read no longer carries (guidance.py serves `title: None`, so changes.js prints
  the subject id) and the Plan's "Priority" subject ids (plan-view.js): outside
  this fence under the Q2 default, handed to the coordinator for #451.

**Why the words live where they do.** The comparison vocabulary is one table
because ADR 430 made it the one; a second reason table on the Focus lines would
be a second copy of the same fact. The refusal messages are served because that
is how every other coded refusal in the API already reaches the desk, and it is
the one place three surfaces (Changes' follow-up, Plan and the Focus entry)
share.

## Risk contract

Copied unchanged from the scope ledger (`docs/scope/449-focus-served-words.md`).

- **Must prevent:** a Focus or change-record line naming the watched behavior
  by a name the server does not serve for that lever, or by an internal key; a
  known served code printed as its code on these lines; words that claim more
  than the served code (a met criterion, a readable rate, a favourable read);
  any change to which lever a Focus watches, pin eligibility, adherence
  measurement, readiness, ranking, staging, caps or floors; a served code
  changed in a payload or data attribute; real data in a fixture or test;
  secret exposure; silent incorrect success.
- **Must recover:** none; every change is a render or a read-time field.
- **Accepted failure:** a code the backend adds before the word table does
  prints as served; a lever outside the named set prints "Watched behavior".
- **Unsupported:** localisation; codes from surfaces outside this fence.
- **Evidence owed:** node tests through the public renderers for every
  enumerated code and both name paths, each failing first on the base; a
  backend test through `/api/verify/trials` for all eleven pinnable levers, a
  Pattern Focus and a lever outside the set; replay stories S173–S176 and the
  amended readiness helpers, coordinator-run at both sizes.
- **Why:** these lines sit on an advisory dosing surface; the harm is a
  misleading or unreadable line, not a dose computation.
- **Disposition:** copied here, the admitted artifact.

## Behavior ledger plan

Premises (`premises.py` in this change, in process, no server):

- c3-focus: an active Pattern Focus on `late_bolus`, titled "Highs after
  meals", both readiness arms served `verdict: ready`.
- c3-preempted: a manual and a preempted Focus ending, each saved
  `unavailable_adherence`, both arms' adherence and harm `zero_opportunities`,
  both readiness arms `withheld/zero_opportunities`; and an `overnight_drift`
  Focus ended `lever_unavailable`, titled "Focus".
- c4-history: a preempted Focus ending whose adherence serves
  `insufficient_measurement` on one arm and whose readiness serves
  `withheld/collecting`.

New stories, all in `C4_STORIES`, mapped in `frontend/replay-cases.mjs` and
registered in `frontend/desk-behavior.replay.mjs`. They read served names and
codes from the API and check words through the rendered page; no replay module
imports a follow-up renderer (the coordinator lays this harness over the base,
where a new named import would fail the whole replay at module link):

- **S173** (c3-focus): the active Focus's Observed behavior row and "What this
  Focus watches" print the served `lever_title`, and the opportunity verdict
  line prints words, never the served verdict code.
- **S174** (c3-preempted): the manual-ended Focus record's ending assessment
  names its served reason in words; no served code appears on its harm cells,
  "Not met" lines or opportunity lines. This closes the saved-Focus-ending gap
  S49 leaves (R450).
- **S175** (c4-history): the preempted Focus record's Observed behavior cell
  names its served measurement reason in words, keeping its measured count; its
  collecting arm's "Not met" line is words.
- **S176** (c3-preempted, Q1): each Focus record's "What changed" names the
  watched behavior by its served `lever_title` while the nameplate keeps the
  Pattern's title, and the `overnight_drift` record prints neither its key nor
  "Focus" as the behavior.

Amended in replay only, story text unchanged: **S46, S91, S92, S93**. Their
shared c3 and c4 `readiness()` helpers asserted the raw served `arm.reason`
appears in the arm; they now assert the "Not met" line is not the raw
`Not met — <code>.` form and, for a Pattern arm, that the verdict line is not the
bare served verdict. S91's injected prose reason still prints as served.

Every C3 story still runs in the follow-up browser leg, which counts
`C3_STORIES`; no story joins C3. S57 and S58 already cover c3-focus and
c3-preempted in the fixed PR smoke slice and c4-history is covered, so
`SMOKE_STORIES` and its digest are unchanged. The ledger inventory moves to 175
issued · 156 active · 19 retired (174 · 155 · 19 if Q1 drops S176); the header's
inventory line, ACCEPTANCE.md's count sentence and the release freeze block are
the coordinator's.

## Siblings

- #442 saves a backfilled ending's assessment unavailable "with a reason that
  prints as words" (R442). Its `context_after_ending` is worded here, above;
  #442 adds no `COMPARISON_REASON` entry, and any further code it serves reaches
  this change through the coordinator.
- #445 edits the Day-link handlers in follow-up.js and history.js; #446 edits
  focus-entry.js's plain arrival; #452 edits history.js's later-conclusion
  memory. Different lines of the same files; merges are the coordinator's.
- #451 owns guidance titles and Changes' setting values; the three Changes and
  Plan prints above are offered to it under Q2.
