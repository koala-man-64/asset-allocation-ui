# Asset Allocation UI

Standalone operator UI.

It consumes shared TypeScript contracts from `../asset-allocation-contracts/ts` via a local file dependency.

Local verification:

```powershell
corepack pnpm install --no-frozen-lockfile
corepack pnpm build
corepack pnpm vitest run src\app\__tests__\App.auth.test.tsx src\contexts\__tests__\AuthContext.test.tsx
```

## Operations

Canonical workflows live under `.github/workflows/`.

- `ci.yml` is the required validation path for PRs and `main`.
- `security.yml` runs dependency audits.
- `release.yml` builds the UI image and writes `release-manifest.json`.
- `deploy-prod.yml` is the only workflow allowed to deploy the standalone `asset-allocation-ui` Container App.
- `contracts-compat.yml` validates the UI against a candidate or released contracts ref.
- `DEPLOYMENT_SETUP.md` is the canonical deploy/operate/rollback runbook.
