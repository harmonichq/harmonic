#!/usr/bin/env python3
"""Inventory each scenario Lever's source-level silence and append contract."""

from __future__ import annotations

import ast
import sys
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO_ROOT))

from ciq_autotune.analyzers.classifiers.evidence import SilenceReason
from ciq_autotune.analyzers.scenario.levers import Lever


@dataclass(frozen=True)
class ClassifierSource:
    files_and_functions: tuple[tuple[str, tuple[str, ...]], ...]
    append_scope: str


SOURCES = {
    Lever.CARB_UNDERCOUNT: ClassifierSource(
        (("ciq_autotune/analyzers/classifiers/carb_undercount.py",
          ("classify_carb_undercount",)),),
        "every meal anchor",
    ),
    Lever.LATE_BOLUS: ClassifierSource(
        (("ciq_autotune/analyzers/classifiers/late_bolus.py",
          ("classify_late_bolus",)),),
        "every meal anchor",
    ),
    Lever.MEAL_OVER_DELIVERY: ClassifierSource(
        (("ciq_autotune/analyzers/scenario/meal_suspend.py",
          ("classify_meal_owned_suspend", "_no_owned_suspend")),
         ("ciq_autotune/analyzers/classifiers/suspend.py", ("classify_suspend",))),
        "every meal anchor",
    ),
    Lever.OVER_TREATED_LOW: ClassifierSource(
        (("ciq_autotune/analyzers/scenario/attribute.py",
          ("over_treated_rebound_judgment",)),),
        "omitted for a refuted or split-off low anchor",
    ),
    Lever.CORRECTION_STACKING: ClassifierSource(
        (("ciq_autotune/analyzers/classifiers/correction_stacking.py",
          ("classify_correction_stacking",)),),
        "appended only for the matching or last correction anchor",
    ),
    Lever.CORRECTION_ON_IOB: ClassifierSource(
        (("ciq_autotune/analyzers/classifiers/correction_on_iob.py",
          ("classify_correction_on_iob",)),),
        "every low anchor",
    ),
    Lever.MISSED_MEAL: ClassifierSource(
        (("ciq_autotune/analyzers/classifiers/missed_meal.py",
          ("classify_missed_meal",)),),
        "omitted for a split rebound-high anchor",
    ),
    Lever.MEAL_BOLUS_SHORT: ClassifierSource(
        (("ciq_autotune/analyzers/classifiers/meal_bolus_short.py",
          ("classify_meal_bolus_short",)),),
        "omitted for a split rebound-high anchor",
    ),
}


def _function(tree: ast.Module, name: str) -> ast.FunctionDef:
    matches = [
        node for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == name
    ]
    if len(matches) != 1:
        raise AssertionError(f"expected one {name}, found {len(matches)}")
    return matches[0]


def _silence_reasons(source: ClassifierSource) -> tuple[str, ...]:
    names: set[str] = set()
    for relative_path, function_names in source.files_and_functions:
        tree = ast.parse((REPO_ROOT / relative_path).read_text())
        for function_name in function_names:
            for node in ast.walk(_function(tree, function_name)):
                if (
                    isinstance(node, ast.Attribute)
                    and isinstance(node.value, ast.Name)
                    and node.value.id == "SilenceReason"
                ):
                    names.add(node.attr)
    return tuple(reason.value for reason in SilenceReason if reason.name in names)


def _strings(node: ast.AST) -> set[str]:
    return {
        child.value for child in ast.walk(node)
        if isinstance(child, ast.Constant) and isinstance(child.value, str)
    }


def _append_contracts() -> dict[Lever, bool]:
    """Derive the all-relevant-anchor property from model-view control flow."""
    tree = ast.parse(
        (REPO_ROOT / "ciq_autotune/analyzers/scenario/model_view.py").read_text()
    )

    meal = _function(tree, "_meal_verdicts")
    meal_return = next(node for node in meal.body if isinstance(node, ast.Return))
    meal_labels = _strings(meal_return)
    meal_returned_names = {
        node.id for node in ast.walk(meal_return.value) if isinstance(node, ast.Name)
    }
    meal_bound_labels = {
        target.id: _strings(node.value)
        for node in meal.body
        if isinstance(node, ast.Assign)
        for target in node.targets
        if isinstance(target, ast.Name)
    }

    low = _function(tree, "_low_verdicts")
    low_top_level_labels = set().union(*(_strings(node) for node in low.body
                                         if not isinstance(node, ast.If)))
    low_conditional_labels = set().union(*(_strings(node) for node in low.body
                                           if isinstance(node, ast.If)))

    high = _function(tree, "_high_verdicts")
    high_has_early_return = any(
        isinstance(node, ast.If)
        and any(isinstance(child, ast.Return) for child in node.body)
        for node in high.body
    )
    high_terminal_return = next(
        node for node in reversed(high.body) if isinstance(node, ast.Return)
    )
    high_terminal_labels = _strings(high_terminal_return)

    correction = _function(tree, "_anchor_verdicts")
    correction_labels = _strings(correction)

    contracts = {
        Lever.CARB_UNDERCOUNT: "carb_undercount" in meal_labels,
        Lever.LATE_BOLUS: "late_bolus" in meal_labels,
        Lever.MEAL_OVER_DELIVERY: any(
            name in meal_returned_names
            and "meal_over_delivery" in meal_bound_labels.get(name, set())
            for name in meal_bound_labels
        ),
        Lever.OVER_TREATED_LOW: (
            "over_treated_low" in low_top_level_labels
            and "over_treated_low" not in low_conditional_labels
        ),
        Lever.CORRECTION_STACKING: (
            "correction_stacking" in correction_labels
            and not any(isinstance(node, ast.If) for node in correction.body)
        ),
        Lever.CORRECTION_ON_IOB: "correction_on_iob" in low_top_level_labels,
        Lever.MISSED_MEAL: (
            "missed_meal" in high_terminal_labels and not high_has_early_return
        ),
        Lever.MEAL_BOLUS_SHORT: (
            "meal_bolus_short" in high_terminal_labels and not high_has_early_return
        ),
    }
    if set(contracts) != set(Lever):
        raise AssertionError("append probe must disposition every Lever exactly once")
    return contracts


def main() -> None:
    if set(SOURCES) != set(Lever):
        raise AssertionError("probe must disposition every Lever exactly once")
    append_contracts = _append_contracts()
    print("lever | silence_reasons | appended_unconditionally | append_scope")
    for lever in Lever:
        source = SOURCES[lever]
        reasons = ",".join(_silence_reasons(source)) or "none"
        unconditional = "yes" if append_contracts[lever] else "no"
        print(f"{lever.value} | {reasons} | {unconditional} | {source.append_scope}")


if __name__ == "__main__":
    main()
