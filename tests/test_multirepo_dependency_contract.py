from __future__ import annotations

import json
from pathlib import Path


def repo_root() -> Path:
    for candidate in Path(__file__).resolve().parents:
        if (candidate / "package.json").exists() and (
            candidate / ".github" / "workflows"
        ).is_dir():
            return candidate
    raise AssertionError("Could not resolve repository root from test path")


def contracts_version() -> str:
    package_json = json.loads(
        (repo_root() / "package.json").read_text(encoding="utf-8")
    )
    return package_json["dependencies"]["@asset-allocation/contracts"]


def workflow_text(name: str) -> str:
    return (repo_root() / ".github" / "workflows" / name).read_text(encoding="utf-8")


def test_package_json_uses_versioned_contracts_dependency() -> None:
    text = (repo_root() / "package.json").read_text(encoding="utf-8")
    assert f'"@asset-allocation/contracts": "{contracts_version()}"' in text
    assert "file:../asset-allocation-contracts/ts" not in text


def test_lockfile_uses_published_contracts_package() -> None:
    version = contracts_version()
    text = (repo_root() / "pnpm-lock.yaml").read_text(encoding="utf-8")
    assert f"specifier: {version}" in text
    assert f"version: {version}" in text
    assert f"@asset-allocation/contracts@{version}" in text
    assert "file:../asset-allocation-contracts/ts" not in text
    assert "directory: ../asset-allocation-contracts/ts" not in text


def test_broker_account_types_flow_through_published_contracts() -> None:
    text = (repo_root() / "src" / "types" / "brokerAccounts.ts").read_text(
        encoding="utf-8"
    )
    assert "from '@asset-allocation/contracts'" in text
    assert "BrokerAccountConfiguration" in text
    assert "BrokerTradingPolicyUpdateRequest" in text


def test_ui_dockerfile_does_not_copy_contracts_repo() -> None:
    text = (repo_root() / "Dockerfile").read_text(encoding="utf-8")
    assert "COPY asset-allocation-contracts/" not in text
    assert "required=true" in text
    assert "pnpm install --frozen-lockfile" in text


def test_ci_workflow_uses_registry_auth_without_contracts_checkout() -> None:
    text = workflow_text("ci.yml")
    assert "Checkout contracts repository" not in text
    assert "pnpm install --frozen-lockfile" in text
    assert "secrets.NPMRC" in text


def test_security_workflow_scans_lockfile_without_registry_auth() -> None:
    text = workflow_text("security.yml")
    assert "Checkout contracts repository" not in text
    assert "file:/workspace/asset-allocation-contracts/ts" not in text
    assert "file:../asset-allocation-contracts/ts" not in text
    assert "pnpm-lock.yaml" in text
    assert "OSV_SCANNER_VERSION" in text
    assert "secrets.NPMRC" not in text
    assert "pnpm install --frozen-lockfile" not in text


def test_release_workflow_uses_registry_auth_without_contracts_checkout() -> None:
    release_text = workflow_text("release.yml")
    assert "Checkout contracts repository" not in release_text
    assert '--secret "id=npmrc,src=${{ steps.npmrc.outputs.path }}"' in release_text
    assert "secrets.NPMRC" in release_text


def test_contracts_compat_workflow_is_the_only_checkout_exception() -> None:
    text = workflow_text("contracts-compat.yml")
    assert "Checkout contracts repository" in text
    assert "pnpm install --frozen-lockfile" in text
    assert "file:/workspace/asset-allocation-contracts/ts" in text
    assert "node --input-type=module -e" in text
    assert "compat_dir=/tmp/asset-allocation-ui-compat" in text
    assert "pnpm install --no-frozen-lockfile" in text
    assert "pnpm add --no-save /workspace/asset-allocation-contracts/ts" not in text
    assert "DISPATCH_CONTRACTS_VERSION" in text
    assert "pnpm install --lockfile-only --no-frozen-lockfile" in text
    assert "git push origin HEAD:${{ steps.contracts.outputs.ui_ref }}" in text
    assert text.index("Pin released contracts version") < text.index(
        "Run compatibility suite"
    )
