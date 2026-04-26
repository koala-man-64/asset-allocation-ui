from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

import pytest


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def load_module(relative_path: str, module_name: str) -> ModuleType:
    path = repo_root() / relative_path
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise AssertionError(f"Could not load module from {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_resolve_contracts_version_uses_latest_compatible_published_release() -> None:
    module = load_module("scripts/workflows/resolve_contracts_version.py", "resolve_contracts_version")

    resolved = module.resolve_version(
        ">=1.1.0 <2.0.0",
        ["2.0.0", "1.3.0", "1.2.0", "1.1.0"],
    )

    assert resolved == "1.3.0"


def test_resolve_contracts_version_accepts_published_override_within_range() -> None:
    module = load_module("scripts/workflows/resolve_contracts_version.py", "resolve_contracts_version_override")

    resolved = module.resolve_version(
        ">=1.1.0 <2.0.0",
        ["1.3.0", "1.2.0", "1.1.0"],
        override="1.2.0",
    )

    assert resolved == "1.2.0"


def test_resolve_contracts_version_ignores_prereleases_when_selecting_latest() -> None:
    module = load_module("scripts/workflows/resolve_contracts_version.py", "resolve_contracts_version_prerelease")

    resolved = module.resolve_version(
        ">=1.1.0 <2.0.0",
        ["1.4.0-beta.1", "1.3.0", "1.2.0"],
    )

    assert resolved == "1.3.0"


def test_resolve_contracts_version_rejects_override_outside_supported_range() -> None:
    module = load_module("scripts/workflows/resolve_contracts_version.py", "resolve_contracts_version_outside_range")

    with pytest.raises(ValueError, match="does not satisfy"):
        module.resolve_version(
            ">=1.1.0 <2.0.0",
            ["2.0.0", "1.3.0", "1.2.0"],
            override="2.0.0",
        )
