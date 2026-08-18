"""The #157 Guide / About payload — the type-level catalog behind ``/api/catalog``.

The Guide tab explains *your own* report in plain language: what every lever the
engine can attribute means, the ubiquitous-language pipeline (Anchor → Episode →
Lever → Pattern), the honest ways the engine deliberately stays quiet, and a
single worked example walked stage by stage.

This module is the **single authoring surface** for that page:

* The per-lever catalog is *generated* from :data:`~.levers._META` (title,
  exposure, recommendation, meaning) so it can never drift from the taxonomy the
  engine actually attributes. The new ``meaning`` copy lives in ``_META`` itself.
* The silence taxonomy is *enumerated* from
  :class:`~ciq_autotune.analyzers.classifiers.SilenceReason` (all seven members,
  ADR 0009) and the evidence tiers from
  :class:`~ciq_autotune.analyzers.classifiers.EvidenceTier`, each paired with the
  user-facing prose below. This page is a **read-only consumer** of those closed
  taxonomies — it mints nothing (#164/#167 own the enum; ADR 0009).
* The framing (what the engine is / won't do), the pipeline stage definitions,
  the exposure denominators, and the one worked example are authored copy held
  here — no PHI, derived from the source enums and hand-written teaching text,
  never from user data.

:func:`build_catalog` assembles the whole thing into the plain-dict payload the
Guide tab binds. It touches no store and no classifiers, so ``/api/catalog`` is a
cheap, DB-free GET.
"""

from __future__ import annotations

from ..classifiers import EvidenceTier, SilenceReason
from . import levers
from .levers import Exposure, Lever


# --- engine framing -------------------------------------------------------

_ENGINE = {
    "name": "Scenario engine",
    "tagline": (
        "It reads your own Control-IQ feed and names the most likely driver "
        "behind each high or low, one actionable cause at a time. It also marks "
        "what it's only inferring, or can't see at all."
    ),
    "is": [
        "A local, advisory read of your Control-IQ history. It explains your "
        "report; it does not drive your pump.",
        "One actionable cause per episode: the earliest driver, with the other "
        "co-occurring behaviors narrated as its consequences.",
        "Every claim is tagged Observed, Inferred, or Not-in-data, and any "
        "inference is hedged, never asserted as fact.",
    ],
    "wont": [
        "Won't dose for you or change a pump setting. It only suggests where to "
        "look.",
        "Won't invent what the feed can't show. Rescue carbs are invisible on "
        "Tandem Source, so anything leaning on them is Inferred at best.",
        "Won't pile on blame. Co-occurring behaviors collapse into one attributed "
        "lever, never a stack of separate flags.",
        "Won't grow its vocabulary casually. The lever set and the silence "
        "taxonomy are both closed, so adding one is a deliberate act.",
    ],
}


# --- the ubiquitous-language pipeline, taught by name ---------------------
# Stage colors are the locked worked-example palette (worked-split-synced.html):
# Anchor=--primary, Episode=--secondary, Lever=--accent, Pattern=--warn.

_PIPELINE = {
    "chain": [
        {
            "step": "Anchor",
            "color": "--primary",
            "one_liner": "A moment worth examining.",
            "body": "The engine scans your feed for anchors: a meal bolus, a "
                    "low, a correction, an unexplained rise. Each is a candidate "
                    "moment, not yet a judgment.",
        },
        {
            "step": "Episode",
            "color": "--secondary",
            "one_liner": "The story around an anchor.",
            "body": "Around each anchor the engine assembles an episode: the "
                    "glucose curve, the insulin on board, and every behavior that "
                    "fired in the window. That's the full context of what happened.",
        },
        {
            "step": "Lever",
            "color": "--accent",
            "one_liner": "The one actionable cause.",
            "body": "Exactly one lever is attributed per episode: its earliest "
                    "actionable driver (root-cause-by-time). Other behaviors that "
                    "also tripped are narrated as consequences of that lever, not "
                    "as separate causes.",
        },
        {
            "step": "Pattern",
            "color": "--warn",
            "one_liner": "The same lever, again and again.",
            "body": "When one lever recurs across episodes, it becomes a pattern "
                    "with a rate (\"ran away high in ~28% of your meals\"), scored "
                    "against how many opportunities of that kind you actually had.",
        },
    ],
    "suppression_truths": [
        {
            "title": "One episode, one lever.",
            "body": "A single dinner can trip three detectors at once. The engine "
                    "does not report three problems. It attributes the earliest "
                    "actionable driver and folds the rest in as its downstream "
                    "consequences. A behavior that genuinely happened can be "
                    "outranked by an earlier cause and suppressed. Fewer, truer "
                    "flags beat a longer list.",
        },
        {
            "title": "Silence is a verdict, not a gap.",
            "body": "Sometimes a behavior doesn't clear its bar. Sometimes an "
                    "observable low or suspend upstream already explains the move, "
                    "or a prior bolus owns the rise. In each case the engine stays "
                    "silent and records why. Every quiet episode carries a reason "
                    "(below). It would rather say nothing than assert something the "
                    "feed can't support.",
        },
    ],
}


# --- exposure denominators (the "how it's measured" note, shown lightly) --

_EXPOSURE_META = {
    Exposure.MEALS: (
        "Meals",
        "Scored against every meal in the window: how often a meal ran into this.",
    ),
    Exposure.LOWS: (
        "Lows",
        "Scored against every low in the window: how often a low ran into this.",
    ),
    Exposure.CORRECTION_CLUSTERS: (
        "Correction clusters",
        "Scored against every run of back-to-back corrections.",
    ),
    Exposure.HIGHS: (
        "Unexplained highs",
        "Scored against every unexplained high in the window.",
    ),
}


# --- the silence taxonomy, enumerated (all seven, ADR 0009) ---------------
# label + user-facing body per SilenceReason. The evidence tier each member
# rests on is read straight off the (member, tier) pairing below so the chip
# color matches the honesty tier the classifier already returns.

_SILENCE_META = {
    SilenceReason.INSUFFICIENT_DATA: (
        "Insufficient data",
        EvidenceTier.NOT_IN_DATA,
        "The window was too sparse to judge, with not enough readings to say "
        "anything honest.",
    ),
    SilenceReason.NO_TRIGGER: (
        "No trigger",
        EvidenceTier.OBSERVED,
        "The behavior plainly didn't happen: a flat slope, no stack, no "
        "correction, no low. A genuinely clean opportunity.",
    ),
    SilenceReason.UNDER_THRESHOLD: (
        "Under threshold",
        EvidenceTier.OBSERVED,
        "It happened but fell short of the firing bar: the near-miss where a "
        "mis-tuned threshold hides.",
    ),
    SilenceReason.UPSTREAM_CAUSE: (
        "Upstream cause",
        EvidenceTier.INFERRED,
        "An observable recent low and/or a defensive suspend explains the move. A "
        "recovery, not the behavior itself.",
    ),
    SilenceReason.PRIOR_HIGH_BASELINE: (
        "Prior high baseline",
        EvidenceTier.OBSERVED,
        "The rise started from an already-high level, not from flat, so it isn't "
        "the from-flat run this detector looks for.",
    ),
    SilenceReason.OWNED_BY_PRIOR_BOLUS: (
        "Owned by prior bolus",
        EvidenceTier.INFERRED,
        "A completed carb bolus in the recent lookback already owns the rise this "
        "dose landed into. A real excursion already covered, not a late meal "
        "bolus.",
    ),
    SilenceReason.HORIZON_EXPIRED: (
        "Horizon expired",
        EvidenceTier.OBSERVED,
        "The outcome never arrived inside the detector's window. The story ran "
        "past the edge of what it watches.",
    ),
}


# --- evidence tiers -------------------------------------------------------

_TIER_META = {
    EvidenceTier.OBSERVED: (
        "Observed",
        "A hard fact straight from the feed, like a bolus of 10 U at 15:48, or BG "
        "hitting 64. Asserted plainly.",
    ),
    EvidenceTier.INFERRED: (
        "Inferred",
        "Shape-derived, and therefore hedged (\"likely rescue carbs\"). Never "
        "asserted as fact.",
    ),
    EvidenceTier.NOT_IN_DATA: (
        "Not in data",
        "An explicit unknowable, flagged as such rather than guessed.",
    ),
}


# --- the one worked example, walked stage by stage ------------------------
# A fixed teaching episode (not user data — no PHI), authored to illustrate the
# Anchor → Episode → Lever → Pattern chain end to end. The locked layout
# (worked-split-synced.html) ties each step to its stage definition in _PIPELINE.

_WORKED = {
    "intro": "Here's how those four stages play out on one made-up dinner. It's a "
             "walkthrough to read, not feedback on your own data.",
    "episode": {
        "title": "Dinner ran away high",
        "attributed": "Carb undercount",
        "when": "Tue · 18:40 bolus · peak +2h05m",
        "peak": 247,
        "peak_state": "high",
        "spark_meta": "Bolus at **18:40**, then a **slow, sustained climb**. The "
                      "curve keeps rising long after the dose should have caught it.",
    },
    "steps": [
        {
            "stage": "Anchor",
            "t": "18:40 · meal bolus",
            "text": "You bolused **9.0 U** for dinner. A meal bolus is a candidate "
                    "moment, so the engine flags it to watch, no judgment yet.",
            "tier": "observed",
            "hedged": False,
            "cited_label": "from the feed:",
            "pills": [{"v": "9.0 U", "kind": "insulin"}, {"v": "BG 132", "kind": "cgm"}],
        },
        {
            "stage": "Episode",
            "t": "18:40 → 20:45 · the window",
            "text": "The engine assembles the context: the CGM curve, insulin "
                    "still on board, and every behavior that fired. Glucose climbs "
                    "from **132 → 247** and never turns. No correction, no low.",
            "tier": "observed",
            "hedged": False,
            "cited_label": "from the feed:",
            "pills": [{"v": "+115 mg/dL", "kind": "cgm"}, {"v": "IOB 6.1 U", "kind": "basal"}],
        },
        {
            "stage": "Lever",
            "t": "the earliest actionable driver",
            "text": "The dose landed on time and glucose was flat at the meal, yet "
                    "it still ran away. The likeliest driver is that the dose "
                    "covered **fewer carbs than the meal held**.",
            "tier": "inferred",
            "hedged": True,
            "cited_label": "reasoned from shape:",
            "pills": [{"v": "on-time bolus"}, {"v": "flat start"}, {"v": "sustained rise"}],
            "note": "A late bolus and a missed meal both also leave a rise, but "
                    "the bolus was on time and sits right on the climb, so those "
                    "are ruled out. One driver survives.",
        },
    ],
    "verdict": {
        "stage": "Lever",
        "label": "Attributed lever",
        "title": "Carb undercount",
        "body": "Exactly one lever per episode. Anything else that co-occurred is "
                "folded in as a consequence, never reported as a second problem.",
    },
    "pattern": {
        "stage": "Pattern",
        "rate": "~28%",
        "body": "This same lever recurred in ~28% of your meals this window. That "
                "rate is the pattern, scored against how many meals you actually had.",
    },
}


def _exposure_entry(exp: Exposure) -> dict:
    label, denominator = _EXPOSURE_META[exp]
    return {"value": exp.value, "label": label, "denominator": denominator}


def _lever_entry(lever: Lever) -> dict:
    exp = levers.exposure(lever)
    return {
        "value": lever.value,
        "title": levers.title(lever),
        "exposure": exp.value,
        "meaning": levers.meaning(lever),
        "recommendation": levers.recommendation(lever),
        "measured": _EXPOSURE_META[exp][1],
    }


def build_catalog() -> dict:
    """Assemble the ``/api/catalog`` payload — the type-level Guide content.

    Generated from :data:`~.levers._META` (positive catalog) and the closed
    :class:`SilenceReason` / :class:`EvidenceTier` taxonomies (ADR 0009), plus the
    authored framing/pipeline/worked-example copy above. No store access, no PHI.
    """
    return {
        "engine": _ENGINE,
        "pipeline": _PIPELINE,
        "exposures": [_exposure_entry(e) for e in Exposure],
        "levers": [_lever_entry(l) for l in Lever],
        "silence_reasons": [
            {"value": r.value, "label": _SILENCE_META[r][0],
             "tier": _SILENCE_META[r][1].value, "body": _SILENCE_META[r][2]}
            for r in SilenceReason
        ],
        "tiers": [
            {"value": t.value, "label": _TIER_META[t][0], "body": _TIER_META[t][1]}
            for t in EvidenceTier
        ],
        "worked": _WORKED,
    }
