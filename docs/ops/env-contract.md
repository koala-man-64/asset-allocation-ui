# UI Env Contract

This repo treats `.env.web` as the sync surface for GitHub variables and secrets.

Flow:

1. Review `docs/ops/env-contract.csv`.
2. Run `powershell -ExecutionPolicy Bypass -File scripts/setup-env.ps1`.
3. Inspect the preview or generated `.env.web`.
4. Run `powershell -ExecutionPolicy Bypass -File scripts/sync-all-to-github.ps1`.

Rules:

- `scripts/setup-env.ps1` only walks keys documented in `env-contract.csv`.
- `scripts/setup-env.ps1` auto-populates from the current `.env.web` first, then explicit `-Set` overrides, then GitHub environment, repository, and organization variables via `gh`, then Azure discovery via `az`, before falling back to template defaults or prompts.
- Azure-backed identifiers are auto-discovered when `az` is installed and logged in.
- When `gh` is installed and authenticated, `scripts/setup-env.ps1` reads repository variables and the `prod` environment variables by default. Override that with `-GitHubEnvironment <name>` if needed.
- `API_UPSTREAM` is a first-class repo variable and falls back to the control-plane Container App FQDN when it can be discovered. Store the host only, without `https://`; the scheme is carried separately in `API_UPSTREAM_SCHEME`. `deploy-prod.yml`, `rollback-prod.yml`, and `deploy-ui-runtime.yml` read both values from repo vars only; there is no workflow input override.
- `API_UPSTREAM_SCHEME` is a first-class repo variable that controls how the UI proxy connects to `API_UPSTREAM`. Use `https` for the public ACA FQDN and `http` only for trusted internal upstreams that do not redirect.
- `UI_AUTH_ENABLED` is a first-class repo or environment variable consumed at UI container startup. It can still be disabled for local-only bypass scenarios.
- `UI_OIDC_AUTHORITY`, `UI_OIDC_CLIENT_ID`, and `UI_OIDC_SCOPES` are required repo variables whenever `UI_AUTH_ENABLED=true` in a deployed environment because `/ui-config.js` is now the only pre-main bootstrap surface.
- `UI_OIDC_AUDIENCE` is optional and is passed through to the runtime bootstrap when present.
- `UI_PUBLIC_HOSTNAME` is optional until custom-domain cutover. When set, `deploy-ui-runtime.yml` binds that hostname directly to the UI Container App, requests an ACA-managed certificate, and verifies the deployed UI through the stable public hostname.
- `NPMRC` is a required GitHub secret for CI build/test, release, Docker builds, and lockfile refreshes because `@asset-allocation/contracts` is installed from the published registry package. `security.yml` scans `pnpm-lock.yaml` directly with OSV-Scanner and does not require registry auth.
- `.env.web` is line-based, so multiline secret values such as `NPMRC` are stored with escaped `\n` and converted back to real newlines when `scripts/sync-all-to-github.ps1` publishes the secret.
- Shared Azure provisioning lives in the sibling `asset-allocation-control-plane` repo, not here.
