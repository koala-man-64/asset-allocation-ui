# Asset Allocation UI

Standalone operator UI.

It consumes shared TypeScript contracts from the published `@asset-allocation/contracts` package.

`NPMRC` is a required GitHub secret and local prerequisite for any install that needs `@asset-allocation/contracts`. The secret value must be a complete `.npmrc` file with read access to the `@asset-allocation` scope, for example:

```text
@asset-allocation:registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=<read-token>
always-auth=true
```

`security.yml` does not install dependencies. It scans the committed `pnpm-lock.yaml` directly with OSV-Scanner and does not require `NPMRC`.

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
- `security.yml` runs lockfile-based dependency audits with OSV-Scanner.
- `release.yml` builds the UI image, writes `release-manifest.json`, and is the release artifact producer for prod deploys.
- `deploy-prod.yml` auto-deploys successful `UI Release` runs on `main` and can manually redeploy the latest successful main release.
- `rollback-prod.yml` deploys a specific prior UI image digest to prod.
- `deploy-ui-runtime.yml` is the reusable prod apply-and-verify workflow used by deploy and rollback entry points; it validates the UI-owned `/ui-config.js` bootstrap and the same-origin `/api/*` proxy contract after rollout.
- `contracts-compat.yml` validates the UI against a candidate or released contracts ref.
- `scripts/setup-env.ps1` builds repo-local `.env.web` and `.env.local` using Azure and git discovery where possible, and can ingest `NPMRC` from a file path.
- `scripts/sync-all-to-github.ps1` syncs the `.env.web` surface into repo vars and secrets.
- `DEPLOYMENT_SETUP.md` is the canonical deploy, operate, and rollback runbook.

## UI Shell

The control-plane pages share one admin shell vocabulary:

- `src/app/components/common/PageHero.tsx` defines the compact header grammar for kicker, title, subtitle, actions, and KPI rows.
- `src/app/components/common/StatCard.tsx` is the shared metric tile for admin pages.
- `src/app/components/common/StatePanel.tsx` standardizes loading-adjacent empty, info, and error messaging.
- `src/app/components/layout/LeftNavigation.tsx` is the single navigation shell and now sits on the sidebar primitives instead of a parallel custom layout stack.

Targeted verification for shell changes:

```powershell
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test --run
corepack pnpm build
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
python .codex/skills/code-drift-sentinel/scripts/codedrift_sentinel.py --mode audit --repo . --config .codedrift.yml
```

`format:check` is diff-scoped against `main` by default so legacy formatting debt outside the current change set does not block admin-shell work. Override the comparison ref with `FORMAT_BASE_REF` when needed.
