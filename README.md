# Asset Allocation UI

Standalone operator UI.

It consumes shared TypeScript contracts from the published `@asset-allocation/contracts` package.

`NPMRC` is a required GitHub secret and local prerequisite for any install that needs `@asset-allocation/contracts`. The secret value must be a complete `.npmrc` file with read access to the `@asset-allocation` scope, for example:

```text
@asset-allocation:registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=<read-token>
always-auth=true
```

Local verification:

```powershell
$env:NPM_CONFIG_USERCONFIG = "C:\path\to\ui.npmrc"
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm vitest run src\app\__tests__\App.auth.test.tsx src\contexts\__tests__\AuthContext.test.tsx
```

Lockfile refresh after a contracts version bump:

```powershell
$env:NPM_CONFIG_USERCONFIG = "C:\path\to\ui.npmrc"
corepack pnpm install --lockfile-only --no-frozen-lockfile
```

If `pnpm` returns `404` for `@asset-allocation/contracts`, treat that as missing or invalid registry auth, not an application bug.

## Operations

Canonical workflows live under `.github/workflows/`.

- `ci.yml` is the required validation path for PRs and `main`.
- `security.yml` runs dependency audits.
- `release.yml` builds the UI image and writes `release-manifest.json`.
- `deploy-prod.yml` is the only workflow allowed to deploy the standalone `asset-allocation-ui` Container App.
- `contracts-compat.yml` validates the UI against a candidate or released contracts ref.
- `scripts/setup-env.ps1` builds repo-local `.env.web` using Azure and git discovery where possible, and can ingest `NPMRC` from a file path.
- `scripts/sync-all-to-github.ps1` syncs the `.env.web` surface into repo vars and secrets.
- `DEPLOYMENT_SETUP.md` is the canonical deploy, operate, and rollback runbook.
