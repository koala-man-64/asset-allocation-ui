import type { DomainMetadata, SystemHealth } from '@/types/strategy';

export interface RequestMeta {
  requestId: string;
  status: number;
  durationMs: number;
  url: string;
  cacheHint?: string;
  cacheDegraded?: boolean;
}

export interface ResponseWithMeta<T> {
  data: T;
  meta: RequestMeta;
}

export interface AuthSessionStatus {
  authMode: string;
  subject: string;
  displayName?: string | null;
  username?: string | null;
  requiredRoles: string[];
  grantedRoles: string[];
}

export interface JobConsoleLogEntry {
  timestamp?: string | null;
  stream_s?: string | null;
  executionName?: string | null;
  message: string;
}

export interface JobLogRunResponse {
  executionName?: string | null;
  executionId?: string | null;
  status?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  tail: string[];
  consoleLogs?: JobConsoleLogEntry[];
  error?: string | null;
}

export interface JobLogsResponse {
  jobName: string;
  runsRequested: number;
  runsReturned: number;
  tailLines: number;
  runs: JobLogRunResponse[];
}

export interface StockScreenerRow {
  symbol: string;
  name?: string | null;
  sector?: string | null;
  industry?: string | null;
  country?: string | null;
  isOptionable?: boolean | null;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close?: number | null;
  volume?: number | null;
  return1d?: number | null;
  return5d?: number | null;
  vol20d?: number | null;
  drawdown1y?: number | null;
  atr14d?: number | null;
  gapAtr?: number | null;
  sma50d?: number | null;
  sma200d?: number | null;
  trend50_200?: number | null;
  aboveSma50?: number | null;
  bbWidth20d?: number | null;
  compressionScore?: number | null;
  volumeZ20d?: number | null;
  volumePctRank252d?: number | null;
  hasSilver?: number | null;
  hasGold?: number | null;
}

export interface StockScreenerResponse {
  asOf: string;
  total: number;
  limit: number;
  offset: number;
  rows: StockScreenerRow[];
}

export interface PurgeRequest {
  scope: 'layer-domain' | 'layer' | 'domain';
  layer?: string;
  domain?: string;
  confirm: boolean;
}

export interface DomainListResetRequest {
  layer: string;
  domain: string;
  confirm: boolean;
}

export interface DomainListResetResponse {
  layer: string;
  domain: string;
  container: string;
  resetCount: number;
  targets: Array<{
    listType: 'whitelist' | 'blacklist';
    path: string;
    status: 'reset';
    existed: boolean;
  }>;
  updatedAt: string;
}

export interface DomainCheckpointResetRequest {
  layer: string;
  domain: string;
  confirm: boolean;
}

export interface DomainCheckpointResetResponse {
  layer: string;
  domain: string;
  container: string | null;
  resetCount: number;
  deletedCount: number;
  targets: Array<{
    operation: string;
    path: string;
    status: 'reset';
    existed: boolean;
    deleted: boolean;
  }>;
  updatedAt: string;
  note?: string | null;
}

export interface DomainListFilePreview {
  listType: 'whitelist' | 'blacklist';
  path: string;
  exists: boolean;
  symbolCount: number;
  symbols: string[];
  truncated: boolean;
  warning?: string | null;
}

export interface DomainListsResponse {
  layer: string;
  domain: string;
  container: string;
  limit: number;
  files: DomainListFilePreview[];
  loadedAt: string;
}

export interface DomainColumnsResponse {
  layer: 'bronze' | 'silver' | 'gold';
  domain: string;
  columns: string[];
  found: boolean;
  promptRetrieve: boolean;
  source: 'common-file' | 'artifact';
  cachePath: string;
  updatedAt?: string | null;
}

export interface PurgeCandidateRow {
  symbol: string;
  matchedValue: number;
  rowsContributing: number;
  latestAsOf: string | null;
}

export interface PurgeCandidatesRequest {
  layer: 'bronze' | 'silver' | 'gold';
  domain: 'market' | 'finance' | 'earnings' | 'price-target';
  column: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne' | 'top_percent' | 'bottom_percent';
  aggregation?: 'min' | 'max' | 'avg' | 'stddev';
  value?: number;
  percentile?: number;
  as_of?: string;
  recent_rows?: number;
  offset?: number;
  min_rows?: number;
}

export interface PurgeCandidatesCriteria {
  requestedLayer: string;
  resolvedLayer: string;
  domain: string;
  column: string;
  operator: string;
  value: number;
  asOf?: string | null;
  minRows: number;
  recentRows: number;
  aggregation: 'min' | 'max' | 'avg' | 'stddev';
}

export interface PurgeCandidatesSummary {
  totalRowsScanned: number;
  symbolsMatched: number;
  rowsContributing: number;
  estimatedDeletionTargets: number;
}

export interface PurgeCandidatesResponse {
  criteria: PurgeCandidatesCriteria;
  expression: string;
  summary: PurgeCandidatesSummary;
  symbols: PurgeCandidateRow[];
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
  note?: string | null;
}

export interface PurgeSymbolResultItem {
  symbol: string;
  status: 'succeeded' | 'failed' | 'skipped';
  deleted?: number;
  dryRun?: boolean;
  error?: string;
}

export interface PurgeBlacklistSource {
  path: string;
  symbolCount: number;
  warning?: string;
}

export interface PurgeBlacklistSymbolsResponse {
  container: string;
  symbolCount: number;
  symbols: string[];
  sources: PurgeBlacklistSource[];
  loadedAt?: string;
}

export interface PurgeBatchOperationResult {
  scope: 'symbols';
  dryRun: boolean;
  scopeNote?: string | null;
  requestedSymbols: string[];
  requestedSymbolCount: number;
  completed?: number;
  pending?: number;
  inProgress?: number;
  progressPct?: number;
  succeeded: number;
  failed: number;
  skipped: number;
  totalDeleted: number;
  symbolResults: PurgeSymbolResultItem[];
}

export interface PurgeOperationResponse {
  operationId: string;
  status: 'running' | 'succeeded' | 'failed';
  scope: string;
  layer?: string | null;
  domain?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  completedAt?: string | null;
  result?: PurgeResponse | PurgeBatchOperationResult | PurgeCandidatesResponse;
  error?: string | null;
}

export interface PurgeResponse {
  scope: string;
  layer?: string | null;
  domain?: string | null;
  totalDeleted: number;
  targets: Array<{
    container: string;
    prefix?: string | null;
    layer?: string | null;
    domain?: string | null;
    deleted: number;
  }>;
}

export interface DebugSymbolsResponse {
  symbols: string;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface RuntimeConfigCatalogItem {
  key: string;
  description: string;
  example: string;
}

export interface RuntimeConfigCatalogResponse {
  items: RuntimeConfigCatalogItem[];
}

export interface RuntimeConfigItem {
  scope: string;
  key: string;
  value: string;
  description?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface RuntimeConfigListResponse {
  scope: string;
  items: RuntimeConfigItem[];
}

export interface ValidationColumnStat {
  name: string;
  type: string;
  total: number;
  notNull: number;
  nullPct: number;
}

export interface ValidationReport {
  layer: string;
  domain: string;
  status: string;
  rowCount: number;
  columns: ValidationColumnStat[];
  timestamp: string;
  error?: string;
  sampleLimit?: number;
}

export interface ProfilingBucket {
  label: string;
  count: number;
  start?: number | null;
  end?: number | null;
}

export interface ProfilingTopValue {
  value: string;
  count: number;
}

export interface DataProfilingResponse {
  layer: string;
  domain: string;
  column: string;
  kind: 'numeric' | 'date' | 'string';
  totalRows: number;
  nonNullCount: number;
  nullCount: number;
  sampleRows: number;
  bins: ProfilingBucket[];
  uniqueCount?: number;
  duplicateCount?: number;
  topValues?: ProfilingTopValue[];
}

export interface StorageFolderUsage {
  path: string;
  fileCount: number | null;
  totalBytes: number | null;
  truncated: boolean;
  error?: string | null;
}

export interface StorageContainerUsage {
  layer: string;
  layerLabel: string;
  container: string;
  totalFiles: number | null;
  totalBytes: number | null;
  truncated: boolean;
  error?: string | null;
  folders: StorageFolderUsage[];
}

export interface StorageUsageResponse {
  generatedAt: string;
  scanLimit: number;
  containers: StorageContainerUsage[];
}

export interface AdlsHierarchyEntry {
  type: 'folder' | 'file';
  name: string;
  path: string;
  size?: number | null;
  lastModified?: string | null;
  contentType?: string | null;
}

export interface AdlsTreeResponse {
  layer: string;
  container: string;
  path: string;
  truncated: boolean;
  scanLimit: number;
  entries: AdlsHierarchyEntry[];
}

export interface AdlsFilePreviewResponse {
  layer: string;
  container: string;
  path: string;
  isPlainText: boolean;
  encoding?: string | null;
  truncated: boolean;
  maxBytes: number;
  contentType?: string | null;
  contentPreview?: string | null;
  previewMode?: 'blob' | 'delta-log' | 'delta-table' | 'parquet-table';
  processedDeltaFiles?: number | null;
  maxDeltaFiles?: number | null;
  deltaLogPath?: string | null;
  tableColumns?: string[] | null;
  tableRows?: Record<string, unknown>[] | null;
  tableRowCount?: number | null;
  tablePreviewLimit?: number | null;
  tableTruncated?: boolean | null;
  resolvedTablePath?: string | null;
  tableVersion?: number | null;
}

export interface ContainerAppHealthCheck {
  status: 'healthy' | 'warning' | 'error' | 'unknown';
  url?: string | null;
  httpStatus?: number | null;
  checkedAt?: string | null;
  error?: string | null;
}

export interface ContainerAppStatusItem {
  name: string;
  resourceType?: string;
  status: 'healthy' | 'warning' | 'error' | 'unknown';
  details?: string;
  provisioningState?: string | null;
  runningState?: string | null;
  latestReadyRevisionName?: string | null;
  ingressFqdn?: string | null;
  azureId?: string | null;
  checkedAt?: string | null;
  error?: string | null;
  health?: ContainerAppHealthCheck | null;
}

export interface ContainerAppsStatusResponse {
  probed: boolean;
  apps: ContainerAppStatusItem[];
}

export interface ContainerAppControlResponse {
  appName: string;
  action: 'start' | 'stop';
  provisioningState?: string | null;
  runningState?: string | null;
}

export interface ContainerAppLogsResponse {
  appName: string;
  lookbackMinutes: number;
  tailLines: number;
  logs: string[];
}

export interface DomainMetadataSnapshotResponse {
  version: number;
  updatedAt?: string | null;
  entries: Record<string, DomainMetadata>;
  warnings?: string[];
}

export interface SystemStatusViewResponse {
  version: number;
  generatedAt: string;
  systemHealth: SystemHealth;
  metadataSnapshot: DomainMetadataSnapshotResponse;
  sources: {
    systemHealth: 'cache' | 'live-refresh';
    metadataSnapshot: 'persisted-snapshot';
  };
}

export interface SymbolSyncState {
  id: number;
  last_refreshed_at: string;
  last_refreshed_sources: {
    nasdaq?: { rows: number; timestamp: string };
    alpha_vantage?: { rows: number; timestamp: string };
    massive?: { rows: number; timestamp: string };
  };
  last_refresh_error?: string;
}
