# Design — highs-attribution-account

## ADR 63 — Highs get one new evidenced cause, and an honest count for the rest

**Ruling.** A high excursion can now be attributed to a third thing:
**"Meal bolus fell short"**, a full `Lever` denominated on `Exposure.HIGHS`, which
fires only when a counted meal bolus sits in the rise's digestion window, glucose
kept climbing anyway, and a carb-free correction followed inside a bounded horizon.
It asserts a dose that did not cover its outcome — never a carb quantity. Every high
the engine still cannot account for is reported as one aggregate: the count of high
occurrences whose **Episode** carries no driver Lever anywhere, published by the
server as a finished sentence and rendered verbatim below the Diagnose findings
queue. No per-high reason is invented for the remainder.

### Context

The highs family attributed 3 of 30 occurrences on a 30-day snapshot — 10%, against
19–22% for meals and lows. `_high_lever` had exactly two exits: a #155 rebound
high-moment attributing `over_treated_low`, or `classify_missed_meal`. Everything
else returned the missed-meal verdict as the high's silence reason.

The ticket named three competing explanations and required the silence-reason
distribution to discriminate them before anything was built. Measured over the 27
unattributed highs:

| bucket | n |
| --- | --- |
| rising, but a counted meal bolus is still in the digestion window | 10 |
| ~flat — no rise to attribute | 12 |
| upstream cause (Control-IQ defensive suspend) | 2 |
| matched but outranked | 2 |
| insufficient data | 1 |

No single explanation won. The buckets are three different tickets wearing one
number, and they are settled differently.

### Decision 1 — only the digestion-window bucket earns a detector

Of those 10 rising digestion-window highs, **7 took a correction bolus 9–83 minutes
later**. That correction is an observed behavior tying a given dose to an outcome
that still needed rescuing, and it is the only bucket where raising attribution rests
on something seen rather than something assumed.

The other buckets are refused, and the refusals are the load-bearing half of this
record:

* **Flat / no-rise highs (12) are the honest ceiling.** A high with no rise has no
  per-episode trigger to blame. Slow drivers belong to the basal and correction-factor
  analyzers at the *parameter* level, where they are already modeled. Minting a
  per-episode cause for glucose that merely sat high is the plausible-but-wrong
  attribution the ticket warned about, in the advisory-dosing blast radius.
* **Defensive-suspend rebounds (2) get no lever.** A rebound off a Control-IQ
  defensive suspend is the algorithm working as designed. Levers advise a behavior
  change, and there is no behavior here to change. The shared context gate already
  excludes these, and `classify_meal_bolus_short` reaches that gate before it reaches
  its own trigger, so the exclusion is structural rather than a later filter.

### Decision 2 — "Meal bolus fell short" is not Carb undercount

These are two different claims from two different mechanisms, and the whole risk of
this change is a reader collapsing them:

* **Carb undercount** runs implied-I:C inference and asserts a *quantified carb
  shortfall* — the dose covered fewer grams than the meal held.
* **Meal bolus fell short** asserts only that *the dose given did not cover the
  outcome that followed*, evidenced by the correction that was needed. It never
  infers grams, never reads I:C, and its recommendation is behavioral
  observation-only: notice how often this happens, before changing anything.

The separation is enforced in three places rather than trusted to prose: the two
classifiers partition one population at exactly one line (a counted meal bolus in the
digestion window is missed-meal's silence and this one's trigger), their four shared
thresholds are pinned equal by test, and a test sweeps every detail string this
classifier can emit for counting vocabulary.

Carb undercount stayed silent across the 10 measured cases for distinct reasons — 4
episodes carried no meal occurrence, 3 meal judgments were under threshold, 1 had
insufficient data, 1 had an upstream cause, and 1 matched and was already attributed
— which is why the new lever is reachable at all.

### Decision 3 — the correction window opens at the meal dose, not the rise onset

A high anchor's `reach_start` is where glucose entered the high run, close to the
peak. A person watching glucose climb corrects *while it is still climbing*, so the
correction routinely lands before that onset. Scanning only forward from the onset
kept the detector silent on the exact rises it was built for.

The window therefore opens at the meal bolus, past the same-meal dose-split grace
(mirroring `carb_undercount_same_meal_grace_min`, which draws that line for the same
reason), and closes `meal_bolus_short_correction_horizon_min` past the anchor. All
seven measured cases corrected 9–83 min after the rise, so the 3 h horizon is not the
binding constraint — the requirement that a correction exist *at all* is.

### Decision 4 — support is the existing exposure-denominated discipline

The lever declares `Exposure.HIGHS` and takes the #58 Wilson confidence every
scenario lever takes. It invents **no** `safety.py` floor. `safety.py` owns the basal
night floor and the I:C block-run floor; a scenario lever with a third one would be a
second source of truth for support, and the eight-night basal floor is specifically
not the discipline here (`CLAUDE.md` records that mis-import as a recurring error).
An unsupported recurrence stays visible through the existing low-confidence narrative
behavior. A single occurrence is not a pattern and does not surface.

### Decision 5 — chronological preemption is unchanged, and outranked stays outranked

`attribute` walks anchors in time order and the first anchor yielding a Lever drives
the Episode. A meal anchor precedes its high, so this lever can drive only when every
earlier anchor stayed silent. Where an earlier anchor did fire, the high's match is
appended as a narrative consequence — diagnostic evidence, not a second attributed
occurrence, and `attributed` does not move. That is the pre-existing one-driver rule;
this record only pins that the new lever takes no exception to it.

### Decision 6 — the honest count is Episode-level, not `exposures.highs.clean`

`clean` is `n - attributed`: it counts every high that is not its own episode's
driver. **Seven of the 27** non-driver highs sit in episodes that *do* carry a driver
elsewhere — 1 over-treated low, 2 correction stacking, 3 carb undercount, 1 missed
meal. Reporting `clean` as "no cause detected" would therefore overstate the gap by
seven and claim the app failed on highs it had in fact explained.

The published value is a new whole-window aggregate beside `clean`: the number of
high occurrences whose Episode attribution carries **no driver Lever anywhere, in any
family**. On the measured snapshot that is **20 of 30**, not 27. It is computed in
`explore_exposures.build_exposures`, where the attribution is still in hand, and
passed through `findings_projection` by relabel — never re-derived at projection time,
for the same reason no row's membership is.

`clean` and `attributed` are left exactly as they were. This is a third question, not
a redefinition of the first two.

### Decision 7 — the copy is server-authored, highs-only, and whole-window

The sentence lives once, in `findings_projection.UNCAUSED_HIGHS_COPY`, at the
operator-confirmed wording **"N highs had no cause detected by the app"**. The count
is substituted server-side and the frontend renders the finished string verbatim,
which is ADR 730's rule (term 40) — the frontend composes nothing, including the
threshold: the server publishes `text: null` at zero, so no predicate of ours sits
between the data and the words.

Three properties of that sentence are deliberate:

* **Highs-only scope is explicit in the words.** The queue above it holds every
  family, so a bare "N had no cause" would read as a claim about all of them.
* **It is whole-window and never re-scopes.** A clock scope narrows which rows show;
  it does not change how many highs went unexplained. An empty scoped queue still
  reports the whole-window count, because "0 highs had no cause **in this window**" is
  the opposite of what happened.
* **It is not `queueMeta`.** The meta counts rows in the window; this counts highs
  across the findings window. One slot for two denominators is how a reader takes the
  second number for the first.

The only variation permitted on the confirmed wording is the noun's number: a surface
printing "1 highs" is a defect, and inflecting a noun is not rewording a confirmed
sentence.

**Vocabulary.** `CONTEXT.md` gives **Occurrence** as the domain term and lists *event*
among the synonyms to steer clear of; the sentence uses neither, naming the family by
the noun the queue already spells ("highs").

### Decision 8 — a high-only cause offers no event comparison

The event-comparison lens has a Meals view and a Lows view and no Highs view, so
`ALIGN_FACTOR_BY_CAUSE` is a title-keyed allowlist and a cause is excluded by being
**absent** from it. `Missed / unannounced meal` has sat outside it since it shipped;
`Meal bolus fell short` joins it, and `alignCoordinatesFor` stays module-private.

Absence is a silent contract — nothing fails when a new cause is added — so the rule
is pinned structurally instead of one title at a time: no Lever whose Exposure is
HIGHS may key that map, with the roster of such Levers pinned on the Python side so a
third high-anchored lever fails there and is pointed at the JS guard.

### Consequences

* Attribution on the digestion-window bucket rises where the correction evidences it,
  and stays flat everywhere else. The accepted failure is claiming *fewer* than the
  measured 7 per month; those fall into the honest count instead.
* The unexplained-highs number a user sees drops from a potential 27 to 20, because it
  now answers the question it claims to.
* The closed sets that had to move together: `Lever`, `_META`, `_OUTCOME_KIND`,
  `outcomes_trend._BEHAVIOR_ORDER` and its locked-order test, the model-view verdict
  sweep, and the JS projection mirror's `OUTCOME_KIND` (held identical by decision
  record 735).
* Nothing here can dose. The lever never sets `asserts_move`, never creates a Plan
  item, and never enters a pump-profile schedule; its queue row is register `finding`,
  which is not stageable.
