from __future__ import annotations

import csv
import re
import subprocess
from pathlib import Path


WORKFLOW_VAR_PATTERN = re.compile(r"\bvars\.([A-Z][A-Z0-9_]+)\b")
WORKFLOW_SECRET_PATTERN = re.compile(r"\bsecrets\.([A-Z][A-Z0-9_]+)\b")


def repo_root() -> Path:
    for candidate in Path(__file__).resolve().parents:
        if (candidate / "package.json").exists() and (candidate / ".github" / "workflows").is_dir():
            return candidate
    raise AssertionError("Could not resolve repository root from test path")


def contract_rows() -> list[dict[str, str]]:
    path = repo_root() / "docs" / "ops" / "env-contract.csv"
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def contract_map() -> dict[str, dict[str, str]]:
    return {row["name"]: row for row in contract_rows()}


def env_keys(path: Path) -> set[str]:
    keys: set[str] = set()
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        keys.add(line.split("=", 1)[0].strip())
    return keys


def workflow_refs(pattern: re.Pattern[str]) -> set[str]:
    refs: set[str] = set()
    for path in (repo_root() / ".github" / "workflows").glob("*.yml"):
        refs.update(pattern.findall(path.read_text(encoding="utf-8")))
    return refs


def workflow_text(name: str) -> str:
    return (repo_root() / ".github" / "workflows" / name).read_text(encoding="utf-8")


def powershell_exe() -> str:
    for candidate in ("pwsh", "powershell"):
        try:
            subprocess.run([candidate, "-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"], check=True, capture_output=True, text=True)
            return candidate
        except Exception:
            continue
    raise AssertionError("PowerShell executable not found for setup-env dry-run test")


def test_template_matches_contract_surface() -> None:
    assert env_keys(repo_root() / ".env.template") == set(contract_map())


def test_workflow_refs_are_documented() -> None:
    contract = contract_map()
    for name in workflow_refs(WORKFLOW_VAR_PATTERN):
        assert name in contract
        assert contract[name]["github_storage"] == "var"
    for name in workflow_refs(WORKFLOW_SECRET_PATTERN):
        assert name in contract
        assert contract[name]["github_storage"] == "secret"


def test_ui_repo_has_bootstrap_scripts_and_no_shared_provisioner() -> None:
    scripts_dir = repo_root() / "scripts"
    assert (scripts_dir / "setup-env.ps1").exists()
    assert (scripts_dir / "sync-all-to-github.ps1").exists()
    assert not (scripts_dir / "provision_azure.ps1").exists()


def test_ui_deploy_workflow_is_release_driven_and_uses_repo_var() -> None:
    text = workflow_text("deploy-prod.yml")
    assert "workflow_dispatch:\n    inputs:" not in text
    assert "repository_dispatch:" not in text
    assert "deploy_runtime" not in text
    assert "workflow_run:" in text
    assert "- UI Release" in text
    assert "branches:\n      - main" in text
    assert "actions: read" in text
    assert "vars.API_UPSTREAM" in text
    assert "actions/workflows/release.yml/runs?branch=main&per_page=20" in text
    assert "actions/runs/${{ steps.release-run.outputs.release_run_id }}/artifacts" in text


def test_ui_runtime_deploy_workflow_uses_repo_var_only() -> None:
    text = workflow_text("deploy-ui-runtime.yml")
    assert "workflow_call:" in text
    assert "image_digest:" in text
    assert "vars.API_UPSTREAM" in text
    assert "contracts_version" not in text


def test_ui_rollback_workflow_requires_only_image_digest() -> None:
    text = workflow_text("rollback-prod.yml")
    assert "workflow_dispatch:" in text
    assert "image_digest:" in text
    assert "api_upstream:" not in text
    assert "contracts_version:" not in text
    assert "uses: ./.github/workflows/deploy-ui-runtime.yml" in text


def test_setup_env_discovers_api_upstream_as_host_only() -> None:
    text = (repo_root() / "scripts" / "setup-env.ps1").read_text(encoding="utf-8")
    assert '$app.properties.configuration.ingress.fqdn' in text
    assert '"https://$($app.properties.configuration.ingress.fqdn)"' not in text


def test_ui_release_workflow_fails_fast_when_azure_repo_vars_are_missing() -> None:
    text = workflow_text("release.yml")
    assert "Verify required Azure repo vars" in text
    assert "Missing required UI release repo vars" in text
    assert "AZURE_CLIENT_ID AZURE_TENANT_ID AZURE_SUBSCRIPTION_ID ACR_NAME RESOURCE_GROUP" in text


def test_ui_release_workflow_publishes_release_manifest_artifact() -> None:
    text = workflow_text("release.yml")
    assert "name: ui-release" in text
    assert "path: artifacts/release-manifest.json" in text
    assert '"image_digest": os.environ["IMAGE_DIGEST"]' in text


def test_setup_env_dry_run_reports_sources_without_prompting() -> None:
    script = repo_root() / "scripts" / "setup-env.ps1"
    completed = subprocess.run(
        [powershell_exe(), "-NoProfile", "-File", str(script), "-DryRun"],
        cwd=repo_root(),
        check=True,
        capture_output=True,
        text=True,
    )
    stdout = completed.stdout
    assert "source=azure" in stdout or "source=default" in stdout or "source=git" in stdout
    assert "prompt_required=" in stdout
