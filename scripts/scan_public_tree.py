#!/usr/bin/env python3
"""Structural contamination scan for the Harmonic public tree (#728, cutover
plan Phase 3.1).

Runs over a **materialised output tree** (what ``build_public_tree.py``
writes), never the source repository: the tree is what gets published, so the
tree is what gets scanned. Five rules, in the order the plan fixes:

  1. **Structural (JSON/YAML/CSV).** A numeric field named — at any nesting
     depth — ``bg``, ``glucose``, ``insulin``, ``carbs``, ``rate``,
     ``basal_rate``, ``worst_bg``, ``isf`` or ``carb_ratio``, co-occurring in
     the same file with a real-calendar timestamp falling in span. This is the
     rule that caught all three contaminated ``frontend/__fixtures__/``
     fixtures; a prose-only scan passed them straight through.
  2. **The provenance stamp**, a **closed literal set** of four top-level
     forms, exempts a file from rules 1 and 3. Anything outside the set does
     not exempt — the plan named a ``_generated_by``/``SYNTHETIC`` convention
     that none of the four committed synthetic sets actually uses. The fourth
     form, ``authorized`` + ``synthetic``, additionally requires the file's
     path to be **enumerated in the config**: its ``authorized`` value is free
     text nobody validates, so on presence alone any future JSON could exempt
     itself from rule 1 — the rule that caught all three contaminated
     fixtures — by typing two keys. The other three forms state how a file was
     MADE and are self-describing; this one asserts a human said so, and an
     assertion needs a counter-signature.
  3. **The date-count rule**, subordinate to the stamp: an unstamped file
     carrying >= 8 distinct in-span dates, whatever its extension.
  4. **A timestamp series is a data carrier in any extension**: >= 20 monotonic
     ``HH:MM`` timestamps paired with numerics must carry a stamp. Without this
     nothing sees ``tests/test_scenario_engine.py``'s ~500 real CGM readings —
     a Python string literal with no ISO date and no field name, which rules 1,
     3 and 5 all pass. A source file has no top-level JSON document to carry
     rule 2's stamp, so it exempts one constant at a time via an in-file
     ``# SYNTHETIC-FIXTURE: <reason>`` marker on the line directly above the
     assignment instead (see ``synthetic_fixture_spans``) — rule 4 only, never
     a whole file, never rules 1, 3 or 5, and never without a reason.
  5. **Prose**, run last: dose and ratio claims, dated health events,
     credentials, absolute paths carrying a username, and the owner's first
     name plus the sanction idioms.

**Fails closed.** A file that cannot be decoded or parsed is a FAILURE finding,
never a skip.

**A pin never suppresses a prose finding** (plan §0.5.5.3). Pinning is reserved
for the structural rules, where invented round test dates are the expected
noise; a prose hit in a shipping file is scrubbed. When a pinned file trips
rule 5 the scan reports the finding anyway, marked ``PIN REFUSED``.

    uv run python scripts/scan_public_tree.py <tree-dir> [--config <path>]
"""
from __future__ import annotations

import argparse
import collections
import csv
import hashlib
import io
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

CONFIG_PATH = Path(__file__).resolve().parent / "public_scan_config.txt"

# Rule 1's field names, matched case-insensitively at any nesting depth.
SENSITIVE_FIELDS = frozenset({
    "bg", "glucose", "insulin", "carbs", "rate", "basal_rate", "worst_bg",
    "isf", "carb_ratio",
})

DATE_COUNT_THRESHOLD = 8  # Rule 3, plan §3.1 [R3].
SERIES_LENGTH_THRESHOLD = 20  # Rule 4, plan §3.1 [R7].

STRUCTURAL_EXTENSIONS = frozenset({".json", ".yaml", ".yml", ".csv"})

# Rule 5's sub-checks, each separately dispositionable so a finding names the
# thing it found rather than "prose".
PROSE_CHECKS = ("dose-ratio", "dated-health-event", "credential", "user-path", "owner-name")

# The one rule carrying an acknowledged baseline rather than hard-failing on
# any hit. A dosing application's prose legitimately says "U" and "g/U" — unit
# names, display thresholds, pump-programmable rounding precisions — so this
# rule cannot reach zero, and a gate that is red forever is a gate everyone
# learns to ignore. That is the failure the plan exists to prevent, arriving by
# another door. So the acknowledged set is recorded by CONTENT and the scan
# fails on any change to it: an addition, a removal, or a one-for-one swap that
# a bare count would wave through. Every other rule still hard-fails on a
# single finding.
DOSE_RATIO_RULE = "rule5-dose-ratio"
_BASELINE_BEGIN = "# BEGIN dose-ratio baseline"
_BASELINE_END = "# END dose-ratio baseline"

# An ISO date, or the leading date of a "YYYY-MM-DD HH:MM:SS" stamp.
_DATE_RE = re.compile(r"(?<![\d-])(\d{4}-\d{2}-\d{2})(?![\d-])")

# Rule 4: an HH:MM clock time joined to a number. Covers the ":"-packed string
# literal form ("17:04:122,17:09:125"), the CSV/array form ("17:04,122"), and
# the seconds field of an ISO datetime — all three are the same carrier.
_SERIES_RE = re.compile(
    r"(?<![\d:])([01]\d|2[0-3]):([0-5]\d)\s*[:,;=\t|]\s*\"?(-?\d+(?:\.\d+)?)(?![\d.])"
)

# Rule 5 patterns.
_DOSE_RE = re.compile(r"(?<![\w.])\d{1,3}(?:\.\d+)? ?U\b(?!\.)")
_RATIO_RE = re.compile(
    r"(?<![\w.])1 ?U ?: ?\d+(?:\.\d+)?(?: ?(?:mg/dL|g))?|(?<![\w.])\d{1,3}(?:\.\d+)? ?g/U\b"
)
_MONTH_DAY_RE = re.compile(
    r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* ?\d{1,2}\b"
)
_CLINICAL_RE = re.compile(
    r"(?i)\b(?:bg|glucose|bolus|basal|carbs?|nadir|hypo|insulin|isf|i:c|dose[ds]?|"
    r"units?|mg/dL|suspend|low|rebound|overshot|bottomed)\b"
)
# A credential leak is a literal value, not a name: reading a secret out of
# storage is the credentials module doing its job, whereas a secret written as
# a quoted literal in the source is the leak. Requiring a quoted literal on the
# right of the assignment is what separates the two.
_CREDENTIAL_RE = re.compile(
    r"(?i)\b(?:password|passwd|secret|api[_-]?key|auth[_-]?token|access[_-]?token|"
    r"bearer)\b\s*[:=]\s*([\"'])(?![\"'])[^\"']{8,}\1"
    r"|-----BEGIN [A-Z ]*PRIVATE KEY-----"
)
_USER_PATH_RE = re.compile(r"/(?:Users|home)/(?!runner\b)[A-Za-z][\w.-]*")
# The sanction idioms: prose crediting a decision to a private authority a
# reader cannot consult. The pattern used to name one verb in one voice, and a
# possessive form carrying an attribution noun slipped past it by a single
# word — so the possessive and the other attribution nouns are matched too.
# The bare phrase is NOT a hit: the app's own copy uses it for whoever is
# reading the surface, which is an ordinary second person, not a citation.
# Written without quoting either idiom, so this file does not trip its own rule.
_OWNER_NAME_RE = re.compile(
    r"\bConnor\b|\bsanctioned by\b"
    r"|\bthe operator(?:['\u2019]s)?\s+"
    r"(?:ruled?|ruling|rulings|said|says|decided|decision|sanction|"
    r"finding|findings|call|review|round)\b"
)


class ConfigError(ValueError):
    """A config grammar violation. Fails the scan closed, like the allowlist's."""


@dataclass(frozen=True)
class ScanConfig:
    """The scan's two tunables, both read from the config file rather than
    invented at run time: the in-span floor and the pins.

    ``span_start`` is a literal date, and "in span" is ``date >= span_start``,
    **open-ended**, evaluated at scan time — the data accrues daily, so any
    fixed upper bound goes stale between the scan's authoring and its run
    (plan §3.1 [R8], measured 2026-08-17).
    """

    span_start: str
    pins: dict[str, str]  # path -> reason, both mandatory
    prose_exempt: dict[tuple[str, str], str]  # (path, check) -> reason
    # Paths cleared to carry the `authorized` + `synthetic` stamp. Enumerated
    # rather than open, so a new file cannot self-grant the waiver.
    authorized_synthetic: dict[str, str] = field(default_factory=dict)
    # The acknowledged dose-ratio set: (count, digest) and the normalised
    # entries it hashes. None means no baseline is recorded, in which case a
    # single dose-ratio finding fails the scan like any other rule.
    dose_baseline: tuple[int, str] | None = None
    dose_ack: tuple[str, ...] = ()

    def in_span(self, date: str) -> bool:
        return date >= self.span_start


@dataclass(frozen=True)
class Finding:
    path: str
    line: int
    rule: str
    detail: str
    pin_refused: bool = False
    # The pin's reason, when a pin suppressed this finding. Suppressed
    # findings are still produced, so the scan can report exactly what each
    # pin is hiding rather than leaving a reviewer to infer it.
    suppressed_by: str | None = None

    def render(self) -> str:
        head = f"{self.path}:{self.line}\t{self.rule}\t{self.detail}"
        if self.pin_refused:
            return head + (
                "\n\t\tPIN REFUSED (plan §0.5.5.3): this path is pinned, but a pin"
                " covers the structural rules only. A prose hit in a shipping file"
                " is scrubbed, never pinned."
            )
        return head


@dataclass
class ScanResult:
    findings: list[Finding] = field(default_factory=list)
    suppressed: list[Finding] = field(default_factory=list)
    scanned: int = 0
    stamped: list[str] = field(default_factory=list)
    unused_pins: list[str] = field(default_factory=list)
    missing_pins: list[str] = field(default_factory=list)
    # authorized-synthetic entries naming a path the tree does not carry.
    missing_authorized: list[str] = field(default_factory=list)


def parse_config(text: str) -> ScanConfig:
    """Parse the scan config. One directive per non-blank, non-``#`` line:

      * ``span-start <YYYY-MM-DD>`` — exactly once.
      * ``<exact path> | <reason>`` — a pin. The reason is mandatory; a bare
        path is a parse error, because an unexplained pin is how a real leak
        ships.
      * ``prose-exempt <exact path> <check> | <reason>`` — the plan's one
        ruled prose exemption, scoped to a single check so it can never
        silently cover the other four.
      * ``authorized-synthetic <exact path> | <reason>`` — clears ONE file to
        carry the ``authorized`` + ``synthetic`` stamp. Without a line here the
        two keys exempt nothing, whatever they say.
      * ``dose-ratio-baseline <count> <sha256>`` — the acknowledged
        dose-ratio set's size and digest.
      * ``dose-ratio-ack <path>:<line> | <matched text>`` — one acknowledged
        entry. Generated by ``--accept-dose-ratio-baseline``; the digest above
        is what makes hand-editing this block detectable.
    """
    span_start: str | None = None
    pins: dict[str, str] = {}
    prose_exempt: dict[tuple[str, str], str] = {}
    authorized_synthetic: dict[str, str] = {}
    dose_baseline: tuple[int, str] | None = None
    dose_ack: list[str] = []

    for lineno, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue

        if line.startswith("span-start"):
            value = line[len("span-start"):].strip()
            if not _DATE_RE.fullmatch(value):
                raise ConfigError(
                    f"line {lineno}: span-start needs a YYYY-MM-DD date, got {value!r}"
                )
            if span_start is not None:
                raise ConfigError(f"line {lineno}: span-start given twice")
            span_start = value
            continue

        if line.startswith("dose-ratio-baseline"):
            parts = line[len("dose-ratio-baseline"):].split()
            if len(parts) != 2 or not parts[0].isdigit():
                raise ConfigError(
                    f"line {lineno}: dose-ratio-baseline needs '<count> <sha256>',"
                    f" got {line!r}"
                )
            if dose_baseline is not None:
                raise ConfigError(f"line {lineno}: dose-ratio-baseline given twice")
            dose_baseline = (int(parts[0]), parts[1])
            continue

        if "|" not in line:
            raise ConfigError(
                f"line {lineno}: a pin needs '<exact path> | <reason>'; the reason"
                f" is mandatory: {line!r}"
            )
        subject, reason = (part.strip() for part in line.split("|", 1))
        if not reason:
            raise ConfigError(f"line {lineno}: pin for {subject!r} has an empty reason")

        if subject.startswith("dose-ratio-ack"):
            located = subject[len("dose-ratio-ack"):].strip()
            path, _, lineno_text = located.rpartition(":")
            if not path or not lineno_text.isdigit():
                raise ConfigError(
                    f"line {lineno}: dose-ratio-ack needs '<path>:<line> | <text>',"
                    f" got {subject!r}"
                )
            dose_ack.append(normalised_entry(path, int(lineno_text), reason))
            continue

        if subject.startswith("authorized-synthetic"):
            path = subject[len("authorized-synthetic"):].strip()
            if not path or "*" in path:
                raise ConfigError(
                    f"line {lineno}: authorized-synthetic needs '<exact path>',"
                    f" got {subject!r}"
                )
            if path in authorized_synthetic:
                raise ConfigError(
                    f"line {lineno}: duplicate authorized-synthetic for {path!r}"
                )
            authorized_synthetic[path] = reason
            continue

        if subject.startswith("prose-exempt"):
            parts = subject[len("prose-exempt"):].split()
            if len(parts) != 2:
                raise ConfigError(
                    f"line {lineno}: prose-exempt needs '<exact path> <check>',"
                    f" got {subject!r}"
                )
            path, check = parts
            if check not in PROSE_CHECKS:
                raise ConfigError(
                    f"line {lineno}: unknown prose check {check!r};"
                    f" expected one of {', '.join(PROSE_CHECKS)}"
                )
            prose_exempt[(path, check)] = reason
            continue

        if "*" in subject:
            raise ConfigError(
                f"line {lineno}: a pin is an exact path, not a glob: {subject!r}"
            )
        if subject in pins:
            raise ConfigError(f"line {lineno}: duplicate pin for {subject!r}")
        pins[subject] = reason

    if span_start is None:
        raise ConfigError("config names no span-start; the in-span range is mandatory")

    # The digest guards the acknowledged block against a hand edit: change an
    # entry without regenerating and the config stops parsing, rather than
    # quietly acknowledging something nobody read.
    if dose_baseline is not None:
        count, digest = dose_baseline
        if count != len(dose_ack):
            raise ConfigError(
                f"dose-ratio-baseline claims {count} entr(ies) but"
                f" {len(dose_ack)} dose-ratio-ack line(s) follow it"
            )
        actual = digest_of(dose_ack)
        if actual != digest:
            raise ConfigError(
                "the dose-ratio-ack block does not match its recorded digest"
                f" (recorded {digest}, computed {actual}). Regenerate it with"
                " --accept-dose-ratio-baseline rather than editing it by hand."
            )
    elif dose_ack:
        raise ConfigError("dose-ratio-ack entries recorded with no dose-ratio-baseline")

    return ScanConfig(
        span_start=span_start, pins=pins, prose_exempt=prose_exempt,
        authorized_synthetic=authorized_synthetic,
        dose_baseline=dose_baseline, dose_ack=tuple(dose_ack),
    )


def load_config(path: Path = CONFIG_PATH) -> ScanConfig:
    return parse_config(path.read_text(encoding="utf-8"))


def _line_of(text: str, index: int) -> int:
    return text.count("\n", 0, index) + 1


def in_span_dates(text: str, config: ScanConfig) -> dict[str, int]:
    """Distinct in-span dates in ``text``, mapped to the line of first sight.

    Out-of-span dates pass silently, which is the intended behaviour for
    invented fixtures — ``explore-day.capture.json``'s 2020 dates, for
    instance (plan §3.1 [R8]).
    """
    seen: dict[str, int] = {}
    for match in _DATE_RE.finditer(text):
        date = match.group(1)
        if config.in_span(date) and date not in seen:
            seen[date] = _line_of(text, match.start())
    return seen


# --- Rule 2: the closed literal stamp set ---------------------------------


def stamp_of(document: object, rel: str = "", authorized: dict[str, str] | None = None) -> str | None:
    """Return the accepted provenance stamp on a parsed document, or None.

    The set is closed and literal (plan §3.1 [R3]) — these four forms are the
    ones the committed synthetic sets actually carry, verified against the
    files. A stamp outside the set does not exempt.

    The fourth form is additionally PATH-GATED. ``authorized`` + ``synthetic``
    asserts that a human cleared the file, and its ``authorized`` value is free
    text nobody validates; granting the waiver on the presence of two keys let
    any JSON in the tree exempt itself, forever and for every future edit, from
    the rule that caught all three contaminated fixtures. So it exempts only
    the paths ``authorized`` enumerates — the scan's config — and an
    unenumerated file carrying both keys is scanned like any other.
    """
    if not isinstance(document, dict):
        return None
    if "_generated_by" in document and "_note" in document:
        return "_generated_by + _note"
    source = document.get("_source")
    if isinstance(source, str) and source.startswith("MANUFACTURED FIXTURE"):
        return "_source: MANUFACTURED FIXTURE"
    if document.get("fixture") == "labeled-synthetic":
        return 'fixture: "labeled-synthetic"'
    if "authorized" in document and "synthetic" in document and rel in (authorized or {}):
        return "authorized + synthetic"
    return None


# --- Rule 1: numeric fields in structured documents -----------------------


def sensitive_fields_in_json(document: object) -> dict[str, object]:
    """Sensitive field names bound to a numeric value at any nesting depth,
    mapped to one example value (surfaced so a finding names what it saw).
    """
    found: dict[str, object] = {}

    def walk(node: object) -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                if (
                    isinstance(key, str)
                    and key.lower() in SENSITIVE_FIELDS
                    and isinstance(value, (int, float))
                    and not isinstance(value, bool)
                    and key.lower() not in found
                ):
                    found[key.lower()] = value
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(document)
    return found


# A YAML "key: value" line, at any indentation, optionally a list item. The
# stdlib ships no YAML parser and this scan is stdlib-only (repo convention),
# so YAML is read line-wise rather than loaded: rule 1 needs field names bound
# to numbers and rule 3 needs dates, and both are visible in the line form.
_YAML_FIELD_RE = re.compile(r"^\s*(?:-\s*)?([A-Za-z_][\w.-]*)\s*:\s*(-?\d+(?:\.\d+)?)\s*$")


def sensitive_fields_in_yaml(text: str) -> dict[str, object]:
    found: dict[str, object] = {}
    for line in text.splitlines():
        match = _YAML_FIELD_RE.match(line)
        if match and match.group(1).lower() in SENSITIVE_FIELDS:
            found.setdefault(match.group(1).lower(), match.group(2))
    return found


def sensitive_fields_in_csv(text: str) -> dict[str, object]:
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        return {}
    header = [(cell or "").strip().lower() for cell in rows[0]]
    found: dict[str, object] = {}
    for row in rows[1:]:
        for column, cell in zip(header, row):
            if column in SENSITIVE_FIELDS and column not in found:
                try:
                    float(cell)
                except ValueError:
                    continue
                found[column] = cell
    return found


# --- Rule 4: the timestamp series -----------------------------------------


def monotonic_runs(text: str) -> list[tuple[int, int]]:
    """Return ``(length, line)`` for every strictly-monotonic run of ``HH:MM``
    timestamps paired with numerics, in file order.

    Runs, not a whole-file count: two real evening arcs concatenated in one
    file each restart the clock, and each run is separately a carrier — so a
    file holding five 100-reading arcs reports five, and the scrub starts at
    the first.
    """
    runs: list[tuple[int, int]] = []
    run_length = 0
    run_line = 0
    previous = -1

    for match in _SERIES_RE.finditer(text):
        minutes = int(match.group(1)) * 60 + int(match.group(2))
        if minutes > previous:
            if run_length == 0:
                run_line = _line_of(text, match.start())
            run_length += 1
        else:
            runs.append((run_length, run_line))
            run_length = 1
            run_line = _line_of(text, match.start())
        previous = minutes

    if run_length:
        runs.append((run_length, run_line))
    return runs


# --- Rule 4's source-file exemption: an in-file SYNTHETIC-FIXTURE marker ---

# Rule 2's stamp is a top-level JSON key, so it can never reach a Python (or
# other source) file — a source file has no top-level document to carry it,
# and rule 4 was firing forever on any invented timestamp series embedded in
# source (e.g. tests/test_scenario_engine.py's synthetic evening arcs), which
# is exactly the fix the cutover asked for. This is the source-file
# equivalent: a comment reading ``# SYNTHETIC-FIXTURE: <reason>`` on the line
# immediately above a top-level assignment exempts *that one assignment* from
# rule 4 — never a whole file, and never rules 1, 3 or 5, which never consult
# it. The reason is mandatory, same principle as a config pin (an unexplained
# exemption is how a real leak ships): a bare marker with no text after the
# colon exempts nothing.
_SYNTHETIC_FIXTURE_RE = re.compile(r"^\s*#\s*SYNTHETIC-FIXTURE:\s*(.*)$")
_ASSIGNMENT_RE = re.compile(r"^\s*[A-Za-z_]\w*\s*[:=]")


def synthetic_fixture_spans(text: str) -> list[tuple[int, int]]:
    """1-based, inclusive line ranges exempted from rule 4 by an in-file
    ``SYNTHETIC-FIXTURE:`` marker.

    A span covers only the assignment the marker sits directly above, found by
    tracking bracket balance from that line until it returns to zero (a
    single-line assignment is a one-line span). Two markers, two independent
    spans — marking one constant never exempts its neighbour.
    """
    lines = text.splitlines()
    spans: list[tuple[int, int]] = []
    for i, line in enumerate(lines):
        match = _SYNTHETIC_FIXTURE_RE.match(line)
        if not match or not match.group(1).strip():
            continue  # no marker here, or a marker with no reason: exempts nothing
        if i + 1 >= len(lines) or not _ASSIGNMENT_RE.match(lines[i + 1]):
            continue  # the marker must sit directly above an assignment
        start = i + 1
        depth = 0
        end = start
        for j in range(start, len(lines)):
            depth += sum(lines[j].count(c) for c in "([{")
            depth -= sum(lines[j].count(c) for c in ")]}")
            end = j
            if depth <= 0:
                break
        spans.append((start + 1, end + 1))  # 0-based index -> 1-based line number
    return spans


def _within(line: int, spans: list[tuple[int, int]]) -> bool:
    return any(start <= line <= end for start, end in spans)


# --- Rule 5: prose --------------------------------------------------------


# Source extensions where a dose in an expression is copy-illustration — an
# arbitrary amount in a constructor or an assertion — rather than a clinical
# claim about the data subject. In these, the dose/ratio check reads comment and
# block-comment text only; everywhere else — markdown, JSON copy strings, CSV —
# it reads every line. The other four checks always read every line: a
# credential, a home path or the owner's name is a leak wherever it sits.
_CODE_EXTENSIONS = frozenset({".py", ".js", ".mjs", ".ts", ".css", ".sh", ".html"})

_LINE_COMMENT_RE = re.compile(r"(?://|#)(.*)$")
_BLOCK_DELIMITERS = ('"""', "'''", "/*", "*/", "<!--", "-->")


def prose_text_of(rel: str, line: str, in_block: bool) -> str:
    """The part of one source line that reads as prose, for the dose/ratio
    check. Outside the code extensions the whole line is prose.
    """
    if Path(rel).suffix.lower() not in _CODE_EXTENSIONS:
        return line
    if in_block:
        return line
    match = _LINE_COMMENT_RE.search(line)
    return match.group(1) if match else ""


def _block_state(line: str, in_block: bool) -> bool:
    """Track triple-quote and block-comment regions well enough to treat a
    docstring as prose. Over-inclusive by design — a line wrongly read as
    prose costs a disposition, a line wrongly read as code hides a claim.
    """
    for delimiter in _BLOCK_DELIMITERS:
        count = line.count(delimiter)
        if not count:
            continue
        if delimiter in ('"""', "'''"):
            if count % 2:
                in_block = not in_block
        elif delimiter in ("/*", "<!--"):
            in_block = True
        else:
            in_block = False
    return in_block


def prose_findings(rel: str, text: str) -> list[tuple[str, int, str]]:
    """Return ``(check, line, evidence)`` for every prose hit.

    Runs last, per the plan's ordering, and reports per line so each hit is
    individually actionable by whoever owns the scrub.
    """
    hits: list[tuple[str, int, str]] = []
    in_block = False
    for lineno, line in enumerate(text.splitlines(), start=1):
        prose = prose_text_of(rel, line, in_block)
        in_block = _block_state(line, in_block)

        for check, match in (
            ("dose-ratio", _RATIO_RE.search(prose) or _DOSE_RE.search(prose)),
            ("credential", _CREDENTIAL_RE.search(line)),
            ("user-path", _USER_PATH_RE.search(line)),
            ("owner-name", _OWNER_NAME_RE.search(line)),
        ):
            if match:
                hits.append((check, lineno, match.group(0).strip()))
        dated = _MONTH_DAY_RE.search(line)
        if dated and _CLINICAL_RE.search(line):
            hits.append(("dated-health-event", lineno, dated.group(0)))
    return hits


# --- The scan ------------------------------------------------------------


def scan_file(rel: str, data: bytes, config: ScanConfig) -> tuple[list[Finding], str | None]:
    """Scan one file. Returns ``(findings, stamp)``.

    Fails closed: an undecodable file, or a structured file that will not
    parse, is a FAILURE finding rather than a skip — the scan cannot certify
    what it could not read.
    """
    pinned = rel in config.pins
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        return [Finding(rel, 0, "FAILURE", f"not decodable as UTF-8: {exc}")], None

    findings: list[Finding] = []
    suffix = Path(rel).suffix.lower()
    document: object = None
    fields: dict[str, object] = {}

    if suffix in STRUCTURAL_EXTENSIONS:
        try:
            if suffix == ".json":
                document = json.loads(text)
                fields = sensitive_fields_in_json(document)
            elif suffix == ".csv":
                fields = sensitive_fields_in_csv(text)
            else:
                fields = sensitive_fields_in_yaml(text)
        except (json.JSONDecodeError, csv.Error) as exc:
            return [Finding(rel, 0, "FAILURE", f"{suffix} will not parse: {exc}")], None

    stamp = stamp_of(document, rel, config.authorized_synthetic)
    dates = in_span_dates(text, config)

    # Rule 1 — a sensitive numeric field co-occurring with an in-span timestamp.
    # A pin does not reach this rule: pinning is reserved for the date rule
    # (plan §0.5.5.3), where invented round test dates are the expected noise.
    # frontend/__fixtures__/analysis.json is pinned for its 31 dates and is
    # still flagged here, which is the acceptance criterion.
    if fields and dates and stamp is None:
        first_date = min(dates, key=lambda d: (dates[d], d))
        named = ", ".join(f"{k}={v}" for k, v in sorted(fields.items()))
        findings.append(Finding(
            rel, dates[first_date], "rule1-structural",
            f"numeric field(s) {named} co-occur with in-span date {first_date}"
            f" ({len(dates)} distinct in-span date(s))",
        ))

    # Rule 3 — the date count, subordinate to the stamp, and the one rule a pin
    # reaches: invented round test dates are the expected noise here.
    if len(dates) >= DATE_COUNT_THRESHOLD and stamp is None:
        first_date = min(dates, key=lambda d: (dates[d], d))
        findings.append(Finding(
            rel, dates[first_date], "rule3-date-count",
            f"{len(dates)} distinct in-span dates (>= {DATE_COUNT_THRESHOLD}),"
            f" no accepted provenance stamp",
            suppressed_by=config.pins.get(rel),
        ))

    # Rule 4 — a timestamp series is a data carrier in any extension.
    # Stamp-or-scrub, per the plan: a pin does not reach this rule either. A
    # source file can't carry rule 2's JSON stamp, so it exempts one constant
    # at a time via an in-file SYNTHETIC-FIXTURE marker instead (rule 4 only —
    # synthetic_fixture_spans is never consulted by rules 1, 3 or 5).
    fixture_spans = synthetic_fixture_spans(text)
    carriers = [
        run for run in monotonic_runs(text)
        if run[0] >= SERIES_LENGTH_THRESHOLD and not _within(run[1], fixture_spans)
    ]
    if carriers and stamp is None:
        length, line = carriers[0]
        extra = f", and {len(carriers) - 1} more run(s)" if len(carriers) > 1 else ""
        findings.append(Finding(
            rel, line, "rule4-timestamp-series",
            f"{length} monotonic HH:MM timestamps paired with numerics"
            f" (>= {SERIES_LENGTH_THRESHOLD}){extra}, no accepted provenance stamp",
        ))

    # Rule 5 — prose, last, and never suppressed by a pin.
    for check, lineno, evidence in prose_findings(rel, text):
        if (rel, check) in config.prose_exempt:
            continue
        findings.append(Finding(
            rel, lineno, f"rule5-{check}", evidence, pin_refused=pinned,
        ))

    return findings, stamp


def scan_tree(root: Path, config: ScanConfig) -> ScanResult:
    result = ScanResult()
    exercised: set[str] = set()

    for path in sorted(root.rglob("*")):
        if path.is_dir():
            continue
        rel = path.relative_to(root).as_posix()
        result.scanned += 1
        try:
            data = path.read_bytes()
        except OSError as exc:
            result.findings.append(Finding(rel, 0, "FAILURE", f"unreadable: {exc}"))
            continue
        findings, stamp = scan_file(rel, data, config)
        if stamp is not None:
            result.stamped.append(f"{rel}\t{stamp}")
        for finding in findings:
            if finding.suppressed_by:
                result.suppressed.append(finding)
                exercised.add(finding.path)
            else:
                result.findings.append(finding)

    # A pin naming a path the tree does not contain points the scan at nothing
    # (plan §3.1 [R6] — revision 4 seeded two such pins), and a pin that
    # suppressed nothing is a ruling the tree has since overtaken. Both are
    # reported: an unexamined pin is how a real leak ships.
    for pin in sorted(config.pins):
        if not (root / pin).exists():
            result.missing_pins.append(pin)
        elif pin not in exercised:
            result.unused_pins.append(pin)

    # Same principle for the enumerated stamp: a clearance for a path the tree
    # no longer carries is a ruling nobody has re-read.
    for path in sorted(config.authorized_synthetic):
        if not (root / path).exists():
            result.missing_authorized.append(path)

    return result


# --- The acknowledged dose-ratio baseline --------------------------------


def normalised_entry(path: str, line: int, text: str) -> str:
    """One acknowledged finding, recorded in full.

    The line number is kept for the config's audit value and for the delta
    output, where it helps someone find the change — but it is deliberately
    NOT part of the digest key below.
    """
    return f"{path}\t{line}\t{text}"


def digest_key(entry: str) -> str:
    """The part of an entry the baseline is keyed on: path and matched text.

    Line numbers are excluded because an unrelated edit anywhere above a
    finding shifts them, and a gate that fires on ordinary edits is one whose
    operator learns to re-accept without reading — the same failure as a gate
    that is red forever. Coverage is unaffected: an added hit raises this
    key's count or introduces a new key, a removal lowers it, and a swap
    changes the text so one key leaves as another arrives.
    """
    path, _line, text = entry.split("\t")
    return f"{path}\t{text}"


def digest_of(entries) -> str:
    """SHA-256 over the sorted digest keys, duplicates preserved.

    A MULTISET, not a set: 18 of the acknowledged pairs repeat within one file
    (``1U`` appears seven times in one suite), so a second leak whose text
    happens to match an acknowledged generic in the same file still moves the
    count and fails.
    """
    return hashlib.sha256(
        "\n".join(sorted(digest_key(entry) for entry in entries)).encode("utf-8")
    ).hexdigest()


def dose_entries(findings) -> list[str]:
    return sorted(
        normalised_entry(f.path, f.line, f.detail)
        for f in findings
        if f.rule == DOSE_RATIO_RULE
    )


def dose_delta(config: ScanConfig, entries) -> tuple[list[str], list[str]]:
    """``(added, removed)`` against the acknowledged multiset.

    Compared on the digest key, but reported as whole entries so the delta
    still carries line numbers.
    """
    acknowledged = collections.Counter(digest_key(e) for e in config.dose_ack)
    current = collections.Counter(digest_key(e) for e in entries)
    return (
        _entries_for(entries, current - acknowledged),
        _entries_for(config.dose_ack, acknowledged - current),
    )


def _entries_for(entries, wanted: collections.Counter) -> list[str]:
    """Pick as many whole entries as ``wanted`` calls for, per digest key."""
    remaining = collections.Counter(wanted)
    picked = []
    for entry in sorted(entries):
        key = digest_key(entry)
        if remaining[key] > 0:
            picked.append(entry)
            remaining[key] -= 1
    return picked


def render_entry(entry: str) -> str:
    path, line, text = entry.split("\t")
    return f"{path}:{line}\t{text}"


def rewrite_baseline(config_path: Path, entries) -> None:
    """Replace the generated baseline block in the config, in place.

    Only the block between the sentinels is touched, so the hand-written
    paragraph explaining the posture survives regeneration.
    """
    block = [
        _BASELINE_BEGIN,
        f"dose-ratio-baseline {len(entries)} {digest_of(entries)}",
        *(f"dose-ratio-ack {render_entry(entry).replace(chr(9), ' | ')}"
          for entry in sorted(entries)),
        _BASELINE_END,
    ]
    text = config_path.read_text(encoding="utf-8")
    before, sentinel, rest = text.partition(_BASELINE_BEGIN)
    if not sentinel:
        raise ConfigError(
            f"config has no {_BASELINE_BEGIN!r} sentinel to regenerate into"
        )
    _stale, end_sentinel, after = rest.partition(_BASELINE_END)
    if not end_sentinel:
        raise ConfigError(f"config has no {_BASELINE_END!r} sentinel")
    config_path.write_text(before + "\n".join(block) + after, encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Structural contamination scan over a materialised public tree (#728)."
    )
    parser.add_argument("tree", type=Path, help="the materialised output tree to scan")
    parser.add_argument("--config", type=Path, default=CONFIG_PATH)
    parser.add_argument(
        "--accept-dose-ratio-baseline",
        action="store_true",
        help="record the current dose-ratio findings as the acknowledged set."
             " Prints the full delta first: accepting is a judgement that every"
             " added entry is non-identifying, so look at it before you run this.",
    )
    args = parser.parse_args(argv)

    if not args.tree.is_dir():
        print(
            f"scan-public-tree: {args.tree} is not a directory. This scan runs over a"
            " materialised tree, not the source repository.",
            file=sys.stderr,
        )
        return 2

    try:
        config = load_config(args.config)
    except (ConfigError, OSError) as exc:
        print(f"scan-public-tree: config: {exc}", file=sys.stderr)
        return 2

    result = scan_tree(args.tree, config)
    entries = dose_entries(result.findings)
    added, removed = dose_delta(config, entries)
    hard = [f for f in result.findings if f.rule != DOSE_RATIO_RULE]

    if args.accept_dose_ratio_baseline:
        if hard:
            for finding in hard:
                print(finding.render())
            print(
                "\nrefusing to accept the dose-ratio baseline while"
                f" {len(hard)} other finding(s) remain."
            )
            return 1
        print(f"accepting {len(entries)} dose-ratio finding(s) as the baseline.")
        print_delta(added, removed)
        try:
            rewrite_baseline(args.config, entries)
        except (ConfigError, OSError) as exc:
            print(f"scan-public-tree: {exc}", file=sys.stderr)
            return 2
        print(f"\nwrote baseline to {args.config}: {len(entries)} entr(ies),"
              f" digest {digest_of(entries)}.")
        print("Every other rule still hard-fails; this flag acknowledges dose-ratio only.")
        return 0

    for finding in hard:
        print(finding.render())

    if config.dose_baseline is not None and not (added or removed):
        print(f"\n{len(entries)} rule5-dose-ratio finding(s) match the acknowledged"
              f" baseline (digest {config.dose_baseline[1][:12]}…); each was read and"
              " judged non-identifying. See scripts/public_scan_config.txt.")
    elif added or removed:
        print("\nthe rule5-dose-ratio set has CHANGED against the acknowledged baseline.")
        print_delta(added, removed)
        print("\nDisposition the delta above. If every added entry is non-identifying,"
              "\nre-record it with --accept-dose-ratio-baseline.")

    if result.suppressed:
        print("\nsuppressed by a pin (the date rule only — reason recorded in the config):")
        for finding in result.suppressed:
            print(f"  {finding.path}:{finding.line}\t{finding.detail}"
                  f"\n\t\tpinned: {finding.suppressed_by}")

    if config.prose_exempt:
        print("\nprose exemptions in force (plan-ruled, never inferred):")
        for (path, check), reason in sorted(config.prose_exempt.items()):
            print(f"  {path}\t{check}\t{reason}")

    if result.missing_pins:
        print("\npins naming a path absent from the tree:")
        for pin in result.missing_pins:
            print(f"  {pin}")
    if result.unused_pins:
        print("\npins that suppressed nothing on this run:")
        for pin in result.unused_pins:
            print(f"  {pin}")
    if result.missing_authorized:
        print("\nauthorized-synthetic clearances naming a path absent from the tree:")
        for path in result.missing_authorized:
            print(f"  {path}")

    print(
        f"\nscan-public-tree: {result.scanned} file(s) scanned,"
        f" {len(result.stamped)} stamped, {len(result.suppressed)} pinned,"
        f" {len(entries)} acknowledged dose-ratio, {len(hard)} finding(s)."
    )
    return 1 if hard or added or removed else 0


def print_delta(added, removed) -> None:
    """Name both sides, so the next person disposes of the change rather than
    re-reading the whole acknowledged set."""
    if not added and not removed:
        print("  no change against the acknowledged set.")
        return
    for entry in added:
        print(f"  + {render_entry(entry)}")
    for entry in removed:
        print(f"  - {render_entry(entry)}")
    print(f"  ({len(added)} added, {len(removed)} removed)")



if __name__ == "__main__":
    raise SystemExit(main())
