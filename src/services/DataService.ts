import type { FinanceData, MarketData } from '@/types/data';
import type { DomainMetadata, SystemHealth } from '@/types/strategy';
import type {
  AdlsFilePreviewResponse,
  AdlsTreeResponse,
  AuthSessionStatus,
  ContainerAppLogsResponse,
  ContainerAppControlResponse,
  ContainerAppsStatusResponse,
  DomainCheckpointResetRequest,
  DomainCheckpointResetResponse,
  DomainListResetRequest,
  DomainListResetResponse,
  DomainListsResponse,
  DomainMetadataSnapshotResponse,
  DomainColumnsResponse,
  DebugSymbolsResponse,
  JobLogsResponse,
  PurgeCandidatesRequest,
  PurgeBlacklistSymbolsResponse,
  PurgeRequest,
  PurgeOperationResponse,
  ResponseWithMeta,
  RuntimeConfigCatalogResponse,
  RuntimeConfigItem,
  RuntimeConfigListResponse,
  PurgeCandidatesResponse,
  SystemStatusViewResponse,
  ValidationReport,
  SymbolSyncState,
  DataProfilingResponse,
  StorageUsageResponse
} from '@/services/apiService';
import type { StockScreenerResponse } from '@/services/apiService';
import { ApiError, apiService } from '@/services/apiService';
import { logUiDiagnostic } from '@/services/uiDiagnostics';

export type { FinanceData, MarketData };

const SUPPRESSED_SESSION_AUTH_MESSAGE =
  'Interactive sign-in was suppressed because /auth/session succeeded recently';

function isKnownSystemStatusFallbackError(error: unknown): boolean {
  if (!(error instanceof ApiError)) {
    return false;
  }

  if (error.status === 404) {
    return true;
  }

  return error.status === 401 && error.message.includes(SUPPRESSED_SESSION_AUTH_MESSAGE);
}

async function shouldUseSystemStatusFallback(error: unknown): Promise<boolean> {
  if (isKnownSystemStatusFallbackError(error)) {
    return true;
  }

  if (!(error instanceof ApiError) || error.status !== 401) {
    return false;
  }

  try {
    const session = await apiService.getAuthSessionStatusWithMeta();
    logUiDiagnostic(
      'DataService',
      'system-status-view-401-session-still-valid',
      {
        requestId: session.meta.requestId,
        authMode: session.data.authMode,
        grantedRoles: session.data.grantedRoles
      },
      'warn'
    );
    return true;
  } catch (sessionError) {
    logUiDiagnostic(
      'DataService',
      'system-status-view-401-session-check-failed',
      {
        statusViewError: error.message,
        sessionError: sessionError instanceof Error ? sessionError.message : String(sessionError)
      },
      'warn'
    );
    return false;
  }
}

function buildEmptyMetadataSnapshot(error: unknown): DomainMetadataSnapshotResponse {
  const errorMessage = error instanceof Error ? error.message : String(error ?? 'Unknown error');

  logUiDiagnostic(
    'DataService',
    'system-status-fallback-metadata-unavailable',
    { error: errorMessage },
    'warn'
  );

  return {
    version: 1,
    updatedAt: null,
    entries: {},
    warnings: [
      'Metadata snapshot is unavailable; showing system health without cached cell counts.'
    ]
  };
}

async function buildFallbackSystemStatusView(
  params: { refresh?: boolean },
  cause: unknown,
  signal?: AbortSignal
): Promise<SystemStatusViewResponse> {
  logUiDiagnostic(
    'DataService',
    'system-status-view-fallback-start',
    { error: cause instanceof Error ? cause.message : String(cause ?? 'Unknown error') },
    'warn'
  );

  const [systemHealth, metadataSnapshot] = await Promise.all([
    apiService.getSystemHealth(params, signal),
    apiService.getDomainMetadataSnapshot(params, signal).catch(buildEmptyMetadataSnapshot)
  ]);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    systemHealth,
    metadataSnapshot,
    sources: {
      systemHealth: params.refresh ? 'live-refresh' : 'cache',
      metadataSnapshot: 'persisted-snapshot'
    }
  };
}

export const DataService = {
  getMarketData(
    ticker: string,
    layer: 'silver' | 'gold' = 'silver',
    signal?: AbortSignal
  ): Promise<MarketData[]> {
    return apiService.getMarketData(ticker, layer, signal);
  },

  getFinanceData(
    ticker: string,
    subDomain: string,
    layer: 'silver' | 'gold' = 'silver',
    signal?: AbortSignal
  ): Promise<FinanceData[]> {
    return apiService.getFinanceData(ticker, subDomain, layer, signal);
  },

  async getSystemHealth(
    params: { refresh?: boolean } = {},
    signal?: AbortSignal
  ): Promise<SystemHealth> {
    try {
      const data = await apiService.getSystemHealth(params, signal);
      return data;
    } catch (error) {
      console.error('[DataService] getSystemHealth error', error);
      throw error;
    }
  },

  async getSystemHealthWithMeta(
    params: { refresh?: boolean } = {},
    signal?: AbortSignal
  ): Promise<ResponseWithMeta<SystemHealth>> {
    try {
      const response = await apiService.getSystemHealthWithMeta(params, signal);
      return response;
    } catch (error) {
      console.error('[DataService] getSystemHealthWithMeta error', error);
      throw error;
    }
  },

  async getAuthSessionStatusWithMeta(): Promise<ResponseWithMeta<AuthSessionStatus>> {
    try {
      const response = await apiService.getAuthSessionStatusWithMeta();
      return response;
    } catch (error) {
      console.error('[DataService] getAuthSessionStatusWithMeta error', error);
      throw error;
    }
  },

  async createPasswordAuthSession(password: string): Promise<ResponseWithMeta<AuthSessionStatus>> {
    try {
      const response = await apiService.createPasswordAuthSession(password);
      return response;
    } catch (error) {
      console.error('[DataService] createPasswordAuthSession error', error);
      throw error;
    }
  },

  async createOidcAuthSession(accessToken: string): Promise<ResponseWithMeta<AuthSessionStatus>> {
    try {
      const response = await apiService.createOidcAuthSession(accessToken);
      return response;
    } catch (error) {
      console.error('[DataService] createOidcAuthSession error', error);
      throw error;
    }
  },

  async deleteAuthSession(): Promise<Record<string, never>> {
    try {
      return await apiService.deleteAuthSession();
    } catch (error) {
      console.error('[DataService] deleteAuthSession error', error);
      throw error;
    }
  },

  getDomainMetadata(
    layer: 'bronze' | 'silver' | 'gold' | 'platinum',
    domain: string,
    params: { refresh?: boolean } = {},
    signal?: AbortSignal
  ): Promise<DomainMetadata> {
    return apiService.getDomainMetadata(layer, domain, params, signal);
  },

  getDomainMetadataSnapshot(
    params: { layers?: string; domains?: string; refresh?: boolean } = {},
    signal?: AbortSignal
  ): Promise<DomainMetadataSnapshotResponse> {
    return apiService.getDomainMetadataSnapshot(params, signal);
  },

  async getSystemStatusView(
    params: { refresh?: boolean } = {},
    signal?: AbortSignal
  ): Promise<SystemStatusViewResponse> {
    try {
      return await apiService.getSystemStatusView(params, signal);
    } catch (error) {
      if (await shouldUseSystemStatusFallback(error)) {
        return buildFallbackSystemStatusView(params, error, signal);
      }
      throw error;
    }
  },

  getPersistedDomainMetadataSnapshotCache(): Promise<DomainMetadataSnapshotResponse> {
    return apiService.getPersistedDomainMetadataSnapshotCache();
  },

  savePersistedDomainMetadataSnapshotCache(
    payload: DomainMetadataSnapshotResponse
  ): Promise<DomainMetadataSnapshotResponse> {
    return apiService.savePersistedDomainMetadataSnapshotCache(payload);
  },

  getDomainColumns(
    layer: 'bronze' | 'silver' | 'gold',
    domain: string
  ): Promise<DomainColumnsResponse> {
    return apiService.getDomainColumns(layer, domain);
  },

  refreshDomainColumns(payload: {
    layer: 'bronze' | 'silver' | 'gold';
    domain: string;
    sample_limit?: number;
  }): Promise<DomainColumnsResponse> {
    return apiService.refreshDomainColumns(payload);
  },

  getLineage(): Promise<unknown> {
    return apiService.getLineage();
  },

  getJobLogs(
    jobName: string,
    params: { runs?: number } = {},
    signal?: AbortSignal
  ): Promise<JobLogsResponse> {
    return apiService.getJobLogs(jobName, params, signal);
  },

  getContainerApps(
    params: { probe?: boolean } = {},
    signal?: AbortSignal
  ): Promise<ContainerAppsStatusResponse> {
    return apiService.getContainerApps(params, signal);
  },

  startContainerApp(appName: string, signal?: AbortSignal): Promise<ContainerAppControlResponse> {
    return apiService.startContainerApp(appName, signal);
  },

  stopContainerApp(appName: string, signal?: AbortSignal): Promise<ContainerAppControlResponse> {
    return apiService.stopContainerApp(appName, signal);
  },

  getContainerAppLogs(
    appName: string,
    params: { minutes?: number; tail?: number } = {},
    signal?: AbortSignal
  ): Promise<ContainerAppLogsResponse> {
    return apiService.getContainerAppLogs(appName, params, signal);
  },

  getStockScreener(
    params: {
      q?: string;
      limit?: number;
      offset?: number;
      asOf?: string;
      sort?: string;
      direction?: 'asc' | 'desc';
    } = {},
    signal?: AbortSignal
  ): Promise<StockScreenerResponse> {
    return apiService.getStockScreener(params, signal);
  },

  getGenericData(
    layer: 'bronze' | 'silver' | 'gold',
    domain: string,
    ticker?: string,
    limit?: number,
    optionsOrSignal?: { sortByDate?: 'asc' | 'desc' } | AbortSignal,
    signal?: AbortSignal
  ): Promise<Record<string, unknown>[]> {
    return apiService.getGenericData(layer, domain, ticker, limit, optionsOrSignal, signal);
  },

  getDataQualityValidation(
    layer: string,
    domain: string,
    tickerOrSignal?: string | AbortSignal,
    signal?: AbortSignal
  ): Promise<ValidationReport> {
    return apiService.getDataQualityValidation(layer, domain, tickerOrSignal, signal);
  },

  getDataProfile(
    layer: 'bronze' | 'silver' | 'gold',
    domain: string,
    column: string,
    params: {
      ticker?: string;
      bins?: number;
      sampleRows?: number;
      topValues?: number;
    } = {},
    signal?: AbortSignal
  ): Promise<DataProfilingResponse> {
    return apiService.getDataProfile(layer, domain, column, params, signal);
  },

  getStorageUsage(signal?: AbortSignal): Promise<StorageUsageResponse> {
    return apiService.getStorageUsage(signal);
  },

  getAdlsTree(
    params: {
      layer: 'bronze' | 'silver' | 'gold' | 'platinum';
      path?: string;
      maxEntries?: number;
    },
    signal?: AbortSignal
  ): Promise<AdlsTreeResponse> {
    return apiService.getAdlsTree(params, signal);
  },

  getAdlsFilePreview(
    params: {
      layer: 'bronze' | 'silver' | 'gold' | 'platinum';
      path: string;
      maxBytes?: number;
      maxDeltaFiles?: number;
    },
    signal?: AbortSignal
  ): Promise<AdlsFilePreviewResponse> {
    return apiService.getAdlsFilePreview(params, signal);
  },

  purgeData(payload: PurgeRequest): Promise<PurgeOperationResponse> {
    return apiService.purgeData(payload);
  },

  resetDomainLists(payload: DomainListResetRequest): Promise<DomainListResetResponse> {
    return apiService.resetDomainLists(payload);
  },

  resetDomainCheckpoints(
    payload: DomainCheckpointResetRequest
  ): Promise<DomainCheckpointResetResponse> {
    return apiService.resetDomainCheckpoints(payload);
  },

  getDomainLists(
    layer: string,
    domain: string,
    params: { limit?: number } = {}
  ): Promise<DomainListsResponse> {
    return apiService.getDomainLists(layer, domain, params);
  },

  getPurgeOperation(operationId: string): Promise<PurgeOperationResponse> {
    return apiService.getPurgeOperation(operationId);
  },

  getPurgeBlacklistSymbols(): Promise<PurgeBlacklistSymbolsResponse> {
    return apiService.getPurgeBlacklistSymbols();
  },

  getPurgeCandidates(payload: PurgeCandidatesRequest): Promise<PurgeCandidatesResponse> {
    return apiService.getPurgeCandidates(payload);
  },

  createPurgeCandidatesOperation(payload: PurgeCandidatesRequest): Promise<PurgeOperationResponse> {
    return apiService.createPurgeCandidatesOperation(payload);
  },

  purgeSymbolsBatch(
    payload: Parameters<typeof apiService.purgeSymbolsBatch>[0]
  ): Promise<PurgeOperationResponse> {
    return apiService.purgeSymbolsBatch(payload);
  },

  getDebugSymbols(): Promise<DebugSymbolsResponse> {
    return apiService.getDebugSymbols();
  },

  setDebugSymbols(payload: { symbols: string }): Promise<DebugSymbolsResponse> {
    return apiService.setDebugSymbols(payload);
  },

  deleteDebugSymbols(): Promise<{ deleted: boolean }> {
    return apiService.deleteDebugSymbols();
  },

  getRuntimeConfigCatalog(): Promise<RuntimeConfigCatalogResponse> {
    return apiService.getRuntimeConfigCatalog();
  },

  getRuntimeConfig(scope: string = 'global'): Promise<RuntimeConfigListResponse> {
    return apiService.getRuntimeConfig(scope);
  },

  setRuntimeConfig(payload: {
    key: string;
    scope?: string;
    value: string;
    description?: string;
  }): Promise<RuntimeConfigItem> {
    return apiService.setRuntimeConfig(payload);
  },

  deleteRuntimeConfig(
    key: string,
    scope: string = 'global'
  ): Promise<{ scope: string; key: string; deleted: boolean }> {
    return apiService.deleteRuntimeConfig(key, scope);
  },

  getSymbolSyncState(): Promise<SymbolSyncState> {
    return apiService.getSymbolSyncState();
  }
};
