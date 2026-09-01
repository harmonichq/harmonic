#!/usr/bin/env python3
"""Reject a shipping document that points at a file the public tree excludes
(#728, cutover plan Phase 2.2).

``docs/scope/``, ``mockups/`` (bar a handful of exact paths) and
the private tooling directories do not ship. A README or spec that links into
one of them reads fine in this repository and is a dead end in the published
one — three such links existed when this check was written, and the fourth is
the reason it exists at all rather than a hand-kept list.

Run it over a materialised public tree:

    python3 scripts/build_public_tree.py /tmp/tree
    python3 scripts/check_public_links.py /tmp/tree

Four rules, each failing closed:

* **Module imports** — a relative ``import``/``export … from`` specifier in a
  shipping ``.js``, ``.mjs`` or ``.html`` file must resolve to a file in the
  tree. This is the only class of dead pointer that BREAKS A BUILD rather than
  merely reading badly, and it is the reason the source-comment exclusion below
  was narrowed: ``mockups/findings-projection.mirror.mjs`` was imported by five
  shipping modules and allowlisted by none, so every affected CI leg would have
  failed on the first push while a prose-only check reported the tree clean.
  Bare specifiers (``vue``, ``node:test``, ``playwright``) are packages, not
  paths, and are skipped.
* **Markdown links** — a relative ``[text](target)`` in any shipping ``.md``
  must resolve to something inside the tree. External URLs, ``mailto:`` and
  bare ``#anchor`` fragments are not paths and are skipped.
* **Prose path references** — a path-shaped token (``openspec/changes/x/design.md``,
  ``mockups/INDEX.md``) that names a **tracked file of this repository which
  the tree excludes**. Comparing against the tracked set, rather than against
  "does this string exist", is what keeps runtime paths like
  ``tconnect-data/ciq.db`` and shell globs out of the result: they are not
  tracked, so they are not references to anything that could have shipped.
  A directory token (trailing slash) fails when the tree carries none of the
  tracked files beneath it. Read in whole-file ``.md``, in the comments of a
  rule file, and — since a source comment pointing a stranger at a document
  that does not ship is the same dead end — in the COMMENTS of shipping source
  files.
* **Symlinks** — every symlink in the tree must resolve inside the tree.
  ``CLAUDE.md`` ships as the symlink it is, so its target has to ship too.

Run inside the public repository itself, the tracked set and the tree agree and
only the import, markdown-link and symlink rules can fire — which is the right
behaviour there: dead links stay caught, exclusions no longer apply.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Documents whose whole text is prose.
SCANNED_SUFFIXES = frozenset({".md"})
# Rule files, where only the **comments** are prose. An ignore pattern naming a
# path is not a claim that the path ships; a comment pointing a reader at a
# document is, and that is the class this check exists for.
SCANNED_RULE_FILES = frozenset({".gitignore", ".dockerignore", ".env.example"})
# Source files, where the same "only the comments" rule applies for the same
# reason. Source comments used to be out of scope on the grounds that they cite
# build-time records the tree is not expected to carry; that exclusion is what
# let a stranger be pointed at four documents that do not ship, so the citations
# were re-pointed or dropped and the exclusion lifted. Code is not read — a path
# in a string literal is a runtime value, not a claim that a document ships.
SOURCE_SUFFIXES = frozenset({".py", ".js", ".mjs", ".css", ".html", ".sh"})
# Files whose module graph is resolved. A broken relative specifier here fails a
# build, not merely a reader.
IMPORT_SUFFIXES = frozenset({".js", ".mjs", ".html"})

# A relative module specifier, in the two forms an ES module writes one:
# `… from "./x.js"` (static import and re-export, which may wrap across lines
# after a brace list) and `import "./x.js"` / `import("./x.js")` (side-effect
# and dynamic). Requiring the keyword immediately before the quote is what
# separates a specifier from an ordinary string that happens to look like a
# path, and requiring a leading "." skips every bare package specifier.
_FROM_SPECIFIER_RE = re.compile(r"\bfrom\s*([\"\'])(\.[^\"\']*)\1")
_IMPORT_SPECIFIER_RE = re.compile(r"\bimport\s*\(?\s*([\"\'])(\.[^\"\']*)\1")

# Comment syntax per shipping source language. Kept per-language rather than a
# union so a CSS colour ("#1C6E8C") is not read as a shell comment and a
# protocol-relative URL is not read as a JS one. HTML carries the SPA's whole
# module inline, so it takes the JS forms as well as its own.
_LINE_COMMENTS = {
    # The triple quotes are line openers as well as block delimiters: a
    # one-line docstring never toggles the block state (two delimiters,
    # even count), and a multi-line one carries text on its opening line
    # that the block state does not cover until the line after.
    ".py": ("#", '"""', "'''"),
    ".sh": ("#",),
    ".js": ("//", "/*"),
    ".mjs": ("//", "/*"),
    ".css": ("/*",),
    ".html": ("<!--", "//", "/*"),
}
# (open, close) per language. A pair whose two tokens are identical — Python's
# triple quotes — toggles on an odd count per line; the rest open and close.
_BLOCK_COMMENTS = {
    ".py": (('"""', '"""'), ("'''", "'''")),
    ".sh": (),
    ".js": (("/*", "*/"),),
    ".mjs": (("/*", "*/"),),
    ".css": (("/*", "*/"),),
    ".html": (("<!--", "-->"), ("/*", "*/")),
}

# "[text](target)" and "[ref]: target".
_INLINE_LINK_RE = re.compile(r"\[[^\]]*\]\(\s*<?([^)\s>]+)>?\s*\)")
_REF_LINK_RE = re.compile(r"^\s*\[[^\]]+\]:\s*<?(\S+)>?\s*$", re.MULTILINE)

# A URI scheme, e.g. "https:", "mailto:", or the knowledge base's own "app:"
# in-product links. None of these is a filesystem path.
_SCHEME_RE = re.compile(r"^[a-z][a-z0-9+.-]*:")

# A repo-relative path: at least one slash, no whitespace. Placeholder syntax
# (`*`, `<issue>`) and URLs are filtered out in _path_tokens below.
_PATH_TOKEN_RE = re.compile(r"[A-Za-z0-9_.][A-Za-z0-9_.@+-]*(?:/[A-Za-z0-9_.@+-]+)*/?")

# (document, token) pairs that name a non-shipping path on purpose, each with
# the reason it is not a defect. Pinned per document rather than exempted by
# directory, so a second document citing the same path is still caught.
PINNED = {
    ("AGENTS.md", "openspec/changes/"):
        "names where a new decision record is created. The public tree ships"
        " the naming guard and the capability specs, not the change history"
        " those records sit in.",
    ("CLAUDE.md", "openspec/changes/"):
        "the same line, reached through the CLAUDE.md symlink.",
    ("AGENTS.md", "mockups/qa-e2e.synthetic/harmonic.sqlite"):
        "the exact offline UI-design command names a generated runtime output."
        " The public tree deliberately excludes the committed binary, but ships"
        " scripts/gen_qa_e2e_db.py so the same path can be manufactured from"
        " its fixed seed before the command runs.",
    ("CLAUDE.md", "mockups/qa-e2e.synthetic/harmonic.sqlite"):
        "the same safe-start declaration, reached through the CLAUDE.md symlink.",
    ("AGENTS.md", "mockups/revise-e2e.synthetic/harmonic.sqlite"):
        "the browser-gates reproduction block names a generated runtime output."
        " The public tree deliberately excludes the committed binary, but ships"
        " scripts/gen_revise_e2e_db.py so the same path can be manufactured from"
        " its fixed seed before the command runs.",
    ("CLAUDE.md", "mockups/revise-e2e.synthetic/harmonic.sqlite"):
        "the same browser-gates declaration, reached through the CLAUDE.md symlink.",
    (".gitignore", "mockups/sweep/"):
        "a comment explaining the ignore rule directly above it. Behaviour-sweep"
        " renders are excluded from the public tree by design, so the directory"
        " is correctly absent there.",
    # The four documents below have the exclusions themselves as their subject.
    # Each names an excluded path in order to explain a rule ABOUT it, so the
    # citation is the point rather than a pointer a reader is meant to follow.
    ("scripts/check_public_links.py", "docs/adr/"):
        "this check's own docstring, naming the directories it exists to catch"
        " references into.",
    ("scripts/check_public_links.py", "docs/scope/"): "the same docstring.",
    ("scripts/check_public_links.py", "mockups/INDEX.md"):
        "the same docstring's worked example of a prose path reference.",
    ("scripts/check_adr_numbers.py", "openspec/changes/"):
        "the ADR-identity guard names the directory it validates. The guard"
        " ships so the naming rule is enforceable in the public repository; the"
        " records themselves do not.",
    ("tests/test_check_public_links.py", "docs/adr/"):
        "the test docstrings quote the links this check was written for.",
    ("tests/test_check_public_links.py", "openspec/changes/"):
        "the pinned-reference test quotes the decision-record pointer it clears,"
        " which names the change tree the records live in.",
    ("tests/test_check_adr_numbers.py", "docs/adr/"):
        "the guard's own test says, in as many words, that the tree ships the"
        " naming rule and not the records. Naming the absent directory is the"
        " assertion.",
    ("tests/test_check_public_links.py", "docs/adr/adr-6-ci-and-docker-deployment.md"):
        "the same, named in a docstring.",
    ("tests/test_check_public_links.py", "mockups/INDEX.md"): "the same.",
    ("tests/test_check_public_links.py", "docs/agents/mock-to-app-process.md"):
        "the same, in the source-comment rule's docstring.",
    ("tests/test_check_public_allowlist.py", "frontend/basal-lane-394.shot.mjs"):
        "the allowlist test names the two PHI-leaking screenshot generators its"
        " deny rules exist for.",
    ("tests/test_check_public_allowlist.py", "frontend/dose-focus-385.shot.mjs"):
        "the same.",
}


def tracked_files(repo_root: Path = REPO_ROOT) -> set[str]:
    result = subprocess.run(
        ["git", "ls-files"], cwd=str(repo_root), capture_output=True, text=True, check=True,
    )
    return {line for line in result.stdout.splitlines() if line}


def _scanned_documents(tree: Path) -> list[Path]:
    return sorted(
        p for p in tree.rglob("*")
        if p.is_file() and (
            p.suffix in SCANNED_SUFFIXES
            or p.suffix.lower() in SOURCE_SUFFIXES
            or p.name in SCANNED_RULE_FILES
        )
    )


def _module_documents(tree: Path) -> list[Path]:
    return sorted(
        p for p in tree.rglob("*")
        if p.is_file() and p.suffix.lower() in IMPORT_SUFFIXES
    )


def _comments(text: str, suffix: str) -> str:
    """The comment text of a source file, block comments and docstrings
    included. Line numbers are not preserved; the rules report paths, not
    positions."""
    openers = _LINE_COMMENTS.get(suffix, ())
    blocks = _BLOCK_COMMENTS.get(suffix, ())
    kept: list[str] = []
    in_block = False
    for line in text.splitlines():
        if in_block:
            kept.append(line)
        else:
            starts = [i for i in (line.find(o) for o in openers) if i >= 0]
            if starts:
                kept.append(line[min(starts):])
        for opener, closer in blocks:
            if opener == closer:
                if line.count(opener) % 2:
                    in_block = not in_block
                continue
            last_open, last_close = line.rfind(opener), line.rfind(closer)
            if last_open > last_close:
                in_block = True
            elif last_close > last_open:
                in_block = False
    return "\n".join(kept)


def _prose(doc: Path, text: str) -> str:
    """The part of a document that makes claims about other files."""
    if doc.name in SCANNED_RULE_FILES:
        return "\n".join(line for line in text.splitlines() if line.lstrip().startswith("#"))
    if doc.suffix.lower() in SOURCE_SUFFIXES:
        return _comments(text, doc.suffix.lower())
    return text


def _import_specifiers(text: str) -> list[str]:
    return [m.group(2) for m in _FROM_SPECIFIER_RE.finditer(text)] + \
           [m.group(2) for m in _IMPORT_SPECIFIER_RE.finditer(text)]


def _link_targets(text: str) -> list[str]:
    return [m.group(1) for m in _INLINE_LINK_RE.finditer(text)] + \
           [m.group(1) for m in _REF_LINK_RE.finditer(text)]


def _path_tokens(text: str) -> set[str]:
    tokens = set()
    for match in _PATH_TOKEN_RE.finditer(text):
        token = match.group(0)
        if "/" not in token or "://" in token:
            continue
        tokens.add(token)
        # A path ending a sentence swallows the full stop, because "." is a
        # legitimate character inside a filename. Four citations of one
        # non-shipping port record hid behind exactly that, so the trailing
        # punctuation is stripped and BOTH forms are considered.
        trimmed = token.rstrip(".,;:")
        if trimmed and trimmed != token:
            tokens.add(trimmed)
    return tokens


def check(tree: Path, tracked: set[str]) -> list[str]:
    failures: list[str] = []
    # One dead reference is one failure: a markdown link is also a path-shaped
    # token, so both rules see it and only the first report is kept.
    reported: set[tuple[str, str]] = set()
    # A directory prefix is "shipped" when the tree carries any file under it.
    shipped = {
        p.relative_to(tree).as_posix()
        for p in tree.rglob("*") if p.is_file() or p.is_symlink()
    }
    shipped_dirs = set()
    for rel in shipped:
        parts = rel.split("/")
        for i in range(1, len(parts)):
            shipped_dirs.add("/".join(parts[:i]))
    tracked_dirs = set()
    for rel in tracked:
        parts = rel.split("/")
        for i in range(1, len(parts)):
            tracked_dirs.add("/".join(parts[:i]))

    # Rule: the module graph. Run first — a dead import is a build failure,
    # and reporting it above the prose findings puts the blocking one first.
    for module in _module_documents(tree):
        rel_module = module.relative_to(tree).as_posix()
        try:
            source = module.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for specifier in _import_specifiers(source):
            target = specifier.split("?", 1)[0].split("#", 1)[0]
            resolved = (module.parent / target).resolve()
            try:
                rel = resolved.relative_to(tree.resolve()).as_posix()
            except ValueError:
                failures.append(
                    f"{rel_module}: imports {specifier!r}, which escapes the public tree"
                )
                continue
            if rel not in shipped:
                failures.append(
                    f"{rel_module}: imports {specifier!r}, which the public tree does not"
                    f" ship — this fails a build, not just a reader"
                )

    for doc in _scanned_documents(tree):
        rel_doc = doc.relative_to(tree).as_posix()
        try:
            text = doc.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue

        prose = _prose(doc, text)
        # The markdown-link rule reads documents and rule files only. A source
        # comment is prose for the path-token rule, but "[text](target)" inside
        # one is prose about markdown, not a link anybody can follow.
        links = [] if doc.suffix.lower() in SOURCE_SUFFIXES else _link_targets(prose)

        for target in links:
            if target.startswith("#") or _SCHEME_RE.match(target):
                continue
            bare = target.split("#", 1)[0].split("?", 1)[0]
            if not bare:
                continue
            resolved = (doc.parent / bare).resolve()
            try:
                rel = resolved.relative_to(tree.resolve()).as_posix()
            except ValueError:
                failures.append(f"{rel_doc}: link {target!r} escapes the public tree")
                continue
            if rel not in shipped and rel not in shipped_dirs:
                reported.add((rel_doc, bare))
                failures.append(f"{rel_doc}: link {target!r} resolves to nothing in the public tree")

        for token in sorted(_path_tokens(prose)):
            if (rel_doc, token) in PINNED or (rel_doc, token) in reported:
                continue
            if token.endswith("/"):
                directory = token.rstrip("/")
                if directory in tracked_dirs and directory not in shipped_dirs:
                    failures.append(
                        f"{rel_doc}: names directory {token!r}, which the public tree excludes entirely"
                    )
            elif token in tracked and token not in shipped:
                failures.append(
                    f"{rel_doc}: names {token!r}, a tracked file the public tree excludes"
                )

    for path in sorted(tree.rglob("*")):
        if not path.is_symlink():
            continue
        rel_link = path.relative_to(tree).as_posix()
        if not path.resolve().exists():
            failures.append(f"{rel_link}: symlink target {path.readlink()} does not ship")

    return failures


def main(argv: list[str] = sys.argv[1:]) -> int:
    if len(argv) != 1:
        print("usage: check_public_links.py <public-tree-dir>", file=sys.stderr)
        return 2

    tree = Path(argv[0]).resolve()
    if not tree.is_dir():
        print(f"check-public-links: {tree} is not a directory", file=sys.stderr)
        return 2

    failures = check(tree, tracked_files())
    if failures:
        print("check-public-links: shipping document points outside the public tree:",
              file=sys.stderr)
        for failure in failures:
            print(f"  {failure}", file=sys.stderr)
        return 1

    docs = len(_scanned_documents(tree))
    print(f"check-public-links: {docs} shipping document(s) scanned;"
          f" every link, path reference and symlink resolves inside the tree.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
