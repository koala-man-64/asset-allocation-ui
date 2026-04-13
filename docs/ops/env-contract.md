# UI Env Contract

This repo treats `.env.web` as the sync surface for GitHub variables and secrets.

Flow:

1. Review `docs/ops/env-contract.csv`.
2. Run `powershell -ExecutionPolicy Bypass -File scripts/setup-env.ps1`.
3. Inspect the preview or generated `.env.web`.
4. Run `powershell -ExecutionPolicy Bypass -File scripts/sync-all-to-github.ps1`.

Rules:

- `scripts/setup-env.ps1` only walks keys documented in `env-contract.csv`.
- Azure-backed identifiers are auto-discovered when `az` is installed and logged in.
- `API_UPSTREAM` is a first-class repo variable and falls back to the control-plane Container App FQDN when it can be discovered. Store the host only, without `https://`, because the UI nginx config prefixes the scheme itself.
- `NPMRC` is a required GitHub secret for CI, release, security, Docker builds, and lockfile refreshes because `@asset-allocation/contracts` is installed from the published registry package.
- `.env.web` is line-based, so multiline secret values such as `NPMRC` are stored with escaped `\n` and converted back to real newlines when `scripts/sync-all-to-github.ps1` publishes the secret.
- Shared Azure provisioning lives in the sibling `asset-allocation-control-plane` repo, not here.
