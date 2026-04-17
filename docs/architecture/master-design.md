# Asset Allocation UI Master Design

This document is the living architecture contract for `asset-allocation-ui`. It records the repo's intended role, runtime model, dependency boundaries, operational contract, and known drift as of April 6, 2026.

## Purpose and Role in the 5-Repo System

- Confirmed: This file is the canonical design and architecture reference for this repo and should be updated in the same change as any architecture-affecting work. Evidence: `docs/architecture/master-design.md`, `docs/architecture/original-monolith-and-five-repo-map.md`.
- Confirmed: This repo owns the standalone operator single-page application for the asset-allocation platform, not the backend control plane or batch runtimes. Evidence: `README.md`, `DEPLOYMENT_SETUP.md`, `deploy/app_ui.yaml`.
- Confirmed: In the five-repo split, this repo inherits the browser UI that previously lived in the monolith and now ships independently from the API and jobs repos. Evidence: `docs/architecture/original-monolith-and-five-repo-map.md`, `README.md`.
- Confirmed: Normal dependency flow is UI -> published `@asset-allocation/contracts` package -> control-plane `/config.js`, `/api/*`, realtime ticketing, health endpoints, and OIDC-backed access. Evidence: `package.json`, `src/config.ts`, `nginx.conf`, `src/hooks/useRealtime.ts`, `src/app/components/auth/OidcAccessGate.tsx`.
- Confirmed: This repo does not own backend state, shared Azure provisioning, or sibling-source contract coupling in normal install/build flows. Evidence: `DEPLOYMENT_SETUP.md`, `docs/ops/env-contract.md`, `tests/test_multirepo_dependency_contract.py`, `tests/test_env_contract.py`.
- Inferred: The intended long-term shape is a thin operator UI that presents and controls backend-owned state without re-owning backend business rules. Evidence: `src/services/apiService.ts`, `src/services/DataService.ts`, `src/app/components/auth/OidcAccessGate.tsx`, `docs/architecture/original-monolith-and-five-repo-map.md`.

## System Summary

- Confirmed: The UI is an operator console for monitoring system health, inspecting data assets, profiling datasets, browsing storage, managing runtime overrides, and editing strategy, universe, ranking, and symbol-control surfaces. Evidence: `src/app/routes.tsx`, `src/app/components/layout/LeftNavigation.tsx`, `src/features/*`.
- Confirmed: Primary users are operators and maintainers working on the asset-allocation platform, plus future engineers and agents using the repo as a standalone UI codebase. Evidence: `README.md`, `src/app/components/layout/LeftNavigation.tsx`, `docs/architecture/original-monolith-and-five-repo-map.md`.
- Confirmed: The UI is designed to run independently as a static SPA behind Nginx while preserving a single-origin browser experience through proxying to the control plane. Evidence: `Dockerfile`, `nginx.conf`, `deploy/app_ui.yaml`, `.github/workflows/deploy-prod.yml`.
- Unverified: Full end-to-end semantics for every upstream control-plane endpoint are owned and validated outside this repo; this repo primarily proves the client-side contract it consumes. Evidence: `src/services/apiService.ts`, `src/services/*Api.ts`, `README.md`.

## Architectural Boundaries

### External Dependencies

| Boundary | Responsibility | Confidence | Evidence |
| --- | --- | --- | --- |
| Published `@asset-allocation/contracts` package | Shared TypeScript contract and runtime config types used by the UI. | Confirmed | `package.json`, `src/config.ts`, `src/types/strategy.ts`, `tests/test_multirepo_dependency_contract.py` |
| Control-plane `/config.js` | Runtime UI config injection before React boot. | Confirmed | `index.html`, `src/config.ts`, `nginx.conf`, `DEPLOYMENT_SETUP.md` |
| Control-plane `/api/*` | Primary API surface for data, system health, runtime config, strategies, universes, rankings, purge, and explorer flows. | Confirmed | `src/services/apiService.ts`, `src/services/DataService.ts`, `src/services/strategyApi.ts`, `src/services/universeApi.ts`, `src/services/rankingApi.ts`, `src/services/backtestApi.ts` |
| Realtime ticketing and websocket updates | Authenticated ticket fetch plus websocket subscriptions used for cache invalidation and log/event streaming. | Confirmed | `src/hooks/useRealtime.ts`, `src/services/realtimeBus.ts`, `nginx.conf` |
| Azure and OIDC deployment vars and secrets | Drive standalone Container App deployment, NPM registry access, and browser auth behavior. | Confirmed | `docs/ops/env-contract.md`, `docs/ops/env-contract.csv`, `DEPLOYMENT_SETUP.md`, `.github/workflows/deploy-prod.yml`, `.github/workflows/deploy-ui-runtime.yml` |

### Internal Ownership

| Internal Layer | Intended Ownership | Confidence | Evidence |
| --- | --- | --- | --- |
| `src/app` | App bootstrap, router shell, global layout, auth gate entrypoints, reusable UI primitives. | Confirmed | `src/app/App.tsx`, `src/app/routes.tsx`, `src/app/components/auth/OidcAccessGate.tsx`, `src/app/components/ui/*` |
| `src/features/*` | Preferred route-facing feature layer for page-level behavior and domain composition. | Inferred | `src/app/routes.tsx`, `src/features/*`, `src/app/components/pages/*.tsx` re-export shims |
| `src/services/*` | Transport and backend interaction seams, including low-level HTTP, domain API wrappers, auth transport, realtime browser event bus, and Postgres catalog access. | Confirmed | `src/services/apiService.ts`, `src/services/DataService.ts`, `src/services/authTransport.ts`, `src/services/PostgresService.ts`, `src/services/*Api.ts` |
| `src/hooks/*` | Query orchestration, realtime integration, access to shared server-state views, and focused domain controllers. | Confirmed | `src/hooks/useDataQueries.ts`, `src/hooks/useRealtime.ts`, `src/hooks/useSystemStatusView.ts`, `src/features/symbol-purge/hooks/useSymbolPurgeController.ts` |
| `src/contexts/*` | Cross-cutting browser session concerns, specifically OIDC/MSAL initialization and token acquisition. | Confirmed | `src/contexts/AuthContext.tsx`, `src/app/components/auth/OidcAccessGate.tsx` |
| `src/app/components/ui/*` | Reusable presentation primitives shared across features. | Confirmed | `src/app/components/ui/*`, `package.json` |
| `src/app/components/pages/*` and related helpers | Transitional legacy implementation territory still referenced by tests and newer feature shells. | Drift | `src/app/components/pages/*.tsx`, `src/features/*`, `src/app/__tests__/*` |

### Explicit Non-Goals

- Confirmed: This repo is not the owner of control-plane state or server-side business rules. Evidence: `src/services/apiService.ts`, `src/services/DataService.ts`, `docs/architecture/original-monolith-and-five-repo-map.md`.
- Confirmed: This repo is not the home of shared Azure bootstrap or provisioning scripts. Evidence: `DEPLOYMENT_SETUP.md`, `docs/ops/env-contract.md`, `tests/test_env_contract.py`.
- Confirmed: This repo should not depend on sibling source checkouts for contracts during normal install, build, CI, security, release, or deploy flows. Evidence: `package.json`, `Dockerfile`, `.github/workflows/ci.yml`, `.github/workflows/security.yml`, `.github/workflows/release.yml`, `tests/test_multirepo_dependency_contract.py`.

## Runtime Architecture

1. Confirmed: `index.html` loads `/config.js` before `src/main.tsx`, making runtime config available before the React bundle starts. Evidence: `index.html`, `src/config.ts`, `nginx.conf`.
2. Confirmed: `src/main.tsx` creates the React root, wraps the app in `BrowserRouter`, and fails fast if `#root` is missing. Evidence: `src/main.tsx`.
3. Confirmed: `src/app/App.tsx` composes `AuthProvider`, `QueryProvider`, public `/auth/callback`, protected route shell, left navigation, route transition indicator, and toaster. Evidence: `src/app/App.tsx`.
4. Confirmed: `src/app/routes.tsx` lazy-loads route-level feature modules and redirects `/` to `/system-status`. Evidence: `src/app/routes.tsx`.
5. Confirmed: `src/config.ts` resolves `window.__API_UI_CONFIG__` plus env fallbacks into the normalized runtime config used everywhere else in the UI. Evidence: `src/config.ts`, `src/vite-env.d.ts`.
6. Confirmed: `src/contexts/AuthContext.tsx` owns MSAL setup, redirect handling, active-account selection, token acquisition, and registration of the shared access-token provider. Evidence: `src/contexts/AuthContext.tsx`, `src/services/authTransport.ts`.
7. Confirmed: `src/app/components/auth/OidcAccessGate.tsx` protects authenticated routes and uses `DataService.getSystemHealthWithMeta()` as the post-login access probe to verify API authorization. Evidence: `src/app/components/auth/OidcAccessGate.tsx`, `src/services/DataService.ts`.
8. Confirmed: `src/services/apiService.ts` is the canonical low-level HTTP transport. It centralizes request URL building, request IDs, warm-up calls to `/healthz`, retryable failure handling, timeout support, and typed `ApiError` responses. Evidence: `src/services/apiService.ts`, `src/services/__tests__/apiService.test.ts`.
9. Confirmed: `src/providers/QueryProvider.tsx` defines repo-wide React Query defaults, and route features consume server data through query hooks and service wrappers layered on top of that client. Evidence: `src/providers/QueryProvider.tsx`, `src/hooks/useDataQueries.ts`, `src/hooks/useSystemStatusView.ts`.
10. Confirmed: `src/hooks/useRealtime.ts` fetches a realtime ticket over HTTP, opens a websocket connection, manages topic subscriptions, reconnects on failure, invalidates relevant query keys, and emits browser events for console log streaming. Evidence: `src/hooks/useRealtime.ts`, `src/services/realtimeBus.ts`, `src/hooks/useRealtime.test.tsx`.
11. Confirmed: `nginx.conf` serves the built SPA and proxies `/config.js`, `/healthz`, `/readyz`, `/api/*`, and websocket traffic to `API_UPSTREAM` using `API_UPSTREAM_SCHEME` to preserve a single browser origin without leaking redirects cross-origin. Evidence: `nginx.conf`, `DEPLOYMENT_SETUP.md`.
12. Confirmed: `Dockerfile` builds the static bundle with a secret-mounted npmrc, then packages the result into an Nginx image. Evidence: `Dockerfile`, `.github/workflows/release.yml`.
13. Confirmed: `deploy/app_ui.yaml`, `.github/workflows/deploy-ui-runtime.yml`, `.github/workflows/deploy-prod.yml`, and `.github/workflows/rollback-prod.yml` define a standalone Azure Container App deployment with ingress, probes, repo-var-driven `API_UPSTREAM` plus `API_UPSTREAM_SCHEME`, release artifact handoff, and digest-based rollback flow. Evidence: `deploy/app_ui.yaml`, `.github/workflows/deploy-ui-runtime.yml`, `.github/workflows/deploy-prod.yml`, `.github/workflows/rollback-prod.yml`, `DEPLOYMENT_SETUP.md`.
14. Inferred: The backend remains the authoritative source of truth; client persistence exists only for UX acceleration and session continuity. Evidence: `src/stores/useUIStore.ts`, `src/contexts/AuthContext.tsx`, `src/hooks/useSystemStatusView.ts`.

## Feature Surface

| Route | Functional Purpose | Primary Backend Dependency | Key Source Files | Confidence |
| --- | --- | --- | --- | --- |
| `/auth/callback` | Complete OIDC redirect flow and restore the post-login route. | OIDC session state and control-plane-backed access verification path. | `src/app/components/auth/OidcAccessGate.tsx`, `src/contexts/AuthContext.tsx` | Confirmed |
| `/system-status` | Monitor system health, container apps, jobs, recent runs, metadata snapshots, and log streams. | Control-plane system status, job control, container app, metadata snapshot, and realtime endpoints. | `src/features/system-status/SystemStatusPage.tsx`, `src/hooks/useSystemStatusView.ts`, `src/features/system-status/domain-layer-comparison/DomainLayerComparisonPanel.tsx` | Confirmed |
| `/data-quality` | Inspect layer freshness, lineage impact, probes, and storage usage. | System health, lineage, storage usage, and probe-related data endpoints. | `src/features/data-quality/DataQualityPage.tsx`, `src/hooks/useDataQueries.ts`, `src/hooks/useDataProbes.ts` | Confirmed |
| `/data-explorer` | Browse ADLS tree structures and preview files. | ADLS tree and file preview endpoints via `DataService`. | `src/features/data-explorer/DataExplorerPage.tsx`, `src/services/DataService.ts` | Confirmed |
| `/data-profiling` | Profile columns and inspect distribution-level dataset metadata. | Data profiling endpoints via `DataService`. | `src/features/data-profiling/DataProfilingPage.tsx`, `src/services/DataService.ts` | Confirmed |
| `/stock-explorer` | Run the stock screener and navigate into detailed symbol views. | Stock screener endpoints via `DataService`. | `src/features/stocks/StockExplorerPage.tsx`, `src/services/DataService.ts` | Confirmed |
| `/stock-detail/:ticker?` | Inspect market and finance details for a selected symbol. | Market and finance data endpoints via `DataService`. | `src/features/stocks/StockDetailPage.tsx`, `src/services/DataService.ts` | Confirmed |
| `/regimes` | Review and edit regime configuration and related operator controls. | Regime endpoints via `regimeApi`. | `src/features/regimes/RegimeMonitorPage.tsx`, `src/services/regimeApi.ts` | Confirmed |
| `/debug-symbols` | Manage debug symbol overrides used by backend runtime flows. | Debug symbol endpoints via `DataService` and query hooks. | `src/features/debug-symbols/DebugSymbolsPage.tsx`, `src/hooks/useDataQueries.ts`, `src/services/DataService.ts` | Confirmed |
| `/runtime-config` | View and manage DB-backed runtime overrides. | Runtime config catalog and value endpoints via `DataService`. | `src/features/runtime-config/RuntimeConfigPage.tsx`, `src/hooks/useDataQueries.ts`, `src/services/DataService.ts` | Confirmed |
| `/symbol-purge` | Preview, execute, and monitor symbol purge operations. | Purge candidate, purge execution, domain column, and operation-status endpoints via `DataService`. | `src/features/symbol-purge/SymbolPurgeByCriteriaPage.tsx`, `src/features/symbol-purge/hooks/useSymbolPurgeController.ts`, `src/services/DataService.ts` | Confirmed |
| `/strategies` | List, edit, delete, and submit run configurations/backtests. | Strategy and backtest endpoints via `strategyApi` and `backtestApi`. | `src/features/strategies/StrategyConfigPage.tsx`, `src/services/strategyApi.ts`, `src/services/backtestApi.ts` | Confirmed |
| `/universes` | Edit reusable universe definitions and publish versioned configs. | Universe config endpoints via `universeApi`. | `src/features/universes/UniverseConfigPage.tsx`, `src/services/universeApi.ts` | Confirmed |
| `/rankings` | Manage ranking schemas linked to strategies and universes. | Ranking, strategy, and universe endpoints. | `src/features/rankings/RankingConfigPage.tsx`, `src/services/rankingApi.ts`, `src/services/strategyApi.ts`, `src/services/universeApi.ts` | Confirmed |
| `/strategy-exploration` | Explore medallion layers, domain coverage, Postgres catalogs, and per-column contracts. | System status view plus Postgres catalog/metadata endpoints. | `src/features/strategy-exploration/StrategyDataCatalogPage.tsx`, `src/features/strategy-exploration/hooks/useStrategyDataCatalog.ts`, `src/services/PostgresService.ts` | Confirmed |
| `/postgres-explorer` | Inspect Postgres schemas and tables directly. | Postgres schema, table, and metadata endpoints via `PostgresService`. | `src/features/postgres-explorer/PostgresExplorerPage.tsx`, `src/services/PostgresService.ts` | Confirmed |

## Contracts and Invariants

- Confirmed: Use the published `@asset-allocation/contracts` package in normal flows; do not replace it with a sibling `file:` dependency except in the dedicated compatibility workflow. Evidence: `package.json`, `pnpm-lock.yaml`, `.github/workflows/contracts-compat.yml`, `tests/test_multirepo_dependency_contract.py`.
- Confirmed: Runtime config is injected at runtime through `/config.js` and `window.__API_UI_CONFIG__`, not baked into the SPA bundle. Evidence: `index.html`, `src/config.ts`, `nginx.conf`, `DEPLOYMENT_SETUP.md`.
- Confirmed: Nginx single-origin proxying for `/config.js`, `/healthz`, `/readyz`, `/api/*`, and websocket traffic is part of the design contract. Evidence: `nginx.conf`, `DEPLOYMENT_SETUP.md`, `deploy/app_ui.yaml`.
- Confirmed: Browser auth and bearer-token handling stay centralized in `src/contexts/AuthContext.tsx` and `src/services/authTransport.ts`. Evidence: `src/contexts/AuthContext.tsx`, `src/services/authTransport.ts`, `src/contexts/__tests__/AuthContext.test.tsx`.
- Confirmed: `src/services/apiService.ts` is the canonical low-level HTTP transport and must remain the single place where warm-up, retry, timeout, request ID, and typed error behavior live unless replaced repo-wide. Evidence: `src/services/apiService.ts`, `src/services/__tests__/apiService.test.ts`.
- Confirmed: React Query is the canonical server-state and cache layer for this repo. Evidence: `src/providers/QueryProvider.tsx`, `src/hooks/useDataQueries.ts`, `src/hooks/useSystemStatusView.ts`, `package.json`.
- Confirmed: Realtime is used for invalidation and event/log streaming, not as the primary owner of business state. Evidence: `src/hooks/useRealtime.ts`, `src/services/realtimeBus.ts`, `src/hooks/useRealtime.test.tsx`.
- Confirmed: Backend state remains authoritative; browser persistence is only a UX optimization for settings, session continuity, or cached views. Evidence: `src/stores/useUIStore.ts`, `src/contexts/AuthContext.tsx`, `src/hooks/useSystemStatusView.ts`.
- Inferred: New route-facing work should move toward `src/features/*` ownership and should not deepen the legacy `src/app/components/pages/*` tree unless the work is explicitly a compatibility step. Evidence: `src/app/routes.tsx`, `src/features/*`, `src/app/components/pages/*.tsx`.
- Inferred: New server-backed behavior should extend existing seams (`AuthContext`, `authTransport`, `apiService`, `DataService`, query hooks, realtime hooks) rather than introduce feature-local `fetch`, feature-local token logic, or an additional global server-state library. Evidence: `src/contexts/AuthContext.tsx`, `src/services/authTransport.ts`, `src/services/apiService.ts`, `src/services/DataService.ts`, `src/providers/QueryProvider.tsx`, `src/hooks/useRealtime.ts`.
- Unverified: Full upstream API response semantics and sibling-repo release compatibility beyond the checked client contract are validated outside this repo. Evidence: `src/services/*Api.ts`, `README.md`, `docs/architecture/original-monolith-and-five-repo-map.md`.

## Operational Model

### Workflow Contract

| Workflow | Operational Role | Confidence | Evidence |
| --- | --- | --- | --- |
| `ci.yml` | Required validation path for PRs and `main`; runs actionlint, Python contract tests, focused TS tests, and build. | Confirmed | `.github/workflows/ci.yml`, `README.md` |
| `security.yml` | Dependency audit path for the UI repo, including scheduled weekly OSV lockfile scans. | Confirmed | `.github/workflows/security.yml`, `README.md` |
| `release.yml` | Builds and pushes the UI image and writes `release-manifest.json`, which becomes the deploy handoff artifact. | Confirmed | `.github/workflows/release.yml`, `README.md` |
| `deploy-prod.yml` | Release-driven production deploy entry point; auto-deploys successful `UI Release` runs on `main` and manually redeploys the latest successful main release. | Confirmed | `.github/workflows/deploy-prod.yml`, `README.md`, `DEPLOYMENT_SETUP.md` |
| `rollback-prod.yml` | Manual production rollback entry point for deploying a specific prior UI image digest. | Confirmed | `.github/workflows/rollback-prod.yml`, `README.md`, `DEPLOYMENT_SETUP.md` |
| `deploy-ui-runtime.yml` | Reusable deploy implementation that applies the UI manifest and verifies `/` plus `/config.js` after rollout. | Confirmed | `.github/workflows/deploy-ui-runtime.yml`, `DEPLOYMENT_SETUP.md` |
| `contracts-compat.yml` | Explicit exception path for validating the UI against a candidate or freshly released contracts ref. | Confirmed | `.github/workflows/contracts-compat.yml`, `README.md`, `tests/test_multirepo_dependency_contract.py` |

### Runtime and Deploy Contract

- Confirmed: The UI deploys as a standalone Azure Container App with ingress, probes, and a single UI container serving Nginx. Evidence: `deploy/app_ui.yaml`, `DEPLOYMENT_SETUP.md`.
- Confirmed: `API_UPSTREAM` and `API_UPSTREAM_SCHEME` are first-class deployment contract values used for proxied `/config.js`, `/healthz`, `/readyz`, and `/api/*` traffic, and the prod workflows read them from repo vars. Evidence: `nginx.conf`, `.github/workflows/deploy-prod.yml`, `.github/workflows/deploy-ui-runtime.yml`, `.github/workflows/rollback-prod.yml`, `docs/ops/env-contract.md`, `DEPLOYMENT_SETUP.md`.
- Confirmed: `NPMRC` is a first-class install, build, CI, and release contract because the UI consumes the published contracts package from the registry, while `security.yml` scans the committed lockfile directly without registry auth. Evidence: `README.md`, `Dockerfile`, `.github/workflows/ci.yml`, `.github/workflows/security.yml`, `.github/workflows/release.yml`, `docs/ops/env-contract.md`.
- Confirmed: Shared Azure bootstrap stays in the sibling `asset-allocation-control-plane` repo, not here. Evidence: `DEPLOYMENT_SETUP.md`, `docs/ops/env-contract.md`, `tests/test_env_contract.py`.
- Confirmed: Rollout is release-driven from `release-manifest.json`, and rollback is digest-based through a dedicated manual workflow while `API_UPSTREAM` and `API_UPSTREAM_SCHEME` remain repo-var driven for upstream recovery scenarios. Evidence: `DEPLOYMENT_SETUP.md`, `.github/workflows/release.yml`, `.github/workflows/deploy-prod.yml`, `.github/workflows/deploy-ui-runtime.yml`, `.github/workflows/rollback-prod.yml`.
- Unverified: Full Azure subscription correctness and cross-repo provisioning state are outside the evidence boundary of this repo. Evidence: `DEPLOYMENT_SETUP.md`, `docs/ops/env-contract.md`.

## Evidence Map

| Claim | Evidence Files | Confidence | Validation Source |
| --- | --- | --- | --- |
| The repo ships a standalone operator UI, not a co-hosted backend. | `README.md`, `DEPLOYMENT_SETUP.md`, `deploy/app_ui.yaml` | Confirmed | `ci.yml` build path, `deploy-prod.yml` |
| Normal installs and releases consume a published contracts package rather than a sibling checkout. | `package.json`, `pnpm-lock.yaml`, `Dockerfile`, `.github/workflows/ci.yml`, `.github/workflows/release.yml` | Confirmed | `tests/test_multirepo_dependency_contract.py` |
| Runtime config is injected by `/config.js` before the React bundle starts. | `index.html`, `src/config.ts`, `nginx.conf` | Confirmed | `deploy-ui-runtime.yml` verifies `/config.js` |
| Auth/session and bearer token injection are centralized. | `src/contexts/AuthContext.tsx`, `src/services/authTransport.ts`, `src/app/components/auth/OidcAccessGate.tsx` | Confirmed | `src/contexts/__tests__/AuthContext.test.tsx`, `src/app/__tests__/App.auth.test.tsx` |
| Shared HTTP transport owns warm-up, retry, request IDs, and typed errors. | `src/services/apiService.ts` | Confirmed | `src/services/__tests__/apiService.test.ts` |
| React Query is the canonical server-state/cache layer. | `src/providers/QueryProvider.tsx`, `src/hooks/useDataQueries.ts`, `src/hooks/useSystemStatusView.ts` | Confirmed | `ci.yml` TS and Vitest path |
| Realtime is used for invalidation and log/event streaming. | `src/hooks/useRealtime.ts`, `src/services/realtimeBus.ts` | Confirmed | `src/hooks/useRealtime.test.tsx` |
| Nginx preserves a single-origin browser experience by proxying config, health, API, and websocket traffic. | `nginx.conf`, `DEPLOYMENT_SETUP.md` | Confirmed | `deploy-ui-runtime.yml` |
| Shared Azure provisioning lives outside this repo. | `DEPLOYMENT_SETUP.md`, `docs/ops/env-contract.md` | Confirmed | `tests/test_env_contract.py` |
| The route surface is feature-oriented even though transitional legacy page modules remain. | `src/app/routes.tsx`, `src/features/*`, `src/app/components/pages/*.tsx` | Inferred | `ci.yml` build path |

## Known Drift and Transitional Structure

| Status | Area | Observed Current State | Intended Design | Risk | Next Cleanup Trigger |
| --- | --- | --- | --- | --- | --- |
| Drift | Route layer vs. legacy page tree | `src/app/routes.tsx` lazy-loads `src/features/*`, but many feature shells still compose helpers, panels, and editors from `src/app/components/pages/*`. | New route-facing logic should live in `src/features/*`, with legacy page modules shrinking over time. | Confused ownership and duplicated extension points. | Any PR that adds a new page or restructures route composition. |
| Drift | Tests still rely on legacy import shims | Many tests import `src/app/components/pages/*` re-export shims instead of direct `src/features/*` entrypoints. | Tests should eventually target stable feature entrypoints or intentionally named compatibility shims. | Legacy paths stay sticky even after route migration. | Any test refactor or page migration touching route-level files. |
| Drift | Shared helpers remain buried in page paths | Feature files still import helpers from legacy page folders such as `system-status`, `data-quality`, and `strategy-editor`. | Shared non-visual logic should live in `src/features/<domain>/...` or clearly neutral shared modules. | Cross-domain helpers remain hard to discover and easy to duplicate. | Any edit to these helpers or introduction of new shared logic. |
| Drift | Type ownership seam is mixed | `src/types/strategy.ts` re-exports shared contract types while also declaring UI-local models and backend-shaped view data. | Shared business schemas should come from `@asset-allocation/contracts`; UI-local view models should stay clearly local and separate. | Shape drift and unclear ownership for future schema changes. | Any change that adds or modifies domain types or contracts usage. |

## Update Protocol for Future Agents

- Confirmed: Update this document in the same change whenever work affects route ownership, runtime config/bootstrap, auth flow, API transport, realtime behavior, env contract surface, deploy topology, workflow responsibilities, or contracts package usage. Evidence: `src/app/routes.tsx`, `src/config.ts`, `src/contexts/AuthContext.tsx`, `src/services/apiService.ts`, `src/hooks/useRealtime.ts`, `docs/ops/env-contract.csv`, `.github/workflows/*`, `package.json`.
- Confirmed: Do not change a `Confirmed` claim without also updating its evidence pointer. Evidence: `docs/architecture/master-design.md`.
- Confirmed: Do not silently delete a drift item; either keep it listed or resolve it with direct evidence in the same update. Evidence: `docs/architecture/master-design.md`.
- Confirmed: Mark unresolved statements as `Unverified` rather than folding them into normal prose. Evidence: `docs/architecture/master-design.md`.
- Confirmed: If an invariant changes, add a dated migration note to the change log section below. Evidence: `docs/architecture/master-design.md`.

### Required Source-of-Truth Re-Read

Before editing an affected section, re-check these files at minimum:

- `README.md`
- `DEPLOYMENT_SETUP.md`
- `docs/architecture/original-monolith-and-five-repo-map.md`
- `docs/ops/env-contract.md`
- `package.json`
- `src/main.tsx`
- `src/app/App.tsx`
- `src/app/routes.tsx`
- `src/config.ts`
- `src/contexts/AuthContext.tsx`
- `src/services/authTransport.ts`
- `src/services/apiService.ts`
- `src/hooks/useRealtime.ts`
- `nginx.conf`
- `deploy/app_ui.yaml`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy-prod.yml`

### Required Validation Commands

Run these commands after revising architecture-affecting content:

```powershell
python -m pytest tests/test_env_contract.py tests/test_multirepo_dependency_contract.py -q
corepack pnpm vitest run src/app/__tests__/App.auth.test.tsx src/contexts/__tests__/AuthContext.test.tsx src/services/__tests__/apiService.test.ts src/hooks/useRealtime.test.tsx
```

Run this additional command whenever the edited section describes build or deploy behavior:

```powershell
corepack pnpm build
```

### Document Change Log

| Date | Change | Why | Evidence Refreshed |
| --- | --- | --- | --- |
| 2026-04-15 | Updated the workflow contract for lockfile-only OSV security scans. | Align the architecture contract with the `security.yml` migration away from `pnpm audit` and registry-auth-dependent installs. | `README.md`, `docs/ops/env-contract.md`, `.github/workflows/security.yml`, `tests/test_multirepo_dependency_contract.py` |
| 2026-04-06 | Initial creation of the master design document. | Establish a living architecture contract for future agents and maintainers. | `README.md`, `DEPLOYMENT_SETUP.md`, `docs/architecture/original-monolith-and-five-repo-map.md`, `docs/ops/env-contract.md`, `src/main.tsx`, `src/app/App.tsx`, `src/app/routes.tsx`, `src/config.ts`, `src/contexts/AuthContext.tsx`, `src/services/authTransport.ts`, `src/services/apiService.ts`, `src/hooks/useRealtime.ts`, `nginx.conf`, `deploy/app_ui.yaml`, `.github/workflows/ci.yml`, `.github/workflows/deploy-prod.yml` |

## Review Provenance

This section describes how this document was produced. It is provenance for this revision, not a runtime architecture claim.

- Confirmed: The reliability, deployment, security, and operability framing in this document was reviewed through the `$architecture-review-agent` lens.
- Confirmed: The plain-language system role, five-repo context, and end-to-end runtime explanation were shaped by the `application-project-analyst-technical-explainer` lens.
- Confirmed: The fixed section order, evidence-tag model, and update protocol were shaped by the `technical-writer-dev-advocate` lens.
- Confirmed: The boundary guardrails, anti-drift rules, and transitional ownership notes were shaped by the `maintainability-steward` lens.
- Confirmed: The validation commands, confidence boundary, and trustworthiness rules were shaped by the `software-testing-validation-architect` lens.
