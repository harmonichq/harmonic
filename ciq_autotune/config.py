"""Runtime configuration with canonical Harmonic names and legacy aliases."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# Each legacy spelling remains only so an existing deployment can upgrade without
# changing its environment all at once. New operator-facing documentation names
# only the Harmonic variable.
_ENVIRONMENT_NAMES = {
    "db_path": ("HARMONIC_DB", "CIQ_DB"),
    "api_token": ("HARMONIC_API_TOKEN", "CIQ_API_TOKEN"),
    "secret_key_path": ("HARMONIC_SECRET_KEY", "CIQ_SECRET_KEY"),
    "no_fetch": ("HARMONIC_NO_FETCH", "CIQ_NO_FETCH"),
}


@dataclass(frozen=True)
class RuntimeConfiguration:
    db_path: str
    api_token: Optional[str]
    secret_key_path: str
    no_fetch: bool


def _environment_value(name: str, default: Optional[str] = None) -> Optional[str]:
    canonical, legacy = _ENVIRONMENT_NAMES[name]
    if canonical in os.environ:
        return os.environ[canonical]
    if legacy in os.environ:
        logger.warning("%s is deprecated; use %s instead", legacy, canonical)
        return os.environ[legacy]
    return default


def resolve_runtime_configuration(default_db: str, default_secret_key: str) -> RuntimeConfiguration:
    """Resolve process configuration once for CLI, Docker, and direct ASGI use.

    Canonical ``HARMONIC_*`` values win even when intentionally empty; the
    ``CIQ_*`` aliases are read only when their canonical counterpart is absent.
    """
    db_path = _environment_value("db_path", default_db)
    secret_key_path = _environment_value("secret_key_path", default_secret_key)
    assert db_path is not None
    assert secret_key_path is not None
    no_fetch = _environment_value("no_fetch", "")
    return RuntimeConfiguration(
        db_path=db_path,
        api_token=_environment_value("api_token"),
        secret_key_path=secret_key_path,
        no_fetch=no_fetch.lower() in {"1", "true", "yes"},
    )
