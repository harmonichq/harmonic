"""#449/#450 triage spike: every refusal code the durable lifecycle 409 can carry.

Run from the repository root (reads source text only; no store, no server):

    python3 openspec/changes/focus-served-words/refusals.py

Scans every module under ciq_autotune/ for FollowUpConflict raises, in either
quote style, and adds the handler's default for the errors that carry no reason
(FocusAlreadyActive, sqlite3.IntegrityError). It fails if any FollowUpConflict
call passes a code that is not a string literal, because such a code could not
be enumerated. Triage evidence only: task 1.2's completeness test carries its
own copy of these patterns, and nothing imports this file.
"""
import re
import sys
from pathlib import Path

CALL = re.compile(r"FollowUpConflict\(")
LITERAL = re.compile(r"""FollowUpConflict\(\s*(['"])([a-z_]+)\1""")
DEFAULT = re.compile(r"""getattr\(error,\s*["']reason["'],\s*["']([a-z_]+)["']\)""")


def refusal_codes(root=Path("ciq_autotune")):
    codes, calls, literals = set(), 0, 0
    for path in sorted(root.rglob("*.py")):
        text = path.read_text()
        calls += len(CALL.findall(text)) - text.count("class FollowUpConflict(")
        found = [code for _quote, code in LITERAL.findall(text)]
        literals += len(found)
        codes.update(found)
        codes.update(DEFAULT.findall(text))
    return codes, calls, literals


if __name__ == "__main__":
    codes, calls, literals = refusal_codes()
    print(f"raise sites={calls} literal={literals} codes={len(codes)}")
    for code in sorted(codes):
        print(" ", code)
    sys.exit(0 if calls == literals and codes else 1)
