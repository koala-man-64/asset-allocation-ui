# UI Env Contract

This repo treats `.env.web` as the sync surface for GitHub variables.

Flow:

1. Review `docs/ops/env-contract.csv`.
2. Run `powershell -ExecutionPolicy Bypass -File scripts/setup-env.ps1`.
3. Inspect the preview or generated `.env.web`.
4. Run `powershell -ExecutionPolicy Bypass -File scripts/sync-all-to-github.ps1`.

Rules:

- `scripts/setup-env.ps1` only walks keys documented in `env-contract.csv`.
- Azure-backed identifiers are auto-discovered when `az` is installed and logged in.
- `API_UPSTREAM` is a first-class repo variable and falls back to the control-plane Container App FQDN when it can be discovered.
- Shared Azure provisioning lives in the sibling `asset-allocation-control-plane` repo, not here.
