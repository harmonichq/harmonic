"""The closed lever taxonomy (#70 §2) — the ~7-set of actionable root causes.

The scenario engine attributes exactly **one** lever per episode: its earliest
*actionable* driver (root-cause-by-time). Co-occurring behaviors are narrated as
consequences of that lever, never as separate flags — this is what dedups a single
dinner that trips three instance classifiers into one attributed episode.

Each lever owns:

* a stable ``value`` (the payload string a frontend keys off),
* a human ``title`` (for narrative / pattern headers),
* the outcome ``exposure`` family the episode belongs to (the recurrence population
  is owned separately by :mod:`.evidence_population`),
* a specific ``recommendation`` (the closed set's promise: one lever → one
  action), and
* a plain-language ``meaning`` — what the lever says *happened*, in the user's
  own terms (the ``recommendation`` is the action, the ``meaning`` is the read).
  This is the one authored copy the #157 Guide / ``/api/catalog`` surfaces; it
  lives here so ``_META`` stays the single source of truth and the UI can't drift,
* and an ``outcome_kind`` — the anchor kind its consequence lands on, which is what
  decides the clock window a finding is read in (#730).

Adding a lever is a deliberate act (e.g. #65 infusion-site aging); the set is
closed on purpose so every attributed episode maps to a known template.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional


class Exposure(str, Enum):
    """The canonical event family an episode outcome belongs to."""

    MEALS = "meals"
    LOWS = "lows"
    CORRECTION_CLUSTERS = "correction_clusters"
    HIGHS = "highs"


class Lever(str, Enum):
    """The closed set of actionable levers an episode can be attributed to.

    Subclasses ``str`` so it serializes to a plain string in the payload and
    compares equal to its value (``Lever.CARB_UNDERCOUNT == "carb_undercount"``).
    """

    CARB_UNDERCOUNT = "carb_undercount"
    LATE_BOLUS = "late_bolus"
    MEAL_OVER_DELIVERY = "meal_over_delivery"
    OVER_TREATED_LOW = "over_treated_low"
    CORRECTION_STACKING = "correction_stacking"
    CORRECTION_ON_IOB = "correction_on_iob"
    MISSED_MEAL = "missed_meal"
    MEAL_BOLUS_SHORT = "meal_bolus_short"


# Per-lever metadata: title, the outcome Exposure it belongs to, the
# single recommendation the closed set promises, and the plain-language meaning
# (#157). Keep these in lock-step with the taxonomy table in #70 §2.
_META = {
    Lever.CARB_UNDERCOUNT: (
        "Carb undercount",
        Exposure.MEALS,
        "Carbs were likely undercounted — estimate higher, or split the dose for "
        "big meals.",
        "You bolused for a meal, but glucose still ran away high afterward. The "
        "dose covered fewer carbs than the meal actually held.",
    ),
    Lever.LATE_BOLUS: (
        "Late bolus",
        Exposure.MEALS,
        "Glucose was already climbing at the dose — try bolusing ~15 min before "
        "eating.",
        "Glucose was already climbing when the meal bolus landed, so the insulin "
        "spent its first stretch just catching up to a rise already underway.",
    ),
    Lever.MEAL_OVER_DELIVERY: (
        "Meal over-delivery",
        Exposure.MEALS,
        "The meal dose ran glucose near-low — a slightly smaller dose may leave "
        "less to walk back.",
        "The meal dose was a touch strong, so glucose dropped toward a low "
        "afterward, leaving something to walk back.",
    ),
    Lever.OVER_TREATED_LOW: (
        "Over-treated low",
        Exposure.LOWS,
        "The low rebounded high — follow your usual low-treatment plan and recheck "
        "in 15 min before treating again.",
        "A low got more fast carbs than it needed and rebounded high.",
    ),
    Lever.CORRECTION_STACKING: (
        "Correction stacking",
        Exposure.CORRECTION_CLUSTERS,
        "Corrections stacked, then went low — give one ~1–2 h to act before adding "
        "more.",
        "Corrections landed back-to-back before the first had finished working, "
        "and the combined insulin overshot into a low.",
    ),
    Lever.CORRECTION_ON_IOB: (
        "Correction on active insulin",
        Exposure.LOWS,
        "A correction landed on insulin still working, then went low — give one "
        "~1–2 h to act before adding more.",
        "A correction landed while an earlier dose was still active; together they "
        "carried you low.",
    ),
    Lever.MISSED_MEAL: (
        "Missed / unannounced meal",
        Exposure.HIGHS,
        "Glucose rose like a meal with no bolus near it — bolusing (even late) "
        "keeps the peak down.",
        "Glucose rose with the shape of a meal but no bolus sits near it. A meal "
        "that went un-bolused, or was bolused very late.",
    ),
    # DELIBERATELY NOT CARB UNDERCOUNT (#63). That lever runs implied-I:C inference
    # and asserts a quantified carb shortfall; this one asserts only that the dose
    # given did not cover the outcome that followed, with the correction as its
    # evidence. No copy below may imply underestimated carbs, inferred grams, or a
    # ratio change — the recommendation is observation-only, and the meaning says
    # outright that the claim is not about carb counting.
    Lever.MEAL_BOLUS_SHORT: (
        "Meal bolus fell short",
        Exposure.HIGHS,
        "A correction was needed behind this meal dose — worth watching how often "
        "that happens before changing anything.",
        "You bolused for the meal, glucose climbed anyway, and a correction was "
        "needed afterward. The dose did not cover what followed. This says nothing "
        "about how many carbs the meal held — only that the dose given fell short of "
        "the outcome.",
    ),
}


# The lever → exposure rollup, derived from the per-lever metadata above. Several
# levers roll up to one exposure (both meal levers → MEALS, both low levers → LOWS),
# so the outcome-summary clean rates (ADR 0007) can group attributed episodes by the
# exposure their lever counts against — the exact denominator ``_exposure_counts``
# tallies. Kept as a materialized dict (not just :func:`exposure`) because the clean-
# rate path keys off it directly and the issue #113 spec names it.
LEVER_EXPOSURE = {lever: meta[1] for lever, meta in _META.items()}

# Where each lever's CONSEQUENCE lands — the anchor kind that answers "how did this
# end?", as opposed to the exposure above, which is the opportunity the lever is
# counted against (#730, lock term 39). Exploring by time means "how did I get here",
# so a finding belongs to the hours holding its outcome: an over-treated low is read
# in the window of the rebound it caused, never in the window of the low that
# triggered it. The values are scenario anchor kinds (``low`` / ``high`` / ``meal`` /
# ``correction``). A lever whose consequence *is* its own anchor still declares one,
# so the set stays closed and a new lever has to answer the question.
_OUTCOME_KIND = {
    Lever.CARB_UNDERCOUNT: "high",       # the run-away high after the meal
    Lever.LATE_BOLUS: "high",            # the peak the late dose never caught
    Lever.MEAL_OVER_DELIVERY: "low",     # the drop the strong meal dose left behind
    Lever.OVER_TREATED_LOW: "high",      # the rebound, never the low that triggered it
    Lever.CORRECTION_STACKING: "low",    # the overshoot the stacked doses carried into
    Lever.CORRECTION_ON_IOB: "low",      # the low the doubled-up insulin reached
    Lever.MISSED_MEAL: "high",           # the un-bolused rise itself
    Lever.MEAL_BOLUS_SHORT: "high",      # the run-away the meal dose did not cover
}


def title(lever: "Lever") -> str:
    """The human title for a lever (pattern header / narrative)."""
    return _META[lever][0]


def outcome_kind(lever) -> Optional[str]:
    """The anchor kind this lever's consequence lands on (#730), or ``None`` off the
    closed set.

    Takes the payload string as readily as the enum member — ``Lever`` subclasses
    ``str``, and the caller that asks this question reads a serialized lever off an
    exposures occurrence.
    """
    return _OUTCOME_KIND.get(lever)


def exposure(lever: "Lever") -> Exposure:
    """The canonical outcome Exposure family for a lever."""
    return _META[lever][1]


def recommendation(lever: "Lever") -> str:
    """The single closed-set recommendation this lever owns."""
    return _META[lever][2]


def meaning(lever: "Lever") -> str:
    """The plain-language read of what this lever says happened (#157 Guide copy)."""
    return _META[lever][3]
