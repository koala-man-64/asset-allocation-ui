from __future__ import annotations

import subprocess
import sys
from pathlib import Path


PYTHON_QUALITY_TARGETS = ("tests", "scripts")


def repo_root() -> Path:
    for candidate in Path(__file__).resolve().parents:
        if (candidate / "package.json").exists() and (
            candidate / ".github" / "workflows"
        ).is_dir():
            return candidate
    raise AssertionError("Could not resolve repository root from test path")


def should_skip_ruff_path_arg(arg: str) -> bool:
    if arg.startswith("-"):
        return False

    parts = Path(arg).parts
    return any(part not in {".", ".."} and part.startswith(".") for part in parts)


def assert_ruff_passes(command: str, *args: str) -> None:
    filtered_args = tuple(arg for arg in args if not should_skip_ruff_path_arg(arg))

    completed = subprocess.run(
        [sys.executable, "-m", "ruff", command, *filtered_args],
        cwd=repo_root(),
        capture_output=True,
        text=True,
    )

    if completed.returncode == 0:
        return

    command = " ".join(("ruff", command, *filtered_args))
    output = "\n".join(
        part.strip() for part in (completed.stdout, completed.stderr) if part.strip()
    )
    raise AssertionError(f"{command} failed:\n{output}")


def test_hidden_python_paths_are_skipped_from_ruff_targets() -> None:
    assert should_skip_ruff_path_arg(".codex")
    assert should_skip_ruff_path_arg(".github/workflows")
    assert should_skip_ruff_path_arg("tests/.fixtures")
    assert not should_skip_ruff_path_arg("--check")
    assert not should_skip_ruff_path_arg("tests")


def test_python_sources_pass_ruff_check() -> None:
    assert_ruff_passes("check", *PYTHON_QUALITY_TARGETS)


def test_python_sources_pass_ruff_format_check() -> None:
    assert_ruff_passes("format", "--check", *PYTHON_QUALITY_TARGETS)
