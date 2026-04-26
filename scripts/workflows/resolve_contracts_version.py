from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


SEMVER_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
COMPARATOR_RE = re.compile(r"^(<=|>=|==|=|<|>)(\d+\.\d+\.\d+)$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Resolve a published contracts version from the UI package range.")
    parser.add_argument("--package-json", required=True, help="Path to UI package.json.")
    parser.add_argument("--versions-json", required=True, help="Path to npm view versions JSON payload.")
    parser.add_argument("--override", default="", help="Optional exact published version override.")
    return parser.parse_args()


def parse_version(version_text: str) -> tuple[int, int, int]:
    match = SEMVER_RE.match(version_text)
    if not match:
        raise ValueError(f"Unsupported contracts version '{version_text}'. Expected stable semver X.Y.Z.")
    return tuple(int(part) for part in match.groups())


def load_package_contracts_spec(package_json_path: Path) -> tuple[str, str]:
    package_json = json.loads(package_json_path.read_text(encoding="utf-8"))
    return package_json["version"], package_json["dependencies"]["@asset-allocation/contracts"]


def load_published_versions(versions_json_path: Path) -> list[str]:
    payload = json.loads(versions_json_path.read_text(encoding="utf-8"))
    if isinstance(payload, str):
        payload = [payload]
    if not isinstance(payload, list) or not all(isinstance(item, str) for item in payload):
        raise ValueError("Expected npm versions payload to be a JSON string or list of strings.")
    return payload


def parse_specifiers(spec: str) -> list[tuple[str, tuple[int, int, int]]]:
    if any(token in spec for token in ("^", "~", "*", "||")):
        raise ValueError(f"Unsupported npm range '{spec}'. Use comparator ranges such as '>=1.1.0 <2.0.0'.")

    comparators: list[tuple[str, tuple[int, int, int]]] = []
    for token in spec.split():
        match = COMPARATOR_RE.match(token)
        if not match:
            raise ValueError(f"Unsupported range token '{token}' in '{spec}'.")
        comparators.append((match.group(1), parse_version(match.group(2))))

    if not comparators:
        raise ValueError("Contracts dependency range must not be empty.")
    return comparators


def version_satisfies(version: tuple[int, int, int], specifiers: list[tuple[str, tuple[int, int, int]]]) -> bool:
    for operator, target in specifiers:
        if operator == ">=" and not (version >= target):
            return False
        if operator == ">" and not (version > target):
            return False
        if operator == "<=" and not (version <= target):
            return False
        if operator == "<" and not (version < target):
            return False
        if operator in ("=", "==") and version != target:
            return False
    return True


def resolve_version(spec: str, published_versions: list[str], override: str = "") -> str:
    specifiers = parse_specifiers(spec)
    stable_versions = sorted(
        {parse_version(version): version for version in published_versions if SEMVER_RE.match(version)}.items(),
        reverse=True,
    )
    if not stable_versions:
        raise ValueError("No published stable contracts versions were returned by npm.")

    if override:
        override_tuple = parse_version(override)
        if override not in {version for _, version in stable_versions}:
            raise ValueError(f"Override contracts version '{override}' is not published.")
        if not version_satisfies(override_tuple, specifiers):
            raise ValueError(f"Override contracts version '{override}' does not satisfy '{spec}'.")
        return override

    for version_tuple, version_text in stable_versions:
        if version_satisfies(version_tuple, specifiers):
            return version_text

    raise ValueError(f"No published contracts version satisfies '{spec}'.")


def main() -> int:
    args = parse_args()
    ui_version, contracts_spec = load_package_contracts_spec(Path(args.package_json))
    published_versions = load_published_versions(Path(args.versions_json))
    resolved_contracts_version = resolve_version(contracts_spec, published_versions, args.override.strip())
    print(f"contracts_spec={contracts_spec}")
    print(f"contracts_version={resolved_contracts_version}")
    print(f"ui_version={ui_version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
