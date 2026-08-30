#!/usr/bin/env python3
"""Generate the evidence-canvas exploration from committed workstation fixtures.

The approved reference mock for the evidence canvas renders one person's own pump
history, so it stays local-only. This generator rebuilds the same composition from
the committed Diagnose workstation synthetic fixture set, which is what makes the
design reviewable, diffable and regenerable in the open.

``index.html`` is generated; never hand-edit it. ``--check`` regenerates in memory
and byte-compares, so a fixture that moves without a regenerated exploration fails
CI instead of drifting silently.

    uv run python mockups/diagnose-evidence-canvas.exploration/generate.py
    uv run python mockups/diagnose-evidence-canvas.exploration/generate.py --check
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).resolve().parent
FIXTURES = "mockups/diagnose-workstation.synthetic/"
REQUIRED_DARK_ROLES = (
    "--wk-canvas", "--wk-field", "--wk-surface", "--wk-surface-rail",
    "--wk-surface-sunken", "--wk-ink", "--wk-ink-body", "--wk-ink-meta",
    "--wk-ink-nav", "--wk-rule", "--wk-rule-strong", "--wk-signal",
)

# The two block-evidence cases carrying nine runs each. Chosen for render density
# alone — the lock evidence needs tiles with enough marks to judge — and saying
# nothing about which case a real evening or morning block resembles.
EVENING_CASE = "cross_midnight"
MORNING_CASE = "directional_only"


def read(name: str) -> dict:
    return json.loads((ROOT / name).read_text())


def css_mask(source: str) -> str:
    """Mask comments and strings while preserving source offsets and newlines."""
    masked = []
    quote = None
    comment = False
    index = 0
    while index < len(source):
        char = source[index]
        next_char = source[index + 1] if index + 1 < len(source) else ""
        if comment:
            if char == "*" and next_char == "/":
                comment = False
                masked.extend("  ")
                index += 2
                continue
            masked.append("\n" if char == "\n" else " ")
            index += 1
            continue
        if quote:
            if char == "\\":
                masked.append(" ")
                if index + 1 < len(source):
                    masked.append("\n" if next_char == "\n" else " ")
                index += 2
                continue
            if char == quote:
                quote = None
            masked.append("\n" if char == "\n" else " ")
            index += 1
            continue
        if char == "/" and next_char == "*":
            comment = True
            masked.extend("  ")
            index += 2
            continue
        if char in "\"'":
            quote = char
            masked.append(" ")
            index += 1
            continue
        masked.append(char)
        index += 1
    return "".join(masked)


def css_rule(source: str, masked: str, start: int) -> str:
    """Return one balanced CSS rule using the shared lexical mask."""
    open_brace = masked.index("{", start)
    depth = 0
    for end in range(open_brace, len(masked)):
        if masked[end] == "{":
            depth += 1
        elif masked[end] == "}":
            depth -= 1
            if depth == 0:
                return source[start:end + 1]
    raise ValueError("corrupt Dark theme source: unclosed standalone html.dark token block")


def standalone_dark_rule(source: str) -> str:
    """Return the one standalone Dark token rule, rejecting lookalikes."""
    masked = css_mask(source)
    matches = list(re.finditer(r"(?m)^[ \t]*html\.dark[ \t]*\{", masked))
    if len(matches) != 1:
        raise ValueError("corrupt Dark theme source: expected exactly one standalone html.dark token block")
    rule = css_rule(source, masked, matches[0].start())
    declared = set(re.findall(r"(--[\w-]+)\s*:", masked[matches[0].start():matches[0].start() + len(rule)]))
    missing = [role for role in REQUIRED_DARK_ROLES if role not in declared]
    if missing:
        raise ValueError("corrupt Dark theme source: missing required Dark roles " + ", ".join(missing))
    return rule


def self_check() -> int:
    """Exercise selector and role-validation corruption boundaries."""
    roles = "".join(f"{role}: value;" for role in REQUIRED_DARK_ROLES)
    def rejects(label: str, source: str, expected: str) -> None:
        try:
            standalone_dark_rule(source)
        except ValueError as error:
            if expected not in str(error):
                raise
        else:
            raise AssertionError(f"{label} was accepted")
        print(f"{label}: rejected")

    rejects("comment-only fake block", f"/* html.dark {{{roles}}} */",
            "expected exactly one standalone")
    selected = standalone_dark_rule(f"/* html.dark {{{roles}}} */\nhtml.dark {{{roles}}}")
    if selected.startswith("/*"):
        raise AssertionError("commented fake block was selected")
    print("comment-before-real block: real block selected without ambiguity")
    selected = standalone_dark_rule(
        f"html.dark {{/* html.dark {{ --wk-signal: fake; }} */"
        f"--note: 'html.dark {{ --wk-signal: fake; }}';{roles}}}")
    if not selected.endswith("}"):
        raise AssertionError("comment or string content truncated the standalone token block")
    print("comment/string selector, braces, and role names: ignored")
    selected = standalone_dark_rule(
        f"html.dark .component {{ --wk-canvas: wrong; }}\nhtml.dark {{{roles}}}")
    if "wrong" in selected or "html.dark .component" in selected:
        raise AssertionError("prefixed Dark selector was accepted as the token block")
    print("prefixed selector: ignored")
    rejects("two real standalone blocks", f"html.dark {{{roles}}}\nhtml.dark {{{roles}}}",
            "expected exactly one standalone")
    rejects("missing required role", f"html.dark {{{roles.replace('--wk-signal: value;', '')}}}",
            "missing required Dark roles --wk-signal")
    for label, decoration in (
        ("comment braces", "/* } { */"),
        ("single-quoted braces", "--note: '} {';"),
        ("double-quoted braces", '--note: "} {";'),
        ("escaped quoted braces", r'--note: "\\\"} {";'),
    ):
        standalone_dark_rule(f"html.dark {{{decoration}{roles}}}")
        print(f"{label}: accepted")
    rejects("unclosed real rule", f"html.dark {{{roles}", "unclosed standalone html.dark token block")
    return 0


def shipped_dark_theme() -> str:
    """Extract the shipped Dark token source used by this synthetic canvas."""
    index = (ROOT / "frontend/index.html").read_text()
    theme = (ROOT / "frontend/theme.css").read_text()
    # Keep both shipped sources in the generated HTML. The template names only
    # composition aliases below; it never copies a Dark value by hand.
    return ("/* generated from frontend/index.html html.dark and frontend/theme.css */\n"
            + standalone_dark_rule(index)
            + "\n\n/* frontend/theme.css — source-bound production role rules */\n"
            + theme)


def synthetic_jitter_milli(seed: int, count: int, scale: int) -> list:
    """Return uncorrelated-looking render noise as integer millipoints.

    This is a single xorshift stream, never a fresh generator for each mark.
    Summing six bytes produces a clustered synthetic distribution without a
    platform math-library transform or the visible ramps consecutive LCG seeds
    made in the prior implementation. ``scale`` is millipoints per byte from
    the centered sum; values remain integral until serialization.
    """
    if not 0 < seed <= 0xFFFFFFFF:
        raise ValueError("seed must be a non-zero 32-bit integer")
    state = seed
    offsets = []
    for _ in range(count):
        total = 0
        for _ in range(6):
            state ^= (state << 13) & 0xFFFFFFFF
            state ^= state >> 17
            state ^= (state << 5) & 0xFFFFFFFF
            state &= 0xFFFFFFFF
            total += state & 0xFF
        offsets.append((total - 765) * scale)
    return offsets


def rounded_fraction(numerator: int, denominator: int) -> int:
    """Round a rational value half away from zero using only integers."""
    assert denominator > 0
    if numerator < 0:
        return -rounded_fraction(-numerator, denominator)
    return (2 * numerator + denominator) // (2 * denominator)


def isf_scatter(steps: list) -> list:
    """Rest-window steps as (insulin acted, delta BG) pairs, with a drawable y.

    The x values are the capture's own. The y values are invented from a fixed
    integer sequence: the committed capture holds every synthetic reading at one
    glucose value, so its ``dbg`` is uniformly 0.0 and a scatter drawn from it
    collapses to a flat line under a slope-0 fit. These are marks for a design
    render, not a measurement — the README and the page's own sheet note both
    say so.
    """
    jitter = synthetic_jitter_milli(135, len(steps), 39)
    x_units = [int(round(step["insulin_acted"] * 10_000)) for step in steps]
    return [(x, 32_000 - 72 * x + noise) for x, noise in zip(x_units, jitter)]


def fit_milli(points: list) -> tuple:
    """Fit fixed-point (x: 1e-4, y: 1e-3) points at a 1e-3 boundary."""
    count = len(points)
    sum_x = sum(x for x, _ in points)
    sum_y = sum(y for _, y in points)
    numerator = count * sum(x * y for x, y in points) - sum_x * sum_y
    denominator = count * sum(x * x for x, _ in points) - sum_x * sum_x
    slope_milli = rounded_fraction(10_000 * numerator, denominator)
    intercept_milli = rounded_fraction(
        sum_y * denominator - numerator * sum_x,
        count * denominator,
    )
    return slope_milli, intercept_milli


def payload() -> dict:
    app = read(FIXTURES + "payload.json")
    isf_capture = read(FIXTURES + "isf-rest-window-evidence.capture.json")
    ic_capture = read(FIXTURES + "ic-block-evidence.capture.json")

    pooled = app["evidence"]["pooled"]
    bins = [[b[k] for k in ("minute", "median", "p25", "p75", "p10", "p90", "n", "raw_n")]
            for b in pooled["bins"]]
    # Index 1 is a meal COUNT: the strip sizes each mark by it and sums it into the
    # etched "Meals" readout. Carbs there would print a carb total as a meal tally.
    meals = [[m["minute"], m["count"]] for m in pooled["meals"]]

    basal = [[s["label"], s["current"], s["estimate"]["value"],
              s["estimate"]["lo"], s["estimate"]["hi"], s["days"]]
             for s in app["analyze"]["basal"]]

    isf = app["analyze"]["isf"][0]
    points_milli = isf_scatter(isf_capture["payload"]["steps"])
    slope_milli, intercept_milli = fit_milli(points_milli)
    # Same reason as the scatter: the capture's per-night fits cycle through three
    # values, which draws as a repeating sawtooth rather than a distribution.
    night_jitter = synthetic_jitter_milli(420, len(isf["evidence"]["night_fits"]), 66)
    nights = [[str(i + 1), (42_000 + noise) / 1_000]
              for i, noise in enumerate(night_jitter)]

    blocks = {b["block_id"]: b for b in app["analyze"]["ic_blocks"]}

    def block(block_id: int, case: str) -> dict:
        evidence = ic_capture["cases"][case]
        return {
            "current": blocks[block_id]["current_values"][0],
            "scatter": [[int(r["t"][11:13]) * 60 + int(r["t"][14:16]),
                         r.get("true_ic", 0), not r["directional_only"], r["in_pool"]]
                        for r in evidence["runs"]],
            "series": [{"pts": [[p["minute"], p["bg"]] for p in s["points"]]}
                       for s in evidence["series"]],
        }

    days = app["evidence"]["window"]["data_days"]
    return {
        "strip": {"bins": bins, "meals": meals, "days": days},
        "basal": basal,
        "isf": {"pts": [[x / 10_000, y / 1_000] for x, y in points_milli],
                "nights": nights, "programmed": isf["current"],
                "slope": slope_milli / 1_000, "intercept": intercept_milli / 1_000},
        "ic660": block(660, EVENING_CASE),
        "ic420": block(420, MORNING_CASE),
        "window": {"days": days},
    }


def render() -> str:
    template = (HERE / "canvas.tpl.html").read_text()
    blob = json.dumps(payload(), sort_keys=True, separators=(",", ":"))
    return (template
            .replace("/*__SHIPPED_DARK_THEME__*/", shipped_dark_theme())
            .replace("/*__DATA__*/", "const D = " + blob + ";"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true",
                        help="fail if the committed exploration is stale")
    parser.add_argument("--self-check", action="store_true",
                        help="exercise Dark source selector and role corruption checks")
    parser.add_argument("--out", type=pathlib.Path, default=HERE / "index.html")
    args = parser.parse_args()

    if args.self_check:
        return self_check()

    text = render()
    current = args.out.read_text() if args.out.exists() else ""
    if args.check:
        if current != text:
            print(f"stale generated exploration or shipped Dark theme contract: {args.out} —"
                  f" rerun {HERE / 'generate.py'}")
            return 1
        print(f"evidence-canvas exploration current ({args.out})")
        return 0

    args.out.write_text(text)
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
