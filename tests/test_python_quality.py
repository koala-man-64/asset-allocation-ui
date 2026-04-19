from __future__ import annotations

import subprocess
import sys
from pathlib import Path


PYTHON_QUALITY_TARGETS = ("tests", "scripts", ".codex")


def repo_root() -> Path:
    for candidate in Path(__file__).resolve().parents:
        if (candidate / "package.json").exists() and (
            candidate / ".github" / "workflows"
        ).is_dir():
            return candidate
    raise AssertionError("Could not resolve repository root from test path")


def assert_ruff_passes(*args: str) -> None:
    completed = subprocess.run(
        [sys.executable, "-m", "ruff", *args],
        cwd=repo_root(),
        capture_output=True,
        text=True,
    )

    if completed.returncode == 0:
        return

    command = " ".join(("ruff", *args))
    output = "\n".join(
        part.strip() for part in (completed.stdout, completed.stderr) if part.strip()
    )
    raise AssertionError(f"{command} failed:\n{output}")


def test_python_sources_pass_ruff_check() -> None:
    assert_ruff_passes("check", *PYTHON_QUALITY_TARGETS)


def test_python_sources_pass_ruff_format_check() -> None:
    assert_ruff_passes("format", "--check", *PYTHON_QUALITY_TARGETS)
