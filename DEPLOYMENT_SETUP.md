# Deployment Setup

## Recommendation

Yes. This repo should have its own deployment to the shared Azure resource group.

Target shape:

- one standalone Azure Container App for the UI
- same resource group: `AssetAllocationRG`
- same Container Apps environment: `asset-allocation-env`
- same ACR: `assetallocationacr`

Do not keep the UI permanently co-hosted inside the control-plane Container App. That defeats the repo split and couples release cadence back together.

## Current State

The UI workflow split is in place, but GitHub-side runtime configuration still has to be created.

- `.github/workflows/` now contains repo-local CI, security, release, deploy, and contracts-compat workflows
- `deploy/app_ui.yaml` defines a standalone `asset-allocation-ui` Container App
- the remaining work is outside source control: create the `prod` environment, repo variables/secrets, OIDC identity, and branch protections in GitHub

So the source-side split is implemented, but GitHub and Azure still need the runtime-side setup described below.

## Deploy

Use only these workflow entry points:

1. `.github/workflows/ci.yml`
2. `.github/workflows/security.yml`
3. `.github/workflows/release.yml`
4. `.github/workflows/deploy-prod.yml`
5. `.github/workflows/contracts-compat.yml`

`deploy-prod.yml` deploys only the standalone `asset-allocation-ui` Container App.

## Operate

- Build exactly one UI image digest with `release.yml`.
- Deploy that digest with `deploy-prod.yml`.
- Run `contracts-compat.yml` when `contracts_released` is dispatched or when validating a candidate contracts ref manually.
- Treat `API_UPSTREAM` as the source of truth for proxied `/config.js` and `/api/*` traffic.

## Shared Azure Foundation To Provision Once

Until infrastructure is moved into its own repo, use the bootstrap scripts from the original monorepo:

1. `powershell -ExecutionPolicy Bypass -File ..\\asset-allocation\\scripts\\provision_azure.ps1`
2. `powershell -ExecutionPolicy Bypass -File ..\\asset-allocation\\scripts\\provision_entra_oidc.ps1`
3. `powershell -ExecutionPolicy Bypass -File ..\\asset-allocation\\scripts\\validate_azure_permissions.ps1`

The UI reuses the shared runtime foundation:

- resource group `AssetAllocationRG`
- ACR `assetallocationacr`
- ACR pull identity `asset-allocation-acr-pull-mi`
- Container Apps environment `asset-allocation-env`
- service account `asset-allocation-sa`
- Entra app registration `asset-allocation-ui`
- Entra API application `asset-allocation-api`

The UI does not need its own storage account or Postgres database.

## Repo-Specific Inputs

GitHub secrets:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

GitHub variables:

- `RESOURCE_GROUP=AssetAllocationRG`
- `ACR_NAME=assetallocationacr`
- `ACR_PULL_IDENTITY_NAME=asset-allocation-acr-pull-mi`
- `SERVICE_ACCOUNT_NAME=asset-allocation-sa`
- `API_UPSTREAM=<reachable control-plane host>`

`API_UPSTREAM` must point to the control-plane host that serves `/config.js`, `/healthz`, `/readyz`, and `/api/*`.

## Deployment Steps

1. Publish the contracts repo first and pin the version consumed here.
2. Deploy the control-plane first. The UI depends on `/config.js` from the API.
3. Run the UI validation steps:
   - `corepack pnpm build`
   - `corepack pnpm vitest run`
4. Build the UI image from `Dockerfile`.
5. Deploy a standalone Container App, for example `asset-allocation-ui`, into `AssetAllocationRG`.
6. Set `API_UPSTREAM` so Nginx can proxy `/config.js` and `/api/*` to the control-plane.
7. Verify:
   - `/`
   - `/config.js`
   - `/api/healthz` if you expose that path through the proxy
   - browser sign-in flow against the Entra UI app registration

## Required GitHub Setup

This repo still needs GitHub configuration that cannot be created from files alone.

Add:

1. a `prod` environment with reviewer approval and self-review blocked
2. branch protection on `main` with required checks from `.github/workflows/ci.yml`
3. repo or org variables for Azure and runtime names
4. repo secrets for Azure OIDC login if they are not already inherited centrally

## Rollback

- Capture the previous `asset-allocation-ui` image digest before every deployment.
- Roll back by rerunning `.github/workflows/deploy-prod.yml` with that previous digest.
- If the issue is upstream API behavior rather than the UI image, point `API_UPSTREAM` back to the last known-good control-plane deployment instead of rebuilding the UI.

## Troubleshoot

- If `ci.yml` fails, verify the sibling contracts repo was checked out and that Docker or Node can resolve `../asset-allocation-contracts/ts`.
- If `release.yml` fails to build the image, verify Docker is building from the shared workspace root and that the contracts repo is present beside `asset-allocation-ui`.
- If `deploy-prod.yml` fails before apply, verify `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `RESOURCE_GROUP`, `ACR_NAME`, `CONTAINER_APPS_ENVIRONMENT_NAME`, and `API_UPSTREAM`.
- If `deploy-prod.yml` fails verification, inspect the public FQDN, `/`, and `/config.js`, then confirm the proxied control-plane host is reachable.

## Dependencies

- Sibling contracts repo for CI and release builds
- Control-plane host exposed via `API_UPSTREAM`
- Azure OIDC credentials in GitHub variables
- `prod` GitHub environment for deploy workflow
- Standalone `asset-allocation-ui` Container App in `AssetAllocationRG`

## Unverified / Needs Confirmation

- The exact hostname to use for `API_UPSTREAM` depends on how you expose the control-plane app in Azure Container Apps.
- If the API stays private, use the internal Container Apps address that is reachable from the UI app.
- If the API is public, you can point `API_UPSTREAM` at the control-plane public hostname, but that adds an external hop.

## Evidence

- `nginx.conf`
- `Dockerfile`
- `package.json`
- `src/config.ts`
- `..\\asset-allocation-control-plane\\.github\\workflows\\deploy.yml`
- `..\\asset-allocation-control-plane\\deploy\\app_api.yaml`
- `..\\asset-allocation\\scripts\\provision_entra_oidc.ps1`
