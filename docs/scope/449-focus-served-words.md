# #449 + #450 scope ledger: Focus behavior names and served reason words

Delegated triage for harmonichq/harmonic #449 with #450 folded in (one worktree,
one OpenSpec change `focus-served-words`, one lock posted on #449). Base
origin/main b03431d2. Route: interview mode, delegated. Settled decisions come
from the coordinator's rulings R449 and R450 (Q3 delegation, Connor Griffin,
2026-09-23, "figure it out yourself from here"); the one open frontier round
goes to the coordinator, never to the user.

## Decisions

- **The behavior is named by a served `lever_title` on the selected Focus
  detail.** Why: a Pattern Focus's served `title` is its Pattern's title
  (`_review_focus_title`), so it cannot name the behavior, and an arm-level
  field would be missing from every saved ending captured before the change.
  `_focus_meta(lever)[0]` is the nameplate's own title source for a lever Focus
  (R449). → ADR
- **`LEVER_NAME` is deleted; an unnamed lever prints "Watched behavior".** Why:
  R449; a stored lever outside the named set (c3-preempted's `overnight_drift`)
  is durable state the vocabulary can outlive. → ADR
- **Every served code on the Focus, Trial and record lines prints through the
  desk's word tables; an unknown code prints as served.** Why: R450; the lock's
  binding note keeps `availability.reason` an open provider-owned field, and
  ADR 430's fallback already honours it. → ADR
- **The comparison vocabulary gains the twelve codes the backend can serve on
  those lines** (measurement, harm, readiness, admission, legacy context and
  outcome-row codes), including `unassociated_recurrence_anchor`, which neither
  issue lists (evaluation.py:353). Why: R450 asks for every code the backend can
  serve there; enumerated from the producers, not the issue. → ADR
- **Served state, verdict and mode codes on the same lines print as words**
  (ending "Recorded · <state>", reassessment result and mode, Pattern verdict,
  the `correction_clusters` denominator). Why: coordinator instruction for this
  triage: every other raw served-code print on these surfaces is in scope.
  → ADR
- **The Focus entry's withheld copy words its served admission reason through
  guidance's existing admission words.** Why: charter reuse rule;
  `admissionReason` already words three of the four codes. → ADR
- **A refused lifecycle write serves a sentence beside its code, and the desk
  prints it (Q3 default).** Why: every other coded refusal in `api.py` already
  serves `code` + `message`; only the durable lifecycle 409 omits it, which
  prints `<code> (409)` on the Focus/Trial/record failure lines and
  "[object Object]" on Plan and Focus-pin failures. → ADR
- **The Trial finish line's `admission.reason` fallback stays unchanged.** Why:
  unreachable; `can_finish_trial` is set to `not is_maturing` in the same
  statement that sets the maturity (watched_change.py:1523–1525). inline
- **Codes stay unchanged in payloads and data attributes.** Why: R450. inline
- **Stories S173–S176 on c3-focus, c3-preempted and c4-history; S46, S91, S92
  and S93 amended in prose-neutral form (their shared readiness helpers).**
  Why: those stores serve the states on real producer output; S57/S58 already
  cover them in the fixed smoke slice, so SMOKE_STORIES is unchanged. → ADR

### Risk contract

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
- **Disposition:** copied unchanged into
  `openspec/changes/focus-served-words/design.md`.

## Open questions

Frontier round 1 (coordinator; all three independent, defaults encoded in the
draft at the pinned commit):

- **Q1.** Does a Pattern Focus record's "What changed" line name the watched
  behavior by the served behavior name, rather than the Pattern's title? Default
  yes. It modifies #426's requirement "Change records word their served facts".
- **Q2.** Do Changes' raw guidance disposition, set-aside rows printing subject
  ids, and the Plan "Priority" line printing subject ids move to #451? Default
  yes: #451 already edits the same lines and guidance.py's name tables.
- **Q3.** When the server refuses a change write (a stale read, a Trial still
  maturing), does the server serve a sentence beside its code, the way every
  other coded refusal in the API already does, so the desk prints that sentence?
  Default yes, owned here. It also ends the "[object Object]" line Plan and
  Focus-pin failures show today (data.js hands an object detail with no message
  to `Error`).

## Spawned tasks

- none (no follow-up issues in this release; Q2 is a coordinator ownership call)

## Review rounds

(instrumented per round: blockers found, each tagged `authoring` or `injected`)
