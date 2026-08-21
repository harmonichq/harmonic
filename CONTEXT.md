# Harmonic

Local, advisory basal-profile tuning for Tandem Control-IQ users from their own
Tandem Source data. This glossary is the project's ubiquitous language: when an
issue, test, hypothesis, or report names a domain concept, use the term as
defined here and steer clear of the listed synonyms.

## Platform & data source

**Control-IQ** (CIQ):
Tandem's automated insulin-delivery algorithm that overrides the pump's programmed
basal in real time. Its activity is what separates delivered from programmed basal.
_Avoid_: the algorithm, closed loop, AID.

**Tandem Source**:
The backend platform this project pulls a user's pump/CGM history from. The only
data source — no Tidepool, no Nightscout.
_Avoid_: t:connect (that's the consumer app, not the data feed), reportsfacade, BFF.

## Basal (the tunable schedule)

**Basal profile**:
A wall-clock schedule of hourly-ish background insulin rates the pump follows when
CIQ isn't intervening. The thing this project exists to tune.
_Avoid_: basal program, basal pattern.

**Programmed basal**:
The rate the user's basal profile calls for at a given time — what the pump *would*
deliver with CIQ off.
_Avoid_: profile rate, profileBasalRate, scheduled basal.

**Delivered basal**:
The rate CIQ actually gave, after its adjustments. The signal the model tunes
against.
_Avoid_: commanded rate, commandedRate, actual basal.

**Algorithm rate**:
CIQ's own computed target rate for an interval, distinct from what it ultimately
delivered.
_Avoid_: algo rate, algorithmRate.

**Suggested basal profile**:
The model's advisory output — a proposed basal profile derived from delivered basal.
Advisory only; never pushed to the pump.
_Avoid_: recommended profile, new profile, tuned profile.

**Slot**:
One time-of-day bucket the basal schedule is reasoned about in. A suggested profile
is one rate per slot. **Slot** is the engine and technical-documentation term;
user copy names the bare half-hour range, such as **Basal · 00:00–00:30**.
_Avoid_: bucket, bin; slot in user copy; segment for a basal model slot. **Segment**
is reserved for an actual pump-profile or I:C segment.

**Consolidated profile**:
The current recommendations rolled into a single pump-programmable profile of ≤16
segments — the deliverable a user could actually enter.
_Avoid_: final profile, merged profile.

## Other tunable parameters

**ISF**:
Insulin sensitivity factor — how far one unit of insulin drops glucose. Estimated
from a fasting-window regression. **ISF** is the engine and technical-documentation
term; **"Correction factor"** is the sanctioned user-facing label. User copy puts
the insulin unit first, such as **1 U : 36 mg/dL**.
_Avoid_: sensitivity; ISF, mg/dL/U, or mg/dL per unit in user copy; correction
factor in engine or technical-documentation prose.

**I:C**:
Insulin-to-carb ratio — grams of carb covered by one unit of insulin. I:C is the
engine and documentation term; **"Carb ratio"** is the sanctioned *user-facing*
label — it is the pump's own word for the setting and what the shipped
surfaces already say.
_Avoid_: ICR, I:C ratio; carb ratio in engine/doc prose (it is user copy only).

**I:C meal ledger**:
The closed accounting for what a meal required to land at its full-DIA outcome:
meal carbs plus attributable rescue carbs on the carb side; meal bolus, acted
post-meal corrections, acted CIQ basal delta versus programmed, and glucose travel
on the insulin side. Inside this ledger, CIQ basal add/cut is meal compensation,
not basal-profile evidence. Closes only for an isolated meal with a readable
outcome and attributable ledger terms; overlapping meals/snacks are not split and
instead fall back to direction/gating.
_Avoid_: bolus-only I:C, correction burden (that's one ledger term).

**I:C-identifiable meal**:
An isolated meal whose start has less than 0.5 U of reconstructed action from
earlier carb-bearing boluses. Correction-only prehistory is allowed. If the
preceding insulin-action span cannot be reconstructed, the meal is unknown rather
than clean. Contaminated and unknown meals remain coverage evidence but cannot set
numeric I:C direction.
_Avoid_: clean meal (ambiguous with data quality), low-IOB meal (correction action
does not disqualify it).

**Fasting window**:
A stretch with no recent carbs used to read ISF, where glucose change is
attributable to insulin alone.
_Avoid_: fasting period, resting window.

## Settings history

**Settings snapshot**:
The pump's *current* ISF/I:C/target/DIA/basal schedule, captured append-only on
every fetch. Tandem exposes no settings-change event, so successive snapshots are
diffed to manufacture one. Forward-only: it can only date changes made *after* the
first fetch; earlier edits are `unverified_before` that instant.
_Avoid_: settings blob, settings log.

**Setting epoch**:
The maximal recent stretch over which a pump setting held constant. Per-parameter
and consumer-specific: a basal edit still cuts the matching basal slot's measurement
window because programmed basal is the delivered quantity, but ISF/I:C epochs no
longer cut ISF/I:C measurement (ADR 0039). For ISF/I:C they drive caveats and
settling while the measurement uses the full requested window. Snapshot-derived for
ISF/I:C/target, reconciled with **Dose-stamped settings** where available;
dense-feed-derived for basal.
_Avoid_: settings window, epoch (unqualified — say which parameter).

**Dose-stamped setting**:
The ISF / target / carb-ratio the pump recorded as *active at that instant* on an
individual bolus (`Msg2.ISF`, `Msg2.targetbg`, `Msg1.carbratio`). Unlike the
forward-only snapshot, it is retroactive across the whole pull — a dense, per-dose
witness to the setting the pump actually used. ADR 0020 reduces these observations
to a dose-derived **Setting epoch** for first-time setup. ADR 0039 then limits what
that epoch does for ISF/I:C: caveat and settling, not measurement-window cuts.
_Avoid_: per-bolus snapshot, bolus settings epoch.

## Physiology & signals

**CGM**:
The dense continuous-glucose series (~288 readings/day). A single reading is an
**EGV** (estimated glucose value).
_Avoid_: BG reading (that's the sparse manual-entry event, not the sensor series),
glucose reading.

**Bolus**:
A discrete on-demand dose for a meal or correction. Carbs ride on the confirmed
bolus event; there is no standalone carb entry *in the pump feed* (the manual
**Carb log**, #125, is a separate user-entered stream, not pump data).
_Avoid_: dose (too generic), meal insulin.

**Carb log**:
The manual, user-entered stream of *unbolused* carbs (#125) — kept entirely
separate from pump bolus-carbs. In practice this is a **low-treatment log**: its
real-world content is fast carbs taken to treat a low (glucose tabs, candy), not
"meals I forgot to bolus." Meals get bolused on the pump; the user does not
back-fill missed meals here. A future feature must not assume this stream is
meal-shaped. The `source` column splits it three ways: `manual` (the quick-log
sheet — see **Rescue carb**), `rise-prompt` (a **Carb-log prompt** answer at a
missed-meal rise), `low-prompt` (a prompt answer at a printed low).
_Avoid_: carb entries (that's the table), meal log, food log, food diary.

**Rescue carb**:
A `source='manual'` **Carb log** entry — fast carbs eaten to arrest a drop. The
manual quick-log sheet is the only place the user logs these (on-device entry is
impossible when the carbs would command a 0-unit bolus), so `manual` never holds a
snack or a back-filled meal — but it *does* hold two things: **Pre-empted lows**
*and* hand-logged treatments of lows that **printed** (ADR 0011 **Coverage** — a
manual carb near a printed nadir covers its low prompt). Only the pre-empted subset
is the #172 coaching signal; a manual entry sitting on a printed nadir is a
printed-low treatment, owned by the low **Levers**.
_Avoid_: rescue snack, treatment (reserve that for the printed-low case), correction carb.

**Pre-empted low**:
The masked low a **Rescue carb** arrests *before* it prints — real downward insulin
pressure that never reaches the CGM as a nadir, so it produces **no Anchor** and no
Excursion and cannot become an Episode or a **Lever**. Gated as a `manual` entry
with **no printed low nadir** nearby (with a nadir, it is a printed-low treatment,
not this). Surfaced two ways: as an aggregate count with the low evidence, and as
a quiet Day tag at the rescue time because it is user intervention that prevented
a low. Attributed by the preceding bolus (meal → an I:C signal, correction → an
ISF signal). An attributed pre-empted low may **gate** advice that would make that
arm stronger — more meal insulin for meal-attributed rescues, stronger corrections
for correction-attributed rescues — because the user intervened to prevent a low.
A meal-attributed pre-empted low may also become numeric inside a closed **I:C meal
ledger** (its logged rescue grams are carbs-covered); outside that closed ledger it
stays gate-only. Never a standalone precision input, never a rate (a denominator
over rescues inverts ADR 0008's under-logging honesty), and never a low Anchor.
_Avoid_: silent low, hidden low, averted low, near-low (that's a shallow dip the
CGM did print).

**Observed rescue coverage**:
How many days of a window the **Carb log** was actually recording (#467). The log
began part-way through the history, so an old window holds no **Rescue carbs**
because the instrument did not exist yet — that is *unknown*, not evidence of a
rescue-free stretch. Coverage is coarse and one-directional: from the log's
first-ever recorded entry or prompt answer onward (no heartbeat proves a prompt was
ever seen). Two consequences. Historical replay is **observation-aware** — a window
counts only the rows recorded by its own endpoint, so a rescue backfilled today
never lands in a window that closed before it; event time still does the window
slice and the attribution once a row is eligible. And an under-covered window
cannot supply the silence a stronger-correction move requires (see **ISF**): quiet
that was never watched is not quiet. Alongside coverage, rescue evidence names four
states — confirmed rescue, explicit no, not sure, and no recorded observation.
_Avoid_: rescue rate, coverage %, per-low audit trail (a count of observed days
only — ADR 0012 forbids a denominator over rescues).

**IOB**:
Insulin on board — active insulin still lowering glucose. Here always
**bolus-only**: reconstructed from the bolus log, excluding basal.
_Avoid_: active insulin, insulin remaining.

**COB**:
Carbs on board — undigested grams from *logged* carbs (pump bolus-attached carbs
+ the Carb log), decayed forward from the logged amount by a **static**
constant-rate curve. An **exclusion signal only**: it scales how long a carb
masks a window, never a modeling/regression input and never dosing or coaching
advice. Never inferred or re-fit from CGM shape — that would be dynamic COB, the
Loop/oref quantity, which is banned here because it launders the ISF residual
this tool exists to measure (ADR 0033, extending ADR 0008). NULL-gram entries are
not decayed; they keep the flat window.
_Avoid_: active carbs, carbs absorbing, dynamic COB, carb IOB.

## Analysis

**Clean window**:
A stretch of data with confounders filtered out, eligible to inform a suggestion.
_Avoid_: valid window, good window, usable window.

**Gate DIA**:
The DIA (duration of insulin action) the clean-window filter reconstructs bolus
IOB at, purely to decide *when a minute is clear of meal insulin* — a threshold
gate, not a quantity. Deliberately short (180 min, ADR 0004) to maximise basal
coverage; validated on basal-estimate drift, so its modest lightness versus the
pump's own IOB is intended, not an error. Owns `ModelConfig.insulin_dia_min`
(ADR 0013). _Avoid_: coverage DIA (overloads Coverage), the DIA.

**Maintenance need**:
What the three tuning estimators measure — the insulin required to hold glucose flat
and in range — read only from **Clean windows**. By construction this is blind to the
lows the settings *caused*: a fasting low is suspended and below range, so it is
filtered out, never measured (ADR 0038). The gap the **Harm signal** fills.
_Avoid_: baseline need, background requirement.

**Harm signal**:
A printed low, attributed to one estimator (basal / ISF / I:C) and applied as a
**gate + capped downward nudge** — forbid a more-insulin move, and nudge toward less
by at most one step cap — never a precision value that *sets* the number. The layer
that lets the model *act* on the lows the **Maintenance need** estimators are
structurally blind to; sourced **print-first** (the CGM nadir), with **Rescue carb**
grams only for the masked residual (ADR 0038, amending ADR 0012 §4). A
**Pre-empted low** is weaker because it has no CGM nadir magnitude: by default it
is gate-only safety for the attributed arm, but a meal-attributed rescue can enter
a closed **I:C meal ledger** as logged carbs-covered. Distinct from a **Lever**
(routes attention) and from the precision estimate (sets the number).
_Avoid_: low penalty, hypo signal, safety override, low lever.

**Accounting DIA**:
The DIA the pump-matched, units-accurate bolus-IOB reconstruction runs at (300
min — the pump's programmed duration; matches the pump's reported IOB to a small
bias at peak, ADR 0013). Used by every consumer that needs a real IOB *quantity*: ISF/IC, the
behavioral classifiers, the scenario residual-IOB credit, the #181 meal balance
sheet. Same single-exponential shape as the Gate DIA, longer duration. _Avoid_:
quantify-grade DIA (adjective, not a name), physiological DIA, SwanMeal DIA.

**Backtest**:
Scoring a suggested profile against held-out data to check it would have helped.
_Avoid_: validation, replay.

## Behavioral layer

**Detector**:
An analyzer that inspects the timeline for one class of actionable pattern (e.g.
late bolus, correction stacking) and emits Findings.
_Avoid_: rule, check, analyzer (analyzer is the broader module family).

**Finding**:
One behavioral observation from a detector — a severity, a plain-English
suggestion, and the evidence behind it.
_Avoid_: alert, warning, issue, insight.

**Evidence**:
The data backing a Finding — the aggregate that justifies it, drilling down into
Occurrences.
_Avoid_: proof, support, backing data.

**Comparison support**:
The presentation authority of an event-aligned cohort or five-minute point,
based on how many distinct usable Occurrences contribute. `Supported`, `Limited`,
and `Withheld` are independent of classifier outcome and Evidence tier.
_Avoid_: confidence, reliability, evidence tier, sample quality.

**Occurrence**:
One concrete instance behind a Finding's evidence — a specific timestamp a user can
jump to, plus a one-line detail. "Jump to" is a **contract, not aspiration** (ADR
0037): an Occurrence anywhere it renders (the Settings audit workspace's lows,
rescue, and habit-occurrence rows included) deep-links to the **Day** surface at its
day with that moment ringed; a habit Occurrence also pre-selects its lever in Day's
Lever filter (setting-evidence rows have no behavioral lever and land unfiltered). The
contract is occurrence-scoped: an **aggregate** (a 30-day average, a count, a rate)
never carries a Day link — a day view of an average is meaningless.
An Occurrence also carries a **verdict** (its anchor state + whether its episode
attributed a lever), not just a timestamp.
_Avoid_: instance, event, hit.

**Evidence tier**:
How well the engine could *judge* a verdict — `Observed` (seen directly in the
data), `Inferred` (deduced from surrounding signal, not directly watched), or
`Not-in-data` (too little CGM to judge). A **confidence axis, orthogonal to the
outcome** (did the behavior fire): a clean anchor is still "Observed" because the
engine plainly saw that nothing happened. The two must never be shown as one badge
— reading the tier as the outcome is the collision #277 fixed. On the findings feed
the outcome leads; the tier is subordinate (and, on load-bearing verdicts, almost
always `Inferred`).
_Avoid_: honesty tier, confidence tier, outcome (the tier is not the outcome),
observed=happened.

**Override gap**:
The signed difference between the bolus the user confirmed and the dose the pump
calculated — `requested_insulin − (food_insulin + correction_insulin)` on the
bolus row. Positive = the user dosed *above* the recommendation, negative =
*below*. The direction+magnitude signal behind the override work (#161); the
pump's `useroverride` flag says only *that* the user overrode, the gap says which
way and how much (ADR 0014). Trustworthy only on non-extended calculator boluses.
_Avoid_: override amount, delta, adjustment, correction (correction is the pump's
own recommended component, not the user's change to it).

**Carb-log prompt**:
A carb-log question the data still owes an answer for (#128) — "did you treat this
low?" at a sub-70 nadir, or "did you eat here?" at a missed-meal rise onset —
derived live over the last 7 days, never stored. The review queue is an **inbox of
open questions** — the model prompting for information it is missing — not a ledger
that fact-checks every low or rise. A prompt exists only while its answer is
missing; once the information is present, it drops.
_Avoid_: notification, reminder, alert, review (that's the UI surface).

**Coverage**:
The relationship by which a Carb log entry answers a Carb-log prompt: a manual
carb within a time window of a pending prompt's Anchor *covers* it — the missing
information is now present, so the prompt drops from the queue entirely. No stored
response, no ✓ pin, no audit trace; delete the covering carb and the prompt
returns (it is missing again). A logged low treatment covers the "did you treat
this low?" prompt at that nadir.
_Avoid_: match, dedup, suppression (that's the effect, not the relationship).

## Scenario engine

**Scenario**:
An episode-level, ranked account of the recurring situations a user faces (the #64
Patterns view). Built by clustering the timeline into episodes and attributing a
cause to each.
_Avoid_: story, narrative, situation.

**Anchor**:
An actionable instant the timeline is segmented around — a meal bolus, a
correction, a CGM low nadir or high peak, or the start of a CIQ suspend.
_Avoid_: marker, point, moment.

**Episode**:
A cluster of anchors treated as one coherent event to reason about and attribute.
_Avoid_: incident, session.

**Lever**:
The single attributed cause of an episode, drawn from a closed taxonomy — the one
thing a user could change. One lever per episode.
_Avoid_: cause, factor, root cause, knob.

**Lever flavor**:
Whether a lever's recommended fix is a **tuning** change (edit a pump-programmable
value — basal rate, ISF, I:C, target) or a **behavioral** change (change a habit —
pre-bolus timing, stop chasing highs with manual corrections, stop over-treating
lows). Flavor follows the *fix the evidence supports*, not the detector or the
parameter a finding surfaced under: "meals start high" surfaces under I:C yet is a
behavioral lever (pre-bolus earlier), never a ratio edit. A tuning fix materialises
in the Consolidated profile (a pump-ready number, backtestable); a behavioral fix
has no pump artifact and is tracked over time by Clean rate.
_Avoid_: knob, category (say flavor); do not equate flavor with lever type — one
lever type can resolve to either flavor.

**Pattern**:
A group of episodes sharing a lever, scored and ranked — the recurring behavior a
user should act on.
_Avoid_: trend, theme, cluster.

**Exposure population**:
A lever's **entire** Exposure denominator, occurrence by occurrence — all the lows
behind an over-treated-low lever, not just the ones it attributed (ADR 0037, #272).
The *denominator* is live and load-bearing: it is the **n** in every "k of n"
recurrence rate, and several levers share one (both low levers → `LOWS`).

The old browse over it remains retired in the shipping app
(adr-500-exposures-endpoint-retired, #500). ADR 571 authorizes new work that can
surface the population in Diagnose **Explore** as evidence, without restoring the
retired Diagnose-card composition or turning the browse into advice. Until that work
ships, nothing renders the full population: the app shows occurrences attributed to a
lever, not the whole denominator they were drawn from.
_Avoid_: lever index, browse view (the new work belongs to Explore, not a revived card).

**Audit**:
The decision mode within the top-level Diagnose tab. It holds one ranked queue of
engine-qualified **Audit items**: tuning items and behavioral **Findings**. Only a
tuning item can stage a move into **Plan**; behavioral Findings remain advisory. Its
boundary is deliberate: an observation in **Explore** is not an Audit item until the
engine independently qualifies it. Held, still-collecting, and historical tuning
reads remain visible in a separate **Watching** section beneath the action-ready
queue; they do not compete in its rank.
_Avoid_: settings screen, recommendation list (too broad), Plan (Audit decides; Plan
holds the staged pump change).

**Audit item**:
The presentation-level umbrella for either a tuning item or a behavioral **Finding**
in Audit. A tuning item is assembled from a **Tuning Lever** plus its basal, ISF, or
I:C estimate; it is not itself a Finding.
_Avoid_: Finding when the item is tuning, recommendation (not every item can act).

**Watching**:
The subordinate Audit section for held, still-collecting, and historical tuning
reads that are not available for a decision. It keeps incomplete or past evidence
visible without promoting it into Audit's action-ready rank.
_Avoid_: queue, backlog, snoozed findings.

**Explore**:
The investigation mode within the top-level Diagnose tab. It helps someone inspect
their own glucose, insulin, meals, and behavioral evidence, and may link to an
already-qualified **Audit item**. It is never a source of dosing advice or a path to
stage a setting move.
_Avoid_: separate top-level tab, recommendation queue, Audit.

**Priority**:
The single 0–100 number that ranks every Lever — tuning and behavioral — in one
honest queue, so a strong habit can outrank a thin setting. Computed identically
for both flavors as `100 · √(impact · confidence-adjusted recurrence)` (the
geometric mean of two factors, so one weak factor drags the whole score down).
The two factors: **impact** — how much this lever costs when it acts (behavioral:
the hypo-weighted effect size in [0,1]; tuning: the **Insulin currency** mapped
through one shared soft-saturation curve) — and **confidence-adjusted recurrence**
— how reliably and how often
it shows up, as a single Wilson lower bound that fuses "how often" and "how sure"
(splitting them double-counts uncertainty). A Lever with Priority above the active
threshold is *actionable now*; below it collapses into the "why so few?" tail.
_Avoid_: score (overloaded — the behavioral `Confidence.score` is one input, not
this), rank, weight, severity (that is one flavor's impact input, not the whole).

**Recurrence channel**:
One of the several `k of n` evidence streams a Lever's confidence-adjusted recurrence is measured from, the different ways the same bad setting shows up (e.g. meal-caused low days, correction-rescue days, suggested-side nights or meals). One user's off ratio prints lows; another pre-empts them with rescue carbs so no low prints but the rescue log recurs; another only shows a measurement that disagrees. Recurrence is the **strongest channel** (highest Wilson lower bound) a Lever has, so a fingerprint present in one channel isn't missed for lack of another. A channel counts either days in the analysis window or the nights/meals that actually had clean data; the plain-count line under the Recurrence bar shows that *observed* count, never the window-padded denominator the Wilson bound uses to discount thin data.
_Avoid_: signal, source, symptom; factor (a factor is impact or recurrence, one level up, not one of recurrence's channels).

**Insulin currency**:
The shared unit that makes all three tuning Levers (basal, ISF, I:C) comparable
for Priority: **insulin units per day implicated by the change the analyzer can
recommend now**. A basal block moving by 0.2 U/h for 90 min redistributes ~0.3
U/day; an ISF recommendation changes correction insulin by
`corrections/day·Δbg·|1/current − 1/recommended|`; an I:C recommendation changes
meal insulin by `carbs/day·|1/current − 1/recommended|`. This deliberately prices
the safe, step-capped action available this cycle, not the uncapped gap to an ideal
measurement: Priority decides what is actionable now, while later windows can
re-price the next step. I:C has one explicit masker exception: logged rescue carbs
add `rescue grams/day ÷ measured I:C` insulin-equivalent currency even when the harm
gate holds the number at current. That evidence exposes masked excess insulin but
never invents a dose recommendation. ISF has the mirror-image exception: a harm-owned
weaken is **direction-only** (adr-468-harm-owned-isf-weaken-is-direction-only) — the
recurring correction-caused lows say which way to move but do not size the move — so it
carries no recommendation, yet it is still priced off the capped step it would have
taken, so removing the number does not remove the Lever from the ranking. One currency
and one shared soft-saturation
curve put all three on the same impact axis without a hard high-end clamp.
_Avoid_: dose error, total mis-dose, recommendation size (say insulin currency when
you mean the cross-parameter unit).

**Silence reason**:
Why the engine withheld a Lever from an episode — the reason it stayed silent. A
closed set of six: *insufficient-data* (too little CGM to judge), *no-trigger*
(the behavior plainly didn't happen), *under-threshold* (it happened but fell
short of the bar — the near-miss), *upstream-cause* (an observable recent low or
defensive suspend already explains the move — the context gate), *prior-high-
baseline* (the rise was from an already-high start, not from-flat), and *horizon-
expired* (the outcome never arrived inside the classifier's window). The negative
complement of a **Lever**: every episode gets either one Lever or one Silence
reason. Distinct from being **outranked** — an episode whose behavior *did* match
but lost to an earlier-driver Lever and is narrated as a consequence, decided at
attribution time across anchors, not a property of any one judgment.
_Avoid_: gate reason (the "gate" is only the upstream-cause case, not the whole
set), non-finding, null lever, miss.

## Outcome summary

**Post-meal arc**:
The peak BG and subsequent nadir BG for a single meal, treated as one object.
Peak = highest CGM in (bolus_time, bolus_time + 3 h], truncated at the next
carb-tagged bolus. Nadir = lowest CGM in (peak_time, bolus_time + 6 h], same
truncation. Both are absolute mg/dL values — no baseline offset. The arc is the
instrument for "flatten the curve": peaks coming down and nadirs staying up on
the Outcomes trend card. The two halves have split denominators: all carb-tagged
meals for the peak series; only meals with ≥ 3 h of nadir window remaining for
the nadir series. When rescue carbs arrested a descent, the arc records the
arrested nadir as-is per ADR 0012 and may carry display-only rescue context on
the meal point/window. That context means "the user intervened here," not "the app
guessed the unassisted low" and not "X% of meals needed rescue." See ADR 0018.
_Avoid_: glucose curve, meal curve, arc score (implies a single composite number).

**Arc peak**:
The highest CGM reading in a meal's peak window (bolus → bolus + 3 h, truncated
at the next meal). An absolute mg/dL value. Contributes to the peak trend series
for all carb-tagged meals. Distinct from the legacy `post_meal_spike` (net-new
above start BG), which the arc supersedes.
_Avoid_: post-meal spike (the old metric name), net-new peak.

**Arc nadir**:
The lowest CGM reading in a meal's nadir window (peak → bolus + 6 h, truncated
at the next meal). An absolute mg/dL value. Contributes to the nadir trend series
only for meals where ≥ 3 h of the nadir window remained before truncation.
_Avoid_: post-meal crash (too narrow — a nadir can be 90 without a crash), floor.

**Outcome summary**:
The aggregate glycemic-quality snapshot over a window — how the user *is doing*,
the positive-framed counterpart to the deficit-framed Findings/Patterns. Two
layers: objective Metrics and derived Clean rates. Not a new analyzer; Metrics is
new computation over the CGM series, Clean rates are read off the existing
scenario exposure machinery.
_Avoid_: report card, scorecard, dashboard, KPI.

**Glycemic metric**:
An objective aggregate glucose statistic over a window — Time in Range, GMI,
coefficient of variation, etc. No judgment attached; just the number.
_Avoid_: stat, KPI, score.

**Clean rate**:
The fraction of opportunities of a given Exposure (meals, lows, correction
clusters, highs) that drew **no** negative Lever — the derived "win". The
complement of a Pattern's rate against the same denominator. Not a detected
object; there are no positive detectors.
_Avoid_: win, success rate, positive finding, good pattern.

**Localized outcome**:
A Verify outcome card that carries a *where* — a time-of-day, day-of-week, or
context cut ("lows cluster 02–05h", "Sundays run low") — and **no causal claim**.
The adr-327 rule extended: a result without a defensible single cause is an
outcome, and an outcome may carry a where. Ships only after passing **Confound
triage** plus day-level statistics and a stability check; hides entirely when not
currently relevant. Never pinnable as a Focus; promotion to a **Lever** is a human
act (issue + ADR), never a runtime one (adr-362).
_Avoid_: pattern card, insight, localized finding (Finding is the behavioral-layer
object).

**Confound triage**:
The attribution gate a **Localized outcome** must pass before display — is the
split *caused by* what the card names, or manufactured by selection (the user's own
behavior creates the split), carryover (the effect is inherited state, concentrated
in the first hours and absent on clean handoffs), or time-of-day imbalance? Priced
per card with day-level (cluster-level) inference, not reading counts. Distinct
from a significance test: a finding can be descriptively true and still fail triage
(adr-362's stale-site and fresh-site examples).
_Avoid_: stats gate (necessary but not this), sanity check, validation.

**Digest**:
The lead story at the top of Verify — "what changed since you last looked,"
computed window-over-window (the same "vs prior" the outcome cards already carry).
An active **Trial** or **Focus** always takes the top slot; otherwise only a delta
that clears the adr-364 day-level bar may headline, and a quiet window states
steadiness plainly ("Steady: nothing changed meaningfully") rather than hiding.
One strict tier — no "trending" mentions (adr-365).
_Avoid_: summary, feed, highlights, what's-new (fine as UI copy only).

**Tracked candidate**:
One cell of the **Pattern sweep** that shows signal but has not cleared the bar —
re-priced automatically as data accrues, era-bounded (its evidence restarts at the
most recent settings regime change or data gap, so old eras never rescue or dilute
it). Never named in the UI while unproven: the Verify footnote reports the sweep's
result with no names, numbers, or advice. When a cell clears the bar it flips to
"ready for review" and ships only on human sign-off (adr-365, as amended by
adr-365-swept-candidate-space — candidates are generated by the sweep, never
hand-picked).
_Avoid_: pending card, watch-list item (the watch-list is Trial/Focus territory),
hypothesis (too lab-coat for UI copy), founding member (the hand-picked list is
retired).

**Pattern sweep**:
The systematic enumeration of a **closed candidate grammar** — outcome × where
(hour-of-day blocks, day-of-week, weekend/weekday, site-age buckets, late-meal
exposure, suspend proximity, post-low context; pump-derived dimensions only, per
the adr-363 charter) — with every cell gated identically each reporting window:
the adr-364 day-level standard, **Confound triage**, era-bounded accrual, and a
significance bar tightened for the number of cells swept (multiplicity control).
The grammar is versioned; growing it is a reviewed change, but membership is
never authored by hand. The six adr-364 hand candidates are its acceptance
fixtures: a correct sweep re-derives and re-kills all six.
_Avoid_: pattern engine (adr-362 rejected the layer), mining pass (uncorrected),
scan (say sweep).

**Rest window**:
The period a user is actually at rest / asleep, **inferred behaviorally** —
primarily from bolus absence (people don't eat or touch the pump asleep),
corroborated by CGM quiescence. Deliberately *not* the CIQ Sleep schedule or
Sleep-mode-active events: those are CIQ behavior regimes and are useless as a
sleep proxy for the many users who run Sleep 24×7. A shared primitive with two
consumers — the Outcome summary's overnight cut and a future ISF retrofit (a
detected rest window excludes unlogged meals more directly than the clock window
ISF hardcodes today; ADR 0001).
_Avoid_: sleep window, CIQ sleep, night, overnight (unqualified).

**Reporting overnight**:
The sleep-time cut the Outcome summary splits TIR/TBR by — bounded by the **Rest
window**, not by a clock or the CIQ Sleep schedule. A *presentation* concept,
distinct from the **Fasting window** (an ISF *identifiability* construct, the
regime where unlogged meals are negligible, per ADR 0001). Never conflate them.
_Avoid_: overnight (unqualified), fasting window, night.

## Watching changes

**Trial**:
A tuning change the user has made and is now watching for an outcome — a discrete,
pump-programmable value (basal / ISF / I:C / target) flipped at a known instant,
which the app **auto-detects** from the settings-snapshot diff / setting epoch. An
active-profile switch starts a trial on its own, at the switch instant — the diff of
the outgoing vs incoming profile is authoritative, so the trial does not wait for the
dose stream to re-observe the new value.
Because the setting is objectively in effect, *adherence is guaranteed*, so the
Verify surface shows a clean before/after anchored to the change date and the trial
resolves **keep-or-revert**. Each trial carries a **target metric** — inferred from
the parameter + slot that changed (an overnight-basal lift → overnight lows / TIR),
else **overall** (TIR + arc) for a whole-profile switch or an untargeted raw pump
edit — which is the before/after Verify foregrounds; overall TIR is always shown
alongside. A trial never carries a lever: the lever it *descended from* (a
tuning-flavored Diagnose lever, applied to the pump) is not tracked on the trial, and
the target metric is read from param+slot, not lever provenance. Prospective and
live — the forward-looking counterpart to the retrospective **Backtest**. Passes
through a **Maturing** phase while post-change data accrues. A **revert** — the
setting walked back to its exact pre-change baseline inside the maturing window —
closes the trial as reverted; a change to a *third* value is a new trial.
_Avoid_: experiment, A/B (no control arm), settling (a phase of a trial, not the
trial itself), backtest (that is retrospective).

**Focus**:
A behavioral lever the user **pins by hand** to work on ("pre-bolus more for two
weeks"). Unlike a **Trial** it is a habit with no pump artifact and no guaranteed
adherence, so Verify tracks it in **two dimensions**: *adherence* — are you doing
it, read from the same detector that raised the lever (pre-bolus timing, over-treat
rate) — and *outcome* — did the **Clean rate** / **Post-meal arc** improve. A flat
outcome on a Focus is ambiguous until read against its adherence (didn't help vs
didn't stick); a flat outcome on a Trial is not. Resolves when it sticks or the user
drops it.
_Avoid_: commitment, goal, habit (the thing changed, not the tracked object),
working-on (fine as a UI label only).

Both share one lifecycle — start → watch (foregrounded in Verify) → resolve — with
two entry points: a **Trial** is auto-created on a detected setting change, a
**Focus** is pinned by hand.

**Plan**:
The pump-ready staging area for exactly one tuning change at a time. A Plan may
contain multiple segments only when they are one coherent profile edit for the same
variable; it must not encourage batching unrelated basal / ISF / I:C / target
changes. One variable at a time is the rule from Diagnose through Verify.
_Avoid_: change basket, backlog, batch.

**Maturing**:
A Trial's watch phase — the change is in effect but its **outcome delta is not yet
trustworthy** because post-change data is still accruing ("your 07-06 change is still
maturing, 6 of 14 days"). Gated on the **target metric's** data accrual (enough
post-change days to fill the Trial's **fixed 14-day maturing window** — a backend
fact no trend or analysis window a caller selects can move), not on model
sufficiency. Maturity accrues only within the Trial's own bounded period (from the
change through 14 days after it), so the dock and Verify count the same days for
the same change. Distinct from
**Settling** (#95), which is the *Diagnose/Review*-side state where the engine withholds
a fresh recommendation for a just-changed knob because the change is too recent to
re-judge. Same underlying fact (a recent change, immature data), two different
consumers: Maturing gates a before/after; Settling gates a recommendation. They live on
different surfaces (Maturing on Verify / the outcomes trend, Settling on the analyze
family) and compute on different gates — keep them separate.
_Avoid_: settling (that is the Diagnose-side recommendation-hold, not the Trial phase);
warming-up, incubating.

**At most one change is active at a time — Plan, Trial, and Focus all obey one
variable under study.** A Plan stages one tuning variable, a Trial watches one
detected setting change, and a Focus watches one behavior. Pump settings take
precedence: Focus pinning is **blocked** while a Trial is active, and a setting
change detected mid-Focus **preempts** it. A preempted Focus is **dropped**, not
paused — the user re-pins by hand if the intent still holds. So the app exposes a
single active watched-change object, never two lists, and should not recommend
locking multiple unrelated changes into Plan.

## Day surface

**Day navigator**:
The date-picker across the top of the **Day** surface — a month **calendar of
per-day glucose sparklines** (each cell the day's real curve in miniature),
**severity-encoded by glucose, not lever** (red = low-heavy, terracotta =
high-heavy, green = hit target TIR; **lows win** the tint on a mixed day). It
rests **collapsed** to the selected day's Sun–Sat week strip and **expands** the
full month as a transient overlay (dismisses on pick / click-away) — so the chart
and Episode Log stay above the fold on a 13" laptop. Day-switching drives one
selected-date state from three inputs: the clickable week strip (within-week), the
reused `daily-nav` `‹ ›` arrows (day-at-a-time, days-with-data only), and the
expanded month (other weeks/months). Lands on the **most recent day with data**.
The mockups' "REAL" badge marks only the captured days — a data artifact, not a
product distinction (every day with data is pickable). See ADR 0031.
_Avoid_: heat-map (that was the Investigate lever-color encoding, superseded — Day
speaks glucose), Investigate calendar (the surface it was promoted out of).

## Diagnose findings queue

**Findings projection**:
The one window's worth of queue the backend hands Diagnose: given a clock window
(a pressed preset or a drawn brace) it returns that window's rows — already
classified, merged, anchored, counted and ordered. The frontend renders them
verbatim and composes nothing. See ADR 730.
_Avoid_: filter, query result, window payload.

**Register**:
Which of the five things a queue row is: it **asserts** a direction, it is
**held** (a current setting has a number, but the analyzer withheld the move,
with its reason), it is **blind** (no clean day here at all), it is **history**
(a measurement from a setting that is no longer programmed and can never assert
a current move), or it is a **finding** (a behavior, with its window-local `n of
m` denominators). History is a tuning Audit item, not a behavioral Finding.
Quiet current parameters — the ones whose delivery agrees with their setting —
are in no register and are never listed.
_Avoid_: state, category, bucket, tier.

**Outcome anchor**:
The instant a finding is read at when a window asks "what happened in these
hours" — where its **consequence** landed, never where its trigger crossed a
threshold. An over-treated low is anchored at the rebound, so a window drawn over
the low block itself does not show it and the window over the rebound does. Each
lever declares the anchor kind its consequence lands on; anchoring happens at
projection time and never moves a stored timestamp.
_Avoid_: trigger time, occurrence time, event time.
