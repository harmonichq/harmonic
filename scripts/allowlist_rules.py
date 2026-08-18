"""Parser and matcher for the Harmonic public-repository allowlist (#728).

This is a library module, not a CLI — ``check_public_allowlist.py`` (the CI
gate) and ``build_public_tree.py`` (the materialiser) both import it, so the
grammar and the precedence chain live in exactly one place.

Grammar (cutover plan Phase 1, §1.3), one rule per non-blank, non-``#`` line
in ``public_allowlist.txt``:

  * **exact path** — clears one file, e.g. ``pyproject.toml``.
  * **directory glob + extension whitelist** — clears every tracked file
    under a directory whose extension is in the given set, e.g.
    ``frontend/** {.html,.js,.mjs,.css,.svg,.json}``. A directory glob with
    no extension whitelist (a bare ``**`` rule) is invalid and rejected at
    parse time — it would positively clear any future file dropped there,
    binary or not.
  * **exact-path deny** — ``! path/to/file`` — evaluated before the positive
    rules; a glob is not permitted in a deny rule.

A path ruled by both an exact-path positive and an exact-path deny is a
parse-time error (§1.3 [R10]). Fixed precedence when matching one tracked
path: exact-deny > exact-positive > binary-deny > glob-positive >
default-exclude. Binary extensions are denied globally
(``.png .jpg .gif .pdf .db .sqlite .key .har``), overridable only by an
exact-path positive rule. Default is exclusion.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

ALLOWLIST_PATH = Path(__file__).resolve().parent / "public_allowlist.txt"

# Overridable only by an exact-path positive rule (§1.3).
BINARY_DENY_EXTENSIONS = frozenset({
    ".png", ".jpg", ".gif", ".pdf", ".db", ".sqlite", ".key", ".har",
})

# "<dir>/** {.ext1,.ext2}" — the prefix's character class excludes "*", so a
# bare "**" (with or without a slash) can never satisfy this pattern; it falls
# through to the catch-all rejection in parse() below.
_GLOB_RE = re.compile(r"^(?P<prefix>[^\s*]+)/\*\*\s*\{(?P<exts>[^}]*)\}$")
_DENY_RE = re.compile(r"^!\s*(?P<path>\S+)$")


class AllowlistError(ValueError):
    """A parse-time grammar violation. Fails the build/check closed."""


@dataclass(frozen=True)
class GlobRule:
    prefix: str  # directory path, no trailing slash, e.g. "frontend"
    extensions: frozenset[str]
    line: str  # original source line, surfaced as the clearing reason


@dataclass(frozen=True)
class Allowlist:
    exact_positive: dict[str, str]  # path -> source line
    exact_deny: dict[str, str]  # path -> source line
    globs: tuple[GlobRule, ...]

    def disposition(self, path: str) -> tuple[bool, str]:
        """Return (included, reason) for one tracked path (posix-style,
        repo-relative), applying the fixed precedence chain. Total over every
        string: every tracked path resolves to exactly one of the two
        outcomes, so there is no third "undispositioned" state to detect at
        match time — only at parse time, where AllowlistError already fires.
        """
        if path in self.exact_deny:
            return False, f"exact-deny: {self.exact_deny[path]}"
        if path in self.exact_positive:
            return True, f"exact-positive: {self.exact_positive[path]}"
        suffix = _suffix(path)
        if suffix in BINARY_DENY_EXTENSIONS:
            return False, f"binary-deny: {suffix}"
        for rule in self.globs:
            if path.startswith(rule.prefix + "/") and suffix in rule.extensions:
                return True, f"glob-positive: {rule.line}"
        return False, "default-exclude"


def _suffix(path: str) -> str:
    dot = path.rfind(".")
    slash = path.rfind("/")
    if dot <= slash:
        return ""
    return path[dot:]


def parse(text: str) -> Allowlist:
    exact_positive: dict[str, str] = {}
    exact_deny: dict[str, str] = {}
    globs: list[GlobRule] = []

    for lineno, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue

        deny_match = _DENY_RE.match(line)
        if deny_match:
            path = deny_match.group("path")
            if "*" in path:
                raise AllowlistError(
                    f"line {lineno}: exact-path deny cannot contain a glob: {line!r}"
                )
            if path in exact_deny:
                raise AllowlistError(f"line {lineno}: duplicate exact-deny for {path!r}")
            exact_deny[path] = line
            continue

        glob_match = _GLOB_RE.match(line)
        if glob_match:
            ext_field = glob_match.group("exts").strip()
            exts = frozenset(e.strip() for e in ext_field.split(",") if e.strip())
            if not exts:
                raise AllowlistError(
                    f"line {lineno}: directory glob has no extension whitelist"
                    f" (a bare ** rule is invalid): {line!r}"
                )
            for ext in exts:
                if not ext.startswith("."):
                    raise AllowlistError(
                        f"line {lineno}: extension {ext!r} must start with '.': {line!r}"
                    )
            globs.append(GlobRule(
                prefix=glob_match.group("prefix"), extensions=exts, line=line,
            ))
            continue

        if "*" in line:
            raise AllowlistError(
                f"line {lineno}: '**' with no extension whitelist is invalid"
                f" (a bare ** rule): {line!r}"
            )

        path = line
        if path in exact_positive:
            raise AllowlistError(f"line {lineno}: duplicate exact-positive for {path!r}")
        exact_positive[path] = line

    collisions = sorted(set(exact_positive) & set(exact_deny))
    if collisions:
        raise AllowlistError(
            "path(s) ruled by both an exact-path positive and an exact-path"
            f" deny (plan §1.3 [R10]): {collisions}"
        )

    return Allowlist(exact_positive=exact_positive, exact_deny=exact_deny, globs=tuple(globs))


def load(path: Path = ALLOWLIST_PATH) -> Allowlist:
    return parse(path.read_text(encoding="utf-8"))
