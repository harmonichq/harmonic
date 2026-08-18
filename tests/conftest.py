"""Test-suite environment defaults.

``normalize_time`` now raises when it must convert a tz-aware timestamp and
``TIMEZONE_NAME`` is unset, instead of silently defaulting to UTC (#198). The old
default *was* UTC, so pin ``TIMEZONE_NAME=UTC`` for the suite to preserve every
existing fixture's converted values exactly — this only makes the previously
implicit default explicit. Tests that exercise the unset/other-zone behavior
override it locally (e.g. ``mock.patch.dict(os.environ, ...)``), and the CLI
env tests pop it in their own setUp.
"""

import os

os.environ.setdefault("TIMEZONE_NAME", "UTC")
